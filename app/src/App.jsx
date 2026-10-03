import React, { useEffect, useRef, useState } from 'react';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import NavList from '@bella/components/NavList/NavList';
import Input from '@bella/components/Input/Input';
import Kbd from '@bella/components/Kbd/Kbd';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Health from './Health.jsx';
import Ask from './Ask.jsx';
import Specimen from './Specimen.jsx';
import Terminal from './Terminal.jsx';
import { useTheme } from './theme.js';

const WORKSPACES = [
  { id: 'health', label: 'Health' },
  { id: 'ask', label: 'Ask' },
  { id: 'specimen', label: 'Specimen' },
  { id: 'terminal', label: 'Terminal' },
];

const SECTIONS = {
  health: [
    { href: '#overview', label: 'Overview' },
    { href: '#readiness', label: 'Readiness map' },
    { href: '#components', label: 'Components' },
  ],
  ask: [
    { href: '#ask-form', label: 'New question' },
    { href: '#answers', label: 'This session' },
  ],
  terminal: [{ href: '#main', label: 'Commands' }],
};

const WS_KEYS = { Digit1: 'health', Digit2: 'ask', Digit3: 'specimen', Digit4: 'terminal' };

function failuresOf(bella) {
  const out = [];
  for (const c of bella?.components ?? []) {
    if (!c.hasStory) out.push(`${c.name}: no story`);
    if (!c.hasDocs) out.push(`${c.name}: no docs description`);
    if (c.health?.contract?.status === 'fail') out.push(`${c.name}: contract ${c.health.contract.issues.join('; ')}`);
    if (c.health?.contrast?.status === 'fail') out.push(`${c.name}: contrast ${c.health.contrast.failing.join('; ')}`);
  }
  return out;
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [ws, setWs] = useState('health');
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [specimenId, setSpecimenId] = useState('button');
  const [bella, setBella] = useState(null);
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const searchId = 'chip-search';
  const panelRef = useRef(null);

  useEffect(() => {
    fetch('/data/bella.json').then((r) => r.json()).then(setBella).catch(() => setOffline(true));
    fetch('/health').then((r) => r.json()).then(setHealth).catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById(searchId)?.focus();
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (e.altKey && WS_KEYS[e.code]) {
        e.preventDefault();
        setWs(WS_KEYS[e.code]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submitSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setWs('ask');
    setPending({ q, at: Date.now() });
    setQuery('');
  }

  const failures = failuresOf(bella);
  const specimen = bella?.components.find((c) => c.id === specimenId) ?? null;
  const sections =
    ws === 'specimen'
      ? (bella?.components ?? []).map((c) => ({
          href: `#specimen-${c.id}`,
          label: c.name,
          badge: c.parts.length ? c.parts.length : undefined,
          current: c.id === specimenId,
        }))
      : SECTIONS[ws].map((s) => ({
          ...s,
          badge: s.href === '#components' && bella ? failures.length : undefined,
        }));

  function askAbout(name) {
    setPrefill({ text: `What does BELLA's ${name} contract say, and how is ${name} built? Cite your sources.`, at: Date.now() });
    setWs('ask');
  }

  return (
    <div className="shell" data-nav-collapsed={collapsed || undefined}>
      <a className="skip" href="#main">Skip to workspace</a>

      <header className="topbar">
        <p className="brand">CHIP</p>
        <Tabs tabs={WORKSPACES} value={ws} onChange={setWs} label="Workspaces" idBase="ws" className="ws-tabs" />
        <form className="search" role="search" onSubmit={submitSearch}>
          <Input
            id={searchId}
            label={
              <span className="search-label">
                Ask or search your sources <Kbd keys={['⌘', 'K']} label="Command K" />
              </span>
            }
            value={query}
            onChange={setQuery}
            placeholder="Which BELLA components have no story?"
            autoComplete="off"
          />
        </form>
        <div className="topbar-meta">
          {health ? <StatusPill variant="success">{health.model}</StatusPill> : null}
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <NavList
            label="Sections"
            groups={[{ label: ws === 'specimen' ? 'Components' : WORKSPACES.find((w) => w.id === ws).label, items: sections }]}
            onNavigate={
              ws === 'specimen'
                ? (href, e) => {
                    e.preventDefault();
                    setSpecimenId(href.replace('#specimen-', ''));
                  }
                : undefined
            }
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            footer={
              bella ? (
                <p className="source-line">
                  BELLA {bella.source.version} @ {bella.source.commit}
                  {health ? ` · ${health.chunks.toLocaleString('en')} chunks indexed` : ''}
                </p>
              ) : null
            }
          />
        </aside>

        <main id="main" className="main" ref={panelRef} tabIndex={-1}>
          {offline ? (
            <p className="offline" role="alert">
              The CHIP server is not answering on 127.0.0.1:3000. Start it with npm start.
            </p>
          ) : null}
          <div {...tabPanelProps('ws', 'health', ws === 'health')}>
            <Health bella={bella} health={health} failures={failures} />
          </div>
          <div {...tabPanelProps('ws', 'ask', ws === 'ask')}>
            <Ask pending={pending} prefill={prefill} />
          </div>
          <div {...tabPanelProps('ws', 'specimen', ws === 'specimen')}>
            {ws === 'specimen' ? <Specimen c={specimen} onAsk={askAbout} bella={bella} theme={theme} /> : null}
          </div>
          <div {...tabPanelProps('ws', 'terminal', ws === 'terminal')}>
            <Terminal />
          </div>
        </main>
      </div>
    </div>
  );
}
