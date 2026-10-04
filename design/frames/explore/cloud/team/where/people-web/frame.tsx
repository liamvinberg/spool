import { ui } from "spool";
import { PeopleWeb } from "shared/ui/explore/cloud/team/where/people-web";

export default function Frame() {
	return <PeopleWeb state="base" go={{ role: () => ui.go("explore/cloud/team/where/people-web--role"), invite: () => ui.go("explore/cloud/team/where/people-web--invite"), leave: () => ui.go("explore/cloud/team/where/people-web--leave"), settings: () => ui.go("explore/cloud/team/where/people-web--settings") }} />;
}
