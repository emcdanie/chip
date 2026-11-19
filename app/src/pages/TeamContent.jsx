// Team · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:82090): default 612:81339, draft 612:81478, sent 612:81620, agent quiet
// 612:81750. Built from BELLA parts and the template's Flow only; no page CSS.
//
// Data is CHIP's own: the agents, their asks and last report come from The
// Bar (/bar/state, server/lib/bar.mjs), open PRs from /projects. A reply goes
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
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import ListRow from '@bella/components/ListRow/ListRow';
import Notification from '@bella/components/Notification/Notification';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Tag from '@bella/components/Tag/Tag';
import Flow from '../templates/Flow.jsx';

export const BOARD = 'http://localhost:3123';
const DAY = 86400000;
const QUIET_DAYS = 7; // The Bar's own freshness window (server/lib/needs.mjs FRESH_DAYS)

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
    Promise.all([fetch('/bar/state').then((r) => (r.ok ? r.json() : Promise.reject())), fetch('/projects').then((r) => (r.ok ? r.json() : { projects: [] }))])
      .then(([bar, proj]) => {
        if (!live) return;
        const lanes = bar.lanes ?? [];
        const asks = lanes.flatMap((l) => (l.status === 'waiting on you' ? (l.needs ?? []).map((n, i) => ({ id: `${l.id}-${i}`, agent: l.name, text: n.text, at: l.updated })) : []));
        const today = new Date().toDateString();
        const thread = (bar.events ?? [])
          .filter((e) => e.kind === 'report' && e.text && new Date(e.t).toDateString() === today)
          .slice(-6)
          .map((e) => {
            const lane = lanes.find((l) => l.id === e.lane);
            return { id: String(e.t), lane: e.lane, who: lane?.name ?? e.lane, text: firstLine(e.text), waiting: lane?.status === 'waiting on you' };
          })
          // only an agent's latest message carries "Waiting on you"
          .map((m, i, all) => ({ ...m, waiting: m.waiting && !all.slice(i + 1).some((n) => n.lane === m.lane) }));
        const quiet = lanes
          .filter((l) => l.status === 'working' && l.updated && Date.now() - l.updated > QUIET_DAYS * DAY)
          .map((l) => ({ name: l.name, role: l.role, days: Math.floor((Date.now() - l.updated) / DAY), at: l.updated }))
          .sort((a, b) => b.days - a.days)[0];
        setData({
          state: 'ready',
          agents: lanes.length,
          working: lanes.filter((l) => l.status === 'working').length,
          prs: (proj.projects ?? []).reduce((n, p) => n + (typeof p.prs === 'number' ? p.prs : 0), 0),
          asks,
          thread,
          quiet,
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
  // the draft state: the reply field takes focus, so it reads as "your turn" at a glance
  useEffect(() => {
    if (draft) document.getElementById('team-reply')?.focus();
  }, [draft]);

  if (data.state === 'loading') return <EmptyState size="lane" title="Getting the team" />;
  if (data.state === 'error')
    return <Notification tone="danger" title="The team can't be read" message="The Bar isn't answering. Start CHIP, then try again." action={{ label: 'Try again', onClick: () => window.location.reload() }} />;

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
      // the ask is a sentence: ListRow's body (reading face), not its subtitle (mono, short meta)
      body={`${short(a.text)} · ${dateOf(a.at)}`}
      actionButton={
        <Button variant="secondary" size="sm" ariaLabel={`Reply to ${a.agent}`} onClick={() => setReplyTo(a)}>
          Reply
        </Button>
      }
    />
  );

  async function send() {
    const body = { type: 'reply', to: replyTo?.agent ?? 'all', ask: replyTo?.text ?? null, text: text.trim(), page: 'Team' };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      setSent((s) => [...s, { ask: replyTo, text: text.trim() }]);
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
          title={`${data.quiet.name} has been quiet for ${data.quiet.days} days`}
          message={`Last report ${dateOf(data.quiet.at)}. No reports since, so the ${data.quiet.role} work may be stuck.`}
          action={{ label: `Ask ${data.quiet.name}`, onClick: () => setReplyTo({ id: null, agent: data.quiet.name, text: null }) }}
        />
      ) : null}

      <Flow as="ul" direction="row" gap={8} wrap aria-label="The team at a glance">
        <li>
          <Tag variant="outline">{plural(data.agents, 'agent')}</Tag>
        </li>
        <li>
          <Tag variant="outline" tone="info">{`${data.working} working`}</Tag>
        </li>
        <li>
          <Tag variant="outline" tone="attention">{`${asks.length} waiting on you`}</Tag>
        </li>
        <li>
          <Tag variant="outline">{plural(data.prs, 'open PR')}</Tag>
        </li>
      </Flow>

      <Flow span={6} fill>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="Group" iconTone="warning" title="Waiting on you" number={asks.length} words={asks.length === 1 ? 'ask' : 'asks'} description="Every ask lands here. Reply to one, or to all" />
            {asks.length ? (
              <Flow as="ul" gap={8} aria-label="Asks waiting on you">
                {asks.map((a) => askRow(a))}
              </Flow>
            ) : (
              <EmptyState size="lane" mark="🍻" title="No one's waiting on you" line="Every ask is answered. Put the kettle on." />
            )}
            {older.length ? (
              <Disclosure title={`${older.length} older ${older.length === 1 ? 'ask' : 'asks'}`} summary="Quiet for over a week, so not counted as waiting on you">
                <Flow as="ul" gap={8} aria-label="Older asks">
                  {older.map((a) => askRow(a))}
                </Flow>
              </Disclosure>
            ) : null}
          </Flow>
        </Card>
      </Flow>

      <Flow span={6} fill>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="InfoCircle" iconTone="info" title="Team chat" description="Today, with every agent" />
            {data.thread.length || sent.length ? (
              <Flow gap={16} aria-label="Team chat, today">
                {data.thread.map((m, i) => (
                  <Fragment key={m.id}>
                    {m.waiting && !sent.some((x) => x.ask?.agent === m.who) ? (
                      <Flow direction="row" gap={8}>
                        <Tag variant="outline" tone="attention">Waiting on you</Tag>
                      </Flow>
                    ) : null}
                    <ChatBubble side="received" tail={data.thread[i + 1]?.who !== m.who || i === data.thread.length - 1}>{`${m.who} · ${m.text}`}</ChatBubble>
                  </Fragment>
                ))}
                {sent.map((s, i) => (
                  <ChatBubble key={`sent-${i}`} side="sent" tail={i === sent.length - 1}>
                    {s.text}
                  </ChatBubble>
                ))}
                {reply && sent.length ? <ChatBubble side="received" tail>{`${reply.who} · ${reply.text}`}</ChatBubble> : null}
              </Flow>
            ) : (
              <EmptyState size="lane" mark="🤫" title="Quiet today" line="No one has reported yet. Say something to get them going." />
            )}
            {isDraft ? <Tag variant="outline" tone="info">The agent’s draft, in your words · edit before sending</Tag> : null}
            <Input id="team-reply" label={replyTo ? `Reply to ${replyTo.agent}` : 'Reply'} value={text} placeholder="Reply to all, or @ one agent" onChange={setText} />
            <Flow direction="row" gap={8} justify="end">
              <Button variant="primary" size="sm" disabled={!text.trim()} onClick={send}>
                Send
              </Button>
            </Flow>
            {failed ? <Notification tone="danger" title="Not sent" message={`The progress board doesn't answer at ${BOARD}. Your reply is still in the box.`} /> : null}
          </Flow>
        </Card>
      </Flow>

      <Card>
        <Flow gap={16}>
          <SectionHead icon="CheckCircle" iconTone="info" title="Trust by kind of fix" number={1} words="kind always asks" description="The more a kind is trusted, the fewer you approve one by one." />
          <Flow as="ul" gap={8} aria-label="Kinds of fix">
            <ListRow layout="stacked" title="Push and merge" body="Never moves up. Rule: earned trust, 11 Nov" tag={<Tag variant="outline" tone="attention">Always asks</Tag>} />
          </Flow>
          <EmptyState size="lane" mark="📊" title="No fixes counted yet" line="Swapping a typed colour or size for its token starts counting once CHIP has read back through past fixes." />
        </Flow>
      </Card>
    </>
  );
}
