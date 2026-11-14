# Component docs: concept lock (draft, 4 Nov)

Status: concept and mock only. Nothing built. Waiting on Elleta's go.
Mock: `ctrl-alt-design/docs/reference/inbox/chip-docs-01.html` (http://localhost:3121/chip-docs-01.html), Button and FilterChip on BELLA @ 8e8d4d2.

## 1. Thesis

The component documents itself. One live specimen is the page: every fact hangs off a part of it, and every rule is a check that runs on it, so nothing is written that the component could show or prove instead.

## 2. What replaces the 12 tabs

Three surfaces, one page, no tabs.

| Today's tab | Becomes |
|---|---|
| Anatomy, Spec | **Stage**: the specimen on a canvas. Inspect mode: hover or pick a part, it gets an outline, a leader and a pink chip; the inspector shows its token, value per theme and detail. Use mode: the specimen is live (real hover, press, focus). |
| Variants, States | **Filmstrip** under the stage: each state is a real thumbnail of the current variant. Click, arrow or Play to scrub. "All" swaps the stage for the variant × state matrix. Picking a part with a trigger (FilterChip's Pressed fill) scrubs to that state. |
| Usage | **Scenes**: small real compositions built from the contract's `usage` and `dont` lines. Each runs its rule and names it (`button.dont[0]`). Click a component in a scene to change it; the check re-runs. "Fix" applies the contract's instead. |
| Accessibility, Contract, Tests | **Checks strip**: live badges measured on the specimen (target, type floor, contrast, focus ring, contract prose vs render), plus the synced gate results (parity, visual). Click a badge to light up the part it measured. |
| Playground | Gone. Each scene has "Open in Playground" (see 5). |
| Source, History, Figma | **Behind it**: one row each at the foot of the page, existing panels unchanged inside. |

The lens (Visual · Technical · Scope, same control as Lead with) changes what the same specimen says. Visual: names, swatches, redlines. Technical: token names, CSS vars, the JSX for exactly what's on stage, props set. Scope: the rules on each part and where the component is used.

## 3. Contract and compliance stay visible

- The checks strip is always on screen above the stage and re-checks on every change of variant, state, shape or theme.
- Every finding is `rule · source · instead`, same shape as Playground's. No source, no finding.
- New check the mock already runs: **prose vs render**. It parses the contract's anatomy detail ("Figtree 16, 600") and compares it with the rendered label. It catches two real drifts today: FilterChip's contract says Geist 14, the chip renders Figtree 18; Button's box says padding 12 / 20, it renders 0 / 20 (changed 5 Oct). Not parsed yet: Button's a11y line says 16.0:1 on the plate, the mock measures 13.9:1 (the 14 Oct action token).
- The scenes are compliance you can poke: two primaries fails, a row of Buttons used as filters fails and its fix swaps in FilterChip.

## 4. Text gets cut, and where it still lives

- On the page by default: the component name, one sentence, numbers and badges. No paragraphs.
- On demand: "Read" under the title (full description and rest-state note), "Why" on every badge and scene (the contract line, quoted), Ask (answers only by quoting contract lines, with their index; anything else says "the contract doesn't say").
- Still the source of truth, unchanged: `tokens/component.json` (the contract), BELLA's docs MDX and Storybook. CHIP generates from them and writes nothing twice.

## 5. How it differs from Playground

| | Docs | Playground |
|---|---|---|
| Subject | One component, its truth | A whole screen, many components |
| Who authors | The contract (scenes come from `usage` / `dont`) | Elleta or Claude, per session |
| Question it answers | "What is this and when does it break?" | "Does this screen follow the patterns?" |
| Output | Nothing saved | A saved tree, later a story |

One engine, two doors. Both use the same `COMPONENTS` renderer and the same tier 1 and tier 2 checks. A docs scene is a tiny, fixed Playground tree; "Open in Playground" loads it there to grow into a screen. Docs never gets a canvas you build on; Playground never documents a single component.

## 6. Smallest slice before 24 Nov

Phase 6 has no slack (see `playground.md` 6), so this replaces something.

- **Slice (3 days), Button only:** stage with Inspect/Use and the parts list (Atlas `Anatomy` already has parts, `hl` and zones), filmstrip (reuses `Forced`), checks strip (reuses Sandbox `contrast()` and `minTarget`), Visual and Technical lenses, three Button scenes, Behind it with today's Source/History/Tests/Figma panels moved as they are.
- **Waits:** Scope lens, Ask, the matrix, FilterChip and the other 35 scenes, prose-vs-render for every component.
- **Cheaper (1 day):** the checks strip and the filmstrip on top of today's page; tabs stay.

## 7. Questions only Elleta can answer

1. Lens: reuse Visual · Technical · Scope, or Designer · Developer for this page?
2. Contract schema: add `part` and a check id to each `dont` line? Additive, but a public BELLA API change. Without it, the part-to-rule mapping is hand-kept in CHIP (the mock does that).
3. Scenes: authored in BELLA (one story per rule), or generated from contract lines and kept in CHIP?
4. The three drifts above: fix the contracts now, or keep one as the stage moment?
5. Ask: keyword match over the contract (offline, exact), or headless Claude restricted to quoting lines?
6. What gets cut to fit the 3-day slice: drift chart, Figma embed, or part of Playground's plan?
