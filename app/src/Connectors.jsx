// Connectors (chip-mock-03): the tools CHIP reads from, whether each one
// answers, and what it is allowed to do. Two tabs: System map (the pipeline
// from GET /map, a map only) and Connectors (every server from GET /host, as
// the shared data table; a row opens its sheet). The map's controls sit top
// right, beside the title, and only while the map shows. docs/host.md
// explains how to add a connector.
import React, { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Overflow, PageHeader, Segmented, segPanelProps, DataTable, StatusPill, Sheet, SheetPart, Facts, NotMeasured, LinkButton, Card, Toggle } from './kit/index.jsx';
import { changed } from './ReviewSheet.jsx';
import './Connectors.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

// the server's status, in the mock's words. A path that isn't set up (no
// token) reads as optional while another Figma path answers, never as failing.
const STATUS = {
  'not-answering': { tone: 'fail', word: 'Not answering' },
  'not-set-up': { tone: 'needs', word: 'Not set up' },
  answering: { tone: 'pass', word: 'Answering' },
  off: { tone: 'neutral', word: 'Off' },
  'not-tested': { tone: 'neutral', word: 'Not tested' },
};
const statusOf = (s) =>
  s.disabled && s.about?.unused
    ? { tone: 'neutral', word: 'Not in use' }
    : s.covered
      ? { tone: 'neutral', word: `Optional · ${STATUS[s.state].word.toLowerCase()}` }
      : STATUS[s.state];
// the row's one action: Enable an off one, Set up a missing token, Reconnect a failing server, Test the rest
const actionOf = (s) => (s.disabled ? 'Enable' : s.setup ? 'Set up' : s.status === 'error' ? 'Reconnect' : s.status === 'connected' ? 'Test again' : 'Test');
// blue only when this one is the thing to do: an optional path that's closed isn't
const urgent = (s) => s.state === 'not-answering' && !s.covered;
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

// Notion: CHIP can't do the hosted MCP's browser sign-in, so it reads with an
// internal integration token, the one npm run sync:notion uses too
const notionSteps = [
  ['Create the integration', 'notion.so/profile/integrations › New integration, named CHIP. Type: Internal. Capabilities: Read content only.'],
  ['Share your pages with it', 'On each page, or one parent page: ••• › Connections › add the integration. It sees only what you share.'],
  ['Add the secret to server/.env', 'Paste the integration’s secret after the =. The file is gitignored; the token never leaves this machine.', 'NOTION_API_TOKEN='],
  ['Restart CHIP, then Test', 'CHIP reads server/.env when it starts.'],
];

// the three ways CHIP reads Figma, in plain words
const FIGMA_PATHS = [
  ['figma', 'Desktop app (MCP)', 'Needs the Figma app open with the file. Reads.'],
  ['figma-console', 'Desktop Bridge (figma-console)', 'Needs the Desktop Bridge plugin running in Figma. Reads and writes.'],
  ['figma-rest', 'REST API', 'No app needed. Reads. Needs a personal access token.'],
];

function Steps({ steps }) {
  return (
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
  );
}

const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});

const kindOf = (s) => (s.kind === 'cli' ? 'Connector · CLI tool' : ['rest', 'notion'].includes(s.kind) ? 'Connector · REST API' : `Connector · MCP over ${s.transport}`);

