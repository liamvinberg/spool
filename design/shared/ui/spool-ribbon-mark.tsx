import { type MotionProps, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MARK_ASPECT, MARK_MASK, MARK_VIEWBOX, STRANDS } from "../lib/ribbon-strands";
import { cn } from "../lib/utils";

/**
 * Three ways to draw the real spool mark so that it can move, and one measured reason each
 * of them is shaped the way it is.
 *
 * Nothing here abstracts the logo. `agent-alive--fold` reduced the ribbon to three hairlines
 * out of its silhouette, which is exactly what Liam reacted against — the shape was spool's
 * and the mark was not. Every component in this file draws `STRANDS`, which rejoins to the
 * identity byte for byte.
 *
 * **Why the stack is nine `<svg>` elements and not one `<svg>` with nine paths.** It costs
 * eight extra elements and buys the only thing that matters here: an HTML element's
 * `transform` and `opacity` are properties a compositor can own, and the same two properties
 * on a child *inside* an SVG are not — they go through paint. Round three's whole meter set
 * was built to catch exactly that difference (`--weight` lost on it, `--glyph` lost on it),
 * so a rig that put nine animated properties on SVG children would have failed the row's own
 * test before it drew anything. Nine sibling `<svg>` boxes, each holding one strand in place
 * in the identity's own viewBox, stack to the same picture and animate on the compositor.
 * Reasoned from where the properties live rather than benchmarked, and stated so.
 */

/**
 * The mark's drawn height, found by drawing it at six sizes rather than picked.
 *
 * Round three's glyphs were 14px, which is the right size for a bar or a dot and the wrong
 * size for this: nine strands over 660 units at 14px is a 0.6px band each, so the ribbon is a
 * grey smudge and the whole argument for using the real path is invisible. Drawn at 20, 24,
 * 26, 30, 34 and 40 with the strands alternating strength — which is the hardest case, since
 * it needs neighbours told apart and not just the silhouette read — 20 and 24 are mush, 26 is
 * marginal, and **30 is where the nine separate cleanly**. So 30 it is, in a 40px slot.
 *
 * That is 4px more transcript than every take round three drew, on every thread, forever. It
 * is the price of the mark being legible as the mark, it is stated on every frame, and it is
 * the one cost this whole round adds that round three did not have.
 */
export const MARK_H = 30;
export const MARK_W = Math.round(MARK_H * MARK_ASPECT);

export type StrandMotion = Pick<MotionProps, "animate" | "transition">;

/**
 * The nine strands, each independently addressable, stacked into the one silhouette.
 *
 * The bands overlap in y — strand 0 runs 188–267 and strand 1 runs 218–344 — so they cannot
 * be sliced into nine rows of a column. Each `<svg>` therefore carries the whole viewBox and
 * draws its own strand where the identity puts it, and the overlap is handled by the stack
 * the way the original single path handled it.
 */
export function StrandStack({
	height = MARK_H,
	className,
	strand,
}: {
	height?: number;
	className?: string;
	strand: (index: number) => StrandMotion;
}) {
	const width = Math.round(height * MARK_ASPECT);
	return (
		<span className={cn("relative block shrink-0", className)} style={{ width, height }}>
			{STRANDS.map((d, index) => (
				<motion.svg
					// biome-ignore lint/suspicious/noArrayIndexKey: the strand's index is its identity
					key={index}
					viewBox={MARK_VIEWBOX}
					className="absolute inset-0 block h-full w-full"
					fill="currentColor"
					fillRule="evenodd"
					aria-hidden="true"
					initial={false}
					{...strand(index)}
				>
					<path d={d} />
				</motion.svg>
			))}
		</span>
	);
}

/**
 * The mark as an aperture rather than an object.
 *
 * The whole ribbon becomes a `mask-image`, painted once, and whatever is handed in as a
 * child moves behind it as an ordinary HTML element. This is the split #149's finding turns
 * on and the reason nothing here can freeze the way `agent-say-arrive`'s `edge` gradient did
 * when the wire paused: the paint never animates, a transform carries it.
 */
