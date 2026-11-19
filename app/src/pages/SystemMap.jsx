// System map: the CHIP / Screen template plus its content (CHIP Dashboard,
// Screen 6 · System map 601:123153). BELLA's pipeline, what fails, what it
// blocks, and the fix.
import Screen from '../templates/Screen.jsx';
import SystemMapContent from './SystemMapContent.jsx';

export default function SystemMap() {
  return (
    <Screen place="map" header={{ title: 'System map' }}>
      <SystemMapContent />
    </Screen>
  );
}
