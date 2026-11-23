/* Reads a saved audit report (docs/reference/audit/<date>/<name>.md, served by /audits/<id>/report) into
   what the Health drawer shows (CHIP rule 23 Nov: a report is read inside CHIP, explained, never pasted).
   Every number and word comes from the report's own text; nothing is typed here. Three layouts are read:
   the ds-inspection style (an inspection sheet table, station records, **N. Title** work orders), the
   product style (a sheet table, "### N · Name: Light x/10" records, a work-order table) and the Figma audit
   (flows of screens with "score N", a "Fix once" list). A layout it doesn't know gives fewer parts, never
   a guess. Tested in server/test/audit-report.test.mjs. */

/** Markdown out, plain words in: no asterisks, backticks, links, pipes or status tags reach the screen. */
export const plain = (s) =>
  String(s ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*\[(?:verified|reported|inferred|assumed)\]\s*/i, '')
    .replace(/\[(?:verified|reported|inferred|assumed)\]\s*/gi, '')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,])/g, '$1$2')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

const sentences = (s, n = 1) => {
  const out = [];
  let from = 0;
  for (let i = 0; i < s.length && out.length < n; i++) {
    if (/[.!?]/.test(s[i]) && /\s/.test(s[i + 1] ?? ' ') && !/\d/.test(s[i - 1] ?? '')) {
      out.push(s.slice(from, i + 1).trim());
      from = i + 1;
    }
  }
  if (out.length < n && from < s.length) out.push(s.slice(from).trim());
  return out.join(' ');
};

// nothing is cut here any more (her 22 Nov: lines ended in "…" mid-sentence); the drawer shows a first sentence and Read more
const cut = (s) => s;
const LIGHT = /\b(red|yellow|green)\b/i;
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isRule = (l) => /^\|?\s*:?-{2,}/.test(l.trim());

