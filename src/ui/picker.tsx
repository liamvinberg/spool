import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { charWeights, runsIn, type Weight } from "../name-match";
import {
	browseDirectory,
	createProjectAt,
	type FsHit,
	type FsListing,
	type FsSearch,
	initProjectAt,
	openProjectAt,
	searchDirectories,
} from "./api";
import { cn } from "./cn";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import type { HotkeyIdFor } from "./hotkeys";
import { FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { askOf, browseRows, crumbsOf, shortPath, within } from "./picker-model";

/**
 * The "+" folder picker (#4/#22/#251/#242/#277): one field, a list under it.
 *
 * What shipped with #251 was five bands deep — a header with a back arrow, a
 * field and a folder count; a breadcrumb; a list with group labels; a jump row;
 * a footer of key hints and two buttons — and together they answered so many
 * questions that the folder you came for was the quietest thing on screen.
 * Nothing the picker does changed there, only the chrome: the breadcrumb lives
 * inside the field as a pressable prefix in front of the caret.
 *
 * Typing filters the folder the breadcrumb names, so the prefix stays put and
 * means what it says (#277): standing in `~/projects/` and typing `art` reads
 * as the path it looks like. Where a hit sits is printed on the hit, relative
 * to that folder. `~/` typed in front of a query is the one way out: it stands
 * in for the breadcrumb and the search is every folder under home. While an
 * answer is on its way the last rows stay; the empty state is for an answer
 * that came back empty, never for one that has not come back.
 *
 * Enter is one rule the list always had: a folder spool recognises opens, a
 * folder it does not is somewhere to go. Open resolves by git-style walk-up;
 * when nothing is found, one line in the list area offers init in place.
 *
 * The "+" at the end of the field is the picker's one verb that makes a folder
 * rather than finding one (#242). Press it, or ⌘N, and the field becomes a name
 * field with the folder you are standing in still printed in front of the
 * caret; the list collapses to the one line the folder is about to be, and
 * Enter makes it, scaffolds it and opens its tab. The folder lands where the
 * prefix says. There is no location field, because the prefix already is one.
 */

const ROW = 34;
/** how tall the list may get before it scrolls */
const LIST_MAX = 476;

const TONE: Record<Weight, string> = {
	runup: "text-muted/45",
	hit: "text-thread",
	plain: "text-text",
};

export function FolderPicker({
	onOpened,
	onClose,
}: {
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
}) {
	const [listing, setListing] = useState<FsListing | null>(null);
	const [home, setHome] = useState<string | null>(null);
	/** home's one level, kept from the first browse: what `~/` alone shows without another round trip */
	const [homeListing, setHomeListing] = useState<FsListing | null>(null);
	const [query, setQuery] = useState("");
	/** the last answer and the question it answered, so a stale one is never mistaken for the current */
	const [found, setFound] = useState<{ key: string; answer: FsSearch } | null>(null);
	const [at, setAt] = useState(0);
	const [offerInit, setOfferInit] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
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
		if (path === undefined) {
			setHome(listing.path);
			setHomeListing(listing);
		}
	}, []);

	useEffect(() => {
		void browse();
	}, [browse]);

	const ask = askOf(query);
	const searching = ask.term.length > 0;
	// the folder the search is under: the one in the breadcrumb, or home past `~/`. Above home there
	// is nothing indexed, so the browse can stand there but a search still reads under `~`.
	const scope =
		home === null
			? null
			: ask.wide || listing === null || (listing.path !== home && !listing.path.startsWith(`${home}/`))
				? home
				: listing.path;
	const key = scope === null ? null : `${scope}\0${ask.term}`;

	// a keystroke is a round trip, and answers can land out of order: only the latest counts
	useEffect(() => {
		if (!searching || scope === null || key === null) return;
		let mine = true;
		void searchDirectories(ask.term, scope).then((answer) => {
			if (answer !== undefined && mine) setFound({ key, answer });
		});
		return () => {
			mine = false;
		};
	}, [ask.term, searching, scope, key]);

	const answered = found !== null && found.key === key ? found.answer : null;
	/** asked and not yet answered: the last rows stay up, and nothing claims there is nothing */
	const pending = searching && answered === null;

	const flat = useMemo<readonly FsHit[]>(() => {
		if (searching) return (answered ?? found?.answer)?.hits ?? [];
		// `~/` alone is home's browse, out of the listing already held
		if (ask.wide) return homeListing === null ? [] : browseRows(homeListing);
		return listing === null ? [] : browseRows(listing);
	}, [searching, answered, found, ask.wide, homeListing, listing]);
	const picked = flat[at];

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// the field being typed into wins: declared after the picker's own focus
	useEffect(() => {
		if (naming) nameRef.current?.focus();
		else inputRef.current?.focus();
	}, [naming]);

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

	const beginNaming = () => {
		if (listing === null) return;
		setOfferInit(false);
		setNotice(null);
		setNaming(true);
	};

	const stopNaming = () => {
		setNaming(false);
		setName("");
	};

	const create = async () => {
		const typed = name.trim();
		if (listing === null || busy || typed === "") return;
		setBusy(true);
		try {
			const outcome = await createProjectAt(listing.path, typed);
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
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
			// the "+" from the keyboard: a key born in the field never reaches the hotkey layer
			event.preventDefault();
			beginNaming();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			setAt((n) => Math.min(n + 1, Math.max(flat.length - 1, 0)));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setAt((n) => Math.max(n - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (offerInit) void initHere();
			else if (picked === undefined && !searching) void openAt(listing?.path ?? "");
			else enter(at);
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
			// the offer, then the query, then the picker: each escape backs out of one thing
			if (offerInit || notice !== null) {
				setOfferInit(false);
				setNotice(null);
			} else if (query === "") onClose();
			else setQuery("");
		}
	};

	const onNameKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void create();
		} else if (event.key === "Escape") {
			event.preventDefault();
			stopNaming();
		}
	};

	const crumbs = home === null || listing === null ? [] : crumbsOf(listing.path, home);

	return (
		<div className="absolute inset-0 z-20 flex justify-center px-8" style={{ paddingTop: "18vh" }}>
			<button type="button" aria-label="Close" className="absolute inset-0 bg-bg/70" onClick={onClose} />
			<dialog
				open
				aria-label={naming ? "Name the new project" : "Open a folder"}
				// a caret that never leaves: clicking the panel is never clicking away from the field
				onMouseDown={(event) => {
					const field = naming ? nameRef.current : inputRef.current;
					if (event.target !== field) event.preventDefault();
					field?.focus();
				}}
				className="relative m-0 flex h-fit max-h-[70vh] w-[520px] flex-col overflow-hidden rounded-lg border border-border-raised bg-surface p-0 text-text"
			>
				{naming ? (
					<label className="flex h-[52px] shrink-0 items-center px-4">
						<FolderIcon className="mr-2 h-3 w-3 shrink-0 text-thread" />
						<Prefix crumbs={crumbs} />
						<input
							ref={nameRef}
							value={name}
							spellCheck={false}
							autoComplete="off"
							placeholder="name"
							aria-label="Project name"
							onChange={(event) => {
								setName(event.target.value);
								setNotice(null);
							}}
							onKeyDown={onNameKeyDown}
							className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/35"
						/>
					</label>
				) : (
					<div className="flex h-[52px] shrink-0 items-center px-4">
						<SearchIcon className="mr-2 h-3 w-3 shrink-0 text-muted/45" />
						{ask.wide ? null : <Prefix crumbs={crumbs} onPress={(path) => void browse(path)} />}
						<input
							ref={inputRef}
							value={query}
							spellCheck={false}
							autoComplete="off"
							aria-label="Search folders"
							onChange={(event) => {
								setQuery(event.target.value);
								setAt(0);
								setOfferInit(false);
								setNotice(null);
							}}
							onKeyDown={onKeyDown}
							className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none"
						/>
						<button
							type="button"
							onClick={beginNaming}
							disabled={listing === null}
							title="new project ⌘N"
							aria-label="New project"
							className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-100 hover:bg-raised hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
						>
							<PlusIcon />
						</button>
					</div>
				)}

				<div className="relative">
					<div ref={listRef} className="overflow-y-auto py-1.5" style={{ maxHeight: LIST_MAX }}>
						{naming ? (
							<div style={{ height: ROW }} className="relative flex w-full items-center gap-3 bg-raised px-4">
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
								<FolderIcon className="h-3 w-3 shrink-0 text-thread/70" />
								<span className="min-w-0 truncate font-mono text-md leading-md">
									<span className="text-muted/45">
										{home === null || listing === null ? "" : `${shortPath(listing.path, home)}/`}
									</span>
									<span className="text-text">{name.trim()}</span>
								</span>
								<span className="flex-1" />
								{notice === null ? (
									<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">↵ creates</span>
								) : (
									<span className="shrink-0 truncate font-mono text-2xs text-thread leading-3">{notice}</span>
								)}
							</div>
						) : (
							<>
								{flat.length === 0 && !offerInit && notice === null && (
									<div className="flex h-[34px] items-center gap-3 px-4 font-mono text-muted/45 text-sm leading-sm">
										<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
										{pending
											? `searching ${scope === null || home === null ? "~" : shortPath(scope, home)}…`
											: searching
												? `nothing under ${scope === null || home === null ? "~" : shortPath(scope, home)} answers to that`
												: "no folders here"}
									</div>
								)}
								{flat.map((row, index) => (
									<Row
										key={row.path}
										row={row}
										at={index}
										picked={index === at}
										place={searching && scope !== null ? within(row.parent, scope) : ""}
										onPoint={() => setAt(index)}
										onEnter={() => enter(index)}
									/>
								))}
								{/* the wire carries the best rows, not every one: a list that stops has to say so */}
								{answered !== null && answered.answered > flat.length ? (
									<div className="flex h-7 items-center px-4 font-mono text-2xs text-muted/45 leading-3">
										{`the best ${flat.length} of ${answered.answered} — type more to narrow it`}
									</div>
								) : null}
								{notice !== null ? (
									<div
										className="flex items-center gap-2.5 px-4 font-mono text-2xs text-thread leading-3"
										style={{ height: ROW }}
									>
										<FolderIcon className="h-3 w-3 shrink-0 text-thread/50" />
										<span className="truncate">{notice}</span>
									</div>
								) : offerInit ? (
									<div
										className="flex items-center gap-2.5 px-4 font-mono text-2xs leading-3"
										style={{ height: ROW }}
									>
										<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
										<span className="shrink-0 text-muted/55">not a spool project</span>
										<span className="text-muted/25">·</span>
										<span className="shrink-0 text-muted">↵ initializes design/ here</span>
										<span className="text-muted/25">·</span>
										<span className="shrink-0 text-muted/55">esc goes back</span>
									</div>
								) : null}
							</>
						)}
					</div>
					{/* the cut at the bottom of a list that scrolls: a row sliced in half reads as a fault, a fade reads as more list. A list that fits has nothing to fade. */}
					{!naming && flat.length * ROW > LIST_MAX ? (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
					) : null}
				</div>
			</dialog>
		</div>
	);
}

