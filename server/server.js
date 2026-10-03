// CHIP local server: serves the app and answers POST /ask with the local
// model over the local index. Nothing here calls a paid or remote API.
import express from 'express';
import cors from 'cors';
import { join, resolve, relative } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT, PORT, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL } from './lib/config.mjs';
import { ask, askStream } from './lib/ask.mjs';
import { warm } from './lib/llm.js';
import { loadIndex } from './lib/index.mjs';
import { listAll } from './providers/index.mjs';
import * as host from './host/registry.js';
import { logUsage, claudeToday } from './lib/usage.mjs';
import { CHIP_CLAUDE_DAILY } from './lib/config.mjs';

const app = express();
app.use(express.json());

// Local-only server; reflect every origin including null (file:// pages).
app.use(cors({ origin: true, credentials: false }));

// The built app (npm run app:build) at /, real BELLA data at /data. The old
// static bridge is archived in docs/archive/chip-bridge-v0.
app.use(express.static(join(ROOT, 'app/dist')));
app.use('/data', express.static(join(ROOT, 'data'), { index: false }));

app.get('/health', (_req, res) => {
  const index = loadIndex();
  res.json({ ok: true, model: CHIP_MODEL, embedModel: CHIP_EMBED_MODEL, ollama: OLLAMA_URL,
    chunks: index ? index.chunks.length : 0, indexedAt: index ? index.builtAt : null });
});

