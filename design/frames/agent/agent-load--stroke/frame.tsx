import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--stroke — what ships, and the floor this round is measured against.
 *
 * **Why round three exists at all.** Round two drew six takes at 19:38 on 30 July. The
 * stroke shipped at 22:37 the same evening (`31ee106 feat: lay a stroke along the composer
 * border`), and `b4aef45` had deleted the beat eight minutes before that. Nothing on round
 * two's row knows about either. Every number over there was measured on a rail whose only
 * indicator was the one under test, and the rail people use now already has a hairline
 * winding across the top of the composer for the whole of every turn. "Add a permanent
 * word" was priced as adding the first thing. Today it is adding the second.
 *
 * **What the stroke is good at.** It is one element for the life of the rail, so it clears
 * round two's own bar — zero enters, zero leaves, on screen 100% — without anybody having
 * had to argue for it. It rides the hairline that was already between the log and the
 * composer, so the transcript gives up nothing. It never asks to be read.
 *
 * **What it is bad at, stated in its own source.** `agent-rail.tsx`: "idle draws the border
 * unchanged, and a request out, thinking, saying and doing all draw the same
 * laying-and-taking-up." That flatness is deliberate and the reasoning is real — a reader
 * watching the edge of their own eye learns nothing from the difference between a request
 * being out and a `read` being open, because *do I need to do anything* is no in both. The
 * complaint that opened this round is the case that reasoning does not cover: a thought
 * that runs for ninety seconds and a file read that takes two hundred milliseconds are the
 * same picture, so a long one reads as a rail that has stopped rather than one that is
 * working.
 *
 * **So the question this row asks is narrow.** Not *should there be an indicator* — there
 * is one, and it is fine. The question is whether the stroke should be joined by something
 * that says which of the two it is doing (`under`, `ride`), whether it should say that
 * itself (`gauge`), or whether the thing worth reading belongs in the log after all
 * (`row`). This frame is here so all four have a number to beat.
 */
export default function LoadStrokeFrame() {
	return (
		<WaitFrame
			take="stroke"
			title="stroke · alive, and nothing else"
			claim="what ships: one hairline on the composer's border, the same for waiting, thinking, saying and doing."
			notes={[
				"round two never drew this. it shipped three hours after that row,",
				"so every take over there priced itself as the only indicator.",
				"zero enters and zero leaves already, with no word spent.",
				"the gap is the one it names itself: no state, and no clock.",
			]}
		/>
	);
}
