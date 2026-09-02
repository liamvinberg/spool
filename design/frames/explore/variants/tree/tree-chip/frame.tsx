import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { VARIATIONS, variationAt } from "shared/ui/demo/tvarso-checkout";
import {
	FRAME_ROW,
	FrameIcon,
	PlayVerb,
	RailFrameRow,
	RailPageRow,
	RailShell,
	VariantsScreen,
	VariationField,
	contentX,
	guideX,
} from "shared/ui/explore/variants/variants-shell";
import { useArrows, useCycle, useKey } from "shared/lib/explore/variants/variants-cycle";
import { ChevronIcon } from "shared/ui/spool/icons";
import { cn } from "shared/lib/utils";

/**
 * A variation is a property of the frame, not a child of it.
 *
 * The tree stays one row per frame, exactly as it is today, and the row carries
 * the name of whichever variation is on the canvas as a chip at its tail. Press
 * the chip and the set drops out of it. Nothing nests, nothing grows, and a
 * project with variations on twenty frames is still twenty rows.
 *
 * The claim: the rail's depth means folders on disk, and spending it on
 * something that is not a folder makes the whole tree less readable. The cost
 * is that the set is behind a press: the rail can tell you a frame has
 * variations and which one is showing, but never what the others are called.
 */
export default function TreeChipFrame() {
	const cycle = useCycle(VARIATIONS.length);
	const [open, setOpen] = useState(false);
	useArrows(cycle);
	useKey("Escape", useCallback(() => setOpen(false), []));
	const active = variationAt(cycle.index);

	return (
		<VariantsScreen
			name="tree--chip"
			argues="One row per frame forever. The candidate on the canvas is a chip at the tail of it."
			hint="press the chip in the rail · esc shuts the menu"
			rail={
				<RailShell count={2}>
					<RailPageRow name="booking" open active count={3} />
					<div className="relative">
						<ChipRow
							name="checkout"
							chip={active.label}
							open={open}
							onToggle={() => setOpen((was) => !was)}
						/>
						<AnimatePresence>
							{open ? (
								<>
									<button
										type="button"
										aria-label="Close"
										onClick={() => setOpen(false)}
										className="fixed inset-0 z-10 cursor-default"
									/>
									<motion.div
										className="absolute right-2 z-20 flex w-[164px] flex-col rounded-md border border-border-raised bg-raised p-unit"
										style={{ top: FRAME_ROW - 4 }}
										initial={{ opacity: 0, y: -4, scale: 0.98 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										exit={{ opacity: 0, y: -4, scale: 0.98 }}
										transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
									>
										<span className="flex h-6 items-center px-2 font-mono text-2xs text-muted/60 leading-3">
											candidates
										</span>
										{VARIATIONS.map((variation, index) => (
											<button
												key={variation.id}
												type="button"
												onClick={() => {
													cycle.go(index);
													setOpen(false);
												}}
												className={cn(
													"flex h-[26px] items-center gap-2 rounded-sm px-2 text-left font-mono text-xs leading-xs hover:bg-surface",
													index === cycle.index ? "text-text" : "text-muted",
												)}
											>
												<span className="flex w-2.5 justify-center text-thread">
													{index === cycle.index ? "•" : ""}
												</span>
												{variation.label}
											</button>
										))}
										<div className="mx-auto my-unit h-px w-[140px] bg-border-raised" />
										<button
											type="button"
											className="flex h-[26px] items-center rounded-sm px-2 text-left font-mono text-xs text-muted leading-xs hover:bg-surface"
										>
											keep {active.label}
										</button>
										<button
											type="button"
											className="flex h-[26px] items-center rounded-sm px-2 text-left font-mono text-xs text-muted leading-xs hover:bg-surface"
										>
											new candidate
										</button>
									</motion.div>
								</>
							) : null}
						</AnimatePresence>
					</div>
					<RailFrameRow name="timetable" />
					<RailFrameRow name="ticket" last />
					<RailPageRow name="site" open={false} count={4} />
				</RailShell>
			}
		>
			<VariationField
				variation={active.id}
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

/** the shipped frame row, with the active variation named at its tail */
function ChipRow({
	name,
	chip,
	open,
	onToggle,
}: {
	name: string;
	chip: string;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="group relative flex items-center bg-surface pr-1.5" style={{ height: FRAME_ROW }}>
			<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
			<span className="absolute w-px bg-border-raised" style={{ left: guideX(1), top: 0, height: FRAME_ROW }} />
			<span className="absolute h-px w-2.5 bg-border-raised" style={{ left: guideX(1), top: FRAME_ROW / 2 }} />
			<button
				type="button"
				className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
				style={{ paddingLeft: contentX(1) }}
			>
				<FrameIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-text leading-xs">{name}</span>
			</button>
			<button
				type="button"
				aria-expanded={open}
				aria-label="Variations"
				onClick={onToggle}
				className={cn(
					"flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors",
					open ? "bg-raised text-text" : "bg-surface text-muted hover:text-text",
				)}
			>
				{chip}
				<motion.span className="flex" initial={false} animate={{ rotate: open ? -90 : 90 }} transition={{ duration: 0.16 }}>
					<ChevronIcon className="h-2 w-2" />
				</motion.span>
			</button>
		</div>
	);
}
