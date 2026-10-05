import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function SigningIn() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={<AccountFoot account={{ state: "signing-in" }} onReopen={() => ui.go("app/spool-home--signed-in")} />}
		/>
	);
}
