// The audits Health shows, read from the reports they saved (CHIP rule "All audits in
// one place", 22 Nov): docs/reference/audit/<date>/<report>.md. An audit that ran but
// left no report there counts as not run. Read only; nothing here starts a run.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const AUDIT_DIR = process.env.CHIP_AUDIT_DIR || join(homedir(), 'DEV/chip/docs/reference/audit');

export const KINDS = [
  { id: 'product', title: 'CHIP app', skill: 'product-inspection', test: /^product-inspection(-chip)?\.md$/ },
  { id: 'figma', title: 'CHIP Figma screens', skill: 'Figma flows audit', test: /^figma-flows-01-06\.md$/ },
  { id: 'ds', title: 'BELLA system', skill: 'ds-inspection', test: /^ds-inspection\.md$/ },
  { id: 'tokens', title: 'BELLA tokens', skill: 'ds-token-architecture', test: /^ds-token-architecture\.md$/ },
  { id: 'a11y', title: 'Accessibility', skill: 'accessibility-audit', test: /^(accessibility|a11y)(-audit)?.*\.md$/ },
  { id: 'agents', title: 'Agents', skill: 'agent audit', test: /^agents?-audit.*\.md$/ },
];

const clean = (s) => s.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();

/** What one report says: its score, its lights and its first three work orders. */
export function readReport(kind, text) {
  const lines = text.split('\n');
  const lights = { red: 0, yellow: 0, green: 0 };
  for (const l of lines) {
    const m = l.match(/^#{2,4} .*\b(RED|YELLOW|GREEN|Red|Yellow|Green)\b/);
    if (m) lights[m[1].toLowerCase()] += 1;
  }
  const checks = lights.red + lights.yellow + lights.green;
  let value = null;
  let unit = null;
  const overall = text.match(/Overall[^\n]*?(\d+)\/100/);
  if (overall) ((value = +overall[1]), (unit = 'of 100'));
  else if (kind === 'figma') {
    const s = [...text.matchAll(/^### .*· score (\d+)/gm)].map((m) => +m[1]);
    if (s.length) ((value = Math.round(s.reduce((a, b) => a + b, 0) / s.length)), (unit = `average of ${s.length} screens`));
  } else if (checks) ((value = lights.green), (unit = `of ${checks} checks green`));
  // work orders: a "Work order" table (the item is its second column), numbered bold lines, or, for the Figma
  // audit, its "Fix once, many screens" list
  const orders = [];
  const at = lines.findIndex((l) => /^##+ .*(work order|fix once)/i.test(l));
  if (at >= 0) {
    for (const l of lines.slice(at + 1)) {
      if (/^## /.test(l) && orders.length) break;
      const row = l.match(/^\|\s*\*{0,2}(\d+)[^|]*\|\s*([^|]+)\|/);
      const bold = l.match(/^\*\*(\d+)\.\s+(.+?)\*\*/);
      const dash = kind === 'figma' ? l.match(/^- (?:\*\*[abc]\*\* · )?(.+)/) : null;
      const t = row ? clean(row[2]) : bold ? clean(bold[2]) : dash ? clean(dash[1].split(/ \(|: /)[0].replace(/ \d+:\d+/g, '')).slice(0, 90) : null;
      if (t) orders.push((kind === 'figma' ? 'Fix once: ' : '') + t.replace(/\.$/, ''));
      if (orders.length === 3) break;
    }
  }
  return { value, unit, ...(checks ? lights : { red: null, yellow: null, green: null }), checks, orders };
}

const reports = (kind) => {
  if (!existsSync(AUDIT_DIR)) return [];
  return readdirSync(AUDIT_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .flatMap((d) => readdirSync(join(AUDIT_DIR, d)).filter((f) => kind.test.test(f)).map((f) => ({ day: d, file: `${d}/${f}`, at: statSync(join(AUDIT_DIR, d, f)).mtimeMs })))
    .sort((a, b) => (a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1));
};

export function readAudits() {
  return KINDS.map((k) => {
    const [last, before] = reports(k);
    const base = { id: k.id, title: k.title, skill: k.skill };
    if (!last) return { ...base, ran: null };
    const now = readReport(k.id, readFileSync(join(AUDIT_DIR, last.file), 'utf8'));
    const prev = before ? readReport(k.id, readFileSync(join(AUDIT_DIR, before.file), 'utf8')) : null;
    return {
      ...base,
      ran: last.day,
      file: last.file,
      ...now,
      prev: prev?.value != null && prev.unit === now.unit ? { value: prev.value, day: before.day } : null,
    };
  });
}

/** The saved report's own text, for "Read the full report"; only a file the list names. */
export function readAuditReport(id) {
  const a = readAudits().find((x) => x.id === id);
  return a?.file ? readFileSync(join(AUDIT_DIR, a.file), 'utf8') : null;
}
