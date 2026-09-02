import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef, useState } from "react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoTicket,
	TvarsoTimetable,
	type Variation,
} from "shared/ui/demo/tvarso-checkout";
import { PeekRing, StillCard } from "shared/ui/explore/variants/variants-feel";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { EASE, SETTLE } from "shared/lib/explore/variants/variants-feel";

/**
 * Discarding is a physical act: you tear the top one off the pad.
 *
 * The candidates are a pad of paper at the frame's own size, and the gesture is
 * the one your hands already know. Drag the top card sideways: it comes with
 * you, tips a little, and the next candidate is underneath the whole time, so
 * you are never looking at a hole. Let go short of the threshold and it drops
 * back on the spring of something with a bit of weight. Take it past and it
 * goes, and that candidate is discarded — the verb the decision actually has.
 *
 * Which makes this the only take here where the gesture is the decision rather
 * than a way of looking at it. Tear until one is left and the decision is
 * resolved, because keeping the last one and discarding the second to last are
 * the same event. Nothing is lost on the way: the torn one leaves an undo in
 * the corner for as long as the decision is open, which is what discarding
 * means in `variants-decision.ts`.
 *
 * The honest cost: this is a tool for throwing away, not for comparing. You can
 * see the next one, never all four, and a tear you did not mean is a discard
 * you have to notice to undo.
 */

const W = CARD_W * FIELD_SCALE;
const H = CARD_H * FIELD_SCALE;
const THROW = 96;
const FLING = 520;

export default function ThrowTearFrame() {
	const decision = useDecision();
	const [pulse, setPulse] = useState(0);
	const [gone, setGone] = useState<Variation | null>(null);
	const [tearing, setTearing] = useState(false);
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const rotate = useTransform(x, (value: number) => value / 26);
	/* the card under the top one, sitting a few pixels out so the pad reads as a
	   pad, and rising into place as far as the tear has got */
	const rise = useMotionValue(0);
	const underX = useTransform(rise, (value: number) => 4 * (1 - value));
	const underY = useTransform(rise, (value: number) => 3 * (1 - value));
	const underRotate = useTransform(rise, (value: number) => 1.2 * (1 - value));
	const grab = useRef({ x: 0, y: 0, last: 0, at: 0, v: 0, on: false });

	const open = decision.standing === "open";
	const set = decision.candidates;
	const top = decision.showing;
	const under = set.find((one) => one.id !== top.id) ?? null;

	const down = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!open || tearing || set.length < 2) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		grab.current = { x: event.clientX, y: event.clientY, last: event.clientX, at: performance.now(), v: 0, on: true };
	};

	const move = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!grab.current.on) return;
		const now = performance.now();
		grab.current.v = ((event.clientX - grab.current.last) / Math.max(1, now - grab.current.at)) * 1000;
		grab.current.last = event.clientX;
		grab.current.at = now;
		const travel = event.clientX - grab.current.x;
		x.set(travel);
		y.set((event.clientY - grab.current.y) * 0.28);
		rise.set(Math.min(1, Math.abs(travel) / THROW));
	};

	const up = () => {
		if (!grab.current.on) return;
		grab.current.on = false;
		const travelled = x.get();
		const flung = Math.abs(travelled) > THROW || Math.abs(grab.current.v) > FLING;
		if (!flung) {
			void animate(x, 0, SETTLE);
			void animate(y, 0, SETTLE);
			void animate(rise, 0, SETTLE);
			return;
		}
		const away = travelled === 0 ? Math.sign(grab.current.v) || 1 : Math.sign(travelled);
		setTearing(true);
		void animate(rise, 1, { duration: 0.24, ease: EASE });
		void animate(x, away * 460, { duration: 0.26, ease: EASE }).then(() => {
			setGone(top);
			decision.discard(top.id);
			x.set(0);
			y.set(0);
			rise.set(0);
			setTearing(false);
			setPulse((count) => count + 1);
		});
	};

	return (
		<VariantsScreen
			name="throw--tear"
			argues="The set is a pad. Drag the top one off and it is discarded, with the next one already underneath."
			hint={open ? "drag the card sideways · past halfway it goes · short of it, it drops back" : "resolved · one candidate left"}
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
					right={open ? <KeepVerb onKeep={() => decision.keep(top.id)} /> : <PlayVerb />}
				/>
				<div className="relative" style={{ width: W, height: H }}>
					{under === null ? null : (
						<motion.div
							className="absolute inset-0 overflow-hidden rounded-[8px]"
							style={{ x: underX, y: underY, rotate: underRotate }}
						>
							<StillCard variation={under.id} scale={FIELD_SCALE} />
						</motion.div>
					)}
					<motion.div
						className="absolute inset-0 touch-none select-none overflow-hidden rounded-[8px]"
						style={{ x, y, rotate, cursor: open && set.length > 1 ? "grab" : "default" }}
						onPointerDown={down}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
					>
						<StillCard variation={top.id} scale={FIELD_SCALE} />
					</motion.div>
					<PeekRing peeking={tearing} size="360 × 620" pulse={pulse} />
				</div>

				<div className="mt-7 flex flex-col gap-2.5">
					<span className="flex items-center gap-2 font-mono text-2xs leading-3">
						<span className="text-thread">{top.label}</span>
						<span className="text-muted/50">
							{open
								? under === null
									? "last one standing"
									: `on top of ${under.label} · ${set.length} left`
								: `kept · ${decision.discarded.length} torn off`}
						</span>
					</span>
					<AnimatePresence>
						{gone === null ? null : (
							<motion.div
								key={gone.id}
								className="flex items-center gap-2 font-mono text-2xs leading-3"
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.14, ease: EASE }}
							>
								<span className="text-muted/60">{gone.label} discarded</span>
								<button
									type="button"
									onClick={() => {
										decision.restore(gone.id);
										setGone(null);
									}}
									className="rounded-xs px-1 text-thread transition-colors hover:text-text"
								>
									undo
								</button>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</Placed>
		</VariantsScreen>
	);
}
