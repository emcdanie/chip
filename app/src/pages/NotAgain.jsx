// Not again (was Playbooks): the CHIP / Screen template plus its content.
// Words from Figma (CHIP Dashboard, page content set 612:73919).
import { useState } from 'react';
import Button from '@bella/components/Button/Button';
import Screen from '../templates/Screen.jsx';
import NotAgainContent, { COMMITS } from './NotAgainContent.jsx';

const TABS = [
  { id: 'flow', label: 'Flow' },
  { id: 'library', label: 'Library' },
];

/** state: one of Figma's six (STATES in NotAgainContent); the Library state opens the Library tab. */
export default function NotAgain({ state = 'suggested' }) {
  const [tab, setTab] = useState(state === 'library' ? 'library' : 'flow');
  return (
    <Screen
      place="not-again"
      header={{
        title: 'Not again',
        actions: (
          <Button variant={COMMITS.has(state) ? 'secondary' : 'primary'} size="sm">
            New fix
          </Button>
        ),
      }}
      tabs={{ items: TABS, value: tab, onChange: setTab, label: 'Not again views', idBase: 'not-again' }}
    >
      <NotAgainContent state={tab === 'library' ? 'library' : state === 'library' ? 'suggested' : state} />
    </Screen>
  );
}
