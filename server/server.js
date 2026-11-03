// CHIP local server: serves the app and answers POST /ask with the local
// model over the local index. Nothing here calls a paid or remote API.
import express from 'express';
import cors from 'cors';
import { join, resolve, relative } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT, PORT, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL, NOTES_DIR } from './lib/config.mjs';
import { ask, askStream, WEAK_SCORE } from './lib/ask.mjs';
import { warm } from './lib/llm.js';
import { loadIndex, buildIndex, searchDocs } from './lib/index.mjs';
import { listDocs, readDoc, saveDoc, STATUSES } from './lib/docs.mjs';
import { homedir } from 'node:os';
import { listAll } from './providers/index.mjs';
import * as host from './host/registry.js';
import { logUsage, claudeToday, usageWeek } from './lib/usage.mjs';
import { CHIP_CLAUDE_DAILY } from './lib/config.mjs';
import * as bellaWork from './lib/bella-work.mjs';
import { barState, barStream, barImg } from './lib/bar.mjs';
import { readVisibility, setVisibility, compare } from './lib/atlas-extras.mjs';
import { specOf, figmaLint } from './lib/spec-lint.mjs';
import { attachTerminal, repoList } from './lib/term.mjs';
import { listChecks, readResult, refreshIfStale, runCheck } from './lib/checks.mjs';
import { accept, fixableChecks, reviewCard, reviewImage, undo, waitingChecks } from './lib/review.mjs';
import { needsYou } from './lib/needs.mjs';
import { historyRecord, searchHistory } from './lib/history.mjs';
import { systemMap } from './lib/map.mjs';

const app = express();
app.use(express.json());

// Local-only server; reflect every origin including null (file:// pages).
app.use(cors({ origin: true, credentials: false }));

// The built app (npm run app:build) at /, real BELLA data at /data. The old
// static bridge is archived in docs/archive/chip-bridge-v0.
app.use(express.static(join(ROOT, 'app/dist')));
app.use('/data', express.static(join(ROOT, 'data'), { index: false }));

