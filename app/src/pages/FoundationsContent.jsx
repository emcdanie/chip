// Foundations · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:61970, state default 612:60963). Roles (each colour's one job), the
// type ramp, the spacing steps, how much of the parts' CSS reads a token,
// the three token tiers (read live from BELLA's CSS), and the token problems. Real data only: the colours
// are BELLA's live values in the page's theme, read from its CSS, their ratios
// measured against the surface; the rest is data/foundations.json (sync-foundations,
// from BELLA's token files and its parts' CSS). BELLA parts and Flow only.
//
// The control bar (Figma 612:60963 / table 800:79888): filter the colour
// roles by name, All / Used / Used by nothing, and the Cards | Table switch
// (Elleta, 20 Nov: "B, the switch"). The Table lists every colour role BELLA
// ships with its Chip light and dark values, contrast on the surface and the
// parts that use it (data/bella.json palette and tokenUsage).
//
// The Light and Dark columns are DataTable swatch columns: one square of one
// colour per cell, each in its own theme, with the hex in the number face
// (Elleta, 22 Nov: "the swatches are still missing").
// Gaps: Figma's Columns menu. The tier chain (Figma: pick a token, see where it comes from and
// where it goes, drawn with connectors) waits on the connector tile; the
// Figma states sent to Claude / checking / tested / check failed wait on a
// fix route for token problems (CHIP has none yet).
import { planRun } from '../templates/RunPlan.jsx';
import { useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Swatch from '@bella/components/Swatch/Swatch';
import TypeSpecimen from '@bella/components/TypeSpecimen/TypeSpecimen';
import SpacingStep from '@bella/components/SpacingStep/SpacingStep';
import RadiusTile from '@bella/components/RadiusTile/RadiusTile';
import EasingCurve, { DurationBar } from '@bella/components/EasingCurve/EasingCurve';
import Progress from '@bella/components/Progress/Progress';
import ListRow from '@bella/components/ListRow/ListRow';
import Button from '@bella/components/Button/Button';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import DataTable from '@bella/components/DataTable/DataTable';
import Tag from '@bella/components/Tag/Tag';
import Link from '@bella/components/Link/Link';
import SearchField from '@bella/components/SearchField/SearchField';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import Toast from '@bella/components/Toast/Toast';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';

// Figma's role groups and the Chip token behind each swatch; `fill` marks a
// colour that sits under text (its ratio is not the point), `base` the grounds
const ROLES = [
  { name: 'Surface', job: 'what things sit on', items: [['surface', '--color-background-surface', 'base'], ['ground', '--color-background-default', 'base'], ['subtle', '--color-background-subtle', 'base']] },
  { name: 'Text', job: 'words, strongest to quietest', items: [['default', '--color-content-default'], ['body', '--color-content-body'], ['subtle', '--color-content-subtle']] },
  { name: 'Border', job: 'edges and dividers', items: [['default', '--color-border-default'], ['strong', '--color-border-strong'], ['ink', '--color-border-ink']] },
  { name: 'Action', job: 'only what you can press', items: [['action', '--color-background-brand', 'fill'], ['on action', '--color-content-brand-knockout'], ['selected', '--color-background-brand-subtle-hover', 'fill']] },
  // status words use the text roles (an error message is content-utility-error, 8.8:1, never the 4:1 mark;
  // user test 21 Nov, item 7), named as their tokens so Cards and Table answer "error" the same way
  { name: 'Status', job: 'only for state', items: [['success', '--color-content-utility-success'], ['attention', '--color-background-utility-warning-mark', 'fill'], ['error', '--color-content-utility-error'], ['warning', '--color-content-utility-warning'], ['info', '--color-content-utility-info']] },
  { name: 'Highlight', job: 'annotation, focus and the logo', items: [['wash', '--color-background-utility-warning', 'fill'], ['focus', '--color-border-focus'], ['pin', '--color-background-accent-1'], ['target', '--color-border-brand'], ['logo blue', '--color-background-accent-3'], ['logo red', '--color-background-accent-4']] },
];
// an "on X" colour is measured on X, never on the white surface (data check, 22 Nov: "on action" said 16.2:1 on
// white; on the action fill it is 7.1:1). The ground each one is made for, by its token's name.
const ON = { '--color-content-brand-knockout': ['--color-background-brand', 'action'], '--color-content-on-accent-1': ['--color-background-accent-1', 'pin'] };
// Figma's type ramp: the TypeSpecimen size, the words set in it and the token that sets it. Every step
// the specimen can draw, named by what sets in it in CHIP (body and labels 16, headings 18, titles 20).
const RAMP = [
  ['display-page', 'page', '--typography-font-size-display-page'],
  ['display-section', 'section', '--typography-font-size-display-section'],
  ['subsection', 'subsection', '--typography-font-size-28'],
  ['xl', 'xl', '--typography-font-size-22'],
  ['base', 'title', '--typography-font-size-20'],
  ['sm', 'heading', '--typography-font-size-18'],
  ['tag', 'body', '--typography-font-size-16'],
];
const TIERS = [
  ['definitions', 'Definitions', 'The plain scale: every colour, size and step'],
  ['theme', 'Theme', 'What a value is for: surface, text, action'],
  ['component', 'Component', 'One part’s own token, only when it must differ'],
];

/* ---- colour maths: the live value of a token and its contrast on the surface ---- */
// the computed colour's channels: the browser always reports them as numbers (r, g, b, then alpha if any)
function channels(css) {
  const n = String(css).match(/[\d.]+/g)?.map(Number);
  if (!n || n.length < 3) return null;
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const lum = ({ r, g, b }) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const over = (c, bg) => ({ r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 });
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = ({ r, g, b }) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Each role's live colour in the page's theme, read through a probe so var() chains
    resolve; read again when the theme changes, so a swatch's hex and ratio name the
    colour it shows (audit 11: dark swatches named their light values). */
function useRoles() {
  const [roles, setRoles] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'chip-light');
  useEffect(() => {
    const root = document.documentElement;
    const watch = new MutationObserver(() => setTheme(root.getAttribute('data-theme') || 'chip-light'));
    watch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    const probe = document.createElement('span');
    probe.setAttribute('data-theme', theme);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const read = (v) => {
      probe.style.color = `var(${v})`;
      return channels(getComputedStyle(probe).color);
    };
    const surface = read('--color-background-surface');
    setRoles(
      ROLES.map((g) => ({
        ...g,
        items: g.items
          .map(([name, token, kind]) => {
            const c = read(token);
            if (!c || !surface) return null;
            const ground = ON[token] ? read(ON[token][0]) : null;
            const bg = ground ? over(ground, surface) : surface;
            const solid = over(c, bg);
            const words = c.a < 1 ? `${hex(c)} at ${Math.round(c.a * 100)}%` : hex(c);
            // a translucent line shows its colour and strength, no ratio (Figma: "its hex at 20%"), so the swatch keeps one line
            return { name, token, color: `var(${token})`, hex: words, ratio: kind ?? (c.a < 1 ? undefined : `${ratio(solid, bg).toFixed(1)}:1${ground ? ` on ${ON[token][1]}` : ''}`) };
          })
          .filter(Boolean),
      })),
    );
    probe.remove();
  }, [theme]);
  return roles;
}

function Roles({ roles, empty, onOpen }) {
  // two groups to a row from a 1440 window, as Figma draws it (audit 10); below, one group a row,
  // so swatches in a row share one height (rule 15); three swatches a row, two below 768 and one below 480, so a name never breaks mid-word (audit 9 at 320)
  const narrow = useNarrow(1440);
  const two = useNarrow(768);
  const one = useNarrow(480);
  const per = one ? 1 : two ? 2 : 3;
  const count = roles.reduce((n, g) => n + g.items.length, 0);
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="Palette" iconTone="info" title="Roles" description="What each colour is for, one job each" />
        {count ? null : empty}
        {/* Figma pairs the groups two to a row: Surface | Text, Border | Action, Status | Highlight */}
        <Flow gap={24}>
          {[0, 2, 4].map((i) => (
            <Flow key={i} direction={narrow ? 'column' : 'row'} gap={24} equal>
              {roles.slice(i, i + 2).filter((g) => g.items.length).map((g) => (
                <Flow key={g.name} gap={12} aria-label={g.name}>
                  {/* a section description is in the reading face (Fonts rule) */}
                  {/* the group's head ends in ↗, opening its colours in the table (Figma Flow 4, screen 1) */}
                  <ListRow as="div" layout="stacked" barHierarchy title={g.name} description={g.job} trailing="ArrowUpRight" onClick={() => onOpen(g.name)} />
                  {/* equal columns, as Figma; a short last row keeps the column widths */}
                  {/* each row is its own list, so every <li> sits in a <ul> (audit 21 Nov) */}
                  <Flow gap={8} role="group" aria-label={`${g.name} colours`}>
                    {g.items.map((x, i) => i).filter((i) => i % per === 0).map((i) => (
                      <Flow key={i} as="ul" direction="row" gap={8} equal>
                        {Array.from({ length: per }, (_, k) => k).map((k) => {
                          const sw = g.items[i + k];
                          return sw ? (
                            <li key={sw.token}>
                              <Swatch color={sw.color} name={sw.name} hex={sw.hex} ratio={sw.ratio} />
                            </li>
                          ) : (
                            <li key={`gap-${k}`} aria-hidden="true" />
                          );
                        })}
                      </Flow>
                    ))}
                  </Flow>
                </Flow>
              ))}
            </Flow>
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

/* What the app's own CSS asks for: every var(--…) it references, read from the loaded stylesheets,
   with the value it resolves to here. Foundations states only this (audit 3, item 9: "form" and a
   five-size ramp described things the app doesn't do). */
function useInUse(prefix) {
  const [used, setUsed] = useState(null);
  useEffect(() => {
    const names = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) for (const m of r.cssText.matchAll(/var\((--[a-z0-9-]+)/g)) if (m[1].startsWith(prefix)) names.add(m[1]);
    }
    const root = getComputedStyle(document.documentElement);
    setUsed([...names].map((n) => ({ name: n, value: root.getPropertyValue(n).trim() })));
  }, [prefix]);
  return used;
}

function TypeRamp() {
  const [sizes, setSizes] = useState({});
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    setSizes(Object.fromEntries(RAMP.map(([, , v]) => [v, root.getPropertyValue(v).trim()])));
  }, []);
  // the distinct sizes the app's CSS sets, whatever token names them
  const used = useInUse('--typography-');
  const inUse = used ? new Set(used.filter((u) => /font-size/.test(u.name) && u.value).map((u) => u.value)).size : null;
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead size="card" icon="Page" iconTone="info" title="Type ramp" description={inUse ? `${RAMP.length} of the ${inUse} sizes in use` : 'Reading the sizes in use'} showDescription />
        <Flow gap={8}>
          {RAMP.map(([size, name, v]) => (
            <TypeSpecimen key={size} size={size} name={name} sizeLabel={sizes[v] || '—'} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

function Tokenized({ rows, source }) {
  // the snapshot's commit and day, so a stale count shows its age (data check, 22 Nov)
  const from = source?.commit ? ` · BELLA @ ${source.commit}, ${new Date(source.committedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead size="card" icon="Code" iconTone="info" title="Tokenized" description={`Values that use a token${from}`} showDescription />
        <Flow gap={12}>
          {rows.map((r) => (
            <Progress key={r.p} label={r.p} value={`${r.ok} of ${r.decl} values`} fill={r.decl ? (100 * r.ok) / r.decl : 0} tone={r.ok === r.decl ? 'success' : 'attention'} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

/* BELLA's colour tokens in the page's theme, read from its own CSS (CSSOM keeps var() as
   written), sorted into Figma's three tiers: definitions (ramps), theme (background,
   content, border roles) and component (a part's own token pointing at a role). */
const THEME_ROLE = /^--color-(background|content|border)-/;
function useTokenTiers() {
  const [state, setState] = useState(null);
  useEffect(() => {
    const read = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'chip-light';
      const val = new Map();
      for (const sheet of [...document.styleSheets]) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of [...rules]) {
          // ':root, [data-theme=bella-light]' holds the ramps; the theme's own block overrides it after
          const sels = (r.selectorText ?? '').split(',').map((x) => x.trim().replace(/"/g, ''));
          if (!sels.includes(':root') && !sels.includes(`[data-theme=${theme}]`)) continue;
          for (const name of [...r.style]) if (name.startsWith('--')) val.set(name, r.style.getPropertyValue(name).trim());
        }
      }
      const ref = (v) => v?.match(/^var\((--[\w-]+)\)$/)?.[1] ?? null;
      const tierOf = (n) => (THEME_ROLE.test(n) ? 'theme' : n.startsWith('--color-') ? 'definitions' : ref(val.get(n)) && THEME_ROLE.test(ref(val.get(n))) ? 'component' : null);
      const tokens = [...val.keys()].filter((n) => tierOf(n)).map((n) => ({ name: n, tier: tierOf(n), to: ref(val.get(n)) }));
      setState({ tokens, byName: new Map(tokens.map((t) => [t.name, t])) });
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);
  return state;
}

/* Figma's row words: the last step as the name, the rest as its group ("color/brand/blue"). */
function words(t) {
  const bits = t.name.replace(/^--/, '').split('-');
  if (t.tier === 'component') {
    const part = bits.slice(0, 2).join('-');
    return { title: bits.slice(2).join('-') || part, sub: part };
  }
  if (t.tier === 'theme') return { title: bits.slice(2).join('-'), sub: `color/${bits[1]}` };
  return { title: bits[bits.length - 1], sub: bits.slice(0, -1).join('/') };
}

const START = '--nav-list-current-background'; // Figma's picked token
// a group path may break after its slashes, never mid-word: a <wbr>, which a screen reader skips
const slashBreaks = (t) => t.split('/').flatMap((w, i) => (i ? ['/', <wbr key={i} />, w] : [w]));
const TIER_ORDER = { definitions: 0, theme: 1, component: 2 };

/* Tiers (Figma 612:62034): three columns of tokens; picking one marks the chain it sits in,
   from its definition through its theme role to the part that uses it.
   Gaps (named for the library): ListRow has no colour-dot lead, and no part draws the
   curved line from row to row across columns, so the chain shows as selected rows. */
function Tiers() {
  // three columns only where each keeps "color/background" on one line (a 1200 window); below, they stack
  const narrow = useNarrow(1200);
  const data = useTokenTiers();
  const [picked, setPicked] = useState(START);
  if (!data) return null;
  const { tokens, byName } = data;
  const pick = byName.has(picked) ? picked : tokens.find((t) => t.tier === 'component')?.name;
  // the chain: up through what it points at, down to the first token that points at it
  const chain = new Set();
  for (let t = byName.get(pick); t && !chain.has(t.name); t = t.to ? byName.get(t.to) : null) chain.add(t.name);
  for (let name = pick; ; ) {
    const down = tokens.find((t) => t.to === name && !chain.has(t.name));
    if (!down) break;
    chain.add(down.name);
    name = down.name;
  }
  const count = (k) => tokens.filter((t) => t.tier === k).length;
  const total = TIERS.reduce((n, [k]) => n + count(k), 0);
  // each column: its chain token, then three of the same group
  const rows = (k) => {
    const mine = tokens.filter((t) => t.tier === k);
    const hit = mine.find((t) => chain.has(t.name));
    const group = hit ? words(hit).sub : null;
    const others = mine.filter((t) => t !== hit && (!group || words(t).sub === group));
    return [...(hit ? [hit] : []), ...others, ...mine.filter((t) => t !== hit && !others.includes(t))].slice(0, 4);
  };
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="ViewGrid" iconTone="info" title="Tiers" description="Pick a token to see where it comes from and where it goes" number={total} words="colour tokens · 3 tiers" />
        <Flow direction={narrow ? 'column' : 'row'} gap={24} equal>
          {TIERS.map(([k, name, job]) => (
            <Flow key={k} gap={8}>
              <SectionHead title={name} titleLevel={3} description={job} number={count(k)} />
              <Flow as="ul" gap={4} aria-label={`${name} tokens`}>
                {rows(k).map((t) => (
                  // a long group may break after a slash, never mid-word (320)
                  <ListRow key={t.name} layout="stacked" title={words(t).title} description={slashBreaks(words(t).sub)} selected={chain.has(t.name)} trailing onClick={() => setPicked(t.name)} />
                ))}
              </Flow>
            </Flow>
          ))}
        </Flow>
        <TextStack subtitle={[...chain].sort((a, b) => TIER_ORDER[byName.get(a).tier] - TIER_ORDER[byName.get(b).tier]).map((n) => n.replace(/^--/, '')).join(' → ')} />
      </Flow>
    </Card>
  );
}


/* Token problems (Figma 612:62034): one List item each, its status bar, the parts, an Open
   tag, the verb and ›. Send hands the raw values to the agent (a run with each file and line);
   › opens the first part on Components. */
function Problems({ rows }) {
  const problems = rows.filter((r) => r.not.length);
  const [busy, setBusy] = useState(null);
  const [said, setSaid] = useState(null);
  const send = async (r) => {
    setBusy(r.p);
    try {
      const brief = [`Replace raw ${r.p.toLowerCase()} values in BELLA's parts with tokens (${r.tokens}). Each line is file:line and the declaration:`, ...r.not.map((n) => `- ${n.file}:${n.line} ${n.decl}`), 'Use an existing token only; ask before adding or changing one.'].join('\n');
      // the plan opens first (templates/RunPlan.jsx); its Approve sends it and says so
      await planRun({ brief, title: `Tokens for ${r.not.length} ${r.p.toLowerCase()} values`, from: 'Foundations', steps: r.not.map((n, i) => ({ id: `v${i}`, title: `${n.component}: ${n.decl}`, line: `${n.file}:${n.line}` })) });
    } catch (e) {
      if (!e.shown) setSaid({ tone: 'danger', text: `Not sent: ${e.message}.` });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="WarningCircle" iconTone="warning" title="Token problems" description="What breaks the token rules" number={problems.length} words="open" />
        {problems.length ? (
          <Flow as="ul" gap={8} aria-label="Token problems">
            {problems.map((r) => {
              const parts = [...new Set(r.not.map((n) => n.component))];
              return (
                <ListRow
                  key={r.p}
                  layout="stacked"
                  statusBar="attention"
                  title={`${r.not.length} ${r.p.toLowerCase()} ${r.not.length === 1 ? 'value isn’t a token' : 'values aren’t tokens'}`}
                  description={parts.length > 4 ? `${parts.slice(0, 4).join(', ')} and ${parts.length - 4} more` : parts.join(', ')}
                  actionButton={
                    <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => send(r)}>
                      {busy === r.p ? 'Sending…' : 'Send'}
                    </Button>
                  }
                  // one control per row: Send changes something, so the row is not also a link with ↗
                  // (READ FIRST [12]: "Arrows go, buttons do"; audit 3, item 11)
                />
              );
            })}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="✨" title="No token problems" line="Every value in the parts’ CSS reads a token." />
        )}
        {said ? (
          <Toasts>
            <Toast tone={said.tone} onClose={() => setSaid(null)}>
              {said.text}
            </Toast>
          </Toasts>
        ) : null}
      </Flow>
    </Card>
  );
}

/** Every colour role BELLA ships, with its live Chip light and dark value, contrast on the light surface and the parts that use it. */
function useAllRoles(bella) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!bella) return undefined;
    const probe = (theme) => {
      const el = document.createElement('span');
      el.setAttribute('data-theme', theme);
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      document.body.appendChild(el);
      return el;
    };
    const light = probe('chip-light');
    const dark = probe('chip-dark');
    const read = (el, v) => {
      if (!getComputedStyle(el).getPropertyValue(v).trim()) return null;
      el.style.color = `var(${v})`;
      return channels(getComputedStyle(el).color);
    };
    const surface = read(light, '--color-background-surface');
    // an "on X" role is measured on X (ON above), the rest on the light surface
    const groundOf = (t) => (ON[t] && read(light, ON[t][0]) ? over(read(light, ON[t][0]), surface) : surface);
    const nameOf = Object.fromEntries((bella.components ?? []).map((c) => [c.name, c.id]));
    const words = (c) => (c.a < 1 ? `${hex(c)} ${Math.round(c.a * 100)}%` : hex(c));
    const out = Object.keys(bella.palette ?? {})
      .filter((t) => t.startsWith('--color-'))
      .map((t) => {
        const l = read(light, t);
        const d = read(dark, t);
        if (!l || !d || !surface) return null;
        const used = bella.tokenUsage?.[t] ?? [];
        return {
          token: t,
          role: t.replace(/^--color-/, ''),
          light: words(l),
          dark: words(d),
          contrast: /^--color-background-/.test(t) ? 'Base' : `${ratio(over(l, groundOf(t)), groundOf(t)).toFixed(1)}:1${ON[t] ? ` on ${ON[t][1]}` : ''}`,
          ratio: /^--color-background-/.test(t) ? 0 : ratio(over(l, groundOf(t)), groundOf(t)),
          used: used.length,
          firstPart: used[0] ? nameOf[used[0]] ?? null : null,
        };
      })
      .filter(Boolean);
    light.remove();
    dark.remove();
    setRows(out);
  }, [bella]);
  return rows;
}

