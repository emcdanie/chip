# Put CHIP back on BELLA: audit and plan

Status: audit done, nothing built, waiting for Elleta. Measured on :3126 at `fdae1ff` plus the uncommitted removal of the Visual/Technical/Scope switch, 6 Nov 2026. This replaces the earlier version, whose token-restyling route was wrong.

## Restart, waiting for Elleta's go

One coordinator in `~/DEV/chip`. One working session at a time, each reviewed by Elleta before the next starts.

1. Commit the switch removal and merge `claude/mock-shell-26b6e6` into `chip-2.0` (local, nothing pushed). All 18 worktree branches are already in the app branch.
2. Archive the CHIP sessions, this one last. Fabrik's stay. Archiving can be undone, and it stops :3126 and :3121.
3. Clear the 18 CHIP worktrees and their servers. Their only uncommitted files are generated data, apart from step 1's change.
4. New coordinator starts :3126 from `chip-2.0` and runs the sessions below.

Rules for every session: audit the code first, BELLA components only, no new patterns, show Elleta one screen before rolling it out.

| # | Session | Covers | Elleta's check |
|---|---|---|---|
| 1 | CHIP theme | Theme, aliases, 16px and 44px, radii including rounded badges | Colours and shapes look right |
| 2 | Kit onto BELLA | Status tags, tabs, filter chips | Same look, real components |
| 3 | Actions that work | Accept shows progress and failure where you can see it; Accept blocked by BELLA's failing gate; Playground Send through to the terminal | She can complete each one |
| 4 | Hierarchy | One pattern for title, subtitle, body and detail, using BELLA's headings; less text by default. Review sheet first, then Overview | Approves on one sheet first |
| 5 | Component page | Which of Inspect, Use, Dark, All at once, compositions and Behind it stay | Her call on each |
| 6 | Playground and Projects | Project picker clear in the Playground; Projects content fills and reads easily | Reads easily |
| 7 | Rest of the swap | Page-by-page controls, clean-up, hook | Final review before the Jam |

## Elleta's review, 6 Nov

- Keep: Foundations as it is, Coverage, the Playground idea, Projects idea.
- Do next badges should be round.
- Fix it then Accept shows "accepting" and nothing she can follow.
- Dense everywhere, too much writing, no hierarchy: in the review sheet, title and subtitle look the same, and the accordion text is bigger.
- Component page: too many buttons, unclear what Inspect and Use are for; questions whether "rules run on real compositions" and Behind it are needed.
- Playground: Send did not reach the terminal and the change did not happen. Projects should be reachable from it.
- Projects: content does not fill, hard to read.

Causes so far:

- Accept: it ran at 12:15 and failed after 71 seconds. BELLA's gate refused the commit because 2 stories files no longer match their baseline. BELLA's gate is already failing, so a Fix it may not land until that clears. Progress and the reason appear only in the open sheet. It also carried 18 staged files from BELLA's shared tree, which should not ride along with a fix. Nothing landed.
- Playground: Send types the command into a new shell and waits for Return. The last brief written is from 08:23, so a later try did not write one. Cause not found yet; needs reproducing.
- Project picker: the code has a Project dropdown on the Playground; not yet checked on screen.

## Verdict

CHIP was on BELLA until 4 Nov. Commit `040a0e9` ported the mock's token sheet and started a CHIP-made kit, and 101 commits have built on it since.

| | Before, `a62b81f` | Now |
|---|---|---|
| CSS token uses naming a BELLA token | 877 of 884 (99%) | 647 of 3,648 (18%), some of them CHIP's overrides |
| CSS lines | 3,243 | 4,208 |

The 4 Nov session logged this as a decision: "Kit components are CHIP-local". It treated the mock as the source of truth, which goes against CHIP's own rule. Later rounds, including the ones I ran, polished the copies and never questioned them.

## Findings

| # | Finding | Evidence |
|---|---|---|
| 1 | Most controls are not BELLA components | 55 of 761 rendered, 3 BELLA kinds against 29 CHIP kinds |
| 2 | CHIP's look runs on its own tokens | `kit/tokens.css`: "CHIP's chrome reads only these" |
| 3 | BELLA's type floor is broken | 1,540 of 1,923 text runs are under 16px, at 14px |
| 4 | BELLA's target floor is broken | 295 of 520 controls are under 44px tall or 24px wide |
| 5 | BELLA's focus ring is replaced | `--ring-focus-color` is set to CHIP's blue; `AGENTS.md` says the ring is BELLA's |
| 6 | BELLA components are restyled | 31 BELLA tokens are redefined in `kit/tokens.css`, more in `shell.css` and `atlas.css` |
| 7 | Some CSS reaches into BELLA | `app.css` targets hashed classes (`[class*='_inner_']`); 22 `!important` across the app, not all aimed at BELLA |
| 8 | The hook can't see any of this | Colours are written as `rgb()` "because the pre-commit hook blocks hex"; 41 literal colours pass |

