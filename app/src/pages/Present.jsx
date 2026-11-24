// Present: the deck inside CHIP (deck plan, approved 23 Nov 2026; Elleta: a presentation in HTML using the system,
// opened from CHIP, showing how easy it is to make things to share). Ten slides, each built from BELLA parts and
// the approved chart language; every number is read from CHIP's data when the slide opens, never typed, and a
// number not read says Not measured. Each slide is its own link (#/present/3). The deck only reads: no button here
// starts a run. Keys: → or Space next, ← back, 1 to 9 and 0 jump, G all slides, N notes, F full screen, Esc out.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import useCached, { clock } from '../templates/useCached.js';
import { TARGET, useHealth } from './healthModel.js';
import { useWork } from './workModel.js';
import Slide from '@bella/components/Slide/Slide';
import DeckBar from '@bella/components/DeckBar/DeckBar';
import VideoPlayer from '@bella/components/VideoPlayer/VideoPlayer';
import Stat from '@bella/components/Stat/Stat';
import StatCard from '@bella/components/StatCard/StatCard';
import Progress from '@bella/components/Progress/Progress';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Heading from '@bella/components/Heading/Heading';
import TextStack from '@bella/components/TextStack/TextStack';
import MapNode from '@bella/components/MapNode/MapNode';
import MapLine from '@bella/components/MapLine/MapLine';
import Step from '@bella/components/Step/Step';
import Tag from '@bella/components/Tag/Tag';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import BoardLane from '@bella/components/BoardLane/BoardLane';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import DataTable from '@bella/components/DataTable/DataTable';
import Card from '@bella/components/Card/Card';
import Columns from '@bella/components/Columns/Columns';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Link from '@bella/components/Link/Link';
import FloatingPanel from '@bella/components/FloatingPanel/FloatingPanel';
import Toast from '@bella/components/Toast/Toast';
import { markOf } from '../templates/marks.js';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* The head every content slide opens with: the slide's question as an Eyebrow, its answer as the heading. */
function Head({ eyebrow, title }) {
  return (
    <Flow gap={8}>
      <Eyebrow variant="ink">{eyebrow}</Eyebrow>
      <Heading tier="section" as="h2">{title}</Heading>
    </Flow>
  );
}

/* 1 · The film: the promo opens the talk. Muted, captions on; reduced motion shows the still and waits for Play. */
function Film() {
  return (
    <Slide label="Slide 1: The film" centered>
      <div style={{ inlineSize: 'calc(var(--spacing-80) * 11)' }}>
        <VideoPlayer src="/deck/promo.mp4" poster="/deck/promo-poster.png" captions="/deck/promo.vtt" label="CHIP, the local bridge for BELLA: a short film with captions" />
      </div>
    </Slide>
  );
}

/* 2 · The problem: three places drift apart unseen. The count is the one Health shows (/drift), against the first reading CHIP kept. */
function Problem() {
  const { data, at } = useCached(['/drift'], { live: true });
  const d = data?.[0] ?? null;
  const hist = d?.history ?? [];
  const first = hist[0] ?? null;
  const measured = Boolean(d?.total);
  return (
    <Slide label="Slide 2: The problem">
      <Head eyebrow="The problem" title="Figma, the specs and the code drift apart, and nobody sees it" />
      <Flow direction="row" gap={16} align="center">
        <MapNode title="Figma" status="What was designed" />
        <MapLine direction="horizontal" end="none" variant="dashed" style={{ inlineSize: 'var(--spacing-80)' }} />
        <MapNode title="Spec" status="What was written down" />
        <MapLine direction="horizontal" end="none" variant="dashed" style={{ inlineSize: 'var(--spacing-80)' }} />
        <MapNode title="Code" status="What ships" />
      </Flow>
      <Stat
        size="display"
        label="Parts that differ"
        measured={measured}
        value={measured ? d.differing : ''}
        delta={measured ? `of ${d.total} parts${first ? `, ${first.differing} on ${day(first.at)}` : ''} · read ${clock(at)}` : undefined}
        trend={measured && first && d.differing !== first.differing ? (d.differing > first.differing ? 'up' : 'down') : undefined}
        series={hist.length > 1 ? hist.map((h) => h.differing) : undefined}
        seriesLabels={hist.length > 1 ? hist.map((h) => day(h.at)) : undefined}
      />
    </Slide>
  );
}

