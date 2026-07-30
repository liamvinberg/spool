import { EdgeFrame } from "../../../shared/ui/spool-edge-rail";

/**
 * agent-edge--settle — the beat stays in the log and settles into a receipt.
 *
 * **What it proposes.** One rule, and it is the shortest one available: *nothing is
 * ever removed from the transcript.* The wait keeps its row and changes what it says
 * — `waiting 1.2s` while the request is out, `waited 1.4s` once it is back — inside
 * the same 26px the rest of the log's rows have. The splice goes away because there
 * is nothing left to splice.
 *
 * It also answers the thing that made this a ticket rather than a nit. The complaint
 * was not only that the mark moves, it was that nobody knows what it is. A turning
 * ring with no verb beside it is the only object in this rail that does not say what
 * it is doing; every other row is a verb and a subject. This one becomes one.
 *
 * **What it costs.** Rows nobody asked for. Four here, twelve in an ordinary
 * `claude-edits` session, and each of them is a receipt for something that did not
 * happen — the whole reason `answered()` removes it. Against that: the four add up to
 * 7,572ms of a 13,407ms turn, so what they are receipts for is 56% of the elapsed
 * time, and a log that accounts for 44% of a turn is not a log of the turn. `thinking
 * 18s` is already a row with the same shape and the same nothing behind it, and
 * nobody has argued for removing that.
 *
 * The honest limit: it fixes the beat and nothing else. An answered question still
 * drops three bordered options out of the log, which is the biggest single shrink the
 * transcript has, and this rule would have to be extended to cover it.
 *
 * **What it beats.** `now`, by never removing anything. `none`, by leaving something
 * to read afterwards — a slow model is a fact about a turn, and this is the only take
 * where it survives the turn.
 */
export default function EdgeSettleFrame() {
	return (
		<EdgeFrame
			where="settle"
			title="settle · it stays, and it says what it was"
			claim="waiting 1.2s becomes waited 1.4s in the same row. nothing is spliced, so nothing can drop."
			notes={[
				"rule: nothing leaves the log, everything settles where it is.",
				"unfixed: an answered ask still drops its options and pulls the",
				"log down by them. that shrink needs the same rule too.",
			]}
		/>
	);
}
