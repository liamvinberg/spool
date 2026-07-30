import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--now — what ships, put under the new meter so the new meter has a floor.
 *
 * **What it proposes.** Nothing. This is `agent-transcript.ts` unchanged and it is the
 * same take `agent-edge--now` drew, redrawn here for one reason: round two is decided
 * on a number round one never took, and a number with no baseline decides nothing. The
 * beat is an entry of its own, a turning mark with no verb beside it, and `answered()`
 * at `:894` takes it back out the moment the answer starts.
 *
 * **What the new meter says about it.** Four requests, so **four enters and four
 * leaves** — an object created and destroyed eight times in thirteen seconds, and
 * twenty-four times in a full `claude-edits` session, which holds twelve
 * `message_start` events rather than four. That is the complaint, stated as a count
 * rather than as a feeling. The shift meter beside it is round one's and it still reads
 * whatever it reads; the point of this frame is that the two meters disagree about
 * whether anything is wrong, and the one that agrees with the person looking at it is
 * the new one.
 *
 * **It is also the only take here that is on screen for exactly the wrong 56%.** The
 * indicator exists during the wait and is gone during the work, which is backwards from
 * every other take on this row: they are on screen 100% of the time and change what
 * they say. Something present only while a request is out has to *arrive* to say
 * anything, and arriving is the thing being objected to.
 *
 * **What it beats.** Nothing. It is here to lose with a number on it.
 */
export default function WaitNowFrame() {
	return (
		<WaitFrame
			take="now"
			title="now · a row that is made and unmade"
			claim="four requests, four objects created and four destroyed. twenty-four in a real claude-edits turn."
			notes={[
				"the shift meter is round one's and it is not the argument here.",
				"this is the only take whose indicator is absent while work runs",
				"and present only while a request is out, which is backwards.",
			]}
		/>
	);
}
