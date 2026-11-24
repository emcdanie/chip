// Projects: every repo CHIP works on, CHIP itself included (GET /projects,
// server/lib/projects.mjs). One tab a project: how it runs, which BELLA it
// uses, the "what we're working on" note, what is in progress (PRs,
// worktrees, branches, commits, Claude sessions today) and its pages. The
// actions open its terminal or Claude, open it in the Playground, and start
// or open its dev server; Stop shows only for a server CHIP started.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
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
const PAGE_KIND = { next: 'Next.js routes under app/', hash: 'Hash routes in the nav', storybook: 'Storybook docs, one a stories file' };
// the Playground's address for a project, and for one of its pages
export const playHref = (id, route) => `#/play/${id}${route ? `?route=${encodeURIComponent(route)}` : ''}`;

const terminal = (repo, command) => window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo, command } }));

function List({ items, empty, cap = 6, render, label }) {
  const [all, setAll] = useState(false);
  if (!items?.length) return <p className="pj-none">{empty}</p>;
  const shown = all ? items : items.slice(0, cap);
  return (
    <>
      <ul className="pj-list" aria-label={label}>
        {shown.map(render)}
      </ul>
      {items.length > cap ? (
        <div className="pj-more">
          <Toggle expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? 'Show fewer' : `Show all ${items.length}`}
          </Toggle>
        </div>
      ) : null}
    </>
  );
}

