import { ui } from "spool";
import { TeamHome } from "shared/ui/explore/cloud/team-home";

export default function Frame() {
	return (
		<TeamHome
			take="same"
			host="web"
			onOpen={() => ui.go("app/spool-canvas")}
			onInvite={() => ui.go("explore/cloud/home/home-same--invite")}
		/>
	);
}
