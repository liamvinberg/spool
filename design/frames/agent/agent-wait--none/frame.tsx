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
 * **And the research does not kill it, which was the surprise.** Every surface that
 * could be read at the source for this ticket — assistant-ui, Zed, and Claude Code's own
 * TUI — draws something while a request is out, so on a show of hands this take is
 * alone. But the answers come back identical every time: **mounted when the request goes
 * out, unmounted when the answer lands.** Not one of them keeps a persistent object that
 * changes state. So the thing being objected to here is the industry default, and `none`
 * is not a lazy version of it: it is the only take on this row, apart from the three
 * that never leave, that refuses the default rather than decorating it. The sheet is
 * `agent-wait-look`.
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
				"no surface read at the source keeps a persistent indicator.",
				"all mount one on send and drop it on answer, so this is the",
				"only take that refuses the default rather than dressing it.",
				"cost: 56% with nothing moving, and no number left afterwards.",
			]}
		/>
	);
}
