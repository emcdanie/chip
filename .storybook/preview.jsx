// CHIP stories are in the Chip themes only (CHIP uses Chip light and Chip
// dark), opening in Chip light, with a visible Light / Dark switch (Elleta,
// 19 Nov 2026: "why cant i see it in light mode?"). Shared BELLA parts switch
// all four themes in BELLA's Storybook; here any BELLA theme picked in a
// composing Storybook's toolbar maps to its Chip twin.
import '@bella/fonts.css';
import '@bella/tokens.css';

const chipTheme = (t) => (String(t || '').endsWith('dark') ? 'chip-dark' : 'chip-light');

export default {
  initialGlobals: { theme: 'chip-light' },
  globalTypes: {
    theme: {
      description: 'Chip theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'chip-light', title: 'Chip light' },
          { value: 'chip-dark', title: 'Chip dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.setAttribute('data-theme', chipTheme(context.globals.theme));
      return Story();
    },
  ],
  parameters: {
    layout: 'fullscreen',
    options: { storySort: { order: ['CHIP', ['Templates', 'Pages']] } },
  },
};
