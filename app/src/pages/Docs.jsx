// System > Docs: everything behind the system, read from BELLA's and CHIP's own folders (Elleta, 23 Nov: "where can we see
// all the docs behind the system"). The CHIP / Screen template plus its content.
import Screen from '../templates/Screen.jsx';
import DocsContent from './DocsContent.jsx';
import { projectTabs } from '../templates/projectViews.js';

export default function Docs() {
  return (
    <Screen place="projects" tabs={projectTabs('docs')} header={{ title: 'System' }}>
      <DocsContent />
    </Screen>
  );
}
