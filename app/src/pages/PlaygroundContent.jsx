// Playground · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:138756, flow 9) on the CHIP / Screen template. Any page of any project,
// live, at 375 / 768 / 1024 / 1440, and Mark up: numbered notes sent to the
// progress board (Elleta, 19 Nov 2026: "i want to be able to mark up and reply
// to you easily without having to copy paste screenshot which is the point of
// chip"). Built from BELLA parts and the template's Flow only; no page CSS.
//
// Mark up has no Figma screen yet (board card: the design session draws it).
// The page arrives through CHIP's own proxy (server/lib/play.mjs), the same
// one the old Playground uses.
//
// STAGE SLOT: BELLA's Stage part (Figma Stage{grid=dots}) holds the live page
// at its design width: Fit / 100% float in its top-right corner, notes are
// pink Pins on the page, and while marking a click asks the page what sits
// there (chip:pick, answered by the proxy's probe). Frame, zoom and Mark up:
// her card y22, "A · Yes" (19 Nov).
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Combobox from '@bella/components/Combobox/Combobox';
import Stage from '@bella/components/Stage/Stage';
import { CONTROLS, SPECIMENS, THEME } from '../specimens.jsx';
import { useComponents } from './componentsModel.js';
import ListRow from '@bella/components/ListRow/ListRow';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';

// The progress board server takes the notes (screens/progress/server.py).
export const BOARD = 'http://localhost:3123';

const WIDTHS = ['375', '768', '1024', '1440'].map((w) => ({ value: w, label: w }));

const json = (r) => {
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/** CHIP's own data: projects, their pages, and whether the page is running. */
function usePlayData(project, route) {
  const [projects, setProjects] = useState(null);
  const [pages, setPages] = useState(null);
  const [map, setMap] = useState(null);
  const [down, setDown] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch('/projects')
      .then(json)
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setDown(true));
  }, []);
  useEffect(() => {
    setPages(null);
    fetch(`/play/pages?project=${encodeURIComponent(project)}`)
      .then(json)
      .then((d) => setPages(d.pages ?? []))
      .catch(() => setPages([]));
  }, [project]);
  useEffect(() => {
    setMap(null);
    if (!route) return undefined;
    let live = true;
    fetch(`/play/map?project=${encodeURIComponent(project)}&route=${encodeURIComponent(route)}`)
      .then((r) => r.json())
      .then((d) => live && setMap(d))
      .catch(() => live && setDown(true));
    return () => {
      live = false;
    };
  }, [project, route, tick]);
  return { projects, pages, map, down, again: () => setTick((t) => t + 1) };
}

// what a note is on, short: the probe's text can repeat itself ("Review the fix Review the fix")
function shortName(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const half = t.slice(0, Math.floor(t.length / 2)).trim();
  const once = half && t === `${half} ${half}` ? half : t;
  return once.length > 24 ? `${once.slice(0, 23).trimEnd()}…` : once;
}

// the frame's design height: one laptop screen; the page scrolls inside it
const FRAME_HEIGHT = 900;
// Figma opens on a part (Show · Parts › DataTable)
const PARTS = Object.keys(SPECIMENS).sort();

/**
 * One part, live, on the Stage at its design width (Figma's default state).
 * The Stage's frame is Figma's specimen card ("1440 wide · shown at 67%"), so
 * the part sits straight in it: no second card (b23, nothing three deep).
 * Controls set its props and theme (Figma "controls open").
 */
function PartSlot({ name, width, values }) {
  const [zoom, setZoom] = useState('fit');
  // the DataTable specimen shows CHIP's real per-part checks, as Figma's component-health table
  const { model } = useComponents();
  const data = model?.parts.map((p) => ({ name: p.name, contract: p.checks.find((k) => k.id === 'contract')?.ok ? 'pass' : 'fail', checks: p.pass }));
  const ctl = CONTROLS[name];
  const Specimen = SPECIMENS[name];
  return (
    // Theme: the whole stage takes the theme, so the frame's surface flips with the part
    <div data-theme={values.theme === 'Dark' ? 'chip-dark' : 'chip-light'}>
      {/* a part's frame hugs the part, as Figma's card on the canvas (612:138093); a page keeps a screen's height */}
      <Stage frameWidth={Number(width)} zoom={zoom} onZoomChange={setZoom} label={`${name}, live at ${width}`}>
        {ctl ? ctl.render({ ...values, data }) : <Specimen />}
      </Stage>
    </div>
  );
}
// a click asks for what sits in this box around it, in page px
const PICK = { w: 240, h: 64 };

