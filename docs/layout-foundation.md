# CHIP layout foundation

One source for each layout value, so every page is built the same way. Values and primitives live in BELLA (`feat/layout-foundation`: 594a139, 792613f); CHIP only places them. Measured before/after numbers: `docs/reference/layout-audit.md` (local).

## Why (audit, 3 Oct 2026, 1440 warm)

- No container: content ran 1856px wide at 1920. Four left edges (24, 32, 256, 313).
- Two title sizes, both display (76 and 44px); section headings at 20px and card headings at 14px, under BELLA's floors.
- Four section gaps (20 to 72px), five card gaps, two card implementations (BELLA Card and a local `.atlas-card`).
- Three page scroll containers (library, docs list, components table).
- A keycap as a page action on Atlas, ActionChips as the main action elsewhere.

## 1. App shell

- **The document scrolls.** No page-level scroll container. Allowed inner scrollers: code blocks, tables, the sidebar list.
- **Header:** sticky at the top, `padding-top: env(safe-area-inset-top)`. Its row uses the page container, so the wordmark's x is the content's x at every width. The app measures it into `--header-height`.
- **Sidebar:** the `SidebarLayout` aside, sticky under the header, its own max-height scroll.
- **OBI dock:** fixed to the bottom. The app sets `--dock-height` while it is open; the page pads its bottom by it and the sticky aside shortens by it.
- **Narrow:** when `SidebarLayout` stacks (its width under 768px; the viewport under 832px with 32px padding), the aside moves into the Menu drawer and the bar folds to Menu · CHIP · page · OBI.

## 2. Tokens (BELLA `layout.*`)

| Token | Value | Use |
|---|---|---|
| `layout.container.max` | 1440px | widest content; wider windows centre it |
| `layout.container.pad` | clamp(16px, 4vw, 32px) | side padding, header and page |
| `layout.section.space` | clamp(32px, 24px + 2vw, 48px) | page header to first section, section to section |
| `layout.stack.sm / md / lg` | 8 / 16 / 24px | inside a group / between items / between blocks |
| `layout.gutter` | 24px | every grid gap, card to card |
| `layout.card.padding` | 24px | the one card padding (Card reads it) |
| `layout.grid.columns-wide / -medium / -narrow` | 12 / 8 / 4 | ≥1200, ≥768, below (by the layout's own width) |
| `layout.measure.body` | 70ch | longest body line |

## 3. Type roles

| Role | Size | Weight | Where it comes from |
|---|---|---|---|
| Page title (h1) | 40px, every page, every width | 300 | `PageHeader` (`component.page-header.title.*`) |
| Section heading (h2) | 32px (BELLA's section floor) | 300 | `Section` (`component.section.heading.*`) |
| Card heading | 20px | 500 | BELLA title role (`font-size.xl`) |
| Body | 17px, ≤70ch | 400 | `font-size.body` |
| Meta | 14px, text-secondary | 400 | `font-size.sm` |
| Mono | 13px | 400 | tokens, code and hashes only |

Headings `text-wrap: balance`; paragraphs `text-wrap: pretty`. No display tier in the app.

## 4. BELLA primitives

- **PageHeader**: meta, title, lede, actions. The first block of every page.
- **Section**: h2, optional lede and actions, body. Its `id` is the "On this page" anchor and clears the sticky header.
- **SidebarLayout**: aside 3 + content 9, or aside 3 + content 6 + rail 3, on 12 columns; 8 columns from 768px (rail under the content); one column below.
- **Columns**: 2 or 3 equal columns, or 2:1 (`split="wide-start"`); 3 → 2 under 1200px, → 1 under 768px. Cells stretch, so a row lines up.
- **Card** for every card. No local card classes.

## 5. Actions (in BELLA's AGENTS.md)

At most one keycap (primary Button) per view, for the main action. Secondary actions: secondary Button. Small inline actions: ActionChip. Navigation: Link or NavList. Filters and toggles: FilterChip, SegmentedControl, Select. No locally styled buttons.

## 6. Page templates

| Type | Page | Layout | Blocks, in order |
|---|---|---|---|
| Overview | Health | SidebarLayout (aside: On this page) | PageHeader · Overview · Readiness map · Usage · Open failures · Components |
| Object page | Atlas component | SidebarLayout (aside: library) | PageHeader (category, actions) · Columns 2:1 [specimen + Explode, Facts] · Examples · Contract · What the gate caught |
| Library / reader | Docs | SidebarLayout (aside: search, filters, list; rail: About this doc) | PageHeader (doc title, Edit) · reader at 70ch. No doc: PageHeader "Docs" + empty-state Card |
| Settings / list | Connectors | container only | PageHeader · Section per kind (MCP servers, CLI tools) · one full-width Card row per item |

Object page: every section is always there. A missing piece is an empty state that says what to add ("No anatomy yet", "No contract yet"), and Explode is shown disabled with its reason.

## Migration (one page per commit, after the mock is approved)

1. Shell + tokens: sync BELLA, container in the header and main, `--header-height`, `--dock-height`, drop the page scrollers.
2. Health. 3. Atlas. 4. Docs. 5. Connectors. 6. queue/06 re-mocked on this foundation.

Each commit: measure (step 1 folds the layout audit's measurements into `npm run checkpoint`) and paste the numbers for that page (title px and x, section gaps, card gaps, scroll containers, dead areas), screens at 1440 and 390 in warm and dark, `npm run checkpoint`.
