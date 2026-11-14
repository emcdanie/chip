# Phase 6 · One workspace, polished (for the 24 Nov talk)

Status: PLAN, waiting for Elleta's go. Written 3 Nov 2026.
Evidence: accessibility audit (axe + measured, both themes) and interface critique, 3 Nov.
Screens: docs/reference/screens/polish-2026-11-03/.

Updated 3 Nov (afternoon) with Elleta's decisions from the mock review, her FigJam board "CHIP · what and
for whom", and a benchmark round. Changes are marked **(3 Nov pm)**.

## Decisions (3 Nov late)

- **Build the workspace she designed, for the talk.** G (review card), H (checks on Overview) and I (system
  map) come in. D (voice) is cut. E (drift data) only as far as the flows need it (no drift.json tonight).
- **Claude answers by default.** The local model wasn't good enough; it stays one pick away in OBI's model menu.
- **Checks run on BELLA as its next commit would be:** the base tip plus whatever is staged in ~/DEV/bella,
  in a temporary worktree. The shared checkout is never written to.
- **Accept = a local chip/fix-* branch** committed through BELLA's own pre-commit hook (NDA scan + full
  gate); Undo deletes the branch. Never pushed, never merged; merging is Elleta's.

## Decisions (3 Nov pm)

- **Sources of truth.** Author in two places: code and Figma (drawing only). Two change rarely: contracts
  and stories. Everything you look at (docs, status, visual checks, history) is generated into CHIP,
  never written by hand. Figma doc pages and the Storybook site stop being maintained.
- **Storybook.** CHIP replaces the Storybook site (retire the Pages deploy). Stories stay: they are the
  gate's fixtures (`audit:visual` runs `test-storybook`, a11y + interactions, both themes). CHIP shows
  each story inside the component page.
- **Figma.** Read-only in CHIP for visual checks. Bring the per-component annotations and notes out of
  Figma once (Figma MCP read) into each component's docs; after that the docs live with the code.
- **One screen per job** (from the board): The Bar = today (morning brief, what waits on you),
  Health = BELLA over time (overview, checks, trends), History = what we agreed. Open: home = The Bar?
- **Action dots** (from the board): neutral shows nothing. Only Waiting on you, Needs a job, Failed and
  Ready to review are marked, always word + shape, never colour alone.
- **Plain names (3 Nov pm).** Atlas → Components, Health → Overview, Docs → History (the timeline). Nav:
  Overview · Foundations · Components · History · Connectors, plus The Bar. Older sections below keep the old names.
- **Plain review words, not GitHub's.** Elleta finds PR review confusing; CHIP's review card leads with
  pictures and a plain summary, and writes the GitHub approval underneath.

Goal: CHIP is the one place Elleta works on BELLA and the site. Local model and Claude side by
side, a real terminal, Figma and Storybook next to the code, voice in. Useful first, then pretty;
AA clean with no exemptions.

## A · Polish and accessibility (2.5 days)

Trust bugs first, because on stage a wrong number is worse than an ugly one:
- Figma lint prints "nullpx tall" and passes it into a 100 score (server/lib/spec-lint.mjs:110).
- Health says 2 open failures; the table shows 5 missing contract files; Atlas shows gate findings
  Health doesn't count. One definition of "failure" everywhere.
- Readiness "95 / 100" is the mean of 4 of 10 stations. Lead with "4 of 10 measured".
- OBI's "0 of 37 have no contract" answer (Contract vs DSDS wording).
- The Bar shows (10) from stale 15 Oct lane files.

Accessibility (fails today):
- 2.5.3 Label in name: 16 controls whose aria-label drops the visible text (Copy import, Copy as
  markdown, anatomy chips, "OBI open").
- 1.4.10 Reflow: Atlas ChatThread and Docs scroll sideways at 320px.
- 2.5.7 Dragging: the dock resize is drag-only and 12px tall. Add click steps, 24px+ hit area.
- 2.4.3 Focus: the dock opens and closes without moving focus.
- Targets under 44px: History "View full size", "See Figma lint", header search field, related links.
- Line length over 80ch in ledes, History and Connectors. Cap at the body measure.

What Elleta named:
- Dividers inside cards: drop the in-card hairlines (app.css:519, 993, 1713, 1746, 2197); spacing
  and small headings separate groups; the card edge is the only line.
- Wrong font: every SHA, path and identifier in Geist Mono (Docs body, Health meta, Atlas ledes),
  mono sized to match body, not meta.
- Blurry images: History never upscales a crop past its natural size.
- Too much text: one-line verdict under each Atlas title; real tabs instead of a 12,000px scroll;
  each fact said once; Health leads with the gate and what's failing; "no change since…" once.

## B · One workspace (3.5 days)

