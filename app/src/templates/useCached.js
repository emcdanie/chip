// CHIP's data, kept between pages: a page shows the last answer at once and
// reads again in the background, so moving between pages never blanks the
// project panel or flashes a loading state (19 Nov audit: 1–5 s of loading on
// every visit). One cache per URL for the whole app session.
import { useCallback, useEffect, useState } from 'react';

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

/** urls: the endpoints a view reads. Returns { data: [..] or null, error, at, loading, reload }. */
export default function useCached(urls) {
  const key = urls.join('|');
  const now = () => (urls.every((u) => cache.has(u)) ? urls.map((u) => cache.get(u).data) : null);
  const [state, setState] = useState(() => ({ key, data: now(), error: null, at:urls.every((u) => cache.has(u)) ? Math.min(...urls.map((u) => cache.get(u).at)) : null }));
  const load = useCallback((fresh = false) => {
    let live = true;
    // a new address shows its own cached answer (or nothing), never the last one's
    // loading: a fresh read (Check again) is on its way, so its button can say busy
    setState((s) => ({ ...s, data: now() ?? (s.key === key ? s.data : null), key, loading: fresh === true }));
    Promise.all(urls.map((u) => fetchCached(u, { fresh: fresh === true })))
      .then((data) => live && setState({ data, error: null, at: Date.now(), key, loading: false }))
      .catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => load(), [load]);
  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload };
}

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