// a connector's sheet: what it is, whether it answers, what reads it, what to do
function ServerSheet({ s, feeds, note, onOff }) {
  const st = statusOf(s);
  const rest = s.name === 'figma-rest' && s.status !== 'connected';
  const steps = s.name === 'notion' ? notionSteps : rest ? figmaRestSteps : s.status === 'error' && s.name === 'figma' ? figmaSteps(s.where) : null;
  const tools = s.tools ? `${s.tools.filter((t) => t.kind === 'read').length} read · ${s.tools.filter((t) => t.kind !== 'read').length} write` : null;
  const fix = s.about?.unused
    ? s.disabled
      ? 'Leave it off: nothing in CHIP calls it yet. Enable tests whether the command is installed; it stays read only.'
      : 'Nothing calls it yet. Turn it off again if you don’t need it.'
    : s.name === 'notion'
      ? s.status === 'connected'
        ? 'Nothing. To let it see more pages, share them with the integration (step 2).'
        : 'One step: put an internal integration token in server/.env. Notion’s hosted MCP signs in through a browser, which CHIP can’t do; CHIP never asks for the token or types it.'
      : rest
        ? s.covered
          ? 'Optional upgrade. Another Figma path answers; a token lets CHIP read Figma with the app closed, and makes Compare faster.'
          : 'Add the token and the file key to server/.env, restart CHIP, then Test.'
        : s.status === 'error'
          ? s.name === 'figma'
            ? 'Open Figma desktop with the BELLA library, turn on its MCP server, then Reconnect. Compare with Figma reads through this path or REST, not the Desktop Bridge.'
            : 'Check it runs at the address below, then Reconnect. The error above is what it last said.'
          : 'Nothing. CHIP tests it at start and on Refresh.';
  return (
    <>
      <SheetPart label="What this is">
        <p>{s.about?.purpose ?? s.note ?? <NotMeasured what="The config gives no description." />}</p>
        {s.about?.needs ? <p>Needs: {s.about.needs}</p> : null}
      </SheetPart>
      <SheetPart label="State" pill={<StatusPill tone={st.tone}>{st.word}</StatusPill>}>
        {s.detail ? <p>{s.detail}</p> : null}
        {s.error && !s.setup ? <pre>{s.error}</pre> : null}
        <Facts
          rows={[
            ['Tested', s.disabled ? 'Off, not tested' : s.testedAt ? when(s.testedAt) : null],
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
        <p>{feeds ? `${feeds} ${feeds.includes(',') ? 'read' : 'reads'} from it. While it doesn’t answer, ${feeds.includes(',') ? 'they show' : 'that shows'} as blocked on the system map.` : s.about?.group === 'figma' ? 'Compare with Figma reads through REST or the desktop app; the Desktop Bridge reads and edits for sessions.' : s.name === 'notion' ? 'OBI’s search reads your Notion pages through the same token (npm run sync:notion), so answers can cite your notes and decisions.' : 'Nothing on the system map reads from it, so CHIP works the same without it.'}</p>
        <p>
          Allowed to {access(s)}
          {s.allow.includes('write') ? ': it can change files, so CHIP asks before any write.' : ': it can’t change anything.'}
        </p>
      </SheetPart>
      <SheetPart label="What to do" fix>
        <p>{fix}</p>
        {steps ? <Steps steps={steps} /> : null}
        {s.about?.unused && !s.disabled ? <LinkButton onClick={onOff}>Turn it off again</LinkButton> : null}
      </SheetPart>
      {note ? <p role="status">{note}</p> : null}
    </>
  );
}

// Compare with Figma, every component at once: the baseline and its rerun
function FigmaCard({ servers, figma, onOpen }) {
  const [base, setBase] = useState(null);
  const [more, setMore] = useState(false);
  const load = useCallback(() => fetch('/figma-baseline').then((r) => r.json()).then(setBase).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!base?.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [base?.running, load]);
  const run = () => fetch('/figma-baseline/run', { method: 'POST', headers: JSON_HEADERS }).then((r) => r.json()).then(setBase);
  const by = Object.fromEntries((servers ?? []).map((s) => [s.name, s]));
  const worst = (base?.rows ?? []).filter((r) => r.found && r.score != null && r.score < 100).sort((a, b) => a.score - b.score);
  return (
    <Card
      className="cn-figma"
      title="Figma"
      sub={figma ? `${figma.sentence}${figma.connected && !figma.canCompare ? ' Compare needs the desktop app or REST.' : ''}` : 'Reading…'}
      action={
        <Button onClick={run} disabled={!figma?.canCompare || !!base?.running}>
          {base?.running ? `Comparing ${base.running.done} of ${base.running.total}…` : base?.at ? 'Compare all again' : 'Compare all with Figma'}
        </Button>
      }
    >
      <ul className="cn-paths">
        {FIGMA_PATHS.map(([name, label, plain]) => {
          const s = by[name];
          if (!s) return null;
          return (
            <li key={name}>
              <StatusPill tone={statusOf(s).tone}>{statusOf(s).word}</StatusPill>
              <span>
                <b>{label}.</b> {plain} {s.detail ? <span className="cn-muted">{s.detail}</span> : null}
              </span>
              <LinkButton onClick={() => onOpen(name)}>Details</LinkButton>
            </li>
          );
        })}
      </ul>
      {base?.at ? (
        <div className="cn-base">
          <p>
            <b>
              Baseline, {when(base.at)}: {base.found} of {base.total} components found in Figma, average match {base.average}%.
            </b>{' '}
            Read through {base.via === 'desktop' ? 'the desktop app' : 'the REST API'}.{' '}
            {Object.keys(base.byCheck).length ? `Differences: ${Object.entries(base.byCheck).map(([k, n]) => `${k} in ${n}`).join(', ')}.` : 'No differences.'}{' '}
            {base.total - base.found ? `${base.total - base.found} have no component set in the file (${base.rows.filter((r) => !r.found).map((r) => r.name).join(', ')}).` : ''}
          </p>
          <Toggle className="cn-more" expanded={more} onClick={() => setMore((o) => !o)}>
            {more ? 'Hide the detail' : worst.length ? `The ${Math.min(worst.length, 6)} furthest from code` : 'What each path reads'}
          </Toggle>
          {more ? (
            <>
              {worst.length ? (
                <ul className="cn-worst">
                  {worst.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <span className="cn-score">{r.score}%</span> <b>{r.name}</b> <span className="cn-muted">{r.failing.map((f) => f.what).join(' ')}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="cn-muted">
                Variables: the desktop app reads them on this plan (per component, and every collection in the file). The REST API’s variables endpoint is Enterprise only, so REST reads components and styles here, not variables.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <p className="cn-muted">{figma?.canCompare ? 'No baseline yet: compare every component once to see where Figma and code differ.' : 'Open the desktop app or add a REST token to compare.'}</p>
      )}
    </Card>
  );
}

export default function Connectors() {
  const [servers, setServers] = useState(null);
  const [figma, setFigma] = useState(null);
  const [counts, setCounts] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [map, setMap] = useState(null);
  const [testing, setTesting] = useState(null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  const loadHost = useCallback(
    () =>
      fetch('/host')
        .then((r) => r.json())
        .then((r) => {
          setFigma(r.figma);
          setServers(r.servers);
          setCounts(r.counts);
        })
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
    loadMap();
    loadHost();
    const again = () => (loadMap(), loadHost());
    window.addEventListener('chip:changed', again);
    return () => window.removeEventListener('chip:changed', again);
  }, [loadMap, loadHost]);

  // the start-up test can still be running: read again until it has answered
  useEffect(() => {
    if (!counts?.notTested) return;
    const t = setTimeout(() => (loadMap(), loadHost()), 3000);
    return () => clearTimeout(t);
  }, [counts, loadMap, loadHost]);

  // Refresh: every connector tested again
  async function refresh() {
    setRefreshing(true);
    setNote('');
    try {
      const r = await fetch('/host/test-all', { method: 'POST', headers: JSON_HEADERS }).then((x) => x.json());
      setFigma(r.figma);
      setServers(r.servers);
      setCounts(r.counts);
      setNote(`Tested ${r.counts.total - r.counts.off}: ${r.counts.answering} answering.`);
    } finally {
      setRefreshing(false);
      loadMap();
      changed();
    }
  }

  async function enable(s, on = true) {
    setTesting(s.name);
    try {
      await fetch('/host/enable', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: s.name, enabled: on }) });
      if (on) await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: s.name }) });
    } finally {
      setTesting(null);
      await loadHost();
    }
  }

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

  const busyWord = (s) => (s.disabled ? 'Enabling…' : s.status === 'error' ? 'Reconnecting…' : 'Testing…');
  const actButton = (s, inSheet) => {
    const a = actionOf(s);
    if (!a) return null;
    // Set up opens the steps; in the sheet, the steps are showing, so it tests
    const go = s.disabled ? () => enable(s) : a === 'Set up' && !inSheet ? () => setOpen(s.name) : () => test(s);
    const label = a === 'Set up' && inSheet ? 'Test again' : a;
    return (
      <Button variant={urgent(s) ? 'primary' : 'secondary'} onClick={go} disabled={!!testing || refreshing} ariaLabel={inSheet || testing === s.name ? undefined : `${label} ${s.name}`}>
        {testing === s.name ? busyWord(s) : label}
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
    { key: 'for', label: 'What it’s for', prio: 2, sortVal: (s) => s.about?.purpose ?? '', render: (s) => <span className="cn-for" title={s.about?.purpose ?? s.note ?? undefined}>{s.about?.purpose ?? s.note}</span> },
    {
      key: 'status',
      label: 'Status',
      sortVal: (s) => statusOf(s).word,
      render: (s) => <StatusPill tone={statusOf(s).tone}>{statusOf(s).word}</StatusPill>,
    },
    { key: 'allow', label: 'Access', prio: 3, sortVal: access, render: access },
    { key: 'testedAt', label: 'Tested', prio: 2, sortVal: (s) => s.testedAt ?? '', render: (s) => (s.disabled ? '—' : when(s.testedAt)) },
    { key: 'act', label: 'Action', hideLabel: true, sort: false, end: true, pin: true, render: (s) => actButton(s) },
  ];
  const sheetServer = servers?.find((s) => s.name === open);
  // the sheet's buttons: the one action, and copying where it lives
  const sheetActions = (s) => {
    const a = actionOf(s);
    const go = s.disabled ? () => enable(s) : () => test(s);
    const label = a === 'Set up' ? 'Test again' : a;
    return [
      {
        label: testing === s.name ? busyWord(s) : label,
        variant: urgent(s) ? 'primary' : 'secondary',
        disabled: !!testing || refreshing,
        onClick: go,
        changes: s.disabled ? 'CHIP turns it on (data/connectors.json, not your config) and tests it once.' : 'CHIP calls it once and records whether it answered. Nothing in BELLA or the config changes.',
        undo: s.disabled ? 'Turn it off again from this sheet.' : 'Nothing to undo.',
      },
      {
        label: 'Copy the address',
        variant: 'secondary',
        onClick: () => copy(s.where),
        changes: 'Puts the address on your clipboard.',
      },
    ];
  };

  return (
    <section className="cn-page k-chrome" aria-labelledby="cn-h">
      <div className="cn-head">
        <h2 id="cn-h">Connectors {counts ? <span className="n">{counts.total}</span> : null}</h2>
        <Button onClick={refresh} disabled={refreshing || !!testing}>
          {refreshing ? 'Testing every connector…' : 'Test all'}
        </Button>
      </div>
      <div className="cn-panel">
        {error ? <p role="alert">{error}</p> : null}
        {servers && !servers.length ? <p>No servers yet. Copy chip.config.example.json to chip.config.local.json.</p> : null}
        {servers?.length ? <FigmaCard servers={servers} figma={figma} onOpen={setOpen} /> : null}
        {servers?.length ? (
          <DataTable
            label="connectors"
            cols={cols}
            rows={servers}
            rowKey={(s) => s.name}
            onRow={(s) => setOpen(s.name)}
            chips={[
              { id: 'all', label: 'All', test: () => true },
              { id: 'err', label: 'Not answering', test: (s) => s.state === 'not-answering' },
              { id: 'setup', label: 'Not set up', test: (s) => s.state === 'not-set-up' },
              { id: 'off', label: 'Not in use', test: (s) => s.state === 'off' },
            ]}
          />
        ) : null}
        <p className="k-vh" role="status">
          {note}
        </p>
      </div>

      <Sheet open={!!sheetServer} kicker={sheetServer ? kindOf(sheetServer) : null} title={sheetServer?.name ?? ''} onClose={() => setOpen(null)} actions={sheetServer ? sheetActions(sheetServer) : null}>
        {sheetServer ? <ServerSheet s={sheetServer} feeds={feeds(sheetServer.name)} note={note} onOff={() => enable(sheetServer, false)} /> : null}
      </Sheet>
    </section>
  );
}
