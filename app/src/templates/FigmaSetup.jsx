// Connect Figma, in plain steps (Elleta, 22 Nov: "fix this so i can set it up"). One form used by the Connectors "Set up
// figma-rest" drawer and the Components "Add file key" drawer, so there is one way in. Step 0 (only when no file is set)
// takes the BELLA library's link; 1 says how to make a read-only token; 2 takes it in a masked field and saves it to
// server/.env (never shown again, never logged, never in an address); 3 reads the file's name from Figma and says
// "Connected to <name> · read 20:12", or in words why not. BELLA parts only: TextStack, Input type="password", Button.
import { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

/** What is set up: { key, token, lastRead } from GET /figma-key, read again when something is saved. */
export function useFigma() {
  const [state, setState] = useState(null);
  const read = useCallback(() => fetch('/figma-key').then((r) => r.json()).then(setState).catch(() => {}), []);
  useEffect(() => {
    read();
  }, [read]);
  return [state, read];
}

/** onChanged(): called after anything is saved or tested, so the page can read Figma again. */
export default function FigmaSetup({ onChanged }) {
  const [state, read] = useFigma();
  const [link, setLink] = useState('');
  const [token, setToken] = useState('');
  const [problem, setProblem] = useState({});
  const [said, setSaid] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(null);
  const changed = () => (read(), onChanged?.());
  const saveKey = async () => {
    setProblem({});
    setBusy('key');
    const r = await post('/figma-key', { link });
    setBusy(null);
    if (!r.ok) return setProblem({ key: r.error ?? 'Could not save it' });
    setLink('');
    changed();
  };
  const test = async () => {
    setSaid(null);
    setBusy('test');
    const r = await post('/figma-test');
    setBusy(null);
    setSaid({ ok: Boolean(r.ok), text: r.ok ? `${r.says} · read ${clock(r.at ?? new Date().toISOString())}` : r.says ?? 'CHIP could not test it.' });
    changed();
  };
  const saveToken = async () => {
    setProblem({});
    setSaved(false);
    setBusy('token');
    const r = await post('/figma-token', { token });
    setBusy(null);
    if (!r.ok) return setProblem({ token: r.error ?? 'Could not save it' });
    setToken(''); // never kept on screen once saved
    setSaved(true);
    changed();
  };
  const fileName = state?.lastRead?.name;
  return (
    <Flow gap={24} inset>
      {state?.key ? (
        <TextStack body={`File: ${fileName ?? 'the BELLA library'} · set`} />
      ) : (
        <Flow gap={8}>
          <TextStack title="First, the library's link" />
          <TextStack body="Open the BELLA library in Figma and copy the address from the browser bar." />
          <Input label="Figma link" type="url" value={link} onChange={setLink} placeholder="https://www.figma.com/design/…" error={problem.key || undefined} />
          <Flow direction="row" justify="end">
            <Button variant="secondary" busy={busy === 'key'} disabled={!link.trim()} onClick={saveKey}>
              Save link
            </Button>
          </Flow>
        </Flow>
      )}
      <Flow gap={8}>
        <TextStack title="1 · Make a token in Figma" />
        <Flow as="ol" gap={4} bullets aria-label="Where to make the token">
          <li>Open Settings, then Security.</li>
          <li>Under Personal access tokens, choose Generate new token.</li>
          <li>Tick only “File content: read-only”, then copy the token.</li>
        </Flow>
      </Flow>
      <Flow gap={8}>
        <TextStack title="2 · Paste it here" />
        <Input label="Figma token" type="password" value={token} onChange={setToken} name="figma-token" error={problem.token || undefined} hint={state?.token ? 'A token is saved. Paste a new one to replace it.' : undefined} />
        <Flow direction="row" justify="end">
          <Button variant="secondary" busy={busy === 'token'} disabled={!token.trim()} onClick={saveToken}>
            Save token
          </Button>
        </Flow>
        {saved ? <TextStack body="Saved. It is kept on this Mac in CHIP's settings, never shown again." /> : null}
      </Flow>
      <Flow gap={8}>
        <TextStack title="3 · Test it" />
        <TextStack body="CHIP reads the BELLA file's name from Figma to check the token works." />
        <Flow direction="row" justify="end">
          <Button variant="primary" busy={busy === 'test'} disabled={!state?.key || !state?.token} onClick={test}>
            Test it
          </Button>
        </Flow>
        {said ? <TextStack body={`${said.ok ? '✓' : '✗'} ${said.text}`} /> : null}
      </Flow>
    </Flow>
  );
}
