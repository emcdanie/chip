// The reading views behind System > Docs and each part's Contract (Elleta, 23 Nov: "where can we see all the docs behind the
// system"). One reading drawer; a doc's headings become groups (the branch-row look, one Disclosure per group), its tables
// become rows, its code a CodeBlock, and nothing is raw markdown or pipes. A part's contract is rows too: a plain sentence
// for each, the exact value in Geist Mono (ListRow's value slot). Everything is read from /system-docs, which reads the files.
//
// BELLA GAP, named: ReadingGroups (templates/ReadingDrawer.jsx) has no `value` slot for the exact value, and a doc group
// holds prose and code as well as rows, so Groups below stands in with the same Disclosure and statusBar look. Fold it
// into ReadingGroups (a `value` on an item, a `children` on a group) once the drawer template is committed.
import { useState } from 'react';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Tag from '@bella/components/Tag/Tag';
import Button from '@bella/components/Button/Button';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import TextStack from '@bella/components/TextStack/TextStack';
import Drawer from '@bella/components/Drawer/Drawer';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Card from '@bella/components/Card/Card';
import Flow from '../templates/Flow.jsx';
import Keyed from '../templates/Keyed.jsx';
import ReadingDrawer, { Inset } from '../templates/ReadingDrawer.jsx';
import useCached from '../templates/useCached.js';
import { planRun } from '../templates/RunPlan.jsx';

export const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
export const size = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const LANG = { js: 'javascript', javascript: 'javascript', jsx: 'jsx', tsx: 'tsx', ts: 'tsx', json: 'json', css: 'css', html: 'markup', diff: 'diff' };

/** Groups of rows or prose: a Disclosure each, the first open. A group's content mounts only while it is open. */
function Groups({ groups, label, openFirst = true }) {
  const shown = groups.filter((g) => g.count > 0);
  const [open, setOpen] = useState(() => (openFirst && shown[0] ? [shown[0].name] : []));
  const toggle = (name, on) => setOpen((was) => (on ? [...was, name] : was.filter((n) => n !== name)));
  return (
    <Flow inset gap={8} role="group" aria-label={label}>
      {shown.map((g) => (
        <Disclosure key={g.name} title={g.name} summary={String(g.count)} open={open.includes(g.name)} onToggle={(on) => toggle(g.name, on)}>
          {open.includes(g.name) ? g.content : null}
        </Disclosure>
      ))}
    </Flow>
  );
}

function Rows({ items, tone = 'neutral', label }) {
  return (
    <ListRowGroup ariaLabel={label}>
      {items.map((it) => (
        <ListRow
          key={it.key ?? it.title}
          layout="stacked"
          statusBar={it.tone ?? tone}
          title={it.title}
          description={it.line}
          value={it.value}
          rightTag={it.state ? <Tag variant="line">{it.state}</Tag> : undefined}
          trailing={it.onClick ? true : undefined}
          onClick={it.onClick}
        />
      ))}
    </ListRowGroup>
  );
}

/* ---------------- a doc ---------------- */
const CAP = 40;
function Table({ block }) {
  const [all, setAll] = useState(false);
  const rows = all ? block.rows : block.rows.slice(0, CAP);
  const items = rows.map((r, i) => ({
    key: i,
    title: r[0] || '·',
    line: r
      .slice(1)
      .map((c, j) => (r.length > 2 && block.head[j + 1] ? `${block.head[j + 1]}: ${c}` : c))
      .filter(Boolean)
      .join(' · '),
  }));
  return (
    <Flow gap={8}>
      <Rows items={items} label={block.head.join(', ')} />
      {block.rows.length > CAP ? (
        <Flow direction="row">
          <Button variant="tertiary" size="sm" ariaExpanded={all} onClick={() => setAll(!all)}>{all ? 'Fewer rows' : `All ${block.rows.length} rows`}</Button>
        </Flow>
      ) : null}
    </Flow>
  );
}

function Block({ b }) {
  if (b.t === 'p') return <TextStack body={<Keyed text={b.text} />} />;
  if (b.t === 'quote') return <TextStack body={b.text} />;
  if (b.t === 'ul' || b.t === 'ol')
    return (
      <Flow as={b.t} gap={8} bullets>
        {b.items.map((x, i) => (
          <li key={i}>
            <TextStack body={<Keyed text={x} />} />
          </li>
        ))}
      </Flow>
    );
  if (b.t === 'table') return <Table block={b} />;
  if (b.t === 'code') return <CodeBlock code={b.text} language={LANG[b.lang] ?? 'plain'} copy />;
  return null;
}

