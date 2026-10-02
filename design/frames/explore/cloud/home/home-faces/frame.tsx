import { ui } from "spool";
import { TeamHome } from "shared/ui/explore/cloud/home/team-home";

export default function Frame() {
	return (
		<TeamHome
			take="faces"
			state="app"
			onOpen={() => ui.go("explore/cloud/home/home-faces--invite")}
			onInvite={() => ui.go("explore/cloud/home/home-faces--invite")}
		/>
	);
}
