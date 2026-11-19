// Team: the CHIP / Screen template plus its content (CHIP Dashboard, page
// content set 612:82090). The agents, what waits on you, and today's chat.
import Screen from '../templates/Screen.jsx';
import TeamContent, { useTeamData } from './TeamContent.jsx';
import { TEAM_STATES } from './teamFixture.js';

// #/team?state=<name> shows one of Figma's drawn states from the FIXTURE
// (review only, until CHIP's Storybook exists); plain #/team is live data.
export default function Team() {
  const asked = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('state');
  const live = useTeamData();
  const review = asked ? TEAM_STATES[asked] : null;
  return (
    <Screen place="team" header={{ title: 'Team' }}>
      {review ? <TeamContent key={asked} {...review} /> : <TeamContent data={live} />}
    </Screen>
  );
}
