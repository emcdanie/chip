// Atlas · Spec (Lint & Spec lock, 2026-10-03): the component's spec from
// code, the source of truth. The stage view draws redlines measured from
// the rendered BELLA component in the current theme, each where it is
// measured: side padding between the box edge and its content, top and
// bottom padding above and below, min height on the right, radius on a
// corner with a leader.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SPECIMENS } from './specimens.jsx';
import Card from '@bella/components/Card/Card';
import Columns from '@bella/components/Columns/Columns';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import { Token } from './Atlas.jsx';

const px = (v) => Math.round(parseFloat(v) * 10) / 10;

function measure(frame) {
  const root = frame?.querySelector('[data-bella-component]');
  if (!root) return null;
  const fr = frame.getBoundingClientRect();
  const r = root.getBoundingClientRect();
  const cs = getComputedStyle(root);
  const doc = getComputedStyle(document.documentElement);
  const zoom = root.offsetWidth ? r.width / root.offsetWidth : 1;
  return {
    x: r.left - fr.left,
    y: r.top - fr.top,
    w: r.width,
    h: r.height,
    zoom,
    pl: px(cs.paddingLeft),
    pr: px(cs.paddingRight),
    pt: px(cs.paddingTop),
    pb: px(cs.paddingBottom),
    radius: px(cs.borderTopLeftRadius),
    minH: cs.minHeight === 'auto' ? null : px(cs.minHeight),
    height: px(root.offsetHeight),
    ring: px(doc.getPropertyValue('--ring-focus-width')),
    offset: px(doc.getPropertyValue('--ring-focus-offset')),
  };
}

