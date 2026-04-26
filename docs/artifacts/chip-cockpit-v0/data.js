// data.js — extracted during Stage 6 split
// Loads before app.js. Vars become globals; app.js IIFE reads them by reference.

// ---- Audit ribbon constants ----
var AUDIT_DRIFT              = '2026-04-26 13:49 · Cross-platform parity drift detected · Landscape mode · Observing.';
var AUDIT_INCLUSION_OVERRIDE = '2026-04-26 13:51 · Inclusion override · 3 issues acknowledged · Operator: Elleta';
var AUDIT_APPROVED           = '2026-04-26 14:03 · Roadmap approved (Trust: Junior) · 23 Jira tickets filed · 3 dev leads notified · auto-merge withheld';

// ---- System map node data (7 nodes) ----
var NODE_DATA = {
  web: { title: 'WEB · react-bella-web v2.14.3', rows: [
    ['Squad', 'Web Lead + 3 engineers'],
    ['Last commit', '14m ago · main · CI passing'],
    ['Components', '47 / 47 landscape ready'],
    ['Storybook', '89 stories · 95% coverage'],
    ['Figma sync', 'In sync · pulled 14m ago'],
    ['Drift', 'None'],
    ['Tickets', '0 open · 12 closed this sprint']
  ] },
  ios: { title: 'iOS · bella-ios v1.8.0', rows: [
    ['Squad', 'iOS Lead + 2 engineers'],
    ['Last commit', '2d ago · main · CI passing'],
    ['Components', '23 / 47 landscape — partial'],
    ['Storybook', '24 stories'],
    ['Figma sync', 'Drift · 23 components behind'],
    ['Drift', 'Detected — landscape variant'],
    ['Tickets', '11 open · awaiting prioritization']
  ] },
  android: { title: 'ANDROID · bella-android v1.4.2', rows: [
    ['Squad', 'Android Lead + 2 engineers'],
    ['Last commit', '6d ago · main · CI passing'],
    ['Components', '0 / 47 landscape — critical'],
    ['Storybook', '12 stories partial'],
    ['Figma sync', 'Drift · 47 components behind'],
    ['Drift', 'Critical — landscape rollout not started'],
    ['Tickets', '8 open · roadmap blocked']
  ] },
  figma: { title: 'FIGMA · BELLA · master', rows: [
    ['Role', 'Source-of-truth'],
    ['Component sets', '47'],
    ['Last edit', '14m ago · Elleta'],
    ['Token sync', 'Tokens Studio v2.11.5 Pro'],
    ['Branches', 'master clean · 0 open branches'],
    ['Variables', '83 primitives · 29 semantic · 103 component']
  ] },
  storybook: { title: 'STORYBOOK · bella.storybook.io', rows: [
    ['Stories Web', '89 · 95% coverage'],
    ['Stories iOS', '24 · partial'],
    ['Stories Android', '12 · partial'],
    ['Deploy', 'Auto-deployed on merge'],
    ['Last deploy', '2h ago · main'],
    ['Visual regression', 'Chromatic · 4 baselines pending']
  ] },
  jira: { title: 'JIRA · BELLA project', rows: [
    ['Awaiting triage', '3 tickets'],
    ['In flight', '17 tickets'],
    ['Closed this quarter', '89'],
    ['Velocity', '~12 / week (last 4 weeks)'],
    ['Blocked', '2 — awaiting design approval'],
    ['Cross-platform tickets', '23 — landscape rollout']
  ] },
  docs: { title: 'DOCS · bella.zeroheight.io', rows: [
    ['Status', 'Stale · 6 days'],
    ['Pages needing update', '23 — post-landscape'],
    ['Last publish', '6 days ago'],
    ['Auto-sync', 'Disabled · manual'],
    ['Owner', 'Web Lead (delegated)'],
    ['Coverage', '67% · 23 component pages outdated']
  ] }
};

