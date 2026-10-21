import { useContext, useEffect, useState } from "react";
import type { CloudTeam, RemovedTeamProject } from "../cloud-teams";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "./primitives/actions";
import { ListRow } from "./primitives/structure";
import { teamSays } from "./team-source";
import { TeamsSourceContext } from "./teams";

const DAY_SECONDS = 86_400;

/** Days a removed project has left in the trash, as its row says them: never fewer than one while it is there. */
function daysLeft(purgeAt: number): string {
	const days = Math.max(1, Math.ceil((purgeAt - Date.now() / 1000) / DAY_SECONDS));
	return days === 1 ? "1 day left" : `${days} days left`;
}

/** Everything a deleted project takes with it, its shares counted. */
function goesForGood(shares: number): string {
	const counted = shares === 0 ? "and covers" : `covers and ${shares === 1 ? "1 share" : `${shares} shares`}`;
	return `Its files, history, comments, ${counted} are deleted for good. This can’t be undone.`;
}

/**
 * A team's trash on its Projects page (#197), its admins' alone: each removed project with who removed it and the
 * days it has left before spool.page deletes it, to restore or to delete now. Nothing while the trash is empty.
 */
export function TeamRemoved({ team, onRestored }: { team: CloudTeam; onRestored?: (() => void) | undefined }) {
	const source = useContext(TeamsSourceContext);
	const admin = team.role === "admin";
	const [projects, setProjects] = useState<RemovedTeamProject[]>([]);
	const [deleting, setDeleting] = useState<RemovedTeamProject | null>(null);
	const [refused, setRefused] = useState<string | null>(null);
	useEffect(() => {
		if (!admin) return;
		let current = true;
		void source
			.removed(team.address)
			.then((listed) => {
				if (current) setProjects(listed ?? []);
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	}, [source, team.address, admin]);
	if (!admin || projects.length === 0) return null;
	const gone = (name: string) => setProjects((listed) => listed.filter((each) => each.name !== name));
	return (
		<section data-team-removed className="mt-[44px]" aria-label="Removed">
			<h2 className="mb-[10px] text-secondary type-caption">Removed</h2>
			{refused !== null && <p className="mb-[10px] text-secondary type-body">{refused}</p>}
			<ul>
				{projects.map((project) => (
					<ListRow
						as="li"
						key={project.name}
						size="lg"
						label={project.name}
						meta={`${project.removedBy === null ? "Removed" : `Removed by ${project.removedBy}`} · ${daysLeft(project.purgeAt)}`}
						trailing={
							<span className="ml-[12px] flex items-center gap-[6px]">
								<Button
									onClick={async () => {
										setRefused(null);
										try {
											await source.restore(team.address, project.name);
											gone(project.name);
											onRestored?.();
										} catch (error) {
											setRefused(teamSays(error));
										}
									}}
								>
									Restore
								</Button>
								<Button variant="ghost" onClick={() => setDeleting(project)}>
									Delete now
								</Button>
							</span>
						}
					/>
				))}
			</ul>
			{deleting !== null && (
				<ConfirmDialog
					title={`Delete ${deleting.name} now`}
					description={goesForGood(deleting.shares)}
					confirmLabel="Delete now"
					danger
					onConfirm={async () => {
						try {
							await source.deleteRemoved(team.address, deleting.name);
						} catch (error) {
							throw new Error(teamSays(error));
						}
						gone(deleting.name);
					}}
					onClose={() => setDeleting(null)}
				/>
			)}
		</section>
	);
}
