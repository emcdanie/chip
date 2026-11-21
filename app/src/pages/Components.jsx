// Components: the CHIP / Screen template plus Components · content (her design,
// CHIP · Dashboard 690:492657), on CHIP's own data. #/components/<id> opens one part. The old
// Atlas stays at #/atlas until Elleta has seen what it has that Figma
// doesn't ("Nothing made is lost").
import { useEffect, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import { projectTabs } from '../templates/projectViews.js';
import ComponentsContent from './ComponentsContent.jsx';
import { useComponents } from './componentsModel.js';

const fromHash = () => {
  const id = window.location.hash.split('?')[0].split('/')[2];
  return id ? decodeURIComponent(id) : null;
};
// #/components?filter=needs opens on Needs work (Health's "See all N fixes")
const filterFromHash = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('filter');

/** model, filter, partId: for stories; the page reads CHIP's data when no model is given. */
export default function Components({ model: given, filter: startFilter = 'all', partId: startPart }) {
  const live = useComponents();
  const [filter, setFilter] = useState(() => (given ? startFilter : filterFromHash() ?? startFilter));
  const [partId, setPartId] = useState(() => startPart ?? fromHash());
  // the address can change while the page is open (top-bar search, a link, Back): follow it.
  // A part picked from outside shows even when the filter on screen would hide it.
  useEffect(() => {
    if (given) return undefined;
    const on = () => {
      const id = fromHash();
      if (!id) return;
      setPartId(id);
      setFilter(filterFromHash() ?? 'all');
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [given]);
  const pick = (id) => {
    setPartId(id);
    if (!given) window.history.replaceState(null, '', `#/components/${id}`);
  };
  return (
    <Screen place="projects" header={{ title: 'CHIP' }} tabs={projectTabs('components')}>
      <ComponentsContent model={given ?? live.model} filter={filter} onFilter={setFilter} partId={partId} onPart={pick} onCheckAgain={live.reload} />
    </Screen>
  );
}
