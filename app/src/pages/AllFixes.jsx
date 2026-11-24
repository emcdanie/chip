// All fixes (her review, 24 Nov: "See all the fixes takes me to the Button page"; "38 parts need work: where is the
// overview of all parts, what each needs, and bulk edit, so I don't go part by part?"). Every part that needs work,
// grouped by the fix it needs, read from the same component checks as the list and Health (one source); pick some or
// all, then one plan for everything picked (planRun: nothing runs until the plan is approved). Nothing leaves CHIP.
import { useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow from '@bella/components/ListRow/ListRow';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import { planRun } from '../templates/RunPlan.jsx';

const VERB = { story: 'Add a story', docs: 'Add a doc page', contract: 'Match the contract to the code', dsds: 'Add a spec entry', contrast: 'Declare a contrast pair', a11y: 'Add an a11y note' };
const ORDER = ['contract', 'a11y', 'contrast', 'story', 'docs', 'dsds'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** model: the Components model (parts with their checks). onBack(): back to the part page. */
export default function AllFixes({ model, onBack }) {
  // one fix = one part's failing check, keyed part:check
  const groups = useMemo(() => {
    const out = {};
    for (const p of model.parts) for (const c of p.checks) if (!c.ok) (out[c.id] ??= []).push({ key: `${p.id}:${c.id}`, part: p, check: c });
    return ORDER.filter((k) => out[k]).map((k) => ({ id: k, verb: VERB[k] ?? k, fixes: out[k].sort((a, b) => a.part.name.localeCompare(b.part.name)) }));
  }, [model]);
  const all = groups.flatMap((g) => g.fixes);
  const parts = new Set(all.map((f) => f.part.id)).size;
  const [picked, setPicked] = useState(() => new Set());
  const [opened, setOpened] = useState(() => groups[0]?.id ?? null);
  const toggle = (keys, on) => setPicked((was) => {
    const next = new Set(was);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    return next;
  });
  const send = () => {
    const chosen = all.filter((f) => picked.has(f.key));
    const steps = groups
      .map((g) => ({ g, list: g.fixes.filter((f) => picked.has(f.key)) }))
      .filter((x) => x.list.length)
      .map(({ g, list }) => ({ id: g.id, title: `${g.verb}: ${list.map((f) => f.part.name).join(', ')}`, line: `${plural(list.length, 'part')}` }));
    const brief = ['Fix these BELLA parts, one step per kind of fix. Change only what each step names; ask before changing a token.', ...steps.map((s, i) => `${i + 1}. ${s.title}`)].join('\n');
    planRun({ title: `Fix ${plural(new Set(chosen.map((f) => f.part.id)).size, 'part')}`, from: 'Components · All fixes', brief, steps, subtitle: `${plural(chosen.length, 'fix')}, from CHIP's component checks`, summary: `${plural(chosen.length, 'fix')} · one plan` }).catch(() => {});
  };
  if (!all.length) return <EmptyState size="lane" mark="✅" title="Nothing to fix" line="Every part passes its checks." />;
  return (
    <Flow gap={24}>
      <Card>
        <Flow gap={16}>
          <SectionHead title="All fixes" titleLevel={2} number={all.length} words={`fixes across ${plural(parts, 'part')} that need work`} action={onBack ? <Button variant="tertiary" size="sm" onClick={onBack}>Back to the part</Button> : undefined} />
          <TextStack body="Pick some or all, then one plan for everything picked. Nothing runs until you approve the plan." />
          <Flow direction="row" gap={8} wrap align="center" justify="end">
            <Button variant="secondary" size="sm" onClick={() => toggle(all.map((f) => f.key), picked.size !== all.length)}>{picked.size === all.length ? 'Clear all' : `Pick all ${all.length}`}</Button>
            <Button variant="primary" disabled={!picked.size} onClick={send}>{picked.size ? `Send all · ${picked.size}` : 'Send all'}</Button>
          </Flow>
        </Flow>
      </Card>
      <Card>
        <Flow gap={0}>
          {groups.map((g) => {
            const keys = g.fixes.map((f) => f.key);
            const n = keys.filter((k) => picked.has(k)).length;
            return (
              <Disclosure key={g.id} title={g.verb} summary={n ? `${n} of ${g.fixes.length} picked` : plural(g.fixes.length, 'part')} open={opened === g.id} onToggle={(on) => setOpened(on ? g.id : null)}>
                <Flow gap={8}>
                  <Flow direction="row" justify="end">
                    <Button variant="tertiary" size="sm" onClick={() => toggle(keys, n !== keys.length)}>{n === keys.length ? 'Clear these' : `Pick these ${keys.length}`}</Button>
                  </Flow>
                  <Flow as="ul" gap={0} aria-label={`${g.verb}: ${plural(g.fixes.length, 'part')}`}>
                    {g.fixes.map((f) => {
                      const on = picked.has(f.key);
                      return (
                        <ListRow
                          key={f.key}
                          layout="inline"
                          title={f.part.name}
                          description={f.check.words}
                          selected={on}
                          switch={<FilterChip pressed={on} ariaLabel={`Pick: ${g.verb} for ${f.part.name}`} onClick={() => toggle([f.key], !on)}>{on ? 'Picked' : 'Pick'}</FilterChip>}
                        />
                      );
                    })}
                  </Flow>
                </Flow>
              </Disclosure>
            );
          })}
        </Flow>
      </Card>
    </Flow>
  );
}
