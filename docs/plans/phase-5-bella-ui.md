# Phase 5: CHIP UI on BELLA

Target: `docs/reference/workspace-concept.html`, layout and behaviour only. Its clay and Fraunces colours and type are ignored. No code changes until Elleta approves this plan.

## Stack

- `app/`: React 19 + Vite. BELLA already runs React 19 and Vite 8, so the versions match.
- BELLA's `package.json` exports only `tokens/`. A `file:` dependency would bring the tokens but not the components. Use Vite aliases instead:
  - `@bella/components` points to `../bella/src/components`.
  - `@bella/tokens.css` points to `../bella/tokens/bella.css`.
  - Set `resolve.dedupe: ['react', 'react-dom']` so the app never loads two Reacts.
  - CSS modules work as they are.
- Nothing is copied. Gate: a grep in `app/` fails on any hex value or `rgb(` literal.
- Dev: Vite on 5173 proxies `/api` to the CHIP server on 127.0.0.1:3000. Build: the server serves `app/dist`.

## Mock to BELLA map

| Mock part | BELLA | Notes |
|---|---|---|
| Workspace tab bar | MISSING `Tabs` | Also used for the terminal tabs |
| Brandmark | `BrandWordmark` (`word="CHIP"`) | |
| Search + ⌘K | `Input` + `Icon` + MISSING `Kbd` | Searches the local index |
| Model pill | `StatusPill` | Shows the real model, e.g. `qwen3:8b`, not "Opus" |
| Avatar | `Avatar` | |
| Sidebar groups, collapse | MISSING `NavList` | Collapse button: `Button` (icon shape) + `Icon` |
| Badges in nav | `Tag` | |
| Eyebrow, title, sub | `Eyebrow`, `Heading`, `SectionHeader` | |
| Glass panel | `Card` | No glass: flat surface tokens |
| KPI row | MISSING `Stat` | Real numbers: components, failures, indexed chunks, last sync. The voice-pipeline counts are dropped (no such pipeline) |
| Readiness map + legend | MISSING `ScoreStrip` | Fed by `bella.json` stations |
| Outputs table | MISSING `DataTable` | `Tag` for type, `Button` for Open. Rows: failures and recent syncs, not Claude outputs |
| Ask compose | `Input multiline` + `FilterChip` (source scopes) + `Button` | Voice capture dropped. Answer: `Card` + `Link` sources |
| Terminal pane | MISSING `Terminal` | Behind `Tabs` |
| Mode bar, hint toast, "+" workspace | dropped | These are Claude-app ideas with no CHIP job |

## MISSING components

All of these get built in BELLA on `feat/chip-components`, each with a story, contract entry and contrast pairs.

- **Tabs**
  - Props: `tabs[{id,label,status?}]`, `value`, `onChange`, `label`, `closable?`.
  - States: active, idle, hover, focus, disabled.
  - A11y: `tablist`/`tab`/`tabpanel`, `aria-selected`, arrow keys with roving tabindex, Home/End.
- **Kbd**
  - Props: `keys[]`.
  - States: static only.
  - A11y: `<kbd>`; decorative copies are `aria-hidden`.
- **NavList**
  - Props: `groups[{label?,items[{href,label,icon?,badge?,current?}]}]`, `collapsed`, `onToggle`.
  - States: current, hover, focus, collapsed (icons only, label as tooltip).
  - A11y: `<nav aria-label>`, `aria-current="page"`, toggle `aria-expanded`.
- **Stat**
  - Props: `label`, `value`, `delta?`, `tone?`.
  - States: neutral, up, down, loading.
  - A11y: `<dl>` pairs; the delta is not conveyed by colour alone (arrow plus text); tabular nums, right-aligned.
- **ScoreStrip**
  - Props: `name`, `kind`, `score`, `cells[{label,value}]`, `bands`.
  - States: strong, mid, low, self-assessed (null).
  - A11y: each cell reads as "A11y 98 of 100"; the band is in text as well as fill; the legend is a real list.
- **DataTable**
  - Props: `columns[{key,label,numeric?,sortable?}]`, `rows`, `caption`.
  - States: empty, loading, sorted asc/desc.
  - A11y: `<caption>`, `scope="col"`, `aria-sort`, numeric columns right-aligned and tabular.
- **Terminal**
  - Props: `lines[{text,tone}]`, `onRun`, `commands`, `busy`.
  - States: idle, running, error, unknown command.
  - A11y: output is `role="log"` with `aria-live="polite"`; the input is labelled; tone is never colour alone (a ✓/⚠/✗ prefix).

### BELLA branch order

BELLA is on `feat/brand-ochre`, 19 commits ahead of main.

- Merge it first, then branch `feat/chip-components` from main. This gives a clean base and the new components get ochre tokens from day one.
- The alternative is branching off `feat/brand-ochre`. That starts sooner, but the two branches must then merge in order and the chip PR diff carries the ochre work.

## Terminal

Only the four chip commands, never a shell.

- Move the command bodies from `bin/chip.mjs` into `server/lib/commands.mjs`. The CLI and the server share them.
- Add `POST /cmd {cmd, args}`. `cmd` must be one of ask, sync, audit or status, or the server returns 400. It runs no `exec` or `spawn` of user text, and streams NDJSON like `/ask`.
- The server already binds 127.0.0.1. Add a Host/Origin check (localhost only) against DNS rebinding.
- Today `chip ask` runs in-process and does not go through the server. The UI will go through the server. Change the CLI to match only if wanted.

## Themes

- **Today:** `tokens/build.py` reads `semantic/light.json` and `semantic/dark.json` and emits light on `:root` and dark on `[data-theme="dark"]`. Components read semantic vars only, so they flip without changes. Fixed-context tokens (text on dark, focus ring) never flip.
- **CHIP:** sets `data-theme` on `<html>`, defaults to `prefers-color-scheme`, and uses no primitive or component-tier tokens directly.
- **A third theme:**
  - Add `semantic/<name>.json` with the same keys.
  - Make `build.py` loop over the files in `semantic/` and emit `[data-theme="<name>"]` for each. Today it hardcodes two loads.
  - Make `contrast-pairs.mjs` check every mode.
  - The components need no change.

## Old bridge spaces

| Space | Verdict |
|---|---|
| Research library | Carries over. Built from indexed docs and Notion with `ResourceCard`; it is real local data. |
| Friction log | Carries over only with a real local source, e.g. a `data/friction.md` CHIP reads and appends to. The current entries are synthetic. |
| Coming up | Goes. It needs mail, Slack and calendar, which breaks "nothing leaves your machine". |
| Proposals/approval, Settings, Shortcuts | Go. Shortcuts become one `Kbd` legend in the help menu. |

## Steps and rough effort

| Step | Effort (guess) |
|---|---|
| 1. BELLA branch decision, then merge `feat/brand-ochre` | 0.5 h |
| 2. Seven components in BELLA (stories, contract, contrast) | 2 to 3 days |
| 3. `app/` scaffold: Vite, aliases, dedupe, theme switch, no-hex grep | 0.5 day |
| 4. `commands.mjs` + `/cmd` + Origin check | 0.5 day |
| 5. Shell layout: tabs, nav, centre, terminal, collapse, ⌘K, ⌥1/⌥2 | 1 day |
| 6. Health view: Stat, ScoreStrip, DataTable from `bella.json` | 1 day |
| 7. Ask view, streaming, and the Research library | 1 day |
| 8. A11y and both-theme pass, speed check, docs update | 0.5 day |
