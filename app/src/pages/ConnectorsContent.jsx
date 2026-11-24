// Connectors · content: the code twin of the Figma slot fill (CHIP Dashboard
// 601:126716). Reaches (the services CHIP talks to now), Figma paths (any one
// is enough) leading to Compare with Figma, and Need setup. Real CHIP data:
// /map (each node's state and detail) and /host/test. BELLA parts and the
// template's Flow only.
//
// Gaps (library board): the curved path drawing and its Hub (Map line pieces
// placed by position), so the paths are a list with Compare under it; the
// Claude mark for the agent tile (Brain stands in), a chip icon for the local
// model and the Figma path (Activity stands in), Figma's mark as a section
// icon (Map stands in). Push on the CI tile waits: pushing runs only on the
// maintainer's own yes, never from a page button.
import { useCallback, useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import ListRow from '@bella/components/ListRow/ListRow';
import IconWell from '@bella/components/IconWell/IconWell';
import AppTile from '@bella/components/AppTile/AppTile';
import ConnectorTile from '@bella/components/ConnectorTile/ConnectorTile';
import Notification from '@bella/components/Notification/Notification';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import Toast from '@bella/components/Toast/Toast';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import FigmaSetup, { useFigma } from '../templates/FigmaSetup.jsx';
import ConnectorSetup, { PLAIN } from '../templates/ConnectorSetup.jsx';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
// map state → the words and tone Figma uses on a tile
const LIVE = { ok: ['Live', 'success'], bad: ['Failing', 'danger'], blocked: ['Waiting', 'attention'], unknown: ['Not tested', 'neutral'], setup: ['Needs setting up', 'attention'] };
/* One status per connector, as a status dot and its word (review 24 Nov): green when it answers, yellow when it is not
   set up yet, red when it is set up and failing; one it has not tested yet stays grey ("Not tested", never a guess).
   "Not set up" is read from the map's own words: no server in CHIP's settings, or a token still to add. */
const NOT_SET_UP = /^not configured|^add [A-Z_]+=|no server called|needs a token|not set up/i;
const stateOf = (n) => (n?.state !== 'ok' && NOT_SET_UP.test(String(n?.detail ?? '')) ? 'setup' : n?.state ?? 'unknown');
const REACHES = [
  // Figma's App tiles: GitHub's mark on ink, git's branch on its orange, the agent on Claude's colour, the local model outlined
  { id: 'ci', name: 'GitHub CI', tile: { tone: 'inverse', brand: 'github' }, ok: 'Ran' },
  // git ok means CHIP can read BELLA's branch, never "up to date" (nothing measures that; data check, 22 Nov)
  { id: 'git', name: 'git', tile: { tone: 'git', icon: 'GitBranch' }, ok: 'Reads BELLA' },
  { id: 'claude', name: 'Agent', tile: { tone: 'claude', brand: 'claude' }, ok: 'Ready' },
  { id: 'ollama', name: 'Local model', tile: { tone: 'outline', icon: 'Activity' }, ok: 'Ready' },
];
// Figma's tile: a large headline, then one short meta line, both from the node's own detail
function headline(r) {
  // CI as GitHub ran it, read with gh (data check, 22 Nov): the result of the newest run, its day and commit under it
  if (r.id === 'ci') return { ok: 'Passed', bad: 'Failed', warn: 'Running' }[r.n.state] ?? 'Not read';
  return r.n.state === 'ok' ? r.ok : LIVE[stateOf(r.n)]?.[0] ?? 'Not tested';
}
// "4 of 5 gate checks pass, last run 19 Nov." → "4 of 5 pass · 19 Nov"
const gateWords = (g) => {
  const m = String(g?.detail ?? '').match(/(\d+ of \d+) gate checks pass(?:, last run ([^.]+))?/);
  return m ? `${m[1]} pass${m[2] ? ` · ${m[2]}` : ''}` : null;
};
function meta(r, gate) {
  const d = String(r.n.detail ?? '');
  // the run's day and commit; with no run read, what BELLA's gate said on the last commit (one gate, one answer)
  if (r.id === 'ci') {
    const m = d.match(/on (\d{1,2} \w{3}) at [\d:]+ on ([0-9a-f]{7})/);
    if (m) return `${m[1]} · ${m[2]}`;
    return gateWords(gate) ? `Gate ${gateWords(gate)}` : undefined;
  }
  if (r.id === 'git') return sha(d);
  if (r.id === 'claude') return r.n.state === 'ok' ? 'OBI uses it' : 'Not installed';
  if (r.id === 'ollama') return d.match(/:(\d{2,5})\b/) ? `:${d.match(/:(\d{2,5})\b/)[1]}` : undefined;
  return undefined;
}
/* The published Figma's names (601:126716, 20 Nov): the tool each path is, as
   the developers and designers who set them up know it. */
const PATHS = [
  { id: 'figma', name: PLAIN.figma, icon: 'Activity' },
  { id: 'figma-console', name: PLAIN['figma-console'], icon: 'Code' },
  { id: 'figma-rest', name: PLAIN['figma-rest'], icon: 'Key' },
];
// plain names, never a slug (Elleta, 23 Nov: the drawer title said figma-rest)
const NAMES = { 'figma-key': 'Figma key', ...PLAIN };
const nameOf = (n) => NAMES[n?.id] ?? n?.name;
// the server's words, in the page's own names for the paths
const plainWords = (t) => String(t ?? '').replace(/^No server called "[^"]+" in chip\.config\.local\.json\.?/, 'not set up in CHIP’s settings yet').replace(/\bthe Figma REST API\b/gi, 'Figma').replace(/\bFigma REST( API)?\b/g, 'Figma').replace(/\bREST API\b/g, 'Figma').replace(/\bserver\/\.env\b/g, "CHIP's settings").replace(/\b[A-Z][A-Z_]{3,}=<?token>?/g, 'a token');
const first = (s) => String(s ?? '').split(/(?<=\.)\s/)[0];
// Figma's own short words for each connector (601:126716): plain, no paths, tokens or hashes
const SAYS = {
  figma: { ok: 'Answers', other: 'Not configured' },
  'figma-console': { ok: 'Answers', other: 'Not configured' },
  'figma-key': { why: 'Turns on the Figma check' },
  'figma-rest': { ok: 'Connected', other: 'Needs a token', why: 'Reads Figma with no app open' },
  notion: { ok: 'Connected', other: 'Needs a token', why: 'Reads shared pages' },
};
const says = (n) => (n.state === 'ok' ? SAYS[n.id]?.ok : SAYS[n.id]?.other) ?? (n.state === 'ok' ? 'Answers' : 'Not set up yet');
const why = (n) => SAYS[n.id]?.why ?? 'Unlocks more checks';
// git: the short commit only, as Figma shows it ("3d74f7d"), never the branch path
const sha = (t) => String(t ?? '').match(/\b[0-9a-f]{7,}\b/)?.[0];


/* The system map, kept between visits (useCached); `load` reads it again. */
function useMap() {
  const { data, error, reload } = useCached(['/map']);
  return [error ? { error: true, nodes: [] } : data ? data[0] : null, reload];
}

/* Figma's tile status: a status dot and one word (a part's own status is a StatusDot plus one word). */
function StateTag({ state, okWord }) {
  const [word, tone] = LIVE[state] ?? LIVE.unknown;
  return <StatusDot tone={tone} label={state === 'ok' && okWord ? okWord : word} />;
}

export default function ConnectorsContent() {
  // Figma's four tiles in one row need about 1200 of window; below that two by two
  const four = !useNarrow(1200);
  const phone = useNarrow(800);
  const [map, reload] = useMap();
  // Figma's token is judged by what CHIP last read from Figma, not by the map's untested guess: key and token saved and a good read means Connected
  const [fig, readFig] = useFigma();
  const figmaOk = Boolean(fig?.key && fig?.token && fig?.lastRead);
  const gateNode = map?.nodes?.find((x) => x.id === 'gate');
  const [busy, setBusy] = useState(null);
  const [setup, setSetup] = useState(null);
  const node = (id) => {
    const n = map?.nodes?.find((x) => x.id === id);
    return n && id === 'figma-rest' && figmaOk ? { ...n, state: 'ok', detail: `Connected to ${fig.lastRead.name}.` } : n;
  };
  const [said, setSaid] = useState(null);
  /* Test: a connector with a server behind it (the Figma paths, Notion) is tested through
     /host/test; the others (the agent, the local model) are measured again on a fresh map.
     The button says Testing…, then a toast says what CHIP found, in plain words (user test 8:
     every Test got a 400 from /host/test with the map's id, and nothing showed). */
  const test = async (n, name) => {
    setBusy(n.id);
    let error = null;
    let result = { ok: false, text: `${name}: CHIP didn’t answer. Try again in a moment.` };
    try {
      if (n.action?.server) {
        const r = await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: n.action.server }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) error = d.error || 'CHIP did not answer';
      }
      const fresh = await fetch('/map').then((r) => r.json());
      const now = fresh.nodes?.find((x) => x.id === n.id);
      const [word] = LIVE[now?.state] ?? LIVE.unknown;
      const bad = error || now?.state === 'bad';
      const msg = bad ? { tone: 'danger', text: `${name}: ${plainWords(first(error ?? now?.detail ?? 'it did not answer'))}` } : { tone: now?.state === 'ok' ? 'success' : 'info', text: `${name}: ${word}. ${plainWords(first(now?.detail ?? ''))}`.trim() };
      setSaid(msg);
      result = { ok: !bad && now?.state === 'ok', text: plainWords(first(error ?? now?.detail ?? word)) };
    } catch {
      setSaid({ tone: 'danger', text: result.text });
    } finally {
      reload();
      setBusy(null);
    }
    return result;
  };
  // the set up drawer's own Test it keeps its last result, so the drawer says Works or Not yet (set up template)
  const [lastTest, setLastTest] = useState({});
  const runTest = async (n) => {
    const r = await test(n, nameOf(n));
    setLastTest((was) => ({ ...was, [n.id]: r }));
    return r;
  };

  if (!map) return <EmptyState size="page" title="Knocking on every door" line="Asking each connector if it's home. Two ticks." />;
  if (map.error) return <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its connectors just now. Refresh and I'll ask again." />;

  const reaches = REACHES.map((r) => ({ ...r, n: node(r.id) })).filter((r) => r.n);
  const live = reaches.filter((r) => r.n.state === 'ok').length;
  const paths = PATHS.map((p) => ({ ...p, n: node(p.id) })).filter((p) => p.n);
  const compare = node('compare');
  // a Figma path already has its own row and Set up above, so it is never listed twice (audit 3)
  // the file key is figma-rest's other half: its step sits in figma-rest's Set up, one way in (audit 4, item 3)
  const fileKey = node('figma-key');
  const needs = map.nodes.filter((n) => n.state === 'bad' && n.action?.type === 'test' && !PATHS.some((p) => p.id === n.id) && !(n.id === 'figma-key' && paths.some((p) => p.id === 'figma-rest')));
  const testButton = (n, label = 'Test', name = nameOf(n)) => (
    // Figma's buttons carry words only (20 Nov polish: no leading icons)
    <Button variant="secondary" size="sm" onClick={() => test(n, name)} busy={busy === n.id} disabled={!!busy && busy !== n.id}>
      {busy === n.id ? 'Testing…' : label}
    </Button>
  );

  return (
    <>
      {said ? (
        <Toasts>
          <Toast tone={said.tone} onClose={() => setSaid(null)}>
            {said.text}
          </Toast>
        </Toasts>
      ) : null}
      <Card>
        <Flow gap={16}>
          <SectionHead icon="EvPlug" iconTone="info" title="Reaches" description="Services CHIP talks to now" showDescription number={live} words="answer now" showNumber />
          {/* four in a row with room; else two by two (a pair per row, as Health's check rows), one per row on a phone */}
          {(four
            ? (tiles) => <Flow direction="row" gap={24} equal fill>{tiles}</Flow>
            : (tiles) => (
                <Flow gap={24}>
                  {tiles.map((t, i) => (i % 2 ? null : tiles.slice(i, i + 2))).filter(Boolean).map((pair) => (
                    <Flow key={pair[0].key} direction={phone ? 'column' : 'row'} gap={24} equal fill>
                      {pair}
                    </Flow>
                  ))}
                </Flow>
              ))(
            reaches.map((r) => {
              // BELLA's Connector tile (Figma 1330:51190): app tile and live status, the service's name, its
              // state large, one short meta line, its one action; the page no longer builds it from a Card
              const [word, tone] = LIVE[stateOf(r.n)] ?? LIVE.unknown;
              return (
                <ConnectorTile
                  key={r.id}
                  appTile={<AppTile {...r.tile} />}
                  status={word}
                  statusTone={tone}
                  name={r.name}
                  value={headline(r)}
                  detail={meta(r, gateNode) || undefined}
                  action={
                    r.id === 'git' ? (
                      <Button variant="secondary" size="sm" href="#/system/history">
                        Log
                      </Button>
                    ) : r.id === 'ci' ? (
                      // the runs it recorded are in Health's Component checks; with no action the tile left a blank under its line (23 Nov)
                      <Button variant="secondary" size="sm" href="#/health">
                        Runs
                      </Button>
                    ) : stateOf(r.n) === 'setup' ? (
                      <Button variant="secondary" size="sm" onClick={() => setSetup(r.n)}>
                        Set up
                      </Button>
                    ) : (
                      testButton(r.n, 'Test', r.name)
                    )
                  }
                />
              );
            }),
          )}
        </Flow>
      </Card>

      <Card>
        <Flow gap={16}>
          <SectionHead icon="Map" iconTone="info" title="Figma paths" description="Ways CHIP can read Figma" showDescription words="Any one path is enough" />
          <Flow gap={8} as="ul" aria-label="Figma paths">
            {paths.map((p) => {
              // one action per row, saying what it does (review 24 Nov): Set up while it is not set up, Test once it is;
              // the state is the status dot and its word under the name, never an arrow beside the button
              const s = stateOf(p.n);
              const act = s === 'setup' ? <Button variant="secondary" size="sm" ariaLabel={`Set up ${p.name}`} onClick={() => setSetup(p.n)}>Set up</Button> : testButton(p.n, 'Test', p.name);
              return <ListRow key={p.id} iconWell={<IconWell icon={p.icon} tone="info" />} title={p.name} description={<StateTag state={s} okWord="Connected" />} actionButton={act} />;
            })}
          </Flow>
          {compare ? (
            <Notification
              tone={compare.state === 'ok' ? 'success' : 'info'}
              message={compare.state === 'ok' ? 'Compare with Figma: Figma matches the code.' : `Compare with Figma can’t run yet${compare.blockedBy ? `: it waits on ${nameOf(compare.blockedBy)}` : ''}.`}
            />
          ) : null}
        </Flow>
      </Card>

      {needs.length ? (
        <Card>
          <Flow gap={16}>
            <SectionHead icon="WarningCircle" iconTone="warning" title="Need setup" number={needs.length} words="to set up" showNumber />
            {/* one List item for every row, no card inside a card (20 Nov rule); the row is its name, its status dot with what
                setting it up unlocks, and one Set up (review 24 Nov: the row had an arrow and a button, and a line of its own) */}
            <Flow gap={8} as="ul" aria-label="Need setup">
              {needs.map((n) => (
                <ListRow key={n.id} title={nameOf(n)} description={<StateTag state={stateOf(n)} />} actionButton={<Button variant="secondary" size="sm" ariaLabel={`Set up ${nameOf(n)}`} onClick={() => setSetup(n)}>Set up</Button>} />
              ))}
            </Flow>
          </Flow>
        </Card>
      ) : null}

      {/* credits for what CHIP shows from others, at the foot of the page that lists what CHIP connects to (no About page yet;
          the empty-state marks rule asks for this line) */}
      <TextStack subtitle="Credits · Animated emoji: Noto Emoji Animation by Google, CC BY 4.0" />

      <Drawer
        side="right"
        size="lg"
        open={!!setup}
        onClose={() => setSetup(null)}
        // a path that works opens under its own name; one that needs setup says so
        label={setup ? (setup.state === 'ok' ? nameOf(setup) : `Set up ${nameOf(setup)}`) : 'Set up'}
      >
        {setup?.id === 'figma-rest' ? (
          // the same template as every connector; Figma's token has its own fields (templates/FigmaSetup.jsx)
          <FigmaSetup onChanged={() => (reload(), readFig())} />
        ) : setup ? (
          <ConnectorSetup node={setup} name={nameOf(setup)} test={runTest} reload={reload} last={lastTest[setup.id]} />
        ) : null}
      </Drawer>
    </>
  );
}
