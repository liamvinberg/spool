import { motion } from "motion/react";
import { useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard } from "shared/ui/explore/variants/variants-glance";
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
 * The strip is a deck, and it fans when you reach for it.
 *
 * At rest the candidates are a small stack under the frame's corner, overlapped
 * so hard they read as one thing with a thickness to it — 46 pixels of strip
 * for a set of any size. Bring the pointer near and they fan out into their own
 * covers, close enough together to take in at once. Hover one and it lifts and
 * the frame becomes it; leave and everything drops back.
 *
 * This is the deck's feeling without the deck's ceremony: no mode, no lift of
 * the frame itself, no dimmed canvas, and the fan happens in the 46 pixels the
 * stack was already using. The claim is that reaching is a gesture people
 * already make, so the fan can be free.
 */

const COVER = 0.09;
const W = CARD_W * COVER;
const SHUT = 12;
const OPEN = W + 6;
const SPRING = { type: "spring", stiffness: 460, damping: 34, mass: 0.7 } as const;

export default function PeekFanFrame() {
	const decision = useDecision();
	const [near, setNear] = useState(false);
	const [peek, setPeek] = useState<VariationId | null>(null);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const showing = decision.candidates.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;
	const set = decision.candidates;

	return (
		<VariantsScreen
			name="peek--fan"
			argues="The strip is a mini deck that fans under the pointer, so a set costs 46 pixels at rest."
			hint={open ? "reach for the stack and it fans · hover a cover to look · click to rest on it" : "decided"}
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
					<GlanceCard variation={showing.id} scale={FIELD_SCALE} />
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>

				{open ? (
					<div
						className="relative mt-7 h-[88px]"
						onPointerEnter={() => setNear(true)}
						onPointerLeave={() => {
							setNear(false);
							setPeek(null);
						}}
					>
						{set.map((variation, index) => {
							const on = variation.id === showing.id;
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
									className={cn(
										"absolute top-2 left-0 overflow-hidden rounded-[3px] border",
										variation.id === resting.id
											? "border-thread"
											: on
												? "border-text"
												: "border-border-raised",
									)}
									style={{ width: W, height: CARD_H * COVER, zIndex: set.length - index }}
									initial={false}
									animate={{
										x: near ? index * OPEN : index * SHUT,
										y: near && on ? -6 : 0,
										rotate: near ? 0 : (index - (set.length - 1) / 2) * 2.5,
									}}
									transition={SPRING}
								>
									<div
										style={{
											width: CARD_W,
											height: CARD_H,
											transform: `scale(${COVER})`,
											transformOrigin: "top left",
										}}
									>
										<TvarsoCheckout variation={variation.id} />
									</div>
									{on ? null : <span className="absolute inset-0 bg-bg/25" />}
								</motion.button>
							);
						})}
						<motion.span
							className="absolute top-[70px] left-0 font-mono text-2xs leading-3"
							initial={false}
							animate={{ opacity: near ? 1 : 0.7 }}
						>
							<span className={peeking ? "text-text" : "text-thread"}>{showing.label}</span>
							<span className="ml-2 text-muted/50">{near ? "looking" : `${set.length} candidates`}</span>
						</motion.span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
