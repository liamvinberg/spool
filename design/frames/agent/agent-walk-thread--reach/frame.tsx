import { WalkThreadWindow } from "../agent-walk-thread/walk-thread-scene";

/**
 * agent-walk-thread--reach: the same scene with `checkout · shop` under the
 * cursor.
 *
 * It plays itself. The thread and its tag share one hover: run the cursor down the
 * stroke or onto the pill and the same three things happen, because the stroke
 * carries an invisible 18px hit path and the tag is a 120 x 22 button. `checkout`
 * is pinned lit on arrival so the still shows it, and real hover takes it back the
 * moment the pointer moves.
 *
 * **The thread firms up.** The fade is a second stroke at full strength coming in
 * over the tapered one across 200ms, so the reach reads as the thread completing
 * rather than as a highlight arriving. It still grows no arrowhead: a head is the
 * claim that what it points at is on this page, and `checkout` is not.
 *
 * **The tag brightens.** Surface to raised, border up one step, the name to full
 * text and the page out of its dimmest grey. Nothing moves and nothing resizes, so
 * a cursor travelling along a fan of threads does not make the tags twitch.
 *
 * **And the tree answers.** `shop` lights in the Pages rail, which is the pairing
 * #143 already ships for a rail row naming a frame, run the other way: the canvas
 * points and the tree lights. It is also the proof that the tag is a control and
 * not a caption, since something else on screen responds to it. Press it and you
 * travel there: the page follows, the arrival is centred, `checkout` ends up
 * selected. That landing is `agent-play--jump-name` and it is not re-drawn here.
 *
 * **Why the other thread stays down.** `home · site` is dashed and faint and it
 * stays that way, so the frame carries the difference between reached and at rest
 * side by side rather than as a claim. The two cut stubs do not respond to a
 * cursor at all, because there is nothing at the end of them to reach.
 */
export default function AgentWalkThreadReachFrame() {
	return <WalkThreadWindow start="checkout" />;
}
