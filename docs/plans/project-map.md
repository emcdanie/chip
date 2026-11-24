# Project map: concept lock (draft, 4 Nov)

Status: concept and mock only. Nothing built. Waiting on Elleta's go.
Mocks: `chip-projectmap-01.html` (first round) and `chip-projectmap-02.html` (refined: page time travel, captures as the hero), both in `ctrl-alt-design/docs/reference/inbox/` on :3121. Real data from `ctrl-alt-design` @ 094a309, gathered 4 Nov.

## 1. Thesis

The System map, pointed at a project instead of at BELLA's pipeline. Every page of the site is a card showing its capture on that date, every link in the source is a line, and one date drives everything: drag the scrubber or step back through one page's captures, and the whole map goes back with it. It is the way in to the visual changelog and the Playground, not a third tool.

## 1b. Two views of the same data

One switch in the toolbar, **Map | History**, over the same pages, dates and captures.

| | Map | History |
|---|---|---|
| Question | How do the pages connect? | What did this page look like, and can I get it back? |
| Layout | Grouped page cards with today's capture, links, flows | A rail of this page's captures (newest first), the captures receding in depth with the chosen one in front, a detail panel |
| Per capture | – | Date, the commit that made it, its PR, how many more since the previous capture |
| Compare | Before / after in the sheet (previous capture) | **Compare with latest**: the chosen capture against the newest, with a wipe handle |
| Moves between | Clicking a page card opens it in History | **Show on map** goes back with that card selected and centred |

The scrubber is shared: stepping back in History moves the map's date too.

