import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--ride — the loader stops being a second object and becomes the word's
 * underline.
 *
 * **The objection to `under` is that the rail ends up with two things meaning the same
 * thing.** A hairline winding across the top of the composer and a word nine pixels above
 * it both say *working*, and only one of them says which kind. This take refuses to add
 * anything: the stroke comes off the border entirely and is laid under the word instead,
 * running the same track it always ran.
 *
 * **The keyframes are untouched.** `agent-wind.css` is `src/ui/ui.css` copied byte for
 * byte, 1600ms linear, a thread laid out of the left edge, carried at its full length, and
 * taken up into the right. What changes is only how far it has to go. The shipped stroke
 * prices itself honestly in its own doc — "420px of peripheral travel every 1.6s at
 * 0.26px/ms, the largest moving thing in the rail" — and under a seven-letter mono word
 * that is about 58px, so the same gesture costs roughly a seventh of the distance. It was
 * worth 420px when it was the whole indicator. It is not obviously worth 420px once a word
 * is there anyway.
 *
 * **What it wins.** One object. The thing you look at to find out *what* is the same thing
 * telling you it is still going, so there is nothing to reconcile and nothing competing for
 * the periphery. It also puts the motion where the eye already is when it wants an answer,
 * rather than in the corner where motion is a distraction by design.
 *
 * **What it costs, and this is the real trade.** The stroke's whole argument for the border
 * was that it "says it without spending the logo or a single pixel of the transcript,
 * because it rides the hairline that was already there". This spends a pixel: the underline
 * is a new 1px rule that exists only because the word does. It also gives up the border's
 * peripherality — a word with something moving under it is a thing in your reading path,
 * and the stroke was deliberately not that.
 *
 * **Undrawn and worth saying.** This take keeps `line`'s three words and drops the digit,
 * so it shares `shimmer`'s blind spot: a slow session is felt and never read. Putting
 * `under`'s sentence on this underline instead of the bare word is one line of change and
 * is the obvious next frame if the mechanism wins.
 */
export default function LoadRideFrame() {
	return (
		<WaitFrame
			take="ride"
			title="ride · the loader is the word's underline"
			claim="the same track and the same 1600ms, moved off the border and under the word. one object, not two."
			notes={[
				"420px of travel becomes about 58. the keyframes are identical.",
				"nothing is added: the stroke leaves the border to come here.",
				"it spends a pixel the border version deliberately did not.",
				"no digit, so it shares shimmer's blind spot: felt, never read.",
			]}
		/>
	);
}
