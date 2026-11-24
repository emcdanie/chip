// Foundations: the CHIP / Screen template plus its content (CHIP Dashboard,
// Foundations · content 612:61970). BELLA's colour roles, type, spacing,
// tokens and tiers, from BELLA itself. The old Foundations page stays in the
// old app until Elleta has seen what it has that Figma doesn't.
import Screen from '../templates/Screen.jsx';
import { projectTabs } from '../templates/projectViews.js';
import FoundationsContent from './FoundationsContent.jsx';

export default function Foundations() {
  return (
    <Screen place="projects" header={{ title: 'System' }} tabs={projectTabs('foundations')}>
      <FoundationsContent />
    </Screen>
  );
}
