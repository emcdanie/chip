#!/usr/bin/env node
// chip: the terminal side of CHIP.
//   chip ask "question"   answer from the local index (via the server when it is up)
//   chip sync             sync BELLA + Notion, then re-index
//   chip audit            sync BELLA, print station scores and failures
//   chip status           model, index size, last sync
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PORT, BELLA_JSON, INDEX_FILE, NOTION_DIR, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL, NOTION_API_TOKEN } from '../server/lib/config.mjs';

const [cmd, ...rest] = process.argv.slice(2);

function syncBella({ quiet = false } = {}) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/sync-bella.mjs')], { encoding: 'utf8' });
  if (!quiet || r.status !== 0) process.stdout.write(r.stdout), process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error('sync:bella failed');
}

// POST /ask on the running server (its models are already warm). Returns null
// when nothing is listening, so the caller falls back to the model directly.
async function serverStream(q) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${PORT}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: q, stream: true }),
    });
  } catch {
    return null;
  }
  if (!res.ok) throw new Error(`server /ask ${res.status}`);
  return (async function* () {
    const dec = new TextDecoder();
    let buf = '';
    for await (const part of res.body) {
      buf += dec.decode(part, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'error') throw new Error(ev.error);
        yield ev;
      }
    }
  })();
}

const commands = {
  async ask() {
    const q = rest.join(' ').trim();
    if (!q) throw new Error('usage: chip ask "your question"');
    const t = Date.now();
    let stream = await serverStream(q), via = 'server';
    if (!stream) {
      const { askStream } = await import('../server/lib/ask.mjs');
      stream = askStream(q);
      via = 'direct';
    }
    let first = null, sources = [], closest = null;
    for await (const ev of stream) {
      if (ev.type === 'weak') closest = ev.closest;
      if (ev.type === 'sources') sources = ev.sources;
      if (ev.type === 'token') { first ??= Date.now(); process.stdout.write(ev.text); }
    }
    if (closest) {
      console.log("I couldn't find this in your sources. Closest:");
      for (const s of closest) console.log(`  - ${s.title} · ${s.url || s.path}`);
    } else {
      console.log('\n\nSources:');
      for (const s of sources) console.log(`  [${s.n}] ${s.title} · ${s.url || s.path}`);
    }
    console.log(`\n(first words ${(((first ?? Date.now()) - t) / 1000).toFixed(1)}s · total ${((Date.now() - t) / 1000).toFixed(1)}s · ${CHIP_MODEL} · ${via})`);
  },

  async sync() {
    syncBella({ quiet: true });
    console.log('bella: synced → data/bella.json');
    if (NOTION_API_TOKEN) {
      const { syncNotion } = await import('../scripts/sync-notion.mjs');
      await syncNotion();
    } else {
      console.log('notion: skipped (NOTION_API_TOKEN not set in server/.env)');
    }
    const { buildIndex } = await import('../server/lib/index.mjs');
    const r = await buildIndex({ log: console.log });
    console.log(`index: ${r.chunks} chunks · ${r.embedded} embedded this run → data/index/chunks.json`);
  },

  async audit() {
    syncBella({ quiet: true });
    const b = JSON.parse(readFileSync(BELLA_JSON, 'utf8'));
    console.log(`BELLA ${b.source.version} @ ${b.source.commit} · ${b.components.length} components\n`);
    console.log('Stations');
    for (const s of b.stations) console.log(`  ${s.name.padEnd(17)} ${s.score === null ? 'self-assessed' : String(s.score).padStart(3) + '%'}`);
    console.log('\nGates');
    console.log(`  contrast-pairs   ${b.gates.contrastPairs.ok ? 'OK' : 'FAIL'}`);
    console.log(`  contract-parity  ${b.gates.contractParity.ok ? 'OK' : 'FAIL'}`);
    console.log('  audit:visual     not run (TODO)');
    const fails = [];
    for (const c of b.components) {
      if (!c.hasStory) fails.push(`${c.name}: no story`);
      if (!c.hasDocs) fails.push(`${c.name}: no docs description`);
      if (c.health.contract.status === 'fail') fails.push(`${c.name}: contract ${c.health.contract.issues.join('; ')}`);
      if (c.health.contrast.status === 'fail') fails.push(`${c.name}: contrast ${c.health.contrast.failing.join('; ')}`);
    }
    console.log(`\nFailures (${fails.length})`);
    for (const f of fails) console.log('  - ' + f);
  },

  async status() {
    const { listModels } = await import('../server/lib/llm.js');
    const models = await listModels();
    const has = (m) => models && models.some((n) => n === m || n === m + ':latest');
    console.log(`ollama   ${models ? OLLAMA_URL : 'NOT REACHABLE at ' + OLLAMA_URL}`);
    console.log(`chat     ${CHIP_MODEL}${models ? (has(CHIP_MODEL) ? '' : '  (not pulled)') : ''}`);
    console.log(`embed    ${CHIP_EMBED_MODEL}${models ? (has(CHIP_EMBED_MODEL) ? '' : '  (not pulled)') : ''}`);
    if (existsSync(INDEX_FILE)) {
      const idx = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
      const files = new Set(idx.chunks.map((c) => c.path)).size;
      console.log(`index    ${idx.chunks.length} chunks · ${files} files · ${(statSync(INDEX_FILE).size / 1e6).toFixed(1)} MB`);
      console.log(`synced   ${idx.builtAt}`);
    } else {
      console.log('index    none (run `chip sync`)');
    }
    const notion = existsSync(NOTION_DIR) ? readdirSync(NOTION_DIR).filter((f) => f.endsWith('.md')).length : 0;
    console.log(`notion   ${notion} pages on disk`);
    if (existsSync(BELLA_JSON)) {
      const b = JSON.parse(readFileSync(BELLA_JSON, 'utf8'));
      console.log(`bella    ${b.components.length} components @ ${b.source.commit}`);
    }
  },
};

if (!commands[cmd]) {
  console.log('usage: chip <ask "question" | sync | audit | status>');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((err) => { console.error('chip:', err.message); process.exit(1); });
