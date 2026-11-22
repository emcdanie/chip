// New › Task: the jobs she repeats, each with its target read from CHIP's own data right now
// (gaps, drift, audits, the marks, BELLA's tags). Read only; nothing here starts a run.
// Every start ends in the plan sheet (app/src/templates/RunPlan.jsx) before anything runs.
import { execFileSync } from 'node:child_process';

const names = (o) => Object.keys(o ?? {});
const list = (a, n = 4) => (a.length ? a.slice(0, n).join(', ') + (a.length > n ? ` and ${a.length - n} more` : '') : '');
const sentence = (what, a, n) => (a.length ? `${what}: ${list(a, n)}` : null);

function sinceTag(dir) {
  try {
    const run = (...a) => execFileSync('git', a, { cwd: dir, timeout: 4000, encoding: 'utf8' }).trim();
    const tag = run('describe', '--tags', '--abbrev=0');
    const n = Number(run('rev-list', '--count', `${tag}..HEAD`));
    return { tag, n };
  } catch {
    return null;
  }
}

/** { groups: [{ name, tone, jobs: [...] }] }. A job: { id, title, line, target: { text, items }|null, why, brief, steps }.
 *  target.text is null when CHIP has nothing measured for it ("Not measured"); items are the parts or audits it covers. */
export function startJobs({ gaps, drift, audits, marks, bellaDir, bellaVersion }) {
  const g = gaps?.gaps ?? {};
  const story = names(g.story);
  const a11y = names(g.a11y);
  const contract = names(g.contract);
  const contrast = names(g.contrast);
  const drifting = (drift?.parts ?? []).filter((p) => p.differ > 0).map((p) => p.name);
  const notRun = (audits ?? []).filter((a) => !a.ran);
  const oldest = [...(audits ?? [])].filter((a) => a.ran).sort((a, b) => String(a.ran).localeCompare(String(b.ran)))[0];
  const tagged = sinceTag(bellaDir);
  const t = (text, items = []) => ({ text, items });
  const job = (id, title, line, target, brief, steps) => ({ id, title, line, target, brief, steps });
  const stepsOf = (...s) => s.map((x, i) => ({ id: `j${i}`, title: x }));
  const fix = (what, items, rule) =>
    items.length
      ? `${what}. Parts: {items}.\n${rule}\nChange only those parts in BELLA's checkout; the gate runs on the copy.`
      : null;

  const groups = [
    {
      name: 'Fix parts',
      hue: 'pink',
      jobs: [
        job('contracts', 'Fix contracts', 'Make a part’s contract match its code.', contract.length ? t(sentence('Contracts behind', contract), contract) : t(null), fix('Match these BELLA parts’ contracts to their code', contract, 'Edit tokens/contracts.json and the spec only.'), stepsOf('Read each contract and its code', 'Change the contract to match what the code does', 'Rebuild the specs')),
        job('contrast', 'Add contrast pair', 'Record the text and ground pairs a part uses.', contrast.length ? t(sentence('No contrast pair', contrast), contrast) : t(null), fix('Add the contrast pairs these BELLA parts are missing', contrast, 'Declare each pair so contrast-pairs.mjs checks it in every theme.'), stepsOf('Find the colours each part draws', 'Declare each pair', 'Run the contrast check')),
        job('stories', 'Add stories', 'One story per variant, so Storybook shows it.', story.length ? t(sentence('No story', story), story) : t(null), fix('Add a Storybook story for each BELLA part that has none', story, 'One story per contract variant, copying the shape of a neighbouring part.'), stepsOf('Read the part’s contract', 'Write one story per variant', 'Render them in the gate’s visual audit')),
        job('drift', 'Fix drift', 'Bring code and Figma back into step.', drifting.length ? t(`${drifting.length} of ${drift?.total ?? '?'} parts drift from Figma`, drifting.slice(0, 8)) : t(null), fix('Close the drift between BELLA code and its Figma spec', drifting.slice(0, 8), 'Where the spec is behind the code, rebuild the spec; where they differ in value, say which side is right before changing.'), stepsOf('Read each part’s differences', 'Rebuild the spec where it is behind', 'List the value differences for you to decide')),
        job('a11y', 'Fill a11y', 'Record verified ratios and behaviour for a part.', a11y.length ? t(`${a11y.length} parts have no a11y record`, a11y.slice(0, 8)) : t(null), fix('Add an a11y record to each BELLA part that has none', a11y.slice(0, 8), 'Record verified ratios and behaviour under $extensions.bella.a11y, dated.'), stepsOf('Measure each part’s ratios and targets', 'Write the dated record', 'Run contrast-pairs')),
      ],
    },
    {
      name: 'Check',
      hue: 'blue',
      jobs: [
        job('audit', 'Run an audit', 'One of the six audits, saved as a report.', notRun.length ? t(`Not yet run: ${notRun.map((a) => a.title).join(', ')}`, notRun.map((a) => a.title)) : oldest ? t(`All six have run; the oldest is ${oldest.title}, ${oldest.ran}`, [oldest.title]) : t(null), notRun.length ? `Run the ${notRun[0].title} audit (${notRun[0].skill}) and save the report under docs/reference/audit/<date>/. Do not change any code.` : oldest ? `Re-run the ${oldest.title} audit (${oldest.skill}) and save the report under docs/reference/audit/<date>/. Do not change any code.` : null, stepsOf('Run the audit skill', 'Save the report with the date', 'Compare with the last score')),
        job('marks', 'Fix what I marked', 'Work through the marks you left on the board.', marks > 0 ? t(`${marks} ${marks === 1 ? 'mark' : 'marks'} waiting`) : t(marks === 0 ? 'No marks waiting' : null), marks > 0 ? 'Work through the marks waiting on the progress board, oldest first. Change only what each mark names; say what you could not do.' : null, stepsOf('Read the marks waiting', 'Change what each one names', 'List what could not be done')),
      ],
    },
    {
      name: 'Ship',
      hue: 'ochre',
      jobs: [
        job('figma', 'Figma catch-up', 'Bring Figma up to what the code now does.', drifting.length ? t(`${drifting.length} parts whose code and Figma differ`, drifting.slice(0, 8)) : t(null), drifting.length ? `List what Figma needs to catch up with the code for these BELLA parts: {items}. Write the list as a note for the parts session; do not edit Figma.` : null, stepsOf('Compare each part’s spec with its code', 'Write the list for the parts session')),
        job('publish', 'Publish a library batch', 'Prepare what a library publish would send.', tagged ? t(`BELLA ${bellaVersion ?? tagged.tag}: ${tagged.n} commits since ${tagged.tag}`) : t(null), tagged ? `Prepare the next library publish for BELLA: list what changed since ${tagged.tag} (${tagged.n} commits), the parts it touches and anything unfinished. Do not publish; the publish is Elleta's click.` : null, stepsOf('List what changed since the last tag', 'Check each part is ready', 'Write the batch for your publish click')),
        job('component', 'New component', 'A new BELLA part, from a spec.', t('Needs a name and a one-line purpose'), null, stepsOf('Write the spec from the prompt', 'Figma part first, then code')),
      ],
    },
  ];
  return { at: new Date().toISOString(), groups };
}
