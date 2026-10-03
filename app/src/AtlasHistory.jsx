// Atlas · History (Atlas v4 §7): one entry per commit that touched the
// component in BELLA, newest first. The explanation is the commit's own
// words (marked so). Visual changes show the baseline before and after,
// cropped to the component and at least 320px wide, with the full image a
// link away; API changes show the contract diff, breaking ones marked.
import React, { useEffect, useState } from 'react';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Link from '@bella/components/Link/Link';
import ActionChip from '@bella/components/ActionChip/ActionChip';

const TYPES = ['visual', 'API', 'tokens', 'docs', 'a11y'];
const shotUrl = (rev, path) => `/bella-baseline?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`;
const when = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// crop a baseline to what is drawn on it: the bounding box of every pixel
// that differs from the corner (the story's ground), plus a margin
function useCropped(src) {
  const [out, setOut] = useState(null);
  useEffect(() => {
    if (!src) return;
    let gone = false;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, w, h).data;
      const at = (x, y) => (y * w + x) * 4;
      const g = [px[0], px[1], px[2]];
      let [x0, y0, x1, y1] = [w, h, 0, 0];
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
          const i = at(x, y);
          if (Math.abs(px[i] - g[0]) + Math.abs(px[i + 1] - g[1]) + Math.abs(px[i + 2] - g[2]) > 24) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      if (x1 <= x0) return !gone && setOut(src);
      const m = 16;
      [x0, y0, x1, y1] = [Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(w, x1 + m), Math.min(h, y1 + m)];
      const crop = document.createElement('canvas');
      crop.width = x1 - x0;
      crop.height = y1 - y0;
      crop.getContext('2d').drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
      if (!gone) setOut(crop.toDataURL('image/png'));
    };
    img.onerror = () => !gone && setOut(false);
    img.src = src;
    return () => {
      gone = true;
    };
  }, [src]);
  return out;
}

function Shot({ rev, path, label }) {
  const full = shotUrl(rev, path);
  const src = useCropped(full);
  return (
    <figure className="shot">
      {src ? <img src={src} alt={`${label}: the ${path.split('--')[1].replace(/-light\.png$/, '').replace(/-/g, ' ')} story`} /> : <div className="shot-wait">{src === false ? 'No baseline' : 'Loading'}</div>}
      <figcaption className="label">
        {label} · <Link href={full} external>View full size</Link>
      </figcaption>
    </figure>
  );
}

// a commit body: "- " lines become a list (wrapped lines join their item), the rest stays prose
function Body({ text }) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const item = line.match(/^[-*]\s+(.*)$/);
    const last = blocks.at(-1);
    if (item) {
      if (last?.list) last.items.push(item[1]);
      else blocks.push({ list: true, items: [item[1]] });
    } else if (last?.list) last.items[last.items.length - 1] += ` ${line}`;
    else if (last && !last.list) last.text += ` ${line}`;
    else blocks.push({ list: false, text: line });
  }
  return blocks.map((b, i) =>
    b.list ? (
      <ul key={i} className="label tl-list">
        {b.items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    ) : (
      <p key={i} className="label tl-detail">
        {b.text}
      </p>
    )
  );
}

function Entry({ e }) {
  return (
    <li className="tl-entry">
      <div className="tl-top">
        <b>{when(e.date)}</b>
        {e.types.map((t) => (
          <StatusPill key={t} variant="neutral">
            {t}
          </StatusPill>
        ))}
        {e.api?.breaking ? <StatusPill variant="neutral">breaking</StatusPill> : null}
        <span className="mono label">{e.sha}</span>
      </div>
      <p>
        {e.explanation[0].toUpperCase() + e.explanation.slice(1)}. <span className="label">From the commit message.</span>
      </p>
      {e.detail ? <Body text={e.detail} /> : null}
      {e.api ? (
        <pre className="diff">
          {[...e.api.props.added.map((p) => `+ prop ${p}`), ...e.api.props.removed.map((p) => `- prop ${p}`), ...e.api.states.added.map((p) => `+ state ${p}`), ...e.api.states.removed.map((p) => `- state ${p}`)].map((l) => (
            <span key={l} className={l.startsWith('+') ? 'add' : 'del'}>
              {l}
              {'\n'}
            </span>
          ))}
        </pre>
      ) : null}
      {e.images ? (
        <div className="shots">
          {e.images.before ? <Shot rev={e.images.before} path={e.images.path} label="Before" /> : null}
          <Shot rev={e.images.after} path={e.images.path} label={e.images.before ? 'After' : 'New baseline'} />
        </div>
      ) : null}
    </li>
  );
}

/** The History section's body; Atlas wraps it in a Section. */
export default function AtlasHistory({ c }) {
  const [h, setH] = useState(null);
  const [type, setType] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setH(null);
    setAll(false);
    fetch(`/bella-history/${c.id}`)
      .then((r) => r.json())
      .then(setH)
      .catch(() => setH({ entries: [] }));
  }, [c.id]);
  if (!h) return <p className="label">Reading BELLA's history for {c.name}…</p>;
  const shown = h.entries.filter((e) => !type || e.types.includes(type));
  const list = all ? shown : shown.slice(0, 5);
  return (
    <div className="history">
      <div className="history-filters" role="group" aria-label="Filter by type">
        <FilterChip size="compact" pressed={!type} onClick={() => setType(null)}>
          All
        </FilterChip>
        {TYPES.map((t) => (
          <FilterChip key={t} size="compact" pressed={type === t} onClick={() => setType(type === t ? null : t)}>
            {t}
          </FilterChip>
        ))}
      </div>
      {list.length ? (
        <ol className="tl">
          {list.map((e) => (
            <Entry key={e.sha} e={e} />
          ))}
        </ol>
      ) : (
        <p className="label">No {type ?? ''} changes recorded for {c.name}.</p>
      )}
      {shown.length > 5 ? (
        <ActionChip onClick={() => setAll((a) => !a)}>{all ? 'Show the last 5' : `Show all ${shown.length}`}</ActionChip>
      ) : null}
    </div>
  );
}
