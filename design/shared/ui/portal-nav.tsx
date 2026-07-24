import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * Shared substrate for the portal-nav explorations. A small mock of the spool
 * canvas: dark frame boxes with mono labels, and the outbound link graph that
 * the three variants each reveal differently. No knowledge of spool here — the
 * variants own their interaction models.
 */

export type PageName = "session" | "dialogs" | "tools" | "gates";

export interface FrameNode {
	name: string;
	page: PageName;
	/** Present only when the frame sits on the currently viewed page. */
	pos?: { x: number; y: number };
	links: string[];
}

export const FRAME_W = 178;
export const FRAME_H = 110;
export const LABEL_H = 16;
export const LABEL_GAP = 6;
export const RECT_TOP = LABEL_H + LABEL_GAP;
export const CURRENT_PAGE: PageName = "session";

/** The current-page cluster plus the off-page destinations it links into. */
export const FRAMES: FrameNode[] = [
	{
		name: "home",
		page: "session",
		pos: { x: 96, y: 92 },
		links: ["session", "home--commands", "home--mentions"],
	},
	{ name: "home--commands", page: "session", pos: { x: 324, y: 92 }, links: ["command-palette", "question"] },
	{ name: "home--mentions", page: "session", pos: { x: 552, y: 92 }, links: ["session-list", "session"] },
	{
		name: "session",
		page: "session",
		pos: { x: 96, y: 322 },
		links: [
			"session--shell",
			"session--wide",
			"command-palette",
			"diff-viewer",
			"model-select",
			"permission",
			"provider-connect",
			"question",
			"session-list",
			"theme-select",
		],
	},
	{
		name: "session--shell",
		page: "session",
		pos: { x: 352, y: 322 },
		links: [
			"session",
			"session--wide",
			"command-palette",
			"model-select",
			"provider-connect",
			"permission",
			"question",
			"theme-select",
		],
	},
	{
		name: "session--wide",
		page: "session",
		pos: { x: 608, y: 322 },
		links: ["session", "command-palette", "model-select", "session-list"],
	},
	// Off-page destinations — no canvas position, they live on other pages.
	{ name: "command-palette", page: "dialogs", links: [] },
	{ name: "model-select", page: "dialogs", links: [] },
	{ name: "provider-connect", page: "dialogs", links: [] },
	{ name: "session-list", page: "dialogs", links: [] },
	{ name: "theme-select", page: "dialogs", links: [] },
	{ name: "diff-viewer", page: "tools", links: [] },
	{ name: "permission", page: "gates", links: [] },
	{ name: "question", page: "gates", links: [] },
];

const BY_NAME = new Map(FRAMES.map((f) => [f.name, f]));

export function byName(name: string): FrameNode {
	const f = BY_NAME.get(name);
	if (!f) throw new Error(`unknown frame ${name}`);
	return f;
}

export function outbound(name: string): FrameNode[] {
	return byName(name).links.map(byName);
}

/** Distinct outbound targets, self-links dropped — the navigable set. */
export function connectionsOf(name: string): FrameNode[] {
	return outbound(name).filter((t) => t.name !== name);
}

export const ON_CANVAS = FRAMES.filter((f) => f.pos);

export interface PageGroup {
	page: PageName;
	items: FrameNode[];
}

/** Outbound targets folded into page groups, current page first. */
export function groupByPage(targets: FrameNode[]): PageGroup[] {
	const groups: PageGroup[] = [];
	for (const page of PAGE_ORDER) {
		const items = targets.filter((t) => t.page === page);
		if (items.length) groups.push({ page, items });
	}
	return groups;
}

export function pageLabel(page: PageName): string {
	return page === CURRENT_PAGE ? "this page" : page;
}

/** The dark rect body of a frame: a quiet thumbnail, never a wireframe. */
export function FrameGlyph() {
	return (
		<div className="pointer-events-none absolute inset-0 p-2.5">
			<div className="h-1 w-9 rounded-full bg-border-raised" />
			<div className="mt-3.5 space-y-1.5">
				<div className="h-[3px] w-3/4 rounded-full bg-border-raised/70" />
				<div className="h-[3px] w-1/2 rounded-full bg-border-raised/45" />
				<div className="h-[3px] w-2/3 rounded-full bg-border-raised/35" />
			</div>
		</div>
	);
}

/** Bare frame box, no label, no positioning — for variants that lay out labels themselves. */
export function FrameBox({
	selected = false,
	ringed = false,
	dimmed = false,
	onSelect,
	className,
	style,
}: {
	selected?: boolean;
	ringed?: boolean;
	dimmed?: boolean;
	onSelect?: () => void;
	className?: string;
	style?: React.CSSProperties;
}) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onSelect?.();
			}}
			style={style}
			className={cn(
				"relative block overflow-hidden rounded-md border bg-surface text-left transition-colors duration-150",
				selected ? "border-thread" : ringed ? "border-border-raised" : "border-border hover:border-border-raised",
				dimmed && "opacity-40",
				className,
			)}
		>
			<FrameGlyph />
			{ringed && !selected ? (
				<span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-thread/35" />
			) : null}
		</button>
	);
}

