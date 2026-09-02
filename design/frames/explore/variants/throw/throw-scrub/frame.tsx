import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
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
import { SETTLE, nearest, project } from "shared/lib/explore/variants/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * The set is a strip of film and the frame is the gate.
 *
 * Hold ⌥ and drag across the card: the candidates run under the frame's own
 * edges, one card wide each, so you are not choosing from a list, you are
 * winding through the set and watching it go past. Let go and it carries — the
 * release is projected forward by its own velocity and settles on whichever
 * candidate that lands nearest, on a spring with enough mass to feel like paper
 * rather than a value snapping.
 *
 * Two details do the work. Past either end the strip only follows a third of
 * your hand, so the set has edges you can feel instead of a wrap that loses
 * you. And ⌥ is the price of admission: an unmodified drag on a canvas is a
 * move, so this gesture has to ask for the modifier rather than steal the
 * plain one.
 */

const W = CARD_W * FIELD_SCALE;
const H = CARD_H * FIELD_SCALE;
const RUBBER = 0.34;
const RAIL = 216;

export default function ThrowScrubFrame() {
	const decision = useDecision();
	const [armed, setArmed] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [pulse, setPulse] = useState(0);
	const slide = useMotionValue(0);
	const grab = useRef({ x: 0, from: 0, last: 0, at: 0, v: 0 });
	const open = decision.standing === "open";
	const set = decision.candidates;
	const at = Math.max(0, set.findIndex((one) => one.id === decision.showing.id));
	const span = RAIL / Math.max(1, set.length);
	const markerX = useTransform(slide, (value: number) => Math.min(RAIL - span, Math.max(0, (-value / W) * span)));

	useEffect(() => {
		const watch = (event: KeyboardEvent) => setArmed(event.altKey);
		const drop = () => setArmed(false);
		window.addEventListener("keydown", watch);
		window.addEventListener("keyup", watch);
		window.addEventListener("blur", drop);
		return () => {
			window.removeEventListener("keydown", watch);
			window.removeEventListener("keyup", watch);
			window.removeEventListener("blur", drop);
		};
	}, []);

	useEffect(() => {
		if (dragging) return;
		slide.set(-at * W);
	}, [at, dragging, slide]);

	const down = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!armed || !open) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		grab.current = { x: event.clientX, from: slide.get(), last: event.clientX, at: performance.now(), v: 0 };
		setDragging(true);
	};

	const move = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging) return;
		const now = performance.now();
		const step = event.clientX - grab.current.last;
		const gap = Math.max(1, now - grab.current.at);
		grab.current.v = (step / gap) * 1000;
		grab.current.last = event.clientX;
		grab.current.at = now;
		const raw = grab.current.from + (event.clientX - grab.current.x);
		const floor = -(set.length - 1) * W;
		const held = raw > 0 ? raw * RUBBER : raw < floor ? floor + (raw - floor) * RUBBER : raw;
		slide.set(held);
	};

	const up = () => {
		if (!dragging) return;
		setDragging(false);
		const landed = nearest(-project(slide.get(), grab.current.v), W, set.length);
		const target = set[landed];
		if (target !== undefined) {
			decision.look(target.id);
			setPulse((count) => count + 1);
		}
		void animate(slide, -landed * W, SETTLE);
	};

	return (
		<VariantsScreen
			name="throw--scrub"
			argues="Hold ⌥ and wind the set past the frame. Let go and the throw settles on the nearest candidate."
			hint={open ? "hold ⌥ · drag across the card · let go and it carries" : "decided"}
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
					right={open ? <KeepVerb onKeep={() => decision.keep(decision.showing.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<div
						className={cn("relative touch-none select-none overflow-hidden rounded-[8px] bg-canvas", armed && open && "cursor-ew-resize")}
						style={{ width: W, height: H }}
						onPointerDown={down}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
					>
						<motion.div className="absolute top-0 left-0 flex" style={{ x: slide }}>
							{set.map((variation) => (
								<div key={variation.id} className="shrink-0" style={{ width: W, height: H }}>
									<StillCard variation={variation.id} scale={FIELD_SCALE} />
								</div>
							))}
						</motion.div>
					</div>
					<PeekRing peeking={dragging} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-2.5">
						<div className="relative h-[3px] rounded-full bg-border-raised" style={{ width: RAIL }}>
							<motion.span
								className="absolute inset-y-0 rounded-full bg-thread"
								style={{ width: span, x: markerX }}
							/>
						</div>
						<span className="flex items-center gap-2 font-mono text-2xs leading-3">
							<span className={dragging ? "text-text" : "text-thread"}>{decision.showing.label}</span>
							<span className="text-muted/50">
								{dragging ? "winding" : armed ? "⌥ down · drag the card" : "hold ⌥ to wind the set"}
							</span>
						</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
