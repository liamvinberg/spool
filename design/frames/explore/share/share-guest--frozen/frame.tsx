import { GuestView } from "shared/ui/explore/share/guest-view";

/** The other side of the fork: the link kept the moment it was sent, and says so. */
export default function ShareGuestFrozenFrame() {
	return <GuestView mode="frozen" />;
}
