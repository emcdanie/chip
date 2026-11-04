// The Playground (docs/plans/playground.md): a page from any project (the
// site, CHIP, BELLA's Storybook; GET /projects), live, to play with; a markup
// layer for boxes and notes; each section mapped to BELLA (BELLA's, the
// project's own copy, or the project's only); and BELLA's rules run on what
// the browser measured, each finding naming its rule and its source. Send to
// Claude writes a brief and types `claude` with it in the project's terminal;
// CHIP never edits the project. Every note says what it is pinned to, the rule
// there and a suggested change, with its own send. BELLA components dragged
// from the Components tab drop as placed proposals: drawn for real in the
// overlay, moved, resized, swapped, optionally replacing the section under
// them, checked against the same rules, and written into the brief. The page arrives through CHIP's proxy (play.mjs),
// which adds the probe that posts the measurements here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import { PageHeader, Segmented, segPanelProps, StatusPill, LinkButton } from './kit/index.jsx';
import Disclosure from '@bella/components/Disclosure/Disclosure';
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
const MODES = [
  { id: 'use', label: 'Use the page' },
  { id: 'mark', label: 'Mark up' },
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

// a note's suggested change and its reasoning: the rule broken where it sits,
// or what the component it is pinned to is
function suggestFor(n, findings, map) {
  const f = findings.find((x) => x.section && x.section === n.section && x.tone === 'fail') ?? findings.find((x) => x.section === n.section);
  if (f) return { change: f.instead, why: `${f.rule}: ${f.detail} (${f.source})`, rule: f };
  const c = map?.components[n.component];
  if (!n.section) return null;
  if (c?.kind === 'copy') return { change: `Use BELLA’s ${n.component}, ${map.getBella}, instead of editing ${map.short}’s copy`, why: `${c.note}, so a change here drifts from BELLA (${c.source})` };
  if (c?.kind === 'site') return { change: `Compose it from BELLA parts; if none fits, name the missing component`, why: `${c.note}: BELLA AGENTS.md rule 3` };
  if (c?.kind === 'bella') return map.bella?.kind === 'self' ? { change: `Change ${n.component} in its source, ${c.file}`, why: `${c.note} (${c.source})` } : { change: `Change ${n.component} in BELLA, not in ${map.short}`, why: `${c.note}: ${map.short} only uses it (${c.source})` };
  return null;
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
  const [mode, setMode] = useState('use');
  const [tab, setTab] = useState('map');
  const [notes, setNotes] = useState([]);
  const [placed, setPlaced] = useState([]); // BELLA components dropped on the page
  const [catalogue, setCatalogue] = useState(null);
  const [q, setQ] = useState('');
  const [dragging, setDragging] = useState(null); // a component name on its way from the list
  const [grab, setGrab] = useState(null); // moving or resizing a placement
  const [draft, setDraft] = useState(null); // the box being drawn
  const [hot, setHot] = useState(null); // a section or finding being pointed at
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
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
    setNotes([]);
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
  const cats = useMemo(() => Object.fromEntries((catalogue ?? []).map((c) => [c.name, c.category ?? 'Other'])), [catalogue]);
  const findings = useMemo(() => findingsOf(map, probe, placed, cats), [map, probe, placed, cats]);
  const fails = findings.filter((f) => f.tone === 'fail').length;
  const box = (id) => probe?.sections.find((s) => s.id === id);
  const send = (m) => proxyOrigin && frame.current?.contentWindow?.postMessage(m, proxyOrigin);
  const sectionAt = (y) => probe?.sections.find((s) => y >= s.y && y <= s.y + s.h)?.id ?? null;
  const rulesOf = (pid) => findings.filter((f) => f.at?.some((x) => x.pid === pid));

  /* ---- drawing a note: drag on the overlay in Mark up; or "Note on this section" ---- */
  const pageAt = (e) => {
    const r = over.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale + scrollY };
  };
  const addNote = (b, section) => {
    const id = `n${Date.now()}`;
    setNotes((ns) => [...ns, { id, ...b, text: '', section, inBrief: true, component: map.sections.find((s) => s.id === section)?.component }]);
    send({ type: 'chip:pick', id, ...b });
    setTab('notes');
    requestAnimationFrame(() => document.getElementById(`note-${id}`)?.focus());
  };
  const down = (e) => {
    if (mode !== 'mark' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pageAt(e);
    setDraft({ x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 });
  };
  const move = (e) => {
    if (grab) return moveGrab(e);
    if (!draft) return;
    const p = pageAt(e);
    setDraft((d) => ({ ...d, x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) }));
  };
  const up = () => {
    if (grab) return setGrab(null);
    if (!draft) return;
    const { x, y, w, h } = draft;
    setDraft(null);
    if (w < 12 || h < 12) return;
    addNote({ x, y, w, h }, sectionAt(y + h / 2));
  };
  const wheel = (e) => send({ type: 'chip:scrollby', dy: e.deltaY });
  const noteOn = (s) => {
    const b = box(s.id);
    if (b) addNote({ x: b.x, y: b.y, w: b.w, h: b.h }, s.id);
  };
  const goTo = (id) => id && send({ type: 'chip:scrollto', id });
  const setNote = (id, patch) => setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  /* ---- placing BELLA components: drop from the list, then move, resize, swap ---- */
  const place = (component, cx, cy) => {
    const [w, h] = sizeOf(component);
    const x = Math.max(0, Math.min(W - w, cx - w / 2));
    const y = Math.max(0, cy - h / 2);
    const id = `p${Date.now()}`;
    setPlaced((ps) => [...ps, { id, component, variant: component === 'Button' ? 'primary' : null, x, y, w, h, section: sectionAt(y + h / 2), replaces: null, note: '' }]);
    setTab('notes');
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

  /* ---- the brief ---- */
  const inBrief = notes.filter((n) => n.inBrief);
  const noteBody = (n) => ({ ...n, kind: KIND[map?.components[n.component]?.kind]?.word, suggest: suggestFor(n, findings, map) && { change: suggestFor(n, findings, map).change, why: suggestFor(n, findings, map).why } });
  const plain = (fs) => fs.map(({ at: _, ...f }) => f);
  const bodyOf = (only) =>
    only
      ? { project, route, width: W, scope: 'note', notes: [noteBody(only)], proposals: [], findings: plain(findings.filter((f) => f.section === only.section || (!f.section && f.tone === 'fail'))) }
      : { project, route, width: W, notes: inBrief.map(noteBody), proposals: placed, findings: plain(findings) };
  async function toClaude(only) {
    setSending(true);
    try {
      const r = await fetch('/play/brief', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(bodyOf(only)) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo: map.terminal, command: `claude "Read ${j.file} and follow it."` } }));
      onToast?.('Brief saved. Press Return in the terminal to start Claude.');
    } catch (e) {
      onToast?.(`Could not write the brief: ${e.message}`);
    } finally {
      setSending(false);
    }
  }
  // the preview: the same brief, not written; refreshed while the notes tab shows
  const briefKey = JSON.stringify(map && tab === 'notes' ? bodyOf(null) : null);
  useEffect(() => {
    if (!map || tab !== 'notes') return;
    const t = setTimeout(() => {
      fetch('/play/brief', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ...bodyOf(null), dry: true }) })
        .then((r) => r.json())
        .then((j) => setPreview(j.text ?? null))
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [briefKey]);

  const tabs = [
    { id: 'map', label: 'Map' },
    { id: 'rules', label: `Rules${findings.length ? ` · ${fails}` : ''}` },
    { id: 'parts', label: 'Components' },
    { id: 'notes', label: `Notes${notes.length + placed.length ? ` · ${notes.length + placed.length}` : ''}` },
  ];
  const live = probe && route && probe.url === pathOf(route);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const g = {};
    for (const c of catalogue ?? []) if (!ql || `${c.name} ${c.description ?? ''}`.toLowerCase().includes(ql)) (g[c.category ?? 'Other'] ??= []).push(c);
    return GROUP_ORDER.filter((k) => g[k]).map((k) => [k, g[k].sort((a, b) => a.name.localeCompare(b.name))]);
  }, [catalogue, q]);
  const nBrief = inBrief.length + placed.length;
  const sendLabel = `Send ${plural(inBrief.length, 'note')}${placed.length ? ` and ${plural(placed.length, 'placed component')}` : ''} to Claude`;
  const draw = (p) => (p.component === 'Button' && p.variant ? VARIANTS.Button(p.variant) : SPECIMENS[p.component]?.() ?? <span className="pg-nospec">{p.component}</span>);

  return (
    <div className="pg-page k-chrome">
      <PageHeader
        meta="Playground"
        title="Playground"
        lede="Pick a project and one of its pages, and use it live. Mark it up, drop BELLA components on it, see where it breaks BELLA’s rules. Send it to Claude in that project’s terminal when you know what you want."
        actions={
          <div className="pg-actions">
            {projects?.length ? <Select label="Project" value={project} onChange={setProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} /> : null}
            {pages?.pages?.length ? <Select label="Page" value={route ?? ''} onChange={setRoute} options={pages.pages.map((p) => ({ value: p.route, label: p.label === p.route || p.label === 'Home' ? p.route : `${p.label}` }))} /> : null}
            <Button variant="primary" onClick={() => toClaude()} disabled={sending || !map}>
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
                  {map.run.state === 'starting' || starting ? ', starting…' : '.'} The map and notes work from the source; the page loads once its dev server answers.
                </p>
                {map.run.command ? (
                  <Button onClick={startDev} disabled={starting || map.run.state === 'starting'}>
                    {starting ? 'Starting…' : `Start ${map.short}: ${map.run.command}`}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="pg-scaled" hidden={!!map && !running} style={{ width: W * scale, height: VIEW_H * scale }}>
              <div className="pg-frame" style={{ width: W, height: VIEW_H, transform: `scale(${scale})` }}>
                {proxy ? <iframe key={project} ref={frame} title={`${map.name} page ${map.label}`} src={`${proxy}${srcOf(route)}`} width={W} height={VIEW_H} onLoad={hello} /> : null}
                <div
                  ref={over}
                  className={['pg-over', mode === 'mark' && 'mark', (dragging || grab) && 'drop'].filter(Boolean).join(' ')}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onWheel={mode === 'mark' || grab ? wheel : undefined}
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
                        {by ? <span className="pg-gone">#{s.id} replaced by {by.component}</span> : mode === 'mark' || on ? <span className="pg-tag">#{s.id} · {s.component}</span> : null}
                      </div>
                    );
                  })}
                  {hot?.at?.map((x, i) => (
                    <div key={i} className="pg-hit" style={{ left: x.x, top: x.y - scrollY, width: x.w, height: x.h }} aria-hidden="true" />
                  ))}
                  {notes.map((n, i) => (
                    <div key={n.id} className="pg-note" style={{ left: n.x, top: n.y - scrollY, width: n.w, height: n.h }} aria-hidden="true">
                      <span className="pg-pin">{i + 1}</span>
                    </div>
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
                  {draft ? <div className="pg-note draft" style={{ left: draft.x, top: draft.y - scrollY, width: draft.w, height: draft.h }} aria-hidden="true" /> : null}
                </div>
              </div>
            </div>
          </div>
          <p className="pg-cap" hidden={!!map && !running}>
            {dragging
              ? `Drop ${dragging} where it should go on the page.`
              : mode === 'mark'
                ? 'Drag a box over anything to add a note. The scroll wheel still moves the page.'
                : `The real page, running from ${map?.name ?? 'the project'}. Click, open, turn the cards over. Switch to Mark up to draw, or drag a component in from Components.`}
          </p>
        </section>

        <aside className="pg-insp" aria-label="Map, rules, components and notes">
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

          {tab === 'notes' ? (
            <div {...segPanelProps('pgtab', 'notes', tab)} className="pg-panel">
              {notes.length || placed.length ? null : (
                <div className="pg-empty">
                  <b>Nothing to send yet</b>
                  <p>Mark up the page or drop BELLA components on it, then send it to Claude. CHIP writes the brief; Claude makes the change in {map?.short ?? 'the project'}’s terminal once you press Return.</p>
                </div>
              )}
              {notes.length ? (
                <ol className="pg-list" aria-label="Notes">
                  {notes.map((n, i) => {
                    const c = map?.components[n.component];
                    const k = KIND[c?.kind];
                    const sg = suggestFor(n, findings, map);
                    const el = n.picked?.[0];
                    return (
                      <li key={n.id} className={`pg-row pg-noterow${n.inBrief ? '' : ' out'}`}>
                        <div className="pg-rowhead">
                          <span className="pg-pin static">{i + 1}</span>
                          <span className="pg-where">
                            <span>
                              Pinned to {n.section ? <code>#{n.section}</code> : 'no section'}
                              {n.component ? <> · {n.component}</> : null}
                            </span>
                            <small>{el ? el.text || el.selector : 'Element not reported yet'}</small>
                          </span>
                          {k ? <StatusPill tone={k.tone}>{k.word}</StatusPill> : null}
                        </div>
                        <Input id={`note-${n.id}`} label="What should change?" multiline value={n.text} onChange={(v) => setNote(n.id, { text: v })} />
                        <dl className="pg-why">
                          <dt>Rule here</dt>
                          <dd>{sg?.rule ? <>{sg.rule.rule} <span className="pg-source">({sg.rule.source})</span></> : n.section ? 'No BELLA rule broken in this section' : 'Not measured: draw the box inside a section'}</dd>
                          <dt>CHIP suggests</dt>
                          <dd>{sg ? <>{sg.change}. <span className="pg-source">Why: {sg.why}.</span></> : 'Not measured'}</dd>
                        </dl>
                        <div className="pg-noteacts">
                          <Button onClick={() => toClaude(n)} disabled={sending}>
                            Send this note to Claude
                          </Button>
                          <Button variant="tertiary" onClick={() => setNote(n.id, { inBrief: !n.inBrief })}>
                            {n.inBrief ? 'Leave out of brief' : 'Add to brief'}
                          </Button>
                          <LinkButton onClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} aria-label={`Delete note ${i + 1}`}>
                            Delete
                          </LinkButton>
                        </div>
                        {n.inBrief ? null : <p className="pg-sub">Left out of the brief.</p>}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
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
                          <Input label="Note for Claude" multiline value={p.note} onChange={(v) => setPlace(p.id, { note: v })} />
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
              <Disclosure title="Preview the brief" summary={preview ? `${preview.split('\n').length} lines` : undefined}>
                <pre className="pg-brief">{preview ?? 'Writing the preview…'}</pre>
              </Disclosure>
              <div className="pg-send">
                <Button variant="primary" onClick={() => toClaude()} disabled={sending || !nBrief}>
                  {sending ? 'Writing the brief…' : sendLabel}
                </Button>
                <p className="pg-sub">
                  Writes one brief, then types <code>claude</code> with it in {map?.short ?? 'the project'}’s terminal. You press Return; Claude branches, plans and waits for your go.
                </p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
