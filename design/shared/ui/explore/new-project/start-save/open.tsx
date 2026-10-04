import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Faces } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { FolderIcon } from "shared/ui/spool/icons";
import { FINDINGS, type Finding } from "shared/lib/explore/new-project/places";
import { Kbd } from "./bar";
import { DISK, type Entry, type Item, KNOWN, isLink } from "./fixture";
import { Branch, useKeys } from "./sheet";

/**
 * Opening existing work is two steps in either host: pick a folder, then read what
 * spool found there and take the one thing it offers. The app picks in Finder's
 * own sheet; a web page cannot ask Finder for a path, so spool lists the disk
 * itself in the same place. The reading is the same in both.
 */

const children = (path: string[]): Entry[] => {
	let list = DISK;
	for (const name of path) list = list.find((entry) => entry.name === name)?.children ?? [];
	return list;
};

export const pathOf = (parts: string[]) => `~/${parts.join("/")}`;

/** what spool reads off a folder it is handed */
export function readEntry(parts: string[], entry: Entry, projects: Item[]): Finding {
	const path = pathOf(parts);
	if (entry.finding) return FINDINGS[entry.finding]!;
	const known = projects.find((item) => item.place.path === path);
	if (known) return { kind: "project", path, name: known.name, frames: known.frames, art: known.art, ...(known.place.branch ? { branch: known.place.branch } : {}) };
	const folder = KNOWN.find((item) => item.path === path);
	if (entry.children?.some((child) => child.name === "package.json")) return { kind: "repo", path, name: entry.name, branch: folder?.branch ?? "main", stack: folder?.stack ?? "Node" };
	return { kind: "plain", path, name: entry.name };
}

export interface Pick {
	parts: string[];
	entry: Entry;
}

const mod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;
const typing = (event: KeyboardEvent) => event.target instanceof HTMLInputElement;

/* ── Finder's sheet, in the app ────────────────────────────── */

const FAVORITES = ["code", "Desktop", "Documents", "Downloads"] as const;

/**
 * NSOpenPanel run as a sheet, drawn in macOS's own grey because it is macOS's. The
 * one thing spool adds is the accessory row at the foot, which an open panel is
 * allowed to carry: a field for a git link, since Finder has nowhere to paste one.
 */
