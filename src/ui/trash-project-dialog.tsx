import { ConfirmDialog } from "./confirm-dialog";
import { systemTrashName } from "./system-trash";

export function TrashProjectDialog({
	project,
	onTrash,
	onClose,
}: {
	project: { root: string; name: string };
	onTrash: () => Promise<void>;
	onClose: () => void;
}) {
	const destination = systemTrashName();
	return (
		<ConfirmDialog
			title={`Move “${project.name}” to ${destination}?`}
			description={`The entire project folder and everything inside it will move to the ${destination}. You can restore it from there.`}
			confirmLabel={`Move to ${destination}`}
			danger
			onConfirm={onTrash}
			onClose={onClose}
		>
			<code>{project.root}</code>
		</ConfirmDialog>
	);
}
