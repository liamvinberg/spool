import { ui } from "spool";
import { SignInDoors } from "shared/ui/explore/cloud/team/auth/sign-in-doors";

export default function Frame() {
	return <SignInDoors links={{ passkey: () => ui.go("explore/cloud/team/sign-in/sign-in-doors--passkey"), code: () => ui.go("explore/cloud/team/sign-in/sign-in-doors--code") }} />;
}
