# CHIP — Cockpit for agentic design systems

Submission to **Built with Opus 4.7: a Claude Code hackathon** (April 21–26, 2026).

> Most design system assistants answer questions. We intervene at the moment decisions are made.

CHIP is the cockpit a design-systems lead opens before approving any cross-platform change. The agent watches every surface — repos, Figma, Storybook, docs, ticket queues, dev-lead channels — and proposes a roadmap when parity slips. The operator approves, edits, or rejects. Tickets file themselves. Audit logs itself.

## Run with live agent + Notion

Ask CHIP is wired to a **Cloud Managed Agent** with a connected Notion MCP. When the local proxy is running, questions typed into Ask CHIP query Elleta's actual Notion workspace in real time.

**What you need:** Node 18+, an Anthropic API key, a Notion account.

**Condensed setup** (full steps in `server/SETUP.md`):

1. Create a Notion internal integration at **notion.so/profile/integrations**. Copy the token. Share your Research library, Friction log, and ritual pages with the integration.
2. At **console.anthropic.com → Managed Agents → New Agent**: paste the system prompt from `server/AGENT_PROMPT.md`, attach the Notion MCP server with the token in the credential vault, copy the agent ID.
3. `cd server && cp .env.example .env` — fill in `ANTHROPIC_API_KEY` and `CHIP_AGENT_ID`.
4. `npm install && npm start` — proxy runs on port 3000.
5. Open the cockpit. Type into Ask CHIP. The reply is live.

The Notion token never touches the repo — it lives in Anthropic's credential vault attached to the agent.

---

## Run it

No build step. No server. Open the HTML file in a modern browser:

```sh
open docs/artifacts/chip-cockpit-v0/index.html
```

Or double-click it from Finder. Works offline; the only network requests are Google Fonts (Fraunces, Atkinson Hyperlegible, IBM Plex Mono).

Splash → press <kbd>Enter</kbd> or click *Enter cockpit*.

## The 45-second demo

1. Cockpit space loads. Parity meter shows **38%**. Bento layout: meter + agent + 4 stat cards + Today / Inbox / Coming up / Surfaces shelf.
2. Click **Open audit** (top right) or press the trigger. Diag banner expands with the cross-platform parity proposal: 23 components out of parity across Web (47/47), iOS (23/47), Android (0/47). Persistent status strip pins under the topbar showing **Parity 38% · Monitor → Analyze → Plan → Execute → Knowledge**.
3. Read the *Before you approve* readiness checklist (Done / To do / Ready) and the estimated time (~9 min).
4. Press <kbd>A</kbd> (or click **Approve**). To-do items migrate to Done. Resolved variant lands. Audit ribbon prepends `2026-04-26 14:03 · Roadmap approved (Trust: Junior) · 23 Jira tickets filed · 3 dev leads notified · auto-merge withheld`.
5. Press <kbd>R</kbd> or click **Reset demo** to start over.

## Spaces

- **Cockpit** — the landing surface. Agent + parity meter + 4 stat cards + active proposal + today / inbox / coming up + surfaces shelf with sparklines.
- **Research library** — 12 voices on AI-ready design systems. Three views: Timeline, Table, Voices Map (SVG ring with connection edges). Each entry expands into a side panel with metadata + connections + summary.
- **Friction log** — 6 dogfooding entries with aggregate stats + correlation panel. Each entry links back to the cockpit element it complains about.
- **AI-native BELLA** — 6 primitive cards (AI Card, AI Diff, AI Audit Entry, AI Meter, AI Label, AI Skeleton) with "Born when…" origin lines.
- **System map** — atomic concentric rings (Tokens core, Atoms ring, Organisms ring) with score-colored nodes + connection edges through the center. Sticky detail panel with 5 tabs per component: Overview · Implications · Changes · Simulation · AI Insights. Live search above the rings (type a component, status, or platform).
- **Coming up** — six rituals. Each row clicks open to "What CHIP will surface · What you've prepped · Past iterations".

## Keyboard

