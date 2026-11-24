// History: the CHIP / Screen template plus its content (CHIP Dashboard,
// History · content 612:67196, the visual states 664:123671 to 667:270579:
// her EUR-Lex layout, approved 18 Nov). Search first, kinds, the activity
// timeline beside the opened record.
import Screen from '../templates/Screen.jsx';
import HistoryContent from './HistoryContent.jsx';
import { projectTabs } from '../templates/projectViews.js';

export default function History() {
  return (
    <Screen place="projects" tabs={projectTabs('history')} header={{ title: 'System' }}>
      <HistoryContent />
    </Screen>
  );
}
