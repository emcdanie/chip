import { useEffect } from 'react';

// One look for now: BELLA's chip theme (tokens/semantic/chip.json, Elleta,
// 6 Nov 2026). It is set explicitly so an OS dark setting can't flip it.
// BELLA specimens inside CHIP keep BELLA's own look: useTheme hands them light.
const THEME = 'chip';
const SPECIMEN_THEME = 'light';

export function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', THEME);
    try {
      localStorage.removeItem('chip-theme');
    } catch {}
  }, []);
  return [SPECIMEN_THEME];
}
