import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type HerePerson, type ProjectCard, thumbnailUrl } from "./api";
import { cn } from "./cn";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { type HotkeyIdFor, hotkeyKey } from "./hotkeys";
import { ArrowRightIcon, DotsIcon, FolderIcon, FrameIcon, PlusIcon, RibbonMark } from "./icons";
import { tilde } from "./paths";
import { Button, IconButton, SplitButton } from "./primitives/actions";
import { Count } from "./primitives/display";
import { EmptyFrames, EmptyState } from "./primitives/feedback";
import { SearchField, SelectTrigger } from "./primitives/inputs";
import { NavItem } from "./primitives/navigation";
import { Menu, MenuItem, MenuSeparator } from "./primitives/overlays";
import { ProjectIconView, useMarkTeam } from "./project-icon";
import { systemTrashName } from "./system-trash";
import { Thumbnail } from "./thumbnail";

export function Home({
	projects,
	loading = false,
	onOpenProject,
	onForgetProject,
	onTrashProject,
	onRenameProject,
	onStart,
	onFolder,
	onImport,
	onExportProject,
	onMoveToTeam,
	onChangeIcon,
	onRemoveIcon,
	onRemoveThumbnail,
	account,
	switcher,
	notice,
	team,
}: {
	projects: ProjectCard[];
	loading?: boolean;
	onOpenProject: (project: { root: string; name: string }) => void;
	onForgetProject: (project: { root: string; name: string }) => void;
	onTrashProject: (project: { root: string; name: string }) => void;
	onRenameProject: (project: { root: string; name: string }) => void;
	onStart: () => void;
	onFolder: () => void;
	onImport?: () => void;
	onExportProject?: (project: ProjectCard) => void;
	/** "Move to team…" on a project's cover, while this account edits in a team. */
	onMoveToTeam?: ((project: { root: string; name: string }) => void) | undefined;
	/** "Change icon…" on a project's cover. */
	onChangeIcon?: (project: { root: string; name: string }) => void;
	/** "Remove icon" on a cover whose icon is the project's own file. */
	onRemoveIcon?: (project: { root: string; name: string }) => void;
	/** "Remove thumbnail" on a cover showing the project's own thumbnail file. */
	onRemoveThumbnail?: (project: { root: string; name: string }) => void;
	/** This Mac's account, at the foot of the sidebar. */
	account?: ReactNode;
	/** The team switcher, at the top of the sidebar once this Mac is signed in. */
	switcher?: ReactNode;
	/** One line per invite waiting for this account, above the covers. */
	notice?: ReactNode;
	/** While a team is chosen in the switcher: its nav and its page, in place of your own projects. */
	team?: { nav: ReactNode; main: ReactNode } | undefined;
}) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("Recent");
	const [menuRoot, setMenuRoot] = useState<string | null>(null);
	const [headMenu, setHeadMenu] = useState<"sort" | "start" | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const needle = query.trim().toLowerCase();
	const covers = coversOf(projects);
	const visible = covers
		.filter((project) => project.name.toLowerCase().includes(needle) || project.root.toLowerCase().includes(needle))
		.sort((a, b) =>
			sort === "Name" ? a.name.localeCompare(b.name) : Date.parse(b.openedAt) - Date.parse(a.openedAt),
		);
	useEffect(
		() =>
			attachHotkeyLayer({
				scope: "home",
				handlers: {
					"home.close-menu": () => {
						setMenuRoot(null);
						setHeadMenu(null);
					},
					"home.search": (event) => {
						event?.preventDefault();
						searchRef.current?.focus();
					},
				} satisfies Record<HotkeyIdFor<"home">, HotkeyHandler>,
			}),
		[],
	);
	return (
		<HomeShell
			switcher={switcher}
			nav={
				team ? (
					team.nav
				) : (
					<NavItem
						icon={<FrameIcon />}
						label="Projects"
						current
						className={NARROW_NAV}
						onClick={() => setQuery("")}
					/>
				)
			}
			foot={<>{account ?? <span>On this Mac</span>}</>}
		>
			{team ? (
				<main className={HOME_MAIN}>{team.main}</main>
			) : loading ? (
				<main aria-busy="true" />
			) : projects.length === 0 && needle === "" ? (
				<main className="pj-welcome-main flex flex-col items-center justify-center p-[48px] [@media(max-width:1050px)]:p-[32px]">
					{notice && <div className="w-[650px] max-w-full">{notice}</div>}
					<EmptyState
						className="pj-welcome mt-[-50px] w-[650px] max-w-full [@media(max-width:720px)]:m-0"
						heading="h1"
						align="start"
						title="Start with an idea."
						description="Your next project can start here, or in a folder you already have."
						actions={
							<div className="grid w-[650px] max-w-full grid-cols-2 gap-[22px] text-left [@media(max-width:720px)]:grid-cols-1">
								<button
									type="button"
									className="flex flex-col items-start rounded-lg border border-line-strong bg-surface-panel px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-surface-control [&:hover]:border-secondary disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none [&>svg]:mb-[32px] [&>svg]:h-[23px] [&>svg]:w-[23px] [&>svg]:text-accent"
									onClick={onStart}
								>
									<PlusIcon />
									<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
										New project…
										<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
									</strong>
									<small className="mt-[10px] text-secondary type-control">
										Open a blank canvas.
										<br />
										spool saves the project on your Mac.
									</small>
								</button>
								<button
									type="button"
									className="flex flex-col items-start rounded-lg border border-line-strong bg-surface-panel px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-surface-control [&:hover]:border-secondary disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none"
									onClick={onFolder}
								>
									<FolderIcon className="mb-[32px] h-[23px] w-[23px] text-secondary" />
									<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
										Open…
										<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
									</strong>
									<small className="mt-[10px] text-secondary type-control">
										Bring your codebase.
										<br />
										Keep the design beside your code.
									</small>
								</button>
								<button
									type="button"
									className="flex flex-col items-start rounded-lg border border-line-strong bg-surface-panel px-[24px] py-[27px] text-left [transition:border-color_140ms_ease,background_140ms_ease] [&:hover]:bg-surface-control [&:hover]:border-secondary disabled:opacity-50 disabled:cursor-wait motion-reduce:transition-none"
									onClick={onImport}
								>
									<FolderIcon className="mb-[32px] h-[23px] w-[23px] text-secondary" />
									<strong className="flex w-full items-center justify-between [font:var(--type-heading)] [&]:font-[400]">
										Import…
										<ArrowRightIcon className="home-arrow h-[16px] w-[16px] shrink-0" />
									</strong>
									<small className="mt-[10px] text-secondary type-control">Open a .spool project file.</small>
								</button>
							</div>
						}
					/>
				</main>
			) : (
				<main className={HOME_MAIN}>
					<header className="pj-heading mb-[31px] flex items-center justify-between gap-[25px] [@media(max-width:1050px)]:flex-wrap">
						<div className="flex items-baseline gap-3">
							<h1 className="type-page font-medium">Projects</h1>
							<Count
								aria-label={
									needle === ""
										? `${covers.length} ${covers.length === 1 ? "project" : "projects"}`
										: `${visible.length} of ${covers.length} projects`
								}
								value={needle === "" ? covers.length : `${visible.length} of ${covers.length}`}
							/>
						</div>
						<div className="flex items-center gap-2 [@media(max-width:720px)]:flex-wrap">
							<div className="relative">
								<SelectTrigger
									// the trigger's own face is a toolbar's; in the head it matches the search beside it
									value={<span className="type-control">{SORT_LABEL[sort]}</span>}
									open={headMenu === "sort"}
									aria-haspopup="menu"
									aria-label={`Sort projects: ${SORT_LABEL[sort]}`}
									className="h-control-lg px-2"
									onClick={() => setHeadMenu(headMenu === "sort" ? null : "sort")}
								/>
								{headMenu === "sort" && (
									<Menu aria-label="Sort projects" className="absolute top-full left-0 z-20 mt-1">
										{SORTS.map((choice) => (
											<MenuItem
												key={choice}
												label={SORT_LABEL[choice]}
												checked={sort === choice}
												onClick={() => {
													setSort(choice);
													setHeadMenu(null);
												}}
											/>
										))}
									</Menu>
								)}
							</div>
							<SearchField
								className="w-menu"
								value={query}
								onValueChange={setQuery}
								placeholder="Search projects"
								inputProps={{ ref: searchRef }}
							/>
							<div className="relative">
								<SplitButton
									size="lg"
									icon={<PlusIcon />}
									onClick={onStart}
									menuLabel="More ways to start"
									menuOpen={headMenu === "start"}
									onMenu={() => setHeadMenu(headMenu === "start" ? null : "start")}
								>
									New project…
								</SplitButton>
								{headMenu === "start" && (
									<Menu aria-label="Start a project" className="absolute top-full right-0 z-20 mt-1">
										<MenuItem
											label="New project…"
											shortcut={hotkeyKey("app.new-project")}
											onClick={() => {
												setHeadMenu(null);
												onStart();
											}}
										/>
										<MenuSeparator />
										<MenuItem
											label="Open folder…"
											shortcut={hotkeyKey("app.open-project")}
											onClick={() => {
												setHeadMenu(null);
												onFolder();
											}}
										/>
										{onImport && (
											<MenuItem
												label="Import .spool file…"
												onClick={() => {
													setHeadMenu(null);
													onImport();
												}}
											/>
										)}
									</Menu>
								)}
							</div>
						</div>
						{headMenu !== null && <MenuBackdrop onClose={() => setHeadMenu(null)} />}
					</header>
					{notice && <div className="mb-[24px]">{notice}</div>}
					{visible.length === 0 ? (
						<EmptyState
							className="min-h-[420px] justify-center p-[35px]"
							art={<EmptyFrames />}
							title={`Nothing matches “${query}”`}
							description="Try a project name or part of its path."
							actions={
								<Button size="lg" onClick={() => setQuery("")}>
									Clear search
								</Button>
							}
						/>
					) : (
						<ProjectGrid
							projects={visible}
							query={needle}
							menu={menuRoot}
							onMenu={setMenuRoot}
							onOpenProject={onOpenProject}
							onForgetProject={onForgetProject}
							onTrashProject={onTrashProject}
							onRenameProject={onRenameProject}
							{...(onExportProject === undefined ? {} : { onExportProject })}
							{...(onMoveToTeam === undefined ? {} : { onMoveToTeam })}
							{...(onChangeIcon === undefined ? {} : { onChangeIcon })}
							{...(onRemoveIcon === undefined ? {} : { onRemoveIcon })}
							{...(onRemoveThumbnail === undefined ? {} : { onRemoveThumbnail })}
						/>
					)}
				</main>
			)}
		</HomeShell>
	);
}

