'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json());

// Reflect every origin including null (file:// sends "null" as the Origin header).
// This server is local-only so open CORS is fine.
app.use(cors({ origin: true, credentials: false }));

// Serve the cockpit from / so http://localhost:3000 works alongside file://
app.use(express.static(path.join(__dirname, '../docs/artifacts/chip-cockpit-v0')));

const API_KEY   = process.env.ANTHROPIC_API_KEY;
const AGENT_ID  = process.env.CHIP_AGENT_ID;
const API_BASE  = 'https://api.anthropic.com';
const BETA      = 'managed-agents-2026-04-01';
const API_VER   = '2023-06-01';

// Local cache for the auto-provisioned environment ID — never committed
const ENV_CACHE = path.join(__dirname, '.chip-env-id');

// Mask key in log output — never log the full key
function maskedKey() {
  return API_KEY ? API_KEY.slice(0, 8) + '…' : '(not set)';
}

function safeMsg(msg) {
  return (msg || '').replace(API_KEY || '\x00', maskedKey());
}

function apiHeaders() {
  return {
    'x-api-key':         API_KEY,
    'anthropic-version': API_VER,
    'anthropic-beta':    BETA,
    'content-type':      'application/json',
  };
}

// Parse a Server-Sent Events body into an array of parsed event objects.
function parseSse(raw) {
  return raw.split('\n')
    .filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
    .map(l => { try { return JSON.parse(l.slice(6)); } catch (_) { return null; } })
    .filter(Boolean);
}

// Walk parsed events and return the agent's text reply.
function extractReply(events) {
  const parts = [];
  for (const ev of events) {
    if (ev.type === 'agent.message' && Array.isArray(ev.content)) {
      for (const block of ev.content) {
        if (block.type === 'text' && block.text) parts.push(block.text);
      }
    }
  }
  return parts.join('').trim() || null;
}

// ─── Environment ─────────────────────────────────────────────────────────────
// The Managed Agents API requires an environment_id on every session.
// We auto-provision one on first run and cache the ID locally so the same
// environment is reused across server restarts.

let _environmentId = process.env.CHIP_ENVIRONMENT_ID || null;

async function ensureEnvironment() {
  if (_environmentId) return _environmentId;

  // Check local cache file
  try {
    const cached = fs.readFileSync(ENV_CACHE, 'utf8').trim();
    if (cached) {
      _environmentId = cached;
      console.log(`[CHIP] Using cached environment: ${_environmentId}`);
      return _environmentId;
    }
  } catch (_) { /* cache miss — create a new one */ }

  // Create a minimal cloud environment
  const res = await fetch(`${API_BASE}/v1/environments`, {
    method:  'POST',
    headers: apiHeaders(),
    body:    JSON.stringify({
      name:   'chip-local-' + Date.now(),
      config: { type: 'cloud', networking: { type: 'unrestricted' }, packages: {} },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Environment create failed (${res.status}): ${safeMsg(body)}`);
  }

  const data = await res.json();
  _environmentId = data.id;
  console.log(`[CHIP] Created environment: ${_environmentId}`);

  // Persist for next run
  try { fs.writeFileSync(ENV_CACHE, _environmentId, 'utf8'); } catch (_) {}

  return _environmentId;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

// Vault ID for the Notion credential — set CHIP_VAULT_ID in server/.env.
// The console's session-create attaches the notion-token credential automatically;
// when we create sessions via the API we have to attach it explicitly so the
// Notion MCP server can authenticate and expose its tools.
const VAULT_ID = process.env.CHIP_VAULT_ID;

async function createSession() {
  const environmentId = await ensureEnvironment();

  const body = { agent: AGENT_ID, environment_id: environmentId };
  if (VAULT_ID) {
    // Best guess at the API shape — if Anthropic returns a 400 here we'll see
    // the exact field hint in the error message and adjust.
    body.credentials = [{ name: 'notion-token', vault_id: VAULT_ID }];
  }

  const res = await fetch(`${API_BASE}/v1/sessions`, {
    method:  'POST',
    headers: apiHeaders(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const respBody = await res.text();
    throw new Error(`Session create failed (${res.status}): ${safeMsg(respBody)}`);
  }
  const data = await res.json();
  const id = data.id || data.session_id;
  if (!id) throw new Error('Session create succeeded but returned no id');
  console.log(`[CHIP] Created session: ${id}${VAULT_ID ? ' · credential bound' : ' · no credential'}`);
  return id;
}

async function sendMessage(sessionId, message) {
  // Step 1: Post the user message event
  const postRes = await fetch(`${API_BASE}/v1/sessions/${sessionId}/events`, {
    method:  'POST',
    headers: apiHeaders(),
    body:    JSON.stringify({
      events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }],
    }),
  });
  if (!postRes.ok) {
    const body = await postRes.text();
    throw new Error(`Event post failed (${postRes.status}): ${safeMsg(body)}`);
  }

  // Capture the user event ID so we only poll for events that come after it
  const postData = await postRes.json();
  const postedEvents = postData.data || [];
  const lastPostedId = postedEvents.length > 0
    ? postedEvents[postedEvents.length - 1].id
    : null;

  // Step 2: Poll GET /v1/sessions/{id}/events until agent.message appears
  return pollForReply(sessionId, lastPostedId);
}

// Poll GET /v1/sessions/{id}/events until an agent.message appears after the
// user message that was just posted. The events endpoint only supports limit/page/order —
// no cursor filter — so we fetch the full list and find the agent reply by position.
// Waits up to 45 seconds (1 s × 45 attempts).
async function pollForReply(sessionId, userEventId) {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const url = `${API_BASE}/v1/sessions/${sessionId}/events`;

  for (let attempt = 0; attempt < 45; attempt++) {
    await delay(1000);

    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) continue;

    const data = await res.json();
    const events = data.data || [];

    // Find the index of the user message we just posted, then look for
    // the first agent.message that comes after it in the event stream.
    const userIdx = userEventId
      ? events.findIndex(ev => ev.id === userEventId)
      : -1;
    const searchFrom = userIdx >= 0 ? userIdx + 1 : 0;

    for (let i = searchFrom; i < events.length; i++) {
      if (events[i].type === 'agent.message') {
        return extractReply([events[i]]) || 'Agent replied but content was empty.';
      }
    }
  }

  throw new Error('Timeout: no agent reply after 45 seconds.');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok:    true,
    agent: AGENT_ID ? AGENT_ID.slice(0, 12) + '…' : 'not configured',
    key:   maskedKey(),
    env:   _environmentId ? _environmentId.slice(0, 12) + '…' : 'not yet provisioned',
  });
});

app.post('/ask', async (req, res) => {
  const { message, sessionId: incomingId } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set — add it to server/.env' });
  }
  if (!AGENT_ID) {
    return res.status(500).json({ error: 'CHIP_AGENT_ID not set — add it to server/.env' });
  }

  try {
    const sessionId = incomingId || await createSession();
    const reply     = await sendMessage(sessionId, message.trim());
    res.json({ reply, sessionId });
  } catch (err) {
    const safe = safeMsg(err.message);
    console.error('[CHIP server]', safe);
    res.status(502).json({ error: safe });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CHIP] Agent proxy → http://localhost:${PORT}`);
  console.log(`[CHIP] API key     : ${maskedKey()}`);
  console.log(`[CHIP] Agent ID    : ${AGENT_ID || '(not set)'}`);
});
