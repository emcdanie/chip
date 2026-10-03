// Guard: the one place that decides whether a tool call may run.
//   - read tools run straight away;
//   - write tools never run on the first call: CHIP returns a preview (what
//     will change, before -> after when it can tell) and waits for someone to
//     click Confirm in OBI; Cancel drops it;
//   - a server whose config does not allow "write" refuses write tools.
import { randomUUID } from 'node:crypto';

const pending = new Map(); // id -> { server, tool, args, purpose, at }
const PENDING_MS = 10 * 60 * 1000;
const PENDING_MAX = 20;

function sweep() {
  const now = Date.now();
  for (const [id, p] of pending) if (now - p.at > PENDING_MS) pending.delete(id);
  while (pending.size >= PENDING_MAX) pending.delete(pending.keys().next().value); // oldest first
}

/** Returns { run: true } or { refused: reason } or { pending: { id, preview } }. */
export async function guard({ serverCfg, tool, args, purpose, readBefore, session }) {
  if (tool.kind === 'read') return { run: true };
  if (!(serverCfg.allow ?? []).includes('write')) return { refused: `${serverCfg.name} is read-only in chip.config (allow: ${(serverCfg.allow ?? []).join(', ') || 'none'})` };
  const id = randomUUID();
  // before: what the thing looks like now, when the server can say (a read
  // tool mapped to this write); after: the arguments the write would apply
  let before = null;
  if (readBefore) {
    try {
      before = (await readBefore()).slice(0, 1500);
    } catch (e) {
      before = `(could not read the current value: ${e.message.slice(0, 120)})`;
    }
  }
  sweep();
  // only the page that asked can confirm it
  pending.set(id, { server: serverCfg.name, tool: tool.name, args, purpose, session, at: Date.now() });
  return { pending: { id, preview: { server: serverCfg.name, tool: tool.name, purpose, before, after: args } } };
}

/** Takes a pending write out of the queue (Confirm runs it, Cancel drops it). */
export function take(id, session) {
  const p = pending.get(id);
  if (!p || !session || p.session !== session) return null;
  pending.delete(id);
  if (Date.now() - p.at > PENDING_MS) return null;
  return p;
}