/** The stage view: the specimen with its measurements drawn on it. */
export function SpecStage({ c, overrides }) {
  const frame = useRef(null);
  const [m, setM] = useState(null);
  const Render = SPECIMENS[c.name];
  const update = useCallback(() => setM(measure(frame.current)), []);
  useLayoutEffect(() => {
    update();
    const ro = new ResizeObserver(() => requestAnimationFrame(update));
    ro.observe(frame.current);
    document.fonts?.ready.then(update);
    return () => ro.disconnect();
  }, [update, c.id]);
  const s = c.sandbox ?? {};
  const z = m?.zoom ?? 1;
  return (
    <>
      <div className="stage spec-stage" aria-label={`${c.name} with its measurements`}>
        <div className="spec-frame spec-frame--measure" ref={frame}>
          <div className="spec-render" inert aria-hidden="true" style={{ zoom: window.innerWidth < 720 ? 1 : 1.6, ...overrides }}>
            {Render ? <Render /> : null}
          </div>
          {m ? (
            <div className="redlines" aria-hidden="true">
              {/* padding bands: where each value is measured */}
              {m.pl ? <span className="rl-band" style={{ left: m.x, top: m.y, width: m.pl * z, height: m.h }} /> : null}
              {m.pr ? <span className="rl-band" style={{ left: m.x + m.w - m.pr * z, top: m.y, width: m.pr * z, height: m.h }} /> : null}
              {m.pt ? <span className="rl-band" style={{ left: m.x + m.pl * z, top: m.y, width: m.w - (m.pl + m.pr) * z, height: m.pt * z }} /> : null}
              {m.pb ? <span className="rl-band" style={{ left: m.x + m.pl * z, top: m.y + m.h - m.pb * z, width: m.w - (m.pl + m.pr) * z, height: m.pb * z }} /> : null}
              {/* side padding: labels outside, leaders into the band */}
              {m.pl ? <span className="rl-tag rl-tag--left" style={{ left: m.x - 8, top: m.y + m.h / 2 }}>{m.pl}px</span> : null}
              {m.pr ? <span className="rl-tag rl-tag--right" style={{ left: m.x + m.w + 8, top: m.y + m.h / 2 }}>{m.pr}px</span> : null}
              {/* top and bottom padding: above and below */}
              {m.pt ? <span className="rl-tag rl-tag--above" style={{ left: m.x + m.w / 2, top: m.y - 8 }}>{m.pt}px</span> : null}
              {m.pb ? <span className="rl-tag rl-tag--below" style={{ left: m.x + m.w / 2, top: m.y + m.h + 8 }}>{m.pb}px</span> : null}
              {/* min height: a bracket on the right, beyond the side tag */}
              <span className="rl-vline" style={{ left: m.x + m.w + 64, top: m.y, height: m.h }} />
              <span className="rl-tag rl-tag--right" style={{ left: m.x + m.w + 72, top: m.y + m.h / 2 }}>
                {m.minH ? `${m.minH}px min` : `${m.height}px`}
              </span>
              {/* radius: a leader from the top-left corner */}
              {m.radius ? (
                <>
                  <span className="rl-leader" style={{ left: m.x - 40 + m.radius * z * 0.3, top: m.y + m.radius * z * 0.3 }} />
                  <span className="rl-tag rl-tag--corner" style={{ left: m.x - 32, top: m.y - 32 }}>radius {m.radius}px</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {m ? (
        <dl className="spec-legend">
          <div>
            <dt>Min height</dt>
            <dd>
              <b>{m.minH ? `${m.minH}px` : 'none'}</b> {s.minHeight ? <span className="mono label"><Token name={s.minHeight.token} /></span> : null}
              {m.minH && m.height !== m.minH ? <span className="label"> · renders {m.height}px</span> : null}
            </dd>
          </div>
          <div>
            <dt>Padding, sides</dt>
            <dd>
              <b>{m.pl === m.pr ? `${m.pl}px` : `${m.pl}px / ${m.pr}px`}</b> {s.paddingX ? <span className="mono label"><Token name={s.paddingX.token} /></span> : null}
            </dd>
          </div>
          <div>
            <dt>Padding, top and bottom</dt>
            <dd>
              <b>{m.pt === m.pb ? `${m.pt}px` : `${m.pt}px / ${m.pb}px`}</b> {s.paddingY ? <span className="mono label"><Token name={s.paddingY.token} /></span> : null}
            </dd>
          </div>
          <div>
            <dt>Radius</dt>
            <dd>
              <b>{m.radius}px</b>
            </dd>
          </div>
          <div>
            <dt>Focus ring</dt>
            <dd>
              <b>
                {m.ring}px, {m.offset}px offset
              </b>{' '}
              <span className="mono label">--ring-focus-width · --ring-focus-offset</span>
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="label">Measured from the rendered BELLA {c.name} in this theme, not typed in.</p>
    </>
  );
}

/* ---------- the Spec section ---------- */
// Nathan Curtis's anatomy (Analysis of Variants): elements are root
// (container), label (text) and icon (instance); a fill, shadow or focus
// outline is a style of an element, not an element of its own
const ROLE = {
  box: ['root', 'container'],
  fill: ['root', 'style: fills'],
  shadow: ['root', 'style: effects'],
  ring: ['root', 'style: focus outline'],
  content: ['label', 'text'],
  label: ['label', 'text'],
  icon: ['icon', 'instance'],
};
const unquote = (v) => (v == null ? null : String(v).replace(/'/g, ''));

function keyboardOf(c) {
  const r = (c.rendersAs ?? '').toLowerCase();
  if (/\bbutton\b/.test(r) && /anchor|link/.test(r)) return 'Tab reaches it; Enter and Space press it (Enter only when it renders as a link).';
  if (/\bbutton\b/.test(r)) return 'Tab reaches it; Enter and Space press it.';
  if (/anchor|link/.test(r)) return 'Tab reaches it; Enter follows it.';
  if (/select/.test(r)) return 'The native select: Tab reaches it, arrows choose, the platform opens the list.';
  if (/input|textarea/.test(r)) return 'Tab reaches it; type to enter a value.';
  return 'See the contract notes below.';
}

export function SpecSection({ c, figmaNames = null, onSend, sendOpen }) {
  const [spec, setSpec] = React.useState(null);
  React.useEffect(() => {
    setSpec(null);
    fetch(`/bella-spec/${c.id}`)
      .then((r) => r.json())
      .then(setSpec)
      .catch(() => setSpec({ props: null, note: "The CHIP server didn't answer." }));
  }, [c.id]);
  const ring = (t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim();
  return (
    <div className="spec-section">
      <Card innerClassName="spec-card">
        <h3 className="card-title">Properties</h3>
        {spec?.props ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`${c.name} props`}>
            <table className="tok-table spec-props">
              <caption className="sr-only">{c.name} props: values, default and the Figma name</caption>
              <thead>
                <tr><th scope="col">Prop</th><th scope="col">Values</th><th scope="col">Default</th><th scope="col">Figma name</th></tr>
              </thead>
              <tbody>
                {spec.props.map((p) => (
                  <tr key={p.name}>
                    <td className="mono">{p.name}{p.required ? ' *' : ''}</td>
                    <td>{unquote(p.values).split(' | ').join(' · ')}</td>
                    <td>{unquote(p.default) ?? 'none'}</td>
                    <td>{figmaNames ? figmaNames[p.name] ?? <span className="label">not in Figma</span> : <span className="label">Figma not read</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="label">{spec ? spec.note : 'Reading the props…'}</p>
        )}
        <p className="label">Values and defaults from BELLA's docgen manifest for {c.name}.tsx; * is required.</p>
      </Card>
      <Columns count={2}>
        <Card innerClassName="spec-card">
          <h3 className="card-title">Anatomy</h3>
          {c.parts.length ? (
            <div className="table-scroll" tabIndex={0} role="region" aria-label={`${c.name} anatomy`}>
              <table className="tok-table">
                <caption className="sr-only">{c.name} anatomy: each part, its element and token</caption>
                <thead>
                  <tr><th scope="col">Part</th><th scope="col">Element</th><th scope="col">Token</th></tr>
                </thead>
                <tbody>
                  {c.parts.map((p) => {
                    const [el, kind] = ROLE[p.kind] ?? ['root', p.kind];
                    return (
                      <tr key={p.key}>
                        <td>{p.n} · {p.title}</td>
                        <td><span className="mono">{el}</span> <span className="label">{kind}</span></td>
                        <td className="mono"><Token name={p.token} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="label">No anatomy recorded for {c.name} yet.</p>
          )}
          <p className="label">Element names follow Nathan Curtis: root, label, icon; fills, shadows and the focus outline are styles of an element.</p>
        </Card>
        <Card innerClassName="spec-card">
          <h3 className="card-title">Accessibility</h3>
          <dl className="facts">
            <div><dt>Renders as</dt><dd>{c.rendersAs ?? 'not in the contract'}</dd></div>
            <div><dt>Keyboard</dt><dd>{keyboardOf(c)}</dd></div>
            <div><dt>Focus</dt><dd>{ring('--ring-focus-width')} ring, {ring('--ring-focus-offset')} offset, focus-visible only</dd></div>
            <div><dt>Target</dt><dd>{c.minTarget ? `${c.minTarget.value} minimum` : 'not a control'}</dd></div>
          </dl>
          {c.a11y ? <p className="label">{c.a11y}</p> : null}
        </Card>
      </Columns>
      <Card innerClassName="spec-card">
        <div className="card-row">
          <h3 className="card-title">Send the spec to Figma</h3>
          {!sendOpen ? (
            <Button variant="secondary" onClick={() => onSend(true)}>
              Send spec to Figma
            </Button>
          ) : null}
        </div>
        {sendOpen ? (
          <>
            <p>
              It would make one frame, <span className="mono">{c.name} · Spec</span>, beside the {c.name} component set in the BELLA file: the redlines, the properties, the anatomy and the accessibility notes.
            </p>
            <p className="doc-blocked">Writes are off: preview only. CHIP reads Figma but doesn't change it.</p>
            <div className="doc-actions">
              <Button variant="secondary" onClick={() => onSend(false)}>
                Close the preview
              </Button>
            </div>
          </>
        ) : (
          <p className="label">Builds the spec as a frame next to the component in Figma. Writes are off, so it shows a preview.</p>
        )}
      </Card>
    </div>
  );
}

/* ---------- Figma lint ---------- */
const when = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function lintSummary(lint) {
  if (!lint) return 'reading';
  if (!lint.read) return 'Figma not read';
  if (!lint.found) return 'not in this file';
  return lint.score == null ? 'read' : `${lint.score}`;
}

export function LintSection({ c, lint, reading, onRefresh }) {
  const [preview, setPreview] = React.useState(null);
  const again = (
    <ActionChip onClick={onRefresh} disabled={reading}>
      {reading ? 'Reading Figma…' : 'Read Figma again'}
    </ActionChip>
  );
  if (!lint) return <p className="label">Reading Figma…</p>;
  if (!lint.read || !lint.found) {
    return (
      <Card innerClassName="spec-card">
        <div className="card-row">
          <h3 className="card-title">{!lint.read ? 'Figma not read' : `No ${c.name} in this Figma file`}</h3>
          {again}
        </div>
        <p>{lint.reason}</p>
        <p className="label">No score until {c.name} is read from Figma. Checked at {when(lint.at)}.</p>
      </Card>
    );
  }
  return (
    <Card innerClassName="spec-card">
      <div className="card-row">
        <p className="lint-score">
          <b>{lint.score ?? 'n/a'}</b> <span className="label">Figma readiness</span>
        </p>
        {again}
      </div>
      <p className="label">
        {lint.where} · {lint.variants} variant{lint.variants === 1 ? '' : 's'} · read at {when(lint.at)}. Bindings and states weigh most, then names and target size, then contrast.
      </p>
      <ul className="lint-list">
        {lint.findings.map((f, i) => (
          <li key={i}>
            <StatusPill variant={f.ok ? 'success' : 'neutral'}>{f.ok == null ? 'n/a' : f.ok ? 'pass' : 'fail'}</StatusPill>
            <div className="lint-body">
              <p>
                <b>{f.check}.</b> {f.what}
              </p>
              <p className="label">{f.where}</p>
              {f.fix ? (
                <p className="lint-fix">
                  <span className="label">Change:</span> {f.fix}{' '}
                  {f.preview ? <ActionChip onClick={() => setPreview(preview === i ? null : i)}>Preview fix</ActionChip> : null}
                </p>
              ) : null}
              {preview === i && f.preview ? (
                <div className="lint-preview">
                  <p>
                    <span className="label">Now</span> <span className="mono">{f.preview.before}</span> → <span className="label">After</span> {f.preview.after}
                  </p>
                  <p className="doc-blocked">Writes are off: preview only. CHIP reads Figma but doesn't change it.</p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