// The Bar: lane state, SSE stream, and image proxy.
app.get('/bar/state', barState);
app.get('/bar/stream', barStream);
app.get('/bar/img', barImg);

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
      const t0 = Date.now();
      for await (const ev of askStream(message.trim(), sessionId, page, { provider: providerId, includePrivate })) {
        res.write(JSON.stringify(ev) + '\n');
        // route: where the answer was made; why: the router's reason
        if (ev.type === 'done') logUsage({ type: 'ask', route: ev.place === 'cloud' ? 'cloud' : 'local', provider: ev.provider, model: ev.model, prompt: ev.tokens.prompt, output: ev.tokens.output, ms: Date.now() - t0, asked: providerId ?? 'local', why: route, auto, page });
        if (ev.type === 'weak') logUsage({ type: 'ask', route: 'local', provider: 'none', model: null, prompt: 0, output: 0, ms: Date.now() - t0, asked: providerId ?? 'local', why: route, auto, page, weak: true });
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

// GET /usage: the week's ledger summary (Health's Usage card, OBI's /usage).
// POST /usage logs an answer made in the page from BELLA data (no model).
app.get('/usage', (_req, res) => res.json(usageWeek()));
app.post('/usage', (req, res) => {
  const origin = req.get('origin');
  if (!origin || !APP_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin not allowed' });
  const { kind, ms, page } = req.body ?? {};
  if (kind !== 'data') return res.status(400).json({ error: 'kind must be data' });
  logUsage({ type: 'data', route: 'data', provider: 'data', model: null, prompt: 0, output: 0, ms: Number.isFinite(ms) ? Math.round(ms) : null, page: typeof page === 'string' ? page.slice(0, 120) : undefined });
  res.status(204).end();
});

// GET /models: what OBI can pick, and today's Claude budget for Auto.
app.get('/models', async (_req, res) => {
  res.json({ models: await listAll(), budget: { used: claudeToday(), limit: CHIP_CLAUDE_DAILY } });
});

// The host: MCP servers and CLI tools behind one registry (docs/host.md).
// GET /host lists servers and status; POST /host/test connects one; POST
// /host/call runs a tool through the guard (a write returns a preview and
// waits); POST /host/confirm or /host/cancel settles a pending write.
// A browser always sends Origin on a POST, so a POST without one, or from
// another site, is refused. A GET from another site carries Origin too.
const sameApp = (req, res, { post = true } = {}) => {
  const origin = req.get('origin');
  if (origin ? !APP_ORIGINS.has(origin) : post) {
    res.status(403).json({ error: 'origin not allowed' });
    return false;
  }
  return true;
};
const session = (req) => String(req.get('x-chip-session') ?? '').slice(0, 64) || null;
app.get('/host', (req, res) => {
  if (!sameApp(req, res, { post: false })) return;
  res.json({ servers: host.servers() });
});
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
    res.json(await host.call({ server: String(server ?? ''), tool: String(tool ?? ''), args: args ?? {}, purpose: typeof purpose === 'string' ? purpose.slice(0, 200) : null, session: session(req) }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/host/confirm', async (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(await host.confirm(String(req.body?.id ?? ''), session(req)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/host/cancel', (req, res) => {
  if (!sameApp(req, res)) return;
  res.json(host.cancel(String(req.body?.id ?? ''), session(req)));
});

// Atlas v4: visibility (simulated roles), How others do it, the component's
// Documentation and History from BELLA, and the guarded review flow.
const bellaComponent = (id) => JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8')).components.find((c) => c.id === id);
const fail = (res, e) => res.status(400).json({ error: e.message });
app.get('/visibility', (req, res) => res.json(readVisibility()));
app.put('/visibility', (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(setVisibility(req.body ?? {}));
  } catch (e) {
    fail(res, e);
  }
});
app.get('/compare/:id', async (req, res) => {
  const c = bellaComponent(String(req.params.id));
  if (!c) return res.status(404).json({ error: 'No such component' });
  res.json(await compare(c));
});
app.get('/bella-doc/:id', (req, res) => {
  try {
    res.json(bellaWork.readDoc(String(req.params.id)));
  } catch (e) {
    fail(res, e);
  }
});
app.post('/bella-doc/:id/propose', (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(bellaWork.propose(String(req.params.id), req.body ?? {}));
  } catch (e) {
    fail(res, e);
  }
});
app.get('/bella-doc-job/:job', (req, res) => res.json(bellaWork.jobOf(String(req.params.job)) ?? { error: 'No such job' }));
app.post('/bella-doc-discard', (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(bellaWork.discard(String(req.body?.branch ?? '')));
  } catch (e) {
    fail(res, e);
  }
});
// without { confirm: true } this is a dry run: the preview and the exact commands, nothing runs
app.post('/bella-doc-pr', async (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(await bellaWork.pullRequest({ branch: String(req.body?.branch ?? ''), confirm: req.body?.confirm === true, dryRun: req.body?.dryRun !== false }));
  } catch (e) {
    fail(res, e);
  }
});
app.get('/bella-spec/:id', (req, res) => {
  const c = bellaComponent(String(req.params.id));
  if (!c) return res.status(404).json({ error: 'No such component' });
  res.json(specOf(c));
});
app.get('/figma-lint/:id', async (req, res) => {
  const c = bellaComponent(String(req.params.id));
  if (!c) return res.status(404).json({ error: 'No such component' });
  const props = specOf(c).props?.map((p) => p.name) ?? c.props ?? [];
  res.json(await figmaLint(c, { refresh: req.query.refresh === '1', codeProps: props }));
});
app.get('/bella-history/:id', (req, res) => {
  try {
    res.json(bellaWork.history(String(req.params.id)));
  } catch (e) {
    fail(res, e);
  }
});
app.get('/bella-baseline', (req, res) => {
  try {
    res.type('png').send(bellaWork.baseline(String(req.query.rev ?? ''), String(req.query.path ?? '')));
  } catch (e) {
    res.status(404).end();
  }
});

