import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * The mark is a second line, not a second colour: the thread ring keeps its
 * weight and gains a faint hairline just outside it, on hover and on selection.
 * One accent survives, which is what `tokens.css` asks for.
 *
 * The write is the moment it speaks: the outer line pulses once as the value
 * lands and then holds. Nothing is said twice.
 *
 * The count names the export, so this take is asking `framesUsing` to index
 * finer than the file it indexes today.
 */
export default function SharedRingFrame() {
	return <SharedScreen take="ring" />;
}
