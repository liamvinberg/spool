import {
	OFF_PAGE_FIVE,
	PAGES_FIVE,
	RevealWindow,
	TARGETS_FIVE,
	buildScene,
} from "../agent-walk-reveal/walk-reveal";

/**
 * agent-walk-reveal--verb — the label row carries the control (#146).
 *
 * Selection puts a verb on the frame, not a block of ink. The row already reads
 * `cart … play`; this adds `walks 5` beside it, so revealing is a thing you do to
 * the selected frame rather than a thing selecting it does to you. Press it and the
 * leader pins: the pointer can leave, the block stays, and you can drag the frame
 * with its own addresses still on screen. Press again and it retracts.
 *
 * **Why the verb belongs here and not in the chrome.** `play` is the precedent and
 * the argument: the selection's verbs live at the far end of the selection's own
 * label row, because a control for the thing you are pointing at should not be
 * across the window. The glyph is the settled `edge` — two frames and the walk
 * between them — so it means the same thing here that it means in the rail. And
 * the verb appears only on a frame with walks to show, which is why it can carry a
 * count instead of a state: seeing `walks 5` is already the answer to "is there
 * anything here".
 *
 * **This is the frame where the width worry gets answered.** `cart` declares five
 * off-page walks. The shelf is as wide as its widest label and the rows hang under
 * it, so the fifth walk makes the block 80 pixels taller and not one pixel wider.
 * `checkout · shop` sets the width; `profile · site` and `search · shop` fit inside
 * it. One frame reveals at a time, so this is also the worst case a whole canvas can
 * ever be in: one column, one frame's worth.
 *
 * **Pinned means the pointer has gone.** The verb is drawn pressed and the pointer
 * is down on `orders · shop` instead, which is the second claim this family makes:
 * the labels are addresses, not captions. Pointing one lifts it and lights `shop`
 * in the Pages tree (#143); pressing it travels — the page follows, the arrival is
 * centred, `orders` ends up selected. The tree's ticks cover the same three
 * destinations for the selection and cannot say a word about the two dead ones
 * below.
 *
 * Live: press `walks 5` to unpin and pin it again.
 */
export default function AgentWalkRevealVerbFrame() {
	return (
		<RevealWindow
			trigger="verb"
			scene={buildScene(OFF_PAGE_FIVE)}
			pages={PAGES_FIVE}
			targets={TARGETS_FIVE}
			selected="cart"
			pinned
			seedPointed="off:orders"
			seedPage="shop"
			pointer={{ x: 336, y: 566 }}
		/>
	);
}
