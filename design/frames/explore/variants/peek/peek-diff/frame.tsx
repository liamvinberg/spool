import { useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard, NotchCover, regionsBetween, saysRegions } from "shared/ui/explore/variants/variants-glance";
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
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * A glance should answer what changed, not that something did.
 *
 * Every other take on this page swaps the card and leaves your eye to find the
 * difference. This one knows: two candidates of this document differ in the
 * payment block and in the button under it, and `empty` differs in all of it,
 * so while you peek, the changed regions are outlined and everything that
 * stayed the same steps back to 55%. The readout names them in the same breath
 * — `payment · action` — so the peek is a sentence rather than a flicker.
 *
 * That is the strongest reason to prefer hovering over flipping: the compare is
 * done for you, at the moment you are looking, without a second card on screen.
 * What it costs is a claim about the document. spool can diff the rendered tree
 * cheaply, but a variation that changes a colour in forty places has no region
 * to outline, and this take would go quiet exactly when it is needed.
 */
export default function PeekDiffFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const showing = decision.candidates.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;
	const regions = regionsBetween(showing.id, resting.id);

	return (
		<VariantsScreen
			name="peek--diff"
			argues="While you peek, what changed is outlined and what did not steps back. The glance names the difference."
			hint={open ? "hover a cover to look · the outline is the difference · click to rest on it" : "decided"}
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
					<GlanceCard
						variation={showing.id}
						scale={FIELD_SCALE}
						against={peeking ? resting.id : undefined}
						dimUnchanged={peeking}
					/>
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>

				<div className="mt-7 flex flex-col gap-2.5" onPointerLeave={() => setPeek(null)}>
					<div className="flex items-center gap-1.5">
						{decision.candidates.map((variation) => (
							<NotchCover
								key={variation.id}
								variation={variation}
								state={variation.id === showing.id ? (peeking ? "peeking" : "resting") : "idle"}
								onPeek={() => setPeek(variation.id)}
								onLeave={() => setPeek(null)}
								onPin={() => {
									decision.look(variation.id);
									setPeek(null);
								}}
							/>
						))}
					</div>
					<span className="flex items-center gap-2 font-mono text-2xs leading-3">
						<span className={cn(peeking ? "text-text" : "text-thread")}>{showing.label}</span>
						<span className="text-muted/50">
							{peeking ? `differs in ${saysRegions(regions)}` : open ? "resting here" : "kept"}
						</span>
					</span>
				</div>
			</Placed>
		</VariantsScreen>
	);
}
