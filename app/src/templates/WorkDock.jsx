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
//   Terminal: real shells; New shell opens one in CHIP's folder.
//   Ask BELLA: the one Ask thread (useAsk), from CHIP's data first.
// The composer sits at the foot on every tab: the model (Auto, local first),
// the field, and Talk (the browser's own speech, never sending by itself).
// Gaps (named for the library, not drawn here): Drawer has no tabs slot under
// its head (the tabs scroll with the body), no Back, no head action (New
// chat), and it dims the page; the model menu and the composer in one row
// wait on Round 6, so Select and Input keep their visible labels.
import { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import ListRow from '@bella/components/ListRow/ListRow';
import Tag from '@bella/components/Tag/Tag';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import TextStack from '@bella/components/TextStack/TextStack';
import Toast from '@bella/components/Toast/Toast';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';
import useCached from './useCached.js';
import useNarrow from './useNarrow.js';
import useAsk, { AskAnswer } from './useAsk.jsx';
import { workModel } from '../pages/workModel.js';
import WorkDrawer from '../pages/WorkDrawer.jsx';
import { TermScreen } from '../Terminal.jsx';

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
};
/* A relay lane, as a session row: its state for the role that acts, never a person's name for the role. */
function laneRow(l) {
  const n = l.needs?.length ?? 0;
  if (l.status === 'waiting on you') return { line: `Waiting on a maintainer${n ? ` · ${n} ${n === 1 ? 'ask' : 'asks'}` : ''}`, tone: 'attention' };
  if (l.status === 'no report') return { line: 'No report yet', tone: 'neutral' };
  return { line: `${l.status[0].toUpperCase()}${l.status.slice(1)}${l.role ? ` · ${l.role}` : ''}`, tone: 'info' };
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
  const [shells, setShells] = useState([]);
  const asker = useAsk();
  const talk = useTalk(setDraft);
  const phone = useNarrow();
  // under 400 the field's hint is shorter, so it shows whole beside Talk (its label says what it asks)
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
  const needs = useMemo(() => (data ? workModel({ needs: data[0]?.items ?? [], runs: data[1]?.runs ?? [] }).lanes.find((l) => l.id === 'needs').cards : null), [data]);
  const sessions = useMemo(() => {
    if (!data) return null;
    const runs = [...(data[1]?.runs ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    const lanes = (data[2]?.lanes ?? []).filter((l) => l.status !== 'no report');
    return [
      { id: 'chip', title: 'CHIP', line: 'Idle · this page', tone: 'info' },
      ...runs.map((r) => {
        const [word, tone] = RUN[r.status] ?? [r.status, 'neutral'];
        return { id: r.id, title: r.title ?? 'Fix', line: [word, r.startedAt ? `ran ${hhmm(r.startedAt)}` : null].filter(Boolean).join(' · '), tone, open: { kind: 'run', id: r.id } };
      }),
      ...lanes.map((l) => ({ id: `lane-${l.id}`, title: l.name, ...laneRow(l) })),
    ];
  }, [data]);

  const newShell = () => {
    const id = `dock-${Date.now()}`;
    setShells((s) => [...s, { id, repo: 'chip', kind: 'shell', status: 'connecting' }]);
    setNotice({ tone: 'success', text: 'New shell opened in CHIP’s folder' });
  };
  const send = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    setTab('ask');
    asker.ask(q, window.location.hash || '#/work', undefined, undefined, providerOf(model));
  };
  const newChat = () => {
    const kept = asker.answer;
    asker.clear();
    setNotice({ tone: 'info', text: 'Chat cleared', undo: kept ? () => asker.setLocal(kept) : null });
  };

  const tabs = [
    { id: 'needs', label: 'Needs you', count: needs?.length },
    { id: 'sessions', label: 'Sessions', count: sessions?.length },
    { id: 'term', label: 'Terminal', count: shells.length || undefined },
    { id: 'ask', label: 'Ask BELLA' },
  ];
  const status = {
    needs: needs ? (needs.length ? `Needs you · ${needs.length} ${needs.length === 1 ? 'thing' : 'things'}, failures first` : 'Needs you · nothing') : 'Needs you · reading',
    sessions: sessions ? `Sessions · ${sessions.length}, newest first` : 'Sessions · reading',
    term: `Terminal · ${shells.length} ${shells.length === 1 ? 'shell' : 'shells'} open`,
    ask: 'Ask BELLA · from CHIP’s data first',
  }[tab];

  const composer = (
    <Flow direction="row" gap={8} align="end" wrap grow="last">
      <Select label="Model" value={model} onChange={setModel} options={MODELS} />
      <Flow direction="row" gap={8} align="end" grow="first">
        <Input label="Ask about BELLA" placeholder={tiny ? 'Your question' : 'Ask about BELLA'} value={draft} onChange={setDraft} onSend={send} sendLabel="Send" />
        {talk.can ? (
          <Button variant="secondary" ariaExpanded={talk.on} onClick={talk.toggle}>
            {talk.on ? 'Listening' : 'Talk'}
          </Button>
        ) : null}
      </Flow>
    </Flow>
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
        <Flow direction="row" justify="between" align="center" gap={8} wrap>
          <TextStack subtitle={shells.length ? 'Each shell runs in CHIP’s folder.' : 'No shell open yet.'} />
          <Button variant="secondary" size="sm" onClick={newShell}>
            New shell
          </Button>
        </Flow>
        {shells.map((t) => (
          <TermScreen key={t.id} t={t} active onStatus={() => {}} onActivity={() => {}} register={() => {}} />
        ))}
      </Flow>
    ),
    ask: asker.answer ? (
      <Flow gap={16}>
        <Flow direction="row" justify="end">
          <Button variant="tertiary" size="sm" onClick={newChat}>
            New chat
          </Button>
        </Flow>
        <AskAnswer answer={asker.answer} onRetry={(p) => asker.retry(p ?? providerOf(model))} onStop={asker.stop} />
      </Flow>
    ) : (
      <EmptyState
        size="page"
        mark="💬"
        title="Ask about BELLA, in plain words"
        line="Go on, ask away. I’ll show you where I got it, so you know I’m not making it up."
        actions={
          <Button variant="primary" onClick={() => asker.ask(EXAMPLE, window.location.hash || '#/work', undefined, undefined, providerOf(model))}>
            Try an example
          </Button>
        }
      />
    ),
  }[tab];

  return (
    <>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" size="lg" label="Work" status={status} footer={composer}>
        <Flow gap={16}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Work panel" idBase="work-dock" />
          <div {...tabPanelProps('work-dock', tab, true)}>{body}</div>
        </Flow>
      </Drawer>
      <WorkDrawer item={item} onClose={() => setItem(null)} onNotice={(n) => setNotice(n)} onChanged={reload} />
      {notice ? (
        <Toasts>
          <Toast tone={notice.tone} onClose={() => setNotice(null)} action={notice.undo ? { label: 'Undo', onClick: () => (notice.undo(), setNotice(null)) } : undefined}>
            {notice.text ?? `${notice.title}. ${notice.message}`}
          </Toast>
        </Toasts>
      ) : null}
    </>
  );
}
