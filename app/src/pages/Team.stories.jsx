// CHIP / Pages / Team: Figma's drawn states (CHIP Dashboard 612:82090) plus
// empty, loading and error, for CHIP's own Storybook (locked to the Chip
// theme). Ready for when code-track sets it up; not wired anywhere yet.
// Data: teamFixture.js (FIXTURE, Figma's example copy).
import Screen from '../templates/Screen.jsx';
import TeamContent from './TeamContent.jsx';
import { TEAM_STATES } from './teamFixture.js';

export default {
  title: 'CHIP / Pages / Team',
  component: TeamContent,
  parameters: { layout: 'fullscreen', theme: 'chip-light' },
  render: (args) => (
    <Screen place="team" header={{ title: 'Team' }}>
      <TeamContent {...args} />
    </Screen>
  ),
};

export const Default = { args: TEAM_STATES.default };
export const Draft = { args: TEAM_STATES.draft };
export const Sent = { args: TEAM_STATES.sent };
export const AgentQuiet = { args: TEAM_STATES['agent quiet'] };
export const Empty = { args: TEAM_STATES.empty };
export const Loading = { args: TEAM_STATES.loading };
export const Error = { args: TEAM_STATES.error };
