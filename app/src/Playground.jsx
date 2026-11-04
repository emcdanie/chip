// The Playground (docs/plans/playground.md): a page from the site, live, to
// play with; a markup layer for boxes and notes; each section mapped to BELLA
// (synced, the site's own copy, or site only); and BELLA's rules run on what
// the browser measured, each finding naming its rule and its source. Send to
// Claude writes a brief and types `claude` with it in the site's terminal;
// CHIP never edits the site. The page arrives through CHIP's proxy (play.mjs),
// which adds the probe that posts the measurements here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import { PageHeader, Segmented, segPanelProps, StatusPill, LinkButton } from './kit/index.jsx';
import { contrast } from './Sandbox.jsx';
import './Playground.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
// the kit's segmented control, picking a value (no panels), as every page draws it
const WIDTHS = [
  { id: '1440', label: '1440' },
  { id: '1024', label: '1024' },
  { id: '390', label: '390' },
];
const MODES = [
  { id: 'use', label: 'Use the page' },
  { id: 'mark', label: 'Mark up' },
];

/* ---------- BELLA's rules, run on what the probe measured ---------- */
const FLOORS = 'BELLA AGENTS.md · Floors';
const KIND = {
  bella: { tone: 'pass', word: 'BELLA' },
  copy: { tone: 'needs', word: 'Site copy' },
  site: { tone: 'neutral', word: 'Site only' },
};

const worst = (list, key, dir = 1) => list.reduce((a, b) => (dir * (b[key] - a[key]) < 0 ? b : a));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (t) => (t ? `“${t.length > 40 ? t.slice(0, 40) + '…' : t}”` : 'an unnamed control');

