// CLI adapter: wraps one command-line tool so OBI can run a few of its
// subcommands, safely. Safe means:
//   - only the subcommands the config lists can run (git: status, log);
//   - every extra argument must be on that subcommand's allowed list, or
//     match its pattern, and can never start a new command;
//   - no shell: the program is started directly with an argument list, so
//     ";", "|", "$(...)" are just text, never instructions.
// Output that is JSON comes back parsed; anything else comes back as text.
import { execFile } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { ROOT } from '../lib/config.mjs';

const SAFE_ARG = /^[\w.,:=@/+-]+$/; // letters, digits and a few punctuation marks; nothing a shell would act on

export class CliServer {
  /** cfg: { name, kind: 'cli', command, cwd?, subcommands: { [sub]: { args?: string[], pattern?: string, kind?: 'read' | 'write' } }, allow } */
  constructor(cfg) {
    this.cfg = cfg;
  }

  async connect() {
    return true;
  }

  async listTools() {
    return Object.entries(this.cfg.subcommands ?? {}).map(([sub, rule]) => ({
      server: this.cfg.name,
      name: sub,
      description: `${this.cfg.command} ${sub}${rule.args?.length ? ` (allowed: ${rule.args.join(' ')})` : ''}`,
      kind: rule.kind ?? 'write', // a subcommand reads only when the config says so
    }));
  }

  /** Throws when the subcommand or an argument is not allowed. */
  check(sub, args) {
    const rule = this.cfg.subcommands?.[sub];
    if (!rule) throw new Error(`${this.cfg.name}: "${sub}" is not an allowed subcommand (allowed: ${Object.keys(this.cfg.subcommands ?? {}).join(', ')})`);
    const pattern = rule.pattern ? new RegExp(`^(?:${rule.pattern})$`) : null; // whole argument only
    for (const a of args) {
      if (typeof a !== 'string' || !SAFE_ARG.test(a)) throw new Error(`${this.cfg.name} ${sub}: argument ${JSON.stringify(a)} has characters that are not allowed`);
      if (!(rule.args ?? []).includes(a) && !(pattern && pattern.test(a))) throw new Error(`${this.cfg.name} ${sub}: argument "${a}" is not allowed`);
    }
    return rule;
  }

  /** args: an array of strings, or { args: [...] } from OBI. */
  async call(sub, input = []) {
    const args = Array.isArray(input) ? input : input.args ?? [];
    this.check(sub, args);
    return new Promise((resolve, reject) => {
      execFile(this.cfg.command, [sub, ...args], { cwd: resolvePath(ROOT, this.cfg.cwd ?? '.'), timeout: 30000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).trim().slice(0, 400)));
        const out = stdout.trim();
        try {
          resolve(JSON.stringify(JSON.parse(out), null, 2));
        } catch {
          resolve(out);
        }
      });
    });
  }

  async close() {}
}
