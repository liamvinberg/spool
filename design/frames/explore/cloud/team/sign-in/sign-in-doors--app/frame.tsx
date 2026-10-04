import { ui } from "spool";
import { SignInDoors } from "shared/ui/explore/cloud/team/auth/sign-in-doors";

export default function Frame() {
	return <SignInDoors state="app" links={{ page: () => ui.go("explore/cloud/team/sign-in/sign-in-doors") }} />;
}
