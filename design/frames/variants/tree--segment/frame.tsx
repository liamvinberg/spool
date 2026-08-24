import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { VARIATIONS, variationAt } from "../../../shared/ui/tvarso-checkout";
import {
	FRAME_ROW,
	PlayVerb,
	RailFrameRow,
	RailPageRow,
	RailShell,
	StackIcon,
	VariantsScreen,
	VariationField,
	contentX,
	guideX,
} from "../../../shared/ui/variants-shell";
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";
import { ChevronIcon } from "../../../shared/ui/spool-icons";
import { cn } from "../../../shared/lib/utils";

/**
 * Open it and you get a control, not a list.
 *
 * The same chevron as the dropdown take, and the same press, but what drops out
 * is one 26px strip with the whole set on it and the thread sliding between
 * them. Four variations cost one row rather than four, twelve would scroll
 * inside the strip rather than pushing the rest of the project off the rail,
 * and switching is one press away from wherever the pointer already is.
 *
 * The claim: a set of variations is a value with a few options, and the rail
 * already knows how to draw one of those. The cost is that a variation stops
 * being a row: it cannot be renamed in place, dragged, right clicked or
 * reordered, which is most of what the rail is for.
 */
export default function TreeSegmentFrame() {
	const cycle = useCycle(VARIATIONS.length);
	const [open, setOpen] = useState(true);
	useArrows(cycle);
	const active = variationAt(cycle.index);

	return (
		<VariantsScreen
			name="tree--segment"
			argues="Open the row and get a control, not a list: the whole set on one 26px strip."
			hint="the strip carries the whole set · ← → slides it"
			rail={
				<RailShell count={2}>
					<RailPageRow name="booking" open active count={3} />
					<div className="group relative flex items-center bg-surface pr-1.5" style={{ height: FRAME_ROW }}>
						<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
						<span className="absolute w-px bg-border-raised" style={{ left: guideX(1), top: 0, height: FRAME_ROW }} />
						<button
							type="button"
							aria-label={`${open ? "Collapse" : "Expand"} checkout`}
							aria-expanded={open}
							onClick={() => setOpen((was) => !was)}
							className="absolute flex h-full w-4 items-center justify-center text-muted transition-colors hover:text-text"
							style={{ left: guideX(1) - 1 }}
						>
							<ChevronIcon open={open} className="h-2.5 w-2.5" />
						</button>
						<button
							type="button"
							className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
							style={{ paddingLeft: contentX(1) }}
						>
							<StackIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
							<span className="min-w-0 flex-1 truncate font-mono text-xs text-text leading-xs">checkout</span>
						</button>
						<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{VARIATIONS.length}</span>
					</div>
					<AnimatePresence initial={false}>
						{open ? (
							<motion.div
								className="overflow-hidden"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: 34, opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ type: "spring", stiffness: 480, damping: 44 }}
							>
								<div className="flex h-[34px] items-center" style={{ paddingLeft: contentX(1) - 2, paddingRight: 10 }}>
									<div className="flex h-[22px] flex-1 items-stretch rounded-sm bg-surface p-[2px]">
										{VARIATIONS.map((variation, index) => {
											const on = index === cycle.index;
											return (
												<button
													key={variation.id}
													type="button"
													aria-pressed={on}
													onClick={() => cycle.go(index)}
													className="relative flex flex-1 items-center justify-center"
												>
													{on ? (
														<motion.span
															layoutId="segment"
															className="absolute inset-0 rounded-xs bg-raised"
															transition={{ type: "spring", stiffness: 520, damping: 42 }}
														/>
													) : null}
													<span
														className={cn(
															"relative font-mono text-2xs leading-3 transition-colors",
															on ? "text-text" : "text-muted hover:text-text",
														)}
													>
														{variation.label}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							</motion.div>
						) : null}
					</AnimatePresence>
					<RailFrameRow name="timetable" />
					<RailFrameRow name="ticket" last />
					<RailPageRow name="site" open={false} count={4} />
				</RailShell>
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
