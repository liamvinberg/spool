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
			<label className="flex flex-col gap-[8px] [font:var(--type-control)]">
				Project name
				<input
					className="min-w-0 py-[9px] px-[10px] border border-border-raised rounded-[4px] bg-bg focus-visible:[outline:1px_solid_var(--color-thread)] focus-visible:outline-offset-[1px]"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					spellCheck={false}
					autoComplete="off"
				/>
			</label>
			<code className="block [margin:12px_0_20px] [overflow-wrap:anywhere] text-muted [font:var(--type-detail)] [font-feature-settings:var(--font-mono--font-feature-settings)]">{`${parent}/${name || project.name}`}</code>
		</ConfirmDialog>
	);
}
