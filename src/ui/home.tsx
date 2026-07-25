import type { ProjectCard } from "./api";
import { Thumbnail } from "./thumbnail";

/**
 * Home (#13 screens v1): registry cards from the thumbnail caches. The brand
 * lockup in the bar is the door here; the bar's "+" opens the folder picker.
 */

export function Home({
	projects,
	onOpenProject,
}: {
	projects: ProjectCard[];
	onOpenProject: (project: { root: string; name: string }) => void;
}) {
	return (
		<div className="h-full overflow-y-auto bg-bg">
			<div className="flex flex-col gap-6 px-16 py-12">
				<div className="flex w-full items-baseline justify-between">
					<h1 className="font-semibold text-lg text-text tracking-tight leading-lg">Projects</h1>
					<span className="font-mono text-muted text-xs leading-xs">{projects.length} registered</span>
				</div>

				{projects.length === 0 ? (
					<div className="flex flex-col gap-3 py-12">
						<p className="font-medium text-base text-text">No projects yet.</p>
						<p className="font-mono text-muted text-sm">
							Run `spool init` in a product root, or press + above to pick a folder.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-6">
						{projects.map((project) => (
							<button
								key={project.root}
								type="button"
								className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4 text-left hover:border-border-raised"
								onClick={() => onOpenProject({ root: project.root, name: project.name })}
							>
								<div className="flex gap-2.5">
									{[0, 1, 2].map((slot) => {
										const cover = project.covers[slot];
										return (
											<div
												key={`${project.root}-slot-${slot}`}
												className="aspect-[123/150] flex-1 overflow-hidden rounded-md border border-border bg-canvas"
											>
												{cover !== undefined && (
													<Thumbnail
														project={project.name}
														frame={cover}
														nonce={0}
														alt={cover}
														draggable={false}
														className="h-full w-full object-cover object-top"
													/>
												)}
											</div>
										);
									})}
								</div>
								<div className="flex flex-col gap-[3px]">
									<div className="flex items-baseline justify-between">
										<span className="font-semibold text-md text-text tracking-tight leading-sm">
											{project.name}
										</span>
										<span className="font-mono text-muted text-xs leading-xs">
											{project.frameCount} {project.frameCount === 1 ? "frame" : "frames"} ·{" "}
											{relativeTime(project.openedAt)}
										</span>
									</div>
									<span className="truncate font-mono text-muted text-xs leading-xs">
										{shortPath(project.root)}
									</span>
								</div>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function shortPath(root: string): string {
	// the daemon is per-machine; a homedir prefix reads better shortened
	const match = root.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
	return match === null ? root : `~${match[1] ?? ""}`;
}

export function relativeTime(iso: string): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "";
	const days = Math.floor((Date.now() - then) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 30) return days < 14 ? "last week" : `${Math.floor(days / 7)} weeks ago`;
	return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