/** Home's page beside the sidebar: its padding, which a narrow window tightens. */
export const HOME_MAIN =
	"pj-main min-w-0 px-[48px] pt-[46px] pb-[30px] [@media(max-width:1050px)]:px-[30px] [@media(max-width:1050px)]:py-[34px]";

/**
 * Home's frame: the sidebar with the wordmark, the team switcher, the nav and its foot, and the page beside it. In the
 * Mac app it sits under the window's tabs; at spool.page/<team> it has the whole browser window.
 */
export function HomeShell({
	switcher,
	nav,
	foot,
	underTabs = true,
	children,
}: {
	switcher?: ReactNode;
	nav: ReactNode;
	foot: ReactNode;
	/** Whether the window's tab strip stands above it, as in the Mac app. */
	underTabs?: boolean;
	/** The page: a `main`. */
	children: ReactNode;
}) {
	return (
		<div className="pj-body h-full overflow-auto bg-surface-window text-primary [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]">
			<div className="pj-layout grid min-h-full grid-cols-[208px_minmax(0,1fr)] [@media(max-width:720px)]:grid-cols-[64px_minmax(0,1fr)]">
				<aside
					className={cn(
						"pj-navigation sticky top-0 z-10 flex flex-col border-r border-line-default bg-surface-window px-[16px] pt-[32px] pb-[22px] [@media(max-width:720px)]:px-[8px] [@media(max-width:720px)]:py-[24px]",
						underTabs ? "h-[calc(100vh-44px)]" : "h-dvh",
					)}
				>
					<div className="pj-wordmark mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px] [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0 [@media(max-width:720px)]:[&>span]:hidden">
						<RibbonMark className="pj-logo h-[25px] w-[19px] shrink-0 text-accent" />
						<span>spool</span>
					</div>
					{switcher}
					<nav className="flex flex-col gap-[4px]" aria-label="Home sections">
						{nav}
					</nav>
					<div className="pj-navigation-foot mt-auto flex flex-col gap-[22px] [&>span]:pl-[12px] [&>span]:text-secondary [&>span]:[font:var(--type-detail)] [&>span]:[font-feature-settings:var(--font-mono--font-feature-settings)] [@media(max-width:720px)]:[&>span]:hidden">
						{foot}
					</div>
				</aside>
				{children}
			</div>
		</div>
	);
}

