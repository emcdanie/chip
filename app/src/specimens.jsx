// One example render per BELLA component, for the Specimen stage. These are
// sample props, like a story's args: they show the component, they are not
// anatomy. Anatomy (the numbered parts) only comes from bella.json.
import React from 'react';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Avatar from '@bella/components/Avatar/Avatar';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import Combobox from '@bella/components/Combobox/Combobox';
import BrandWordmark from '@bella/components/BrandWordmark/BrandWordmark';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import DataTable from '@bella/components/DataTable/DataTable';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Heading from '@bella/components/Heading/Heading';
import Icon from '@bella/components/Icon/Icon';
import Input from '@bella/components/Input/Input';
import Kbd from '@bella/components/Kbd/Kbd';
import Link from '@bella/components/Link/Link';
import NavList from '@bella/components/NavList/NavList';
import PatternField from '@bella/components/PatternField/PatternField';
import ResourceCard from '@bella/components/ResourceCard/ResourceCard';
import ScaledFrame from '@bella/components/ScaledFrame/ScaledFrame';
import SectionHeader from '@bella/components/SectionHeader/SectionHeader';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Stat from '@bella/components/Stat/Stat';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Tabs from '@bella/components/Tabs/Tabs';
import Tag from '@bella/components/Tag/Tag';

const noop = () => {};

// every component imported here, by its name: Atlas writes a specimen out as JSX with these
export const COMPONENTS = { ActionChip, Avatar, CodeBlock, Combobox, BrandWordmark, Button, Card, DataTable, Disclosure, Eyebrow, FilterChip, Heading, Icon, Input, Kbd, Link, NavList, PatternField, ResourceCard, ScaledFrame, SectionHeader, SegmentedControl, Select, Stat, StatusPill, Tabs, Tag };

export const SPECIMENS = {
  Avatar: () => <Avatar name="Ada Lovelace" size="lg" ring />,
  BrandWordmark: () => <BrandWordmark word="BELLA" variant="ink" size="nav" />,
  Button: () => <Button variant="primary">Save changes</Button>,
  // interactive, so its hover and focus layers exist to be shown
  Card: () => (
    <Card href="#specimen">
      <p style={{ margin: 0 }}>A card that links somewhere.</p>
    </Card>
  ),
  // Figma's CodeBlock specimen (Components 612:57717)
  CodeBlock: () => (
    <CodeBlock
      title="Button.tsx"
      language="tsx"
      lineNumbers
      copy
      code={`import { Button } from 'bella';\n\n<Button variant="primary">Copy</Button>\n// one primary per view: the rest are secondary\n<Button variant="secondary">Title</Button>`}
    />
  ),
  ActionChip: () => <ActionChip onClick={noop}>Try in sandbox</ActionChip>,
  Disclosure: () => (
    <div style={{ inlineSize: 'calc(var(--spacing-20) * 4)' }}>
      <Disclosure title="Checks" summary="5 of 5 pass">
        <p style={{ margin: 0 }}>Every check passes.</p>
      </Disclosure>
    </div>
  ),
  Combobox: () => <Combobox label="Ask OBI or jump to" hideLabel value="" onChange={noop} groups={[]} onSelect={noop} placeholder="Ask OBI or jump to…" />,
  DataTable: () => <DataTable {...tableArgs(CONTROLS.DataTable.start)} />,
  Eyebrow: () => <Eyebrow>Design system</Eyebrow>,
  FilterChip: () => (
    <FilterChip pressed={false} onClick={noop}>
      Accessible
    </FilterChip>
  ),
  Heading: () => (
    <Heading tier="section" as="h2">
      Work that holds its shape
    </Heading>
  ),
  Icon: () => <Icon name="ViewGrid" size="lg" />,
  Input: () => <Input label="Email" value="" onChange={noop} placeholder="you@example.com" />,
  Kbd: () => <Kbd keys={['⌘', 'K']} label="Command K" />,
  Link: () => <Link href="#specimen">Read the case</Link>,
  NavList: () => (
    <NavList
      label="Sample"
      groups={[{ items: [{ href: '#a', label: 'Overview', current: true }, { href: '#b', label: 'Details' }] }]}
    />
  ),
  PatternField: () => (
    <div style={{ inlineSize: 'calc(var(--spacing-20) * 4)', blockSize: 'calc(var(--spacing-20) * 2)', position: 'relative' }}>
      <PatternField seed={7} />
    </div>
  ),
  ResourceCard: () => (
    <div style={{ inlineSize: 'calc(var(--spacing-20) * 4)' }}>
      <ResourceCard type="Article" title="Tokens as the contract" description="Why the token file is the API." href="#specimen" />
    </div>
  ),
  ScaledFrame: () => (
    <div style={{ inlineSize: 'calc(var(--spacing-20) * 4)' }}>
      <ScaledFrame title="Sample frame" designWidth={800} designHeight={500}>
        <p style={{ margin: 'var(--spacing-8)' }}>Scaled content</p>
      </ScaledFrame>
    </div>
  ),
  SectionHeader: () => <SectionHeader heading="Pattern studies" lead="Course briefs, prototypes and hackathons." />,
  SegmentedControl: () => (
    <SegmentedControl
      label="View"
      value="cards"
      onChange={noop}
      options={[
        { value: 'cards', label: 'Cards' },
        { value: 'table', label: 'Table' },
      ]}
    />
  ),
  Select: () => (
    <Select label="Sort" value="new" onChange={noop} options={[{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }]} />
  ),
  Stat: () => <Stat label="Components" value={24} delta="6 since last sync" trend="up" />,
  StatusPill: () => <StatusPill variant="success">Passing</StatusPill>,
  Tabs: () => (
    <Tabs
      label="Sample"
      idBase="spec"
      value="bella"
      onChange={noop}
      tabs={[
        { id: 'bella', label: 'BELLA', status: 'running' },
        { id: 'chip', label: 'CHIP', status: 'idle' },
      ]}
    />
  ),
  Tag: () => <Tag>Case study</Tag>,
};

