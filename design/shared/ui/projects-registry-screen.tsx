import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CloseIcon, DotsIcon, SearchIcon } from "./spool-icons";
import { SpoolShell } from "./spool-shell";

/**
 * Projects registry with per-card management: a menu that unregisters a project
 * and a filter over the list. Two axes vary across the frames on this page:
 * where the menu trigger lives, and how removal asks for permission.
 */

export type MenuTrigger = "corner" | "meta";
export type RemovalModel = "undo" | "confirm";

interface Project {
	name: string;
	path: string;
	count: string;
	covers: readonly CoverKind[];
}

type CoverKind = "coffee" | "canvas" | "doc" | "empty";

const projects: readonly Project[] = [
	{
		name: "issue-76-coffee-transition",
		path: "~/projects/spool.lanes/issue-76-coffee-transition",
		count: "78 frames · today",
		covers: ["coffee", "coffee", "coffee"],
	},
	{
		name: "spool",
		path: "~/projects/spool",
		count: "73 frames · today",
		covers: ["canvas", "canvas", "coffee"],
	},
	{
		name: "opencode-spool",
		path: "~/projects/opencode-spool",
		count: "43 frames · yesterday",
		covers: ["empty", "empty", "empty"],
	},
	{
		name: "spool-terminal",
		path: "~/projects/spool-terminal",
		count: "2 frames · 2 days ago",
		covers: ["empty", "empty", "empty"],
	},
	{
		name: "notaker",
		path: "~/projects/notaker",
		count: "7 frames · 2 days ago",
		covers: ["doc", "doc", "doc"],
	},
	{
		name: "kaffe",
		path: "~/projects/kaffe",
		count: "8 frames · last week",
		covers: ["coffee", "coffee", "empty"],
	},
	{
		name: "tretolv",
		path: "~/projects/tretolv",
		count: "23 frames · last week",
		covers: ["doc", "coffee", "doc"],
	},
	{
		name: "droneit",
		path: "~/projects/droneit",
		count: "12 frames · 2 weeks ago",
		covers: ["canvas", "empty", "empty"],
	},
	{
		name: "inwall",
		path: "~/work/inwall",
		count: "4 frames · Jun 30",
		covers: ["doc", "empty", "empty"],
	},
];

interface ProjectsRegistryScreenProps {
	/** frame the first card opens, so the map shows the door out of home */
	canvasTarget?: string;
	menuTrigger?: MenuTrigger;
	removal?: RemovalModel;
}

