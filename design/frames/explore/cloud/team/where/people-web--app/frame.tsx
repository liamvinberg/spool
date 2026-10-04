import { ui } from "spool";
import { PeopleWeb } from "shared/ui/explore/cloud/team/where/people-web";

export default function Frame() {
	return <PeopleWeb state="app" go={{ base: () => ui.go("explore/cloud/team/where/people-web") }} />;
}
