import { ui } from "spool";
import { PeopleSheet } from "shared/ui/explore/cloud/team/where/people-sheet";

export default function Frame() {
	return <PeopleSheet state="base" go={{ role: () => ui.go("explore/cloud/team/where/people-sheet--role"), invite: () => ui.go("explore/cloud/team/where/people-sheet--invite"), leave: () => ui.go("explore/cloud/team/where/people-sheet--leave"), settings: () => ui.go("explore/cloud/team/where/people-sheet--settings") }} />;
}