**Restore** (History only) never edits the site. It opens a confirm step that shows the files and components the restore would change (commits after that capture, intersected with the page's import closure), the commits it would undo, and how it is undone (one PR; close or revert it). Confirming drafts a brief to `data/playground/briefs/restore-<page>-<date>.md` and types it into the site's terminal, the same hand-off as the Playground. The site's Claude then branches, plans, stops for Elleta's go and waits for `OK #n`. Restoring a shared component would change other pages too, so the brief tells Claude to list them and stop first.

## 2. Nodes and edges

| | What it is | Where it comes from |
|---|---|---|
| **Page** | A route: 14 under `app/` plus the 4 case studies (`/case-studies/[slug]`, titles only) | `app/**/page.tsx`, `content/case-studies/*.ts` |
| **Flow** | An ordered walk along real edges: "Find a case", "Search the work", "System to proof", "Get in touch" | Authored as a list of page ids; each step must be an existing edge or it fails |
| **Component** | A site component used on 3+ pages (17 today: `Section`, `Heading`, `Button`, `CaseRow` …). A second layer, off by default | Imports, two levels deep from each page |
| **Edge: link** | A route string in a page's source (`href="/work"`, `href: "/case-studies/chip"`) | Grep of the page's import closure |
| **Edge: nav** | Overlay nav and footer links. Shown by grouping ("In the nav", "Footer", "Unlisted"), not as lines, or every card would link to every other | `OverlayNav.tsx`, `SiteFooter.tsx` |
| **Edge: uses** | Page → shared component. Drawn only for the selected card | Imports |

## 3. Selecting a node

- **Going back on a page (the hero):** that page's captures as a stack, the current one in front and older ones receding behind it. Older / Newer (or `[` `]`, or a dated thumb in the strip below) steps through them, and each step moves the whole map to that capture's day.
- **What changed:** under the stack, the commit that made the capture (the newest commit to the page on or before its day) and how many more landed since the previous capture.
- **Before / after:** the previous capture under the current one, with a handle to wipe between them.
- **Facts:** one muted line: started, commits, last change, commits in the window.
- **Folded below** (one line each until opened): changes, BELLA checks (opens itself when one fails), components, links in and out.
- **BELLA checks:** hex values and px font sizes in the page's source, as pass or fail chips. Today: Theming case 12 hex + 32 px, CHIP case 37 px, Search screens 84 px.
- Every component and link is a chip that jumps to that card.
- **One way in:** flagged when a page outside the nav has a single inbound link. Real today: `/contact` is linked only from `/quick`, which is in neither nav nor footer.
- **Actions:** Open in Playground (primary), Open in changelog. A component card opens its component docs instead.

## 4. Search and time

- **One toolbar:** search, Play, the date, the scrubber and the changed-in window sit in one bar above the map (one row from 1680px, two below).
- **Search** (`/` to focus) runs over pages, components, files and commit subjects. Every page a result touches gets a dashed ring outside the card: highlight, never dim. Selected is separate and single: a blue border, lifted. Picking a file lights every page that imports it; picking a commit also moves the scrubber to its date.
- **Scrubber:** a range over 18 Mar → today with commits a week drawn behind it, PR merges as dots and screenshot days as pink ticks. Cards not yet made turn into dashed outlines with "From 16 Jul". Play runs the history forward.
- **Changed in the last 7 / 30 / 90 days:** cards changed in that window, counted back from the scrubber, get a commit count on the capture. Rule breaks are a red edge on the card's name.
- **Links read one way at a time:** only the selected card's links are drawn (blue flowing for links out, ink for links in), a flow's steps in thick ink, and "All links" adds the rest faintly.
- Honest limit: links are today's links. A map that rewires as you scrub needs the link grep run per commit (cheap, cached by sha), which waits.

## 5. "Three-dimensional": what it could mean

| | Real 3D (WebGL, three.js) | Depth through layers, zoom and time (the mock) |
|---|---|---|
| On stage | Strongest wow: orbit, fly through | Calmer; the moment is Play running the site's history forward |
| Reading | Text on a tilted plane blurs below the 14px floor; labels need billboards | Flat cards, BELLA type, nothing tilted that you read |
| Access | Keyboard and screen reader are a project of their own | Cards are buttons, scrubber is a range input, search is a combobox |
| Build | New dependency, no BELLA components, 4+ days | Reuses SystemMap canvas, pan, zoom, sheet: about 2.5 days |
| Where depth lives | Space | Layers (pages → components), zoom, time (the scrubber), and one 2.5D touch: a page's captures stacked, receding behind the current one |

A middle option: real 3D only for one view, "time as depth" (captures of one page in a tunnel), and the map itself stays flat.

## 6. Data, all generated

- **Routes:** `app/**/page.tsx` + `getAllSlugs()`.
- **Imports and components:** parse `import` lines, two levels deep; components used by 3+ pages become shared.
- **Links:** route strings in each page's import closure.
- **Git:** `git log -- <closure>` per page gives dates, subjects, shas; merges give PR numbers.
- **Captures:** today matched by filename from the inbox `screens/` (2,739 PNGs, ~70 match a page, all 3–15 Oct). Tomorrow from the visual changelog's sha-keyed folders, so the stack fills itself. Cards and thumbs need small crops (the mock embeds 352×208 JPEGs, 708 KB for all); full captures load only in the sheet.
- The mock's gather script is about 150 lines of Node; it becomes a CHIP endpoint (`GET /project?repo=…`), cached by HEAD sha. Nothing is written by hand.

## 7. How it relates to the other plans

- **Visual changelog:** the changelog is the record of each change; the map is its index by page. The stack in a page's sheet is the changelog filtered to that page. Both read the same sha-keyed captures, so no second store.
- **Playground:** the map is where you choose what to load. "Open in Playground" passes the route; the Playground already loads a live site page through its proxy.
- **Component docs:** a component card opens its docs page; the docs page's "used on" list is the same data as the card's edges.
- **System map:** same canvas, cards, pan and zoom, sheet. The project map is a second data source for that component, not new chrome.

## 8. Smallest slice before 24 Nov, and what waits

- **Slice (about 2.5 days):** `GET /project` for `ctrl-alt-design`; a Map view reusing SystemMap's canvas with page nodes and link edges; the sheet with facts, last changes, components, links, BELLA checks and Open in Playground; search over pages, components, files, commits; the scrubber with appearing nodes and the changed-in-window mark. Captures from today's inbox by filename.
- **History view and Restore:** about 1.5 more days on top of the slice (the rail and depth stage reuse the sheet's stack; Restore reuses the Playground's brief hand-off).
- **Waits:** the component layer's reflow, flows (authoring and checks), links per commit, captures from the changelog pipeline, a second repo (BELLA or CHIP itself), any real 3D.
- Phase 6 has no slack (see `playground.md` 6), so this replaces something.

## 9. Questions only Elleta can answer

1. Is the project map in the 24 Nov demo, and if so what does it replace?
2. "Three-dimensional": flat map with depth through time, real 3D for one view, or real 3D throughout?
3. Which flows matter, and for whom (hiring manager, design-system lead)? Or should flows come from analytics later?
4. `/contact` is only linked from `/quick`. Intended, or a fix for the site?
5. Do BELLA's "no hex, no px font size" rules apply to the site's case-study figures, or are figures exempt?
6. Visual history: backfill old commits by shooting them (slow, once) or only capture forward from now?
7. Where it lives in CHIP: its own nav item, or a second tab beside the System map?
8. Map card click: open History straight away (mock 02 does this), or select first and open History from the sheet? Straight away costs link exploration a round trip.
9. Restore of a shared component: allowed with a warning, or out of scope for a page restore?