/** The four thread corner handles spool draws on a selected frame. */
export function SelectionCorners() {
	return (
		<>
			{["-left-[5px] -top-[5px]", "-right-[5px] -top-[5px]", "-bottom-[5px] -left-[5px]", "-bottom-[5px] -right-[5px]"].map(
				(pos) => (
					<span
						key={pos}
						className={cn(
							"pointer-events-none absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
							pos,
						)}
					/>
				),
			)}
		</>
	);
}

/**
 * The unified connections list from the B direction: one filterable set of a
 * frame's outbound links, grouped by page, same-page and cross-page identical.
 * Shared so the inspector rail and any other home render it the same way.
 */
export function ConnectionsList({
	source,
	onJump,
}: {
	source: string;
	onJump: (target: FrameNode) => void;
}) {
	const [query, setQuery] = useState("");
	const links = connectionsOf(source);
	const q = query.trim().toLowerCase();
	const filtered = q ? links.filter((t) => t.name.includes(q) || t.page.includes(q)) : links;
	const groups = groupByPage(filtered);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-3 pt-3 pb-2">
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="filter links"
					className="w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-2xs text-text leading-3 placeholder:text-muted/60 focus:border-border-raised focus:outline-none"
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
				{groups.map((group) => (
					<div key={group.page} className="pt-2">
						<div className="flex items-center justify-between px-1 pb-1.5">
							<span
								className={cn(
									"font-mono text-2xs leading-3",
									group.page === CURRENT_PAGE ? "text-text/80" : "text-muted/80",
								)}
							>
								{pageLabel(group.page)}
							</span>
							<span className="font-mono text-2xs text-muted/50 leading-3">{group.items.length}</span>
						</div>
						<div className="space-y-[2px]">
							{group.items.map((t) => (
								<button
									key={t.name}
									type="button"
									onClick={() => onJump(t)}
									className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface"
								>
									<span className="text-thread/70 text-xs leading-3">→</span>
									<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
										{t.name}
									</span>
									{t.pos ? <span className="font-mono text-2xs text-muted/40 leading-3">on-canvas</span> : null}
								</button>
							))}
						</div>
					</div>
				))}
				{groups.length === 0 ? (
					<div className="px-2 pt-6 text-center font-mono text-2xs text-muted/60 leading-3">no links match</div>
				) : null}
			</div>
		</div>
	);
}

/** Label row rendered above a frame box, mono, thread when selected. */
export function FrameLabel({ name, selected = false, dimmed = false }: { name: string; selected?: boolean; dimmed?: boolean }) {
	return (
		<div className="flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
			<span className={cn("text-2xs", selected ? "text-thread" : "text-muted/70")}>▸</span>
			<span className={cn(selected ? "text-thread" : dimmed ? "text-muted/50" : "text-muted")}>{name}</span>
		</div>
	);
}

/* --- shell-rework substrate: tree-as-page-switcher, page scenes --- */

export const PAGE_ORDER: PageName[] = ["session", "dialogs", "tools", "gates"];

export function framesByPage(page: PageName): FrameNode[] {
	return FRAMES.filter((f) => f.page === page);
}

function byPageThenName(a: FrameNode, b: FrameNode): number {
	return PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page) || a.name.localeCompare(b.name);
}

/** Where each page's frames sit on its own canvas — every page has a scene. */
export const PAGE_SCENES: Record<PageName, { name: string; x: number; y: number }[]> = {
	session: [
		{ name: "home", x: 96, y: 92 },
		{ name: "home--commands", x: 324, y: 92 },
		{ name: "home--mentions", x: 552, y: 92 },
		{ name: "session", x: 96, y: 322 },
		{ name: "session--shell", x: 352, y: 322 },
		{ name: "session--wide", x: 608, y: 322 },
	],
	dialogs: [
		{ name: "command-palette", x: 108, y: 128 },
		{ name: "model-select", x: 372, y: 128 },
		{ name: "provider-connect", x: 636, y: 128 },
		{ name: "session-list", x: 108, y: 358 },
		{ name: "theme-select", x: 372, y: 358 },
	],
	tools: [{ name: "diff-viewer", x: 108, y: 128 }],
	gates: [
		{ name: "permission", x: 108, y: 128 },
		{ name: "question", x: 372, y: 128 },
	],
};

/** The active page's frames as dark boxes, quiet by default, selectable. */
export function CanvasScene({
	page,
	selected,
	onSelectFrame,
	overlay,
}: {
	page: PageName;
	selected: string | null;
	onSelectFrame: (name: string) => void;
	overlay?: (name: string) => React.ReactNode;
}) {
	return (
		<>
			{PAGE_SCENES[page].map(({ name, x, y }) => {
				const isSelected = name === selected;
				return (
					<div key={name} className="absolute flex flex-col gap-1.5" style={{ left: x, top: y, width: FRAME_W }}>
						<FrameLabel name={name} selected={isSelected} />
						<div className="relative">
							<FrameBox
								selected={isSelected}
								onSelect={() => onSelectFrame(name)}
								style={{ width: FRAME_W, height: FRAME_H }}
							/>
							{isSelected ? <SelectionCorners /> : null}
							{isSelected ? overlay?.(name) : null}
						</div>
					</div>
				);
			})}
		</>
	);
}