/** A cover on Home: a project, or a team project shown once however many local copies of it this Mac holds. */
export interface ProjectCover extends ProjectCard {
	/** How many local copies of the team project the cover stands for; the cover is the latest opened. */
	copies: number;
}

/** One cover per solo project and per team project: a team project's local copies share one. */
export function coversOf(projects: readonly ProjectCard[]): ProjectCover[] {
	const covers: ProjectCover[] = [];
	const teamCovers = new Map<string, ProjectCover>();
	for (const project of [...projects].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))) {
		const shared = project.team === undefined ? undefined : teamCovers.get(project.team.url);
		if (shared !== undefined) {
			shared.copies += 1;
			continue;
		}
		const cover = { ...project, copies: 1 };
		if (project.team !== undefined) teamCovers.set(project.team.url, cover);
		covers.push(cover);
	}
	return covers;
}

/**
 * Who is inside a team project right now (DEV-197), on its cover's foot so it reads as inside: their faces in their
 * team colours, and "sam is here" or "2 here".
 */
export function HerePill({ people }: { people: readonly HerePerson[] | undefined }) {
	if (people === undefined || people.length === 0) return null;
	const shown = people.length > HERE_FACES ? people.slice(0, HERE_FACES - 1) : people;
	return (
		<span
			data-here={people.map((person) => person.name).join(" ")}
			className="pointer-events-none absolute bottom-[10px] left-[10px] z-10 flex items-center gap-[8px] rounded-full bg-surface-window py-[3px] pr-[10px] pl-[3px] text-primary"
		>
			<span className="flex">
				{shown.map((person, i) => (
					<span
						key={person.name}
						className="grid h-[22px] w-[22px] place-items-center rounded-full font-semibold text-[10px] uppercase leading-none"
						style={{
							background: person.color,
							color: "#0e0e0e",
							boxShadow: "0 0 0 2px var(--color-surface-window)",
							marginLeft: i === 0 ? 0 : -5,
							zIndex: shown.length - i,
						}}
					>
						{person.name.charAt(0)}
					</span>
				))}
			</span>
			<span className="type-detail">
				{people.length === 1 ? `${people[0]?.name} is here` : `${people.length} here`}
			</span>
		</span>
	);
}

