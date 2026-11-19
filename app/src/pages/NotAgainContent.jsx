// Not again · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:73919). One component, Figma's six states as a prop: suggested,
// running, your-call, kept, gate-fails, library. Built from BELLA parts and
// the template's Flow only; no page CSS.
//
// Gaps (library board): Figma's stat cards use Iconoir shield-check, not in
// BELLA's registry yet (RefreshDouble and CheckCircle stand in); StatCard has
// no empty slot; actions that run the agent (Run, Send back) wait for a Menu
// part for the model menu (Auto, local first).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Step from '@bella/components/Step/Step';
import ListRow from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
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
   fix goes white; Stop commits nothing, so New fix stays blue. */
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
            <Button variant="secondary" size="sm">
              Undo
            </Button>
            <Button variant="primary" size="sm">
              Accept
            </Button>
          </Flow>
        ) : head ? (
          <Button variant={head.variant} size="sm">
            {head.label}
          </Button>
        ) : undefined
      }
    >
      <Flow gap={24}>
        <SectionHead icon="Book" iconTone="info" title={`${s.lead}: ${fix.name}`} description={s.description} />
        {/* Figma (b10): the components as one plain Geist Mono line, not tags */}
        <TextStack subtitle={fix.components.join(', ')} />
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
    </Card>
  );
}

function Stats() {
  /* No data yet: the stat card shows the Empty state, not a number.
     StatCard has no empty slot (library gap), so the card body holds its
     head and the Empty state. Neutral, no wash (one page, one colour). */
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
                <Button variant="secondary" size="sm" ariaLabel={`Run ${f.name}`}>
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
