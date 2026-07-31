import { useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { LANDS } from "./kaffe-page";

/**
 * The lift: the element the edit landed in is lifted out of its column and set back
 * into it, and nothing else on screen says anything happened.
 *
 * Every other direction in this family draws something *about* the edit — a flick on
 * the wall, a lane of marks, a rule down a block, a ghost of what was replaced. This
 * draws nothing. The element that changed moves, and that movement is the whole of
 * the channel. There is no mark that can point at the wrong block, because there is
 * no mark; the worst this can do is move nothing.
 *
 * ## The axis, which is the whole argument
 *
 * `agent-hand--bloom` rejected *movement* as the signal and it was right to: in flow
 * layout one edit at the top moves every block under it, so a rule that noticed
 * movement would light two thirds of a page for a three-word change. Its answer was
 * to stop asking about movement and ask about size instead.
 *
 * The answer here is to keep the movement and change the axis. **A reflow is
 * vertical, always** — blocks in flow move up and down and never sideways — so a
 * displacement across the column is the one movement a layout cannot produce by
 * itself. Everything that shifted because of the edit slides down the page in the
 * same instant the browser reflows it; the one element that moves *across* is the
 * one the agent wrote. The two are told apart by direction rather than by amount,
 * which is why this can be legible on a write that reflowed six blocks.
 *
 * It also buys the distance. A vertical arrival is bounded by the leading above it:
 * `--bloom`'s 8 units is 5.1 screen pixels and the phone page's tightest gap is 5.1,
 * so it cannot be larger without a block touching its neighbour. Across the column
 * there is nothing to touch, because the arrival travels *inward*, into the measure.
 * So the lift is **nine screen pixels**, 1.8 times the rise it replaces, and it ends
 * on the alignment rather than beginning on it — at no point in the three hundred
 * milliseconds does the page look mis-set.
 *
 * ## Nothing fades and nothing scales
 *
 * Scaling is `--bloom`'s measured finding, inherited without re-arguing it: 8.5px
 * type tweened through fractional scale inside a 0.63 transform shimmers.
 *
 * The fade is dropped, and that is this direction's own call. A fade says the element
 * arrived from nothing, and in the live regime it did not — the element is there
 * before the edit and there after it, and what changed is its contents. So it is
 * never drawn at less than full: what arrives is the change, not the element, and
 * an element you cannot read for a fifth of a second is the design being taken away
 * to announce that the design changed.
 *
 * ## The clock
 *
 * 300ms against a floor of 573, which is the shortest interval between two writes in
 * this capture (the third and fourth of the first run, 9,331ms to 9,924ms). So an
 * arrival is finished 273ms before the next one can start and two are never alive
 * together — the same arithmetic `--ghost` did for its 420, on the same two numbers,
 * with more room because there is only ever one element in flight.
 *
 * There is no stagger and there is nothing to stagger. `--bloom` needed one because a
 * photograph carries a whole run and lands nine boxes at once; an edit carries one
 * element. **One write, one element, one movement.**
 *
 * ## What names the element
 *
 * `LANDS` stands in for a resolution the product can actually make, and it is not the
 * box diff `--bloom` had to invent. An `Edit` names a byte range in a file, which is
 * a line range; `runtime/jsx-dev-runtime.ts:30` stamps every element with
 * `path:line:col`; so the element the edit hit is the deepest one whose stamp falls
 * inside the range. No matching, no tolerance, no false positives, and it answers the
 * write that moves no geometry — which is the case a rule about rectangles cannot
 * reach and this direction has no second channel to cover for.
 *
 * It costs what `--accrue` said it costs. **The stamp needs a live document**, so it
 * resolves above `LIVE_MIN_CSS_PX` and nowhere else. And an edit into a hoisted
 * constant has no element on its line at all: it degrades to the frame's root, which
 * is drawn here as **nothing**. Lifting the whole page would say *everything changed*,
 * and that is the one thing that is never true of one write. Silence is the cheaper
 * error, which is `--bloom`'s own principle kept.
 */

/**
 * How far the element is set down from, in **screen** pixels.
 *
 * In screen units rather than the design's, because whether a person can see
 * something move is a property of the eye and not of the page it is on. That is the
 * inverse of `--bloom`, which put its rise in the frame's own units and only its
 * threshold in screen pixels — and the inversion is forced by this canvas holding two
 * natural sizes: eight units of a 240-wide phone and eight units of an 886-wide
 * desktop are the same distance on paper and nothing alike on screen.
 *
 * What it costs is stated rather than hidden: a constant screen distance is
 * proportionally 3.7 times smaller on the wide page, and on the phone it can exceed
 * the element it is moving. The nav at 390 is 7 screen pixels wide.
 */
const LIFT = 9;
const MS = 300;
/** the field's own arrival curve, so the lift and the canvas move in one vocabulary */
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/**
 * The frame's page, with whatever the last write landed in being set back into place.
 *
 * `rev` is the revision of the **source**, not of a photograph, so it climbs thirteen
 * times across this turn. `held` is the gate and it is not a nicety: a write to
 * `shared/tokens.css` reboots every frame on the canvas at once and every element in
 * every one of them re-renders. The line range cannot say which of those was the
 * work. The presence can, because it is at one frame.
 *
 * `scale` is what the canvas is drawing the frame at, so the lift can be asked for in
 * screen pixels and spent in the frame's own units.
 *
 * The measure runs in a layout effect, before paint, so the element is never at rest
 * on screen before it is on screen arriving.
 */
export function Lifted({
	rev,
	held,
	scale,
	children,
}: {
	rev: number;
	held: boolean;
	scale: number;
	children: ReactNode;
}) {
	const still = useReducedMotion() === true;
	const host = useRef<HTMLDivElement | null>(null);
	const at = useRef<number | null>(null);

	useLayoutEffect(() => {
		const node = host.current;
		if (node === null || at.current === rev) return;
		const from = at.current;
		at.current = rev;
		// a boot is not an arrival, and neither is a jump cut: under reduced motion the
		// turn takes the revision from 0 to 13 in one commit, and thirteen writes landing
		// together is not thirteen edits, it is the end of the turn
		if (from === null || still || !held || rev !== from + 1) return;

		const id = LANDS[rev - 1];
		// the write with no element on its line. `--accrue` named it and this is the
		// decision it left open: the root is not an element the agent changed
		if (id === undefined || id === null) return;

		const target = node.querySelector(`[data-lift="${id}"]`);
		if (target === null) return;

		target.animate([{ transform: `translateX(${LIFT / scale}px)` }, { transform: "none" }], {
			duration: MS,
			easing: EASE,
		});
	}, [rev, held, scale, still]);

	return (
		<div ref={host} className="h-full w-full">
			{children}
		</div>
	);
}
