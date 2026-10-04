import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Project } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Face, Faces, member, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CheckIcon, ChevronIcon, CloseIcon, FrameIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { BranchGlyph, DraftGlyph, EASE, Kbd, PlaceGlyph, Progress } from "./parts";

export type Scope = "own" | "tidemark";
export type Filter = "all" | "draft" | "folder";

/**
 * The shipped Home, two additions deep. The sidebar's top is DEV-121's switcher,
 * one set of covers at a time, and under it your own projects split by where they
 * live. Every cover's second line says that place, quietly, in the same mono as
 * its time.
 */
export function StartHome({
	scope,
	filter,
	own,
	team,
	born,
	fetching,
	keys,
	onScope,
	onFilter,
	onNew,
	onOpen,
	onProject,
	onGet,
}: {
	scope: Scope;
	filter: Filter;
	own: Project[];
	team: Project[];
	born: string | null;
	fetching: Record<string, number>;
	/** Home's own keys are live (no sheet over it) */
	keys: boolean;
	onScope: (scope: Scope) => void;
	onFilter: (filter: Filter) => void;
	onNew: () => void;
	onOpen: () => void;
	onProject: (project: Project) => void;
	onGet: (project: Project) => void;
}) {
	const [query, setQuery] = useState("");
	const [menu, setMenu] = useState(false);
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!keys) return;
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key === "/") {
				event.preventDefault();
				search.current?.focus();
			} else if (event.key === "Escape") setMenu(false);
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [keys]);

	const list = scope === "tidemark" ? team : own.filter((project) => filter === "all" || project.place.kind === filter);
	const needle = query.trim().toLowerCase();
	const visible = list.filter((project) => project.name.includes(needle) || project.place.path.includes(needle));
	const title = scope === "tidemark" ? "Tidemark" : filter === "draft" ? "Drafts" : filter === "folder" ? "Folders" : "Projects";
	const count = (kind: Filter) => own.filter((project) => kind === "all" || project.place.kind === kind).length;

	return (
		<div className="h-full overflow-hidden bg-bg text-text">
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)]">
				<aside className="relative flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
					<div className="mb-[26px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
						<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
						<span>spool</span>
					</div>
					<Switcher scope={scope} open={menu} onToggle={() => setMenu(!menu)} />
					<nav className="mt-[16px] flex flex-col gap-[2px]" aria-label="Home sections">
						{scope === "own" ? (
							<>
								<NavItem icon={<AllGlyph />} label="All" count={count("all")} current={filter === "all"} onClick={() => onFilter("all")} />
								<NavItem icon={<DraftGlyph />} label="Drafts" count={count("draft")} current={filter === "draft"} onClick={() => onFilter("draft")} />
								<NavItem icon={<PlaceGlyph kind="folder" />} label="Folders" count={count("folder")} current={filter === "folder"} onClick={() => onFilter("folder")} />
							</>
						) : (
							<>
								<NavItem icon={<FrameIcon />} label="Projects" count={team.length} current />
								<NavItem icon={<PeopleGlyph />} label="People" count={4} />
							</>
						)}
					</nav>
					<div className="mt-auto pl-[12px] text-muted type-detail">On this Mac</div>
					<AnimatePresence>
						{menu && (
							<SwitchMenu
								scope={scope}
								ownCount={own.length}
								onPick={(next) => {
									setMenu(false);
									onScope(next);
								}}
								onClose={() => setMenu(false)}
							/>
						)}
					</AnimatePresence>
				</aside>
				<main className="min-w-0 overflow-auto px-[48px] pt-[46px] pb-[30px] [scrollbar-width:none]">
					<header className="mb-[31px] flex items-center justify-between gap-[25px]">
						<div className="flex items-center gap-[16px]">
							<h1 className="type-page font-medium">{title}</h1>
							{scope === "tidemark" && <Faces ids={["ada", "jonas", "mira", "sam"]} />}
						</div>
						<div className="flex items-center gap-[13px]">
							<label className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted focus-within:border-muted">
								<SearchIcon className="h-3 w-3 shrink-0" />
								<input
									ref={search}
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											setQuery("");
											event.currentTarget.blur();
										}
									}}
									className="w-full min-w-0 bg-transparent text-text outline-none type-control placeholder:text-muted"
									placeholder={scope === "tidemark" ? "Search Tidemark" : "Search projects"}
									aria-label="Search projects"
								/>
								{query ? (
									<button type="button" onClick={() => setQuery("")} aria-label="Clear search">
										<CloseIcon className="h-2 w-2" />
									</button>
								) : (
									<kbd className="type-detail">/</kbd>
								)}
							</label>
							<button type="button" className={cn("h-[35px]", HOME_ACTION)} onClick={onOpen} title="Open a folder or a git link (O)">
								Open…
							</button>
							<button type="button" className={cn("h-[35px]", HOME_ACTION_PRIMARY)} onClick={onNew} title={scope === "tidemark" ? "New Tidemark project (N)" : "New project (N)"}>
								<PlusIcon className="h-[10px] w-[10px] shrink-0" />
								New project…
							</button>
						</div>
					</header>
					<div className="mb-[24px] flex h-[23px] items-center justify-between text-muted">
						<span className="type-detail">
							{visible.length} {visible.length === 1 ? "project" : "projects"}
						</span>
						<span className="flex items-center gap-[14px] type-caption">
							<span className="flex items-center gap-[6px]">
								<Kbd>N</Kbd> new
							</span>
							<span className="flex items-center gap-[6px]">
								<Kbd>O</Kbd> open
							</span>
						</span>
					</div>
					<motion.div layout className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
						<AnimatePresence mode="popLayout" initial={false}>
							{visible.map((project) => (
								<Tile
									key={project.id}
									project={project}
									born={born === project.id}
									showPlace={scope === "own"}
									fetching={fetching[project.id]}
									onOpen={() => onProject(project)}
									onGet={() => onGet(project)}
								/>
							))}
						</AnimatePresence>
					</motion.div>
					{visible.length === 0 && (
						<p className="pt-[80px] text-center text-muted type-control">
							{needle ? `Nothing matches “${query}”.` : filter === "draft" ? "No drafts yet. A new project starts as one." : "No folders yet. Open… one with design/ in it, or add design/ to one."}
						</p>
					)}
				</main>
			</div>
		</div>
	);
}

