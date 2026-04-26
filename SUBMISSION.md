# CHIP — Bridge for agentic design systems

**Hackathon: Built with Opus 4.7**
**Special prize: Best Use of Cloud Managed Agents**

---

## Tagline (one line)

A design-system daemon that watches the bridge between intent and shipped code, and proposes the diff before the parity drifts.

---

## Submission description (200 words)

CHIP is a control-room dashboard for design systems that ship on more than one platform. It runs the MAPE-K loop — Monitor, Analyze, Plan, Execute, Knowledge — on a synthetic system called BELLA, with surfaces across Web, iOS, and Android.

When parity drifts, CHIP files an audit, drafts a roadmap, and waits for the operator. The operator approves, and CHIP files the Jira tickets, notifies the platform leads, and records the diff in the audit ribbon. Every action is traceable. No silent merges.

Built with Opus 4.7 through a Cloud Managed Agent. The agent is wired into the operator's Notion via the Notion MCP, so when she asks "what does Vitaly say about graphs?" CHIP pulls from her actual research library — 47 tracked sources from six primary voices on AI-ready design systems.

The dashboard itself was audited mid-build. The operator flagged that the layout was broken; CHIP scanned six spaces, patched seven grid containers, and recorded the audit on its own ribbon. The loop closed on the dashboard that runs the loop.

In the lineage of Maggie Appleton's daemons, Projects By IF's trust patterns, Shape of AI's vocabulary, Amelia Wattenberger's embeddings, Luke Wroblewski's structured search, Vitaly Friedman's expert-user dashboards, and Nathan Curtis's mechanical specs.

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
