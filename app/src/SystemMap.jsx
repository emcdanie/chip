// The system map (phase 6 I): BELLA's pipeline from GET /map, as a tree —
// the pipeline, its six groups, their nodes — each node's state from real
// data (the checks, the connectors' last test, git, bella.json). A failing
// node greys out what reads from it ("Blocked by Gate"). Selecting a node
// opens its panel: what it is, where the fact comes from, what reads it,
// and one action (Test, Run, Review).
import React, { useEffect, useState } from 'react';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import { openReview, changed } from './ReviewSheet.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
export const NODE_STATE = {
  ok: { variant: 'success', word: '✓ Healthy' },
  warn: { variant: 'attention', word: '! Needs attention' },
  bad: { variant: 'danger', word: '✕ Failing' },
  blocked: { variant: 'neutral', word: '⊘ Blocked' },
  unknown: { variant: 'neutral', word: '– Not measured' },
  off: { variant: 'neutral', word: 'Off' },
};

export default function SystemMap() {
  const [map, setMap] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () =>
    fetch('/map')
      .then((r) => r.json())
      .then(setMap)
      .catch(() => setMap({ error: true }));
  useEffect(() => {
    load();
    window.addEventListener('chip:changed', load);
    return () => window.removeEventListener('chip:changed', load);
  }, []);
  if (!map) return <p className="label">Reading the system…</p>;
  if (map.error) return <p className="label">The map could not be read (is the CHIP server running?).</p>;
  const node = map.nodes.find((n) => n.id === sel);

  async function act(a) {
    setMsg(null);
    if (a.type === 'review') {
      setSel(null);
      return openReview(a.check);
    }
    setBusy(a.label);
    try {
      if (a.type === 'test') {
        const r = await fetch('/host/test', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ server: a.server }) });
        const j = await r.json();
        setMsg(j.status === 'connected' ? `${a.server} answers.` : `${a.server} is not answering${j.error ? `: ${j.error}` : ''}.`);
      } else if (a.type === 'run') {
        const r = await fetch(`/checks/${a.check}/run`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
        const j = await r.json();
        setMsg(r.ok ? 'Started. Overview shows the result when it lands.' : j.error);
      }
      await load();
      changed();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="map">
      <p className="map-sentence" aria-live="polite">
        {map.sentence}
      </p>
      <div className="map-tree">
        <p className="map-root">
          <span className="card-title">BELLA pipeline</span> <span className="label">{map.base}</span>
        </p>
        <ol className="map-groups">
          {map.groups.map((g) => {
            const gs = NODE_STATE[g.state] ?? NODE_STATE.unknown;
            return (
              <li key={g.id} className="map-group">
                <p className="map-group-head">
                  <span className="map-group-name">{g.name}</span>
                  <StatusPill variant={gs.variant}>{gs.word}</StatusPill>
                  <span className="label">{g.healthy}% healthy</span>
                </p>
                <ol className="map-nodes">
                  {map.nodes
                    .filter((n) => n.group === g.id)
                    .map((n) => {
                      const st = NODE_STATE[n.state] ?? NODE_STATE.unknown;
                      return (
                        <li key={n.id} data-state={n.state}>
                          <button type="button" className="map-node" onClick={() => setSel(n.id)} aria-haspopup="dialog">
                            <span className="map-node-name">{n.name}</span>
                            <StatusPill variant={st.variant}>{st.word}</StatusPill>
                            <span className="label">{n.blockedBy ? `Blocked by ${n.blockedBy.name}` : n.deps.length ? `Reads ${n.deps.length}` : 'A source'}</span>
                          </button>
                        </li>
                      );
                    })}
                </ol>
              </li>
            );
          })}
        </ol>
      </div>
      <Drawer open={!!node} onClose={() => (setSel(null), setMsg(null))} label={node?.name ?? 'Node'} side="right" className="sheet">
        {node ? (
          <div className="map-panel">
            <p>
              <StatusPill variant={(NODE_STATE[node.state] ?? NODE_STATE.unknown).variant}>{(NODE_STATE[node.state] ?? NODE_STATE.unknown).word}</StatusPill>
              {node.blockedBy ? ` by ${node.blockedBy.name}: it reads from it, so nothing it says can be trusted until that passes.` : ''}
            </p>
            <dl className="map-facts">
              <dt>Health</dt>
              <dd>{node.detail}</dd>
              <dt>Where this comes from</dt>
              <dd className="mono">{node.source}</dd>
              <dt>Reads from</dt>
              <dd>{node.deps.length ? node.deps.map((d) => map.nodes.find((x) => x.id === d)?.name ?? d).join(', ') : 'Nothing: it is a source.'}</dd>
              <dt>If this breaks</dt>
              <dd>{node.dependents.length ? `${node.dependents.join(', ')} ${node.dependents.length === 1 ? 'is' : 'are'} blocked.` : 'Nothing else reads it.'}</dd>
            </dl>
            {msg ? (
              <p className="review-note" role="status">
                {msg}
              </p>
            ) : null}
            {node.action ? (
              <div className="review-actions">
                <Button variant="primary" onClick={() => act(node.action)} disabled={!!busy}>
                  {busy ?? node.action.label}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
