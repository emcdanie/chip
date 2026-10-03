// Docs: OBI's private notes (~/DEV/obi-notes, outside the repo) and the
// relay's inbox under "Loop". A list with search, tag and status filters; a
// read view; an edit mode with a live preview. BELLA components only.
import React, { useEffect, useMemo, useState } from 'react';
import Heading from '@bella/components/Heading/Heading';
import Input from '@bella/components/Input/Input';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import NavList from '@bella/components/NavList/NavList';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import Tag from '@bella/components/Tag/Tag';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Link from '@bella/components/Link/Link';
import Icon from '@bella/components/Icon/Icon';
import { Rich } from './Obi.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
// Draft · In progress · Done: the words components use too
const STATUS_LABEL = { draft: 'Draft', 'in-progress': 'In progress', done: 'Done' };
const statusLabel = (s) => STATUS_LABEL[s] ?? s;
const kindLabel = (k) => (k === 'loop' ? 'Inbox' : k[0].toUpperCase() + k.slice(1));
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

function Editor({ doc, statuses, onSaved, onCancel }) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [tags, setTags] = useState((doc?.tags ?? []).join(', '));
  const [status, setStatus] = useState(doc?.status ?? 'draft');
  const [body, setBody] = useState(doc?.body ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(doc ? `/obi-docs/${doc.id}` : '/obi-docs', { method: doc ? 'PUT' : 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title, tags: tags.split(','), status, body }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? 'Not saved');
      onSaved(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="doc-edit">
      <div className="doc-edit-fields">
        <Input label="Title" value={title} onChange={setTitle} error={error ?? undefined} required />
        <Input label="Tags" hint="Comma separated" value={tags} onChange={setTags} />
        <SegmentedControl label="Status" value={status} onChange={setStatus} options={statuses.map((s) => ({ value: s, label: statusLabel(s) }))} />
      </div>
      <div className="doc-edit-split">
        <Input label="Markdown" value={body} onChange={setBody} multiline className="doc-textarea" />
        <div className="doc-preview" aria-label="Preview">
          <p className="label">Preview</p>
          {body.trim() ? <Rich text={body} /> : <p className="label">Nothing written yet.</p>}
        </div>
      </div>
      <div className="doc-actions">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving' : 'Save'}
        </Button>
        <ActionChip onClick={onCancel}>Cancel</ActionChip>
      </div>
    </div>
  );
}

