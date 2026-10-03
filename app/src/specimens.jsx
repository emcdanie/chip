// One example render per BELLA component, for the Specimen stage. These are
// sample props, like a story's args: they show the component, they are not
// anatomy. Anatomy (the numbered parts) only comes from bella.json.
import React from 'react';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Avatar from '@bella/components/Avatar/Avatar';
import Combobox from '@bella/components/Combobox/Combobox';
import BrandWordmark from '@bella/components/BrandWordmark/BrandWordmark';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import DataTable from '@bella/components/DataTable/DataTable';
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
import ScoreStrip from '@bella/components/ScoreStrip/ScoreStrip';
import SectionHeader from '@bella/components/SectionHeader/SectionHeader';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Stat from '@bella/components/Stat/Stat';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Tabs from '@bella/components/Tabs/Tabs';
import Tag from '@bella/components/Tag/Tag';

const noop = () => {};

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
  ActionChip: () => <ActionChip onClick={noop}>Try in sandbox</ActionChip>,
  Combobox: () => <Combobox label="Ask OBI or jump to" hideLabel value="" onChange={noop} groups={[]} onSelect={noop} placeholder="Ask OBI or jump to…" />,
  DataTable: () => (
    <DataTable
      caption="Sample"
      rowKey="name"
      columns={[
        { key: 'name', label: 'Name', sortable: true },
        { key: 'count', label: 'Count', numeric: true, sortable: true },
      ]}
      rows={[
        { name: 'Alpha', count: 12 },
        { name: 'Beta', count: 3 },
      ]}
    />
  ),
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
  ScoreStrip: () => (
    <div style={{ inlineSize: 'calc(var(--spacing-20) * 7)' }}>
      <ScoreStrip
        name="Sample"
        score={81}
        cells={[
          { label: 'A11y', value: 92 },
          { label: 'Docs', value: 70 },
          { label: 'Test', value: 55 },
          { label: 'Gov', value: null },
        ]}
      />
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
  Button: (v) => <Button variant={v}>{v}</Button>,
  Tag: (v) => <Tag variant={v}>{v}</Tag>,
  StatusPill: (v) => <StatusPill variant={v}>{v}</StatusPill>,
  Eyebrow: (v) => <Eyebrow variant={v}>{v}</Eyebrow>,
};
