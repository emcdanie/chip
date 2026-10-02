#!/usr/bin/env node
// chip: the terminal side of CHIP.
//   chip ask "question"   answer from the local index with the local model
//   chip sync             sync BELLA + Notion, then re-index
//   chip audit            sync BELLA, print station scores and failures
//   chip status           model, index size, last sync
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, BELLA_JSON, INDEX_FILE, NOTION_DIR, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL, NOTION_API_TOKEN } from '../server/lib/config.mjs';

const [cmd, ...rest] = process.argv.slice(2);

function syncBella({ quiet = false } = {}) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/sync-bella.mjs')], { encoding: 'utf8' });
  if (!quiet || r.status !== 0) process.stdout.write(r.stdout), process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error('sync:bella failed');
}

const commands = {
  async ask() {
    const q = rest.join(' ').trim();
    if (!q) throw new Error('usage: chip ask "your question"');
    const { ask } = await import('../server/lib/ask.mjs');
    const t = Date.now();
    const { reply, sources } = await ask(q);
    console.log(reply + '\n');
    console.log('Sources:');
    for (const s of sources) console.log(`  - ${s.title} · ${s.url || s.path}`);
    console.log(`\n(${((Date.now() - t) / 1000).toFixed(1)}s · ${CHIP_MODEL})`);
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
