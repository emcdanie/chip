// The system map (chip-mock-03, Connectors › System map): BELLA's pipeline
// from GET /map as a top-down tree of cards on a dotted canvas. Every state is
// the server's (the checks, the connectors' last test, git, bella.json); a
// node whose source is failing says "Blocked by …". Groups open and close;
// the canvas pans, zooms and keeps a card where it was dragged.
//
// One change from the mock: the tree reflows by the canvas's own width. When
// the groups don't fit in one row they wrap into the next one, so nothing is
// clipped and nothing scrolls sideways. Fit never scales below 1, so card
// labels stay at the 14px floor.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, Sheet, SheetPart, NotMeasured } from './kit/index.jsx';
import { openReview, changed } from './ReviewSheet.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
// card, gaps and padding: the mock's NW, NH, GX, GY
const NW = 184;
const NH = 92;
const GX = 14;
const GY = 56;
const PAD = 12;
const CW = NW + GX;
const RH = NH + GY;
const POS_KEY = 'chip-map-pos';

// the server's states, in the mock's colours: green healthy, yellow needs
// attention, red failing; blocked is red and hatched
const TONE = { ok: 'pass', warn: 'needs', bad: 'fail', blocked: 'fail', unknown: 'neutral', off: 'neutral' };
const WORD = { ok: 'Healthy', warn: 'Needs attention', bad: 'Failing', blocked: 'Blocked', unknown: 'Not measured', off: 'Off' };
const RANK = ['bad', 'blocked', 'warn', 'unknown', 'off', 'ok'];
const ICON = {
  root: '◎', Design: '◐', Source: '▤', Checks: '✓', Review: '◑', Ship: '▲', Context: '☰',
  'figma-rest': '◇', figma: '◇', 'figma-console': '◇', tokens: '●', contracts: '▢', components: '▦', contrast: '◐', stories: '▣',
  agents: '☰', gate: '⛉', bench: '◔', compare: '⇄', review: '◑', ci: '⟳', ship: '▲', git: '⑂', ollama: '◎', claude: '✳', notion: '☰',
};

// the short line under a card's name: a count from the detail where there is
// one, otherwise where the fact comes from
function subOf(n) {
  if (n.action?.type === 'test') return 'MCP server';
  const count = n.detail?.match(/^(\d+ (?:of \d+|CSS variables|components))/);
  if (count) return count[1];
  const score = n.detail?.match(/Composite [\d.]+/);
  if (score) return score[0];
  if (n.id === 'git') return n.detail.replace(/\.$/, '');
  return n.source.split(' · ')[0];
}

// the sheet: why a part matters, what to do, and what its one button changes
const listOf = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
function whyOf(n) {
  if (n.isGroup) {
    const off = n.kids.filter((k) => k.state !== 'ok' && k.state !== 'off');
    return `${off.length ? `${off.length} of ${n.kids.length} parts ${off.length === 1 ? 'is' : 'are'} not healthy.` : `All ${n.kids.length} parts are healthy.`} The worst part sets the stage’s state, and every stage feeds the next.`;
  }
  return n.dependents.length ? `${listOf(n.dependents)} ${n.dependents.length === 1 ? 'reads' : 'read'} from it: if it breaks, ${n.dependents.length === 1 ? 'that is' : 'they are'} blocked too.` : 'Nothing else reads it, so a failure here stops nothing downstream.';
}
function doOf(n, a) {
  if (n.isGroup) {
    const worst = n.kids.find((k) => k.state === n.state && k.state !== 'ok');
    return worst ? `Start with ${worst.name}: select it on the map for its fix.` : 'Nothing. Every part is healthy.';
  }
  if (n.blockedBy) return `Fix ${n.blockedBy.name} first. This clears by itself once it passes.`;
  if (n.state === 'ok') return a ? `Nothing. ${a.label} only if you want a fresh result.` : 'Nothing. It is healthy.';
  if (n.state === 'off') return 'Nothing, unless you need it: it is off by choice.';
  if (a?.type === 'review') return 'Open the review card. It has the exact change, what it won’t touch, and its undo.';
  if (a?.type === 'run') return 'Run it again for a fresh result. If it still fails, the state above names what to fix.';
  if (a?.type === 'test') return 'Do what the state above says, then test it again.';
  return `CHIP has no one-click fix for this one. Fix it at its source: ${n.source}.`;
}
const ACT_TERMS = {
  test: { changes: 'CHIP calls the server once and records whether it answered. Nothing else changes.', undo: 'Nothing to undo.' },
  run: { changes: 'Runs the check on BELLA’s current commit and saves the result. No BELLA file changes.', undo: 'Nothing to undo.' },
  review: { changes: 'Opens the review card. Nothing changes until you press Accept there.', undo: 'Close it.' },
};

