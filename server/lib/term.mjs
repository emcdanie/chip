// The workspace terminal: a WebSocket at /term that runs Elleta's own login
// shell in a pty (node-pty), one per tab, killed when the tab closes.
// The server listens on 127.0.0.1 only; on top of that a socket must come
// from CHIP's own page (Origin) addressed to this machine (Host), so another
// site open in the browser can't reach a shell (cross-site WebSocket) and a
// rebinding DNS name can't either. The folder is picked from a fixed list.
// No keys are stored and no permission flags are added: `claude` runs as she
// would start it in any terminal, with its own prompts.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import { ROOT } from './config.mjs';
import { terminalRepos } from './projects.mjs';

// Folders a terminal may open in, by key: the project registry
// (projects.mjs), so there is one list. `site` is the portfolio.
// with its checked-out branch, for the Work panel's session tree
const branchOf = (dir) => {
  try {
    return execFileSync('git', ['-C', dir, 'branch', '--show-current'], { encoding: 'utf8', timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
};
export const repoList = () => Object.entries(terminalRepos()).filter(([, r]) => existsSync(r.dir)).map(([id, r]) => ({ id, label: r.label, branch: branchOf(r.dir) }));

const MAX_SESSIONS = 6;
const live = new Set();

// npm unpacks node-pty's prebuilt spawn-helper without its exec bit on macOS,
// and every spawn then fails with "posix_spawnp failed". Put it back once.
function fixSpawnHelper() {
  try {
    const base = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
    const helper = join(base, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
    if (existsSync(helper) && !(statSync(helper).mode & 0o111)) chmodSync(helper, 0o755);
  } catch {}
}

// Her environment, minus what CHIP itself loaded from server/.env (tokens for
// Notion and the like stay with the server) and minus every CLAUDE* and
// ANTHROPIC* variable: when CHIP was started from a Claude Code or desktop
// session, those are that session's (its ids, messaging token, base URL).
// The login shell then sets whatever her own rc files set, as Terminal would,
// and `claude` here starts as a fresh session of its own.
function shellEnv() {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  try {
    for (const k of Object.keys(dotenv.parse(readFileSync(join(ROOT, 'server', '.env'))))) delete env[k];
  } catch {}
  for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC)/.test(k)) delete env[k];
  return env;
}

export function attachTerminal(server, { port, origins }) {
  fixSpawnHelper();
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:5173', 'localhost:5173']);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/term') return socket.destroy();
    const refuse = (code, why) => {
      socket.end(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\n\r\n`);
    };
    if (!origins.has(req.headers.origin)) return refuse(403, 'Forbidden');
    if (!hosts.has(req.headers.host)) return refuse(403, 'Forbidden');
    if (live.size >= MAX_SESSIONS) return refuse(429, 'Too Many Terminals');
    const repos = terminalRepos();
    const repo = repos[url.searchParams.get('repo')] ?? repos.chip ?? { dir: ROOT };
    if (!existsSync(repo.dir)) return refuse(404, 'Not Found');
    const cols = Math.min(400, Math.max(20, Number(url.searchParams.get('cols')) || 100));
    const rows = Math.min(200, Math.max(5, Number(url.searchParams.get('rows')) || 30));
    wss.handleUpgrade(req, socket, head, (ws) => open(ws, repo.dir, cols, rows, url.searchParams.get('run') === 'claude'));
  });

  function open(ws, cwd, cols, rows, runClaude) {
    const shell = process.env.SHELL || '/bin/zsh';
    let term;
    try {
      term = pty.spawn(shell, ['-l'], { name: 'xterm-256color', cols, rows, cwd, env: shellEnv() });
    } catch (err) {
      ws.send(`\r\nCHIP could not start ${shell}: ${err.message}\r\n`);
      return ws.close();
    }
    live.add(term);
    // the Claude tab types `claude` for her; quitting it leaves her in the shell
    if (runClaude) term.write('claude\r');
    term.onData((d) => ws.readyState === ws.OPEN && ws.send(d));
    term.onExit(({ exitCode }) => {
      live.delete(term);
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[shell exited ${exitCode}]\r\n`);
        ws.close();
      }
    });
    // messages: { type: 'input', data } or { type: 'resize', cols, rows }
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.type === 'input' && typeof m.data === 'string') term.write(m.data);
      else if (m.type === 'resize' && Number.isInteger(m.cols) && Number.isInteger(m.rows)) {
        term.resize(Math.min(400, Math.max(20, m.cols)), Math.min(200, Math.max(5, m.rows)));
      }
    });
    ws.on('close', () => {
      if (live.has(term)) term.kill();
      live.delete(term);
    });
  }
}
