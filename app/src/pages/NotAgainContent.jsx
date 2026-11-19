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
import StatCard from '@bella/components/StatCard/StatCard';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import { explainer, suggestion } from './notAgainFixture.js';

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
          <Flow as="ol" direction={narrow ? 'column' : 'row'} gap={4} aria-label="How the playbook runs">
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
      <Flow span={6}>
        <StatCard icon="RefreshDouble" tone="info" title="Runs this week" value="Not measured" caption="CHIP does not count playbook runs yet" />
      </Flow>
      <Flow span={6}>
        <StatCard icon="CheckCircle" tone="success" title="Kept" value="Not measured" caption="Undone runs stay in History" />
      </Flow>
    </>
  );
}

export default function NotAgainContent({ state = 'suggested' }) {
  if (state === 'suggested') return <Suggested />;
  return null;
}