// what a failing or blocked node does to the rest, in one sentence each
function sentenceOf(nodes) {
  const bad = nodes.filter((n) => n.state === 'bad');
  if (!bad.length) return 'Nothing is failing.';
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const out = [];
  const quiet = [];
  for (const b of bad) {
    const hit = nodes.filter((x) => x.blockedBy?.id === b.id).map((x) => x.name);
    const verb = b.action?.type === 'test' ? 'isn’t answering' : 'is failing';
    if (hit.length) out.push(`${b.name} ${verb}, so ${list(hit)} ${hit.length > 1 ? 'are' : 'is'} blocked.`);
    else quiet.push(b.name);
  }
  if (quiet.length) out.push(`${out.length ? 'Also failing' : 'Failing'}: ${list(quiet)}.`);
  return out.join(' ');
}

// /map as a tree: the pipeline, its groups, their nodes. A group or the root
// takes its worst child's state and the share of children that are healthy.
function treeOf(map) {
  const groups = map.groups.map((g) => {
    const kids = map.nodes.filter((n) => n.group === g.id).map((n) => ({ ...n, sub: subOf(n) }));
    const by = [...new Set(kids.map((k) => k.blockedBy?.name).filter(Boolean))];
    return {
      id: `g:${g.id}`,
      name: g.name,
      icon: ICON[g.id],
      isGroup: true,
      state: g.state,
      healthy: g.healthy,
      blockedBy: g.state === 'blocked' && by.length ? { name: by.join(' and ') } : null,
      sub: `${kids.length} part${kids.length === 1 ? '' : 's'}`,
      kids,
    };
  });
  const worst = RANK.find((s) => groups.some((g) => g.state === s)) ?? 'unknown';
  return {
    id: 'root',
    name: 'BELLA pipeline',
    icon: ICON.root,
    isGroup: true,
    state: worst,
    healthy: Math.round((groups.filter((g) => g.state === 'ok').length / groups.length) * 100),
    sub: `${groups.length} parts`,
    kids: groups,
  };
}

const pillText = (n) => {
  if (n.blockedBy || n.state === 'blocked') return 'Blocked';
  if (n.isGroup) return n.state === 'ok' ? '100%' : `${n.healthy}% healthy`;
  if (n.action?.type === 'test' && (n.state === 'ok' || n.state === 'bad')) return n.state === 'ok' ? 'Answering' : 'Not answering';
  return WORD[n.state] ?? WORD.unknown;
};

// A node's block is its card with its open children packed below it, in rows
// no wider than the room it has. Returns the block's size in columns and rows,
// and writes every card's position and every link into P and L.
function block(n, avail, closed) {
  if (!n.kids?.length || closed.has(n.id)) return { w: 1, h: 1, put: (x, y, P) => (P[n.id] = { x, y }) };
  const kids = n.kids.map((k) => ({ k, b: block(k, avail, closed) }));
  const rows = [];
  for (const kb of kids) {
    const row = rows.at(-1);
    if (row && row.w + kb.b.w <= avail) {
      row.items.push(kb);
      row.w += kb.b.w;
      row.h = Math.max(row.h, kb.b.h);
    } else rows.push({ items: [kb], w: kb.b.w, h: kb.b.h });
  }
  const w = Math.max(1, ...rows.map((r) => r.w));
  const h = 1 + rows.reduce((s, r) => s + r.h, 0);
  const put = (ox, oy, P, L) => {
    const wpx = w * CW - GX;
    P[n.id] = { x: ox + (wpx - NW) / 2, y: oy };
    // a wrapped row is reached down the column gap nearest the parent's
    // centre (or the gap left of the block when it is one column wide)
    const mid = ox + wpx / 2;
    let trunk = ox - GX / 2;
    for (let i = 1; i < w; i += 1) {
      const g = ox + i * CW - GX / 2;
      if (Math.abs(g - mid) < Math.abs(trunk - mid)) trunk = g;
    }
    let y = oy + RH;
    rows.forEach((r, ri) => {
      let x = ox + (wpx - (r.w * CW - GX)) / 2;
      for (const { k, b } of r.items) {
        const bw = b.w * CW - GX;
        b.put(x, y, P, L);
        // the first row hangs straight from the parent
        L.push({ from: n.id, to: k.id, via: ri === 0 ? null : trunk });
        x += bw + GX;
      }
      y += r.h * RH;
    });
  };
  return { w, h, put };
}

