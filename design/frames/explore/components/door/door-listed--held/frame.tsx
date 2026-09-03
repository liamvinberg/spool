import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * `door-listed` with `Button` held inside `checkout` on the booking page
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The reach rings the same button in the other frames on screen, the rail dots
 * every frame that renders it, and the `library` row lights the way the finder
 * lights an owning page. Under the crumb, the origin line the shipped rail
 * already says is a button: press it and you are on the library page with
 * `Button` held. `Esc` brings you back.
 */
export default function DoorListedHeldFrame() {
	return <DoorCanvas where="listed" start="booking" />;
}
