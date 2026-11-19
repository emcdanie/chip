// Connectors: the CHIP / Screen template plus its content (CHIP Dashboard,
// Connectors · content 601:126716). What CHIP reaches, the ways it can read
// Figma, and what still needs setting up.
import Screen from '../templates/Screen.jsx';
import ConnectorsContent from './ConnectorsContent.jsx';

export default function Connectors() {
  return (
    <Screen place="connectors" header={{ title: 'Connectors', lede: 'The tools CHIP reads from, and whether each one answers.' }}>
      <ConnectorsContent />
    </Screen>
  );
}
