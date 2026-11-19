// Components: the CHIP / Screen template plus Components · content (Figma
// 612:57549), on CHIP's own data. #/components/<id> opens one part. The old
// Atlas stays at #/atlas until Elleta has seen what it has that Figma
// doesn't ("Nothing made is lost").
import { useState } from 'react';
import Screen from '../templates/Screen.jsx';
import { projectTabs } from '../templates/projectViews.js';
import ComponentsContent from './ComponentsContent.jsx';
import { useComponents } from './componentsModel.js';

const fromHash = () => window.location.hash.split('/')[2] ?? null;

/** model, filter, partId: for stories; the page reads CHIP's data when no model is given. */
export default function Components({ model: given, filter: startFilter = 'all', partId: startPart }) {
  const live = useComponents();
  const [filter, setFilter] = useState(startFilter);
  const [partId, setPartId] = useState(() => startPart ?? fromHash());
  const pick = (id) => {
    setPartId(id);
    if (!given) window.history.replaceState(null, '', `#/components/${id}`);
  };
  return (
    <Screen place="projects" header={{ title: 'CHIP' }} tabs={projectTabs('components')}>
      <ComponentsContent model={given ?? live.model} filter={filter} onFilter={setFilter} partId={partId} onPart={pick} />
    </Screen>
  );
}
