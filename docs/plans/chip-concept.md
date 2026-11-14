# CHIP concept lock (approved, 7 Nov 2026)

Status: approved by Elleta on 7 Nov. Build starts at step 0, and she approves Today before anything else gets built. Supersedes sessions 4 to 7 of `bella-swap.md`.

## Thesis

CHIP opens on one list of what to do next in BELLA, and every item says why and offers the action.

## Format

Everything uses BELLA components and tokens on the `chip` theme, with her site's visual language: faint grid canvas, Newsreader titles, DM Sans body, Geist Mono for code and tokens.

Two page patterns only:

- **Work list** (Today, History, Projects, Health): page title, tabs with counts narrowing the list, then rows. Each row has one status marker with a word, a title, one line of why, and one action.
- **Doc page** (Components, Foundations): breadcrumb, title, a lead line, tabs with their own URLs, one idea per section, wide examples. Type steps from 40 to 32 to 24 to 16, so title, section, subsection and body never look alike. These come from BELLA's Heading tiers and type tokens, never literal sizes; if a step has no token, it goes on the BELLA list below.

Tables with several columns turn into stacked rows at narrow widths, with no sideways scroll for the main content.

Colour has a job: red for wrong or failing, green for passing, yellow for attention, blue for actions, always with a word or number beside it. Visual reference for tags, rows and density: the drawing board page (https://claude.ai/artifact/5328P5dH8TCmuRQFhcUp3L), which Elleta prefers to the first Today build. Numbered pins and dashed lines explain things in place, and replace explanatory paragraphs.

## Amended again 7 Nov, afternoon: strip back, then build per page (approved)

Approved by Elleta on 7 Nov ("you can do all of this stuff"), to run while she's out. She reviews the result, so each step is its own commit and can be undone.

This replaces the one-pass plan below. Elleta, her words: "we need to strip back simplfy and then buld what we need per page", and "the navigation on the entire site is too complex".

**Strip back first.** Remove what no page in this spec needs: stage modes (Inspect, Use, Dark, All at once, Play states), status badges that act as buttons, tabs on component pages, the Work panel button in the top bar, and explanatory lines. Every removal is its own commit, so each can come back.

**Navigation, four sections.** Today, Components, Foundations, Projects. Playground and History sit inside Projects (per project), and Health becomes the data-age line on Today plus a section at its foot. Find stays. Sessions, Terminal and Ask open from a single icon, not a labelled panel button. The left sidebar appears only in Components and Foundations. On this page stays as the small marker on the right.

**Component page = the BellaComponents Figma page card (node 113:173), rendered live.** One long page, section by section, each with a numbered rule line and count like the Figma:
1. Header: breadcrumb, name, one lead line, links to Storybook and source as text. Status is a plain tag, not a button.
2. In use: the component inside real CHIP screens, live and interactive. You hover and click the real thing, so no Use mode.
3. Specimens: Light and Dark side by side, tiers by states, from real renders. This replaces Dark, All at once and Play states.
4. Copy me: ready setups plus the matching JSX with one Copy.
5. Usage: hierarchy cards, then do and don't pairs with visuals, quoted from the contract.
6. Anatomy: numbered Pins and Leaders on the specimen, then a part, token and trigger table.
7. Accessibility: role, name and focus order; keyboard table; measured contrast table; screen reader; reduced motion.
8. Properties: the props table from the contract.
9. Source: Storybook, source and contract paths. Changelog and rule results sit here as one line each, with their detail one click away.

**Filters instead of tabs.** One row of FilterChips under the header ("All", then each section). Picking chips shows only those sections, so she doesn't have to scroll, and the URL keeps the choice. No tab hover states.

**Video.** Short recorded clips of hover, focus and press beside Specimens, made by script from the real component (Playwright, like the LinkedIn video), regenerated when the component changes. Proposed for after the page works, not in its first build.

**Tool chrome, after the Claude app's file viewer (Elleta's reference, 7 Nov).**
- Page-level tools are icon buttons grouped at the top right, each with a tooltip and an accessible name: view source, collapse, outline, and a "More" menu.
- The sidebar opens with one filter field ("Filter, or ? to search").
- A changed item shows a small dot or letter at the end of its row, not a badge.
- The reading area is calm: large serif headings, roomy body text, nothing else in the column.
- Icon buttons keep 44px targets and a visible focus ring.
- Work tools (Sessions, Terminal, Ask) live in a dark bottom drawer, so they read as separate from the light page. The drawer can be expanded, and it closes with Esc.
- One view switch per page where it applies, as an icon pair: rendered (eye) or source (code). Component pages use it for the contract and guidance files.
- Code reads like an editor: syntax highlighting, line numbers, the current line marked, wrapped long lines and a Copy icon. Used for Copy me, contracts, guidance files and diffs. It's a BELLA CodeBlock component. Highlighting is done by a library that emits classes, such as Prism or lowlight, not inline colours. Each syntax colour is a BELLA token for light and dark, contrast-checked against the code background at 4.5:1.
- "On this page" is drawn as stacked short lines at the left or right edge, one per section, with the current one in blue; it opens a list on click. A More menu holds page settings as checked items with keyboard shortcuts.

