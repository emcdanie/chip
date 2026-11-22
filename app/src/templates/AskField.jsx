// One Ask field for every page (Elleta, 22 Nov, on History's record: "ask about this change is too hidden and doesnt
// come with suggestions"). The field with the likely next question as grey text (Enter sends it, typing replaces it),
// suggestion chips beside it that each send at once, and the answer right under it: who answered (BELLA · model),
// the answer, the numbers with their source, "Show data" with the real rows, and one line on why that model.
// The page owns the useAsk() (so it can clear it when the thing asked about changes) and hands it in as `asker`.
import { useState } from 'react';
import Input from '@bella/components/Input/Input';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from './Flow.jsx';
import { AnswerLines, NotAnswered, Reply, Ticks, shapeReply, useCitations } from './useAsk.jsx';

/* What a data answer rests on (her 23 Nov: real data): each source's numbers with its name and when it was
   measured, then "Show data" with the real rows, as a table. Never the raw document. */
export function DataAnswer({ data }) {
  return (
    <Flow gap={12}>
      {data.map((d) => (
        <Flow key={d.n} gap={4}>
          <TextStack subtitle={`${d.title} · ${d.source} · ${d.measured}`} />
          <Flow as="ul" gap={4} bullets aria-label={`${d.title}: the numbers`}>
            {d.facts.slice(0, 8).map((f) => (
              <li key={f.label}>
                <TextStack body={`${f.label}: ${f.value}`} />
              </li>
            ))}
          </Flow>
        </Flow>
      ))}
      <Disclosure title="Show data">
        <Flow gap={16}>
          {data
            .filter((d) => d.rows?.length)
            .map((d) => (
              <Flow key={d.n} gap={8}>
                <TextStack subtitle={`${d.title} · ${d.rows.length} ${d.rows.length === 1 ? 'row' : 'rows'} · ${d.measured}`} />
                {/* rows wrap at any width: a table here made the bubble wider than the phone-width panel */}
                <Flow as="ul" gap={8} aria-label={`${d.title}: the rows`}>
                  {d.rows.slice(0, 12).map((r, i) => {
                    const [first, ...rest] = d.columns.map((c) => [c, r[c]]).filter(([, v]) => v !== '' && v != null);
                    return (
                      <li key={i}>
                        <TextStack title={String(first?.[1] ?? '')} subtitle={rest.map(([c, v]) => `${c} ${v}`).join(' · ') || undefined} />
                      </li>
                    );
                  })}
                </Flow>
                {d.rows.length > 12 ? <TextStack subtitle={`${d.rows.length - 12} more rows`} /> : null}
              </Flow>
            ))}
        </Flow>
      </Disclosure>
    </Flow>
  );
}


/**
 * asker: useAsk() of the page. page / record: what the question is about (record = { id, title, text } makes the
 * record the only source). suggestions: questions built from that thing's own data; the first not yet asked is
 * the grey ghost. data: [{ n, title, source, measured, facts, columns, rows }] shown under "Show data".
 * onAgent(): the answer's follow-up when it needs work CHIP cannot measure.
 */
export default function AskField({ asker, label, page, record, suggestions = [], data = null, placeholder }) {
  const [q, setQ] = useState('');
  const { answer } = asker;
  const { openPin, citation } = useCitations(answer?.status === 'answer' ? answer : null);
  const asked = new Set([answer?.q].filter(Boolean));
  const ghost = suggestions.find((s) => !asked.has(s));
  const send = (text) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    asker.ask(t, page, record, t);
    setQ('');
  };
  const shaped = answer?.status === 'answer' && answer.reply ? shapeReply(answer.reply) : null;
  return (
    <Flow gap={12}>
      <Input label={label} placeholder={placeholder} value={q} onChange={setQ} onSend={send} sendLabel="Ask" suggestion={ghost} />
      {suggestions.length ? (
        <Flow direction="row" gap={8} wrap aria-label={`Questions to ask: ${label}`}>
          {suggestions.map((s) => (
            <ActionChip key={s} onClick={() => send(s)}>
              {s}
            </ActionChip>
          ))}
        </Flow>
      ) : null}
      {answer ? (
        <Flow gap={12} aria-live="polite">
          <TextStack subtitle={answer.q} />
          {answer.status === 'thinking' ? (
            <Flow gap={8}>
              <Flow direction="row" justify="between" align="center" gap={8}>
                <TypingDots name="BELLA" />
                <Button variant="tertiary" size="sm" onClick={asker.stop}>
                  Stop
                </Button>
              </Flow>
              <Ticks steps={answer.steps ?? []} />
            </Flow>
          ) : null}
          {shaped ? (
            <Reply who={answer.model ? `BELLA · ${answer.model}` : 'BELLA'} disc="B">
              <Flow gap={12}>
                <AnswerLines shaped={shaped} onPin={openPin} />
                {answer.data?.length ? <DataAnswer data={answer.data} /> : null}
                {!answer.data?.length && data?.length ? <DataAnswer data={data} /> : null}
              </Flow>
            </Reply>
          ) : null}
          {shaped ? citation : null}
          {shaped && answer.route?.why ? <TextStack subtitle={`${answer.route.why}.`} /> : null}
          {answer.status === 'weak' || answer.status === 'error' || answer.status === 'stopped' ? <NotAnswered a={answer} onRetry={asker.retry} /> : null}
        </Flow>
      ) : null}
    </Flow>
  );
}
