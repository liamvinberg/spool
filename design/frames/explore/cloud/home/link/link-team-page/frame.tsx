import { ui } from "spool";
import { LinkTeamPage } from "shared/ui/explore/cloud/home/team-home";

export default function Frame() {
	return <LinkTeamPage onOpen={() => ui.go("app/spool-canvas")} />;
}
