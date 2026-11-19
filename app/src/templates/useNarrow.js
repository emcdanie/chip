// The template's one width switch for pages, in JS so pages never write
// media queries: true below 800px, the BELLA container-padding step (16 on a
// phone, 32 from 800px). A page uses it to pick a part's own layout prop
// (Step layout="vertical"), never to restyle a part.
import { useEffect, useState } from 'react';

const QUERY = '(width < 800px)';

export default function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