/**
 * The breadcrumb, living inside the field: where you are and what you would
 * type read as one line, in the order a path is written, and every segment of
 * it is still a press. While naming it is the location and nothing else.
 */
function Prefix({ crumbs, onPress }: { crumbs: ReturnType<typeof crumbsOf>; onPress?: (path: string) => void }) {
	return (
		<span className="flex shrink-0 items-center font-mono text-md text-muted/45 leading-md">
			{crumbs.map((crumb) => {
				const text = crumb.label === "/" ? "/" : `${crumb.label}/`;
				return onPress === undefined ? (
					<span key={crumb.path}>{text}</span>
				) : (
					<button
						key={crumb.path}
						type="button"
						onClick={() => onPress(crumb.path)}
						className="transition-colors hover:text-muted"
					>
						{text}
					</button>
				);
			})}
		</span>
	);
}

function Row({
	row,
	at,
	picked,
	place,
	onPoint,
	onEnter,
}: {
	row: FsHit;
	at: number;
	picked: boolean;
	/** where a hit sits under the folder searched — empty for a browse row, and for a hit sitting right there */
	place: string;
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
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100 hover:bg-raised",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{/* the glyph, thread-coloured on a project: the whole chip, and cheaper to spot than a word */}
			<FolderIcon className={cn("h-3 w-3 shrink-0", row.isProject ? "text-thread/70" : "text-muted/30")} />
			<span className="min-w-0 shrink truncate text-base leading-base">
				{row.matched.length === 0
					? row.name
					: runsIn(row.name, weights).map((run) => (
							<span key={run.at} className={TONE[run.weight]}>
								{run.text}
							</span>
						))}
			</span>
			<span className="flex-1" />
			{place === "" ? null : (
				<span className="min-w-0 shrink truncate font-mono text-2xs text-muted/55 leading-3">{place}</span>
			)}
			{row.frames === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{row.frames}</span>
			)}
		</button>
	);
}
