// Atlas · Spec (Lint & Spec lock, 2026-10-03): the component's spec from
// code, the source of truth. The stage view draws redlines measured from
// the rendered BELLA component in the current theme, each where it is
// measured: side padding between the box edge and its content, top and
// bottom padding above and below, min height on the right, radius on a
// corner with a leader.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SPECIMENS } from './specimens.jsx';
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