/** The faces a cover shows before the rest are only counted. */
const HERE_FACES = 4;

/** The covers, three across, each with its menu: `menu` is the root whose menu is open. */
export function ProjectGrid({
	projects,
	query = "",
	menu,
	onMenu,
	onOpenProject,
	onForgetProject,
	onTrashProject,
	onRenameProject,
	onExportProject,
	onMoveToTeam,
	onChangeIcon,
	onRemoveIcon,
	onRemoveThumbnail,
	here,
}: {
	projects: readonly ProjectCover[];
	/** The search, lowercase: a cover it finds only by its path shows the path. */
	query?: string;
	menu: string | null;
	onMenu: (root: string | null) => void;
	onOpenProject: (project: { root: string; name: string }) => void;
	onForgetProject: (project: { root: string; name: string }) => void;
	onTrashProject: (project: { root: string; name: string }) => void;
	onRenameProject: (project: { root: string; name: string }) => void;
	onExportProject?: (project: ProjectCard) => void;
	/** "Move to team…", offered on a project that isn't a team project yet. */
	onMoveToTeam?: (project: { root: string; name: string }) => void;
	onChangeIcon?: (project: { root: string; name: string }) => void;
	onRemoveIcon?: (project: { root: string; name: string }) => void;
	onRemoveThumbnail?: (project: { root: string; name: string }) => void;
	/** Who is inside each team project now, by its name in the team. */
	here?: ReadonlyMap<string, readonly HerePerson[]>;
}) {
	return (
		<>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{projects.map(({ copies, ...project }) => (
					<ProjectTile
						key={project.root}
						project={project}
						copies={copies}
						pathHit={query !== "" && !project.name.toLowerCase().includes(query)}
						here={project.team === undefined ? undefined : here?.get(project.team.project)}
						menuOpen={menu === project.root}
						onToggleMenu={() => onMenu(menu === project.root ? null : project.root)}
						onCloseMenu={() => onMenu(null)}
						onOpen={() => onOpenProject(project)}
						onForget={() => onForgetProject(project)}
						onTrash={() => onTrashProject(project)}
						onRename={() => onRenameProject(project)}
						onExport={() => onExportProject?.(project)}
						{...(onMoveToTeam === undefined || project.team !== undefined
							? {}
							: { onMoveToTeam: () => onMoveToTeam(project) })}
						{...(onChangeIcon === undefined ? {} : { onChangeIcon: () => onChangeIcon(project) })}
						{...(onRemoveIcon === undefined || project.icon?.from !== "file"
							? {}
							: { onRemoveIcon: () => onRemoveIcon(project) })}
						{...(onRemoveThumbnail === undefined || project.thumbnail === undefined
							? {}
							: { onRemoveThumbnail: () => onRemoveThumbnail(project) })}
					/>
				))}
			</div>
			{menu !== null && <MenuBackdrop onClose={() => onMenu(null)} />}
		</>
	);
}

