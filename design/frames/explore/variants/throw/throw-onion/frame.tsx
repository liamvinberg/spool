import { motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/tvarso-checkout";
import { PeekRing, StillCard } from "shared/ui/variants-feel";
import { regionsBetween, saysRegions } from "shared/ui/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "shared/ui/variants-shell";
import { useDecision } from "shared/lib/variants-decision";
import { EASE } from "shared/lib/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * Two candidates in the same pixels at the same time.
 *
 * Hovering a name lays that candidate over the resting one at 62%, the way an
 * animator flips a drawing over the one underneath. Everything the two share
 * lands on itself and stays crisp; everything that differs doubles, so the
 * difference is not outlined or named or animated, it is simply the only part
 * of the card that looks strange. Push the pointer down and the ghost goes
 * solid, which is the same look as a peek. Let go and it lifts.
 *
 * The claim is that a superimposition is faster to read than two cards side by
 * side and more honest than a swap: you never have to remember what was there,
 * because it is still there. The counter-claim is that two paragraphs of small
 * type on top of each other is mud, and `empty` over a full card is mostly mud.
 * Both are true, which is what makes it worth a frame.
 */

const GHOST = 0.62;

export default function ThrowOnionFrame() {
	const decision = useDecision();
	const [ghost, setGhost] = useState<VariationId | null>(null);
	const [solid, setSolid] = useState(false);
	const [pulse, setPulse] = useState(0);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const over = decision.candidates.find((one) => one.id === ghost && one.id !== resting.id) ?? null;

	return (
		<VariantsScreen
			name="throw--onion"
			argues="Hover a name and that candidate lies over this one. What matches stays crisp, what differs doubles."
			hint={open ? "hover a name to lay it over · hold to go solid · click to rest on it" : "decided"}
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
					count={open ? decision.candidates.length : undefined}
					right={open ? <KeepVerb onKeep={() => decision.keep(over?.id ?? resting.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<div className="relative overflow-hidden rounded-[8px]">
						<StillCard variation={resting.id} scale={FIELD_SCALE} />
						<motion.div
							className="pointer-events-none absolute inset-0"
							initial={false}
							animate={{ opacity: over === null ? 0 : solid ? 1 : GHOST }}
							transition={{ duration: over === null ? 0.08 : 0.11, ease: EASE }}
						>
							{over === null ? null : <StillCard variation={over.id} scale={FIELD_SCALE} />}
						</motion.div>
					</div>
					<PeekRing peeking={over !== null} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div
						className="mt-7 flex flex-col gap-2.5"
						onPointerLeave={() => {
							setGhost(null);
							setSolid(false);
						}}
					>
						<div className="-ml-1 flex items-center">
							{decision.candidates.map((variation) => {
								const on = variation.id === (over?.id ?? resting.id);
								return (
									<button
										key={variation.id}
										type="button"
										onPointerEnter={() => setGhost(variation.id)}
										onPointerDown={() => setSolid(true)}
										onPointerUp={() => setSolid(false)}
										onFocus={() => setGhost(variation.id)}
										onClick={() => {
											decision.look(variation.id);
											setGhost(null);
											setSolid(false);
											setPulse((count) => count + 1);
										}}
										className={cn(
											"flex h-6 items-center rounded-xs px-2 font-mono text-2xs leading-3 transition-colors duration-100",
											variation.id === resting.id
												? "text-thread"
												: on
													? "bg-raised text-text"
													: "text-muted/60 hover:text-text",
										)}
									>
										{variation.label}
									</button>
								);
							})}
						</div>
						<span className="ml-1 flex items-center gap-2 font-mono text-2xs leading-3">
							<span className={over === null ? "text-thread" : "text-text"}>{over?.label ?? resting.label}</span>
							<span className="text-muted/50">
								{over === null
									? "resting here"
									: `over ${resting.label} · doubling in ${saysRegions(regionsBetween(over.id, resting.id))}`}
							</span>
						</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
