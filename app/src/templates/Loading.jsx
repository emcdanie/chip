// One loading view for every page (24 Nov review: "Loading board" showed a still mark and said nothing about how long or
// what). Progress follows Vitaly Friedman (CHIP rule, 22 Nov): nothing under a second; then what is being read, how many
// of its sources are in, a bar that fills as they arrive and the seconds so far. BELLA has no skeleton part yet (a named
// gap), so the bar stands in from the first second. The mark is the animated Noto hourglass, still under reduced motion.
import { useEffect, useState } from 'react';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Progress from '@bella/components/Progress/Progress';
import { readState } from './useCached.js';
import { markOf } from './marks.js';

// the hourglass is the loading mark itself, so it is fetched when the app opens (the other marks load only when shown);
// otherwise the first wait shows an empty space where it should turn
if (typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) new Image().src = markOf('⏳').markSrc;

/** title: what is loading ("Reading the board"); sources: [{ url, label }] the reads it waits for (through useCached);
 * what: for a wait CHIP cannot count (a page's own fetch, a picture), one plain label, timed from when this shows; size: EmptyState's. */
export default function Loading({ title, sources = [], what, size = 'lane' }) {
  const urls = sources.map((s) => s.url);
  const [, tick] = useState(0);
  const [shownAt] = useState(() => Date.now());
  useEffect(() => {
    const again = () => tick((n) => n + 1);
    window.addEventListener('chip:reads', again);
    const t = setInterval(again, 500);
    return () => (window.removeEventListener('chip:reads', again), clearInterval(t));
  }, []);
  const { doneOf, started } = readState(urls);
  const since = Date.now() - (started ?? shownAt);
  if (since < 1000) return null;
  const done = doneOf.filter(Boolean).length;
  const left = what ? [what] : sources.filter((_, i) => !doneOf[i]).map((s) => s.label);
  const secs = Math.round(since / 1000);
  return (
    <EmptyState
      size={size}
      {...markOf('⏳')}
      title={title}
      line={left.length ? `Reading ${left.join(', ')} · ${secs} s so far` : `All read · ${secs} s`}
      // with one source a bar can only jump from empty to full, so the line alone says how long; with more, the bar fills as they arrive
      actions={sources.length < 2 ? undefined : (
        // the bar a readable width under the words; the seconds are said once, in the line
        <div style={{ inlineSize: 'calc(var(--spacing-48) * 6)', maxInlineSize: '100%' }}>
          <Progress label={`${done} of ${sources.length} read`} fill={Math.round((100 * done) / sources.length)} tone="info" showTarget={false} />
        </div>
      )}
    />
  );
}
