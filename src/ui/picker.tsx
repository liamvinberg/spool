import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { charWeights, runsIn, type Weight } from "../name-match";
import {
	browseDirectory,
	type FsHit,
	type FsListing,
	type FsSearch,
	initProjectAt,
	openProjectAt,
	type ProjectCard,
	searchDirectories,
} from "./api";
import { cn } from "./cn";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import type { HotkeyIdFor } from "./hotkeys";
import { BackIcon, CloseIcon, FolderIcon, SearchIcon } from "./icons";
import { browseRows, crumbsOf, groupRows, jumpTargets, shortPath } from "./picker-model";

/**
 * The "+" folder picker (#4/#22/#251): find a folder anywhere under home by
 * typing part of its name, or browse down to it a level at a time.
 *
 * The field takes the header. The path was in that slot because there was
 * nothing else to put there, and once search reaches the whole tree the path
 * stops being the thing you steer with — so it drops to its own row as a
 * breadcrumb whose every segment is a press, and it stays visible while
 * searching, because a result that lands you three folders deeper has to leave
 * you somewhere readable. An empty query is the browse that always existed.
 *
 * Enter is one rule the list always had: a folder spool recognises opens, a
 * folder it does not is somewhere to go. The only new thing is that the row can
 * now be four levels from where you started. Open resolves by git-style walk-up;
 * when nothing is found the footer offers init in place — the app button is the
 * fallback door to the one scaffold.
 */

const ROW = 34;

const TONE: Record<Weight, string> = {
	runup: "text-muted/45",
	hit: "text-thread",
	plain: "text-text",
};