/* 3 · What CHIP is: words only, no number claimed. */
const AREAS = ['Tokens', 'Components', 'Figma', 'Docs', 'Accessibility', 'Tooling & gate'];
function WhatItIs() {
  return (
    <Slide label="Slide 3: What CHIP is">
      <Head eyebrow="What CHIP is" title="CHIP checks Figma, specs and code against each other" />
      <Flow direction="row" gap={0} equal>
        <Step layout="horizontal" number={1} state="pending" title="Find" detail="Drift and gaps, read from BELLA" showConnector />
        <Step layout="horizontal" number={2} state="pending" title="Plan" detail="One plan to read, edit or close" showConnector />
        <Step layout="horizontal" number={3} state="pending" title="Watch" detail="Progress on the board, then Accept or Undo" />
      </Flow>
      <Flow direction="row" gap={8} wrap>
        {AREAS.map((a) => (
          <Tag key={a} variant="outline">{a}</Tag>
        ))}
      </Flow>
    </Slide>
  );
}

/* 4 · Health and drift: number against target; drift as sorted bars; gaps. The same reads as Health. */
function HealthDrift() {
  const { model, checked } = useHealth();
  const { data: driftData } = useCached(['/drift'], { live: true });
  const { data: gapsData } = useCached(['/bella-gaps'], { live: true });
  const h = model?.health ?? null;
  const d = driftData?.[0] ?? null;
  const g = gapsData?.[0] ?? null;
  const kinds = d?.total ? [{ label: 'Differ from Figma', n: d.drifting }, { label: 'Spec behind the code', n: d.specBehind }, { label: 'No spec', n: d.noSpec }].sort((a, b) => b.n - a.n) : [];
  const gapTotal = g ? g.notInCode.length + g.notInBella.length : 0;
  return (
    <Slide label="Slide 4: Health and drift">
      <Head eyebrow="Health and drift" title="How healthy BELLA is, where it differs, what it cannot do yet" />
      <Flow direction="row" gap={16} equal fill>
        {h ? (
          <StatCard title="System health" icon="Activity" tone={h.pct >= TARGET ? 'success' : 'warning'} label="Checks that pass" value={h.pct} unit="%" chart="bar" meter={{ fill: h.pct, target: TARGET }} context={`${h.passed} of ${h.total} checks · ${plural(h.needsWork, 'part')} need work`} caption={`BELLA's part files · read ${checked ?? ''}`} />
        ) : (
          <StatCard title="System health" icon="Activity" chart="empty" context="Not measured" caption="BELLA's part files" />
        )}
        <Card footerText={d?.total ? `Specs from ${day(d.at)}` : 'Not measured'}>
          <Flow gap={16}>
            <TextStack title="Where parts differ" body={d?.total ? `${d.differing} of ${d.total} parts, most first` : 'Not measured'} />
            <Flow gap={12} as="ul" aria-label="Kinds of drift, most first">
              {kinds.map((k) => (
                <li key={k.label}>
                  <Progress label={k.label} value={`${k.n} of ${d.total}`} fill={(k.n / d.total) * 100} tone="attention" />
                </li>
              ))}
            </Flow>
          </Flow>
        </Card>
        {g ? (
          <StatCard title="Gaps" icon="WarningCircle" tone={gapTotal ? 'warning' : 'success'} chart="none" value={gapTotal} unit={gapTotal === 1 ? 'part' : 'parts'} context={`${g.notInCode.length} specified, not in code · ${g.notInBella.length} not in BELLA yet`} caption="What BELLA can't do yet" />
        ) : (
          <StatCard title="Gaps" icon="WarningCircle" chart="empty" context="Not measured" caption="What BELLA can't do yet" />
        )}
      </Flow>
    </Slide>
  );
}

