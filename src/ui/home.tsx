import { useEffect, useRef, useState } from "react";
import type { ProjectCard } from "./api";
import { CloseIcon, DotsIcon, SearchIcon } from "./icons";
import { Thumbnail } from "./thumbnail";

/**
 * Home (#13 screens v1): registry cards from the thumbnail caches. The brand
 * lockup in the bar is the door here; the bar's "+" opens the folder picker.
 * A card's own menu forgets the project — hover-revealed, because the registry
 * is the thing you manage least often on a screen that is mostly a door.
 */

export function Home({
	projects,
	forgetting = null,
	onOpenProject,
	onForgetProject,
}: {
	projects: ProjectCard[];
	/** root staged for removal: hidden here, still in the registry until the toast closes */
	forgetting?: string | null;
	onOpenProject: (project: { root: string; name: string }) => void;
	onForgetProject: (project: { root: string; name: string }) => void;
}) {
	const [query, setQuery] = useState("");
	const [menuRoot, setMenuRoot] = useState<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const registered = projects.filter((project) => project.root !== forgetting);
	const needle = query.trim().toLowerCase();
	const visible =
		needle === ""
			? registered
			: registered.filter(
					(project) => project.name.toLowerCase().includes(needle) || project.root.toLowerCase().includes(needle),
				);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenuRoot(null);
				return;
			}
			// "/" is the filter's door, unless something is already taking type
			if (event.key !== "/" || event.target instanceof HTMLInputElement) return;
			event.preventDefault();
			searchRef.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<div className="h-full overflow-y-auto bg-bg">
			<div className="flex flex-col gap-6 px-16 py-12">
				<div className="flex w-full items-center justify-between">
					<h1 className="font-semibold text-lg text-text tracking-tight leading-lg">Projects</h1>
					<div className="flex items-center gap-3.5">
						{projects.length > 0 && (
							<label className="flex h-7 w-[224px] items-center gap-2 rounded-md border border-border bg-surface px-2.5 focus-within:border-border-raised">
								<SearchIcon className="shrink-0 text-muted" />
								<input
									ref={searchRef}
									type="text"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search projects"
									aria-label="Search projects"
									className="w-full bg-transparent font-mono text-text text-xs leading-xs outline-none placeholder:text-muted"
								/>
								{query === "" ? (
									<span className="shrink-0 font-mono text-2xs text-muted leading-none">/</span>
								) : (
									<button
										type="button"
										className="flex shrink-0 items-center text-muted hover:text-text"
										onClick={() => setQuery("")}
										title="Clear search"
									>
										<CloseIcon />
									</button>
								)}
							</label>
						)}
						<span className="font-mono text-muted text-xs leading-xs">
							{needle === "" ? `${registered.length} registered` : `${visible.length} of ${registered.length}`}
						</span>
					</div>
				</div>

				{projects.length === 0 ? (
					<div className="flex flex-col gap-3 py-12">
						<p className="font-medium text-base text-text">No projects yet.</p>
						<p className="font-mono text-muted text-sm">
							Run `spool init` in a product root, or press + above to pick a folder.
						</p>
					</div>
				) : visible.length === 0 && needle !== "" ? (
					<div className="flex flex-col gap-2 py-12">
						<p className="font-medium text-base text-text leading-base">Nothing matches “{query}”</p>
						<p className="font-mono text-muted text-sm leading-xs">Try part of a project name or its path.</p>
					</div>
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-6">
						{visible.map((project) => (
							<ProjectTile
								key={project.root}
								project={project}
								menuOpen={menuRoot === project.root}
								onToggleMenu={() => setMenuRoot((current) => (current === project.root ? null : project.root))}
								onCloseMenu={() => setMenuRoot(null)}
								onOpen={() => onOpenProject({ root: project.root, name: project.name })}
								onForget={() => onForgetProject({ root: project.root, name: project.name })}
							/>
						))}
					</div>
				)}
			</div>

			{menuRoot !== null && (
				// a click anywhere else closes the menu, and never opens a project
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
}: {
	project: ProjectCard;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	onOpen: () => void;
	onForget: () => void;
}) {
	return (
		<div
			// the card is its own stacking context (view-transition-name), so an open
			// menu needs the whole card lifted over the click-away layer, not just itself
			className={`group relative flex flex-col gap-3.5 rounded-lg border bg-surface p-4 transition-colors ${
				menuOpen ? "z-20 border-border-raised" : "border-border hover:border-border-raised"
			}`}
			// named so a removal morphs the grid instead of snapping it (view transitions)
			style={{ viewTransitionName: transitionName(project.root) }}
		>
			<button
				type="button"
				className="absolute inset-0 rounded-lg"
				aria-label={`Open ${project.name}`}
				onClick={onOpen}
			/>

			<div className="pointer-events-none relative grid grid-cols-3 gap-2.5">
				{[0, 1, 2].map((slot) => {
					const cover = project.covers[slot];
					return (
						<div
							key={`${project.root}-slot-${slot}`}
							className="aspect-[123/150] overflow-hidden rounded-md border border-border bg-canvas"
						>
							{cover !== undefined && (
								<Thumbnail
									project={project.name}
									frame={cover.frame}
									cover={cover.cover}
									alt={cover.frame}
									draggable={false}
									// a card slot is a third of a 380 px card: the bottom rung is
									// all it can show, and a home with ten cards holds ten of them
									sizes="120px"
									className="h-full w-full object-cover object-top"
								/>
							)}
						</div>
					);
				})}
			</div>

			<div className="pointer-events-none relative flex flex-col gap-[3px]">
				<div className="flex items-baseline justify-between gap-4">
					<span className="min-w-0 truncate font-semibold text-md text-text tracking-tight leading-sm">
						{project.name}
					</span>
					<span className="shrink-0 font-mono text-muted text-xs leading-xs">
						{project.frameCount} {project.frameCount === 1 ? "frame" : "frames"} ·{" "}
						{relativeTime(project.openedAt)}
					</span>
				</div>
				<span className="truncate font-mono text-muted text-xs leading-xs">{shortPath(project.root)}</span>
			</div>

			{/* the trigger sits over a cover, so it carries a chip to stay legible on a light thumbnail */}
			<button
				type="button"
				className={`absolute top-3 right-3 z-20 flex h-6 w-6 items-center justify-center rounded-sm border border-border-raised bg-raised transition-opacity focus-visible:opacity-100 ${
					menuOpen ? "text-text opacity-100" : "text-muted opacity-0 hover:text-text group-hover:opacity-100"
				}`}
				aria-label={`Manage ${project.name}`}
				onClick={onToggleMenu}
			>
				<DotsIcon />
			</button>

			{menuOpen && (
				<div className="absolute top-11 right-3 z-20 flex w-[196px] animate-menu-in origin-top-right flex-col rounded-md border border-border-raised bg-raised p-unit">
					<MenuItem
						label="Open"
						onClick={() => {
							onCloseMenu();
							onOpen();
						}}
					/>
					<MenuItem
						label="Copy path"
						onClick={() => {
							onCloseMenu();
							void navigator.clipboard?.writeText(project.root);
						}}
					/>
					<div className="mx-auto my-unit h-px w-[172px] bg-border-raised" />
					<MenuItem
						label="Remove from spool"
						onClick={() => {
							onCloseMenu();
							withViewTransition(onForget);
						}}
					/>
				</div>
			)}
		</div>
	);
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			className="flex h-[30px] items-center rounded-sm px-3 text-left text-base text-text leading-[14px] hover:bg-surface"
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

function shortPath(root: string): string {
	// the daemon is per-machine; a homedir prefix reads better shortened
	const match = root.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
	return match === null ? root : `~${match[1] ?? ""}`;
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
