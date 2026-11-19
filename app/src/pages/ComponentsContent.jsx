// Components · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:57549), on CHIP's own data. Built: default, needs work (the filter),
// part selected, no match. Figma states still to build: picker open as a
// grouped list, sent to the agent, back for review, accepted, on the stage.
// BELLA parts and Flow only; the specimen is the live BELLA part.
//
// Gaps (parts-dev): Anatomy pins drawn over the specimen with leaders (no
// Anatomy overlay part); Figma's "Figma" check has no CHIP data, so the
// sixth check is DSDS, as on Health.
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import CheckRow from '@bella/components/CheckRow/CheckRow';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import TextStack from '@bella/components/TextStack/TextStack';
import Select from '@bella/components/Select/Select';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Heading from '@bella/components/Heading/Heading';
import Pin from '@bella/components/Pin/Pin';
import Tag from '@bella/components/Tag/Tag';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import { SPECIMENS } from '../specimens.jsx';

export const FILTERS = ['all', 'needs', 'ready'];

export default function ComponentsContent({ model, filter = 'all', onFilter, partId, onPart }) {
  const narrow = useNarrow();
  // The three-way filter needs about 240px; on the smallest phones it is a Select.
  const tiny = useNarrow(420);
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Fetching every part and its checks." />;
  const shown = model.parts.filter((p) => (filter === 'ready' ? p.ready : filter === 'needs' ? !p.ready : true));
  const part = shown.find((p) => p.id === partId) ?? shown[0];
  const n = model.parts.length;
  const options = [
    { value: 'all', label: `All ${n}` },
    { value: 'needs', label: `Needs work ${n - model.ready}` },
    { value: 'ready', label: `Ready ${model.ready}` },
  ];
  const Specimen = part ? SPECIMENS[part.name] : null;
  return (
    <>
      {/* Control bar: what you look at on the left, the filter on the right. */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        {shown.length ? (
          <Select label="Part" value={part.id} onChange={onPart} options={shown.map((p) => ({ value: p.id, label: `${p.category} › ${p.name}` }))} />
        ) : null}
        {tiny ? (
          <Select label="Show" value={filter} onChange={onFilter} options={options} />
        ) : (
          <SegmentedControl options={options} value={filter} onChange={onFilter} label="Filter parts" />
        )}
      </Flow>
      {!part ? (
        <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No part fits that filter. Try All." />
      ) : (
        <>
          <Card>
            <Flow direction="row" gap={16} wrap justify="between" align="center">
              <Flow gap={4}>
                <Flow direction="row" gap={12} align="center">
                  <Heading tier="subsection" as="h2">{part.name}</Heading>
                  <StatusDot tone="success" label="Live" />
                </Flow>
                {model.version ? <TextStack subtitle={model.version} /> : null}
              </Flow>
              <Tag tone={part.ready ? 'success' : 'attention'}>{`${part.pass} of ${part.checks.length} checks pass`}</Tag>
            </Flow>
          </Card>
          <Card>
            <Flow gap={24}>
              <SectionHead icon="ViewGrid" iconTone="info" title="Anatomy" description={`The parts of ${part.name}`} number={part.anatomy.length || undefined} words={part.anatomy.length ? 'parts' : undefined} />
              {part.anatomy.length ? (
                <Flow direction={narrow ? 'column' : 'row'} gap={24} equal={!narrow}>
                  <Flow align="center" justify="between">{Specimen ? <Specimen /> : <EmptyState size="lane" mark="🖼️" title="No specimen yet" line="This part has no live example to show." />}</Flow>
                  <Flow as="ol" gap={16} aria-label={`Parts of ${part.name}`}>
                    {part.anatomy.map((a) => (
                      <li key={a.key}>
                        <Flow direction="row" gap={12}>
                          <Pin number={a.n} variant="yellow" pinStyle="solid" />
                          {/* Figma: the part's detail is a sentence, in the reading face */}
                          <TextStack title={a.title} body={a.detail} />
                        </Flow>
                      </li>
                    ))}
                  </Flow>
                </Flow>
              ) : (
                // no parts in the contract: the live part still shows, the empty note beside it
                <Flow direction={narrow ? 'column' : 'row'} gap={24} equal={!narrow}>
                  {Specimen ? <Flow align="center" justify="between"><Specimen /></Flow> : null}
                  <EmptyState size="lane" mark="🦴" title="No anatomy written yet" line={`${part.name}'s contract doesn't list its parts. Add them and they show up here.`} />
                </Flow>
              )}
            </Flow>
          </Card>
          <Card>
            <Flow gap={24}>
              <SectionHead icon="CheckCircle" iconTone={part.ready ? 'success' : 'warning'} title={`Checks for ${part.name}`} description="Six checks the gate runs" number={part.pass} words={`of ${part.checks.length} pass · target all`} />
              <Flow gap={16}>
                {[0, 2, 4].map((i) => (
                  <Flow key={i} direction={narrow ? 'column' : 'row'} gap={24} equal>
                    {part.checks.slice(i, i + 2).map((k) => (
                      <CheckRow key={k.id} as="div" status={k.ok ? 'pass' : 'fail'} title={k.title} subtitle={k.line} value={k.ok ? '1/1' : '0/1'} fill={k.ok ? 100 : 0} target={100} actionLabel={k.ok ? undefined : k.action} />
                    ))}
                  </Flow>
                ))}
              </Flow>
            </Flow>
          </Card>
        </>
      )}
    </>
  );
}
