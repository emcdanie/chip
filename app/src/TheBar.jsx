// The Bar: lane strip, "Waiting on you" pin, and live chat stream.
// Subscribes to GET /bar/stream and polls GET /bar/state for live data.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@bella/components/Avatar/Avatar';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import ChatThread, { ChatThreadTimestamp } from '@bella/components/ChatThread/ChatThread';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import { inline } from './Obi.jsx';

// Lane photo sources (160×160, circular mask, transparent bg).
const LANE_SRC = {
  seamus:  '/avatars/seamus.png',
  dara:    '/avatars/dara.png',
  bernie:  '/avatars/bernie.png',
  saoirse: '/avatars/saoirse.png',
  frankie: '/avatars/frankie.png',
  liam:    '/avatars/liam.png',
};

// Lane ring colours. Override the Avatar ring token per-instance; no new CSS values.
const LANE_RING = {
  dara:    { '--component-avatar-default-ring-color': 'var(--color-wee-dote-lane-a)' },
  bernie:  { '--component-avatar-default-ring-color': 'var(--color-wee-dote-lane-b)' },
  saoirse: { '--component-avatar-default-ring-color': 'var(--color-wee-dote-lane-c)' },
  frankie: { '--component-avatar-default-ring-color': 'var(--color-wee-dote-lane-d)' },
  seamus:  { '--component-avatar-default-ring-color': 'var(--color-semantic-text-primary)' },
  liam:    { '--component-avatar-default-ring-color': 'var(--color-wee-dote-lane-e)' },
};

const LANE_NAMES = {
  seamus: 'Seamus', dara: 'Dara', bernie: 'Bernie',
  saoirse: 'Saoirse', frankie: 'Frankie', liam: 'Liam',
};

const STATUS_VARIANT = {
  working: 'info',
  'waiting on you': 'attention',
  done: 'success',
  failed: 'danger',
  parked: 'quiet',
  serving: 'serving',
};

const STATUS_LABEL = {
  working: 'Working',
  'waiting on you': 'Waiting on you',
  done: 'Done',
  failed: 'Failed',
  parked: 'Parked',
  serving: 'Serving',
};

// ---- helpers ----

function formatTime(ms) {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return { text: time };
  const boldWord = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { boldWord, text: `${date} · ${time}` };
}

function parseNeeds(text) {
  if (!text) return [];
  const idx = text.search(/Needs Elleta/i);
  if (idx < 0) return [];
  const out = [];
  for (const raw of text.slice(idx).split('\n').slice(1)) {
    const line = raw.trim();
    if (!line) { if (out.length) break; else continue; }
    if (/^(—|--|tuts|cheers|right|grand)/i.test(line) && out.length) break;
    const m = line.match(/^(?:\d+[.)]|[-*•])\s+(.*)/);
    if (m) out.push(m[1]); else if (out.length) out[out.length - 1] += ' ' + line;
  }
  return out.filter((s) => !/^(none|nothing|n\/a)\b|standing by/i.test(s));
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = (e) => setMatches(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return matches;
}

// ---- bubble sub-components ----

function RecvWrap({ lane, tail, children }) {
  const name = LANE_NAMES[lane] ?? lane;
  return (
    <div className="bar-chat-recv">
      <ChatBubble side="received" tail={tail}>
        {children}
      </ChatBubble>
      {tail && (
        <Avatar
          name={name}
          size="sm"
          src={LANE_SRC[lane]}
          ring
          className="bar-chat-av"
          style={LANE_RING[lane]}
        />
      )}
    </div>
  );
}

function ReportBubbles({ ev }) {
  const [expanded, setExpanded] = useState(false);
  const name = LANE_NAMES[ev.lane] ?? ev.lane;
  const text = ev.text ?? '';
  const needs = parseNeeds(text);

  // first 3 non-empty, non-header lines before the Needs section
  const needsIdx = text.search(/Needs Elleta/i);
  const bodyText = needsIdx >= 0 ? text.slice(0, needsIdx) : text;
  const introLines = bodyText.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 3);

  return (
    <>
      <p className="bar-chat-who">{name}</p>
      <RecvWrap lane={ev.lane} tail={!needs.length}>
        {introLines.map((l, i) => (
          <React.Fragment key={i}>{i > 0 && <br />}{inline(l, [], i)}</React.Fragment>
        ))}
        {text && (
          <button type="button" className="bar-chat-expand" onClick={() => setExpanded(x => !x)}>
            {expanded ? 'Less' : 'Full report'}
          </button>
        )}
      </RecvWrap>
      {expanded && (
        <RecvWrap lane={ev.lane} tail={false}>
          <pre className="bar-chat-pre">{text}</pre>
        </RecvWrap>
      )}
      {needs.map((need, i) => (
        <RecvWrap key={i} lane={ev.lane} tail={i === needs.length - 1}>
          {inline(need, [], i)}
        </RecvWrap>
      ))}
    </>
  );
}

function JobBubble({ ev }) {
  const name = LANE_NAMES[ev.lane] ?? ev.lane;
  return (
    <>
      <p className="bar-chat-who">{name}</p>
      <RecvWrap lane={ev.lane} tail>
        {inline(ev.text ?? '', [], 0)}
      </RecvWrap>
    </>
  );
}