The OBI dock becomes the workspace: tabs for **OBI** (local model), **Claude** (a Claude Code
session in the chosen repo) and **Terminal** (a shell). Same panel, same keyboard shortcut.
- Terminal and Claude run through node-pty + xterm.js on the CHIP server, bound to 127.0.0.1
  only, so nothing else on the network can reach a shell. Repo picker: BELLA, site, CHIP.
- Keep what works in Claude Code: the task list under the latest message, the next-step box with
  one question, sessions listed under a coordinator (The Bar becomes that list).
- Open question for Elleta: which other Claude Code parts to keep.

## C · Figma and Storybook inside each Atlas page (2 days)

A "Compare" tab per component: Figma frame, Storybook story and code spec side by side, plus
"Open in Figma" and "Open in Storybook". Chosen over separate Figma/Storybook tabs because
spotting a mismatch means seeing all three at once.
- **(3 Nov pm) Stories & tests** (Chromatic, Storybook a11y addon, Percy): one card per story with a
  thumbnail and chips for a11y, interaction, contrast, light/dark (Pass / Warn / Fail / Not run).
  Diff viewer: Side-by-side / Overlay / Slider, with a Figma | Story | Live column. Accept / Deny per
  story, Deny needs a note; states Unreviewed / Accepted / Changes requested.
- **(3 Nov pm) Where each fact came from** (zeroheight, Supernova, Figma Dev Mode): every field says
  "from Figma", "from code" or "from contract" and is read-only; a Figma-vs-code row lists props that
  exist on one side only; Figma's "Ready for dev" sits next to the code status.
- **(3 Nov pm) View as** me / designer / engineer / PO: same page, reordered.
- Storybook: iframe of localhost:6006/iframe.html?id=<story>.
- Figma: embed of the component's node in BellaComponents (needs a name → node map, read once
  through the Desktop Bridge and saved). The embed needs you signed in to Figma in the browser.

## D · Voice (0.5 to 1 day)

A mic button in the workspace input. Trade-off for Elleta:
- Browser speech (Web Speech API): half a day, but Chrome sends audio to Google, which undercuts a
  talk titled "runs on my own laptop".
- Local Whisper (whisper.cpp via Homebrew, small English model): about a day, nothing leaves the laptop.

## E · Drift data (4 days)

data/drift.json: one row per Figma / code / Storybook mismatch (component, field, the three values,
first seen, status), filled during `chip sync` through the Desktop Bridge. Shown in the Compare
tab and as a Health card with a trend. Each row has one fix action: open a Claude session with a
brief, or fix in Figma. Every fix appends a dated line to a drift log.

## G · Review card and layered approval (3 Nov pm)

