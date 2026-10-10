import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { Field, TextField } from "./primitives/inputs";

export function RenameProjectDialog({
	project,
	initialName,
	onRename,
	onClose,
}: {
	project: { root: string; name: string };
	initialName: string;
	onRename: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState(initialName);
	const name = draft.trim();
	const parent = project.root.slice(0, project.root.lastIndexOf("/"));
	return (
		<ConfirmDialog
			title="Rename project"
			description="This also renames the folder on your Mac."
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
