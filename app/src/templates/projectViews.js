// The tabs under a page's header (CHIP / Screen), one list so a tab is added or renamed once. Elleta, 23 Nov:
// Health holds Overview and Work; System holds Components, Foundations and History; Playground is its own
// item with no tabs. Each page's tab row therefore has only two or three tabs.
export const VIEW_GROUPS = [
  {
    id: 'health',
    label: 'Health',
    tabs: [
      { id: 'overview', label: 'Overview', href: '#/health' },
      { id: 'work', label: 'Work', href: '#/health/work' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    tabs: [
      { id: 'components', label: 'Components', href: '#/system/components' },
      { id: 'foundations', label: 'Foundations', href: '#/system/foundations' },
      { id: 'history', label: 'History', href: '#/system/history' },
    ],
  },
];

/** Every tab with its group, for the breadcrumb and the menu. */
export const PROJECT_VIEWS = VIEW_GROUPS.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g.id, groupLabel: g.label })));

/** Tabs props for a page: `current` is the tab you are on; the row is that tab's group. */
export function projectTabs(current) {
  const group = VIEW_GROUPS.find((g) => g.tabs.some((t) => t.id === current)) ?? VIEW_GROUPS[0];
  return {
    items: group.tabs.map(({ id, label }) => ({ id, label })),
    value: current,
    onChange: (id) => {
      const v = group.tabs.find((x) => x.id === id);
      if (v && id !== current) window.location.hash = v.href;
    },
    label: `${group.label} views`,
    idBase: `${group.id}-views`,
  };
}
