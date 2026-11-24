# Visual changelog: concept lock (draft, 4 Nov)

Status: plan only. Nothing built. Waiting on Elleta's go.

## 1. Thesis

One dated page per change that a developer opens to answer "what did it look like, before and after, and what are the specs", without asking Elleta or digging in Figma.

## 2. Where it lives (pick one)

| | Figma library page per date | CHIP History + images + spec panel | Both: CHIP generates, pushes frames to Figma |
|---|---|---|---|
| Source of truth | Figma file (a second copy of git) | git + screenshot runs (already the truth) | git + screenshot runs; Figma is a mirror |
| Write twice? | Yes, unless every frame is pushed by a script | No | No, if the push is one-way and never edited by hand |
| Specs | Dev Mode works on real frames, not on screenshots; `html_to_figma` gives layers but they drift from code | Read straight from tokens, contract and diff, so exact | CHIP's numbers; Figma shows them as annotations |
| Devs find it without asking | Only if they have the file link and seat; she said they "can never find anything in Figma" | Only if CHIP runs: it's local, so devs need it running or a static export | Figma for people already in Figma; CHIP for the record |
| Upkeep | High: pages pile up, frames go stale | Low: History already rebuilds from git | Medium: push job + Figma auth + file hygiene |
| Ready for 24 Nov | No | Yes, on top of History | Risky: two pipelines |

Findability is the open problem in every column. CHIP is local; Figma is gated. The option devs find without asking is the one with a public or shared URL: a static export of CHIP History (for example a page on the site, or a GitHub Pages build of the same data). That is a fourth choice, not a fourth source.

## 3. One entry

- **Date and title**: from the commit or PR subject (History's `title`, `date`, `type`).
- **What changed**: History's `why` line, plus files and components already matched.
- **Images**: before and after at 1440, 1024 and 390, light and dark (warm and wee-dote where the change is theme-specific). A slider or side-by-side.
- **Spec panel** (dev-mode style, read-only):
  - tokens touched, with old → new value (from the diff of `tokens/*.json`)
  - sizes, spacing, type: computed styles of the changed element, read by Playwright at capture time
  - contrast: pairs from `contrast-pairs.mjs` for the touched tokens
  - component contract: props before → after from `tokens/component.json` / contract-parity
  - links: commit, PR, decision record, Storybook story

## 4. Pipeline (no manual upkeep)

1. **Trigger**: a commit in BELLA or CHIP, or a merged PR on the site. History already reads both gits, BELLA's changelog and decision records.
2. **Capture**: the `screenshotter` agent already shoots 1440/1024/390. Change one thing: it writes to one place, `docs/reference/screens/<YYYY-MM-DD>-<sha>/<route>-<width>-<theme>.png`, keyed by commit, in the main checkout, not the worktree. "Before" is the parent commit, captured from a temp worktree the way checks already run.
3. **Specs**: the same Playwright run dumps computed styles of the changed selectors to `spec.json` next to the images. Tokens, contrast and contract come from scripts that already run in the gate.
4. **Join**: `history.mjs` adds `images` and `spec` to a record when a folder for its sha exists. No new store.
5. **BELLA components**: `audit:visual` already holds 553 Storybook baselines. When a baseline image changes in a commit, its old and new PNG are the before/after for free.

## 5. What it could fold away

- Scattered screen folders: 871 PNGs across the main checkout and seven worktrees, plus the site's `_private/screens`. One dated, sha-keyed folder replaces them; worktree copies get deleted with the worktree.
- `decisions-while-away.md` (138 lines): its lines become History records with a "decided alone" type.
- Session reports and shared notes (`liam-report.md`, `inbox/done/`, side-session notes): the screenshot and "what changed" halves move to the entry; only "Needs Elleta" stays in the report.
- Dated session files in the site (`docs/session-*.md`): their visual half.
- Keep: BELLA `CHANGELOG.md` (it is the release contract and a History input), decision records, `docs/fixes/` (lessons, not changes), `docs/plans/`.

## 6. Smallest first slice (24 Nov)

- CHIP only, BELLA only, light theme, three widths.
- Before/after images from `audit:visual` baselines changed per commit, shown in the existing record sheet.
- Spec panel with tokens touched and contrast only.
- Waits: site entries, computed-style dump, contract diff, dark/warm/wee-dote, Figma push, static export, folding the docs.

## 6b. Review before merge: benchmark (11 Nov)

Elleta wants a review step like Figma's branch merge (before/after side by side, go through the list, approve one or all) without its annoyances, for bulk component changes and new designs. The changelog above is the record after; this is the gate before.

| Tool | List | Before/after | Approve | Impact shown | Top complaint |
|---|---|---|---|---|---|
| Figma branch review | By page, change tags | Side by side or overlay | Whole branch only | "Affected items", inside the branch only | Vague labels ("position, rotation or scale changed"; Henrique Gusso, Wise, Hatch talk); can't discard one change |
| GitHub PR | File tree | Images: 2-up, swipe, onion skin | Whole PR; per-file "viewed" | None for visuals | Big PRs hide files behind "Load diff" |
| Chromatic | Tests per build | 1-up, 2-up, diff overlay; keys 1/2/3 | Per snapshot (a/d), all, named reviewers | Only stories whose code changed | Flaky snapshots auto-ignored but still billed |
| Storybook visual tests | Marker on changed stories | Pixel diff | One story, one component, or all; carries to CI | Not documented | — |
| Percy | Groups identical changes | — | Per snapshot, group or build; "Request changes" | None | Review fatigue from false positives |
| Applitools | Groups similar differences | — | Accept a group, with exclusions | Maps a pixel diff to its DOM/CSS cause | — |
| zeroheight releases | Pages created/updated/deleted | Switch versions, no diff | Publishing is the act | Pages only | — |

**Take:** approve at three levels (item, group, all); group identical diffs so a token change across 40 components is one decision; keyboard triage; 2-up for layout, swipe for colour, onion skin for 2px shifts; approvals carry forward when the diff hasn't changed; link each diff to its cause (token, prop, line); "Request changes" separate from reject; a plain created/updated/deleted list for docs.

**Avoid:** labels that don't say which property changed or by how much; all-or-nothing merges with no per-item revert; impact shown only inside the branch instead of every screen that uses the component (CHIP knows usage from History and the contract); silently dropping flaky items; batches that hide items; comments lost on merge.

**CHIP's edge:** it already has the cause (token diff, contract diff, contrast pairs) and the usage, so each item can say "color.bg.danger 4.9:1 → 5.2:1, used on 12 screens" instead of "changed".

Sources: help.figma.com/hc/en-us/articles/5693123873687 · forum.figma.com (branch review revert request, affected items, layer-level conflicts) · docs.github.com non-code files · chromatic.com/docs/review · storybook.js.org/docs/writing-tests/visual-testing · browserstack.com/docs/percy (approval) · applitools.com/docs (group by similar diffs, root cause analysis) · zeroheight.com/help/article/releases. Reddit and HN had nothing; Lost Pixel and Supernova not covered.

## 7. Questions only Elleta can answer

1. Who are "the devs": people who can run CHIP locally, or people who only get a link?
2. Can a static export go public (`emcdanie/chip` is public), or does it need a private host?
3. Does the site's history belong in the same timeline as BELLA and CHIP, or its own?
4. Figma: is a mirror worth one more pipeline before the talk, or after?
5. Which docs may be deleted once folded, versus kept and linked?
6. One theme for the first slice, or all four from the start?
