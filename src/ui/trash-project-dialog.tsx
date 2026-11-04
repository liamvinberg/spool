import { ConfirmDialog } from "./confirm-dialog";
import { systemTrashName } from "./system-trash";

/**
 * "Move to Trash…" on a project, or on a team copy "Remove from this Mac…": either way only this Mac's folder goes,
 * and a team keeps its project.
 */
export function TrashProjectDialog({
	project,
	team,
	onTrash,
	onClose,
}: {
	project: { root: string; name: string };
	/** The team a team copy's project stays in, by name. */
	team?: string | undefined;
	onTrash: () => Promise<void>;
	onClose: () => void;
}) {
	const destination = systemTrashName();
	return (
		<ConfirmDialog
			{...(team === undefined
				? {
						title: `Move “${project.name}” to ${destination}?`,
						description: `The entire project folder and everything inside it will move to the ${destination}. You can restore it from there.`,
						confirmLabel: `Move to ${destination}`,
					}
				: {
						title: `Remove “${project.name}” from this Mac?`,
						description: `${team} keeps it. This Mac’s folder moves to the ${destination}, and you can get it again from the team’s Projects.`,
						confirmLabel: "Remove from this Mac",
					})}
			danger
			onConfirm={onTrash}
			onClose={onClose}
		>
			<ProjectPath root={project.root} />
		</ConfirmDialog>
	);
}

/** "Delete from <team>…": the project leaves the team for everyone, to its trash, and this Mac's folder goes too. */
export function DeleteFromTeamDialog({
	project,
	team,
	onDelete,
	onClose,
}: {
	project: { root: string; name: string };
	team: string;
	onDelete: () => Promise<void>;
	onClose: () => void;
}) {
	return (
		<ConfirmDialog
			title={`Delete “${project.name}” from ${team}?`}
			description={`It’s removed for everyone in ${team} and waits in the team’s trash for 30 days, where an admin can restore it. This Mac’s folder moves to the ${systemTrashName()}.`}
			confirmLabel={`Delete from ${team}`}
			danger
			onConfirm={onDelete}
			onClose={onClose}
		>
			<ProjectPath root={project.root} />
		</ConfirmDialog>
	);
}

function ProjectPath({ root }: { root: string }) {
	return (
		<code className="block [overflow-wrap:anywhere] text-secondary [font:var(--type-detail)] [font-feature-settings:var(--font-mono--font-feature-settings)]">
			{root}
		</code>
	);
}
