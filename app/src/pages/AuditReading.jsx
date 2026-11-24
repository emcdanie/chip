// An audit's saved report, read inside the Health drawer, on the one drawer template (CHIP READ FIRST, 23 Nov: "Nothing
// sends her out of CHIP"; "A score says why it moved and how to reach 100, with the plan, in the same drawer"):
//   title and status    the audit, and its Failing / Needs work / Healthy counts in words
//   answer              the score, why it moved (the last report before it), and what reaching 100 takes
//   picture             the score as a bar with the skill's own bar as the target tick
//   do this first       one-line bar
//   work orders         a table (her pick: "the table with filter buttons above it"); a row opens the order, with Back
//   stations            branch rows by state, one open
//   plan                the work orders as one plan to Start
//   source              the saved report and the day it ran
// Every number comes from the report (auditReport.js); nothing is typed. BELLA parts only.
import Marker from '@bella/components/Marker/Marker';
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Notification from '@bella/components/Notification/Notification';
import Progress from '@bella/components/Progress/Progress';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from '../templates/Flow.jsx';
import { measuredMinutes, useFixPlan } from '../templates/FixPlan.jsx';
import ReadingDrawer, { Facts, Inset, ReadingTable, ReadingTop } from '../templates/ReadingDrawer.jsx';
import useCached from '../templates/useCached.js';
import { auditTone, greenFrom, parseReport } from './auditReport.js';

// the state words CHIP uses everywhere, never the colour's name (her 22 Nov: "why are we naming them colors")
const WORD = { red: 'Failing', yellow: 'Needs work', green: 'Healthy' };
const up = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const oneSentence = (s) => (s.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? s).replace(/\.$/, '');
const dayOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* A long line shows its first sentence, and Read more opens the rest where it is: nothing is cut with an ellipsis
   (her 22 Nov: "The cost is real all the…" with no way to read the rest). */
function ReadMore({ text }) {
  const [open, setOpen] = useState(false);
  const first = oneSentence(text);
  const more = first.length < text.replace(/\.$/, '').length;
  return (
    <Flow gap={4}>
      <TextStack body={open || !more ? text : `${first}.`} />
      {more ? (
        <Flow direction="row" justify="start">
          <Button variant="tertiary" size="sm" ariaExpanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</Button>
        </Flow>
      ) : null}
    </Flow>
  );
}

/* Why the score moved and what 100 takes, in one line: each number says what it counts. */
function answerOf(a, orders) {
  const score = a.value == null ? null : <Marker>{`${a.value} ${a.unit ?? ''}`.trim()}</Marker>;
  const moved = a.prev ? (a.prev.value === a.value ? `, the same as on ${dayOf(a.prev.day)}` : `, ${a.value > a.prev.value ? 'up' : 'down'} from ${a.prev.value} on ${dayOf(a.prev.day)}`) : ', the first report kept';
  const reach = orders ? ` Reaching ${a.unit === 'of 100' ? '100' : 'the top'} means the ${orders === 1 ? 'work order' : `${orders} work orders`} below, most important first.` : '';
  return score ? <>{score}{`${moved}.${reach}`}</> : `No score in the report.${reach}`;
}

/* The audit's plan: every work order, most important first, then the audit run again. */
function auditPlan(a, r, day, runs) {
  return {
    title: `Reach ${a.unit === 'of 100' ? '100' : 'the top'} on the ${a.title} audit`,
    from: `Health · ${a.title} audit`,
    summary: `${r.orders.length} work orders from the report, most important first. Doing them and running the audit again moves the score.`,
    brief: [`Work through the ${a.title} audit's work orders (the saved report of ${day}), most important first, one commit each:`, ...r.orders.map((o) => `- ${o.title}${o.move ? `: ${up(o.move)}` : ''}`), 'Then run the audit again, read only, and save its report.'].join('\n'),
    minutes: measuredMinutes(runs),
    expect: 'a card on Work; the audit runs again for the new score; nothing is pushed.',
  };}