Count caveats: finding 3 and 4 include a few false positives, such as a BELLA input's inner element and inline links, which may be exempt. Specimen stages and open Work tabs are excluded. Counts cover 7 pages at 1440 on load only.

## What is not broken

The rebuilds are not careless. Kit tabs have arrow keys, Sheet is a native dialog with Esc and focus return, and removed outlines on `.cn-open` and `.hcol` have a replacement ring. I found no broken keyboard path from reading the code, but I did not test by keyboard or screen reader.

The real problem is that these are copies. A fix you make in BELLA doesn't reach them, and your floors don't apply to them.

## Plan

Keep what the 101 commits built: pages, Work panel, connectors, Playground, data, behaviour, page structure and CHIP's colours. The colours become a BELLA theme, the same way `warm` and `wee-dote` work. Page CSS is not rewritten for this.

### 1. CHIP theme and aliases

- Add a `chip` theme in BELLA: `tokens/semantic/chip.json` plus its entry in `tokens/$themes.json`, in a BELLA worktree. It holds CHIP's approved colours, including the action blue, button fills and focus ring. BELLA's gate checks it like any theme.
- CHIP loads with `data-theme="chip"`.
- In `kit/tokens.css`, keep CHIP's names but point them at BELLA: `--ink` to `--color-semantic-text-primary`, `--action` to `--color-semantic-action`, and so on. The 3,648 uses in page CSS stay as they are.
- Set `--fs-14` to BELLA's 16px and `--h-compact` to 44px, one line each.
- Delete `--component-*` overrides the theme now covers, and any that change more than colour.
- Remove the CSS that reaches into BELLA.
- The theme can also set radii through BELLA's `--component-*-border-radius` tokens. Whether CHIP's theme does is Elleta's call; they can change later without touching pages.
- Colours stay. Text gets larger and compact controls get taller. Screens at this point are the first thing to review.
- To check: the annotation pink and status colours may have no BELLA slot. Dark needs a decision: the existing dark theme or a CHIP dark. Whether the theme can carry the flat button (it may need shadow tokens).

### 2. Kit pieces become BELLA

| Kit piece | Becomes | Rendered |
|---|---|---|
| `StatusPill` | BELLA StatusPill | 240 |
| `Segmented`, `RadioSeg` | BELLA Tabs or SegmentedControl | 48 |
| `Chips` | BELLA FilterChip | 14 |

Result: about 357 of 761 (47%).

### 3. Page by page

NavList, Button, Link, Input, Select, Combobox, Disclosure and BrandWordmark replace about 163 raw controls. Result: about 520 of 761 (68%).

### 4. Hold it there

- Delete unused CSS.
- Extend the local hook to block `rgb()` values and `--component-*` overrides in `app/src`.
- Add the on-system count as a repeatable check.
- Run the gate and look at both themes. Then run keyboard and screen reader passes.

## What BELLA is missing

Stop and list these for Elleta first. No BELLA change without her word.

| Gap | Needed for |
|---|---|
| Button takes no `aria-expanded` or `aria-pressed` | Every toggle (Columns, Filters, Work) |
| No Checkbox | Filters |
| Input and Select need a label; Input's minimum is 60px | Search fields in toolbars |
| Not yet checked: Drawer against Sheet's actions and footer; DataTable's search and columns | 13 Sheets, 8 tables |

About 240 rendered controls have no BELLA equivalent: row buttons, nav pins, skip link. They stay as plain elements on BELLA tokens and floors, or become BELLA components if Elleta wants that.

## Effect on other work

- Shapes from today's fixes are replaced on BELLA components. Rounds 1 and 2's wording, count and behaviour fixes stay.
- The open Round 3 style calls (button height, bar colour) go away.
- Session estimate, a guess: about five, with phase 1 as one.

## Elleta's call

Decided 6 Nov: BELLA components, with CHIP's colours as a BELLA theme. Waiting for her go on phase 1.
