// Playground · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:138756, flow 9) on the CHIP / Screen template. Any page of any project,
// live, at 375 / 768 / 1024 / 1440, and Mark up: numbered notes sent to the
// progress board (Elleta, 19 Nov 2026: "i want to be able to mark up and reply
// to you easily without having to copy paste screenshot which is the point of
// chip"). Built from BELLA parts and the template's Flow only; no page CSS.
//
// Pages tab (23 Nov, her: "i still want to be able to mark up the site in chip"): a page of any project is a
// picture of it at the chosen width (server/lib/play-shot.mjs), marked up in the same PicturePins as Your picks:
// a click drops a numbered pin and a small comment box, pins stay as drafts in this browser, and one "n marked ·
// Send all" bar posts every note on every page as one message. Parts stay live on BELLA's Stage.
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Notification from '@bella/components/Notification/Notification';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Combobox from '@bella/components/Combobox/Combobox';
import Stage from '@bella/components/Stage/Stage';
import { CONTROLS, SPECIMENS, THEME } from '../specimens.jsx';
import { useComponents } from './componentsModel.js';
import ListRow from '@bella/components/ListRow/ListRow';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import PicturePins from '../templates/PicturePins.jsx';
import SendBar from '../templates/SendBar.jsx';

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
const DRAFTS = 'chip.playground.pages.drafts';
const readDrafts = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS) ?? '{}') || {};
  } catch {
    return {};
  }
};
const unsent = (d) => (d?.pins ?? []).filter((p) => p.note.trim() && !p.sent);
const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function PlaygroundContent({ project, onProject, route, onRoute, openFirst = false }) {
  const narrow = useNarrow();
  // what is on the canvas: nothing yet (Figma Screen 1 "Nothing picked yet", audit 10), a part or a page;
  // a link with a route opens the page
  const [part, setPart] = useState(null);
  const [none, setNone] = useState(() => !route && !openFirst);
  const { projects, pages, map, down, again } = usePlayData(project, route);
  // a phone opens at phone width (Figma "375 wide"), so the part is readable, not 15%
  // open at the widest preset that shows near full size: a 1440 frame at her ~1100 window shrank to 45%
  const roomy = !useNarrow(1440);
  // the four widths as a segment need about 730 of bar beside Show; below a
  // 1140 window (her ~1100 working width) the bar has 700 or less, so the same
  // choice is a Select and the bar stays on one row
  const tight = useNarrow(1140);
  const [width, setWidth] = useState(() => (narrow ? '375' : roomy ? '1440' : '768'));
  // notes are drafts per page and width, kept in this browser until Send all (one POST for every page)
  const [drafts, setDrafts] = useState(readDrafts);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFTS, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);
  const [batch, setBatch] = useState({ sending: false, result: null, failed: null });
  const [starting, setStarting] = useState(false);
  const [controls, setControls] = useState(false);
  // each part's control values, kept while you switch parts
  const [values, setValues] = useState({});
  const partValues = part ? { theme: 'Light', ...CONTROLS[part]?.start, ...values[part] } : {};
  const setValue = (key, v) => setValues((all) => ({ ...all, [part]: { ...all[part], [key]: v } }));
  const controlRows = part ? [...(CONTROLS[part]?.rows ?? []), THEME] : [];

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
  const shot = running && route != null ? `/play/shot?project=${encodeURIComponent(project)}&route=${encodeURIComponent(route)}&width=${width}` : null;

  async function start() {
    setStarting(true);
    try {
      await fetch(`/projects/${encodeURIComponent(project)}/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
    } finally {
      setStarting(false);
      again();
    }
  }

  const draftKey = `${project}|${route ?? ''}|${width}`;
  const pins = drafts[draftKey]?.pins ?? [];
  const setPins = (next) =>
    setDrafts((all) => {
      const was = all[draftKey]?.pins ?? [];
      return { ...all, [draftKey]: { project, route: route ?? '', width, name: page?.label ?? route, pins: typeof next === 'function' ? next(was) : next } };
    });
  const projectName = (id) => projects?.find((x) => x.id === id)?.name ?? id;
  const waiting = Object.values(drafts).filter((d) => unsent(d).length);
  const count = waiting.reduce((n, d) => n + unsent(d).length, 0);
  // ONE Send all: every note on every page in one POST, one message to the agent
  async function sendAll() {
    if (!count || batch.sending) return;
    setBatch({ sending: true, result: null, failed: null });
    const body = {
      type: 'batch',
      page: `Playground · ${count} ${count === 1 ? 'note' : 'notes'} on ${waiting.length} ${waiting.length === 1 ? 'page' : 'pages'}`,
      url: '/playground',
      cards: [],
      markups: waiting.map((d) => ({
        type: 'markup',
        page: `${projectName(d.project)} · ${d.name}`,
        url: d.route,
        viewport: String(d.width),
        notes: unsent(d).map((p, i) => ({ n: i + 1, note: p.note.trim(), on: 'the page', section: null, x: p.x, y: p.y })),
      })),
    };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      const at = Date.now();
      setDrafts((all) => Object.fromEntries(Object.entries(all).map(([k, d]) => [k, { ...d, pins: d.pins.map((x) => (x.note.trim() ? { ...x, sent: true } : x)) }])));
      setBatch({ sending: false, result: { n: count, at: clock(at) }, failed: null });
    } catch {
      setBatch({ sending: false, result: null, failed: `Not sent: the progress board doesn’t answer at ${BOARD}. Your notes are kept here.` });
    }
  }

  if (down)
    return <Notification tone="danger" title="The CHIP server" message="It isn't answering. Start CHIP, then try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />;

  if (!part && pages && !pages.length)
    return <EmptyState size="page" mark="🤷" title="No pages to open here" line="This project has no pages CHIP can load yet. Pick another one." />;

  return (
    <>
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

      {/* the page as a picture, marked up like Figma comments: click it, a numbered pin and a small comment box */}
      {part || none || !running ? null : (
        <Flow gap={8}>
          <TextStack subtitle="Click anywhere on the page to leave a comment. Pins stay here until you press Send all." />
          <PicturePins
            key={draftKey}
            src={shot}
            alt={`${page?.label ?? route} at ${width} wide`}
            summary={`${map?.name ?? project} · ${page?.label ?? route}, ${width} wide`}
            pins={pins}
            setPins={setPins}
            commitLabel="Save"
          />
        </Flow>
      )}
      {!part && !none && map && running && !shot ? <EmptyState size="lane" title="Loading the page" /> : null}
      <SendBar count={count} onSend={sendAll} sending={batch.sending} result={batch.result} failed={batch.failed} onDismiss={() => setBatch({ sending: false, result: null, failed: null })} />

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

    </>
  );
}
