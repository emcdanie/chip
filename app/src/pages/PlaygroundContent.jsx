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
// STAGE SLOT: the dot-grid Stage part (Figma Stage{grid=dots}) is being built
// by parts-dev. Until it lands, StageSlot shows the live page in a Card at the
// column's width, and notes are page-wide (no pin on a spot yet). When Stage
// lands: frameWidth = width, zoom with Fit / 100% inside it, markers = notes,
// picking = marking, onPick asks the page what sits there (chip:pick).
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
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

/** The live page. Interim until the Stage part lands (see the header note). */
function StageSlot({ src, title }) {
  return (
    <Card>
      <iframe title={title} src={src} width="100%" height="640" />
    </Card>
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
          <Button variant="secondary" ariaExpanded={marking} onClick={() => (marking ? setMarking(false) : (setMarking(true), notes.length ? setOpen(true) : addNote()))}>
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

      {src ? <StageSlot src={src} title={`${map.name} · ${page?.label ?? route}, live`} /> : !map ? <EmptyState size="lane" title="Loading the page" /> : null}

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
        {/* Interim: until the Stage part lands, a note is added here; then by clicking the page */}
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
