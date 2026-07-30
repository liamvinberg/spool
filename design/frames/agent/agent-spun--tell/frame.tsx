import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--tell — one line, a different thing per state, and nothing at all while words
 * arrive.
 *
 * Built the other way round from every take in three rounds. Instead of one motion asked to
 * cover every state, each state gets the motion that is true about it:
 *
 *   `out`       one stroke crosses, left to right, once per 1.1 seconds. A request is a thing
 *               sent, so it is drawn as a thing travelling — and the measured 878ms floor on a
 *               real wait is very nearly one crossing, which is the only timing in this round
 *               chosen by the data rather than checked against it afterwards.
 *   `thinking`  the stroke stops travelling and breathes its length in place at the centre.
 *               Thought is not transport. It is also the one thing on the wire that has a
 *               clock and a token count and **no text at all** — 346 blocks across six
 *               captures, every one empty — so a mark is the only thing that can carry it.
 *   `doing`     travelling again, at `passMs(load)`: the rate is the backlog, on
 *               `say-pace.ts`'s own shape rather than on a constant nobody chose.
 *   `saying`    nothing. The words are already a live edge — arriving at the backlog's rate
 *               with a word fading in at 170ms behind a static caret — and a second live thing
 *               4px under them is spool saying one fact twice.
 *   `asking`    the line breaks at the centre and holds.
 *
 * **All five, and the fifth of them is silence.** That is the claim worth arguing about, not
 * the count: round three found the *word* `waiting` was spool's own bookkeeping leaking into
 * the rail, and this take is the same finding applied to motion. The rail does not owe a
 * reader an indicator during the one state that already has one.
 *
 * **Its risk is the vocabulary.** Five behaviours on one 1px line is a language nobody was
 * taught, and three of them are a reader's eye catching "a stroke, moving". What it is not is
 * arbitrary — one of the five is a break and one is nothing — and none of it has to be learned
 * before the rail is useful.
 */
export default function SpunTellFrame() {
	return (
		<SpunFrame
			take="tell"
			title="tell · a behaviour per state"
			claim="a crossing for a request, a length breathing in place for a thought, the backlog's rate for open calls, a break when it needs you, and nothing while words arrive."
			notes={[
				"the only take that draws nothing during streaming,",
				"because the words are already the live edge.",
				"five states off one 1px line, which is also the risk:",
				"three of them are a stroke moving.",
			]}
		/>
	);
}
