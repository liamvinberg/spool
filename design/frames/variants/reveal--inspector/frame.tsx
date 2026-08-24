import { motion } from "motion/react";
import { Scaled, TvarsoCheckout, VARIATIONS, variationAt } from "../../../shared/ui/tvarso-checkout";
import { RailTabs } from "../../../shared/ui/spool-canvas-chrome";
import { PlayVerb, VariantsScreen, VariationField } from "../../../shared/ui/variants-shell";
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * The switch belongs to the inspector, because the inspector is already the
 * place that answers "what is this frame".
 *
 * The rail on the right gains one section under the frame's name: every
 * variation as a row, each carrying a live cover of itself, the one on the
 * canvas marked. Nothing changes on the field and nothing changes in the tree,
 * so the pages rail stays a map of the project and the inspector stays a
 * reading of the selection.
 *
 * The covers are the point. Every other take on this page switches between
 * names; this is the only one where you choose by looking, and it is the reason
 * the section can afford 64 pixels a row. What it costs is reach: the inspector
 * is on the far side of the window from the tree, and shut, it says nothing at
 * all.
 */

const COVER = 0.085;

export default function RevealInspectorFrame() {
	const cycle = useCycle(VARIATIONS.length);
	useArrows(cycle);
	const active = variationAt(cycle.index);

	return (
		<VariantsScreen
			hint="the inspector holds the set · ← → moves it"
			inspector={
				<>
					<RailTabs tabs={["elements", "connections"]} active="elements" />
					<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
						<span className="truncate font-mono text-sm text-text leading-sm">checkout</span>
						<span className="truncate font-mono text-2xs text-muted/60 leading-3">
							frames/booking/checkout/frame.tsx
						</span>
					</div>
					<div className="flex items-center justify-between px-4 pt-2 pb-1.5">
						<span className="font-mono text-2xs text-muted leading-3">variations</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">{VARIATIONS.length}</span>
					</div>
					<div className="flex flex-col border-border border-b pb-2">
						{VARIATIONS.map((variation, index) => {
							const on = index === cycle.index;
							return (
								<button
									key={variation.id}
									type="button"
									aria-pressed={on}
									onClick={() => cycle.go(index)}
									className={cn(
										"group relative flex h-16 items-center gap-3 pr-3 pl-4 text-left transition-colors",
										on ? "bg-surface" : "hover:bg-surface/60",
									)}
								>
									{on ? (
										<motion.span
											layoutId="variation-spine"
											className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread"
										/>
									) : null}
									<span
										className={cn(
											"flex shrink-0 overflow-hidden rounded-[3px] border",
											on ? "border-thread" : "border-border-raised",
										)}
									>
										<Scaled scale={COVER}>
											<TvarsoCheckout variation={variation.id} />
										</Scaled>
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className={cn("truncate font-mono text-xs leading-xs", on ? "text-text" : "text-muted")}>
											{variation.label}
										</span>
										<span className="truncate font-mono text-2xs text-muted/45 leading-3">{variation.note}</span>
									</span>
								</button>
							);
						})}
					</div>
					<div className="flex items-center justify-between px-4 pt-2 pb-1">
						<span className="font-mono text-2xs text-muted leading-3">elements</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">6</span>
					</div>
					<div className="min-h-0 flex-1 overflow-hidden pb-3">
						{["card", "masthead", "trip", "lines", "payment", "pay-button"].map((name, index) => (
							<div key={name} className="flex h-7 items-center">
								<span
									className="truncate font-mono text-sm text-muted leading-sm"
									style={{ paddingLeft: 16 + (index === 0 ? 0 : 14) }}
								>
									{name}
								</span>
							</div>
						))}
					</div>
				</>
			}
		>
			<VariationField
				variation={active.id}
				stacked
				right={
					<>
						<span className="font-mono text-2xs text-muted leading-3">{active.label}</span>
						<PlayVerb />
					</>
				}
			/>
		</VariantsScreen>
	);
}
