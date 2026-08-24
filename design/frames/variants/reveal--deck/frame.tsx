import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, VARIATIONS, variationAt } from "../../../shared/ui/tvarso-checkout";
import {
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	Neighbour,
	Placed,
	PlayVerb,
	SelectionRing,
	VariantsScreen,
} from "../../../shared/ui/variants-shell";
import { useArrows, useCycle, useKey } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * The third dimension, taken literally: the variations are behind the frame,
 * in z, and the canvas is a plane you can lift them out of.
 *
 * At rest the stack costs eight pixels of edge — enough that the field says
 * "there is more of this" without a badge or a number. Space lifts the deck off
 * the plane and cascades it toward you under a real perspective, the field
 * dimming behind it because the deck is no longer on the field. Press a card
 * and it comes to the front, the others closing up behind it. Escape drops the
 * deck back into the plane, at whichever variation is now facing you.
 *
 * The claim: variations are one frame with depth, not four frames in a row. The
 * cost is that the spread state is a mode, and while it is up the canvas
 * underneath is not usable.
 */

const STEP = 96;
const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

export default function RevealDeckFrame() {
	const cycle = useCycle(VARIATIONS.length);
	const [spread, setSpread] = useState(false);
	useArrows(cycle);
	useKey("Escape", useCallback(() => setSpread(false), []));
	useKey(
		" ",
		useCallback(() => setSpread((open) => !open), []),
	);
	const facing = variationAt(cycle.index);

	return (
		<VariantsScreen hint="space lifts the deck · ← → cycles · esc drops it back">
			<Neighbour x={40} y={170} name="timetable" stacked count={2}>
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={640} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			{/* the field is not where the deck is any more, and it says so */}
			<motion.button
				type="button"
				aria-label="Drop the deck"
				onClick={() => setSpread(false)}
				className="absolute inset-0 z-10 cursor-default bg-bg"
				initial={false}
				animate={{ opacity: spread ? 0.62 : 0 }}
				transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
				style={{ pointerEvents: spread ? "auto" : "none" }}
			/>

			<Placed x={340} y={170} z={20}>
				<FrameLabel
					name="checkout"
					selected
					stacked
					right={
						<>
							<span className="font-mono text-2xs text-muted leading-3">
								{cycle.index + 1}/{VARIATIONS.length}
							</span>
							<PlayVerb />
						</>
					}
				/>
				<motion.div
					className="relative"
					style={{ width: FIELD_W, height: FIELD_H, perspective: 1500, transformStyle: "preserve-3d" }}
					animate={{ x: spread ? -132 : 0 }}
					transition={SPRING}
				>
					{VARIATIONS.map((variation, index) => {
						const rank = (index - cycle.index + VARIATIONS.length) % VARIATIONS.length;
						const front = rank === 0;
						return (
							<motion.div
								key={variation.id}
								className="absolute top-0 left-0 origin-top-left"
								style={{ width: FIELD_W, height: FIELD_H, zIndex: VARIATIONS.length - rank }}
								initial={false}
								animate={
									spread
										? {
												x: rank * STEP,
												y: rank * -22,
												scale: 1 - rank * 0.045,
												rotateY: -26,
												opacity: 1,
											}
										: { x: rank * 7, y: rank * 7, scale: 1, rotateY: 0, opacity: [1, 0.62, 0.44, 0.3][rank] ?? 0.3 }
								}
								transition={SPRING}
							>
								<button
									type="button"
									aria-label={`Show ${variation.label}`}
									onClick={() => (spread ? cycle.go(index) : setSpread(true))}
									className="relative block h-full w-full cursor-pointer overflow-hidden rounded-[8px]"
								>
									<Scaled scale={FIELD_SCALE}>
										<TvarsoCheckout variation={variation.id} />
									</Scaled>
									{/* lifted, a card that is not facing you is only half lit */}
									<motion.span
										className="absolute inset-0 bg-bg"
										initial={false}
										animate={{ opacity: front || !spread ? 0 : 0.3 }}
										transition={SPRING}
									/>
									<span
										className={cn(
											"absolute inset-0 rounded-[8px] border",
											front ? "border-transparent" : "border-border-raised",
										)}
									/>
								</button>
							</motion.div>
						);
					})}
					{/* the stack sticks out under the ring, so the size badge would sit on it */}
					{spread ? null : <SelectionRing />}
					{/* names live under the deck rather than on the cards: cascaded, a card
					    covers the one behind it and its label with it */}
					<div className="absolute top-[calc(100%+14px)] left-0 h-4 w-full">
						{VARIATIONS.map((variation, index) => {
							const rank = (index - cycle.index + VARIATIONS.length) % VARIATIONS.length;
							return (
								<motion.span
									key={variation.id}
									className={cn(
										"absolute top-0 left-0 font-mono text-2xs leading-3",
										rank === 0 ? "text-thread" : "text-muted",
									)}
									initial={false}
									animate={{ x: rank * STEP + 4, opacity: spread ? 1 : 0 }}
									transition={SPRING}
								>
									{variation.label}
								</motion.span>
							);
						})}
					</div>
				</motion.div>
			</Placed>

			{/* what the deck is, said once, where the readout of a lifted thing belongs */}
			<motion.div
				className="pointer-events-none absolute top-[104px] left-1/2 z-30 -translate-x-1/2"
				initial={false}
				animate={{ opacity: spread ? 1 : 0, y: spread ? 0 : -6 }}
				transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
			>
				<span className="rounded-sm bg-raised px-2 py-1 font-mono text-2xs text-muted leading-3">
					checkout · {VARIATIONS.length} variations · facing {facing.label}
				</span>
			</motion.div>
		</VariantsScreen>
	);
}