const VIEWS = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
];

function RolesTable({ rows, total }) {
  const columns = [
    // role names in Geist Mono (TextStack's subtext face), as Figma and the type rule
    { key: 'role', label: 'Role', sortable: true, render: (r) => <TextStack subtitle={r.role} /> },
    // a swatch square per cell, the role's colour in that column's theme, its hex beside it in the number face
    { key: 'light', label: 'Light', sortable: true, kind: 'swatch', swatch: (r) => `var(${r.token})`, swatchTheme: 'chip-light' },
    { key: 'dark', label: 'Dark', sortable: true, kind: 'swatch', swatch: (r) => `var(${r.token})`, swatchTheme: 'chip-dark' },
    // the contrast pill (her table pick, 22 Nov: "build it with our components"): a Tag with the ratio as its count
    // (number face, the tone's ink), success when it clears 7:1 for a text role or 3:1 for any other, attention when
    // not, and then the line under it says "below 7:1" in words, never colour alone. Grounds are the base, no ratio.
    {
      key: 'contrast',
      label: 'Contrast',
      sortable: true,
      sortValue: (r) => r.ratio,
      render: (r) => {
        if (!r.ratio) return r.contrast;
        const bar = /^--color-content-/.test(r.token) ? 7 : 3;
        const ok = r.ratio >= bar;
        // the pill holds the ratio alone; the ground it was measured on, or how far short it falls, sits under it
        // in the subtext face, so the column stays the width of its head
        const note = [ON[r.token] ? `on ${ON[r.token][1]}` : null, ok ? null : `below ${bar}:1`].filter(Boolean).join(', ');
        return (
          <Flow gap={4}>
            <Tag tone={ok ? 'success' : 'attention'} count={`${r.ratio.toFixed(1)}:1`} />
            {note ? <TextStack subtitle={note} /> : null}
          </Flow>
        );
      },
    },
    {
      key: 'used',
      label: 'Used by',
      numeric: true,
      sortable: true,
      // "parts", not Figma's "components": the shorter word keeps the cell on one line at 1100
      render: (r) => (r.used ? <Link href={r.firstPart ? `#/components/${r.firstPart}` : '#/components'}>{`${r.used} ${r.used === 1 ? 'part' : 'parts'}`}</Link> : 'Nothing'),
    },
  ];
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="Palette" iconTone="info" title="Roles" description="What each colour is for, one job each" />
        {rows.length ? (
          <DataTable caption="Colour roles in the Chip theme" columns={columns} rows={rows} rowKey="token" defaultSort={{ key: 'used', direction: 'descending' }} maxHeight="calc(var(--spacing-80) * 5)" />
        ) : (
          <EmptyState size="lane" mark="🔎" title="No role matches" line="Nothing by that name. Try fewer letters." />
        )}
        <TextStack body={`Read from BELLA's tokens and each component's CSS · ${rows.length} of ${total} shown${rows.length > 8 ? ', scroll for the rest' : ''}.`} />
      </Flow>
    </Card>
  );
}

