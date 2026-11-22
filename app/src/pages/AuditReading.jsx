// An audit's saved report, read inside the Health drawer (CHIP rule 23 Nov: "Nothing sends her out of CHIP"; a drawer is a
// reading surface): what it means in one line, the score as a bar with its number, the stations as rows that say their
// state in a word as well as a colour, the top work orders with the key words marked, what to do first, then the rest
// behind Disclosures. Every number comes from the report (auditReport.js). BELLA parts only: SectionHead, TextStack,
// Progress, ListRow, StatusPill, Notification, Disclosure; the marker is History's (templates/Keyed.jsx).
import { useEffect, useState } from 'react';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Progress from '@bella/components/Progress/Progress';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Notification from '@bella/components/Notification/Notification';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import { Inset, ReadingGroups, ReadingSection } from '../templates/ReadingDrawer.jsx';
import Keyed from '../templates/Keyed.jsx';
import { greenFrom, parseReport } from './auditReport.js';

// the state words CHIP uses everywhere, never the colour's name (her 22 Nov: "why are we naming them colors"); the colour and shape stay as the signal
const WORD = { red: 'Failing', yellow: 'Needs work', green: 'Healthy' };
const TONE = { red: 'danger', yellow: 'attention', green: 'success' };
const PILL = { red: 'danger', yellow: 'attention', green: 'success' };
const up = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const oneSentence = (s) => (s.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? s).replace(/\.$/, '');

/* A long line shows its first sentence, and Read more opens the rest where it is: nothing is cut with an ellipsis
   (her 22 Nov: "The cost is real all the…" with no way to read the rest). */
function ReadMore({ text }) {
  const [open, setOpen] = useState(false);
  const first = oneSentence(text);
  const more = first.length < text.replace(/\.$/, '').length;
  return (
    <Flow gap={4}>
      <TextStack body={<Keyed text={open || !more ? text : `${first}.`} />} />
      {more ? (
        <Flow direction="row" justify="start">
          <Button variant="tertiary" size="sm" ariaExpanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</Button>
        </Flow>
      ) : null}
    </Flow>
  );
}

export default function AuditReading({ a, day }) {
  const [state, setState] = useState({ r: null, error: false });
  useEffect(() => {
    let live = true;
    fetch(`/audits/${a.id}/report`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((t) => live && setState({ r: parseReport(t), error: false }))
      .catch(() => live && setState({ r: null, error: true }));
    return () => {
      live = false;
    };
  }, [a.id]);

  if (state.error) return <Inset><Notification tone="danger" title="The saved report did not open" message="CHIP could not read this audit's report file. The card still shows its last numbers." /></Inset>;
  if (!state.r) return <Inset><Notification tone="info" title="Reading the report" message="Opening this audit's saved report." /></Inset>;
  const { r } = state;
  const first = r.orders[0];
  const top = r.orders.slice(0, 3);
  const bar = greenFrom(r.stations);
  const outOf100 = a.unit === 'of 100';
  const fill = a.value == null ? null : a.checks && !outOf100 && /checks green/.test(a.unit ?? '') ? (a.value / a.checks) * 100 : a.value;
  const tone = a.red ? 'danger' : a.yellow ? 'attention' : 'success';
  const lightWords = a.red == null ? null : `${a.red} failing · ${a.yellow} need work · ${a.green} healthy`;
  const item = (s) => ({
    key: s.n,
    title: s.name,
    body: s.evidence.length ? <Flow gap={8}>{s.evidence.map((e, i) => <ReadMore key={i} text={e} />)}</Flow> : undefined,
    line: [s.score != null ? `${s.score}${s.max === 100 ? ' of 100' : `/${s.max}`}` : null, s.line || null].filter(Boolean).join(' · ') || undefined,
  });
  const scored = r.stations.some((s) => s.score != null);

  return (
    <Flow gap={24}>
      <Inset gap={8}>
        <SectionHead icon="Page" iconTone="info" title={r.title || `${a.title} audit`} description={`Ran ${day}`} showInfo={false} />
        {r.meaning ? <TextStack body={<Keyed text={r.meaning} />} /> : null}
      </Inset>

      {fill != null ? (
        <Inset gap={12}>
          <SectionHead icon="Activity" iconTone="info" title="Score" description={lightWords ?? 'From the saved report'} showInfo={false} />
          <Progress
            label={`${a.title} score`}
            value={`${a.value} ${a.unit ?? ''}`.trim()}
            fill={fill}
            tone={tone}
            showTarget={outOf100 && bar != null}
            target={outOf100 && bar != null ? bar * 10 : undefined}
            targetLabel={outOf100 && bar != null ? `Target ${bar * 10}` : undefined}
            callout
          />
          {r.stations.length ? (
            <Flow gap={12} as="ul" aria-label={`${a.title}: each ${scored && r.stations[0].max === 100 ? 'flow' : 'check'} and its state`}>
              {r.stations.map((s) => (
                <li key={s.n}>
                  {s.score != null ? (
                    <Progress
                      label={s.name}
                      value={`${s.light ? `${WORD[s.light]} · ` : ''}${s.score}${s.max === 100 ? ' of 100' : `/${s.max}`}`}
                      fill={(s.score / s.max) * 100}
                      tone={s.light ? TONE[s.light] : 'info'}
                      showTarget={false}
                    />
                  ) : (
                    <ListRowGroup ariaLabel={s.name}>
                      <ListRow layout="stacked" statusBar={s.light ? TONE[s.light] : 'neutral'} title={s.name} description={s.line || undefined} status={s.light ? <StatusPill variant={PILL[s.light]}>{WORD[s.light]}</StatusPill> : undefined} />
                    </ListRowGroup>
                  )}
                </li>
              ))}
            </Flow>
          ) : null}
        </Inset>
      ) : null}

      {top.length ? (
        <ReadingSection icon="WarningCircle" iconTone="warning" title="Top work orders" description="Most important first, from the saved report" rows={
          <ListRowGroup ariaLabel={`${a.title}: top work orders`}>
            {top.map((o) => (
              <ListRow key={o.n} layout="stacked" statusBar="attention" title={<Keyed text={o.title} />} description={o.why ? <ReadMore text={o.why} /> : undefined} />
            ))}
          </ListRowGroup>
        } />
      ) : null}

      {first ? <Inset><Notification tone="info" title="Do this first" message={<Keyed text={first.move ? `${first.title}: ${up(first.move)}` : first.title} />} /></Inset> : null}

      {r.orders.length > top.length ? (
        <Inset>
        <Disclosure title="Every work order" summary={`${r.orders.length} in all`}>
          <Flow gap={12}>
            {r.orders.slice(top.length).map((o) => (
              <TextStack key={o.n} title={o.title} body={o.move || o.why ? <ReadMore text={o.move ? up(o.move) : o.why} /> : undefined} />
            ))}
          </Flow>
        </Disclosure>
        </Inset>
      ) : null}

      {r.stations.length ? (
        <Flow gap={12}>
          <Inset>
            <SectionHead icon="Activity" iconTone="info" title="Every station" description="Grouped by state, with the evidence behind each" showInfo={false} />
          </Inset>
          <ReadingGroups
            single
            openFirst
            label={`${a.title}: stations by state`}
            groups={[
              ...['red', 'yellow', 'green'].map((l) => ({ name: WORD[l], tone: TONE[l], items: r.stations.filter((s) => s.light === l).map((s) => item(s)) })),
              { name: 'Not rated', tone: 'neutral', items: r.stations.filter((s) => !s.light).map((s) => item(s)) },
            ]}
          />
        </Flow>
      ) : null}
    </Flow>
  );
}
