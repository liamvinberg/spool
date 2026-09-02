import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard } from "shared/ui/explore/variants/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	SelectionRing,
	StackIcon,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * Compare without moving the world.
 *
 * Round one's spread put the candidates on the field and paid for it twice: the
 * neighbours slid over and the camera pulled back to 50%, so the price of
 * looking at four cards was losing the page around them. Here the set opens as
 * a row over the field, anchored to the frame it belongs to. The canvas keeps
 * its zoom, the neighbours keep their places, and the frame underneath stays
 * exactly where your eye left it.
 *
 * That is the whole trade. The cards are smaller than they would be on the
 * field, and one of them is sitting on top of the frame you are comparing them
 * against, which is the honest cost of not moving anything.
 */

const OVER = 0.34;
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

export default function SpreadOverlayFrame() {
	const decision = useDecision();
	const [out, setOut] = useState(false);
	useKey("Escape", useCallback(() => setOut(false), []));
	useKey(
		" ",
		useCallback(() => setOut((was) => !was), []),
	);
	useKey("ArrowRight", decision.next, !out);
	useKey("ArrowLeft", decision.prev, !out);
	const open = decision.standing === "open";
	const set = decision.candidates;

	return (
		<VariantsScreen
			name="spread--overlay"
			argues="The set opens as a row over the field. The camera never moves and neither do the neighbours."
			hint={open ? "space opens the row · press one to keep it · esc shuts it" : "decided"}
		>
			<Neighbour x={48} y={170} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={624} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={336} y={170} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? set.length : undefined}
					right={
						open ? (
							<>
								<button
									type="button"
									onClick={() => setOut(true)}
									className="flex items-center gap-1 rounded-xs bg-raised px-1.5 py-[3px] font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
								>
									<StackIcon className="h-2.5 w-2.5" />
									compare
								</button>
								<KeepVerb onKeep={() => decision.keep(decision.showing.id)} />
							</>
						) : (
							<PlayVerb />
						)
					}
				/>
				<div className="relative">
					<GlanceCard variation={decision.showing.id} scale={FIELD_SCALE} />
					<SelectionRing size="360 × 620" />
				</div>
			</Placed>

			{/* the row: over the field, anchored to the frame, nothing underneath disturbed */}
			<AnimatePresence>
				{out ? (
					<motion.div
						className="absolute top-[112px] left-1/2 z-30 -translate-x-1/2"
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={SPRING}
					>
						<div className="flex flex-col gap-3 rounded-lg border border-border-raised bg-bg/95 p-3.5 backdrop-blur">
							<div className="flex items-center gap-2 px-0.5">
								<span className="font-mono text-2xs text-muted leading-3">checkout · {set.length} candidates</span>
								<button
									type="button"
									onClick={() => setOut(false)}
									className="ml-auto font-mono text-2xs text-muted/60 leading-3 transition-colors hover:text-text"
								>
									esc
								</button>
							</div>
							<div className="flex items-start gap-3">
								{set.map((variation) => {
									const on = variation.id === decision.showing.id;
									return (
										<div key={variation.id} className="flex flex-col gap-1.5">
											<span
												className={cn(
													"font-mono text-2xs leading-3",
													on ? "text-thread" : "text-muted/60",
												)}
											>
												{variation.label}
											</span>
											<button
												type="button"
												title={`keep ${variation.label}`}
												onPointerEnter={() => decision.look(variation.id)}
												onClick={() => {
													decision.keep(variation.id);
													setOut(false);
												}}
												className={cn(
													"relative overflow-hidden rounded-[5px] border transition-colors",
													on ? "border-thread" : "border-border-raised hover:border-text",
												)}
												style={{ width: CARD_W * OVER, height: CARD_H * OVER }}
											>
												<div
													style={{
														width: CARD_W,
														height: CARD_H,
														transform: `scale(${OVER})`,
														transformOrigin: "top left",
													}}
												>
													<TvarsoCheckout variation={variation.id} />
												</div>
											</button>
										</div>
									);
								})}
							</div>
							<span className="px-0.5 font-mono text-2xs text-muted/45 leading-3">
								press one to keep it and discard the rest
							</span>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</VariantsScreen>
	);
}
