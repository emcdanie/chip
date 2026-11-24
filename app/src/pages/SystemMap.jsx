// Processes (replaces the System map; approved 22 Nov, /screens/2026-11-22-processes/): the
// CHIP / Screen template plus its content. A list of maps, the picked map as a board, the
// picked step's detail. The side menu still says "System map" until the shell renames it.
import Screen from '../templates/Screen.jsx';
import SystemMapContent from './SystemMapContent.jsx';

export default function SystemMap() {
  return (
    <Screen place="map" header={{ title: 'Processes' }}>
      <SystemMapContent />
    </Screen>
  );
}
