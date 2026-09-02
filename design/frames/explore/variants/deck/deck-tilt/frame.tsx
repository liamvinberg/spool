import { motion } from "motion/react";
import { useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/tvarso-checkout";
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
import { useKey } from "shared/lib/variants-cycle";
import { useDecision } from "shared/lib/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * A hand of cards: bring the pointer near and it fans just enough to count.
 *
 * Nothing is pressed and no mode is entered. The deck rests as one card with a
 * thickness; the pointer arriving anywhere on the frame fans it by a few
 * degrees around a point below the bottom edge, the way a hand of cards opens,
 * so you can see how many there are and roughly what they are without a lift, a
 * dim, or a trip to the rail. Hover one of the fanned cards and it comes
 * forward; leave the frame and the hand closes.
 *
 * The fan is deliberately small. It has one job — say how many and hint at what
 * — and the moment it opens far enough to read a card properly it has become
 * the lifted deck, with all of that take's costs.
 */

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

export default function DeckTiltFrame() {
	const decision = useDecision();
	const [near, setNear] = useState(false);
	const [peek, setPeek] = useState<VariationId | null>(null);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const resting = decision.showing;
	const showing = set.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;
	const front = Math.max(0, set.findIndex((one) => one.id === showing.id));

	return (
		<VariantsScreen
			name="deck--tilt"
			argues="The deck fans a few degrees under the pointer, just far enough to count them."
			hint={open ? "bring the pointer near · hover a card to look · click to rest there" : "decided"}
		>
			<Neighbour x={40} y={190} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={648} y={190} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={336} y={190} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? set.length : undefined}
					right={
						<>
							<span className={cn("font-mono text-2xs leading-3", peeking ? "text-text" : "text-muted")}>
								{showing.label}
							</span>
							{open ? <KeepVerb onKeep={() => decision.keep(showing.id)} /> : <PlayVerb />}
						</>
					}
				/>
				<div
					className="relative"
					style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}
					onPointerEnter={() => setNear(true)}
					onPointerLeave={() => {
						setNear(false);
						setPeek(null);
					}}
				>
					{set.map((variation, index) => {
						const rank = (index - front + set.length) % set.length;
						const spread = rank === 0 ? 0 : rank;
						return (
							<motion.button
								key={variation.id}
								type="button"
								aria-label={variation.label}
								onPointerEnter={() => setPeek(variation.id)}
								onFocus={() => setPeek(variation.id)}
								onClick={() => {
									decision.look(variation.id);
									setPeek(null);
								}}
								className="absolute top-0 left-0 overflow-hidden rounded-[8px] border border-border-raised"
								style={{
									width: CARD_W * FIELD_SCALE,
									height: CARD_H * FIELD_SCALE,
									zIndex: set.length - rank,
									transformOrigin: "50% 130%",
								}}
								initial={false}
								animate={{
									rotate: near ? spread * 5.5 : spread * 1.2,
									x: near ? spread * 10 : spread * 3,
									y: near ? spread * -2 : 0,
								}}
								transition={SPRING}
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
									animate={{ opacity: rank === 0 ? 0 : near ? 0.2 : 0.4 }}
									transition={SPRING}
								/>
								<motion.span
									className="absolute right-2 bottom-2 rounded-xs bg-bg/85 px-1.5 py-0.5 font-mono text-2xs text-text leading-3 backdrop-blur"
									initial={false}
									animate={{ opacity: near && rank !== 0 ? 1 : 0 }}
								>
									{variation.label}
								</motion.span>
							</motion.button>
						);
					})}
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] z-20 rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>
			</Placed>
		</VariantsScreen>
	);
}
