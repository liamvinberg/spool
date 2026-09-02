import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoTicket,
	TvarsoTimetable,
	type VariationId,
} from "shared/ui/tvarso-checkout";
import { Crossfade, PeekRing, StillCard } from "shared/ui/variants-feel";
import { regionsBetween, saysRegions } from "shared/ui/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	PlayVerb,
	VariantsScreen,
} from "shared/ui/variants-shell";
import { useDecision } from "shared/lib/variants-decision";
import { MARK } from "shared/lib/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * One frame, two candidates, and a seam you push around with the pointer.
 *
 * The resting candidate holds the whole card. Hover a name and the other one
 * takes the right half — the seam glides to the middle rather than appearing,
 * so the compare arrives as a movement you can follow. From there the pointer
 * is the seam: run it across the card and the payment block changes hands under
 * your finger, which is the closest thing on this page to feeling the
 * difference rather than seeing it. Leave and the seam runs off the right edge
 * and the frame is one card again.
 *
 * Nothing is dragged and nothing is clicked to get here, which is the point —
 * a before-and-after slider usually costs a grab, and a grab is a commitment.
 * The seam is on a stiff spring rather than pinned to the cursor, so it reads
 * as a thing with a little weight instead of a value being written.
 */

const W = CARD_W * FIELD_SCALE;
const H = CARD_H * FIELD_SCALE;

export default function ThrowWipeFrame() {
	const decision = useDecision();
	const [against, setAgainst] = useState<VariationId | null>(null);
	const [pulse, setPulse] = useState(0);
	const card = useRef<HTMLDivElement | null>(null);
	const target = useMotionValue(W);
	const seam = useSpring(target, { stiffness: 700, damping: 52, mass: 0.5 });
	const clip = useMotionTemplate`inset(0 0 0 ${seam}px)`;
	const clearing = useRef<number | null>(null);

	/** the seam runs off the right edge first, and the other candidate leaves with it */
	const dismiss = useCallback(() => {
		target.set(W);
		if (clearing.current !== null) window.clearTimeout(clearing.current);
		clearing.current = window.setTimeout(() => setAgainst(null), 260);
	}, [target]);

	const hold = useCallback(() => {
		if (clearing.current !== null) window.clearTimeout(clearing.current);
		clearing.current = null;
	}, []);

	useEffect(() => () => {
		if (clearing.current !== null) window.clearTimeout(clearing.current);
	}, []);

	const open = decision.standing === "open";
	const resting = decision.showing;
	const other = decision.candidates.find((one) => one.id === against && one.id !== resting.id) ?? null;

	const follow = (event: React.PointerEvent<HTMLDivElement>) => {
		if (other === null) return;
		const rect = card.current?.getBoundingClientRect();
		if (rect === undefined) return;
		target.set(Math.min(W, Math.max(0, event.clientX - rect.left)));
	};

	return (
		<VariantsScreen
			name="throw--wipe"
			argues="A seam across the frame: this candidate on one side, that one on the other, and the pointer moves it."
			hint={open ? "hover a name to bring the seam in · move across the card to wipe · click to rest on it" : "decided"}
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

			<div
				className="absolute flex flex-col gap-1.5"
				style={{ left: 336, top: 170, zIndex: 2 }}
				onPointerLeave={dismiss}
			>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? decision.candidates.length : undefined}
					right={open ? <KeepVerb onKeep={() => decision.keep(resting.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<div
						ref={card}
						className="relative select-none overflow-hidden rounded-[8px]"
						style={{ width: W, height: H }}
						onPointerMove={follow}
						onPointerLeave={() => target.set(W)}
					>
						<StillCard variation={resting.id} scale={FIELD_SCALE} />
						<motion.div className="absolute inset-0" style={{ clipPath: clip }}>
							<Crossfade
								className="absolute inset-0"
								token={other?.id ?? resting.id}
								render={(token) => <StillCard variation={token as VariationId} scale={FIELD_SCALE} />}
							/>
						</motion.div>
						<motion.span
							className="pointer-events-none absolute top-0 bottom-0 w-px bg-thread"
							style={{ left: seam }}
							initial={false}
							animate={{ opacity: other === null ? 0 : 1 }}
							transition={MARK}
						/>
						<motion.span
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 h-4 w-[3px] rounded-full bg-thread"
							style={{ left: seam, marginLeft: -1 }}
							initial={false}
							animate={{ opacity: other === null ? 0 : 1 }}
							transition={MARK}
						/>
					</div>
					<PeekRing peeking={other !== null} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-2.5">
						<div className="-ml-1 flex items-center">
							{decision.candidates.map((variation) => {
								const on = variation.id === other?.id;
								return (
									<button
										key={variation.id}
										type="button"
										onPointerEnter={() => {
											hold();
											if (variation.id === resting.id) return;
											setAgainst(variation.id);
											target.set(W / 2);
										}}
										onFocus={() => setAgainst(variation.id)}
										onClick={() => {
											hold();
											decision.look(variation.id);
											setAgainst(null);
											target.set(W);
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
							<span className="text-thread">{resting.label}</span>
							<span className="text-muted/50">
								{other === null
									? "resting here · nothing on the other side yet"
									: `against ${other.label} · seam through ${saysRegions(regionsBetween(resting.id, other.id))}`}
							</span>
						</span>
					</div>
				) : null}
			</div>
		</VariantsScreen>
	);
}
