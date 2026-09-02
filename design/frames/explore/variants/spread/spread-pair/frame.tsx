import { useState } from "react";
import { type Variation, type VariationId, VARIATIONS } from "shared/ui/tvarso-checkout";
import { GlanceCard, regionsBetween, saysRegions } from "shared/ui/variants-glance";
import { FIELD_SCALE, VariantsScreen } from "shared/ui/variants-shell";
import { useDecision } from "shared/lib/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * Two of them, at the same size, at the same moment.
 *
 * Every other take on this page shows one card at a time and asks you to
 * remember the last one. A decision between two payment blocks is not a memory
 * game, so this one puts both on the field, outlines what differs in each, and
 * names it once underneath. The set is still four; the compare is always two,
 * because two is what a person can actually hold.
 *
 * The verbs sit between the cards rather than on them: swap the sides, keep the
 * left, keep the right. Whichever you keep discards everything else, including
 * the other side of the compare — a comparison that cannot end in a decision is
 * a screenshot.
 */

export default function SpreadPairFrame() {
	const decision = useDecision();
	const [left, setLeft] = useState<VariationId>("card");
	const [right, setRight] = useState<VariationId>("swish");
	const open = decision.standing === "open";
	const regions = regionsBetween(left, right);
	const at = (id: VariationId): Variation => VARIATIONS.find((one) => one.id === id) ?? VARIATIONS[0]!;

	return (
		<VariantsScreen
			name="spread--pair"
			argues="Two candidates side by side with the difference outlined in both, and the verbs between them."
			hint={open ? "pick a candidate per side · the outline is what differs · keep ends the decision" : "decided"}
		>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
				<span className="font-mono text-2xs text-muted/60 leading-3">checkout · comparing 2 of {decision.candidates.length}</span>

				<div className="flex items-start gap-11">
					<Side
						side="left"
						pick={left}
						other={right}
						candidates={decision.candidates}
						onPick={setLeft}
						onKeep={() => decision.keep(left)}
						open={open}
					/>
					<Side
						side="right"
						pick={right}
						other={left}
						candidates={decision.candidates}
						onPick={setRight}
						onKeep={() => decision.keep(right)}
						open={open}
					/>
				</div>

				<div className="flex items-center gap-4">
					<span className="font-mono text-2xs text-muted leading-3">
						{at(left).label} against {at(right).label} · {saysRegions(regions)}
					</span>
					<button
						type="button"
						onClick={() => {
							setLeft(right);
							setRight(left);
						}}
						className="rounded-xs border border-border-raised px-2 py-1 font-mono text-2xs text-muted leading-3 transition-colors hover:border-thread hover:text-text"
					>
						swap
					</button>
				</div>
			</div>
		</VariantsScreen>
	);
}

function Side({
	side,
	pick,
	other,
	candidates,
	open,
	onPick,
	onKeep,
}: {
	side: "left" | "right";
	pick: VariationId;
	other: VariationId;
	candidates: readonly Variation[];
	open: boolean;
	onPick: (id: VariationId) => void;
	onKeep: () => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-1">
				{candidates.map((variation) => (
					<button
						key={variation.id}
						type="button"
						onClick={() => onPick(variation.id)}
						className={cn(
							"h-5 rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors",
							variation.id === pick
								? "bg-raised text-text"
								: variation.id === other
									? "text-muted/35"
									: "text-muted/60 hover:text-text",
						)}
					>
						{variation.label}
					</button>
				))}
			</div>
			<div className="relative">
				<GlanceCard variation={pick} scale={FIELD_SCALE} against={other} />
				<span className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread/45" />
			</div>
			<button
				type="button"
				onClick={onKeep}
				disabled={!open}
				className={cn(
					"flex h-6 items-center justify-center rounded-xs border font-mono text-2xs leading-3 transition-colors",
					open
						? "border-border-raised text-muted hover:border-thread hover:text-text"
						: "border-border text-muted/35",
				)}
			>
				keep the {side}
			</button>
		</div>
	);
}
