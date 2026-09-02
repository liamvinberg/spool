import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import {
	DiscardVerb,
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	PlayVerb,
	SelectionRing,
	StackIcon,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * Put the candidates on the field, decide, and take them off it again.
 *
 * Nothing is stacked and nothing is behind anything: spreading inserts the
 * other three where they would live if a person had laid them out by hand, the
 * neighbours slide over to make room, and the camera pulls back to fit the set
 * the way it would after any other arrange. Then the gesture and the decision
 * are the same movement — press the card you want and it is kept, the other
 * three discarded, the field closing back to one frame. The ✕ on a card takes
 * that one out without settling anything.
 *
 * The claim: a decision between four things wants them at the same size, side
 * by side, at the same moment, and the canvas already knows how to do that. The
 * cost is the whole field: at four candidates the zoom drops to 50% and the
 * page next to this one is off screen.
 */

const SPRING = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } as const;

export default function RevealSpreadFrame() {
	const decision = useDecision();
	const [spread, setSpread] = useState(false);
	useKey("ArrowRight", decision.next, !spread);
	useKey("ArrowLeft", decision.prev, !spread);
	useKey("Escape", useCallback(() => setSpread(false), []));
	useKey(
		" ",
		useCallback(() => setSpread((open) => !open), []),
	);
	const facing = decision.showing;
	const open = decision.standing === "open";
	const shown = spread ? decision.candidates : [facing];

	return (
		<VariantsScreen
			name="reveal--spread"
			argues="Put the candidates on the field beside each other, compare, then fold them back."
			zoom={spread ? "50%" : "80%"}
			hint={
				spread
					? "press the one you want and the rest are discarded · ✕ takes one out · esc folds them back"
					: open
						? "space puts the candidates on the field"
						: "decided · reopen from the label"
			}
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
											stacked={!spread && open}
											width={FIELD_W}
											right={
												spread ? (
													decision.candidates.length > 1 ? (
														<DiscardVerb onDiscard={() => decision.discard(variation.id)} />
													) : undefined
												) : open ? (
													<>
														<button
															type="button"
															onClick={() => setSpread(true)}
															className="flex items-center gap-1 rounded-xs bg-raised px-1.5 py-[3px] font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
														>
															<StackIcon className="h-2.5 w-2.5" />
															spread {decision.candidates.length}
														</button>
														<PlayVerb />
													</>
												) : (
													<>
														<button
															type="button"
															onClick={decision.reopen}
															className="font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
														>
															{facing.label} · kept
														</button>
														<PlayVerb />
													</>
												)
											}
										/>
										<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
											<button
												type="button"
												aria-label={`Keep ${variation.label}`}
												title={spread ? "keep this one and discard the rest" : undefined}
												onClick={() => {
													if (spread) decision.keep(variation.id);
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
							checkout · {decision.candidates.length} candidates on the field
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
