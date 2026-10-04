import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { BackIcon, ChevronIcon, FolderIcon } from "shared/ui/spool/icons";
import { DISK, MARKS, nameOf } from "./fixture";
import { EASE, Kbd } from "./parts";

/**
 * Two skins on one way of choosing a folder. In the Mac app spool asks macOS, and
 * the Finder's own sheet drops from the top of the window. In a web page there is
 * no Finder to ask and a dropped folder carries no path, so spool lists folders
 * itself, one at a time, the way the shipped picker already does.
 *
 * Both take the same gestures: a click selects, a double click or → goes in,
 * ← or Back goes up, ↵ chooses what is selected (or the folder you are in).
 */

const parentOf = (path: string) => (path === "~" ? null : path.slice(0, path.lastIndexOf("/")) || "~");

function useFolders(start: string, onChoose: (path: string) => void, onCancel: () => void) {
	const [at, setAt] = useState(start in DISK ? start : "~");
	const [picked, setPicked] = useState<string | null>(null);
	const rows = (DISK[at] ?? []).map((name) => `${at}/${name}`);
	const enter = (path: string) => {
		if (!(path in DISK)) return;
		setAt(path);
		setPicked(null);
	};
	const up = () => {
		const parent = parentOf(at);
		if (parent) {
			setPicked(at);
			setAt(parent);
		}
	};
	const choose = () => onChoose(picked ?? at);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			const typing = event.target instanceof HTMLInputElement && event.target.value !== "";
			if (typing && event.key !== "Escape") return;
			const index = picked ? rows.indexOf(picked) : -1;
			if (event.key === "ArrowDown") setPicked(rows[Math.min(rows.length - 1, index + 1)] ?? null);
			else if (event.key === "ArrowUp") setPicked(rows[Math.max(0, index - 1)] ?? null);
			else if (event.key === "ArrowRight" && picked) enter(picked);
			else if (event.key === "ArrowLeft") up();
			else if (event.key === "Enter") choose();
			else if (event.key === "Escape") onCancel();
			else return;
			event.preventDefault();
			event.stopPropagation();
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	});
	return { at, picked, rows, enter, up, choose, setPicked, setAt };
}

/* ── the Mac app: macOS's open panel ───────────────────────── */

const FAVOURITES = [
	{ label: "ada", path: "~" },
	{ label: "code", path: "~/code" },
	{ label: "Desktop", path: "~/Desktop" },
	{ label: "Documents", path: "~/Documents" },
	{ label: "Downloads", path: "~/Downloads" },
];

/**
 * NSOpenPanel as a sheet on spool's window. It is the OS's surface, so it wears
 * the OS's greys and its blue default button, never spool's tokens.
 */
