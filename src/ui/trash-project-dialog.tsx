import { ConfirmDialog } from "./confirm-dialog";
import { systemTrashName } from "./system-trash";

/**
 * The team a team copy's project is in, by name, and whether its folder is the team's own on this Mac: one in a
 * checkout, or picked by hand, keeps everything but its design/ (spool#411).
 */
export interface CopyTeam {
	name: string;
	/** The team project's name, which a team copy's folder needn't share. */
	project: string;
	ownFolder: boolean;
}

/** What of this Mac's copy goes to the Trash with it. */
function leaving(team: CopyTeam): string {
	return team.ownFolder ? "This Mac’s folder" : "This Mac’s design/ folder";
}

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
	/** The team a team copy's project stays in. */
	team?: CopyTeam | undefined;
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
						description: `${team.name} keeps it. ${leaving(team)} moves to the ${destination}, and you can get it again from the team’s Projects.`,
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
	team: CopyTeam;
	onDelete: () => Promise<void>;
	onClose: () => void;
}) {
	return (
		<ConfirmDialog
			title={`Delete “${project.name}” from ${team.name}?`}
			description={`It’s removed for everyone in ${team.name} and waits in the team’s trash for 30 days, where an admin can restore it. ${leaving(team)} moves to the ${systemTrashName()}.`}
			confirmLabel={`Delete from ${team.name}`}
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
