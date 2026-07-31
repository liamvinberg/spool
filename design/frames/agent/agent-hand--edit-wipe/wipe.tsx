import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The wipe: the write is put in rather than swapped in, top to bottom, and you can
 * follow it.
 *
 * **The mechanism is `agent-hand--ghost`'s, with the opacity replaced by a moving
 * boundary.** The layer is handed the same component at two revisions and draws the
 * older *over* the newer — but instead of holding it at 0.3 everywhere, it shows it at
 * full strength only below a line that travels from the top of the frame to the bottom.
 * Above the line the frame is what the write made. Below it the frame is what the write
 * replaced. The line passes, and the page has been rewritten in front of you.
 *
 * **Nothing here knows what changed, and that is inherited rather than clever.** Two
 * renders of the same component with the same props make the same pixels, so everywhere
 * the write did not reach the two halves are identical and the boundary is invisible.
 * The wipe is therefore silent exactly where the ghost is silent, including at the one
 * moment that matters: `write home` at 117ms is `frames/home/frame.json`, geometry
 * rather than design, and nothing in the frame changed. No diff is computed anywhere and
 * **no source map is spent** — which was the thing that killed every direction wanting
 * to say *this block*, and the reason this direction is a whole-frame sweep rather than
 * a sweep confined to the element.
 *
 * **The brief's own objection turns out not to hold, and this is the finding.** A wipe
 * across the whole frame for a one-word change reads as a lie about the size of the
 * edit *only if the wipe is a band of ink travelling*. It is not. It is a partition
 * between two renders, so for a one-word change it draws one word arriving and nothing
 * else, over the same 274ms it takes for a change that rewrote half the page. What
 * travels is the boundary; what is *drawn* is only the difference. The size of the event
 * on screen is the size of the edit, always, with no rectangle and no stamp.
 *
 * **What it costs instead is order.** All thirteen writes are instantaneous on the wire
 * and the wipe gives each one an order it does not have: the top of the page changes
 * before the bottom does. That is a real invention and it is the price of being
 * catchable. The mitigation is the axis — top to bottom is the order the page was going
 * to be read in anyway, so the invented order is the eye's own.
 *
 * ## Direction: top to bottom, and the axis is decided by desktop rather than by meaning
 *
 * Three candidates. Top to bottom is reading order. Left to right is writing order, and
 * it is honest for a line of text and meaningless for a picture, which is four of the
 * seven blocks on this page. Outward from the change is neither, and it needs to know
 * where the change is, which is the source map nobody has.
 *
 * **Left to right dies on arithmetic before taste gets to it.** At one zoom a phone
 * frame is 152 drawn pixels across and a desktop frame is 561: a factor of **3.69**, and
 * no single duration and no single rate survives it — one of the two is either a flash
 * or a crawl. Vertically the same two frames are **329 and 351** drawn pixels, a
 * difference of 22px, because a phone is tall and narrow and a desktop is short and
 * wide, and at one zoom those cancel. So the vertical axis is the only one on which a
 * phone and a desktop are nearly the same journey, and it is also the one that carries
 * the better meaning. That is the whole argument, and it is why this direction survives
 * being asked about desktop at all.
 *
 * ## Speed: a rate, with two clamps, and neither of them binds
 *
 * `duration = clamp(height ÷ 1.2, 180, 420)`, in drawn pixels and milliseconds.
 *
 * **The floor is 180ms** and it is spool's own number: `frame-shell.tsx:136-144` fades a
 * frame's stored cover out over exactly that once a rebooted document reports `loaded`,
 * so 180 is how long a reboot's seam lasts. A wipe shorter than the seam is a flash, and
 * a flash is the one transition peripheral vision cannot hold on to, which is the whole
 * thing this direction exists to fix.
 *
 * **The ceiling is 420ms**, which is `--ghost`'s own life span, arrived at from the same
 * end: the tightest interval between two writes in this capture is **573ms**, measured,
 * and 420 leaves 153ms of clear air before the next one. A wipe still travelling when
 * the next write lands is a wipe of the wrong revision.
 *
 * **The rate is 1.2 px/ms and it is chosen to keep both clamps off.** Requiring the
 * phone's 329 to stay above the floor gives R ≤ 1.83; requiring the desktop's 351 to stay
 * under the ceiling gives R ≥ 0.84. 1.2 sits near the geometric centre of [0.84, 1.83],
 * which is as far from both clamps as the two sizes allow. What comes out:
 *
 *   phone     329 drawn  →  **274ms**   299ms of clear air before the tightest next write
 *   desktop   351 drawn  →  **293ms**   280ms of clear air
 *
 * So the honest answer to *is the speed a constant, a rate, or does it have to change* is
 * **a rate, and it did not have to change** — but only because the axis was picked so
 * that the two distances are 22px apart. On the horizontal axis the same rate gives 127ms
 * and 468ms, one below the floor and one above the ceiling, and there is no constant that
 * fixes it either.
 *
 * ## What happens when two writes land 573ms apart
 *
 * Nothing collides, and the margin is bigger than it looks. The 573ms pair is writes 2
 * and 3 (8,758ms to 9,331ms), which land in **different blocks**, so the second wipe
 * starts 299ms after the first finished. The tightest *same-block* pair is writes 3 and 4
 * at **593ms**, both in the button. And the rule if a faster agent ever closed the gap is
 * the ghost's, unchanged: a new wipe replaces the old rather than joining it, so the key
 * remounts the layer and the older boundary goes. **One revision back, always.** Two
 * boundaries travelling over one frame would be unreadable in a way one never is.
 *
 * ## Why the boundary is soft by 8px, and why it has no ink
 *
 * No line, no colour, no band. The thread colour is the human's selection and a sweep
 * wants to be coloured more than anything else in this family does, so it gets nothing:
 * the boundary is visible because the two sides of it differ, and invisible where they do
 * not, which is the same rule as the ghost's cancellation.
 *
 * The 8px falloff is not decoration. At 152 drawn pixels this page's body copy is five
 * pixels tall, and a hard cut travelling through five-pixel text tears it a scanline at a
 * time; the soft edge means the old and the new are blended for 8 of the 329 pixels,
 * **2.4% of the travel, and never at rest**. `agent-hand--ghost-hold` measured the fault
 * this family is most afraid of and named it precisely — a third of the frame doubled
 * *and standing still* reads as a rendering fault. Eight pixels of blend under a boundary
 * moving at 1,200 px/s is at any pixel for under seven milliseconds.
 *
 * ## Whether it composes with the ghost, and the answer is that it replaces it
 *
 * They were drawn together rather than reasoned about, and then photographed at 166ms
 * into write 11. The arithmetic predicts it: ahead of the boundary the old render is
 * already opaque, so a 0.3 ghost under it contributes exactly nothing, and behind the
 * boundary the old render is gone, so what is left is the ghost on its own — **a 30%
 * doubling of the region the wipe has just finished resolving**, held for the ghost's
 * remaining 420ms after the 274ms sweep has ended.
 *
 * The photograph is worse than the arithmetic sounds, and it is worse in an instructive
 * place. **The doubling is behind the boundary rather than ahead of it**, which is the
 * opposite of where anybody would look for it: the part of the frame the wipe has already
 * *finished* is the part carrying two headlines, two buttons and two menus at once, while
 * the part still travelling is clean. So composing them takes the one region the wipe has
 * made unambiguous and makes it the ambiguous one. The ghost adds none of its information
 * and all of its fault, and it adds the fault to the wrong half.
 *
 * So they do not compose, and the wipe is the one to keep, on the ghost's own terms:
 *
 *   *what changed*   both answer it, and the wipe answers it at full contrast rather
 *                    than at 0.3, so at 152px it is legible where a 0.3 smear is not
 *   *what it was*    the wipe shows the old state at **full strength** while the boundary
 *                    is above it, where the ghost never showed it above 30%
 *   *the reflow*     the wipe reveals it in the order it propagates, top to bottom, which
 *                    is the direction a reflow actually travels
 *   *the bug reading* the ghost bought it with a constant, the cap. The wipe gets it from
 *                    geometry: at no instant are two designs at comparable strength on
 *                    the same pixel, because a boundary is a partition and not a blend
 *   *the silence*    identical, and for the identical reason
 *   *the price*      identical. Two renders and a mask instead of two renders and an
 *                    opacity, and the same outgoing-document problem to solve above 400
 *                    drawn pixels
 *
 * **What the ghost keeps and the wipe gives up is simultaneity.** The ghost holds the
 * whole old state and the whole new state on screen at once, so you could compare them if
 * you could read them. The wipe never does: at any instant you have the top of the new
 * and the bottom of the old and a seam between them. That is a real loss, and it is
 * smaller than it sounds, because `--ghost` had already conceded that at 152 drawn pixels
 * it answers *where* and never *what*. Simultaneity you cannot read is not simultaneity.
 *
 * That is a significant thing to say about the maintainer's favourite mechanism, so it is
 * said plainly: **on this evidence the ghost is the wipe with its direction taken out and
 * its contrast capped to make the result survivable.**
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so the revision goes from 0 to 13 in one commit and
 * there is no sequence to wipe. The layer is disabled outright rather than slowed:
 * a boundary that crosses the frame once, between the found design and the finished one,
 * would be the entire page changing under a moving line at the one moment nobody wrote
 * anything. Stillness gets the design the agent left, with nothing over it.
 */

