// The set up template (Elleta, 23 Nov 2026: "we need to make sure we have the setup templates as well"; her
// screenshot of Set up Notion was one paragraph and a button). Every connector's Set up drawer is built from these:
// numbered steps, each with one plain line, a picture, the button that opens the right page, the field to paste into,
// and a Test it that says Works or Not yet and why. A connector already set up opens on its Connected state (a plain
// name, never a slug; Connected since its date; the last test; the key hidden), with the steps and Replace folded
// behind one click. Mock: docs/reference/screens/2026-11-23-sources-setup/.
// BELLA parts only: ListRow (its pin slot carries the number), Pin, Tag, TextStack, Input, Button, Notification,
// Disclosure. Gap named: BELLA has no numbered how-to step (its Step is an agent run step), so a ListRow with a Pin
// stands in. Pictures are drawn stand-ins of the page, never a screenshot of her account; a real screenshot replaces
// one by passing `picture` as an image.
import { useState } from 'react';
import ListRow from '@bella/components/ListRow/ListRow';
import Pin from '@bella/components/Pin/Pin';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import Notification from '@bella/components/Notification/Notification';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from './Flow.jsx';

export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

/** A drawn stand-in of the page the step happens on: its address, the control to press (numbered, red like a flow's
 *  locator dot) and any labels beside it. role="img" with the sentence a screen reader needs. */
export function SetupPicture({ where, target, tags = [], n = 1 }) {
  return (
    <div
      role="img"
      aria-label={`Drawing of ${where}. Step ${n}: ${target}${tags.length ? `, with ${tags.join(' and ')}` : ''}.`}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', padding: 'var(--spacing-12)', background: 'var(--color-background-subtle)', border: 'var(--border-width-1) solid var(--color-border-subtle)', borderRadius: 'var(--border-radius-16)' }}
    >
      <TextStack overline={where} />
      <div style={{ height: 'var(--spacing-8)', width: '40%', borderRadius: 'var(--border-radius-round)', background: 'var(--color-background-utility-neutral)' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-8)' }}>
        <Pin number={n} variant="red" ariaLabel={`Step ${n}`} />
        <Tag variant="outline" tone="info">{target}</Tag>
        {tags.map((t) => (
          <Tag key={t} variant="flat">{t}</Tag>
        ))}
      </div>
      <div style={{ height: 'var(--spacing-8)', width: '70%', borderRadius: 'var(--border-radius-round)', background: 'var(--color-background-utility-neutral)' }} />
    </div>
  );
}

/** One numbered step. The title is short; the sentence is the description (no whole sentence in bold). */
export function SetupStep({ n, title, body, picture, done, children }) {
  return (
    <ListRow
      as="li"
      layout="stacked"
      pin={<Pin number={n} ariaLabel={`Step ${n}`} />}
      title={title}
      description={body}
      tag={done ? <Tag variant="outline" tone="success">Done</Tag> : undefined}
      body={picture || children ? <Flow gap={12}>{picture}{children}</Flow> : undefined}
    />
  );
}
export const SetupList = ({ label, children }) => (
  <Flow as="ol" gap={8} aria-label={label}>
    {children}
  </Flow>
);

/** The button that opens the right page. It leaves CHIP, so the words say so (BELLA Link rule: say where it goes). */
export function OpenPage({ label, href }) {
  return (
    <Flow direction="row" justify="end">
      <Button variant="secondary" size="sm" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>
        {`${label} (opens the site)`}
      </Button>
    </Flow>
  );
}

/** A field to paste into with its Save at the right edge. `onSave(value)` returns { ok, error }. A secret field is masked
 *  and is cleared once saved, so it is never kept on screen. */
export function PasteField({ label, type = 'text', placeholder, hint, saveLabel, onSave, name, savedWords }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy(true);
    const r = await onSave(value);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Could not save it');
    setValue('');
    setSaved(true);
  };
  return (
    <Flow gap={8}>
      <Input label={label} type={type} value={value} onChange={setValue} placeholder={placeholder} name={name} error={error || undefined} hint={hint} />
      <Flow direction="row" justify="end">
        <Button variant="secondary" size="sm" busy={busy} disabled={!value.trim()} onClick={save}>
          {saveLabel}
        </Button>
      </Flow>
      {saved && savedWords ? <TextStack body={savedWords} /> : null}
    </Flow>
  );
}

/** Test it, with a result that says Works or Not yet and why. `run()` returns { ok, text }. `last`: the result to show. */
export function TestIt({ run, last, disabled, label = 'Test it' }) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(null);
  const go = async () => {
    setBusy(true);
    setNow(null);
    const r = await run();
    setBusy(false);
    setNow(r);
  };
  const shown = now ?? last;
  return (
    <Flow gap={8}>
      <Flow direction="row" justify="end">
        <Button variant="primary" size="sm" busy={busy} disabled={disabled} onClick={go}>
          {busy ? 'Testing…' : label}
        </Button>
      </Flow>
      {shown ? <Notification tone={shown.ok ? 'success' : 'danger'} title={shown.ok ? 'Works' : 'Not yet'} message={shown.text} /> : null}
    </Flow>
  );
}

/** The Connected state. `facts`: short lines (saved day, last test). The token, when there is one, shows as dots only:
 *  its value is never sent to the page. The steps and Replace sit behind one click. */
export function Connected({ name, facts, secret, steps, stepsLabel = 'Replace the token or see the setup steps', children }) {
  return (
    <Flow gap={16}>
      <Notification tone="success" title="Connected" message={[name, ...facts.filter(Boolean)].join(' · ')} />
      {secret ? <Input label={secret} type="text" value="••••••••••••••••" onChange={() => {}} disabled hint="Hidden. It is kept on this Mac and never shown again." /> : null}
      {children}
      <Disclosure title={stepsLabel}>{steps}</Disclosure>
    </Flow>
  );
}
