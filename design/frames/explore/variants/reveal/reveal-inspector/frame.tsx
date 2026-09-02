import { motion } from "motion/react";
import { Scaled, TvarsoCheckout } from "shared/ui/demo/tvarso-checkout";
import { RailTabs } from "shared/ui/spool/canvas-chrome";
import { KeepVerb, PlayVerb, VariantsScreen, VariationField } from "shared/ui/explore/variants/variants-shell";
import { useKey } from "shared/lib/explore/variants/variants-cycle";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { cn } from "shared/lib/utils";

/**
 * The decision belongs to the inspector, because the inspector is already the
 * place that answers "what is this frame".
 *
 * Today's inspector gains one section under the frame's name: every candidate
 * as a row carrying a live cover of itself, the one on the canvas marked, and
 * both verbs on the row you are on. Nothing changes on the field and nothing
 * changes in the tree.
 *
 * The covers are the point. Most takes on this page switch between names; here
 * you choose by looking, which is what a decision between four screens actually
 * needs, and it is why the section can afford 64 pixels a row. Read this one
 * next to `rail--decide`: same idea, older rail, and the reason this one loses
 * is that the rail it is drawn in is the rail spool is replacing.
 */

const COVER = 0.085;

export default function RevealInspectorFrame() {
	const decision = useDecision();
	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);
	const active = decision.showing;
	const open = decision.standing === "open";

	return (
		<VariantsScreen
			name="reveal--inspector"
			argues="The set lives in the right rail, as rows with covers you choose by looking."
			hint={open ? "the inspector holds the set · ← → looks · keep ends it" : "decided"}
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
						<span className="font-mono text-2xs text-muted leading-3">{open ? "candidates" : "decided"}</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">
							{open ? decision.candidates.length : (decision.kept?.label ?? "")}
						</span>
					</div>
					<div className="flex flex-col border-border border-b pb-2">
						{decision.candidates.map((variation) => {
							const on = variation.id === active.id;
							return (
								<button
									key={variation.id}
									type="button"
									aria-pressed={on}
									onClick={() => decision.look(variation.id)}
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
										<span className="truncate font-mono text-2xs text-muted/45 leading-3">
											{open ? variation.note : "kept"}
										</span>
									</span>
									{on && open ? (
										<span className="flex shrink-0 items-center gap-1.5 pl-1">
											<button
												type="button"
												title="keep this one and discard the rest"
												onClick={(event) => {
													event.stopPropagation();
													decision.keep(variation.id);
												}}
												className="rounded-xs border border-border-raised px-1.5 py-[3px] font-mono text-2xs text-muted leading-3 transition-colors hover:border-thread hover:text-text"
											>
												keep
											</button>
											{decision.candidates.length > 1 ? (
												<button
													type="button"
													aria-label={`Discard ${variation.label}`}
													onClick={(event) => {
														event.stopPropagation();
														decision.discard(variation.id);
													}}
													className="flex h-4 w-4 items-center justify-center text-muted/50 transition-colors hover:text-text"
												>
													<svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
														<path d="m2.4 2.4 5.2 5.2m0-5.2-5.2 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
													</svg>
												</button>
											) : null}
										</span>
									) : null}
								</button>
							);
						})}
					</div>
					{decision.discarded.length === 0 ? null : (
						<div className="flex flex-col border-border border-b pb-2">
							<div className="flex items-center justify-between px-4 pt-2 pb-1.5">
								<span className="font-mono text-2xs text-muted leading-3">discarded</span>
								<span className="font-mono text-2xs text-muted/45 leading-3">{decision.discarded.length}</span>
							</div>
							{decision.discarded.map((variation) => (
								<div key={variation.id} className="group flex h-7 items-center gap-2 px-4">
									<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted/45 leading-xs line-through">
										{variation.label}
									</span>
									<button
										type="button"
										onClick={() => decision.restore(variation.id)}
										className="shrink-0 font-mono text-2xs text-muted/40 leading-3 transition-colors hover:text-text"
									>
										restore
									</button>
								</div>
							))}
						</div>
					)}
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
				stacked={open}
				right={
					<>
						<span className="font-mono text-2xs text-muted leading-3">{active.label}</span>
						{open ? <KeepVerb onKeep={() => decision.keep(active.id)} /> : <PlayVerb />}
					</>
				}
			/>
		</VariantsScreen>
	);
}
