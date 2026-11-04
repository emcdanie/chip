// Connectors (chip-mock-03): the tools CHIP reads from, whether each one
// answers, and what it is allowed to do. Two tabs: System map (the pipeline
// from GET /map, a map only) and Connectors (every server from GET /host, as
// the shared data table; a row opens its sheet). The map's controls sit top
// right, beside the title, and only while the map shows. docs/host.md
// explains how to add a connector.
import React, { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { PageHeader, Segmented, segPanelProps, DataTable, StatusPill, Sheet, SheetPart, Facts, NotMeasured } from './kit/index.jsx';
import SystemMap, { useMapControls } from './SystemMap.jsx';
import { changed } from './ReviewSheet.jsx';
import './Connectors.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

// the server's status, in the mock's words
const STATUS = {
  error: { tone: 'fail', word: 'Not answering' },
  connected: { tone: 'pass', word: 'Answering' },
  disabled: { tone: 'neutral', word: 'Off' },
  'not tested': { tone: 'neutral', word: 'Not tested' },
};
const statusOf = (s) => STATUS[s.status] ?? { tone: 'neutral', word: s.status };
// the row's one action: Reconnect a failing server, Test the rest; an off one has none
const actionOf = (s) => (s.disabled ? null : s.status === 'error' ? 'Reconnect' : s.status === 'connected' ? 'Test again' : 'Test');
const access = (s) => (s.allow.length ? s.allow.join(' and ') : 'nothing');

// the steps to try when the Figma desktop MCP won't answer
const figmaSteps = (where) => [
  ['Open the Figma desktop app', 'The MCP server runs inside the app, not in the browser.'],
  ['Turn on the MCP server', 'Figma menu › Preferences › Enable Dev Mode MCP Server.'],
  ['Check it answers', 'Should print a JSON line, not “connection refused”.', `curl -s ${where}`],
  ['Reconnect', 'If it still times out, quit Figma fully and start it again.'],
];

// what figma-rest needs: two lines in server/.env, then a restart (the error names the missing one)
const figmaRestSteps = [
  ['Make a token', 'Figma › Settings › Security › Personal access tokens. Scopes: file content and file metadata, read only.'],
  ['Add it to server/.env', 'The file is gitignored; the token never leaves this machine.', 'FIGMA_ACCESS_TOKEN='],
  ['Add the library’s file key', 'The part after /design/ in the BELLA library’s Figma link.', 'FIGMA_FILE_KEY='],
  ['Restart CHIP, then Test', 'CHIP reads server/.env when it starts.'],
];

const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
const kindOf = (s) => (s.kind === 'cli' ? 'Connector · CLI tool' : s.kind === 'rest' ? 'Connector · REST API' : `Connector · MCP over ${s.transport}`);

// a connector's sheet: what it is, whether it answers, what reads it, what to do
function ServerSheet({ s, feeds, note }) {
  const st = statusOf(s);
  const steps = s.status === 'error' ? (s.name === 'figma' ? figmaSteps(s.where) : s.name === 'figma-rest' ? figmaRestSteps : null) : null;
  const tools = s.tools ? `${s.tools.filter((t) => t.kind === 'read').length} read · ${s.tools.filter((t) => t.kind !== 'read').length} write` : null;
  const fix =
    s.status === 'error'
      ? steps
        ? s.name === 'figma'
          ? 'Open Figma desktop with a design file in front, turn on its MCP server, then Reconnect. It is optional: figma-rest reads Figma without the app.'
          : 'Add the token and the file key to server/.env, restart CHIP, then Test.'
        : 'Check the server runs at the address below, then Reconnect. The error above is what it last said.'
      : s.status === 'not tested'
        ? 'Test it once, so CHIP knows whether it answers before anything leans on it.'
        : s.disabled
          ? `It is off in chip.config.local.json. Leave it off until ${feeds ? 'you need what it feeds' : 'something needs it'}; turning it on is a one-line change there.`
          : 'Nothing. Test again only if what it feeds looks stale.';
  return (
    <>
      <SheetPart label="What this is">
        <p>{s.note ?? <NotMeasured what="The config gives no description." />}</p>
      </SheetPart>
      <SheetPart label="State" pill={<StatusPill tone={st.tone}>{st.word}</StatusPill>}>
        {s.error ? <pre>{s.error}</pre> : null}
        <Facts
          rows={[
            ['Last answered', s.lastUsed ? when(s.lastUsed) : null],
            ['Access', access(s)],
            tools && ['Tools', tools],
            [
              'Address',
              <span className="cn-reach">
                <code>{s.where}</code>
              </span>,
            ],
          ]}
        />
      </SheetPart>
      <SheetPart label="Why it matters" source={<code>chip.config.local.json</code>}>
        <p>{feeds ? `${feeds} ${feeds.includes(',') ? 'read' : 'reads'} from it. While it doesn’t answer, ${feeds.includes(',') ? 'they show' : 'that shows'} as blocked on the system map.` : 'Nothing on the system map reads from it, so CHIP works the same without it.'}</p>
        <p>
          Allowed to {access(s)}
          {s.allow.includes('write') ? ': it can change files, so CHIP asks before any write.' : ': it can’t change anything.'}
        </p>
      </SheetPart>
      <SheetPart label="What to do" fix>
        <p>{fix}</p>
        {steps ? (
          <ol className="cn-steps">
            {steps.map(([t, w, cmd]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{w}</span>
                {cmd ? (
                  <span className="cn-cmd">
                    <code>{cmd}</code>
                    <Button onClick={() => copy(cmd)} ariaLabel={`Copy ${cmd}`}>
                      Copy
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </SheetPart>
      {note ? <p role="status">{note}</p> : null}
    </>
  );
}

export default function Connectors() {
  const [tab, setTab] = useState('map');
  const [servers, setServers] = useState(null);
  const [map, setMap] = useState(null);
  const [testing, setTesting] = useState(null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const controls = useMapControls();

  const loadHost = useCallback(
    () =>
      fetch('/host')
        .then((r) => r.json())
        .then((r) => setServers(r.servers))
        .catch(() => setError('The CHIP server is not answering.')),
    [],
  );
  const loadMap = useCallback(
    () =>
      fetch('/map')
        .then((r) => r.json())
        .then(setMap)
        .catch(() => setMap({ error: true })),
    [],
  );
  useEffect(() => {
    // the map tests the Figma servers first, so the list reads after it
    loadMap().then(loadHost);
    const again = () => (loadMap(), loadHost());
    window.addEventListener('chip:changed', again);
    return () => window.removeEventListener('chip:changed', again);
  }, [loadMap, loadHost]);

  async function test(s) {
    setTesting(s.name);
    setNote('');
    try {
      const r = await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: s.name }) });
      const j = await r.json();
      setNote(j.status === 'connected' ? `${s.name}: answering` : `${s.name}: still not answering${j.error ? `. ${j.error}` : ''}`);
    } finally {
      setTesting(null);
      await Promise.all([loadHost(), loadMap()]);
      changed();
    }
  }

  const busyWord = (s) => (s.status === 'error' ? 'Reconnecting…' : 'Testing…');
  const actButton = (s, inSheet) => {
    const a = actionOf(s);
    if (!a) return null;
    return (
      <Button variant={s.status === 'error' ? 'primary' : 'secondary'} onClick={() => test(s)} disabled={!!testing} ariaLabel={inSheet || testing === s.name ? undefined : `${a} ${s.name}`}>
        {testing === s.name ? busyWord(s) : a}
      </Button>
    );
  };

  // what each server feeds: whatever reads the map node that tests it
  const feeds = (name) => {
    const n = map?.nodes?.find((x) => x.action?.type === 'test' && x.action.server === name);
    return n?.dependents.length ? n.dependents.join(', ') : null;
  };

  const cols = [
    { key: 'name', label: 'Connector', open: true },
    {
      key: 'status',
      label: 'Status',
      sortVal: (s) => statusOf(s).word,
      render: (s) => <StatusPill tone={statusOf(s).tone}>{statusOf(s).word}</StatusPill>,
    },
    { key: 'allow', label: 'Access', sortVal: access, render: access },
    { key: 'lastUsed', label: 'Last answered', sortVal: (s) => s.lastUsed ?? '', render: (s) => when(s.lastUsed) },
    { key: 'act', label: 'Action', hideLabel: true, sort: false, end: true, render: (s) => actButton(s) },
  ];
  const sheetServer = servers?.find((s) => s.name === open);
  // the sheet's buttons: the one test, and copying where it lives
  const sheetActions = (s) => {
    const a = actionOf(s);
    return [
      a && {
        label: testing === s.name ? busyWord(s) : a,
        variant: s.status === 'error' ? 'primary' : 'secondary',
        disabled: !!testing,
        onClick: () => test(s),
        changes: 'CHIP calls the server once and records whether it answered. Nothing in BELLA or the config changes.',
        undo: 'Nothing to undo.',
      },
      {
        label: 'Copy the address',
        variant: a ? 'secondary' : 'primary',
        onClick: () => copy(s.where),
        changes: 'Puts the address on your clipboard.',
      },
    ].filter(Boolean);
  };

  const mapBar = (
    <div className="cn-bar">
      <div className="cn-zoom" role="group" aria-label="Zoom">
        <Button onClick={controls.zoomOut} ariaLabel="Zoom out">
          −
        </Button>
        <Button onClick={controls.fit}>Fit</Button>
        <Button onClick={controls.zoomIn} ariaLabel="Zoom in">
          +
        </Button>
      </div>
      <Button onClick={controls.reset}>Reset layout</Button>
      <details className="cn-keys">
        <summary>Keys</summary>
        <ul>
          <li>Drag the canvas to move around; drag a card to rearrange it.</li>
          <li>
            <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>0</kbd> fits the map.
          </li>
          <li>
            <kbd>Tab</kbd> moves through cards; <kbd>Enter</kbd> selects. Arrows: ↑ parent, ↓ first child, ← → siblings.
          </li>
          <li>Pills: green healthy, yellow needs attention, red failing.</li>
        </ul>
      </details>
    </div>
  );

  return (
    <div className="cn-page k-chrome">
      <PageHeader
        title="Connectors"
        lede={
          <>
            The tools CHIP reads from, whether each one answers, and what it is allowed to do. Set in <code>chip.config.local.json</code>.
          </>
        }
        actions={tab === 'map' ? mapBar : null}
      />
      <Segmented
        id="conn"
        label="Connectors"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'map', label: 'System map' },
          {
            id: 'list',
            label: (
              <>
                Connectors <span className="n">{servers?.length ?? ''}</span>
              </>
            ),
          },
        ]}
      />
      <section {...segPanelProps('conn', 'map', tab)} className="cn-panel">
        {tab === 'map' ? <SystemMap map={map} controls={controls} onReload={() => Promise.all([loadMap(), loadHost()])} /> : null}
      </section>
      <section {...segPanelProps('conn', 'list', tab)} className="cn-panel">
        {error ? <p role="alert">{error}</p> : null}
        {servers && !servers.length ? <p>No servers yet. Copy chip.config.example.json to chip.config.local.json.</p> : null}
        {servers?.length ? (
          <DataTable
            label="connectors"
            cols={cols}
            rows={servers}
            rowKey={(s) => s.name}
            onRow={(s) => setOpen(s.name)}
            chips={[
              { id: 'all', label: 'All', test: () => true },
              { id: 'err', label: 'Not answering', test: (s) => s.status === 'error' },
              { id: 'nt', label: 'Not tested', test: (s) => s.status === 'not tested' },
            ]}
          />
        ) : null}
        <p className="k-vh" role="status">
          {note}
        </p>
      </section>

      <Sheet open={!!sheetServer} kicker={sheetServer ? kindOf(sheetServer) : null} title={sheetServer?.name ?? ''} onClose={() => setOpen(null)} actions={sheetServer ? sheetActions(sheetServer) : null}>
        {sheetServer ? <ServerSheet s={sheetServer} feeds={feeds(sheetServer.name)} note={note} /> : null}
      </Sheet>
    </div>
  );
}