function linkPath(a, b, via) {
  const x1 = a.x + NW / 2;
  const y1 = a.y + NH;
  const x2 = b.x + NW / 2;
  const y2 = b.y;
  if (via == null) {
    const m = (y1 + y2) / 2;
    return `M${x1} ${y1}V${m}H${x2}V${y2}`;
  }
  const m1 = y1 + GY / 2;
  const m2 = y2 - GY / 2;
  return `M${x1} ${y1}V${m1}H${via}V${m2}H${x2}V${y2}`;
}

const readPos = () => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || '{}');
  } catch {
    return {};
  }
};

/* Imperative handle for the page header's controls (− Fit + and Reset
   layout sit top right, beside the title, as in the mock). */
export function useMapControls() {
  const ref = useRef(null);
  return {
    ref,
    zoomIn: () => ref.current?.zoom(1.2),
    zoomOut: () => ref.current?.zoom(1 / 1.2),
    fit: () => ref.current?.fit(),
    reset: () => ref.current?.reset(),
  };
}

export default function SystemMap({ controls, map, onReload }) {
  const [sel, setSel] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [openSet, setClosed] = useState(null);
  const [pos, setPos] = useState(readPos);
  const [view, setView] = useState({ k: 1, x: PAD, y: PAD });
  const [width, setWidth] = useState(0);
  const canvas = useRef(null);
  const nodesRef = useRef(null);
  const dragged = useRef(false);

  const tree = useMemo(() => (map && !map.error ? treeOf(map) : null), [map]);
  // every group starts closed, as in the mock: the pipeline and its six parts
  const closed = useMemo(() => openSet ?? new Set(tree?.kids.map((g) => g.id) ?? []), [openSet, tree]);

  const byId = useMemo(() => {
    const out = {};
    const walk = (n, parent) => {
      out[n.id] = { n, parent };
      n.kids?.forEach((k) => walk(k, n));
    };
    if (tree) walk(tree, null);
    return out;
  }, [tree]);

  const cols = Math.max(1, Math.floor((width - 2 * PAD + GX) / CW));
  const lay = useMemo(() => {
    if (!tree) return null;
    const P = {};
    const L = [];
    const b = block(tree, cols, closed);
    b.put(0, 0, P, L);
    for (const [id, o] of Object.entries(pos)) {
      if (P[id]) P[id] = { x: P[id].x + o.dx, y: P[id].y + o.dy };
    }
    const xs = Object.values(P);
    const W = Math.max(...xs.map((p) => p.x)) + NW;
    const H = Math.max(...xs.map((p) => p.y)) + NH + 24;
    return { P, L, W, H, visible: Object.keys(P) };
  }, [tree, cols, closed, pos]);

  const fit = useCallback(() => {
    const c = canvas.current;
    if (!c || !lay) return;
    setView({ k: 1, x: Math.max(PAD, (c.clientWidth - lay.W) / 2), y: PAD });
  }, [lay]);

  // measure the canvas; fit again whenever its width or the tree changes
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const ro = new ResizeObserver(() => setWidth(c.clientWidth));
    ro.observe(c);
    setWidth(c.clientWidth);
    return () => ro.disconnect();
  }, [tree]);
  useLayoutEffect(() => {
    fit();
  }, [fit, width]);

  const zoom = useCallback((f) => {
    const c = canvas.current;
    if (!c) return;
    const cx = c.clientWidth / 2;
    const cy = c.clientHeight / 2;
    setView((v) => {
      const k = Math.min(2, Math.max(0.3, v.k * f));
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    });
  }, []);
  const reset = useCallback(() => {
    setPos({});
    try {
      localStorage.removeItem(POS_KEY);
    } catch {}
    setMsg(null);
  }, []);
  if (controls) controls.ref.current = { zoom, fit, reset };

  /* ---- pan the canvas, drag a card ---- */
  function onCanvasDown(e) {
    if (e.button !== 0 || e.target.closest('.cn-node')) return;
    const c = canvas.current;
    const sx = e.clientX - view.x;
    const sy = e.clientY - view.y;
    c.classList.add('grab');
    const mv = (ev) => setView((v) => ({ ...v, x: ev.clientX - sx, y: ev.clientY - sy }));
    const up = () => {
      c.classList.remove('grab');
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  }
  function onCardDown(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const o = pos[id] ?? { dx: 0, dy: 0 };
    let moved = false;
    let last = null;
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / view.k;
      const dy = (ev.clientY - sy) / view.k;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      last = { dx: o.dx + dx, dy: o.dy + dy };
      setPos((p) => ({ ...p, [id]: last }));
    };
    const up = () => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      if (moved) {
        dragged.current = true;
        setPos((p) => {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(p));
          } catch {}
          return p;
        });
      }
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  }
  function onCanvasKey(e) {
    if (e.target.closest('.cn-keys')) return;
    if (e.key === '+' || e.key === '=') (e.preventDefault(), zoom(1.2));
    else if (e.key === '-') (e.preventDefault(), zoom(1 / 1.2));
    else if (e.key === '0') (e.preventDefault(), fit());
  }

  /* ---- cards: Enter selects, arrows walk the tree ---- */
  const focusCard = (id) => nodesRef.current?.querySelector(`[data-sel="${CSS.escape(id)}"]`)?.focus();
  function onCardKey(e, id) {
    const { n, parent } = byId[id];
    let t = null;
    if (e.key === 'ArrowUp' && parent) t = parent.id;
    if (e.key === 'ArrowDown' && n.kids?.length && !closed.has(id)) t = n.kids[0].id;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && parent) {
      const i = parent.kids.findIndex((k) => k.id === id);
      t = parent.kids[i + (e.key === 'ArrowRight' ? 1 : -1)]?.id ?? null;
    }
    if (t) {
      e.preventDefault();
      focusCard(t);
    }
  }
  function select(id) {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSel(id);
    setMsg(null);
    setSheetId(id);
  }
  function toggle(id) {
    setClosed(() => {
      const next = new Set(closed);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function act(a) {
    setMsg(null);
    if (a.type === 'review') {
      setSheetId(null);
      return openReview(a.check);
    }
    setBusy(a.type === 'test' ? 'Testing…' : 'Starting…');
    try {
      if (a.type === 'test') {
        const r = await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: a.server }) });
        const j = await r.json();
        setMsg(j.status === 'connected' ? `${a.server} answers.` : `${a.server} is not answering${j.error ? `: ${j.error}` : ''}.`);
      } else if (a.type === 'run') {
        const r = await fetch(`/checks/${a.check}/run`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
        const j = await r.json();
        setMsg(r.ok ? 'Started. Overview shows the result when it lands.' : j.error);
      }
      await onReload();
      changed();
    } finally {
      setBusy(null);
    }
  }

  if (!map) return <p className="k-sub">Reading the system…</p>;
  if (map.error) return <p className="k-sub">The map could not be read (is the CHIP server running?).</p>;

  const near = (id) => {
    if (!sel || !byId[sel] || id === sel) return false;
    return byId[sel].parent?.id === id || byId[id]?.parent?.id === sel;
  };
  const isBlocked = (n) => n.state === 'blocked' || !!n.blockedBy;
  const node = sheetId ? byId[sheetId]?.n : null;
  const nameOf = (id) => map.nodes.find((x) => x.id === id)?.name ?? id;
  const action = node?.action ? { ...node.action, label: node.action.type === 'test' && node.state === 'bad' ? 'Reconnect' : node.action.label } : null;

  return (
    <div className="cn-map">
      <p className="cn-sub" aria-live="polite">
        {sentenceOf(map.nodes)}
      </p>
      <div
        className="cn-canvas"
        ref={canvas}
        tabIndex={0}
        role="group"
        aria-label="System map: drag to pan, plus and minus to zoom, 0 to fit"
        style={{ height: `max(clamp(320px, 44vh, 480px), ${Math.ceil(lay?.H ?? 0) + 2 * PAD}px)` }}
        onPointerDown={onCanvasDown}
        onKeyDown={onCanvasKey}
      >
        {lay ? (
          <div className="cn-world" style={{ width: lay.W, height: lay.H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="cn-links" width={lay.W} height={lay.H} aria-hidden="true">
              {lay.L.map((l) => (
                <path
                  key={`${l.from}-${l.to}`}
                  className={isBlocked(byId[l.to].n) ? 'bl' : sel && (sel === l.from || sel === l.to) ? 'run flow' : 'run'}
                  d={linkPath(lay.P[l.from], lay.P[l.to], l.via)}
                />
              ))}
            </svg>
            <ul className="cn-nodes" ref={nodesRef} aria-label="Parts of the pipeline">
              {lay.visible.map((id) => {
                const n = byId[id].n;
                const bl = isBlocked(n);
                const st = bl ? 'blocked' : n.state;
                const open = n.kids?.length && !closed.has(id);
                return (
                  <li
                    key={id}
                    className={['cn-node', st, sel === id && 'on', near(id) && 'near'].filter(Boolean).join(' ')}
                    style={{ left: lay.P[id].x, top: lay.P[id].y }}
                  >
                    <button
                      type="button"
                      className="cn-card"
                      data-sel={id}
                      aria-haspopup="dialog"
                      title={n.detail ?? undefined}
                      onPointerDown={(e) => onCardDown(e, id)}
                      onClick={() => select(id)}
                      onKeyDown={(e) => onCardKey(e, id)}
                    >
                      <span className="cn-ic" aria-hidden="true">
                        {n.icon ?? ICON[n.id] ?? '●'}
                      </span>
                      <span className="cn-tx">
                        <b>{n.name}</b>
                        <small>{n.blockedBy ? `Blocked by ${n.blockedBy.name}` : n.sub}</small>
                      </span>
                      <StatusPill tone={TONE[st] ?? 'neutral'}>{pillText(n)}</StatusPill>
                    </button>
                    {n.kids?.length ? (
                      <button type="button" className="cn-tog" aria-expanded={!!open} aria-label={`${open ? 'Collapse' : 'Expand'} ${n.name}`} onClick={() => toggle(id)}>
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <Sheet
        open={!!node}
        kicker={node ? (node.isGroup ? `Pipeline stage · ${node.kids.length} parts` : `Pipeline part · ${node.group ?? 'System'}`) : null}
        title={node?.name ?? ''}
        onClose={() => setSheetId(null)}
        actions={
          action
            ? [
                {
                  label: busy ?? action.label,
                  variant: node.state === 'bad' ? 'primary' : 'secondary',
                  disabled: !!busy,
                  onClick: () => act(action),
                  ...ACT_TERMS[action.type],
                },
              ]
            : null
        }
      >
        {node ? (
          <>
            <SheetPart label="What this is">
              <p>{node.isGroup ? `A stage of BELLA’s pipeline with ${node.kids.length} parts: ${listOf(node.kids.map((k) => k.name))}.` : `One of the ${node.group ?? 'pipeline’s'} parts of BELLA’s pipeline${node.deps.length ? `, after ${listOf(node.deps.map(nameOf))}` : ', and a source: nothing comes before it'}.`}</p>
            </SheetPart>
            <SheetPart
              label="State"
              pill={<StatusPill tone={TONE[isBlocked(node) ? 'blocked' : node.state] ?? 'neutral'}>{node.blockedBy ? `Blocked by ${node.blockedBy.name}` : node.isGroup ? `${WORD[node.state] ?? WORD.unknown} · ${pillText(node)}` : pillText(node)}</StatusPill>}
            >
              {node.isGroup ? (
                <ul className="plain">
                  {node.kids.map((k) => (
                    <li key={k.id}>
                      <span>{k.name}</span> <StatusPill tone={TONE[isBlocked(k) ? 'blocked' : k.state] ?? 'neutral'}>{pillText(k)}</StatusPill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{node.detail ?? <NotMeasured />}</p>
              )}
            </SheetPart>
            <SheetPart label="Why it matters" source={node.isGroup ? null : <code>{node.source}</code>}>
              {node.blockedBy ? <p>It reads from {node.blockedBy.name}, so nothing it says can be trusted until that passes.</p> : null}
              <p>{whyOf(node)}</p>
            </SheetPart>
            <SheetPart label="What to do" fix>
              <p>{doOf(node, action)}</p>
            </SheetPart>
            {msg ? <p role="status">{msg}</p> : null}
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
