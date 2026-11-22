// "n marked · Send all" (Elleta, 23 Nov: "if every message costs tokens should i not be able to do it all in one").
// Marks and comments are drafts kept in the browser; this bar is the one place they leave, as one batch.
// Hidden at 0 marked, unless a result is showing. Shared by Playground Picks and the Needs you view.
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Notification from '@bella/components/Notification/Notification';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * count: marked items; onSend(): posts them all in one request; sending; result: { n, at } after a send; failed: text;
 * onBack(): back to the board; onDismiss(): closes the confirmation and keeps marking.
 */
export default function SendBar({ count, onSend, sending, result, failed, onBack, onDismiss }) {
  if (!count && !result && !failed) return null;
  const wrap = (node) => <div style={{ position: 'sticky', insetBlockEnd: 'var(--spacing-16)', zIndex: 2 }}>{node}</div>;
  // a failed send says so in words and keeps every draft; Try again sends the same batch
  if (failed) return wrap(<Notification tone="danger" title="Not sent" message={failed} action={{ label: 'Try again', onClick: onSend }} />);
  // after a send: a clear confirmation, read out to screen readers (Notification is role status), with the way back
  if (!count && result)
    return wrap(
      <Notification
        tone="success"
        title={`Sent ${plural(result.n, 'answer')} · ${result.at}`}
        message="Your marks reached the board in one message, and the cards now read Sent."
        action={onBack ? { label: 'Back to the board', onClick: onBack } : undefined}
        secondAction={{ label: 'Keep marking', onClick: onDismiss }}
        onClose={onDismiss}
      />,
    );
  return wrap(
    <Card>
      <Flow direction="row" gap={12} align="center" justify="end" wrap role="group" aria-label="Send all">
        <Flow role="status" gap={0} grow="first">
          <TextStack body={`${count} marked`} />
        </Flow>
        <Button variant="primary" busy={sending} onClick={onSend}>
          Send all
        </Button>
      </Flow>
    </Card>,
  );
}