/**
 * The live page on the Stage at its design width. Notes are page px; the page
 * scrolls inside its frame, so pins move with it. While marking, a click asks
 * the page (through the proxy's probe) what sits there.
 */
function StageSlot({ src, proxy, sections, title, width, notes, picking, onPicked }) {
  const frame = useRef(null);
  const [zoom, setZoom] = useState('fit');
  const [scrollY, setScrollY] = useState(0);
  const origin = proxy ? new URL(proxy).origin : null;

  const toPage = useCallback(
    (m) => {
      const w = frame.current?.contentWindow;
      if (w && origin) w.postMessage(m, origin);
    },
    [origin],
  );
  const hello = useCallback(() => toPage({ type: 'chip:hello', sections }), [toPage, sections]);

  useEffect(() => {
    const on = (e) => {
      if (e.origin !== origin) return;
      const m = e.data || {};
      if (m.type === 'chip:probe' || m.type === 'chip:scroll') setScrollY(m.scrollY ?? 0);
      else if (m.type === 'chip:picked') onPicked(m);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [origin, onPicked]);

  function pick(x, y) {
    const py = y + scrollY;
    toPage({ type: 'chip:pick', id: `${x},${py}`, x: x - PICK.w / 2, y: py - PICK.h / 2, w: PICK.w, h: PICK.h });
  }

  const markers = notes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.x != null && n.y - scrollY >= 0 && n.y - scrollY <= FRAME_HEIGHT)
    .map(({ n, i }) => ({ id: String(n.id), x: n.x, y: n.y - scrollY, label: i + 1 }));

  return (
    <Stage frameWidth={Number(width)} frameHeight={FRAME_HEIGHT} zoom={zoom} onZoomChange={setZoom} markers={markers} picking={picking} onPick={pick} label={title}>
      <iframe ref={frame} title={title} src={src} width={width} height={FRAME_HEIGHT} onLoad={hello} />
    </Stage>
  );
}

export default function PlaygroundContent({ project, onProject, route, onRoute }) {
  const narrow = useNarrow();
  // what is on the canvas: nothing yet (Figma Screen 1 "Nothing picked yet", audit 10), a part or a page;
  // a link with a route opens the page
  const [part, setPart] = useState(null);
  const [none, setNone] = useState(() => !route);
  const { projects, pages, map, down, again } = usePlayData(project, route);
  // a phone opens at phone width (Figma "375 wide"), so the part is readable, not 15%
  // open at the widest preset that shows near full size: a 1440 frame at her ~1100 window shrank to 45%
  const roomy = !useNarrow(1440);
  // the four widths as a segment need about 730 of bar beside Show; below a
  // 1140 window (her ~1100 working width) the bar has 700 or less, so the same
  // choice is a Select and the bar stays on one row
  const tight = useNarrow(1140);
  const [width, setWidth] = useState(() => (narrow ? '375' : roomy ? '1440' : '768'));
  const [marking, setMarking] = useState(false);
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null); // 'sent' | 'failed'
  const [starting, setStarting] = useState(false);
  const [controls, setControls] = useState(false);
  // each part's control values, kept while you switch parts
  const [values, setValues] = useState({});
  const partValues = part ? { theme: 'Light', ...CONTROLS[part]?.start, ...values[part] } : {};
  const setValue = (key, v) => setValues((all) => ({ ...all, [part]: { ...all[part], [key]: v } }));
  const controlRows = part ? [...(CONTROLS[part]?.rows ?? []), THEME] : [];
  const nextId = useRef(1);

  // a page view opens the project's first page unless one was asked for
  useEffect(() => {
    if (!none && !part && pages?.length && !pages.some((p) => p.route === route)) onRoute(pages[0].route);
  }, [none, part, pages, route, onRoute]);
  const showValue = none ? '' : part ? `part:${part}` : `page:${route ?? ''}`;
  const showOptions = [
    ...(none ? [{ value: '', label: 'Pick a part or a page' }] : []),
    ...PARTS.map((n) => ({ value: `part:${n}`, label: `Parts › ${n}` })),
    ...(pages ?? []).map((p) => ({ value: `page:${p.route}`, label: `Pages › ${p.label}` })),
  ];
  // Show is a search, not a 40-row list (her note, 22 Nov: "too hard to select"): type to narrow, grouped
  // Recent, Parts and Pages; the last five picked come first
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('chip.playground.recent') ?? '[]');
    } catch {
      return [];
    }
  });
  const labelOf = (v) => (v ? showOptions.find((o) => o.value === v)?.label : null)?.replace(/^(Parts|Pages) › /, '') ?? null;
  const match = (label) => !q.trim() || label.toLowerCase().replace(/[\s_-]+/g, '').includes(q.toLowerCase().replace(/[\s_-]+/g, ''));
  const opt = (o) => ({ id: o.value, label: o.label.replace(/^(Parts|Pages) › /, ''), meta: o.value.startsWith('part:') ? 'Part' : 'Page' });
  const real = showOptions.filter((o) => o.value);
  const showGroups = [
    { id: 'recent', label: 'Recent', options: q.trim() ? [] : recent.map((v) => real.find((o) => o.value === v)).filter(Boolean).map(opt) },
    { id: 'parts', label: 'Parts', options: real.filter((o) => o.value.startsWith('part:') && match(o.label.slice(8))).map(opt) },
    { id: 'pages', label: 'Pages', options: real.filter((o) => o.value.startsWith('page:') && match(o.label.slice(8))).map(opt) },
  ];
  const pickShow = (o) => {
    setQ('');
    const next = [o.id, ...recent.filter((v) => v !== o.id)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem('chip.playground.recent', JSON.stringify(next));
    } catch {}
    onShow(o.id);
    // the field gives up focus so its placeholder names what is showing
    document.activeElement?.blur?.();
  };
  const onShow = (v) => {
    if (!v) return;
    setNone(false);
    if (v.startsWith('part:')) {
      setPart(v.slice(5));
      setMarking(false);
    } else {
      setPart(null);
      onRoute(v.slice(5));
    }
  };

  const page = pages?.find((p) => p.route === route);
  const running = map?.run?.state === 'running';
  const src = running && map.proxy ? `${map.proxy}/${route ?? ''}` : null;

  const addNote = useCallback((spot = {}) => {
    const id = nextId.current++;
    setNotes((ns) => [...ns, { id, note: '', on: spot.on ?? 'the page', section: spot.section ?? null, x: spot.x ?? null, y: spot.y ?? null }]);
    setSent(null);
    setOpen(true);
  }, []);

  async function send() {
    const body = {
      type: 'markup',
      page: `${map?.name ?? project} · ${page?.label ?? route}`,
      url: route,
      viewport: `${width}`,
      notes: notes
        .filter((n) => n.note.trim())
        .map((n, i) => ({ n: i + 1, note: n.note.trim(), on: n.on, section: n.section, x: n.x, y: n.y })),
    };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      setNotes([]);
      setMarking(false);
      setOpen(false);
      setSent('sent');
    } catch {
      setSent('failed');
    }
  }

  async function start() {
    setStarting(true);
    try {
      await fetch(`/projects/${encodeURIComponent(project)}/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
    } finally {
      setStarting(false);
      again();
    }
  }

  const onPicked = useCallback(
    (m) => {
      const [x, y] = String(m.id).split(',').map(Number);
      const first = m.picked?.[0];
      addNote({ on: first ? `“${shortName(first.text)}”` : 'the page', section: m.section ?? null, x, y });
    },
    [addNote],
  );

  const written = notes.filter((n) => n.note.trim()).length;

  if (down)
    return <Notification tone="danger" title="The CHIP server" message="It isn't answering. Start CHIP, then try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />;

  if (!part && pages && !pages.length)
    return <EmptyState size="page" mark="🤷" title="No pages to open here" line="This project has no pages CHIP can load yet. Pick another one." />;

  return (
    <>
      {sent === 'sent' ? <Notification tone="success" title="Your notes" message="Sent: they are on the progress board for the team." onClose={() => setSent(null)} /> : null}

      {/* Control bar: what you look at on the left, switches on the right */}
      <Flow direction={narrow ? 'column' : 'row'} gap={16} wrap={!narrow} justify={narrow ? 'start' : 'between'} align={narrow ? undefined : 'center'}>
        <Flow direction="row" gap={12} wrap>
          {/* Figma: one Show select; a page also names its project */}
          {!part && !none && projects?.length ? <Select label="Project" value={project} onChange={onProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} /> : null}
          <Flow>
            <Combobox
              label="Show"
              search
              value={q}
              onChange={setQ}
              groups={showGroups}
              onSelect={pickShow}
              placeholder={labelOf(showValue) ?? "Find a part or a page"}
              noResults={`No part or page called “${q.trim()}”`}
            />
          </Flow>
        </Flow>
        <Flow direction="row" gap={12} wrap>
          {/* below a 1140 window the four widths don't fit beside Show: the same choice as a Select */}
          {tight ? <Select label="Width" value={width} onChange={setWidth} options={WIDTHS} /> : <SegmentedControl label="Width" options={WIDTHS} value={width} onChange={setWidth} />}
          {part || none ? (
            <Button variant="secondary" ariaHaspopup="dialog" ariaExpanded={controls} disabled={none} onClick={() => setControls(true)}>
              Controls
            </Button>
          ) : (
            <Button variant="secondary" ariaExpanded={marking} onClick={() => (marking ? setMarking(false) : (setMarking(true), notes.length ? setOpen(true) : null))}>
              {marking ? 'Done marking' : 'Mark up'}
            </Button>
          )}
          {!part && notes.length ? (
            <Button variant="secondary" ariaHaspopup="dialog" onClick={() => setOpen(true)}>
              {`Notes · ${notes.length}`}
            </Button>
          ) : null}
        </Flow>
      </Flow>

      {part ? <PartSlot name={part} width={width} values={{ ...partValues, onSelected: (k) => setValue('selected', k) }} /> : null}

      {/* Figma Screen 1: the stage with the eyes Empty state until something is picked */}
      {none ? (
        <Stage label="Nothing picked yet">
          <EmptyState
            size="lane"
            mark="👀"
            title="Pick a part to try"
            // the Show select above is the one way to pick (audit 4, item 3: "Show parts" opened the same)
            line="Pick one in Show and give it a wee spin."
          />
        </Stage>
      ) : null}

      {!part && !none && map && !running ? (
        <Notification
          tone="attention"
          // one line: message left, action right (16 Nov, "A"; audit 3)
          message={`${map.name ?? 'This project'} isn’t running: ${map.run?.url ? `nothing answers at ${map.run.url}.` : 'there is no address for it in the config.'}`}
          action={map.run?.command ? { label: starting ? 'Starting…' : 'Start it', onClick: start } : undefined}
        />
      ) : null}

      {part || none ? null : src ? (
        // the stage fills the window from where it starts and the page scrolls inside it, so the control bar
        // never scrolls away (her note, 22 Nov: "I can scroll the whole page")
        <Flow fit="rest">
          <Flow span={12}>
            <StageSlot
              src={src}
              proxy={map.proxy}
              sections={(map.sections ?? []).map((sec) => sec.id)}
              title={`${map.name} · ${page?.label ?? route}, live`}
              width={width}
              notes={notes}
              picking={marking}
              onPicked={onPicked}
            />
          </Flow>
        </Flow>
      ) : !map ? <EmptyState size="lane" title="Loading the page" /> : null}

      {/* Figma "controls open": the part's props as rows, value on the right; a click moves to the next value */}
      <Drawer open={controls && !!part} onClose={() => setControls(false)} label="Controls" side="right" size="sm">
        <Flow as="ul" gap={4} aria-label={`${part ?? ''} controls`}>
          {controlRows.map((c) => {
            const now = partValues[c.key] ?? c.options[0];
            const next = c.options[(c.options.indexOf(now) + 1) % c.options.length];
            return (
              <ListRow
                key={c.key}
                layout="inline"
                title={c.label}
                value={now}
                onClick={() => setValue(c.key, next)}
              />
            );
          })}
        </Flow>
      </Drawer>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label="Your notes on this page"
        side="right"
        footer={
          <Button variant="primary" disabled={!written} onClick={send}>
            Send notes
          </Button>
        }
      >
        {/* plain content in a Drawer body lands on the title's edge with Flow inset (Flow.jsx) */}
        <Flow gap={16} inset>
        <Flow as="ol" gap={16} aria-label="Notes">
          {notes.map((n, i) => (
            <Flow as="li" key={n.id} gap={8}>
              {/* wraps rather than squeezing the pin's label onto two lines */}
              <Flow direction="row" gap={8} wrap align="center">
                <Pin number={i + 1} label={`on ${n.on}`} />
                <Button variant="tertiary" size="sm" onClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} ariaLabel={`Remove note ${i + 1}`}>
                  Remove
                </Button>
              </Flow>
              <Input
                label={`Note ${i + 1}`}
                multiline
                value={n.note}
                placeholder="What should change?"
                onChange={(v) => setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, note: v } : x)))}
              />
            </Flow>
          ))}
        </Flow>
        {/* a note on the page as a whole; a note on a spot comes from clicking the page while marking */}
        <Flow direction="row" gap={8}>
          <Button variant="secondary" size="sm" onClick={() => addNote()}>
            Add a note
          </Button>
        </Flow>
        </Flow>
        {sent === 'failed' ? <Notification tone="danger" title="The progress board" message={`It doesn't answer at ${BOARD}, so your notes weren't sent. They are still here.`} /> : null}
      </Drawer>
    </>
  );
}
