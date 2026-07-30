import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--none — nothing, carried over from round one so it is compared rather than
 * remembered.
 *
 * **What it proposes.** Delete the beat and put nothing in its place. Round one's
 * winner, and it wins the new meter outright and by definition: nothing can enter or
 * leave if nothing exists. Zero enters, zero leaves, zero px, and the rail spends the
 * whole turn holding only receipts.
 *
 * **The research does not kill it, and it does not save it either.** Five surfaces were
 * read at the source and every one of them draws something while a request is out, so on
 * a show of hands this take is alone. Three of them mount it on send and unmount it on
 * answer, which is spool's own defect. But **two of them — Claude Desktop and Codex, the
 * two closest to what this rail is — keep the object mounted and change only whether the
 * animation runs.** So the always-present shape is not a novelty this page invented, it
 * is shipping in the two most comparable surfaces, and the honest reading is that `none`
 * is the only one of six positions nobody holds. The sheet is `agent-wait-look`.
 *
 * **What it costs, and this is unchanged.** The four waits are 7,572ms of a 13,407ms
 * turn: for **56% of it the log holds nothing in motion**, and the last row reads `done`
 * for up to 4.0s — the slowest measured time to first token in the six captures — while
 * the agent is working. Spool says a turn is running in two other places, and both are
 * far from where the eye is: the composer footer's stop, offered against `phase ===
 * "playing"` and nothing else (#198), and #161's thread mark up in the strip. The eye is
 * at the live edge and neither of those is.
 *
 * It also loses the number. Nothing here ever says a request took 2.7 seconds, so a
 * slow session is felt and never read. That is what `fact` is for.
 *
 * **What it beats.** `now`, completely. It is the floor the other three have to earn
 * their pixels against, and the honest reading of the meters is that it ties with all
 * three on movement and churn — so it can only be beaten on what an always-present
 * object *says*, never on what it costs.
 */
export default function WaitNoneFrame() {
	return (
		<WaitFrame
			take="none"
			title="none · nothing, and the case for it"
			claim="nothing exists, so nothing can enter or leave. the floor the other three are measured against."
			notes={[
				"five surfaces read at the source, five draw something. three",
				"mount it on send; claude desktop and codex keep theirs and",
				"only change whether it moves. nobody holds this position.",
				"cost: 56% with nothing moving, and no number left afterwards.",
			]}
		/>
	);
}
