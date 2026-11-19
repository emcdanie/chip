// Team: the CHIP / Screen template plus its content (CHIP Dashboard, page
// content set 612:82090). The agents, what waits on you, and today's chat.
import Screen from '../templates/Screen.jsx';
import TeamContent, { useTeamData } from './TeamContent.jsx';

export default function Team() {
  const data = useTeamData();
  return (
    <Screen place="team" header={{ title: 'Team' }}>
      <TeamContent data={data} />
    </Screen>
  );
}
