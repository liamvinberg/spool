import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

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
			<label>
				Project name
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					spellCheck={false}
					autoComplete="off"
				/>
			</label>
			<code>{`${parent}/${name || project.name}`}</code>
		</ConfirmDialog>
	);
}