/* Shape and space (Figma 808:82396): every corner token and every spacing step. */
// small to large, as the names read ("md, lg")
const SIZE_WORDS = ['none', 'sm', 'md', 'lg', 'lg-focus', 'form', 'card'];
function ShapeAndSpace({ radius }) {
  // each corner's names: the Chip names the app's CSS really uses at that size, else the size alone
  const used = useInUse('--border-radius-');
  const useOf = (step) => {
    if (!used) return undefined;
    const px = step === 'round' ? '999px' : `${step}px`;
    const names = used.filter((u) => u.value === px && !/^--border-radius-(\d+|round)$/.test(u.name)).map((u) => u.name.replace('--border-radius-', ''))
      .sort((a, b) => SIZE_WORDS.indexOf(a) - SIZE_WORDS.indexOf(b));
    return names.length ? `${names.join(', ')} · ${px}` : px;
  };
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="ViewGrid" iconTone="warning" title="Shape and space" description="Every corner token and every spacing step" />
        <TextStack title="Radius" />
        {/* each corner token on BELLA's RadiusTile (bd87f14): the tile, its token and Chip's names for it */}
        <Flow as="ul" direction="row" gap={24} wrap aria-label="Corner tokens">
          {radius.map((r) => (
            <li key={r.token}>
              <RadiusTile radius={r.name} use={useOf(r.name)} />
            </li>
          ))}
        </Flow>
        <TextStack title="Spacing" />
        <Flow gap={8}>
          {[1, 2, 3, 4, 5, 6, 8, 10, 'touch', 12, 16, 20].map((s) => (
            <SpacingStep key={s} step={s} />
          ))}
        </Flow>
        <TextStack body="Read from the Foundations variables: border radius (Chip light) and spacing. Each corner names what CHIP's CSS uses at that size." />
      </Flow>
    </Card>
  );
}

