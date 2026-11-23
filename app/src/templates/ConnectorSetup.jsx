// Set up for every connector except Figma's token (templates/FigmaSetup.jsx), in the one template (SetupSteps.jsx).
// The steps are written once here, from the repo's own set up notes (server/SETUP.md for Notion and the local model,
// the map's own words for the Figma desktop paths, the gh and git commands CHIP reads with). A connector that answers
// opens on Connected with its steps folded; one that does not shows the steps open. Not guessed: where a menu name is
// not known it is not written (the Figma Bridge step names the plugin, not a menu path).
import { useEffect, useState } from 'react';
import Flow from './Flow.jsx';
import { Connected, OpenPage, PasteField, SetupList, SetupPicture, SetupStep, TestIt, day } from './SetupSteps.jsx';
import Button from '@bella/components/Button/Button';

const terminal = (repo, command = null) => window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo, command, from: 'Set up' } }));
const OpenTerminal = ({ repo = 'bella' }) => (
  <Flow direction="row" justify="end">
    <Button variant="secondary" size="sm" onClick={() => terminal(repo)}>Open the Terminal</Button>
  </Flow>
);
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { ok: r.ok, ...(await r.json().catch(() => ({}))) };
};

// each step: title, body (one plain line), picture {where, target, tags}, extra(ctx) the button or field
const STEPS = {
  notion: (c) => [
    { title: 'Make an integration', body: 'In Notion, create an Internal integration named CHIP with read access only.', picture: { where: 'notion.so/profile/integrations', target: 'New integration', tags: ['Internal', 'Read content'] }, extra: <OpenPage label="Open Notion integrations" href="https://www.notion.so/profile/integrations" /> },
    {
      title: 'Paste its secret',
      body: 'Copy the secret on the integration’s page. CHIP keeps it on this Mac and never shows it again.',
      picture: { where: 'The integration’s page', target: 'Show secret' },
      extra: <PasteField label="Notion secret" type="password" name="notion-secret" saveLabel="Save secret" onSave={async (token) => { const r = await post('/notion-token', { token }); c.reload(); return r; }} savedWords="Saved. It is kept on this Mac in CHIP’s settings, never shown again." />,
    },
    { title: 'Share the pages you want read', body: 'In Notion open a page, choose the … menu, then Connections, then CHIP. Sharing a parent page shares its children.', picture: { where: 'A Notion page', target: '… › Connections › CHIP' } },
  ],
  figma: () => [
    { title: 'Open Figma and the BELLA file', body: 'The desktop app has to be open on the library.', picture: { where: 'Figma desktop', target: 'BELLA library' } },
    { title: 'Turn on Dev Mode MCP', body: 'In Dev Mode, switch the MCP server on. CHIP answers while it is on.', picture: { where: 'Figma, Dev Mode panel', target: 'Enable MCP server' } },
  ],
  'figma-console': () => [
    { title: 'Open the BELLA file in Figma desktop', body: 'The bridge works on the file that is open.', picture: { where: 'Figma desktop', target: 'BELLA library' } },
    { title: 'Run the Desktop Bridge plugin', body: 'Run the Desktop Bridge plugin from Figma’s plugins and leave it open while CHIP writes.', picture: { where: 'Figma, plugins', target: 'Desktop Bridge' } },
  ],
  ci: () => [
    { title: 'Sign in to GitHub in the Terminal', body: 'CHIP reads CI with the gh command. Type gh auth login and follow it.', picture: { where: 'CHIP Terminal', target: 'gh auth login' }, extra: <OpenTerminal /> },
  ],
  git: () => [{ title: 'Point CHIP at BELLA’s folder', body: 'CHIP reads branches from the folder named BELLA_DIR in its settings (default ~/DEV/bella-parts).', picture: { where: 'CHIP Terminal', target: 'git status' }, extra: <OpenTerminal /> }],
  claude: () => [
    { title: 'Install Claude Code', body: 'CHIP runs it read-only on your plan. After installing, open a new Terminal so the claude command is found.', picture: { where: 'CHIP Terminal', target: 'claude --version' }, extra: <OpenPage label="Open the Claude Code install page" href="https://code.claude.com/docs/en/overview" /> },
  ],
  ollama: () => [
    { title: 'Install and start Ollama', body: 'Install it from ollama.com, then start the app.', picture: { where: 'Menu bar', target: 'Ollama running' }, extra: <OpenPage label="Open ollama.com" href="https://ollama.com" /> },
    { title: 'Pull the two models', body: 'In the Terminal run ollama pull qwen3:8b, then ollama pull nomic-embed-text.', picture: { where: 'CHIP Terminal', target: 'ollama pull qwen3:8b' }, extra: <OpenTerminal /> },
  ],
};
// the page's plain name for each, used for the title and the Connected line
export const PLAIN = { 'figma-rest': 'Figma', figma: 'Figma desktop app', 'figma-console': 'Figma Bridge', notion: 'Notion', ci: 'GitHub CI', git: 'git', claude: 'Claude', ollama: 'Local model' };

/** node: the system map's node; name: its plain name; test(node) -> { ok, text }; reload(): read the map again; last: the last result. */
export default function ConnectorSetup({ node, name, test, reload, last }) {
  // Notion keeps the day its secret was saved (GET /notion-token); the others have no secret of CHIP's own
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (node.id !== 'notion') return;
    fetch('/notion-token').then((r) => r.json()).then((d) => setSaved(d.savedAt ? `secret saved ${day(d.savedAt)}` : 'secret saved on this Mac')).catch(() => {});
  }, [node.id, node.state]);
  const build = STEPS[node.id];
  if (!build) return null;
  const list = build({ reload });
  const n = list.length + 1;
  const steps = (
    <SetupList label={`Set up ${name}`}>
      {list.map((s, i) => (
        <SetupStep key={s.title} n={i + 1} title={s.title} body={s.body} picture={s.picture ? <SetupPicture {...s.picture} n={i + 1} /> : undefined}>
          {s.extra}
        </SetupStep>
      ))}
      <SetupStep n={n} title="Test it" body="CHIP asks it and says what came back, in words.">
        <TestIt run={() => test(node)} last={last} />
      </SetupStep>
    </SetupList>
  );
  if (node.state !== 'ok') return <Flow gap={16} inset>{steps}</Flow>;
  return (
    <Flow gap={16} inset>
      <Connected name={name} facts={[saved, node.detail ? node.detail.split(/(?<=\.)\s/)[0] : null]} steps={steps} stepsLabel="Replace it or see the setup steps">
        <TestIt run={() => test(node)} last={last} />
      </Connected>
    </Flow>
  );
}