/** A doc's sections: text before the first heading is the lead; every heading is a group. */
export function DocBody({ doc }) {
  const lead = doc.sections.find((s) => !s.title);
  const groups = doc.sections
    .filter((s) => s.title)
    .map((s, i) => ({
      name: s.title,
      count: s.blocks.length,
      content: (
        <Flow inset gap={16}>
          {s.blocks.map((b, j) => (
            <Block key={j} b={b} />
          ))}
        </Flow>
      ),
      key: i,
    }));
  // two headings of the same name would share an open state: tell them apart with their order
  const seen = new Map();
  for (const g of groups) {
    const n = (seen.get(g.name) ?? 0) + 1;
    seen.set(g.name, n);
    if (n > 1) g.name = `${g.name} (${n})`;
  }
  return (
    <>
      {lead?.blocks.length ? (
        <Inset>
          {lead.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </Inset>
      ) : null}
      <Groups groups={groups} label={`${doc.title}, by heading`} />
    </>
  );
}

/** One doc in the reading drawer. A spec opens as its part's contract. */
export function DocDrawer({ id, onClose }) {
  const { data, error } = useCached([`/system-docs/doc?id=${encodeURIComponent(id)}`]);
  const doc = data?.[0];
  const status = doc ? `${doc.kind} · updated ${day(doc.updated)} · ${size(doc.bytes)}` : error ? 'Not found' : 'Reading…';
  return (
    <ReadingDrawer open onClose={onClose} label={doc?.title ?? 'Doc'} status={status}>
      {error ? <Inset><TextStack body="CHIP could not read this doc. It may have moved or been removed." /></Inset> : null}
      {doc?.contract ? <ContractBody c={doc.contract} /> : doc ? <DocBody doc={doc} /> : null}
    </ReadingDrawer>
  );
}

/* ---------------- a part's contract ---------------- */
const STATUS = {
  sync: { word: 'In sync', tone: 'success', line: 'The spec lists the same properties as the code.' },
  behind: { word: 'Behind the code', tone: 'attention', line: 'The spec and the code list different properties.' },
  'no-spec': { word: 'No spec', tone: 'neutral', line: 'No spec is written for this part yet.' },
};
const listOf = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} or ${a.at(-1)}` : a[0] ?? '');
const shortHead = (t, i, word) => {
  const m = String(t).match(/^([^:.]{3,40})[:.]\s+(\S[\s\S]*)$/);
  return m ? { title: cap(m[1]), line: m[2] } : { title: `${word} ${i + 1}`, line: t };
};

/** The contract's groups, as rows: plain sentence, exact value. `onSpec` opens the spec. */
export function contractGroups(c, { onSpec, onStory, onMatch } = {}) {
  const st = STATUS[c.status.state];
  const specRows = [
    { key: 'status', title: 'Spec', state: st.word, tone: st.tone, line: c.status.behind.length ? `${c.status.behind.length} properties differ: ${c.status.behind.slice(0, 4).map((b) => b.split(':')[0]).join(', ')}${c.status.behind.length > 4 ? '…' : ''}.` : st.line },
    ...(c.spec && onSpec ? [{ key: 'open-spec', title: 'Open the spec', line: `${c.spec.path}, read here.`, onClick: onSpec }] : []),
    ...(onStory ? [{ key: 'open-story', title: 'Open the story', line: 'The part as BELLA’s Storybook shows it, in this drawer.', onClick: onStory }] : []),
    ...(c.status.state === 'behind' && onMatch ? [{ key: 'match', title: 'Match the contract to the code', line: 'Opens a plan first; nothing runs until you approve it.', onClick: onMatch }] : []),
  ];
  const prop = (p) => ({
    key: p.name,
    title: p.name,
    line: `${p.says || 'Not described in the spec.'}${p.default != null ? ` Starts as ${p.default}.` : ''}`,
    value: p.type,
    state: p.required ? 'Required' : undefined,
  });
  const inCode = new Set(c.states.css.map((s) => s.replace(/-visible/, '')));
  const inContract = new Set(c.states.contract);
  const states = [...new Set([...c.states.contract, ...c.states.css])].map((s) => ({
    key: s,
    title: cap(s),
    line: inContract.has(s) && inCode.has(s.replace(/-visible/, '')) ? 'Written in the contract and styled in the code.' : inContract.has(s) ? 'Written in the contract; the code has no style for it by that name.' : 'Styled in the code; the contract does not list it.',
  }));
  const notes = (c.contract?.a11y ? c.contract.a11y.split(/(?<=[.!?])\s+/).filter((x) => x.length > 8) : []).map((t, i) => ({ ...shortHead(t, i, 'Note'), key: i }));
  return [
    { name: 'Spec status', tone: st.tone, items: specRows },
    { name: 'Properties', tone: 'info', items: c.props.map(prop) },
    { name: 'Slots', tone: 'info', items: c.slots.map(prop) },
    { name: 'Variants', tone: 'info', items: c.variants.map((v) => ({ key: v.name, title: v.name, line: `Pick one: ${listOf(v.values)}.`, value: v.default != null ? `default ${v.default}` : undefined })) },
    { name: 'States', tone: 'neutral', items: states },
    { name: 'Accessibility', tone: 'success', items: notes },
    { name: 'Use it for', tone: 'neutral', items: (c.contract?.usage ?? []).map((t, i) => ({ ...shortHead(t, i, 'Use'), key: i })) },
    { name: 'Don’t', tone: 'attention', items: (c.contract?.dont ?? []).map((t, i) => ({ ...shortHead(t, i, 'Rule'), key: i })) },
  ];
}

export function ContractBody({ c, onStory, onMatch, onSpec, openName }) {
  const groups = contractGroups(c, { onStory, onMatch, onSpec });
  const shown = groups.filter((g) => g.items.length);
  const first = openName && shown.some((g) => g.name === openName) ? openName : shown[0]?.name;
  const ordered = [...shown.filter((g) => g.name === first), ...shown.filter((g) => g.name !== first)];
  return <Groups groups={ordered.map((g) => ({ name: g.name, count: g.items.length, content: <Rows items={g.items} tone={g.tone} label={`${g.name}: ${g.items.length}`} /> }))} label={`${c.name}, contract`} />;
}

/** A part's real story, from BELLA's own Storybook index (GET /stories), never a guessed id. frame is where CHIP shows it
 *  (the build CHIP serves at /storybook/); state is loading, found or none (Elleta, 22 Nov: "when i click it opens
 *  storybook and it doesnt work"). */
export function useStory(name, view = 'story') {
  const { data } = useCached(['/stories']);
  const s = data?.[0];
  if (!s) return { state: 'loading', frame: null, docs: null };
  const p = s.parts?.[name];
  const id = view === 'docs' ? p?.docs ?? null : p?.first ?? p?.docs ?? null;
  const base = s.base ? s.base.replace(/\/?$/, '/') : null;
  if (!id || !base) return { state: 'none', frame: null, docs: null };
  return { state: 'found', frame: `${base}iframe.html?id=${encodeURIComponent(id)}&viewMode=${view !== 'docs' && p?.first ? 'story' : 'docs'}`, id };
}
const WIDTHS = [
  { value: 'fit', label: 'Fit' },
  { value: '320', label: '320' },
  { value: '768', label: '768' },
  { value: '1024', label: '1024' },
];
/** The part's story inside CHIP, at a width you choose; no story says so and offers to add one (a plan first). */
export function StoryDrawer({ name, view = 'story', onClose, onBack }) {
  const story = useStory(name, view);
  const [w, setW] = useState('fit');
  const add = () =>
    planRun({
      title: `Add a story for ${name}`,
      from: 'Components',
      brief: `BELLA's ${name} has no Storybook story. Add src/components/${name}/${name}.stories.tsx with one story per contract variant and its states. Change only that file.`,
      summary: `${name} · no story yet`,
    }).catch(() => {});
  return (
    <Drawer open side="right" size="lg" onClose={onClose} onBack={onBack} label={`${name}: ${view === 'docs' ? 'doc page' : 'story'}`} status={story.state === 'found' ? 'BELLA’s Storybook, shown here' : story.state === 'none' ? (view === 'docs' ? 'No doc page yet' : 'No story yet') : 'Reading…'}>
      {story.state === 'none' ? (
        <Flow inset gap={16}>
          <TextStack title="No story yet" body={`BELLA has no Storybook story for ${name}, so there is nothing to show.`} />
          <Flow direction="row" justify="end">
            <Button variant="secondary" onClick={add}>Add a story</Button>
          </Flow>
        </Flow>
      ) : story.state === 'found' ? (
        <Flow inset gap={8}>
          <SegmentedControl label="Width" value={w} onChange={setW} options={WIDTHS} />
          <div style={{ inlineSize: w === 'fit' ? '100%' : `min(100%, ${w}px)`, marginInline: 'auto' }}>
            <iframe title={`${name} in BELLA’s Storybook`} src={story.frame} style={{ inlineSize: '100%', blockSize: 'calc(100dvh - var(--spacing-80) - var(--spacing-64))', border: 0 }} />
          </div>
        </Flow>
      ) : (
        <Flow inset><TextStack body="Reading BELLA’s Storybook index." /></Flow>
      )}
    </Drawer>
  );
}