/* 5 · Fix plan to the board: the flow, then what is running now on the Work board (read only: no run starts here). */
const FLOW = [
  ['Finding', 'A count opens why'],
  ['Plan', 'Ready to read or edit'],
  ['Start', 'One yes'],
  ['Board', 'Steps done and left'],
  ['Accept', 'Or Undo'],
];
function FixToBoard() {
  const { model, checked } = useWork();
  const now = model?.lanes.find((l) => l.id === 'now') ?? null;
  const cards = (now?.cards ?? []).filter((c) => c.progress?.total).slice(0, 2);
  return (
    <Slide label="Slide 5: Fix plan to the board">
      <Head eyebrow="Fix plan to the board" title="A finding becomes a plan, one yes starts it, the board shows it land" />
      <Flow direction="row" gap={0} equal>
        {FLOW.map(([t, line], i) => (
          <Step key={t} layout="horizontal" number={i + 1} state="pending" title={t} detail={line} showConnector={i < FLOW.length - 1} />
        ))}
      </Flow>
      {cards.length ? (
        <Flow gap={8}>
          <Flow cards>
            {cards.map((c) => (
              <TaskCard key={c.id} title={c.title} line={c.line} status={c.status} statusTone={c.tone} progress progressDone={c.progress.done} progressTotal={c.progress.total} stepNow={c.progress.state !== 'done' ? c.progress.now ?? undefined : undefined} />
            ))}
          </Flow>
          <TextStack meta={`Now on the Work board: ${plural(now.cards.length, 'card')} · read ${checked ?? ''}`} />
        </Flow>
      ) : (
        <EmptyState size="lane" {...markOf('⏳')} title={model ? 'Nothing running right now' : 'Not measured'} line={model ? 'When a plan is started, its card shows here with its steps.' : "The Work board didn't answer."} />
      )}
    </Slide>
  );
}

/* 6 · Audits: every score from its saved report (/audits); an audit never run says so. */
function Audits() {
  const { data } = useCached(['/audits'], { live: true });
  const audits = data?.[0] ?? null;
  return (
    <Slide label="Slide 6: Audits">
      <Head eyebrow="Audits" title="Every score was measured, and one never run says so" />
      {audits?.length ? (
        <Flow gap={16}>
          {[audits.slice(0, 3), audits.slice(3, 6)].map((row, i) => (
            <Flow key={i} direction="row" gap={16} equal fill>
              {row.map((a) =>
                a.ran ? (
                  <StatCard key={a.id} title={a.title} icon="Activity" tone={a.red ? 'danger' : a.yellow ? 'warning' : 'success'} chart="none" value={a.value ?? '–'} unit={a.unit ?? ''} context={a.red == null ? a.skill : `${a.red} failing · ${a.yellow} need work`} caption={`Ran ${day(a.ran)}${a.prev ? ` · was ${a.prev.value} on ${day(a.prev.day)}` : ''}`} />
                ) : (
                  <StatCard key={a.id} title={a.title} icon="Activity" chart="empty" context={a.skill} caption="Not run: no saved report yet" />
                ),
              )}
            </Flow>
          ))}
        </Flow>
      ) : (
        <EmptyState size="lane" {...markOf('📦')} title="Not measured" line="No saved audit reports were found." />
      )}
    </Slide>
  );
}

