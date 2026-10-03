# CLAUDE.md: CHIP

CHIP is the local bridge for the BELLA design system (`~/DEV/bella`). The app in `app/` is built from BELLA components and tokens only: no hex values, no px font sizes in `app/src`. BELLA's `AGENTS.md` applies here and wins on any conflict. `emcdanie/chip` is public: no client names, no personal items, no `.env`.

## Relay

- Instructions arrive in `docs/reference/inbox/next.md` (gitignored). When Elleta says "go", read it and do it.
- Reports go to `docs/reference/inbox/report.md`: under 15 lines, then a "Needs Elleta" list (empty if none). Screenshots go to `docs/reference/screens/` and are named in the report.
- When a step finishes, move `next.md` to `docs/reference/inbox/done/<date>-<short-name>.md`.
- **Decide alone** and log it in `docs/reference/decisions-while-away.md` (one line: what, why, how to undo):
  - anything the house rules already answer (highlight never dim, ochre for fill and highlight only, ochre-deep for focus only, 44px targets, BELLA's type floor, BELLA components and tokens only);
  - anything that passes the gate and contrast checks;
  - adding tests, snapshots or docs.
- **Stop and ask only for:** a brand change beyond an approved theme; removing or renaming a public BELLA API; anything touching git remotes or pushes; a gate that still fails after two fixes.
- Never push or merge without Elleta's OK.

## Local CI

`.git/hooks/pre-commit` (local, not committed) blocks a commit when `app/src` has a hex value or a px font size, when `npm run app:build` fails, or when a staged line matches a term in `~/.claude/nda-terms.txt`.
