'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const path = require('path');

const app = express();
app.use(express.json());

// Reflect every origin including null (file:// sends "null" as the Origin header).
// This server is local-only so open CORS is fine — nothing reachable from the internet.
app.use(cors({ origin: true, credentials: false }));

// Serve the cockpit from / so http://localhost:3000 works as an alternative to file://
app.use(express.static(path.join(__dirname, '../docs/artifacts/chip-cockpit-v0')));

const API_KEY   = process.env.ANTHROPIC_API_KEY;
const AGENT_ID  = process.env.CHIP_AGENT_ID;
const API_BASE  = 'https://api.anthropic.com';
const BETA      = 'managed-agents-2026-04-01';
const API_VER   = '2023-06-01';

// Mask key in log output — never log the full key
function maskedKey() {
  return API_KEY ? API_KEY.slice(0, 8) + '…' : '(not set)';
}

function safeMsg(msg) {
  return (msg || '').replace(API_KEY || '\x00', maskedKey());
}

function headers() {
  return {
    'x-api-key':         API_KEY,
    'anthropic-version': API_VER,
    'anthropic-beta':    BETA,
    'content-type':      'application/json',
  };
}

// Parse a Server-Sent Events body into an array of parsed event objects.
// Lines that are not "data: ..." or that are "[DONE]" are skipped.
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

// POST /v1/sessions — create a new managed-agent session and return its ID.
async function createSession() {
  const res = await fetch(`${API_BASE}/v1/sessions`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ agent_id: AGENT_ID }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Session create failed (${res.status}): ${safeMsg(body)}`);
  }
  const data = await res.json();
  // Anthropic API returns { id: "..." } — guard against either key
  const id = data.id || data.session_id;
  if (!id) throw new Error('Session create succeeded but no id in response');
  return id;
}

// POST /v1/sessions/{id}/events — send user message and collect the SSE reply.
async function sendMessage(sessionId, message) {
  const res = await fetch(`${API_BASE}/v1/sessions/${sessionId}/events`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Event post failed (${res.status}): ${safeMsg(body)}`);
  }

  const raw = await res.text();

  // Try SSE parse first
  const events = parseSse(raw);
  const reply = extractReply(events);
  if (reply) return reply;

  // Fallback: response may be plain JSON in non-streaming mode
  try {
    const json = JSON.parse(raw);
    if (json.content)       return extractReply([json]) || JSON.stringify(json.content);
    if (typeof json.reply === 'string') return json.reply;
    if (json.message)       return String(json.message);
  } catch (_) {}

  // Nothing parseable — return raw so operator can see what came back
  return raw.trim().slice(0, 500) || 'No reply content found in response.';
}

// GET /health — quick check for the dashboard's "is server running?" test
app.get('/health', (_req, res) => {
  res.json({
    ok:    true,
    agent: AGENT_ID ? AGENT_ID.slice(0, 12) + '…' : 'not configured',
    key:   maskedKey(),
  });
});

// POST /ask — main endpoint used by the CHIP frontend
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CHIP] Agent proxy → http://localhost:${PORT}`);
  console.log(`[CHIP] API key     : ${maskedKey()}`);
  console.log(`[CHIP] Agent ID    : ${AGENT_ID || '(not set)'}`);
});
