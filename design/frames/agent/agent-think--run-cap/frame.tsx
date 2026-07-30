import { ThinkFrame } from "../../../shared/ui/spool-think-rail";

/**
 * agent-think--run-cap — the run keeps every row and stops taking every pixel.
 *
 * The likelier reading of the request, answered with the smallest possible change:
 * a run of consecutive machine rows gets a viewport of its own, pinned to its live
 * end, and scrolls inside it. Nothing is hidden, nothing is summarised, no row is
 * ever removed, and the order is the order it happened in. The only thing that
 * changed is that the run stopped being allowed to push the sentence above it off
 * the top of the transcript.
 *
 * **Where 202 comes from.** A row is 26px and a run's pitch is 32px, so six rows are
 * 186 and seven are 218. 202 holds six whole rows and 16px of a seventh. The half
 * row is the point rather than an accident: a scroller whose viewport is an exact
 * multiple of its own rhythm reads as a list that ended, and this one has not ended.
 * #176 capped the queue at 164px for the same job and this is that number rounded up
 * to the run's own pitch. Both the cap and what the run wanted are measured off the
 * DOM and printed under the frame, the want read off a hidden uncapped copy of the
 * same rows, because a flex column with a capped child reports the cap when you ask
 * it how tall it is — the trap `agent-footer-fit` fell into twice.
 *
 * **It survives the rail resizing, which is the reason to prefer it.** The rail is
 * drag-resizable from 200 to 480 and now ships at 420 rather than the 300 #184 was
 * written against — `inspector.tsx` is gone and `agent-rail.tsx:68` owns the default.
 * A row is 26px at every width in that range, because a subject truncates rather
 * than wrapping, so six rows is 186px at 200 exactly as it is at 480. This cap is
 * therefore a cap in rows without being written as one, and no threshold, ladder or
 * per-width rule is needed anywhere.
 *
 * **What it costs, and this is the whole argument against it.** It puts a second
 * scroll region inside a scrolling log. A wheel over the run moves the run, a wheel
 * two pixels above it moves the transcript, and there is nothing on screen that says
 * which one the pointer is over until it has already moved the wrong thing. The rail
 * has spent real effort avoiding exactly this: `spool-thread-strip.tsx` refuses a
 * scrollbar on a 420px rail on the grounds that "a trough across the top of a 420px
 * rail is the loudest object in a near-black interface", and this take adds one
 * inside the log. The fade at the top of the box is doing all the work of saying
 * there is more, and a fade is not a control.
 *
 * **What it beats.** The two frames to its right, on honesty: it is the only one of
 * the three that never takes a row off the screen. What it does not beat is either
 * of them on height, because the box is still 202px of the transcript spent on
 * machine work whether or not anybody looks at it.
 */
export default function AgentThinkRunCapFrame() {
	return (
		<ThinkFrame
			think="beat"
			run="cap"
			note="The run keeps every row it had and gets a viewport of 202px, six rows and the top of a seventh, pinned to the live end."
		/>
	);
}
