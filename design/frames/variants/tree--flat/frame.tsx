import { Scaled, TvarsoCheckout, VARIATIONS } from "../../../shared/ui/tvarso-checkout";
import {
	FRAME_ROW,
	FrameIcon,
	FrameLabel,
	PlayVerb,
	RailFrameRow,
	RailPageRow,
	RailShell,
	SelectionRing,
	VariantsScreen,
	contentX,
	guideX,
} from "../../../shared/ui/variants-shell";
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * What if the answer is typography.
 *
 * Nothing new on disk, nothing new in the model, no chevron and no chip: four
 * `--` siblings, four rows, four frames on the field, exactly as spool works
 * today. The only change is that a row whose name shares a stem with the row
 * above it draws the stem at 45% and its own suffix at full, so a column of
 * four reads as one thing with four endings instead of four unrelated names.
 * Sorting already puts them together, because `--` sorts adjacent.
 *
 * The claim: the relationship is already legible if you stop drawing every
 * character at the same weight, and everything else on this page is a concept
 * bought with a feature. The cost is that it stays four of everything: four
 * frame.json files, four positions, four thumbnails, and a rename of the base
 * that quietly orphans three.
 */

const SIBLINGS = [...VARIATIONS].sort((a, b) => a.frame.localeCompare(b.frame));
const SCALE = 0.45;
const W = 162;
const H = 279;

export default function TreeFlatFrame() {
	const cycle = useCycle(SIBLINGS.length);
	useArrows(cycle);

	return (
		<VariantsScreen
			name="tree--flat"
			argues="Change nothing but the type: four siblings read as a set once the shared stem steps back."
			hint="four frames, four rows · ← → walks the siblings"
			rail={
				<RailShell count={2}>
					<RailPageRow name="booking" open active count={6} />
					{SIBLINGS.map((variation, index) => (
						<StemRow
							key={variation.id}
							name={variation.frame}
							selected={index === cycle.index}
							onSelect={() => cycle.go(index)}
						/>
					))}
					<RailFrameRow name="timetable" />
					<RailFrameRow name="ticket" last />
					<RailPageRow name="site" open={false} count={4} />
				</RailShell>
			}
		>
			<div className="absolute inset-0 flex items-center justify-center gap-6">
				{SIBLINGS.map((variation, index) => {
					const selected = index === cycle.index;
					return (
						<div key={variation.id} className="flex flex-col gap-1.5">
							<FrameLabel name={variation.frame} selected={selected} paused={!selected} width={W} right={selected ? <PlayVerb /> : undefined} />
							<div className="relative" style={{ width: W, height: H }}>
								<button
									type="button"
									onClick={() => cycle.go(index)}
									className="block h-full w-full cursor-pointer overflow-hidden rounded-[6px]"
								>
									<Scaled scale={SCALE}>
										<TvarsoCheckout variation={variation.id} />
									</Scaled>
								</button>
								{selected ? <SelectionRing size="360 × 620" /> : null}
							</div>
						</div>
					);
				})}
			</div>
		</VariantsScreen>
	);
}

/** a sibling row: the shared stem steps back so the suffix can be read */
function StemRow({ name, selected, onSelect }: { name: string; selected: boolean; onSelect: () => void }) {
	const cut = name.indexOf("--");
	const stem = cut === -1 ? name : name.slice(0, cut);
	const tail = cut === -1 ? "" : name.slice(cut);
	return (
		<div
			className={cn("group relative flex items-center pr-1.5", selected ? "bg-surface" : "hover:bg-surface/60")}
			style={{ height: FRAME_ROW }}
		>
			{selected ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="absolute w-px bg-border-raised" style={{ left: guideX(1), top: 0, height: FRAME_ROW }} />
			<span className="absolute h-px w-2.5 bg-border-raised" style={{ left: guideX(1), top: FRAME_ROW / 2 }} />
			<button
				type="button"
				aria-pressed={selected}
				onClick={onSelect}
				className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
				style={{ paddingLeft: contentX(1) }}
			>
				<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />
				<span className="min-w-0 flex-1 truncate font-mono text-xs leading-xs">
					<span className={cn(tail === "" ? (selected ? "text-text" : "text-muted") : "text-muted/45")}>{stem}</span>
					<span className={selected ? "text-text" : "text-muted"}>{tail}</span>
				</span>
			</button>
		</div>
	);
}
