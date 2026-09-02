import { useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard } from "shared/ui/explore/variants/variants-glance";
import { FIELD_SCALE, KeepVerb, Neighbour, Placed, SelectionRing, StackIcon, VariantsScreen } from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * The whole feature is forty pixels of the row the frame already has.
 *
 * Four dots sit after the name, one per candidate. Run the pointer across them
 * and the card follows, instantly, and the right of the same row says which one
 * you are on — so the label row is the strip, the readout and the verb, and the
 * field below it is untouched. At rest it looks like a frame name with a small
 * count after it, which is the point: a project with sets on half its frames
 * does not become a project full of furniture.
 *
 * The cost is honest and it is legibility. A dot cannot say `invoice`, so
 * finding a particular candidate means sweeping until the readout says its
 * name, and beyond about six dots the sweep is a guess.
 */
export default function PeekLabelFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const showing = decision.candidates.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;

	return (
		<VariantsScreen
			name="peek--label"
			argues="No new surface at all: four dots in the label row, and the row says which one you are on."
			hint={open ? "sweep the dots · click one to rest on it · keep ends the decision" : "decided"}
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
				{/* the label row, doing three jobs and staying one row */}
				<div className="flex w-[216px] min-w-0 items-center gap-1.5 font-mono text-sm leading-4">
					{open ? <StackIcon className="h-3 w-3 shrink-0 text-thread" /> : null}
					<span className="shrink-0 text-thread">checkout</span>
					{open ? (
						<span className="flex shrink-0 items-center gap-1" onPointerLeave={() => setPeek(null)}>
							{decision.candidates.map((variation) => {
								const on = variation.id === showing.id;
								return (
									<button
										key={variation.id}
										type="button"
										aria-label={variation.label}
										onPointerEnter={() => setPeek(variation.id)}
										onFocus={() => setPeek(variation.id)}
										onClick={() => {
											decision.look(variation.id);
											setPeek(null);
										}}
										className="flex h-4 w-3 items-center justify-center"
									>
										<span
											className={cn(
												"rounded-full transition-all duration-100",
												on ? "h-[7px] w-[7px]" : "h-[5px] w-[5px]",
												variation.id === resting.id
													? "bg-thread"
													: on
														? "bg-text"
														: "bg-border-raised",
											)}
										/>
									</button>
								);
							})}
						</span>
					) : null}
					<span className="ml-auto flex shrink-0 items-center gap-1.5">
						<span className={cn("font-mono text-2xs leading-3", peeking ? "text-text" : "text-muted")}>
							{showing.label}
						</span>
						{open ? <KeepVerb label="" onKeep={() => decision.keep(showing.id)} /> : null}
					</span>
				</div>
				<div className="relative mt-1.5">
					<GlanceCard variation={showing.id} scale={FIELD_SCALE} />
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>
			</Placed>
		</VariantsScreen>
	);
}
