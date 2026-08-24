import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CARD_H, CARD_W, TvarsoCheckout, type VariationId } from "../../../shared/ui/tvarso-checkout";
import { GlanceCard, regionsBetween, saysRegions } from "../../../shared/ui/variants-glance";
import { FIELD_SCALE, SelectionRing, StackIcon, VariantsScreen } from "../../../shared/ui/variants-shell";
import { useDecision } from "../../../shared/lib/variants-decision";
import { cn } from "../../../shared/lib/utils";

/**
 * One surface that holds the whole decision, and stays open while it is being
 * made.
 *
 * The tray docks under the selected frame and does not go away: covers for
 * every candidate, a pin on each, and the verb at the end. Hover a cover and
 * the frame is that one. Pin two and the field itself becomes the comparison —
 * both at the same size, the difference outlined in each, the tray naming it.
 * Press keep and the decision closes.
 *
 * The other takes on this page make you choose between glancing and comparing;
 * this one says a decision is a place you are standing in for a few minutes and
 * gives it somewhere to stand. It is the most furniture of any take here, and
 * the only one where the state of your comparison survives moving the pointer
 * away.
 */

const PAIR = 0.5;
const COVER = 0.105;
const SPRING = { type: "spring", stiffness: 400, damping: 34, mass: 0.8 } as const;

export default function MixTrayFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	const [pinned, setPinned] = useState<readonly VariationId[]>([]);
	const open = decision.standing === "open";
	const set = decision.candidates;
	const resting = decision.showing;
	const showing = set.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;
	const pair = pinned.length === 2 ? pinned : null;

	const pin = (id: VariationId) =>
		setPinned((current) => {
			if (current.includes(id)) return current.filter((one) => one !== id);
			return current.length < 2 ? [...current, id] : [current[1] ?? id, id];
		});

	return (
		<VariantsScreen
			name="mix--tray"
			argues="A tray that stays: hover a cover to glance, pin two to compare, press keep to end it."
			hint={open ? "hover a cover · pin two to compare them · keep ends the decision" : "decided"}
		>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-7">
				<AnimatePresence initial={false} mode="wait">
					{pair === null ? (
						<motion.div
							key="one"
							className="flex flex-col gap-1.5"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.14 }}
						>
							<span className="flex w-[216px] items-center gap-1.5 font-mono text-sm leading-4">
								{open ? <StackIcon className="h-3 w-3 text-thread" /> : null}
								<span className="text-thread">checkout</span>
								<span className={cn("ml-auto font-mono text-2xs leading-3", peeking ? "text-text" : "text-muted")}>
									{showing.label}
								</span>
							</span>
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
						</motion.div>
					) : (
						<motion.div
							key="two"
							className="flex items-start gap-7"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.14 }}
						>
							{pair.map((id, index) => {
								const other = pair[1 - index] ?? id;
								return (
									<div key={id} className="flex flex-col gap-1.5">
										<span
											className="flex items-center gap-1.5 font-mono text-2xs text-muted leading-3"
											style={{ width: CARD_W * PAIR }}
										>
											{set.find((one) => one.id === id)?.label ?? id}
											<button
												type="button"
												onClick={() => decision.keep(id)}
												className="ml-auto text-muted/60 transition-colors hover:text-thread"
											>
												keep
											</button>
										</span>
										<div className="relative">
											<GlanceCard variation={id} scale={PAIR} against={other} />
											<span className="pointer-events-none absolute -inset-[3px] rounded-[9px] border-[1.5px] border-thread/45" />
										</div>
									</div>
								);
							})}
						</motion.div>
					)}
				</AnimatePresence>

				{/* the tray: it does not go away while the decision is open */}
				{open ? (
					<motion.div
						layout
						transition={SPRING}
						className="flex items-center gap-4 rounded-lg border border-border-raised bg-bg px-3.5 py-3"
						onPointerLeave={() => setPeek(null)}
					>
						<div className="flex items-start gap-2">
							{set.map((variation) => {
								const isPinned = pinned.includes(variation.id);
								return (
									<div key={variation.id} className="flex flex-col items-center gap-1.5">
										<button
											type="button"
											aria-label={variation.label}
											onPointerEnter={() => setPeek(variation.id)}
											onFocus={() => setPeek(variation.id)}
											onClick={() => decision.look(variation.id)}
											className={cn(
												"relative flex overflow-hidden rounded-[4px] border transition-colors",
												variation.id === resting.id
													? "border-thread"
													: variation.id === showing.id
														? "border-text"
														: "border-border-raised",
											)}
											style={{ width: CARD_W * COVER, height: CARD_H * COVER }}
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
											{variation.id === showing.id ? null : <span className="absolute inset-0 bg-bg/30" />}
										</button>
										<button
											type="button"
											aria-label={`Pin ${variation.label} to the compare`}
											onClick={() => pin(variation.id)}
											className={cn(
												"flex h-4 items-center rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors",
												isPinned ? "bg-thread text-on-thread" : "bg-raised text-muted/70 hover:text-text",
											)}
										>
											{isPinned ? (pinned.indexOf(variation.id) === 0 ? "A" : "B") : "pin"}
										</button>
									</div>
								);
							})}
						</div>

						<div className="flex flex-col gap-1 self-center border-border border-l pl-4">
							<span className="font-mono text-2xs text-muted leading-3">
								{pair === null
									? `${set.length} candidates · pin two to compare`
									: `comparing · ${saysRegions(regionsBetween(pair[0] ?? "card", pair[1] ?? "card"))}`}
							</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => decision.keep(showing.id)}
									className="flex h-6 items-center rounded-xs border border-border-raised px-2 font-mono text-2xs text-muted leading-3 transition-colors hover:border-thread hover:text-text"
								>
									keep {showing.label}
								</button>
								{pinned.length === 0 ? null : (
									<button
										type="button"
										onClick={() => setPinned([])}
										className="font-mono text-2xs text-muted/50 leading-3 transition-colors hover:text-text"
									>
										clear
									</button>
								)}
							</div>
						</div>
					</motion.div>
				) : (
					<span className="font-mono text-2xs text-muted leading-3">decided · {decision.kept?.label ?? ""}</span>
				)}
			</div>
		</VariantsScreen>
	);
}
