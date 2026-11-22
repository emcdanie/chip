// The Quality tab's numbers (Components page): accessibility facts as pins, a scorecard of rows against targets,
// and properties and tokens in plain words. Everything is computed on load from what CHIP already reads:
// BELLA's contract (/system-docs/contract/<Name>), the part's snapshot (/data/bella.json), the saved checks
// (/data/checks/*.json), drift and the touch target measured on the live part. Nothing is typed here except the
// plain-word copy of what each accessibility fact means; a number with no source says "Not measured" and is
// left out of the score.

export const BANDS = [
  { id: 'meets', min: 90, label: 'Meets', tone: 'success' },
  { id: 'mostly', min: 70, label: 'Mostly meets', tone: 'attention' },
  { id: 'work', min: 0, label: 'Needs work', tone: 'danger' },
];
export const bandOf = (pct) => BANDS.find((b) => pct >= b.min);

const WEIGHT = { Accessibility: 3, 'Machine readability': 2, 'Stories and parity': 1 };
const num = (s) => Number(s);
const RATIO = /(\d+(?:\.\d+)?):1/g;
const ratiosIn = (text) => [...String(text ?? '').matchAll(RATIO)].map((m) => num(m[1]));
const sentences = (t) => String(t ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
const slug = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/* What each accessibility fact is and why it matters, in plain words (copy, not data). Its numbers come from the part. */
export const A11Y_COPY = {
  focus: { name: 'Focus ring', what: 'A visible ring that shows where the keyboard is.', why: 'Someone using a keyboard must see where they are.', modes: ['focus'], below: true },
  target: { name: 'Touch target', what: 'The area you can press or tap, at least 44 by 44 px.', why: 'Thumbs and shaky hands miss small targets.', modes: ['target'], below: true },
  contrast: { name: 'Label contrast', what: 'How far the words stand out from what is behind them.', why: 'Low contrast makes words vanish in sunlight or for tired eyes.', modes: ['contrast'] },
  role: { name: 'Role and name', what: 'What kind of thing it is and what it is called, for a screen reader.', why: 'A screen reader says the name and the role, so people know what it does.', modes: ['reader'] },
  keys: { name: 'Keyboard', what: 'Which keys reach and use it.', why: 'No mouse, no problem: every action stays reachable.', modes: ['focus', 'reader'] },
  motion: { name: 'Reduced motion', what: 'What it does when the person asks for less movement.', why: 'Moving things can make some people ill.', modes: [], below: true },
  busy: { name: 'Busy state', what: 'Whether it can say that it is working.', why: 'After pressing Save, people need to hear that it is working.', modes: ['reader'], below: true },
};
export const A11Y_MODES = [
  { id: 'all', label: 'All' },
  { id: 'focus', label: 'Focus' },
  { id: 'contrast', label: 'Contrast' },
  { id: 'target', label: 'Target' },
  { id: 'reader', label: 'Reader' },
];

const NATIVE = /^(a button|button|an? anchor|anchor|a link|link|input|a text field|select|a select)\b|\bbutton\b|\banchor\b|\binput\b/i;

/** Parts that start a job, where a busy state matters: they take a press (onClick, href or a submit type). */
const startsAJob = (props) => props.some((p) => /^(onClick|href)$/.test(p));

/**
 * The seven accessibility facts for a part, each with its state (ok | gap | fail | none), the real number and where
 * it came from. A fact that does not apply (busy on a part that starts nothing) is left out.
 *   a11y: the contract's sentence; anatomy: the part's pins with measured contrast; touch: { w, h } from the live part
 *   propNames: every prop the contract lists; rendersAs: the spec's element; minTarget: bella.json's
 */
export function a11yFacts({ a11y, anatomy = [], touch, propNames = [], rendersAs, minTarget }) {
  const text = String(a11y ?? '');
  const sents = sentences(text);
  const out = [];
  const nonInteractive = /non-?interactive|no tab stop/i.test(text);

  // 1 focus ring: the contract's ratios on the focus-ring sentence, against 3:1 for a mark
  const ringSent = sents.filter((s) => /focus/i.test(s) && /ring|outline|edge/i.test(s));
  const ringRatios = ringSent.flatMap(ratiosIn);
  if (nonInteractive) out.push({ id: 'focus', state: 'none', value: null, how: 'Not interactive: it takes no focus.' });
  else if (ringSent.length)
    out.push({ id: 'focus', state: ringRatios.length ? (Math.min(...ringRatios) >= 3 ? 'ok' : 'fail') : 'ok', value: ringRatios.length ? Math.min(...ringRatios) : null, unit: 'to 1', target: 3, targetUnit: ':1', how: ringRatios.length ? `Weakest ${Math.min(...ringRatios).toFixed(2)}:1 against the page. Needs 3:1 for a mark.` : 'Written in the contract; no ratio to measure.', source: 'contract a11y' });
  else out.push({ id: 'focus', state: 'none', value: null, how: 'The contract says nothing about the focus ring.' });

  // 2 touch target: live part first, then BELLA's own number
  const live = touch ? Math.min(touch.w, touch.h) : null;
  const tgt = live ?? (Number(minTarget) || null);
  if (nonInteractive) out.push({ id: 'target', state: 'none', value: null, how: 'Not interactive: nothing to press.' });
  else if (tgt != null) out.push({ id: 'target', state: tgt >= 44 ? 'ok' : 'fail', value: tgt, unit: 'px', target: 44, targetUnit: 'px', how: live != null ? `${touch.w} by ${touch.h} px measured on the live part. Needs 44.` : `${tgt} px, from the part's contract. Needs 44.`, source: live != null ? 'measured on the live part' : 'bella.json' });
  else out.push({ id: 'target', state: 'none', value: null, how: 'No live sample to measure.' });

  // 3 label contrast: the weakest measured pair of the part's own parts, else the contract's text ratios, against 7:1
  const pairs = anatomy.filter((a) => a.contrast).map((a) => ({ title: a.title, ratio: a.contrast.ratio, bar: a.contrast.bar }));
  const weakest = pairs.sort((p, q) => p.ratio / p.bar - q.ratio / q.bar)[0];
  const textRatios = sents.filter((s) => /label|text|field|placeholder/i.test(s)).flatMap(ratiosIn);
  if (weakest) out.push({ id: 'contrast', state: weakest.ratio >= weakest.bar ? 'ok' : 'fail', value: weakest.ratio, unit: 'to 1', target: weakest.bar, targetUnit: ':1', how: `Weakest of ${pairs.length} pairs: ${weakest.title}, ${weakest.ratio.toFixed(2)}:1. Needs ${weakest.bar}:1.`, source: 'BELLA contrast pairs' });
  else if (textRatios.length) out.push({ id: 'contrast', state: Math.min(...textRatios) >= 7 ? 'ok' : 'fail', value: Math.min(...textRatios), unit: 'to 1', target: 7, targetUnit: ':1', how: `Weakest text ratio in the contract: ${Math.min(...textRatios).toFixed(2)}:1. Needs 7:1.`, source: 'contract a11y' });
  else out.push({ id: 'contrast', state: 'none', value: null, how: 'No contrast pair is declared for this part.' });

  // 4 role and name
  const role = rendersAs ? String(rendersAs).replace(/^an? /, '') : null;
  if (role || /aria|label|name|role/i.test(text)) out.push({ id: 'role', state: 'ok', value: role ? role.split(',')[0] : 'named', unit: 'role', how: `${role ? `Renders as ${rendersAs}. ` : ''}${sents.find((s) => /aria|name/i.test(s)) ? 'The contract says how it is named.' : 'Named by its visible text.'}`, source: 'spec and contract' });
  else out.push({ id: 'role', state: 'none', value: null, how: 'The spec does not say what it renders as.' });

  // 5 keyboard
  if (nonInteractive) out.push({ id: 'keys', state: 'none', value: null, how: 'Not interactive: no tab stop.' });
  else if (rendersAs && NATIVE.test(String(rendersAs))) out.push({ id: 'keys', state: 'ok', value: 'native', unit: 'keys', how: `It renders as ${rendersAs}, so the browser supplies the keys.`, source: 'spec' });
  else if (/keyboard|tab stop|enter|arrow|focus/i.test(text)) out.push({ id: 'keys', state: 'ok', value: 'in contract', unit: 'keys', how: 'The contract names the keys.', source: 'contract a11y' });
  else out.push({ id: 'keys', state: 'none', value: null, how: 'No keyboard behaviour is written down.' });

  // 6 reduced motion
  if (/reduced.?motion/i.test(text)) out.push({ id: 'motion', state: 'ok', value: 'covered', unit: 'motion', how: 'The contract says it holds still. Written, not measured: no number exists.', source: 'contract a11y' });
  else out.push({ id: 'motion', state: 'none', value: null, how: 'The contract does not mention reduced motion.' });

  // 7 busy: only where a press starts a job
  if (startsAJob(propNames) && !nonInteractive) {
    const has = propNames.some((p) => /^(busy|ariaBusy)$/.test(p));
    out.push({ id: 'busy', state: has ? 'ok' : 'gap', value: has ? 'busy' : 'none', unit: 'aria-busy', how: has ? 'A busy prop exists in the code and the contract.' : 'No busy prop in the contract. A gap in BELLA.', source: 'contract props' });
  }
  return out.map((f) => ({ ...A11Y_COPY[f.id], ...f }));
}

/** The facts as the stage's pins: numbered, each named by its own fact, set top or bottom by what it is. */
export function a11yPins(facts) {
  return facts.map((f, i) => ({ key: f.id, n: i + 1, title: f.name, kind: f.below ? 'edge' : 'a11y', status: f.state === 'ok' ? 'pass' : f.state === 'none' ? 'none' : 'finding', detail: f.what, modes: f.modes }));
}

/**
 * The scorecard. rows: area, id, title, state (ok | gap | fail | none), value + unit + target (for the bar), line (detail).
 * Score: each measured row counts its area's weight; ok earns it, gap and fail earn nothing; none is left out.
 */
export function scorecard({ facts, part, contract, visual, contractCheck, drift, stories }) {
  const rows = facts.map((f) => ({
    area: 'Accessibility',
    id: `a11y-${f.id}`,
    title: f.name,
    state: f.state,
    value: f.value,
    unit: f.unit ?? '',
    target: f.target ?? null,
    targetUnit: f.targetUnit ?? '',
    line: f.how,
    source: f.source ?? null,
  }));
  const c = part.checks.reduce((m, k) => ({ ...m, [k.id]: k }), {});
  const nProps = contract?.props?.length ?? part.doc.props.length;
  const status = contract?.status;
  const missingFromSpec = (contract?.status?.behind ?? []).filter((b) => /in the code, not in the spec/.test(b)).length;
  rows.push(
    {
      area: 'Machine readability',
      id: 'contract',
      title: 'Contract',
      state: c.contract?.ok ? 'ok' : 'gap',
      value: nProps,
      unit: nProps === 1 ? 'prop' : 'props',
      target: nProps || 1,
      line: c.contract?.ok ? `Found in BELLA's contract: ${nProps} props, ${contract?.states?.contract?.length ?? part.states.length} states, ${(contract?.contract?.dont ?? part.doc.dont).length} don'ts.` : c.contract?.words ?? 'No contract.',
    },
    {
      area: 'Machine readability',
      id: 'spec',
      title: 'Spec',
      state: !c.dsds?.ok ? 'gap' : status?.state === 'behind' ? 'gap' : 'ok',
      value: c.dsds?.ok ? nProps : 0,
      unit: `of ${nProps + missingFromSpec} props`,
      target: nProps + missingFromSpec || 1,
      line: !c.dsds?.ok ? c.dsds?.words ?? 'No spec.' : status?.state === 'behind' ? `The spec is behind the code by ${status.behind.length}: ${status.behind.slice(0, 3).map((b) => b.split(':')[0]).join(', ')}${status.behind.length > 3 ? ' and more' : ''}.` : 'The spec lists every prop the code exports.',
    },
    { area: 'Machine readability', id: 'story', title: 'Story', state: c.story?.ok ? 'ok' : 'gap', value: c.story?.ok ? 1 : 0, unit: 'of 1', target: 1, line: c.story?.ok ? `${part.name} has a story in Storybook.` : 'No story yet.' },
    { area: 'Machine readability', id: 'docs', title: 'Doc page', state: c.docs?.ok ? 'ok' : 'gap', value: c.docs?.ok ? 1 : 0, unit: 'of 1', target: 1, line: c.docs?.ok ? `${part.name} has a doc page.` : 'No doc page yet.' },
  );
  // stories and parity, from the saved checks
  const suite = visual?.suites?.[`src/components/${part.name}/${part.name}.stories.tsx`];
  rows.push(
    suite
      ? { area: 'Stories and parity', id: 'visual', title: 'Stories and snapshots', state: suite === 'pass' ? 'ok' : 'fail', value: suite === 'pass' ? 1 : 0, unit: 'of 1 suite', target: 1, line: `The ${part.name} story suite ${suite === 'pass' ? 'passes' : 'fails'} (axe, interactions and snapshots in four themes). Whole run: ${visual.summary}.`, source: visual.ranAt }
      : { area: 'Stories and parity', id: 'visual', title: 'Stories and snapshots', state: 'none', value: null, unit: '', line: 'The last story run has no suite for this part.' },
  );
  const checked = String(contractCheck?.log ?? '').match(/checked (.+?)(?:\n|$)/)?.[1]?.split(/,\s*/) ?? [];
  rows.push(
    checked.length
      ? { area: 'Stories and parity', id: 'parity-code', title: 'Code parity', state: checked.includes(slug(part.name)) ? (contractCheck.ok ? 'ok' : 'fail') : 'none', value: checked.includes(slug(part.name)) ? 1 : null, unit: 'of 1', target: 1, line: checked.includes(slug(part.name)) ? (contractCheck.ok ? 'Its contract matches the code (contract parity).' : 'Its contract differs from the code.') : 'Contract parity did not check this part.', source: contractCheck.ranAt }
      : { area: 'Stories and parity', id: 'parity-code', title: 'Code parity', state: 'none', value: null, unit: '', line: 'Contract parity has not run.' },
  );
  const d = drift?.parts?.find((x) => x.name === part.name);
  rows.push(
    d?.compared
      ? { area: 'Stories and parity', id: 'parity-figma', title: 'Figma parity', state: d.differ ? 'gap' : 'ok', value: d.differ ? 0 : 1, unit: d.differ ? `${d.differ} differ` : 'of 1', target: 1, line: d.differ ? `${d.differ} fields differ between Figma and the code.` : 'Figma and the code agree.', source: drift.at }
      : { area: 'Stories and parity', id: 'parity-figma', title: 'Figma parity', state: 'none', value: null, unit: '', line: 'Not measured: this part has no Figma read in its spec.' },
  );
  const measured = rows.filter((r) => r.state !== 'none');
  const total = measured.reduce((t, r) => t + WEIGHT[r.area], 0);
  const got = measured.reduce((t, r) => t + (r.state === 'ok' ? WEIGHT[r.area] : 0), 0);
  const pct = total ? Math.round((100 * got) / total) : null;
  const gaps = measured.filter((r) => r.state !== 'ok');
  return { rows, pct, band: pct == null ? null : bandOf(pct), measured: measured.length, unmeasured: rows.length - measured.length, gaps, areas: Object.keys(WEIGHT) };
}

/** Where a row's bar ends and where its target sits, both 0 to 100 on one scale that starts at zero. */
export function barOf(row) {
  if (row.state === 'none' || row.value == null || typeof row.value !== 'number') return { fill: row.state === 'ok' ? 100 : 0, target: row.state === 'none' ? null : 100 };
  if (row.targetUnit === ':1') return { fill: Math.min(100, (row.value / 21) * 100), target: (row.target / 21) * 100 };
  const top = Math.max(row.value, row.target ?? 0) * 1.25 || 1;
  return { fill: Math.min(100, (row.value / top) * 100), target: row.target != null ? (row.target / top) * 100 : null };
}

/* ---------- C: Read it ---------- */
const FAMILY = [
  [/^--color-border-focus/, 'The colour of the focus ring.'],
  [/^--color-(background|content|border)/, (t) => `A colour for ${t.match(/^--color-(background|content|border)/)[1] === 'background' ? 'a fill' : t.match(/^--color-(background|content|border)/)[1] === 'content' ? 'text or an icon' : 'a line'}.`],
  [/^--focus-ring/, 'The focus ring, drawn only for keyboard focus.'],
  [/^--spacing-/, 'A space: padding, a gap or a minimum size.'],
  [/^--size-/, 'A fixed size.'],
  [/^--border-radius/, 'How round a corner is.'],
  [/^--border-width/, 'How thick a line is.'],
  [/^--typography-font-weight/, 'How heavy the letters are.'],
  [/^--typography-/, 'A type setting: size, line height, family or spacing.'],
  [/^--motion-duration/, 'How long a movement lasts.'],
  [/^--motion-easing/, 'How a movement speeds up and slows down.'],
  [/^--shadow/, 'The shadow under it.'],
  [/^--(\w+)-color-/, 'A colour this part owns.'],
];
const plainToken = (t) => {
  for (const [re, say] of FAMILY) if (re.test(t)) return typeof say === 'function' ? say(t) : say;
  return 'A design token this part reads.';
};
const firstSentence = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/`/g, '').trim().match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? String(s ?? '').trim();
const groupOf = (name) => (/^aria/.test(name) ? 'Accessibility' : /^(on[A-Z]|href|type|disabled|busy|name|id|value|required|autoComplete|linkComponent|multiline|placeholder)/.test(name) ? 'Behaviour' : 'Look');

/**
 * The properties and tokens as groups of { name, say, exact }: the contract's own sentence for a prop, a plain
 * line for a token and its value as the page resolves it (read: token name -> value, from the page's styles).
 */
export function readGroups({ contract, tokens = [], read = () => null }) {
  const groups = { Look: [], Behaviour: [], Accessibility: [], Slots: [], 'Tokens used': [] };
  for (const p of contract?.props ?? []) {
    const exact = p.values?.length ? `${p.values.join(' · ')}${p.default != null ? `  (default ${p.default})` : ''}` : `${p.type}${p.default != null ? `  (default ${p.default})` : ''}`;
    groups[groupOf(p.name)].push({ name: p.name, say: firstSentence(p.says) || 'No sentence in the contract yet.', exact });
  }
  for (const p of contract?.slots ?? []) groups.Slots.push({ name: p.name, say: firstSentence(p.says) || 'A place for content.', exact: p.type });
  for (const t of tokens) groups['Tokens used'].push({ name: t, say: plainToken(t), exact: read(t) ?? t });
  const hue = { Look: 'pink', Behaviour: 'navy', Accessibility: 'ochre', Slots: 'blue', 'Tokens used': 'stone' };
  return Object.entries(groups).filter(([, items]) => items.length).map(([name, items]) => ({ name, hue: hue[name], items }));
}

/** Groups narrowed to a search; a group with no match is left out. */
export function searchGroups(groups, q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return groups;
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => `${i.name} ${i.say} ${i.exact}`.toLowerCase().includes(s)) })).filter((g) => g.items.length);
}

/** The exact data behind the rows, as text, for the raw view. */
export const rawText = (contract, tokens) => JSON.stringify({ props: contract?.props ?? [], slots: contract?.slots ?? [], variants: contract?.variants ?? [], states: contract?.states ?? {}, a11y: contract?.contract?.a11y ?? null, tokens }, null, 2);