export function MaskedMark({
	height = MARK_H,
	base,
	children,
}: {
	height?: number;
	/** the resting logo's own strength, which is what shows when nothing is passing */
	base: number;
	children: ReactNode;
}) {
	const width = Math.round(height * MARK_ASPECT);
	return (
		<span
			className="relative block shrink-0 overflow-hidden"
			style={{
				width,
				height,
				maskImage: MARK_MASK,
				WebkitMaskImage: MARK_MASK,
				maskSize: "contain",
				WebkitMaskSize: "contain",
				maskRepeat: "no-repeat",
				WebkitMaskRepeat: "no-repeat",
				maskPosition: "center",
				WebkitMaskPosition: "center",
			}}
		>
			<span className="absolute inset-0 block bg-current" style={{ opacity: base }} />
			{children}
		</span>
	);
}

/**
 * The nine strands as channels, with a thread running through each.
 *
 * Every strand returns to its own start point, so its outline is a closed loop: a dash of
 * fixed length running that loop travels out along the strand and back, which is what
 * winding looks like and is the one drawing in this family that is literally the product's
 * own noun. The loop is also the answer to the progress objection — the dash never gets
 * longer and never arrives, so there is nothing for it to be a percentage of.
 *
 * The lengths are **read off the browser** with `getTotalLength()` rather than computed, and
 * the total is handed back up so the panel prints a measured number instead of a claimed one.
 *
 * `vector-effect="non-scaling-stroke"` keeps the hairline at one device pixel while the dash
 * pattern stays in the identity's units, which is the only way a 30px drawing of a 660-unit
 * path has a stroke you can see.
 *
 * **Frozen, it holds each strand at the phase its own stagger would have put it in** rather
 * than at zero. Parking every thread at the start of its loop drew the two directions as the
 * same picture, which is a fallback that loses the distinction the take is built on; holding
 * the stagger instead leaves two mirrored staircases of arcs. That is derived from the
 * mechanism rather than invented for the still, and it is the honest half of a real weakness —
 * the difference is a *lean* rather than a shape, which is thinner than what `count` keeps.
 */
export function SpunMark({
	height = MARK_H,
	fill,
	dash,
	lap,
	inward,
	frozen,
	onLengths,
}: {
	height?: number;
	/** the resting ribbon under the threads */
	fill: number;
	/** the running thread's own strength; 0 leaves the ribbon alone */
	dash: number;
	/** ms for one lap of one strand's outline */
	lap: number;
	/** the stagger runs 8→0 rather than 0→8, and the thread runs the other way with it */
	inward: boolean;
	frozen: boolean;
	onLengths?: (total: number) => void;
}) {
	const width = Math.round(height * MARK_ASPECT);
	const held = useRef<(SVGPathElement | null)[]>([]);
	const [lengths, setLengths] = useState<readonly number[]>([]);

	useEffect(() => {
		const found = held.current.map((node) => (node === null ? 0 : node.getTotalLength()));
		setLengths(found);
		onLengths?.(Math.round(found.reduce((sum, one) => sum + one, 0)));
	}, [onLengths]);

	return (
		<svg
			viewBox={MARK_VIEWBOX}
			className="block shrink-0"
			style={{ width, height }}
			fill="none"
			aria-hidden="true"
		>
			<path d={STRANDS.join(" ")} fill="currentColor" fillRule="evenodd" opacity={fill} />
			{STRANDS.map((d, index) => {
				const length = lengths[index] ?? 0;
				const run = inward ? length : -length;
				return (
					<motion.path
						// biome-ignore lint/suspicious/noArrayIndexKey: the strand's index is its identity
						key={index}
						ref={(node: SVGPathElement | null) => {
							held.current[index] = node;
						}}
						d={d}
						stroke="currentColor"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
						opacity={dash}
						strokeDasharray={length === 0 ? undefined : `${length * 0.17} ${length * 0.83}`}
						initial={false}
						animate={
							frozen || length === 0 || dash === 0
								? { strokeDashoffset: run * (((inward ? 8 - index : index) / 9) * 0.5) }
								: { strokeDashoffset: [0, run] }
						}
						transition={
							frozen || length === 0 || dash === 0
								? { duration: 0.3, ease: "easeOut" }
								: {
										duration: lap / 1000,
										repeat: Number.POSITIVE_INFINITY,
										ease: "linear",
										delay: ((inward ? 8 - index : index) * lap) / 9000,
									}
						}
					/>
				);
			})}
		</svg>
	);
}
