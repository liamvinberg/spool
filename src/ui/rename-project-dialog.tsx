import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { Field, TextField } from "./primitives/inputs";

export function RenameProjectDialog({
	project,
	team,
	initialName,
	onRename,
	onClose,
}: {
	project: { root: string; name: string };
	/** The team a team copy's project is in, by name: it is renamed there first, for everyone. */
	team?: string | undefined;
	initialName: string;
	onRename: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState(initialName);
	// a team names its projects in lowercase, and the folder takes the team's name
	const name = team === undefined ? draft.trim() : draft.trim().toLowerCase();
	const parent = project.root.slice(0, project.root.lastIndexOf("/"));
	return (
		<ConfirmDialog
			title="Rename project"
			description={
				team === undefined
					? "This also renames the folder on your Mac."
					: `This renames it in ${team} for everyone, and its folder on your Mac.`
			}
			confirmLabel="Rename folder"
			disabled={name === "" || name === project.name}
			onConfirm={() => onRename(name)}
			onClose={onClose}
		>
			<Field label="Project name">
				{(id) => (
					<TextField size="lg" value={draft} onValueChange={setDraft} inputProps={{ id, autoComplete: "off" }} />
				)}
			</Field>
			<code className="block [overflow-wrap:anywhere] text-secondary [font:var(--type-detail)] [font-feature-settings:var(--font-mono--font-feature-settings)]">{`${parent}/${name || project.name}`}</code>
		</ConfirmDialog>
	);
}
