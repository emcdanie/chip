// Not again · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:73919). One component, Figma's states as a prop: suggested, running,
// your call, kept, gate fails, library. Built from BELLA parts and the
// template's Flow only; no page CSS.
//
// Built so far: "suggested". The other five states follow.
// Icon gap: Figma's stat cards use Iconoir shield-check, not in BELLA's
// registry yet; RefreshDouble and CheckCircle stand in until it is added.
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Tag from '@bella/components/Tag/Tag';
import Step from '@bella/components/Step/Step';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import { explainer, suggestion } from './notAgainFixture.js';

/* Stats CHIP does not count yet: Elleta's words (19 Nov 2026), Belfast mode. */
const EMPTY_STATS = [
  { title: 'Runs this week', icon: 'RefreshDouble', tone: 'info', mark: '🔁', empty: 'Nothing counted yet', line: "Not a single run this week. Start one and I'll keep score." },
  { title: 'Kept', icon: 'CheckCircle', tone: 'success', mark: '✅', empty: 'Nothing kept yet', line: 'Accept a fix and it lands here.' },
];

function Suggested() {
  const narrow = useNarrow();
  return (
    <>
      <Notification tone="info" icon="InfoCircle" title={explainer.title} message={explainer.message} />
      <Card>
        <Flow gap={24}>
          <SectionHead
            icon="Book"
            iconTone="info"
            title={suggestion.title}
            description={suggestion.description}
            action={
              <Button variant="primary" size="sm">
                {suggestion.action}
              </Button>
            }
          />
          <Flow as="ul" direction="row" gap={8} wrap aria-label="Components with no declared pair">
            {suggestion.components.map((c) => (
              <li key={c}>
                <Tag variant="flat">{c}</Tag>
              </li>
            ))}
          </Flow>
          <Flow as="ol" direction={narrow ? 'column' : 'row'} gap={4} aria-label="How the fix runs">
            {suggestion.steps.map((s, i) => (
              <Step
                key={s.title}
                layout={narrow ? 'vertical' : 'horizontal'}
                state="pending"
                title={s.title}
                detail={s.detail}
                showConnector={i < suggestion.steps.length - 1}
              />
            ))}
          </Flow>
        </Flow>
      </Card>
      {/* No data yet: the stat card shows the Empty state, not a number.
          StatCard has no empty slot (library gap), so the card body holds
          its head and the Empty state. Neutral, no wash (one page, one colour). */}
      {EMPTY_STATS.map((e) => (
        <Flow key={e.title} span={6} fill>
          <Card>
            <Flow gap={8}>
              <SectionHead icon={e.icon} iconTone={e.tone} title={e.title} titleLevel={3} />
              <EmptyState size="lane" mark={e.mark} title={e.empty} line={e.line} />
            </Flow>
          </Card>
        </Flow>
      ))}
    </>
  );
}

export default function NotAgainContent({ state = 'suggested' }) {
  if (state === 'suggested') return <Suggested />;
  return null;
}
