# CHIP

A local bridge for the BELLA design system. CHIP reads the real BELLA repo, runs BELLA's own gate scripts, indexes your Notion and docs, and answers questions with a local model. Nothing leaves your machine: no paid API, no cloud agent.

Started as a submission to *Built with Opus 4.7: a Claude Code hackathon* (April 2026). Chip 2.0 replaced the cloud agent with a local one; the hackathon write-up is in `docs/archive/` (local only).

## What you need

- Node 18+
- [Ollama](https://ollama.com) with two models:
  ```sh
  ollama pull qwen3:8b          # chat
  ollama pull nomic-embed-text  # embeddings for search
  ```
- The BELLA repo at `~/DEV/bella` (or set `BELLA_DIR`)
- Optional: a Notion internal integration, for searching your Notion

Full setup, including Notion, is in `server/SETUP.md`.

## Run it

```sh
npm install
cp server/.env.example server/.env   # add NOTION_API_TOKEN if you use Notion
npm link                             # puts `chip` on your PATH
chip sync                            # BELLA + Notion + search index
npm run app:build                    # app → app/dist (npm run app: dev server on 127.0.0.1:5173)
npm start                            # server + built app at http://localhost:3100
```

The server binds to localhost only and warms both models on start, so the first question doesn't wait for a model load.

## Commands

| Command | Does |
|---|---|
| `chip ask "…"` | Answers from your sources, streamed, with the sources listed |
| `chip sync` | Syncs BELLA (`data/bella.json`), pulls changed Notion pages, re-indexes |
| `chip audit` | Re-syncs BELLA, prints the 10 AI-readiness stations and every failure |
| `chip status` | Models, index size, last sync |

`npm run sync:bella` and `npm run sync:notion` run the two syncs on their own.

## What's real, what's demo

**Real:** BELLA's components, health checks (contrast pairs, contract parity) and readiness scores in the Component map and System map; Ask CHIP answers and sources; the terminal commands. Stations without an automated source show "self-assessed" and no score; CHIP never invents one.

**Demo:** the archived v0 bridge's parity meter, proposal, alerts and inbox are the April 2026 hackathon scenario (47 components, iOS/Android parity). They carry a "Demo scenario · synthetic data" label. BELLA is web only; there is no iOS or Android data.

## Where things live

```
bin/chip.mjs                 terminal commands
server/server.js             serves app/dist; POST /ask (numbered sources, weak-match fallback), POST /cmd (ask, sync, audit, status only), GET /docs, GET /source (indexed paths only), GET/POST /notes (data/notes.json, local)
app/                         the CHIP app on BELLA components: Health, Atlas (each component's anatomy, facts, sandbox, notes) and OBI, the ask-or-run panel on every page (⌘J); ⌘K jumps
server/lib/                  config, local model (Ollama), search index, ask
scripts/sync-bella.mjs       BELLA → data/bella.json (+ data/bella.js for the bridge)
scripts/sync-notion.mjs      Notion → data/notion/*.md (local only, gitignored)
data/index/chunks.json       embeddings (local only, gitignored)
docs/archive/chip-bridge-v0/ the v0 bridge UI (static HTML/CSS/JS), archived
```

**Moved (3 Oct 2026):** the v0 bridge went from `docs/artifacts/chip-bridge-v0/` to `docs/archive/chip-bridge-v0/`. The app in `app/` covers what it did; the server now serves `app/dist` at `/`. The bridge still opens from its folder and still reads `data/bella.js`.

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
- **A UN agency's data platform · Hitparade.ch · Nadieh Bremer · howmanyplants.com** — dense data viz aesthetic
- **Finviz** — sortable-table density

## License

MIT, see `LICENSE`.
