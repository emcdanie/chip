// Team · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:82090): default 612:81339, draft 612:81478, sent 612:81620, agent quiet
// 612:81750. Built from BELLA parts and the template's Flow only; no page CSS.
//
// Data is CHIP's own: her Claude Code sessions (/work/sessions, the app's own records, read only: who is working, what
// each last reported, who waits on her; 24 Nov: Team read 0 working while a dozen sessions worked), CHIP's runs, the
// relay agents, their asks and last report from The Bar (/bar/state, server/lib/bar.mjs), open PRs from /projects. A reply goes
// to the progress board (localhost:3123/answers) like Mark up, where the
// coordinator passes it on; CHIP has no send-to-agent route of its own.
// CHIP writes no drafts yet, so the draft state shows only when a draft is
// passed in (the story does, from teamFixture.js).
//
// Part gaps (reported, not styled around): Input has no inline send button
// (Figma draws one in the field), so Send sits beside it. Icon gap: Figma's
// chat-bubble and shield-check (Iconoir) are not in BELLA's registry yet;
// InfoCircle and CheckCircle stand in until they are added.
import { Fragment, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import ChatThread, { ChatThreadDelivered, ChatThreadTimestamp } from '@bella/components/ChatThread/ChatThread';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import ListRow from '@bella/components/ListRow/ListRow';
import TextStack from '@bella/components/TextStack/TextStack';
import Notification from '@bella/components/Notification/Notification';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Tag from '@bella/components/Tag/Tag';
import Flow from '../templates/Flow.jsx';
import { Reply } from '../templates/TermChat.jsx';
import { laneState, daysQuiet, QUIET_DAYS, STATUS_Q, workStatus } from './workModel.js';
import { AnswerLines } from '../templates/useAsk.jsx';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import { openWork, sessionLine, sessionState } from '../templates/WorkDock.jsx';
import { activityRow, isGoing } from '../runClock.js';
import { markOf } from '../templates/marks.js';

export const BOARD = 'http://localhost:3123';
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const DAY = 86400000;

const dateOf = (t) => {
  if (!t) return '';
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
// one short sentence for scanning; the whole ask is in the agent's lane
const short = (t = '', n = 60) => {
  const one = t.split(/(?<=[?.!])\s/)[0];
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const firstLine = (s = '') => s.replace(/^#+\s*/, '').split('\n')[0].trim();

/** CHIP's data for the page: lanes and today's reports from The Bar, open PRs from /projects. */
export function useTeamData() {
  const [data, setData] = useState({ state: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.all([fetch('/bar/state').then((r) => (r.ok ? r.json() : Promise.reject())), fetch('/projects').then((r) => (r.ok ? r.json() : { projects: [] })), fetch('/runs').then((r) => (r.ok ? r.json() : { runs: [] })), fetch('/work/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })).catch(() => ({ sessions: [] }))])
      .then(([bar, proj, runs, ses]) => {
        if (!live) return;
        const lanes = bar.lanes ?? [];
        const asks = lanes.flatMap((l) => (l.status === 'waiting on you' ? (l.needs ?? []).map((n, i) => ({ id: `${l.id}-${i}`, agent: l.name, text: n.text, at: l.updated })) : []));
        const today = new Date().toDateString();
        const thread = (bar.events ?? [])
          .filter((e) => e.kind === 'report' && e.text && new Date(e.t).toDateString() === today)
          .slice(-6)
          .map((e) => {
            const lane = lanes.find((l) => l.id === e.lane);
            return { id: String(e.t), at: e.t, lane: e.lane, who: lane?.name ?? e.lane, text: firstLine(e.text), waiting: lane?.status === 'waiting on you' };
          })
          // only an agent's latest message carries "Waiting on you"
          .map((m, i, all) => ({ ...m, waiting: m.waiting && !all.slice(i + 1).some((n) => n.lane === m.lane) }));
        const sessions = ses.sessions ?? [];
        const going = (runs.runs ?? []).filter(isGoing);
        // her sessions that wait on her are asks too: they open in the Sessions panel, where she reads what they need
        const sessionAsks = sessions.filter((x) => sessionState(x)[1] === 'attention').map((x) => ({ id: `session-${x.id}`, session: x.id, agent: x.title, text: x.status?.needs || x.report || x.status?.detail || 'Waiting on you', at: x.reportedAt ?? x.updatedAt }));
        // today's reports from her sessions join the chat, oldest first, each under its session's name
        const reports = sessions
          .filter((x) => x.report && x.reportedAt && new Date(x.reportedAt).toDateString() === today)
          .map((x) => ({ id: `s-${x.id}`, at: x.reportedAt, lane: x.id, who: x.title, text: x.report.split(/(?<=[.!?])\s/)[0], waiting: sessionState(x)[1] === 'attention' }));
        const quiet = lanes
          .filter((l) => laneState(l) === 'quiet')
          .map((l) => ({ name: l.name, role: l.role, days: daysQuiet(l), at: l.updated }))
          .sort((a, b) => b.days - a.days)[0];
        setData({
          state: 'ready',
          agents: lanes.length,
          // the header light's count (runClock lightOf): sessions whose turn is open plus CHIP's runs going
          working: sessions.filter((x) => x.working).length + going.length,
          sessions,
          going: going.map((r) => activityRow(r, null)),
          sessionsAt: ses.at ?? null,
          prs: (proj.projects ?? []).reduce((n, p) => n + (typeof p.prs === 'number' ? p.prs : 0), 0),
          asks: [...sessionAsks, ...asks],
          thread: [...thread, ...reports].sort((a, b) => a.at - b.at).slice(-8),
          // a relay agent quiet for weeks is history, not news: the notice only within two weeks (24 Nov: it opened the
          // page on "quiet for 40 days" while a dozen sessions worked)
          quiet: quiet && quiet.days <= 14 ? quiet : null,
        });
      })
      .catch(() => live && setData({ state: 'error' }));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/**
 * data: from useTeamData() (or a story's fixture).
 * draft: optional { ask, text }: an agent's draft reply, shown as Figma's draft state.
 * sent / reply: optional, for reviewing Figma's sent state (teamFixture.js):
 * replies already sent this visit, and the agent's answer after them.
 */
export default function TeamContent({ data, draft = null, sent: sentBefore = [], reply = null }) {
  const [replyTo, setReplyTo] = useState(draft?.ask ?? null);
  const [text, setText] = useState(draft?.text ?? '');
  const [sent, setSent] = useState(sentBefore); // { ask, text } you sent this visit
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState(null); // CHIP's answer to a status question
  // the draft state: the reply field takes focus, so it reads as "your turn" at a glance
  useEffect(() => {
    if (draft) document.getElementById('team-reply')?.focus();
  }, [draft]);

  if (data.state === 'loading') return <EmptyState size="lane" title="Getting the team" />;
  if (data.state === 'error')
    return <Notification tone="danger" title="The team" message="The Bar isn't answering, so CHIP can't read it. Start CHIP, then try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />;

  // the review fixtures (teamFixture.js) carry no sessions
  data = { sessions: [], going: [], ...data };
  const answered = new Set(sent.map((s) => s.ask?.id));
  const open = data.asks.filter((a) => !answered.has(a.id));
  // One count everywhere: like /needs (the panel's "Needs you"), an ask quiet
  // for over a week is history, not something waiting on you (19 Nov audit).
  const asks = open.filter((a) => Date.now() - a.at <= QUIET_DAYS * DAY);
  const older = open.filter((a) => Date.now() - a.at > QUIET_DAYS * DAY);
  const isDraft = draft && replyTo?.id === draft.ask?.id && text === draft.text;

  const askRow = (a) => (
    <ListRow
      key={a.id}
      layout="stacked"
      selected={replyTo?.id === a.id}
      title={a.agent}
      // Figma: the ask and its date as one short Geist Mono line (ListRow meta)
      meta={`${short(a.text)} · ${dateOf(a.at)}`}
      statusDot={a.session ? <StatusDot tone="attention" label="waiting on you" showLabel={false} /> : undefined}
      actionButton={
        a.session ? (
          <Button variant="secondary" size="sm" ariaLabel={`Open ${a.agent}`} onClick={() => openWork('sessions', a.session)}>
            Open
          </Button>
        ) : (
          <Button variant="secondary" size="sm" ariaLabel={`Reply to ${a.agent}`} onClick={() => setReplyTo(a)}>
            Reply
          </Button>
        )
      }
    />
  );

  // "what is being worked on": CHIP answers at once from the Work board (never a model), so the team chat
  // never leaves that question unanswered; the message still goes to the board for the agents
  const askStatus = async () => {
    setStatus({ state: 'reading' });
    try {
      setStatus({ state: 'answer', ...(await workStatus()) });
    } catch (e) {
      setStatus({ state: 'error', error: e.message });
    }
  };
  async function send() {
    if (STATUS_Q.test(text)) askStatus();
    const body = { type: 'reply', to: replyTo?.agent ?? 'all', ask: replyTo?.text ?? null, text: text.trim(), page: 'Team' };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      setSent((s) => [...s, { ask: replyTo, text: text.trim(), at: Date.now() }]);
      setReplyTo(null);
      setText('');
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      {data.quiet ? (
        <Notification
          tone="attention"
          // a notice is one line: message left, action right (16 Nov, "A"; audit 3)
          message={`${data.quiet.name} has been quiet for ${data.quiet.days} days, since ${dateOf(data.quiet.at)}.`}
          action={{ label: `Ask ${data.quiet.name}`, onClick: () => setReplyTo({ id: null, agent: data.quiet.name, text: null }) }}
        />
      ) : null}

      <Flow as="ul" direction="row" gap={8} wrap aria-label="The team at a glance">
        <li>
          <Tag variant="outline" count={data.agents}>{data.agents === 1 ? 'agent' : 'agents'}</Tag>
        </li>
        <li>
          {/* the sidebar's and the board's Agent count, the same number */}
          <Tag variant="outline" tone="info" count={data.working}>working</Tag>
        </li>
        <li>
          {/* the asks from the last week, said as such: "for you" is Needs you's word, which counts something else (data check, 22 Nov) */}
          <Tag variant="outline" tone="attention" count={asks.length}>{asks.length === 1 ? 'new ask' : 'new asks'}</Tag>
        </li>
        <li>
          <Tag variant="outline" count={data.prs}>{data.prs === 1 ? 'open PR' : 'open PRs'}</Tag>
        </li>
      </Flow>

      {/* who is working now and what each last said: her sessions and CHIP's runs, one status dot each (24 Nov) */}
      <Card>
        <Flow gap={16}>
          <SectionHead icon="Group" iconTone="info" title="Working now" number={data.working} words="at work" description={`Your Claude sessions and CHIP’s runs${data.sessionsAt ? `, read ${hhmm(data.sessionsAt)}` : ''}`} />
          {data.sessions.length || data.going.length ? (
            <Flow as="ul" gap={4} aria-label="Sessions and runs">
              {data.going.map((r) => (
                <ListRow key={r.id} layout="stacked" statusDot={<StatusDot tone="info" label="running" showLabel={false} />} title={`CHIP run: ${r.title}`} description={`Running · ${r.line}`} trailing onClick={() => openWork('sessions')} />
              ))}
              {[...data.sessions]
                .sort((a, b) => Number(b.working) - Number(a.working) || (b.reportedAt ?? b.updatedAt ?? 0) - (a.reportedAt ?? a.updatedAt ?? 0))
                .slice(0, 8)
                .map((x) => {
                  const [word, tone] = sessionState(x);
                  return <ListRow key={x.id} layout="stacked" statusDot={<StatusDot tone={tone} label={word} showLabel={false} />} title={x.title} description={`${word} · ${sessionLine(x)} · ${dateOf(x.working ? x.updatedAt : x.reportedAt ?? x.updatedAt)}`} trailing onClick={() => openWork('sessions', x.id)} />;
                })}
            </Flow>
          ) : (
            <EmptyState size="lane" mark="🍵" title="No one at work" line="No session in CHIP’s projects in the last day and a half, and no CHIP run." />
          )}
          {data.sessions.length > 8 ? (
            <Flow direction="row" justify="end">
              <ActionChip onClick={() => openWork('sessions')}>{`All ${data.sessions.length} in Sessions`}</ActionChip>
            </Flow>
          ) : null}
        </Flow>
      </Card>

      {/* a list card hugs its rows (rule 15): its header stays at the top */}
      <Flow span={6}>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="Group" iconTone="warning" title="Waiting on you" number={asks.length} words={asks.length === 1 ? 'new ask' : 'new asks'} description="Every ask lands here. Reply to one, or to all" />
            {asks.length ? (
              <Flow as="ul" gap={8} aria-label="Asks waiting on you">
                {asks.map((a) => askRow(a))}
              </Flow>
            ) : (
              // "every ask is answered" only when it is: older open asks are still asks (data sweep, 22 Nov)
              <EmptyState size="lane" {...markOf('🍻')} title={older.length ? 'Nothing new this week' : "No one's waiting on you"} line={older.length ? `${older.length} older ${older.length === 1 ? 'ask is' : 'asks are'} still open, below.` : 'Every ask is answered. Put the kettle on.'} />
            )}
            {older.length ? (
              // the summary is short meta on one line (T5); the why is the first line inside
              <Disclosure title={`${older.length} older ${older.length === 1 ? 'ask' : 'asks'}`} summary={`over ${QUIET_DAYS} days`}>
                <Flow gap={8}>
                  <TextStack body="Not counted as waiting on you." />
                  <Flow as="ul" gap={8} aria-label="Older asks">
                    {older.map((a) => askRow(a))}
                  </Flow>
                </Flow>
              </Disclosure>
            ) : null}
          </Flow>
        </Card>
      </Flow>

      {/* a list card hugs its rows (rule 15): its header stays at the top */}
      <Flow span={6}>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="ChatBubbleEmpty" iconTone="info" title="Team chat" description="Today, your sessions and every agent" />
            {data.thread.length || sent.length || status ? (
              // one chat (her 21 Nov answer 5 B): the same ChatThread as Ask BELLA and the Terminal.
              // Each agent's name sits over the first of its run of bubbles, its tail on the last;
              // replies take reactions; hers are pink on the right with the time under the last.
              <ChatThread label="Team chat, today">
                <Flow gap={8}>
                  {data.thread[0]?.at ? <ChatThreadTimestamp boldWord="Today">{hhmm(data.thread[0].at)}</ChatThreadTimestamp> : null}
                  {data.thread.map((m, i) => (
                    <Fragment key={m.id}>
                      {m.waiting && !sent.some((x) => x.ask?.agent === m.who) ? (
                        <Flow direction="row" gap={8}>
                          <Tag variant="outline" tone="attention">Waiting on you</Tag>
                        </Flow>
                      ) : null}
                      <Reply who={data.thread[i - 1]?.who === m.who ? undefined : m.who} disc={String(m.who ?? '?').slice(0, 1).toUpperCase()} tail={data.thread[i + 1]?.who !== m.who || i === data.thread.length - 1}>
                        {m.text}
                      </Reply>
                    </Fragment>
                  ))}
                  {sent.map((s, i) => (
                    <Fragment key={`sent-${i}`}>
                      <ChatBubble side="sent" tail={i === sent.length - 1}>
                        {s.text}
                      </ChatBubble>
                      {i === sent.length - 1 ? <ChatThreadDelivered>{[s.at ? hhmm(s.at) : null, 'sent to the board'].filter(Boolean).join(' · ')}</ChatThreadDelivered> : null}
                    </Fragment>
                  ))}
                  {status?.state === 'answer' ? (
                    <Flow gap={4}>
                      <Reply who="CHIP · Work board, no model" disc="C">
                        <AnswerLines shaped={{ verdict: status.verdict, bullets: status.bullets }} onPin={() => {}} />
                      </Reply>
                      <TextStack subtitle={status.line} />
                    </Flow>
                  ) : status?.state === 'error' ? (
                    <Reply who="CHIP · no model" disc="C">{`I can’t say what is being worked on: ${status.error}. Nothing is made up, so there is no answer.`}</Reply>
                  ) : status?.state === 'reading' ? (
                    <TextStack subtitle="Reading the Work board…" />
                  ) : null}
                  {reply && sent.length ? <Reply who={reply.who} disc={String(reply.who ?? '?').slice(0, 1).toUpperCase()}>{reply.text}</Reply> : null}
                </Flow>
              </ChatThread>
            ) : (
              <EmptyState size="lane" {...markOf('🤫')} title="Quiet today" line="No one has reported yet. Say something to get them going." />
            )}
            {isDraft ? <Tag variant="outline" tone="info">The agent’s draft, in your words · edit before sending</Tag> : null}
            {/* Figma: the send button sits in the field, as History's Ask */}
            <Input id="team-reply" label={replyTo ? `Reply to ${replyTo.agent}` : 'Reply'} value={text} placeholder="Reply, or @ an agent" onChange={setText} onSend={() => text.trim() && send()} sendLabel="Send" />
            {failed ? <Notification tone="danger" title="The progress board" message={`It doesn't answer at ${BOARD}, so your reply wasn't sent. It's still in the box.`} /> : null}
          </Flow>
        </Card>
      </Flow>

      <Card>
        <Flow gap={16}>
          <SectionHead icon="ShieldCheck" iconTone="info" title="Trust by kind of fix" number={1} words="kind always asks" description="The more a kind is trusted, the fewer you approve one by one." />
          <Flow as="ul" gap={8} aria-label="Kinds of fix">
            <ListRow layout="stacked" title="Push and merge" body="Never moves up. Rule: earned trust, 11 Nov" tag={<Tag variant="outline" tone="attention">Always asks</Tag>} />
          </Flow>
          <EmptyState size="lane" {...markOf('📊')} title="No fixes counted yet" line="Swapping a typed colour or size for its token starts counting once CHIP has read back through past fixes." />
        </Flow>
      </Card>
    </>
  );
}
