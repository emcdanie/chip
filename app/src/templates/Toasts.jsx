// Where toasts sit (BELLA's Toast draws one; the page places and stacks it):
// bottom right of the window, newest last, above the page. Her rule: "every
// action gets feedback on the control itself, plus a toast".
import './Screen.css';

export default function Toasts({ children }) {
  return <div className="chip-toasts">{children}</div>;
}
