import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { DotsIcon, FolderIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { EmptyFramesIcon, EmptyState } from "shared/ui/spool/empty-state";
import { SpoolMark } from "shared/ui/spool/mark";
import { CanvasArtwork, ProjectArtwork } from "../artwork";
import type { HomeProject } from "../data";
import { Action, Arrow, ProjectMark, Search } from "../parts";

export type ProjectsTake =
	| "sidebar-covers"
	| "sidebar-canvases"
	| "sidebar-list"
	| "rail-covers"
	| "rail-canvases"
	| "rail-rows"
	| "browser-preview"
	| "browser-filmstrip"
	| "browser-table"
	| "start-direct"
	| "start-choice"
	| "start-canvas";
export type ProjectsState =
	| "home"
	| "empty"
	| "filtered"
	| "create"
	| "selected"
	| "many"
	| "start"
	| "scratch"
	| "returned"
	| "folder"
	| "location"
	| "location-changed";
export interface ProjectActions {
	query: string;
	setQuery: (value: string) => void;
	projects: readonly HomeProject[];
	selected: HomeProject | undefined;
	select: (project: HomeProject) => void;
	open: (project: HomeProject) => void;
	create: () => void;
	folder: () => void;
	manage: (project: HomeProject, target: HTMLButtonElement) => void;
	sort: "Recent" | "Name";
	setSort: (sort: "Recent" | "Name") => void;
}

export function ProjectGlyph({ folder = false }: { folder?: boolean }) {
	return folder ? <FolderIcon className="h-4 w-4" /> : <FrameIcon className="h-4 w-4" />;
}

export function ProjectNavigation({ actions, rail = false }: { actions: ProjectActions; rail?: boolean }) {
	return (
		<aside className={cn("pj-navigation", rail && "pj-navigation-rail")}>
			<div className="pj-wordmark" aria-label="spool">
				<SpoolMark className="pj-logo" />
				{!rail && <span>spool</span>}
			</div>
			<nav aria-label="Home sections">
				<button
					type="button"
					aria-current="page"
					aria-label="Projects"
					title="Projects"
					onClick={() => actions.setQuery("")}
				>
					<ProjectGlyph />
					<span>Projects</span>
				</button>
			</nav>
			<div className="pj-navigation-foot">
				<button type="button" aria-label="Open a folder" title="Open a folder" onClick={actions.folder}>
					<ProjectGlyph folder />
					<span>Open a folder</span>
				</button>
				{!rail && <span>On this Mac</span>}
			</div>
		</aside>
	);
}

export function ProjectHeading({
	actions,
	search = true,
	title = "Projects",
}: {
	actions: ProjectActions;
	search?: boolean;
	title?: string;
}) {
	return (
		<header className="pj-heading">
			<h1>{title}</h1>
			<div>
				{search && <Search actions={actions} />}
				<Action primary onClick={actions.create}>
					<PlusIcon className="h-3.5 w-3.5" />
					New project
				</Action>
			</div>
		</header>
	);
}

export function ProjectToolbar({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-toolbar">
			<span>
				{actions.projects.length} {actions.projects.length === 1 ? "project" : "projects"}
			</span>
			<label>
				Sort by
				<select
					aria-label="Sort projects"
					value={actions.sort}
					onChange={(event) => actions.setSort(event.target.value === "Name" ? "Name" : "Recent")}
				>
					<option>Recent</option>
					<option>Name</option>
				</select>
			</label>
		</div>
	);
}

export function ManageProject({ project, actions }: { project: HomeProject; actions: ProjectActions }) {
	return (
		<button
			type="button"
			aria-label={`Manage ${project.name}`}
			className="pj-manage"
			onClick={(event) => {
				event.stopPropagation();
				actions.manage(project, event.currentTarget);
			}}
		>
			<DotsIcon className="h-4 w-4" />
		</button>
	);
}

export function ProjectCover({
	project,
	actions,
	canvas = false,
}: {
	project: HomeProject;
	actions: ProjectActions;
	canvas?: boolean;
}) {
	return (
		<article className="pj-project-cover">
			<button
				type="button"
				aria-label={`Open ${project.name}`}
				className="pj-cover-button"
				onClick={() => actions.open(project)}
			>
				<div className="pj-cover-art">
					{canvas ? <CanvasArtwork kind={project.art} /> : <ProjectArtwork kind={project.art} />}
					<span className="pj-cover-enter">
						<Arrow />
					</span>
				</div>
				<div className="pj-cover-caption">
					<strong>{project.name}</strong>
					<span>{project.frames ? `${project.frames} frames` : "no frames yet"}</span>
				</div>
				<span className="pj-opened-time">{project.when}</span>
			</button>
			<ManageProject project={project} actions={actions} />
		</article>
	);
}

export function ProjectEmpty({ actions }: { actions: ProjectActions }) {
	return (
		<EmptyState
			className="pj-empty"
			icon={<EmptyFramesIcon />}
			title={actions.query ? `Nothing matches “${actions.query}”` : "Your projects start here."}
			description={
				actions.query
					? "Try a project name or part of its path."
					: "Create a project, or open a folder you already have."
			}
			actions={
				actions.query ? (
					<Action onClick={() => actions.setQuery("")}>Clear search</Action>
				) : (
					<>
						<Action primary onClick={actions.create}>
							New project
							<PlusIcon className="h-3 w-3" />
						</Action>
						<Action onClick={actions.folder}>
							Open a folder
							<Arrow />
						</Action>
					</>
				)
			}
		/>
	);
}

export function ProjectTable({ actions, preview = false }: { actions: ProjectActions; preview?: boolean }) {
	return (
		<div className={cn("pj-table", preview && "pj-table-preview")}>
			<div className="pj-table-heading">
				<span>Name</span>
				<span>Folder</span>
				<span>Frames</span>
				<span>Last opened</span>
				<span />
			</div>
			{actions.projects.map((project) => (
				<div
					key={project.name}
					className={cn("pj-table-row", preview && actions.selected?.name === project.name && "is-selected")}
				>
					<button
						type="button"
						className="pj-table-open"
						aria-label={`${preview ? "Preview" : "Open"} ${project.name}`}
						onClick={() => (preview ? actions.select(project) : actions.open(project))}
						onDoubleClick={() => actions.open(project)}
					>
						<span>
							<ProjectMark project={project} />
							<strong>{project.name}</strong>
						</span>
						<span>projects/{project.name}</span>
						<span>{project.frames}</span>
						<span>{project.when}</span>
					</button>
					<ManageProject project={project} actions={actions} />
				</div>
			))}
		</div>
	);
}

export function ProjectList({ actions, thumbnails = false }: { actions: ProjectActions; thumbnails?: boolean }) {
	return (
		<div className={cn("pj-picker-list", thumbnails && "pj-picker-thumbnails")}>
			{actions.projects.map((project) => (
				<button
					type="button"
					key={project.name}
					className={cn("pj-picker-row", project.name === actions.selected?.name && "is-selected")}
					aria-label={`Preview ${project.name}`}
					aria-pressed={project.name === actions.selected?.name}
					onClick={() => actions.select(project)}
					onDoubleClick={() => actions.open(project)}
				>
					{thumbnails ? <ProjectArtwork kind={project.art} /> : <ProjectMark project={project} />}
					<span>
						<strong>{project.name}</strong>
						<small>{project.frames} frames</small>
					</span>
					<Arrow />
				</button>
			))}
		</div>
	);
}

export function PreviewDetails({
	project,
	actions,
	children,
}: {
	project: HomeProject;
	actions: ProjectActions;
	children?: ReactNode;
}) {
	return (
		<div className="pj-preview-details">
			<div>
				<h2>{project.name}</h2>
				<p>projects/{project.name}/design</p>
			</div>
			<div className="pj-preview-facts">
				<span>{project.frames} frames</span>
				<span>{project.when}</span>
			</div>
			{children}
			<Action primary onClick={() => actions.open(project)}>
				Open project
				<Arrow />
			</Action>
			<ManageProject project={project} actions={actions} />
		</div>
	);
}
