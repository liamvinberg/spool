import { useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { type Box, fates, news } from "./bloom-boxes";

/**
 * The arrival: what is new comes in, and nothing is drawn over the design to say so.
 *
 * `agent-hand--inside` put a mark on the block that changed and died on the fact
 * that the product cannot know which block that was. This puts no mark anywhere.
 * The thing that arrives is the picture's own content, moving into place, so there
 * is nothing here that can be *wrong* about the page — the worst this can do is
 * stay silent.
 *
 * **What this component stands in for is not a live re-render.** At canvas zoom a
 * frame is a stored still (`hand.tsx`'s `STILL_LAG` has the citations), so in the
 * product the two sets of boxes are measured while the photograph is being taken,
 * ride out with it, and the arrival is drawn by the canvas on its own two bitmaps:
 * the new still hard-cuts in, and a copy of it clipped to each changed box rises
 * over itself. Drawing it here by animating the page's own elements is the faithful
 * stand-in, because a clipped copy of a bitmap rising over the same bitmap is
 * pixel-for-pixel what an element rising over its own final position looks like.
 *
 * **It is a rise, and the reason is the swap it has to be legible against.** A new
 * still lands as a hard cut between two bitmaps in a plain `<img>`, which is the one
 * transition peripheral vision cannot catch, and before that the old still sat
 * opaque over the whole reboot (`coverPlan`, `frame-shell.tsx:67`). So the frame
 * already ends every photograph with an instantaneous whole-picture replacement.
 * A bloom made of opacity would read as more of that. Movement is the channel the
 * swap is not using.
 *
 * **Nothing scales.** A block of 8.5px type inside a 63% transform, tweened through
 * fractional scale, shimmers; `spool-play-field.tsx` can afford `scale: 0.985` on a
 * whole frame arriving and a headline cannot.
 *
 * **The rise is in the frame's own units and the threshold is in screen pixels**,
 * because they answer different questions. How far a block moves is a property of
 * the design's space, so it shrinks as the canvas zooms out, the way the type does.
 * Whether a change is worth drawing is a property of the eye, so it does not.
 */

/** how far a block comes from, in the frame's own 240x520 units: 8 here is 5.1px on screen at 39% */
const RISE = 8;
const MS = 280;
/**
 * One block behind the next, in document order, which on a page is reading order
 * because a page is written in the order it reads.
 *
 * The cap is set by the regime. A photograph lands about every twelve seconds here,
 * so nine boxes staggered to 640ms have room to spare and the page reassembles top
 * to bottom instead of nine things twitching at once. Live, above the 400px
 * threshold, one arrival per write and the floor between two writes is 573ms, so the
 * cap would have to come down to three steps.
 */
const STEP = 45;
const STAGGER_CAP = 8;
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/**
 * The smallest change worth drawing, in screen pixels, and the tolerance the match
 * runs at. One number, because they are one question: below it nobody can tell two
 * rectangles apart, so calling them the same and calling the difference invisible
 * are the same call.
 */
const SEEN = 2;

/**
 * Every element with a box of its own, measured against the frame's own corner.
 *
 * Non-replaced inline elements are skipped, and the reason is not tidiness: a
 * transform does not apply to one, so an arrival could not be drawn on it — and its
 * rect is the union of its line boxes, which is not a box anybody laid out. Where an
 * inline run changes, its block carries the change or nothing does.
 */
function measure(host: HTMLElement): { nodes: readonly Element[]; boxes: readonly Box[] } {
	const root = host.getBoundingClientRect();
	const nodes: Element[] = [];
	const boxes: Box[] = [];
	for (const node of host.querySelectorAll("*")) {
		if (window.getComputedStyle(node).display === "inline") continue;
		const rect = node.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) continue;
		nodes.push(node);
		boxes.push({ x: rect.left - root.left, y: rect.top - root.top, w: rect.width, h: rect.height });
	}
	return { nodes, boxes };
}

/**
 * The frame's picture, with whatever the last photograph brought arriving into it.
 *
 * `rev` is the revision of the *still*, not of the source, so it climbs three times
 * across this turn and not thirteen.
 *
 * `held` is the gate, and it is not a nicety. A write to `shared/tokens.css` bumps
 * every frame's nonce at once, so a canvas of fifty frames can be rephotographed
 * together and every box in every one of them can move. The boxes cannot tell which
 * of those was the point. The presence can: the agent is at one frame, and only the
 * frame it has hold of is allowed to say anything.
 *
 * The measure runs in a layout effect, before paint, so the new state is never on
 * screen at rest before it is on screen arriving.
 */
export function Arriving({ rev, held, children }: { rev: number; held: boolean; children: ReactNode }) {
	const still = useReducedMotion() === true;
	const host = useRef<HTMLDivElement | null>(null);
	const seen = useRef<readonly Box[] | null>(null);
	const at = useRef<number | null>(null);

	useLayoutEffect(() => {
		const node = host.current;
		if (node === null || at.current === rev) return;
		const first = at.current === null;
		at.current = rev;

		const { nodes, boxes } = measure(node);
		const before = seen.current;
		seen.current = boxes;
		// a boot is not an arrival: there is nothing behind it to have arrived from
		if (first || before === null || still || !held) return;

		const fate = fates(before, boxes, SEEN);
		const fresh = news(boxes, fate, (a, b) => nodes[a]?.contains(nodes[b] ?? null) === true, SEEN);

		fresh.forEach((index, order) => {
			nodes[index]?.animate(
				[
					{ opacity: 0, transform: `translateY(${RISE}px)` },
					{ opacity: 1, transform: "none" },
				],
				{
					duration: MS,
					delay: Math.min(order, STAGGER_CAP) * STEP,
					easing: EASE,
					// the block sits where it came from for the whole of its wait, so a stagger
					// is blocks landing one after another rather than blocks twitching late
					fill: "backwards",
				},
			);
		});
	}, [rev, held, still]);

	return (
		<div ref={host} className="h-full w-full">
			{children}
		</div>
	);
}
