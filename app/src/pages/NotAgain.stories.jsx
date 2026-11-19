// CHIP / Pages / Not again: the page (template + NotAgainContent), one story
// per Figma state (CHIP Dashboard, Not again · content 612:73919). Locked to Chip.
import NotAgain from './NotAgain.jsx';

export default {
  title: 'CHIP/Pages/Not again',
  component: NotAgain,
};

/** Figma 612:72478: the suggestion, its steps, and the two stats with no data yet. */
export const Suggested = { args: { state: 'suggested' } };
/** Figma 612:72730: the agent is adding pairs; Stop on the card. */
export const Running = { args: { state: 'running' } };
/** Figma 612:72978: the gate passed; Undo or Accept at the bottom right. */
export const YourCall = { name: 'Your call', args: { state: 'your-call' } };
/** Figma 612:73238: accepted; the success line with Undo. */
export const Kept = { args: { state: 'kept' } };
/** Figma 612:73471: the gate stopped it; Send back. */
export const GateFails = { name: 'Gate fails', args: { state: 'gate-fails' } };
/** Figma 612:73704: every saved fix, each with Run. */
export const Library = { args: { state: 'library' } };
