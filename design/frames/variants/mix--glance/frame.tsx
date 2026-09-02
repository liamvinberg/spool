import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/tvarso-checkout";
import { GlanceCard, NotchCover, regionsBetween, saysRegions } from "shared/ui/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	SelectionRing,
	VariantsScreen,
} from "shared/ui/variants-shell";
import { useDecision } from "shared/lib/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * One grammar for the whole decision: hover to glance, hold to compare, press
 * to keep.
 *
 * Each verb gets the input it deserves. Glancing is the thing you do forty
 * times, so it costs a pointer move and nothing else: the covers under the
 * frame swap the card instantly and outline what changed. Comparing is the
 * thing you do twice, so it costs a held key and takes the whole width for as
 * long as you hold it. Keeping is the thing you do once, so it is the only one
 * that needs a press, and it is the only one that survives letting go.
 *
 * Three verbs, three costs, in that order. Nothing here is a mode, nothing has
 * to be shut, and the only state that outlives your hands is the decision
 * itself.
 */

const OVER = 0.34;
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

export default function MixGlanceFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	const [held, setHeld] = useState(false);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const resting = decision.showing;
	const showing = set.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key !== " ") return;
			event.preventDefault();
			setHeld(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.key === " ") setHeld(false);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	return (
		<VariantsScreen
			name="mix--glance"
			argues="Hover to glance, hold space to compare, press to keep. One grammar, three costs."
			hint={open ? "hover a cover · hold space for all of them · press keep to end it" : "decided"}
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
					right={open ? <KeepVerb onKeep={() => decision.keep(showing.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<GlanceCard
						variation={showing.id}
						scale={FIELD_SCALE}
						against={peeking ? resting.id : undefined}
						dimUnchanged={peeking}
					/>
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-2.5" onPointerLeave={() => setPeek(null)}>
						<div className="flex items-center gap-1.5">
							{set.map((variation) => (
								<NotchCover
									key={variation.id}
									variation={variation}
									state={variation.id === showing.id ? (peeking ? "peeking" : "resting") : "idle"}
									onPeek={() => setPeek(variation.id)}
									onLeave={() => setPeek(null)}
									onPin={() => {
										decision.look(variation.id);
										setPeek(null);
									}}
								/>
							))}
						</div>
						<span className="flex items-center gap-2 font-mono text-2xs leading-3">
							<span className={peeking ? "text-text" : "text-thread"}>{showing.label}</span>
							<span className="text-muted/50">
								{peeking ? `differs in ${saysRegions(regionsBetween(showing.id, resting.id))}` : "hold space to compare"}
							</span>
						</span>
					</div>
				) : null}
			</Placed>

			{/* the second verb: the whole set, for exactly as long as the key is down */}
			<AnimatePresence>
				{held && open ? (
					<motion.div
						className="absolute inset-x-0 top-[104px] z-30 flex justify-center"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={SPRING}
					>
						<div className="flex flex-col gap-3 rounded-lg border border-border-raised bg-bg/95 p-3.5 backdrop-blur">
							<span className="px-0.5 font-mono text-2xs text-muted leading-3">
								held · {set.length} candidates · let go and this is gone
							</span>
							<div className="flex items-start gap-3">
								{set.map((variation) => {
									const on = variation.id === showing.id;
									return (
										<div key={variation.id} className="flex flex-col gap-1.5">
											<span className={cn("font-mono text-2xs leading-3", on ? "text-thread" : "text-muted/60")}>
												{variation.label}
											</span>
											<div
												className={cn(
													"overflow-hidden rounded-[5px] border",
													on ? "border-thread" : "border-border-raised",
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
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</VariantsScreen>
	);
}
