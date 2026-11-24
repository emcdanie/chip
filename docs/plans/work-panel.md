# Work panel: one place to talk to Claude, OBI and a shell

Status: concept, waiting for Elleta's go. Mock: `ctrl-alt-design/docs/reference/inbox/chip-workpanel-01.html` (:3121). Read from `claude/mock-shell-26b6e6`.

## What exists today, and the overlap

| Place | What it really does |
|---|---|
| **The Bar** (`TheBar.jsx`) | *Needs you*: `GET /needs` every 15 s (failing checks, fix branches, git state, fresh lane questions), ranked by risk. *Lanes*: `GET /bar/state` every 10 s. A lane is a pair of Markdown files (`next.md` / `report.md`) in an inbox; CHIP parses each report's "Needs Elleta" list. Clicking a lane only expands those lines. Lanes also lists two fake rows, "Claude" and "Terminal", which open the work sheet. The input "Ask or tell a session…" calls `onAsk` → `obi.send`. **It only asks OBI. No lane or Claude session receives it.** Talk is disabled. |
| **Work sheet** (`Sheet` in `App.jsx`, ⌘J, top-bar Terminal button) | A modal sheet, 880px max, on the right. *OBI*: answers BELLA questions from `bella.json` or retrieval plus a model (`ask.mjs`). *Claude*: a login shell in a pty with `claude` typed for you (`term.mjs`). *Terminal*: the same shell without `claude`. Both have the CHIP/BELLA/Site folder picker. |
| **Top-bar ask box** (`OneInput`) | The same input element as OBI's. It moves between the top bar and the sheet. It jumps to components, runs `/commands` and asks OBI. |

The overlap:

- Three ways in reach OBI: the top bar, the Bar's input and ⌘J.
- Claude and Terminal are the same pty. The only difference is one typed word.
- "Lanes" looks like live sessions, but it is a file reader. So the answer to "is the Bar the terminal?" is no. Nothing in the Bar can reach a session.

Why the terminal looks short (from the CSS, not checked in a browser): `.term-view` uses `grid-template-rows: auto auto 1fr`. When no command was typed for her, the screen falls into the second, `auto` row, so it only takes its content height. Separately, `.work-sheet .obi` has three rows, and a second mounted terminal can land in the last `auto` row.

## The merged model: one Work panel, four tabs

Each tab carries a one-line statement of what it is, shown under the tabs.

1. **Needs you**: decisions. Unchanged from the Bar.
2. **Sessions**: running work, in two groups.
   - *Lanes · read from report files*: "CHIP reads these; it can't message them." "Reply in a terminal" opens a shell in the lane's repo.
   - *On this machine · live*: open terminals. Click one to go to it.
3. **Terminal**: real shells. Claude is a shell with `claude` started ("New Claude" or "New shell", plus a folder picker). Several can stay open, shown as session chips. The terminal fills whatever space the panel has.
4. **Ask OBI**: the OBI thread and the model picker. "OBI answers from BELLA's docs and data. It can't run commands."

There is **one input**, at the bottom of the panel, and it always says where it sends:

- On Terminal it reads "Types into claude · CHIP" and its button says **Type**. Text lands at the prompt and doesn't run.
- On every other tab it reads "Asks OBI" and its button says **Ask**. Asking switches to the OBI tab.

## Docking and resizing

- A **Right / Bottom** kit segmented control sits in the panel head.
- Right: 360–760px, default 440px. Bottom: 280px to 70% of the window, default 360px. It never covers content: the page shrinks to make room.
- Bottom runs the full window width, edge to edge. The left nav ends above it, and its bottom edge moves with the panel's height. If the nav gets short, its items scroll.
- Drag the inner edge to resize. The edge is a focusable separator: arrows move it 16px, Home and End jump to the limits, and a double-click resets it.
- Dock, size, tab and open/closed state are remembered in `localStorage` (`chip-work`). ⌘J toggles the panel.
- At the bottom, Needs you and Sessions flow into columns.

## Voice

The mic uses the Web Speech API. It is real in the mock.

- **Supported, on device**: Chrome with `SpeechRecognition.available({processLocally: true})` returns `available`. The mic is labelled "On device", and no audio leaves the Mac.
- **Downloadable**: the first press installs the language pack, then it works as on device.
- **Cloud only**: the API exists but not locally (older Chrome, Safari). It works, labelled "Browser speech service: audio leaves this Mac".
- **None** (Firefox, and some embedded browsers): the mic is disabled with the reason, plus "macOS Dictation works in any field: press Fn twice."

The states are idle, listening (pink fill, live words in the field, Esc or a click stops it), stopped ("Check the words, then Ask") and error (blocked, heard nothing, service down). Speech never sends on its own.

## What's cut

- **The work sheet.** The panel replaces the modal, so there is no more overlay over the page.
- **The separate Claude tab.** It becomes "New Claude" inside Terminal, because it is the same pty.
- **The fake Claude and Terminal rows in Lanes.** They become real "On this machine" rows.
- **The top-bar Terminal button and The Bar toggle.** They become one **Work** toggle with the needs count.
- **The top-bar ask box.** It becomes "Find" (⌘K, jump only), and asking moves into the panel. See question 2.
- **"Tell a session".** The label promised something nothing did, so it is gone until question 1 is answered.

## Smallest build slice

1. Build a `WorkPanel` that replaces `Sheet` and `TheBar` in `App.jsx`. It reuses `NeedsList`, `Lanes` (minus the fake rows), `ObiPanel`'s thread and `TermView`. Dock, resize and memory are new. The fix for the `.term-view` row comes for free.
2. Fold the top bar's two toggles into one Work toggle.
3. Add the voice mic to the one input.
4. Add multiple terminal sessions.

Steps 1 and 2 are one PR. Steps 3 and 4 each get their own.

## Questions only Elleta can answer

1. **Tell a lane.** Should Sessions be able to write a lane's `next.md` (the relay you use by hand today), or stay read-only?
2. **Top-bar box.** Keep it as Find (⌘K, jump only), or cut it and let the panel's input jump too?
3. **Terminal input.** Should the panel input type without running (safe, one extra Return), or send with Return for Claude only?
4. **Cloud speech.** Allow the browser's speech service where on-device isn't available, or on device only?
5. **Default dock** for the talk on 24 Nov: right or bottom?