/* A duration's job in a word or two, from its token description ("Hover lift on interactive cards (ms)" → "hover lift"); none for a bare value. */
const jobOf = (d) => (/^Value:/.test(d ?? '') ? null : String(d ?? '').replace(/\s*\(ms\)\.?$/, '').split(/ on | of /)[0].replace(/\.$/, '').toLowerCase() || null);

/* Motion (Figma 810:82446): how long things take, to scale, and how they ease. */
function Motion({ motion }) {
  // durations beside easings only where a DurationBar keeps about 480 (a 1440 window); narrower, its token runs under its bar, so they stack
  const narrow = useNarrow(1440);
  const longest = Math.max(...motion.durations.map((d) => d.ms));
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="Clock" iconTone="warning" title="Motion" description="How long things take and how they ease" />
        <Flow direction={narrow ? 'column' : 'row'} gap={24} equal>
          <Flow gap={12}>
            <TextStack title="Duration" />
            {/* BELLA's DurationBar (bd87f14): the token, its job where the token names one, to scale */}
            {motion.durations.map((d) => (
              <DurationBar key={d.token} duration={d.ms} use={jobOf(d.description) ?? undefined} />
            ))}
          </Flow>
          <Flow gap={12}>
            <TextStack title="Easing" />
            {/* BELLA's EasingCurve (bd87f14): the curve, its token and its cubic-bezier */}
            {motion.easings.map((e) => (
              <EasingCurve key={e.token} easing={e.name} />
            ))}
          </Flow>
        </Flow>
        <TextStack body={`Read from the Foundations variables: motion duration and easing. Bars are to scale, ${longest}ms full.`} />
      </Flow>
    </Card>
  );
}

