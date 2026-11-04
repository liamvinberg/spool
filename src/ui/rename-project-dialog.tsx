import { useState } from "react";
import { teamProjectName } from "../team-project-name";
import { ConfirmDialog } from "./confirm-dialog";
import { Field, TextField } from "./primitives/inputs";
import type { CopyTeam } from "./trash-project-dialog";

export function RenameProjectDialog({
	project,
	team,
	initialName,
	onRename,
	onClose,
}: {
	project: { root: string; name: string };
	/** The team a team copy's project is in: it is renamed there first, for everyone. */
	team?: CopyTeam | undefined;
	initialName: string;
	onRename: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState(initialName);
	// a team names its projects as spool.page cleans what was typed ("My Site" is my-site)
	const name = team === undefined ? draft.trim() : (teamProjectName(draft) ?? "");
	const parent = project.root.slice(0, project.root.lastIndexOf("/"));
	// a checkout, or a folder picked by hand, keeps its name: only the team project is renamed
	const moves = team === undefined || team.ownFolder;
	return (
		<ConfirmDialog
			title="Rename project"
			description={
				team === undefined
					? "This also renames the folder on your Mac."
					: team.ownFolder
						? `This renames it in ${team.name} for everyone, and its folder on your Mac.`
						: `This renames it in ${team.name} for everyone. Its folder on your Mac keeps its name.`
			}
			confirmLabel={moves ? "Rename folder" : "Rename"}
			disabled={name === "" || name === (team?.project ?? project.name)}
			onConfirm={() => onRename(name)}
			onClose={onClose}
		>
			<Field label="Project name">
				{(id) => (
					<TextField size="lg" value={draft} onValueChange={setDraft} inputProps={{ id, autoComplete: "off" }} />
				)}
			</Field>
			<code className="block [overflow-wrap:anywhere] text-secondary [font:var(--type-detail)] [font-feature-settings:var(--font-mono--font-feature-settings)]">
				{moves ? `${parent}/${name || project.name}` : project.root}
			</code>
		</ConfirmDialog>
	);
}
