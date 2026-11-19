// CHIP / Templates / Screen: the template on its own, with an empty content
// slot. Locked to Chip (see .storybook/preview.jsx).
import Button from '@bella/components/Button/Button';
import Screen from './Screen.jsx';

export default {
  title: 'CHIP/Templates/Screen',
  component: Screen,
};

export const Default = {
  render: () => (
    <Screen
      place="projects"
      header={{ title: 'CHIP', actions: <Button variant="primary" size="sm">New task</Button> }}
      tabs={{
        items: [
          { id: 'work', label: 'Work' },
          { id: 'health', label: 'Health' },
          { id: 'components', label: 'Components' },
        ],
        value: 'health',
        onChange: () => {},
        label: 'Project views',
        idBase: 'story-screen',
      }}
    />
  ),
};
