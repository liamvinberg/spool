import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { type Artwork, projects } from "shared/ui/demo/home-data";
import { PROJECT_ICONS, type ProjectIcon } from "shared/lib/spool/project-icon";

export interface ProjectCard {
	root: string;
	name: string;
	openedAt: string;
	frameCount: number;
	covers: { frame: string; cover: { hash: Artwork } }[];
	/** A team project's local copies on this Mac, all under its one cover. */
	copies?: number;
	/** The team project this is a local copy of: it has no "Move to team…". */
	team?: { url: string; team: string; project: string };
	/** What its cover draws ahead of the name: its icon file or its repo's favicon; absent, the name's letter. */
	icon?: ProjectIcon | undefined;
	/** Set while the copy's sync is paused: the daemon's limit, which hollows its team badge. */
	syncPaused?: string | undefined;
	/** The team this was synced with until the project ended here. */
	ended?: string;
}

export const homeProjects: ProjectCard[] = projects.map((project, index) => ({
	root: `~/spool/${project.name}`,
	name: project.name,
	openedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
	frameCount: project.frames,
	...(PROJECT_ICONS[project.name] === undefined ? {} : { icon: PROJECT_ICONS[project.name] }),
	covers: project.frames === 0 ? [] : [{ frame: "home", cover: { hash: project.art } }],
}));

/** The specimen supplies demo covers where production supplies its saved PNG. */
export function Thumbnail({ cover, className }: {
	project: string;
	frame: string;
	cover: { hash: Artwork };
	alt: string;
	draggable?: boolean;
	className?: string;
}) {
	return <ProjectArtwork kind={cover.hash} className={className ?? ""} />;
}
