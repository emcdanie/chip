// CHIP's data, kept between pages: a page shows the last answer at once and
// reads again in the background, so moving between pages never blanks the
// project panel or flashes a loading state (19 Nov audit: 1–5 s of loading on
// every visit). One cache per URL for the whole app session.
import { useCallback, useEffect, useState } from 'react';

const cache = new Map(); // url -> { data, at }
const inflight = new Map(); // url -> Promise

export function fetchCached(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} answered ${r.status}`))))
    .then((data) => {
      cache.set(url, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** urls: the endpoints a view reads. Returns { data: [..] or null, error, at, reload }. */
export default function useCached(urls) {
  const key = urls.join('|');
  const now = () => (urls.every((u) => cache.has(u)) ? urls.map((u) => cache.get(u).data) : null);
  const [state, setState] = useState(() => ({ key, data: now(), error: null, at:urls.every((u) => cache.has(u)) ? Math.min(...urls.map((u) => cache.get(u).at)) : null }));
  const load = useCallback(() => {
    let live = true;
    // a new address shows its own cached answer (or nothing), never the last one's
    setState((s) => ({ ...s, data: now() ?? (s.key === key ? s.data : null), key }));
    Promise.all(urls.map(fetchCached))
      .then((data) => live && setState({ data, error: null, at: Date.now(), key }))
      .catch((e) => live && setState((s) => ({ ...s, error: e.message })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => load(), [load]);
  return { ...state, reload: load };
}
