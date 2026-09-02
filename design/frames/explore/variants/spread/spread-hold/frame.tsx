import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
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
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * Spread while you hold, and it puts itself away.
 *
 * There is no mode here and nothing to shut. Hold space and the candidates come
 * out of the frame sideways, at the size they would be on the field; let go and
 * they go back into it. Because the state cannot outlive your thumb, it is
 * allowed to be expensive on screen: the cards overlap the neighbours, cover
 * half the page, and none of that matters for the second and a half you are
 * looking.
 *
 * Deciding stays a press. While the set is out, clicking one keeps it, which is
 * the one thing that should survive letting go.
 */

const OUT = 0.42;
const GAP = 18;
const SPRING = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const;

export default function SpreadHoldFrame() {
	const decision = useDecision();
	const [held, setHeld] = useState(false);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const width = CARD_W * OUT;

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key !== " ") return;
			event.preventDefault();
			setHeld(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.key !== " ") return;
			setHeld(false);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	return (
		<VariantsScreen
			name="spread--hold"
			argues="Hold space and the candidates come out of the frame; let go and they go back in."
			hint={open ? "hold space to lay them out · click one to keep it · let go and it is as it was" : "decided"}
		>
			<Neighbour x={40} y={210} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={636} y={210} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={338} y={210} z={20}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? set.length : undefined}
					right={open ? <KeepVerb onKeep={() => decision.keep(decision.showing.id)} /> : <PlayVerb />}
				/>
				<div className="relative">
					<motion.div initial={false} animate={{ opacity: held ? 0.2 : 1 }} transition={{ duration: 0.18 }}>
						<GlanceCard variation={decision.showing.id} scale={FIELD_SCALE} />
					</motion.div>
					{held ? null : <SelectionRing size="360 × 620" />}

					{/* the set, coming out of the frame it lives in and going back into it */}
					{set.map((variation, index) => {
						const slot = (index - (set.length - 1) / 2) * (width + GAP) + (216 - width) / 2;
						const on = variation.id === decision.showing.id;
						return (
							<motion.button
								key={variation.id}
								type="button"
								title={`keep ${variation.label}`}
								onClick={() => decision.keep(variation.id)}
								className={cn(
									"absolute top-0 left-0 overflow-hidden rounded-[6px] border",
									!held ? "border-transparent" : on ? "border-thread" : "border-border-raised",
								)}
								style={{ width, height: CARD_H * OUT, zIndex: on ? 12 : 10 }}
								initial={false}
								animate={{
									x: held ? slot : (216 - width) / 2,
									y: held ? 26 : 60,
									opacity: held ? 1 : 0,
									scale: held ? 1 : 0.86,
								}}
								transition={SPRING}
							>
								<div
									style={{
										width: CARD_W,
										height: CARD_H,
										transform: `scale(${OUT})`,
										transformOrigin: "top left",
									}}
								>
									<TvarsoCheckout variation={variation.id} />
								</div>
								<motion.span
									className={cn(
										"absolute inset-x-0 bottom-0 bg-bg/85 px-1.5 py-1 text-center font-mono text-2xs leading-3 backdrop-blur",
										on ? "text-thread" : "text-text",
									)}
									initial={false}
									animate={{ opacity: held ? 1 : 0 }}
								>
									{variation.label}
								</motion.span>
							</motion.button>
						);
					})}
				</div>
			</Placed>

			<motion.span
				className="pointer-events-none absolute top-[130px] left-1/2 z-30 -translate-x-1/2 rounded-sm bg-raised px-2 py-1 font-mono text-2xs text-muted leading-3"
				initial={false}
				animate={{ opacity: held ? 1 : 0, y: held ? 0 : -6 }}
				transition={{ duration: 0.16 }}
			>
				held · {set.length} candidates · click one to keep it
			</motion.span>
		</VariantsScreen>
	);
}
