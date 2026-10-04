import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { Finding, Project } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { Face, Faces, TeamMark, member } from "shared/ui/explore/cloud/home/parts";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { FolderIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { GROW } from "./motion";
import { PEOPLE, type Reading, type Scope } from "./world";

/**
 * The right half of the launcher: what ↵ does, drawn. A project shows its cover,
 * a new one shows the canvas it opens to, a folder shows where design/ lands. The
 * stage carries the id of the project it becomes, so pressing ↵ grows it into the
 * canvas rather than cutting to it.
 */

export type Intent =
	| { do: "create"; name: string; scope?: Scope }
	| { do: "open"; project: Project }
	| { do: "fetch"; project: Project }
	| { do: "adopt"; finding: Finding }
	| { do: "clone"; finding: Extract<Finding, { kind: "clone" }> }
	| { do: "complete"; text: string; reading: Reading | null }
	| { do: "scope"; scope: Scope }
	| { do: "choose" }
	| { do: "reading"; path: string }
	| { do: "none"; text: string };

export interface Job {
	kind: "clone" | "fetch";
	/** the stage id the finished project takes */
	id: string;
	name: string;
	from: string;
	into: string;
	progress: number;
	stage: "moving" | "reading";
	frames: number;
}

interface TreeLine {
	depth: number;
	name: string;
	note?: string;
	tone: "text" | "muted" | "new" | "here";
}

export type Stage =
	| { kind: "cover"; art: Project["art"]; away?: boolean; here?: string[] }
	| { kind: "blank"; name: string; team: boolean }
	| { kind: "tree"; lines: TreeLine[] }
	| { kind: "link"; from: string; into: string; job: Job | null; art: Project["art"]; frames: number }
	| { kind: "team"; scope: Scope }
	| { kind: "finder" }
	| { kind: "quiet"; text: string };

export function Preview({
	stageId,
	stage,
	title,
	meta,
	children,
	size,
}: {
	stageId?: string | undefined;
	stage: Stage;
	title: ReactNode;
	meta: string[];
	children?: ReactNode;
	size: "home" | "palette";
}) {
	return (
		<div className="flex flex-col">
			<motion.div
				{...(stageId ? { layoutId: `stage-${stageId}` } : {})}
				transition={GROW}
				className="relative aspect-[1.82] w-full overflow-hidden bg-canvas"
				style={{ borderRadius: size === "home" ? 10 : 8 }}
			>
				<StageArt stage={stage} size={size} />
			</motion.div>
			<div className={cn("flex flex-col", size === "home" ? "pt-[20px]" : "pt-[16px]")}>
				<h2 className={cn("truncate", size === "home" ? "type-heading" : "type-title")}>{title}</h2>
				<div className="mt-[6px] flex flex-col gap-[2px]">
					{meta.map((line) => (
						<span key={line} className="truncate text-muted type-detail">
							{line}
						</span>
					))}
				</div>
				{children && <div className={cn("text-muted", size === "home" ? "mt-[14px] max-w-[440px] type-control" : "mt-[10px] type-label")}>{children}</div>}
			</div>
		</div>
	);
}

function StageArt({ stage, size }: { stage: Stage; size: "home" | "palette" }) {
	switch (stage.kind) {
		case "cover":
			return (
				<>
					<ProjectArtwork kind={stage.art} className={cn("h-full w-full", stage.away && "opacity-35 grayscale")} />
					{stage.here && stage.here.length > 0 && (
						<span className="absolute bottom-[12px] left-[12px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={stage.here} size={22} />
							<span className="type-detail">{stage.here.length === 1 ? `${member(stage.here[0]!).first} is here` : `${stage.here.length} here`}</span>
						</span>
					)}
				</>
			);
		case "blank":
			return (
				<div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(var(--color-border-raised)_1px,transparent_1px)] [background-size:16px_16px]">
					<span className="absolute top-[14px] left-[16px] text-muted type-detail">{stage.name}</span>
					{stage.team && (
						<span className="absolute top-[12px] right-[12px]">
							<Faces ids={PEOPLE} size={20} ring="border-canvas" />
						</span>
					)}
					<SpoolMark className={cn("text-thread opacity-85", size === "home" ? "h-[38px] w-[30px]" : "h-[28px] w-[22px]")} />
					<span className={cn("mt-[16px]", size === "home" ? "type-heading" : "type-title")}>Your canvas is ready.</span>
				</div>
			);
		case "tree":
			return (
				<div className={cn("flex h-full flex-col justify-center", size === "home" ? "px-[40px]" : "px-[28px]")}>
					{stage.lines.map((line) => (
						<div key={`${line.depth}-${line.name}`} className="flex h-[30px] items-center gap-[10px]" style={{ paddingLeft: line.depth * 22 }}>
							{line.depth > 0 && <span className="-ml-[14px] h-px w-[8px] bg-border-raised" />}
							<FolderIcon className={cn("h-[14px] w-[14px] shrink-0", line.tone === "new" ? "text-thread" : line.tone === "muted" ? "text-muted" : "text-text")} />
							<span className={cn("type-value", line.tone === "new" ? "text-thread" : line.tone === "muted" ? "text-muted" : "text-text")}>{line.name}</span>
							{line.note && (
								<span className={cn("type-detail", line.tone === "new" ? "text-thread" : "text-muted")}>{line.note}</span>
							)}
						</div>
					))}
				</div>
			);
		case "link":
			return <LinkStage stage={stage} size={size} />;
		case "team":
			return (
				<div className="flex h-full flex-col items-center justify-center gap-[18px]">
					{stage.scope === "tidemark" ? <TeamMark size={size === "home" ? 52 : 40} /> : <Face id="ada" size={size === "home" ? 52 : 40} ring="border-canvas" />}
					{stage.scope === "tidemark" ? <Faces ids={["ada", ...PEOPLE]} size={26} ring="border-canvas" /> : <span className="text-muted type-detail">ada · on this Mac</span>}
				</div>
			);
		case "finder":
			return (
				<div className="flex h-full items-center justify-center">
					<div className="flex w-[64%] flex-col overflow-hidden rounded-[8px] border border-border-raised bg-bg">
						<div className="flex h-[26px] items-center gap-[6px] border-border border-b px-[10px]">
							{[0, 1, 2].map((dot) => (
								<span key={dot} className="h-[8px] w-[8px] rounded-full bg-border-raised" />
							))}
							<span className="ml-[10px] text-muted type-detail">~/code</span>
						</div>
						{["dispatch", "harbor", "tidemark-api", "tvarso-web"].map((name, index) => (
							<div key={name} className={cn("flex h-[26px] items-center gap-[8px] px-[12px]", index === 2 && "bg-raised")}>
								<FolderIcon className="h-[12px] w-[12px] text-muted" />
								<span className="type-detail">{name}</span>
							</div>
						))}
					</div>
				</div>
			);
		case "quiet":
			return <div className="grid h-full place-items-center px-[40px] text-center text-muted type-detail">{stage.text}</div>;
	}
}