export default function AuditReading({ a, day, lights, open, onClose }) {
  const [state, setState] = useState({ r: null, error: false });
  const [order, setOrder] = useState(null);
  // a station's evidence opens behind its row, with Back (an open group listed every station's evidence: about 3,200px)
  const [station, setStation] = useState(null);
  // the report opens on its summary; every work order is a table one click behind (See all), as Drift
  const [all, setAll] = useState(false);
  const runs = useCached(['/runs']).data?.[0]?.runs ?? [];
  useEffect(() => {
    if (!open || state.r) return undefined;
    let live = true;
    fetch(`/audits/${a.id}/report${a.at ? `?day=${a.at}` : ''}`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((t) => live && setState({ r: parseReport(t), error: false }))
      .catch(() => live && setState({ r: null, error: true }));
    return () => {
      live = false;
    };
  }, [a.id, a.at, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => (setOrder(null), setStation(null), setAll(false), onClose());
  const shell = { open, onClose: close, label: `${a.title} audit`, status: lights };
  // the plan's Start and Execute now sit in the report's footer, only on the report itself
  const fix = useFixPlan(state.r?.orders.length && !station && !order && !all ? auditPlan(a, state.r, day, runs) : null, close);

  if (state.error) return <ReadingDrawer {...shell}><Inset><Notification tone="danger" title="The saved report did not open" message="CHIP could not read this audit's report file. The card still shows its last numbers." /></Inset></ReadingDrawer>;
  if (!state.r) return <ReadingDrawer {...shell}><Inset><Notification tone="info" title="Reading the report" message="Opening this audit's saved report." /></Inset></ReadingDrawer>;
  const { r } = state;
  const source = { from: `The saved ${a.title} audit report`, when: `ran ${day}` };

  if (station) {
    return (
      <ReadingDrawer {...shell} label={station.name} status={[station.light ? WORD[station.light] : null, station.score != null ? `${station.score} of ${station.max}` : null].filter(Boolean).join(' · ')} onBack={() => setStation(null)} backLabel="Back to the report" source={source}>
        <Inset gap={12}>
          {station.line ? <TextStack body={station.line} /> : null}
          {station.evidence.map((e, i) => <ReadMore key={i} text={e} />)}
        </Inset>
      </ReadingDrawer>
    );
  }

  // a work order, opened from the table: what it is, why, the first move; Back to the report
  if (order) {
    return (
      <ReadingDrawer {...shell} label={`Work order ${order.n}`} status={order.title} onBack={() => setOrder(null)} backLabel={all ? 'Back to all work orders' : 'Back to the report'} source={source}>
        <Inset>
          <Facts label={`Work order ${order.n}`} facts={[{ label: 'Why', value: order.why || null }, { label: 'First move', value: order.move ? up(order.move) : null }]} />
        </Inset>
      </ReadingDrawer>
    );
  }

  if (all) {
    return (
      <ReadingDrawer {...shell} label="Every work order" status={`${r.orders.length} from the ${a.title} audit, most important first`} onBack={() => setAll(false)} backLabel="Back to the report" source={source}>
        <ReadingTable
          unit="work orders"
          caption="Work orders, most important first"
          rowKey="n"
          rows={r.orders.map((o) => ({ ...o, order: o.title }))}
          columns={[
            { key: 'order', label: 'Work order' },
            { key: 'n', label: 'Rank', numeric: true },
          ]}
          onOpen={(n) => setOrder(r.orders.find((o) => String(o.n) === String(n)))}
        />
      </ReadingDrawer>
    );
  }

  const bar = greenFrom(r.stations);
  const outOf100 = a.unit === 'of 100';
  const fill = a.value == null ? null : a.checks && !outOf100 && /checks healthy/.test(a.unit ?? '') ? (a.value / a.checks) * 100 : a.value;
  const tone = { danger: 'danger', warning: 'attention', success: 'success', neutral: 'neutral' }[auditTone(a)];


  return (
    <ReadingDrawer
      {...shell}
      answer={answerOf(a, r.orders.length)}
      picture={
        fill != null ? (
          <Progress
            label={`${a.title} score`}
            value={`${a.value} ${a.unit ?? ''}`.trim()}
            fill={fill}
            tone={tone}
            showTarget={outOf100 && bar != null}
            target={outOf100 && bar != null ? bar * 10 : undefined}
            targetLabel={outOf100 && bar != null ? `Healthy from ${bar * 10}` : undefined}
          />
        ) : undefined
      }
      source={source}
      footer={fix.footer}
      footerNote={fix.footerNote}
    >
      {r.orders.length ? (
        <ReadingTop
          label="Do these first"
          rows={r.orders.slice(0, 3).map((o) => ({ key: o.n, title: o.title, onClick: () => setOrder(o) }))}
          more={r.orders.length > 3 ? `See all ${r.orders.length} work orders` : undefined}
          onMore={r.orders.length > 3 ? () => setAll(true) : undefined}
        />
      ) : null}
      {r.stations.length ? (
        // the stations as one table, the state words as filter chips above it (23 Nov evening: tighter rows; drawer-data-types
        // "grouped findings": each group a short table); a row opens the station's evidence
        <ReadingTable
          caption={`${a.title}: ${r.stations[0].max === 100 ? 'flows' : 'stations'}`}
          rowKey="key"
          unit={r.stations[0].max === 100 ? 'flows' : 'stations'}
          rows={r.stations.map((s) => ({ key: String(s.n), station: s.name, state: s.light ? WORD[s.light] : 'Not rated', score: s.score != null ? `${s.score} of ${s.max}` : '—' }))}
          columns={[
            { key: 'station', label: r.stations[0].max === 100 ? 'Flow' : 'Station' },
            { key: 'state', label: 'State', stackUnder: true, byFilter: true },
            { key: 'score', label: 'Score', numeric: true },
          ]}
          filters={[{ value: 'all', label: 'All' }, ...['red', 'yellow', 'green'].map((l) => ({ value: l, label: WORD[l], test: (x) => x.state === WORD[l] })), { value: 'none', label: 'Not rated', test: (x) => x.state === 'Not rated' }]}
          onOpen={(k) => setStation(r.stations.find((x) => String(x.n) === String(k)))}
        />
      ) : null}
      {fix.body}
    </ReadingDrawer>
  );
}
