import { QuietFrame } from "../../../shared/ui/spool-quiet-rail";

/**
 * agent-quiet--now — the rail as it is, kept as the diff.
 *
 * **What it proposes.** Nothing. This is `agent-transcript.ts` unchanged, playing eight
 * requests, so the four takes beside it have something to be measured against. Both
 * beats are in the log and they behave the two different ways they behave today: the
 * wait is an unnamed turning entry that `answered()` at `:894` splices out the moment
 * anything comes back ("the wait leaves no receipt: it was the absence of an answer
 * rather than a thing that happened"), and a thought is a permanent row printing a
 * clock. Nothing sits above the composer, because today nothing does.
 *
 * **What is on screen at the screenshot's own moment.** Seven machine rows between the
 * agent's sentence and the live edge, 218px of them, and two of the seven say nothing a
 * person can act on: `thinking 0.0s` and `thinking 18s`. The meter prints all of it off
 * the DOM. The `0.0s` row is the argument in one line — a block opened and closed
 * inside a tick, reported nothing, and was given a mark, a verb, a duration and 32px.
 *
 * **And it is not the screenshot being unlucky, which is the thing this round found.**
 * Counted across all seven fixtures by whole block rather than by delta: **36 thinking
 * blocks, seven of them carrying no delta at all and twenty-two of them carrying two or
 * fewer.** Two carry 45 and 86. So the row that the case for keeping thinking rests on —
 * a long thought worth recording — is two rows in thirty-six, and the ordinary thinking
 * row is a row about nothing. `claude-plan.json` is the extreme: eleven thinking blocks,
 * five deltas between them, **seven of the eleven empty**, so a plan turn draws eleven
 * thinking rows and seven of them read `0.0s`.
 *
 * **What it costs.** Two things, and they are different costs.
 *
 * The wait costs *movement*. The log is bottom-anchored (`agent-rail.tsx:914`, `mt-auto`)
 * and follows the live end, so removing the last entry pulls everything above it down by
 * a row. A row's pitch is 32px and **the worst single downward step measures 39px over
 * the screenshot's own window and 40px over the whole turn**, because the splice and the
 * next entry's arrival land inside the same frame — which is why the number is read off
 * the DOM rather than worked out from the row height. It happens eight times in this turn
 * and twelve times in a full `claude-edits` session.
 * The meter also reports the beat entering and leaving at the live edge four times each
 * over the screenshot's own window and eight over the whole turn.
 *
 * The thinking rows cost *height and attention*, permanently, and they buy back exactly
 * one thing: after the turn, `thinking 18s` is the only record of where more than half
 * the turn went. That is the whole case for them and the four takes beside this one each
 * answer it differently.
 *
 * **What it beats.** Nothing. It is here to lose on its own meter.
 */
export default function AgentQuietNowFrame() {
	return (
		<QuietFrame
			take="now"
			title="now · a wait that leaves, a thought that stays"
			claim="the beat leaves eight times; the thoughts never leave."
			after="Yes, and it is the only take where you can: thinking 18s is still in the log tomorrow. It costs two rows a turn that say nothing, plus a measured 40px drop every time a request lands."
			notes={[
				"seven rows at the screenshot, two of them about nothing.",
				"a row's pitch is 32px; the splice measures 40, arrival included.",
			]}
		/>
	);
}