export default function Docs({ docId, version = 0, narrow }) {
  const [list, setList] = useState(null);
  const [statuses, setStatuses] = useState(['draft', 'in-progress', 'done']);
  const [folder, setFolder] = useState('');
  const [doc, setDoc] = useState(null);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(null);
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null); // 'new' | 'edit' | null
  const [error, setError] = useState(null);

  const loadList = () =>
    fetch('/obi-docs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r) => {
        setList(r.docs);
        setStatuses(r.statuses);
        setFolder(r.folder);
      })
      .catch(() => setError('The CHIP server is not answering, so Docs cannot load.'));
  useEffect(() => {
    loadList();
  }, [version]);

  // a new doc closes the editor; a save elsewhere (version) only refreshes
  useEffect(() => setEditing(null), [docId]);
  useEffect(() => {
    if (!docId) return setDoc(null);
    fetch(`/obi-docs/${docId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [docId, version]);

  const tags = useMemo(() => [...new Set((list ?? []).flatMap((d) => d.tags))].sort(), [list]);
  const shown = (list ?? []).filter(
    (d) =>
      (!q || `${d.title} ${d.excerpt} ${d.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())) &&
      (!tag || d.tags.includes(tag)) &&
      (status === 'all' || d.status === status)
  );
  const groups = ['Loop', 'Notes']
    .map((g) => ({ label: g, items: shown.filter((d) => d.group === g).map((d) => ({ href: `#/docs/${d.id}`, label: d.title, badge: d.group === 'Notes' ? when(d.date) : undefined, current: d.id === docId })) }))
    .filter((g) => g.items.length);

  const saved = (d) => {
    setEditing(null);
    loadList();
    if (d.id === docId) setDoc(d);
    else window.location.hash = `#/docs/${d.id}`;
  };

  const showList = !narrow || (!docId && editing !== 'new');
  const showDoc = !narrow || docId || editing === 'new';

  return (
    <div className="view docs">
      <header className="docs-head">
        <Heading tier="section" as="h1">
          Docs
        </Heading>
        <p className="label">Notes, plans, decisions and handoffs · {folder || 'notes folder'}, never committed</p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="docs-grid">
        {showList ? (
          <section className="atlas-card docs-list" aria-label="All docs">
            <div className="docs-search">
              <Icon name="Search" size="sm" className="docs-search-icon" />
              <Input label="Search docs" value={q} onChange={setQ} type="text" placeholder="Search notes, plans, decisions…" />
            </div>
            <SegmentedControl label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, ...statuses.map((s) => ({ value: s, label: statusLabel(s) }))]} />
            {tags.length ? (
              <div className="docs-tags" role="group" aria-label="Filter by tag">
                {tags.map((t) => (
                  <FilterChip key={t} pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </FilterChip>
                ))}
              </div>
            ) : null}
            {list && !groups.length ? <p className="label">No docs match.</p> : null}
            {groups.length ? <NavList label="Docs" groups={groups} /> : null}
            <div className="doc-actions">
              <ActionChip onClick={() => setEditing('new')}>New doc</ActionChip>
            </div>
          </section>
        ) : null}
        {showDoc ? (
          <section className="atlas-card doc-view" aria-label={doc ? doc.title : 'Doc'}>
            {narrow && (docId || editing) ? <Link href="#/docs">All docs</Link> : null}
            {editing === 'new' ? (
              <Editor statuses={statuses} onSaved={saved} onCancel={() => setEditing(null)} />
            ) : doc && editing === 'edit' ? (
              <Editor doc={doc} statuses={statuses} onSaved={saved} onCancel={() => setEditing(null)} />
            ) : doc ? (
              <>
                <div className="doc-reader">
                  <header className="doc-head">
                    <h2 className="facts-name">{doc.title}</h2>
                    {/* status once, then type and date */}
                    <p className="doc-meta doc-meta--inline">
                      <StatusPill variant={doc.status === 'done' ? 'success' : 'info'}>{statusLabel(doc.status)}</StatusPill>
                      <span className="label">
                        {kindLabel(doc.kind)} · {doc.group === 'Loop' ? `updated ${when(doc.updated)}` : when(doc.date)}
                      </span>
                    </p>
                  </header>
                  <div className="doc-body">
                    <Rich text={doc.body} />
                  </div>
                </div>
                <aside className="doc-rail" aria-label="About this doc">
                  <dl className="facts doc-rail-facts">
                    <div><dt>Status</dt><dd>{statusLabel(doc.status)}</dd></div>
                    <div><dt>Type</dt><dd>{kindLabel(doc.kind)}</dd></div>
                    <div><dt>Date</dt><dd>{doc.group === 'Loop' ? when(doc.updated) : when(doc.date) || 'None'}</dd></div>
                    {doc.tags.filter((t) => t !== doc.kind).length ? (
                      <div>
                        <dt>Tags</dt>
                        <dd className="doc-meta">
                          {doc.tags.filter((t) => t !== doc.kind).map((t) => (
                            <Tag key={t}>{t}</Tag>
                          ))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div>
                    <p className="label">Linked from</p>
                    {doc.linkedFrom?.length ? (
                      <ul className="doc-links">
                        {doc.linkedFrom.map((l) => (
                          <li key={l.id}>
                            <Link href={`#/docs/${l.id}`}>{l.title}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="label">No other doc mentions this one.</p>
                    )}
                  </div>
                  {doc.editable ? (
                    <ActionChip onClick={() => setEditing('edit')}>Edit</ActionChip>
                  ) : (
                    <p className="label">Read only: the relay writes this file.</p>
                  )}
                </aside>
              </>
            ) : (
              <p className="label">{list?.length ? 'Pick a doc, or start a new one.' : 'No docs yet. Save one from OBI with /note, or start one here.'}</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
