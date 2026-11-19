# Playground: concept lock (draft, 4 Nov)

Status: plan only. Nothing built. Waiting on Elleta's go.
Code read on `claude/mock-shell-26b6e6`. Story UI and A2UI checked on their own pages, 4 Nov.

## 1. Thesis

One page where Elleta describes, marks up or drags together a whole screen, CHIP builds it only from BELLA components, and every "this breaks the pattern" names the rule and the file it came from. That beats today's sandbox, which tunes one token on one component and can't show how components behave together.

## 2. The three parts

| | (a) Describe and build | (b) Mark up | (c) Drag and drop |
|---|---|---|---|
| What | Type a screen; Claude returns a component tree; CHIP renders it live and checks it | Load a CHIP page, a site page or a screenshot; draw boxes and pins with notes; send to Claude, which answers with a tree or a change to one | Component list on the left, canvas, props panel from the contract, save/load |
| Size | 3 to 4 days | 3 days on top of (a) | 5+ days on top of (a) |
| Risk | Medium: Claude's tree may cite props BELLA doesn't have (caught by the validator, see 4) | High: a screenshot becomes a guess at components; only CHIP's own pages map back exactly | High: nesting, drop zones and reorder are a product of their own; keyboard drag (2.5.7) is extra work |
| Reuses | `specimens.jsx` `COMPONENTS` registry (27 of 37 today: layout parts like `Columns`, `Section`, `PageHeader` are missing), headless Claude provider (`server/providers/claude.js`, no tools), Sandbox's `contrast()` and target-size checks, `tokens/component.json` | (a), plus the Review card's pinned notes (Phase 6 G); screenshots from `screenshotter` | (a)'s tree and renderer; props panel from contract `props`/`variants` (the Playground tab's controls, generalised) |
| Overlap | Story UI already does this inside Storybook (installed in BELLA, 5.17.9, config and `story-ui-considerations.md` written) | Story UI takes images as a reference, but has no drawing | Story UI has a click-to-edit props inspector, no canvas |

Where (a) runs, the real choice:
- **CHIP-native (A2UI-shaped tree).** Renders in CHIP, checks in CHIP, safe by construction. New code: renderer, validator, export. 
- **Story UI behind CHIP.** Reuses its generation and its Playwright/axe self-healing; output is JSX `.stories.tsx` committed on a new branch. Needs Storybook and Story UI running (`npm run storybook-with-ui`), writes files into BELLA per try, and the README recommends Storybook 10.5.10+ (BELLA pins ^10.5.3, not tested). CHIP shows it in an iframe and can't read the tree back, so (b) and (c) can't build on it.

## 3. "Breaks the pattern" feedback

Every finding is `rule · source · what to use instead`. No source, no finding.

Three tiers, cheapest first:
1. **On the tree, before render (deterministic):**
   - unknown component or prop: catalogue from `tokens/component.json` (`props`, `variants`); same truth `contract-parity.mjs` holds the code to
   - more than one `Button variant="primary"`: AGENTS.md table, Button `dont[0]` → `Button variant="secondary"`
   - Button used to filter, toggle or sort (a row of Buttons swapping one value): Button `dont[1]` → `FilterChip`, `SegmentedControl`, `Select`, `Tabs`. Heuristic: says so on the finding
   - `Heading` inside `Card`; anything interactive nested in `Card`: `story-ui-considerations.md` rules
   - asks for Switch, Checkbox, Dialog, Toast and the rest: AGENTS.md "Not in BELLA yet" → stop and name the gap, don't fake it
2. **On the render (measured in the browser):** targets ≥ 44px and type ≥ 16/18px (AGENTS.md Floors), contrast per pair (Sandbox `contrast()`, bars from `contrast-pairs.mjs`), focus ring present.
3. **Contract prose Claude reads:** the `dont` and `usage` lines no script encodes. Claude may flag one only by quoting the line and its index (`card.dont[2]`); CHIP checks the quote exists and drops anything that doesn't match.

"Instead" comes from AGENTS.md "Which component for which job", so the advice is the same table agents already obey.

## 4. How a screen is stored

An A2UI-shaped flat list (A2UI v0.9: `{ id, component, children: [ids] }`, components only from an agreed catalogue), with `catalogId: "bella"` and BELLA props:
`{ "id": "save", "component": "Button", "props": { "variant": "primary" }, "text": "Save" }`

- **Claude writes the tree, not JSX.** JSON can be validated against the contract and rendered without running anything Claude wrote. JSX would need eval or a build step, and can smuggle a raw `<button>` or a hex value.
- **Render:** a pure map from `component` to the `COMPONENTS` registry; unknown names render a labelled gap box, never HTML.
- **Save:** `data/playground/<name>.json` in CHIP. `data/` is not gitignored today, so saved screens would land in the public repo unless that folder is ignored (question 6). One file per screen; nothing generated twice.
- **Export (generated, never hand-written):** tree → JSX is a pure function. Two targets: a story in BELLA's `src/stories/generated/` (the path Story UI already uses, so both land in the same place and the gate's `audit:visual` covers them) or a code snippet to copy. Each export goes through BELLA's pre-commit like Accept does today.
- I'm guessing A2UI's own React renderer (`@a2ui/react`) isn't worth adopting: it's public preview ("Expect changes"), and CHIP needs BELLA props, not A2UI's basic catalogue. Borrow the shape, not the package.

