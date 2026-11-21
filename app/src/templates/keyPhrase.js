/* The keyword marker marks what matters (CHIP rules, 22 Nov): the few words that say what changed, the
   number or the outcome, so a line can be scanned instead of read. Never the part name, the area before a
   title's colon, or a label. Plain rule, no model, tested in server/test/key-phrase.test.mjs:
   1. drop the "Area: " before a title's colon;
   2. split what is left into clauses at commas and semicolons;
   3. in each clause, a number wins ("10 commits", "4.5:1", "90%");
      else a clause of up to 4 words is marked whole ("no sentence is bold");
      else the clause's verb and what follows it ("opens its plan first", "no longer blanks the app"),
      with a weak lead verb dropped ("sits centred on its line" marks "centred on its line"),
      cut to 6 words and never ending on a small word;
   4. at most two phrases a line, and a phrase that is only a part name is skipped. */

// verbs that are only verbs here, and verbs that are also nouns ("line", "runs", "count"): the second kind
// counts only after a word that isn't "the", "its", "to"…, with a word after it, and when two sit side by
// side the later one is the verb ("the timeline line runs unbroken", "meta lines drop")
const VERBS = new Set(
  ('opens shows sits share shares moves gets reads follow follows fills wraps stays says finds keeps scrolls ' +
    'carries suggests rewrites goes becomes appears grows draws switches matches reaches clears fails leaves adds ' +
    'waits explains sends loads saves fits brings takes jumps recomputes updates syncs is are has have get gets sit').split(' '),
);
const AMBIG = new Set(
  ('open show fill read move keep run runs line lines count counts name names list lists point points end ends ' +
    'mark marks fix fixes pass passes stop stops work works use uses turn turns match draw switch cut cuts break ' +
    'breaks hold holds start starts pick picks answer answers drop drops scroll find say wrap stay grow load save fit').split(' '),
);
const WEAK = new Set('is are sits sit reads read stays stay becomes'.split(' '));
const LEADS = new Set(['never', 'now', 'always', 'still']);
const SMALL = new Set('the a an its their his her of in on at to by for from with and or as that this every each your'.split(' '));
const RELATIVE = new Set(['that', 'which', 'who', 'where', 'when', 'if']);
const DET = new Set([...SMALL, 'no', 'one', 'own']);

const words = (s) => [...s.matchAll(/\S+/g)].map((m) => ({ w: m[0], at: m.index }));
const bare = (w) => w.toLowerCase().replace(/^["“'(]+|[)"”'.,;:!?]+$/g, '');

function inClause(clause) {
  const ws = words(clause.text);
  if (!ws.length) return null;
  const span = (i, j) => ({ at: clause.at + ws[i].at, text: clause.text.slice(ws[i].at, ws[j].at + ws[j].w.length) });
  // a number, with the word it counts ("10 commits", "25 colours"), never "25 in"
  const num = clause.text.match(/\b\d+(?:[.:]\d+)*(?::1)?%?(?:\s+of\s+\d+)?(?:\s+(?!(?:in|on|at|to|of|and|the|a|from|for|by|with)\b)[A-Za-z]+)?/);
  if (num) return { at: clause.at + num.index, text: num[0].replace(/[.,;:]+$/, '') };
  const verbAt = (i) => {
    const b = bare(ws[i].w);
    const prev = bare(ws[i - 1]?.w ?? '');
    if (RELATIVE.has(prev)) return false;
    if (VERBS.has(b)) return true;
    return AMBIG.has(b) && i < ws.length - 1 && !['and', 'or'].includes(bare(ws[i + 1].w)) && !DET.has(prev) && !/'s$|’s$/.test(prev);
  };
  // the verb: the first one not inside "that starts …"; a "never"/"no longer" before it comes along
  let v = -1;
  for (let i = 1; i < ws.length; i++) {
    const b = bare(ws[i].w);
    if (b === 'no' && bare(ws[i + 1]?.w ?? '') === 'longer') { v = i; break; }
    if (LEADS.has(b) && i + 1 < ws.length && verbAt(i + 1)) { v = i; break; }
    if (verbAt(i)) { v = i + 1 < ws.length && verbAt(i + 1) && AMBIG.has(b) ? i + 1 : i; break; }
  }
  if (v < 0) return null;
  // a short clause that says no or every is the point as it stands ("no sentence is bold")
  let first = 0;
  while (first < ws.length - 1 && ['the', 'a', 'an', 'and'].includes(bare(ws[first].w))) first++;
  if (ws.length - first <= 4 && ['no', 'every', 'nothing'].includes(bare(ws[first].w))) return span(first, ws.length - 1);
  let s = v;
  if (WEAK.has(bare(ws[s].w)) && s < ws.length - 1) s++;
  while (s < ws.length - 1 && SMALL.has(bare(ws[s].w))) s++;
  let e = Math.min(ws.length - 1, s + 5);
  for (let i = s + 1; i <= e; i++) if (['and', 'or', 'so', 'with', 'beside', 'while'].includes(bare(ws[i].w))) { e = i - 1; break; }
  while (e > s && SMALL.has(bare(ws[e].w))) e--;
  return span(s, e);
}

/** The phrases to mark in one line, as { at, text } in the line's own spelling, in order. */
export function keyPhrases(line, { names = [], max = 2 } = {}) {
  const t = String(line ?? '');
  const area = t.match(/^[^:]{2,32}:\s+/);
  const from = area ? area[0].length : 0;
  const clauses = [];
  const re = /[^,;]+/g;
  let m;
  const body = t.slice(from);
  while ((m = re.exec(body))) {
    clauses.push({ at: from + m.index, text: m[0] });
  }
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const out = [];
  for (const c of clauses) {
    if (out.length >= max) break;
    const p = inClause(c);
    // a phrase that opens or closes a quote halfway reads wrong; leave that clause plain
    if (!p || !p.text.trim() || (p.text.match(/["“”]/g) ?? []).length % 2) continue;
    const plain = p.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (nameSet.has(plain) || nameSet.has(plain.replace(/\s+/g, ''))) continue;
    out.push(p);
  }
  return out;
}
