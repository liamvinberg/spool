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
} from "shared/ui/tvarso-checkout";
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
	Thread,
	VariantsScreen,
} from "shared/ui/variants-shell";
import { useKey } from "shared/lib/variants-cycle";
import { useDecision } from "shared/lib/variants-decision";

/**
 * The smallest diff that could possibly work: the label row already there,
 * carrying one more thing.
 *
 * A frame with an open decision wears the stack glyph before its name, so the
 * field says there is something to settle at any zoom and without being
 * selected. Selected, the same row says which candidate you are looking at and
 * carries the verb that keeps it. ← → walk the set; there was a pair of arrows
 * in the chip and the row could not afford them.
 *
 * Keeping is one press and it is final in the same breath: the count goes, the
 * glyph goes, and the row reads `card · kept` with play back beside it. That
 * speed is the argument and the bill in one. A 216px row at this zoom holds the
 * name, the stepper and one verb, so while a decision is open, play steps
 * aside — and there is nowhere here to see two candidates at once before you
 * settle it.
 */
export default function RevealCountFrame() {
	const decision = useDecision();
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const variation = decision.showing;
	const open = decision.standing === "open";

	return (
		<VariantsScreen
			name="reveal--count"
			argues="The decision rides the label row the frame already has. Nothing opens and nothing moves." hint={open ? "← → walks the candidates · ✓ keeps one and discards the rest" : "kept · press the name to reopen the decision"}>
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
					stacked={open}
					count={open ? decision.candidates.length : undefined}
					right={
						<>
							{open ? (
								<span className="flex items-center rounded-xs bg-raised px-1.5 py-[3px]">
									<span className="text-center font-mono text-2xs text-text leading-3">{variation.label}</span>
								</span>
							) : null}
							{open ? (
								/* the act sits outside the pill, beside play: the row's other verb */
								<KeepVerb onKeep={() => decision.keep(variation.id)} />
							) : (
								<button
									type="button"
									onClick={decision.reopen}
									title="reopen the decision"
									className="font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
								>
									{variation.label} · kept
								</button>
							)}
							{open ? null : <PlayVerb />}
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
