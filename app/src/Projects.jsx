// Projects: every repo CHIP works on, CHIP itself included (GET /projects,
// server/lib/projects.mjs). A work list since the concept lock (amended 7 Nov):
// one table compares how each project is set up, then the picked project's
// work in progress (PRs, Claude sessions today, worktrees) as rows and its pages.
// The actions open its terminal or Claude, open it in the Playground, and start
// or open its dev server; Stop shows only for a server CHIP started. The note,
// recent branches and recent commits are cut: History has the commits.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import BellaStatusPill from '@bella/components/StatusPill/StatusPill';
import { Card, DataTable, LinkButton, PageHeader, StatusPill, Toggle } from './kit/index.jsx';
import './Projects.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const ago = (iso) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso)) / 1e3);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso);
};
const RUN = {
  running: { tone: 'pass', word: 'Running' },
  starting: { tone: 'needs', word: 'Starting' },
  stopped: { tone: 'neutral', word: 'Not running' },
  none: { tone: 'neutral', word: 'No dev server' },
};
// how each project is set up, a row each: the comparison table and its narrow stack read these
const SETUP = [
  ['Runs', (p) => <BellaStatusPill variant={RUN_PILL[p.run?.state] ?? 'neutral'}>{(RUN[p.run?.state] ?? RUN.none).word}</BellaStatusPill>],
  ['BELLA', (p) => p.bella?.label ?? 'Not measured'],
  ['Branch', (p) => <code>{p.branch ?? '…'}</code>],
  ['Pages', (p) => p.pageCount],
  ['Open PRs', (p) => p.prs ?? 'Not measured'],
  ['Worktrees', (p) => p.worktrees ?? 'Not measured'],
];
const RUN_PILL = { running: 'success', starting: 'attention', stopped: 'neutral', none: 'neutral' };
const PAGE_KIND = { next: 'Next.js routes under app/', hash: 'Hash routes in the nav', storybook: 'Storybook docs, one a stories file' };
// the Playground's address for a project, and for one of its pages
export const playHref = (id, route) => `#/play/${id}${route ? `?route=${encodeURIComponent(route)}` : ''}`;

const terminal = (repo, command) => window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo, command } }));

