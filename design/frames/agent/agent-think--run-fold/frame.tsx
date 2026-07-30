import { ThinkFrame } from "../../../shared/ui/spool-think-rail";

/**
 * agent-think--run-fold — finished work folds away behind the live edge as it goes.
 *
 * The run keeps a window of the three most recent finished rows plus whatever is
 * live, and everything older folds into one line that says how much: `9 earlier
 * steps`, with a chevron. As each new row arrives the oldest in the window folds
 * behind it, so the fold is not a control the human operates, it is what the run
 * does while nobody is watching.
 *
 * **The height stops being a variable.** Four rows and a fold line is 154px, and it
 * is 154px for a run of seven and for a run of seventy. This is the only one of the
 * three that is actually indifferent to how long the agent works, which matters
 * because the complaint in the screenshot is not seven rows, it is that seven rows
 * keeps growing. A cap answers "too tall"; this answers "keeps growing". The number
 * is measured off the frame rather than taken from that sentence.
 *
 * **The window is three, and three is an argument.** Two is one call and its
 * follow-up, which is not enough to see a pattern. Five is 186px, which is the cap
 * next door, at which point there is no reason to fold rather than scroll. Three
 * finished rows behind the live edge is the smallest window in which the run reads
 * as a sequence, and it leaves the whole shape of the turn — the human's words, the
 * agent's sentence, and what is happening now — on one screen with room to spare.
 *
 * **The fold opens into the capped scroller**, which means this take contains
 * `agent-think--run-cap` rather than competing with it: shut, it is a fold; open, it
 * is that frame. So the real question between them is only what the run looks like
 * while you are not asking, and that is worth being explicit about because it means
 * they can ship together and neither is wasted.
 *
 * **What it costs.** Work scrolls past before it can be read. A `read` that lands
 * and finishes while four more arrive behind it was on screen for under two seconds,
 * and the only trace it leaves is a number going up. That is a genuine loss for the
 * one thing this rail is for, which is watching an agent work — and it is worse for
 * a fast run than a slow one, so the design penalises exactly the case that is going
 * well. It also introduces the only object on this row that moves without being
 * touched, and a list that reorganises itself under a cursor is the thing #144's
 * threads strip refused to do when it fixed its order "once".
 *
 * **What it beats.** `--run-cap` on the growth complaint and on the second
 * scrollbar, which it only has once opened. `--run-count` on legibility, since three
 * rows of real work is still a run you can read.
 */
export default function AgentThinkRunFoldFrame() {
	return (
		<ThinkFrame
			think="beat"
			run="fold"
			note="Three finished rows stay behind the live edge and everything older folds into a count, so the run is the same height at seven rows and at seventy."
		/>
	);
}