/** how far the boundary is blurred, in drawn pixels */
const SOFT = 8;
/** drawn pixels a millisecond */
const RATE = 1.2;
/** spool's own cover fade, so a wipe is never shorter than a reboot's seam */
const FLOOR = 180;
/** 573ms between the tightest pair of writes, less the 153ms of clear air `--ghost` settled on */
const CEIL = 420;

/**
 * Off the mark at once, near constant through the middle, settling in the last fifth.
 *
 * A wipe that decelerates hard reads as *stopping*, and a boundary that stops is the
 * static doubling this direction is built to avoid. A wipe that is dead linear starts and
 * ends on a step. This is neither, and the middle third is where the velocity claim is
 * actually made.
 */
const SWEEP = [0.2, 0.55, 0.35, 1] as const;

/** how long a boundary takes to cross a frame of this drawn height */
export function wipeMs(height: number): number {
	return Math.round(Math.min(CEIL, Math.max(FLOOR, height / RATE)));
}

/**
 * The revision the wipe is putting in, or nothing.
 *
 * Only ever a step forward, and one at a time. A replay drops the revision back to zero
 * in one commit, and a boundary carrying the finished design over the found one would be
 * the whole page rewritten at the one moment nobody wrote anything.
 */
export function useWipe(rev: number): { readonly from: number; readonly key: number } | null {
	const still = useReducedMotion() === true;
	const [wipe, setWipe] = useState<{ from: number; key: number } | null>(null);
	const last = useRef(rev);

	useEffect(() => {
		const before = last.current;
		last.current = rev;
		if (still || rev <= before) {
			setWipe(null);
			return;
		}
		setWipe({ from: before, key: rev });
		// the longest a boundary can be alive is the ceiling, whatever the frame's height
		const timer = window.setTimeout(() => setWipe(null), CEIL);
		return () => window.clearTimeout(timer);
	}, [rev, still]);

	return still ? null : wipe;
}

