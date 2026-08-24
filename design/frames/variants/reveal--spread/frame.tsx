import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, VARIATIONS, variationAt } from "../../../shared/ui/tvarso-checkout";
import { FIELD_H, FIELD_SCALE, FIELD_W, FrameLabel, PlayVerb, SelectionRing, StackIcon, VariantsScreen } from "../../../shared/ui/variants-shell";
import { useArrows, useCycle, useKey } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * Variations as siblings you can put on the field for a moment, and take off it
 * again.
 *
 * Nothing is stacked and nothing is behind anything: spreading inserts the
 * other three where they would live if a person had laid them out by hand, the
 * neighbouring frames slide over to make room, and the camera pulls back to fit
 * the set the way it would after any other arrange. Press one and the rest fold
 * back into it.
 *
 * The claim: the canvas already knows how to hold four things side by side, and
 * a set of variations wants comparison more than it wants depth. The cost is
 * the whole field: at four variations the zoom drops to 50% and the page next
 * to this one is off screen.
 */

const SPRING = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } as const;

export default function RevealSpreadFrame() {
	const cycle = useCycle(VARIATIONS.length);
	const [spread, setSpread] = useState(false);
	useArrows(cycle, !spread);
	useKey("Escape", useCallback(() => setSpread(false), []));
	useKey(
		" ",
		useCallback(() => setSpread((open) => !open), []),
	);
	const facing = variationAt(cycle.index);
	const shown = spread ? VARIATIONS : [facing];

	return (
		<VariantsScreen
			zoom={spread ? "50%" : "80%"}
			hint={spread ? "click one to make it the face · esc folds them back" : "space spreads the variations onto the field"}
		>
			<div className="absolute inset-0 flex items-center justify-center">
				<motion.div
					className="flex w-max items-start gap-9"
					initial={false}
					animate={{ scale: spread ? 0.62 : 1 }}
					transition={SPRING}
					style={{ transformOrigin: "center center" }}
				>
					<motion.div layout transition={SPRING} className="flex flex-col gap-1.5">
						<FrameLabel name="timetable" paused stacked />
						<div className="overflow-hidden rounded-[8px]">
							<Scaled scale={FIELD_SCALE}>
								<TvarsoTimetable />
							</Scaled>
						</div>
					</motion.div>

					<motion.div layout transition={SPRING} className="flex items-start gap-5">
						<AnimatePresence initial={false} mode="popLayout">
							{shown.map((variation) => {
								const face = variation.id === facing.id;
								return (
									<motion.div
										key={variation.id}
										layout
										initial={{ opacity: 0, scale: 0.94 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.94 }}
										transition={SPRING}
										className="flex flex-col gap-1.5"
									>
										<FrameLabel
											name={spread ? variation.frame : "checkout"}
											selected={face}
											stacked={!spread}
											width={FIELD_W}
											right={
												spread ? (
													face ? (
														<span className="font-mono text-2xs text-thread leading-3">face</span>
													) : undefined
												) : (
													<>
														<button
															type="button"
															onClick={() => setSpread(true)}
															className="flex items-center gap-1 rounded-xs bg-raised px-1.5 py-[3px] font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
														>
															<StackIcon className="h-2.5 w-2.5" />
															spread {VARIATIONS.length}
														</button>
														<PlayVerb />
													</>
												)
											}
										/>
										<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
											<button
												type="button"
												aria-label={`Make ${variation.label} the face`}
												onClick={() => {
													cycle.go(VARIATIONS.indexOf(variation));
													setSpread(false);
												}}
												className={cn(
													"block h-full w-full cursor-pointer overflow-hidden rounded-[8px]",
													spread && !face && "opacity-90 transition-opacity hover:opacity-100",
												)}
											>
												<Scaled scale={FIELD_SCALE}>
													<TvarsoCheckout variation={variation.id} />
												</Scaled>
											</button>
											{face && !spread ? <SelectionRing size="360 × 620" /> : null}
										</div>
									</motion.div>
								);
							})}
						</AnimatePresence>
					</motion.div>

					<motion.div layout transition={SPRING} className="flex flex-col gap-1.5">
						<FrameLabel name="ticket" paused />
						<div className="overflow-hidden rounded-[8px]">
							<Scaled scale={FIELD_SCALE}>
								<TvarsoTicket />
							</Scaled>
						</div>
					</motion.div>
				</motion.div>
			</div>

			{/* while they are out, the set says what it is and how to put it away */}
			<AnimatePresence>
				{spread ? (
					<motion.div
						className="absolute top-[76px] left-1/2 -translate-x-1/2"
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
					>
						<span className="flex items-center gap-2 rounded-sm bg-raised px-2 py-1 font-mono text-2xs text-muted leading-3">
							checkout spread · {VARIATIONS.length} on the field
							<button type="button" onClick={() => setSpread(false)} className="text-text transition-colors hover:text-thread">
								fold
							</button>
						</span>
					</motion.div>
				) : null}
			</AnimatePresence>
		</VariantsScreen>
	);
}
