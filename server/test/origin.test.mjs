// /ask answers only CHIP's own page (product inspection 12 Nov, station 8).
// The guard and CORS are the ones server.js mounts; /ask is a stub, so no model runs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { request } from 'node:http';
import { appOrigins, onlyChip } from '../lib/origin.mjs';

const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const origins = appOrigins(port);
let calls = 0;
app.use(onlyChip(origins));
app.use(cors({ origin: [...origins], credentials: false }));
app.use(express.json());
app.post('/ask', (_req, res) => {
  calls += 1;
  res.json({ reply: 'stub' });
});
after(() => server.close());

const ask = (origin) =>
  fetch(`http://127.0.0.1:${port}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ message: 'hi', includePrivate: true }),
  });

test('a foreign site is refused and the model is never called', async () => {
  const before = calls;
  const r = await ask('https://evil.example');
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(calls, before);
});

test("CHIP's own page gets its answer, with CORS for that origin only", async () => {
  const own = `http://localhost:${port}`;
  const r = await ask(own);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).reply, 'stub');
  assert.equal(r.headers.get('access-control-allow-origin'), own);
});

test('the Vite dev page is allowed', async () => {
  assert.equal((await ask('http://localhost:5173')).status, 200);
});

test('the chip CLI (no Origin) still works', async () => {
  assert.equal((await ask(null)).status, 200);
});

test('a site rebound to 127.0.0.1 under another Host is refused', async () => {
  // fetch drops a Host header, so this goes through node:http, which sends it
  const status = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/ask', method: 'POST', headers: { host: 'evil.example' } }, (r) => {
      r.resume();
      resolve(r.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});
