import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * `door-head` with `Button` held inside `checkout` on the booking page
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * Same door: the origin line under the crumb is a button to the library page,
 * the `library` row lights above the hairline, the rail dots what renders it.
 */
export default function DoorHeadHeldFrame() {
	return <DoorCanvas where="head" start="booking" />;
}
