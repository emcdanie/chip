// Gaps to close, one component at a time (4 Nov): each card's components are
// selectable, alone or several at once. Selecting one shows, from GET /gaps,
// what its contract is missing and where, the suggested fix (read from
// BELLA's contract, tokens and similar components), the rule behind it, and
// what fixing it changes and how to undo it. "Fix in a session" sends a brief
// for the selection only. Where BELLA's data can't suggest a fix, the card
// says so and names what is needed.
import React, { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import './DoNext.css';

export function useGapFixes(bella) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let live = true;
    fetch('/gaps')
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error || r.statusText)))))
      .then((data) => live && setState({ data, error: null }))
      .catch((e) => live && setState({ data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [bella?.source?.version, bella?.components?.length]);
  return state;
}

const THEMES = ['light', 'dark', 'warm', 'wee-dote'];

function Pairs({ pairs }) {
  return (
    <table className="dn-pairs">
      <caption className="k-vh">Suggested pairs, measured in each theme</caption>
      <thead>
        <tr>
          <th scope="col">Pair</th>
          {THEMES.map((t) => (
            <th scope="col" key={t}>
              {t}
            </th>
          ))}
          <th scope="col">Needs</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={p.label}>
            <th scope="row">
              {p.label}
              {p.twin ? <span className="dn-twin">Same colours as “{p.twin}”, already checked</span> : null}
            </th>
            {THEMES.map((t) => {
              const m = p.measured.find((x) => x.theme === t);
              const bad = m && m.ratio < p.bar;
              return (
                <td key={t} className={bad ? 'bad' : undefined}>
                  {bad ? <span aria-label="fails">✕ </span> : null}
                  {m ? `${m.ratio.toFixed(2)}:1` : '—'}
                </td>
              );
            })}
            <td>{p.bar}:1</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fix({ name, item }) {
  const id = `dn-${name}`;
  const s = item.suggest;
  return (
    <article className="dn-fix" aria-labelledby={id}>
      <h3 id={id}>
        {name}
        {s ? null : <span className="k-pill needs">No suggestion</span>}
      </h3>
      <dl>
        <div>
          <dt>Missing</dt>
          <dd>
            <p>{item.missing}</p>
            <ul className="dn-where">
              {item.where.map((w) => (
                <li key={w.file + w.field}>
                  <code>{w.file}</code> · {w.field}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Add</dt>
          <dd>
            {s ? (
              <>
                <p>{s.text}</p>
                {s.pairs ? <Pairs pairs={s.pairs} /> : null}
                {s.code ? <pre className="dn-code" tabIndex={0} aria-label="Lines to add">{s.code}</pre> : null}
                {s.model ? (
                  <blockquote className="dn-model">
                    <span>{s.model.name}’s note</span>
                    {s.model.text}
                  </blockquote>
                ) : null}
                {s.caveat ? <p className="dn-caveat">{s.caveat}</p> : null}
              </>
            ) : (
              <>
                <p>{item.noSuggest.why}</p>
                <p>
                  <b>Needed:</b> {item.noSuggest.needed}
                </p>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Why</dt>
          <dd>
            <p>
              {item.why.rule} <span className="dn-src">{item.why.source}</span>
            </p>
          </dd>
        </div>
        <div>
          <dt>Changes</dt>
          <dd>
            <p>{item.change}</p>
            {item.undo && item.undo !== '—' ? (
              <p>
                <b>Undo:</b> {item.undo}
              </p>
            ) : null}
          </dd>
        </div>
      </dl>
    </article>
  );
}

// one card: { gap, title, why, who, first, fixes, fixesError, onOpen, onSession }
export function GapCard({ gap, idx, title, why, who, first, fixes, fixesError, onOpen, onSession }) {
  const [sel, setSel] = useState([]);
  // keep the selection to components still missing this check after a refresh
  useEffect(() => setSel((s) => s.filter((n) => who.includes(n))), [who.join()]);
  const picked = who.filter((n) => sel.includes(n));
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const items = picked.map((n) => [n, fixes?.[n]]);
  const brief = () =>
    `${title} in BELLA (~/DEV/bella) for ${picked.join(', ')} only. Leave every other component alone.\n\n` +
    items.map(([n, it]) => it?.brief ?? `${n}: ${title.toLowerCase()}.`).join('\n\n') +
    '\n\nRun npm run gate before committing. Don’t push.';
  const status = picked.length ? `${picked.length} of ${who.length} selected` : `Select one or more to see the fix`;
  return (
    <li className={`gap1 dn${first ? ' first' : ''}`}>
      <span className="n">
        {who.length}
        <small>component{who.length === 1 ? '' : 's'}</small>
      </span>
      <div>
        <button type="button" className="rowbtn" id={`gap-${idx}`} aria-haspopup="dialog" onClick={onOpen}>
          {title}
        </button>
        {first ? <span className="k-pill needs">Do next</span> : null}
        <span className="why">{why}</span>
        <div className="dn-pick" role="group" aria-labelledby={`gap-${idx}`}>
          {who.map((n) => (
            <button type="button" key={n} className="dn-chip" aria-pressed={sel.includes(n)} onClick={() => toggle(n)}>
              <span className="dn-box" aria-hidden="true" />
              {n}
            </button>
          ))}
        </div>
        <div className="dn-bar">
          <span className="dn-count" aria-live="polite">
            {status}
          </span>
          {who.length > 1 ? (
            <button type="button" className="k-link" disabled={picked.length === who.length} onClick={() => setSel(who)}>
              Select all
            </button>
          ) : null}
          {picked.length ? (
            <button type="button" className="k-link" onClick={() => setSel([])}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <Button disabled={!picked.length} onClick={() => onSession(brief())}>
        {picked.length ? `Fix ${picked.length === who.length && who.length > 1 ? `all ${picked.length}` : picked.length} in a session` : 'Fix in a session'}
      </Button>
      {picked.length ? (
        <div className="dn-detail">
          {fixesError ? (
            <p className="dn-caveat">The suggestions could not be read: {fixesError}.</p>
          ) : !fixes ? (
            <p>Reading BELLA’s contract and tokens…</p>
          ) : (
            items.map(([n, it]) => (it ? <Fix key={n} name={n} item={it} /> : <p key={n}>No suggestion data for {n} ({gap}). The sync may be older than BELLA: refresh.</p>))
          )}
        </div>
      ) : null}
    </li>
  );
}
