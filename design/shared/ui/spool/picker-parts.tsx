import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Dir, childrenOf, HOME, jumpTargets, parentOf, shortPath, whereIs } from "shared/lib/spool/picker-disk";
import { DISK_SIZE, type Hit, runsIn, searchDisk, type Weight } from "shared/lib/spool/picker-find";
import { cn } from "shared/lib/utils";
import { BackIcon, CheckIcon, CloseIcon, FolderIcon, SearchIcon } from "shared/ui/spool/icons";

/**
 * What every take of the folder picker shares: the disk, the keyboard, and how
 * a folder's name is inked once a query has landed on part of it.
 *
 * The picker as it ships (`src/ui/picker.tsx`) is a one-level list you click
 * down through. Reaching `~/personal/projects/gym-brute` from `~` is three
 * clicks and a read of twenty-two folder names, and the folder you want is the
 * one folder in the list spool could have recognised on sight. Every take below
 * answers the same brief — search reaches the whole tree under home, the
 * keyboard is enough on its own, and the browse you have today is what an empty
 * query still shows — and they differ only in where the field lives and how a
 * result says where it is.
 *
 * Two things are inert here and only two: there is no canvas behind a frame, so
 * Escape cannot close the dialog and opening a project cannot leave it. Both
 * answer anyway — Escape clears the query, and Enter on a project flashes the
 * row and prints what it would have opened.
 */

export interface Row {
	readonly dir: Dir;
	/** empty while browsing: nothing was typed, so nothing is lit */
	readonly matched: readonly number[];
}

export type Landing = { readonly kind: "opened" | "init"; readonly path: string; readonly name: string };

export interface Picker {
	readonly path: string;
	readonly query: string;
	readonly searching: boolean;
	readonly rows: readonly Row[];
	readonly at: number;
	readonly picked: Row | undefined;
	readonly landed: Landing | null;
	readonly flashing: number | null;
	readonly total: number;
	readonly inputRef: React.RefObject<HTMLInputElement | null>;
	readonly listRef: React.RefObject<HTMLDivElement | null>;
	readonly setQuery: (next: string) => void;
	readonly point: (index: number) => void;
	readonly enter: (index: number) => void;
	readonly browse: (path: string) => void;
	readonly up: () => void;
	readonly openHere: () => void;
	readonly onKeyDown: (event: React.KeyboardEvent) => void;
}

/** the whole picker's behaviour, so a take is only ever a layout */
export function usePicker(opening = ""): Picker {
	const [path, setPath] = useState(HOME);
	const [query, setQuery] = useState(opening);
	const [at, setAt] = useState(0);
	const [landed, setLanded] = useState<Landing | null>(null);
	const [flashing, setFlashing] = useState<number | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const searching = query.trim().length > 0;
	const hits = useMemo<readonly Hit[]>(() => searchDisk(query), [query]);
	const rows = useMemo<readonly Row[]>(
		() =>
			searching
				? hits.map((hit) => ({ dir: hit.dir, matched: hit.matched }))
				: childrenOf(path).map((dir) => ({ dir, matched: [] })),
		[searching, hits, path],
	);
	const picked = rows[at];

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// the pick has to stay on screen: a deep search is more list than dialog
	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);

	useEffect(() => {
		if (landed === null) return;
		const timer = window.setTimeout(() => setLanded(null), 2600);
		return () => window.clearTimeout(timer);
	}, [landed]);

	useEffect(() => {
		if (flashing === null) return;
		const timer = window.setTimeout(() => setFlashing(null), 420);
		return () => window.clearTimeout(timer);
	}, [flashing]);

	const browse = useCallback((next: string) => {
		setPath(next);
		setQuery("");
		setAt(0);
		setLanded(null);
		inputRef.current?.focus();
	}, []);

	const up = useCallback(() => {
		const parent = parentOf(path);
		if (parent !== null) browse(parent);
	}, [path, browse]);

	/**
	 * Enter, once. A folder spool recognises opens; a folder it does not is
	 * somewhere to go, which is the same rule the list has always had — the only
	 * new thing is that the row can now be four levels from where you started.
	 */
	const enter = useCallback(
		(index: number) => {
			const row = rows[index];
			if (row === undefined) return;
			setAt(index);
			if (row.dir.isProject) {
				setFlashing(index);
				setLanded({ kind: "opened", path: row.dir.path, name: row.dir.name });
				return;
			}
			browse(row.dir.path);
		},
		[rows, browse],
	);

	const openHere = useCallback(() => {
		const here = childrenOf(parentOf(path) ?? HOME).find((dir) => dir.path === path);
		const name = path === HOME ? "~" : (here?.name ?? shortPath(path));
		setLanded({ kind: here?.isProject === true ? "opened" : "init", path, name });
	}, [path]);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setAt((n) => Math.min(n + 1, rows.length - 1));
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
				browse(picked.dir.path);
			} else if (event.key === "ArrowLeft" || (event.key === "Backspace" && query === "")) {
				event.preventDefault();
				up();
			} else if (event.key === "Escape") {
				event.preventDefault();
				// closing would leave the frame blank, so the key does the other half of its job
				if (query !== "") setQuery("");
			}
		},
		[rows.length, at, picked, query, enter, browse, up],
	);

	return {
		path,
		query,
		searching,
		rows,
		at,
		picked,
		landed,
		flashing,
		total: DISK_SIZE,
		inputRef,
		listRef,
		setQuery: (next: string) => {
			setQuery(next);
			setAt(0);
		},
		point: setAt,
		enter,
		browse,
		up,
		openHere,
		onKeyDown,
	};
}

