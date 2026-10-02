import { ui } from "spool";
import { TeamHome } from "shared/ui/explore/cloud/home/team-home";

export default function Frame() {
	return (
		<TeamHome
			take="now"
			state="invite"
			onOpen={() => ui.go("app/spool-canvas")}
			onInvite={() => ui.go("explore/cloud/home/home-now--invite")}
		/>
	);
}