function AllGlyph() {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
			<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
			<rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
			<rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
			<rect x="9" y="9" width="4.5" height="4.5" rx="1" />
		</svg>
	);
}

function PeopleGlyph() {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
			<circle cx="6" cy="5.5" r="2.3" />
			<path d="M2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5M10.5 3.4a2.2 2.2 0 0 1 0 4.2M12 9.7c1 .5 1.7 1.6 2 3.3" />
		</svg>
	);
}

function NavItem({ label, icon, count, current = false, onClick }: { label: string; icon: ReactNode; count?: number; current?: boolean; onClick?: () => void }) {
	return (
		<button
			type="button"
			aria-current={current ? "page" : undefined}
			onClick={onClick}
			className={cn(
				"relative flex h-[36px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left type-control [&>svg]:h-[16px] [&>svg]:w-[16px]",
				current ? "text-text" : "text-muted hover:text-text",
			)}
		>
			{current && <motion.span layoutId="start-sheet-nav" className="absolute inset-0 rounded-[7px] bg-surface" transition={{ duration: 0.2, ease: EASE }} />}
			<span className="relative flex items-center [&>svg]:h-[16px] [&>svg]:w-[16px]">{icon}</span>
			<span className="relative flex-1">{label}</span>
			{count !== undefined && <span className="relative text-muted type-detail">{count}</span>}
		</button>
	);
}

function Switcher({ scope, open, onToggle }: { scope: Scope; open: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface"
		>
			{scope === "tidemark" ? <TeamMark /> : <Face id="ada" size={20} ring="border-transparent" />}
			<span className="flex-1 type-control">{scope === "tidemark" ? "Tidemark" : "Your projects"}</span>
			<ChevronIcon open className="h-[10px] w-[10px] text-muted" />
		</button>
	);
}

