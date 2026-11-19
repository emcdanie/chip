// Not again · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:73919). One component, Figma's six states as a prop: suggested,
// running, your-call, kept, gate-fails, library. Built from BELLA parts and
// the template's Flow only; no page CSS.
//
// The two stats are real: counted from CHIP's run log (/runs) since Monday,
// on BELLA's StatCard as Figma draws them; with no run this week they are
// the Empty state (Elleta, 19 Nov). The fix card and the library are still
// Figma's example (notAgainFixture.js) until CHIP records saved fixes.
//
// Gaps: StatCard has no empty slot; actions that run the agent (Run, Send
// back) wait for a Menu part for the model menu (Auto, local first).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Step from '@bella/components/Step/Step';
import ListRow from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import StatCard from '@bella/components/StatCard/StatCard';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import useCached from '../templates/useCached.js';
import { explainer, fix, states, library } from './notAgainFixture.js';

export const STATES = ['suggested', 'running', 'your-call', 'kept', 'gate-fails', 'library'];

/* Stats CHIP does not count yet: Elleta's words (19 Nov 2026), Belfast mode. */
const EMPTY_STATS = [
  { title: 'Runs this week', icon: 'ShieldCheck', tone: 'info', mark: '🔁', empty: 'Nothing counted yet', line: "Not a single run this week. Start one and I'll keep score." },
  { title: 'Kept', icon: 'ShieldCheck', tone: 'success', mark: '✅', empty: 'Nothing kept yet', line: 'Accept a fix and it lands here.' },
];

/* The card's own action, by state, in the card footer at the bottom right
   (Figma's audited fix, 19 Nov). One primary per view (her y28 B, "Accept is
   blue while it waits on you; New fix is white", applied everywhere, Figma
   f8): an action that commits is the view's blue button and the header's New
   task goes white; Stop commits nothing, so New task stays blue. */
const HEAD_ACTION = {
  suggested: { label: 'Run on 9', variant: 'primary' },
  running: { label: 'Stop', variant: 'secondary' },
  'gate-fails': { label: 'Send back', variant: 'primary' },
};
/** States whose card holds the committing action: New fix is white there. */
export const COMMITS = new Set(['suggested', 'gate-fails', 'your-call']);

function Banner({ state }) {
  if (state === 'gate-fails') return null;
  const banner = states[state].banner;
  if (banner) return <Notification tone="success" title={banner.title} message={banner.message} action={{ label: 'Undo' }} />;
  return <Notification tone="info" icon="InfoCircle" title={explainer.title} message={explainer.message(fix.components.length)} />;
}

function FixCard({ state }) {
  const narrow = useNarrow();
  const s = states[state];
  const head = HEAD_ACTION[state];
  return (
    // Figma's audited fix: the card's action sits in its footer, bottom right
    <Card
      footerAction={
        state === 'your-call' ? (
          <Flow direction="row" gap={8} justify="end" wrap>
            <Button variant="secondary">Undo</Button>
            <Button variant="primary">Accept</Button>
          </Flow>
        ) : head ? (
          <Button variant={head.variant} size="sm">
            {head.label}
          </Button>
        ) : undefined
      }
    >
      {/* Figma 782:59605: the head, 8, then the content: the parts line, 16, the steps */}
      <Flow gap={8}>
        <SectionHead icon="Book" iconTone="info" title={`${s.lead}: ${fix.name}${s.after ?? ''}`} description={s.description} />
        <Flow gap={16}>
          {/* the parts as one plain line in the reading face, as Figma's Components text stack */}
          <TextStack body={fix.components.join(', ')} />
          <Flow as="ol" direction={narrow ? 'column' : 'row'} gap={4} aria-label="How the fix runs">
            {s.steps.map((step, i) => (
              <Step
                key={step.title}
                layout={narrow ? 'vertical' : 'horizontal'}
                state={step.state}
                title={step.title}
                detail={step.detail}
                showConnector={i < s.steps.length - 1}
              />
            ))}
          </Flow>
        </Flow>
      </Flow>
    </Card>
  );
}

/* CHIP's run log, this week: how many fixes ran and how many a maintainer
   kept. A run still going, waiting at the end, or stopped is named once. */
const RUNNING = new Set(['starting', 'running', 'gate']);
const STOPPED = new Set(['failed', 'nochange', 'login']);
function useWeek() {
  const { data } = useCached(['/runs']);
  const runs = data?.[0]?.runs ?? [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = runs.filter((r) => new Date(r.startedAt) >= monday);
  const count = (f) => week.filter((r) => f(r.status)).length;
  const last = week.reduce((a, r) => (a && new Date(a) > new Date(r.startedAt) ? a : r.startedAt), null);
  return {
    total: week.length,
    kept: count((x) => x === 'kept'),
    undone: count((x) => x === 'undone'),
    waiting: count((x) => x === 'passed'),
    running: count((x) => RUNNING.has(x)),
    stopped: count((x) => STOPPED.has(x)),
    last,
  };
}

const lastRun = (at) => {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? 'Last run today' : `Last run ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`;
};

function Stats() {
  const w = useWeek();
  /* No run this week: the stat card shows the Empty state, not a number.
     StatCard has no empty slot (library gap), so the card body holds its
     head and the Empty state. Neutral, no wash (one page, one colour). */
  if (w.total === 0)
    return EMPTY_STATS.map((e) => (
      <Flow key={e.title} span={6} fill>
        <Card>
          <Flow gap={8}>
            <SectionHead size="card" icon={e.icon} iconTone={e.tone} title={e.title} titleLevel={3} />
            <EmptyState size="lane" mark={e.mark} title={e.empty} line={e.line} />
          </Flow>
        </Card>
      </Flow>
    ));
  // Figma names the one thing besides undone: running, else stopped, else waiting
  const besides = w.running ? `${w.running} running` : w.stopped ? `${w.stopped} stopped` : `${w.waiting} waiting on a maintainer`;
  return (
    <>
      <Flow span={6} fill>
        <StatCard icon="ShieldCheck" tone="info" title="Runs this week" value={w.total} context="Fixes run since Monday" caption={lastRun(w.last)} href="#/history" />
      </Flow>
      <Flow span={6} fill>
        <StatCard
          icon="ShieldCheck"
          tone="success"
          title="Kept"
          value={w.kept}
          unit={`of ${w.total}`}
          meter={w.kept ? { fill: Math.round((w.kept / w.total) * 100), valueText: `${w.kept} of ${w.total}` } : undefined}
          context={`${w.undone} undone · ${besides}`}
          caption="Undone runs stay in History"
          href="#/history"
        />
      </Flow>
    </>
  );
}

function Library() {
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="Book" iconTone="info" title="Library" description="Fixes saved as steps" number={library.length} words="fixes" />
        <Flow as="ul" gap={8} aria-label="Saved fixes">
          {library.map((f) => (
            <ListRow
              key={f.name}
              layout="stacked"
              title={f.name}
              description={f.when}
              actionButton={
                <Button variant="secondary" ariaLabel={`Run ${f.name}`}>
                  Run
                </Button>
              }
            />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

export default function NotAgainContent({ state = 'suggested' }) {
  if (state === 'library') return <Library />;
  if (!states[state]) return null;
  return (
    <>
      <Banner state={state} />
      <FixCard state={state} />
      <Stats />
    </>
  );
}
