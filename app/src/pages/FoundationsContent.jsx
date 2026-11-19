// Foundations · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:61970, state default 612:60963). Roles (each colour's one job), the
// type ramp, the spacing steps, how much of the parts' CSS reads a token,
// the three token tiers, and the token problems. Real data only: the colours
// are BELLA's live Chip light values read from its CSS, their ratios measured
// against the surface; the rest is data/foundations.json (sync-foundations,
// from BELLA's token files and its parts' CSS). BELLA parts and Flow only.
//
// The control bar (Figma 612:60963 / table 800:79888): filter the colour
// roles by name, All / Used / Used by nothing, and the Cards | Table switch
// (Elleta, 20 Nov: "B, the switch"). The Table lists every colour role BELLA
// ships with its Chip light and dark values, contrast on the surface and the
// parts that use it (data/bella.json palette and tokenUsage).
//
// Gaps: DataTable takes no cell kind, so the Light and Dark columns show the
// hex without Figma's colour chip (TableCell has kind=swatch; DataTable
// doesn't pass it); Figma's Columns menu waits on that too. The tier chain (Figma: pick a token, see where it comes from and
// where it goes, drawn with connectors) waits on the connector tile; the
// Figma states sent to Claude / checking / tested / check failed wait on a
// fix route for token problems (CHIP has none yet).
import { useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Swatch from '@bella/components/Swatch/Swatch';
import TypeSpecimen from '@bella/components/TypeSpecimen/TypeSpecimen';
import SpacingStep from '@bella/components/SpacingStep/SpacingStep';
import Progress from '@bella/components/Progress/Progress';
import ListRow from '@bella/components/ListRow/ListRow';
import Button from '@bella/components/Button/Button';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import DataTable from '@bella/components/DataTable/DataTable';
import Link from '@bella/components/Link/Link';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';

// Figma's role groups and the Chip token behind each swatch; `fill` marks a
// colour that sits under text (its ratio is not the point), `base` the grounds
const ROLES = [
  { name: 'Surface', job: 'what things sit on', items: [['surface', '--color-background-surface', 'base'], ['ground', '--color-background-default', 'base'], ['subtle', '--color-background-subtle', 'base']] },
  { name: 'Text', job: 'words, strongest to quietest', items: [['default', '--color-content-default'], ['body', '--color-content-body'], ['subtle', '--color-content-subtle']] },
  { name: 'Border', job: 'edges and dividers', items: [['default', '--color-border-default'], ['strong', '--color-border-strong'], ['ink', '--color-border-ink']] },
  { name: 'Action', job: 'only what you can press', items: [['action', '--color-background-brand', 'fill'], ['on action', '--color-content-brand-knockout'], ['selected', '--color-background-brand-subtle-hover', 'fill']] },
  { name: 'Status', job: 'only for state', items: [['success', '--color-border-utility-success'], ['attention', '--color-background-utility-warning-mark'], ['danger', '--color-border-utility-error'], ['warning', '--color-border-utility-warning'], ['info', '--color-border-utility-info']] },
  { name: 'Highlight', job: 'annotation, focus and the logo', items: [['wash', '--color-background-utility-warning', 'fill'], ['focus', '--color-border-focus'], ['pin', '--color-background-accent-1']] },
];
// Figma's type ramp: the TypeSpecimen size and the token that sets it
const RAMP = [
  ['display-page', 'page', '--typography-font-size-display-page'],
  ['display-section', 'section', '--typography-font-size-display-section'],
  ['subsection', 'subsection', '--typography-font-size-28'],
  ['xl', 'xl', '--typography-font-size-22'],
  ['base', 'base', '--typography-font-size-20'],
];
const STEPS = [1, 2, 3, 4, 6, 8, 'touch'];
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

/** Each role's live colour in Chip light, read through a probe so var() chains resolve. */
function useRoles() {
  const [roles, setRoles] = useState(null);
  useEffect(() => {
    const probe = document.createElement('span');
    probe.setAttribute('data-theme', 'chip-light');
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
            const solid = over(c, surface);
            const words = c.a < 1 ? `${hex(c)} at ${Math.round(c.a * 100)}%` : hex(c);
            return { name, token, color: `var(${token})`, hex: words, ratio: kind ?? `${ratio(solid, surface).toFixed(1)}:1` };
          })
          .filter(Boolean),
      })),
    );
    probe.remove();
  }, []);
  return roles;
}

