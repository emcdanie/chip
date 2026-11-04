// Connectors (chip-mock-03): the tools CHIP reads from, whether each one
// answers, and what it is allowed to do. Two tabs: System map (the pipeline
// from GET /map, a map only) and Connectors (every server from GET /host, as
// the shared data table; a row opens its sheet). The map's controls sit top
// right, beside the title, and only while the map shows. docs/host.md
// explains how to add a connector.
import React, { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { PageHeader, Segmented, segPanelProps, DataTable, StatusPill, Sheet, LinkButton } from './kit/index.jsx';
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

      <Sheet open={!!sheetServer} title={sheetServer?.name ?? ''} onClose={() => setOpen(null)} footer={sheetServer ? actButton(sheetServer, true) : null}>
        {sheetServer ? (
          <>
            <p className="cn-sline">
              <StatusPill tone={statusOf(sheetServer).tone}>{statusOf(sheetServer).word}</StatusPill>
              {sheetServer.error ? <span>{sheetServer.error}</span> : null}
            </p>
            {sheetServer.note ? <p>{sheetServer.note}</p> : null}
            <dl>
              {feeds(sheetServer.name) ? (
                <>
                  <dt>Feeds</dt>
                  <dd>{feeds(sheetServer.name)}</dd>
                </>
              ) : null}
              <dt>Kind</dt>
              <dd>{sheetServer.kind === 'cli' ? 'CLI tool' : sheetServer.kind === 'rest' ? 'REST API over https' : `MCP over ${sheetServer.transport}`}</dd>
              <dt>Access</dt>
              <dd>{access(sheetServer)}</dd>
              <dt>Last answered</dt>
              <dd>{when(sheetServer.lastUsed)}</dd>
              <dt>Reach</dt>
              <dd className="cn-reach">
                <code>{sheetServer.where}</code> <LinkButton onClick={() => copy(sheetServer.where)}>Copy</LinkButton>
              </dd>
              {sheetServer.tools ? (
                <>
                  <dt>Tools</dt>
                  <dd>
                    {sheetServer.tools.filter((t) => t.kind === 'read').length} read · {sheetServer.tools.filter((t) => t.kind !== 'read').length} write
                  </dd>
                </>
              ) : null}
            </dl>
            {sheetServer.status === 'error' && ['figma', 'figma-rest'].includes(sheetServer.name) ? (
              <>
                <h3>{sheetServer.name === 'figma' ? 'If it won’t answer' : 'To connect it'}</h3>
                {sheetServer.name === 'figma' ? <p>Optional: figma-rest reads Figma without the app.</p> : null}
                <ol className="cn-steps">
                  {(sheetServer.name === 'figma' ? figmaSteps(sheetServer.where) : figmaRestSteps).map(([t, w, cmd]) => (
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
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
