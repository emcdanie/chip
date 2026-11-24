import { useEffect } from 'react';

// One look for now: BELLA's light ground, the same palette as elleta.design
// (Elleta, 3 Nov 2026: "the updated colors from my portfolio and no themes").
// data-theme="chip-light" (BELLA's Chip theme, as the Figma screens) is set explicitly so an OS dark setting can't flip it.
// Warm, dark and Wee Dote stay in BELLA; CHIP just doesn't offer them.
const THEME = 'chip-light';

export function useTheme() {
  useEffect(() => {
    // keep a Chip theme someone already set (CHIP's Storybook switch, Chip
    // dark); anything else, or nothing, becomes Chip light
    const now = document.documentElement.getAttribute('data-theme') || '';
    if (!now.startsWith('chip-')) document.documentElement.setAttribute('data-theme', THEME);
    try {
      localStorage.removeItem('chip-theme');
    } catch {}
  }, []);
  return [THEME];
}
