// The Work panel in the new shell (CHIP · Dashboard, Flow 12 "Work panel",
// 791:262284, and its content set 791:262283): CHIP's one place to decide,
// watch, run and ask, on every page. ⌘J (Ctrl J) opens and closes it; the top
// bar's bell opens it on Needs you. Tabs under the head, close never in the
// tab row (her 21 Nov pick "A, tabs under head"). Each tab says on the head's
// line what it holds:
//   Needs you: what /needs and failed runs put in the board's Needs you lane,
//     failures first; a row opens what the board's card opens (WorkDrawer).
//   Sessions: CHIP itself, the agent runs CHIP started (/runs), then the relay
//     lanes from their reports (/bar/state).
//   Terminal: the chat with BELLA and the agent (TermChat), the same ChatThread
//     as Ask BELLA (her 20 Nov "one chat"); New shell opens a real shell in its
//     own drawer, the plain fallback.
//   Ask BELLA: the Ask thread (useAsk), from CHIP's data first, turn by turn.
// The composer sits at the foot on every tab: the model (Auto, local first),
// the field, and Speak (the browser’s own speech into the field, never sending by itself).
// New chat sits in the Drawer head's action slot, before Close (Head 172:528).
// Gaps (named for the library, not drawn here): Drawer has no tabs slot under
// its head (the tabs scroll with the body) and it dims the page; the model
// menu and the composer in one row wait on Round 6, so Select and Input keep
// their visible labels.
import { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import ListRow from '@bella/components/ListRow/ListRow';
import Tag from '@bella/components/Tag/Tag';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Toast from '@bella/components/Toast/Toast';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';
import useCached from './useCached.js';
import useNarrow from './useNarrow.js';
import useAsk, { AskAnswer, sendToAgent } from './useAsk.jsx';
import { workModel, laneState, daysQuiet } from '../pages/workModel.js';
import WorkDrawer from '../pages/WorkDrawer.jsx';
import ChatThread from '@bella/components/ChatThread/ChatThread';
import TermChat from './TermChat.jsx';

const TAB_IDS = ['needs', 'sessions', 'term', 'ask'];
const KEY = 'chip-dock';
// Figma's example question (Flow 12, screen 7)
const EXAMPLE = 'How could BELLA raise its A11y score?';
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Open the dock from anywhere: openWork('needs'). */
export const openWork = (tab) => window.dispatchEvent(new CustomEvent('chip:work', { detail: { tab } }));

/* The model for every action (ask-bella-and-chat.md, 19 Nov: "let Obi select it"): Auto (local first) is the default. */
export const MODELS = [
  { value: 'auto', label: 'Auto · local first' },
  { value: 'local', label: 'Local model' },
  { value: 'claude', label: 'Claude' },
];
// what /ask takes: no provider = Auto
export const providerOf = (m) => (m === 'auto' ? undefined : m === 'local' ? 'local' : 'claude');

/* An agent run, as a session row: where it is, in a word, and its tone. */
const RUN = {
  starting: ['Working', 'info'],
  running: ['Working', 'info'],
  gate: ['Checking', 'info'],
  passed: ['Ready · gate passed', 'success'],
  failed: ['Failed', 'danger'],
  login: ['Needs a sign-in', 'attention'],
  // every status the runner sets, in words (audit 3: "nochange" showed raw)
  nochange: ['No change made', 'neutral'],
  kept: ['Kept', 'success'],
  undone: ['Undone', 'neutral'],
};
/* A relay lane, as a session row: its state for the role that acts, never a person's name for the role. */
function laneRow(l) {
  const n = l.needs?.length ?? 0;
  const state = laneState(l);
  if (state === 'waiting on you') return { line: `Waiting on a maintainer${n ? ` · ${n} ${n === 1 ? 'ask' : 'asks'}` : ''}`, tone: 'attention' };
  if (state === 'no report') return { line: 'No report yet', tone: 'neutral' };
  // quiet: still marked working but silent past the freshness window, as Team says it
  if (state === 'quiet') return { line: `Quiet for ${daysQuiet(l)} ${daysQuiet(l) === 1 ? 'day' : 'days'}${l.role ? ` · ${l.role}` : ''}`, tone: 'neutral' };
  return { line: `${state[0].toUpperCase()}${state.slice(1)}${l.role ? ` · ${l.role}` : ''}`, tone: 'info' };
}

/* The browser's own speech to text, where it has it; it fills the field and never sends. */
function useTalk(onText) {
  const rec = useRef(null);
  const [on, setOn] = useState(false);
  const Speech = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    const r = new Speech();
    r.lang = 'en-GB';
    r.interimResults = true;
    r.onresult = (e) => onText(Array.from(e.results, (x) => x[0].transcript).join(''));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return { can: !!Speech, on, toggle };
}

export default function WorkDock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem(KEY);
      return TAB_IDS.includes(t) ? t : 'needs';
    } catch {
      return 'needs';
    }
  });
  const [item, setItem] = useState(null); // what a row opens (WorkDrawer)
  const [notice, setNotice] = useState(null);
  const [model, setModel] = useState('auto');
  const [draft, setDraft] = useState('');
  // one chat (her 20 Nov "i just want one please"): Ask BELLA and the Terminal are the same
  // ChatThread, each with its own turns
  const asker = useAsk({ thread: true });
  const termAsker = useAsk({ thread: true });
  const [termTurns, setTermTurns] = useState([]);
  const say = useRef(null);
  // a new question brings its turn to the top of the panel: the thread follows the newest (audit 21 Nov)
  const newest = useRef(null);
  useEffect(() => {
    if (!asker.answer?.q) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => newest.current?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
  }, [asker.answer?.q, asker.past.length]);
  const talk = useTalk(setDraft);
  const phone = useNarrow();
  // under 400 the field's hint is shorter, so it shows whole beside Speak (its label says what it asks)
  const tiny = useNarrow(400);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, tab);
    } catch {}
  }, [tab]);
  // ⌘J / Ctrl J opens and closes it; openWork(tab) opens it on a tab
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const on = (e) => {
      if (e.detail?.tab) setTab(e.detail.tab);
      setOpen(true);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('chip:work', on);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('chip:work', on);
    };
  }, []);

  const { data, reload } = useCached(['/needs', '/runs', '/bar/state']);
  useEffect(() => {
    window.addEventListener('chip:changed', reload);
    return () => window.removeEventListener('chip:changed', reload);
  }, [reload]);
  const needs = useMemo(() => (data ? workModel({ needs: data[0]?.items ?? [], runs: data[1]?.runs ?? [], agents: data[2]?.lanes ?? [] }).lanes.find((l) => l.id === 'needs').cards : null), [data]);
  const sessions = useMemo(() => {
    if (!data) return null;
    const runs = [...(data[1]?.runs ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    const lanes = (data[2]?.lanes ?? []).filter((l) => l.status !== 'no report');
    return [
      { id: 'chip', title: 'CHIP', line: 'Idle · this page', tone: 'info' },
      ...runs.map((r) => {
        const [word, tone] = RUN[r.status] ?? ['Finished', 'neutral'];
        return { id: r.id, title: r.title ?? 'Fix', line: [word, r.startedAt ? `ran ${hhmm(r.startedAt)}` : null].filter(Boolean).join(' · '), tone, open: { kind: 'run', id: r.id } };
      }),
      ...lanes.map((l) => ({ id: `lane-${l.id}`, title: l.name, ...laneRow(l) })),
    ];
  }, [data]);

  // a real shell, the plain fallback, in its own drawer (WorkDrawer's terminal), never in the chat
  const newShell = () => setItem({ kind: 'terminal', repo: 'chip', command: '', title: 'a new shell' });
  // the composer talks to the tab it is on: the Terminal's chat, or Ask BELLA from any other tab
  const send = (text) => {
    const q = String(text ?? draft).trim();
    if (!q) return;
    setDraft('');
    if (tab === 'term') return say.current?.(q);
    setTab('ask');
    asker.ask(q, window.location.hash || '#/work', undefined, undefined, providerOf(model));
  };
  // New chat clears this tab's chat, with Undo in the toast (her 19 Nov: no confirm)
  const newChat = (who) => {
    const kept = { past: who.past, answer: who.answer };
    const keptTurns = who === termAsker ? termTurns : null;
    who.clear();
    if (keptTurns) setTermTurns([]);
    setNotice({ tone: 'info', text: 'Chat cleared', undo: () => (who.restore(kept), keptTurns && setTermTurns(keptTurns)) });
  };
  // Fix on an answer hands it to the agent (the model menu waits on its part, round 7)
  const [fixing, setFixing] = useState(false);
  const fix = async (answer) => {
    setFixing(true);
    try {
      await sendToAgent(answer);
      setNotice({ tone: 'success', text: 'Sent to the agent. Its card is in the Agent lane.' });
      reload();
    } catch (e) {
      setNotice({ tone: 'danger', text: `Not sent: ${e.message}` });
    } finally {
      setFixing(false);
    }
  };
  const ask = (q) => asker.ask(q, window.location.hash || '#/work', undefined, undefined, providerOf(model));

  const tabs = [
    { id: 'needs', label: 'Needs you', count: needs?.length },
    { id: 'sessions', label: 'Sessions', count: sessions?.length },
    { id: 'term', label: 'Terminal' },
    { id: 'ask', label: 'Ask BELLA' },
  ];
  const statusWords = {
    needs: needs ? (needs.length ? `Needs you · ${needs.length} ${needs.length === 1 ? 'thing' : 'things'}, failures first` : 'Needs you · nothing') : 'Needs you · reading',
    sessions: sessions ? `Sessions · ${sessions.length}, newest first` : 'Sessions · reading',
    term: 'Terminal · BELLA and the agent',
    ask: 'Ask BELLA · from CHIP’s data first',
  }[tab];
  // New chat: the head's action, before Close, once the chat has an answer
  const chatOf = tab === 'ask' ? asker : tab === 'term' ? termAsker : null;
  const action = chatOf?.answer ? (
    <Button variant="tertiary" size="sm" onClick={() => newChat(chatOf)}>
      New chat
    </Button>
  ) : undefined;

  // the likely next question, grey in the empty field; Enter sends it, typing replaces it (CLAUDE.md
  // "Suggest the next question"; her 👍 on Input suggestion, 21 Nov). Only questions CHIP's data
  // router answers: an answer's follow-ups (the server keeps only those), else Figma's example.
  const chat = tab === 'term' ? termAsker : asker;
  const asked = new Set([chat.answer?.q, ...(chat.past ?? []).map((t) => t.q)].filter(Boolean));
  const suggestion = (chat.answer?.next ?? []).find((q) => !asked.has(q)) ?? (asked.has(EXAMPLE) ? undefined : EXAMPLE);

  const composer = (
    <Flow direction="row" gap={8} align="end" wrap grow="last">
      <Select label="Model" value={model} onChange={setModel} options={MODELS} />
      <Flow direction="row" gap={8} align="end" grow="first">
        <Input label={tab === 'term' ? 'Message BELLA' : 'Ask about BELLA'} placeholder={tiny ? 'Your question' : tab === 'term' ? 'Message BELLA' : 'Ask about BELLA'} value={draft} onChange={setDraft} onSend={send} sendLabel="Send" suggestion={suggestion} />
        {talk.can ? (
          <Button variant="secondary" ariaExpanded={talk.on} onClick={talk.toggle}>
            {talk.on ? 'Listening' : 'Speak'}
          </Button>
        ) : null}
      </Flow>
    </Flow>
  );

  // one chat, one empty state (audit 3; her "i just want one please"): Terminal and Ask BELLA
  // open the same way, and the example goes to the tab you are on (send routes it)
  const chatEmpty = (
    <EmptyState
      size="page"
      mark="💬"
      title="Ask about BELLA, in plain words"
      line="Go on, ask away. I’ll show you where I got it, so you know I’m not making it up."
      actions={
        // one primary in view: the composer's Send is it, so the example is secondary
        <Button variant="secondary" onClick={() => send(EXAMPLE)}>
          Try an example
        </Button>
      }
    />
  );
  const body = {
    needs:
      needs == null ? null : needs.length ? (
        <Flow as="ul" gap={4} aria-label="Needs you">
          {needs.map((c) => (
            // on a phone the Tag sits under the line (ListRow's middle), so the › keeps the row's right end
            <ListRow key={c.id} layout="stacked" statusBar={c.tone} title={c.title} description={c.line} {...{ [phone ? 'tag' : 'rightTag']: <Tag variant="line" tone={c.tone === 'danger' ? 'danger' : 'attention'}>{c.status}</Tag> }} trailing={!!c.open} onClick={c.open ? () => setItem(c.open) : undefined} />
          ))}
        </Flow>
      ) : (
        <EmptyState size="lane" mark="🍵" title="Nothing needs you" line="Put the kettle on." />
      ),
    sessions:
      sessions == null ? null : (
        <Flow as="ul" gap={4} aria-label="Sessions">
          {sessions.map((s) => (
            <ListRow key={s.id} layout="stacked" statusBar={s.tone} title={s.title} description={s.line} trailing={!!s.open} onClick={s.open ? () => setItem(s.open) : undefined} />
          ))}
        </Flow>
      ),
    term: (
      <Flow gap={16}>
        <Flow direction="row" justify="end" align="center" gap={8} wrap>
          <Button variant="secondary" size="sm" onClick={newShell}>
            New shell
          </Button>
        </Flow>
        {termAsker.answer ? null : chatEmpty}
        <TermChat asker={termAsker} turns={termTurns} setTurns={setTermTurns} provider={providerOf(model)} onOpen={setItem} sayRef={say} onNotice={setNotice} />
      </Flow>
    ),
    ask: asker.answer ? (
      <Flow gap={16}>
        <ChatThread label="Ask BELLA">
          <Flow gap={24}>
            {asker.past.map((a, i) => (
              <AskAnswer key={`${a.q}-${i}`} answer={a} />
            ))}
            <Flow ref={newest} gap={16}>
            <AskAnswer answer={asker.answer} onRetry={(p) => asker.retry(p ?? providerOf(model))} onStop={asker.stop} onFollow={ask} onFix={() => !fixing && fix(asker.answer)} fixLabel="Fix" fixBusy={fixing} />
            </Flow>
          </Flow>
        </ChatThread>
      </Flow>
    ) : (
      chatEmpty
    ),
  }[tab];

  const toast = notice ? (
    <Toasts>
      <Toast tone={notice.tone} onClose={() => setNotice(null)} action={notice.undo ? { label: 'Undo', onClick: () => (notice.undo(), setNotice(null)) } : undefined}>
        {notice.text ?? `${notice.title}. ${notice.message}`}
      </Toast>
    </Toasts>
  ) : null;
  return (
    <>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" size="lg" label="Work" status={statusWords} action={action} footer={composer}>
        <Flow gap={16}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Work panel" idBase="work-dock" />
          <div {...tabPanelProps('work-dock', tab, true)}>{body}</div>
        </Flow>
        {/* inside the panel while it is open: a modal panel makes the page around it inert, so Undo works only from in here */}
        {toast}
      </Drawer>
      <WorkDrawer item={item} onClose={() => setItem(null)} onNotice={(n) => setNotice(n)} onChanged={reload} />
      {open ? null : toast}
    </>
  );
}