**Doc quality check, adapted from her earlier doc audit.** Same four parts, run on CHIP's own data:
- **Coverage:** which of the 9 sections each component page fills, from real data, with "Not measured" where nothing exists.
- **Orphans:** docs with no component, and components with no docs.
- **Drift:** what the page says against the contract and the render.
- **Consistency:** across pages, then the top fixes.
It runs as a script, and its results feed Today's rows. No client content comes over, only the method.

**Build order, one page at a time, each approved before the next:** strip back, then navigation, then Button's component page, then the other components through the same template, then Today's finish, Foundations and Projects.

## Amended 7 Nov: one pass, ZeroHeight shell (superseded)

Elleta asked for the whole app in one pass, following the drawing board's rules, instead of screen by screen. She reviews the finished pass. Steps 1 to 8 below become the scope of that pass, and step 2's one-fix-at-a-time review is part of it.

**Shell, copied from ZeroHeight in CHIP's styles:**
- Top bar: CHIP wordmark, the sections (Today, Components, Foundations, Playground, Projects, History, Health), Find, Work. The current section is marked.
- Left sidebar: only the current section's items. Examples: Components grouped by kind, Foundations topics, Projects by name. Today and Health need no sidebar, so the content takes the width.
- Right: an "On this page" outline of the page's sections, collapsed to a small marker, that shows where you are as you scroll and opens a list to jump. Only on pages with three or more sections.
- The Work panel opens over the right side when asked, and stays closed by default.
- Each tab and section has its own URL.

**Page rules (from the drawing board):**
1. Title in Newsreader at 40, an optional one-sentence lead line in muted text, then content. No page head over about 200px.
2. Section 32, subsection 24, body 16. Never two levels in the same style.
3. Body text no wider than about 66 characters. Tables and examples may run wider.
4. Every list item: one tag, a title leading with the count and object, one line of why, a source in Geist Mono after "Rule:", and one action named by its verb and count.
5. Tags: Geist Mono 16px, soft wash, dark text of the same hue, no border, one style everywhere.
6. One primary action per view, in blue. The rest are secondary or plain links.
7. No explanatory paragraphs about the interface: a lead line, a pin or nothing.
8. No card inside a card. Content surfaces have 2px corners on the grid canvas.
9. Data age and "Not measured" sit on one quiet line, never in a banner.
10. Tables: semibold header, row rules, tabular numbers, and stacked rows at narrow widths.
11. Tabs carry counts where they filter something.
12. Cut anything that repeats something shown elsewhere; link to it instead.
13. Few buttons (Elleta, 7 Nov: "there are too many buttons"). A view shows at most one filled button and two outlined ones. Row actions are text links with an arrow ("Review 8 →"). Everything else goes into one "More" menu or leaves the page. Target: 8 or fewer controls in the content column on load, as on the doc sites (4 to 9 on 7 of 8). Tabs and the sidebar don't count.

**Open calls, updated:** stage modes go to Inspect only; Use, Dark and All at once move into the "More" menu.

**Open calls, defaulted:** Rules and Behind it move into their own tab on component pages, not cut. Stage modes stay as they are. Elleta can change either at review.

## Spine, in build order

0. **Prerequisites.** BELLA's gate passes on the commit CHIP uses, or Accept can't land anything. Done means `npm run gate` is green on a fixed commit that includes the `chip` theme. Her BELLA additions below land on it.
1. **Today** replaces Overview and Needs you, merging the two lists. Tabs: Needs you, Ready to review, Running. One line gives data age and anything "Not measured". Designed empty state. This is the first screen she checks.
2. **Review a fix** replaces the Review sheet. One fix per view, with next and previous. What changes, why (rule and source), before and after with the divider, Accept or Undo. Evidence stays collapsed. Progress and failure show here until the fix lands.
3. **Components** becomes a doc page with tabs: Overview (live example first), Usage, Accessibility, Code, Changelog.
4. **Foundations** keeps its content, because she approved it, and takes the doc pattern.
5. **Playground** stays, with Projects reachable from it.
6. **Projects** becomes a work list with a grouped comparison table for what is set up per project.
7. **History** becomes a filtered list of changes, one row each, with no sideways timeline.
8. **Health** replaces Connectors and takes Coverage, Gate and Drift from Overview. Connectors become the same grouped table.

