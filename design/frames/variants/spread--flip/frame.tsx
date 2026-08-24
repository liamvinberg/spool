import { useEffect, useState } from "react";
import { type VariationId, VARIATIONS } from "../../../shared/ui/tvarso-checkout";
import { GlanceCard, regionsBetween, saysRegions } from "../../../shared/ui/variants-glance";
import { FIELD_SCALE, FrameLabel, KeepVerb, Placed, SelectionRing, VariantsScreen } from "../../../shared/ui/variants-shell";
import { useDecision } from "../../../shared/lib/variants-decision";
import { cn } from "../../../shared/lib/utils";

/**
 * Two candidates in the same pixels, and your own eye does the diff.
 *
 * Side by side, a two pixel difference in a payment field is invisible. In the
 * same place, one after the other, it is the only thing on screen that moves —
 * which is why anyone comparing two photographs flicks between them rather than
 * laying them out. Hold F, or press and hold on the card, and the frame is B;
 * let go and it is A. Nothing animates, because an animation would be a second
 * moving thing.
 *
 * No outlines here on purpose. This take is the argument that the flick is
 * enough, and that a set of two is worth treating as its own shape rather than
 * a list you happen to have narrowed to two.
 */

export default function SpreadFlipFrame() {
	const decision = useDecision();
	const [a, setA] = useState<VariationId>("card");
	const [b, setB] = useState<VariationId>("swish");
	const [flipped, setFlipped] = useState(false);
	const open = decision.standing === "open";
	const showing = flipped ? b : a;

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "f") return;
			event.preventDefault();
			setFlipped(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "f") return;
			setFlipped(false);
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
			name="spread--flip"
			argues="A and B in the same pixels. Hold F to flip; what moves is what differs."
			hint={open ? "hold f, or press and hold the card · release to go back to A" : "decided"}
		>
			<Placed x={338} y={150} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? decision.candidates.length : undefined}
					right={
						<>
							<span className={cn("font-mono text-2xs leading-3", flipped ? "text-text" : "text-muted")}>
								{flipped ? "B" : "A"}
							</span>
							{open ? <KeepVerb onKeep={() => decision.keep(showing)} /> : null}
						</>
					}
				/>
				<div
					className="relative cursor-pointer select-none"
					onPointerDown={() => setFlipped(true)}
					onPointerUp={() => setFlipped(false)}
					onPointerLeave={() => setFlipped(false)}
				>
					<GlanceCard variation={showing} scale={FIELD_SCALE} />
					{flipped ? (
						<span className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					) : (
						<SelectionRing size="360 × 620" />
					)}
				</div>
			</Placed>

			{/* the pair, and what is in each half of it */}
			<div className="absolute top-[150px] left-[620px] flex w-[240px] flex-col gap-5">
				<Slot name="A" pick={a} other={b} onPick={setA} lit={!flipped} candidates={decision.candidates.map((one) => one.id)} />
				<Slot name="B" pick={b} other={a} onPick={setB} lit={flipped} candidates={decision.candidates.map((one) => one.id)} />
				<div className="flex flex-col gap-2 border-border border-t pt-4">
					<span className="font-mono text-2xs text-muted leading-3">{saysRegions(regionsBetween(a, b))}</span>
					<span className="text-base text-muted/70 leading-base">
						Hold to flip. The parts that stay still are the parts they share.
					</span>
				</div>
			</div>
		</VariantsScreen>
	);
}

function Slot({
	name,
	pick,
	other,
	lit,
	candidates,
	onPick,
}: {
	name: string;
	pick: VariationId;
	other: VariationId;
	lit: boolean;
	candidates: readonly VariationId[];
	onPick: (id: VariationId) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className={cn("font-mono text-2xs leading-3", lit ? "text-thread" : "text-muted/50")}>{name}</span>
			<div className="flex flex-wrap items-center gap-1">
				{candidates.map((id) => {
					const label = VARIATIONS.find((one) => one.id === id)?.label ?? id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => onPick(id)}
							className={cn(
								"h-5 rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors",
								id === pick
									? "bg-raised text-text"
									: id === other
										? "text-muted/35"
										: "text-muted/60 hover:text-text",
							)}
						>
							{label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
