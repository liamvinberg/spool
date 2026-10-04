import { ui } from "spool";
import { PeopleSheet } from "shared/ui/explore/cloud/team/where/people-sheet";

export default function Frame() {
	return <PeopleSheet state="role" go={{ base: () => ui.go("explore/cloud/team/where/people-sheet") }} />;
}