The Work panel stays for Sessions, Terminal and Ask, closed by default so pages get the full width.

## Cut

Overview: This week; the empty Checks table; By component (a third list of the same gaps).
Component page: Parts (repeats the stage annotations); Ask Button (third question box).
History: Written down cards.
Connectors: System map (repeats the table, and "Not measured" reads as unhealthy).
Projects: Setup as it stands; What we're working on (asks her to type); Recent branches and commits (repeats History).
Work: relay lanes showing weeks-old states as current.

## Her calls

Decided 7 Nov:

- Fonts and type scale: `chip` theme only. BELLA's default stays Figtree and Geist.
- Corners: keep 2px for what holds content; round for what you click. This overrides the soft cards in the format above, so depth comes from type and colour.
- Main button: blue, and success tags are green (her later call on 7 Nov, replacing "ink, and blue means passing"). The label on the blue is ink at 5.29:1, so AA, not AAA.
- Pins, pop colours, grid canvas and list row: add to BELLA.

Still open, decided when their screen comes up:

- Rules on real compositions and Behind it on component pages: keep, move into a tab, or cut.
- Whether Components needs the Inspect, Use, Dark and All at once stage modes.

## Needed in BELLA first

Colour tokens for the site's yellow, pink, blue and red pins, which are raw hex in the site today, checked for contrast. Pin and leader-line components, now site-only. A list row pattern. The grid canvas. Fonts and type scale, the biggest item: checked 7 Nov, BELLA's `main` and `chip/theme` ship Figtree, Geist, Geist Mono and Unique, with body at 20px and display sizes from 34px. Newsreader and DM Sans exist only as uncommitted work in `~/DEV/bella`. The hero's look and the 40, 32, 24, 16 scale can't be built from committed BELLA until this lands, as a change to BELLA itself or a `chip` theme. Her call. Also confirmed missing from `main`: pins, a grid canvas token, a list row. Today can build on NavList, Tabs, StatusPill, Button, DataTable and Drawer. Known gaps from `bella-swap.md`: `aria-expanded` and `aria-pressed` on Button, Checkbox, unlabelled search Input. These need her word, per `bella-swap.md`.

## Kept from earlier work

Session 1's theme colours and token aliases, with corners changed to her call. Session 2 (status, tabs and filters on real BELLA components) still applies. Session 3's Accept and Send fixes move into steps 1 and 2. Layout fixes may be replaced as pages change. Accept stays blocked if BELLA's gate fails, so that gets fixed first.

**From the Claude app benchmark (7 Nov), in this build:**
- Each Today row that carries a change shows its size, as in "+12 −1", before it's opened.
- Review a fix groups findings by file, with "Fix this one" and "Apply all" beside Accept and Undo.
- A drawer or pane appears only when it has real content; there are no empty panes.
- When the window narrows, toolbar buttons fold into the More menu.
- A running fix shows its steps, checked or pending, and its output files in the drawer, the way Cowork shows progress.
Not copied: dimming the unfocused pane, which breaks the house rule of highlighting rather than dimming.

## Next, after this build

- Suggested-task card on Today ("Start" or "Do it here"), so an audit finding can become a session.
- A system notification only when a fix waits for Accept.
- A shortcut sheet on Cmd+/.

- Line comments, after the Claude app's file viewer (Elleta's reference, 7 Nov): click a line of a contract, guidance file or diff and add a comment. The comment becomes a Today row and goes to the session or fix it belongs to. This is the "hand off" job, which has no screen today.

## Out of scope for now

Figma generation, which does not change these screens. The agent benchmark, which tests BELLA and not CHIP. New features such as Jira, ZeroHeight sync, decision records and hand-off screens. Keyboard-driven triage. Dark theme, until the light screens are approved.

## Success measures

- Fixes that land after Accept, and failures she can read: not measured today, start counting at step 2.
- Words on load: one fix under 300, against 2,090 for the Review sheet at 16 fixes. Targets are my guess.
- BELLA share of rendered controls: 55 of 761 on 6 Nov. Re-measure after each step.
- Review rounds per screen, counted per session.

## Verify

Each step gets screenshots at 360, 390, 768, 1024 and 1440, all viewed, plus measured checks of the type floor, target floor, focus ring and overflow, a keyboard pass, and a list of what was not checked. Elleta approves Today before anything else is built. Nothing merges or pushes without her word.
