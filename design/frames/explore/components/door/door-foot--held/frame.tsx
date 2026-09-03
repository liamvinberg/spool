import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * `door-foot` with `Button` held inside `checkout` on the booking page
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * Same door: the origin line under the crumb is a button to the library page,
 * the `library` row lights at the foot, the rail dots what renders it.
 */
export default function DoorFootHeldFrame() {
	return <DoorCanvas where="foot" start="booking" />;
}
