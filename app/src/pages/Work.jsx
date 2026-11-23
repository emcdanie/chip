// Work: the CHIP / Screen template plus Work · content (Figma 608:207182), a
// page as in Figma, on CHIP's own data. The old Work drawer (Sessions,
// Terminal, Ask OBI) stays in the old app until Elleta has seen what it has
// that Figma doesn't ("Nothing made is lost").
import { useState } from 'react';
import Screen from '../templates/Screen.jsx';
import WorkContent from './WorkContent.jsx';
import { filterFromHash, useWork } from './workModel.js';

/** model and view: for stories; the page reads CHIP's data when no model is given. */
export default function Work({ model: given, view: startView = 'board' }) {
  const live = useWork();
  const [view, setViewNow] = useState(() => {
    const v = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('view');
    return ['board', 'table', 'list'].includes(v) ? v : startView;
  });
  // the view is part of the address (second pass S6), so a shared link opens the same one
  const setView = (v) => {
    setViewNow(v);
    const a = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    v === 'board' ? a.delete('view') : a.set('view', v);
    const next = `#/work${a.toString() ? `?${a}` : ''}`;
    if (window.location.hash.startsWith('#/work') && window.location.hash !== next) window.history.replaceState(null, '', next);
  };
  return (
    <Screen
      place="work"
      // Figma's main action is "New task"; CHIP has no new-task flow yet, so
      // it waits rather than pointing somewhere it doesn't do.
      header={{ title: 'CHIP' }}
    >
      <WorkContent model={given ?? live.model} filter={given ? {} : filterFromHash()} view={view} onView={setView} checked={given ? '10:29' : live.checked} onCheck={live.reload} loading={!given && live.loading} />
    </Screen>
  );
}
