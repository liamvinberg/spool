import { ui } from "spool";
import { SignInEmailFirst } from "shared/ui/explore/cloud/team/auth/sign-in-email-first";

export default function Frame() {
	return <SignInEmailFirst state="passkey" links={{ done: () => ui.go("explore/cloud/team/sign-in/sign-in-email-first--done") }} />;
}
