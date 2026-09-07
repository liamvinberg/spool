import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ProjectCard } from "./api";
import { EmptyFramesIcon, EmptyState } from "./empty-state";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { type HotkeyIdFor, hotkeyKey } from "./hotkeys";
import {
	ArrowRightIcon,
	CloseIcon,
	CogIcon,
	DotsIcon,
	FolderIcon,
	FrameIcon,
	PlusIcon,
	RibbonMark,
	SearchIcon,
} from "./icons";
import { systemTrashName } from "./system-trash";
import { Thumbnail } from "./thumbnail";
import "./home.css";

export function Home({
	projects,
	loading = false,
	onOpenProject,
	onForgetProject,
	onTrashProject,
	onRenameProject,
	onStart,
	onFolder,
	onSettings,
}: {
	projects: ProjectCard[];
	loading?: boolean;
	onOpenProject: (project: { root: string; name: string }) => void;
	onForgetProject: (project: { root: string; name: string }) => void;
	onTrashProject: (project: { root: string; name: string }) => void;
	onRenameProject: (project: { root: string; name: string }) => void;
	onStart: () => void;
	onFolder: () => void;
	onSettings: () => void;
}) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState("Recent");
	const [menuRoot, setMenuRoot] = useState<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const needle = query.trim().toLowerCase();
	const visible = projects
		.filter((project) => project.name.toLowerCase().includes(needle) || project.root.toLowerCase().includes(needle))
		.sort((a, b) =>
			sort === "Name" ? a.name.localeCompare(b.name) : Date.parse(b.openedAt) - Date.parse(a.openedAt),
		);
	useEffect(
		() =>
			attachHotkeyLayer({
				scope: "home",
				handlers: {
					"home.close-menu": () => setMenuRoot(null),
					"home.search": (event) => {
						event?.preventDefault();
						searchRef.current?.focus();
					},
				} satisfies Record<HotkeyIdFor<"home">, HotkeyHandler>,
			}),
		[],
	);
	return (
		<div className="pj-body h-full bg-bg text-text">
			<div className="pj-layout">
				<aside className="pj-navigation">
					<div className="pj-wordmark">
						<RibbonMark className="pj-logo" />
						<span>spool</span>
					</div>
					<nav aria-label="Home sections">
						<NavigationButton icon={<FrameIcon />} active onClick={() => setQuery("")}>
							Projects
						</NavigationButton>
					</nav>
					<div className="pj-navigation-foot">
						<nav aria-label="Home actions">
							<NavigationButton
								icon={<CogIcon />}
								onClick={onSettings}
								title={`Settings ${hotkeyKey("app.settings")}`}
							>
								Settings
							</NavigationButton>
						</nav>
						<span>On this Mac</span>
					</div>
				</aside>
				{loading ? (
					<main aria-busy="true" />
				) : projects.length === 0 && needle === "" ? (
					<main className="pj-welcome-main">
						<EmptyState
							className="pj-welcome"
							heading="h1"
							align="start"
							title="Start with an idea."
							description="Your next project can start here, or in a folder you already have."
							actions={
								<>
									<button type="button" onClick={onStart}>
										<PlusIcon />
										<strong>
											New project
											<ArrowRightIcon className="home-arrow" />
										</strong>
										<small>
											Open a blank canvas.
											<br />
											spool saves the project on your Mac.
										</small>
									</button>
									<button type="button" onClick={onFolder}>
										<FolderIcon />
										<strong>
											Open…
											<ArrowRightIcon className="home-arrow" />
										</strong>
										<small>
											Bring your codebase.
											<br />
											Keep the design beside your code.
										</small>
									</button>
								</>
							}
						/>
					</main>
				) : (
					<main className="pj-main">
						<header className="pj-heading">
							<h1>Projects</h1>
							<div>
								<label className="home-search">
									<SearchIcon />
									<input
										ref={searchRef}
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Search projects"
										aria-label="Search projects"
									/>
									{query ? (
										<button type="button" title="Clear search" onClick={() => setQuery("")}>
											<CloseIcon />
										</button>
									) : (
										<kbd>/</kbd>
									)}
								</label>
								<button type="button" className="home-action" onClick={onFolder}>
									Open…
								</button>
								<button type="button" className="home-action home-action-primary" onClick={onStart}>
									<PlusIcon />
									New project
								</button>
							</div>
						</header>
						<div className="pj-toolbar">
							<span>
								{visible.length} {visible.length === 1 ? "project" : "projects"}
							</span>
							<label>
								Sort by
								<select
									aria-label="Sort projects"
									value={sort}
									onChange={(event) => setSort(event.target.value)}
								>
									<option>Recent</option>
									<option>Name</option>
								</select>
							</label>
						</div>
						{visible.length === 0 ? (
							<EmptyState
								className="pj-empty"
								icon={<EmptyFramesIcon />}
								title={`Nothing matches “${query}”`}
								description="Try a project name or part of its path."
								actions={
									<button type="button" className="home-action" onClick={() => setQuery("")}>
										Clear search
									</button>
								}
							/>
						) : (
							<div className="pj-covers-grid">
								{visible.map((project) => (
									<ProjectTile
										key={project.root}
										project={project}
										menuOpen={menuRoot === project.root}
										onToggleMenu={() => setMenuRoot(menuRoot === project.root ? null : project.root)}
										onCloseMenu={() => setMenuRoot(null)}
										onOpen={() => onOpenProject(project)}
										onForget={() => onForgetProject(project)}
										onTrash={() => onTrashProject(project)}
										onRename={() => onRenameProject(project)}
									/>
								))}
							</div>
						)}
					</main>
				)}
			</div>
			{menuRoot !== null && (
				<button
					type="button"
					className="fixed inset-0 z-10 cursor-default"
					aria-label="Close menu"
					onClick={() => setMenuRoot(null)}
				/>
			)}
		</div>
	);
}

