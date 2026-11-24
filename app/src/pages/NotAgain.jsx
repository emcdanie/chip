// Not again (was Playbooks): the CHIP / Screen template plus its content.
// Words from Figma (CHIP Dashboard, page content set 612:73919); data from CHIP.
import { useState } from 'react';
import Screen, { NewTask } from '../templates/Screen.jsx';
import NotAgainContent, { COMMITS, useNotAgainState } from './NotAgainContent.jsx';

const TABS = [
  { id: 'flow', label: 'Flow' },
  { id: 'library', label: 'Library' },
];

/** state: forces one of Figma's states (stories); the page reads it from the fix's run. */
export default function NotAgain({ state }) {
  const [tab, setTab] = useState(state === 'library' ? 'library' : 'flow');
  const live = useNotAgainState();
  const shown = state && state !== 'library' ? state : live;
  return (
    <Screen
      place="not-again"
      // the header's New task, white while the card holds the committing action
      header={{ title: 'Not again', actions: <NewTask variant={COMMITS.has(shown) && tab !== 'library' ? 'secondary' : 'primary'} /> }}
      tabs={{ items: TABS, value: tab, onChange: setTab, label: 'Not again views', idBase: 'not-again' }}
    >
      <NotAgainContent state={state === 'library' ? undefined : state} tab={tab} />
    </Screen>
  );
}
