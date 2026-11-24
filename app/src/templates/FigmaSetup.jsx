// Connect Figma, in the one set up template (templates/SetupSteps.jsx; Elleta, 22 Nov: "fix this so i can set it up";
// 23 Nov: "we set up the figma rest yesterday so it should show as done no?? hidden key"). One form used by the
// Connectors "Set up Figma" drawer and the Components "Add file key" drawer, so there is one way in.
// Not set up: four numbered steps with a picture each (the library's link; make a read-only token; paste it; Test it).
// Set up and the last test passed: the Connected state, the key as dots, the steps folded behind one click.
// The token goes to server/.env and is never shown again, logged, or put in an address.
import { useCallback, useEffect, useState } from 'react';
import Flow from './Flow.jsx';
import { Connected, OpenPage, PasteField, SetupList, SetupPicture, SetupStep, TestIt, clock, day } from './SetupSteps.jsx';

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
};

/** What is set up: { key, token, lastRead, tokenSavedAt } from GET /figma-key, read again when something is saved. */
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
  const [failed, setFailed] = useState(null);
  const changed = () => (read(), onChanged?.());
  const saveKey = async (link) => {
    const r = await post('/figma-key', { link });
    changed();
    return r;
  };
  const saveToken = async (token) => {
    const r = await post('/figma-token', { token });
    if (r.ok) setFailed(null);
    changed();
    return r;
  };
  const run = async () => {
    const r = await post('/figma-test');
    const ok = Boolean(r.ok);
    setFailed(ok ? null : { ok: false, text: r.says ?? 'CHIP could not test it.' });
    changed();
    return { ok, text: ok ? `${r.says} · read ${clock(r.at ?? new Date().toISOString())}` : r.says ?? 'CHIP could not test it.' };
  };
  if (!state) return null;
  const fileName = state.lastRead?.name;
  const connected = state.key && state.token && state.lastRead && !failed;
  const steps = (
    <SetupList label="Set up Figma">
      <SetupStep
        n={1}
        title="The library’s link"
        body="Open the BELLA library in Figma and copy the address from the browser bar."
        done={state.key}
        picture={state.key ? undefined : <SetupPicture where="The BELLA library in Figma" target="Address bar" tags={['figma.com/design/…']} />}
      >
        {state.key ? null : <PasteField label="Figma link" type="url" placeholder="https://www.figma.com/design/…" saveLabel="Save link" onSave={saveKey} />}
      </SetupStep>
      <SetupStep n={2} title="Make a read-only token" body="Open Settings, then Security. Under Personal access tokens choose Generate new token, tick only “File content: read-only”, and copy it." picture={<SetupPicture where="Figma settings, Security" target="Generate new token" tags={['Read-only']} />}>
        <OpenPage label="Open Figma settings" href="https://www.figma.com/settings" />
      </SetupStep>
      <SetupStep n={3} title="Paste it here" body="CHIP keeps it on this Mac in its settings and never shows it again." done={state.token}>
        <PasteField label="Figma token" type="password" name="figma-token" saveLabel="Save token" hint={state.token ? 'A token is saved. Paste a new one to replace it.' : undefined} onSave={saveToken} savedWords="Saved. It is kept on this Mac in CHIP’s settings, never shown again." />
      </SetupStep>
      <SetupStep n={4} title="Test it" body="CHIP reads the BELLA file’s name from Figma to check the token works.">
        <TestIt run={run} last={failed} disabled={!state.key || !state.token} />
      </SetupStep>
    </SetupList>
  );
  if (!connected) return <Flow gap={16} inset>{steps}</Flow>;
  const saved = state.tokenSavedAt ? `token saved ${day(state.tokenSavedAt)}` : 'token saved on this Mac';
  return (
    <Flow gap={16} inset>
      <Connected
        name="Figma"
        facts={[saved, `last test ${day(state.lastRead.at)} ${clock(state.lastRead.at)}: connected to ${fileName}`]}
        secret="Figma token"
        steps={steps}
      >
        <TestIt run={run} />
      </Connected>
    </Flow>
  );
}
