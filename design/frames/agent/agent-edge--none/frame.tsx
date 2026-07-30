import { EdgeFrame } from "../../../shared/ui/spool-edge-rail";

/**
 * agent-edge--none — there is no wait indicator, and the case for that.
 *
 * **What it proposes.** Delete the beat. The transcript holds what happened and a wait
 * is the absence of something happening, which is `answered()`'s own argument taken one
 * step further: if it leaves no receipt, it should not have drawn a row in the first
 * place. Nothing is added and nothing is removed, so nothing can move.
 *
 * **The argument for why that is fine.** Spool already says a turn is running, in two
 * places that are on screen for the entire wait and neither of which is in the log.
 * The composer footer's stop is offered against `phase === "playing"` and nothing else
 * (#198), so it is present for every millisecond of all four waits here; and #161's
 * thread mark turns a ring for a thread with work in flight. The wait beat is a third
 * statement of a fact already made twice, and it is the only one of the three that is
 * unlabelled.
 *
 * **What it costs, measured rather than waved at.** The four waits are 7,572ms of a
 * 13,407ms turn, so for **56% of this turn the rail holds nothing in motion inside the
 * log**. The last row sits `done` for up to 4.0 seconds — the slowest time to first
 * token in the six captures — while the agent is working. That is the whole case
 * against, and it is a real one: the stop button is 700px away from where the eye is,
 * which is the live edge, and #165 rejected the live edge for the stop for exactly the
 * inverse reason (it travels). Here the eye is on the edge and the only living thing
 * is at the bottom of the box.
 *
 * It also loses the number. Nothing in this take ever says a request took 2.7 seconds,
 * so a slow session is felt and never read.
 *
 * **What it beats.** `now`, trivially and completely. It is the floor every other take
 * has to earn its pixels against.
 */
export default function EdgeNoneFrame() {
	return (
		<EdgeFrame
			where="none"
			title="none · no indicator, and the case for it"
			claim="the composer's stop is on screen for every one of these 7.5 seconds, and #161's mark turns beside it."
			notes={[
				"nothing is added or removed, so the whole class is gone.",
				"cost: 56% of this turn the log holds nothing moving, and the",
				"last row reads done up to 4.0s while the agent is working.",
			]}
		/>
	);
}
