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
// there (chip:pick, answered by the proxy's probe). The frame options wait on
// her card y22.
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Stage from '@bella/components/Stage/Stage';
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
  const { projects, pages, map, down, again } = usePlayData(project, route);
  const [width, setWidth] = useState('1440');
  const [marking, setMarking] = useState(false);
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null); // 'sent' | 'failed'
  const [starting, setStarting] = useState(false);
  const nextId = useRef(1);

  // the project's first page opens unless one was asked for
  useEffect(() => {
    if (pages?.length && !pages.some((p) => p.route === route)) onRoute(pages[0].route);
  }, [pages, route, onRoute]);

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
    return <Notification tone="danger" title="The CHIP server is not answering" message="Start CHIP, then try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />;

  if (pages && !pages.length)
    return <EmptyState size="page" wash="blue" mark="🤷" title="No pages to open here" line="This project has no pages CHIP can load yet. Pick another one." />;

  return (
    <>
      {sent === 'sent' ? <Notification tone="success" title="Notes sent" message="They are on the progress board for the team." onClose={() => setSent(null)} /> : null}

      {/* Control bar: what you look at on the left, switches on the right */}
      <Flow direction={narrow ? 'column' : 'row'} gap={16} wrap justify={narrow ? 'start' : 'between'} align={narrow ? undefined : 'center'}>
        <Flow direction="row" gap={12} wrap>
          {projects?.length ? <Select label="Project" value={project} onChange={onProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} /> : null}
          {pages?.length ? <Select label="Page" value={route ?? ''} onChange={onRoute} options={pages.map((p) => ({ value: p.route, label: p.label }))} /> : null}
        </Flow>
        <Flow direction="row" gap={12} wrap>
          {/* below 800px the four widths don't fit in one row: the same choice as a Select */}
          {narrow ? <Select label="Width" value={width} onChange={setWidth} options={WIDTHS} /> : <SegmentedControl label="Width" options={WIDTHS} value={width} onChange={setWidth} />}
          <Button variant="secondary" ariaExpanded={marking} onClick={() => (marking ? setMarking(false) : (setMarking(true), notes.length ? setOpen(true) : null))}>
            {marking ? 'Done marking' : 'Mark up'}
          </Button>
          {notes.length ? (
            <Button variant="secondary" ariaHaspopup="dialog" onClick={() => setOpen(true)}>
              {`Notes · ${notes.length}`}
            </Button>
          ) : null}
        </Flow>
      </Flow>

      {map && !running ? (
        <Notification
          tone="attention"
          title={`${map.name ?? 'This project'} isn’t running`}
          message={map.run?.url ? `Nothing answers at ${map.run.url}.` : 'There is no address for it in the config.'}
          action={map.run?.command ? { label: starting ? 'Starting…' : 'Start it', onClick: start } : undefined}
        />
      ) : null}

      {src ? (
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
      ) : !map ? <EmptyState size="lane" title="Loading the page" /> : null}

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
        <Flow gap={16}>
        <Flow as="ol" gap={16} aria-label="Notes">
          {notes.map((n, i) => (
            <Flow as="li" key={n.id} gap={8}>
              <Flow direction="row" gap={8}>
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
        {sent === 'failed' ? <Notification tone="danger" title="Could not send" message={`The progress board does not answer at ${BOARD}. Your notes are still here.`} /> : null}
      </Drawer>
    </>
  );
}
