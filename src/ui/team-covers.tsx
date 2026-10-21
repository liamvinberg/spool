import { useContext, useEffect, useState } from "react";
import type { CloudTeam } from "./api";
import { CoverTile, MenuBackdrop } from "./home";
import { MenuItem } from "./primitives/overlays";
import { ProjectIconView } from "./project-icon";
import type { ListedTeamProject } from "./team-source";
import { type TeamHere, TeamsSourceContext } from "./teams";

/**
 * A team's projects as spool.page draws them, each a cover that opens its live, read-only canvas: at spool.page in
 * the same tab, and from a Mac, for a team it only watches, in the system browser.
 */
export function CloudCovers({
	covers,
	here,
	said = false,
	menu,
	onMenu,
	onMove,
	onExport,
	link = (team, project) => `/${team.address}/${encodeURIComponent(project.name)}`,
	external = false,
}: {
	/** Each cover's project and the team it is in. */
	covers: readonly { team: CloudTeam; project: ListedTeamProject }[];
	/** Who is inside each, by its name, where every cover is one team's. */
	here?: TeamHere | undefined;
	/** Each cover names its team, where the covers come from several. */
	said?: boolean;
	menu: string | null;
	onMenu: (url: string | null) => void;
	/** "Move to team…", for an admin with another team to move a project to. */
	onMove?: ((project: ListedTeamProject) => void) | undefined;
	/** "Export…", for an admin: handed to spool on this Mac. */
	onExport?: ((project: ListedTeamProject) => void) | undefined;
	/** Where a cover opens its project's live canvas. */
	link?: (team: CloudTeam, project: ListedTeamProject) => string;
	/** It opens outside this window: on a Mac, in the system browser. */
	external?: boolean;
}) {
	const away = external ? { target: "_blank", rel: "noreferrer" } : {};
	return (
		<>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{covers.map(({ team, project }) => {
					const at = link(team, project);
					return (
						<CoverTile
							key={project.url}
							name={project.name}
							open={{ href: at, ...(external ? { external } : {}) }}
							here={here?.get(project.name)}
							art={<CloudCover team={team.address} project={project.name} />}
							line={
								<span className="mt-[5px] block truncate text-secondary type-detail">
									{[said && team.name, project.repo ?? "no repo linked"].filter(Boolean).join(" · ")}
								</span>
							}
							menuOpen={menu === project.url}
							onToggleMenu={() => onMenu(menu === project.url ? null : project.url)}
							onCloseMenu={() => onMenu(null)}
							menu={({ close }) => (
								<>
									<MenuItem label="Open" href={at} {...away} onClick={close} />
									{project.repo !== null && (
										<MenuItem
											label="Copy clone command"
											onClick={() => {
												close();
												void navigator.clipboard?.writeText(`git clone https://${project.repo}.git`);
											}}
										/>
									)}
									<MenuItem
										label="Copy link"
										onClick={() => {
											close();
											void navigator.clipboard?.writeText(new URL(at, location.origin).toString());
										}}
									/>
									{onMove && (
										<MenuItem
											label="Move to team…"
											onClick={() => {
												close();
												onMove(project);
											}}
										/>
									)}
									{onExport && (
										<MenuItem
											label="Export…"
											onClick={() => {
												close();
												onExport(project);
											}}
										/>
									)}
								</>
							)}
						/>
					);
				})}
			</div>
			{menu !== null && <MenuBackdrop onClose={() => onMenu(null)} />}
		</>
	);
}

/**
 * A team project's cover as spool.page keeps it: the still of its top-left frame a member's Mac took, or its letter
 * while it has none. It is read through the team's source, so a Mac reads it with its own session.
 */
function CloudCover({ team, project }: { team: string; project: string }) {
	const source = useContext(TeamsSourceContext);
	const [src, setSrc] = useState<string | null | undefined>();
	useEffect(() => {
		let current = true;
		let url: string | null = null;
		void source.cover(team, project).then((blob) => {
			if (!current) return;
			url = blob === undefined ? null : URL.createObjectURL(blob);
			setSrc(url);
		});
		return () => {
			current = false;
			if (url !== null) URL.revokeObjectURL(url);
		};
	}, [source, team, project]);
	if (src === undefined) return null;
	if (src === null) return <ProjectIconView project={project} name={project} size="md" />;
	return (
		<img src={src} alt="" draggable={false} className="h-full w-full object-contain" onError={() => setSrc(null)} />
	);
}
