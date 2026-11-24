// The Playground (docs/plans/playground.md): a page from any project (the
// site, CHIP, BELLA's Storybook; GET /projects), live, to play with; a markup
// each section mapped to BELLA (BELLA's, the
// project's own copy, or the project's only); and BELLA's rules run on what
// the browser measured, each finding naming its rule and its source. CHIP
// never edits the project. BELLA components dragged from the Components tab
// drop as placed proposals: drawn for real in the overlay, moved, resized,
// swapped, optionally replacing the section under them, checked against the
// same rules. The page arrives through CHIP's proxy (play.mjs), which adds the
// probe that posts the measurements here.
//
// Retired 19 Nov 2026 (Elleta's picks on /screens/2026-11-19-playground/):
// "Send to Claude" (the brief) and box notes (the Use / Mark up switch). Mark
// up lives in the new Playground (pages/PlaygroundContent.jsx). Map, Rules and
// drop-a-part stay here until the design track draws them in Figma.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import { PageHeader, Segmented, segPanelProps, StatusPill, LinkButton } from './kit/index.jsx';
import { contrast } from './Sandbox.jsx';
import { SPECIMENS, VARIANTS } from './specimens.jsx';
import './Playground.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
// the kit's segmented control, picking a value (no panels), as every page draws it
const WIDTHS = [
  { id: '1440', label: '1440' },
  { id: '1024', label: '1024' },
  { id: '390', label: '390' },
];
/* ---------- BELLA's rules, run on what the probe measured ---------- */
const FLOORS = 'BELLA AGENTS.md · Floors';
// a part's kind in the project's own words ("Site copy", "CHIP only")
const kindsOf = (short = 'Site') => ({
  bella: { tone: 'pass', word: 'BELLA' },
  copy: { tone: 'needs', word: `${short} copy` },
  site: { tone: 'neutral', word: `${short} only` },
});

const worst = (list, key, dir = 1) => list.reduce((a, b) => (dir * (b[key] - a[key]) < 0 ? b : a));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (t) => (t ? `“${t.length > 40 ? t.slice(0, 40) + '…' : t}”` : 'an unnamed control');

