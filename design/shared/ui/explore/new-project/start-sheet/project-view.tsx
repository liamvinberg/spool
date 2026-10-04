import { motion } from "motion/react";
import { useState } from "react";
import type { Project } from "shared/lib/explore/new-project/places";
import { CanvasArtwork } from "shared/ui/demo/home-artwork";
import { Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { EASE, PlaceGlyph } from "./parts";

/**
 * Where every door here lands: the project's own tab. A project born a moment
 * ago opens on the shipped empty canvas, with the box the sheet was standing in
 * growing to fill it first (`birth`), so the canvas reads as what the sheet made.
 */
export function ProjectView({ project, birth }: { project: Project; birth: string | null }) {
	const [grown, setGrown] = useState(birth === null);
	const empty = project.frames === 0;
	const root = project.place.kind === "draft" || project.place.kind === "team" ? project.place.path : `${project.place.path}/design`;
	return (
		<div className="relative h-full">
			<CanvasChrome
				pages={empty ? [] : [{ name: "flows", frames: ["start", "explore", "detail"], active: true, open: true }]}
				tool={empty ? "none" : "select"}
				selected={empty ? undefined : "start"}
				rail={empty ? null : undefined}
			>
				{empty ? (
					<ProjectEmpty project={project.name} root={root} />
				) : (
					<div className="absolute inset-0 grid place-items-center">
						<div className="aspect-[16/10] w-[92%]">
							<CanvasArtwork kind={project.art} />
						</div>
					</div>
				)}
				<PlaceChip project={project} />
			</CanvasChrome>
			{birth !== null && !grown && (
				<motion.div
					layoutId={birth}
					layoutCrossfade={false}
					className="pointer-events-none absolute inset-0 z-40"
					transition={{ layout: { duration: 0.26, ease: EASE } }}
				>
					<motion.div
						className="absolute inset-0 border border-border-raised bg-surface"
						initial={{ opacity: 1 }}
						animate={{ opacity: 0 }}
						transition={{ delay: 0.2, duration: 0.2, ease: "easeOut" }}
						onAnimationComplete={() => setGrown(true)}
					/>
				</motion.div>
			)}
		</div>
	);
}

/** The project's place, said once at the canvas's top right, the way a cover's foot says it on Home. */
function PlaceChip({ project }: { project: Project }) {
	const team = project.place.kind === "team";
	const others = (project.here ?? []).filter((id) => id !== "ada");
	return (
		<motion.span
			className="absolute top-[18px] right-[20px] z-10 flex h-[30px] items-center gap-[8px] rounded-[7px] border border-border bg-bg px-[10px] text-muted type-detail"
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: EASE, delay: 0.24 }}
		>
			{team ? <TeamMark size={14} /> : <PlaceGlyph kind={project.place.kind} />}
			<span>{team ? "tidemark · relayed" : project.place.kind === "draft" ? "drafts" : project.place.path}</span>
			{team && others.length > 0 && <Faces ids={others} size={18} ring="border-bg" />}
		</motion.span>
	);
}
