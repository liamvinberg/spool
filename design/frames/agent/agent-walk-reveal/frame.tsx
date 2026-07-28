import { OFF_PAGE_TWO, PAGES_TWO, RevealWindow, TARGETS_TWO, buildScene } from "./walk-reveal";

/**
 * agent-walk-reveal — selection is the whole trigger (#146).
 *
 * You already told the canvas which frame you care about. Selecting it is the
 * question "what is this frame", and where its walks go is part of the answer, so
 * the leaders come with the ring and nothing else has to be pressed. `menu` and
 * `receipt` have walks too and draw nothing, because you did not ask about them —
 * that is the whole difference from a connections list, which answered for a frame
 * whether or not anyone had asked.
 *
 * **What it buys.** Zero controls. No verb to learn, no glyph to find, no hover to
 * discover. The reveal is a property of the selection, which is the one piece of
 * canvas state a person is always aware of because they just set it.
 *
 * **What it costs.** You cannot put it away. Selection is also how you drag, resize
 * and play a frame, so anyone arranging a page with off-page walks gets the block
 * for as long as the frame is selected, and it is drawn in the space they may be
 * dragging into. `--verb` exists because of that, and this frame is the honest
 * baseline it has to beat: the block is 41 pixels tall for two walks, and it lands
 * outside the frame it belongs to.
 *
 * **The broken leader is not part of the trigger.** `cart--empty` is unselected,
 * unhovered, and reports anyway. Two walks, both dead, no arrow on the canvas —
 * the exact bug `inspector.tsx:592` names, where a frame whose only walks are
 * unreadable read as a frame with no walks at all. Nothing in this family gates a
 * fault behind an interaction.
 *
 * Live: press a frame to select it, press bare canvas to drop it. The leader draws
 * out from its dot and retracts label-first.
 */
export default function AgentWalkRevealFrame() {
	return (
		<RevealWindow
			trigger="selection"
			scene={buildScene(OFF_PAGE_TWO)}
			pages={PAGES_TWO}
			targets={TARGETS_TWO}
			selected="cart"
		/>
	);
}
