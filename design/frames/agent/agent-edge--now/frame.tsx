import { EdgeFrame } from "../../../shared/ui/spool-edge-rail";

/**
 * agent-edge--now — what the rail does today, kept as the diff.
 *
 * **What it proposes.** Nothing. This is `agent-transcript.ts` unchanged, so that the
 * four takes beside it have something to be measured against. The wait is an entry of
 * its own, drawn as a turning mark with no verb on it — `agent-transcript.ts:1124`
 * calls it "one beat, unnamed, turning" — and the moment the answer starts arriving
 * `answered()` at `:894` takes it back out of the list. Its own comment gives the
 * reason: "the wait leaves no receipt: it was the absence of an answer rather than a
 * thing that happened."
 *
 * **What it costs.** The log is bottom-anchored (`agent-rail.tsx:914`, `mt-auto`) and
 * follows the live end (`followTo`, `:846`), so taking the last entry out of it pulls
 * everything above it *down* by that entry's height. A row is 26px. That is the jolt,
 * and it is not once: `claude-edits.json` holds twelve `message_start` events, which
 * is twelve requests, twelve waits and twelve splices in one ordinary turn. This frame
 * plays four of them, using that capture's own first four measured times to first
 * token — 1397, 1684, 2682, 1809ms — unsqueezed.
 *
 * The second cost is the one that started this: an unnamed mark that appears and
 * vanishes says "something is loading" and does not say what. Fifty-six percent of
 * this turn is spent inside it.
 *
 * **What it beats.** Nothing. It is here to lose, visibly, on the meter under it.
 */
export default function EdgeNowFrame() {
	return (
		<EdgeFrame
			where="log"
			title="now · an entry, unnamed, then removed"
			claim="answered() splices the beat out of a bottom-anchored log, so the words above it drop by a row."
			notes={[
				"the rest of the log shrinks too, and none of it is fixed here:",
				"an answered question drops its options, a delegate's live step",
				"is nulled on task-done, the plan strip leaves for the shelf.",
			]}
		/>
	);
}