function ProjectTile({
	project,
	copies,
	pathHit,
	here,
	menuOpen,
	onToggleMenu,
	onCloseMenu,
	onOpen,
	onForget,
	onTrash,
	onRename,
	onExport,
	onMoveToTeam,
	onChangeIcon,
	onRemoveIcon,
	onRemoveThumbnail,
}: {
	project: ProjectCard;
	copies: number;
	pathHit: boolean;
	here: readonly HerePerson[] | undefined;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	onOpen: () => void;
	onForget: () => void;
	onTrash: () => void;
	onRename: () => void;
	onExport: () => void;
	onMoveToTeam?: () => void;
	onChangeIcon?: () => void;
	onRemoveIcon?: () => void;
	onRemoveThumbnail?: () => void;
}) {
	const cover = project.covers[0];
	return (
		<CoverTile
			name={project.name}
			open={{ onClick: onOpen }}
			here={here}
			transition={transitionName(project.root)}
			line={<QuietLine project={project} copies={copies} detail={menuOpen || pathHit} />}
			menuOpen={menuOpen}
			onToggleMenu={onToggleMenu}
			onCloseMenu={onCloseMenu}
			art={
				<>
					{/* fitted whole on the canvas colour, never cropped: a phone frame stands whole, a wide one nearly fills */}
					{project.thumbnail !== undefined ? (
						<img
							src={thumbnailUrl(project.name, project.thumbnail.hash)}
							alt=""
							draggable={false}
							className="h-full w-full object-contain"
						/>
					) : cover ? (
						<Thumbnail
							project={project.name}
							frame={cover.frame}
							cover={cover.cover}
							alt={cover.frame}
							draggable={false}
							className="h-full w-full object-contain"
						/>
					) : (
						// nothing to picture yet: its own mark, so an empty project still reads as itself
						<ProjectIconView project={project.name} name={project.name} icon={project.icon} size="md" />
					)}
				</>
			}
			menu={({ close, refocus }) => (
				<>
					<MenuItem
						label="Open"
						onClick={() => {
							close();
							onOpen();
						}}
					/>
					{onChangeIcon && (
						<MenuItem
							label="Change icon…"
							onClick={() => {
								refocus();
								close();
								onChangeIcon();
							}}
						/>
					)}
					{onRemoveIcon && (
						<MenuItem
							label="Remove icon"
							onClick={() => {
								refocus();
								close();
								onRemoveIcon();
							}}
						/>
					)}
					{onRemoveThumbnail && (
						<MenuItem
							label="Remove thumbnail"
							onClick={() => {
								refocus();
								close();
								onRemoveThumbnail();
							}}
						/>
					)}
					<MenuItem
						label="Export project…"
						onClick={() => {
							refocus();
							close();
							onExport();
						}}
					/>
					<MenuItem
						label="Rename…"
						onClick={() => {
							refocus();
							close();
							onRename();
						}}
					/>
					{onMoveToTeam && (
						<MenuItem
							label="Move to team…"
							onClick={() => {
								refocus();
								close();
								onMoveToTeam();
							}}
						/>
					)}
					<MenuItem
						label="Copy path"
						onClick={() => {
							close();
							void navigator.clipboard?.writeText(project.root);
						}}
					/>
					<MenuSeparator />
					<MenuItem
						label="Hide from Spool"
						onClick={() => {
							close();
							withViewTransition(onForget);
						}}
					/>
					<MenuItem
						label={`Move to ${systemTrashName()}…`}
						destructive
						onClick={() => {
							refocus();
							close();
							onTrash();
						}}
					/>
				</>
			)}
		/>
	);
}

