import { IdentityCanvas } from "shared/ui/explore/identity/docked";

/** docked, dark: one inspector switched from its own header; help and settings beside the zoom. */
export default function IdentityDockedFrame() {
	return <IdentityCanvas appearance="dark" panel="properties" />;
}
