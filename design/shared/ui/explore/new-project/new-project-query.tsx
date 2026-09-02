import { shortPath } from "shared/lib/spool/picker-disk";
import {
	DiskRow,
	MadeLine,
	OfferRow,
	type Start,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";
import {
	Crumbs,
	Field,
	Hints,
	JumpRow,
	ListBox,
	PickerStage,
	Readout,
	UpButton,
} from "shared/ui/spool/picker-parts";

/**
 * Take two: what you typed is the name.
 *
 * There is no mode to enter, because the field you would have to switch already
 * holds the word you want. Every search ends in a row that offers to make the
 * thing you were looking for, and when nothing answers to the query that row is
 * the whole list rather than an apology followed by one. The location is the
 * folder you are standing in, printed in the row itself, so the offer never has
 * to be read together with the breadcrumb to be understood.
 *
 * The cost is that a folder name and a search term are not the same kind of
 * word. `gym br` finds gym-brute and would make a folder called `gym br`.
 */
export function NewProjectQuery({ start }: { start?: Start | undefined }) {
	const np = useNewProject(start);
	const { picker } = np;
	const typed = picker.query.trim();
	const offering = picker.searching && np.mode !== "made";
	const offerAt = np.rows.length;

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<UpButton picker={picker} />
				<Field picker={picker} placeholder="search every folder under ~" />
				<Readout picker={picker} count={np.rows.length} />
			</div>

			<div className="flex h-9 shrink-0 items-center gap-3 border-border border-b bg-canvas/40 px-4">
				<Crumbs picker={picker} />
			</div>

			<ListBox picker={picker} min={204} max={390}>
				{np.rows.map((row, index) => (
					<DiskRow
						key={row.dir.path}
						row={row}
						index={index}
						picked={np.madeAt === null ? index === picker.at : index === np.madeAt}
						searching={picker.searching}
						onPoint={() => picker.point(index)}
						onEnter={() => picker.enter(index)}
					/>
				))}
				{offering ? (
					<OfferRow
						label={
							<>
								{"create "}
								<span className="text-text">{typed}</span>
							</>
						}
						hint="↵ makes it"
						picked={picker.at === offerAt}
						onPress={() => {
							np.setName(typed);
							np.create(picker.path);
						}}
					>
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/55 leading-3">
							{`in ${shortPath(picker.path)}`}
						</span>
					</OfferRow>
				) : null}
			</ListBox>

			{picker.searching ? null : (
				<div className="flex h-10 shrink-0 items-center gap-3 border-border border-t px-4">
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">jump</span>
					<JumpRow picker={picker} />
				</div>
			)}

			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{np.made === null ? (
					<Hints
						className="flex-1"
						hints={
							picker.searching
								? ["↑↓ moves", "↵ opens, goes in, or creates", "esc clears"]
								: ["↑↓ moves", "↵ opens or goes in", "→ goes in", "esc closes"]
						}
					/>
				) : (
					<MadeLine made={np.made} className="min-w-0 flex-1" />
				)}
				<button type="button" className="flex h-7 shrink-0 items-center rounded-md px-3 text-muted text-sm hover:text-text">
					Cancel
				</button>
				<button
					type="button"
					onClick={() => {
						if (picker.at === offerAt && offering) {
							np.setName(typed);
							np.create(picker.path);
							return;
						}
						if (picker.picked?.dir.isProject === true) picker.enter(picker.at);
						else picker.openHere();
					}}
					className="flex h-7 max-w-[260px] shrink-0 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
				>
					<span className="truncate">
						{offering && picker.at === offerAt
							? `Create ${typed}`
							: picker.picked?.dir.isProject === true
								? `Open ${picker.picked.dir.name}`
								: "Open this folder"}
					</span>
				</button>
			</div>
		</PickerStage>
	);
}
