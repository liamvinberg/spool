import { shortPath } from "shared/lib/spool/picker-disk";
import {
	DiskRow,
	MadeLine,
	NameField,
	type NewProject,
	OfferRow,
	type Start,
	Target,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";
import {
	Crumbs,
	Field,
	Hints,
	JumpRow,
	ListBox,
	Nothing,
	PickerStage,
	Readout,
	UpButton,
} from "shared/ui/spool/picker-parts";
import { FolderIcon } from "shared/ui/spool/icons";

/**
 * Take one: one more row.
 *
 * The list already answers "which folder", and a folder that does not exist yet
 * is still an answer to that question, so it goes where the answers are — last,
 * under the folders of the place you are standing, one shade quieter than they
 * are. Enter does what Enter has always done here and turns the row into the
 * next thing it needs: the field you were searching with becomes the field you
 * name with, and the readout on its right stops counting folders and starts
 * printing the path the folder is about to have.
 *
 * The breadcrumb never moves, because it is the answer to where this lands.
 */
export function NewProjectRow({ start }: { start?: Start | undefined }) {
	const np = useNewProject(start);
	const { picker } = np;
	const naming = np.mode === "naming";
	const here = picker.path;

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<UpButton picker={picker} />
				{naming ? (
					<label className="flex min-w-0 flex-1 items-center gap-2.5">
						<FolderIcon className="h-3 w-3 shrink-0 text-thread" />
						<NameField np={np} parent={here} />
					</label>
				) : (
					<Field picker={picker} placeholder="search every folder under ~" />
				)}
				{naming ? <Target parent={here} name={np.name} /> : <Readout picker={picker} count={np.rows.length} />}
			</div>

			<div className="flex h-9 shrink-0 items-center gap-3 border-border border-b bg-canvas/40 px-4">
				<Crumbs picker={picker} />
			</div>

			<ListBox picker={picker} min={204} max={390}>
				{np.rows.length === 0 && picker.searching ? <Nothing picker={picker} /> : null}
				{np.rows.map((row, index) => (
					<DiskRow
						key={row.dir.path}
						row={row}
						index={index}
						picked={np.madeAt === null ? !naming && index === picker.at : index === np.madeAt}
						searching={picker.searching}
						dim={naming}
						onPoint={() => picker.point(index)}
						onEnter={() => picker.enter(index)}
					/>
				))}
				{picker.searching || naming ? null : (
					<OfferRow
						label="new project…"
						hint={np.mode === "made" ? undefined : "↵ names it"}
						picked={np.madeAt === null && picker.at === np.rows.length}
						onPress={() => np.begin("naming")}
					/>
				)}
			</ListBox>

			{picker.searching ? null : (
				<div className="flex h-10 shrink-0 items-center gap-3 border-border border-t px-4">
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">jump</span>
					<JumpRow picker={picker} />
				</div>
			)}

			<Footer np={np} here={here} naming={naming} />
		</PickerStage>
	);
}

function Footer({ np, here, naming }: { np: NewProject; here: string; naming: boolean }) {
	return (
		<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
			{np.made !== null ? (
				<MadeLine made={np.made} className="min-w-0 flex-1" />
			) : (
				<Hints
					className="flex-1"
					hints={
						naming
							? [`↵ creates it in ${shortPath(here)}`, "esc goes back"]
							: ["↑↓ moves", "↵ opens or goes in", "→ goes in", "esc closes"]
					}
				/>
			)}
			<button
				type="button"
				onClick={naming ? np.cancel : undefined}
				className="flex h-7 shrink-0 items-center rounded-md px-3 text-muted text-sm hover:text-text"
			>
				Cancel
			</button>
			<button
				type="button"
				onClick={() => (naming ? np.create(here) : np.begin("naming"))}
				className="flex h-7 max-w-[260px] shrink-0 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
			>
				<span className="truncate">
					{naming
						? np.name.trim() === ""
							? "Create project"
							: `Create ${np.name.trim()}`
						: np.picker.picked?.dir.isProject === true
							? `Open ${np.picker.picked.dir.name}`
							: "Open this folder"}
				</span>
			</button>
		</div>
	);
}