// GET /search?q=<text>&k=<1..20>: the library search, no model call.
// -> { query, top, weak, indexedAt, results: [{ title, url | path, passage, score, strength }] }
// One result per page. weak is true when the best match is under WEAK_SCORE
// (the same line OBI uses before it refuses to answer): the page says so
// instead of presenting the closest pages as answers. strength per result:
// weak under that line, loose more than LOOSE_GAP below the best match
// (measured 3 Nov: off-topic second hits sat 0.10 to 0.13 under the top).
const LOOSE_GAP = 0.1;
const strengthOf = (score, top) => (score < WEAK_SCORE ? 'weak' : score < top - LOOSE_GAP ? 'loose' : 'strong');
const passageFor = (text, query) => {
  // plain text: no heading marks, bold or link syntax in a passage
  const t = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const words = query.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 3);
  const at = words.map((w) => t.toLowerCase().indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 80);
  const cut = t.slice(start, start + 320);
  return (start > 0 ? '…' + cut.replace(/^\S*\s/, '') : cut).replace(/\s+\S*$/, '') + (start + 320 < t.length ? '…' : '');
};
app.get('/search', async (req, res) => {
  const query = String(req.query.q ?? '').trim().slice(0, 300);
  if (!query) return res.status(400).json({ error: 'q is required' });
  const k = Math.min(20, Math.max(1, Number(req.query.k) || 8));
  try {
    const hits = await searchDocs(query, k);
    const top = hits[0]?.score ?? 0;
    res.json({
      query, top: +top.toFixed(3), weak: top < WEAK_SCORE, indexedAt: loadIndex()?.builtAt ?? null,
      results: hits.map((c) => ({ title: c.title, ...(c.url ? { url: c.url } : {}), path: c.path, passage: passageFor(c.text, query), score: +c.score.toFixed(3), strength: strengthOf(c.score, top) })),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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

// OBI Docs (docs/host.md has the host; this is the notes folder):
// GET /obi-docs lists, GET /obi-docs/:id reads, POST /obi-docs creates,
// PUT /obi-docs/:id updates. A save re-indexes in the background.
let reindexing = null, reindexAgain = false;
function reindexSoon() {
  // chip sync rebuilds the index itself; run again after it, not alongside
  if (reindexing || running === 'sync') return void (reindexAgain = true);
  reindexing = buildIndex({ log: () => {} })
    .catch((e) => console.error('[CHIP] re-index failed:', e.message))
    .finally(() => {
      reindexing = null;
      if (reindexAgain) {
        reindexAgain = false;
        reindexSoon();
      }
    });
}
app.get('/obi-docs', (req, res) => {
  if (!sameApp(req, res, { post: false })) return;
  res.json({ docs: listDocs(), statuses: STATUSES, folder: NOTES_DIR.replace(homedir(), '~') });
});
app.get('/obi-docs/:id', (req, res) => {
  if (!sameApp(req, res, { post: false })) return;
  const d = readDoc(String(req.params.id));
  return d ? res.json(d) : res.status(404).json({ error: 'No doc with that id.' });
});
const saveRoute = (req, res, id) => {
  if (!sameApp(req, res)) return;
  const { title, tags, status, kind, body, localOnly } = req.body ?? {};
  try {
    const d = saveDoc({ id, title: String(title ?? ''), tags, status, kind: typeof kind === 'string' ? kind.slice(0, 20) : 'note', body: String(body ?? ''), localOnly: localOnly === true });
    reindexSoon();
    res.status(id ? 200 : 201).json(d);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
app.post('/obi-docs', (req, res) => saveRoute(req, res, null));
app.put('/obi-docs/:id', (req, res) => saveRoute(req, res, String(req.params.id)));

// GET /source?path=<indexed path>: the text of one source, so a citation can
// open it. Only paths that are in the search index; nothing else on disk.
app.get('/source', (req, res) => {
  const index = loadIndex();
  const path = String(req.query.path || '');
  const known = index && index.chunks.some((c) => c.path === path);
  // obi-notes/<file> lives in the notes folder, outside the repo
  const base = path.startsWith('obi-notes/') ? NOTES_DIR : ROOT;
  const file = resolve(base, path.startsWith('obi-notes/') ? path.slice('obi-notes/'.length) : path);
  if (!known || relative(base, file).startsWith('..') || !existsSync(file)) return res.status(404).type('text/plain').send('Not an indexed source.');
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
  const t0 = Date.now();
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
    const was = running;
    running = null;
    if (was === 'sync' && reindexAgain) {
      reindexAgain = false;
      reindexSoon();
    }
    logUsage({ type: 'tool', route: 'tool', server: 'chip', tool: cmd, purpose: `chip ${cmd} from OBI`, ms: Date.now() - t0, ok: code === 0 });
    res.end(`\n[exit ${code ?? signal}]\n`);
  });
  // the page went away: stop the command rather than run it unseen
  res.on('close', () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  });
});

// Checks, review cards, Needs you, History and the system map (phase 6 G, H,
// I, 3 Nov late). Reads are open to the page; anything that writes to BELLA
// (run a check, Accept, Undo) must come from CHIP's own page.
const errorOut = (res, e, code = 400) => res.status(code).json({ error: e.message });
app.get('/checks', (_req, res) => {
  const rerun = refreshIfStale();
  res.json({ ...listChecks({ waiting: waitingChecks(), fixable: fixableChecks() }), rerun });
});
app.post('/checks/:id/run', (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(runCheck(String(req.params.id)));
  } catch (e) {
    errorOut(res, e);
  }
});
app.get('/review/:check', (req, res) => {
  try {
    res.json(reviewCard(String(req.params.check)));
  } catch (e) {
    errorOut(res, e, 500);
  }
});
app.post('/review/:check/accept', async (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(await accept(String(req.params.check), { baselines: req.body?.baselines ?? [] }));
  } catch (e) {
    errorOut(res, e);
  }
});
app.post('/review/:check/undo', (req, res) => {
  if (!sameApp(req, res)) return;
  try {
    res.json(undo(String(req.params.check)));
  } catch (e) {
    errorOut(res, e);
  }
});
app.get('/review-img/:dir/:file', (req, res) => {
  try {
    res.type('png').send(reviewImage(String(req.params.dir), String(req.params.file)));
  } catch {
    res.status(404).end();
  }
});
app.get('/needs', (_req, res) => {
  try {
    res.json(needsYou());
  } catch (e) {
    errorOut(res, e, 500);
  }
});
app.get('/history', (req, res) => res.json(searchHistory(req.query)));
app.get('/history/record', (req, res) => {
  const r = historyRecord(String(req.query.id ?? ''));
  return r ? res.json(r) : res.status(404).json({ error: 'No such record' });
});
app.get('/map', async (_req, res) => {
  try {
    res.json(await systemMap());
  } catch (e) {
    errorOut(res, e, 500);
  }
});
// one component's tests: its stories file in the last visual run, plus the
// per-component facts the sync measured (contract, contrast, DSDS, docs)
app.get('/component-tests/:id', (req, res) => {
  const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
  const c = bella.components.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No such component' });
  const visual = readResult('visual');
  const contrast = readResult('contrast');
  const suite = Object.entries(visual?.suites ?? {}).find(([p]) => p.endsWith(`/${c.name}/${c.name}.stories.tsx`));
  // the first token in a failure line is the one judged (the wash, not the page)
  const judged = (f) => f.match(/--[\w-]+/)?.[0];
  const failingLine = (contrast?.failures ?? []).find((f) => (c.tokens?.list ?? []).includes(judged(f)));
  const usesFailing = !!failingLine;
  const row = (name, status, detail, action) => ({ name, status, detail, action: action ?? null });
  res.json({
    id: c.id,
    name: c.name,
    ranAt: visual?.ranAt ?? null,
    tests: [
      row('Stories: axe and interactions', !c.hasStory ? 'fail' : !suite ? 'not-run' : suite[1], !c.hasStory ? `${c.name} has no story, so nothing renders it in the gate.` : suite ? `${suite[0]} in the visual audit of ${visual.commit}.` : 'The visual audit has not run since CHIP started keeping per-story results.', !suite && c.hasStory ? { type: 'run', check: 'visual', label: 'Run the stories' } : null),
      row('Contrast of its tokens', usesFailing ? 'fail' : c.health?.contrast?.status === 'fail' ? 'fail' : 'pass', usesFailing ? failingLine : `${c.health?.contrast?.pairs ?? 0} pairs checked on the tokens it reads.`, usesFailing ? { type: 'review', check: 'contrast', label: 'Review the fix' } : null),
      row('Contract matches the code', c.health?.contract?.status === 'fail' ? 'fail' : 'pass', c.health?.contract?.issues?.join('; ') || 'Props, variants and states agree with tokens/component.json.'),
      row('DSDS spec entry', c.inDsds ? 'pass' : 'fail', c.inDsds ? 'bella.dsds.yaml has it.' : 'Missing from bella.dsds.yaml.'),
      row('Docs page', c.hasDocs ? 'pass' : 'fail', c.hasDocs ? `docs/components/${c.id}.md` : 'No guidance page yet.'),
    ],
  });
});

// GET /term/repos: the folders a workspace terminal may open in.
app.get('/term/repos', (_req, res) => res.json(repoList()));

// Bound to localhost: nothing on the network can reach /ask, /cmd or /term.
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[CHIP] http://localhost:${PORT} · model ${CHIP_MODEL} · embeddings ${CHIP_EMBED_MODEL} · ${OLLAMA_URL}`);
  const t = Date.now();
  warm().then(() => console.log(`[CHIP] models warm (${((Date.now() - t) / 1000).toFixed(1)}s)`))
    .catch((err) => console.error('[CHIP] warm-up failed:', err.message));
});
attachTerminal(server, { port: PORT, origins: APP_ORIGINS });

// Overview should never open on "Not run yet": run the fast checks once at
// start when they have no result (the stories audit takes minutes; it waits
// for Run now)
refreshIfStale();
