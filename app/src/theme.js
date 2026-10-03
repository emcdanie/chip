import { useEffect, useState } from 'react';

// BELLA themes by [data-theme] on <html>: light is :root, dark overrides it.
// The first visit follows the OS; a pick is remembered for this browser only.
const KEY = 'chip-theme';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