export function ProjectsRegistryScreen({
	canvasTarget,
	menuTrigger = "corner",
	removal = "undo",
}: ProjectsRegistryScreenProps) {
	const [query, setQuery] = useState("");
	const [openMenu, setOpenMenu] = useState<string | null>(null);
	const [removed, setRemoved] = useState<readonly string[]>([]);
	const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
	const [undone, setUndone] = useState<Project | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpenMenu(null);
				setPendingRemoval(null);
				return;
			}
			if (event.key === "/" && document.activeElement !== searchRef.current) {
				event.preventDefault();
				searchRef.current?.focus();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (undone === null) return;
		const timer = window.setTimeout(() => setUndone(null), 6000);
		return () => window.clearTimeout(timer);
	}, [undone]);

	const needle = query.trim().toLowerCase();
	const visible = projects.filter(
		(project) =>
			!removed.includes(project.name) &&
			(needle === "" ||
				project.name.toLowerCase().includes(needle) ||
				project.path.toLowerCase().includes(needle)),
	);
	const registered = projects.length - removed.length;

	function remove(project: Project) {
		setOpenMenu(null);
		setPendingRemoval(null);
		setRemoved((prev) => [...prev, project.name]);
		if (removal === "undo") setUndone(project);
	}

	function askToRemove(project: Project) {
		if (removal === "confirm") {
			setOpenMenu(null);
			setPendingRemoval(project);
			return;
		}
		remove(project);
	}

	return (
		<SpoolShell showCanvasControls={false} tabs={["spool", "notaker"]}>
			<div className="relative h-full overflow-hidden bg-bg">
				<div className="flex h-full flex-col gap-6 overflow-y-auto px-16 py-12">
					<div className="flex w-full shrink-0 items-center justify-between">
						<h1 className="font-semibold text-lg tracking-tight leading-lg">Projects</h1>
						<div className="flex items-center gap-3.5">
							<label className="flex h-7 w-[224px] items-center gap-2 rounded-md border border-border bg-surface px-2.5 transition-colors focus-within:border-border-raised">
								<SearchIcon className="h-3 w-3 shrink-0 text-muted" />
								<input
									ref={searchRef}
									type="text"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search projects"
									className="w-full bg-transparent font-mono text-text text-xs leading-xs outline-none placeholder:text-muted"
								/>
								{query === "" ? (
									<span className="shrink-0 font-mono text-2xs text-muted leading-none">/</span>
								) : (
									<button
										type="button"
										onClick={() => setQuery("")}
										className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted hover:text-text"
										aria-label="Clear search"
									>
										<CloseIcon className="h-2.5 w-2.5" />
									</button>
								)}
							</label>
							<span className="min-w-[76px] text-right font-mono text-muted text-xs leading-xs">
								{needle === "" ? `${registered} registered` : `${visible.length} of ${registered}`}
							</span>
						</div>
					</div>

					{visible.length === 0 ? (
						<div className="flex flex-col gap-2 py-16">
							<p className="font-medium text-base text-text leading-base">Nothing matches “{query}”</p>
							<p className="font-mono text-muted text-sm leading-xs">
								Try part of a project name or its path.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-6">
							<AnimatePresence initial={false} mode="popLayout">
								{visible.map((project, index) => (
									<ProjectCard
										key={project.name}
										project={project}
										goTarget={index === 0 ? canvasTarget : undefined}
										menuTrigger={menuTrigger}
										menuOpen={openMenu === project.name}
										onToggleMenu={() =>
											setOpenMenu((prev) => (prev === project.name ? null : project.name))
										}
										onRemove={() => askToRemove(project)}
									/>
								))}
							</AnimatePresence>
						</div>
					)}
				</div>

				{openMenu === null ? null : (
					// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on the document
					<div className="absolute inset-0 z-20" onClick={() => setOpenMenu(null)} />
				)}

				<AnimatePresence>
					{undone === null ? null : (
						<motion.div
							key={undone.name}
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 12 }}
							transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
							className="absolute bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 overflow-hidden rounded-md border border-border-raised bg-raised py-2.5 pr-3.5 pl-4"
						>
							<span className="text-base leading-base">
								Removed <span className="font-medium">{undone.name}</span>
							</span>
							<span className="font-mono text-muted text-xs leading-xs">files stay on disk</span>
							<span className="h-4 w-px bg-border-raised" />
							<button
								type="button"
								onClick={() => {
									setRemoved((prev) => prev.filter((name) => name !== undone.name));
									setUndone(null);
								}}
								className="font-medium text-base text-thread leading-base"
							>
								Undo
							</button>
							<span className="font-mono text-muted text-xs leading-xs">⌘Z</span>
							<motion.span
								initial={{ scaleX: 1 }}
								animate={{ scaleX: 0 }}
								transition={{ duration: 6, ease: "linear" }}
								className="absolute bottom-0 left-0 h-px w-full origin-left bg-thread"
							/>
						</motion.div>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{pendingRemoval === null ? null : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.16 }}
							className="absolute inset-0 z-40 flex items-center justify-center bg-bg/72"
						>
							<motion.div
								initial={{ opacity: 0, scale: 0.97, y: 6 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.98, y: 4 }}
								transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
								className="flex w-[400px] flex-col gap-5 rounded-lg border border-border-raised bg-raised p-5"
							>
								<div className="flex flex-col gap-2">
									<h2 className="font-semibold text-md tracking-tight leading-sm">
										Remove {pendingRemoval.name} from spool?
									</h2>
									<p className="text-muted text-base leading-base">
										spool forgets the folder. Your files stay exactly where they are, and you can open
										it again whenever you want.
									</p>
									<span className="font-mono text-muted text-xs leading-xs">{pendingRemoval.path}</span>
								</div>
								<div className="flex items-center justify-end gap-2">
									<button
										type="button"
										onClick={() => setPendingRemoval(null)}
										className="flex h-8 items-center rounded-md border border-border-raised px-3.5 text-base leading-none"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={() => remove(pendingRemoval)}
										className="flex h-8 items-center rounded-md bg-thread px-3.5 font-medium text-base text-on-thread leading-none"
									>
										Remove
									</button>
								</div>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</SpoolShell>
	);
}

