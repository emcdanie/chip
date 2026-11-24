// Where toasts sit (BELLA's Toast draws one; the page places and stacks it):
// bottom centre of the work area, newest last, above the page (her review, 24 Nov: toasts high in a corner are
// missed; one place on every page). Her rule: "every
// action gets feedback on the control itself, plus a toast".
// A toast is a manual popover, so it joins the top layer after any open Drawer
// (a modal dialog) and shows above it, its Undo still clickable (audit 21 Nov:
// "Chat cleared · Undo" sat behind the Work panel).
import { useLayoutEffect, useRef } from 'react';
import './Screen.css';

export default function Toasts({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // the work area's centre and the top bar's foot, measured, since a popover sits on the window
    const place = () => {
      const main = document.querySelector('.chip-screen__main')?.getBoundingClientRect();
      const bar = document.querySelector('.chip-screen__main [data-bella-component="top-bar"]')?.getBoundingClientRect();
      if (!el || !main) return;
      el.style.insetInlineStart = `${main.left + main.width / 2}px`;
      // bottom centre (her review, 24 Nov): the work area's centre, 24 above the window's foot (Screen.css)
    };
    place();
    window.addEventListener('resize', place);
    try {
      el?.showPopover?.();
    } catch {}
    return () => {
      window.removeEventListener('resize', place);
      try {
        el?.hidePopover?.();
      } catch {}
    };
  }, []);
  return (
    <div ref={ref} popover="manual" className="chip-toasts">
      {children}
    </div>
  );
}