/* Who uses what (Figma 807:82398): every colour role a part's CSS reads, most used first, with the parts that read it. */
function WhoUsesWhat({ bella }) {
  const usage = bella.tokenUsage ?? {};
  const roles = Object.keys(bella.palette ?? {}).filter((t) => t.startsWith('--color-'));
  const rows = roles
    .map((t) => ({ token: t, role: t.replace(/^--color-/, ''), used: (usage[t] ?? []).length, parts: [...(usage[t] ?? [])].sort().join(', ') }))
    .filter((r) => r.used)
    .sort((a, b) => b.used - a.used || a.role.localeCompare(b.role));
  const unused = roles.length - rows.length;
  const columns = [
    { key: 'role', label: 'Role', sortable: true, render: (r) => <TextStack subtitle={r.role} /> },
    // numeric: DataTable sets it in the number face (parts-dev 4372bee)
    { key: 'used', label: 'Used by', numeric: true, sortable: true },
    { key: 'parts', label: 'Components', sortable: true },
  ];
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="Table" iconTone="warning" title="Who uses what" description="Which components use each colour role, most used first" />
        <DataTable caption="Colour roles and the components that use them" columns={columns} rows={rows} rowKey="token" defaultSort={{ key: 'used', direction: 'descending' }} maxHeight="calc(var(--spacing-80) * 6)" />
        <TextStack body={`Read from each component's CSS · ${rows.length} roles in use, scroll for the rest; ${unused} ${unused === 1 ? 'role is' : 'roles are'} used by nothing.`} />
      </Flow>
    </Card>
  );
}