function ProjectCard({
	project,
	goTarget,
	menuTrigger,
	menuOpen,
	onToggleMenu,
	onRemove,
}: {
	project: Project;
	goTarget?: string;
	menuTrigger: MenuTrigger;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onRemove: () => void;
}) {
	// the corner trigger lands on top of a cover, so it always carries a chip to
	// stay legible over a light thumbnail; the meta trigger sits on the card
	const dots = (
		<button
			type="button"
			onClick={onToggleMenu}
			aria-label={`Manage ${project.name}`}
			className={cn(
				"pointer-events-auto flex items-center justify-center rounded-sm border transition-[opacity,color,background-color] duration-150 focus-visible:opacity-100",
				menuTrigger === "corner"
					? "h-6 w-6 border-border-raised bg-raised"
					: "h-5 w-5 border-transparent",
				menuOpen ? "text-text opacity-100" : "text-muted opacity-0 hover:text-text group-hover:opacity-100",
			)}
		>
			<DotsIcon className="h-3.5 w-3.5" />
		</button>
	);

	return (
		<motion.div
			layout
			initial={{ opacity: 0, scale: 0.97 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.96 }}
			transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
			className={cn(
				"group relative flex flex-col gap-3.5 rounded-lg border bg-surface p-4 transition-colors duration-150",
				menuOpen ? "border-border-raised" : "border-border hover:border-border-raised",
			)}
		>
			<button
				type="button"
				data-go={goTarget}
				aria-label={`Open ${project.name}`}
				className="absolute inset-0 z-0 rounded-lg"
			/>

			<div className="pointer-events-none relative z-10 grid grid-cols-3 gap-2.5">
				{project.covers.map((cover, slot) => (
					<Cover key={`${project.name}-${slot}`} kind={cover} />
				))}
			</div>

			<div className="pointer-events-none relative z-10 flex flex-col gap-[3px]">
				<div className="flex h-[18px] items-center justify-between">
					<span className="min-w-0 truncate font-semibold text-md tracking-tight leading-sm">
						{project.name}
					</span>
					{menuTrigger === "meta" ? (
						<span className="relative flex h-[18px] shrink-0 items-center justify-end whitespace-nowrap pl-4">
							<span
								className={cn(
									"font-mono text-muted text-xs leading-xs transition-opacity duration-150",
									menuOpen ? "opacity-0" : "group-hover:opacity-0",
								)}
							>
								{project.count}
							</span>
							<span className="absolute right-0 flex h-[18px] w-6 items-center justify-end">{dots}</span>
						</span>
					) : (
						<span className="font-mono text-muted text-xs leading-xs">{project.count}</span>
					)}
				</div>
				<span className="truncate font-mono text-muted text-xs leading-xs">{project.path}</span>
			</div>

			{menuTrigger === "corner" ? (
				<span className="pointer-events-none absolute top-3 right-3 z-30 flex h-6 w-6 items-center justify-center">
					{dots}
				</span>
			) : null}

			{menuOpen ? (
				<motion.div
					initial={{ opacity: 0, scale: 0.97, y: menuTrigger === "corner" ? -4 : 4 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
					className={cn(
						"absolute right-3 z-30 flex w-[196px] origin-top-right flex-col rounded-md border border-border-raised bg-raised p-unit",
						menuTrigger === "corner" ? "top-11" : "bottom-11",
					)}
				>
					<MenuItem label="Open" />
					<MenuItem label="Open in editor" />
					<MenuItem label="Copy path" />
					<div className="mx-auto my-unit h-px w-[172px] bg-border-raised" />
					<MenuItem label="Remove from spool" onClick={onRemove} />
				</motion.div>
			) : null}
		</motion.div>
	);
}

function MenuItem({ label, onClick }: { label: string; onClick?: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-[30px] items-center rounded-sm px-3 text-left text-base leading-[14px] hover:bg-surface"
		>
			{label}
		</button>
	);
}

function Cover({ kind }: { kind: CoverKind }) {
	if (kind === "empty") {
		return <div className="aspect-[123/150] w-full rounded-md border border-border bg-canvas" />;
	}
	if (kind === "coffee") {
		return (
			<div className="aspect-[123/150] w-full overflow-hidden rounded-md border border-[#E4E4E7] bg-[#FEFEFE] p-2">
				<div className="flex h-full flex-col gap-1.5">
					<span className="h-[7px] w-11 rounded-[2px] bg-[#17171A]" />
					<span className="h-[18px] w-full rounded-xs bg-[#EFEFF1]" />
					<span className="h-[18px] w-full rounded-xs bg-[#EFEFF1]" />
					<span className="mt-auto h-[9px] w-full rounded-[2px] bg-[#17171A]" />
				</div>
			</div>
		);
	}
	if (kind === "canvas") {
		return (
			<div className="relative aspect-[123/150] w-full overflow-hidden rounded-md border border-border bg-canvas">
				<span className="absolute top-3 left-2.5 h-7 w-[26px] rounded-xs border border-border-raised bg-surface" />
				<span className="absolute top-8 right-2.5 h-9 w-[30px] rounded-xs border border-border-raised bg-surface" />
				<svg viewBox="0 0 60 74" className="absolute inset-0 h-full w-full" aria-hidden="true">
					<path
						d="M22 20c8 2 10 10 18 14"
						fill="none"
						stroke="var(--color-thread)"
						strokeWidth="1"
						strokeLinecap="round"
					/>
				</svg>
			</div>
		);
	}
	return (
		<div className="aspect-[123/150] w-full overflow-hidden rounded-md border border-border bg-canvas p-2">
			<div className="flex flex-col gap-[5px]">
				<span className="h-[6px] w-8 rounded-[2px] bg-border-raised" />
				<span className="h-[4px] w-full rounded-[2px] bg-border" />
				<span className="h-[4px] w-full rounded-[2px] bg-border" />
				<span className="h-[4px] w-3/4 rounded-[2px] bg-border" />
				<span className="mt-1.5 h-[6px] w-[22px] rounded-[2px] bg-border-raised" />
				<span className="h-[4px] w-full rounded-[2px] bg-border" />
				<span className="h-[4px] w-5/6 rounded-[2px] bg-border" />
			</div>
		</div>
	);
}
