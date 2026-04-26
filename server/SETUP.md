# CHIP Agent Server — Setup

Five steps. ~15 minutes. You need: your Anthropic API key, a Notion account, and Node 18+.

---

## Step 1 — Create a Notion integration

1. Go to **notion.so/profile/integrations** → **New integration**
2. Name it `CHIP`. Keep **Internal** type. Click Save.
3. Copy the **Internal Integration Secret** (starts with `secret_`). This is your `NOTION_API_TOKEN`.

### Share pages with the integration

For each Notion page CHIP should be able to read, open the page → click **…** (top right) → **Connections** → find `CHIP` → confirm.

Recommended pages to share:
- Research library (or your DS research database)
- Friction log
- Rituals / cadence notes
- Any other pages you want Ask CHIP to surface

---

## Step 2 — Create the Cloud Managed Agent

1. Go to **console.anthropic.com** → **Managed Agents** → **New Agent**
2. Set the model to **Claude Opus 4.7** (or the most capable available)
3. Paste the system prompt from `server/AGENT_PROMPT.md` (the block between the `---` delimiters)

### Attach the Notion MCP server

4. In the agent config, find **MCP Servers** or **Tools** → **Add MCP Server**
5. Select **Notion** from the available integrations
6. When prompted for credentials, paste your `NOTION_API_TOKEN` from Step 1
7. The token goes into the **credential vault** — it stays on Anthropic's infra, never in your repo

### Copy the agent ID

8. After saving, find the agent's **ID** on its settings page (format: `agt_...`)
9. This is your `CHIP_AGENT_ID`

---

## Step 3 — Configure the local proxy

```sh
cd ~/DEV/chip/server
cp .env.example .env
```

Open `.env` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...          # your existing Anthropic API key
CHIP_AGENT_ID=agt_...                 # from Step 2
NOTION_API_TOKEN=secret_...           # from Step 1 (for reference; used in vault, not the server)
```

The `NOTION_API_TOKEN` line in `.env` is reference-only. The server does not use it — the token lives in Anthropic's credential vault attached to the agent. You can leave it blank if you prefer.

---

## Step 4 — Install and start

```sh
cd ~/DEV/chip/server
npm install
npm start
```

Expected output:

```
[CHIP] Agent proxy → http://localhost:3000
[CHIP] API key     : sk-ant-ap…
[CHIP] Agent ID    : agt_012345…
```

Verify: `curl http://localhost:3000/health` should return `{"ok":true,...}`.

---

## Step 5 — Test Ask CHIP

1. Open the CHIP cockpit: `open ~/DEV/chip/docs/artifacts/chip-cockpit-v0/index.html`
2. Dismiss the splash → Enter Bridge
3. In the **Agent card**, type a question in the Ask CHIP input:
   - `what's in my research library`
   - `any friction notes about navigation`
   - `what rituals do I have coming up`
4. Press Enter. A "Thinking…" skeleton appears, then the live agent reply renders below the input with a sage left border.

Conversation continues across reloads — session ID is stored in `localStorage` as `chip:askSessionId`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Agent server not running" in the UI | `npm start` in `server/` |
| `ANTHROPIC_API_KEY not set` | Check `server/.env` — key must start with `sk-ant-` |
| `CHIP_AGENT_ID not set` | Check `server/.env` — ID starts with `agt_` |
| `Session create failed (404)` | Agent ID is wrong or agent was deleted at console.anthropic.com |
| Agent replies but Notion data is missing | The Notion integration isn't connected to the agent, or the relevant pages haven't been shared with the integration |
| CORS error in browser console | The proxy must be running on port 3000; check `PORT` in `.env` |
