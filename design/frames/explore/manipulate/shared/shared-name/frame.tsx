import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * `shared-rail`, with the cursor's half filled in. Hover a shared element and
 * its export name stands over the hover ring, `Button`, in the one accent. A
 * local element gets no label: the crumb already holds its name, and a hover
 * that says `div` says nothing.
 *
 * The name is the component mark Figma spends a colour on. Here it is a word,
 * because a colour that is on for 68% of hovers is wallpaper and a name is
 * read once and then known.
 *
 * This is the take that stands in the shipped properties rail rather than
 * the stub the other seven use, so the mark is judged in the panel it will
 * actually live in. The rail's `shared-definition` refusal is off, per the
 * ticket; the origin line takes its place under the crumb.
 */
export default function SharedNameFrame() {
	return <SharedScreen take="name" />;
}
