import { GuestView } from "shared/ui/explore/share/guest-view";

/**
 * The colleague's side. A tab, the prototype, and one bar saying who sent it
 * and that it is still moving. Press the phone's own button to walk the flow.
 */
export default function ShareGuestFrame() {
	return <GuestView mode="live" />;
}
