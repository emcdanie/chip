// #/kit: every shared piece from kit/ on live data, so the page rebuilds can
// be checked against the mock one piece at a time. The table is the system
// map's nodes (/map); the card and the pills are BELLA's checks (/checks).
import React, { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Card, DataTable, Drawer, FilterGroup, PageHeader, Segmented, Sheet, StatusPill, Toggle, segPanelProps } from './kit/index.jsx';

const STATE = { ok: ['pass', 'Healthy'], bad: ['fail', 'Failing'], blocked: ['needs', 'Blocked'] };
const stateOf = (s) => STATE[s] ?? ['neutral', s];
const CHECK = { passed: ['pass', 'Passed'], failed: ['fail', 'Failed'] };
const checkOf = (c) => CHECK[c.status] ?? ['needs', c.word ?? 'Waiting on you'];
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

// the mock's two segmented icons: the gate's shield, and the grid
const SHIELD = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor" />
    <path d="m8.5 12 2.5 2.5 4.5-5" stroke="var(--card)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GRID = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="currentColor" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill="currentColor" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

function ChecksCard({ id, checks }) {
  const [view, setView] = useState('gate');
  const groups = { gate: checks.filter((c) => c.gate), other: checks.filter((c) => !c.gate) };
  const failing = groups[view].filter((c) => c.status === 'failed').length;
  return (
    <Card
      title="Checks"
      sub={failing ? `${failing} of ${groups[view].length} failing` : `All ${groups[view].length} passing`}
      action={
        <Segmented
          id={id}
          label="Checks view"
          value={view}
          onChange={setView}
          items={[
            { id: 'gate', label: 'Gate', icon: SHIELD },
            { id: 'other', label: 'Bench', icon: GRID },
          ]}
        />
      }
    >
      {['gate', 'other'].map((k) => (
        <div key={k} {...segPanelProps(id, k, view)}>
          <ul className="k-list">
            {groups[k].map((c) => {
              const [tone, word] = checkOf(c);
              return (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <StatusPill tone={tone}>{word}</StatusPill>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}

export default function Kit() {
  const [map, setMap] = useState(null);
  const [checks, setChecks] = useState(null);
  const [err, setErr] = useState('');
  const [row, setRow] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [groups, setGroups] = useState([]);
  const [draft, setDraft] = useState([]);
  const load = () => {
    setErr('');
    fetch('/map').then((r) => r.json()).then(setMap).catch(() => setErr('CHIP’s server is not answering on /map.'));
    fetch('/checks').then((r) => r.json()).then(setChecks).catch(() => setErr('CHIP’s server is not answering on /checks.'));
  };
  useEffect(load, []);
  useEffect(() => {
    document.title = 'Kit · CHIP';
  }, []);

  const nodes = map?.nodes ?? [];
  const shown = groups.length ? nodes.filter((n) => groups.includes(n.group)) : nodes;
  const groupOpts = (map?.groups ?? []).map((g) => ({ id: g.id, label: g.name, count: nodes.filter((n) => n.group === g.id).length }));
  const node = nodes.find((n) => n.id === row);

  return (
    <main className="k-main k-chrome">
      <PageHeader
        meta={
          <>
            CHIP · <b>Kit</b>
          </>
        }
        title="Kit"
        tags={
          checks && (
            <StatusPill badge tone={checkOf(checks.gate)[0]}>
              Gate {checks.gate.word.toLowerCase()}
            </StatusPill>
          )
        }
        lede="Each piece from the approved mock, on live data from CHIP’s server: the system map’s nodes and BELLA’s checks."
        actions={
          <>
            <Button onClick={load}>
              Refresh
            </Button>
            <Toggle expanded={drawer} aria-haspopup="dialog" onClick={() => (setDraft(groups), setDrawer(true))}>
              Filters{groups.length ? ` · ${groups.length}` : ''}
            </Toggle>
          </>
        }
      />
      {err && <p className="k-note">{err}</p>}

      <section className="k-sec" aria-labelledby="k-buttons">
        <h2 className="k-card-t" id="k-buttons">
          Buttons and pills
        </h2>
        <div className="k-row">
          <Button variant="primary">Fix it</Button>
          <Button>Open the review</Button>
          <Button variant="tertiary">Run now</Button>
          <Button>Copy</Button>
          <Button disabled>Testing…</Button>
        </div>
        <div className="k-row">
          <StatusPill tone="fail">Failed</StatusPill>
          <StatusPill tone="needs">Waiting on you</StatusPill>
          <StatusPill tone="pass">Passed</StatusPill>
          <StatusPill>Not tested</StatusPill>
          <span className="k-sub">Gate:</span>
          {checks && <StatusPill tone={checkOf(checks.gate)[0]}>{checks.gate.word}</StatusPill>}
        </div>
      </section>

      {checks && (
        <>
          <ChecksCard id="kc-wide" checks={checks.checks} />
          <div className="k-narrow">
            <ChecksCard id="kc-n1" checks={checks.checks} />
            <ChecksCard id="kc-n2" checks={checks.checks} />
          </div>
        </>
      )}

      <section className="k-sec" aria-labelledby="k-system">
        <h2 className="k-card-t" id="k-system">
          System
        </h2>
        {map && (
          <DataTable
            label="system parts"
            rowKey={(r) => r.id}
            rows={shown}
            onRow={(r) => setRow(r.id)}
            chips={[
              { id: 'all', label: 'All', test: () => true },
              { id: 'bad', label: 'Failing', test: (r) => r.state === 'bad' },
              { id: 'blocked', label: 'Blocked', test: (r) => r.state === 'blocked' },
            ]}
            cols={[
              { key: 'name', label: 'Part', open: true },
              { key: 'group', label: 'Group' },
              { key: 'state', label: 'Status', sortVal: (r) => stateOf(r.state)[1], render: (r) => <StatusPill tone={stateOf(r.state)[0]}>{stateOf(r.state)[1]}</StatusPill> },
              { key: 'source', label: 'Source', render: (r) => <code>{r.source}</code> },
              {
                key: 'action',
                label: 'Action',
                hideLabel: true,
                sort: false,
                end: true,
                render: (r) =>
                  r.action ? (
                    <Button variant={r.state === 'bad' ? 'primary' : 'secondary'} onClick={() => setRow(r.id)}>
                      {r.action.label}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </section>

      <Sheet
        open={!!node}
        title={node?.name}
        onClose={() => setRow(null)}
        footer={node?.action && <Button variant="primary">{node.action.label}</Button>}
      >
        {node && (
          <>
            <p>
              <StatusPill tone={stateOf(node.state)[0]}>{stateOf(node.state)[1]}</StatusPill>
            </p>
            <p>{node.detail}</p>
            <dl>
              <dt>Group</dt>
              <dd>{node.group}</dd>
              <dt>Source</dt>
              <dd>
                <code>{node.source}</code>
              </dd>
              <dt>Reads from</dt>
              <dd>{node.deps?.length ? node.deps.join(', ') : 'Nothing'}</dd>
              <dt>If this breaks</dt>
              <dd>{node.dependents?.length ? node.dependents.join(', ') : 'Nothing else stops'}</dd>
            </dl>
            {checks && <p className="k-sub">Checks last ran {when(checks.checks[0]?.ranAt)}.</p>}
          </>
        )}
      </Sheet>

      <Drawer open={drawer} onClose={() => setDrawer(false)} applyLabel={`Show ${draft.length ? nodes.filter((n) => draft.includes(n.group)).length : nodes.length} parts`} onApply={() => (setGroups(draft), setDrawer(false))} onClear={() => setDraft([])}>
        <FilterGroup legend="Group" options={groupOpts} selected={draft} onChange={setDraft} />
      </Drawer>
    </main>
  );
}
