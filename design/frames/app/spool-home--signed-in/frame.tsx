import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function SignedIn() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={
				<AccountFoot
					account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }}
					menu
				/>
			}
		/>
	);
}