function LinkStage({ stage, size }: { stage: Extract<Stage, { kind: "link" }>; size: "home" | "palette" }) {
	const job = stage.job;
	const arrived = job?.stage === "reading";
	return (
		<div className="relative h-full">
			<motion.div
				className="absolute inset-0"
				initial={false}
				animate={{ opacity: arrived ? 1 : 0 }}
				transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
			>
				{stage.frames > 0 ? (
					<ProjectArtwork kind={stage.art} className="h-full w-full" />
				) : (
					<div className="h-full bg-[radial-gradient(var(--color-border-raised)_1px,transparent_1px)] [background-size:16px_16px]" />
				)}
			</motion.div>
			<motion.div
				className={cn("absolute inset-0 flex flex-col justify-center gap-[14px]", size === "home" ? "px-[40px]" : "px-[28px]")}
				initial={false}
				animate={{ opacity: arrived ? 0 : 1 }}
				transition={{ duration: 0.2 }}
			>
				<span className="truncate type-value">{stage.from}</span>
				<div className="relative h-[2px] w-full overflow-hidden rounded-full bg-border-raised">
					<motion.span
						className="absolute inset-y-0 left-0 bg-text"
						initial={false}
						animate={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
						transition={{ duration: 0.12, ease: "linear" }}
					/>
				</div>
				<span className="flex items-center gap-[8px] type-value">
					<FolderIcon className="h-[14px] w-[14px] text-thread" />
					<span className="text-thread">{stage.into}</span>
				</span>
			</motion.div>
		</div>
	);
}
