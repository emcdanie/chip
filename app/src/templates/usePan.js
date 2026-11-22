// Drag to pan: moves whatever box scrolls around an element (a Stage's frame at 100% or more).
// Shared by the System map's board and the Needs you picture.
import { useRef } from 'react';

// the nearest box that scrolls around an element (Stage's frame at 100%)
export function scroller(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight)) return e;
  }
  return null;
}

/* Drag the board to pan: moves whatever box scrolls around it. */
export default function usePan() {
  const drag = useRef(null);
  return {
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
      const box = scroller(e.currentTarget);
      if (!box) return;
      drag.current = { box, x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      d.box.scrollLeft = d.left - (e.clientX - d.x);
      d.box.scrollTop = d.top - (e.clientY - d.y);
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null),
  };
}
