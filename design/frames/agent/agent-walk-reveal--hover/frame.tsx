import { OFF_PAGE_TWO, PAGES_TWO, RevealWindow, TARGETS_TWO, buildScene } from "../agent-walk-reveal/walk-reveal";

/**
 * agent-walk-reveal--hover — the pointer asks, and nothing is committed (#146).
 *
 * Nothing is selected here, on purpose. It is the state a person spends most of
 * their time in — reading a page rather than working on one frame of it — and it is
 * the state where the Pages tree has nothing at all to say: no ticks, because
 * #144's ticks only ever speak for the selection. The canvas is carrying the whole
 * fact on its own.
 *
 * **Reduced strength is the honest drawing of a preview.** The hairline drops from
 * 26% of text to 15%, the labels go to muted, and the anchor is grey rather than
 * red, because red is the selection's and this frame is not selected. Read the
 * three frames side by side and the tone is the state: faint means you are only
 * looking, full means you asked and it stays.
 *
 * **What it buys.** You can sweep a page and read every frame's addresses without
 * changing anything. Selection has consequences — it arms drag, resize and play —
 * and hover has none, so hover is the cheapest possible question.
 *
 * **What it costs, and why it is probably not the whole answer.** The block cannot
 * be pressed the way it is drawn: leaving the frame to reach a label crosses bare
 * canvas, the hover ends, and the block retracts under the pointer. Making it
 * survive that crossing means a grace region around the leader, which is a
 * hit-target rule invented for one feature, and the alternative is that the labels
 * are unreachable and the second word on each of them is decoration. Hover is a
 * real preview and a poor destination. That is why the pin exists in `--verb`.
 *
 * **Broken does not change.** `cart--empty` is at full fault strength in all three
 * frames, hovered or not, selected or not. The one constant in the family.
 *
 * Live: the drawn pointer retires the moment a real one moves, and after that the
 * leaders follow the frame under it.
 */
export default function AgentWalkRevealHoverFrame() {
	return (
		<RevealWindow
			trigger="hover"
			scene={buildScene(OFF_PAGE_TWO)}
			pages={PAGES_TWO}
			targets={TARGETS_TWO}
			hovered="cart"
			pointer={{ x: 322, y: 356 }}
		/>
	);
}
