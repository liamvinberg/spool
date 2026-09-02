import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard, regionsBetween, saysRegions } from "shared/ui/explore/variants/variants-glance";
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
 * Nothing on screen until you ask, and asking is a key you are already holding.
 *
 * At rest this is a frame with a name. Hold ⌥ and the set appears under it and
 * the card becomes the next candidate; keep holding and 1 to 4 jump straight to
 * one, ← and → walk them. Let go and everything is exactly as you left it, card
 * and strip both. Nothing was pressed, so nothing has to be put back.
 *
 * The trade is the one every hidden gesture makes. It is the fastest way
 * through a set for somebody who knows it exists, it costs zero pixels on a
 * canvas of forty frames, and a person who does not know is looking at a frame
 * that never mentions it has three other faces. The stack glyph before the name
 * is the whole of the discovery budget.
 */

const KEYS = ["1", "2", "3", "4", "5", "6"] as const;

export default function PeekHoldFrame() {
	const decision = useDecision();
	const [held, setHeld] = useState(false);
	const [peek, setPeek] = useState<VariationId | null>(null);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const resting = decision.showing;
	const showing = set.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;

	useEffect(() => {
		const at = (id: VariationId, by: 1 | -1): VariationId => {
			const index = set.findIndex((one) => one.id === id);
			return set[(((index === -1 ? 0 : index) + by) % set.length + set.length) % set.length]?.id ?? id;
		};
		const down = (event: KeyboardEvent) => {
			if (event.key === "Alt") {
				event.preventDefault();
				if (!held) {
					setHeld(true);
					// holding shows you the next one, because the one you are on is
					// already on the screen behind the strip
					setPeek(at(resting.id, 1));
				}
				return;
			}
			if (!held) return;
			if (event.key === "ArrowRight") setPeek((current) => at(current ?? resting.id, 1));
			if (event.key === "ArrowLeft") setPeek((current) => at(current ?? resting.id, -1));
			const slot = KEYS.indexOf(event.key as (typeof KEYS)[number]);
			if (slot !== -1 && set[slot] !== undefined) setPeek(set[slot]?.id ?? null);
		};
		const up = (event: KeyboardEvent) => {
			if (event.key !== "Alt") return;
			setHeld(false);
			setPeek(null);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, [held, resting.id, set]);

	return (
		<VariantsScreen
			name="peek--hold"
			argues="No strip at all until you hold ⌥. Release and the card is exactly where you left it."
			hint={open ? "hold ⌥ to look · 1-4 jump · ← → walk · let go to snap back" : "decided"}
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
					<GlanceCard
						variation={showing.id}
						scale={FIELD_SCALE}
						against={peeking ? resting.id : undefined}
					/>
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>

				{/* the only resting chrome: one line, and it is a hint rather than a control */}
				<AnimatePresence initial={false} mode="wait">
					{held ? (
						<motion.div
							key="strip"
							className="mt-7 flex flex-col gap-2"
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
						>
							<div className="flex items-center gap-1">
								{set.map((variation, index) => (
									<span
										key={variation.id}
										className={cn(
											"flex h-5 items-center gap-1 rounded-xs px-1.5 font-mono text-2xs leading-3",
											variation.id === showing.id
												? "bg-raised text-text"
												: variation.id === resting.id
													? "text-thread"
													: "text-muted/60",
										)}
									>
										<span className="text-muted/40">{index + 1}</span>
										{variation.label}
									</span>
								))}
							</div>
							<span className="font-mono text-2xs text-muted/50 leading-3">
								{peeking ? `differs in ${saysRegions(regionsBetween(showing.id, resting.id))}` : "resting here"}
							</span>
						</motion.div>
					) : (
						<motion.span
							key="hint"
							className="mt-7 font-mono text-2xs text-muted/45 leading-3"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						>
							{open ? "hold ⌥ to look through the set" : "decided"}
						</motion.span>
					)}
				</AnimatePresence>
			</Placed>
		</VariantsScreen>
	);
}
