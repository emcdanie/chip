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
import Keyed from '../templates/Keyed.jsx';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Step, { StepDay } from '@bella/components/Step/Step';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Notification from '@bella/components/Notification/Notification';
import ListRow from '@bella/components/ListRow/ListRow';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Input from '@bella/components/Input/Input';
import Combobox from '@bella/components/Combobox/Combobox';
import { find } from '../templates/Search.jsx';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import TourStep from '@bella/components/TourStep/TourStep';
import Flow from '../templates/Flow.jsx';
import { parseDiff } from './WorkDrawer.jsx';
import useCached from '../templates/useCached.js';
import useAsk, { AnswerLines, shapeReply } from '../templates/useAsk.jsx';
import useNarrow from '../templates/useNarrow.js';

/* A commit's why in plain words: git trailers (Co-Authored-By, Signed-off-by,
   the tool's "Generated with" line) are bookkeeping, not reasons, and never
   name a model on the page (19 Nov audit). */
const TRAILER = /^\s*([\w-]+-by:|.*Generated with \[|🤖)/i;
const plainWhy = (why) => (why ?? '').split('\n').filter((l) => !TRAILER.test(l)).join('\n').trim();

const KINDS = ['Decision', 'Fix', 'Visual', 'Contract', 'Tokens', 'Tooling', 'Docs'];
// one icon per kind, as Figma's Activity draws them: Tooling a gear, Visual an eye, Docs a page, Tokens a palette
// (BELLA Step's own kind glyphs). Figma draws no icon for Fix, Contract or Decision: never the done tick, which
// reads as a status.
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
/* Old commits were written for the team, not for the person using CHIP: they carry her quoted words,
   "batch N", session names and audit labels. New commits are user-facing (CHIP rule, 22 Nov); for the old
   ones History shows the words without those, and the raw commit stays one click away (git is never
   rewritten). */
const SESSIONS = /\b(?:coordinator(?:-\d+)?|chip-fixes|chip-code|chip-chat|hifi-refine|docs-finish|parts-code(?:-\d+)?|parts-motion|library-writer|figma-screens|history-restore|CHIP-code)\b/gi;
const INTERNAL = /["“”]|\bbatch \d|\bElleta\b|\bher\b|\bshe\b|visual study|\baudit \d|\bcard [a-z]?\d|\bpublished \d|\bpick(?:ed|s)?\b|\bnote\b/i;
const teamWords = (t) =>
  String(t ?? '')
    // a bracket that holds her words, a quote or an internal label goes whole
    .replace(/\s*\(([^()]*)\)/g, (m, inner) => (INTERNAL.test(inner) ? '' : m))
    // her words quoted outside a bracket ("Elleta, 22 Nov: \"…\"", "she said \"…\"")
    .replace(/\s*(?:Elleta|she|the maintainer)(?:[^".“]{0,40})[:,]?\s*["“][^"”]*["”]/gi, '')
    // "batch 3 BELLA parts" reads "BELLA parts"; "in batch 5" reads "in a library update"
    // a sentence that is only a batch label ("Batch 4 (published …)." before the real first sentence) goes whole
    .replace(/(^|[.!?]\s+)(?:BELLA )?[Bb]atch \d+\s*(?:\([^()]*\))?\s*[.:;]\s*/g, '$1')
    .replace(/\b[Bb]atch-\d+\s+/g, '')
    .replace(/\b(?:BELLA )?[Bb]atch \d+\b\s+(?=[A-Z])/g, '')
    .replace(/\b(?:BELLA )?[Bb]atch \d+\b/g, 'a library update')
    .replace(/\b([Tt]he) coordinator(?:-\d+)?\b/g, '$1 reviewer')
    .replace(/\baudit \d+\b/gi, 'the audit')
    .replace(/,?\s*(?:from|in|on) the \d{1,2} \w{3} visual study,?/gi, '')
    .replace(/\b(?:the )?(?:decision )?card [a-z]\d+\b/gi, 'a decision')
    // where the team's pictures were saved is not for the reader
    .replace(/\bPictures?:\s*[^.;]*[.;]?/g, '')
    .replace(/\b(?:[\w.-]+\/){2,}[\w.-]*/g, '')
    .replace(/\s*\b(?:from|by|to|for|in)\s+(?=(?:coordinator|chip-|hifi-|docs-|parts-|library-|figma-|history-|CHIP-code))/gi, ' ')
    .replace(SESSIONS, '')
    .replace(/\bHer\b/g, 'The')
    .replace(/\bher\b/g, 'the')
    .replace(/\bshe\b/g, 'the maintainer')
    .replace(/\bShe\b/g, 'The maintainer');
const plain = (t) =>
  teamWords(t)
    // no sparkle word or mark on screen, not even quoted from a commit (her rule, 22 Nov): it reads as the AI decoration it was
    .replace(/\s*\u2728\s*/g, ' ')
    .replace(/\b([Aa]) sparkle\b/g, '$1n AI decoration')
    .replace(/\bsparkles\b/gi, 'AI decorations')
    .replace(/\bsparkle\b/gi, 'AI decoration')
    // a bracket that holds a Figma node id goes whole ("(612:60963, table 800:79888)"), never half (audit 9)
    .replace(/\s*\([^()]*\b\d{2,4}:\d{2,7}\b[^()]*\)/g, '')
    .replace(/\s*\b\d{2,4}:\d{2,7}\b/g, '')
    // a person's byline in brackets goes; a name left in the words reads as the role (Many users, not one)
    .replace(/\s*\(\s*Elleta\b[^()]*\)/g, '')
    .replace(/\bElleta['’]s\b/g, "the maintainer's")
    .replace(/\bElleta\b/g, 'the maintainer')
    .replace(/#\/[\w-]+-old\b/g, 'its old address')
    .replace(/#\/([\w-]+)(?:\?[\w=&%.-]*)?/g, (_, r) => `the ${r.replace(/-/g, ' ')} page`)
    // a file named in quotes is what the sentence is about, so it stays; any other path goes
    .replace(/(?<!["“\w.\/-])(?:(?:[\w.-]+\/)+[\w.-]+\.\w+\b|[\w-]+\.(?:jsx?|tsx?|css|html|json|mjs|md|ya?ml)\b)(?!["”])/g, '')
    .replace(/\s*["“]\s*["”]/g, '')
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
    // a bracket whose every name was removed goes whole ("relay inbox ()")
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // what a removal leaves at the start ("Batch 4 (…). Type on…" reads "Type on…"), and a lower-case start
    .replace(/^[\s.,;:·-]+/, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.;:]),/g, '$1')
    .replace(/^./, (c) => c.toUpperCase())
    // a quoted file name wraps at its joins like the path titles, and its closing quote stays on its line
    .replace(/(["“])([\w./-]+\.\w+)(["”])/g, (_, a, f, z) => `${a}${pathTitle(f)}\u2060${z}`);
/* A touched file in plain words: what it is, not its path ("Team page", "Button part"). */
const fileWords = (f) => {
  const parts = String(f).split('/');
  // a story's screenshot names its part: "components-actions-list-row--small-chip-dark.png" is ListRow's
  const shot = parts[parts.length - 1].match(/^components-[a-z]+-(.+?)--.*\.png$/);
  if (shot) return `${shot[1].replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())} screenshots`;
  // a part's CSS module is the part ("Input.module part" was a second, broken row)
  const base = parts.pop().replace(/\.(stories|module)?\.?(jsx?|tsx?|mjs|css|md|json|ya?ml|html)$/, '');
  // a part's spec ("ProjectPanel.spec.yaml") reads "ProjectPanel spec", words that can wrap, never a dotted name
  const name = base.replace(/Content$/, '').replace(/\.stories$/, '').replace(/\.spec$/, ' spec');
  if (/\.stories\./.test(f)) return `${name} stories`;
  // a page's model is its data, not a page ("workModel page" read as a page, audit 9)
  if (/ spec$/.test(name)) return name;
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
  if (m[2] !== 'page') return `#/system/components/${m[1].toLowerCase()}`;
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
        <SectionHead title="Activity" words={`${list.length} of ${total} ${total === 1 ? 'record' : 'records'}`} />
        {/* flush rows, each Step's line meeting the next one's, through the day breaks (BELLA's own Step list) */}
        {/* the first day's heading is plain text above the list: BELLA's StepDay always draws the line through its
            heading, and the line must start at the first record, not above it (23 Nov). Later day breaks are
            StepDay, where the line does run through. Gap for the parts session: StepDay has no way to start the line. */}
        {list.length ? <TextStack subtitle={day(list[0].date)} /> : null}
        <Flow gap={0} as="ol" aria-label="Records, newest first">
          {list.map((r, i) => {
            const d = day(r.date);
            const head = d !== last && i > 0 ? d : null;
            last = d;
            // Step is its own <li>; a day break is BELLA's StepDay, never an <li> around a Step (audit 21 Nov)
            return (
              <Fragment key={r.id}>
                {head ? <StepDay>{head}</StepDay> : null}
                <Step
                  // never a whole sentence in bold (Step titles are 600): the area is the title, the sentence
                  // reads as regular text under it with the marker on its key words
                  title={areaOf(plain(r.title)).area ?? r.type ?? 'Change'}
                  detail={<Keyed text={areaOf(plain(r.title)).rest} names={r.components} />}
                  time={time(r.date)}
                  // a Tag only where nothing else says it (audit 4, item 4): Merged is what Activity
                  // is made of, so only the other statuses get one; the open record keeps its own
                  tag={r.status !== 'Merged' ? <Tag tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Tag> : undefined}
                  kind={STEP_KIND[r.type]}
                  icon={STEP_KIND[r.type] ? undefined : 'Clock'}
                  state="done"
                  showLineAbove={i > 0}
                  showConnector={i < list.length - 1}
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
/* A file path as a code block's title wraps at its slashes and at the joins inside a name
   ("Foundations|Content|.jsx"), never inside a word (independent check, 22 Nov: the diff header broke a path
   mid-word): zero-width break opportunities, invisible and read as nothing. */
const pathTitle = (p) => String(p).replace(/\//g, '/\u200B').replace(/([a-z])([A-Z])/g, '$1\u200B$2').replace(/([^/\u200B])\./g, '$1\u200B.');

const firstSentence = (t) => {
  const str = String(t);
  let quotes = 0;
  for (let i = 0; i < str.length; i++) {
    if (/["“”]/.test(str[i])) quotes++;
    if (/[.!?]/.test(str[i]) && /\s/.test(str[i + 1] ?? '') && quotes % 2 === 0) return str.slice(0, i + 1);
  }
  return str;
};

/* The keyword marker marks what matters (CHIP rules, 22 Nov): the few words of a title or Why that say
   what changed, the number or the outcome, so a record can be scanned. Never the part name or the area
   before the colon. The words come from the record's own sentence by a tested rule (templates/keyPhrase.js). */
/* "Health: Component checks read as Weather rows" → area "Health", rest the sentence. A title with no
   area keeps all of it as the sentence. The area is said in her plain words (coordinator, 22 Nov: a
   housekeeping commit showed its own word as the area): a page by its name, a BELLA part as Parts, the side panel and chat as Work, the app's
   frame as App, docs and specs as Docs, and housekeeping as Clean-up. */
const AREA_WORDS = { health: 'Health', 'system health': 'Health', gaps: 'Health', 'stat cards': 'Health', charts: 'Health', work: 'Work', 'work panel': 'Work', 'work drawer': 'Work', chat: 'Work', ask: 'Work', talk: 'Work', 'talk, team': 'Work', runs: 'Work', components: 'Components', foundations: 'Foundations', history: 'History', reading: 'History', playground: 'Playground', 'not again': 'Not again', team: 'Team', connectors: 'Settings', 'system map': 'Processes', processes: 'Processes', home: 'Home', shell: 'App', nav: 'App', 'side menu': 'App', search: 'App', screen: 'App', template: 'App', toasts: 'App', parts: 'Parts', tokens: 'Parts', fonts: 'Parts', 'type, spacing': 'Parts', docs: 'Docs', specs: 'Docs', contracts: 'Docs', checks: 'Checks', gate: 'Checks', data: 'Checks', 'data sweep': 'Checks', 'clip sweep': 'Checks', 'audit 3': 'Checks' };
export function plainArea(area, partNames = new Set()) {
  const a = String(area).trim().toLowerCase();
  if (AREA_WORDS[a]) return AREA_WORDS[a];
  const first = a.split(',')[0].trim();
  if (AREA_WORDS[first]) return AREA_WORDS[first];
  // a BELLA part by its name ("List row", "Board lane, stage")
  if (partNames.has(first.replace(/[\s-]+/g, ''))) return 'Parts';
  return 'Clean-up';
}
let PART_NAMES = new Set();
function areaOf(t) {
  const m = String(t ?? '').match(/^([^:]{2,32}):\s+([\s\S]+)$/);
  // the sentence stands on its own under the area, so it starts with a capital
  return m ? { area: plainArea(m[1], PART_NAMES), rest: m[2].charAt(0).toUpperCase() + m[2].slice(1) } : { area: null, rest: String(t ?? '') };
}

/* "Help me understand" for one file of the change (her 19 Nov mock; READ FIRST "Code as proof"): a step
   at a time, each one lighting the line it explains with its numbered pin, Back / n of N / Next. Only the
   steps this file's code has; the lines are counted from the code itself. */
function walk(f) {
  const lines = f.body.split('\n');
  // only the first changed block, so each lit line sits just under its step card, never pages below it
  const next = lines.findIndex((l, i) => i > 0 && /^@@/.test(l));
  const block = next > 0 ? lines.slice(0, next) : lines;
  const at = (re) => block.findIndex((l) => re.test(l)) + 1;
  const hunk = f.body.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/m);
  const add = at(/^\+/);
  const del = at(/^-/);
  const same = at(/^ \S/);
  return [
    hunk ? { line: at(/^@@/), text: `This line says where the change sits in ${f.path.split('/').pop()}: from line ${hunk[2]}${hunk[3] ? `, ${hunk[3]} lines` : ''}.` } : null,
    del ? { line: del, text: 'A line starting − was taken out. It has the red band.' } : null,
    add ? { line: add, text: `A line starting + was added. It has the green band${f.add > 1 ? `; this file has ${f.add} in all` : ''}.` } : null,
    same ? { line: same, text: 'A line with neither mark is unchanged, there to show where the change sits.' } : null,
  ].filter(Boolean);
}

/* What changed: the picture, one plain line on what the code proves, then Help me understand, then the
   change itself, folded (Figma History visual · diff; overview by default, detail on request). The line is
   measured from the diff, never written by a model. */
const proves = (files) => {
  const add = files.reduce((n, f) => n + f.add, 0);
  const del = files.reduce((n, f) => n + f.del, 0);
  const where = files.length === 1 ? fileWords(files[0].path) : `${files.length} files`;
  if (files.length === 1 && files[0].kind === 'new') return `The proof: ${where} is new, ${count(add, 'line')} written from scratch.`;
  return `The proof: in ${where}, ${count(add, 'line')} added (green) and ${count(del, 'line')} taken out (red).`;
};

/* The part before and after, large (her 18 Nov History mock, "omg so cool"; Figma History visual · default):
   the screenshot the commit saved, read from git as it was before the commit and after it. Prefers the
   Chip light picture. A commit that saved no screenshot says so in one line, as Figma draws it. */
const pictureOf = (files) => {
  const pngs = files.filter((f) => /\.png$/i.test(f));
  return pngs.find((f) => /chip-light/i.test(f)) ?? pngs[0] ?? null;
};
function Picture({ rec }) {
  const path = pictureOf(Array.isArray(rec.files) ? rec.files : []);
  const [gone, setGone] = useState({});
  if (!path) return <TextStack body="No before picture: this change saved no screenshot." />;
  const src = (side) => `/history/picture?id=${encodeURIComponent(rec.id)}&path=${encodeURIComponent(path)}&side=${side}`;
  const what = fileWords(path);
  const sides = ['before', 'after'].filter((s) => !gone[s]);
  // neither side could be read (an older server, a moved file): the one line, never a blank space
  if (!sides.length) return <TextStack body="No before picture: this change's screenshot can't be read here." />;
  return (
    // one above the other, each the record's full width, so the part reads large (the mock's "large")
    <Flow gap={16} aria-label={`${what}, before and after`}>
      {sides.map((side) => (
        <Card key={side} media={<img src={src(side)} alt={`${what}, ${side} this change`} loading="lazy" onError={() => setGone((g) => ({ ...g, [side]: true }))} />}>
          <TextStack title={side === 'before' ? 'Before' : sides.length === 1 ? 'New' : 'After'} subtitle={side === 'after' ? [day(rec.date), roleOf(rec.who)].filter(Boolean).join(' · ') : undefined} />
        </Card>
      ))}
    </Flow>
  );
}

function WhatChanged({ diff, rec }) {
  const files = parseDiff(diff).filter((f) => f.body);
  const [file, setFile] = useState(0);
  const [step, setStep] = useState(null);
  const [open, setOpen] = useState(false);
  // each step brings its card and the line it lights into view, inside the record's own scroll
  const here = useRef(null);
  // each step brings the line it lights in just under the step card pinned at the record's top, never under it
  useEffect(() => {
    if (step == null) return;
    requestAnimationFrame(() => {
      const card = here.current?.parentElement;
      const code = card?.parentElement?.querySelector('[data-bella-component="code-block"]');
      // the lit line is the one CodeBlock tells screen readers about (", step N"), found by its words, not its styling
      const lit = [...(code?.querySelectorAll('span') ?? [])].find((e) => !e.childElementCount && e.textContent === `, step ${step + 1}`)?.parentElement;
      if (!lit) return here.current?.scrollIntoView({ block: 'start' });
      lit.scrollIntoView({ block: 'center' });
      const box = card.closest('.chip-flow--scroll, .chip-screen__content');
      const gap = lit.getBoundingClientRect().top - (card.getBoundingClientRect().bottom + 16);
      if (box && gap < 0) box.scrollBy({ top: gap });
    });
  }, [step, file]);
  if (!files.length && !pictureOf(rec.files ?? [])) return null;
  const f = files[file] ?? files[0];
  const steps = f ? walk(f) : [];
  const help = () => (setOpen(true), setStep(0));
  const last = step === steps.length - 1;
  return (
    <Flow gap={8}>
      <SectionHead title="What changed" titleLevel={3} />
      <Picture rec={rec} />
      {files.length ? <TextStack body={proves(files)} /> : null}
      {steps.length ? (
        <Flow direction="row" justify="end">
          <Button variant="tertiary" size="sm" onClick={step == null ? help : () => setStep(null)} ariaExpanded={step != null}>
            Help me understand
          </Button>
        </Flow>
      ) : null}
      {files.length ? (
        <Disclosure flush title="Show the change" summary={count(files.length, 'file')} open={open} onToggle={setOpen}>
          <Flow gap={8}>
            {files.length > 1 ? (
              <Flow direction="row" gap={8} wrap aria-label="Files in this change">
                {files.map((x, i) => (
                  <FilterChip key={x.path} size="compact" pressed={i === file} onClick={() => (setFile(i), setStep(step == null ? null : 0))}>
                    {x.path.split('/').pop()}
                  </FilterChip>
                ))}
              </Flow>
            ) : null}
            {/* the step sits right above the code it explains, its pin on the line it lights */}
            {step != null && steps[step] ? (
              <Flow sticky>
                <span ref={here} />
                <TourStep number={step + 1} count={`${step + 1} of ${steps.length}`} isEnd={last} onBack={step ? () => setStep(step - 1) : undefined} onNext={() => setStep(last ? null : step + 1)} onClose={() => setStep(null)}>
                  {steps[step].text}
                </TourStep>
              </Flow>
            ) : null}
            <CodeBlock key={f.path} code={f.body} language="diff" title={pathTitle(f.path)} copy lineMarks={step != null && steps[step] ? [{ line: steps[step].line, kind: 'lit', pin: step + 1 }] : undefined} />
          </Flow>
        </Disclosure>
      ) : null}
    </Flow>
  );
}

const smoothScroll = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

function Record({ id, fit, landing }) {
  const rec = useRecord(id);
  // opened by a tap on a phone: once its words are here, it scrolls up to the top of the window
  useEffect(() => {
    if (!rec || landing?.current !== id) return;
    landing.current = null;
    requestAnimationFrame(() => document.getElementById('history-record')?.scrollIntoView({ block: 'start', behavior: smoothScroll() }));
  }, [rec, id, landing]);
  const [q, setQ] = useState('');
  const { answer, ask: send, clear, retry, stop } = useAsk();
  // the answer rewrites the Why in place (A, "Rewrite in place", /screens/2026-11-21-history-ask-a-b/; B was
  // too cluttered): plainer words, with Original one click away
  const [plainer, setPlainer] = useState(true);
  // the touched row whose change is open in place
  const [shown, setShown] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => (clear(), setShown(null), setPlainer(true)), [id]);
  if (!rec) return <Card><EmptyState size="lane" title="Opening the record" line="Reading it from git. Two ticks." /></Card>;
  const files = Array.isArray(rec.files) ? rec.files : [];
  // the record's own words go as a source, so the answer can come from the commit itself
  // "explain" or "I don't understand" asks one clear question the model can answer from the commit
  const plainAsk = (t) => (/\b(explain|understand|what does (this|it) mean|simpler)\b/i.test(t) ? 'In simple words, for someone who wasn’t there: what did this change do, and why?' : t);
  // an answer appears where it lands, in view: the record goes back to its top, where the Why is rewritten
  const toTop = () => requestAnimationFrame(() => document.getElementById(`answer-${rec.id}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  const ask = () => q.trim() && (setPlainer(true), toTop(), send(`About ${rec.repo} commit ${rec.sha} ("${rec.title}"): ${plainAsk(q.trim())}`, 'history', { id: rec.id, title: `${rec.repo} commit: ${rec.title}`, text: `${rec.title}\n\n${plainWhy(rec.why)}\n\nFiles: ${files.join(', ') || 'none listed'}` }, q.trim()));
  const shaped = answer?.status === 'answer' && answer.reply ? shapeReply(answer.reply) : null;
  const rewritten = shaped && plainer;
  // the one-line bar above the title while an answer is on: what you see and the way back, on the right
  const bar = !answer ? null : answer.status === 'thinking' ? (
    <Notification tone="info" showIcon={false} title="Reading this change" action={{ label: 'Stop', onClick: stop }} />
  ) : shaped ? (
    <Notification tone="info" showIcon={false} title={plainer ? 'Plainer words' : 'The commit’s own words'} action={{ label: plainer ? 'Original' : 'Plainer words', onClick: () => setPlainer(!plainer) }} />
  ) : (
    <Notification tone="attention" showIcon={false} title={answer.status === 'weak' ? 'The commit doesn’t say' : answer.status === 'stopped' ? 'Stopped before it answered' : 'No answer this time'} action={{ label: 'Try again', onClick: () => retry() }} />
  );
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
          {/* 23 Nov ("the font seems way larger than other places"): the area is the h2 at the part's title size,
              the sentence is body text at the page's reading size with the marker on its key words, as the list beside it */}
          {(() => {
            const t = areaOf(plain(rec.title));
            return t.area ? (
              <>
                <TextStack titleAs="h2" title={t.area} />
                <TextStack body={<Keyed text={t.rest} names={rec.components} />} />
              </>
            ) : (
              <TextStack titleAs="h2" title={<Keyed text={t.rest} names={rec.components} />} />
            );
          })()}
          {/* the counts, once, under the title (her note, 21 Nov: "should these not be at the top").
              Gap: no BELLA part sets numbers in Geist Mono and words in Lexend on one line, so the
              line is TextStack's meta line for now */}
          {/* a decision touches no files: no "0 files · 0 lines" line for it */}
          {files.length ? <TextStack subtitle={countLine(files, rec.stat)} /> : null}
        </Flow>
        {/* the bar sits right on the Why it rewrites, so the two land in view together */}
        {bar ? <div id={`answer-${rec.id}`}>{bar}</div> : null}
        {plainWhy(rec.why) || rewritten ? (
          // the commit's own words, its first sentence up front and the rest under Exact words; never a
          // model-written line (audit 21 Nov r2: invented explanations break "Real"). Commit messages
          // open with one plain sentence for someone who wasn't there: that is the source.
          <Notification
            tone="info"
            showIcon={false}
            title="Why"
            message={rewritten ? (
              // the answer in the Why's place: its verdict with the key phrase and its pin (the pin opens the
              // commit's own words), the rest folded under Detail
              <Flow gap={4} as="span">
                <AnswerLines shaped={{ verdict: shaped.verdict, bullets: [] }} onPin={() => setPlainer(false)} />
                {shaped.bullets.length ? (
                  <Disclosure flush title="Detail">
                    <AnswerLines shaped={{ verdict: shaped.bullets.join(' '), bullets: [] }} onPin={() => setPlainer(false)} />
                  </Disclosure>
                ) : null}
              </Flow>
            ) : (() => {
              const lines = plainWhy(rec.why).split(/\n(?=-\s)|\n{2,}/).map((l) => plain(l.replace(/^-\s*/, '').replace(/\s*\n\s*/g, ' ').trim())).filter(Boolean);
              const first = firstSentence(lines[0] ?? '');
              const rest = [lines[0].slice(first.length).trim(), ...lines.slice(1)].filter(Boolean);
              return (
                <Flow gap={4} as="span">
                  {/* the Why's first sentence marked by the same rule: what changed, not the part */}
                  <span>
                    <Keyed text={first} names={rec.components} />
                  </span>
                  {rest.length ? (
                    <Disclosure flush title="Exact words">
                      <Flow gap={4} as="ul" bullets aria-label="The rest of the commit's words">
                        {rest.map((l) => (
                          <li key={l}>
                            <TextStack body={l} />
                          </li>
                        ))}
                      </Flow>
                    </Disclosure>
                  ) : null}
                  {/* the commit exactly as git has it, for anyone who wants the team's own wording */}
                  {rec.body ? (
                    <Disclosure flush title="The commit as written">
                      <CodeBlock code={plainWhy(rec.body)} language="plain" title={`${rec.repo === 'bella' ? 'BELLA' : 'CHIP'} commit ${rec.sha}`} lineNumbers={false} copy />
                    </Disclosure>
                  ) : null}
                </Flow>
              );
            })()}
          />
        ) : null}
        <WhatChanged key={rec.id} diff={rec.diff} rec={rec} />
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
                <CodeBlock key={d.path} code={d.body || 'No line changes: a binary or renamed file.'} language="diff" title={pathTitle(d.path)} copy />
              ))}
            </Flow>
          ) : null}
        </Flow>
        <Flow gap={8}>
          {/* the field keeps what was asked; the answer is up in the Why, in view */}
          <Input label="Ask about this change" value={q} onChange={setQ} onSend={ask} sendLabel="Ask" />
        </Flow>
      </Flow>
    </Card>
  );
}

export default function HistoryContent() {
  const phone = useNarrow();
  const [draft, setDraft] = useState('');
  // Recent searches: this browser's own, a convenience (lost with site data, never shared)
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('chip:history-recent') ?? '[]');
    } catch {
      return [];
    }
  });
  const { data: bellaData } = useCached(['/data/bella.json']);
  const parts = bellaData?.[0]?.components ?? [];
  // BELLA's part names, so an area that names a part reads as Parts
  PART_NAMES = new Set(parts.map((c) => c.name.toLowerCase()));
  const search = (text) => {
    const t = String(text).trim();
    setDraft(t);
    setQ(t);
    if (!t) return;
    const next = [t, ...recent.filter((r) => r !== t)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem('chip:history-recent', JSON.stringify(next));
    } catch {
      /* no storage: Recent lasts this visit */
    }
  };
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(null);
  const [status, setStatus] = useState([]);
  const [since, setSince] = useState('');
  const [breaking, setBreaking] = useState(false);
  const [filters, setFilters] = useState(false);
  const [open, setOpen] = useState(null);
  const landing = useRef(null);
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
  // a record you open lands in view: beside the list the two panes scroll up to fill the space under the
  // tabs; on a phone, where the record sits under the list, the record itself scrolls into view
  // (independent check, 22 Nov: at 375 a tap changed nothing you could see)
  const openRecord = (id) => {
    setOpen(id);
    if (phone) landing.current = id; // the record scrolls itself into view once it has loaded (Record)
    else requestAnimationFrame(() => document.getElementById('history-frame')?.scrollIntoView({ block: 'start', behavior: smoothScroll() }));
  };
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const extra = status.length + (since ? 1 : 0) + (breaking ? 1 : 0);

  return (
    <>
      <Flow gap={24}>
        {/* Figma's content set opens with its lede (664:123672) */}
        <TextStack body="What we agreed, when and why, across BELLA and CHIP." />
        {/* Search beside the field, lined up with its box (the label sits above); a phone stacks them */}
        <Flow direction={phone ? 'column' : 'row'} gap={8} grow={phone ? undefined : 'first'} as="form" role="search" onSubmit={(e) => (e.preventDefault(), search(draft))}>
          {/* Ask suggestions (Figma Flow 5, screen 2): the field opens matching parts and pages, then
              Recent; picking one searches the record for it (screen 4, "Only the fixes for Button") */}
          <Combobox
            label="Ask about a change, in plain words"
            search
            value={draft}
            onChange={setDraft}
            groups={[
              { id: 'match', label: 'Parts and pages', options: find(draft, parts).map((x) => ({ id: x.key, label: x.title, meta: x.where })) },
              { id: 'recent', label: 'Recent', options: recent.filter((r) => !draft.trim() || r.toLowerCase().includes(draft.trim().toLowerCase())).map((r) => ({ id: `recent:${r}`, label: r })) },
            ]}
            onSelect={(o) => search(o.label)}
          />
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
        <Flow fit={!phone} span={12} direction={phone ? 'column' : 'row'} gap={24} id="history-frame">
          <Flow span={5}>
            {/* the count follows search, chips and filters: the server's matches (count), not every record (total) */}
            <Activity records={records} total={data.count ?? data.total} open={open} onOpen={openRecord} fit={!phone} />
          </Flow>
          <Flow span={7} id="history-record">
            {/* a new record opens at its top (keyed), never mid-scroll from the last one */}
            <Record key={open} id={open} fit={!phone} landing={landing} />
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
              Show {data?.count ?? data?.total ?? ''} {(data?.count ?? data?.total) === 1 ? 'record' : 'records'}
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