/**
 * The left tree standing in for the page tab bar: page folders switch the
 * active page, chevrons reveal their frames. `frameExtra` lets a caller nest
 * more under the selected frame's row (the links group in Liam's split).
 */
export function PageTree({
	activePage,
	expanded,
	selected,
	onTogglePage,
	onSwitchPage,
	onSelectFrame,
	frameExtra,
}: {
	activePage: PageName;
	expanded: Record<PageName, boolean>;
	selected: string | null;
	onTogglePage: (page: PageName) => void;
	onSwitchPage: (page: PageName) => void;
	onSelectFrame: (name: string) => void;
	frameExtra?: (frame: FrameNode) => React.ReactNode;
}) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto py-2">
			{PAGE_ORDER.map((page) => {
				const frames = framesByPage(page);
				const isActive = page === activePage;
				return (
					<div key={page}>
						<div
							className={cn(
								"group relative flex h-8 items-center pr-1.5 hover:bg-surface",
								isActive && "bg-surface",
							)}
						>
							{isActive ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
							<button
								type="button"
								aria-label={expanded[page] ? `Collapse ${page}` : `Expand ${page}`}
								onClick={() => onTogglePage(page)}
								className="flex h-8 w-6 shrink-0 items-center justify-center"
							>
								<ChevronIcon open={expanded[page]} className="h-2.5 w-2.5" />
							</button>
							<button
								type="button"
								onClick={() => onSwitchPage(page)}
								className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left"
							>
								<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-thread")} />
								<span
									className={cn(
										"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
										isActive ? "text-text" : "text-muted",
									)}
								>
									{page}
								</span>
							</button>
							<span className="font-mono text-2xs text-muted/60 leading-3">{frames.length}</span>
						</div>

						<TreeGroup open={expanded[page]}>
							<div className="relative pb-0.5">
								<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
								{frames.map((frame) => {
									const isSelected = frame.name === selected;
									return (
										<div key={frame.name}>
											<div className={cn("group/row relative flex h-7 items-center hover:bg-surface", isSelected && "bg-surface")}>
												<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
												<button
													type="button"
													onClick={() => onSelectFrame(frame.name)}
													className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 pl-[34px] text-left"
												>
													<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", isSelected && "text-thread")} />
													<span
														className={cn(
															"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
															isSelected ? "text-text" : "text-muted",
														)}
													>
														{frame.name}
													</span>
													<span className="pr-1 font-mono text-2xs text-muted/50 leading-3 opacity-0 transition-opacity group-hover/row:opacity-100">
														frame.tsx
													</span>
												</button>
											</div>
											{isSelected ? frameExtra?.(frame) : null}
										</div>
									);
								})}
							</div>
						</TreeGroup>
					</div>
				);
			})}
		</div>
	);
}

/** The nested "links" group for a selected frame's tree row — Liam's split. */
export function FrameLinksGroup({ source, onJump }: { source: string; onJump: (target: FrameNode) => void }) {
	const links = [...connectionsOf(source)].sort(byPageThenName);
	if (links.length === 0) return null;
	return (
		<TreeGroup open>
			<div className="relative pb-1">
				<span className="absolute top-0 bottom-1 left-[42px] w-px bg-thread/40" />
				<div className="flex h-6 items-center gap-1.5 pl-[52px] font-mono text-2xs text-muted leading-3">
					<span className="text-thread">→</span>
					<span>links</span>
					<span className="text-muted/50">{links.length}</span>
				</div>
				{links.map((t) => (
					<div key={t.name} className="relative flex h-7 items-center hover:bg-surface">
						<span className="absolute top-1/2 left-[42px] h-px w-2.5 bg-thread/40" />
						<button
							type="button"
							onClick={() => onJump(t)}
							className="group flex h-7 w-full min-w-0 items-center gap-2 pr-3 pl-[58px] text-left"
						>
							<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
								{t.name}
							</span>
							<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{pageLabel(t.page)}</span>
						</button>
					</div>
				))}
			</div>
		</TreeGroup>
	);
}

export function TreeGroup({ children, open }: { children: React.ReactNode; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="group"
					initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
					animate={
						reduceMotion
							? { opacity: 1 }
							: {
									height: "auto",
									opacity: 1,
									transition: {
										height: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					exit={
						reduceMotion
							? { opacity: 0 }
							: {
									height: 0,
									opacity: 0,
									transition: {
										height: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.09, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					className="overflow-hidden"
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

export function ChevronIcon({ className, open }: { className?: string; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.svg
			viewBox="0 0 12 12"
			className={cn("origin-center text-muted", className)}
			fill="none"
			aria-hidden="true"
			animate={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
			transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
		>
			<path d="m4 2.5 3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</motion.svg>
	);
}

export function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={cn("text-muted", className)} fill="none" aria-hidden="true">
			<path d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}