export function FolderPicker({
	projects,
	onOpened,
	onClose,
}: {
	/** the registry, read back as places: the jump row is where projects already live */
	projects: readonly ProjectCard[];
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
}) {
	const [listing, setListing] = useState<FsListing | null>(null);
	const [home, setHome] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [found, setFound] = useState<FsSearch | null>(null);
	const [at, setAt] = useState(0);
	const [offerInit, setOfferInit] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const browse = useCallback(async (path?: string) => {
		setOfferInit(false);
		setNotice(null);
		setQuery("");
		setFound(null);
		setAt(0);
		const listing = await browseDirectory(path);
		if (listing === undefined) return;
		setListing(listing);
		// the first browse is home, and home is what every path on screen is printed against
		if (path === undefined) setHome(listing.path);
	}, []);

	useEffect(() => {
		void browse();
	}, [browse]);

	const searching = query.trim().length > 0;

	// a keystroke is a round trip, and answers can land out of order: only the latest counts
	const asked = useRef(0);
	useEffect(() => {
		if (!searching) return;
		const mine = ++asked.current;
		void searchDirectories(query).then((answer) => {
			if (answer !== undefined && asked.current === mine) setFound(answer);
		});
	}, [query, searching]);

	const groups = useMemo(() => {
		if (searching) return groupRows(found?.hits ?? [], true);
		return groupRows(listing === null ? [] : browseRows(listing), false);
	}, [searching, found, listing]);
	const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
	const picked = flat[at];

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// the pick has to stay on screen: a deep search is more list than dialog
	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);

	const openAt = useCallback(
		async (path: string) => {
			if (busy) return;
			setBusy(true);
			try {
				const outcome = await openProjectAt(path);
				if (outcome.kind === "opened") onOpened({ root: outcome.root, name: outcome.name });
				else if (outcome.kind === "offer-init") setOfferInit(true);
				else setNotice(outcome.message);
			} finally {
				setBusy(false);
			}
		},
		[busy, onOpened],
	);

	/** Enter, once: what spool recognises opens, what it does not is somewhere to go. */
	const enter = useCallback(
		(index: number) => {
			const row = flat[index];
			if (row === undefined) return;
			setAt(index);
			if (row.isProject) void openAt(row.path);
			else void browse(row.path);
		},
		[flat, openAt, browse],
	);

	const up = useCallback(() => {
		// the daemon's own parent, null only at the root: browsing above home is what it always did
		if (listing?.parent != null) void browse(listing.parent);
	}, [listing, browse]);

	const initHere = async () => {
		if (listing === null || busy) return;
		setBusy(true);
		try {
			const outcome = await initProjectAt(listing.path);
			if (outcome.kind === "opened") onOpened({ root: outcome.root, name: outcome.name });
			else if (outcome.kind === "error") setNotice(outcome.message);
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		return attachHotkeyLayer({
			scope: "picker",
			handlers: {
				"picker.close": () => onClose(),
			} satisfies Record<HotkeyIdFor<"picker">, HotkeyHandler>,
		});
	}, [onClose]);

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setAt((n) => Math.min(n + 1, Math.max(flat.length - 1, 0)));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setAt((n) => Math.max(n - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			enter(at);
		} else if (event.key === "ArrowRight") {
			// the one thing Enter cannot say: go *into* a project rather than open it
			if (picked === undefined) return;
			event.preventDefault();
			void browse(picked.path);
		} else if (event.key === "Backspace" && query === "") {
			event.preventDefault();
			up();
		} else if (event.key === "Escape") {
			event.preventDefault();
			// the field is the way out of a query; an empty one is the way out of the picker
			if (query === "") onClose();
			else setQuery("");
		}
	};

	const crumbs = home === null || listing === null ? [] : crumbsOf(listing.path, home);
	const jumps = home === null ? [] : jumpTargets(projects, home);

	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center">
			<button type="button" aria-label="Close" className="absolute inset-0 bg-bg/70" onClick={onClose} />
			<dialog
				open
				aria-label="Open a folder"
				// a caret that never leaves: clicking the panel is never clicking away from the field
				onMouseDown={(event) => {
					if (event.target !== inputRef.current) event.preventDefault();
					inputRef.current?.focus();
				}}
				className="relative m-0 flex max-h-[70vh] w-[600px] flex-col overflow-hidden rounded-lg border border-border-raised bg-surface p-0 text-text"
			>
				<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
					<button
						type="button"
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
						onClick={up}
						disabled={listing?.parent == null}
						title="Up one folder"
					>
						<BackIcon />
					</button>
					<label className="flex min-w-0 flex-1 items-center gap-2.5">
						<SearchIcon className="h-3 w-3 shrink-0 text-muted" />
						<input
							ref={inputRef}
							value={query}
							spellCheck={false}
							autoComplete="off"
							placeholder="search every folder under ~"
							aria-label="Search folders"
							onChange={(event) => {
								setQuery(event.target.value);
								setAt(0);
								setOfferInit(false);
								setNotice(null);
							}}
							onKeyDown={onKeyDown}
							className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/45"
						/>
						{query === "" ? null : (
							<button
								type="button"
								onClick={() => {
									setQuery("");
									setAt(0);
									inputRef.current?.focus();
								}}
								aria-label="Clear search"
								className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted hover:text-text"
							>
								<CloseIcon />
							</button>
						)}
					</label>
					<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">
						{searching
							? `${found?.answered ?? 0} of ${found?.total ?? 0} folders under ~`
							: `${flat.length} ${flat.length === 1 ? "folder" : "folders"}`}
					</span>
				</div>

				<div className="flex h-9 shrink-0 items-center gap-1 border-border border-b bg-canvas/40 px-4">
					{crumbs.map((crumb, index) => (
						<span key={crumb.path} className="flex min-w-0 items-center gap-1">
							{index === 0 ? null : (
								<span className="shrink-0 font-mono text-2xs text-muted/35 leading-3">/</span>
							)}
							<button
								type="button"
								onClick={() => void browse(crumb.path)}
								disabled={index === crumbs.length - 1}
								className={cn(
									"truncate font-mono text-xs leading-xs transition-colors",
									index === crumbs.length - 1 ? "text-text" : "text-muted hover:text-text",
								)}
							>
								{crumb.label}
							</button>
						</span>
					))}
				</div>

				<div className="relative">
					<div ref={listRef} className="max-h-[390px] min-h-[204px] overflow-y-auto py-1.5">
						{flat.length === 0 && (
							<div className="flex h-[34px] items-center gap-2 px-4 font-mono text-muted/60 text-sm leading-sm">
								<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
								{searching ? "nothing under ~ answers to that" : "no folders here"}
							</div>
						)}
						{groups.map((group) => (
							<div key={group.label}>
								{group.label === "" ? null : (
									<div className="flex h-7 items-center gap-2 px-4">
										<span className="font-mono text-2xs text-muted/45 leading-3">{group.label}</span>
										<span className="h-px flex-1 bg-border" />
										<span className="font-mono text-2xs text-muted/30 leading-3">{group.rows.length}</span>
									</div>
								)}
								{group.rows.map((row, index) => (
									<Row
										key={row.path}
										row={row}
										home={home}
										at={group.from + index}
										picked={group.from + index === at}
										searching={searching}
										onPoint={() => setAt(group.from + index)}
										onEnter={() => enter(group.from + index)}
									/>
								))}
							</div>
						))}
						{/* the wire carries the best rows, not every one: a list that stops has to say so */}
						{searching && found !== null && found.answered > flat.length ? (
							<div className="flex h-7 items-center px-4 font-mono text-2xs text-muted/45 leading-3">
								{`the best ${flat.length} of ${found.answered} — type more to narrow it`}
							</div>
						) : null}
					</div>
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
				</div>

				{searching ? null : (
					<div className="flex h-10 shrink-0 items-center gap-3 border-border border-t px-4">
						<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">jump</span>
						<div className="flex items-center gap-1.5 overflow-x-auto">
							{jumps.map((jump) => (
								<button
									key={jump.path}
									type="button"
									onClick={() => void browse(jump.path)}
									className={cn(
										"flex h-6 shrink-0 items-center rounded-sm border px-2 font-mono text-2xs leading-3 transition-colors",
										listing?.path === jump.path
											? "border-border-raised bg-raised text-text"
											: "border-transparent bg-surface text-muted hover:border-border-raised hover:text-text",
									)}
								>
									{jump.label}
								</button>
							))}
						</div>
					</div>
				)}

				<footer className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
					{notice !== null && <span className="flex-1 truncate font-mono text-thread text-xs">{notice}</span>}
					{offerInit && notice === null && (
						<span className="min-w-0 flex-1 truncate font-mono text-muted text-xs">
							{`not a spool project — initialize design/ in ${home === null || listing === null ? "this folder" : shortPath(listing.path, home)}?`}
						</span>
					)}
					{!offerInit && notice === null && (
						<div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden whitespace-nowrap font-mono text-2xs text-muted/70 leading-3">
							<span>{"↑↓ moves"}</span>
							<span>{"↵ opens or goes in"}</span>
							<span>{"→ goes in"}</span>
							<span>esc closes</span>
						</div>
					)}
					<button
						type="button"
						className="flex h-7 shrink-0 items-center rounded-md px-3 text-muted text-sm hover:text-text"
						onClick={onClose}
					>
						Cancel
					</button>
					{offerInit ? (
						<button
							type="button"
							className="flex h-7 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text disabled:opacity-40"
							onClick={() => void initHere()}
							disabled={busy}
						>
							Initialize here
						</button>
					) : (
						<button
							type="button"
							className="flex h-7 max-w-[260px] shrink-0 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text disabled:opacity-40"
							onClick={() => (picked?.isProject === true ? enter(at) : void openAt(listing?.path ?? ""))}
							disabled={busy || listing === null}
						>
							<span className="truncate">
								{picked?.isProject === true ? `Open ${picked.name}` : "Open this folder"}
							</span>
						</button>
					)}
				</footer>
			</dialog>
		</div>
	);
}

