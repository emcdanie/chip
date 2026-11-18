// The workspace terminals: xterm.js in the page, Elleta's own shell in a pty
// on the CHIP server (WebSocket /term, 127.0.0.1 only), one per open session.
// "New Claude" is the same shell with `claude` started; quit it and the shell
// stays. The Work panel owns the list; this file draws it and the screens.
// Colours and type come from BELLA tokens, read at runtime: xterm wants
// plain colour strings and a number for the font size, so the values are
// taken from the computed style, never written here.
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Button from '@bella/components/Button/Button';
import Select from '@bella/components/Select/Select';
import { Segmented, segPanelProps } from './kit/index.jsx';

// any CSS colour (a token's value) as rgba(), which xterm always parses
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
function rgba(value) {
  if (!probe || !value) return undefined;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function themeOf(el) {
  const css = getComputedStyle(el);
  const v = (name) => rgba(css.getPropertyValue(name).trim());
  return {
    background: v('--color-background-surface'),
    foreground: v('--color-content-default'),
    cursor: v('--color-content-default'),
    cursorAccent: v('--color-background-surface'),
    selectionBackground: v('--color-semantic-highlight-wash'),
  };
}

export const STATUS = { connecting: 'Starting…', open: 'Running', closed: 'Stopped' };
// the server runs six at most (term.mjs MAX_SESSIONS)
export const MAX_TERMS = 6;
export const termName = (t, label) => `${t.kind === 'claude' ? 'claude' : 'zsh'} · ${label}`;

// one screen; it registers type(text) with the panel, so the panel's input
// can put words at the prompt without pressing Return
function TermScreen({ t, active, onStatus, onActivity, register }) {
  const box = useRef(null);
  const live = useRef(null); // { term, fit, ws }

  useEffect(() => {
    const el = box.current;
    const css = getComputedStyle(el);
    const term = new XTerm({
      fontFamily: css.fontFamily,
      fontSize: parseFloat(css.fontSize),
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: themeOf(el),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      fit.fit();
    } catch {}

    const q = new URLSearchParams({ repo: t.repo, cols: String(term.cols), rows: String(term.rows), ...(t.kind === 'claude' ? { run: 'claude' } : {}) });
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/term?${q}`);
    onStatus('connecting');
    const send = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
    ws.onopen = () => {
      onStatus('open');
      // a command from Needs you: typed once the login shell has drawn its
      // prompt, never followed by Return
      if (t.typed) setTimeout(() => send({ type: 'input', data: t.typed }), 900);
    };
    ws.onclose = () => onStatus('closed');
    ws.onmessage = (e) => {
      term.write(typeof e.data === 'string' ? e.data : '');
      onActivity();
    };
    term.onData((data) => send({ type: 'input', data }));
    term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
    register(t.id, {
      type: (text) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        send({ type: 'input', data: text });
        term.focus();
        return true;
      },
      focus: () => term.focus(),
      // the last lines on screen, for the session tree's "latest"
      tail: (n = 8) => {
        const buf = term.buffer.active;
        const out = [];
        for (let i = buf.length - 1; i >= 0 && out.length < n; i--) {
          const line = buf.getLine(i)?.translateToString(true) ?? '';
          if (line.trim() || out.length) out.unshift(line);
        }
        return out.join('\n').trimEnd();
      },
    });

    // reflow with the dock and the window; skip while hidden (zero size)
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth && el.offsetHeight) {
        try {
          fit.fit();
        } catch {}
      }
    });
    ro.observe(el);
    // follow a theme switch (light / dark) on the page
    const mo = new MutationObserver(() => (term.options.theme = themeOf(el)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

    live.current = { term, fit, ws };
    return () => {
      register(t.id, null);
      ro.disconnect();
      mo.disconnect();
      ws.close();
      term.dispose();
      live.current = null;
    };
  }, [t.id, t.run]);

  useEffect(() => {
    if (!active || !live.current) return;
    requestAnimationFrame(() => {
      try {
        live.current?.fit.fit();
      } catch {}
    });
  }, [active]);

  return <div className="term-screen" ref={box} {...segPanelProps('wpterm', String(t.id), active ? String(t.id) : null)} />;
}

/**
 * The Terminal tab: the open sessions (kit Segmented), a folder picker with
 * New shell and New Claude, the active one's status, and the screens. Every
 * screen stays mounted while the panel is open, hidden when not active.
 */
export function Terminals({ terms, active, setActive, repos, folder, setFolder, onNew, onClose, onRestart, onStatus, onActivity, register }) {
  const options = repos.length ? repos.map((r) => ({ value: r.id, label: r.label })) : [{ value: 'chip', label: 'CHIP' }];
  const labelOf = (id) => options.find((o) => o.value === id)?.label ?? id;
  const t = terms.find((x) => x.id === active);
  const full = terms.length >= MAX_TERMS;
  return (
    <>
      <div className="term-side">
        {terms.length ? (
          <Segmented
            id="wpterm"
            label="Open terminals"
            value={String(active)}
            onChange={(id) => setActive(Number(id))}
            items={terms.map((x) => ({ id: String(x.id), label: termName(x, labelOf(x.repo)) }))}
          />
        ) : null}
        <div className="term-new">
          <Select label="Folder" value={folder} onChange={setFolder} options={options} className="term-repo" />
          <Button onClick={() => onNew('shell')} disabled={full}>
            New shell
          </Button>
          <Button onClick={() => onNew('claude')} disabled={full}>
            New Claude
          </Button>
        </div>
        {full ? <p className="label">Six terminals is the most CHIP runs. Close one to open another.</p> : null}
        {t ? (
          <div className="term-now">
            <p className="label" aria-live="polite">
              {STATUS[t.status ?? 'connecting']} · {t.kind === 'claude' ? 'claude' : 'your shell'} in {labelOf(t.repo)}
            </p>
            <Button variant="tertiary" onClick={() => onRestart(t.id)}>
              {t.status === 'closed' ? 'Start again' : 'Restart'}
            </Button>
            <Button variant="tertiary" onClick={() => onClose(t.id)} ariaLabel={`Close ${termName(t, labelOf(t.repo))}`}>
              Close
            </Button>
            {t.typed ? (
              <p className="label term-typed">
                Typed for you, not run: <span className="mono">{t.typed}</span>. Press Return in the terminal to run it.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="term-screens">
        {terms.length === 0 ? <p className="wp-empty">No terminal open. Pick a folder, then New shell or New Claude.</p> : null}
        {terms.map((x) => (
          <TermScreen key={x.id} t={x} active={x.id === active} onStatus={(s) => onStatus(x.id, s)} onActivity={() => onActivity(x.id)} register={register} />
        ))}
      </div>
    </>
  );
}
