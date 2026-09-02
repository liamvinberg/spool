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
 * The deck without the ceremony: the whole set lives in fourteen pixels of
 * paper edge, and looking is hovering an edge.
 *
 * At rest the candidates sit behind the frame, each showing seven pixels of
 * itself down the right side, so a stacked frame is visibly thicker than a
 * plain one at any zoom. Put the pointer on an edge and that card comes to the
 * front — no lift, no dimming, no mode, and the frame's own bounds never move.
 * Take the pointer off and the deck is as it was.
 *
 * It is the smallest thing on this page that still uses depth to mean "there is
 * more of this". What it cannot do is show you two at once, and an edge is a
 * seven pixel target, which is a real thing to argue about rather than a
 * detail.
 */

const SLIVER = 7;
const SPRING = { type: "spring", stiffness: 480, damping: 36, mass: 0.7 } as const;

export default function DeckMicroFrame() {
	const decision = useDecision();
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
			name="deck--micro"
			argues="Seven pixels of paper edge per candidate. Hover an edge and that one is the front card."
			hint={open ? "hover an edge to look · click it to rest there · keep ends the decision" : "decided"}
		>
			<Neighbour x={48} y={170} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={648} y={170} name="ticket">
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
					style={{ width: CARD_W * FIELD_SCALE + SLIVER * (set.length - 1), height: CARD_H * FIELD_SCALE }}
					onPointerLeave={() => setPeek(null)}
				>
					{set.map((variation, index) => {
						const rank = (index - front + set.length) % set.length;
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
								}}
								initial={false}
								animate={{ x: rank * SLIVER, y: 0 }}
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
									animate={{ opacity: rank === 0 ? 0 : 0.35 + rank * 0.08 }}
									transition={SPRING}
								/>
							</motion.button>
						);
					})}
					{peeking ? (
						<div
							className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed"
							style={{ right: SLIVER * (set.length - 1) - 3 }}
						/>
					) : (
						<div style={{ width: CARD_W * FIELD_SCALE }} className="pointer-events-none absolute inset-y-0 left-0">
							<SelectionRing size="360 × 620" />
						</div>
					)}
				</div>
			</Placed>
		</VariantsScreen>
	);
}