function Row({
	row,
	home,
	at,
	picked,
	searching,
	onPoint,
	onEnter,
}: {
	row: FsHit;
	home: string | null;
	at: number;
	picked: boolean;
	/** where a result sits is printed only when the list can be from anywhere */
	searching: boolean;
	onPoint: () => void;
	onEnter: () => void;
}) {
	const weights = charWeights(row.name, row.matched);
	return (
		<button
			type="button"
			data-at={at}
			// move, not enter: a list that scrolls under a still cursor must not re-pick
			onMouseMove={onPoint}
			onClick={onEnter}
			style={{ height: ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{/* the glyph, thread-coloured on a project: cheaper to spot than reading the chip at the far right */}
			<FolderIcon className={cn("h-3 w-3 shrink-0", row.isProject ? "text-thread/70" : "text-muted/30")} />
			{/* the name keeps its width so the path yields first, but never past most of the row */}
			<span className="min-w-0 max-w-[60%] shrink-0 truncate text-base leading-base">
				{row.matched.length === 0
					? row.name
					: runsIn(row.name, weights).map((run) => (
							<span key={run.at} className={TONE[run.weight]}>
								{run.text}
							</span>
						))}
			</span>
			{searching && row.parent !== undefined && home !== null ? (
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/55 leading-3">
					{shortPath(row.parent, home)}
				</span>
			) : (
				<span className="flex-1" />
			)}
			{row.isProject ? (
				<span className="flex shrink-0 items-center gap-1.5 font-mono text-2xs leading-3">
					<span className="text-thread">spool</span>
					{row.frames === undefined ? null : (
						<span className="text-muted/55">{row.frames === 0 ? "no frames yet" : `${row.frames} frames`}</span>
					)}
				</span>
			) : null}
		</button>
	);
}
