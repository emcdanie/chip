# CLAUDE.md: CHIP

CHIP is the local bridge for the BELLA design system (`~/DEV/bella-chip-theme`). The app in `app/` is built from BELLA components and tokens only: no hex values, no px font sizes in `app/src`. BELLA's `AGENTS.md` applies here and wins on any conflict. `emcdanie/chip` is public: no client names, no personal items, no `.env`.

Two exceptions to that: CHIP's relay paths (below) and the import style `@bella/components/<Name>/<Name>` win over BELLA's `maintaining.md` and `AGENTS.md` here. Who CHIP is for and why: [`docs/CHIP-jobs-to-be-done.md`](docs/CHIP-jobs-to-be-done.md).

## Before writing any UI (Elleta, 9 Nov 2026)

BELLA's rules do not reach this repo by themselves. Every time, before touching `app/src`:
- Read `~/DEV/bella-chip-theme/AGENTS.md` in full. That checkout is the BELLA CHIP builds against; never read or edit `~/DEV/bella`.
- Import from `@bella/components/<Name>/<Name>`, not `kit` where BELLA has the component. Never restyle a BELLA component from outside.
- Before writing code, list which BELLA component does each job and which existing CHIP page pattern you are reusing. Add no new class family. If nothing fits, stop and name the gap.
- Check every width from 320 to 1440, and with the Work drawer open, then look at it.
- Never say "on system" without the output of `node scripts/on-system-guard.mjs`. The dashboard number is `npm run check:system`.
- Figma too (Elleta, 11 Nov 2026): new mocks are built from BELLA component instances. Where BELLA has no component, name the gap, propose a variant or component, and update BELLA (Figma or code, whichever is faster) before using it. Never edit an existing mock page to do this; work on a new page.
- Doc pages in Figma (Elleta, 12 Nov 2026): follow the "Doc pages" section of BELLA's `docs/agents/maintaining.md`: pictures first, one-line leads, no tables or gimmicks, inside the docs shell, one sample shown before any rollout.
- Reading Figma right (Elleta, 12 Nov 2026, after it went wrong more than once): one writer per file: per FILE, not per page (13 Nov, twice: four to eight agents writing on different pages of BellaComponents through one Desktop Bridge slowed each call past its 32s limit and closed the plugin, which only Elleta can reopen). Keep every call under about 20s. With the Desktop Bridge, `figma_navigate` with `lock: true` first. Every script checks `figma.fileKey` before writing and throws on a mismatch. Measure from nodes and variables, never from a screenshot. Screenshots at 100% are proof only, and nothing is "done" until one is looked at.

## Before building or showing anything (Elleta, 12 Nov 2026, after a day of misreads)

- **Say it back first.** When a request could mean two things, restate it in one line, with a quick sketch where it's visual, before building. Her own words go in the brief verbatim.
- **Look for it first.** Before making any component, section or asset, search the Docs Kit, BellaComponents, the covers and her Fabrik exports (`~/DEV/fabrik/exports/<component>/`, layout only) for one that already exists. Use it or extend it; make new only when nothing fits, and say so.
- **A second pair of eyes before she sees it.** A fresh agent that didn't build the sample checks it against BELLA's Doc pages rules, the measured variables and her reference, side by side, rates it for reader clarity (interface-critique: can a first-time reader say what each section tells them, without its caption?), and confirms that nothing new overlaps or floats loose on the canvas: every new component sits in its own block frame, in clear space. Only then does she see it.
- **Approved screens, put on system as they are** (Elleta, 13 Nov: "if we have to adapt the components in the chip theme to work then do it.. this is a regression on the design", then "no but i just want what we made in the flow approved screens to be on system"). The target is the approved screens on CHIP Dashboard's Flow page, not a redesign. Rebuild each one from BELLA instances so it matches the approved screen part by part, measured from the source and compared side by side at the same scale. Where a BELLA component can't match, adapt its Chip theme (Figma first, then code). Never change the approved design to fit the component, and never restyle a component from outside. When the approved screen differs from a BELLA rule, the approved look wins in the Chip theme (corners, primary colour, shadows, fonts), but the floors stay: 44px targets, 16px reading text, AAA (Elleta, 13 Nov, picked "Approved look, floors kept" for Today B).
- **Two misses on taste, then stop.** After two rejected rounds of a visual (logo, style), ask her for a reference instead of making a third.
- **A mistake becomes a rule the same day.** When she says "wrong", the coordinator writes the rule that would have prevented it into the right file (this one, or BELLA `docs/agents/maintaining.md`), and deletes any rule she has reversed. Each turn's report says which rules changed.

