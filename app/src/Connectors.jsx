// Connectors: every MCP server and CLI tool CHIP can call, from
// chip.config.local.json, with its status, its tools, when it was last used
// and a Test button. docs/host.md explains how to add one.
import React, { useEffect, useState } from 'react';
import Heading from '@bella/components/Heading/Heading';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Tag from '@bella/components/Tag/Tag';
import ActionChip from '@bella/components/ActionChip/ActionChip';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

function Server({ s, onTest, testing }) {
  const ok = s.status === 'connected';
  return (
    <section className="atlas-card connector" aria-labelledby={`srv-${s.name}`}>
      <header className="connector-head">
        <h2 id={`srv-${s.name}`} className="facts-name">
          {s.name}
        </h2>
        <StatusPill variant={ok ? 'success' : 'info'}>{s.status}</StatusPill>
      </header>
      {s.note ? <p className="label">{s.note}</p> : null}
      <dl className="facts">
        <div><dt>Kind</dt><dd>{s.kind === 'cli' ? 'CLI tool' : `MCP over ${s.transport}`}</dd></div>
        <div><dt>Where</dt><dd><span className="mono">{s.where}</span></dd></div>
        <div><dt>Allowed</dt><dd>{s.allow.length ? s.allow.join(' and ') : 'nothing'}</dd></div>
        <div><dt>Tools</dt><dd>{s.tools ? `${s.tools.filter((t) => t.kind === 'read').length} read` : 'not listed yet'}</dd></div>
        {s.tools ? (
          <div><dt>Writes</dt><dd>{`${s.tools.filter((t) => t.kind !== 'read').length} write tools · ${s.tools.filter((t) => t.kind !== 'read' && t.allowed).length} allowed`}</dd></div>
        ) : null}
        <div><dt>Last used</dt><dd>{when(s.lastUsed)}</dd></div>
      </dl>
      {s.error ? <p role="alert">{s.error}</p> : null}
      {!s.disabled ? (
        <div className="facts-actions">
          <ActionChip onClick={() => onTest(s.name)} disabled={testing}>
            {testing ? 'Testing…' : 'Test'}
          </ActionChip>
        </div>
      ) : null}
      {s.tools?.length ? (
        <details className="facts-tokens">
          <summary>Tools ({s.tools.length})</summary>
          <ul className="tool-rows">
            {s.tools.map((t) => (
              <li key={t.name}>
                <span className="mono">{t.name}</span> <Tag>{t.kind === 'read' ? 'read' : t.allowed ? 'write · allowed' : 'write · blocked'}</Tag>
                {t.description ? <span className="label"> {t.description}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export default function Connectors() {
  const [servers, setServers] = useState(null);
  const [testing, setTesting] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    fetch('/host')
      .then((r) => r.json())
      .then((r) => setServers(r.servers))
      .catch(() => setError('The CHIP server is not answering on 127.0.0.1:3100.'));
  useEffect(() => {
    load();
  }, []);

  async function test(name) {
    setTesting(name);
    try {
      await fetch('/host/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ server: name }) });
    } finally {
      setTesting(null);
      load();
    }
  }

  return (
    <div className="view connectors">
      <header className="spec-head">
        <p className="label">Connectors</p>
        <Heading tier="page" as="h1">
          Tools CHIP can use
        </Heading>
        <p className="block-lead">
          MCP servers and CLI tools from chip.config.local.json. Read tools run when OBI needs them; a write shows a preview and waits for Confirm. Every call is logged.
        </p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {servers && !servers.length ? <p>No servers yet. Copy chip.config.example.json to chip.config.local.json.</p> : null}
      <div className="connector-grid">
        {(servers ?? []).map((s) => (
          <Server key={s.name} s={s} onTest={test} testing={testing === s.name} />
        ))}
      </div>
    </div>
  );
}
