// A comment as Figma draws it (Elleta, 23 Nov 2026: "I said I wanted my messages, like the comments I make, to look
// like the Figma ones"): a pin with her initials on a pink teardrop (pink is for annotations) whose point sits on the spot, and a bubble with
// her avatar, her name, when, and her words. Shared by PicturePins (pictures in Playground and Needs you) and Mark up
// (any CHIP page), so a comment looks the same everywhere.
// BELLA parts: Pin (pinStyle="comment"), Card, Avatar, Input (with its own Send), TextStack. Layout: Flow.
import Avatar from '@bella/components/Avatar/Avatar';
import Input from '@bella/components/Input/Input';
import Card from '@bella/components/Card/Card';
import Pin from '@bella/components/Pin/Pin';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

// the person commenting: the same name the side menu's avatar shows (Screen.jsx)
export const AUTHOR = 'Elleta McDaniel';
const initials = AUTHOR.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// the pin's point is the bottom-left of its 32 disc, centred in its 44 target: the target moves up and left so the
// point lands on the spot (6 = (44 - 32) / 2, 38 = 6 + 32)
export const PIN_AT = 'calc(var(--spacing-4) * -1.5) calc(var(--spacing-4) * -9.5)';

/** n: the comment's number (its name for screen readers); onClick opens it. */
export function CommentPin({ n, onClick, sent }) {
  return <Pin number={initials} pinStyle="comment" ariaLabel={`Comment ${n}${sent ? ', sent' : ''}`} onClick={onClick} />;
}

/** when: words for the time ("Draft, not sent", "Sent 22:14"); children: the words or the field; actions at the foot.
 *  flat: no card of its own, for a comment listed in a panel that is already a card (as Figma's comment list). */
export function CommentBubble({ when, children, actions, flat = false }) {
  // as Figma lists a comment: her avatar at the left; her name and when on one line beside it, her words under the
  // name, the actions at the right edge (her review, 24 Nov: the comments panel "layout needs work")
  const body = (
    <Flow direction="row" gap={8} align="start" grow="last">
      <Avatar name={AUTHOR} size="xs" />
      <Flow gap={4}>
        <Flow direction="row" gap={8} align="center" wrap>
          <TextStack title={AUTHOR.split(' ')[0]} />
          {when ? <TextStack meta={when} /> : null}
        </Flow>
        {children}
        {actions ? (
          <Flow direction="row" gap={8} justify="end">
            {actions}
          </Flow>
        ) : null}
      </Flow>
    </Flow>
  );
  return flat ? body : <Card>{body}</Card>;
}

/** A new comment as Figma draws it: her avatar beside one field with its own Send; Enter sends, Esc cancels, a click
 *  away keeps what she wrote. n: the comment's number, its field's name. */
export function NewComment({ n, value, onChange, onSend }) {
  return (
    <Card>
      <Flow direction="row" gap={8} align="end" grow="last">
        <Avatar name={AUTHOR} size="sm" />
        <Input label={`Comment ${n}`} value={value} onChange={onChange} onSend={(v) => (v ?? '').trim() && onSend()} sendLabel="Save the comment" placeholder="Add a comment" />
      </Flow>
    </Card>
  );
}
