import { ui } from "spool";
import { SignInDoors } from "shared/ui/explore/cloud/team/auth/sign-in-doors";

export default function Frame() {
	return <SignInDoors state="code" links={{ passkey: () => ui.go("explore/cloud/team/sign-in/sign-in-doors--passkey"), page: () => ui.go("explore/cloud/team/sign-in/sign-in-doors") }} />;
}