/** A part's contract in the reading drawer; the story and the spec open one level down, Back returns here. */
export function ContractDrawer({ name, openName, onClose }) {
  const { data, error } = useCached([`/system-docs/contract/${name}`]);
  const c = data?.[0];
  const [level, setLevel] = useState(openName === 'story' || openName === 'spec' ? openName : null); // 'story' | 'spec'
  if (level === 'story') return <StoryDrawer name={name} onClose={onClose} onBack={() => setLevel(null)} />;
  if (level === 'spec' && c?.spec) return <DocDrawerWithBack id={c.spec.id} onClose={onClose} onBack={() => setLevel(null)} />;
  const match = () =>
    planRun({
      title: `Match ${name}'s contract to the code`,
      from: 'Components',
      brief: `Match BELLA's ${name} contract to its code. Steps:\n${c.status.behind.map((b, i) => `${i + 1}. ${b}`).join('\n')}\nChange only tokens/contracts.json and specs/components/${name}.spec.yaml. Ask before changing the code.`,
      summary: `${name} · ${c.status.behind.length} properties`,
    }).catch(() => {});
  return (
    <ReadingDrawer open onClose={onClose} label={`${name}: contract`} status={c ? `${STATUS[c.status.state].word} · from tokens/contracts.json and ${c.spec?.path ?? 'no spec'}` : error ? 'Not found' : 'Reading…'}
      lead={c ? 'What the part promises: its properties, slots, variants, states and accessibility notes, read from BELLA.' : undefined}>
      {c && !c.contract ? <Inset><TextStack body={c.spec ? 'No contract yet. Only the spec describes this part.' : "No contract yet. Nothing in BELLA's contracts or specs describes this part."} /><Flow direction="row"><Button variant="secondary" size="sm" onClick={match}>Match the contract to the code</Button></Flow></Inset> : null}
      {c?.found ? <ContractBody c={c} openName={openName} onSpec={() => setLevel('spec')} onStory={() => setLevel('story')} onMatch={match} /> : null}
    </ReadingDrawer>
  );
}

