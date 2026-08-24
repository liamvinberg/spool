import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "../../../shared/ui/tvarso-checkout";
import { PeekRing, SwapCard } from "../../../shared/ui/variants-feel";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "../../../shared/ui/variants-shell";
import { useKey } from "../../../shared/lib/variants-cycle";
import { useDecision } from "../../../shared/lib/variants-decision";
import { PILL } from "../../../shared/lib/variants-feel";
import { cn } from "../../../shared/lib/utils";

/**
 * peek--strip again, with every millisecond of it argued.
 *
 * The concept did not need saving; the execution did. Four things changed and
 * they are the whole frame:
 *
 * 1. **The swap dissolves, one way.** The old card holds at full strength and
 *    the new one comes up over it in 100ms, so the masthead and the total look
 *    untouched while the payment block changes under your eye. The old version
 *    hard-cut, which reads as a flicker at four names in a second.
 * 2. **One pill, sliding.** Every name used to light its own background, so
 *    running the strip was four separate flashes. Now there is a single marker
 *    that travels to whatever the pointer is on, on a stiff spring, and the
 *    name it left goes quiet on a 100ms colour fade.
 * 3. **Moving between names never returns home.** A name no longer clears the
 *    peek when the pointer leaves it, only the strip does, so sliding from
 *    `card` to `swish` is one swap rather than a swap back to resting and a
 *    swap out again.
 * 4. **The pin has a moment.** Clicking fires one ring outward from the frame's
 *    edge and the ring's handles come back. Nothing else in the frame moves,
 *    ever: the card box is the same 216×372 in all four states.
 */
export default function FeelStripFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	const [pulse, setPulse] = useState(0);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const showing = decision.candidates.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;

	const step = useCallback(
		(move: () => void) => () => {
			setPeek(null);
			move();
			setPulse((count) => count + 1);
		},
		[],
	);
	useKey("ArrowRight", step(decision.next));
	useKey("ArrowLeft", step(decision.prev));

	return (
		<VariantsScreen
			name="feel--strip"
			argues="The peek that won, tuned: one dissolve, one sliding pill, and a pin you can feel."
			hint={open ? "hover a name to look · click to rest on it · ← → step" : "kept · the strip is gone with the decision"}
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
					right={open ? <KeepVerb onKeep={() => decision.keep(showing.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<SwapCard variation={showing.id} scale={FIELD_SCALE} />
					<PeekRing peeking={peeking} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-2.5" onPointerLeave={() => setPeek(null)}>
						<div className="-ml-1 flex items-center">
							{decision.candidates.map((variation) => {
								const on = variation.id === showing.id;
								return (
									<button
										key={variation.id}
										type="button"
										onPointerEnter={() => setPeek(variation.id)}
										onFocus={() => setPeek(variation.id)}
										onClick={() => {
											decision.look(variation.id);
											setPeek(null);
											setPulse((count) => count + 1);
										}}
										className="relative flex h-6 items-center px-2 font-mono text-2xs leading-3"
									>
										{on ? (
											<motion.span
												layoutId="feel-pill"
												className={cn(
													"absolute inset-0 rounded-xs",
													peeking ? "bg-raised" : "bg-thread/15",
												)}
												transition={PILL}
											/>
										) : null}
										<span
											className={cn(
												"relative transition-colors duration-100",
												variation.id === resting.id
													? "text-thread"
													: on
														? "text-text"
														: "text-muted/60",
											)}
										>
											{variation.label}
										</span>
									</button>
								);
							})}
						</div>
						<span className="ml-1 flex items-center gap-2 font-mono text-2xs leading-3">
							<span className={peeking ? "text-text" : "text-thread"}>{showing.label}</span>
							<span className="text-muted/50">{peeking ? "looking · let go and it is back" : "resting here"}</span>
						</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
