import { ThinkFrame } from "../../../shared/ui/spool-think-rail";

/**
 * agent-think--gone — there is nothing behind a thought, so it stops being a row.
 *
 * This is the take that argues no. Not "the disclosure is not worth building" but
 * something stronger: a thinking beat should not be an entry in the log at all.
 *
 * **The screenshot is the evidence.** Seven machine rows sit between the agent's
 * sentence and the live edge, and two of them are thoughts. One of those two reads
 * `thinking 0.0s`. A thinking block opened and closed inside the same tick, reported
 * nothing, and was given a mark, a verb, a duration and 32px of a transcript that
 * the frame next door is trying to cap. Fourteen per cent of the run in that picture
 * is a row about nothing, and the request to expand it is a request to be told what
 * is inside a row that has no inside.
 *
 * **So the proposal is the opposite of a disclosure.** A thought is not a step, it
 * is the pause between two steps. While it runs it is the live edge — the turning
 * mark and `thinking 22.4s`, which is exactly what you want when nothing else is
 * happening and is the one moment the number is worth anything. When it settles it
 * leaves nothing behind, and the next call takes the place it was holding.
 *
 * **The page already decided this once.** #163 took the settled message's per-word
 * spans out on the same reasoning and measured `Said` settled at zero elements from
 * raw text's own DOM: what is drawn for the arrival is not owed to the archive. A
 * thought is that with the extreme case, because its arrival is all it ever had.
 *
 * **What the screenshot becomes.** Seven rows go to five, and the live edge still
 * says `thinking 18s` while it is the thing you are waiting on. The run's own height
 * drops by two rows and 64px before any cap is applied — printed under the frame,
 * with the run's uncapped want measured off a hidden copy rather than counted by
 * hand.
 *
 * **What it costs, and it is a real cost.** The archive stops recording that the
 * agent stopped to think between step three and step five, and it stops recording
 * for how long. Read back a day later, six minutes of work looks like five calls
 * with unexplained gaps in it. If that time matters it belongs to the run's own
 * summary rather than to seven separate lines, which is what the three `run-` frames
 * on this row are for, and none of them currently carries it.
 *
 * **What it beats.** `agent-think--open`, if a chevron holding two numbers and a
 * rate is not worth a row. Both are drawn, unchanged apart from that, so the
 * comparison is a look rather than an argument.
 */
export default function AgentThinkGoneFrame() {
	return (
		<ThinkFrame
			think="gone"
			run="all"
			note="A settled thought leaves nothing behind, so the screenshot's seven rows are six while the last one runs and five once it lands."
		/>
	);
}