function Panel({ p, reload }) {
  const lv = p.live;
  const [busy, setBusy] = useState('');
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);

  const dev = async (action) => {
    setBusy(action);
    try {
      const r = await fetch(`/projects/${p.id}/dev`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (action === 'start' && !j.already) {
        // check every 2s for a minute, until the port answers
        let n = 0;
        clearInterval(poll.current);
        poll.current = setInterval(async () => {
          const d = await reload(p.id);
          if (d?.run?.state === 'running' || ++n > 30) clearInterval(poll.current);
        }, 2000);
      }
      await reload(p.id);
    } catch (e) {
      setBusy(`Could not ${action}: ${e.message}`);
      return;
    }
    setBusy('');
  };

  const setup = [
    ['Repo', <code key="r">{p.repo}</code>],
    ['Branch', lv ? <><code>{lv.branch}</code>{lv.branch !== lv.defaultBranch ? <> · default <code>{lv.defaultBranch}</code></> : ' (the default)'}{lv.dirty ? ` · ${lv.dirty} uncommitted` : ''}</> : '…'],
    ['Runs', p.run?.self ? <>This CHIP, at <code>{p.run.url}</code></> : p.run?.command ? <><code>{p.run.command}</code> on port {p.run.port}</> : 'No dev command in the config'],
    ['BELLA', p.bella ? <><b>{p.bella.label}.</b> {p.bella.detail}{p.bella.source ? <> (<code>{p.bella.source}</code>)</> : null}</> : '…'],
    ['Pages', `${p.pages.length} · ${PAGE_KIND[p.pageKind] ?? 'none read'}`],
  ];

  const cols = [
    {
      key: 'label',
      label: 'Page',
      render: (r) => (
        <span className="pj-pg">
          {r.label}
          {r.label !== r.route ? (
            <small>
              <code>{r.route}</code>
            </small>
          ) : null}
        </span>
      ),
    },
    { key: 'file', label: 'Source', render: (r) => <code>{r.file}</code> },
    {
      key: 'act',
      label: 'Action',
      hideLabel: true,
      sort: false,
      end: true,
      render: (r) =>
        r.dynamic ? (
          <span className="pj-none">Template</span>
        ) : (
          <a className="pj-rowlink" href={playHref(p.id, r.route)} aria-label={`Open ${r.label} in the Playground`}>
            Playground
          </a>
        ),
    },
  ];

  return (
    <div className="pj-panel">
      <section className="pj-hero" aria-labelledby={`pj-h-${p.id}`}>
        <h2 id={`pj-h-${p.id}`}>{p.name}</h2>
        {p.description ? <p className="pj-desc">{p.description}</p> : null}
        <div className="pj-acts">
          <Button variant="primary" href={playHref(p.id)}>
            Open in Playground
          </Button>
          <Button onClick={() => terminal(p.terminal, '')}>Open terminal</Button>
          <Button onClick={() => terminal(p.terminal, 'claude')}>Start Claude here</Button>
          {p.run?.state === 'running' && !p.run.self ? (
            <Button href={p.run.url}>Open {p.run.url.replace(/^https?:\/\//, '')}</Button>
          ) : p.run?.command && p.run.state === 'stopped' ? (
            <Button onClick={() => dev('start')} disabled={!!busy}>
              Start dev server
            </Button>
          ) : null}
          {p.run?.by === 'chip' ? (
            <Button variant="tertiary" onClick={() => dev('stop')} disabled={!!busy}>
              Stop the server CHIP started
            </Button>
          ) : null}
        </div>
        {busy.startsWith('Could not') ? (
          <p className="k-note pj-err" role="alert">
            {busy}
          </p>
        ) : null}
        {p.run?.log?.length && p.run.state !== 'running' ? (
          <pre className="pj-log" aria-label="Dev server output">
            {p.run.log.join('\n')}
          </pre>
        ) : null}
      </section>

      <section className="pj-sec" aria-labelledby={`pj-wip-${p.id}`}>
        <div className="pj-sechead">
          <h2 id={`pj-wip-${p.id}`}>In progress</h2>
          <button type="button" className="k-link" onClick={() => reload(p.id, true)}>
            Read again
          </button>
        </div>
        <p className="pj-quiet">{lv ? `Read from git${lv.prs ? ' and GitHub' : ''} ${ago(lv.readAt)}${lv.prs ? '' : ' · Not measured: pull requests (gh missing or signed out)'}` : p.exists ? 'Reading git…' : `The folder ${p.repo} isn’t there.`}</p>
        {lv && (lv.prs?.length || lv.claude?.length || lv.worktrees?.length) ? (
          <ListRowGroup ariaLabel={`In progress in ${p.name}`}>
            {(lv.prs ?? []).map((pr) => (
              <ListRow
                key={`pr-${pr.number}`}
                title={
                  <>
                    <BellaStatusPill className="pj-tag" variant={pr.isDraft ? 'neutral' : 'info'}>
                      {pr.isDraft ? 'Draft PR' : 'PR'}
                    </BellaStatusPill>
                    #{pr.number} {pr.title}
                  </>
                }
                description={
                  <>
                    Updated {ago(pr.updatedAt)}. Branch: <code>{pr.headRefName}</code>
                  </>
                }
                action={
                  <Button variant="secondary" href={pr.url} ariaLabel={`Open pull request ${pr.number}`}>
                    Open
                  </Button>
                }
              />
            ))}
            {(lv.claude ?? []).map((c) => (
              <ListRow
                key={`cl-${c.where}`}
                title={
                  <>
                    <BellaStatusPill className="pj-tag" variant="neutral">
                      Claude
                    </BellaStatusPill>
                    {c.sessions} session{c.sessions === 1 ? '' : 's'} today in {c.where}
                  </>
                }
                description={`Last one ${ago(c.last)}.`}
              />
            ))}
            {(lv.worktrees ?? []).map((w) => (
              <ListRow
                key={`wt-${w.path}`}
                title={
                  <>
                    <BellaStatusPill className="pj-tag" variant="neutral">
                      Worktree
                    </BellaStatusPill>
                    {w.name}
                  </>
                }
                description={
                  <>
                    Branch: <code>{w.branch ?? 'detached'}</code>
                  </>
                }
              />
            ))}
          </ListRowGroup>
        ) : lv ? (
          <p className="pj-none">Nothing in progress: no open PR, no Claude session today, only the main checkout.</p>
        ) : null}
      </section>

      <section className="pj-sec" aria-labelledby={`pj-pages-${p.id}`}>
        <h2 id={`pj-pages-${p.id}`}>Pages</h2>
        <p className="pj-quiet">{`${PAGE_KIND[p.pageKind] ?? 'Pages'}, read from the repo. Each one opens in the Playground.`}</p>
        {p.pages.length ? <DataTable label={`pages-${p.id}`} cols={cols} rows={p.pages} rowKey={(r) => r.route} /> : <p className="pj-none">No pages read from this repo.</p>}
      </section>
    </div>
  );
}

export default function Projects({ projectId, onProject }) {
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState({});
  const [error, setError] = useState(null);
  const id = projectId && list?.some((p) => p.id === projectId) ? projectId : list?.[0]?.id;

  useEffect(() => {
    fetch('/projects')
      .then((r) => r.json())
      .then((j) => setList(j.projects))
      .catch((e) => setError(e.message));
  }, []);
  const reload = useCallback(async (pid, fresh) => {
    try {
      const d = await fetch(`/projects/${pid}${fresh ? '?fresh=1' : ''}`).then((r) => r.json());
      setDetail((m) => ({ ...m, [pid]: d }));
      return d;
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (id && !detail[id]) reload(id);
  }, [id, detail, reload]);

  return (
    <div className="pj-page k-chrome">
      <PageHeader
        title="Projects"
        lede="Every repo CHIP works on: how it runs and what’s in progress."
      />
      {error ? (
        <p className="k-note" role="alert">
          Projects didn’t load: {error}
        </p>
      ) : null}
      {list ? (
        <>
          <section className="pj-sec" aria-labelledby="pj-cmp">
            <h2 id="pj-cmp">Set up per project</h2>
            <div className="pj-cmpwrap">
              <table className="pj-cmp">
                <caption className="k-vh">How each project is set up. Pick one to see its work in progress.</caption>
                <thead>
                  <tr>
                    <td />
                    {list.map((p) => (
                      <th scope="col" key={p.id}>
                        <button type="button" className="k-link" aria-pressed={p.id === id} onClick={() => onProject(p.id)}>
                          {p.name}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SETUP.map(([k, f]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      {list.map((p) => (
                        <td key={p.id}>{f(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pj-stack">
              {list.map((p) => (
                <div className="pj-stackone" key={p.id}>
                  <button type="button" className="k-link" aria-pressed={p.id === id} onClick={() => onProject(p.id)}>
                    {p.name}
                  </button>
                  <dl>
                    {SETUP.map(([k, f]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{f(p)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
          {id ? detail[id] ? <Panel p={detail[id]} reload={reload} /> : <p className="pj-none">Reading {list.find((p) => p.id === id)?.short}…</p> : null}
        </>
      ) : (
        <p className="pj-none">Reading the projects…</p>
      )}
    </div>
  );
}