export function FinderSheet({ choosing, onPick, onLink, onCancel }: { choosing?: boolean; onPick: (pick: Pick) => void; onLink: (url: string) => void; onCancel: () => void }) {
	const [fav, setFav] = useState<string>("code");
	const [sel, setSel] = useState<string[]>([]);
	const [link, setLink] = useState("");
	const columns = [children([fav]), ...sel.map((_, index) => children([fav, ...sel.slice(0, index + 1)]))];
	const chosen = sel.length > 0 ? children([fav, ...sel.slice(0, -1)]).find((entry) => entry.name === sel[sel.length - 1]) : undefined;
	const canOpen = chosen !== undefined && !chosen.file;
	const open = () => {
		if (isLink(link)) return onLink(link.trim());
		if (chosen && canOpen) onPick({ parts: [fav, ...sel], entry: chosen });
	};

	useKeys((event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			open();
			return;
		}
		if (typing(event)) return;
		const depth = Math.max(sel.length - 1, 0);
		const column = columns[depth] ?? [];
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const at = column.findIndex((entry) => entry.name === sel[depth]);
			const next = column[sel.length === 0 ? 0 : Math.min(Math.max(at + (event.key === "ArrowDown" ? 1 : -1), 0), column.length - 1)];
			if (next) setSel([...sel.slice(0, depth), next.name]);
		} else if (event.key === "ArrowRight" && chosen?.children?.length) {
			event.preventDefault();
			setSel([...sel, chosen.children[0]!.name]);
		} else if (event.key === "ArrowLeft" && sel.length > 1) {
			event.preventDefault();
			setSel(sel.slice(0, -1));
		}
	});

	return (
		<div className="flex h-[452px] flex-col bg-[#1F1F21] font-[system-ui] text-[#E6E6E7] text-[13px]">
			<div className="flex h-[46px] shrink-0 items-center gap-[14px] border-[#0E0E0F] border-b bg-[#2A2A2C] px-[14px]">
				<span className="flex gap-[14px] text-[#8E8E93]">
					<span>‹</span>
					<span className="opacity-50">›</span>
				</span>
				<span className="flex items-center gap-[6px] rounded-[6px] bg-[#3A3A3C] px-[8px] py-[2px] font-medium">
					<MacFolder />
					{sel.length > 0 ? sel[sel.length - 1] : fav}
				</span>
				<span className="ml-auto flex h-[24px] w-[180px] items-center rounded-[6px] bg-[#3A3A3C] px-[8px] text-[#8E8E93]">Search</span>
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="w-[164px] shrink-0 border-[#0E0E0F] border-r bg-[#262628] px-[10px] py-[10px]">
					<p className="px-[8px] pb-[4px] font-semibold text-[#8E8E93] text-[11px]">Favorites</p>
					{["Recents", "Applications", ...FAVORITES].map((name) => {
						const live = (FAVORITES as readonly string[]).includes(name);
						return (
							<button
								key={name}
								type="button"
								disabled={!live}
								onClick={() => {
									setFav(name);
									setSel([]);
								}}
								className={cn("flex h-[26px] w-full items-center gap-[7px] rounded-[5px] px-[8px] text-left", fav === name ? "bg-[#47474A]" : live ? "hover:bg-[#333335]" : "opacity-60")}
							>
								<MacFolder />
								{name}
							</button>
						);
					})}
				</div>
				<div className="flex min-w-0 flex-1 overflow-x-auto">
					{columns.map((list, depth) => (
						<div key={depth} className="w-[210px] shrink-0 border-[#0E0E0F] border-r py-[4px]">
							{list.map((entry) => {
								const on = sel[depth] === entry.name;
								const deepest = depth === sel.length - 1;
								return (
									<button
										key={entry.name}
										type="button"
										onClick={() => setSel([...sel.slice(0, depth), entry.name])}
										onDoubleClick={() => !entry.file && onPick({ parts: [fav, ...sel.slice(0, depth), entry.name], entry })}
										className={cn("mx-[4px] flex h-[24px] w-[calc(100%-8px)] items-center gap-[7px] rounded-[5px] px-[8px] text-left", on ? (deepest ? "bg-[#0A5FD6] text-white" : "bg-[#47474A]") : "", entry.file && "text-[#8E8E93]")}
									>
										{entry.file ? <MacFile /> : <MacFolder />}
										<span className="flex-1 truncate">{entry.name}</span>
										{entry.children && entry.children.length > 0 && <span className={on && deepest ? "text-white" : "text-[#8E8E93]"}>›</span>}
									</button>
								);
							})}
						</div>
					))}
				</div>
			</div>
			<div className="flex h-[54px] shrink-0 items-center gap-[10px] border-[#0E0E0F] border-t bg-[#2A2A2C] px-[14px]">
				<span className="text-[#8E8E93]">Git link</span>
				<input
					value={link}
					onChange={(event) => setLink(event.target.value)}
					placeholder="github.com/…"
					spellCheck={false}
					className="h-[24px] w-[260px] rounded-[5px] border border-[#48484A] bg-[#1F1F21] px-[8px] text-[#E6E6E7] outline-none placeholder:text-[#6E6E73] focus:border-[#0A84FF]"
				/>
				<span className="ml-auto" />
				<button type="button" onClick={onCancel} className="h-[24px] rounded-[6px] bg-[#555557] px-[14px]">
					Cancel
				</button>
				<button type="button" onClick={open} disabled={!canOpen && !isLink(link)} className="h-[24px] rounded-[6px] bg-[#0A84FF] px-[14px] text-white disabled:opacity-40">
					{isLink(link) ? "Clone" : choosing ? "Choose" : "Open"}
				</button>
			</div>
		</div>
	);
}

