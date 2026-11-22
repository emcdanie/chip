// "n marked · Send all" (Elleta, 23 Nov: "if every message costs tokens should i not be able to do it all in one").
// Marks and comments are drafts kept in the browser; this bar is the one place they leave, as one batch.
// Hidden at 0 marked, unless a result is showing. Shared by Playground Picks and the Needs you view.
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** count: marked items; onSend(): posts them all in one request; sending; result: { n, at } after a send; failed: text. */
export default function SendBar({ count, onSend, sending, result, failed }) {
  if (!count && !result && !failed) return null;
  return (
    <div style={{ position: 'sticky', insetBlockEnd: 'var(--spacing-16)', zIndex: 2 }}>
      <Card>
        <Flow direction="row" gap={12} align="center" justify="end" wrap role="group" aria-label="Send all">
          <Flow role="status" gap={0} grow="first">
            {failed ? <TextStack body={failed} /> : count ? <TextStack body={`${count} marked`} /> : result ? <TextStack body={`Sent ${plural(result.n, 'answer')} · ${result.at}`} /> : null}
          </Flow>
          {count ? (
            <Button variant="primary" busy={sending} onClick={onSend}>
              Send all
            </Button>
          ) : null}
        </Flow>
      </Card>
    </div>
  );
}
