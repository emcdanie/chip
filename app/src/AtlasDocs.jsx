// Atlas · Documentation (Atlas v4 §6, §9): read the component's guidance
// (docs/components/<id>.md in BELLA), its contract and the AGENTS.md lines
// that name it; Edit opens the source beside a live preview; Propose makes a
// local BELLA branch docs/<id>-<slug> whose commit runs the gate; Open pull
// request is a guarded confirm that pushes only that branch and opens a
// draft PR. CHIP never merges.
import React, { useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import Columns from '@bella/components/Columns/Columns';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Input from '@bella/components/Input/Input';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Link from '@bella/components/Link/Link';
import { Rich } from './Obi.jsx';
import { canEdit } from './visibility.jsx';

const REPO = 'https://github.com/emcdanie/bella/blob/main/';
const JSON_HEADERS = { 'content-type': 'application/json' };
const STEPS = ['Read', 'Edit', 'Propose', 'Open pull request'];
const KINDS = [
  { value: 'guidance', label: 'Guidance' },
  { value: 'contract', label: 'Contract' },
  { value: 'agents', label: 'Rules for AI agents' },
];

function Flow({ at }) {
  return (
    <ol className="doc-flow" aria-label="Review steps">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

// the contract must stay a contract: JSON, with the keys agents and the gate read
function checkContract(text) {
  try {
    const b = JSON.parse(text);
    const meta = b.$extensions?.bella;
    if (!meta) return 'The contract needs $extensions.bella';
    for (const k of ['name', 'variants', 'states', 'props']) if (!(k in meta)) return `The contract needs $extensions.bella.${k}`;
    for (const k of ['variants', 'states', 'props']) if (!Array.isArray(meta[k])) return `$extensions.bella.${k} must be a list`;
    return null;
  } catch (e) {
    return `Not valid JSON: ${e.message}`;
  }
}

const agentsSource = (rules) => rules.map((r) => `${r.line}| ${r.text}`).join('\n');
const agentsEdits = (text) =>
  text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(/^(\d+)\|\s?(.*)$/);
      if (!m) throw new Error(`Keep the line number in front: "${l.slice(0, 30)}…"`);
      return { line: Number(m[1]), text: m[2] };
    });

function DocCard({ title, copy, notify, children }) {
  async function copyMd() {
    try {
      await navigator.clipboard.writeText(copy);
      notify(`Copied ${title} as markdown`);
    } catch {
      notify('Could not copy');
    }
  }
  return (
    <Card innerClassName="doc-card">
      <div className="card-row">
        <h3 className="card-title">{title}</h3>
        <ActionChip onClick={copyMd} ariaLabel={`Copy ${title} as markdown`}>
          Copy as markdown
        </ActionChip>
      </div>
      {children}
    </Card>
  );
}

function Read({ d, notify }) {
  const contractMd = [`## ${d.name} contract`, '', '### Use it for', ...d.contract.usage.map((u) => `- ${u}`), '', "### Don't", ...d.contract.dont.map((x) => `- ${x}`)].join('\n');
  const agentsMd = d.agents.rules.map((r) => `> ${r.text}\n> (AGENTS.md, line ${r.line})`).join('\n\n');
  const relatedMd = d.related.map((r) => `- ${r.name}${r.why ? `: ${r.why}` : ''}`).join('\n');
  return (
    <Columns count={2}>
      <DocCard title="Guidance" copy={d.guidance.md ?? ''} notify={notify}>
        {d.guidance.md ? (
          <div className="doc-prose">
            <Rich text={d.guidance.md.replace(/^# .*\n+/, '')} />
          </div>
        ) : (
          <p className="label">No guidance file yet. Edit creates {d.guidance.path}; the rules stay in the contract.</p>
        )}
        <Link href={`${REPO}${d.guidance.path}`} external>
          Open {d.guidance.path}
        </Link>
      </DocCard>
      <DocCard title="Contract" copy={contractMd} notify={notify}>
        <dl className="facts">
          <div><dt>Props</dt><dd className="props">{d.contract.props.map((p) => <span key={p} className="mono">{p}</span>)}</dd></div>
          <div><dt>States</dt><dd>{d.contract.states.join(', ') || 'Not recorded'}</dd></div>
        </dl>
        <div className="contract-list">
          <p className="label">Use it for</p>
          <ul>{d.contract.usage.map((u) => <li key={u}>{u}</li>)}</ul>
          <p className="label">Don't</p>
          <ul>{d.contract.dont.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <Link href={`${REPO}${d.contract.path}`} external>
          Open the file
        </Link>
      </DocCard>
      <DocCard title="Rules for AI agents" copy={agentsMd} notify={notify}>
        {d.agents.rules.length ? (
          d.agents.rules.map((r) => (
            <blockquote key={r.line} className="agent-rule">
              <p>{r.text.replace(/^[-*]\s+/, '').replace(/\*\*/g, '')}</p>
              <cite>AGENTS.md · line {r.line}</cite>
            </blockquote>
          ))
        ) : (
          <p className="label">AGENTS.md doesn't name {d.name} yet.</p>
        )}
      </DocCard>
      <DocCard title="Related" copy={relatedMd} notify={notify}>
        {d.related.length ? (
          <ul className="related-list">
            {d.related.map((r) => (
              <li key={r.id}>
                <Link href={`#/atlas/${r.id}`}>{r.name}</Link>
                {r.why ? <span className="label"> {r.why}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="label">The contract names no sibling components.</p>
        )}
      </DocCard>
    </Columns>
  );
}

function Edit({ d, onCancel, onProposed }) {
  const [kind, setKind] = useState('guidance');
  const initial = { guidance: d.guidance.md ?? `# ${d.name}\n\n`, contract: d.contract.block ?? '', agents: agentsSource(d.agents.rules) };
  const [text, setText] = useState(initial);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState(null);
  const contractError = kind === 'contract' ? checkContract(text.contract) : null;
  const changed = text[kind] !== initial[kind];

  async function propose() {
    setError(null);
    let content = text[kind];
    try {
      if (kind === 'agents') content = JSON.stringify(agentsEdits(content));
    } catch (e) {
      return setError(e.message);
    }
    const r = await fetch(`/bella-doc/${d.id}/propose`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind, content, summary }) });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    onProposed({ ...j, summary });
  }

  return (
    <Card innerClassName="doc-edit">
      <SegmentedControl label="File" value={kind} onChange={setKind} options={KINDS} className="seg-wrap" />
      <p className="label">
        {kind === 'guidance' ? `${d.guidance.path}: longer guidance and rationale, never a contract rule.` : kind === 'contract' ? `${d.contract.path} → component.${d.id}: the rules agents and the gate read. Checked as you type.` : 'AGENTS.md: the lines that name this component. Keep each line number in front.'}
      </p>
      <Columns count={2}>
        <Input label="Source" value={text[kind]} onChange={(v) => setText((t) => ({ ...t, [kind]: v }))} multiline className="doc-source" error={contractError ?? undefined} />
        <div className="doc-preview" aria-label="Preview">
          <p className="label">Preview</p>
          {kind === 'guidance' ? (
            <div className="doc-prose">
              <Rich text={text.guidance.replace(/^# .*\n+/, '')} />
            </div>
          ) : kind === 'contract' ? (
            contractError ? <p className="label">Fix the contract to see it.</p> : <StatusPill variant="success">valid contract</StatusPill>
          ) : (
            text.agents.split('\n').filter(Boolean).map((l) => (
              <blockquote key={l} className="agent-rule">
                <p>{l.replace(/^\d+\|\s?/, '')}</p>
              </blockquote>
            ))
          )}
        </div>
      </Columns>
      <Input label="What changed" hint="One line; it names the branch and the commit." value={summary} onChange={setSummary} error={error ?? undefined} />
      <div className="doc-actions">
        <Button variant="primary" onClick={propose} disabled={!changed || !summary.trim() || Boolean(contractError)}>
          Propose change
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function Diff({ text }) {
  return (
    <pre className="diff" aria-label="Diff">
      {text.split('\n').map((l, i) => (
        <span key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : undefined}>
          {l}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

function Proposal({ p, onOpenPr, onDiscard, onBack }) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!p.job) return;
    let stop = false;
    const tick = async () => {
      const j = await fetch(`/bella-doc-job/${p.job}`).then((r) => r.json()).catch(() => null);
      if (stop) return;
      setJob(j);
      if (j?.status === 'running') setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [p.job]);
  if (!job || job.status === 'running') {
    return (
      <Card innerClassName="doc-edit">
        <p className="card-title">Proposing on {p.branch}</p>
        <p className="label" role="status">{job?.step ?? 'Starting'}… The gate takes a few minutes.</p>
      </Card>
    );
  }
  // a job the server no longer knows (it restarted): never claim a result
  if (job.status !== 'done' && job.status !== 'failed') {
    return (
      <Card innerClassName="doc-edit">
        <p className="card-title">Lost track of this proposal</p>
        <p className="label">The CHIP server restarted while the gate ran. If the commit landed, {p.branch} shows under In review; if not, propose again.</p>
        <div className="doc-actions">
          <Button variant="secondary" onClick={onBack}>
            Back to edit
          </Button>
        </div>
      </Card>
    );
  }
  if (job.status === 'failed') {
    return (
      <Card innerClassName="doc-edit">
        <div className="card-row">
          <p className="card-title">Not proposed</p>
          <StatusPill variant="neutral">{job.gate === 'red' ? 'gate red' : 'error'}</StatusPill>
        </div>
        <p className="label">The branch was removed. {job.error ?? 'The pre-commit gate failed:'}</p>
        {job.log ? <pre className="diff">{job.log}</pre> : null}
        <div className="doc-actions">
          <Button variant="secondary" onClick={onBack}>
            Back to edit
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card innerClassName="doc-edit">
      <div className="card-row">
        <p className="card-title">Proposed: {p.summary || p.branch}</p>
        <StatusPill variant="success">gate green</StatusPill>
      </div>
      <p className="label">
        Branch <span className="mono">{p.branch}</span> in BELLA, one commit. Not pushed.
      </p>
      <Diff text={job.diff ?? ''} />
      <div className="doc-actions">
        {/* the one keycap in this view */}
        <Button variant="primary" onClick={() => onOpenPr(p.branch)}>
          Open pull request
        </Button>
        <Button variant="secondary" onClick={() => onDiscard(p.branch)}>
          Discard the branch
        </Button>
      </div>
    </Card>
  );
}

function Confirm({ branch, onDone, onCancel }) {
  const [pre, setPre] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    fetch('/bella-doc-pr', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ branch, dryRun: true }) })
      .then((r) => r.json())
      .then(setPre);
  }, [branch]);
  async function go() {
    const r = await fetch('/bella-doc-pr', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ branch, confirm: true, dryRun: false }) });
    const j = await r.json();
    setResult(j);
    if (j.url) onDone(j.url);
  }
  if (!pre) return <p className="label">Reading the branch…</p>;
  if (pre.error) return <p role="alert">{pre.error}</p>;
  return (
    <Card innerClassName="doc-edit doc-confirm">
      <p className="card-title">Open a draft pull request?</p>
      <p>
        This pushes <span className="mono">{pre.branch}</span> to BELLA's remote, and nothing else, then opens a <b>draft</b> pull request against {pre.base}. This click is your OK for this one change. CHIP never merges.
      </p>
      <dl className="facts">
        <div><dt>Files</dt><dd>{pre.files.map((f) => <span key={f} className="mono">{f} </span>)}</dd></div>
        <div><dt>Title</dt><dd>{pre.title}</dd></div>
        <div><dt>Body</dt><dd className="doc-pr-body">{pre.body}</dd></div>
        <div><dt>Runs</dt><dd>{pre.commands.map((c) => <code key={c} className="mono doc-cmd">{c}</code>)}</dd></div>
      </dl>
      {result?.error ? <p role="alert">{result.error}</p> : null}
      {pre.blocked ? <p className="doc-blocked">{pre.blocked}</p> : null}
      <div className="doc-actions">
        {/* blocked: no Confirm at all (nothing dimmed); the reason says why */}
        {pre.blocked ? null : (
          <Button variant="primary" onClick={go}>
            Confirm and open
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </Card>
  );
}

/** The Documentation section's body; Atlas wraps it in a Section. */
export default function AtlasDocs({ c, role, notify }) {
  const [d, setD] = useState(null);
  const [view, setView] = useState({ at: 'read' }); // read | edit | proposal | confirm
  const load = () =>
    fetch(`/bella-doc/${c.id}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
  useEffect(() => {
    setView({ at: 'read' });
    load();
  }, [c.id]);
  if (!d) return <p className="label">Reading BELLA's docs for {c.name}…</p>;
  const editor = canEdit(role);
  const at = { read: 0, edit: 1, proposal: 2, confirm: 3 }[view.at];

  async function discard(branch) {
    await fetch('/bella-doc-discard', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ branch }) });
    notify(`Discarded ${branch}`);
    setView({ at: 'read' });
    load();
  }

  return (
    <div className="doc-section">
      {editor ? <Flow at={at} /> : null}
      {view.at === 'read' ? (
        <>
          {editor ? (
            <div className="doc-actions">
              <Button variant="secondary" onClick={() => setView({ at: 'edit' })}>
                Edit
              </Button>
              {d.proposals.map((p) => (
                <ActionChip key={p.branch} onClick={() => setView({ at: 'proposal', p: { branch: p.branch, summary: p.subject, job: null, existing: true } })}>
                  In review: {p.subject}
                </ActionChip>
              ))}
            </div>
          ) : null}
          <Read d={d} notify={notify} />
        </>
      ) : view.at === 'edit' ? (
        <Edit d={d} onCancel={() => setView({ at: 'read' })} onProposed={(p) => setView({ at: 'proposal', p })} />
      ) : view.at === 'proposal' ? (
        view.p.existing ? (
          <Card innerClassName="doc-edit">
            <p className="card-title">{view.p.summary}</p>
            <p className="label">
              Branch <span className="mono">{view.p.branch}</span>, proposed earlier.
            </p>
            <div className="doc-actions">
              <Button variant="primary" onClick={() => setView({ at: 'confirm', branch: view.p.branch })}>
                Open pull request
              </Button>
              <Button variant="secondary" onClick={() => discard(view.p.branch)}>
                Discard the branch
              </Button>
            </div>
          </Card>
        ) : (
          <Proposal p={view.p} onOpenPr={(branch) => setView({ at: 'confirm', branch })} onDiscard={discard} onBack={() => setView({ at: 'edit' })} />
        )
      ) : (
        <Confirm
          branch={view.branch}
          onDone={(url) => {
            notify(`Draft pull request opened: ${url}`);
            setView({ at: 'read' });
            load();
          }}
          onCancel={() => setView({ at: 'read' })}
        />
      )}
    </div>
  );
}
