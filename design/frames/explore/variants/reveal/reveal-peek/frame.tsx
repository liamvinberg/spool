import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import {
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	Thread,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * Looking is free, deciding is deliberate.
 *
 * The selected frame grows a strip under it, one notch per candidate. Run the
 * pointer along it and the card follows immediately, with no press and nothing
 * to put away afterwards; take the pointer off and it snaps back to the one the
 * decision is resting on. While you are only looking, the ring goes dashed and
 * the row says peeking, so a screenshot taken mid-peek can never be mistaken
 * for what the file holds. A click rests the decision on what you are looking
 * at; keep ends it.
 *
 * The claim: a decision is mostly spent looking, and looking should cost
 * nothing and commit nothing. The cost is a gesture with no keyboard equal, and
 * a strip that is only honest up to about eight notches.
 */
export default function RevealPeekFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<number | null>(null);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const set = decision.candidates;
	const open = decision.standing === "open";
	const resting = Math.max(0, set.findIndex((one) => one.id === decision.showing.id));
	const showing = set[peek ?? resting] ?? decision.showing;
	const looking = peek !== null && peek !== resting;

	return (
		<VariantsScreen
			name="reveal--peek"
			argues="Looking is free and choosing is deliberate: scrub the strip, press to keep." hint={open ? "run the pointer along the strip to look · click a notch to rest on it · keep ends it" : "decided"}>
			<Thread from={{ x: 264, y: 356 }} to={{ x: 336, y: 356 }} />
			<Thread from={{ x: 552, y: 356 }} to={{ x: 624, y: 356 }} dashed />

			<Neighbour x={48} y={170} name="timetable" stacked count={2}>
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
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
							<AnimatePresence initial={false}>
								{looking ? (
									<motion.span
										key="peeking"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										className="font-mono text-2xs text-muted leading-3"
									>
										peeking
									</motion.span>
								) : null}
							</AnimatePresence>
							{open ? <KeepVerb onKeep={() => decision.keep(showing.id)} /> : <PlayVerb />}
						</>
					}
				/>
				<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
					<div className="absolute inset-0 overflow-hidden rounded-[8px]">
						<AnimatePresence initial={false}>
							<motion.div
								key={showing.id}
								className="absolute inset-0"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.11, ease: "linear" }}
							>
								<Scaled scale={FIELD_SCALE}>
									<TvarsoCheckout variation={showing.id} />
								</Scaled>
							</motion.div>
						</AnimatePresence>
					</div>
					{/* dashed while what you see is not what is pinned */}
					<div
						className={cn(
							"pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread",
							looking && "border-dashed",
						)}
					/>
					{["-left-[7px] -top-[7px]", "-right-[7px] -top-[7px]", "-bottom-[7px] -left-[7px]", "-bottom-[7px] -right-[7px]"].map(
						(position) => (
							<span
								key={position}
								className={cn(
									"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread transition-opacity",
									position,
									looking && "opacity-40",
								)}
							/>
						),
					)}
				</div>

				{/* the strip: one notch per variation, the pinned one solid */}
				<div className="mt-3 flex flex-col gap-2" onPointerLeave={() => setPeek(null)}>
					<div className="flex items-center gap-1">
						{set.map((variation, index) => {
							const isPinned = index === resting;
							const isPeek = index === peek;
							return (
								<button
									key={variation.id}
									type="button"
									aria-label={`Rest the decision on ${variation.label}`}
									onPointerEnter={() => setPeek(index)}
									onFocus={() => setPeek(index)}
									onClick={() => {
										decision.look(variation.id);
										setPeek(null);
									}}
									className="group flex h-4 flex-1 items-center"
								>
									<motion.span
										className={cn(
											"h-[3px] w-full rounded-full",
											isPinned ? "bg-thread" : isPeek ? "bg-text" : "bg-border-raised",
										)}
										initial={false}
										animate={{ scaleY: isPeek || isPinned ? 1.6 : 1 }}
										transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
									/>
								</button>
							);
						})}
					</div>
					<div className="relative h-3">
						<motion.span
							className="absolute top-0 font-mono text-2xs leading-3"
							initial={false}
							animate={{ x: ((peek ?? resting) * FIELD_W) / set.length }}
							transition={{ type: "spring", stiffness: 520, damping: 40 }}
						>
							<span className={cn(looking ? "text-text" : "text-thread")}>{showing.label}</span>
						</motion.span>
					</div>
				</div>
			</Placed>

			<Neighbour x={624} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>
		</VariantsScreen>
	);
}