## Little text on screens too (Elleta, 12 Nov 2026)

A CHIP card is a title, one line and a status. Anything longer goes behind a click or into a picture. BELLA's "Reading and layout" rules in `docs/agents/maintaining.md` apply to every CHIP screen.

## Everything earns its place (Elleta, 4 Nov 2026)

CHIP is a tool for Elleta's daily design-system work, not a showcase. Before anything goes on screen, it must pass all four:
- **Function:** it does something she needs: decide, fix, check, find or hand off. If it is there only because it looks good, cut it.
- **Real:** it shows real data. Where nothing is measured it says "Not measured"; never sample or invented numbers.
- **Next step:** every item says why it matters (the rule and its source) and offers the action that follows. Nothing is display-only.
- **Legwork done:** CHIP fills in everything it already knows. She never types what CHIP can read, and starting work never opens an empty chat or terminal: it runs and shows her a result to Accept or Undo.

## Relay

- Instructions arrive in `docs/reference/inbox/liam-next.md` (gitignored). When Elleta says "go", read it and do it.
- Reports go to `docs/reference/inbox/liam-report.md`: under 15 lines, then a "Needs Elleta" list (empty if none). Screenshots go to `docs/reference/screens/` and are named in the report.
- When a step finishes, move `liam-next.md` to `docs/reference/inbox/done/<date>-<short-name>.md`.
- **Decide alone** and log it in `docs/reference/decisions-while-away.md` (one line: what, why, how to undo):
  - anything the house rules already answer (highlight never dim, ochre for fill and highlight only, pink focus ring in Chip (Elleta, 12 Nov), 44px targets, BELLA's type floor, BELLA components and tokens only);
  - anything that passes the gate and contrast checks;
  - adding tests, snapshots or docs.
- **Docs are generated from specs, never hand-built** (Elleta, 12 Nov: "the script is what nathan curtis said to do no?? that i asked for at the start"). Component doc pages come from deterministic structured specs (props, variants, states, anatomy, tokens; Nathan Curtis's specs approach, `docs/smashing-conf-nathan-curtis-2026-04-15.md`, `/spec-export`) rendered by a script, then `figma-doc-check`. Agents fix only what the check flags. Never ask her whether to automate repeated work: automate it.
- **Just do it** (Elleta, 12 Nov: "ok just do it and stop asking"). When the rules or her earlier answers settle a choice, make it and report the result; never turn it into a question. Fix passes repeat until the rating is 5/5 without asking between rounds.
- **Overnight runs never stop** (Elleta, 12 Nov: "ok well i want to go to bed now so can you run all this while i am asleep and actually do it this time"). While she sleeps: no questions and no messages to her; her-only steps (deletes, publishes, brand calls, two failed fix rounds) go on the report's "Needs Elleta" list with a picture, and the run moves on to the next item. Builders restart from where they got to after 10 quiet minutes, measured on their real working files. Morning: liam-report.md (three lines, contact sheets, per-component results, Needs Elleta) and handoff.md.
- **Stop and ask only for:** a brand change beyond an approved theme; removing or renaming a public BELLA API; anything touching git remotes or pushes; a gate that still fails after two fixes; deletes; a library publish (her click). Everything else, including rating fixes after a rating, is done without asking and reported as a result (Elleta, 12 Nov: "ok just do it and stop asking").
- Never push or merge without Elleta's OK.
- **Prove a step is hers before asking** (12 Nov, twice: "there is nothing to publish", then a Card publish that wasn't needed). Before asking Elleta to publish, accept an update or click anything, read the file and show the evidence that the step is needed (what's missing, where). No guesses passed on as her to-do.
- **Cheaper model for mechanical work** (Elleta, 12 Nov: "should we use a lower model for this" → "Yes, switch them"). Builder and checker subagents (Figma scripts, moves, screenshots, sizing and overlap checks, instance counts, inventories) run on Sonnet. Coordinators and fresh raters or reviewers (judgment calls) stay on the top model.
- **Delete questions go to the session that deletes** (12 Nov: her "Yes, delete them" was given in one session and couldn't be passed on). A yes to delete only counts in the session doing the delete, so only that session asks it; others point her there with a link.
- **Check every session before saying she didn't approve** (12 Nov, the second time it happened). She answers in whichever session she's looking at. Before telling her or another session "she hasn't said yes", read the linked sessions' latest messages for her answer.

## Earned trust (Elleta, 11 Nov 2026)

Agents earn autonomy per kind of fix, after Romina Kavcic's trust levels:
- Every agent starts as an intern: it suggests, and Elleta Accepts or Undoes each fix in CHIP.
- Risk × confidence decides. Low risk, high confidence: fix on a local branch, gates must pass, shown as one item she can Undo. Low risk, low confidence: draft the fix and ask. High risk: never without her.
- A kind of fix moves up a level after 10 Accepts in a row with no Undo, counted from CHIP's run log. One Undo drops it back to intern.
- First kinds that can earn trust: a raw hex value where a BELLA token exists, and a px font size where a type token exists.
- Pushes, merges, git remotes, BELLA's public API and brand changes never move past intern.
- Expect a babysitting phase: early on she reviews every suggestion; that is how agents learn her standards.

## Course skills run without being asked (Elleta, 12 Nov 2026)

Brad Frost's skills (in `~/.claude/skills` and `~/.agents/skills`) are part of the work, not extras. Run them at these moments and save each report to `docs/reference/audit/<date>/`:
- Before any change to BELLA tokens, and weekly: `ds-token-architecture` on `~/DEV/bella-chip-theme`.
- Weekly, and before calling a CHIP page done: `product-inspection` on CHIP; `ds-inspection` on BELLA. Compare scores with the last run.
- Before planning a move of CHIP screens onto BELLA: `ds-adoption-plan`.
- When the AI and design systems Slack channel shares a new skill, list it for Elleta in the next report with what it would do here.

## Second review (Elleta, 7 Nov 2026)

Copilot challenges every plan before Elleta decides and every session's diff before it reaches her: `npm run review -- <plan.md>` or `npm run review -- <git range> [repo path]`. Whoever runs it measures each finding first, then forwards only the real ones. Copilot can't judge how a screen looks, so screenshots and measurements stay. "NOT REVIEWED" goes in the report; it never counts as a pass.

## Security (Elleta, 12 Nov 2026)

CHIP runs a local server that calls Claude, git and Figma for her, so a hole costs her plan usage or her work.
- Every server route that changes something or calls a model refuses other websites (the origin guard in `server/lib/origin.mjs`) and has a test proving it.
- `npm audit --omit=dev` runs in the check before each commit; fix without major upgrades, list the rest.
- Run the `security-review` skill before any merge or push.
- No keys, tokens or `.env` in the repo; it is public.

## Local CI

`.git/hooks/pre-commit` (local, not committed) blocks a commit when `app/src` has a hex value or a px font size, when `npm run app:build` fails, or when a staged line matches a term in `~/.claude/nda-terms.txt`.