const TONE: Record<Weight, string> = {
	runup: "text-muted/45",
	hit: "text-thread",
	plain: "text-text",
};

/** a folder's name with the letters you typed lit and the run-up you did not dimmed */
export function Name({ name, matched, className }: { name: string; matched: readonly number[]; className?: string }) {
	if (matched.length === 0) return <span className={className}>{name}</span>;
	return (
		<span className={className}>
			{runsIn(name, matched).map((run) => (
				<span key={run.at} className={TONE[run.weight]}>
					{run.text}
				</span>
			))}
		</span>
	);
}

/** the chip a recognised folder wears, verbatim lowercase because the machine prints it */
export function ProjectChip({ dir, dim = false }: { dir: Dir; dim?: boolean }) {
	return (
		<span className={cn("flex shrink-0 items-center gap-1.5 font-mono text-2xs leading-3", dim && "opacity-70")}>
			<span className="text-thread">spool</span>
			{dir.frames === undefined ? null : (
				<span className="text-muted/55">{dir.frames === 0 ? "no frames yet" : `${dir.frames} frames`}</span>
			)}
		</span>
	);
}

/** where a result sits, which is the only thing a deep list has to add to a name */
export function Where({ dir, className }: { dir: Dir; className?: string }) {
	return (
		<span className={cn("truncate font-mono text-2xs text-muted/55 leading-3", className)}>{whereIs(dir)}</span>
	);
}

/** the search field, identical in every take: only where it sits changes */
export function Field({
	picker,
	placeholder,
	prompt,
	className,
}: {
	picker: Picker;
	placeholder: string;
	/** the glyph left as the field's prompt, or nothing when the take draws its own */
	prompt?: React.ReactNode;
	className?: string;
}) {
	return (
		<label className={cn("flex min-w-0 flex-1 items-center gap-2.5", className)}>
			{prompt ?? <SearchIcon className="h-3 w-3 shrink-0 text-muted" />}
			<input
				ref={picker.inputRef}
				value={picker.query}
				spellCheck={false}
				autoComplete="off"
				placeholder={placeholder}
				onChange={(event) => picker.setQuery(event.target.value)}
				onKeyDown={picker.onKeyDown}
				aria-label="Search folders"
				className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/45"
			/>
			{picker.query === "" ? null : (
				<button
					type="button"
					onClick={() => {
						picker.setQuery("");
						picker.inputRef.current?.focus();
					}}
					aria-label="Clear search"
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted hover:text-text"
				>
					<CloseIcon className="h-2.5 w-2.5" />
				</button>
			)}
		</label>
	);
}

/** what the list is showing, in the register the machine prints */
export function Readout({ picker, className }: { picker: Picker; className?: string }) {
	return (
		<span className={cn("shrink-0 font-mono text-2xs text-muted/55 leading-3", className)}>
			{picker.searching
				? `${picker.rows.length} of ${picker.total} folders under ~`
				: `${picker.rows.length} ${picker.rows.length === 1 ? "folder" : "folders"}`}
		</span>
	);
}

/** the folders spool already knows projects live in — one press each, empty query only */
export function JumpRow({ picker, className }: { picker: Picker; className?: string }) {
	return (
		<div className={cn("flex items-center gap-1.5 overflow-x-auto", className)}>
			{jumpTargets().map((target) => (
				<button
					key={target.path}
					type="button"
					onClick={() => picker.browse(target.path)}
					className={cn(
						"flex h-6 shrink-0 items-center rounded-sm border px-2 font-mono text-2xs leading-3 transition-colors",
						picker.path === target.path
							? "border-border-raised bg-raised text-text"
							: "border-transparent bg-surface text-muted hover:border-border-raised hover:text-text",
					)}
				>
					{target.label}
				</button>
			))}
		</div>
	);
}

