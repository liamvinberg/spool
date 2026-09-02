import { SharedScreen } from "shared/ui/spool-shared-screen";

/**
 * Figma's answer, drawn so it can be judged rather than argued: shared gets its
 * own colour. The ring, the handles, the crumb segment and the file line all
 * turn pink wherever a shared element is pointed at, and that colour is the
 * whole message — the write says nothing more.
 *
 * The cost is on the frame: `tokens.css` opens by saying there is exactly one
 * accent, the cadmium-red thread. This take spends a second one, as a literal
 * in the screen rather than a token, because the token file will not hold it.
 *
 * Orange was tried first and lost. Against cadmium red it reads as a shade of
 * the thread rather than a second signal, and the pay button is the case that
 * proves it: a warm ring on a warm fill disappears. Pink survives that fill and
 * still has to be learnt.
 */
export default function SharedTintFrame() {
	return <SharedScreen take="tint" />;
}
