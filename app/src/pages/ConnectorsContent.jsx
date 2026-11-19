// Connectors · content: the code twin of the Figma slot fill (CHIP Dashboard
// 601:126716). Reaches (the services CHIP talks to now), Figma paths (any one
// is enough) leading to Compare with Figma, and Need setup. Real CHIP data:
// /map (each node's state and detail) and /host/test. BELLA parts and the
// template's Flow only.
//
// Gaps (library board): the App tile part (Figma's Reaches tiles; Card with
// Text stack stands in), the curved path drawing and its Hub (Map line pieces
// placed by position), the GitHub, git and Notion brand marks. Push on the CI
// tile waits: pushing runs only on Elleta's own yes, never from a page button.
import { useCallback, useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Tag from '@bella/components/Tag/Tag';
import ListRow from '@bella/components/ListRow/ListRow';
import IconWell from '@bella/components/IconWell/IconWell';
import Notification from '@bella/components/Notification/Notification';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Columns from '@bella/components/Columns/Columns';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
// map state → the words and tone Figma uses on a tile
const LIVE = { ok: ['Live', 'success'], bad: ['Needs setup', 'danger'], blocked: ['Waiting', 'attention'], unknown: ['Not tested', 'neutral'] };
const REACHES = [
  { id: 'ci', name: 'GitHub CI', icon: 'Network', ok: 'Ran' },
  { id: 'git', name: 'git', icon: 'Code', ok: 'Up to date' },
  { id: 'claude', name: 'Agent', icon: 'Sparks', ok: 'Ready', sub: 'OBI uses it' },
  { id: 'ollama', name: 'Local model', icon: 'Activity', ok: 'Ready', sub: ':11434' },
];
const PATHS = [
  { id: 'figma', name: 'Figma desktop MCP', icon: 'Activity' },
  { id: 'figma-console', name: 'figma-console', icon: 'Code' },
  { id: 'figma-rest', name: 'figma-rest', icon: 'EvPlug' },
];
const first = (s) => String(s ?? '').split(/(?<=\.)\s/)[0];
// Figma's own short words for each connector (601:126716): plain, no paths, tokens or hashes
const SAYS = {
  figma: { ok: 'Answers', other: 'Not configured' },
  'figma-console': { ok: 'Answers', other: 'Not configured' },
  'figma-rest': { ok: 'Answers', other: 'Needs a token', why: 'Reads Figma, no app open' },
  notion: { ok: 'Answers', other: 'Needs a token', why: 'Reads shared pages' },
};
const says = (n) => (n.state === 'ok' ? SAYS[n.id]?.ok : SAYS[n.id]?.other) ?? (n.state === 'ok' ? 'Answers' : 'Not set up yet');
const why = (n) => SAYS[n.id]?.why ?? 'Unlocks more checks';
// git: the short commit only, as Figma shows it ("3d74f7d"), never the branch path
const sha = (t) => String(t ?? '').match(/\b[0-9a-f]{7,}\b/)?.[0];


function useMap() {
  const [map, setMap] = useState(null);
  const load = useCallback(
    () =>
      fetch('/map')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(setMap)
        .catch(() => setMap({ error: true, nodes: [] })),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return [map, load];
}

function StateTag({ state }) {
  const [word, tone] = LIVE[state] ?? LIVE.unknown;
  return (
    <Tag tone={tone} showDot>
      {word}
    </Tag>
  );
}

export default function ConnectorsContent() {
  const phone = useNarrow();
  const [map, reload] = useMap();
  const [busy, setBusy] = useState(null);
  const [setup, setSetup] = useState(null);
  const node = (id) => map?.nodes?.find((n) => n.id === id);
  const test = (id) => {
    setBusy(id);
    fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: id }) })
      .catch(() => null)
      .then(() => reload())
      .finally(() => setBusy(null));
  };

  if (!map) return <EmptyState size="page" title="Knocking on every door" line="Asking each connector if it's home. Two ticks." />;
  if (map.error) return <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its connectors just now. Refresh and I'll ask again." />;

  const reaches = REACHES.map((r) => ({ ...r, n: node(r.id) })).filter((r) => r.n);
  const live = reaches.filter((r) => r.n.state === 'ok').length;
  const paths = PATHS.map((p) => ({ ...p, n: node(p.id) })).filter((p) => p.n);
  const compare = node('compare');
  const needs = map.nodes.filter((n) => n.state === 'bad' && n.action?.type === 'test');
  const testButton = (n, label = 'Test') => (
    <Button variant="secondary" size="sm" icon="Play" onClick={() => test(n.id)} disabled={busy === n.id}>
      {busy === n.id ? 'Testing…' : label}
    </Button>
  );

  return (
    <>
      <Card>
        <Flow gap={16}>
          <SectionHead icon="EvPlug" iconTone="info" title="Reaches" description="Services CHIP talks to now" showDescription number={live} words="answer now" showNumber />
          <Columns count={2}>
            {reaches.map((r) => (
                <Card key={r.id}>
                  <Flow gap={12}>
                    <Flow direction="row" justify="between" align="center" gap={8} wrap>
                      <IconWell icon={r.icon} tone="neutral" />
                      <StateTag state={r.n.state} />
                    </Flow>
                    {/* short meta (":11434") in the meta face; a sentence in the reading face */}
                    <TextStack
                      overline={r.name}
                      title={r.n.state === 'ok' ? r.ok : LIVE[r.n.state]?.[0] ?? 'Not tested'}
                      subtitle={r.id === 'git' ? sha(r.n.detail) : r.sub && r.n.state === 'ok' ? r.sub : undefined}
                      body={r.id === 'git' || (r.sub && r.n.state === 'ok') ? undefined : first(r.n.detail)}
                    />
                    <Flow direction="row" justify="end">
                      {r.id === 'git' ? (
                        <Button variant="secondary" size="sm" href="#/history">
                          Log
                        </Button>
                      ) : r.id === 'ci' ? null : (
                        testButton(r.n)
                      )}
                    </Flow>
                  </Flow>
              </Card>
            ))}
          </Columns>
        </Flow>
      </Card>

      <Card>
        <Flow gap={16}>
          <SectionHead icon="Map" iconTone="info" title="Figma paths" description="Ways CHIP can read Figma" showDescription words="Any one path is enough" />
          <Flow gap={8} as="ul" aria-label="Figma paths">
            {paths.map((p) => {
              const act = p.n.state === 'bad' ? <Button variant="secondary" size="sm" icon="Settings" onClick={() => setSetup(p.n)}>Set up</Button> : testButton(p.n);
              // a phone: ListRow keeps its button beside the words (part gap), so the button gets its own row
              return phone ? (
                <li key={p.id}>
                  <Flow gap={8}>
                    <ListRow as="div" iconWell={<IconWell icon={p.icon} tone="info" />} title={p.name} description={says(p.n)} />
                    <Flow direction="row" justify="end">{act}</Flow>
                  </Flow>
                </li>
              ) : (
                <ListRow key={p.id} iconWell={<IconWell icon={p.icon} tone="info" />} title={p.name} description={says(p.n)} status={<StateTag state={p.n.state} />} actionButton={act} />
              );
            })}
          </Flow>
          {compare ? (
            <Notification
              tone={compare.state === 'ok' ? 'success' : 'info'}
              icon="InfoCircle"
              title="Compare with Figma"
              message={compare.state === 'ok' ? 'Figma matches the code.' : `Can't compare yet. ${compare.blockedBy ? `Waits on ${compare.blockedBy.name}. ` : ''}${first(compare.detail)}`}
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
                  <Card key={n.id}>
                    <Flow gap={8}>
                      <ListRow as="div" iconWell={<IconWell icon="Settings" tone="neutral" />} title={n.name} description={why(n)} actionButton={phone ? undefined : <Button variant="secondary" size="sm" onClick={() => setSetup(n)}>Set up</Button>} />
                      {phone ? (
                        <Flow direction="row" justify="end">
                          <Button variant="secondary" size="sm" onClick={() => setSetup(n)}>Set up</Button>
                        </Flow>
                      ) : null}
                    </Flow>
                  </Card>
              ))}
            </Columns>
          </Flow>
        </Card>
      ) : null}

      <Drawer
        open={!!setup}
        onClose={() => setSetup(null)}
        label={setup ? `Set up ${setup.name}` : 'Set up'}
        footer={setup ? <Flow direction="row" justify="end">{testButton(setup, 'Test it')}</Flow> : null}
      >
        {setup ? (
          <Flow gap={16}>
            <TextStack title={setup.name} body={setup.detail} />
            {setup.dependents?.length ? <TextStack overline="Unlocks" body={setup.dependents.join(', ')} /> : null}
          </Flow>
        ) : null}
      </Drawer>
    </>
  );
}
