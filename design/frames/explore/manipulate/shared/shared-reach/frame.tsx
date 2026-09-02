import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * The mark is the blast radius, drawn where it lands: point at a shared element
 * and the same element rings in every other frame on screen that renders it.
 * You do not read a count, you watch two other frames answer, and the edit
 * arrives in all of them live.
 *
 * This is the one take no other tool can copy: it needs frames side by side on
 * a field, which is the thing spool has and an inspector does not.
 *
 * Its cost is honesty about the ones you cannot see. Nine frames render this
 * button; two are on screen. The rail says both numbers, because the drawing
 * alone would quietly claim the reach ends at the viewport.
 */
export default function SharedReachFrame() {
	return <SharedScreen take="reach" />;
}