function Roles({ roles, empty }) {
  // two groups to a row need about 1040 of content (the panel takes 400 of the window); below that one group per row, so a name never breaks mid-word
  const narrow = useNarrow(1440);
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
                  <TextStack title={g.name} body={g.job} />
                  {/* three to a row in equal columns, as Figma; a short last row keeps the column widths */}
                  <Flow as="ul" gap={8} aria-label={`${g.name} colours`}>
                    {[0, 3].filter((i) => i < g.items.length).map((i) => (
                      <Flow key={i} direction="row" gap={8} equal>
                        {[0, 1, 2].map((k) => {
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

function TypeRamp() {
  const [sizes, setSizes] = useState({});
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    setSizes(Object.fromEntries(RAMP.map(([, , v]) => [v, root.getPropertyValue(v).trim()])));
  }, []);
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead size="card" icon="Page" iconTone="info" title="Type ramp" description={`${RAMP.length} sizes in use`} showDescription />
        <Flow gap={8}>
          {RAMP.map(([size, name, v]) => (
            <TypeSpecimen key={size} size={size} name={name} sizeLabel={sizes[v] || '—'} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

function Spacing() {
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead size="card" icon="ViewGrid" iconTone="info" title="Spacing" description="The 4-point steps" showDescription />
        <Flow gap={8}>
          {STEPS.map((s) => (
            <SpacingStep key={s} step={s} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

function Tokenized({ rows }) {
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead size="card" icon="Code" iconTone="info" title="Tokenized" description="Values that use a token" showDescription />
        <Flow gap={12}>
          {rows.map((r) => (
            <Progress key={r.p} label={r.p} value={`${r.ok} of ${r.decl} values`} fill={r.decl ? (100 * r.ok) / r.decl : 0} tone={r.ok === r.decl ? 'success' : 'attention'} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

function Tiers({ tiers }) {
  const narrow = useNarrow();
  const total = TIERS.reduce((n, [k]) => n + (tiers[k] ?? 0), 0);
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="ViewGrid" iconTone="info" title="Tiers" description="Where a token sits: definitions feed the theme, the theme feeds parts" number={total} words="tokens · 3 tiers" />
        <Flow direction={narrow ? 'column' : 'row'} gap={24} equal>
          {TIERS.map(([k, name, job]) => (
            <Flow key={k} gap={4}>
              <Flow direction="row" justify="between" gap={8}>
                <TextStack title={name} />
                <TextStack title={String(tiers[k])} />
              </Flow>
              <TextStack body={job} />
            </Flow>
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function Problems({ rows }) {
  const problems = rows.filter((r) => r.not.length);
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
                  title={`${r.not.length} ${r.p.toLowerCase()} ${r.not.length === 1 ? 'value isn’t a token' : 'values aren’t tokens'}`}
                  meta={parts.length > 4 ? `${parts.slice(0, 4).join(', ')} and ${parts.length - 4} more` : parts.join(', ')}
                  actionButton={
                    <Button variant="secondary" size="sm" href={`#/components/${kebab(parts[0])}`}>
                      Open
                    </Button>
                  }
                />
              );
            })}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="✨" title="No token problems" line="Every value in the parts’ CSS reads a token." />
        )}
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
          contrast: /^--color-background-/.test(t) ? 'Base' : `${ratio(over(l, surface), surface).toFixed(1)}:1`,
          ratio: /^--color-background-/.test(t) ? 0 : ratio(over(l, surface), surface),
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
    { key: 'role', label: 'Role', sortable: true },
    { key: 'light', label: 'Light', sortable: true },
    { key: 'dark', label: 'Dark', sortable: true },
    { key: 'contrast', label: 'Contrast', sortable: true, sortValue: (r) => r.ratio },
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

export default function FoundationsContent({ view: startView = 'cards' }) {
  const roles = useRoles();
  const { data, error } = useCached(['/data/foundations.json', '/data/bella.json']);
  const all = useAllRoles(data?.[1] ?? null);
  const [view, setView] = useState(startView);
  const [q, setQ] = useState('');
  const [used, setUsed] = useState('all');
  if (error) return <EmptyState size="page" title="Foundations isn't answering" line="CHIP couldn't read BELLA's token files. Run the sync and refresh." />;
  if (!data || !roles || !all) return <EmptyState size="page" title="Reading BELLA's tokens" line="Colours, type and steps. Two ticks." />;
  const f = data[0];
  const usage = data[1].tokenUsage ?? {};
  const words = q.trim().toLowerCase();
  const keep = (token, name = '') => (!words || token.includes(words) || name.toLowerCase().includes(words)) && (used === 'all' || (used === 'used') === (usage[token]?.length ?? 0) > 0);
  const tableRows = all.filter((r) => keep(r.token));
  const cardRoles = roles.map((g) => ({ ...g, items: g.items.filter((i) => keep(i.token, `${g.name} ${i.name}`)) }));
  const usedN = all.filter((r) => r.used).length;
  return (
    <>
      {/* Control bar on the page ground: what you look at on the left (filter, chips), the view switch on the right */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        <Flow direction="row" gap={12} wrap align="center">
          <Input label="Filter colour roles" leadingIcon="Search" placeholder="Filter colour roles…" value={q} onChange={setQ} />
          <Flow direction="row" gap={8} wrap align="center" aria-label="Which roles">
            <FilterChip pressed={used === 'all'} onClick={() => setUsed('all')}>{`All ${all.length}`}</FilterChip>
            <FilterChip pressed={used === 'used'} onClick={() => setUsed('used')}>{`Used ${usedN}`}</FilterChip>
            <FilterChip pressed={used === 'unused'} onClick={() => setUsed('unused')}>{`Used by nothing ${all.length - usedN}`}</FilterChip>
          </Flow>
        </Flow>
        <SegmentedControl options={VIEWS} value={view} onChange={setView} label="Show the roles as" />
      </Flow>
      {view === 'table' ? (
        <RolesTable rows={tableRows} total={all.length} />
      ) : (
        <Roles roles={cardRoles} empty={<EmptyState size="lane" mark="🔎" title="No role matches" line="Nothing by that name. Try fewer letters." />} />
      )}
      <Flow span={4} fill>
        <TypeRamp />
      </Flow>
      <Flow span={4} fill>
        <Spacing />
      </Flow>
      <Flow span={4} fill>
        <Tokenized rows={f.tokenized.rows} />
      </Flow>
      {f.tiers ? <Tiers tiers={f.tiers} /> : null}
      <Problems rows={f.tokenized.rows} />
    </>
  );
}
