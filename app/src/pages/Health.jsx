// Health: the CHIP / Screen template plus Health · content (Figma 601:111049),
// on CHIP's live data. The old Overview stays at #/health-old until Elleta
// has seen what it has that Figma doesn't ("Nothing made is lost").
import Screen from '../templates/Screen.jsx';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import HealthContent from './HealthContent.jsx';
import { useHealth } from './healthModel.js';

/** model and run: for stories; the page reads CHIP's data when they are not given. */
export default function Health({ model: given, run }) {
  const live = useHealth();
  const model = given ?? live.model;
  return (
    <Screen
      place="health"
      header={{ title: 'CHIP' }}
    >
      {live.error && !given ? (
        <EmptyState size="lane" mark="🔌" title="CHIP's server isn't answering" line={live.error} />
      ) : (
        <HealthContent model={model} run={run} checked={given ? '10:29' : live.checked} stale={given ? null : live.stale} onCheck={live.reload} loading={!given && live.loading} />
      )}
    </Screen>
  );
}
