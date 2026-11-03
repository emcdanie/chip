// The workspace terminal: xterm.js in the page, Elleta's own shell in a pty
// on the CHIP server (WebSocket /term, 127.0.0.1 only). The Claude tab is the
// same terminal with `claude` typed for her; quit it and the shell stays.
// Colours and type come from BELLA tokens, read at runtime: xterm wants
// plain colour strings and a number for the font size, so the values are
// taken from the computed style, never written here.
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Select from '@bella/components/Select/Select';

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
    background: v('--color-semantic-surface-card'),
    foreground: v('--color-semantic-text-primary'),
    cursor: v('--color-semantic-text-primary'),
    cursorAccent: v('--color-semantic-surface-card'),
    selectionBackground: v('--color-semantic-highlight-wash'),
  };
}

const STATUS = { connecting: 'Starting…', open: 'Running', closed: 'Stopped' };

function TermScreen({ repo, run, active, label, onStatus }) {
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

    const q = new URLSearchParams({ repo, cols: String(term.cols), rows: String(term.rows), ...(run ? { run } : {}) });
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/term?${q}`);
    onStatus('connecting');
    ws.onopen = () => onStatus('open');
    ws.onclose = () => onStatus('closed');
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '');
    const send = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
    term.onData((data) => send({ type: 'input', data }));
    term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));

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
      ro.disconnect();
      mo.disconnect();
      ws.close();
      term.dispose();
      live.current = null;
    };
  }, [repo, run]);

  useEffect(() => {
    if (!active || !live.current) return;
    requestAnimationFrame(() => {
      try {
        live.current?.fit.fit();
      } catch {}
      live.current?.term.focus();
    });
  }, [active]);

  return <div className="term-screen" ref={box} role="group" aria-label={label} />;
}

/** One terminal tab: repo picker, status, Restart, and the screen. */
export function TermView({ kind, repos, active }) {
  const [repo, setRepo] = useState('chip');
  const [run, setRun] = useState(0); // bumped by Restart: a fresh shell
  const [status, setStatus] = useState('connecting');
  const name = kind === 'claude' ? 'Claude' : 'Terminal';
  const options = repos.length ? repos.map((r) => ({ value: r.id, label: r.label })) : [{ value: 'chip', label: 'CHIP' }];
  const where = options.find((o) => o.value === repo)?.label ?? repo;

  return (
    <div className="term-view" hidden={!active}>
      <div className="term-bar">
        <Select label="Folder" value={repo} onChange={setRepo} options={options} className="term-repo" />
        <span className="label" aria-live="polite">
          {STATUS[status]} · {kind === 'claude' ? `claude in ${where}` : `your shell in ${where}`}
        </span>
        <span className="obi-grow" />
        <ActionChip onClick={() => setRun((n) => n + 1)}>{status === 'closed' ? 'Start again' : 'Restart'}</ActionChip>
      </div>
      <TermScreen key={`${repo}:${run}`} repo={repo} run={kind === 'claude' ? 'claude' : undefined} active={active} label={`${name} in ${where}`} onStatus={setStatus} />
    </div>
  );
}
