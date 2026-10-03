import { useEffect, useState } from 'react';

// BELLA themes by [data-theme] on <html>: light is :root, dark and warm
// override it. Warm is CHIP's default (2026-10-03, Elleta); a pick is
// remembered for this browser only.
const KEY = 'chip-theme';
export const THEMES = [
  { value: 'warm', label: 'Warm' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.value === saved)) return saved;
  } catch {}
  return 'warm';
}

export function useTheme() {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme];
}
