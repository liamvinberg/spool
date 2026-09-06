import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CloseIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { CanvasArtwork, ProjectArtwork } from "./artwork";
import type { HomeProject, RegistryItem } from "./data";

export interface HomeActions {
	query: string;
	setQuery: (query: string) => void;
	visible: readonly HomeProject[];
	openProject: (project: HomeProject) => void;
	openRegistry: () => void;
	inspectItem: (item: RegistryItem) => void;
	create: (starter?: RegistryItem, name?: string) => void;
	openFolder: () => void;
}

export function Action({
	children,
	onClick,
	primary = false,
	className,
}: {
	children: ReactNode;
	onClick: () => void;
	primary?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("home-action", primary && "home-action-primary", className)}
		>
			{children}
		</button>
	);
}

export function NewProject({ actions }: { actions: HomeActions }) {
	return (
		<Action onClick={() => actions.create()} primary>
			<PlusIcon className="h-3.5 w-3.5" />
			New project
		</Action>
	);
}

export function Search({
	actions,
	placeholder = "Search projects",
	large = false,
}: {
	actions: Pick<HomeActions, "query" | "setQuery">;
	placeholder?: string;
	large?: boolean;
}) {
	return (
		<label className={cn("home-search", large && "home-search-large")}>
			<SearchIcon className="h-3.5 w-3.5 shrink-0" />
			<input
				aria-label={placeholder}
				placeholder={placeholder}
				value={actions.query}
				onChange={(event) => actions.setQuery(event.target.value)}
			/>
			{actions.query ? (
				<button type="button" aria-label="Clear search" onClick={() => actions.setQuery("")}>
					<CloseIcon className="h-3 w-3" />
				</button>
			) : (
				<kbd>/</kbd>
			)}
		</label>
	);
}

export function Heading({
	title = "Projects",
	description,
	children,
}: {
	title?: string;
	description?: string;
	children?: ReactNode;
}) {
	return (
		<div className="home-heading">
			<div>
				<h1>{title}</h1>
				{description && <p>{description}</p>}
			</div>
			<div className="home-heading-actions">{children}</div>
		</div>
	);
}

export function SectionHeading({
	children,
	action,
	onClick,
}: {
	children: ReactNode;
	action?: string;
	onClick?: () => void;
}) {
	return (
		<div className="home-section-heading">
			<h2>{children}</h2>
			{action && (
				<button type="button" onClick={onClick}>
					{action}
					<Arrow />
				</button>
			)}
		</div>
	);
}

export function Arrow({ className }: { className?: string }) {
	return (
		<svg className={cn("home-arrow", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M3 8h10M8 3l5 5-5 5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ProjectMark({ project }: { project: HomeProject }) {
	return (
		<span className={cn("home-project-mark", `home-mark-${project.art}`)}>
			{project.art === "blank" ? "+" : project.name.slice(0, 1)}
		</span>
	);
}

export function ProjectRow({
	project,
	onClick,
	selected = false,
	onPreview,
	compact = false,
}: {
	project: HomeProject;
	onClick: () => void;
	selected?: boolean;
	onPreview?: () => void;
	compact?: boolean;
}) {
	return (
		<button
			type="button"
			className={cn("home-project-row", selected && "is-selected", compact && "is-compact")}
			onClick={onClick}
			onMouseEnter={onPreview}
			onFocus={onPreview}
		>
			<ProjectMark project={project} />
			<span className="home-row-name">
				<strong>{project.name}</strong>
				<span>{project.frames} frames</span>
			</span>
			<span className="home-row-time">{project.when}</span>
			<Arrow />
		</button>
	);
}

export function ProjectTile({
	project,
	onClick,
	canvas = false,
}: {
	project: HomeProject;
	onClick: () => void;
	canvas?: boolean;
}) {
	return (
		<button type="button" className="home-project-tile" onClick={onClick}>
			<div className="home-project-cover">
				{canvas ? <CanvasArtwork kind={project.art} /> : <ProjectArtwork kind={project.art} />}
				<span className="home-cover-open">
					Open project
					<Arrow />
				</span>
			</div>
			<div className="home-tile-caption">
				<strong>{project.name}</strong>
				<span>{project.when}</span>
			</div>
			<span className="home-tile-count">{project.frames === 0 ? "no frames yet" : `${project.frames} frames`}</span>
		</button>
	);
}

export function RegistryTile({ item, onClick }: { item: RegistryItem; onClick: () => void }) {
	return (
		<button type="button" className="home-registry-tile" onClick={onClick}>
			<ProjectArtwork kind={item.art} />
			<div className="home-tile-caption">
				<strong>{item.name}</strong>
				<Arrow />
			</div>
			<span className="home-tile-count">
				{item.count} · {item.source === "my-registry" ? "yours" : "public"}
			</span>
		</button>
	);
}

export function RegistryRow({ item, onClick }: { item: RegistryItem; onClick: () => void }) {
	return (
		<button type="button" className="home-registry-row" onClick={onClick}>
			<span className={cn("home-registry-mark", `home-mark-${item.art}`)}>
				{item.art === "slack" ? "#" : item.art === "system" ? "Aa" : "◧"}
			</span>
			<span>
				<strong>{item.name}</strong>
				<small>{item.count}</small>
			</span>
			<Arrow />
		</button>
	);
}

export function RegistryDoor({ actions }: { actions: HomeActions }) {
	return (
		<button type="button" className="home-registry-door" onClick={actions.openRegistry}>
			<span>
				<strong>A starting point for the next thing.</strong>
				<span>Design systems, sections, and app surfaces.</span>
			</span>
			<span>
				Browse registry
				<Arrow />
			</span>
		</button>
	);
}

export function EmptyProjects({ actions }: { actions: HomeActions }) {
	return (
		<div className="home-empty">
			<span className="home-empty-mark">
				<PlusIcon className="h-6 w-6" />
			</span>
			<h2>{actions.query ? `Nothing matches “${actions.query}”` : "A place for your next idea."}</h2>
			<p>{actions.query ? "Try another project name." : "Create a project or open a folder to get started."}</p>
			{actions.query ? (
				<Action onClick={() => actions.setQuery("")}>Clear search</Action>
			) : (
				<NewProject actions={actions} />
			)}
		</div>
	);
}

export function Footer({ actions }: { actions: HomeActions }) {
	return (
		<footer className="home-footer">
			<span>spool</span>
			<button type="button" onClick={actions.openRegistry}>
				Registry
				<Arrow />
			</button>
		</footer>
	);
}