/**
 * The frame, with the write being put into it.
 *
 * The current render is the frame — opaque, in the flow, exactly what the canvas would
 * draw with no agent anywhere. The previous render is a sibling above it, masked, and it
 * touches nothing: no filter, no colour, no border. It is the design's own earlier state
 * in the design's own colours, which is why this direction spends no accent either.
 *
 * `height` is the frame's **drawn** height rather than its authored one, because the
 * journey a person watches is in screen pixels and the rate is a rate of those.
 */
export function Wiped({
	rev,
	wipe,
	height,
	draw,
}: {
	rev: number;
	wipe: { readonly from: number; readonly key: number } | null;
	height: number;
	draw: (rev: number) => ReactNode;
}) {
	return (
		<div className="relative h-full w-full">
			{draw(rev)}
			{wipe === null ? null : (
				<Boundary key={wipe.key} height={height}>
					{draw(wipe.from)}
				</Boundary>
			)}
		</div>
	);
}

/** the previous render, kept only below a line that is on its way down */
function Boundary({ height, children }: { height: number; children: ReactNode }) {
	const edge = useMotionValue(0);
	const lead = useTransform(edge, (at: number) => at - SOFT);
	const mask = useMotionTemplate`linear-gradient(to bottom, rgba(0,0,0,0) ${lead}px, rgba(0,0,0,1) ${edge}px)`;

	useEffect(() => {
		edge.set(0);
		const run = animate(edge, height + SOFT, { duration: wipeMs(height) / 1000, ease: SWEEP });
		return () => run.stop();
	}, [edge, height]);

	return (
		<motion.div
			className="pointer-events-none absolute inset-0"
			style={{ maskImage: mask, WebkitMaskImage: mask }}
			aria-hidden="true"
		>
			{children}
		</motion.div>
	);
}
