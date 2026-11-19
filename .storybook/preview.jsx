// Every CHIP story is in the Chip theme: CHIP templates and pages are
// locked to Chip (shared BELLA parts switch themes in BELLA's Storybook).
import '@bella/fonts.css';
import '@bella/tokens.css';

document.documentElement.setAttribute('data-theme', 'chip-light');

export default {
  parameters: {
    layout: 'fullscreen',
    options: { storySort: { order: ['CHIP', ['Templates', 'Pages']] } },
  },
};