/* 7 · Tokens and contrast: each pair against its own target (7:1 for text), from BELLA's pairs check. */
function Contrast() {
  const { model, checked } = useHealth();
  const { data } = useCached(['/contrast-pairs'], { live: true });
  const pairs = (data?.[0]?.pairs ?? []).filter((p) => p.worst != null);
  const lowest = [...pairs].sort((a, b) => a.worst / a.bar - b.worst / b.bar).slice(0, 5);
  const low = model?.lowest ?? null;
  const rows = lowest.map((p) => ({ id: p.label, pair: p.label, worst: `${p.worst}:1`, ratio: p.worst, bar: `${p.bar}:1`, state: p.ok ? 'Passes' : 'Fails' }));
  return (
    <Slide label="Slide 7: Tokens and contrast">
      <Head eyebrow="Tokens and contrast" title="Every colour pair is checked against the ratio it must meet" />
      {pairs.length ? (
        <Columns count={2} split="wide-start">
          <DataTable
            caption={`The five closest to their target, of ${pairs.length} pairs`}
            rowKey="id"
            density="compact"
            rows={rows}
            columns={[
              { key: 'pair', label: 'Pair' },
              { key: 'worst', label: 'Lowest', numeric: true, sortValue: (r) => r.ratio },
              { key: 'bar', label: 'Target', numeric: true },
              { key: 'state', label: 'State', kind: 'tag' },
            ]}
          />
          {low ? (
            <StatCard title="Lowest text contrast" icon="Eye" tone={low.ratio >= low.bar ? 'success' : 'danger'} label="In any theme" value={low.ratio} unit=":1" chart="bar" meter={{ fill: Math.min(100, (low.ratio / 21) * 100), target: (low.bar / 21) * 100, targetText: `${low.bar}:1` }} context={`${low.below ? `${low.below} below target` : 'None below target'} · ${model.contrast ? `${model.contrast.pass} of ${model.contrast.of} parts declare pairs` : ''}`} caption={`BELLA's pairs check · read ${checked ?? ''}`} />
          ) : (
            <StatCard title="Lowest text contrast" icon="Eye" chart="empty" context="Not measured" caption="BELLA's pairs check" />
          )}
        </Columns>
      ) : (
        <EmptyState size="lane" {...markOf('🚦')} title="Not measured" line="BELLA's pairs check didn't answer." />
      )}
    </Slide>
  );
}

/* 8 · The system proves itself: the gate's checks one row each, and what keeps coming back (Not again). */
function Proves() {
  const { model, checked } = useHealth();
  const { data: checksData } = useCached(['/checks'], { live: true });
  const { data: recData } = useCached(['/not-again/recurring'], { live: true });
  const members = checksData?.[0]?.gate?.members ?? [];
  const gate = model?.gate ?? null;
  const rec = recData?.[0]?.recurring ?? null;
  const back = rec ? rec.filter((r) => r.recent > 0) : null;
  const TONE = { passed: 'success', failed: 'danger', waiting: 'attention', 'not-run': 'neutral' };
  const WORD = { passed: 'Passes', failed: 'Fails', waiting: 'Waiting', 'not-run': 'Not run' };
  return (
    <Slide label="Slide 8: The system proves itself">
      <Head eyebrow="The system proves itself" title="This deck is made of the parts it describes, and BELLA checks them on every commit" />
      <Columns count={2} split="wide-start">
        <Card footerText={gate?.when ? `The gate, last run ${gate.when}${gate.on ? ` on ${gate.on}` : ''}` : 'The gate: Not measured'}>
          {members.length ? (
            <ListRowGroup ariaLabel="The gate's checks">
              {members.map((m) => (
                <ListRow key={m.id} layout="inline" title={m.name} statusDot={<StatusDot tone={TONE[m.status] ?? 'neutral'} label={WORD[m.status] ?? m.status} />} />
              ))}
            </ListRowGroup>
          ) : (
            <TextStack body="Not measured" />
          )}
        </Card>
        <Flow gap={24}>
          <Stat label="Gate checks passing" measured={Boolean(gate)} value={gate ? gate.ok : ''} delta={gate ? `of ${gate.of} · read ${checked ?? ''}` : undefined} />
          <Stat label="Keep coming back" measured={Boolean(back)} value={back ? back.length : ''} delta={back ? `kinds of failure in ${recData[0].windowDays ?? 14} days` : undefined} />
        </Flow>
      </Columns>
    </Slide>
  );
}

/* 9 · What is next: the Next lane, in her order (the board's own order). */
function Next() {
  const { model } = useWork();
  const lane = model?.lanes.find((l) => l.id === 'next') ?? null;
  const cards = (lane?.cards ?? []).slice(0, 3);
  return (
    <Slide label="Slide 9: What is next">
      <Head eyebrow="What is next" title="What lands after Tuesday, in the board's order" />
      <BoardLane name="Next" lane="next" order="In the order set on the Work board" count={lane?.cards.length ?? 0} empty={model ? 'Nothing in Next' : 'Not measured'} headingLevel={3}>
        {cards.map((c) => (
          <TaskCard key={c.id} title={c.title} line={c.line} status={c.status} statusTone={c.tone} />
        ))}
      </BoardLane>
    </Slide>
  );
}

