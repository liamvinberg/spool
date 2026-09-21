import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ProjectCard } from "./api";
import { cn } from "./cn";
import { EmptyFramesIcon, EmptyState } from "./empty-state";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "./home-actions";
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
	onImport,
	onExportProject,
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
	onImport?: () => void;
	onExportProject?: (project: ProjectCard) => void;
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
		<div className="pj-body h-full overflow-auto bg-bg text-text [scrollbar-width:thin] [scrollbar-color:var(--color-border-raised)_transparent]">
			<div className="pj-layout grid min-h-full grid-cols-[208px_minmax(0,1fr)] [@media(max-width:720px)]:grid-cols-[64px_minmax(0,1fr)]">
				<aside className="pj-navigation sticky top-0 flex h-[calc(100vh-44px)] flex-col border-r border-border bg-bg px-[16px] pt-[32px] pb-[22px] [@media(max-width:720px)]:px-[8px] [@media(max-width:720px)]:py-[24px]">
					<div className="pj-wordmark mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px] [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0 [@media(max-width:720px)]:[&>span]:hidden">
						<RibbonMark className="pj-logo h-[25px] w-[19px] shrink-0 text-thread" />
						<span>spool</span>
					</div>
					<nav className="flex flex-col gap-[4px]" aria-label="Home sections">
						<NavigationButton icon={<FrameIcon />} active onClick={() => setQuery("")}>
							Projects
						</NavigationButton>
					</nav>
					<div className="pj-navigation-foot mt-auto flex flex-col gap-[22px] [&>span]:pl-[12px] [&>span]:text-muted [&>span]:[font:var(--type-detail)] [&>span]:[font-feature-settings:var(--font-mono--font-feature-settings)] [@media(max-width:720px)]:[&>span]:hidden">
						<nav className="flex flex-col gap-[4px]" aria-label="Home actions">
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
					<main className="pj-welcome-main flex items-center justify-center p-[48px] [@media(max-width:1050px)]:p-[32px]">
						<EmptyState
							className="pj-welcome mt-[-50px] w-[650px] [&>p]:mt-[14px] [&>p]:[font:var(--type-body)] [&>p]:text-muted [&>.spool-empty-actions]:grid [&>.spool-empty-actions]:w-full [&>.spool-empty-actions]:grid-cols-2 [&>.spool-empty-actions]:gap-[22px] [&>.spool-empty-actions]:mt-[44px] [&>.spool-empty-actions]:text-left [@media(max-width:720px)]:m-0 [@media(max-width:720px)]:[&>.spool-empty-actions]:grid-cols-1"
							heading="h1"
							align="start"
							title="Start with an idea."
							description="Your next project can start here, or in a folder you already have."
							actions={
								<>
									<button
										type="button"
										className="flex flex-col items-start rounded-lg border border-border-raised bg-surface px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-control [&:hover]:border-muted disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none [&>svg]:mb-[32px] [&>svg]:h-[23px] [&>svg]:w-[23px] [&>svg]:text-thread"
										onClick={onStart}
									>
										<PlusIcon />
										<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
											New project…
											<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
										</strong>
										<small className="mt-[10px] text-muted type-control">
											Open a blank canvas.
											<br />
											spool saves the project on your Mac.
										</small>
									</button>
									<button
										type="button"
										className="flex flex-col items-start rounded-lg border border-border-raised bg-surface px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-control [&:hover]:border-muted disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none"
										onClick={onFolder}
									>
										<FolderIcon className="mb-[32px] h-[23px] w-[23px] text-muted" />
										<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
											Open…
											<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
										</strong>
										<small className="mt-[10px] text-muted type-control">
											Bring your codebase.
											<br />
											Keep the design beside your code.
										</small>
									</button>
									<button
										type="button"
										className="flex flex-col items-start rounded-lg border border-border-raised bg-surface px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-control [&:hover]:border-muted disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none"
										onClick={onImport}
									>
										<FolderIcon className="mb-[32px] h-[23px] w-[23px] text-muted" />
										<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
											Import…
											<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
										</strong>
										<small className="mt-[10px] text-muted type-control">Open a .spool project file.</small>
									</button>
								</>
							}
						/>
					</main>
				) : (
					<main className="pj-main min-w-0 px-[48px] pt-[46px] pb-[30px] [@media(max-width:1050px)]:px-[30px] [@media(max-width:1050px)]:py-[34px]">
						<header className="pj-heading mb-[31px] flex items-center justify-between gap-[25px] [@media(max-width:1050px)]:flex-wrap">
							<h1 className="type-page font-medium">Projects</h1>
							<div className="flex items-center gap-[13px] [@media(max-width:720px)]:flex-wrap">
								<label className="home-search flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border bg-transparent px-[11px] text-muted focus-within:border-muted">
									<SearchIcon />
									<input
										className="w-full min-w-0 bg-transparent text-text outline-none type-control placeholder:text-muted"
										ref={searchRef}
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Search projects"
										aria-label="Search projects"
									/>
									{query ? (
										<button type="button" className="flex" title="Clear search" onClick={() => setQuery("")}>
											<CloseIcon />
										</button>
									) : (
										<kbd className="type-detail">/</kbd>
									)}
								</label>
								<button type="button" className={cn("home-action h-[35px]", HOME_ACTION)} onClick={onImport}>
									Import…
								</button>
								<button type="button" className={cn("home-action h-[35px]", HOME_ACTION)} onClick={onFolder}>
									Open…
								</button>
								<button
									type="button"
									className={cn("home-action home-action-primary h-[35px]", HOME_ACTION_PRIMARY)}
									onClick={onStart}
								>
									<PlusIcon />
									New project…
								</button>
							</div>
						</header>
						<div className="pj-toolbar mb-[24px] flex h-[23px] items-center justify-between text-muted type-caption">
							<span className="type-detail">
								{visible.length} {visible.length === 1 ? "project" : "projects"}
							</span>
							<label className="flex items-center gap-[4px]">
								Sort by
								<select
									className="cursor-pointer bg-transparent pt-[3px] pr-[2px] pb-[3px] pl-[5px] text-text type-caption"
									aria-label="Sort projects"
									value={sort}
									onChange={(event) => setSort(event.target.value)}
								>
									<option className="bg-surface">Recent</option>
									<option className="bg-surface">Name</option>
								</select>
							</label>
						</div>
						{visible.length === 0 ? (
							<EmptyState
								className="pj-empty min-h-[420px] p-[35px] [&>p]:mt-0"
								icon={<EmptyFramesIcon />}
								title={`Nothing matches “${query}”`}
								description="Try a project name or part of its path."
								actions={
									<button
										type="button"
										className={cn("home-action", HOME_ACTION)}
										onClick={() => setQuery("")}
									>
										Clear search
									</button>
								}
							/>
						) : (
							<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
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
										onExport={() => onExportProject?.(project)}
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
	onExport,
}: {
	project: ProjectCard;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	onOpen: () => void;
	onForget: () => void;
	onTrash: () => void;
	onRename: () => void;
	onExport: () => void;
}) {
	const manageRef = useRef<HTMLButtonElement>(null);
	const cover = project.covers[0];
	return (
		<article
			className={cn("pj-project-cover group/project relative min-w-0", menuOpen ? "z-20" : "")}
			style={{ viewTransitionName: transitionName(project.root) }}
		>
			<button
				type="button"
				className="pj-cover-button group/cover block w-full text-left"
				aria-label={`Open ${project.name}`}
				onClick={onOpen}
			>
				<div className="pj-cover-art relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
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
					<span className="pj-cover-enter absolute right-[12px] bottom-[12px] grid h-[30px] w-[30px] place-items-center rounded-[6px] border border-border-raised bg-bg text-text opacity-0 [transform:translateX(-3px)] group-focus-visible/cover:opacity-100 group-focus-visible/cover:[transform:none] group-hover/cover:opacity-100 group-hover/cover:[transform:none] motion-reduce:transition-none">
						<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
					</span>
				</div>
				<div className="pj-cover-caption flex items-baseline justify-between gap-[9px] pt-[15px] pr-[32px]">
					<strong className="truncate type-title font-[500]">{project.name}</strong>
					<span className="shrink-0 text-muted type-detail">
						{project.frameCount
							? `${project.frameCount} ${project.frameCount === 1 ? "frame" : "frames"}`
							: "no frames yet"}
					</span>
				</div>
				<span className="pj-opened-time mt-[7px] block text-muted type-detail">
					{relativeTime(project.openedAt)}
				</span>
			</button>
			<button
				type="button"
				ref={manageRef}
				className={cn(
					"pj-manage absolute right-[-4px] bottom-[23px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[5px] text-muted opacity-0 focus-visible:opacity-100 [&.is-open]:opacity-100 group-focus-within/project:opacity-100 group-hover/project:opacity-100 hover:bg-surface hover:text-text",
					menuOpen ? "is-open" : "",
				)}
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
						label="Export project…"
						onClick={() => {
							manageRef.current?.focus();
							onCloseMenu();
							onExport();
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
			className="pj-navigation-item flex h-[38px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left text-muted type-control [&:hover]:bg-surface [&:hover]:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text [&>svg]:h-[16px] [&>svg]:w-[16px] [&>svg]:shrink-0 [@media(max-width:720px)]:px-0 [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:[&>span]:hidden"
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
			className={cn(
				"flex h-[30px] items-center rounded-sm px-3 text-left hover:bg-surface type-control",
				danger ? "text-[light-dark(#bb2614,#ff604b)]" : "text-text",
			)}
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
