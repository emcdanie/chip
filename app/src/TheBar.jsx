// The Bar: lane strip, "Waiting on you" pinned list, and chat stream.
// Subscribes to GET /bar/stream and polls GET /bar/state for live data.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '@bella/components/Avatar/Avatar';
import AvatarStack from '@bella/components/AvatarStack/AvatarStack';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import ChatThread, { ChatThreadTimestamp, ChatThreadDelivered } from '@bella/components/ChatThread/ChatThread';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import { inline } from './Obi.jsx';

// Lane identity colours. Primitives so they don't flip with light/dark/warm.
// Yellow/blue/pink/red: transparent text — disc carries colour, no letter (AAA constraint).
// Ink lanes: fixed dark disc, fixed cream text.
const LANE_AVATAR = {
  dara:    { background: 'var(--color-wee-dote-lane-a)', color: 'transparent' },
  bernie:  { background: 'var(--color-wee-dote-lane-b)', color: 'transparent' },
  saoirse: { background: 'var(--color-wee-dote-lane-c)', color: 'transparent' },
  frankie: { background: 'var(--color-wee-dote-lane-d)', color: 'transparent' },
  seamus:  { background: 'var(--color-light-ink)',        color: 'var(--color-navy-ink)' },
  liam:    { background: 'var(--color-light-ink)',        color: 'var(--color-navy-ink)' },
};

const STATUS_VARIANT = {
  working: 'accent',
  'waiting on you': 'info',
  done: 'success',
  parked: 'neutral',
  serving: 'success',
};

const STATUS_LABEL = {
  working: 'Working',
  'waiting on you': 'Waiting on you',
  done: 'Done',
  parked: 'Parked',
  serving: 'Serving',
};

// ---- chat stream ----

const CHAT_MEMBERS = [
  { name: 'Elleta',  laneColor: 'var(--color-light-ink)' },
  { name: 'Seamus',  laneColor: 'var(--color-light-ink)' },
  { name: 'Dara',    laneColor: 'var(--color-wee-dote-lane-a)' },
  { name: 'Bernie',  laneColor: 'var(--color-wee-dote-lane-b)' },
  { name: 'Saoirse', laneColor: 'var(--color-wee-dote-lane-c)' },
  { name: 'Frankie', laneColor: 'var(--color-wee-dote-lane-d)' },
  { name: 'Liam',    laneColor: 'var(--color-light-ink)' },
];

const PEOPLE = {
  E:  { name: 'Elleta',  me: true },
  Se: { name: 'Seamus',  id: 'seamus' },
  D:  { name: 'Dara',    id: 'dara' },
  B:  { name: 'Bernie',  id: 'bernie' },
  S:  { name: 'Saoirse', id: 'saoirse' },
  F:  { name: 'Frankie', id: 'frankie' },
  L:  { name: 'Liam',    id: 'liam' },
};

// From the-bar-source.html, session 9 Oct 2026
const SCRIPT = [
  ['stamp', 'Friday · 13:54'],
  ['E', "belfast mode 🍻 show me what's live, what needs review. The live site still has responsive and image issues, and sections aren't staying in the frame. go"],
  ['Se', "Go? That's it? A dozen skills behind me and all I get is go. Grand. On it 🫡"],
  ['Se', "Status board's up on the right. Your live-site flags aren't measured yet, so I'm not claiming anything's fixed."],
  ['E', "ok I cleared all the terminals, let's go", { tap: '‼️' }],
  ['Se', 'Measured 8 pages at 390, 768, 1024 and 1440 📏'],
  ['Se', 'The /work cover pictures are cropped to a thin strip on everything bigger than a phone. And sections run 1.5–4 screens tall. You weren\'t imagining it.'],
  ['B', "Right, I've had a proper look at every section. Pull up a chair. 📋"],
  ['stamp', '14:09'],
  ['E', 'what about figma'],
  ['Se', "Polished beats 04 and 06 myself. Three calls for you: the yellow swatch, a stray button label, and a line that claims the gate runs in parallel. It doesn't yet."],
  ['E', 'no yellow button.. and ok to the other'],
  ['Se', "Done. The yellow's gone. Honest in Figma and fibbing on the site would be a quare look 😏", { tap: '😂' }],
  ['stamp', '14:20'],
  ['E', "it's all super messy and not following any of the rules we made. revise them and see what's breaking our workflow. this is taking so long 😩"],
  ['Se', "You're right, and part of it's on me. The rules live in 8 places and contradict each other, and nobody checks before saying \"done\". Me included."],
  ['Se', 'The fix: one rules file every lane reads first, a Figma lint before any "done", and nothing shown to you without the page already open.'],
  ['E', 'ok fix', { fx: 'slam' }],
  ['Se', "Fixed ✅ The Figma section's tidied, the lint is clean, and the new rules are in the repo."],
  ['B', 'Docs PR open. Contrast is AAA always now. Tuts. 🫖'],
  ['stamp', '15:41'],
  ['E', 'now what'],
  ['Se', "Opened the lanes' own screenshots before passing them on 👀 Two /work covers are empty boxes, and the /about sheet is cut off halfway. Neither is done."],
  ['D', 'Dara here. Lazy loading, not a rendering bug. Fixed the screenshotter.'],
  ['D', 'All 4 covers visible at every width. CI green. Ready for OK PR-157. 😎', { tap: '❤️' }],
  ['E', 'OK PR-157', { fx: 'confetti' }],
  ['Se', "Dara says she's done, and for once she's actually right. Don't tell her I said so."],
  ['stamp', '16:16'],
  ['E', "I accidentally closed Saoirse 🙈 and I still don't have the polished System page"],
  ['S', "I'm back. Beats 01 to 09, phone and dark versions next to the desktop one. Honestly? A moment. ✨"],
  ['Se', 'In my day we polished one page a week, and we were glad of it. 👴'],
  ['stamp', '16:22'],
  ['E', 'I think you could be a bit funnier really'],
  ['Se', "Funnier? I've been running three lanes all day. Bernie's cut off at 700 pixels, Dara's taking credit for lazy loading, and Saoirse's been off having a moment since lunch.", { tap: '😂' }],
  ['Se', "PR-157's about to go live. Tell me you're not still in your pyjamas 🛌"],
  ['E', 'can you add emojis'],
  ['Se', '🍺', { fx: 'big' }],
];

