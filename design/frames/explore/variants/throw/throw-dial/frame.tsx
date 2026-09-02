import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoTicket,
	TvarsoTimetable,
	type VariationId,
} from "shared/ui/tvarso-checkout";
import { PeekRing, SwapCard } from "shared/ui/variants-feel";
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
import { POP, bearing } from "shared/lib/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * Press the frame and the set comes out from under your thumb.
 *
 * There is nothing under this frame and nothing beside it. Press anywhere on
 * the card and the candidates appear around the press, one per direction; move
 * a couple of centimetres toward one and the card is already that one; let go
 * and it stays. Let go without moving and nothing happened at all, which is the
 * cheapest exit any take on this page has — the gesture that cancels is the
 * gesture that does nothing.
 *
 * It is a marking menu, and marking menus have the property this page keeps
 * asking for: they cost nothing to look at and they turn into muscle. After a
 * dozen goes you are not reading the labels, you are flicking up for `card` and
 * right for `swish`, and the whole decision is one press and a twitch.
 *
 * The catch is a real one: press-and-hold on a canvas already means something
 * on trackpads and it fights a long-press on touch, and four directions is a
 * ceiling — twelve candidates is a wheel of chips nobody can aim at.
 */

const R = 54;
const DEAD = 20;

export default function ThrowDialFrame() {
	const decision = useDecision();
	const [dial, setDial] = useState<{ x: number; y: number } | null>(null);
	const [aimed, setAimed] = useState<VariationId | null>(null);
	const [pulse, setPulse] = useState(0);
	const origin = useRef({ x: 0, y: 0 });
	const card = useRef<HTMLDivElement | null>(null);

	const open = decision.standing === "open";
	const set = decision.candidates;
	const resting = decision.showing;
	const showing = set.find((one) => one.id === aimed) ?? resting;
	const peeking = showing.id !== resting.id;

	const down = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!open) return;
		const rect = card.current?.getBoundingClientRect();
		if (rect === undefined) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		origin.current = { x: event.clientX, y: event.clientY };
		setDial({ x: event.clientX - rect.left, y: event.clientY - rect.top });
		setAimed(null);
	};

	const move = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dial === null) return;
		const dx = event.clientX - origin.current.x;
		const dy = event.clientY - origin.current.y;
		if (Math.hypot(dx, dy) < DEAD) {
			setAimed(null);
			return;
		}
		const slice = 360 / set.length;
		const index = Math.round(bearing(dx, dy) / slice) % set.length;
		setAimed(set[index]?.id ?? null);
	};

	const up = () => {
		if (dial === null) return;
		if (aimed !== null) {
			decision.look(aimed);
			setPulse((count) => count + 1);
		}
		setDial(null);
		setAimed(null);
	};

	return (
		<VariantsScreen
			name="throw--dial"
			argues="Press the card and the candidates come out around your pointer. Flick at one, let go, done."
			hint={open ? "press and hold the card · move toward a name · let go where you started to cancel" : "decided"}
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
					<div
						ref={card}
						className={cn("relative touch-none select-none", open && "cursor-pointer")}
						style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}
						onPointerDown={down}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
					>
						<SwapCard variation={showing.id} scale={FIELD_SCALE} duration={0.09} />
					</div>
					<PeekRing peeking={peeking} size="360 × 620" pulse={pulse} />

					<AnimatePresence>
						{dial === null ? null : (
							<motion.div
								className="pointer-events-none absolute"
								style={{ left: dial.x, top: dial.y }}
								initial={{ opacity: 0, scale: 0.86 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.09, ease: "linear" } }}
								transition={POP}
							>
								<span className="-translate-x-1/2 -translate-y-1/2 absolute h-1.5 w-1.5 rounded-full bg-thread" />
								{set.map((variation, index) => {
									const angle = (index * 360) / set.length;
									const radians = (angle * Math.PI) / 180;
									const on = variation.id === aimed;
									return (
										<motion.span
											key={variation.id}
											className={cn(
												"-translate-x-1/2 -translate-y-1/2 absolute flex h-5 items-center rounded-xs border px-1.5 font-mono text-2xs leading-3 backdrop-blur",
												on
													? "border-thread bg-thread text-on-thread"
													: "border-border-raised bg-bg/90 text-muted",
											)}
											style={{ left: Math.sin(radians) * R, top: -Math.cos(radians) * R }}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											transition={{ ...POP, delay: index * 0.012 }}
										>
											{variation.label}
										</motion.span>
									);
								})}
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{open ? (
					<div className="mt-7 flex items-center gap-2 font-mono text-2xs leading-3">
						<span className={peeking ? "text-text" : "text-thread"}>{showing.label}</span>
						<span className="text-muted/50">
							{dial === null
								? `${set.length} candidates · press the card`
								: aimed === null
									? "let go here and nothing happens"
									: "let go to rest on it"}
						</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
