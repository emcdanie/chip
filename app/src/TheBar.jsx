// The Bar: lane strip + "Waiting on you" pinned list. Read-only; no chat
// yet (needs BELLA chat parts). Subscribes to GET /bar/stream and polls
// GET /bar/state for initial data.
import React, { useEffect, useRef, useState } from 'react';
import Avatar from '@bella/components/Avatar/Avatar';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';

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
              <Avatar name={l.name} size="sm" />
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
                <span className="bar-needs-text">{item.text}</span>
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

      <p className="bar-chat-placeholder">Chat arrives with BELLA's chat parts.</p>
    </div>
  );
}
