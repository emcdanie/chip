// The Sessions panel and the bell's notifications (Elleta, 23 Nov 2026, about 23:00: the bell "takes her to the bar,
// where she wanted to talk to her sessions", it "is called Work at the top, which is wrong", "the padding is off").
// Two surfaces, one job each (CLAUDE.md Navigation, "The bell is notifications only"; Fix plans, "Sessions in CHIP like
// the Claude app's sidebar"):
//   Sessions  opens from the running indicator and ⌘J (Ctrl J). Tab Sessions: the live tree of her Claude Code sessions
//             (each under the session that started it, its state and one line: where it is or what it last said, read
//             from the app's own session records, read only), then CHIP's own runs with Stop on the one going (what the
//             Activity drawer showed). A session opens its overview. Tab Ask: the one chat (TermChat), answered from
//             CHIP's live data first (server/lib/chipdata.mjs: what is running, what landed, what needs you, where a
//             piece of work is). Nothing is ever sent into a session from here: CHIP can read them, not talk to them yet
//             (docs/reference/screens/2026-11-23-ask-connected/).
//   Notifications  opens from the bell: what needs her, what finished today, what landed today. Nothing else.
// Padding is BELLA Drawer's own: the body is 8 at the sides, rows bring their own 16, anything that is not a row takes
// Flow inset (16) and lands on the title's 24 edge (ReadingDrawer's rule).
// Gaps named for BELLA, not drawn here: StatusDot has no steady pulse for "working" (it pulses once on a change); Drawer
// has no tabs slot under its head (the tabs scroll with the body); Select has no option groups or disabled options.
import { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import ListRow from '@bella/components/ListRow/ListRow';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import Step from '@bella/components/Step/Step';
import TimelineRow from '@bella/components/TimelineRow/TimelineRow';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import TextStack from '@bella/components/TextStack/TextStack';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Toast from '@bella/components/Toast/Toast';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';
import ReadingDrawer, { Facts, Inset, ReadingSection } from './ReadingDrawer.jsx';
import useCached from './useCached.js';
import useNarrow from './useNarrow.js';
import useAsk from './useAsk.jsx';
import { workModel } from '../pages/workModel.js';
import WorkDrawer from '../pages/WorkDrawer.jsx';
import TermChat from './TermChat.jsx';
import { openRun } from '../Runs.jsx';
import { activityRow, isGoing } from '../runClock.js';

const TAB_IDS = ['sessions', 'ask'];
const KEY = 'chip-dock';
const EXAMPLE = 'Where are we?';
const JSON_HEADERS = { 'content-type': 'application/json' };
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60e3));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/* The chat between pages: one per CHIP window, gone when the window closes. */
const kept = { turns: [], past: [], answer: null };

/** Open the Sessions panel from anywhere: openWork('sessions') or openWork('ask'). */
export const openWork = (tab) => window.dispatchEvent(new CustomEvent('chip:work', { detail: { tab } }));
/** Open the bell's notifications. */
export const openNotices = () => window.dispatchEvent(new Event('chip:notices'));

/* The model menu: Auto first, then each model by where it runs. The option says which model; what it costs is said
   under the field for the one picked, so the field fits the panel's footer (a long option widened the native select
   past the footer's edge, 23 Nov). BELLA's Select has no option groups or disabled options (gap). */
const WHERE = { 'On this machine': 'This Mac', Cloud: 'Cloud' };
function modelOptions(menu) {
  return [{ value: 'auto', label: 'Auto' }, ...(menu?.models ?? []).map((m) => ({ value: m.id, label: `${WHERE[m.group] ?? m.group} · ${m.label}` }))];
}
// what /ask takes: no provider = Auto
export const providerOf = (m) => (m === 'auto' ? undefined : m);

