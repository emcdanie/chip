// The template's one width switch, in JS so pages never write media queries:
// true below `width` (default 800px, the BELLA container-padding step: 16 on
// a phone, 32 from 800px; the template passes 1024, where the project panel
// steps out). A page uses it to pick a part's own layout prop
// (Step layout="vertical"), never to restyle a part.
import { useEffect, useState } from 'react';

export default function useNarrow(width = 800) {
  const QUERY = `(width < ${width}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [QUERY]);
  return narrow;
}
