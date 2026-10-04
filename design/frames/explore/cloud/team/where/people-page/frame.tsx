import { ui } from "spool";
import { PeoplePage } from "shared/ui/explore/cloud/team/where/people-page";

export default function Frame() {
	return <PeoplePage state="base" go={{ role: () => ui.go("explore/cloud/team/where/people-page--role"), invite: () => ui.go("explore/cloud/team/where/people-page--invite"), leave: () => ui.go("explore/cloud/team/where/people-page--leave"), settings: () => ui.go("explore/cloud/team/where/people-page--settings") }} />;
}
