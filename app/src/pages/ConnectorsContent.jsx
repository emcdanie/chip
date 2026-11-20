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
import Columns from '@bella/components/Columns/Columns';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import Toast from '@bella/components/Toast/Toast';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
// map state → the words and tone Figma uses on a tile
const LIVE = { ok: ['Live', 'success'], bad: ['Needs setup', 'danger'], blocked: ['Waiting', 'attention'], unknown: ['Not tested', 'neutral'] };
const REACHES = [
  // Figma's App tiles: GitHub's mark on ink, git's branch on its orange, the agent on Claude's colour, the local model outlined
  { id: 'ci', name: 'GitHub CI', tile: { tone: 'inverse', brand: 'github' }, ok: 'Ran' },
  { id: 'git', name: 'git', tile: { tone: 'git', icon: 'GitBranch' }, ok: 'Up to date' },
  { id: 'claude', name: 'Agent', tile: { tone: 'claude', icon: 'Brain' }, ok: 'Ready' },
  { id: 'ollama', name: 'Local model', tile: { tone: 'outline', icon: 'Activity' }, ok: 'Ready' },
];
// Figma's tile: a large headline, then one short meta line, both from the node's own detail
const pushes = (d) => (/nothing unpushed/i.test(d ?? '') ? 0 : Number(String(d ?? '').match(/(\d+) (?:commits? )?unpushed/i)?.[1] ?? NaN));
function headline(r) {
  if (r.id === 'ci') {
    const n = pushes(r.n.detail);
    if (n === 0) return 'All pushed';
    if (n > 0) return `${n} to push`;
  }
  return r.n.state === 'ok' ? r.ok : LIVE[r.n.state]?.[0] ?? 'Not tested';
}
// "4 of 5 gate checks pass, last run 19 Nov." → "4 of 5 pass · 19 Nov"
const gateWords = (g) => {
  const m = String(g?.detail ?? '').match(/(\d+ of \d+) gate checks pass(?:, last run ([^.]+))?/);
  return m ? `${m[1]} pass${m[2] ? ` · ${m[2]}` : ''}` : null;
};
function meta(r, gate) {
  const d = String(r.n.detail ?? '');
  // until GitHub runs CI, the tile says what BELLA's gate said on the last commit: the same
  // reading as Health and System map (one gate, one answer)
  if (r.id === 'ci') return r.n.state === 'ok' ? 'CI ran' : gateWords(gate) ? `CI hasn’t run · gate ${gateWords(gate)}` : 'CI hasn’t run';
  if (r.id === 'git') return sha(d);
  if (r.id === 'claude') return r.n.state === 'ok' ? 'OBI uses it' : 'Not installed';
  if (r.id === 'ollama') return d.match(/:(\d{2,5})\b/) ? `:${d.match(/:(\d{2,5})\b/)[1]}` : undefined;
  return undefined;
}
/* The published Figma's names (601:126716, 20 Nov): the tool each path is, as
   the developers and designers who set them up know it. */
