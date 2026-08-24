import { AnimatePresence, motion } from "motion/react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoCheckout,
	TvarsoTicket,
	TvarsoTimetable,
	VARIATIONS,
	variationAt,
} from "../../../shared/ui/tvarso-checkout";
import {
	ArrowIcon,
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	Neighbour,
	Placed,
	PlayVerb,
	SelectionRing,
	Thread,
	VariantsScreen,
} from "../../../shared/ui/variants-shell";
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";

/**
 * The smallest diff that could possibly work: the label row already there,
 * carrying one more thing.
 *
 * A frame with variations wears the stack glyph before its name, so the field
 * says so at any zoom and without being selected. Selected, the same row grows
 * a stepper — the variation's name and its place in the set — and ← → move it.
 * The frame never moves, never spreads, never opens: the content under the
 * label swaps and the geometry is untouched, which is the whole argument. What
 * you cannot do here is see two variations at once.
 */
export default function RevealCountFrame() {
	const cycle = useCycle(VARIATIONS.length);
	useArrows(cycle);
	const variation = variationAt(cycle.index);

	return (
		<VariantsScreen hint="← → cycles the selection">
			<Thread from={{ x: 264, y: 330 }} to={{ x: 336, y: 330 }} />
			<Thread from={{ x: 552, y: 330 }} to={{ x: 624, y: 330 }} dashed />

			<Neighbour x={48} y={140} name="timetable" stacked count={2}>
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>

			<Placed x={336} y={140} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked
					right={
						<>
							<span className="flex items-center gap-0.5 rounded-xs bg-raised px-1 py-[3px]">
								<button
									type="button"
									aria-label="Previous variation"
									onClick={cycle.prev}
									className="flex h-3 w-3 items-center justify-center text-muted transition-colors hover:text-text"
								>
									<ArrowIcon dir="left" className="h-2.5 w-2.5" />
								</button>
								<span className="min-w-[52px] text-center font-mono text-2xs text-text leading-3">
									{variation.label} {cycle.index + 1}/{VARIATIONS.length}
								</span>
								<button
									type="button"
									aria-label="Next variation"
									onClick={cycle.next}
									className="flex h-3 w-3 items-center justify-center text-muted transition-colors hover:text-text"
								>
									<ArrowIcon dir="right" className="h-2.5 w-2.5" />
								</button>
							</span>
							<PlayVerb />
						</>
					}
				/>
				<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
					<div className="absolute inset-0 overflow-hidden rounded-[8px]">
						<AnimatePresence initial={false}>
							<motion.div
								key={variation.id}
								className="absolute inset-0"
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
							>
								<Scaled scale={FIELD_SCALE} width={CARD_W} height={CARD_H}>
									<TvarsoCheckout variation={variation.id} />
								</Scaled>
							</motion.div>
						</AnimatePresence>
					</div>
					<SelectionRing size="360 × 620" />
				</div>
			</Placed>

			<Neighbour x={624} y={140} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

		</VariantsScreen>
	);
}
