import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { VARIATIONS, variationAt } from "shared/ui/tvarso-checkout";
import {
	FRAME_ROW,
	FrameIcon,
	PlayVerb,
	RailFrameRow,
	RailPageRow,
	RailShell,
	StackIcon,
	VariantsScreen,
	VariationField,
	contentX,
	guideX,
} from "shared/ui/variants-shell";
import { useArrows, useCycle } from "shared/lib/variants-cycle";
import { ChevronIcon } from "shared/ui/spool-icons";
import { cn } from "shared/lib/utils";

/**
 * The rail is the switch: a frame with variations opens like a page does.
 *
 * The row keeps its name, its glyph and its place, and grows a chevron in the
 * ten pixels where the spine's tick is drawn for every other frame. Open, the
 * variations are rows one step further in, at the same height a frame row has,
 * because that is what they are. Press one and the canvas swaps in place.
 *
 * What it costs is the tree's one rule. Until now every row in this rail is a
 * folder on disk, and depth is nesting; here a row's children are four files
 * inside one folder, and the rail is saying so with the same chevron. The
 * question this frame asks is whether that is a lie worth telling.
 */
export default function TreeDropdownFrame() {
	const cycle = useCycle(VARIATIONS.length);
	const [open, setOpen] = useState(true);
	useArrows(cycle);
	const active = variationAt(cycle.index);

	return (
		<VariantsScreen
			name="tree--dropdown"
			argues="A frame with a set opens the way a page does, and the candidates are rows under it."
			hint="press a variation in the rail · ← → does the same thing"
			rail={
				<RailShell count={2}>
					<RailPageRow name="booking" open active count={3} />
					<VariationParent
						name="checkout"
						open={open}
						onToggle={() => setOpen((was) => !was)}
						count={VARIATIONS.length}
					/>
					<AnimatePresence initial={false}>
						{open ? (
							<motion.div
								className="overflow-hidden"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: VARIATIONS.length * FRAME_ROW, opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ type: "spring", stiffness: 460, damping: 42 }}
							>
								{VARIATIONS.map((variation, index) => (
									<VariationRow
										key={variation.id}
										name={variation.label}
										active={index === cycle.index}
										last={index === VARIATIONS.length - 1}
										onPick={() => cycle.go(index)}
									/>
								))}
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

/** a frame row that opens: the chevron stands where the spine's tick would be */
function VariationParent({
	name,
	open,
	count,
	onToggle,
}: {
	name: string;
	open: boolean;
	count: number;
	onToggle: () => void;
}) {
	return (
		<div className="group relative flex items-center pr-1.5 hover:bg-surface/60" style={{ height: FRAME_ROW }}>
			<span className="absolute w-px bg-border-raised" style={{ left: guideX(1), top: 0, height: FRAME_ROW }} />
			<button
				type="button"
				aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
				aria-expanded={open}
				onClick={onToggle}
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
				<StackIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted leading-xs">{name}</span>
			</button>
			<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{count}</span>
		</div>
	);
}

/** one variation, drawn as the frame it is, one step further in */
function VariationRow({
	name,
	active,
	last,
	onPick,
}: {
	name: string;
	active: boolean;
	last: boolean;
	onPick: () => void;
}) {
	return (
		<div
			className={cn("group relative flex items-center pr-1.5", active ? "bg-surface" : "hover:bg-surface/60")}
			style={{ height: FRAME_ROW }}
		>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span
				className="absolute w-px bg-border-raised"
				style={{ left: guideX(2), top: 0, height: last ? FRAME_ROW - 6 : FRAME_ROW }}
			/>
			<span className="absolute h-px w-2.5 bg-border-raised" style={{ left: guideX(2), top: FRAME_ROW / 2 }} />
			<button
				type="button"
				aria-pressed={active}
				onClick={onPick}
				className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
				style={{ paddingLeft: contentX(2) }}
			>
				<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted/70")} />
				<span
					className={cn("min-w-0 flex-1 truncate font-mono text-xs leading-xs", active ? "text-text" : "text-muted")}
				>
					{name}
				</span>
			</button>
			{active ? <span className="shrink-0 font-mono text-2xs text-thread leading-3">showing</span> : null}
		</div>
	);
}
