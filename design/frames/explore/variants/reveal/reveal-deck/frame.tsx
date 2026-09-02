import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/tvarso-checkout";
import {
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	DiscardVerb,
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
 * The third dimension, taken literally: the candidates are behind the frame, in
 * z, and the canvas is a plane you can lift them out of to decide.
 *
 * At rest the stack costs eight pixels of edge, which is enough for the field
 * to say there is something unsettled here without a badge or a number. Space
 * lifts the deck off the plane and cascades it toward you under a real
 * perspective, the field dimming because the deck is no longer on it. Lifted,
 * every card carries both verbs: press it to bring it to the front, press the ✕
 * to discard it and watch the deck close up, press keep and the decision ends
 * with the deck dropping back as one card.
 *
 * The claim: a decision with four things in it wants depth and one gesture, not
 * four frames in a row. The cost is that the lifted state is a mode, and while
 * it is up the canvas underneath is not usable.
 */

const STEP = 96;
const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

export default function RevealDeckFrame() {
	const decision = useDecision();
	const [spread, setSpread] = useState(false);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	useKey("Escape", useCallback(() => setSpread(false), []));
	useKey(
		" ",
		useCallback(() => setSpread((open) => !open), []),
	);
	const facing = decision.showing;
	const set = decision.candidates;
	const open = decision.standing === "open";
	const index = Math.max(0, set.findIndex((one) => one.id === facing.id));

	return (
		<VariantsScreen
			name="reveal--deck"
			argues="The candidates are behind the frame in z, and space lifts the deck off the plane." hint={open ? "space lifts the deck · ← → looks · ✕ discards · keep ends it" : "decided · reopen from the label"}>
			<Neighbour x={40} y={170} name="timetable" stacked count={2}>
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={640} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			{/* the field is not where the deck is any more, and it says so */}
			<motion.button
				type="button"
				aria-label="Drop the deck"
				onClick={() => setSpread(false)}
				className="absolute inset-0 z-10 cursor-default bg-bg"
				initial={false}
				animate={{ opacity: spread ? 0.62 : 0 }}
				transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
				style={{ pointerEvents: spread ? "auto" : "none" }}
			/>

			<Placed x={340} y={170} z={20}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? set.length : undefined}
					right={
						open ? (
							<KeepVerb onKeep={() => decision.keep(facing.id)} />
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
				<motion.div
					className="relative"
					style={{ width: FIELD_W, height: FIELD_H, perspective: 1500, transformStyle: "preserve-3d" }}
					animate={{ x: spread ? -132 : 0 }}
					transition={SPRING}
				>
					{set.map((variation, at) => {
						const rank = (at - index + set.length) % set.length;
						const front = rank === 0;
						return (
							<motion.div
								key={variation.id}
								className="absolute top-0 left-0 origin-top-left"
								style={{ width: FIELD_W, height: FIELD_H, zIndex: set.length - rank }}
								initial={false}
								animate={
									spread
										? {
												x: rank * STEP,
												y: rank * -22,
												scale: 1 - rank * 0.045,
												rotateY: -26,
												opacity: 1,
											}
										: { x: rank * 7, y: rank * 7, scale: 1, rotateY: 0, opacity: [1, 0.62, 0.44, 0.3][rank] ?? 0.3 }
								}
								transition={SPRING}
							>
								<button
									type="button"
									aria-label={`Show ${variation.label}`}
									onClick={() => (spread ? decision.look(variation.id) : setSpread(true))}
									className="relative block h-full w-full cursor-pointer overflow-hidden rounded-[8px]"
								>
									<Scaled scale={FIELD_SCALE}>
										<TvarsoCheckout variation={variation.id} />
									</Scaled>
									{/* lifted, a card that is not facing you is only half lit */}
									<motion.span
										className="absolute inset-0 bg-bg"
										initial={false}
										animate={{ opacity: front || !spread ? 0 : 0.3 }}
										transition={SPRING}
									/>
									<span
										className={cn(
											"absolute inset-0 rounded-[8px] border",
											front ? "border-transparent" : "border-border-raised",
										)}
									/>
								</button>
								{/* lifted, every card carries the other verb: taking it out of the
								    running is one press and the deck closes over it */}
								{spread && set.length > 1 ? (
									<motion.span
										className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-xs bg-bg/80 backdrop-blur"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.18 }}
									>
										<DiscardVerb onDiscard={() => decision.discard(variation.id)} />
									</motion.span>
								) : null}
							</motion.div>
						);
					})}
					{/* the stack sticks out under the ring, so the size badge would sit on it */}
					{spread ? null : <SelectionRing />}
					{/* names live under the deck rather than on the cards: cascaded, a card
					    covers the one behind it and its label with it */}
					<div className="absolute top-[calc(100%+14px)] left-0 h-4 w-full">
						{set.map((variation, at) => {
							const rank = (at - index + set.length) % set.length;
							return (
								<motion.span
									key={variation.id}
									className={cn(
										"absolute top-0 left-0 font-mono text-2xs leading-3",
										rank === 0 ? "text-thread" : "text-muted",
									)}
									initial={false}
									animate={{ x: rank * STEP + 4, opacity: spread ? 1 : 0 }}
									transition={SPRING}
								>
									{variation.label}
								</motion.span>
							);
						})}
					</div>
				</motion.div>
			</Placed>

			{/* what the deck is, said once, where the readout of a lifted thing belongs */}
			<motion.div
				className="pointer-events-none absolute top-[104px] left-1/2 z-30 -translate-x-1/2"
				initial={false}
				animate={{ opacity: spread ? 1 : 0, y: spread ? 0 : -6 }}
				style={{ pointerEvents: spread ? "auto" : "none" }}
				transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
			>
				<span className="pointer-events-auto flex items-center gap-2 rounded-sm bg-raised px-2 py-1 font-mono text-2xs text-muted leading-3">
					{open ? (
						<>
							checkout · {set.length} candidates · looking at {facing.label}
							<button
								type="button"
								onClick={() => decision.keep(facing.id)}
								className="text-text transition-colors hover:text-thread"
							>
								keep it
							</button>
						</>
					) : (
						<>checkout · decided · {facing.label}</>
					)}
				</span>
			</motion.div>
		</VariantsScreen>
	);
}
