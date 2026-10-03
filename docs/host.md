# The host: MCP servers and CLI tools

CHIP can call tools on other programs: MCP servers (the official Figma MCP,
Figma Console MCP) and command-line tools (git, for now). One registry holds
them all; OBI and the Connectors page only talk to it.

## Files

| File | Job |
|---|---|
| `server/host/mcp.js` | MCP adapter: stdio (CHIP starts the program) or http (it is already running). Uses `@modelcontextprotocol/sdk`. |
| `server/host/cli.js` | CLI adapter: listed subcommands and arguments only, no shell. |
| `server/host/guard.js` | Read tools run; write tools return a before → after preview and wait for Confirm. |
| `server/host/registry.js` | Reads the config, lists servers and tools, calls through the guard, logs every call. |
| `app/src/Connectors.jsx` | Status, tools, last used and a Test button per server. |
| `app/src/answers.js` (`toolRouteFor`) | Which questions go to which Figma tool. |

Every call (and every refusal or cancel) is a line in `data/usage.jsonl`
(`"type": "tool"`), gitignored.

## Config

Copy `chip.config.example.json` to `chip.config.local.json` (gitignored) and
edit `servers`. Each entry:

- `name`, `kind` (`mcp` or `cli`), `allow` (`["read"]` or `["read","write"]`), `note`, `disabled`
- MCP over stdio: `transport: "stdio"`, `command`, `args`, `env`
- MCP over http: `transport: "http"`, `url`
- CLI: `command`, `cwd`, `subcommands: { name: { args: [...], pattern: "regex" } }`

Secrets never go in the file. Write `"${FIGMA_ACCESS_TOKEN}"`; the value comes
from `server/.env` or the shell. `~/` expands to the home folder.

## The servers

- **figma** (official Figma MCP, read only). In the Figma desktop app: open a
  design file, switch to Dev Mode, enable the MCP server. It serves
  `http://127.0.0.1:3845/mcp`. Setup:
  [Figma help](https://help.figma.com/hc/en-us/articles/35281186390679).
- **figma-console** (Figma Console MCP). Runs from a local clone:
  `git clone https://github.com/southleft/figma-console-mcp ~/figma-console-mcp`,
  then `npm install && npm run build:local` in it. Variables and plugin work
  need the Desktop Bridge plugin open in Figma (Plugins, Development, Figma
  Desktop Bridge). REST reads need `FIGMA_ACCESS_TOKEN` in `server/.env`.
  [Docs](https://docs.figma-console-mcp.southleft.com).
- **figma-cli**: off until it is chosen.
- **git**: the CLI adapter's test tool. `status` (`--short`, `--branch`) and
  `log` (`--oneline`, `-nN`). Anything else is refused.

## In OBI

- Auto sends Figma questions to a tool (`toolRouteFor`): a figma.com link with
  a node, or "frame", "selection", "screenshot" → figma; "variables",
  "plugin", "library" → figma-console; "export", "batch" → figma-cli.
- `/tools` lists servers and status. `/tool <server> <tool> {json}` runs one
  tool by name.
- Each tool answer carries a chip: `server · tool · 0.4s`.
- A write shows a preview with Confirm and Cancel. Nothing runs before
  Confirm; a preview expires after ten minutes.

## Adding a server

Add an entry to `chip.config.local.json` (and to the example if it is safe
to share), restart `npm start`, press Test on the Connectors page. If a write
tool needs a better "before", add a reader to `BEFORE` in `registry.js`.
