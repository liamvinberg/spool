import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import {
	FIELD_SCALE,
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
 * The lift, with the ceremony taken out of it.
 *
 * Round one's deck dimmed the whole canvas and slid the cards sideways under a
 * strong perspective, which made the lift an event: something you enter and
 * have to leave. Here the same depth is used and none of that is: the cascade
 * grows from the frame's own corner, the neighbours stay lit, the camera does
 * not move, and the cards keep their colour. It reads as the frame opening
 * rather than the canvas changing state.
 *
 * Keeping is on the card, where the pointer already is. Escape drops the deck
 * back, and the frame is where it was, because it never left.
 */

const STEP = 88;
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

export default function DeckLiftFrame() {
	const decision = useDecision();
	const [lifted, setLifted] = useState(false);
	useKey("Escape", useCallback(() => setLifted(false), []));
	useKey("ArrowRight", decision.next, !lifted);
	useKey("ArrowLeft", decision.prev, !lifted);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const front = Math.max(0, set.findIndex((one) => one.id === decision.showing.id));

	return (
		<VariantsScreen
			name="deck--lift"
			argues="The cascade grows out of the frame's own corner. Nothing dims, nothing pans, nothing is a mode."
			hint={open ? "click the stack to lift it · click a card to keep it · esc drops it back" : "decided"}
		>
			<Neighbour x={40} y={210} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={648} y={210} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={200} y={210} z={20}>
				<div style={{ width: CARD_W * FIELD_SCALE }}>
					<FrameLabel
						name="checkout"
						selected
						stacked={open}
						count={open ? set.length : undefined}
						right={open ? <KeepVerb onKeep={() => decision.keep(decision.showing.id)} /> : <PlayVerb />}
					/>
				</div>
				<div className="relative" style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}>
					{set.map((variation, index) => {
						const rank = (index - front + set.length) % set.length;
						const isFront = rank === 0;
						return (
							<motion.div
								key={variation.id}
								className="absolute top-0 left-0"
								style={{
									width: CARD_W * FIELD_SCALE,
									height: CARD_H * FIELD_SCALE,
									zIndex: set.length - rank,
								}}
								initial={false}
								animate={{
									x: lifted ? rank * STEP : rank * 6,
									y: lifted ? rank * -14 : rank * 6,
									scale: lifted ? 1 - rank * 0.02 : 1,
								}}
								transition={SPRING}
							>
								<button
									type="button"
									title={lifted ? `keep ${variation.label}` : "lift the deck"}
									onClick={() => {
										if (!lifted) {
											setLifted(true);
											return;
										}
										if (isFront) decision.keep(variation.id);
										else decision.look(variation.id);
									}}
									className={cn(
										"relative block h-full w-full overflow-hidden rounded-[8px] border",
										isFront ? "border-transparent" : "border-border-raised",
									)}
								>
									<div
										style={{
											width: CARD_W,
											height: CARD_H,
											transform: `scale(${FIELD_SCALE})`,
											transformOrigin: "top left",
										}}
									>
										<TvarsoCheckout variation={variation.id} />
									</div>
									<motion.span
										className="absolute inset-0 bg-bg"
										initial={false}
										animate={{ opacity: isFront ? 0 : lifted ? 0.12 : 0.4 }}
										transition={SPRING}
									/>
								</button>
								{/* the front card names itself under the deck; the ones behind name
								    themselves above their own top edge, where nothing covers them */}
								<motion.span
									className={cn(
										"absolute left-0 font-mono text-2xs leading-3",
										isFront ? "top-[calc(100%+8px)] text-thread" : "-top-4 text-muted",
									)}
									initial={false}
									animate={{ opacity: lifted ? 1 : 0 }}
									transition={{ duration: 0.16 }}
								>
									{variation.label}
									{isFront ? " · click to keep" : ""}
								</motion.span>
							</motion.div>
						);
					})}
					{lifted ? null : <SelectionRing size="360 × 620" />}
				</div>
			</Placed>
		</VariantsScreen>
	);
}