// One render per contract variant, for Atlas's variants card. Only where the
// contract's variants map straight to a prop; anything else gets no card.
export const VARIANTS = {
  Button: (v) => <Button variant={v}>{v[0].toUpperCase() + v.slice(1)}</Button>,
  Tag: (v) => <Tag variant={v}>{v}</Tag>,
  StatusPill: (v) => <StatusPill variant={v}>{v}</StatusPill>,
  Eyebrow: (v) => <Eyebrow variant={v}>{v}</Eyebrow>,
};

// One render per contract shape, for Atlas's Variants tab. The pill's label is
// the contract's own ("Let's talk", Button usage).
export const SHAPES = {
  Button: (s) => (
    <Button variant="primary" shape={s}>
      {s === 'pill' ? 'Let’s talk' : 'Save changes'}
    </Button>
  ),
};

// The component itself and the specimen's props, for Atlas's Playground: its
// prop controls render this, not the fixed specimen.
export const PLAY = {
  Button: { C: Button, children: 'Save changes' },
  FilterChip: { C: FilterChip, children: 'Accessible', props: { pressed: false, onClick: noop } },
  ActionChip: { C: ActionChip, children: 'Try in sandbox', props: { onClick: noop } },
  Tag: { C: Tag, children: 'Case study' },
  StatusPill: { C: StatusPill, children: 'Passing' },
  Eyebrow: { C: Eyebrow, children: 'Design system' },
};

// Playground Controls (Figma "controls open" 612:138211): each part's props as
// rows with their current value; a click moves a row to its next value. The
// first value is the specimen's own. Theme sits on every part.
const SAMPLE_ROWS = [
  { name: 'Alpha', count: 12 },
  { name: 'Beta', count: 3 },
  { name: 'Gamma', count: 7 },
  { name: 'Delta', count: 21 },
  { name: 'Epsilon', count: 5 },
];
function tableArgs(v) {
  const sortable = v.sortable === 'On';
  // Figma's specimen is CHIP's own component health (Component, Contract, a count); the page passes the real rows as v.data
  const real = Array.isArray(v.data) && v.data.length;
  return {
    caption: real ? 'Component health, latest run' : 'Sample',
    rowKey: 'name',
    density: v.density === 'Compact' ? 'compact' : 'default',
    columns: real
      ? [
          { key: 'name', label: 'Component', sortable },
          { key: 'contract', label: 'Contract', sortable },
          { key: 'checks', label: 'Checks pass', numeric: true, sortable },
        ]
      : [
          { key: 'name', label: 'Name', sortable },
          { key: 'count', label: 'Count', numeric: true, sortable },
        ],
    rows: (real ? v.data : SAMPLE_ROWS).slice(0, Number(v.rows)),
    ...(v.select === 'On' ? { selectedKey: v.selected ?? null, onSelect: v.onSelected ?? noop } : {}),
    ...(v.sticky === 'On' ? { maxHeight: 'calc(var(--spacing-44) * 4)' } : {}),
  };
}
export const THEME = { key: 'theme', label: 'Theme', options: ['Light', 'Dark'] };
export const CONTROLS = {
  DataTable: {
    rows: [
      { key: 'density', label: 'Density', options: ['Comfortable', 'Compact'] },
      { key: 'rows', label: 'Rows', options: ['5', '3', '10'] },
      { key: 'sortable', label: 'Sortable', options: ['On', 'Off'] },
      { key: 'select', label: 'Row select', options: ['Off', 'On'] },
      { key: 'sticky', label: 'Sticky header', options: ['Off', 'On'] },
    ],
    start: { density: 'Comfortable', rows: '5', sortable: 'On', select: 'Off', sticky: 'Off' },
    render: (v) => <DataTable {...tableArgs(v)} />,
  },
  ...Object.fromEntries(
    Object.entries({ Button: ['primary', 'secondary', 'tertiary'], Tag: ['default', 'accent', 'outline', 'flat', 'index'], StatusPill: ['success', 'info', 'neutral', 'attention', 'danger', 'accent', 'quiet', 'serving'], Eyebrow: ['muted', 'ink'] }).map(([name, opts]) => [
      name,
      { rows: [{ key: 'variant', label: 'Variant', options: opts }], start: { variant: opts[0] }, render: (v) => VARIANTS[name](v.variant) },
    ]),
  ),
};
