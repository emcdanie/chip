// Health: the CHIP / Screen template plus Health · content (Figma 601:111049),
// on CHIP's live data. The old Overview stays at #/health-old until Elleta
// has seen what it has that Figma doesn't ("Nothing made is lost").
import Button from '@bella/components/Button/Button';
import Screen from '../templates/Screen.jsx';
import { projectTabs } from '../templates/projectViews.js';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import HealthContent from './HealthContent.jsx';
import { useHealth } from './healthModel.js';

/** model and run: for stories; the page reads CHIP's data when they are not given. */
export default function Health({ model: given, run }) {
  const live = useHealth();
  const model = given ?? live.model;
  return (
    <Screen
      place="projects"
      header={{
        title: 'CHIP',
        actions: (
          <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon onClick={() => window.location.reload()}>
            Check again
          </Button>
        ),
      }}
      tabs={projectTabs('health')}
    >
      {live.error && !given ? (
        <EmptyState size="lane" mark="🔌" title="CHIP's server isn't answering" line={live.error} />
      ) : (
        <HealthContent model={model} run={run} />
      )}
    </Screen>
  );
}