/** the breadcrumb, pressable segment by segment: how you get back up two levels at once */
export function Crumbs({ picker, className }: { picker: Picker; className?: string }) {
	const parts = shortPath(picker.path).split("/");
	return (
		<div className={cn("flex min-w-0 items-center gap-1", className)}>
			{parts.map((part, index) => {
				const to = index === 0 ? HOME : `${HOME}/${parts.slice(1, index + 1).join("/")}`;
				const last = index === parts.length - 1;
				return (
					<span key={to} className="flex min-w-0 items-center gap-1">
						{index === 0 ? null : <span className="shrink-0 font-mono text-2xs text-muted/35 leading-3">/</span>}
						<button
							type="button"
							onClick={() => picker.browse(to)}
							disabled={last}
							className={cn(
								"truncate font-mono text-xs leading-xs transition-colors",
								last ? "text-text" : "text-muted hover:text-text",
							)}
						>
							{part}
						</button>
					</span>
				);
			})}
		</div>
	);
}

export function UpButton({ picker }: { picker: Picker }) {
	return (
		<button
			type="button"
			onClick={picker.up}
			disabled={parentOf(picker.path) === null}
			title="Up one folder"
			className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
		>
			<BackIcon className="h-3 w-3" />
		</button>
	);
}

/** what the picker did, said once and then gone: the frame cannot actually leave */
export function LandedLine({ landed }: { landed: Landing }) {
	return (
		<span className="flex min-w-0 items-center gap-2 font-mono text-2xs leading-3">
			<CheckIcon className="h-3 w-3 shrink-0 text-thread" />
			<span className="truncate text-muted">
				{landed.kind === "opened" ? "opening " : "no canvas.json — initialize design/ in "}
				<span className="text-text">{shortPath(landed.path)}</span>
			</span>
		</span>
	);
}

export function Hints({ hints, className }: { hints: readonly string[]; className?: string }) {
	return (
		<div className={cn("flex items-center gap-5 font-mono text-2xs text-muted/70 leading-3", className)}>
			{hints.map((hint) => (
				<span key={hint}>{hint}</span>
			))}
		</div>
	);
}

/** an empty answer, worded so it says which of the two empties it is */
export function Nothing({ picker }: { picker: Picker }) {
	return (
		<div className="flex h-[34px] items-center gap-2 px-4 font-mono text-muted/60 text-sm leading-sm">
			<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
			{picker.searching ? "nothing under ~ answers to that" : "no folders here"}
		</div>
	);
}

/**
 * The dialog over home. `top` rather than centred for the takes that behave like
 * a palette: a list that grows downward must not push its own field up the
 * screen while you type.
 */
export function PickerStage({
	width,
	top,
	children,
}: {
	width: number;
	top?: number | undefined;
	children: React.ReactNode;
}) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.14, ease: "easeOut" }}
			className={cn(
				"absolute inset-0 z-40 flex justify-center bg-bg/70 px-8 backdrop-blur-[2px]",
				top === undefined && "items-center",
			)}
			style={top === undefined ? undefined : { paddingTop: top }}
		>
			<motion.div
				initial={{ y: -8, scale: 0.99 }}
				animate={{ y: 0, scale: 1 }}
				transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
				className="flex h-fit max-h-full flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				style={{ width }}
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

/**
 * The list, and the cut at the bottom of it.
 *
 * A deep search is more list than dialog, so the scroll has to stop somewhere,
 * and a row sliced clean in half reads as a rendering fault rather than as more
 * list. The gradient is the whole fix: it fades the last row into the panel and
 * costs nothing when the list is short, where it lies over the panel's own
 * colour and is invisible.
 */
/** a row's height, the one number the fade rule needs */
const ROW = 34;

export function ListBox({
	picker,
	min,
	max,
	children,
}: {
	picker: Picker;
	min: number;
	max: number;
	children: React.ReactNode;
}) {
	return (
		<div className="relative">
			<div
				ref={picker.listRef}
				className="overflow-y-auto py-1.5"
				style={{ minHeight: min, maxHeight: max }}
			>
				{children}
			</div>
			{picker.rows.length * ROW > max ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
			) : null}
		</div>
	);
}