function ImageBubble({ ev }) {
  const name = LANE_NAMES[ev.lane] ?? ev.lane;
  const src = `/bar/img?src=${encodeURIComponent(ev.src)}&p=${encodeURIComponent(ev.path)}`;
  const label = ev.path ? ev.path.split('/').pop() : '';
  return (
    <>
      <p className="bar-chat-who">{name}</p>
      <RecvWrap lane={ev.lane} tail>
        {label && <span className="bar-chat-img-label">{label}</span>}
        <img
          src={src}
          alt={ev.path}
          className="bar-chat-img"
          onClick={() => window.open(src, '_blank')}
        />
      </RecvWrap>
    </>
  );
}

// ---- BarChat ----

function BarChat({ events, lanes }) {
  const logRef = useRef(null);

  const chatItems = useMemo(() => {
    const items = [];
    let prev = null;
    events.forEach((ev, i) => {
      if (!prev || ev.t - prev.t > 30 * 60 * 1000) {
        items.push({ type: 'stamp', ...formatTime(ev.t), key: `s${i}` });
      }
      items.push({ type: ev.kind, ev, key: ev.id ?? `e${i}` });
      prev = ev;
    });
    return items;
  }, [events]);

  const workingLanes = lanes.filter(l => l.status === 'working');

  useEffect(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, [chatItems, workingLanes.length]);

  if (events.length === 0 && workingLanes.length === 0) {
    return (
      <div className="bar-chat">
        <div className="bar-chat-log" ref={logRef}>
          <p className="bar-empty">Nothing yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bar-chat">
      <div className="bar-chat-log" ref={logRef}>
        <ChatThread label="The Bar chat">
          {chatItems.map(item => {
            if (item.type === 'stamp') {
              return <ChatThreadTimestamp key={item.key} boldWord={item.boldWord}>{item.text}</ChatThreadTimestamp>;
            }
            if (item.type === 'report') return <ReportBubbles key={item.key} ev={item.ev} />;
            if (item.type === 'job')    return <JobBubble    key={item.key} ev={item.ev} />;
            if (item.type === 'image')  return <ImageBubble  key={item.key} ev={item.ev} />;
            return null;
          })}

          {workingLanes.map(l => (
            <React.Fragment key={l.id}>
              <p className="bar-chat-who">{l.name}</p>
              <div className="bar-chat-recv">
                <ChatBubble side="received" tail>
                  <TypingDots name={l.name} />
                </ChatBubble>
                <Avatar name={l.name} size="sm" src={LANE_SRC[l.id]} ring className="bar-chat-av" style={LANE_RING[l.id]} />
              </div>
            </React.Fragment>
          ))}
        </ChatThread>
      </div>
    </div>
  );
}

// ---- live data hook ----

export function useBar() {
  const [lanes, setLanes] = useState([]);
  const [events, setEvents] = useState([]);
  const [seenCount, setSeenCount] = useState(0);
  const [active, setActive] = useState(false);

  // Poll every 10s; networkidle-safe (quick requests, no persistent connection).
  useEffect(() => {
    const poll = () =>
      fetch('/bar/state')
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.lanes)) setLanes(d.lanes);
          if (Array.isArray(d.events)) setEvents(d.events);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, []);

  // SSE only when bar tab is visible.
  useEffect(() => {
    if (!active) return;
    const es = new EventSource('/bar/stream');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state' && Array.isArray(msg.lanes)) setLanes(msg.lanes);
        if (msg.type === 'event') setEvents(d => {
          if (d.some(x => x.id === msg.event.id)) return d;
          return [...d, msg.event];
        });
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

  return { lanes, events, needsItems, unread, markRead, setActive };
}

async function copyText(text, notify) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`Copied: ${text.length > 40 ? text.slice(0, 40) + '…' : text}`);
  } catch {
    notify('Could not copy');
  }
}

// ---- TheBar ----

export function TheBar({ lanes, events, needsItems, notify }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [waitOpen, setWaitOpen] = useState(false);
  const isWaitOpen = wide || waitOpen;

  return (
    <div className="bar-panel">
      <section className="bar-strip" aria-label="Lane strip">
        <ul className="bar-lanes">
          {lanes.map((l) => (
            <li key={l.id} className="bar-lane">
              <Avatar name={l.name} size="sm" src={LANE_SRC[l.id]} ring style={LANE_RING[l.id]} />
              <span className="bar-lane-name">{l.name}</span>
              <StatusPill variant={STATUS_VARIANT[l.status] ?? 'neutral'}>
                {STATUS_LABEL[l.status] ?? l.status}
              </StatusPill>
            </li>
          ))}
        </ul>
      </section>

      <details
        className="bar-waiting"
        open={isWaitOpen || undefined}
        onToggle={(e) => { if (!wide) setWaitOpen(e.currentTarget.open); }}
      >
        <summary className="bar-waiting-label">
          Waiting on you
          {!wide && needsItems.length > 0 && ` · ${needsItems.length}`}
        </summary>
        {needsItems.length === 0 ? (
          <p className="bar-empty">Nothing waiting.</p>
        ) : (
          <ul className="bar-needs">
            {needsItems.map((item, i) => (
              <li key={i} className="bar-needs-item">
                <span className="bar-needs-lane">{item.laneName}</span>
                <span className="bar-needs-text">{inline(item.text, [], i)}</span>
                {item.cmds.length > 0 && (
                  <span className="bar-needs-cmds">
                    {item.cmds.map((cmd) => (
                      <ActionChip key={cmd} onClick={() => copyText(cmd, notify)}>
                        {cmd}
                      </ActionChip>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>

      <BarChat events={events} lanes={lanes} />
    </div>
  );
}
