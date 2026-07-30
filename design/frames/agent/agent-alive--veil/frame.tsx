import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--veil — only motion, with no shape at all.
 *
 * **The far end of the row, on purpose.** Every other take draws a thing. This one draws
 * nothing: the fade that already sits between the last line of the log and the composer
 * breathes its own opacity between 0.5 and 1 on a 3.2s ease. If liveness can be carried by a
 * field rather than by an object, this is what that looks like, and the question is worth one
 * frame because an object is exactly what round one's complaint was about.
 *
 * **It clarifies constraint two rather than breaking it.** #149 disqualified `blur` and
 * `soften` because Chromium will not composite them, and measured an `edge` gradient *freezing
 * mid-sweep* when the wire paused. What that finding is about is animating **paint**: a
 * `background-position` or a filter, recomputed every frame. This animates `opacity` on an
 * element whose gradient is painted once, which is compositor work like any transform on this
 * row. The distinction matters beyond this frame, because it is the difference between a
 * shimmer and a dissolve.
 *
 * **Two objections, and I think they are fatal.**
 *
 * *It has no locus.* There is nowhere to look. The eye detects that something in the region
 * changed and cannot find what, so the reading is not *the indicator is alive*, it is *the rail
 * is unsteady*. Every other take here can be pointed at.
 *
 * *And what it modulates is the human's own last words.* The veil sits over the live edge of
 * the log, which is the one surface in this rail that must not be touched: #163 went to the
 * trouble of leaving **no element at all** behind a settled message and measured it at zero
 * elements from raw text's own DOM, and #149 spent a whole sheet on the arrival of a single
 * word. This take dims that text twice a turn to say something about the network.
 *
 * **It costs no pixels**, which is the one thing it shares with `rule` and the only column it
 * wins. The transcript gives up nothing, because the fade was already there.
 */
export default function AliveVeilFrame() {
	return (
		<AliveFrame
			take="veil"
			title="veil · no shape, only a field"
			claim="the fade between the log and the composer breathes its own opacity. nothing is drawn, so nothing can have arrived."
			notes={[
				"opacity of a gradient painted once, which is not the",
				"animated background-position #149 measured freezing.",
				"no locus, so the eye reads the rail as unsteady.",
				"and what it dims is the human's own last words.",
			]}
		/>
	);
}