Replaces "check" in a terminal and GitHub's PR screen. Top to bottom: a two-sentence summary from the
lane; before / after per changed story at 390 · 768 · 1440; the checks already run as chips with logs
(GitHub CI beside the lane's claim, red when they disagree); notes pinned to the picture; Approve /
Send back with a note. Code diff collapsed. Three blocks (designer: matches the lock? engineer: CI and
gate? PO: in scope?); View as reorders them; one Go covers all three when Elleta holds every role, and
the card says so. A pinned note that isn't resolved blocks Approve and says why.
Sources: Chromatic UI Review, CodeRabbit walkthrough, Vercel preview comments, the board's layered review.

## H · Checks and audits on Health (3 Nov pm)

A Checks list, each row writing `data/checks/<name>.json`: benchmark static (weekly), benchmark agents
(monthly, uses the plan), AGENTS.md review, harness maintenance, lane round, gate. Schedule, last result,
Run now; a dot only when it needs you, and the row opens a card in The Bar. Results land in History as
before / after. First real entry: the Open Design System Bench, 8 Oct baseline vs 9 Oct after
(AGENTS.md 70.8 → 83.5, composite 73.4 → 85.6, undocumented 9 → 2).
Sessions read the same `data/` folder, so nobody re-explores the system to answer "where are we".

## I · System map on Connectors (3 Nov pm)

Tools as a Statuspage-style list (Operational, Maintenance, Degraded, Partial outage, Major outage);
a tool that is down greys out what depends on it ("Push to Figma · blocked by Figma MCP"), with
troubleshooting steps and Retry. Files layer later: tokens → contract → component → stories → docs →
AGENTS.md → gate, edges labelled by reader (human, agent, CI), last change from git. Sources: Statuspage,
Nx graph (focus), Backstage relations card.

## F · Test run and recording (1.5 days)

Demo script, one real mismatch fixed end to end, screen recording as the fallback, one dry run.

## Next, not this phase (3 Nov pm)

History as a horizontal timeline (Elleta, from the board's History + friction log): one bar across
the top with dated points, scroll or click a point and its detail opens underneath (before / after,
why, who, undo). Points coloured by type: Decision / Visual / Contract / Fix / Friction; filters as
chips; releases as labelled spans on the bar. Replaces the card list: more space for the detail; a light Playground (prop controls, then compose with other components);
a weekly scout (new releases tested against the bench before adopting); the one-time Figma docs import;
the files layer of the system map.

## Later: CHIP for client audits (3 Nov pm)

The same checks work on any React design system (the bench reads a systems config; the inspection,
token-architecture and adoption skills are system-agnostic). Three additions:
- **System switcher.** CHIP points at a system (BELLA, a client) and every page shows that one.
- **Private data.** Client data, audit templates and report layouts live in a private folder or repo,
  never in this public repo. No client names, screens or Figma embeds with link sharing.
- **Assessment mode.** Overview becomes a coverage map filled in as the audit goes: each area is
  not assessed / evidence gathered / finding. Interview notes attach to the area they support.
  Findings only; the work order stays hidden until the client phase calls for recommendations.
- **Report view.** The same data laid out for the client (where they are, gaps with evidence,
  later a work order, then before / after), exported as a PDF or a private page.
Also serves: the portfolio case study, LinkedIn posts (Copy for the post) and talks (the walkthroughs
are the presentation), so no separate visuals are made by hand.
Smallest slice: switcher + report export, about 2 to 3 days. Not before the 24 Nov talk unless an
audit is due first.

## Last (3 Nov pm): an in-context assistant

The pattern Vitaly cites: Shopify Sidekick (confirmed by Elleta): OBI knows the
page and selection ("Looking at Button · Contract"), offers the next step as a card, and acts only after a click with
"This will · Undo". Needs the data folder, lanes and review cards first.

## Overview as a dashboard (4 Nov)

Elleta: the Overview "does the Christmas tree thing": everything is green or red, so nothing stands
out; the gaps sit at the bottom; the ring chart is too small and repeats Coverage. What the sources say:
- **Flag only what needs action.** Desbarats: flag a metric only if it "genuinely require[s] the user
  to actually do something"; no flag means no action. Colouring every value good or bad is what he calls
  "Christmas tree syndrome": the page looks the same on a normal day and a bad one.
  ([four-threshold flags](https://www.practicalreporting.com/blog/2018/11/16/why-i-now-use-four-threshold-flags-on-dashboards-book-excerpt),
  [single-threshold flags](https://www.practicalreporting.com/blog/2018/11/5/single-threshold-flags-on-dashboards-very-common-and-very-problematic-book-excerpt))
- **Flags make it scannable.** People scan many values and spot the ones that need attention;
  unflagged values are read casually.
  ([include visual flags](https://www.practicalreporting.com/blog/2018/10/17/include-visual-flags-on-dashboards))
- **A status dashboard answers one question:** is there anything I need to react to now? It shows
  only metrics this person would act on.
  ([problem scanning vs performance monitoring](https://www.practicalreporting.com/blog/2018/5/28/why-dashboards-for-status-monitoring-and-performance-monitoring-dont-work))
- **Insights, not data; a dashboard is worth the actions it prompts** (Vitaly Friedman, Dashboards UX
  notes in `data/notion/`). No donuts when people compare; one message per chart.
- Green in Desbarats means "unexpectedly well", not "normal". Nothing on CHIP's Overview does better
  than expected, so CHIP keeps green only for a pass the user just caused.

Rules for CHIP's Overview (built 4 Nov, branch `claude/overview-redesign-714a1d`):
1. Order by action: the blocking banner, then what to do next (gaps, biggest first), then the evidence
   (Coverage bars, This week, Gate and Drift, Checks).
2. Normal is ink and grey. Red only for failing; yellow only for waiting on Elleta. No green tints on
   passing rows, bars or pills.
3. One chart per question. Coverage is shown once, as the bar chart; the ring is gone.
4. Refresh says what happened: busy, then "N changed · Checked hh:mm" or "No change since hh:mm";
   errors are shown in place.

## Open questions (3 Nov pm)

- Navigation grouping: group by Elleta's jobs, not BELLA's structure (Vitaly Friedman on the Intercom IA case
  study). Card-sort every feature first, then tree-test with real tasks. Visible labels only, a pinnable nav drawer.

- Home: The Bar or Health?
- Tab style for panels (underline vs pills).
- Which Claude Code parts to keep in the workspace (from B).

## Budget

About 14 to 15 working days against roughly 15 left. No slack. If something slips, cut in this
order: drift trend chart, Figma embed (keep the link), local Whisper (fall back to browser speech
with a spoken caveat).
**(3 Nov late)** Decided: G, H and I replace D (voice, cut) and most of E (drift data: only what the
flows need). Built overnight 3 to 4 Nov as a first pass on real data; the cut order above now reads: drift
trend chart, Figma embed (keep the link).
**(3 Nov pm)** G, H and I add roughly 4 to 5 days the budget doesn't have. To fit the 24 Nov talk,
either they replace D (voice) and E (drift data, which C's stories & tests partly covers), or G is the
only addition and H and I move to Next. Elleta decides.