// ---- Components matrix data (12 components) ----
var COMPONENT_DATA = {
  button: { title: 'BUTTON · Primary action component', rows: [
    ['Type', 'Action'],
    ['Variants', 'primary · secondary · ghost'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.0'],
    ['Used in', 'Login splash · Approve row · Demo triggers · Friction entries · Compose drafts'],
    ['Defined in', 'figma://BELLA/Button · github.com/elleta/react-bella-web/Button · github.com/elleta/bella-ios/Button · github.com/elleta/bella-android/Button'],
    ['Last update', '14m ago · landscape variant added (Web only)'],
    ['Open issues', '3 — Android landscape missing · iOS landscape partial']
  ] },
  card: { title: 'CARD · Surface container', rows: [
    ['Type', 'Surface'],
    ['Variants', 'default · elevated · glass · featured · inverse'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.0'],
    ['Used in', 'Cockpit space · Friction entries · BELLA primitives · Steward rituals'],
    ['Defined in', 'figma://BELLA/Card · github.com/elleta/react-bella-web/Card · github.com/elleta/bella-ios/Card · github.com/elleta/bella-android/Card'],
    ['Last update', '2d ago · landscape elevation tokens (Web only)'],
    ['Open issues', '2 — Android landscape elevations missing']
  ] },
  input: { title: 'INPUT · Text entry', rows: [
    ['Type', 'Form'],
    ['Variants', 'default · search'],
    ['Versions', 'Web 2.14.3 · iOS 1.7.2 · Android — missing'],
    ['Used in', 'Friction compose · Search bars · Settings'],
    ['Defined in', 'figma://BELLA/Input · github.com/elleta/react-bella-web/Input · github.com/elleta/bella-ios/Input'],
    ['Last update', '6d ago · landscape preview pending'],
    ['Open issues', '5 — Android port not started, iOS landscape partial']
  ] },
  chip: { title: 'CHIP · Inline tag', rows: [
    ['Type', 'Identity'],
    ['Variants', 'info · accent · muted · success · dusk'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.2'],
    ['Used in', 'Surfaces shelf · Approve row · Friction meta · Steward · System map'],
    ['Defined in', 'figma://BELLA/Chip · github.com/elleta/react-bella-web/Chip · github.com/elleta/bella-ios/Chip · github.com/elleta/bella-android/Chip'],
    ['Last update', '14m ago · saturation bumped to 35% (all platforms)'],
    ['Open issues', '0']
  ] },
  eyebrow: { title: 'EYEBROW · Section label', rows: [
    ['Type', 'Identity'],
    ['Variants', 'accent · muted'],
    ['Versions', 'Web 2.14.3 · iOS 1.7.5 · Android 1.4.0'],
    ['Used in', 'Cockpit headers · Card headers · Sidebar sections · Audit ribbon'],
    ['Defined in', 'figma://BELLA/Eyebrow · github.com/elleta/react-bella-web/Eyebrow · github.com/elleta/bella-ios/Eyebrow · github.com/elleta/bella-android/Eyebrow'],
    ['Last update', '2d ago · sentence case migration (all platforms)'],
    ['Open issues', '2 — iOS spacing token drift, Android letter-spacing']
  ] },
  navLink: { title: 'NAV LINK · Top-level navigation', rows: [
    ['Type', 'Action'],
    ['Variants', 'default · active'],
    ['Versions', 'Web 2.14.3 · iOS 1.7.2 · Android — missing'],
    ['Used in', 'Sidebar · Topbar crumb · Footer'],
    ['Defined in', 'figma://BELLA/Nav-link · github.com/elleta/react-bella-web/NavLink · github.com/elleta/bella-ios/NavLink'],
    ['Last update', '7d ago'],
    ['Open issues', '4 — Android port not started, iOS active-state amber missing']
  ] },
  modal: { title: 'MODAL · Blocking dialog', rows: [
    ['Type', 'Surface'],
    ['Variants', 'default'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.0'],
    ['Used in', 'Approve confirmations · Settings dialogs · Onboarding sheets'],
    ['Defined in', 'figma://BELLA/Modal · github.com/elleta/react-bella-web/Modal · github.com/elleta/bella-ios/Modal · github.com/elleta/bella-android/Modal'],
    ['Last update', '3d ago · backdrop blur token (all platforms)'],
    ['Open issues', '1 — Android landscape backdrop sizing']
  ] },
  avatar: { title: 'AVATAR · Identity badge', rows: [
    ['Type', 'Identity'],
    ['Variants', 'initials · image · placeholder'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.2'],
    ['Used in', 'Topbar · Splash · Friction meta'],
    ['Defined in', 'figma://BELLA/Avatar · github.com/elleta/react-bella-web/Avatar · github.com/elleta/bella-ios/Avatar · github.com/elleta/bella-android/Avatar'],
    ['Last update', '14m ago · landscape proportions verified'],
    ['Open issues', '0']
  ] },
  badge: { title: 'BADGE · Numeric indicator', rows: [
    ['Type', 'Identity'],
    ['Variants', 'count · dot · alert'],
    ['Versions', 'Web 2.14.3 · iOS 1.8.0 · Android 1.4.0'],
    ['Used in', 'Sidebar chips · Topbar notifications · Friction meta'],
    ['Defined in', 'figma://BELLA/Badge · github.com/elleta/react-bella-web/Badge · github.com/elleta/bella-ios/Badge · github.com/elleta/bella-android/Badge'],
    ['Last update', '5d ago · saturation bumped to 35%'],
    ['Open issues', '2 — Android landscape positioning']
  ] },
  aiCard: { title: 'AI CARD · Agentic proposal surface', rows: [
    ['Type', 'Surface · agentic'],
    ['Variants', 'proposal · resolved'],
    ['Versions', 'Web 2.14.3 · iOS — not started · Android — not started'],
    ['Used in', 'Cockpit space proposals · Inbox cards (Stage 5)'],
    ['Defined in', 'figma://BELLA/AI-Card · github.com/elleta/react-bella-web/AICard'],
    ['Last update', '14m ago · drafted in cockpit v0'],
    ['Open issues', '6 — iOS + Android primitives not yet started']
  ] },
  aiDiff: { title: 'AI DIFF · Inline change preview', rows: [
    ['Type', 'Diff · agentic'],
    ['Variants', 'collapsed · expanded · resolved'],
    ['Versions', 'Web 2.14.3 · iOS — not started · Android — not started'],
    ['Used in', 'AI Card embeds · Roadmap proposals'],
    ['Defined in', 'figma://BELLA/AI-Diff · github.com/elleta/react-bella-web/AIDiff'],
    ['Last update', '14m ago · cross-platform table variant added'],
    ['Open issues', '6 — mobile diff geometry undefined']
  ] },
  aiMeter: { title: 'AI METER · Drift-state indicator', rows: [
    ['Type', 'Measure · agentic'],
    ['Variants', 'parity · on-spec · velocity'],
    ['Versions', 'Web 2.14.3 · iOS — not started · Android — not started'],
    ['Used in', 'Cockpit space · System map (Stage 6)'],
    ['Defined in', 'figma://BELLA/AI-Meter · github.com/elleta/react-bella-web/AIMeter'],
    ['Last update', '14m ago · drift→approve color flip'],
    ['Open issues', '5 — mobile typography for 72px hero number']
  ] }
};

// ---- Research library data (7 entries) ----
var RESEARCH_DATA = {
  curtis: {
    date: '2026-04-20', author: 'Nathan Curtis',
    title: 'specs-cli — 99.25% Figma compression',
    quote: '"AI belongs downstream of a mechanical spec."',
    meta: [
      ['Published', '2026-04-20'],
      ['Author', 'Nathan Curtis'],
      ['Source', 'EightShapes blog'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-20 · published']
    ],
    connections: ['friedman', 'pandya'],
    summary: "Curtis's specs-cli proves Pandya's three-layer thesis empirically. The 99.25% compression ratio is what 'context engineering' looks like when measured."
  },
  friedman: {
    date: '2026-04-15', author: 'Vitaly Friedman',
    title: 'Five Levels of Context Engineering',
    quote: '"Shared work needs shared context. The right compression of a brief is the brief."',
    meta: [
      ['Published', '2026-04-15'],
      ['Author', 'Vitaly Friedman'],
      ['Source', 'Smashing Magazine'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-16 · workshop notes added']
    ],
    connections: ['curtis', 'frost'],
    summary: 'Friedman frames the operator brief as a compression problem. Curtis ships the empirical proof; Frost names the layer where the brief becomes contract.'
  },
  pandya: {
    date: '2026-04-10', author: 'Hardik Pandya',
    title: 'LLM Design Systems — the three-layer contract',
    quote: '"Spec files, token layer, audit script, sync. Four pieces. One loop."',
    meta: [
      ['Published', '2026-04-10'],
      ['Author', 'Hardik Pandya'],
      ['Source', 'pandya.io'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-12 · case study added']
    ],
    connections: ['curtis', 'pitre'],
    summary: 'Pandya names the structure: spec → tokens → audit → sync. Curtis empirically proves the spec layer; Pitre proves the token layer.'
  },
  frost: {
    date: '2026-04-05', author: 'Brad Frost',
    title: 'Atomic agentic systems',
    quote: '"The system is not the components. The system is the rules that govern the components."',
    meta: [
      ['Published', '2026-04-05'],
      ['Author', 'Brad Frost'],
      ['Source', 'bradfrost.com'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-08 · agentic addendum']
    ],
    connections: ['kavcic', 'friedman'],
    summary: 'Frost extends atomic design into the agent era: the rules are the system. Kavčič calls them operating principles; Friedman calls them context.'
  },
  kavcic: {
    date: '2026-03-25', author: 'Romina Kavčič',
    title: 'Design systems as infrastructure',
    quote: '"Operating principles first, components later. The principles are the product."',
    meta: [
      ['Published', '2026-03-25'],
      ['Author', 'Romina Kavčič'],
      ['Source', 'rkavcic.substack'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-02 · permission model expanded']
    ],
    connections: ['frost', 'cianfrani'],
    summary: 'Kavčič positions the system as infrastructure with permission tiers. Frost provides the rules; Cianfrani provides the operator who applies them.'
  },
  cianfrani: {
    date: '2026-03-15', author: 'Mark Cianfrani',
    title: 'Designer as agent-operator',
    quote: '"The operator is the contract. What they approve is the system."',
    meta: [
      ['Published', '2026-03-15'],
      ['Author', 'Mark Cianfrani'],
      ['Source', 'cianfrani.dev'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-18 · workshop iteration']
    ],
    connections: ['pitre', 'kavcic'],
    summary: "Cianfrani's frame: the operator is the contract. Pitre says the contract is in the tokens; Kavčič says the contract is in the principles. CHIP's approve-gate is where they meet."
  },
  pitre: {
    date: '2026-03-04', author: 'TJ Pitre',
    title: 'Tokens as the primary contract',
    quote: '"If the tokens aren\'t right, nothing downstream can be right."',
    meta: [
      ['Published', '2026-03-04'],
      ['Author', 'TJ Pitre'],
      ['Source', 'SmashingConf Amsterdam 2026'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-03-04 · talk recording posted']
    ],
    connections: ['cianfrani', 'pandya'],
    summary: 'Pitre makes tokens the load-bearing artifact. Pandya names the surrounding three-layer scaffold; Cianfrani anoints the operator who approves the layer.'
  },
  appleton: {
    date: '2026-04-22', author: 'Maggie Appleton',
    title: 'LM Sketchbook: Mental models for LLM systems',
    quote: '"Daemons run quietly until summoned."',
    meta: [
      ['Published', '2026-04-22'],
      ['Author', 'Maggie Appleton'],
      ['Source', 'maggieappleton.com'],
      ['Connections', '3 related entries'],
      ['Last update', '2026-04-22 · published']
    ],
    connections: ['friedman', 'frost', 'cianfrani'],
    summary: "Appleton's daemon model is what CHIP's JARVIS greeting embodies — the agent isn't a chatbot waiting for prompts; it's a daemon running in the background, surfacing only when a decision needs the operator. CHIP's audit-trigger pattern is daemon design made concrete."
  },
  campbell: {
    date: '2026-04-18', author: 'Emily Campbell — Shape of AI',
    title: 'AI interaction pattern library',
    quote: '"Patterns let us speak the same language."',
    meta: [
      ['Published', '2026-04-18'],
      ['Author', 'Emily Campbell'],
      ['Source', 'shape-of.ai'],
      ['Connections', '3 related entries'],
      ['Last update', '2026-04-18 · 12 patterns added']
    ],
    connections: ['pandya', 'curtis', 'pitre'],
    summary: "Shape of AI is the vocabulary CHIP's AI-native BELLA primitives extend. AI Card, AI Diff, AI Audit Entry, AI Meter, AI Label, AI Skeleton — all named in Campbell's lineage, all designed to compose into CHIP's approve-gate pattern."
  },
  if_team: {
    date: '2026-04-12', author: 'Projects By IF',
    title: 'Trust Patterns Catalogue',
    quote: '"Trust is built in the small moments."',
    meta: [
      ['Published', '2026-04-12'],
      ['Author', 'Projects By IF'],
      ['Source', 'projectsbyif.com'],
      ['Connections', '2 related entries'],
      ['Last update', '2026-04-12 · catalogue update']
    ],
    connections: ['frost', 'cianfrani'],
    summary: "IF's trust patterns are the direct ancestor of CHIP's Inclusion gate. The override-with-logged-exception pattern (named here, originally surfaced by Dan Donald's Inclusion Plugin) is one of IF's patterns made concrete: don't block, but make the override visible and auditable. Trust as a designed surface."
  },
  wattenberger: {
    date: '2026-04-05', author: 'Amelia Wattenberger',
    title: 'Yay, Embeddings, Math!',
    quote: '"Semantic search is similarity made navigable."',
    meta: [
      ['Published', '2026-04-05'],
      ['Author', 'Amelia Wattenberger'],
      ['Source', 'wattenberger.com'],
      ['Connections', '3 related entries'],
      ['Last update', '2026-04-05 · published']
    ],
    connections: ['friedman', 'pandya', 'curtis'],
    summary: "Wattenberger's piece explains the math behind why Research entries can show connections to each other. CHIP's connected-entries panel is semantic search rendered as UI — pick one voice, the system shows which other voices share its conceptual neighborhood."
  },
  wroblewski: {
    date: '2026-03-28', author: 'Luke Wroblewski',
    title: 'Ask LukeW · Structured AI search interface',
    quote: '"Structured answers beat free-form chat for expertise."',
    meta: [
      ['Published', '2026-03-28'],
      ['Author', 'Luke Wroblewski'],
      ['Source', 'lukew.com/ask'],
      ['Connections', '3 related entries'],
      ['Last update', '2026-03-28 · v2 launched']
    ],
    connections: ['friedman', 'kavcic', 'pitre'],
    summary: "LukeW's Ask shows structured AI output — not free-form chat, but answers shaped by the question's intent. CHIP's diag card is structured AI output for design-system decisions: confidence, proposed fix, platform impact, inclusion check, trust level. Same stance, different domain."
  }
};

// ---- Friction correlation data (6 entries, Stage 8.6) ----
var FRICTION_DATA = {
  sidebar: {
    eyebrow: 'Open · 2026-04-24',
    title: 'The sidebar is too wide — and it just stays open.',
    related: [
      'Cockpit space — sidebar nav rail width',
      'Friction triage ritual (Wed 10:00)',
      'Cowork tool category'
    ],
    rows: [
      ['Status', 'Open · awaiting design review'],
      ['Action', 'Add to Friday review queue'],
      ['Touched', 'Cowork shell · sidebar component']
    ]
  },
  finder: {
    eyebrow: 'Open · 2026-04-24',
    title: '"Show in Finder" is an ejection seat.',
    related: [
      'Cowork tool category',
      'No related Cockpit element'
    ],
    rows: [
      ['Status', 'Open · awaiting design review'],
      ['Action', 'File as Cowork-team feedback'],
      ['Touched', 'Cowork file picker']
    ]
  },
  darkmode: {
    eyebrow: 'Resolved · 2026-04-24',
    title: 'Dark mode had invisible button text.',
    related: [
      'Cockpit theme toggle',
      'Hotfix 2d.5 (commit cdd396d)',
      'BELLA component.dark token PR'
    ],
    rows: [
      ['Status', 'Resolved'],
      ['Resolved by', 'Stage 2d.5 hotfix · 25 component-token overrides'],
      ['Commit', 'cdd396d'],
      ['Upstream PR', 'BELLA component.dark.json (queued)']
    ]
  },
  coparent: {
    eyebrow: 'Open · 2026-04-22',
    title: 'Conversations with my co-parent should render as meetings.',
    related: [
      'Notion category',
      'Private space (locked behind NDA wall)',
      'Calendar MCP integration (v1)'
    ],
    rows: [
      ['Status', 'Open · v1 candidate'],
      ['Action', 'Park until calendar MCP lands'],
      ['Touched', 'Notion · Private space']
    ]
  },
  approval: {
    eyebrow: 'Resolved · 2026-04-18',
    title: 'The four-click approval dance.',
    related: [
      'Cockpit approve flow',
      'Stage 2e single-key approve',
      'A keyboard shortcut'
    ],
    rows: [
      ['Status', 'Resolved'],
      ['Resolved by', 'Stage 2e · single-key approve'],
      ['Shortcut', 'Press A in drift phase'],
      ['Touched', 'Cockpit diag card · approve row']
    ]
  },
  pink: {
    eyebrow: 'Wishlist · 2026-04-15',
    title: 'One day I want it to be pink.',
    related: [
      'CHIP itself',
      'BELLA palette stays for v0'
    ],
    rows: [
      ['Status', 'Wishlist · post-submission'],
      ['Action', 'Park as v1 cosmetic'],
      ['Touched', 'BELLA accent token']
    ]
  }
};
