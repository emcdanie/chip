// CHIP's data, kept between pages: a page shows the last answer at once and
// reads again in the background, so moving between pages never blanks the
// project panel or flashes a loading state (19 Nov audit: 1–5 s of loading on
// every visit). One cache per URL for the whole app session.
import { useCallback, useEffect, useState } from 'react';
import { found } from '../runClock.js';

const cache = new Map(); // url -> { data, at }
const inflight = new Map(); // url -> Promise

/** fresh: ask the server for a new read, not its last answer ("Check again"). */
export function fetchCached(url, { fresh = false } = {}) {
  if (inflight.has(url) && !fresh) return inflight.get(url);
  const p = fetch(fresh ? `${url}${url.includes('?') ? '&' : '?'}fresh=1` : url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} answered ${r.status}`))))
    .then((data) => {
      cache.set(url, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** urls: the endpoints a view reads. Returns { data: [..] or null, error, at, loading, reload }.
 * live: read again in the background (Elleta, 23 Nov: "the data is not continuously updated it is behind"): when the
 * window gets focus, on the 'chip:changed' event, and every 60 seconds while the page is visible. A background read
 * never blanks or flickers: the old numbers stay until the new ones arrive, and when it fails they stay and `stale`
 * says "Couldn't refresh, showing 16:41". `at` is when the shown data was read. */
export default function useCached(urls, { live = false } = {}) {
  const key = urls.join('|');
  const now = () => (urls.every((u) => cache.has(u)) ? urls.map((u) => cache.get(u).data) : null);
  const [state, setState] = useState(() => ({ key, data: now(), error: null, stale: null, at:urls.every((u) => cache.has(u)) ? Math.min(...urls.map((u) => cache.get(u).at)) : null }));
  const load = useCallback((fresh = false) => {
    let live = true;
    // a new address shows its own cached answer (or nothing), never the last one's
    // loading: a fresh read (Check again) is on its way, so its button can say busy
    setState((s) => ({ ...s, data: now() ?? (s.key === key ? s.data : null), key, loading: fresh === true }));
    const t0 = Date.now();
    const prev = fresh === true ? now() : null;
    Promise.all(urls.map((u) => fetchCached(u, { fresh: fresh === true })))
      // a fresh read ("Check again") also keeps how long it took and what it found, for the page's LastRun line
      .then((data) => live && setState((s) => ({ data, error: null, stale: null, at: Date.now(), key, loading: false, last: fresh === true ? { at: Date.now(), tookMs: Date.now() - t0, found: found(prev ?? s.data, data) } : s.last })))
      .catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => load(), [load]);
  const reload = useCallback(() => load(true), [load]);
  // background reads: no loading flag, the shown data kept; a failure only sets `stale`
  const quiet = useCallback(() => {
    if (!urls.length || document.hidden) return;
    // the server's own read is at most 30 seconds old; ?fresh=1 is for the Check again button only
    Promise.all(urls.map((u) => fetchCached(u)))
      .then((data) => setState((s) => (s.key === key ? { ...s, data, error: null, stale: null, at: Date.now() } : s)))
      .catch(() => setState((s) => (s.key === key && s.data ? { ...s, stale: `Couldn’t refresh, showing ${clock(s.at)}` } : s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(quiet, 60_000);
    const onVisible = () => !document.hidden && quiet();
    window.addEventListener('focus', quiet);
    window.addEventListener('chip:changed', quiet);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', quiet);
      window.removeEventListener('chip:changed', quiet);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [live, quiet]);
  return { ...state, reload };
}

/** "16:58" for a time in ms. */
export const clock = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

/* Every new page's data, read once when CHIP opens, so the first visit to a
   page shows its answer instead of a loading state. */
const PAGE_DATA = ['/projects', '/needs', '/runs', '/data/bella.json', '/gaps', '/contrast-pairs', '/map', '/history?limit=1'];
export function warmPages() {
  for (const u of PAGE_DATA) fetchCached(u).catch(() => {});
  // History opens on its newest record
  fetchCached('/history?limit=400')
    .then((h) => h?.records?.[0]?.id && fetchCached(`/history/record?id=${encodeURIComponent(h.records[0].id)}`))
    .catch(() => {});
}
