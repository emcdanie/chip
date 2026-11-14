# CHIP reads Figma through the Desktop Bridge

Status: proposed 8 Nov, waiting for Elleta's go.

## Why

Every Figma number in CHIP says "Not measured". CHIP has two read paths and neither works today:

- **figma-rest** has the file key in `server/.env` but no access token, so it is "Not set up".
- **figma** (Figma's own desktop MCP) reads whatever file is open in Figma, which can be a client file. Client files must never be read by an agent, so this path is unsafe as a default.

The Desktop Bridge (`figma-console`) is already configured in `chip.config.local.json` and was connected on 8 Nov to four of Elleta's own files: BellaComponents, Foundations, BELLA Docs Kit and the CHIP file. It can target one file by key, whatever file is in front. A read by hand through it on 8 Nov gave real numbers: 27 of 37 components have a Figma set, Button's 30 variants match the contract, and 68 of 71 colour roles match.

## What changes

1. **Read path order** in `server/lib/spec-lint.mjs`: REST when it has a token, then the Desktop Bridge, then nothing. The desktop `figma` MCP is used only when Elleta turns it on in Connectors. It is never a silent fallback.
2. **Pin the file by key.** Every Bridge read names its file: `FIGMA_FILE_KEY` (BellaComponents) for components, and a new `FIGMA_FOUNDATIONS_KEY` for variables. If that file isn't connected, CHIP says "Open the Desktop Bridge in BellaComponents" and shows no number. It never reads whichever file happens to be active.
3. **Allow only files CHIP knows.** A list of allowed file keys goes in `chip.config.local.json`, not committed. A call for any other key is refused in `server/host/guard.js`, before it reaches Figma.
4. **Reads stay reads.** `figma_execute` runs plugin code, so the guard treats it as a write. *(Changed while building, 8 Nov: it is the only Bridge call that can pin a file by key, so CHIP runs it without a Confirm only for two scripts fixed in `server/host/fixed-reads.js`, matched exactly, on the two file keys in `server/.env`. Logged in decisions-while-away.)* It uses the Bridge's read tools: list open files, components, variables. Any tool whose name doesn't start with get, list, read or browse goes on `readTools` by name only after checking that it can't change the file. Write stays off for this server.
5. **One snapshot, many readers.** A new `data/checks/figma.json` is written by a "Figma matches the code" check in `server/lib/checks.mjs`. It holds the components matched, variant counts against the contract, variable names against code roles, the time and the file it was read from. Today's meta line, Coverage's Figma bar, Drift, Components' "No Figma set" filter, Foundations' Figma column and the Button page all read that file. None of them call Figma on page load.
6. **When it runs:** on Check again, and on its own once a day if the Bridge is connected. If the Bridge is closed, the last snapshot stays and shows its age ("read 8 Nov, 14:02"), never "Not measured" when an older reading exists.
7. **Name matching:** components match by name. Pairs that differ by name are listed in the snapshot, for example Columns → Grid and SidebarLayout → Sidebar if Elleta confirms them. Unmatched ones show as "No Figma set", not as failures.

## Second review (Copilot, 8 Nov): 7 findings, all real, plan changed

1. **CHIP may not reach the Bridge.** CHIP starts its own `figma-console` server, and the Figma plugin talks to only one server at a time. When an agent session has the Bridge, CHIP's copy gets nothing. Its own Connectors probe already warns about "other figma-console instances". Change: the check reports "Bridge in use by another session" as its own state, and never reads that as "Not measured". Open question for the build: run one shared Bridge server that both CHIP and agents connect to.
2. **Listing open files can expose client file names.** Change: CHIP never calls "list open files". It calls a read with a fixed file key and treats "not connected" as the answer.
3. **A tool name isn't enough to allow it.** Change: CHIP makes only fixed calls, written in one module, with the file key and arguments checked against the allow list. There's no general tool access for this server.
4. **One read time can't describe two files.** Change: the snapshot keeps a separate source and read time for components (BellaComponents) and for variables (Foundations).
5. **A name and count match isn't a full match.** Change: the label says what was compared. Components compare variant names and values against the contract, not just counts. Variables compare names now; values per mode come later, and the label says so.
6. **"Once a day" has no trigger.** Change: it runs when CHIP starts and on Check again. There is no background schedule. A snapshot older than 7 days shows as "Stale" with its date.
7. **A REST failure must not block the Bridge.** Change: a REST timeout, rate limit or rejected token falls through to the Bridge, and the snapshot names the path that answered.

## Not in this step

- Writing to Figma from CHIP.
- Visual diff of Figma frames against Storybook.
- The REST token. It stays the better path, since it needs no app open, but it needs Elleta to make a token, so it stays optional.

## Checks before done

- Unit test: the guard refuses a file key that isn't on the list, and refuses `figma_execute`.
- With only Foundations active in Figma, a component read still targets BellaComponents, or says it isn't connected.
- With the Bridge closed, pages show the last snapshot and its age, with no hang and no "Not measured".
- The snapshot numbers equal the 8 Nov reading by hand (27/37, 30 variants, 68/71), or the difference is explained.
- Screenshots at 1440 and 390 of Today, Checks and Foundations with the Figma data.

## Needs Elleta

- Go or no-go on this plan.
- Confirm or reject the name pairs Columns → Grid and SidebarLayout → Sidebar.
- Whether Figma-only roles (`accent-ink`, `success-strong`, `surface` listed twice) should get a fix row on Today, or stay as a note in Foundations.
