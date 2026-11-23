// A source: who said it, what it is called, when, and a way to read it (Elleta, 23 Nov 2026: "it should show the actual
// article, study, whatever, and give an option to view it if possible"). One row, used wherever CHIP gives a reason.
// The row says what kind it is (Standard, Talk, House rule), the author and title, and the date; View opens the text
// right under the row, inside the drawer, and the original is always a visible link on the row itself, marked as
// leaving CHIP (her pick B, 23 Nov: "i like b but it would be nice to have the link to the resource as well"). The
// sites behind these refuse to be framed (checked 23 Nov: w3.org, smashingconf.com, smashingmagazine.com) and CHIP
// copies no text from them. What View shows is only ever our own words, always labelled:
//   note       CHIP's own saved note of a talk, never passed off as the talk
//   rule       a house rule's section, in our own file
// A standard (WCAG) has no View: who, what, when and the link are the whole row. Same opening-in-place rule as Ask
// BELLA's citations (BELLA rules/ask-bella-and-chat.md: a source opens in place, never a new screen).
// Nothing saved and no original: the row says so, it never shows a blank. Data: server/lib/sources.mjs, GET /sources.
// BELLA parts only: ListRow, Button, Link, TextStack, Flow. Gap named: the "leaves CHIP" mark is Link's `external` with
// the host in the words; BELLA has no icon that says it (a plain arrow already means open inside).
import { useEffect, useState } from 'react';
import ListRow from '@bella/components/ListRow/ListRow';
import Button from '@bella/components/Button/Button';
import Link from '@bella/components/Link/Link';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

const KIND = { standard: 'Standard', talk: 'Talk', house: 'House rule', data: 'Data' };
const TEXT_LABEL = {
  note: () => 'CHIP’s note of the talk, not the original',
  rule: () => 'Our own rule file, as written',
};
const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'the site';
  }
};

let listed = null;
/** The registry once per page load: { id: meta }. null while it loads. */
export function useSources() {
  const [all, setAll] = useState(listed);
  useEffect(() => {
    if (listed) return;
    fetch('/sources')
      .then((r) => r.json())
      .then((d) => {
        listed = Object.fromEntries((d.sources ?? []).map((s) => [s.id, s]));
        setAll(listed);
      })
      .catch(() => setAll({}));
  }, []);
  return all;
}

// markdown out of a saved note: bold marks and list dashes, so the reader shows words, not syntax
const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#+\s*/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
function Reader({ id, meta, heading }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`/sources/${id}${heading ? `?heading=${encodeURIComponent(heading)}` : ''}`)
      .then((r) => r.json())
      .then((d) => live && setS(d))
      .catch(() => live && setS({ error: 'CHIP could not read it just now.' }));
    return () => {
      live = false;
    };
  }, [id, heading]);
  if (!s) return <TextStack body="Reading…" />;
  const paras = s.text ? plain(s.text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];
  return (
    <Flow gap={12}>
      {s.text ? <TextStack overline={TEXT_LABEL[s.textKind]?.(meta)} /> : null}
      {paras.map((p, i) =>
        /^- /m.test(p) ? (
          <Flow as="ul" gap={4} bullets key={i} aria-label="From the source">
            {p.split('\n').filter(Boolean).map((l, j) => (
              <li key={j}>{l.replace(/^- /, '')}</li>
            ))}
          </Flow>
        ) : (
          <TextStack key={i} body={p} />
        ),
      )}
      {!s.text ? <TextStack body={s.error ?? (meta.original ? 'CHIP has no note of this saved here. The original is linked on the row.' : 'No note of this is saved here, and it has no public page.')} /> : null}
    </Flow>
  );
}

/** One source row. `says`: one plain line of what it says for this finding (optional). */
export default function Source({ id, says, heading }) {
  const all = useSources();
  const [open, setOpen] = useState(false);
  const base = all?.[id];
  if (!base || (base.id === 'chip-claude' && !heading)) return null;
  const meta = heading ? { ...base, title: `${base.title}, ${heading}` } : base;
  const canView = meta.readable;
  return (
    <Flow gap={8}>
      <ListRow
        layout="stacked"
        overline={KIND[meta.kind] ?? 'Source'}
        title={`${meta.author}: ${meta.title}`}
        description={[meta.date, meta.level ? `level ${meta.level}` : null].filter(Boolean).join(' · ') || undefined}
        body={
          says || meta.original ? (
            <Flow gap={4}>
              {says ? <TextStack body={says} /> : null}
              {meta.original ? <TextStack body={<Link href={meta.original} external>{`Read it on ${hostOf(meta.original)} (opens the site)`}</Link>} /> : null}
            </Flow>
          ) : undefined
        }
        actionButton={
          canView ? (
            <Button variant="secondary" size="sm" ariaExpanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'View'}
            </Button>
          ) : undefined
        }
      />
      {open ? (
        <Flow inset>
          <Reader id={id} meta={meta} heading={heading} />
        </Flow>
      ) : null}
    </Flow>
  );
}

/** Several sources under one heading-less group, in the given order. */
export function Sources({ ids, label = 'Sources' }) {
  return (
    <Flow gap={8} as="div" role="group" aria-label={label}>
      {ids.map((id) => (
        <Source key={id} id={id} />
      ))}
    </Flow>
  );
}