| | |
|---|---|
| <kbd>⌘K</kbd> | Open command palette (jumps anywhere) |
| <kbd>?</kbd> | Show keyboard help |
| <kbd>,</kbd> | Open settings |
| <kbd>A</kbd> | Approve current proposal (drift phase, Cockpit space) |
| <kbd>R</kbd> | Reject |
| <kbd>M</kbd> | Modify (no-op in v0) |
| <kbd>⌘⇧A</kbd> | Approve with override-auth |
| <kbd>Esc</kbd> | Clear selection · close modal |
| <kbd>/</kbd> | Focus map search (System map space) |
| <kbd>Enter</kbd> | Dismiss splash |

## Stack

- Single-file HTML, split into six sibling files for maintainability:
  - `index.html` — markup
  - `tokens.css` — BELLA primitives + semantic + governance tokens, light + dark
  - `layout.css` — shell, sidebar, topbar, splash, audit ribbon
  - `components.css` — every card, chip, button, table, modal, viz
  - `data.js` — `NODE_DATA`, `COMPONENT_DATA`, `RESEARCH_DATA`, `FRICTION_DATA`, audit constants
  - `app.js` — IIFE; phase machine, modals, palette, simulation, all interactions
- No frameworks. No build. Vanilla JS.
- Fonts: Fraunces (display), Atkinson Hyperlegible (body), IBM Plex Mono (mono). Loaded via Google Fonts.
- Design system: **BELLA** (Elleta's own — primitives at `~/DEV/bella/tokens/`).

## What's real, what's mocked

**Real:**
- Every interaction shipped works: approve flow, audit log, theme/density/motion settings, palette, search, filters, sorts, simulation sliders, tab switching, modal stack, focus management.
- The drift demo loop is end-to-end: load → open audit → approve → reset.
- Component scores in the matrix drive the atomic-rings node colors, the simulation compliance math, and the AI Insights overall-health letter grade.

**Mocked (for v0; live integration is v1):**
- All inbox / calendar / Coming-up / friction-correlation data is plausible synthetic content.
- Jira ticket numbers, Storybook story counts, Figma URIs, Zeroheight links don't resolve.
- The "Ask CHIP" input calls a real Cloud Managed Agent when `server/` is running (see "Run with live agent + Notion" above). Falls back to an inline error message when the proxy is offline.
- "Generate impact report" toasts; no PDF.

## Structure

```
docs/artifacts/chip-cockpit-v0/
├── index.html
├── tokens.css
├── layout.css
├── components.css
├── data.js
└── app.js
```

The cockpit is the only thing in the repo that runs. Everything else (planning docs, transcripts, research notes) lives outside this artifact and is not included in the public submission.

## Lineage

CHIP stands on the shoulders of:

- **Maggie Appleton** — daemon model for LLM systems
- **Projects By IF** — trust patterns catalogue
- **Shape of AI / Emily Campbell** — AI interaction pattern vocabulary
- **Hardik Pandya** — three-layer contract for LLM design systems
- **Nathan Curtis** — mechanical specs (specs-cli, 99.25% Figma compression)
- **Romina Kavčič** — design systems as infrastructure / MAPE-K loop
- **Vitaly Friedman** — expert-user dashboards, readiness pattern, approval-fatigue
- **Brad Frost** — atomic design + command-center pattern
- **TJ Pitre** — tokens as the primary contract
- **Mark Cianfrani** — designer as agent-operator
- **Dan Donald** — Inclusion Plugin pattern (override with logged exception)
- **Linear · Raycast · Arc** — command palette lineage
- **UN PRISM · Hitparade.ch · Nadieh Bremer · howmanyplants.com** — dense data viz aesthetic
- **Finviz** — sortable-table density

## Built with

- **Brain:** Claude Opus 4.7
- **Skin:** BELLA (Elleta's design system)
- **Tools:** Claude Code (terminal), Cowork (planning), Figma (BELLA tokens), zsh
- **Hackathon window:** 2026-04-21 → 2026-04-26
- **Operator:** Elleta — self-employed AI design systems engineer

## License

MIT — see `LICENSE`.