function SwitchMenu({ scope, ownCount, onPick, onClose }: { scope: Scope; ownCount: number; onPick: (scope: Scope) => void; onClose: () => void }) {
	return (
		<>
			<button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
			<motion.div
				className="absolute top-[134px] left-[16px] z-30 w-[260px] origin-top-left rounded-[9px] border border-border-raised bg-raised p-[5px]"
				initial={{ opacity: 0, y: -4, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, transition: { duration: 0.1 } }}
				transition={{ duration: 0.14, ease: EASE }}
			>
				<MenuRow mark={<Face id="ada" size={20} ring="border-transparent" />} label="Your projects" detail={`${ownCount} on this Mac`} checked={scope === "own"} onClick={() => onPick("own")} />
				<MenuRow mark={<TeamMark />} label="Tidemark" detail="4 people" checked={scope === "tidemark"} onClick={() => onPick("tidemark")} />
				<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
				<MenuRow mark={<PlusIcon className="h-[10px] w-[10px] text-muted" />} label="New team…" />
			</motion.div>
		</>
	);
}

function MenuRow({ mark, label, detail, checked = false, onClick }: { mark: ReactNode; label: string; detail?: string; checked?: boolean; onClick?: () => void }) {
	return (
		<button type="button" onClick={onClick} className={cn("flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left hover:bg-surface", checked && "bg-surface")}>
			<span className="grid w-[20px] place-items-center">{mark}</span>
			<span className="flex-1 type-control">{label}</span>
			{detail && <span className="text-muted type-detail">{detail}</span>}
			{checked && <CheckIcon className="h-[12px] w-[12px] text-text" />}
		</button>
	);
}

/** Where a project lives, in the words a cover's foot has room for. */
export function placeWords(project: Project): string {
	if (project.place.kind === "draft") return "drafts";
	if (project.place.kind === "team") return project.place.label.toLowerCase();
	return project.place.path;
}

const Tile = ({
	project,
	born,
	showPlace,
	fetching,
	onOpen,
	onGet,
	ref,
}: {
	project: Project;
	born: boolean;
	showPlace: boolean;
	fetching: number | undefined;
	onOpen: () => void;
	onGet: () => void;
	ref?: React.Ref<HTMLElement>;
}) => {
	const away = project.place.kind === "team" && project.onMac === false;
	const here = project.here ?? [];
	return (
		<motion.article
			ref={ref}
			layout
			className="group/tile min-w-0"
			initial={born ? { opacity: 0, scale: 0.94 } : { opacity: 0 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
			transition={{ duration: born ? 0.28 : 0.2, ease: EASE, delay: born ? 0.08 : 0 }}
		>
			<button type="button" className="block w-full text-left" onClick={away ? onGet : onOpen} aria-label={away ? `Get ${project.name}` : `Open ${project.name}`}>
				<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
					{project.art !== "blank" && <ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", away && "opacity-35 grayscale")} />}
					{here.length > 0 && (
						<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={here} size={22} ring="border-bg" />
							<span className="type-detail">{here.length === 1 ? `${member(here[0]!).first} is here` : `${here.length} here`}</span>
						</span>
					)}
					{away && (
						<span className="absolute inset-0 grid place-items-center">
							{fetching === undefined ? (
								<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control group-hover/tile:bg-raised">Get it</span>
							) : (
								<span className="flex w-[180px] flex-col gap-[8px] rounded-[8px] border border-border-raised bg-bg px-[12px] py-[10px]">
									<span className="flex justify-between type-detail">
										<span>fetching</span>
										<span className="text-muted">{Math.round(fetching * project.frames)} / {project.frames}</span>
									</span>
									<Progress value={fetching} />
								</span>
							)}
						</span>
					)}
				</div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[15px]">
					<strong className="truncate type-title font-[500]">{project.name}</strong>
					<span className="shrink-0 text-muted type-detail">{project.frames === 0 ? "no frames yet" : `${project.frames} frames`}</span>
				</div>
				<span className="mt-[7px] flex items-center justify-between gap-[12px] text-muted type-detail">
					<span className="shrink-0">{away ? "not on this Mac yet" : project.edited}</span>
					{showPlace && (
						<span className="flex min-w-0 items-center gap-[6px] opacity-80">
							<PlaceGlyph kind={project.place.kind} className="shrink-0" />
							<span className="truncate">{placeWords(project)}</span>
							{project.place.branch && (
								<>
									<BranchGlyph className="h-[11px] w-[11px] shrink-0" />
									<span className="shrink-0">{project.place.branch}</span>
								</>
							)}
						</span>
					)}
				</span>
			</button>
		</motion.article>
	);
};
