// Glide (interaction study, 23 Nov): its own module so the template, drawers and pages share it without an import loop.
import { flushSync } from 'react-dom';

/* The side menu glides instead of snapping (interaction study, 23 Nov: hiding it moved the
   whole page 232px in one frame, a layout shift of 0.16). The browser's view transition takes a picture before and after
   the change and moves between them on BELLA's motion tokens (Screen.css): the column slides out or in, the rest of the
   page slides across to its new place. The names that tie the pictures together are on only while it runs, so they
   change nothing at rest. Reduced motion, or a browser without view transitions: the change happens at once. */
export function glide(kind, update) {
  const reduce = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !document.startViewTransition) return update();
  const root = document.documentElement;
  root.classList.add(`chip-gliding-${kind}`);
  const t = document.startViewTransition(() => flushSync(update));
  t.finished.finally(() => root.classList.remove(`chip-gliding-${kind}`));
  return undefined;
}