// placed components: the size they drop at, and which ones are controls
const DROP = { Button: [220, 72], ActionChip: [200, 64], FilterChip: [180, 64], Link: [200, 64], Input: [360, 96], Select: [280, 96], Card: [360, 240], ResourceCard: [360, 220], Heading: [560, 96], SectionHeader: [640, 140], Stat: [240, 120], DataTable: [640, 240], Tabs: [480, 120] };
const sizeOf = (name) => DROP[name] ?? [320, 120];
const CONTROL = new Set(['Actions', 'Inputs']);
const GROUP_ORDER = ['Actions', 'Inputs', 'Layout', 'Data', 'Chat', 'Brand', 'Other'];
const inside = (t, b) => t.x + t.w / 2 >= b.x && t.x + t.w / 2 <= b.x + b.w && t.y + t.h / 2 >= b.y && t.y + t.h / 2 <= b.y + b.h;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function findingsOf(map, probe, placed = [], cats = {}) {
  if (!map || !probe) return [];
  const out = [];
  // a section a placement replaces is hidden: what it measured no longer counts
  const gone = placed.filter((p) => p.replaces).map((p) => probe.sections.find((s) => s.id === p.replaces)).filter(Boolean);
  const kept = (t) => !gone.some((g) => inside(t, g));
  const tag = (p) => ({ text: `placed ${p.component}`, x: p.x, y: p.y, w: p.w, h: p.h, section: p.section, pid: p.id });
  probe = {
    ...probe,
    targets: [...probe.targets.filter(kept), ...placed.filter((p) => CONTROL.has(cats[p.component])).map((p) => ({ ...tag(p), primary: p.component === 'Button' && p.variant === 'primary' }))],
    texts: probe.texts.filter(kept),
  };
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
        ? { key: `copy-${name}`, tone: 'needs', section: ids[0], rule: `${name} isn’t BELLA’s ${name}`, source: c.source, detail: `${c.note} (${c.file}), in ${sections}`, instead: `Use BELLA’s ${name}, ${map.getBella}, instead of ${map.short}’s own` }
        : { key: `site-${name}`, tone: 'neutral', section: ids[0], rule: `${name} isn’t in BELLA’s catalogue`, source: `BELLA ${c.source}`, detail: `${c.note} (${c.file}), in ${sections}`, instead: 'Compose it from BELLA parts; if no part fits, name the missing component (AGENTS.md rule 3)' },
    );
  }
  // a placement on top of a section it doesn't replace
  for (const p of placed) {
    if (p.replaces) continue;
    const under = probe.sections.find((s) => s.id === p.section && overlaps(p, s));
    if (under) out.push({ key: `over-${p.id}`, tone: 'needs', section: under.id, rule: `Placed ${p.component} sits on #${under.id} without replacing it`, source: 'Playground · placed component', detail: `It covers part of #${under.id}, so Claude can’t tell whether it goes beside the content or instead of it`, instead: 'Choose “Replace this section”, or move it into open space', at: [tag(p)] });
  }
  const rank = { fail: 0, needs: 1, neutral: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/* ---------- the page ---------- */
// the address a route loads at on the project's server, and the path the probe reports
const srcOf = (route) => (route.startsWith('#') ? `/${route}` : route);
const pathOf = (route) => new URL(srcOf(route), 'http://x').pathname;

export default function Playground({ onToast, project: askedProject, route: askedRoute, onTarget }) {
  const [projects, setProjects] = useState(null);
  const [project, setProject] = useState(askedProject ?? 'site');
  const [pages, setPages] = useState(null);
  const [route, setRoute] = useState(askedRoute ?? null);
  const [starting, setStarting] = useState(false);
  const [map, setMap] = useState(null);
  const [probe, setProbe] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [width, setWidth] = useState('1440');
  const [tab, setTab] = useState('map');
  const [placed, setPlaced] = useState([]); // BELLA components dropped on the page
  const [catalogue, setCatalogue] = useState(null);
  const [q, setQ] = useState('');
  const [dragging, setDragging] = useState(null); // a component name on its way from the list
  const [grab, setGrab] = useState(null); // moving or resizing a placement
  const [hot, setHot] = useState(null); // a section or finding being pointed at
  const [error, setError] = useState(null);
  const frame = useRef(null);
  const stage = useRef(null);
  const over = useRef(null);
  const [stageW, setStageW] = useState(0);
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => {
    const f = () => setWinH(window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  // a link (#/play/<project>?route=) picks the project and page
  useEffect(() => {
    if (askedProject && askedProject !== project) setProject(askedProject);
    if (askedRoute && askedRoute !== route) setRoute(askedRoute);
  }, [askedProject, askedRoute]);
  useEffect(() => {
    fetch('/projects')
      .then((r) => r.json())
      .then((j) => setProjects(j.projects))
      .catch(() => setError('The CHIP server is not answering.'));
  }, []);
  // the project's pages; the first one opens unless a page was asked for
  useEffect(() => {
    setPages(null);
    fetch(`/play/pages?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((j) => {
        setPages(j);
        setRoute((r) => (j.pages.some((p) => p.route === r) ? r : (j.pages.find((p) => p.route === '/about') ?? j.pages[0])?.route ?? null));
      })
      .catch(() => setError('The CHIP server is not answering.'));
  }, [project]);
  useEffect(() => {
    if (route) onTarget?.({ project, route });
  }, [project, route]);
  useEffect(() => {
    fetch('/data/bella.json')
      .then((r) => r.json())
      .then((b) => setCatalogue(b.components))
      .catch(() => setCatalogue([]));
  }, []);
  // the map also points CHIP's proxy at the project's dev server
  const loadMap = useCallback(
    () =>
      fetch(`/play/map?project=${encodeURIComponent(project)}&route=${encodeURIComponent(route)}`)
        .then((r) => r.json())
        .then((m) => (m.error ? setError(m.error) : (setError(null), setMap(m)), m))
        .catch(() => setError('The CHIP server is not answering.')),
    [project, route],
  );
  useEffect(() => {
    setMap(null);
    setProbe(null);
    setPlaced([]);
    if (pages?.project === project && route) loadMap();
  }, [loadMap, pages]);
  // not running: start its dev server from the config, then check every 2s for a minute
  async function startDev() {
    setStarting(true);
    try {
      const r = await fetch(`/projects/${project}/dev`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action: 'start' }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      for (let i = 0; i < 30; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const m = await loadMap();
        if (m?.run?.state === 'running') break;
      }
    } catch (e) {
      onToast?.(`Could not start it: ${e.message}`);
    }
    setStarting(false);
  }

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const running = map?.run?.state === 'running';
  const proxy = running ? map.proxy : null;
  const KIND = kindsOf(map?.short);
  const proxyOrigin = proxy ? new URL(proxy).origin : null;
  // post only once the frame holds the proxied page: before its src loads it is
  // a blank page on CHIP's own origin, and posting there logs an origin warning
  const toFrame = useCallback(
    (m) => {
      const w = frame.current?.contentWindow;
      if (!w || !proxyOrigin) return;
      try {
        if (w.location.href) return; // readable: still CHIP's blank page, not the proxy's
      } catch {}
      w.postMessage(m, proxyOrigin);
    },
    [proxyOrigin],
  );
  const hello = useCallback(() => {
    if (map) toFrame({ type: 'chip:hello', sections: map.sections.map((s) => s.id) });
  }, [map, toFrame]);

  useEffect(() => {
    const on = (e) => {
      if (e.origin !== proxyOrigin) return;
      const m = e.data || {};
      if (m.type === 'chip:probe') {
        setProbe(m);
        setScrollY(m.scrollY);
      } else if (m.type === 'chip:scroll') setScrollY(m.scrollY);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [proxyOrigin]);
  useEffect(hello, [hello]);

  const W = Number(width);
  const scale = stageW ? Math.min(1, stageW / W) : 1;
  // the page's own viewport, in page px: tall enough that the scaled stage fills the window
  const VIEW_H = Math.round(Math.max(640, (winH - 300) / scale));
  const cats = useMemo(() => Object.fromEntries((catalogue ?? []).map((c) => [c.name, c.category ?? 'Other'])), [catalogue]);
  const findings = useMemo(() => findingsOf(map, probe, placed, cats), [map, probe, placed, cats]);
  const fails = findings.filter((f) => f.tone === 'fail').length;
  const box = (id) => probe?.sections.find((s) => s.id === id);
  const send = toFrame;
  const sectionAt = (y) => probe?.sections.find((s) => y >= s.y && y <= s.y + s.h)?.id ?? null;
  const rulesOf = (pid) => findings.filter((f) => f.at?.some((x) => x.pid === pid));

  /* ---- the overlay: moving a placed part, and the wheel scrolls the page ---- */
  const pageAt = (e) => {
    const r = over.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale + scrollY };
  };
  const move = (e) => grab && moveGrab(e);
  const up = () => grab && setGrab(null);
  const wheel = (e) => send({ type: 'chip:scrollby', dy: e.deltaY });
  const goTo = (id) => id && send({ type: 'chip:scrollto', id });

  /* ---- placing BELLA components: drop from the list, then move, resize, swap ---- */
  const place = (component, cx, cy) => {
    const [w, h] = sizeOf(component);
    const x = Math.max(0, Math.min(W - w, cx - w / 2));
    const y = Math.max(0, cy - h / 2);
    const id = `p${Date.now()}`;
    setPlaced((ps) => [...ps, { id, component, variant: component === 'Button' ? 'primary' : null, x, y, w, h, section: sectionAt(y + h / 2), replaces: null }]);
    setTab('placed');
    onToast?.(`${component} placed. Drag it to move it; the corner resizes it.`);
  };
  const setPlace = (id, patch) =>
    setPlaced((ps) =>
      ps.map((p) => {
        if (p.id !== id) return p;
        const n = { ...p, ...patch };
        const section = sectionAt(n.y + n.h / 2);
        // a placement moved off the section it replaced no longer replaces it
        return { ...n, section, replaces: n.replaces && n.replaces === section ? n.replaces : null };
      }),
    );
  const onDrop = (e) => {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain') || dragging;
    setDragging(null);
    if (!name) return;
    const p = pageAt(e);
    place(name, p.x, p.y);
  };
  const startGrab = (e, p, kind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    over.current.setPointerCapture(e.pointerId);
    setGrab({ id: p.id, kind, from: pageAt(e), box: { x: p.x, y: p.y, w: p.w, h: p.h } });
  };
  function moveGrab(e) {
    const pt = pageAt(e);
    const dx = pt.x - grab.from.x;
    const dy = pt.y - grab.from.y;
    const b = grab.box;
    if (grab.kind === 'move') setPlace(grab.id, { x: Math.max(0, Math.min(W - b.w, b.x + dx)), y: Math.max(0, b.y + dy) });
    // resize within sensible limits: a 44px target at least, never wider than the page
    else setPlace(grab.id, { w: Math.max(88, Math.min(W - b.x, b.w + dx)), h: Math.max(44, Math.min(1200, b.h + dy)) });
  }
  const nudge = (e, p) => {
    const step = e.shiftKey ? 40 : 8;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setPlace(p.id, { x: Math.max(0, Math.min(W - p.w, p.x + d[0])), y: Math.max(0, p.y + d[1]) });
  };

  const tabs = [
    { id: 'map', label: 'Map' },
    { id: 'rules', label: `Rules${findings.length ? ` · ${fails}` : ''}` },
    { id: 'parts', label: 'Components' },
    { id: 'placed', label: `Placed${placed.length ? ` · ${placed.length}` : ''}` },
  ];
  const live = probe && route && probe.url === pathOf(route);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const g = {};
    for (const c of catalogue ?? []) if (!ql || `${c.name} ${c.description ?? ''}`.toLowerCase().includes(ql)) (g[c.category ?? 'Other'] ??= []).push(c);
    return GROUP_ORDER.filter((k) => g[k]).map((k) => [k, g[k].sort((a, b) => a.name.localeCompare(b.name))]);
  }, [catalogue, q]);
  const copies = (s) => [s.component, ...s.children].filter((name) => KIND[map.components[name]?.kind] === KIND.copy).length;
  const draw = (p) => (p.component === 'Button' && p.variant ? VARIANTS.Button(p.variant) : SPECIMENS[p.component]?.() ?? <span className="pg-nospec">{p.component}</span>);

  return (
    <div className="pg-page k-chrome">
      <PageHeader
        title="Playground"
        lede="Use a project’s page live, check it against BELLA, and try BELLA parts on it."
        actions={
          <div className="pg-actions">
            {projects?.length ? <Select label="Project" value={project} onChange={setProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} /> : null}
            {pages?.pages?.length ? <Select label="Page" value={route ?? ''} onChange={setRoute} options={pages.pages.map((p) => ({ value: p.route, label: p.label === p.route || p.label === 'Home' ? p.route : `${p.label}` }))} /> : null}
          </div>
        }
      />
      {error ? <p className="pg-error">{error}</p> : null}

      <div className="pg-work">
        <section className="pg-stagecol" aria-label="The page">
          <div className="pg-bar">
            <Segmented id="pgw" label="Width" panels={false} items={WIDTHS} value={width} onChange={setWidth} />
            <span className="pg-src">
              {map?.run?.url ? (
                <>
                  <code>{map.run.url}</code>
                  {map ? (
                    <>
                      {' · '}
                      <code>{map.file}</code>
                    </>
                  ) : null}
                </>
              ) : null}
              {live ? <StatusPill tone="pass">Live</StatusPill> : map && !running ? <StatusPill tone="neutral">Not running</StatusPill> : <StatusPill tone="neutral">Loading</StatusPill>}
            </span>
          </div>
          <div className="pg-stage" ref={stage}>
            {map && !running ? (
              <div className="pg-down" role="status">
                <p>
                  <b>{map.name} isn’t running</b> at <code>{map.run.url ?? 'no address in the config'}</code>
                  {map.run.state === 'starting' || starting ? ', starting…' : '.'} The map works from the source; the page loads once its dev server answers.
                </p>
                {map.run.command ? (
                  <Button onClick={startDev} disabled={starting || map.run.state === 'starting'}>
                    {starting ? 'Starting…' : `Start ${map.short}: ${map.run.command}`}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {/* the preview is a whole page in an iframe: one Tab passes it */}
            <a
              className="pg-skip"
              href="#pg-insp"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('pg-insp')?.focus();
              }}
            >
              Skip preview
            </a>
            <div className="pg-scaled" hidden={!!map && !running} style={{ width: W * scale, height: VIEW_H * scale }}>
              <div className="pg-frame" style={{ width: W, height: VIEW_H, transform: `scale(${scale})` }}>
                {proxy ? <iframe key={project} ref={frame} title={`${map.name} page ${map.label}`} src={`${proxy}${srcOf(route)}`} width={W} height={VIEW_H} onLoad={hello} /> : null}
                <div
                  ref={over}
                  className={['pg-over', (dragging || grab) && 'drop'].filter(Boolean).join(' ')}
                  onPointerMove={move}
                  onPointerUp={up}
                  onWheel={grab ? wheel : undefined}
                  onDragOver={(e) => e.dataTransfer.types.includes('text/plain') && e.preventDefault()}
                  onDrop={onDrop}
                >
                  {map?.sections.map((s) => {
                    const b = box(s.id);
                    if (!b) return null;
                    const k = map.components[s.component]?.kind ?? 'site';
                    const on = hot?.section === s.id || hot?.id === s.id;
                    const by = placed.find((p) => p.replaces === s.id);
                    return (
                      <div key={s.id} className={`pg-sec k-${k}${on ? ' on' : ''}${by ? ' gone' : ''}`} style={{ left: b.x, top: b.y - scrollY, width: b.w, height: b.h }} aria-hidden="true">
                        {by ? <span className="pg-gone">#{s.id} replaced by {by.component}</span> : on ? <span className="pg-tag">#{s.id} · {s.component}</span> : null}
                      </div>
                    );
                  })}
                  {hot?.at?.map((x, i) => (
                    <div key={i} className="pg-hit" style={{ left: x.x, top: x.y - scrollY, width: x.w, height: x.h }} aria-hidden="true" />
                  ))}
                  {placed.map((p, i) => (
                    <div
                      key={p.id}
                      className={`pg-prop${rulesOf(p.id).some((f) => f.tone === 'fail') ? ' fail' : ''}${hot?.pid === p.id ? ' on' : ''}`}
                      style={{ left: p.x, top: p.y - scrollY, width: p.w, height: p.h }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Placed ${p.component} ${i + 1}: drag or use the arrow keys to move it`}
                      onPointerDown={(e) => startGrab(e, p, 'move')}
                      onKeyDown={(e) => nudge(e, p)}
                    >
                      <span className="pg-pin prop">P{i + 1}</span>
                      <div className="pg-prop-b">{draw(p)}</div>
                      <span className="pg-grip" aria-hidden="true" onPointerDown={(e) => startGrab(e, p, 'size')} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="pg-cap" hidden={!!map && !running}>
            {dragging
              ? `Drop ${dragging} where it should go on the page.`
              : `The real page, running from ${map?.name ?? 'the project'}. Click, open, turn the cards over, or drag a component in from Components.`}
          </p>
        </section>

        <aside className="pg-insp" id="pg-insp" tabIndex={-1} aria-label="Map, rules, components and placed parts">
          <Segmented id="pgtab" label="Inspector" items={tabs} value={tab} onChange={setTab} />

          {tab === 'map' ? (
            <div {...segPanelProps('pgtab', 'map', tab)} className="pg-panel">
              <p className="pg-sub">
                {map ? <code>{map.file}</code> : 'The source'}. {map?.unmapped ?? map?.how ?? ''}
              </p>
              <ol className="pg-list">
                {map?.sections.map((s) => (
                  <li key={s.id} className="pg-row" onMouseEnter={() => setHot({ id: s.id })} onMouseLeave={() => setHot(null)}>
                    <div className="pg-rowhead">
                      <LinkButton onClick={() => goTo(s.id)}>
                        <code>#{s.id}</code>
                      </LinkButton>
                      {/* one tag per section: each row's own note already says so */}
                      {copies(s) ? (
                        <StatusPill tone={KIND.copy.tone}>
                          {KIND.copy.word} · {copies(s)}
                        </StatusPill>
                      ) : null}
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
                            {k === KIND.copy ? null : <StatusPill tone={k.tone}>{k.word}</StatusPill>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
              <p className="pg-key">
                {/* only the kinds this page has */}
                {[
                  ['bella', `BELLA’s own part (${map?.bella?.label ?? 'synced or read in place'})`],
                  ['copy', `carries a BELLA name but is ${map?.short ?? 'the project'}’s own file`],
                  ['site', 'not in BELLA’s catalogue'],
                ]
                  .filter(([k]) => Object.values(map?.components ?? {}).some((c) => c.kind === k))
                  .map(([k, t], i) => (
                    <React.Fragment key={k}>
                      {i ? ' · ' : null}
                      <b>{KIND[k].word}</b> {t}
                    </React.Fragment>
                  ))}
              </p>
            </div>
          ) : null}

          {tab === 'rules' ? (
            <div {...segPanelProps('pgtab', 'rules', tab)} className="pg-panel">
              <p className="pg-sub">{live ? `Measured in the page at ${probe.width}px, with your placed components. Every line names its rule and where the rule lives.` : 'Waiting for the page to report its measurements…'}</p>
              <ul className="pg-list">
                {findings.map((f) => (
                  <li key={f.key} className={`pg-row pg-f ${f.tone}`} onMouseEnter={() => setHot(f)} onMouseLeave={() => setHot(null)}>
                    <div className="pg-rowhead">
                      <b>{f.rule}</b>
                      <StatusPill tone={f.tone}>{f.tone === 'fail' ? 'Breaks' : f.tone === 'needs' ? 'Drift' : KIND.site.word}</StatusPill>
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

          {tab === 'parts' ? (
            <div {...segPanelProps('pgtab', 'parts', tab)} className="pg-panel">
              <p className="pg-sub">BELLA’s components. Drag one onto the page, or use Place. It lands as a proposal: Claude builds it, CHIP never edits {map?.name ?? 'the project'}.</p>
              <Input label="Find a component" value={q} onChange={setQ} placeholder="Button, Card…" />
              {catalogue === null ? <p className="pg-sub">Reading BELLA…</p> : null}
              {groups.map(([g, list]) => (
                <section key={g} className="pg-group" aria-label={g}>
                  <h3>{g}</h3>
                  <ul className="pg-parts">
                    {list.map((c) => (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', c.name);
                          e.dataTransfer.effectAllowed = 'copy';
                          // the overlay takes the drop at once, before React redraws
                          over.current?.classList.add('drop');
                          setDragging(c.name);
                        }}
                        onDragEnd={() => {
                          over.current?.classList.remove('drop');
                          setDragging(null);
                        }}
                      >
                        <span className="pg-cn">
                          <b>{c.name}</b>
                          <small>{c.description?.split(/[.:\n]/)[0]}</small>
                        </span>
                        <LinkButton onClick={() => place(c.name, W / 2, scrollY + VIEW_H / 3)} aria-label={`Place ${c.name} on the page`}>
                          Place
                        </LinkButton>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {catalogue && !groups.length ? <p className="pg-sub">No component matches “{q}”.</p> : null}
            </div>
          ) : null}

          {tab === 'placed' ? (
            <div {...segPanelProps('pgtab', 'placed', tab)} className="pg-panel">
              {placed.length ? null : (
                <div className="pg-empty">
                  <b>Nothing placed yet</b>
                  <p>Drag a BELLA component from Components onto the page.</p>
                </div>
              )}
              {placed.length ? (
                <>
                  <h3 className="pg-h">Placed components</h3>
                  <ol className="pg-list" aria-label="Placed components">
                    {placed.map((p, i) => {
                      const rs = rulesOf(p.id);
                      const under = p.section;
                      return (
                        <li key={p.id} className="pg-row pg-proprow" onMouseEnter={() => setHot({ pid: p.id, at: [p] })} onMouseLeave={() => setHot(null)}>
                          <div className="pg-rowhead">
                            <span className="pg-pin static prop">P{i + 1}</span>
                            <span className="pg-where">
                              <span>
                                {p.component}
                                {under ? <> in <code>#{under}</code></> : ' outside a section'}
                              </span>
                              <small>
                                {Math.round(p.x)},{Math.round(p.y)} · {Math.round(p.w)}×{Math.round(p.h)} page px
                              </small>
                            </span>
                            <StatusPill tone="pass">BELLA</StatusPill>
                          </div>
                          <div className="pg-propctl">
                            <Select label="Component" value={p.component} onChange={(v) => setPlace(p.id, { component: v, variant: v === 'Button' ? p.variant ?? 'primary' : null })} options={(catalogue ?? []).map((c) => ({ value: c.name, label: c.name }))} />
                            {p.component === 'Button' ? <Select label="Variant" value={p.variant ?? 'primary'} onChange={(v) => setPlace(p.id, { variant: v })} options={['primary', 'secondary', 'tertiary'].map((v) => ({ value: v, label: v }))} /> : null}
                          </div>
                          {under ? (
                            <label className="k-chk">
                              <input type="checkbox" checked={p.replaces === under} onChange={(e) => setPlace(p.id, { replaces: e.target.checked ? under : null })} />
                              <span>
                                Replace this section, <code>#{under}</code>
                              </span>
                            </label>
                          ) : null}
                          {rs.length ? (
                            <ul className="pg-prules">
                              {rs.map((f) => (
                                <li key={f.key} className={f.tone}>
                                  <StatusPill tone={f.tone}>{f.tone === 'fail' ? 'Breaks' : 'Check'}</StatusPill> <b>{f.rule}</b>. {f.instead}. <span className="pg-source">Source: {f.source}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="pg-sub">No BELLA rule broken by this placement.</p>
                          )}
                          <div className="pg-noteacts">
                            <LinkButton onClick={() => setPlaced((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Delete placed ${p.component} P${i + 1}`}>
                              Delete
                            </LinkButton>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
