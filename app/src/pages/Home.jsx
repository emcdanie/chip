// Home: the CHIP / Screen template plus Figma's Home placeholder (CHIP
// Dashboard, Flow 8 · Home, screen 1, 612:85935): a page-sized Empty state,
// centred, until Home's own content is picked. Projects hold the work.
import Screen from '../templates/Screen.jsx';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';

export default function Home() {
  return (
    <Screen place="home" header={{ title: 'Home' }}>
      <Flow align="center">
        <EmptyState size="page" mark="🏠" title="Home: not picked yet" line="Home isn’t set up yet. Open a project to see its work." />
      </Flow>
    </Screen>
  );
}