## 5. Where it lives

- Own nav item, **Playground**, after Components. Route `#/play`, `#/play/<name>`. `WS_KEYS` gets Digit6.
- The terminal stays the place to talk: a Playground prompt can also arrive from Claude in the terminal (`chip play "<prompt>"` writes the tree file; the page watches it), using the existing `chip:terminal` wiring the other way round.
- Component page: remove the Playground tab. Trade-off:
  - **Remove only:** one fewer tab (12 → 11); the token slider in `Sandbox.jsx` goes unused.
  - **Replace with "Try in Playground"**, a link that opens `#/play` with that component preloaded and its variants laid out: keeps the entry point, costs half a day. Sandbox's checks move into the Playground validator rather than dying.

## 6. First slice for 24 Nov, against the budget

Phase 6 has no slack. Nothing here fits without a cut.

- **Slice (3 days):** (a) CHIP-native only. Type a prompt, headless Claude returns a tree, CHIP renders it, tier 1 and the target/contrast half of tier 2 run, findings show rule · source · instead. Fill the catalogue gap (add the 10 missing components to the registry). Save/load one file. Remove the Playground tab and link to the new page. Light theme.
- **Cheaper slice (1 day):** no new page. Link "Playground" to Story UI in an iframe, BELLA's considerations already loaded. Demo-able, but feedback is Story UI's badge, not BELLA's named rules, and (b)/(c) can't follow.
- **Waits:** (b) mark up, (c) drag and drop, tier 3 prose checks, export to story/code, dark/warm themes, voice, the terminal `chip play` command.
- **To make room for the 3 days**, one of: drift trend chart (already first in Phase 6's cut order), the Figma embed (keep the link), or moving H or I to Next.

## 6b. Update, 4 Nov late: build it, test on the portfolio About page

Elleta: build before the talk, first real test is About (`ctrl-alt-design/app/about/page.tsx`). About is the site's own components on BELLA's CSS, not BELLA React: only `Card` is a synced BELLA copy (`lib/bella/sync-manifest.json`); `Section`, `SectionHeader`, `Heading`, `Button` share BELLA names but are the site's own; `Journey`, `HouseRules`, `CaseOffer`, `GuideLine` are site-only. That mismatch is the demo.

**How a page gets in** (picked: live render + parsed source, joined by section id)

| | Live render (iframe) | Parsed tree (source) | Screenshot |
|---|---|---|---|
| Play with it | Yes: real links, flip cards, hot reload when Claude edits | No: a list | No |
| Mark up | Overlay on top; boxes align only if the iframe is full page height (no inner scroll) | Per section only | Easy |
| Measure (targets, type, contrast) | Yes, if CHIP can read the DOM: cross-origin blocks it, so a CHIP proxy on its own port serves the site and adds one probe script that `postMessage`s measurements | No | Guess |
| Map to components | No: the DOM doesn't say which component drew it | Yes: page imports and JSX tags, joined to the DOM by `id` | No |

**How edits flow back** (picked: site process, CHIP never writes the site). Retired 19 Nov 2026 (Elleta's pick on docs/reference/screens/2026-11-19-playground/): no brief and no box notes; Mark up notes go to the progress board from the new Playground.
- CHIP writes a brief (notes, the element under each box, findings with sources) to `data/playground/briefs/` and types `claude` with it into the terminal in the site repo.
- That Claude follows the site's `CLAUDE.md`: branch from `origin/release/v6`, plan, stop for her go, PR, her `OK #n`. Its dev server on that branch is what the Playground can load, so the change shows live.
- Proposal-only in CHIP (no site edits) was the other option: safer, but nothing to play with.

**Days from 4 Nov** (talk 24 Nov; Phase 6 already uses the days, so this replaces cut items)
- 4–5 Nov: page, proxy + probe, live About, markup layer, section map, findings, brief to terminal, tab removed (the slice below).
- 6 Nov: dark theme pass, screenshots, fixes.
- 7–10 Nov: (a) describe and build: tree renderer and validator.
- 11–12 Nov: (c) props panel on a picked node (no drag yet).
- 13–14 Nov: export tree → story.
- Then back to Phase 6 F (test run and recording).
- If it slips, cut in this order: export, props panel, (a). The About slice stays.

Built 4 Nov on `claude/playground` (CHIP worktree): the About slice above. The site's `CLAUDE.md` says branch from `origin/release/v6`, but that branch is gone from the remote (only `docs/release-v7-branch` exists), so the Playground loads `origin/main` and the brief defers to whatever the site's process says.

## 7. Questions only Elleta can answer

1. CHIP-native tree, or Story UI behind CHIP? (Decides whether (b) and (c) are ever possible.)
2. What gets cut to make room: the drift chart, the Figma embed, or H/I?
3. Component page: remove the tab, or replace it with "Try in Playground"?
4. On stage: is a generated screen with named rule findings the demo, or is mark-up the moment you want?
5. Mark-up later: CHIP pages only (exact), or also the site and screenshots (a guess)?
6. Saved screens: private in `data/`, or exported into BELLA as stories (public repo)?
