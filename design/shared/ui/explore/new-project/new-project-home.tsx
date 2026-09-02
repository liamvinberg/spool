import { useState } from "react";
import { HOME, shortPath } from "shared/lib/spool/picker-disk";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import {
	AskLabel,
	ChoiceRow,
	MadeLine,
	NameField,
	SPOOL_HOME,
	type Start,
	targetPath,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";
import { FolderIcon } from "shared/ui/spool/icons";
import { Hints, PickerStage } from "shared/ui/spool/picker-parts";

/**
 * Take four: the door is on home, not in the picker.
 *
 * The picker answers one question — which folder — and it answers it well
 * enough that #251 rebuilt the whole dialog around that question. Making a
 * folder is a different question, and the screen with nothing on it is where a
 * person is standing when they have to ask it. So the empty home grows a second
 * door beside the one its copy already points at, the dialog behind it is four
 * rows long because that is all creating a project needs, and the picker stays
 * exactly as it shipped.
 *
 * The cost is that the door is on the one screen you see once. Someone with
 * nine projects who wants a tenth opens the picker and finds nothing to press.
 */

/** where a folder that has nowhere else to be goes, when Finder has not been asked */
const CHOSEN = `${HOME}/personal/projects`;

export function NewProjectHome({ open = false, start }: { open?: boolean | undefined; start?: Start | undefined }) {
	const [showing, setShowing] = useState(open);
	return (
		<SpoolHomeScreen
			empty={
				<button
					type="button"
					onClick={() => setShowing(true)}
					className="mt-1 flex h-8 items-center gap-2 rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text transition-colors duration-150 hover:border-thread/40"
				>
					<FolderIcon className="h-3 w-3 text-thread" />
					New project
				</button>
			}
			overlay={showing ? <NewProjectDialog start={start} onClose={() => setShowing(false)} /> : null}
		/>
	);
}

function NewProjectDialog({ start, onClose }: { start?: Start | undefined; onClose: () => void }) {
	const np = useNewProject(start);
	const [where, setWhere] = useState<"spool" | "chosen">("spool");
	const parent = where === "spool" ? SPOOL_HOME : CHOSEN;

	return (
		<PickerStage width={440}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<FolderIcon className="h-3 w-3 shrink-0 text-thread" />
				<span className="flex-1 font-medium text-base leading-base">New project</span>
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">
					{`${targetPath(parent, np.name)}/design/`}
				</span>
			</div>

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
				path={where === "chosen" ? targetPath(CHOSEN, np.name) : "choose a folder…"}
				note={where === "chosen" ? shortPath(CHOSEN) : "Finder"}
				picked={where === "chosen"}
				onPress={() => setWhere("chosen")}
			/>

			<div className="mt-2 flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{np.made === null ? (
					<Hints className="flex-1" hints={["↵ creates", "esc cancels"]} />
				) : (
					<MadeLine made={np.made} className="min-w-0 flex-1" />
				)}
				<button
					type="button"
					onClick={onClose}
					className="flex h-7 shrink-0 items-center rounded-md px-3 text-muted text-sm hover:text-text"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={() => np.create(parent)}
					className="flex h-7 shrink-0 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
				>
					Create project
				</button>
			</div>
		</PickerStage>
	);
}