const PATHS = [
  { id: 'figma', name: 'Figma desktop MCP', icon: 'Activity' },
  { id: 'figma-console', name: 'figma-console', icon: 'Code' },
  { id: 'figma-rest', name: 'figma-rest', icon: 'Key' },
];
const NAMES = { 'figma-key': 'Figma key', figma: 'Figma desktop MCP', 'figma-console': 'figma-console', 'figma-rest': 'figma-rest', notion: 'Notion' };
const nameOf = (n) => NAMES[n?.id] ?? n?.name;
// the server's words, in the page's own names for the paths
const plainWords = (t) => String(t ?? '').replace(/^No server called "[^"]+" in chip\.config\.local\.json\.?/, 'not set up in CHIP’s settings yet').replace(/\bthe Figma REST API\b/gi, 'figma-rest').replace(/\bFigma REST( API)?\b/g, 'figma-rest').replace(/\bREST API\b/g, 'figma-rest').replace(/\bserver\/\.env\b/g, "CHIP's settings").replace(/\b[A-Z][A-Z_]{3,}=<?token>?/g, 'a token');
const first = (s) => String(s ?? '').split(/(?<=\.)\s/)[0];
// Figma's own short words for each connector (601:126716): plain, no paths, tokens or hashes
const SAYS = {
  figma: { ok: 'Answers', other: 'Not configured' },
  'figma-console': { ok: 'Answers', other: 'Not configured' },
  'figma-key': { why: 'Turns on the Figma check' },
  'figma-rest': { ok: 'Answers', other: 'Needs a token', why: 'Reads Figma with no app open' },
  notion: { ok: 'Answers', other: 'Needs a token', why: 'Reads shared pages' },
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
function StateTag({ state }) {
  const [word, tone] = LIVE[state] ?? LIVE.unknown;
  return <StatusDot tone={tone} label={word} />;
}

export default function ConnectorsContent() {
  // Figma's four tiles in one row need about 1200 of window; below that two by two
  const four = !useNarrow(1200);
  const phone = useNarrow(800);
  const [map, reload] = useMap();
  const gateNode = map?.nodes?.find((x) => x.id === 'gate');
  const [busy, setBusy] = useState(null);
  const [setup, setSetup] = useState(null);
  const node = (id) => map?.nodes?.find((n) => n.id === id);
  const [said, setSaid] = useState(null);
  /* Test: a connector with a server behind it (the Figma paths, Notion) is tested through
     /host/test; the others (the agent, the local model) are measured again on a fresh map.
     The button says Testing…, then a toast says what CHIP found, in plain words (user test 8:
     every Test got a 400 from /host/test with the map's id, and nothing showed). */
  const test = async (n, name) => {
    setBusy(n.id);
    let error = null;
    try {
      if (n.action?.server) {
        const r = await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: n.action.server }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) error = d.error || 'CHIP did not answer';
      }
      const fresh = await fetch('/map').then((r) => r.json());
      const now = fresh.nodes?.find((x) => x.id === n.id);
      const [word] = LIVE[now?.state] ?? LIVE.unknown;
      setSaid(error || now?.state === 'bad' ? { tone: 'danger', text: `${name}: ${plainWords(first(error ?? now?.detail ?? 'it did not answer'))}` } : { tone: now?.state === 'ok' ? 'success' : 'info', text: `${name}: ${word}. ${plainWords(first(now?.detail ?? ''))}`.trim() });
    } catch {
      setSaid({ tone: 'danger', text: `${name}: CHIP didn’t answer. Try again in a moment.` });
    } finally {
      reload();
      setBusy(null);
    }
  };

  if (!map) return <EmptyState size="page" title="Knocking on every door" line="Asking each connector if it's home. Two ticks." />;
  if (map.error) return <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its connectors just now. Refresh and I'll ask again." />;

  const reaches = REACHES.map((r) => ({ ...r, n: node(r.id) })).filter((r) => r.n);
  const live = reaches.filter((r) => r.n.state === 'ok').length;
  const paths = PATHS.map((p) => ({ ...p, n: node(p.id) })).filter((p) => p.n);
  const compare = node('compare');
  const needs = map.nodes.filter((n) => n.state === 'bad' && n.action?.type === 'test');
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
              const [word, tone] = LIVE[r.n.state] ?? LIVE.unknown;
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
                      <Button variant="secondary" size="sm" href="#/history">
                        Log
                      </Button>
                    ) : r.id === 'ci' ? undefined : (
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
              const act = p.n.state === 'bad' ? <Button variant="secondary" size="sm" onClick={() => setSetup(p.n)}>Set up</Button> : testButton(p.n);
              // ListRow moves its button under the words on a narrow row by itself (parts-dev b69a5de)
              return <ListRow key={p.id} iconWell={<IconWell icon={p.icon} tone="info" />} title={p.name} description={says(p.n)} status={<StateTag state={p.n.state} />} actionButton={act} />;
            })}
          </Flow>
          {compare ? (
            <Notification
              tone={compare.state === 'ok' ? 'success' : 'info'}
              title="Compare with Figma"
              message={compare.state === 'ok' ? 'Figma matches the code.' : `Can't compare yet. ${compare.blockedBy ? `Waits on ${nameOf(compare.blockedBy)}. ` : ''}${plainWords(first(compare.detail))}`}
            />
          ) : null}
        </Flow>
      </Card>

      {needs.length ? (
        <Card>
          <Flow gap={16}>
            <SectionHead icon="WarningCircle" iconTone="warning" title="Need setup" description="Connect these to unlock more checks" showDescription number={needs.length} words="to set up" showNumber />
            <Columns count={3}>
              {needs.map((n) => (
                  // Figma: name, one line, the action in the card footer at the bottom right; no icon
                  // Figma: the key card's Add key is the one primary button; the rest Set up
                  <Card key={n.id} footerAction={n.id === 'figma-key' ? <Button variant="primary" size="sm" onClick={() => setSetup(n)}>Add key</Button> : <Button variant="secondary" size="sm" onClick={() => setSetup(n)}>Set up</Button>}>
                    <TextStack title={nameOf(n)} body={why(n)} />
                  </Card>
              ))}
            </Columns>
          </Flow>
        </Card>
      ) : null}

      <Drawer
        side="right"
        open={!!setup}
        onClose={() => setSetup(null)}
        label={setup ? `Set up ${nameOf(setup)}` : 'Set up'}
        footer={setup ? <Flow direction="row" justify="end">{testButton(setup, 'Test it')}</Flow> : null}
      >
        {setup ? (
          // the drawer's title already names it, so the body opens with what to do; groups 24 apart (rule 10)
          <Flow gap={24}>
            <TextStack body={plainWords(setup.detail)} />
            {setup.dependents?.length ? <TextStack overline="Unlocks" body={setup.dependents.join(', ')} /> : null}
          </Flow>
        ) : null}
      </Drawer>
    </>
  );
}