/**
 * One cover on Home: its picture fitted whole on the canvas colour, who is inside it, its name and one quiet line,
 * and a menu under its dots. It opens by a click in the app, or as a link in a browser.
 */
export function CoverTile({
	name,
	open,
	art,
	here,
	line,
	transition,
	menuOpen,
	onToggleMenu,
	onCloseMenu,
	menu,
}: {
	name: string;
	open: { onClick: () => void } | { href: string };
	art: ReactNode;
	here: readonly HerePerson[] | undefined;
	line: ReactNode;
	/** Its view-transition name, for the grid's reflow when a cover leaves. */
	transition?: string;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	/** The menu's items: `close` closes it, `refocus` gives the dots back the focus first, for an item that opens a sheet. */
	menu: (manage: { close: () => void; refocus: () => void }) => ReactNode;
}) {
	const manageRef = useRef<HTMLButtonElement>(null);
	const tileRef = useRef<HTMLElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuAt, setMenuAt] = useState<MenuPlace | null>(null);
	const closeMenu = useRef(onCloseMenu);
	closeMenu.current = onCloseMenu;
	// placed in the window rather than in the tile: Home scrolls, and a menu hanging below the last row would
	// grow the scroll box under it instead of floating over the window
	useLayoutEffect(() => {
		if (!menuOpen) {
			setMenuAt(null);
			return;
		}
		const tile = tileRef.current;
		const manage = manageRef.current;
		const menu = menuRef.current;
		if (tile === null || manage === null || menu === null) return;
		setMenuAt(menuPlace(tile.getBoundingClientRect(), manage.getBoundingClientRect(), menu.offsetHeight));
		// a scroll or resize moves the tile out from under the menu, so it closes rather than drift
		const close = () => closeMenu.current();
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		return () => {
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
		};
	}, [menuOpen]);
	const face = (
		<>
			<div className="pj-cover-art relative grid aspect-[1.82] place-items-center overflow-hidden rounded-[8px] bg-surface-canvas">
				{art}
				<HerePill people={here} />
				{/* the resting edge, so a pale cover still ends on a pale page; it firms under the pointer */}
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-0 rounded-[inherit] border transition-colors duration-fast ease-out motion-reduce:transition-none",
						menuOpen
							? "border-line-strong"
							: "border-line-subtle group-focus-within/project:border-line-strong group-hover/project:border-line-strong",
					)}
				/>
			</div>
			<div className="pj-cover-caption pt-[15px] pr-[32px]">
				<strong className="block truncate type-title font-[500]">{name}</strong>
				{line}
			</div>
		</>
	);
	const opener = "pj-cover-button focus-ring block w-full rounded-[8px] text-left";
	return (
		<article
			ref={tileRef}
			className={cn("pj-project-cover group/project relative min-w-0", menuOpen ? "z-20" : "")}
			style={transition === undefined ? undefined : { viewTransitionName: transition }}
		>
			{"href" in open ? (
				<a className={opener} href={open.href} aria-label={`Open ${name}`}>
					{face}
				</a>
			) : (
				<button type="button" className={opener} aria-label={`Open ${name}`} onClick={open.onClick}>
					{face}
				</button>
			)}
			<IconButton
				ref={manageRef}
				icon={<DotsIcon />}
				label={`Manage ${name}`}
				pressed={menuOpen}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				className={cn(
					"pj-manage absolute right-[-4px] bottom-[6px] transition-[background-color,color,opacity,transform]",
					menuOpen
						? "opacity-100"
						: "opacity-0 focus-visible:opacity-100 group-focus-within/project:opacity-100 group-hover/project:opacity-100",
				)}
				onClick={onToggleMenu}
			/>
			{menuOpen && (
				<Menu
					ref={menuRef}
					className="fixed z-20"
					style={
						menuAt === null
							? { visibility: "hidden", top: 0, left: 0 }
							: { top: menuAt.top, left: menuAt.left, transformOrigin: `right ${menuAt.up ? "bottom" : "top"}` }
					}
				>
					{menu({ close: onCloseMenu, refocus: () => manageRef.current?.focus() })}
				</Menu>
			)}
		</article>
	);
}

