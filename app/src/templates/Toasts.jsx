// Where toasts sit (BELLA's Toast draws one; the page places and stacks it):
// bottom right of the window, newest last, above the page. Her rule: "every
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
    try {
      el?.showPopover?.();
    } catch {}
    return () => {
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
