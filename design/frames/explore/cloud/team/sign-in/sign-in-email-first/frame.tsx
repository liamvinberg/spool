import { ui } from "spool";
import { SignInEmailFirst } from "shared/ui/explore/cloud/team/auth/sign-in-email-first";

export default function Frame() {
	return <SignInEmailFirst links={{ passkey: () => ui.go("explore/cloud/team/sign-in/sign-in-email-first--passkey"), code: () => ui.go("explore/cloud/team/sign-in/sign-in-email-first--code") }} />;
}
