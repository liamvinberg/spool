import { useState } from "react";
import {
	AskLabel,
	ChoiceRow,
	DiskRow,
	MadeLine,
	NameField,
	SPOOL_HOME,
	type Start,
	targetPath,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";
import { FolderIcon } from "shared/ui/spool/icons";
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

/**
 * Take three: #242's shape, literally.
 *
 * The footer is where the picker already keeps its second verb — "Initialize
 * here" appears there the moment a folder turns out not to be a project — so
 * the third verb goes beside it as a text link at the left, in the key hints'
 * own weight, which is the quietest place in the dialog that is still a place.
 * Pressing it turns the list into the two questions creating a project actually
 * has, and both answers are visible at once rather than one being a default you
 * find out about afterwards.
 *
 * This is the only take that can offer `~/Spool` at all, because it is the only
 * one where the location is a field rather than the place you happen to stand.
 */
export function NewProjectFooter({ start }: { start?: Start | undefined }) {
	const np = useNewProject(start);
	const { picker } = np;
	const asking = np.mode === "asking";
	const [where, setWhere] = useState<"spool" | "here">("spool");
	const parent = where === "spool" ? SPOOL_HOME : picker.path;

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				{asking ? (
					<>
						<FolderIcon className="h-3 w-3 shrink-0 text-thread" />
						<span className="flex-1 font-medium text-base leading-base">New project</span>
						<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">
							{`${targetPath(parent, np.name)}/design/`}
						</span>
					</>
				) : (
					<>
						<UpButton picker={picker} />
						<Field picker={picker} placeholder="search every folder under ~" />
						<Readout picker={picker} count={np.rows.length} />
					</>
				)}
			</div>

			<div className="flex h-9 shrink-0 items-center gap-3 border-border border-b bg-canvas/40 px-4">
				<Crumbs picker={picker} />
			</div>

			{asking ? (
				<div className="flex min-h-[204px] flex-col">
					<label className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
						<AskLabel>name</AskLabel>
						<NameField np={np} parent={parent} />
					</label>
					<div className="flex h-7 shrink-0 items-center gap-2 px-4 pt-2">
						<AskLabel>location</AskLabel>
						<span className="h-px flex-1 bg-border" />
					</div>
					<ChoiceRow
						path={targetPath(SPOOL_HOME, np.name)}
						note="spool keeps its own"
						picked={where === "spool"}
						onPress={() => setWhere("spool")}
					/>
					<ChoiceRow
						path={targetPath(picker.path, np.name)}
						note="where you were browsing"
						picked={where === "here"}
						onPress={() => setWhere("here")}
					/>
				</div>
			) : (
				<ListBox picker={picker} min={204} max={390}>
					{np.rows.length === 0 ? <Nothing picker={picker} /> : null}
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
				</ListBox>
			)}

			{picker.searching || asking ? null : (
				<div className="flex h-10 shrink-0 items-center gap-3 border-border border-t px-4">
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">jump</span>
					<JumpRow picker={picker} />
				</div>
			)}

			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{np.made !== null ? (
					<MadeLine made={np.made} className="min-w-0 flex-1" />
				) : asking ? (
					<Hints className="flex-1" hints={["↵ creates", "esc goes back"]} />
				) : (
					<div className="flex min-w-0 flex-1 items-center gap-4">
						<button
							type="button"
							onClick={() => np.begin("asking")}
							className="shrink-0 font-mono text-2xs text-muted leading-3 underline decoration-border-raised underline-offset-4 transition-colors hover:text-text"
						>
							new project
						</button>
						<span className="h-3 w-px shrink-0 bg-border" />
						<Hints hints={["↑↓ moves", "↵ opens", "esc closes"]} />
					</div>
				)}
				<button
					type="button"
					onClick={asking ? np.cancel : undefined}
					className="flex h-7 shrink-0 items-center rounded-md px-3 text-muted text-sm hover:text-text"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={() => {
						if (asking) np.create(parent);
						else if (picker.picked?.dir.isProject === true) picker.enter(picker.at);
						else picker.openHere();
					}}
					className="flex h-7 max-w-[260px] shrink-0 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
				>
					<span className="truncate">
						{asking
							? "Create project"
							: picker.picked?.dir.isProject === true
								? `Open ${picker.picked.dir.name}`
								: "Open this folder"}
					</span>
				</button>
			</div>
		</PickerStage>
	);
}
