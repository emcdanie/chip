# November benchmark rerun: plan

Status: plan only, waiting for Elleta. Nothing has run. Written 7 Nov 2026. Sources: `~/DEV/tools/bench-2026-10-08-baseline` and the tool's changelog.

## Question

Which instruction file gets agents to use BELLA best: none, the October rewrite, one that only routes to the contracts, or one whose component list is generated from them?

## What October really showed

All three published scores recompute from the raw cells: 87.0, 70.8, 83.5. "5 of 10 tasks ignored BELLA" also holds. But the comparison is weaker than the post reads:

| Finding | Evidence | Effect |
|---|---|---|
| The rewrite's gap to no file comes from one task | Without `password-visibility`: rewrite 87.7, no file 87.4. The rewrite wins 6 of 10 tasks | "Below no file" is not established; on one run each, it may be a tie |
| That task failed because the agent obeyed the file | BELLA's Input has no password type, so it stopped and asked rather than build locally. It changed nothing and scored 45 | The benchmark penalised "ask, don't build", which is the rule she wants |
| No file and the rewrite ran on different BELLA commits | `c867ddd` against `bdfe592`, a day apart. No file never ran on the rewrite's commit | The barrel and DSDS changes are mixed in with the file change |
| One run per cell, on one model | Manifests | No measure of noise |

Corrections to `SUMMARY.md`: its "2 cells skipped" note is out of date (all 20 cells are ok), and the rewrite's gates are 6 pass, 3 review, 1 fail, not 5, 3, 1.

## Tool

Tool 1.5.0 (30 Oct) changed the scoring: rubrics that presume a missing component are withheld, and it adds a composite with judgment removed. October's numbers are not comparable with a 1.5.0 run, so old and new can't sit in one chart unless October's setups are rerun on it.

Use a fresh clone at upstream `e88f11a`. Leave `~/DEV/tools/odsb` alone: it has local edits and October's version.

## Setup

- Model: sonnet, as in October, pinned to one full model ID for the whole run because the alias can change. Record it with the Claude Code version, tool commit, BELLA commit, cost and any intervention (target: none).
- Tasks: the 10 starter tasks. Hard tasks stay out, to keep October's scope.
- Reps: 3 per cell.
- Target: one clean, pinned BELLA commit: `main` after PR 67. It lacks the 12 commits and 41 uncommitted paths in `~/DEV/bella`, so it shows BELLA as published, not as CHIP uses it.

### Main run: 120 cells

| Setup | `AGENTS.md` |
|---|---|
| A | None |
| B | Current rewrite, unchanged |
| C | Routing only: under 10 lines, pointing to the contracts, plus "if it's not in BELLA, ask" and a line naming what the file does not cover |
| D | B with its component list generated from `tokens/component.json`, shipped components only (it also holds 3 unbuilt contracts: modal, callout, nav-link) |

C and D exist only in the benchmark's copies. BELLA's real file changes only after results and her decision.

### The "before" run: 90 cells

Rerun October's three setups on tool 1.5.0 at 3 reps: no file and old file at `c867ddd`, rewrite at `bdfe592`. These commits are pinned, so this can run at any time. It is what makes a before and after possible, because October's scores use the old scoring. It still mixes the file change with the BELLA changes between those commits, so it can show what happened and not why.

## Reporting: three results, never one number

1. **Scripted:** 1.5.0's mechanical composite and its dimensions: imports, API fidelity, tokens, accessibility, compile.
2. **Rule adherence:** BELLA component used; raw hex or px; local component built when BELLA has a gap; asked instead of building. "Asked" is its own outcome, counted per setup, and each setup's average is shown with and without those cells.
3. **Judge:** the tool's judgment score, plus its screenshot gallery for Elleta. Taste stays hers.

Each result shows every rep's range. The old combined score is shown once, labelled, for continuity with the post.

## Decided before the run

- Main measure: rule adherence, because the question is about using BELLA, with the scripted result reported beside it. Before the run, label each task "BELLA covers this" or "BELLA has a gap": on covered tasks the right outcome is using BELLA; on gap tasks it is asking, or composing from BELLA without local imitations.
- Compare per task across the 3 reps. A setup wins only if its task average is higher on at least 7 of 10 tasks. Otherwise it is a tie and gets reported as one. Three reps can only show large differences, so a tie is a normal result. It is my rule, not a statistical test.
- The comment thread's test: C should beat A and B. If not, the partial-map explanation is wrong or incomplete, and the post says so.
- Publish whatever comes back, including a tie or a worse result.
- A code bug or tool failure may be rerun only with the original failure reported.

## Steps

1. Land BELLA's improvements first: PR 67, then the agent-facing changes she picks (per-component docs and `llms.txt` from P4, any missing components such as a password input). Pin that commit. Her call. CHIP's rebuild is not a prerequisite, because the benchmark only tests BELLA.
2. Clone the tool at `e88f11a`, make a clean BELLA copy, write C and D. Run `validate-tasks`: October's summary records a failure from Columns leaking into a task prompt. All setups must get identical prompts; if the leak remains, drop or fix that task for every setup and report it.
3. Smoke test: one task across all setups, to confirm a config can carry four `AGENTS.md` variants. The tool's contexts are `bare`, `agents-md` and `skill`, so I expect one system entry per variant. Not yet tested.
4. Check one smoke transcript per setup for isolation: no global `CLAUDE.md`, skills or memory. After the main run, script the same check across every transcript and discard and rerun any cell that fails it.
5. "Before" run, then main run on the improved commit. Save everything under `~/DEV/tools/bench-2026-11-<date>`.
6. Report to Elleta: results, per-task table, gallery, what could not be verified.
7. Only then: her decision on BELLA's real file, the System page and the post.

## Cost and time (estimates)

October: 20 cells, $4.29 reported on the Max plan, about 12 minutes.

| Run | Cells | Reported cost | Time at that rate |
|---|---|---|---|
| Main | 120 | about $26 | about 72 min |
| With "before" run | 210 | about $45 | about 2 hours |

The risk is usage limits, so split the run into batches and rerun any incomplete cell. Figures assume the same model and tasks; I'm guessing the rate holds.

## Her calls

- Which BELLA improvements land before the run.
- Whether the System page and October's post get a note about the single-task gap now, or with the November results.
- BELLA target: `main`, or wait for a cleaned-up BELLA that includes CHIP's work.
- Whether BELLA gains a password input before the run. That removes the gap the agent stopped on, which also changes what is being tested, so C and D would need the same commit.