function MacFolder() {
	return (
		<svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true" className="shrink-0">
			<path d="M0.5 2A1.5 1.5 0 0 1 2 .5h3.6l1.4 1.4h6A1.5 1.5 0 0 1 14.5 3.4V10A1.5 1.5 0 0 1 13 11.5H2A1.5 1.5 0 0 1 .5 10Z" fill="#5BA8F5" />
			<path d="M.5 3.6h14V10A1.5 1.5 0 0 1 13 11.5H2A1.5 1.5 0 0 1 .5 10Z" fill="#7BBEFA" />
		</svg>
	);
}

function MacFile() {
	return (
		<svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true" className="shrink-0">
			<path d="M4 .5h5l2.5 2.5v8.5H4Z" fill="#D8D8DC" />
		</svg>
	);
}

/* ── spool's own browser, in a web page ────────────────────── */

/**
 * In a browser the daemon is the only thing that can see the disk, so spool lists
 * it here, one folder at a time, only as far as you walk it. A folder dropped on
 * the page arrives as files with no path, so a drop lands here with its name.
 */
export function BrowseSheet({ choosing, dropped, onPick, onLink, onCancel }: { choosing?: boolean; dropped?: string | undefined; onPick: (pick: Pick) => void; onLink: (url: string) => void; onCancel: () => void }) {
	const [dir, setDir] = useState<string[]>(["code"]);
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	useEffect(() => field.current?.focus(), []);
	const list = children(dir).filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
	const current = list[Math.min(at, list.length - 1)];
	const go = (next: string[]) => {
		setDir(next);
		setQuery("");
		setAt(0);
	};
	const pick = () => {
		if (isLink(query)) return onLink(query.trim());
		if (current && !current.file) onPick({ parts: [...dir, current.name], entry: current });
	};
	useKeys((event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		} else if (event.key === "Enter") {
			event.preventDefault();
			pick();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setAt((index) => Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), list.length - 1));
		} else if (event.key === "ArrowRight" && current?.children && !query) {
			event.preventDefault();
			go([...dir, current.name]);
		} else if ((event.key === "ArrowLeft" || event.key === "Backspace") && !query && dir.length > 0) {
			event.preventDefault();
			go(dir.slice(0, -1));
		}
	});
	return (
		<div className="flex h-[452px] flex-col">
			<div className="border-border-raised border-b px-[18px] pt-[16px] pb-[12px]">
				<div className="mb-[10px] flex items-baseline justify-between">
					<h2 className="type-title">{choosing ? "Choose a folder" : "Open"}</h2>
					<span className="text-muted type-detail">localhost lists this Mac</span>
				</div>
				{dropped && (
					<p className="mb-[10px] text-muted type-label">
						Chrome gave spool the files in <span className="text-text">{dropped}</span> and not where they live. Find the folder here.
					</p>
				)}
				<div className="flex h-[36px] items-center gap-[2px] rounded-[7px] border border-border-raised bg-bg px-[10px] focus-within:border-muted">
					<button type="button" className="text-muted type-value hover:text-text" onClick={() => go([])}>
						~/
					</button>
					{dir.map((name, index) => (
						<button key={name} type="button" className="text-muted type-value hover:text-text" onClick={() => go(dir.slice(0, index + 1))}>
							{name}/
						</button>
					))}
					<input
						ref={field}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setAt(0);
						}}
						placeholder="filter, or paste a git link"
						spellCheck={false}
						className="ml-[2px] min-w-0 flex-1 bg-transparent text-text outline-none type-value placeholder:text-muted/60"
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-[6px]" role="listbox">
				{isLink(query) ? (
					<div className="flex h-[36px] items-center gap-[10px] rounded-[6px] bg-raised px-[12px] type-value">
						clone {query.trim()}
					</div>
				) : (
					list.map((entry, index) => (
						<button
							key={entry.name}
							type="button"
							role="option"
							aria-selected={index === at}
							disabled={entry.file}
							onMouseEnter={() => setAt(index)}
							onClick={() => (entry.children ? go([...dir, entry.name]) : undefined)}
							onDoubleClick={() => !entry.file && onPick({ parts: [...dir, entry.name], entry })}
							className={cn("flex h-[32px] w-full items-center gap-[10px] rounded-[6px] px-[12px] text-left", index === at && "bg-raised", entry.file && "opacity-45")}
						>
							<FolderIcon className="h-[13px] w-[13px] shrink-0 text-muted" />
							<span className="flex-1 type-value">{entry.name}</span>
							{index === at && !entry.file && <span className="text-muted type-detail">{choosing ? "↵ choose" : "↵ open"}{entry.children?.length ? " · → into" : ""}</span>}
						</button>
					))
				)}
			</div>
			<div className="flex items-center gap-[10px] border-border-raised border-t px-[18px] py-[12px]">
				<p className="flex-1 text-muted type-label">A browser cannot hand spool a folder’s path, so spool lists the folders itself.</p>
				<button type="button" className={HOME_ACTION} onClick={onCancel}>
					Cancel
					<Kbd>esc</Kbd>
				</button>
			</div>
		</div>
	);
}

