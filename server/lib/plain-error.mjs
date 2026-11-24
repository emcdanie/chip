// Errors in plain words (Elleta, 22 Nov: "when i ask questions in the chat its unclear whats an error it just says
// yaml.. i dont get it"). Every error that reaches a page is three lines: what failed, why in one clause, and what
// she can do. The raw exception goes to the server log and never to the page.
const KINDS = [
  { id: 'yaml', test: /yaml|YAMLException|bad indentation|duplicated mapping key|unidentified alias|end of the stream or a document separator/i, what: "I couldn't read one of BELLA's spec files.", why: "it isn't valid YAML, so nothing could be read from it", can: ['try-again', 'ask-agent', 'open-file'] },
  { id: 'model-off', test: /ECONNREFUSED|fetch failed|11434|ollama|not reachable/i, what: "The local model isn't running.", why: "Ollama didn't answer on this Mac", can: ['try-again'] },
  { id: 'no-index', test: /no index/i, what: "I can't search BELLA's docs yet.", why: "they haven't been indexed on this Mac", can: ['try-again', 'ask-agent'] },
  { id: 'login', test: /not signed in|login|not installed/i, what: "Claude isn't available.", why: 'Claude Code is not signed in on this Mac', can: ['try-again'] },
  { id: 'timeout', test: /timed? ?out|took longer|ETIMEDOUT|aborted/i, what: 'That took too long.', why: 'the answer did not come back in time and was stopped', can: ['try-again'] },
  { id: 'missing', test: /ENOENT|no such file|not found/i, what: "I couldn't find a file I needed.", why: 'it is not where CHIP looks for it', can: ['try-again', 'ask-agent', 'open-file'] },
  { id: 'json', test: /JSON|Unexpected token/i, what: "I couldn't read a data file.", why: "it isn't valid JSON", can: ['try-again', 'ask-agent', 'open-file'] },
  { id: 'origin', test: /origin not allowed/i, what: 'CHIP refused that request.', why: 'it came from a page that is not CHIP', can: [] },
];
const FALLBACK = { id: 'unknown', what: "That didn't work.", why: 'CHIP hit a problem it has no plain word for yet; the details are in the server log', can: ['try-again', 'ask-agent'] };
const FILE = /((?:[\w.-]+\/)+[\w.-]+\.(?:ya?ml|json|md|mjs|jsx?))/;

/** Raw error (Error or text) -> { id, what, why, can: ['try-again' | 'ask-agent' | 'open-file'], file, text }. Logs the raw one. */
export function plainError(err, { log = true, where = '' } = {}) {
  const raw = String(err?.stack ?? err?.message ?? err ?? '');
  const msg = String(err?.message ?? err ?? '');
  if (log) console.error(`[CHIP error${where ? ` · ${where}` : ''}]`, raw.split('\n').slice(0, 6).join('\n'));
  const kind = KINDS.find((k) => k.test.test(msg)) ?? FALLBACK;
  const file = msg.match(FILE)?.[1] ?? null;
  const can = kind.can.filter((c) => c !== 'open-file' || file);
  const text = `${kind.what} Why: ${kind.why}.`;
  return { id: kind.id, what: kind.what, why: kind.why, can, file, text };
}
