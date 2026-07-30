import { ThinkFrame } from "../../../shared/ui/spool-think-rail";

/**
 * agent-think--run-count — the whole run is one line, and the line is the live edge.
 *
 * From the first machine row, everything between the agent's sentence and now is a
 * single 26px row: a turning mark, the count, and the step it is on. `7 steps · read
 * site-punch-press.ts` while it works, `12 steps` with a check when it lands. The
 * chevron opens the lot.
 *
 * **This is not a new object.** The rail already has exactly this shape for work it
 * chooses not to draw: a delegated task is one row carrying its live step, and
 * `agent-transcript.ts:1112` is explicit that the step "is a snapshot rather than a
 * log" that replaces rather than appends and drops the moment the task lands. #180
 * drew it on `agent-chat`'s fan-out case and nobody argued with it. So the proposal
 * is one sentence long: do to the agent's own run what the rail already does to
 * somebody else's, and for the same stated reason, which is that between two
 * sentences a reader is owed the fact that something is happening and roughly how
 * much, not a receipt per call while the call is still warm.
 *
 * **It is the only take that leaves the turn whole on screen.** 26px against the
 * 202px of `--run-cap` and the 154px of `--run-fold`, measured rather than claimed,
 * and it does not move as the run grows. The human's words, the reply, and the state
 * of the work all sit above the composer at every run length, which is the picture
 * the screenshot does not have.
 *
 * **What it costs, and it costs the most of the three.** You cannot watch. The
 * thing this rail was built to show is a run of tool calls landing one after
 * another, and this take replaces it with a number. A log you cannot skim afterwards
 * is not a log, so the row has to open, and opened it is `--run-cap` again — which
 * means the shut state is the entire proposal and the entire risk. It also throws
 * away the one thing the count cannot carry: which calls, in what order, against
 * what. `12 steps` is true of a good turn and a bad one.
 *
 * **And it breaks a rule the page has been keeping.** #143 made a frame's name in a
 * row the way to that frame, and #117 made a screenshot open behind its own row.
 * Both live on the row for a specific call. Collapsed to a count there are no rows
 * to carry them until somebody opens the count, so every navigation this rail has is
 * one click further away for the whole time the turn is running, which is the only
 * time anybody wants it.
 *
 * **What it beats.** Both of its neighbours on height and on stillness. It loses to
 * both on everything else, and it is drawn because the quietest possible answer
 * should be on the row before a middle one is picked.
 */
export default function AgentThinkRunCountFrame() {
	return (
		<ThinkFrame
			think="beat"
			run="count"
			note="The run is one 26px line carrying its own count and the step it is on, the shape the rail already gives a delegated task."
		/>
	);
}
