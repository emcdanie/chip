// Claude provider: Claude Code, headless, on Elleta's Claude plan. No API key,
// no per-token bill. Read-only by construction: no tools (--tools ""), no MCP
// servers (strict, empty config), no skills, no saved session, no settings
// files, run in an empty folder. Verified 2026-10-03: init reports tools []
// and mcp_servers [].
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHIP_CLAUDE_BIN, CHIP_CLAUDE_MODEL } from '../lib/config.mjs';

let checked = null; // { available, note }

function check() {
  if (checked) return checked;
  const r = spawnSync(CHIP_CLAUDE_BIN, ['--version'], { encoding: 'utf8' });
  checked = r.status === 0
    ? { available: true, note: 'uses your plan · sent to Anthropic' }
    : { available: false, note: `Claude Code is not installed (${CHIP_CLAUDE_BIN} not found)` };
  return checked;
}

export const claude = {
  id: 'claude',
  kind: 'text',
  label: 'Claude · uses your plan · sent to Anthropic',
  place: 'cloud',

  async list() {
    const c = check();
    return [{ id: 'claude', label: `Claude · ${CHIP_CLAUDE_MODEL}`, group: 'Cloud', place: 'cloud', available: c.available, note: c.note }];
  },

  /** Streams Claude's answer. Throws before the first piece if Claude cannot answer
   *  (not installed, not logged in), so the caller can fall back to local. */
  async *ask({ system, messages }) {
    if (!check().available) throw new Error(check().note);
    // earlier turns go in as plain text: the CLI takes one prompt
    const prompt = messages.map((m) => (m.role === 'user' ? m.content : `(Your earlier answer)\n${m.content}`)).join('\n\n---\n\n');
    const dir = mkdtempSync(join(tmpdir(), 'chip-claude-'));
    const child = spawn(
      CHIP_CLAUDE_BIN,
      ['-p', '--model', CHIP_CLAUDE_MODEL, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-session-persistence', '--setting-sources', '', '--system-prompt', system],
      { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    // a failed spawn or an early exit (EPIPE on stdin) must reach the caller,
    // never crash the server
    let spawnError = null;
    child.on('error', (e) => (spawnError = e));
    child.stdin.on('error', (e) => (spawnError ??= e));
    child.stdin.end(prompt);
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const done = new Promise((res) => child.on('close', res));
    let buf = '', said = false, failure = null;
    try {
      for await (const part of child.stdout) {
        buf += part;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let e;
          try {
            e = JSON.parse(line);
          } catch {
            continue;
          }
          const d = e.type === 'stream_event' && e.event?.type === 'content_block_delta' ? e.event.delta : null;
          if (d?.type === 'text_delta' && d.text) {
            said = true;
            yield d.text;
          }
          if (e.type === 'result' && e.is_error) failure = e.result || 'Claude returned an error';
        }
      }
      const code = await done;
      if (spawnError && !said) throw new Error(`Claude Code could not start: ${spawnError.message}`);
      if (said && (failure || code !== 0)) throw new Error(`Claude stopped before finishing (exit ${code})`);
      if (failure || (code !== 0 && !said)) {
        throw new Error(failure || (/log ?in|auth/i.test(err) ? 'Claude Code is not logged in (run claude once to log in)' : `Claude Code exited ${code}: ${err.trim().slice(0, 200)}`));
      }
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