/* A session's state in her words and its tone, from the app's own record (the same words Ask uses, chipdata.mjs). */
export function sessionState(s) {
  if (s.asks || s.status?.category === 'blocked') return ['Waiting on you', 'attention'];
  if (s.working) return ['Working', 'info'];
  if (s.status?.category === 'review_ready') return ['Ready for your review', 'success'];
  if (s.status?.category === 'completed') return ['Done', 'neutral'];
  return ['Quiet', 'neutral'];
}
const firstSentence = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0];
/* One line: where it is while it works, else what it last said. */
export function sessionLine(s) {
  const total = s.steps?.length ?? 0;
  const done = (s.steps ?? []).filter((x) => x.status === 'completed').length;
  const cur = (s.steps ?? []).find((x) => x.status === 'in_progress');
  const at = total ? `Step ${Math.min(done + 1, total)} of ${total}${cur ? `: ${cur.text}` : ''}` : null;
  const said = firstSentence(s.report || s.status?.detail);
  return (s.working ? at ?? said : said || at) || 'Nothing reported yet';
}
/* The tree: each session under the one that started it, oldest first, as the app's sidebar nests them. */
export function sessionTree(list = []) {
  const ids = new Set(list.map((s) => s.id));
  const roots = list.filter((s) => !s.parentId || !ids.has(s.parentId));
  const kids = (id) => list.filter((s) => s.parentId === id);
  const out = [];
  const walk = (s, depth) => {
    out.push({ ...s, depth });
    for (const k of kids(s.id)) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
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


/* One session as a row of the tree: the light and its state, the title, one line; a child sits in under its parent. */
function SessionRow({ s, onOpen }) {
  const [word, tone] = sessionState(s);
  return (
    <ListRow
      layout="stacked"
      indent={s.depth > 0}
      statusDot={<StatusDot tone={tone} label={word} showLabel={false} />}
      title={s.title}
      description={`${word} · ${sessionLine(s)}`}
      // when it last wrote while it works, else when it last reported
      meta={ago(s.working ? s.updatedAt : s.reportedAt ?? s.updatedAt)}
      trailing
      onClick={() => onOpen(s.id)}
    />
  );
}

/* A session's overview: where it is, what it last said, its plan. Read only: CHIP does not send into a session. */
function SessionOverview({ s, parent, onAsk }) {
  const [word] = sessionState(s);
  const STEP = { completed: 'done', in_progress: 'current', pending: 'pending' };
  return (
    <Flow gap={24}>
      <Inset gap={8}>
        {/* the head already names it; the body opens on where it is */}
        <TextStack body={`${word} · ${sessionLine(s)}`} />
        <Facts
          label="About this session"
          facts={[
            { label: 'Project', value: s.project },
            { label: 'Started by', value: parent?.title ?? (s.parentId ? 'an older session, not in this list' : null) },
            { label: 'Last report', value: s.report ? `${firstSentence(s.report)} (${ago(s.reportedAt ?? s.updatedAt)})` : null },
            { label: 'Model', value: s.model },
          ]}
        />
      </Inset>
      {s.steps?.length ? (
        <ReadingSection
          title="Its plan"
          description={`${s.steps.filter((x) => x.status === 'completed').length} of ${s.steps.length} steps done`}
          rows={
            <Flow as="ol" gap={0} inset aria-label={`The plan of ${s.title}`}>
              {s.steps.map((x, i) => (
                <Step key={i} layout="vertical" number={i + 1} title={x.text} state={STEP[x.status] ?? 'pending'} showLineAbove={i > 0} showConnector={i < s.steps.length - 1} />
              ))}
            </Flow>
          }
        />
      ) : null}
      <Inset>
        <Flow direction="row" justify="end">
          <ActionChip onClick={onAsk}>Ask where it is</ActionChip>
        </Flow>
      </Inset>
    </Flow>
  );
}

export default function WorkDock({ needs: shared }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState(false);
  const [floating, setFloating] = useState(false); // the terminal is detached: the panel steps aside so the page stays usable
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem(KEY);
      return TAB_IDS.includes(t) ? t : 'sessions';
    } catch {
      return 'sessions';
    }
  });
  const [picked, setPicked] = useState(null); // the session whose overview is open
  const [item, setItem] = useState(null); // what a row opens (WorkDrawer)
  const [notice, setNotice] = useState(null);
  const [stopError, setStopError] = useState(null);
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
  // scope 'data': CHIP's measured data and the live work first; no document is ever quoted here
  const asker = useAsk({ thread: true, scope: 'data' });
  // the chat is kept while CHIP is open, so closing the panel or moving page finds it as it was; New chat ends it
  const [turns, setTurns] = useState(() => kept.turns);
  useEffect(() => {
    if (kept.past.length || kept.answer) asker.restore({ past: kept.past, answer: kept.answer });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    kept.turns = turns;
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
  const tiny = useNarrow(400);
  // on a phone both rise from the bottom as a sheet (Drawer side bottom, 22 Nov)
  const phone = useNarrow();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, tab);
    } catch {}
  }, [tab]);
  // the running indicator says whether the panel is open (its aria-expanded)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chip:work-open', { detail: { open } }));
  }, [open]);
  // ⌘J / Ctrl J opens and closes the Sessions panel; openWork(tab) opens it on a tab; the bell opens the notifications
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const on = (e) => {
      const t = e.detail?.tab;
      if (TAB_IDS.includes(t)) setTab(t);
      else if (t === 'term') setTab('ask');
      setNotices(false);
      setOpen(true);
    };
    const bell = () => (setOpen(false), setNotices(true));
    window.addEventListener('keydown', key);
    window.addEventListener('chip:work', on);
    window.addEventListener('chip:notices', bell);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('chip:work', on);
      window.removeEventListener('chip:notices', bell);
    };
  }, []);

  // read while either surface is open; the sessions every 15 seconds so the lights move on their own
  const live = open || notices;
  const { data, reload } = useCached(['/needs', '/runs', '/work/board', '/work/landed']);
  useEffect(() => {
    window.addEventListener('chip:changed', reload);
    return () => window.removeEventListener('chip:changed', reload);
  }, [reload]);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [live, reload]);
  const needsRead = data?.[0];
  const runs = useMemo(() => data?.[1]?.runs ?? [], [data]);
  const board = data?.[2] ?? null;
  const landed = data?.[3]?.landed ?? null;
  const own = useMemo(() => (needsRead ? workModel({ needs: needsRead.items ?? [], runs, runBase: null, agents: [] }).lanes.find((l) => l.id === 'needs').cards : null), [needsRead, runs]);
  // the shell's own Needs you cards when it has them: the bell, the menu badge and this list are then one count
  const needs = shared ?? own;
  const tree = useMemo(() => (board?.sessions ? sessionTree(board.sessions) : null), [board]);
  const pickedSession = tree?.find((s) => s.id === picked) ?? null;
  const working = tree?.filter((s) => s.working).length ?? 0;
  const waiting = tree?.filter((s) => sessionState(s)[1] === 'attention').length ?? 0;
  const runRows = runs.slice(0, 6).map((r) => activityRow(r, null));
  const today = new Date().toDateString();
  const finished = runs.filter((r) => !isGoing(r) && r.endedAt && new Date(r.endedAt).toDateString() === today);

  const stop = async (id) => {
    setStopError(null);
    try {
      const r = await fetch(`/runs/${id}/stop`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not stop it');
      reload();
    } catch (e) {
      setStopError(e.message);
    }
  };

  // a real shell, the plain fallback, in its own drawer (WorkDrawer's terminal), never in the chat
  const newShell = () => setItem({ kind: 'terminal', repo: 'chip', command: '', title: 'a new shell' });
  // the composer always talks to the one chat; from another tab it opens the chat first
  const send = (text) => {
    const q = String(text ?? draft).trim();
    if (!q) return;
    setDraft('');
    setPicked(null);
    if (tab === 'ask' && say.current) return say.current(q);
    setTab('ask');
    setPending(q);
  };
  // New chat clears the chat, with Undo in the toast (her 19 Nov: no confirm)
  const newChat = () => {
    const was = { past: asker.past, answer: asker.answer };
    const wasTurns = turns;
    asker.clear();
    setTurns([]);
    setNotice({ tone: 'info', text: 'Chat cleared', undo: () => (asker.restore(was), setTurns(wasTurns)) });
  };

  const tabs = [
    { id: 'sessions', label: 'Sessions', count: tree?.length },
    { id: 'ask', label: 'Ask' },
  ];
  const statusWords =
    tab === 'ask'
      ? 'Ask · answered from CHIP’s live data first'
      : tree
        ? `${working} working · ${waiting} waiting on you · read ${hhmm(board.at)}`
        : 'Reading your sessions';
  const action =
    tab === 'ask' && (asker.answer || turns.length) ? (
      <Button variant="tertiary" size="sm" onClick={newChat}>
        New chat
      </Button>
    ) : null;

  // the likely next question, grey in the empty field; Enter sends it, typing replaces it
  const asked = new Set([asker.answer?.q, ...(asker.past ?? []).map((t) => t.q)].filter(Boolean));
  const suggestion = (asker.answer?.next ?? []).find((q) => !asked.has(q)) ?? (asked.has(EXAMPLE) ? undefined : EXAMPLE);
  const pickedModel = menu?.models.find((m) => m.id === model);

  const composer = (
    <Flow gap={8}>
      <Flow direction="row" gap={8} align="end" wrap grow="last">
        <Select label="Model" value={model} onChange={pickModel} options={modelOptions(menu)} />
        <Flow direction="row" gap={8} align="end" grow="first">
          <Input label="Ask about the work" placeholder={tiny ? 'Your question' : 'Where are we?'} value={draft} onChange={setDraft} onSend={send} sendLabel="Send" suggestion={suggestion} />
          {talk.can ? (
            <Button variant="secondary" ariaExpanded={talk.on} onClick={talk.toggle}>
              {talk.on ? 'Listening' : 'Talk'}
            </Button>
          ) : null}
        </Flow>
      </Flow>
      {tiny && !modelNote ? null : <TextStack subtitle={modelNote ?? (pickedModel ? `${pickedModel.label}: ${pickedModel.note}` : `Auto ${menu ? menu.auto.note : 'picks by the question'}`)} />}
    </Flow>
  );

  const chatEmpty = (
    <EmptyState
      size="page"
      mark="💬"
      title="Ask about the work, in plain words"
      line="What is running, what landed, what needs you, where a piece of work is. I show where I read it."
      actions={
        <Button variant="secondary" onClick={() => send(EXAMPLE)}>
          Try an example
        </Button>
      }
    />
  );
  const sessionsBody = pickedSession ? (
    <SessionOverview s={pickedSession} parent={tree.find((x) => x.id === pickedSession.parentId)} onAsk={() => send(`Where is ${pickedSession.title}?`)} />
  ) : (
    <Flow gap={24}>
      <ReadingSection
        title="Claude sessions"
        description="Read from the Claude app; CHIP can't send into them yet"
        rows={
          tree == null ? (
            <Inset>
              <TextStack body="Reading your sessions." />
            </Inset>
          ) : tree.length ? (
            <Flow as="ul" gap={4} aria-label="Claude sessions">
              {tree.map((s) => (
                <SessionRow key={s.id} s={s} onOpen={setPicked} />
              ))}
            </Flow>
          ) : (
            <EmptyState size="lane" mark="🍵" title="No sessions" line="None in CHIP’s projects in the last day and a half." />
          )
        }
      />
      <ReadingSection
        title="CHIP’s runs"
        description="Fixes CHIP ran from a plan you approved"
        rows={
          <Flow gap={12} inset>
            {stopError ? <TextStack body={`Not stopped: ${stopError}.`} /> : null}
            {runRows.length ? (
              runRows.map((row) => (
                <Flow key={row.id} gap={8}>
                  <TimelineRow title={row.title} line={row.line} state={row.state} stepDone={row.stepDone} stepTotal={row.stepTotal} onOpen={() => openRun(row.id)} />
                  {row.state === 'running' ? (
                    <Flow direction="row" justify="end">
                      <Button variant="secondary" size="sm" onClick={() => stop(row.id)}>
                        Stop
                      </Button>
                    </Flow>
                  ) : null}
                </Flow>
              ))
            ) : (
              <TextStack body="Nothing has run yet. A run shows here the moment you approve its plan." />
            )}
          </Flow>
        }
      />
    </Flow>
  );
  const body =
    tab === 'ask' ? (
      <Flow gap={16}>
        <Inset>
          <Flow direction="row" justify="end" align="center" gap={8} wrap>
            <Button variant="secondary" size="sm" onClick={newShell}>
              New shell
            </Button>
          </Flow>
          {asker.answer || turns.length ? null : chatEmpty}
          <TermChat asker={asker} turns={turns} setTurns={setTurns} provider={providerOf(model)} onOpen={setItem} sayRef={say} onNotice={setNotice} />
        </Inset>
      </Flow>
    ) : (
      sessionsBody
    );

  // the bell: what needs her, what finished today, what landed today; each opens where it lives
  const noticeCount = (needs?.length ?? 0) + finished.length + (landed?.length ?? 0);
  const where = (branch) => (/parts/.test(branch) ? 'BELLA' : 'CHIP');
  const bellDrawer = (
    <ReadingDrawer
      open={notices}
      onClose={() => setNotices(false)}
      side={phone ? 'bottom' : 'right'}
      label="Notifications"
      status={needs == null ? 'Reading' : `${needs.length} need you · ${finished.length} finished · ${landed?.length ?? 0} landed today`}
      source={{ from: 'Needs you, CHIP’s runs and the git logs of CHIP and BELLA', when: data?.[3]?.at ? `read ${hhmm(data[3].at)}` : null }}
    >
      {needs?.length ? (
        <ReadingSection
          title="Needs you"
          rows={
            <Flow as="ul" gap={4} aria-label="Needs you">
              {needs.map((c) => (
                <ListRow key={c.id} layout="stacked" statusBar={c.tone} title={c.title} description={[c.status, c.line].filter(Boolean).join(' · ')} trailing={!!c.open} onClick={c.open ? () => setItem(c.open) : undefined} />
              ))}
            </Flow>
          }
        />
      ) : null}
      {finished.length ? (
        <ReadingSection
          title="Finished today"
          rows={
            <Flow as="ul" gap={4} aria-label="Finished today">
              {finished.slice(0, 5).map((r) => {
                const row = activityRow(r, null);
                return <ListRow key={r.id} layout="stacked" statusBar={row.state === 'failed' ? 'danger' : 'success'} title={row.title} description={row.line} trailing onClick={() => openRun(r.id)} />;
              })}
            </Flow>
          }
        />
      ) : null}
      {landed?.length ? (
        <ReadingSection
          title="Landed today"
          description={`${landed.length} ${landed.length === 1 ? 'change' : 'changes'}, newest first`}
          rows={
            <Flow as="ul" gap={4} aria-label="Landed today">
              {landed.slice(0, 5).map((c) => (
                <ListRow key={`${c.branch}-${c.hash}`} layout="stacked" statusBar="success" title={c.subject} description={`${c.when} · ${where(c.branch)}`} trailing href={`#/system/history?q=${encodeURIComponent(c.hash)}`} onClick={() => setNotices(false)} />
              ))}
            </Flow>
          }
        />
      ) : null}
      {needs && !noticeCount ? <EmptyState size="lane" mark="🍵" title="Nothing new" line="Nothing needs you, finished or landed today." /> : null}
    </ReadingDrawer>
  );

  const toast = notice ? (
    <Toasts>
      <Toast tone={notice.tone} onClose={() => setNotice(null)} action={notice.undo ? { label: 'Undo', onClick: () => (notice.undo(), setNotice(null)) } : undefined}>
        {notice.text ?? `${notice.title}. ${notice.message}`}
      </Toast>
    </Toasts>
  ) : null;
  return (
    <>
      <Drawer
        open={open && !floating}
        onClose={() => (setOpen(false), setPicked(null))}
        side={phone ? 'bottom' : 'right'}
        size="lg"
        label={pickedSession && tab === 'sessions' ? pickedSession.title : 'Sessions'}
        status={pickedSession && tab === 'sessions' ? sessionState(pickedSession)[0] : statusWords}
        onBack={pickedSession && tab === 'sessions' ? () => setPicked(null) : undefined}
        backLabel="All sessions"
        action={action}
        // on a phone the sheet is short: the composer sits under the Ask tab only, so the session list has the room
        footer={phone && tab !== 'ask' ? undefined : composer}
      >
        <Flow gap={16}>
          <Tabs tabs={tabs} value={tab} onChange={(t) => (setTab(t), setPicked(null))} label="Sessions panel" idBase="work-dock" />
          <div {...tabPanelProps('work-dock', tab, true)}>{body}</div>
        </Flow>
        {/* inside the panel while it is open: a modal panel makes the page around it inert, so Undo works only from in here */}
        {toast}
      </Drawer>
      {bellDrawer}
      <WorkDrawer item={item} onFloat={setFloating} onClose={() => (setItem(null), setFloating(false))} onNotice={(n) => setNotice(n)} onChanged={reload} />
      {open ? null : toast}
    </>
  );
}
