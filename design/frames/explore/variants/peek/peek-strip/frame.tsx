import { useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { GlanceCard, NotchName, PeekReadout } from "shared/ui/explore/variants/variants-glance";
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

/**
 * Hovering a name is the cheapest look there is.
 *
 * The strip under the frame is four words. Put the pointer on one and the card
 * is that one, in the same pixels, with no transition at all — the swap is a
 * render, so it lands in the frame you moved into it. Take the pointer off and
 * the card is back before you notice it left. Nothing is committed by looking,
 * so you can run along the whole set in about a second and let go.
 *
 * Clicking rests the decision on the one under the pointer, which is the only
 * state the frame keeps; keep ends the decision. Names rather than covers,
 * because a name is readable without hovering and a 12px cover is not, and the
 * whole point of this take is that the strip is legible before you touch it.
 */
export default function PeekStripFrame() {
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
			name="peek--strip"
			argues="Four names under the frame. Hover one and the card is that one, instantly, until you move away."
			hint={open ? "hover a name to look · click to rest on it · keep ends the decision" : "decided"}
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
					<GlanceCard variation={showing.id} scale={FIELD_SCALE} />
					{peeking ? (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>

				<div className="mt-7 flex flex-col gap-2" onPointerLeave={() => setPeek(null)}>
					<div className="flex items-center gap-0.5">
						{decision.candidates.map((variation) => (
							<NotchName
								key={variation.id}
								label={variation.label}
								state={
									variation.id === showing.id ? (peeking ? "peeking" : "resting") : "idle"
								}
								onPeek={() => setPeek(variation.id)}
								onLeave={() => setPeek(null)}
								onPin={() => {
									decision.look(variation.id);
									setPeek(null);
								}}
							/>
						))}
					</div>
					<PeekReadout
						peeking={peeking}
						label={showing.label}
						says={open ? (peeking ? "looking" : "resting here") : "kept"}
					/>
				</div>
			</Placed>
		</VariantsScreen>
	);
}