export function findingsOf(map, probe) {
  if (!map || !probe) return [];
  const out = [];
  const per = (list, f) => {
    const by = new Map();
    for (const x of list) by.set(x.section ?? null, [...(by.get(x.section ?? null) ?? []), x]);
    for (const [section, xs] of by) f(section, xs);
  };

  // one primary per view
  const primaries = probe.targets.filter((t) => t.primary);
  if (primaries.length > 1)
    out.push({ key: 'primary', tone: 'fail', section: null, rule: 'One primary action per view', source: 'BELLA AGENTS.md · Which component for which job; Button contract dont[0]', detail: `${primaries.length} primary buttons: ${primaries.map((p) => quote(p.text)).join(', ')}`, instead: 'Keep one primary; make the rest Button variant="secondary"', at: primaries });

  // targets ≥ 44px (inline links in prose are WCAG 2.5.8's exception, not BELLA's)
  per(
    probe.targets.filter((t) => Math.round(Math.min(t.w, t.h)) < 44),
    (section, xs) => {
      const w = worst(xs, 'h');
      const inline = xs.filter((x) => x.inline).length;
      out.push({ key: `target-${section}`, tone: 'fail', section, rule: 'Targets at least 44px', source: FLOORS, detail: `${plural(xs.length, 'control')} under 44px, smallest ${quote(w.text)} at ${Math.round(w.w)}×${Math.round(w.h)}${inline ? ` (${plural(inline, 'inline link')}: WCAG 2.5.8 lets those pass, BELLA doesn’t)` : ''}`, instead: 'Give the control a 44px min height, as BELLA’s Button, Link and FilterChip do', at: xs });
    },
  );

  // type: nothing under 16px, body at least 18px
  per(
    probe.texts.filter((t) => t.size < 16 || (t.body && t.size < 18)),
    (section, xs) => {
      const w = worst(xs, 'size');
      const under16 = xs.filter((x) => x.size < 16).length;
      out.push({ key: `type-${section}`, tone: 'fail', section, rule: under16 ? 'Nothing under 16px' : 'Body text at least 18px', source: FLOORS, detail: `${plural(xs.length, 'text run')}, smallest ${quote(w.text)} at ${w.size}px (${w.tag})`, instead: 'Use BELLA’s type tokens: body at 18px, meta and labels no smaller than 16px', at: xs });
    },
  );

  // contrast: AAA for body, AA for the rest
  const rated = probe.texts.map((t) => ({ ...t, ratio: contrast(t.color, t.ground, t.ground) })).filter((t) => t.ratio != null);
  per(
    rated.filter((t) => t.ratio < 4.5 || (t.body && t.ratio < 7)),
    (section, xs) => {
      const w = worst(xs, 'ratio');
      const aa = xs.some((x) => x.ratio < 4.5);
      out.push({ key: `contrast-${section}`, tone: 'fail', section, rule: aa ? 'Text contrast at least 4.5:1' : 'Body text at AAA (7:1)', source: aa ? 'WCAG 1.4.3; BELLA AGENTS.md · Floors' : FLOORS, detail: `${plural(xs.length, 'text run')}, lowest ${quote(w.text)} at ${w.ratio.toFixed(1)}:1`, instead: 'Use BELLA’s semantic ink tokens, the pairs contrast-pairs.mjs holds in both themes', at: xs });
    },
  );

  // components BELLA doesn't own: one line per component, with the sections it sits in
  const where = new Map();
  for (const s of map.sections) for (const name of [s.component, ...s.children]) where.set(name, [...(where.get(name) ?? []), s.id]);
  for (const [name, ids] of where) {
    const c = map.components[name];
    if (!c || c.kind === 'bella') continue;
    const sections = ids.map((id) => `#${id}`).join(', ');
    out.push(
      c.kind === 'copy'
        ? { key: `copy-${name}`, tone: 'needs', section: ids[0], rule: `${name} isn’t BELLA’s ${name}`, source: c.source, detail: `${c.note} (${c.file}), in ${sections}`, instead: `Sync BELLA’s ${name} through the site’s sync-bella.mjs, as Card is` }
        : { key: `site-${name}`, tone: 'neutral', section: ids[0], rule: `${name} isn’t in BELLA’s catalogue`, source: `BELLA ${c.source}`, detail: `${c.note} (${c.file}), in ${sections}`, instead: 'Compose it from BELLA parts; if no part fits, name the missing component (AGENTS.md rule 3)' },
    );
  }
  const rank = { fail: 0, needs: 1, neutral: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/* ---------- the page ---------- */
export default function Playground({ onToast }) {
  const [pages, setPages] = useState(null);
  const [route, setRoute] = useState('/about');
  const [map, setMap] = useState(null);
  const [probe, setProbe] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [width, setWidth] = useState('1440');
  const [mode, setMode] = useState('use');
  const [tab, setTab] = useState('map');
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(null); // the box being drawn
  const [hot, setHot] = useState(null); // a section or finding being pointed at
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const frame = useRef(null);
  const stage = useRef(null);
  const [stageW, setStageW] = useState(0);
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => {
    const f = () => setWinH(window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    fetch('/play/pages')
      .then((r) => r.json())
      .then(setPages)
      .catch(() => setError('The CHIP server is not answering.'));
  }, []);
  useEffect(() => {
    setMap(null);
    setProbe(null);
    setNotes([]);
    fetch(`/play/map?route=${encodeURIComponent(route)}`)
      .then((r) => r.json())
      .then((m) => (m.error ? setError(m.error) : setMap(m)))
      .catch(() => setError('The CHIP server is not answering.'));
  }, [route]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const proxy = pages?.proxy;
  const proxyOrigin = proxy ? new URL(proxy).origin : null;
  const hello = useCallback(() => {
    if (!map || !proxyOrigin) return;
    frame.current?.contentWindow?.postMessage({ type: 'chip:hello', sections: map.sections.map((s) => s.id) }, proxyOrigin);
  }, [map, proxyOrigin]);

  useEffect(() => {
    const on = (e) => {
      if (e.origin !== proxyOrigin) return;
      const m = e.data || {};
      if (m.type === 'chip:probe') {
        setProbe(m);
        setScrollY(m.scrollY);
      } else if (m.type === 'chip:scroll') setScrollY(m.scrollY);
      else if (m.type === 'chip:picked') setNotes((ns) => ns.map((n) => (n.id === m.id ? { ...n, picked: m.picked, section: n.section ?? m.section } : n)));
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [proxyOrigin]);
  useEffect(hello, [hello]);

  const W = Number(width);
  const scale = stageW ? Math.min(1, stageW / W) : 1;
  // the page's own viewport, in page px: tall enough that the scaled stage fills the window
  const VIEW_H = Math.round(Math.max(640, (winH - 300) / scale));
  const findings = useMemo(() => findingsOf(map, probe), [map, probe]);
  const fails = findings.filter((f) => f.tone === 'fail').length;
  const box = (id) => probe?.sections.find((s) => s.id === id);
  const send = (m) => proxyOrigin && frame.current?.contentWindow?.postMessage(m, proxyOrigin);

  /* ---- drawing a note: drag on the overlay in Mark up; or "Note on this section" ---- */
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale + scrollY };
  };
  const addNote = (b, section) => {
    const id = `n${Date.now()}`;
    setNotes((ns) => [...ns, { id, ...b, text: '', section, component: map.sections.find((s) => s.id === section)?.component }]);
    send({ type: 'chip:pick', id, ...b });
    setTab('notes');
    requestAnimationFrame(() => document.getElementById(`note-${id}`)?.focus());
  };
  const down = (e) => {
    if (mode !== 'mark' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setDraft({ x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 });
  };
  const move = (e) => {
    if (!draft) return;
    const p = at(e);
    setDraft((d) => ({ ...d, x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) }));
  };
  const up = () => {
    if (!draft) return;
    const { x, y, w, h } = draft;
    setDraft(null);
    if (w < 12 || h < 12) return;
    const mid = y + h / 2;
    const section = probe?.sections.find((s) => mid >= s.y && mid <= s.y + s.h)?.id ?? null;
    addNote({ x, y, w, h }, section);
  };
  const wheel = (e) => send({ type: 'chip:scrollby', dy: e.deltaY });
  const noteOn = (s) => {
    const b = box(s.id);
    if (b) addNote({ x: b.x, y: b.y, w: b.w, h: b.h }, s.id);
  };
  const goTo = (id) => id && send({ type: 'chip:scrollto', id });

  async function toClaude() {
    setSending(true);
    try {
      const r = await fetch('/play/brief', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ route, width: W, notes, findings: findings.map(({ at: _, ...f }) => f) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo: 'site', command: `claude "Read ${j.file} and follow it."` } }));
      onToast?.('Brief saved. Press Return in the terminal to start Claude.');
    } catch (e) {
      onToast?.(`Could not write the brief: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  const tabs = [
    { id: 'map', label: 'Map' },
    { id: 'rules', label: `Rules${findings.length ? ` · ${fails}` : ''}` },
    { id: 'notes', label: `Notes${notes.length ? ` · ${notes.length}` : ''}` },
  ];
  const live = probe && probe.url === route;

  return (
    <div className="pg-page k-chrome">
      <PageHeader
        meta="Playground"
        title="Playground"
        lede="Load a page from your site and use it live. Mark it up, see which parts are BELLA, and where it breaks BELLA’s rules. Send it to Claude when you know what you want."
        actions={
          <div className="pg-actions">
            {pages?.pages?.length ? <Select label="Page" value={route} onChange={setRoute} options={pages.pages.map((p) => ({ value: p.route, label: p.route }))} /> : null}
            <Button variant="primary" onClick={toClaude} disabled={sending || !map}>
              {sending ? 'Writing the brief…' : 'Send to Claude'}
            </Button>
          </div>
        }
      />
      {error ? <p className="pg-error">{error}</p> : null}

      <div className="pg-work">
        <section className="pg-stagecol" aria-label="The page">
          <div className="pg-bar">
            <Segmented id="pgw" label="Width" panels={false} items={WIDTHS} value={width} onChange={setWidth} />
            <Segmented id="pgm" label="Mode" panels={false} items={MODES} value={mode} onChange={setMode} />
            <span className="pg-src">
              {pages ? (
                <>
                  <code>{pages.site}</code>
                  {map ? (
                    <>
                      {' · '}
                      <code>{map.file}</code>
                    </>
                  ) : null}
                </>
              ) : null}
              {live ? <StatusPill tone="pass">Live</StatusPill> : <StatusPill tone="neutral">Loading</StatusPill>}
            </span>
          </div>
          <div className="pg-stage" ref={stage}>
            <div className="pg-scaled" style={{ width: W * scale, height: VIEW_H * scale }}>
              <div className="pg-frame" style={{ width: W, height: VIEW_H, transform: `scale(${scale})` }}>
                {proxy ? <iframe ref={frame} title={`Site page ${route}`} src={`${proxy}${route}`} width={W} height={VIEW_H} onLoad={hello} /> : null}
                <div className={`pg-over${mode === 'mark' ? ' mark' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={mode === 'mark' ? wheel : undefined} aria-hidden="true">
                  {map?.sections.map((s) => {
                    const b = box(s.id);
                    if (!b) return null;
                    const k = map.components[s.component]?.kind ?? 'site';
                    const on = hot?.section === s.id || hot?.id === s.id;
                    return (
                      <div key={s.id} className={`pg-sec k-${k}${on ? ' on' : ''}`} style={{ left: b.x, top: b.y - scrollY, width: b.w, height: b.h }}>
                        {mode === 'mark' || on ? <span className="pg-tag">#{s.id} · {s.component}</span> : null}
                      </div>
                    );
                  })}
                  {hot?.at?.map((x, i) => (
                    <div key={i} className="pg-hit" style={{ left: x.x, top: x.y - scrollY, width: x.w, height: x.h }} />
                  ))}
                  {notes.map((n, i) => (
                    <div key={n.id} className="pg-note" style={{ left: n.x, top: n.y - scrollY, width: n.w, height: n.h }}>
                      <span className="pg-pin">{i + 1}</span>
                    </div>
                  ))}
                  {draft ? <div className="pg-note draft" style={{ left: draft.x, top: draft.y - scrollY, width: draft.w, height: draft.h }} /> : null}
                </div>
              </div>
            </div>
          </div>
          <p className="pg-cap">
            {mode === 'mark' ? 'Drag a box over anything to add a note. The scroll wheel still moves the page.' : 'The real page, running from your site. Click, open, turn the cards over. Switch to Mark up to draw.'}
          </p>
        </section>

        <aside className="pg-insp" aria-label="Map, rules and notes">
          <Segmented id="pgtab" label="Inspector" items={tabs} value={tab} onChange={setTab} />

          {tab === 'map' ? (
            <div {...segPanelProps('pgtab', 'map', tab)} className="pg-panel">
              <p className="pg-sub">Each section from {map ? <code>{map.file}</code> : 'the source'}, matched to the page by its id.</p>
              <ol className="pg-list">
                {map?.sections.map((s) => (
                  <li key={s.id} className="pg-row" onMouseEnter={() => setHot({ id: s.id })} onMouseLeave={() => setHot(null)}>
                    <div className="pg-rowhead">
                      <LinkButton onClick={() => goTo(s.id)}>
                        <code>#{s.id}</code>
                      </LinkButton>
                      <LinkButton onClick={() => noteOn(s)}>Note on this section</LinkButton>
                    </div>
                    <ul className="pg-comps">
                      {[s.component, ...s.children].map((name) => {
                        const c = map.components[name];
                        const k = KIND[c?.kind] ?? KIND.site;
                        return (
                          <li key={name}>
                            <span className="pg-cn">
                              <b>{name}</b>
                              <small>{c?.note ?? 'Not imported by the page'}</small>
                            </span>
                            <StatusPill tone={k.tone}>{k.word}</StatusPill>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
              <p className="pg-key">
                <b>BELLA</b> synced from BELLA unedited · <b>Site copy</b> carries a BELLA name but is the site’s own file · <b>Site only</b> not in BELLA’s catalogue.
              </p>
            </div>
          ) : null}

          {tab === 'rules' ? (
            <div {...segPanelProps('pgtab', 'rules', tab)} className="pg-panel">
              <p className="pg-sub">{live ? `Measured in the page at ${probe.width}px. Every line names its rule and where the rule lives.` : 'Waiting for the page to report its measurements…'}</p>
              <ul className="pg-list">
                {findings.map((f) => (
                  <li key={f.key} className={`pg-row pg-f ${f.tone}`} onMouseEnter={() => setHot(f)} onMouseLeave={() => setHot(null)}>
                    <div className="pg-rowhead">
                      <b>{f.rule}</b>
                      <StatusPill tone={f.tone}>{f.tone === 'fail' ? 'Breaks' : f.tone === 'needs' ? 'Drift' : 'Site only'}</StatusPill>
                    </div>
                    <p>{f.detail}.</p>
                    <p className="pg-instead">
                      <b>Instead:</b> {f.instead}.
                    </p>
                    <p className="pg-source">
                      {f.section ? (
                        <>
                          <LinkButton onClick={() => goTo(f.section)}>
                            <code>#{f.section}</code>
                          </LinkButton>
                          {' · '}
                        </>
                      ) : null}
                      Source: {f.source}
                    </p>
                  </li>
                ))}
                {live && !findings.length ? <li className="pg-row">No rule broken at this width.</li> : null}
              </ul>
            </div>
          ) : null}

          {tab === 'notes' ? (
            <div {...segPanelProps('pgtab', 'notes', tab)} className="pg-panel">
              {notes.length ? (
                <ol className="pg-list">
                  {notes.map((n, i) => (
                    <li key={n.id} className="pg-row pg-noterow">
                      <div className="pg-rowhead">
                        <span className="pg-pin static">{i + 1}</span>
                        <span className="pg-where">
                          {n.section ? <code>#{n.section}</code> : 'Outside a section'}
                          {n.picked?.[0] ? <small>{n.picked[0].text || n.picked[0].selector}</small> : null}
                        </span>
                        <LinkButton onClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))}>
                          Remove note {i + 1}
                        </LinkButton>
                      </div>
                      <Input id={`note-${n.id}`} label="What should change?" multiline value={n.text} onChange={(v) => setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, text: v } : x)))} />
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="pg-empty">
                  <b>No notes yet</b>
                  <p>Switch to Mark up and drag a box on the page, or use “Note on this section” in Map.</p>
                </div>
              )}
              <p className="pg-sub">Send to Claude writes your notes, the rules that break and the section map into one brief, then types <code>claude</code> with it in the site’s terminal. Claude works by the site’s own process: a branch, a plan, your go, a PR.</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
