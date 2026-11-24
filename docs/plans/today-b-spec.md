# Today B · build spec (14 Nov 2026)

Status: draft, from measurements of the approved screen (CHIP Dashboard, Flow 180:2, drawn at half size, all numbers here at real size) and the two reviews of 14 Nov. The build reads this file; nothing is placed by eye.

Starts from: an instance of **CHIP / Screen** (CHIP Dashboard 333:14214), Chip theme. Title = "Today". Only the two slots are filled.

Rules that decide every gap (Gestalt, as numbers):
- Inside a group < between groups, by at least 1.5x.
- Same job, same size, gap, corner and type style.
- Every gap is a BELLA spacing token: 4, 8, 12, 16, 24, 32, 40.
- Floors: 44px targets, 16px text, line height 1.5, AAA (the main button colour is her call, open).

## Header extras slot

| Part | BELLA component | Settings | Approved | Change and why |
|---|---|---|---|---|
| 4 counts: Needs you, Gate, Ready, Claude | Stat, layout inline, Show icon on, tone per count | value + label, gap 40 between stats | icon discs 36, value Newsreader 26 | Gate shows what's in the gate ("1 of 5"), never 5/5 with an empty lane (review P0) |

No icon before the title (Elleta, 14 Nov: "i like the today without the icon in front").

## Content slot, top to bottom (gap 24)

| Part | BELLA component | Settings | Approved | Change and why |
|---|---|---|---|---|
| Views: Board, Table, List | Tabs + Tab | Board current | underline tabs, 28 apart | none |
| Toolbar | Button iconOnly (prev, next, refresh) + text + Select | date left, "Checked 10:29" + refresh + All projects right | 32px arrows, 14px text | arrows 44, text 16 (floors) |
| Brief | Card, tinted variant | title, one line max 65 characters, link "Why these?", 2 buttons, close | tinted #eef7fd, radius 20, pad 20/24 | **gap: tinted Card** (Chip theme). Buttons 44. Close 44. Lines capped at 65 characters |
| Board | 4 lanes, gap 24 | Needs you, Claude, Gate, Ready | 264 wide lanes | **gap: Board lane** |

## Board lane (gap: new BELLA component)

- Frame: radius 20, padding 16, gap 12, fill lane tint (Claude lane blue, others stone).
- Head: StatusDot (word + dot) + lane name 18 SemiBold + count Tag (**gap: Tag count variant**).
- One line under the head: what order the lane uses, 16, line height 24.
- Cards, gap 12. Empty space for a dropped card: dashed, one wording "Drop here to start", ink text (not blue: 2.8:1).
- Gate lane: progress bar (**gap: Gate bar**, 8 tall, 4 gap between segments, filled = checks done).

## Task card (gap: new BELLA component, from ListRow)

- Card on white, radius 14 → 16 (radius/card), padding 16 all sides (was 14/14/12/16, off the scale).
- Title 16 SemiBold; one line 16 Regular, muted; gap 4 between them (they are one group).
- Status row 12 below (a new group): StatusDot word left, one Button right, 44 tall (was 32).
- "Move to…" Button beside the action, so moving isn't drag only (WCAG 2.5.7).
- Drag handle top right, 44 target.
- Long names break at the slash.

## Gaps to build in BELLA (Chip theme first, then code)

1. Board lane
2. Task card (ListRow card variant)
3. Tinted Card (brief)
4. Stat icon disc tone
5. Tag count variant
6. Gate bar

## Open for Elleta

- Main button colour: today's blue (AA), lighter blue (AAA, my pick), or black pill.
- CHIP / Screen template: approved by Elleta 14 Nov.
