import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * Take three: the name goes thread ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The held frame's label above the canvas is thread red; so is the crumb's last
 * step and the ring. The library row joins them: face and name in thread, no
 * fill, no dot. Louder than the dot, and it borrows the colour the held frame's
 * own row does not get, which is the argument against it.
 */
export default function LitNameFrame() {
	return <DoorCanvas where="foot" start="booking" litAs="name" />;
}
