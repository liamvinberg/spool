import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * Reach, but on a click. Hover rings the element under the cursor and nothing
 * else; select it and the same element rings in every other frame on screen.
 * The rings hold while it is selected, so an edit lands inside them.
 *
 * The argument against `shared-reach` is arithmetic: 68% of what a cursor
 * crosses on a real project is shared. A hover that answers in every other
 * frame makes the field flicker in the periphery wherever the cursor goes, and
 * a mark that fires on most hovers is the canvas's weather rather than a
 * signal. The `same element` caption goes with it: the ring lands on the same
 * button in the same place, and the eye matches shape faster than it reads.
 */
export default function SharedSelectFrame() {
	return <SharedScreen take="select" />;
}