/* 10 · The ask: words only, one primary. */
function Ask() {
  return (
    <Slide label="Slide 10: The ask" centered>
      <Eyebrow variant="ink">The ask</Eyebrow>
      <Heading tier="hero" as="h2">Less context, not more.</Heading>
      <TextStack body="One board, one plan to read, one yes. Bring me the part that keeps drifting in your system." />
      <Flow direction="row" gap={16} align="center">
        <Link href="#/system/history">See what changed this week</Link>
        <Button variant="primary" href="#/work">Open the Work board</Button>
      </Flow>
    </Slide>
  );
}

/* The slides in order, with the speaker's one line each (from the cheatsheet: what to click and say). */
const SLIDES = [
  { name: 'The film', says: 'A short film opens the talk.', Slide: Film, note: 'Let it play, 27 seconds. Say nothing until it ends; the captions carry it.' },
  { name: 'The problem', says: 'Three places drift apart unseen.', Slide: Problem, note: 'Say: three places drift apart, and CHIP checks all three. Point at the number: it is read now.' },
  { name: 'What CHIP is', says: 'It checks Figma, specs and code against each other.', Slide: WhatItIs, note: 'Say: find, plan, watch. One board, one plan to read, one yes.' },
  { name: 'Health and drift', says: 'How healthy, which parts differ, what BELLA cannot do yet.', Slide: HealthDrift, note: 'Say: which parts disagree, and what BELLA cannot do yet. In the demo: Health, Drift, a part, Gaps.' },
  { name: 'Fix plan to the board', says: 'Finding, plan, one yes, then watch it on the board.', Slide: FixToBoard, note: 'Say: I read the plan first; nothing runs before I approve it. In the demo: New, a job, read the plan.' },
  { name: 'Audits', says: 'Every score was measured.', Slide: Audits, note: 'Say: every number was measured. An audit never run says so.' },
  { name: 'Tokens and contrast', says: 'Colours checked against the ratio they must meet.', Slide: Contrast, note: 'Say: each colour pair against its own target, 7 to 1 for text, in every theme.' },
  { name: 'The system proves itself', says: 'This deck is made of the parts it describes.', Slide: Proves, note: 'Say: this deck is BELLA parts; the gate checks them on every commit.' },
  { name: 'What is next', says: 'What lands after Tuesday.', Slide: Next, note: 'Say: what lands after Tuesday, in the order on the board.' },
  { name: 'The ask', says: 'Less context, not more.', Slide: Ask, note: 'Say: less context, not more. Then open the Work board.' },
];

const slideFromHash = () => {
  const n = Number(window.location.hash.split('?')[0].match(/^#\/present\/(\d+)/)?.[1]);
  return n >= 1 && n <= SLIDES.length ? n : 1;
};
const linkTo = (n) => `${window.location.origin}${window.location.pathname}#/present/${n}`;

/* The stage's width: the slide plus the deck bar fit the area they sit in without scrolling; full screen fills the screen. */
function useStageWidth(full, boxRef) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const size = () => {
      const room = full ? window.innerWidth : box.clientWidth;
      const tall = full ? window.innerHeight : window.innerHeight - box.getBoundingClientRect().top - 160;
      setWidth(Math.max(240, Math.floor(Math.min(room, (Math.max(tall, 135) * 16) / 9))));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);
    window.addEventListener('resize', size);
    return () => (ro.disconnect(), window.removeEventListener('resize', size));
  }, [full, boxRef]);
  return width;
}

