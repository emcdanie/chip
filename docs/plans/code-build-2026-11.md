# Plan · CHIP in code, from the Figma flows · for 24 Nov 2026

Status: **plan only, waiting on Elleta's yes.** No code until she says yes to this plan, and then per flow only after she says yes to that flow's look (guideline 5, "Figma first, code follows").
Written 18 Nov 2026 from: the CHIP Figma file read today (template and 13 content sets, read-only), BELLA code in `~/DEV/bella-chip-theme`, CHIP code in `app/`, the 18 Nov screens handoff, and the scored audit summary (18 Nov ~19:00, before today's fixes).

## Read this first: four risks

1. **Time.** Today is Wed 18 Nov; she presents Tue 24 Nov. Code can't start until (a) she says yes to this plan, (b) the flows are re-scored after today's fixes, (c) she says yes to each flow's look, and (d) library batch 2 is published. That leaves about three working days. Not every flow can be in code by then; section 7 says what fits.
2. **BELLA code is three days behind Figma.** Last BELLA commit: 15 Nov. None of the 16–18 Nov token decisions are in code yet: Lexend, the subtext and number font tokens, the data-viz greens, warning-mark, green/alpha/20, the dark selected blues, button disabled, lg-focus. `~/DEV/bella-chip-theme` also has 37 uncommitted files from another session, so that work has to be committed or handed over before tokens land.
3. **Most of what the screens use isn't in code.** The screens use 52 parts. 17 are in code (several need re-syncing to their 17–18 Nov Figma look), 15 have a spec only, and 20 exist only in Figma. One of those, CHIP / Section head, isn't even in the library yet: it's a local part in CHIP Dashboard (batch 2 brings the library Section head).
4. **Code Connect doesn't exist anywhere yet.** No `*.figma.tsx` and no `@figma/code-connect` in either repo. Publishing Code Connect needs a Figma Organization or Enterprise plan. I'm guessing at her plan tier, so she needs to confirm it. If her tier doesn't allow it, the mapping lives in each part's spec (`figma:` node key ↔ component path), which is machine-readable anyway.

Where the code goes: the brief named `~/DEV/bella`. CHIP's CLAUDE.md says CHIP builds against `~/DEV/bella-chip-theme` and never reads or edits `~/DEV/bella`. This plan follows CHIP's CLAUDE.md.

## 0. What the repo looks like today (18 Nov, CHIP on :3100 at 1440)

The code is still the 15 Nov CHIP:
- a wide labelled sidebar, where Figma has the icon rail with the project tree;
- serif page titles, where Figma uses Lexend;
- no top bar avatar and no tabs under the header;
- Overview, where Figma has Health;
- Work is a drawer (⌘J), not a page;
- Components keeps its left list, where Figma has picker A;
- Playground is broken: it reads `bella-chip-theme/tokens/component.json`, which BELLA has since split into `tokens/component/`.

Pages:
- In Figma but not in code: Work board, Team, Playbooks, System map, Home.
- In code but not in Figma: Projects (its job moves into the project tree).

So every page is a rebuild from the Figma page, not a re-skin of today's code.

**Decided 18 Nov:** Elleta said "A, flow by flow", then "i thought we were building by page ??", then handed the call to the coordinator ("i dont know you tell me i just want it to be clean , fast, and perfect"). Result: the **unit is the page**. A page starts when every flow screen that shows it scores 85+, its parts are published, and she has said yes to that page's look by name. Sections 1 and 7 below read "flow" where they mean the flows that show a page.

**Blocker found 18 Nov night:** BELLA's token build is broken in the working tree. The 17 Nov sync replaced `tokens/semantic/light|dark|warm|chip.json` and `tokens/component.json` with four theme files (`semantic/bella-light|bella-dark|chip-light|chip-dark.json`, a `component/` folder, `breakpoints/`, `shadow.json`), but `tokens/build.py` still loads the old names. So:
- `npm run build` fails;
- the pre-commit gate blocks every commit in `bella-chip-theme`, even a docs-only one;
- CHIP's Playground fails for the same reason.

Fixing this is not a small change: it is the whole 17 Nov token pipeline plan (`token-pipeline-plan-2026-11-17.md` in the notes folder). Only 45 of 905 CSS names survive, 104 files read 484 old names, the data-theme names change, and the part contracts move out of `component.json`. That plan is still waiting on her yes. So no page can be in code by 24 Nov: **CHIP is presented from Figma on 24 Nov.** Section 7's Playground pick is withdrawn.

## Step 0. Keep what exists only in code (before tokens)

Elleta, 18 Nov: "and i dont want to loose things we already made that we forgot to make in figma".

Before any page in code is replaced, list everything that exists only in code:
- in the CHIP app (`app/src`, `server/`): every page, view, drawer, sheet, interaction, shortcut and server feature with no Figma screen or state;
- in BELLA: every code component with no Figma part.

One table: what it is, where it lives, what it does for her, and its status (in Figma, partly in Figma, or code only). Each code-only item gets a picture from the running app. She decides one of three for each code-only item:
- **add it to Figma**: it joins the CHIP screens or library queue before that page is rebuilt;
- **keep it in code as it is**;
- **retire it**: only on her yes, after she has seen the list.

A page rebuild never deletes or overwrites a code-only item until she has decided.

**Decided, 18 Nov:** Elleta said "ok can we keep the things from the overview that we dont have in health like the coverage gate etc..". These Overview items go to the Figma queue for the Health page, before Health is rebuilt in code:
1. Coverage chart: one bar per check (Story, Docs, Contract, DSDS, Contrast, A11y) with "N of 37" and yellow under 90%, plus its "By component" detail. Figma's Component checks show the same counts as rows; the chart is what's missing.
2. Gate history: the gate's pass rate over time by commit period ("22 Jul to 19 Sept 1/1, 6 commits …"). Figma has only today's Gate stat.
3. Drift across sources: Figma, Storybook, Code, Contract, Docs and Tokens, each with a status and its count ("35/37"). Figma has only the Drift stat.
4. This week, compared with last week ("35 of 37 components have a story, same as on 11 Nov").
5. Gaps to close: who can fix each gap (CHIP, Claude or you) and the "Review the fix" report. Figma's Needs you lacks the who-can-fix line.
6. The check sheet behind each check: what passing means, what failed, and Run now.
7. By component: the folded table of every component's gaps.

**Decided, 18 Nov, the rest:** "ok for the rest if it fits into what we are making which i think it does". Every other pick on the code-only page stands:
- **Add to Figma:** component page (Ask, redlines, compositions, Behind it, Try a change), Foundations (Who uses what, Radius, Motion), History's ask box, the Projects page, and the Work panel (dock, Sessions and run report, Ask OBI and Talk, Terminal).
- **Keep in code:** keyboard shortcuts, server feeds, site patterns.
- **Retire:** the docs editor, component history and notes reader (none is linked in the app), the Kit page, StatusPill and ScoreStrip. Each one is deleted in the same step as the rebuild that replaces it, and listed in that report.
- **Still open:** Playground. The code version shows a live page from any project; the Figma version shows one part on a canvas. Inventory with pictures: `docs/reference/screens/2026-11-18-code-only/index.html` (served by chip-review, localhost:3122).

## 1. The gate per flow

A flow goes to code only when all of these are true:
- **Score 85 or more** on the scored audit, re-run after today's fixes (the 18 Nov ~19:00 scores came before the fixes).
- **Her yes on the look**, given for that flow by name, in a session she is typing in. An OK relayed by another session doesn't count.
- **Clean data** (guideline 5): every part on the flow comes from the library, with no local or detached parts. craft-check and pixel-check both read 0, FigmaLint finds 0 hard-coded values, and every part it uses has a `specs/components/<Name>.spec.yaml`.
- **Library parts published and accepted.** Every part the flow needs is in a batch she has published.

Today three of the four near-ready pages' flows (Playbooks 88, Flow 1 86, Team 86) fail "clean data" on one thing: they use the local CHIP / Section head. They pass once batch 2's library Section head is published and swapped in. Playground (86) does not use it; its parts are all library parts.

**Conflict to settle first (her call).** The brief says code starts per flow. Her own rule says code starts once the whole set is clean: CHIP CLAUDE.md, 15 Nov ("finish the screens in figma then audit"), and guideline 5, 17 Nov ("the entire chip workflow is on system"). Per flow means Playground can be in code by 24 Nov. Whole set means no code before 24 Nov, and she presents everything from Figma. Until she says otherwise, her rule stands, and the per-flow score only sets the order.

## 2. Tokens first (wave 1)

Foundations variables (`YmAwfJ8QnZGJovPs3eykv9`) go to BELLA tokens in `~/DEV/bella-chip-theme/tokens/`, through the existing DTCG export and `tokens/build.py`. Missing in code today:

| Token | What it does | In code |
|---|---|---|
| `typography/font-family/lexend` (Tier 1) | Chip titles, body, labels, nav, buttons | no |
| `typography/subtext/font-family`, `typography/number/font-family` (Theme) | Geist Mono in Chip, DM Sans in BELLA | no |
| Lexend webfont in `.storybook/fonts.css` (CHIP imports it as `@bella/fonts.css`) | loads the face | no |
| `color/data-viz/positive-1..3` | System health arc greens | no |
| `color/background/utility/warning-mark` | warning dots, bars, segments | no |
| `green/alpha/20` | Chip dark success wash | no |
| `brand-subtle-hover` (dark tints) | selected in Chip dark | no |
| `button/color/background/disabled` | Chip dark disabled | no |
| `border/radius/lg-focus` | focus ring corner on pills | no |

Done means:
- `npm run build` writes no stray diff;
- the BELLA `gate` passes (contract-parity, contrast-pairs at 7:1 for text, audit:visual);
- ds-token-architecture is run first, as CHIP's CLAUDE.md asks;
- the token panel screenshots match the code, group by group.

No new tokens: only what Foundations already has.

## 3. Parts (wave 2)

Each part goes into `bella-chip-theme/src/components/<Name>/`, in four pieces:
- the component, using the zone-and-boolean props the Figma part has;
- a Storybook story with every state, light and dark, Chip and BELLA;
- its contract (`specs/components/<Name>.spec.yaml`, built from Figma by `spec-build.mjs`);
- a Code Connect mapping, or the spec key if her plan tier doesn't allow Code Connect.

Order: shared parts first, then what each flow needs. BELLA work happens on its own branch in its own worktree. The 37 open files in `~/DEV/bella-chip-theme` belong to whichever session made them: ask that session to commit or hand them over, and never commit them with this work.

| Part (Figma name) | In code today | Used by | Wave |
|---|---|---|---|
| Text stack | no (no spec) | every screen | 2a |
| Trailing | no (no spec) | every row that opens something | 2a |
| Icon well | no (no spec) | every section head and row | 2a |
| List item (ListRow) | yes, but the old shape; Figma rebuilt it with zones | every screen | 2a (rework) |
| Section head | no; local in CHIP Dashboard, batch 2 in library | every screen | 2a, after batch 2 publish |
| Button, Tag, ActionChip, Icon, SegmentedControl / Segment, Tabs, PageHeader | yes, older looks | every screen | 2a (re-sync to 17–18 Nov decisions) |
| StatusDot | spec only | most screens | 2a |
| Notification | no (spec "Notice" is the older part) | Health, Work, Foundations, History, Team, Playbooks, Connectors | 2a |
| Toast | spec only | Components, Foundations | 2b |
| Card footer | no (batch 2) | every card with an action | 2a, after batch 2 publish |
| Shell: Icon rail, Nav item, Project panel, Tree item, Client switcher, Top bar, Search field, Avatar, CHIP logo, BELLA mark, Scrim | Avatar and BrandWordmark only; Nav item and Tree item are spec only; the rest are Figma only | every screen | 3 |
| TaskCard, Empty state, Skeleton / Skeleton card | TaskCard spec only; the others Figma only | Work (Flows 1, 10, 11) | 2b |
| System health, Fail row, Gauge, Progress (fill, segment, target), _Target mark, Stat card, Check row | Gauge, Progress, Check row spec only; the rest Figma only | Health, Gate drawer, Components, Playbooks | 2b |
| HelperText, Drawer, Stat | Drawer and Stat in code; HelperText Figma only | Gate drawer | 2b |
| CodeBlock, Code line, Anatomy highlight (replaces Anatomy pin) | CodeBlock in code; Code line spec only; Anatomy highlight in batch 2 | Components | 2b |
| Swatch, Type specimen, Spacing step | spec only | Foundations | 2b |
| FilterChip, ChatBubble, Input, Link | yes | History, Team | 2a (check against Figma) |
| Stage, DataTable | Stage spec only; DataTable in code | Playground | 2b |
| App tile | spec only | Connectors | 2b |
| Step (batch 2) | spec only | Playbooks | 2b, after batch 2 publish |

**Gaps** (a part that exists in Figma but not in code): 20 parts with no spec and no code, and 15 with a spec but no code. Library gaps that block a screen, from the handoff:
- PageHeader has no second action;
- TaskCard has no tag zone (branch tags);
- the List item Right zone can't take a horizontal action;
- Tag has flat only for tone=default;
- Button has one icon slot (the picker's StatusDot);
- the Progress track reads as full at 0.

These get fixed in Figma first, then in code. Nothing is patched in CHIP.

## 4. The CHIP shell (wave 3)

One `Screen` layout in CHIP, the code twin of CHIP / Screen (`601:112027`):
- the icon rail (name as tooltip and accessible name);
- the project tree with the branch filter. Clicking a branch filters the Work board, the header reads "CHIP › branch", and the main action becomes what that branch needs;
- the top bar (search, avatar);
- the PageHeader with the main action top right and 24 below;
- the folder Tabs under the header;
- the work area as a 12-column CSS grid. Gutter = `layout/gutter` (24), margins = the BELLA container padding (16 on a phone, 32 from 800px up).

Each page's content is one component per Figma slot fill (Health · content, Work · content …). Each Figma state variant is a prop value, so a change is made in one place, as in Figma. The existing `App.jsx`, `shell.css` and `Kit.jsx` are replaced, not kept beside it.

## 5. Pages, one at a time (wave 4)

Code is built **by page** (Elleta, 18 Nov: "i thought we were building by page ??"). The order is tokens, then library parts, then the shell, then one page at a time. A page is its content component (the Figma slot fill) with every one of its states. The flows are not built separately: they are the click-through test once their pages exist in code.

Gate per page: its content component, all states, scores 85+ on the re-score and she says yes to its look.

| Order | Page (Figma content set) | States | Flows that use it (score 18 Nov) | Parts still to build after the shared base |
|---|---|---|---|---|
| 1 | Playground (`612:138756`) | 4 | 9 (86) | Stage |
| 2 | Team (`612:82090`) | 4 | 7 (86) | none |
| 3 | Playbooks (`612:73919`) | 6 | 6 (88) | Stat card, Progress, Step (batch 2) |
| 4 | Work (`608:207182`) | 14 | 1 (86), 10, 11 (no score in summary) | TaskCard, Empty state, Skeleton |
| 5 | History + History drawer (`612:67196`, `612:67199`) | 4 + 2 | 5, 10 (no score) | none |
| 6 | Health + Gate drawer (`601:111049`, `601:111587`) | 4 + 3 | 2 (no score) | System health family, Gauge, Check row, HelperText |
| 7 | System map (`601:115591`) | 1 | 2 (no score) | curved wires (MapLine, spec only) |
| 8 | Connectors (`601:126716`) | 1 | 2 (no score) | App tile |
| 9 | Components (`612:57549`) | 6 | 3 (73), 10 | Code line, Anatomy highlight, Toast |
| 10 | Foundations (`612:61970`) | 5 | 4 (60) | Swatch, Type specimen, Spacing step |
| — | Home (`612:85929`) | 1 | 8 | waits on her pick of Home |

Playbooks has the top score but needs three more parts than Playground and Team, so it goes third. The scores are per flow; a page shared by several flows takes the lowest of them. The parent session should send the five missing scores. The order is reset after the re-score, before any code starts.

When a flow's pages are all in code, the flow is clicked through end to end, compared with its Figma flow screen by screen.

Old CHIP code: each page built replaces its old file, deleted in the same step (Clean, not set aside). Old pages that no Figma page replaces: Atlas*, Obi, Sandbox, Terminal, Runs, DoNext, ReviewSheet, WorkPanel. Their delete list goes to her first.

### Re-score, 18 Nov night (read-only, same rubric; `rescore-2026-11-18-night.md` in the notes folder)

28 of 54 screens pass (19:00: 20 of 46; 8 screens were added since). 21 of the 26 failures are only "built from the system" under 90%. Every screen scores 83 or more.

| Order now | Page | Lowest screen | Screens passing | What holds it back |
|---|---|---|---|---|
| 1 | Playbooks | 91 | 6 of 6 | nothing: **first page to build** |
| 2 | Work | 83 | 12 of 13 | "Last checked" clips the Check again button; screen 7 |
| 3 | Team | 95 | 0 of 4 | two hand-built cards (Waiting on you, Team chat): system share 87% |
| 4 | History (+ drawer) | 88 | 4 of 6 | drawer body hand-built, scrim short |
| 5 | Health (+ Gate drawer) | 83 | 4 of 5 | loose › arrows, fixed-height Stat cards, drawer clip; plus the Overview items she kept |
| 6 | Components | 86 | 0 of 8 | Anatomy row and Checks hand-built |
| 7 | Foundations | 85 | 0 of 5 | swatches, tiers, roles hand-built; plus Who uses what, Radius, Motion |
| 8 | Playground | 81 | 1 of 4 | control bar clips, dot grid overlay; and the open "which Playground" question |
| 9 | System map, Connectors | 90–93 | 0 of 1 each | map and Reaches rows hand-built |
| — | Home | 86 | 1 of 1 | waits on her pick of Home |

This replaces the order in section 5 and the Playground pick in section 7.

Known after the token switch (18 Nov night): CHIP's "Gaps to close" counts 44 components without contrast pairs (was 8). CHIP matches pairs to each component's own tokens; BELLA's new contrast check tests the shared colours in four themes. Fix it in the Health rebuild (sync-bella and server/lib/gaps.mjs), not in the old Overview.

## 6. Checking each screen against Figma

Per screen, before she sees it:
- **Side by side:** Figma at 1x beside code at 1x, the same state, the same scale, both in view in the `chip-review` preview (localhost:3122). Every element in one is in the other, in the same place. A difference with no rule behind it is a fix, not taste.
- **Widths:** 320, 768, 1024 and 1440, plus the Work drawer open. Light and dark. Every state variant of the slot fill.
- **CHIP checks:** `node scripts/on-system-guard.mjs`, `npm run check:system`, `npm run app:build`, and the pre-commit hook (no hex or px font sizes in `app/src`; NDA terms).
- **BELLA checks:** the `gate` (contract-parity, contrast-pairs, audit:visual) for every part touched.
- **Security:** `security-review` if a server route changes.
- **Review:** Copilot second review on the diff (`npm run review -- <range>`), each finding measured.
- **Floors:** axe at AAA, plus a measured sweep of every interactive element. Tap targets are 44 or more, reading text is 16px or more, text contrast is 7:1, and the focus ring is 4px with a 4px gap, keyboard-tabbed through each state.
- **Every width:** a resize sweep from 320 to 1440 in 16px steps (and with the Work drawer open), with nothing clipped or scrolling sideways. Screenshots are taken at the four widths above.
- **Nothing lost:** before the old shell goes, list every route and action the current app has (from `App.jsx` and the `server/` routes it calls). Check each still works or is on her delete list. Old routes stay until she has seen that list.
- **Push and merge:** only on her OK.

## 7. What fits by 24 Nov

**Pick (marked), only if she picks per-flow start in section 1:** tokens, the shared parts (2a) plus Stage, the shell, and the **Playground page** in code, shown beside its Figma screens as the "Figma → code" proof. Everything else is presented from Figma.

| | In code by 24 Nov | Presented from Figma |
|---|---|---|
| Pick | tokens, 2a parts + Stage, shell, Playground page | every other page |
| Stretch, if she says yes to Team's look by Fri 20 Nov | plus Team page | every other page |

Why Playground: it is the page that needs the fewest new parts (Stage only), CHIP already has a Playground page to replace, and it shows BELLA parts on a canvas, which fits a BELLA talk. The Work page is the better CHIP story, but it has 14 states and needs TaskCard, Empty state, Skeleton and drag on top of the shell, which doesn't fit three days safely.

Days, if she says yes on Thu 19 Nov:
- Thu: tokens, commit or hand over the 37 open BELLA files, re-score.
- Fri: 2a parts.
- Sat to Mon: shell, then Playground, then the side-by-side check.
- Mon evening: her look.

If any gate slips past Fri 20 Nov (her look yes, the re-score, or the BELLA files), Playground is presented from Figma too, and the code starts after 24 Nov. No rushed build goes on stage.

## Copilot review

Copilot (`npm run review -- docs/plans/code-build-2026-11.md`) ran on this plan on 18 Nov. All 9 findings were measured:
- 8 held up and are fixed in the plan above: the Figma-first conflict, Stage missing from the pick, the floor checks, the full width sweep, the re-score, the slip rule, the regression check, and the BELLA open files.
- 1 didn't: "Playground depends on batch 2". The Figma read shows Playground uses no Section head; the plan's own line was wrong and is corrected.