function DocDrawerWithBack({ id, onClose, onBack }) {
  const { data } = useCached([`/system-docs/doc?id=${encodeURIComponent(id)}`]);
  const doc = data?.[0];
  return (
    <ReadingDrawer open onClose={onClose} onBack={onBack} label={doc?.title ? `${doc.title}: spec` : 'Spec'} status={doc ? `Updated ${day(doc.updated)} · ${size(doc.bytes)}` : 'Reading…'}>
      {doc?.contract ? <ContractBody c={doc.contract} /> : null}
    </ReadingDrawer>
  );
}

/** The Contract card on a part's Inspect tab: what the part promises, in rows that open the contract (Elleta, 23 Nov: "the
 *  contracts are not showing on the components anymore"). Read live from /system-docs/contract/<Name>. */
export function ContractCard({ name }) {
  const { data, error } = useCached([`/system-docs/contract/${name}`]);
  const [open, setOpen] = useState(null); // the group to open first, or true
  const c = data?.[0];
  const match = () =>
    planRun({
      title: `Match ${name}'s contract to the code`,
      from: 'Components',
      brief: `Write the contract for BELLA's ${name}: its entry in tokens/contracts.json and specs/components/${name}.spec.yaml, from the code in src/components/${name}. Change only those two files.`,
      summary: `${name} · no contract yet`,
    }).catch(() => {});
  const groups = c?.found ? contractGroups(c, { onSpec: () => {}, onStory: () => {} }).filter((g) => g.items.length && g.name !== 'Spec status') : [];
  const st = c ? STATUS[c.status.state] : null;
  const rows = [
    ...groups.map((g) => ({ name: g.name, n: g.items.length })),
  ];
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Contract" titleLevel={3} words={c?.found ? 'read from BELLA now' : undefined} />
        {error ? <TextStack body="CHIP could not read BELLA's contract. The server may have no contract route yet: restart it, then reload." /> : null}
        {c && !c.contract ? (
          <>
            <TextStack body={c.spec ? 'No contract yet. Only the spec describes this part.' : 'No contract yet.'} />
            <Flow direction="row">
              <Button variant="secondary" size="sm" onClick={match}>Match the contract to the code</Button>
            </Flow>
          </>
        ) : null}
        {c?.found ? (
          <Flow as="ul" gap={0} aria-label="Contract">
            <ListRow title="Spec" layout="inline" statusBar={st.tone} valueLabel={st.word} trailing onClick={() => setOpen('Spec status')} />
            {rows.map((r) => (
              <ListRow key={r.name} title={r.name} layout="inline" value={r.n} trailing onClick={() => setOpen(r.name)} />
            ))}
            <ListRow title="Open the story" layout="inline" trailing onClick={() => setOpen('story')} />
            {c.spec ? <ListRow title="Open the spec" layout="inline" trailing onClick={() => setOpen('spec')} /> : null}
          </Flow>
        ) : null}
      </Flow>
      {open ? <ContractDrawer name={name} openName={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}