/**
 * A card's one quiet line. At rest: when it was opened, with the team it is shared in or the team it no longer syncs
 * with. Under the pointer, on focus, with its menu open, or when a search hits only its path, the line turns to where
 * the project lives, how many frames it has and how many copies of it this Mac holds.
 */
function QuietLine({ project, copies, detail }: { project: ProjectCard; copies: number; detail: boolean }) {
	const team = useMarkTeam(project.team?.team);
	const when = [
		team?.name,
		project.syncPaused !== undefined && "sync paused",
		project.goneLocal !== undefined && "gone local",
		relativeTime(project.openedAt),
		project.ended !== undefined && `no longer synced with ${project.ended}`,
	];
	const where = [
		tilde(project.root),
		project.frameCount ? `${project.frameCount} ${project.frameCount === 1 ? "frame" : "frames"}` : "no frames yet",
		copies > 1 && `${copies} copies on this Mac`,
	];
	const swap =
		"col-start-1 row-start-1 truncate transition-opacity duration-fast ease-out motion-reduce:transition-none";
	return (
		<span className="mt-[5px] grid min-w-0 text-secondary type-detail">
			<span
				data-line="when"
				className={cn(
					swap,
					detail ? "opacity-0" : "group-focus-within/project:opacity-0 group-hover/project:opacity-0",
				)}
			>
				{when.filter(Boolean).join(" · ")}
			</span>
			<span
				data-line="where"
				className={cn(
					swap,
					detail
						? "opacity-100"
						: "opacity-0 group-focus-within/project:opacity-100 group-hover/project:opacity-100",
				)}
			>
				{where.filter(Boolean).join(" · ")}
			</span>
		</span>
	);
}

/** Clicking anywhere off an open menu closes it. */
export function MenuBackdrop({ onClose }: { onClose: () => void }) {
	return (
		<button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={onClose} />
	);
}

type Sort = "Recent" | "Name";
const SORTS: readonly Sort[] = ["Recent", "Name"];
const SORT_LABEL: Record<Sort, string> = { Recent: "Last opened", Name: "A to Z" };

/** How close to the window's edge a cover's menu may sit before it opens upwards. */
const MENU_MARGIN = 8;
const MENU_WIDTH = 200;

interface MenuPlace {
	top: number;
	left: number;
	up: boolean;
}

/**
 * Where a cover's menu lands in the window: under the tile, its right edge on the tile's, or above the manage button
 * when it would run off the bottom.
 */
export function menuPlace(tile: DOMRect, manage: DOMRect, height: number): MenuPlace {
	const up = tile.bottom + height > window.innerHeight - MENU_MARGIN && manage.top - 4 - height >= MENU_MARGIN;
	return {
		top: up ? manage.top - 4 - height : tile.bottom,
		left: Math.max(MENU_MARGIN, Math.min(tile.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_MARGIN)),
		up,
	};
}

/** a narrow window keeps the sidebar's icons and drops their words */
const NARROW_NAV =
	"[@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0 [@media(max-width:720px)]:[&>span]:hidden";

/**
 * A removal reflows every card after it. Where the browser can morph that (view
 * transitions), it does; where it cannot, the grid just snaps: the state change
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
