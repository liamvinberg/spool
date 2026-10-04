import { ui } from "spool";
import { PeoplePage } from "shared/ui/explore/cloud/team/where/people-page";

export default function Frame() {
	return <PeoplePage state="invite" go={{ base: () => ui.go("explore/cloud/team/where/people-page") }} />;
}
