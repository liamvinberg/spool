import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { type Artwork, projects } from "shared/ui/demo/home-data";

export interface ProjectCard {
	root: string;
	name: string;
	openedAt: string;
	frameCount: number;
	covers: { frame: string; cover: { hash: Artwork } }[];
}

export const homeProjects: ProjectCard[] = projects.map((project, index) => ({
	root: `~/spool/${project.name}`,
	name: project.name,
	openedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
	frameCount: project.frames,
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
