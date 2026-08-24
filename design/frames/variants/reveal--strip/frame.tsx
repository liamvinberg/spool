import { motion } from "motion/react";
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
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * The frame is a window, and its variations run past it.
 *
 * Nothing opens and nothing spreads: the frame's own bounds stay exactly where
 * they are, and the set slides through them. Twenty two pixels of the previous
 * and the next card sit outside the selection ring, dimmed, so the field says
 * there is more of this frame in a direction that is not the field. Drag the
 * card sideways or press ← →, and it slides with the weight of a thing being
 * pushed rather than a thing being toggled.
 *
 * The claim: cycling is travel, so it should look like travel. The cost is that
 * the ghosts are only readable while the frame is selected, and a set of ten
 * variations is a long way to push.
 */

const GUTTER = 26;
const STEP = FIELD_W + GUTTER;
const SPRING = { type: "spring", stiffness: 300, damping: 34, mass: 0.85 } as const;

export default function RevealStripFrame() {
	const cycle = useCycle(VARIATIONS.length);
	useArrows(cycle);
	const facing = variationAt(cycle.index);

	return (
		<VariantsScreen hint="drag the card sideways, or ← → · the frame never moves">
			<Neighbour x={40} y={170} name="timetable" stacked count={2}>
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={648} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={340} y={170} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked
					right={
						<>
							<span className="font-mono text-2xs text-muted leading-3">{facing.label}</span>
							<PlayVerb />
						</>
					}
				/>
				<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
					{/* the window is wider than the frame, which is how the ghosts get out */}
					<div
						className="absolute top-0 bottom-0 overflow-hidden"
						style={{
							left: -(GUTTER + 40),
							right: -(GUTTER + 40),
							maskImage:
								"linear-gradient(to right, transparent 0px, #000 44px, #000 calc(100% - 44px), transparent 100%)",
						}}
					>
						<motion.div
							className="absolute top-0 flex"
							style={{ left: GUTTER + 40, gap: GUTTER }}
							drag="x"
							dragMomentum={false}
							dragElastic={0.16}
							onDragEnd={(_event: PointerEvent, info: { offset: { x: number } }) => {
								if (info.offset.x < -50) cycle.next();
								else if (info.offset.x > 50) cycle.prev();
							}}
							animate={{ x: -cycle.index * STEP }}
							transition={SPRING}
						>
							{VARIATIONS.map((variation, index) => {
								const facingThis = index === cycle.index;
								return (
									<motion.button
										key={variation.id}
										type="button"
										aria-label={`Show ${variation.label}`}
										onClick={() => cycle.go(index)}
										className="relative block shrink-0 cursor-grab overflow-hidden rounded-[8px] active:cursor-grabbing"
										style={{ width: FIELD_W, height: FIELD_H }}
										initial={false}
										animate={{ opacity: facingThis ? 1 : 0.34, scale: facingThis ? 1 : 0.97 }}
										transition={SPRING}
									>
										<Scaled scale={FIELD_SCALE}>
											<TvarsoCheckout variation={variation.id} />
										</Scaled>
									</motion.button>
								);
							})}
						</motion.div>
					</div>
					<SelectionRing size="360 × 620" />
				</div>

				{/* where in the run you are, drawn as the run itself */}
				<div className="mt-7 flex items-center gap-1.5">
					{VARIATIONS.map((variation, index) => (
						<button
							key={variation.id}
							type="button"
							aria-label={`Show ${variation.label}`}
							onClick={() => cycle.go(index)}
							className="flex h-3 items-center"
						>
							<span
								className={cn(
									"h-[3px] rounded-full transition-all duration-200",
									index === cycle.index ? "w-6 bg-thread" : "w-3 bg-border-raised",
								)}
							/>
						</button>
					))}
					<span className="ml-1 font-mono text-2xs text-muted/60 leading-3">
						{cycle.index + 1} of {VARIATIONS.length}
					</span>
				</div>
			</Placed>
		</VariantsScreen>
	);
}