export default function Present() {
  const [current, setCurrent] = useState(slideFromHash);
  const [grid, setGrid] = useState(false);
  const [notes, setNotes] = useState(false);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const stage = useRef(null);
  const box = useRef(null);
  const width = useStageWidth(full, box);

  const go = useCallback((n) => {
    const to = Math.min(SLIDES.length, Math.max(1, n));
    setCurrent(to);
    setGrid(false);
    if (window.location.hash !== `#/present/${to}`) window.history.replaceState(null, '', `#/present/${to}`);
  }, []);

  // a pasted or picked link (#/present/7) lands on that slide
  useEffect(() => {
    const on = () => (setCurrent(slideFromHash()), setGrid(false));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (!/^#\/present\/\d+/.test(window.location.hash)) window.history.replaceState(null, '', `#/present/${current}`);
  }, [current]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current && Boolean(stage.current));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else stage.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(linkTo(current)).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [current]);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    const on = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"] [role="textbox"]')) return;
      const onControl = Boolean(t?.closest?.('button, a, [role="button"]'));
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !onControl)) {
        e.preventDefault();
        go(current + 1);
      } else if (k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault();
        go(current - 1);
      } else if (/^[0-9]$/.test(k)) {
        go(k === '0' ? 10 : Number(k));
      } else if (k === 'g' || k === 'G') {
        setGrid((v) => !v);
      } else if (k === 'n' || k === 'N') {
        setNotes((v) => !v);
      } else if (k === 'f' || k === 'F') {
        toggleFull();
      } else if (k === 'Home') {
        go(1);
      } else if (k === 'End') {
        go(SLIDES.length);
      } else if (k === 'Escape') {
        if (grid) setGrid(false);
        else if (notes) setNotes(false);
        else if (!document.fullscreenElement) window.location.hash = '#/health';
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [current, go, grid, notes, toggleFull]);

  const S = SLIDES[current - 1];
  const Current = S.Slide;
  const stageStyle = useMemo(
    () => (full ? { background: 'var(--color-background-default)', display: 'grid', placeItems: 'center' } : undefined),
    [full],
  );

  return (
    <Screen place="present" header={{ title: 'Present' }}>
      {grid ? (
        <Flow gap={16}>
          <TextStack title="All slides" body="Pick one to present it. G or Esc goes back to the slide you were on." />
          <Flow cards>
            {SLIDES.map((s, i) => (
              <Card key={s.name} href={`#/present/${i + 1}`} ariaLabel={`Slide ${i + 1}: ${s.name}`}>
                <TextStack overline={`Slide ${i + 1}${i + 1 === current ? ' · showing' : ''}`} title={s.name} body={s.says} />
              </Card>
            ))}
          </Flow>
        </Flow>
      ) : (
        <div ref={box} style={{ inlineSize: '100%' }}>
        <Flow gap={16} align="center">
          <div ref={stage} style={stageStyle}>
            <div style={{ inlineSize: `${Math.round(width)}px`, maxInlineSize: '100%' }}>
              <Current key={current} />
            </div>
          </div>
          <div style={{ inlineSize: `${Math.round(width)}px`, maxInlineSize: '100%' }}>
            <Flow gap={12}>
              <DeckBar current={current} total={SLIDES.length} onBack={() => go(current - 1)} onNext={() => go(current + 1)} onNotes={() => setNotes((v) => !v)} notesOpen={notes} onGrid={() => setGrid(true)} />
              <Flow direction="row" gap={8} wrap justify="end">
                <ActionChip onClick={toggleFull}>{full ? 'Leave full screen' : 'Full screen'}</ActionChip>
                <ActionChip onClick={copy}>{copied ? 'Link copied' : 'Copy link to this slide'}</ActionChip>
              </Flow>
            </Flow>
          </div>
        </Flow>
        </div>
      )}
      {notes ? (
        <FloatingPanel title={`Notes · slide ${current}`} onClose={() => setNotes(false)} onDock={() => setNotes(false)}>
          <TextStack title={S.name} body={S.note} />
        </FloatingPanel>
      ) : null}
      {copied ? (
        <Toasts>
          <Toast tone="success" onClose={() => setCopied(false)}>{`Link to slide ${current} copied`}</Toast>
        </Toasts>
      ) : null}
    </Screen>
  );
}