// Contract: { message, sessionId, page? } -> { reply, sessionId, sources: [{ n, title, url | path, passage, score }] }
// or, when the best match is weak, { weak: true, closest: [the 3 nearest sources] } with no model call.
// page is what the user is looking at ("Atlas · Button").
// With { stream: true }: NDJSON lines, { type: 'sources' } then { type: 'token', text }
// pieces, then { type: 'done', reply, sessionId, sources } (or { type: 'error' }).
app.post('/ask', async (req, res) => {
  const { message, sessionId, stream } = req.body || {};
  const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 120) : undefined;
  // who answers: 'local:<model>' or 'claude'; route says why ("Auto → Claude · asked for a review")
  const providerId = typeof req.body?.provider === 'string' ? req.body.provider.slice(0, 80) : undefined;
  const route = typeof req.body?.route === 'string' ? req.body.route.slice(0, 160) : null;
  const auto = req.body?.auto === true;
  const includePrivate = req.body?.includePrivate === true;
  const override = req.body?.override;
  if (override && typeof override.autoChose === 'string' && typeof override.chose === 'string') {
    logUsage({ type: 'override', autoChose: override.autoChose.slice(0, 80), chose: override.chose.slice(0, 80), page });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (stream) {
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    try {
      for await (const ev of askStream(message.trim(), sessionId, page, { provider: providerId, includePrivate })) {
        res.write(JSON.stringify(ev) + '\n');
        if (ev.type === 'done') logUsage({ type: 'ask', provider: ev.provider, asked: providerId ?? 'local', route, auto, page });
        if (ev.type === 'weak') logUsage({ type: 'ask', provider: 'none', asked: providerId ?? 'local', route, auto, page, weak: true });
      }
    } catch (err) {
      console.error('[CHIP server]', err.message);
      res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n');
    }
    return res.end();
  }
  try {
    res.json(await ask(message.trim(), sessionId, page));
  } catch (err) {
    console.error('[CHIP server]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /models: what OBI can pick, and today's Claude budget for Auto.
app.get('/models', async (_req, res) => {
  res.json({ models: await listAll(), budget: { used: claudeToday(), limit: CHIP_CLAUDE_DAILY } });
});

// The host: MCP servers and CLI tools behind one registry (docs/host.md).
// GET /host lists servers and status; POST /host/test connects one; POST
// /host/call runs a tool through the guard (a write returns a preview and
// waits); POST /host/confirm or /host/cancel settles a pending write.
const sameApp = (req, res) => {
  const origin = req.get('origin');
  if (origin && !APP_ORIGINS.has(origin)) {
    res.status(403).json({ error: 'origin not allowed' });
    return false;
  }
  return true;
};
app.get('/host', (_req, res) => res.json({ servers: host.servers() }));
app.post('/host/test', async (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(await host.test(String(req.body?.server ?? '')));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/host/call', async (req, res) => {
  if (!sameApp(req, res)) return;
  const { server, tool, args, purpose } = req.body ?? {};
  try {
    res.json(await host.call({ server: String(server ?? ''), tool: String(tool ?? ''), args: args ?? {}, purpose: typeof purpose === 'string' ? purpose.slice(0, 200) : null }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/host/confirm', async (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(await host.confirm(String(req.body?.id ?? '')));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/host/cancel', (req, res) => {
  if (!sameApp(req, res)) return;
  res.json(host.cancel(String(req.body?.id ?? '')));
});

// GET /docs: every indexed source once, { title, path | url }, for the jump palette.
app.get('/docs', (_req, res) => {
  const index = loadIndex();
  const seen = new Map();
  for (const c of index?.chunks ?? []) {
    const key = c.url || c.path;
    if (!seen.has(key)) seen.set(key, c.url ? { title: c.title, url: c.url } : { title: c.title, path: c.path });
  }
  res.json([...seen.values()]);
});

// GET /source?path=<indexed path>: the text of one source, so a citation can
// open it. Only paths that are in the search index; nothing else on disk.
app.get('/source', (req, res) => {
  const index = loadIndex();
  const path = String(req.query.path || '');
  const known = index && index.chunks.some((c) => c.path === path);
  const file = resolve(ROOT, path);
  if (!known || relative(ROOT, file).startsWith('..') || !existsSync(file)) return res.status(404).type('text/plain').send('Not an indexed source.');
  res.type('text/plain; charset=utf-8').send(readFileSync(file, 'utf8'));
});

// Component notes saved from OBI answers: data/notes.json (local, gitignored).
// GET /notes -> [{ component, text, question, at }]; POST /notes adds one.
const NOTES = join(ROOT, 'data/notes.json');
const readNotes = () => {
  try {
    return JSON.parse(readFileSync(NOTES, 'utf8'));
  } catch {
    return [];
  }
};
app.get('/notes', (_req, res) => res.json(readNotes()));
app.post('/notes', (req, res) => {
  const origin = req.get('origin');
  if (origin && !APP_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin not allowed' });
  const { component, text, question } = req.body || {};
  if (typeof component !== 'string' || !/^[A-Za-z]{1,40}$/.test(component) || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'component (a BELLA component name) and text are required' });
  }
  const note = { component, text: text.trim().slice(0, 4000), question: typeof question === 'string' ? question.slice(0, 500) : null, at: new Date().toISOString() };
  writeFileSync(NOTES, JSON.stringify([...readNotes(), note], null, 2) + '\n');
  res.status(201).json(note);
});

// POST /cmd runs one of the four chip commands and streams its output as
// plain text, ending with "[exit N]". Only these four, as an argv to node
// bin/chip.mjs: no shell, no other programs. One at a time. A page on another
// origin can't drive it (the browser sends its Origin; anything not this
// app's is refused). Contract: { cmd: 'ask'|'sync'|'audit'|'status', question? }
const COMMANDS = new Set(['ask', 'sync', 'audit', 'status']);
const APP_ORIGINS = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173', `http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`,
]);
const CMD_TIMEOUT_MS = 10 * 60 * 1000;
let running = null;

app.post('/cmd', (req, res) => {
  const origin = req.get('origin');
  if (origin && !APP_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin not allowed' });
  const { cmd, question } = req.body || {};
  if (!COMMANDS.has(cmd)) return res.status(400).json({ error: 'cmd must be one of ask, sync, audit, status' });
  const argv = [join(ROOT, 'bin/chip.mjs'), cmd];
  if (cmd === 'ask') {
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'question is required for ask' });
    argv.push(question.trim().slice(0, 2000));
  }
  if (running) return res.status(409).json({ error: `chip ${running} is still running` });

  running = cmd;
  const child = spawn(process.execPath, argv, { cwd: ROOT, shell: false, env: { ...process.env, NO_COLOR: '1' } });
  const timer = setTimeout(() => child.kill('SIGTERM'), CMD_TIMEOUT_MS);
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  child.stdout.on('data', (d) => res.write(d));
  child.stderr.on('data', (d) => res.write(d));
  child.on('error', (err) => res.write(`chip: ${err.message}\n`));
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    running = null;
    res.end(`\n[exit ${code ?? signal}]\n`);
  });
  // the page went away: stop the command rather than run it unseen
  res.on('close', () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  });
});

// Bound to localhost: nothing on the network can reach /ask or /cmd.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[CHIP] http://localhost:${PORT} · model ${CHIP_MODEL} · embeddings ${CHIP_EMBED_MODEL} · ${OLLAMA_URL}`);
  const t = Date.now();
  warm().then(() => console.log(`[CHIP] models warm (${((Date.now() - t) / 1000).toFixed(1)}s)`))
    .catch((err) => console.error('[CHIP] warm-up failed:', err.message));
});