/* ── the reading ───────────────────────────────────────────── */

export const actionOf = (finding: Finding, projects: Item[]): string => {
	switch (finding.kind) {
		case "project":
			return `Open ${finding.name}`;
		case "inside":
			return `Open ${finding.name}`;
		case "repo":
		case "plain":
			return "Start design/ here";
		case "clone":
			return "Clone and open";
		case "fetch":
			return projects.find((item) => item.name === finding.name)?.onMac ? `Open ${finding.name}` : `Get ${finding.name}`;
	}
};

/** What spool found, said once, and the one thing to do about it. */
export function Reading({
	finding,
	projects,
	progress,
	onAct,
	onBack,
	onCancel,
}: {
	finding: Finding;
	projects: Item[];
	/** 0..1 while a clone or fetch runs */
	progress: number | null;
	onAct: () => void;
	onBack?: (() => void) | undefined;
	onCancel: () => void;
}) {
	useKeys((event) => {
		if (progress !== null) return;
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		} else if (event.key === "Enter") {
			event.preventDefault();
			onAct();
		} else if (mod(event) && event.key.toLowerCase() === "o" && onBack) {
			event.preventDefault();
			onBack();
		}
	});
	const registered = finding.kind === "project" && projects.some((item) => item.place.path === finding.path);
	const art = "art" in finding ? finding.art : null;
	return (
		<div>
			{art && (
				<div className="relative h-[176px] overflow-hidden border-border-raised border-b">
					<ProjectArtwork kind={art} className={cn("h-full w-full", finding.kind === "fetch" && progress === null && "opacity-60 grayscale")} />
				</div>
			)}
			<div className="p-[22px] pt-[18px]">
				<div className="flex items-baseline justify-between gap-[12px]">
					<h2 className="type-heading">{finding.name}</h2>
					<span className="text-muted type-detail">{facts(finding)}</span>
				</div>
				<p className="mt-[4px] text-muted type-detail">{where(finding)}</p>
				{(finding.kind === "repo" || finding.kind === "plain" || finding.kind === "inside") && <Tree finding={finding} />}
				<p className="mt-[14px] text-muted type-label">{says(finding, registered)}</p>
				{progress !== null && (
					<div className="mt-[16px]">
						<div className="h-[2px] overflow-hidden rounded-full bg-raised">
							<div className="h-full bg-text transition-[width] duration-150 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
						</div>
						<p className="mt-[8px] text-muted type-detail">
							{finding.kind === "clone" ? `cloning · ${Math.round(progress * 100)}%` : `fetching · ${Math.round(progress * ("frames" in finding ? finding.frames : 0))} of ${"frames" in finding ? finding.frames : 0} frames`}
						</p>
					</div>
				)}
				<div className="mt-[20px] flex items-center gap-[10px]">
					{onBack ? (
						<button type="button" className="mr-auto text-muted type-control hover:text-text" onClick={onBack}>
							Pick another <Kbd>⌘O</Kbd>
						</button>
					) : (
						<span className="mr-auto" />
					)}
					<button type="button" className={HOME_ACTION} onClick={onCancel} disabled={progress !== null}>
						Cancel
						<Kbd>esc</Kbd>
					</button>
					<button type="button" className={HOME_ACTION_PRIMARY} onClick={onAct} disabled={progress !== null}>
						{actionOf(finding, projects)}
						<kbd className="type-detail text-bg/55">↵</kbd>
					</button>
				</div>
			</div>
		</div>
	);
}