export default function FoundationsContent({ view: startView = 'cards' }) {
  const roles = useRoles();
  const { data, error } = useCached(['/data/foundations.json', '/data/bella.json']);
  const all = useAllRoles(data?.[1] ?? null);
  const [view, setView] = useState(startView);
  // below 800 the bar stacks: the filter and chips, then the switch on its own row at the right
  const phone = useNarrow();
  const [q, setQ] = useState('');
  const [used, setUsed] = useState('all');
  if (error) return <EmptyState size="page" title="Foundations isn't answering" line="CHIP couldn't read BELLA's token files. Run the sync and refresh." />;
  if (!data || !roles || !all) return <EmptyState size="page" title="Reading BELLA's tokens" line="Colours, type and steps. Two ticks." />;
  const f = data[0];
  const usage = data[1].tokenUsage ?? {};
  const words = q.trim().toLowerCase();
  const keep = (token, name = '') => (!words || token.includes(words) || name.toLowerCase().includes(words)) && (used === 'all' || (used === 'used') === (usage[token]?.length ?? 0) > 0);
  // a role's name finds its colours in the table too (the ↗ on each role group opens them there)
  const groupOf = Object.fromEntries(roles.flatMap((g) => g.items.map((i) => [i.token, g.name])));
  const tableRows = all.filter((r) => keep(r.token, groupOf[r.token] ?? ''));
  const cardRoles = roles.map((g) => ({ ...g, items: g.items.filter((i) => keep(i.token, `${g.name} ${i.name}`)) }));
  const usedN = all.filter((r) => r.used).length;
  return (
    <>
      {/* Control bar on the page ground: what you look at on the left (filter, chips), the view switch on the right */}
      {/* the switch keeps the right end at every width: the left group wraps (filter, then chips), never the bar (audit 9 at 1024 and 1100) */}
      <Flow direction={phone ? 'column' : 'row'} gap={16} justify="between" align="start" grow={phone ? undefined : 'first'}>
        <Flow direction="row" gap={12} wrap align="center">
          {/* Figma: the field with its search mark and placeholder, no label row above it (audit 11) */}
          <SearchField label="Filter colour roles" placeholder="Filter colour roles…" showShortcut={false} value={q} onChange={setQ} />
          <Flow direction="row" gap={8} wrap align="center" aria-label="Which roles">
            <FilterChip pressed={used === 'all'} onClick={() => setUsed('all')}>{`All ${all.length}`}</FilterChip>
            <FilterChip pressed={used === 'used'} onClick={() => setUsed('used')}>{`Used ${usedN}`}</FilterChip>
            <FilterChip pressed={used === 'unused'} onClick={() => setUsed('unused')}>{`Used by nothing ${all.length - usedN}`}</FilterChip>
          </Flow>
        </Flow>
        <Flow direction="row" justify="end" stretch={phone}>
          <SegmentedControl options={VIEWS} value={view} onChange={setView} label="Show the roles as" />
        </Flow>
      </Flow>
      {view === 'table' ? (
        <RolesTable rows={tableRows} total={all.length} />
      ) : (
        <Roles roles={cardRoles} onOpen={(name) => (setQ(name), setView('table'))} empty={<EmptyState size="lane" mark="🔎" title="No role matches" line="Nothing by that name. Try fewer letters." />} />
      )}
      {/* Figma's Foundations sections (decided 18 Nov): who uses what after the roles */}
      <WhoUsesWhat bella={data[1]} />
      {/* the scales row: type ramp and tokenized fill it (Figma 21 Nov: the 7-step Spacing card gives way to the full scale below) */}
      {/* list cards hug their rows (rule 15), so Card's centring (0bc08b6) never pushes a header down */}
      <Flow span={6}>
        <TypeRamp />
      </Flow>
      <Flow span={6}>
        <Tokenized rows={f.tokenized.rows} source={f.source} />
      </Flow>
      <ShapeAndSpace radius={f.radius} />
      {f.motion ? <Motion motion={f.motion} /> : null}
      <Tiers />
      <Problems rows={f.tokenized.rows} />
    </>
  );
}