export function parseReport(text) {
  const lines = String(text ?? '').split('\n');
  const h1 = lines.find((l) => /^# /.test(l));
  const titleFull = plain(h1?.replace(/^# /, '') ?? '');
  const date = titleFull.match(/·\s*(\d{1,2} [A-Z][a-z]{2} \d{4})\s*$/)?.[1] ?? null;

  // one plain line of meaning: the first sentence of the short version or verdict, else the first plain paragraph
  let meaning = '';
  const at = lines.findIndex((l) => /^## (short version|verdict)/i.test(l));
  const scan = at >= 0 ? lines.slice(at + 1) : lines.slice(lines.indexOf(h1) + 1);
  for (const l of scan) {
    if (/^#{1,2} /.test(l) && at >= 0 && meaning) break;
    const t = l.trim();
    if (!t || /^[#|>_*-]/.test(t) && !/^\*\*[A-Z][^*]*\*\*\s+\S/.test(t) || /^\*\*(Overall|Lights|Red|Yellow|Green|Top)/.test(t)) continue;
    meaning = cut(sentences(plain(t), 1), 260);
    break;
  }

  // the Figma audit has no short version: its totals line says the meaning
  const tot = lines.join('\n').match(/Totals: (\d+) findings[^\n]*Average score (\d+) over (\d+) screens/);
  if (tot && at < 0) meaning = `${tot[1]} findings, an average score of ${tot[2]} over ${tot[3]} screens.`;

  // station records: "### Station 6 · Orchestration: RED (4/10)", "### 6 · Name: Yellow 5/10 (+2)", "### Check 3: Name: YELLOW"
  const records = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^### (?:Station |Check )?(\d+)\s*[·:]\s*(.+)$/);
    if (!m || !LIGHT.test(m[2])) continue;
    const ev = [];
    for (const l of lines.slice(i + 1)) {
      if (/^#{1,3} /.test(l)) break;
      const b = l.match(/^\s{0,3}- (.+)/);
      if (b && !/^(not inspected|deviations noted|evidence level)/i.test(plain(b[1])) && !/:$/.test(plain(b[1]))) ev.push(cut(plain(b[1]), 260));
    }
    records.set(+m[1], ev.filter(Boolean).slice(0, 6));
  }

  // stations: the sheet table with a Light column
  const stations = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|/.test(lines[i]) || !/\blight\b/i.test(lines[i]) || stations.length) continue;
    const head = cells(lines[i]).map((c) => c.toLowerCase());
    const li = head.findIndex((c) => c === 'light');
    const ni = head.findIndex((c) => /^(station|check)$/.test(c));
    const si = head.findIndex((c) => c === 'score');
    const oi = head.findIndex((c) => /one line/.test(c));
    for (const l of lines.slice(i + 1)) {
      if (!/^\|/.test(l)) break;
      if (isRule(l)) continue;
      const c = cells(l);
      const n = +c[0];
      const light = c[li]?.match(LIGHT)?.[1].toLowerCase();
      if (!n || !light || ni < 0) continue;
      const sc = si >= 0 ? plain(c[si]).match(/(\d+)\s*\/\s*(\d+)/) : null;
      stations.push({
        n,
        name: plain(c[ni]),
        light,
        score: sc ? +sc[1] : null,
        max: sc ? +sc[2] : null,
        line: oi >= 0 ? plain(c[oi]) : '',
        evidence: records.get(n) ?? [],
      });
    }
  }
  // the Figma audit: no lights, one score (0 to 100) per screen; a row per flow, its screens as the detail
  if (!stations.length) {
    let flow = null;
    const flows = [];
    for (const l of lines) {
      const f = l.match(/^## (Flow \d+ · .+)$/);
      if (f) flows.push((flow = { name: plain(f[1]).replace(/^Flow \d+ · /, ''), screens: [] }));
      const s = l.match(/^### (Screen \d+ · .+?) · [\d:]+ · score (\d+)\s*$/);
      if (s && flow) flow.screens.push({ name: plain(s[1]), score: +s[2] });
    }
    flows.forEach((f, i) => {
      if (!f.screens.length) return;
      const avg = Math.round(f.screens.reduce((a, s) => a + s.score, 0) / f.screens.length);
      stations.push({ n: i + 1, name: f.name, light: null, score: avg, max: 100, line: `${f.screens.length} screens`, evidence: f.screens.map((s) => `${s.name}: ${s.score} of 100`) });
    });
  }

  // work orders, after a "Work order" or "Fix once" heading
  const orders = [];
  const w = lines.findIndex((l) => /^##+ .*(work order|fix once)/i.test(l));
  if (w >= 0) {
    let cur = null;
    let cols = null;
    for (const l of lines.slice(w + 1)) {
      if (/^## /.test(l) && orders.length && !/work order|fix once/i.test(l)) break;
      if (/^#{3,4} /.test(l)) {
        cur = null;
        continue;
      }
      if (/^\|/.test(l)) {
        if (isRule(l)) continue;
        const c = cells(l);
        if (!cols) {
          const h = c.map((x) => x.toLowerCase());
          cols = { t: h.findIndex((x) => /^(do|item)$/.test(x)), why: h.findIndex((x) => /what i saw/.test(x)), move: h.findIndex((x) => /first move/.test(x)), n: 0 };
          if (cols.t < 0) cols = null;
          continue;
        }
        if (!/^\d/.test(c[0])) continue;
        orders.push({ n: orders.length + 1, title: plain(c[cols.t]).replace(/\.$/, ''), why: cols.why >= 0 ? cut(plain(c[cols.why]), 220) : '', move: cols.move >= 0 ? cut(plain(c[cols.move]), 220) : '' });
        continue;
      }
      const head = l.match(/^\*\*(\d+)\.\s+(.+?)\*\*(.*)$/);
      if (head) {
        const rest = plain(head[3]).replace(/^·\s*/, '');
        const move = rest.match(/First move:\s*(.+?)(?:\s+Done when:|\s+Effort:|$)/)?.[1] ?? '';
        const why = rest.replace(/^Stations? [\d, ]+·\s*/, '').replace(/\s*First move:.*/, '');
        cur = { n: +head[1], title: plain(head[2]).replace(/\.$/, ''), why: cut(why, 220), move: cut(move, 220) };
        orders.push(cur);
        continue;
      }
      const b = l.match(/^- (.+)/);
      if (cur && b) {
        const t = plain(b[1]);
        if (/^First move:/i.test(t)) cur.move = cut(t.replace(/^First move:\s*/i, ''), 220);
        else if (/^Stations? [\d, ]+·/.test(t) && !cur.why) cur.why = cut(t.replace(/^Stations? [\d, ]+·\s*/, ''), 220);
        continue;
      }
      // Figma: "- Health · content 601:111049 (11 screens of Flow 2 …): Gate segments, the two target labels …"
      const fx = l.match(/^- (.+)/);
      if (!cur && fx && /fix once/i.test(lines[w])) {
        const t = plain(fx[1]);
        const m = t.match(/^(.+?)\s+\d+:\d+\s*(?:\((.+?)\))?:?\s*(.*)$/);
        if (m) orders.push({ n: orders.length + 1, title: `Fix once in ${m[1]}`, why: cut([m[2], m[3]].filter(Boolean).join(': '), 220), move: '' });
      }
    }
  }
  return { title: titleFull.replace(/\s*·\s*\d{1,2} [A-Z][a-z]{2} \d{4}\s*$/, ''), date, meaning, stations, orders };
}

/** The skill's own bar, read off the saved reports: every Green station is 8 of 10 or more and no Yellow reaches it
    (ds-inspection and product-inspection, 22 Nov). Taken from the data, so it is only offered when a report has both. */
export function greenFrom(stations) {
  const scored = stations.filter((s) => s.light && s.score != null && s.max === 10);
  const g = scored.filter((s) => s.light === 'green').map((s) => s.score);
  const y = scored.filter((s) => s.light === 'yellow').map((s) => s.score);
  if (!g.length || !y.length) return null;
  const lo = Math.min(...g);
  return Math.max(...y) < lo ? lo : null;
}

/* The state of an audit, from what its report counted (second pass: an icon that was green at 55 of 100). One meaning for the
   colour everywhere: failing = danger, needs work = warning, healthy = success; an audit whose report counted no failing or
   needs-work headings has no state to show, so it is neutral and says so, never green by default. */
export const auditTone = (a) => (a.red == null ? 'neutral' : a.red ? 'danger' : a.yellow ? 'warning' : 'success');
