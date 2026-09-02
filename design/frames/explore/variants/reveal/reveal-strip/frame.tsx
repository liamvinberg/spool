import { motion } from "motion/react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import {
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	SelectionRing,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * The frame is a window, and the candidates run past it.
 *
 * Nothing opens and nothing spreads: the frame's own bounds stay exactly where
 * they are, and the set slides through them. Twenty two pixels of the previous
 * and the next card sit outside the ring, dimmed, so the field says there is
 * more of this frame in a direction that is not the field. Drag the card
 * sideways or press ← →, and it moves with the weight of a thing being pushed
 * rather than a thing being toggled. Keep stops the pushing for good.
 *
 * The claim: looking through a set is travel, so it should read as travel. The
 * cost is that the ghosts are only there while the frame is selected, and a set
 * of ten is a long way to push before you can decide.
 */

const GUTTER = 26;
const STEP = FIELD_W + GUTTER;
const SPRING = { type: "spring", stiffness: 300, damping: 34, mass: 0.85 } as const;

export default function RevealStripFrame() {
	const decision = useDecision();
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const set = decision.candidates;
	const open = decision.standing === "open";
	const facing = decision.showing;
	const index = Math.max(0, set.findIndex((one) => one.id === facing.id));

	return (
		<VariantsScreen
			name="reveal--strip"
			argues="The frame is a window and the candidates slide through it, ghosts showing at both edges." hint={open ? "drag the card sideways, or ← → · keep ends the decision" : "decided · the window holds one card"}>
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
					stacked={open}
					count={open ? set.length : undefined}
					right={
						<>
							<span className="font-mono text-2xs text-muted leading-3">{facing.label}</span>
							{open ? <KeepVerb onKeep={() => decision.keep(facing.id)} /> : <PlayVerb />}
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
								if (info.offset.x < -50) decision.next();
								else if (info.offset.x > 50) decision.prev();
							}}
							animate={{ x: -index * STEP }}
							transition={SPRING}
						>
							{set.map((variation, at) => {
								const facingThis = at === index;
								return (
									<motion.button
										key={variation.id}
										type="button"
										aria-label={`Show ${variation.label}`}
										onClick={() => decision.look(variation.id)}
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
					{set.map((variation, at) => (
						<button
							key={variation.id}
							type="button"
							aria-label={`Show ${variation.label}`}
							onClick={() => decision.look(variation.id)}
							className="flex h-3 items-center"
						>
							<span
								className={cn(
									"h-[3px] rounded-full transition-all duration-200",
									at === index ? "w-6 bg-thread" : "w-3 bg-border-raised",
								)}
							/>
						</button>
					))}
					<span className="ml-1 font-mono text-2xs text-muted/60 leading-3">
						{open ? `candidate ${index + 1} of ${set.length}` : "kept"}
					</span>
				</div>
			</Placed>
		</VariantsScreen>
	);
}
