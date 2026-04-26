# CHIP — Bridge for agentic design systems

**Hackathon: Built with Opus 4.7**
**Special prize: Best Use of Cloud Managed Agents**

---

## Tagline (one line)

A design-system daemon that watches the bridge between intent and shipped code, and proposes the diff before the parity drifts.

---

## Submission description (180 words)

I'm a solo design-systems engineer. I ship a system called BELLA across Web, iOS, and Android. Every morning I check ten tools by hand — Storybook, Figma, Zeroheight, three repos, Jira, Slack, Notion — to find where parity drifted overnight. The decisions get made on gut, because the data's too scattered to use.

Most "design system tools" are static doc sites. They describe the system; nobody watches it.

CHIP is different. It's a control room where an agent watches the system and proposes the diff before the parity drifts. When drift is detected, CHIP files an audit, drafts a roadmap, and waits. I review. I approve. CHIP files the Jira tickets, notifies the platform leads, and writes the diff to the audit ribbon. Every action traceable. No silent merges.

Behind the Ask CHIP input is a Claude Managed Agent on Opus 4.7 with the Notion MCP wired in. When I ask "what does Vitaly say about dashboards", it queries my actual research library — 47 sources from six primary voices on AI-ready design systems.

The dashboard runs the loop on itself. The loop closed.

---

## Architecture (for your own reference when presenting)

**Frontend**: hand-built HTML/CSS/JS, no framework, no bundler. Six spaces, one stylesheet, one script. The vanilla approach is intentional — design systems are about restraint, and CHIP demonstrates the same restraint.

**Backend**: Express.js proxy on `localhost:3000` (~200 lines of Node). Brokers messages between the dashboard and Anthropic's Cloud Managed Agents API. Auto-provisions a sandboxed environment on first run.

**Agent**: configured at `console.anthropic.com/agents`. Named `chip-bridge`. Model = Claude Opus 4.7. JARVIS-inflected system prompt that defines CHIP's role and forces a `notion_search` call before answering questions about saved sources. Notion MCP wired in via OAuth + Anthropic's credential vault.

**Flow when you Ask CHIP**:
1. JS captures the message, prepends cockpit state (parity %, phase, audit count) for grounding
2. POSTs to `localhost:3000/ask`
3. Proxy creates/reuses a session against the Managed Agents API
4. Posts the message as a `user.message` event
5. Agent on Anthropic's infra calls `notion_search` if relevant, queries your real Notion, decides what to say, streams back the response
6. Proxy returns the text; dashboard renders with markdown (bold, bullets, links, tables, blockquotes)

**The pitch in one sentence**: Cloud Managed Agents means Anthropic runs the agent loop; I configured it declaratively (system prompt, MCP servers, credential bindings) and my proxy just brokers messages. The MCP wiring lets the agent reach my actual Notion library and quote real pages instead of being sandboxed to training data.

---

## Tech stack

- **Model**: Claude Opus 4.7 via Cloud Managed Agents API (`managed-agents-2026-04-01` beta)
- **MCP**: Notion MCP server (OAuth, credential vault) for live research library queries
- **Frontend**: Hand-built HTML/CSS/JS — no framework, no bundler. Six spaces, one operator.
- **Backend**: Express proxy on localhost serving the cockpit and brokering the agent session
- **Persistence**: localStorage for session continuity across turns

---

## Repo

https://github.com/emcdanie/chip — MIT licensed, public.

---

## Video

[ paste Loom URL after recording ]

---

## What to look for in the demo

1. **The audit ribbon** at the bottom of Bridge — every CHIP action gets a timestamped entry. The "Layout audit · 6 spaces scanned · 7 grid containers patched" line is real: it's the audit CHIP filed against its own dashboard during the build.
2. **Ask CHIP** in the agent card — types into a Cloud Managed Agent with the Notion MCP wired in. Ask about Vitaly, Brad Frost, specs-cli, daemons, or any source in the research library and CHIP pulls from the operator's actual Notion.
3. **The MAPE-K phase indicator** — Monitor / Analyze / Plan / Execute / Knowledge. Click "Open audit" to advance the phase and watch the audit ribbon record the transition.
4. **Six spaces** — Bridge, Research library (47 sources, 6 voices, timeline + table + map views), Friction log, AI-native BELLA, System map, Coming up. One operator, one daemon, one audit log.