function ProjectTile({
	project,
	menuOpen,
	onToggleMenu,
	onCloseMenu,
	onOpen,
	onForget,
	onTrash,
	onRename,
}: {
	project: ProjectCard;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	onOpen: () => void;
	onForget: () => void;
	onTrash: () => void;
	onRename: () => void;
}) {
	const manageRef = useRef<HTMLButtonElement>(null);
	const cover = project.covers[0];
	return (
		<article
			className={`pj-project-cover ${menuOpen ? "z-20" : ""}`}
			style={{ viewTransitionName: transitionName(project.root) }}
		>
			<button type="button" className="pj-cover-button" aria-label={`Open ${project.name}`} onClick={onOpen}>
				<div className="pj-cover-art">
					{cover && (
						<Thumbnail
							project={project.name}
							frame={cover.frame}
							cover={cover.cover}
							alt={cover.frame}
							draggable={false}
							className="h-full w-full object-cover object-top"
						/>
					)}
					<span className="pj-cover-enter">
						<ArrowRightIcon className="home-arrow" />
					</span>
				</div>
				<div className="pj-cover-caption">
					<strong className="truncate">{project.name}</strong>
					<span>
						{project.frameCount
							? `${project.frameCount} ${project.frameCount === 1 ? "frame" : "frames"}`
							: "no frames yet"}
					</span>
				</div>
				<span className="pj-opened-time">{relativeTime(project.openedAt)}</span>
			</button>
			<button
				type="button"
				ref={manageRef}
				className={`pj-manage ${menuOpen ? "is-open" : ""}`}
				aria-label={`Manage ${project.name}`}
				onClick={onToggleMenu}
			>
				<DotsIcon />
			</button>
			{menuOpen && (
				<div className="absolute right-0 top-full z-20 flex w-[196px] animate-menu-in origin-top-right flex-col rounded-md border border-border-raised bg-raised p-unit">
					<MenuItem
						label="Open"
						onClick={() => {
							onCloseMenu();
							onOpen();
						}}
					/>
					<MenuItem
						label="Rename…"
						onClick={() => {
							manageRef.current?.focus();
							onCloseMenu();
							onRename();
						}}
					/>
					<MenuItem
						label="Copy path"
						onClick={() => {
							onCloseMenu();
							void navigator.clipboard?.writeText(project.root);
						}}
					/>
					<div className="mx-2 my-unit h-px bg-border-raised" />
					<MenuItem
						label="Hide from Spool"
						onClick={() => {
							onCloseMenu();
							withViewTransition(onForget);
						}}
					/>
					<MenuItem
						label={`Move to ${systemTrashName()}…`}
						danger
						onClick={() => {
							manageRef.current?.focus();
							onCloseMenu();
							onTrash();
						}}
					/>
				</div>
			)}
		</article>
	);
}

function NavigationButton({
	icon,
	children,
	onClick,
	active = false,
	title,
}: {
	icon: ReactNode;
	children: ReactNode;
	onClick: () => void;
	active?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			className="pj-navigation-item"
			aria-current={active ? "page" : undefined}
			onClick={onClick}
			title={title}
		>
			{icon}
			<span>{children}</span>
		</button>
	);
}

function MenuItem({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
	return (
		<button
			type="button"
			className="flex h-[30px] items-center rounded-sm px-3 text-left text-text hover:bg-surface type-control"
			style={danger ? { color: "light-dark(#bb2614, #ff604b)" } : undefined}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

/**
 * A removal reflows every card after it. Where the browser can morph that (view
 * transitions), it does; where it cannot, the grid just snaps — the state change
 * is the same either way.
 */
function withViewTransition(mutate: () => void): void {
	const start = (document as Document & { startViewTransition?: (callback: () => void) => unknown })
		.startViewTransition;
	if (typeof start !== "function") {
		mutate();
		return;
	}
	start.call(document, mutate);
}

/** view-transition-name takes a custom-ident: a path is neither unique-safe nor legal as-is. */
function transitionName(root: string): string {
	return `card-${root.replace(/[^a-zA-Z0-9]+/g, "-")}`;
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
