// Work: the CHIP / Screen template plus Work · content (Figma 608:207182), a
// page as in Figma, on CHIP's own data. The old Work drawer (Sessions,
// Terminal, Ask OBI) stays in the old app until Elleta has seen what it has
// that Figma doesn't ("Nothing made is lost").
import { useState } from 'react';
import Screen from '../templates/Screen.jsx';
import { projectTabs } from '../templates/projectViews.js';
import WorkContent from './WorkContent.jsx';
import { useWork } from './workModel.js';

/** model and view: for stories; the page reads CHIP's data when no model is given. */
export default function Work({ model: given, view: startView = 'board' }) {
  const live = useWork();
  const [view, setView] = useState(startView);
  return (
    <Screen
      place="projects"
      // Figma's main action is "New task"; CHIP has no new-task flow yet, so
      // it waits rather than pointing somewhere it doesn't do.
      header={{ title: 'CHIP' }}
      tabs={projectTabs('work')}
    >
      <WorkContent model={given ?? live.model} view={view} onView={setView} checked={given ? '10:29' : live.checked} onCheck={live.reload} />
    </Screen>
  );
}