function Note({ p, onSaved }) {
  const [text, setText] = useState(p.note);
  const [state, setState] = useState('');
  useEffect(() => setText(p.note), [p.id, p.note]);
  const save = async () => {
    setState('Saving…');
    try {
      const r = await fetch(`/projects/${p.id}/note`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ note: text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setState(`Saved ${ago(j.noteAt)}`);
      onSaved(j);
    } catch (e) {
      setState(`Not saved: ${e.message}`);
    }
  };
  return (
    <Card title="What we’re working on" sub="A line or two for whoever opens this project next, you or a Claude session. Kept in chip.config.local.json.">
      <label className="k-vh" htmlFor={`pj-note-${p.id}`}>
        What we’re working on in {p.name}
      </label>
      <textarea id={`pj-note-${p.id}`} className="pj-note" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nothing written yet." />
      <div className="pj-noteacts">
        <span className="pj-saved" role="status">
          {state || (p.noteAt ? `Last saved ${ago(p.noteAt)}` : '')}
        </span>
        <Button onClick={save} disabled={text === p.note}>
          Save note
        </Button>
      </div>
    </Card>
  );
}

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
      <section className="pj-hero k-card" aria-labelledby={`pj-h-${p.id}`}>
        {/* the card above names it and says whether it runs: no second header or badge here */}
        <h2 className="k-vh" id={`pj-h-${p.id}`}>
          {p.name}
        </h2>
        {p.description ? <p className="pj-desc">{p.description}</p> : null}
        <div className="pj-acts">
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
          <Button variant="primary" href={playHref(p.id)}>
            Open in Playground
          </Button>
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

      <div className="pj-two">
        <Card title="Setup" sub="Read from the repo and the local config.">
          <dl className="pj-dl">
            {setup.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Note p={p} onSaved={() => reload(p.id)} />
      </div>

      <Card title="In progress" sub={lv ? `Read live from git${lv.prs ? ' and GitHub' : ''}, ${ago(lv.readAt)}.` : 'Reading git…'} action={<LinkButton onClick={() => reload(p.id, true)}>Read again</LinkButton>}>
        {lv ? (
          <div className="pj-grid">
            <div>
              <h3 className="pj-h3">Open pull requests {lv.prs ? <span className="n">{lv.prs.length}</span> : null}</h3>
              {lv.prs ? (
                <List
                  label="Open pull requests"
                  items={lv.prs}
                  empty="None open."
                  render={(pr) => (
                    <li key={pr.number}>
                      <a href={pr.url} target="_blank" rel="noreferrer">
                        #{pr.number} {pr.title}
                      </a>
                      <small>
                        <code>{pr.headRefName}</code>
                        {pr.isDraft ? ' · draft' : ''} · {ago(pr.updatedAt)}
                      </small>
                    </li>
                  )}
                />
              ) : (
                <p className="pj-none">GitHub didn’t answer (gh missing or signed out), so PRs are left out.</p>
              )}
            </div>
            <div>
              <h3 className="pj-h3">Claude sessions today {lv.claude?.length ? <span className="n">{lv.claude.reduce((n, c) => n + c.sessions, 0)}</span> : null}</h3>
              <List
                label="Claude sessions today"
                items={lv.claude}
                empty="No Claude Code session has worked here in the last day."
                render={(c) => (
                  <li key={c.where}>
                    <b>{c.where}</b>
                    <small>
                      {c.sessions} session{c.sessions === 1 ? '' : 's'} · last {ago(c.last)}
                    </small>
                  </li>
                )}
              />
            </div>
            <div>
              <h3 className="pj-h3">Worktrees <span className="n">{lv.worktreeCount}</span></h3>
              <List
                label="Worktrees"
                items={lv.worktrees}
                empty="Only the main checkout."
                render={(w) => (
                  <li key={w.path}>
                    <b>{w.name}</b>
                    <small>
                      <code>{w.branch ?? 'detached'}</code>
                    </small>
                  </li>
                )}
              />
            </div>
            <div>
              <h3 className="pj-h3">Recent branches</h3>
              <List
                label="Recent branches"
                items={lv.branches}
                empty="No branches."
                render={(b) => (
                  <li key={b.name}>
                    <code>{b.name}</code>
                    <small>
                      {b.ahead == null ? 'the default' : `${b.ahead} ahead of ${lv.defaultBranch}`} · {day(b.date)}
                    </small>
                  </li>
                )}
              />
            </div>
            <div className="pj-wide">
              <h3 className="pj-h3">Recent commits on {lv.branch}</h3>
              <List
                label="Recent commits"
                items={lv.commits}
                empty="No commits."
                render={(c) => (
                  <li key={c.sha} className="pj-commit">
                    <code>{c.sha}</code>
                    <span>{c.subject}</span>
                    <small>{day(c.date)}</small>
                  </li>
                )}
              />
            </div>
          </div>
        ) : (
          <p className="pj-none">{p.exists ? 'Reading git…' : `The folder ${p.repo} isn’t there.`}</p>
        )}
      </Card>

      <Card title="Pages" sub={`${PAGE_KIND[p.pageKind] ?? 'Pages'}, read from the repo. Each one opens in the Playground.`}>
        {p.pages.length ? <DataTable label={`pages-${p.id}`} cols={cols} rows={p.pages} rowKey={(r) => r.route} /> : <p className="pj-none">No pages read from this repo.</p>}
      </Card>
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
          <div className="pj-cards" role="list" aria-label="Pick a project">
            {list.map((p) => {
              const run = RUN[p.run?.state] ?? RUN.none;
              return (
                <div role="listitem" key={p.id}>
                  <button type="button" className="pj-card" aria-pressed={p.id === id} onClick={() => onProject(p.id)}>
                    <b>{p.name}</b>
                    <small>
                      <code>{p.branch ?? '…'}</code>
                    </small>
                    <span className="pj-facts">
                      <StatusPill tone={run.tone}>{run.word}</StatusPill>
                      {p.id === id && detail[id]?.run?.by === 'chip' ? <span>started by CHIP</span> : p.id === id && detail[id]?.run?.by === 'outside' ? <span>started outside CHIP</span> : null}
                      <span>{p.pageCount} pages</span>
                      <span>{p.bella?.label}</span>
                      {p.prs != null ? <span>{p.prs} open PRs</span> : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {id ? detail[id] ? <Panel p={detail[id]} reload={reload} /> : <p className="pj-none">Reading {list.find((p) => p.id === id)?.short}…</p> : null}
        </>
      ) : (
        <p className="pj-none">Reading the projects…</p>
      )}
    </div>
  );
}
