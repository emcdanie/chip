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
//   Ask BELLA: the one chat (her 20 Nov "i just want one please"; audit 4):
//     BELLA from CHIP's data first, and the agent when she sends it on, in one
//     ChatThread (TermChat); New shell opens a real shell in its own drawer.
// The composer sits at the foot on every tab: the model (Auto, local first),
// the field, and Talk (the browser’s own speech into the field, never sending by itself).
// New chat sits in the Drawer head's action slot, before Close (Head 172:528).
// Gaps (named for the library, not drawn here): Drawer has no tabs slot under
// its head (the tabs scroll with the body) and it dims the page; the model
// menu and the composer in one row wait on Round 6, so Select and Input keep
// their visible labels.
import { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import ListRow from '@bella/components/ListRow/ListRow';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import TextStack from '@bella/components/TextStack/TextStack';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Toast from '@bella/components/Toast/Toast';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';
import useCached from './useCached.js';
import useNarrow from './useNarrow.js';
import useAsk from './useAsk.jsx';
import { workModel, laneState, daysQuiet } from '../pages/workModel.js';
import WorkDrawer from '../pages/WorkDrawer.jsx';
import TermChat from './TermChat.jsx';

const TAB_IDS = ['needs', 'sessions', 'ask'];
const KEY = 'chip-dock';
// Figma's example question (Flow 12, screen 7)
const EXAMPLE = 'How could BELLA raise its A11y score?';
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/* The chat between pages: one per CHIP window, gone when the window closes. */
const kept = { turns: [], past: [], answer: null };

/** Open the dock from anywhere: openWork('needs'). */
export const openWork = (tab) => window.dispatchEvent(new CustomEvent('chip:work', { detail: { tab } }));

/* The model router's menu (her 22 Nov: "its still missing the other models and the model router"): Auto first,
   then every model by where it runs, each with its cost note, and one that cannot be used says why in words.
   BELLA's Select has no option groups or disabled options, so the label carries the group and an unavailable
   model reads "not available: ..." and keeps Auto (gap named in the report). */
const WHERE = { 'On this machine': 'This Mac', Cloud: 'Cloud' };
function modelOptions(menu) {
  const auto = { value: 'auto', label: menu ? `Auto · ${menu.auto.note}` : 'Auto · picks by the question' };
  return [auto, ...(menu?.models ?? []).map((m) => ({ value: m.id, label: `${WHERE[m.group] ?? m.group} · ${m.label} · ${m.note}` }))];
}
// what /ask takes: no provider = Auto
export const providerOf = (m) => (m === 'auto' ? undefined : m);

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
  // nothing left to decide (server/lib/runs.mjs closedWhy): said with its reason, never as waiting for an Accept
  closed: ['Closed', 'neutral'],
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

export default function WorkDock({ needs: shared }) {
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(false); // the terminal is detached: the panel steps aside so the page stays usable
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem(KEY);
      // the old Terminal tab is the one chat now
      return t === 'term' ? 'ask' : TAB_IDS.includes(t) ? t : 'needs';
    } catch {
      return 'needs';
    }
  });
  const [item, setItem] = useState(null); // what a row opens (WorkDrawer)
  const [notice, setNotice] = useState(null);
  const [model, setModel] = useState('auto');
  const [menu, setMenu] = useState(null);
  const [modelNote, setModelNote] = useState(null);
  useEffect(() => {
    let on = true;
    // refreshed when the panel opens, so "Claude x of 20 today" is today's
    fetch('/models').then((r) => (r.ok ? r.json() : null)).then((d) => on && setMenu(d?.menu ?? null)).catch(() => {});
    return () => { on = false; };
  }, [open]);
  const pickModel = (v) => {
    const m = menu?.models.find((x) => x.id === v);
    if (m && !m.available) { setModel('auto'); setModelNote(`${m.label} is ${m.note}. Auto stays on.`); return; }
    setModelNote(null);
    setModel(v);
  };
  const [draft, setDraft] = useState('');
  // one chat (her 20 Nov "i just want one please"; audit 4, item 1): BELLA and the agent in
  // one ChatThread, one empty state, one Send
  // scope 'data': CHIP's measured data first; no document is ever quoted here (her 23 Nov)
  const asker = useAsk({ thread: true, scope: 'data' });
  // the chat collapses without ending (her reading, 22 Nov): it is kept while CHIP is open, so closing
  // the panel or moving to another page and back finds it as it was; New chat is what ends it
  const [turns, setTurns] = useState(() => kept.turns);
  useEffect(() => {
    if (kept.past.length || kept.answer) asker.restore({ past: kept.past, answer: kept.answer });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    kept.turns = turns;
    // an answer still being written isn't kept half done
    kept.past = asker.past;
    kept.answer = asker.answer?.status === 'thinking' ? null : asker.answer;
  }, [turns, asker.past, asker.answer]);
  const say = useRef(null);
  // a question sent from another tab waits until the chat is on screen to hear it
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (tab !== 'ask' || pending == null || !say.current) return;
    say.current(pending);
    setPending(null);
  }, [tab, pending]);
  const talk = useTalk(setDraft);
  // under 400 the field's hint is shorter, so it shows whole beside Talk (its label says what it asks)
  const tiny = useNarrow(400);
  // on a phone the panel rises from the bottom as a sheet (Drawer side bottom, 22 Nov); lg is the tall sheet
  const phone = useNarrow();

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
      if (e.detail?.tab) setTab(e.detail.tab === 'term' ? 'ask' : e.detail.tab);
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
  const own = useMemo(() => (data ? workModel({ needs: data[0]?.items ?? [], runs: data[1]?.runs ?? [], runBase: data[1]?.base ?? null, agents: data[2]?.lanes ?? [] }).lanes.find((l) => l.id === 'needs').cards : null), [data]);
  // the shell's own Needs you cards when it has them: the bell, the menu badge and this list are then one count
  const needs = shared ?? own;
  const sessions = useMemo(() => {
    if (!data) return null;
    const runs = [...(data[1]?.runs ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    const lanes = (data[2]?.lanes ?? []).filter((l) => l.status !== 'no report');
    return [
      ...runs.map((r) => {
        const [word, tone] = RUN[r.status] ?? ['Finished', 'neutral'];
        return { id: r.id, title: r.title ?? 'Fix', line: [word, r.startedAt ? `ran ${hhmm(r.startedAt)}` : null, r.status === 'closed' ? r.closedWhy : null].filter(Boolean).join(' · '), tone, open: { kind: 'run', id: r.id } };
      }),
      // an agent's session opens on Team, where its asks and replies are
      ...lanes.map((l) => ({ id: `lane-${l.id}`, title: l.name, ...laneRow(l), href: '#/team' })),
    ];
  }, [data]);

  // a real shell, the plain fallback, in its own drawer (WorkDrawer's terminal), never in the chat
  const newShell = () => setItem({ kind: 'terminal', repo: 'chip', command: '', title: 'a new shell' });
  // the composer always talks to the one chat; from another tab it opens the chat first
  const send = (text) => {
    const q = String(text ?? draft).trim();
    if (!q) return;
    setDraft('');
    if (tab === 'ask' && say.current) return say.current(q);
    setTab('ask');
    setPending(q);
  };
  // New chat clears this tab's chat, with Undo in the toast (her 19 Nov: no confirm)
  const newChat = () => {
    const kept = { past: asker.past, answer: asker.answer };
    const keptTurns = turns;
    asker.clear();
    setTurns([]);
    setNotice({ tone: 'info', text: 'Chat cleared', undo: () => (asker.restore(kept), setTurns(keptTurns)) });
  };

  const tabs = [
    { id: 'needs', label: 'Needs you', count: needs?.length },
    { id: 'sessions', label: 'Sessions', count: sessions?.length },
    { id: 'ask', label: 'Ask BELLA' },
  ];
  const statusWords = {
    needs: needs ? (needs.length ? `Needs you · ${needs.length} ${needs.length === 1 ? 'thing' : 'things'}, failures first` : 'Needs you · nothing') : 'Needs you · reading',
    sessions: sessions ? `Sessions · ${sessions.length}, newest first` : 'Sessions · reading',
    ask: 'Ask BELLA · CHIP’s data first, then the agent',
  }[tab];
  // New chat: the head's action, before Close, on every tab as Figma Flow 12 draws it. It opens Ask BELLA
  // on an empty chat; a chat with something in it is cleared, with Undo in the toast
  const action = (
    <Button variant="tertiary" size="sm" onClick={() => ((asker.answer || turns.length) && newChat(), setTab('ask'))}>
      New chat
    </Button>
  );

  // the likely next question, grey in the empty field; Enter sends it, typing replaces it (CLAUDE.md
  // "Suggest the next question"; her 👍 on Input suggestion, 21 Nov). Only questions CHIP's data
  // router answers: an answer's follow-ups (the server keeps only those), else Figma's example.
  const asked = new Set([asker.answer?.q, ...(asker.past ?? []).map((t) => t.q)].filter(Boolean));
  const suggestion = (asker.answer?.next ?? []).find((q) => !asked.has(q)) ?? (asked.has(EXAMPLE) ? undefined : EXAMPLE);

  const composer = (
    <Flow gap={8}>
    <Flow direction="row" gap={8} align="end" wrap grow="last">
      <Select label="Model" value={model} onChange={pickModel} options={modelOptions(menu)} />
      <Flow direction="row" gap={8} align="end" grow="first">
        <Input label="Ask about BELLA" placeholder={tiny ? 'Your question' : 'Ask about BELLA'} value={draft} onChange={setDraft} onSend={send} sendLabel="Send" suggestion={suggestion} />
        {talk.can ? (
          <Button variant="secondary" ariaExpanded={talk.on} onClick={talk.toggle}>
            {talk.on ? 'Listening' : 'Talk'}
          </Button>
        ) : null}
      </Flow>
    </Flow>
    {modelNote ? <TextStack subtitle={modelNote} /> : null}
    </Flow>
  );

  // one chat, one empty state (her "i just want one please"); the example goes through Send
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
            // a List item: the status bar and the status word in its line, no Tag beside a title that
            // already names it (READ FIRST: "List items show status with a short rounded status bar";
            // her 21 Nov: "its a bit repetitive with the tag and the title"); every row opens, ↗
            <ListRow key={c.id} layout="stacked" statusBar={c.tone} title={c.title} description={[c.status, c.line].filter(Boolean).join(' · ')} trailing={!!c.open} onClick={c.open ? () => setItem(c.open) : undefined} />
          ))}
        </Flow>
      ) : (
        <EmptyState size="lane" mark="🍵" title="Nothing needs you" line="Put the kettle on." />
      ),
    sessions:
      sessions == null ? null : (
        <Flow as="ul" gap={4} aria-label="Sessions">
          {sessions.map((s) => (
            <ListRow key={s.id} layout="stacked" statusBar={s.tone} title={s.title} description={s.line} trailing={!!(s.open || s.href)} href={s.href} onClick={s.open ? () => setItem(s.open) : undefined} />
          ))}
        </Flow>
      ),
    ask: (
      <Flow gap={16}>
        <Flow direction="row" justify="end" align="center" gap={8} wrap>
          <Button variant="secondary" size="sm" onClick={newShell}>
            New shell
          </Button>
        </Flow>
        {asker.answer || turns.length ? null : chatEmpty}
        <TermChat asker={asker} turns={turns} setTurns={setTurns} provider={providerOf(model)} onOpen={setItem} sayRef={say} onNotice={setNotice} />
      </Flow>
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
      <Drawer open={open && !floating} onClose={() => setOpen(false)} side={phone ? 'bottom' : 'right'} size="lg" label="Work" status={statusWords} action={action} footer={composer}>
        <Flow gap={16}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Work panel" idBase="work-dock" />
          <div {...tabPanelProps('work-dock', tab, true)}>{body}</div>
        </Flow>
        {/* inside the panel while it is open: a modal panel makes the page around it inert, so Undo works only from in here */}
        {toast}
      </Drawer>
      <WorkDrawer item={item} onFloat={setFloating} onClose={() => (setItem(null), setFloating(false))} onNotice={(n) => setNotice(n)} onChanged={reload} />
      {open ? null : toast}
    </>
  );
}