export function FinderSheet({
	start = "~/code",
	prompt = "Open",
	onChoose,
	onCancel,
}: {
	start?: string;
	prompt?: string;
	onChoose: (path: string) => void;
	onCancel: () => void;
}) {
	const folders = useFolders(start, onChoose, onCancel);
	return (
		<motion.div
			className="fixed inset-0 z-50 flex justify-center bg-black/25"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.14 }}
		>
			<motion.div
				className="flex h-[430px] w-[720px] flex-col overflow-hidden rounded-b-[10px] border border-[#3D3D3F] border-t-0 bg-[#2A2A2C] font-['-apple-system','SF_Pro_Text',system-ui] text-[13px] text-[#E6E6E7]"
				initial={{ y: -430 }}
				animate={{ y: 0 }}
				exit={{ y: -430, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
				transition={{ duration: 0.26, ease: EASE }}
			>
				<div className="flex h-[46px] shrink-0 items-center gap-[10px] border-[#1E1E20] border-b bg-[#323234] px-[12px]">
					<button type="button" onClick={folders.up} className="grid h-[24px] w-[26px] place-items-center rounded-[5px] text-[#9A9A9E] hover:bg-[#3E3E41]" aria-label="Back">
						<BackIcon className="h-[12px] w-[12px]" />
					</button>
					<span className="flex h-[24px] items-center gap-[6px] rounded-[5px] bg-[#3E3E41] px-[9px]">
						<FolderIcon className="h-[13px] w-[13px] text-[#57A9F7]" />
						{nameOf(folders.at) === "~" ? "ada" : nameOf(folders.at)}
						<ChevronIcon open className="h-[8px] w-[8px] text-[#9A9A9E]" />
					</span>
					<span className="ml-auto h-[24px] w-[170px] rounded-[5px] bg-[#1F1F21] px-[9px] leading-[24px] text-[#76767A]">Search</span>
				</div>
				<div className="flex min-h-0 flex-1">
					<aside className="w-[160px] shrink-0 border-[#1E1E20] border-r bg-[#262628] px-[8px] py-[10px]">
						<p className="px-[8px] pb-[4px] text-[11px] font-semibold text-[#7C7C80]">Favourites</p>
						{FAVOURITES.map((place) => (
							<button
								key={place.path}
								type="button"
								onClick={() => folders.enter(place.path)}
								className={cn("flex h-[26px] w-full items-center gap-[8px] rounded-[5px] px-[8px] text-left", folders.at === place.path && "bg-[#3A3A3D]")}
							>
								<FolderIcon className="h-[13px] w-[13px] text-[#57A9F7]" />
								{place.label}
							</button>
						))}
					</aside>
					<div className="min-w-0 flex-1 overflow-auto py-[4px]">
						{folders.rows.map((path, index) => (
							<button
								key={path}
								type="button"
								onClick={() => folders.setPicked(path)}
								onDoubleClick={() => folders.enter(path)}
								className={cn(
									"flex h-[24px] w-full items-center gap-[8px] px-[14px] text-left",
									index % 2 === 1 && "bg-[#2F2F31]",
									folders.picked === path && "bg-[#0A5FD3] text-white",
								)}
							>
								<FolderIcon className={cn("h-[13px] w-[13px]", folders.picked === path ? "text-white" : "text-[#57A9F7]")} />
								<span className="flex-1">{nameOf(path)}</span>
								<span className={cn("text-[11px]", folders.picked === path ? "text-white/70" : "text-[#7C7C80]")}>Folder</span>
							</button>
						))}
						{folders.rows.length === 0 && <p className="px-[14px] py-[8px] text-[#7C7C80]">Empty folder</p>}
					</div>
				</div>
				<div className="flex h-[52px] shrink-0 items-center gap-[10px] border-[#1E1E20] border-t bg-[#2E2E30] px-[16px]">
					<button type="button" className="h-[24px] rounded-[5px] bg-[#4A4A4D] px-[12px]">
						New Folder
					</button>
					<span className="ml-auto" />
					<button type="button" onClick={onCancel} className="h-[24px] min-w-[76px] rounded-[5px] bg-[#4A4A4D] px-[12px]">
						Cancel
					</button>
					<button type="button" onClick={folders.choose} className="h-[24px] min-w-[76px] rounded-[5px] bg-[#0A84FF] px-[12px] text-white">
						{prompt}
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
}

/* ── a web page: spool's own browser ───────────────────────── */

/**
 * spool's own list, inside the sheet. It lists the one folder you are in, and
 * because it is spool's it can say what it already knows about each row: a git
 * repository, a design/ folder, a project on Home.
 */
export function SpoolBrowser({
	start = "~/code",
	known,
	prompt = "Choose",
	onChoose,
	onCancel,
}: {
	start?: string;
	/** roots spool already has on Home */
	known: string[];
	prompt?: string;
	onChoose: (path: string) => void;
	onCancel: () => void;
}) {
	const folders = useFolders(start, onChoose, onCancel);
	const crumbs = folders.at.split("/").map((part, index, all) => ({ label: part === "~" ? "~" : part, path: all.slice(0, index + 1).join("/") }));
	const chosen = folders.picked ?? folders.at;
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-[40px] items-center gap-[6px] px-[16px]">
				<button type="button" onClick={folders.up} disabled={folders.at === "~"} className="grid h-[24px] w-[24px] place-items-center rounded-[5px] text-muted hover:bg-raised hover:text-text disabled:opacity-40" aria-label="Parent folder">
					<BackIcon className="h-[12px] w-[12px]" />
				</button>
				<nav className="flex min-w-0 items-center text-muted type-detail" aria-label="Folder">
					{crumbs.map((crumb, index) => (
						<span key={crumb.path} className="flex items-center">
							{index > 0 && <span className="px-[4px] opacity-50">/</span>}
							<button type="button" onClick={() => folders.enter(crumb.path)} className={cn("hover:text-text", index === crumbs.length - 1 && "text-text")}>
								{crumb.label}
							</button>
						</span>
					))}
				</nav>
			</div>
			<ul className="max-h-[196px] overflow-auto px-[8px] pb-[6px]">
				{folders.rows.map((path) => {
					const mark = known.includes(path) ? "on Home" : (DISK[path] ?? []).includes("design") ? "design/" : MARKS[path];
					return (
						<li key={path}>
							<button
								type="button"
								onClick={() => folders.setPicked(path)}
								onDoubleClick={() => folders.enter(path)}
								className={cn(
									"group/row flex h-[32px] w-full items-center gap-[10px] rounded-[6px] px-[10px] text-left type-control",
									folders.picked === path ? "bg-raised text-text" : "text-text hover:bg-raised/60",
								)}
							>
								<FolderIcon className="h-[14px] w-[14px] text-muted" />
								<span className="flex-1 truncate">{nameOf(path)}</span>
								{mark && <span className="text-muted type-detail">{mark}</span>}
								{(DISK[path] ?? []).length > 0 && (
									<span
										role="presentation"
										onClick={(event) => {
											event.stopPropagation();
											folders.enter(path);
										}}
										className="grid h-[20px] w-[20px] place-items-center rounded-[4px] text-muted hover:bg-surface hover:text-text"
									>
										<ChevronIcon className="h-[8px] w-[8px]" />
									</span>
								)}
							</button>
						</li>
					);
				})}
				{folders.rows.length === 0 && <li className="px-[10px] py-[8px] text-muted type-label">This folder is empty.</li>}
			</ul>
			<div className="flex h-[48px] items-center gap-[10px] border-border-raised border-t px-[16px]">
				<span className="min-w-0 flex-1 truncate text-muted type-detail">
					<Kbd>↵</Kbd> {chosen}
				</span>
				<button type="button" onClick={onCancel} className="h-[30px] rounded-[6px] px-[10px] text-muted type-control hover:text-text">
					Cancel
				</button>
				<button type="button" onClick={folders.choose} className="h-[30px] rounded-[6px] bg-text px-[12px] text-bg type-control">
					{prompt} {nameOf(chosen) === "~" ? "~" : nameOf(chosen)}
				</button>
			</div>
		</div>
	);
}