function BarChat() {
  const [items, setItems] = useState(() => [
    { type: 'stamp', text: SCRIPT[0][1], key: 0 },
    { type: 'msg',   who: SCRIPT[1][0], text: SCRIPT[1][1], opts: {}, key: 1, animate: false },
  ]);
  const [typingWho, setTypingWho] = useState(null);
  const [speedLabel, setSpeedLabel] = useState('1×');
  const [playLabel, setPlayLabel] = useState('⏸ Pause');

  const logRef = useRef(null);
  const canvasRef = useRef(null);
  const anim = useRef({ idx: 2, playing: true, speed: 1 });
  const timer = useRef(null);
  const confParts = useRef([]);
  const confRaf = useRef(null);
  const reduce = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches
  );

  const scroll = useCallback(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  const confetti = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || reduce.current) return;
    const style = getComputedStyle(document.documentElement);
    const cols = ['--color-wee-dote-lane-a', '--color-wee-dote-lane-b', '--color-wee-dote-lane-c', '--color-wee-dote-lane-d']
      .map(v => style.getPropertyValue(v).trim());
    for (let k = 0; k < 160; k++) {
      confParts.current.push({
        x: window.innerWidth / 2, y: window.innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
        r: Math.random() * Math.PI, s: 5 + Math.random() * 6,
        c: cols[k % cols.length], l: 0,
      });
    }
    const tick = () => {
      const d = window.devicePixelRatio || 1;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, cv.width, cv.height);
      confParts.current.forEach(p => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.2; p.l++;
        cx.save(); cx.translate(p.x * d, p.y * d); cx.rotate(p.r);
        cx.fillStyle = p.c; cx.fillRect(-p.s * d / 2, -p.s * d / 4, p.s * d, p.s * d / 2);
        cx.restore();
      });
      confParts.current = confParts.current.filter(p => p.y < window.innerHeight + 40 && p.l < 240);
      if (confParts.current.length) { confRaf.current = requestAnimationFrame(tick); }
      else { cx.clearRect(0, 0, cv.width, cv.height); confRaf.current = null; }
    };
    if (!confRaf.current) tick();
  }, []);

  const step = useCallback(() => {
    const s = anim.current;
    if (!s.playing || s.idx >= SCRIPT.length) { s.playing = false; setPlayLabel('▶ Play'); return; }
    const [who, text, opts = {}] = SCRIPT[s.idx];

    if (who === 'stamp') {
      setItems(d => [...d, { type: 'stamp', text, key: s.idx }]);
      s.idx++;
      timer.current = setTimeout(step, 400 / s.speed);
      return;
    }

    const p = PEOPLE[who];
    if (!p.me && !reduce.current) {
      setTypingWho(who);
      const delay = Math.min(1900, 500 + text.length * 14) / s.speed;
      timer.current = setTimeout(() => {
        setTypingWho(null);
        setItems(d => [...d, { type: 'msg', who, text, opts, key: s.idx, animate: true }]);
        if (opts.fx === 'confetti') setTimeout(confetti, 100);
        s.idx++;
        timer.current = setTimeout(step, 500 / s.speed);
      }, delay);
    } else {
      setItems(d => [...d, { type: 'msg', who, text, opts, key: s.idx, animate: true }]);
      if (opts.fx === 'confetti') setTimeout(confetti, 200);
      s.idx++;
      timer.current = setTimeout(step, 900 / s.speed);
    }
  }, [confetti]);

  const doRestart = useCallback(() => {
    clearTimeout(timer.current);
    setTypingWho(null);
    setPlayLabel('⏸ Pause');
    anim.current.idx = 2;
    anim.current.playing = true;
    setItems([
      { type: 'stamp', text: SCRIPT[0][1], key: 0 },
      { type: 'msg',   who: SCRIPT[1][0], text: SCRIPT[1][1], opts: {}, key: 1, animate: false },
    ]);
    timer.current = setTimeout(step, 900 / anim.current.speed);
  }, [step]);

  const doShowAll = useCallback(() => {
    clearTimeout(timer.current);
    setTypingWho(null);
    setPlayLabel('▶ Play');
    anim.current.playing = false;
    anim.current.idx = SCRIPT.length;
    setItems(SCRIPT.map(([who, text, opts = {}], key) =>
      who === 'stamp'
        ? { type: 'stamp', text, key }
        : { type: 'msg', who, text, opts, key, animate: false }
    ));
  }, []);

  const doSpeedCycle = useCallback(() => {
    const next = anim.current.speed === 1 ? 2 : anim.current.speed === 2 ? 0.5 : 1;
    anim.current.speed = next;
    setSpeedLabel(next === 0.5 ? '½×' : `${next}×`);
  }, []);

  const doPlayPause = useCallback(() => {
    if (anim.current.idx >= SCRIPT.length) { doRestart(); return; }
    anim.current.playing = !anim.current.playing;
    if (anim.current.playing) { setPlayLabel('⏸ Pause'); step(); }
    else { clearTimeout(timer.current); setPlayLabel('▶ Play'); }
  }, [step, doRestart]);

  // mount: kick off animation and size confetti canvas
  useEffect(() => {
    timer.current = setTimeout(step, 900);
    const cv = canvasRef.current;
    const resize = () => {
      if (!cv) return;
      const d = window.devicePixelRatio || 1;
      cv.width = window.innerWidth * d;
      cv.height = window.innerHeight * d;
      cv.style.width = `${window.innerWidth}px`;
      cv.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => { clearTimeout(timer.current); window.removeEventListener('resize', resize); };
  }, [step]);

  useEffect(() => { scroll(); }, [items, typingWho, scroll]);

  // compute showName + showAv for each item
  let lastWho = null;
  const rendered = items.map((item, i) => {
    if (item.type === 'stamp') { lastWho = null; return { ...item, showName: false, showAv: false }; }
    const p = PEOPLE[item.who];
    const isMe = p?.me;
    const next = items[i + 1];
    const isLastInRun = !next || next.type === 'stamp' || next.who !== item.who;
    const showName = !isMe && lastWho !== item.who;
    lastWho = item.who;
    return { ...item, showName, showAv: !isMe && isLastInRun };
  });

  // track lastWho for typing indicator name display
  const lastRenderedWho = rendered.length ? rendered[rendered.length - 1].who : null;

  return (
    <div className="bar-chat">
      <header className="bar-chat-hd">
        <AvatarStack members={CHAT_MEMBERS} size="sm" max={7} />
        <p className="bar-chat-gname">The Bar</p>
        <p className="bar-chat-gsub">Elleta, Seamus, Dara, Bernie, Saoirse, Frankie, Liam</p>
        <div className="bar-chat-controls">
          <button type="button" className="bar-chat-btn" onClick={doPlayPause}>{playLabel}</button>
          <button type="button" className="bar-chat-btn" onClick={doRestart}>↺ Replay</button>
          <button type="button" className="bar-chat-btn" onClick={doSpeedCycle}>{speedLabel}</button>
          <button type="button" className="bar-chat-btn" onClick={doShowAll}>Show all</button>
        </div>
      </header>

      <div className="bar-chat-log" ref={logRef}>
        <ChatThread label="The Bar chat">
          {rendered.map(item => {
            if (item.type === 'stamp') {
              return <ChatThreadTimestamp key={item.key}>{item.text}</ChatThreadTimestamp>;
            }
            const p = PEOPLE[item.who];
            if (!p) return null;
            const isMe = p.me;
            const isBig = item.opts?.fx === 'big';
            const laneStyle = !isMe ? LANE_AVATAR[p.id] : undefined;

            return (
              <React.Fragment key={item.key}>
                {item.showName && <p className="bar-chat-who">{p.name}</p>}
                {isMe ? (
                  <>
                    <ChatBubble side="sent" tail tapback={item.opts?.tap} kind={isBig ? 'big-emoji' : 'text'}>
                      {isBig ? item.text : inline(item.text, [], item.key)}
                    </ChatBubble>
                    {item.showAv && <ChatThreadDelivered />}
                  </>
                ) : (
                  <div className="bar-chat-recv">
                    <ChatBubble side="received" tail={item.showAv} tapback={item.opts?.tap} kind={isBig ? 'big-emoji' : 'text'}>
                      {isBig ? item.text : inline(item.text, [], item.key)}
                    </ChatBubble>
                    {item.showAv && (
                      <Avatar name={p.name} size="sm" className="bar-chat-av" style={laneStyle} />
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {typingWho && PEOPLE[typingWho] && (() => {
            const p = PEOPLE[typingWho];
            return (
              <>
                {lastRenderedWho !== typingWho && <p className="bar-chat-who">{p.name}</p>}
                <div className="bar-chat-recv">
                  <ChatBubble side="received" tail>
                    <TypingDots name={p.name} />
                  </ChatBubble>
                  <Avatar name={p.name} size="sm" className="bar-chat-av" style={LANE_AVATAR[p.id]} />
                </div>
              </>
            );
          })()}
        </ChatThread>
      </div>

      {createPortal(
        <canvas ref={canvasRef} className="bar-chat-fx" aria-hidden="true" />,
        document.body
      )}
    </div>
  );
}

// ---- live data hooks ----

export function useBar() {
  const [lanes, setLanes] = useState([]);
  const [seenCount, setSeenCount] = useState(0);
  const [active, setActive] = useState(false);

  // Always poll every 10s so the unread count updates even when bar is closed.
  // Polling requests complete quickly and don't block Playwright's networkidle.
  useEffect(() => {
    const poll = () =>
      fetch('/bar/state')
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d.lanes)) setLanes(d.lanes); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, []);

  // SSE only when bar tab is visible; a persistent connection blocks networkidle.
  useEffect(() => {
    if (!active) return;
    const es = new EventSource('/bar/stream');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state' && Array.isArray(msg.lanes)) setLanes(msg.lanes);
      } catch {}
    };
    return () => es.close();
  }, [active]);

  const needsItems = lanes
    .flatMap((l) => (l.needs ?? []).map((item) => ({ ...item, laneName: l.name, laneUpdated: l.updated ?? 0 })))
    .sort((a, b) => b.laneUpdated - a.laneUpdated);

  const totalNeeds = needsItems.length;
  const unread = Math.max(0, totalNeeds - seenCount);
  const markRead = () => setSeenCount(totalNeeds);

  return { lanes, needsItems, unread, markRead, setActive };
}

async function copyText(text, notify) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`Copied: ${text.length > 40 ? text.slice(0, 40) + '…' : text}`);
  } catch {
    notify('Could not copy');
  }
}

export function TheBar({ lanes, needsItems, notify }) {
  return (
    <div className="bar-panel">
      <section className="bar-strip" aria-label="Lane strip">
        <ul className="bar-lanes">
          {lanes.map((l) => (
            <li key={l.id} className="bar-lane">
              <Avatar name={l.name} size="sm" style={LANE_AVATAR[l.id]} />
              <span className="bar-lane-name">{l.name}</span>
              <StatusPill variant={STATUS_VARIANT[l.status] ?? 'neutral'}>
                {STATUS_LABEL[l.status] ?? l.status}
              </StatusPill>
            </li>
          ))}
        </ul>
      </section>

      <section className="bar-waiting" aria-label="Waiting on you">
        <p className="bar-waiting-label">Waiting on you</p>
        {needsItems.length === 0 ? (
          <p className="bar-empty">Nothing waiting.</p>
        ) : (
          <ul className="bar-needs">
            {needsItems.map((item, i) => (
              <li key={i} className="bar-needs-item">
                <span className="bar-needs-lane">{item.laneName}</span>
                <span className="bar-needs-text">{inline(item.text, [], i)}</span>
                {item.cmds.length > 0 ? (
                  <span className="bar-needs-cmds">
                    {item.cmds.map((cmd) => (
                      <ActionChip key={cmd} onClick={() => copyText(cmd, notify)}>
                        {cmd}
                      </ActionChip>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <BarChat />
    </div>
  );
}
