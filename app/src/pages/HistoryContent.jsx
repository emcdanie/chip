// History · content: the code twin of the Figma slot fill (CHIP Dashboard
// 664:123671, "visual · default"). Search in plain words, the kinds as
// filter chips, Filters in a drawer, then the Activity timeline (Step per
// record, by day) beside the opened record. Real CHIP data: /history and
// /history/record. Built from BELLA parts and the template's Flow only.
//
// Gaps (library board): the "What it touched" tree (Map line pieces placed
// by position) has no part yet, so the files show as a list of cards; the
// Ask uses Input's own Send button.
// Actions that run the agent (Ask) wait for the Menu part for the model menu
// (Auto, local first).
import { Fragment, useEffect, useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Step, { StepDay } from '@bella/components/Step/Step';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Notification from '@bella/components/Notification/Notification';
import ListRow from '@bella/components/ListRow/ListRow';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import Flow from '../templates/Flow.jsx';
import { parseDiff } from './WorkDrawer.jsx';
import useCached from '../templates/useCached.js';
import useAsk, { AskAnswer } from '../templates/useAsk.jsx';
import useNarrow from '../templates/useNarrow.js';

/* A commit's why in plain words: git trailers (Co-Authored-By, Signed-off-by,
   the tool's "Generated with" line) are bookkeeping, not reasons, and never
   name a model on the page (19 Nov audit). */
const TRAILER = /^\s*([\w-]+-by:|.*Generated with \[|🤖)/i;
const plainWhy = (why) => (why ?? '').split('\n').filter((l) => !TRAILER.test(l)).join('\n').trim();

const KINDS = ['Decision', 'Fix', 'Visual', 'Contract', 'Tokens', 'Tooling', 'Docs'];
// one icon per kind, as Figma's Activity draws them: Tooling a gear, Visual an eye; Docs (a page) and
// Tokens (a palette) stand in with Book and Sparks until BELLA has those glyphs (gap). Figma draws no
// icon for Fix, Contract or Decision: never the done tick, which reads as a status.
/* Each record kind as BELLA Step's kind marker (b2729ec): one deeper wash per kind with an ink glyph, a decision a dark ink
   circle, green only for Merged (her 19 Nov rule). A contract change is code. */
const STEP_KIND = { Decision: 'decision', Fix: 'fix', Visual: 'visual', Contract: 'code', Tokens: 'tokens', Tooling: 'tooling', Docs: 'docs' };
const STATUSES = ['Decided', 'Merged', 'Shipped', 'On a branch', 'Undone'];
const SINCE = [
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
];
const PAGE = 10;

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const time = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const STATUS_TONE = { Merged: 'success', Shipped: 'success', Decided: 'info', 'On a branch': 'attention', Undone: 'neutral' };
/* Who made a record, as Figma says it: the role, never a person or a handle
   (Many users, not one, 20 Nov); the agent stays the agent. */
// the role alone, no "a" or "the" (Elleta, 21 Nov)
const roleOf = (who) => (!who ? null : /claude|agent|bot/i.test(who) ? 'agent' : /in CHIP/i.test(who) ? 'maintainer, in CHIP' : 'maintainer');
// Plain words on screen (her rule): no Figma node ids, file paths, app routes or model names.
const plain = (t) =>
  String(t ?? '')
    // a bracket that holds a Figma node id goes whole ("(612:60963, table 800:79888)"), never half (audit 9)
    .replace(/\s*\([^()]*\b\d{2,4}:\d{2,7}\b[^()]*\)/g, '')
    .replace(/\s*\b\d{2,4}:\d{2,7}\b/g, '')
    // a person's byline in brackets goes; a name left in the words reads as the role (Many users, not one)
    .replace(/\s*\(\s*Elleta\b[^()]*\)/g, '')
    .replace(/\bElleta['’]s\b/g, "the maintainer's")
    .replace(/\bElleta\b/g, 'the maintainer')
    .replace(/#\/[\w-]+-old\b/g, 'its old address')
    .replace(/#\/([\w-]+)(?:\?[\w=&%.-]*)?/g, (_, r) => `the ${r.replace(/-/g, ' ')} page`)
    .replace(/(?:[\w.-]+\/)+[\w.-]+\.\w+|\b[\w-]+\.(?:jsx?|tsx?|css|html|json|mjs|md|ya?ml)\b/g, '')
    .replace(/\bClaude Code\b|\bClaude\b/g, 'the agent')
    // a commit reference in brackets ("(bella-parts f134741)") is bookkeeping, not words
    .replace(/\s*\([^()]*\b[0-9a-f]{7,40}\b[^()]*\)/g, '')
    .replace(/\bbella-parts\b/g, "BELLA's parts")
    // server words a designer or developer who wasn't there can read (audit 21 Nov: "/search", "got a 400")
    .replace(/\b(?:got|returned|gave) an? \d{3}\b/g, 'was refused')
    .replace(/\ban? (?:4|5)\d\d\b(?!\s*(?:px|ms|%))/g, 'an error')
    .replace(/(?<![\w.])\/(?:search|runs|checks|gaps|ask|map|stories|review|host\/test|needs)\b/g, 'CHIP’s server')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*\)|,\s*(?=[,.;])/g, '')
    // a removed name or path leaves no comma at a bracket's edge ("(the stories,)" reads "(the stories)")
    .replace(/,\s*\)/g, ')')
    .replace(/\(\s*,\s*/g, '(')
    // a removed path at a bracket's start leaves no space after it ("(data/x.json radius" reads "(radius")
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim();
/* A touched file in plain words: what it is, not its path ("Team page", "Button part"). */
const fileWords = (f) => {
  const parts = String(f).split('/');
  // a story's screenshot names its part: "components-actions-list-row--small-chip-dark.png" is ListRow's
  const shot = parts[parts.length - 1].match(/^components-[a-z]+-(.+?)--.*\.png$/);
  if (shot) return `${shot[1].replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())} screenshots`;
  // a part's CSS module is the part ("Input.module part" was a second, broken row)
  const base = parts.pop().replace(/\.(stories|module)?\.?(jsx?|tsx?|mjs|css|md|json|ya?ml|html)$/, '');
  const name = base.replace(/Content$/, '').replace(/\.stories$/, '');
  if (/\.stories\./.test(f)) return `${name} stories`;
  // a page's model is its data, not a page ("workModel page" read as a page, audit 9)
  if (parts.includes('pages') && /Model$/.test(name)) return `${name.replace(/Model$/, '')} data`;
  // a page's own file is the page; a helper beside it (WorkDrawer) reads as words, not a page
  if (parts.includes('pages')) return PAGES.includes(name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()) ? `${name} page` : name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (_, a, b) => a + b.toLowerCase());
  if (parts.includes('templates')) return `${name} template`;
  if (parts.includes('components')) return `${name} part`;
  if (parts[0] === 'server') return 'CHIP server';
  if (parts[0] === 'data') return 'CHIP data';
  if (parts[0] === 'scripts') return `${name} script`;
  if (/\.css$/.test(f)) return `${name} styles`;
  if (/\.md$/.test(f)) return `${name} notes`;
  return name;
};
/* Where a touched thing opens in CHIP: a part (its file, stories or screenshots) on Components, a page
   that CHIP has; anything else opens its own change in place (every row opens: ↗ everywhere, audit 3 item 4). */
const PAGES = ['not-again', 'work', 'components', 'health', 'history', 'connectors', 'system-map', 'foundations', 'team', 'playground'];
const targetOf = (what) => {
  const m = String(what).match(/^(.+) (part|page|stories|screenshots)$/);
  if (!m) return null;
  if (m[2] !== 'page') return `#/components/${m[1].toLowerCase()}`;
  const id = m[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return PAGES.includes(id) ? `#/${id}` : null;
};
/* The counts under the title, from the same rows "What it touched" lists: its parts and pages
   (none named when there are none), then files and lines (audit 21 Nov: "3 parts" over no part rows). */
const countLine = (files, stat) => {
  const rows = touched(files).map(([w]) => w);
  const parts = rows.filter((w) => / part$/.test(w)).length;
  const pages = rows.filter((w) => / page$/.test(w)).length;
  return [parts ? count(parts, 'part') : null, pages ? count(pages, 'page') : null, count(files.length, 'file'), `${count(lines(stat), 'line')} changed`].filter(Boolean).join(' · ');
};
const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const lines = (stat) => [...String(stat ?? '').matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);

/* History's data, kept between visits (useCached): no loading flash when you come back. */
function useHistory(params) {
  const qs = new URLSearchParams(params).toString();
  const { data, error } = useCached([`/history?${qs}`]);
  if (error) return { error: true, records: [], total: 0, counts: { types: {} } };
  return data ? data[0] : null;
}

function useRecord(id) {
  const { data } = useCached(id ? [`/history/record?id=${encodeURIComponent(id)}`] : []);
  return id && data ? data[0] : null;
}

function Activity({ records, total, open, onOpen, fit }) {
  const [shown, setShown] = useState(PAGE);
  const list = records.slice(0, shown);
  let last = null;
  return (
    <Card>
      <Flow gap={8} scroll={fit}>
        <SectionHead title="Activity" words={`${list.length} of ${total} records`} />
        <Flow gap={4} as="ol" aria-label="Records, newest first">
          {list.map((r) => {
            const d = day(r.date);
            const head = d !== last ? d : null;
            last = d;
            // Step is its own <li>; a day break is BELLA's StepDay, never an <li> around a Step (audit 21 Nov)
            return (
              <Fragment key={r.id}>
                {head ? <StepDay>{head}</StepDay> : null}
                <Step
                  title={<Keyed text={plain(r.title)} k={keyOf(plain(r.title), r.components)} />}
                  time={time(r.date)}
                  // a Tag only where nothing else says it (audit 4, item 4): Merged is what Activity
                  // is made of, so only the other statuses get one; the open record keeps its own
                  tag={r.status !== 'Merged' ? <Tag tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Tag> : undefined}
                  kind={STEP_KIND[r.type]}
                  icon={STEP_KIND[r.type] ? undefined : 'Clock'}
                  state="done"
                  selected={r.id === open}
                  onSelect={() => onOpen(r.id)}
                />
              </Fragment>
            );
          })}
        </Flow>
        {records.length > shown ? (
          <Flow direction="row" justify="end">
            <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, records.length - shown)} more
            </Button>
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );
}

/* Files in plain words, one row per thing: a page's two files are one page (they showed twice). */
// a screenshot only knows its part in lower case ("listrow"): the part's own folder in the same record spells it
const touched = (files) => {
  const names = new Map(files.map((f) => String(f).match(/components\/(\w+)\//)?.[1]).filter(Boolean).map((n) => [n.toLowerCase(), n]));
  const words = (f) => fileWords(f).replace(/^(\w+)(?= screenshots$)/, (n) => names.get(n.toLowerCase()) ?? n);
  return [...files.reduce((m, f) => m.set(words(f), (m.get(words(f)) ?? 0) + 1), new Map())];
};

// the first sentence, never cut inside a quote ('Team said "No one's waiting on you. Every ask is answered"' is one)
const firstSentence = (t) => {
  const str = String(t);
  let quotes = 0;
  for (let i = 0; i < str.length; i++) {
    if (/["“”]/.test(str[i])) quotes++;
    if (/[.!?]/.test(str[i]) && /\s/.test(str[i + 1] ?? '') && quotes % 2 === 0) return str.slice(0, i + 1);
  }
  return str;
};


/* Bold is for key words only (Elleta, 22 Nov: "only keywords, which were supposed to have the blue
   underline thing"): a record's title reads regular and its one key word gets bold plus the blue marker.
   The key word is the part the record names (git's own list of parts it touched), else the area before
   the title's colon ("Scripts: …"); none when neither is there. Never more than one per line. */
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyOf = (title, components = []) => {
  const t = String(title ?? '');
  const part = [...components].sort((a, b) => b.length - a.length).find((c) => new RegExp(`\\b${esc(c)}\\b`).test(t));
  if (part) return part;
  return t.match(/^([^:]{2,32}):\s/)?.[1] ?? null;
};
function Keyed({ text, k }) {
  const t = String(text ?? '');
  const at = k ? t.search(new RegExp(`\\b${esc(k)}\\b`)) : -1;
  if (at < 0) return t;
  return (
    <>
      {t.slice(0, at)}
      <strong className="chip-key">{t.slice(at, at + k.length)}</strong>
      {t.slice(at + k.length)}
    </>
  );
}

function Record({ id, fit }) {
  const rec = useRecord(id);
  const [q, setQ] = useState('');
  const { answer, ask: send, clear, retry, stop } = useAsk();
  // the touched row whose change is open in place
  const [shown, setShown] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => (clear(), setShown(null)), [id]);
  if (!rec) return <Card><EmptyState size="lane" title="Opening the record" line="Reading it from git. Two ticks." /></Card>;
  const files = Array.isArray(rec.files) ? rec.files : [];
  // the record's own words go as a source, so the answer can come from the commit itself
  // "explain" or "I don't understand" asks one clear question the model can answer from the commit
  const plainAsk = (t) => (/\b(explain|understand|what does (this|it) mean|simpler)\b/i.test(t) ? 'In simple words, for someone who wasn’t there: what did this change do, and why?' : t);
  const ask = () => q.trim() && send(`About ${rec.repo} commit ${rec.sha} ("${rec.title}"): ${plainAsk(q.trim())}`, 'history', { id: rec.id, title: `${rec.repo} commit: ${rec.title}`, text: `${rec.title}\n\n${plainWhy(rec.why)}\n\nFiles: ${files.join(', ') || 'none listed'}` }, q.trim());
  return (
    <Card>
      <Flow gap={24} scroll={fit} aria-label="The open record" tabIndex={fit ? 0 : undefined}>
        <Flow gap={8}>
          <Flow direction="row" justify="between" wrap gap={8} align="center">
            <Tag tone={STATUS_TONE[rec.status] ?? 'neutral'}>{rec.status}</Tag>
            <TextStack subtitle={[day(rec.date), time(rec.date), roleOf(rec.who), rec.repo.toUpperCase() === 'CHIP' ? 'CHIP' : rec.repo === 'bella' ? 'BELLA' : rec.repo].filter(Boolean).join(' · ')} />
          </Flow>
          {/* Figma: the record's title at the subsection size, the biggest thing in the record */}
          {/* Figma draws the record title as Text stack Title (20 regular); an h2 for the record (TextStack titleAs, parts 111fc0c) */}
          <TextStack titleAs="h2" title={<Keyed text={plain(rec.title)} k={keyOf(plain(rec.title), rec.components)} />} />
          {/* the counts, once, under the title (her note, 21 Nov: "should these not be at the top").
              Gap: no BELLA part sets numbers in Geist Mono and words in Lexend on one line, so the
              line is TextStack's meta line for now */}
          <TextStack subtitle={countLine(files, rec.stat)} />
        </Flow>
        {plainWhy(rec.why) ? (
          // the commit's own words, its first sentence up front and the rest under Exact words; never a
          // model-written line (audit 21 Nov r2: invented explanations break "Real"). Commit messages
          // open with one plain sentence for someone who wasn't there: that is the source.
          <Notification
            tone="info"
            showIcon={false}
            title="Why"
            message={(() => {
              const lines = plainWhy(rec.why).split(/\n(?=-\s)|\n{2,}/).map((l) => plain(l.replace(/^-\s*/, '').replace(/\s*\n\s*/g, ' ').trim())).filter(Boolean);
              const first = firstSentence(lines[0] ?? '');
              const rest = [lines[0].slice(first.length).trim(), ...lines.slice(1)].filter(Boolean);
              return (
                <Flow gap={4} as="span">
                  {/* one key word in the Why too, the same one as the title's where the Why names it */}
                  <span>
                    <Keyed text={first} k={[keyOf(plain(rec.title), rec.components), ...(rec.components ?? [])].find((k) => k && new RegExp(`\\b${esc(k)}\\b`).test(first))} />
                  </span>
                  {rest.length ? (
                    <Disclosure flush title="Exact words">
                      <Flow gap={4} as="span">
                        {rest.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </Flow>
                    </Disclosure>
                  ) : null}
                </Flow>
              );
            })()}
          />
        ) : null}
        <Flow gap={8}>
          <SectionHead title="What it touched" titleLevel={3} />
          {/* flat rows on the page, one List item each, no card per row (her note, 21 Nov) */}
          <Flow gap={8} as="ul" aria-label="What this record touched">
            {touched(files).map(([what, n]) => {
              const to = targetOf(what);
              return (
                <ListRow
                  key={what}
                  layout="stacked"
                  divider
                  statusBar={STATUS_TONE[rec.status] ?? 'neutral'}
                  title={what}
                  description={`${n === 1 ? '1 file' : `${n} files`} · ${String(rec.status).toLowerCase()}`}
                  trailing
                  selected={shown === what}
                  href={to ?? undefined}
                  onClick={to ? undefined : () => setShown(shown === what ? null : what)}
                />
              );
            })}
          </Flow>
          {shown ? (
            <Flow gap={8} aria-live="polite">
              {parseDiff(rec.diff).filter((d) => touched([d.path])[0]?.[0] === shown || fileWords(d.path) === shown).map((d) => (
                <CodeBlock key={d.path} code={d.body || 'No line changes: a binary or renamed file.'} language="diff" title={d.path} copy />
              ))}
            </Flow>
          ) : null}
        </Flow>
        <Flow gap={8}>
          <Input label="Ask about this change" value={q} onChange={setQ} onSend={ask} sendLabel="Ask" />
          <AskAnswer answer={answer} onRetry={retry} onStop={stop} />
        </Flow>
      </Flow>
    </Card>
  );
}

export default function HistoryContent() {
  const phone = useNarrow();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(null);
  const [status, setStatus] = useState([]);
  const [since, setSince] = useState('');
  const [breaking, setBreaking] = useState(false);
  const [filters, setFilters] = useState(false);
  const [open, setOpen] = useState(null);
  const params = useMemo(() => {
    const p = { limit: 400 };
    if (q) p.q = q;
    if (kind) p.type = kind;
    if (status.length) p.status = status.join(',');
    if (since) p.since = new Date(Date.now() - Number(since.replace('d', '')) * 864e5).toISOString().slice(0, 10);
    if (breaking) p.breaking = '1';
    return p;
  }, [q, kind, status, since, breaking]);
  const data = useHistory(params);
  const all = useHistory({ limit: 1 });
  const records = data?.records ?? [];
  useEffect(() => {
    if (records.length && !records.some((r) => r.id === open)) setOpen(records[0].id);
  }, [records, open]);
  const counts = all?.counts?.types ?? {};
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const extra = status.length + (since ? 1 : 0) + (breaking ? 1 : 0);

  return (
    <>
      <Flow gap={24}>
        {/* Figma's content set opens with its lede (664:123672) */}
        <TextStack body="What we agreed, when and why, across BELLA and CHIP." />
        {/* Search beside the field, lined up with its box (the label sits above); a phone stacks them */}
        <Flow direction={phone ? 'column' : 'row'} gap={8} grow={phone ? undefined : 'first'} as="form" role="search" onSubmit={(e) => (e.preventDefault(), setQ(draft.trim()))}>
          <Input label="Ask about a change, in plain words" leadingIcon="Search" value={draft} onChange={setDraft} />
          <Flow direction={phone ? 'row' : 'column'} justify="end">
            {/* Figma (664:123671): Search, then Filters, both white, words only; the page's one blue action is New task */}
            <Flow direction="row" gap={8} justify="end">
              <Button variant="secondary" type="submit">
                Search
              </Button>
              <Button variant="secondary" onClick={() => setFilters(true)} ariaHaspopup="dialog">
                {extra ? `Filters · ${extra}` : 'Filters'}
              </Button>
            </Flow>
          </Flow>
        </Flow>
        <Flow direction="row" gap={8} wrap aria-label="Kinds">
          <FilterChip size="compact" pressed={!kind} onClick={() => setKind(null)}>
            All {all?.total ?? ''}
          </FilterChip>
          {KINDS.map((k) => (
            <FilterChip key={k} size="compact" pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {k} {counts[k] ?? 0}
            </FilterChip>
          ))}
        </Flow>
      </Flow>

      {data?.error ? (
        <EmptyState size="page" title="History isn't answering" line="CHIP couldn't read git just now. Refresh and I'll try again." />
      ) : data && !records.length ? (
        <EmptyState
          size="page"
          title="No record matches"
          line="Nothing in BELLA or CHIP fits that. Loosen a filter and I'll look again."
          actions={
            <Button variant="secondary" onClick={() => (setDraft(''), setQ(''), setKind(null), setStatus([]), setSince(''), setBreaking(false))}>
              Clear everything
            </Button>
          }
        />
      ) : !data ? (
        <EmptyState size="page" title="Reading the record" line="Pulling BELLA's and CHIP's git logs. Won't be a minute." />
      ) : (
        // the list and the record fill the window and each scrolls on its own; the page never scrolls
        // (Elleta, 22 Nov: "I don't want to scroll the whole page"). A phone stacks them and scrolls.
        <Flow fit={!phone} span={12} direction={phone ? 'column' : 'row'} gap={24}>
          <Flow span={5}>
            <Activity records={records} total={data.total} open={open} onOpen={setOpen} fit={!phone} />
          </Flow>
          <Flow span={7}>
            {/* a new record opens at its top (keyed), never mid-scroll from the last one */}
            <Record key={open} id={open} fit={!phone} />
          </Flow>
        </Flow>
      )}

      <Drawer
        side="right"
        open={filters}
        onClose={() => setFilters(false)}
        label="Filters"
        footer={
          // Clear is a text button (tertiary, small: 44 hit area kept), as filter sheets in the big
          // libraries do, so "Show N records" keeps its one line in the 320 drawer; on a phone the row wraps instead
          <Flow direction="row" justify="end" align="center" gap={8} wrap>
            <Button variant="tertiary" size="sm" onClick={() => (setStatus([]), setSince(''), setBreaking(false))}>
              Clear
            </Button>
            <Button variant="primary" onClick={() => setFilters(false)}>
              Show {data?.total ?? ''} records
            </Button>
          </Flow>
        }
      >
        <Flow gap={24}>
          <Flow gap={8}>
            <SectionHead title="Status" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              {STATUSES.map((s) => (
                <FilterChip key={s} pressed={status.includes(s)} onClick={() => toggle(status, setStatus, s)}>
                  {s}
                </FilterChip>
              ))}
            </Flow>
          </Flow>
          <Flow gap={8}>
            <SectionHead title="When" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              {SINCE.map(([v, label]) => (
                <FilterChip key={v} pressed={since === v} onClick={() => setSince(since === v ? '' : v)}>
                  {label}
                </FilterChip>
              ))}
            </Flow>
          </Flow>
          <Flow gap={8}>
            <SectionHead title="Breaking" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              <FilterChip pressed={breaking} onClick={() => setBreaking(!breaking)}>
                Breaking changes only
              </FilterChip>
            </Flow>
          </Flow>
        </Flow>
      </Drawer>
    </>
  );
}