function facts(finding: Finding): string {
	switch (finding.kind) {
		case "project":
		case "inside":
		case "clone":
		case "fetch":
			return `${finding.frames} frames`;
		case "repo":
			return finding.stack;
		case "plain":
			return "no git";
	}
}

function where(finding: Finding): React.ReactNode {
	switch (finding.kind) {
		case "project":
			return `${finding.path}${finding.branch ? ` · ${finding.branch}` : ""}`;
		case "repo":
		case "plain":
		case "inside":
			return finding.path;
		case "clone":
			return `${finding.url} → ${finding.into}`;
		case "fetch":
			return `${finding.team} → ${finding.into}`;
	}
}

function says(finding: Finding, registered: boolean): React.ReactNode {
	switch (finding.kind) {
		case "project":
			return registered ? "Already on Home. Opening it brings its tab forward." : "A spool project that is not on Home yet. Opening it adds it there.";
		case "repo":
			return `A repository with no design/ yet. spool starts one beside the code, on ${finding.branch}, and leaves the code as it is.`;
		case "plain":
			return "A folder with no git and no design/. spool starts design/ inside it.";
		case "inside":
			return `This folder is inside ${finding.name}, which is already on Home. Its design/ is at the repository root, so that is what opens.`;
		case "clone":
			return `A git link. spool clones it into ${finding.into.split("/").slice(0, -1).join("/")} and opens the design/ it finds there.`;
		case "fetch":
			return (
				<span className="flex items-center gap-[10px]">
					<Faces ids={["sam"]} size={20} ring="border-surface" />
					Sam made this in Tidemark. It is not on this Mac yet.
				</span>
			);
	}
}

function Tree({ finding }: { finding: Extract<Finding, { kind: "repo" | "plain" | "inside" }> }) {
	const rows: { name: string; note?: string; lit?: boolean }[] =
		finding.kind === "inside"
			? [
					{ name: "design/", note: `${finding.frames} frames · ${finding.name}`, lit: true },
					{ name: finding.path.slice(finding.root.length + 1), note: "you picked this" },
				]
			: finding.kind === "repo"
				? [{ name: "design/", note: "new", lit: true }, { name: "src/" }, { name: "package.json" }]
				: [{ name: "design/", note: "new", lit: true }, { name: "refs.png" }];
	return (
		<div className="mt-[14px] rounded-[8px] border border-border-raised bg-bg px-[14px] py-[11px]">
			<p className="flex items-center gap-[10px] type-value">
				{finding.kind === "inside" ? finding.root : finding.path}
				{finding.kind === "repo" && <Branch name={finding.branch} />}
			</p>
			{rows.map((row, index) => (
				<p key={row.name} className="flex items-center type-value">
					<span className="w-[22px] text-muted/60">{index === rows.length - 1 ? "└" : "├"}</span>
					<span className={cn("flex-1", row.lit ? "text-text" : "text-muted")}>{row.name}</span>
					{row.note && <span className={cn("type-detail", row.lit ? "text-text" : "text-muted")}>{row.note}</span>}
				</p>
			))}
		</div>
	);
}
