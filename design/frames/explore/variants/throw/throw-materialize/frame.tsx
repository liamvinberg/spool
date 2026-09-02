import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { PeekRing, StillCard, SwapCard } from "shared/ui/explore/variants/variants-feel";
import { regionsBetween, saysRegions } from "shared/ui/explore/variants/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	PlayVerb,
	StackIcon,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { EASE } from "shared/lib/explore/variants/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * The canvas is the compare surface, for as long as you are looking at it.
 *
 * The count beside the frame's name is the only thing this take adds. Put the
 * pointer on it and the other candidates come up on the field beside the frame,
 * one after another, as small frames with their own names — not a panel, not a
 * sheet, not a lightbox: the same field, briefly holding more frames than the
 * project has. Move away and they are gone, and nothing was created, arranged
 * or cleaned up.
 *
 * It is the answer to the complaint that a set has to live somewhere. It lives
 * on the canvas, and the canvas is infinite, so a set can be spread out for the
 * two seconds you need it and cost nothing for the rest of the day. Hovering
 * one lifts it out of the ghosts and puts it in the frame; clicking rests the
 * decision there.
 *
 * The thing to argue with: real estate. Here there is empty field under the
 * frame, and on a full canvas the ghosts would land on top of somebody's work.
 * Either they push the neighbours aside, which moves everything, or they float
 * over them, which is a panel wearing a costume.
 */

const GHOST = 0.3;

export default function ThrowMaterializeFrame() {
	const decision = useDecision();
	const [showing, setShowing] = useState(false);
	const [over, setOver] = useState<VariationId | null>(null);
	const [pulse, setPulse] = useState(0);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const looked = decision.candidates.find((one) => one.id === over) ?? resting;
	const peeking = looked.id !== resting.id;
	const others = decision.candidates.filter((one) => one.id !== resting.id);
	const out = showing && open;

	return (
		<VariantsScreen
			name="throw--materialize"
			argues="Hover the count and the other candidates come up on the field as frames. Move away and they never happened."
			hint={out ? "hover one to put it in the frame · click to rest on it" : "hover the count beside the name"}
		>
			<Neighbour x={48} y={120} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={624} y={120} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<div
				className="absolute flex flex-col gap-1.5"
				style={{ left: 336, top: 120, zIndex: 2 }}
				onPointerLeave={() => {
					setShowing(false);
					setOver(null);
				}}
			>
				<div className="flex min-w-0 items-center gap-1.5 font-mono text-sm leading-4" style={{ width: 216 }}>
					<button
						type="button"
						onPointerEnter={() => setShowing(true)}
						onFocus={() => setShowing(true)}
						className={cn(
							"flex items-center gap-1 rounded-xs px-0.5 transition-colors duration-100",
							out ? "text-text" : "text-muted/70 hover:text-text",
						)}
					>
						<StackIcon className="h-3 w-3 shrink-0" />
						<span className="font-mono text-2xs leading-3">{decision.candidates.length}</span>
					</button>
					<span className="min-w-0 truncate text-thread">checkout</span>
					<span className="ml-auto flex shrink-0 items-center gap-1.5">
						{open ? <KeepVerb onKeep={() => decision.keep(looked.id)} /> : <PlayVerb />}
					</span>
				</div>
				<div className="relative">
					<SwapCard variation={looked.id} scale={FIELD_SCALE} duration={0.09} />
					<PeekRing peeking={peeking} size="360 × 620" pulse={pulse} />
				</div>

				{/* the ghosts: real frames on the field for as long as the pointer is here */}
				<AnimatePresence>
					{out ? (
						<motion.div
							className="mt-8"
							initial={{ opacity: 1 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0, transition: { duration: 0.09, ease: "linear" } }}
						>
							<div className="flex items-start gap-5">
									{others.map((variation, index) => {
										const on = variation.id === over;
										return (
											<motion.button
												key={variation.id}
												type="button"
												onPointerEnter={() => setOver(variation.id)}
												onFocus={() => setOver(variation.id)}
												onClick={() => {
													decision.look(variation.id);
													setShowing(false);
													setOver(null);
													setPulse((count) => count + 1);
												}}
												className="flex flex-col items-start gap-1.5"
												initial={{ opacity: 0, y: 6 }}
												animate={{ opacity: on ? 1 : 0.72, y: 0 }}
												transition={{ duration: 0.14, ease: EASE, delay: index * 0.025 }}
											>
												<span
													className={cn(
														"font-mono text-2xs leading-3 transition-colors duration-100",
														on ? "text-text" : "text-muted/60",
													)}
												>
													{variation.label}
												</span>
												<span
													className={cn(
														"overflow-hidden rounded-[6px] border transition-colors duration-100",
														on ? "border-thread" : "border-border-raised",
													)}
												>
													<StillCard variation={variation.id} scale={GHOST} />
												</span>
											</motion.button>
										);
									})}
									<motion.span
										className="self-end pb-1 font-mono text-2xs text-muted/45 leading-3"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.14, ease: EASE, delay: 0.1 }}
									>
										{over === null
											? "on the field · gone when you leave"
											: `differs in ${saysRegions(regionsBetween(looked.id, resting.id))}`}
									</motion.span>
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</VariantsScreen>
	);
}
