import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { charWeights, runsIn, type Weight } from "../name-match";
import {
	browseDirectory,
	type FsHit,
	type FsListing,
	type FsSearch,
	initProjectAt,
	openProjectAt,
	searchDirectories,
} from "./api";
import { cn } from "./cn";
import { desktopWindow } from "./desktop-window";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { ArrowRightIcon, FolderIcon, SearchIcon } from "./icons";
import { browseRows, crumbsOf, shortPath, within } from "./picker-model";
import "./picker.css";

const TONE: Record<Weight, string> = { runup: "text-muted/45", hit: "text-thread-strong", plain: "text-text" };

/** Browse without writing; only the footer or Enter confirms the selected folder. */
export function FolderPicker({
	onOpened,
	onClose,
	initial = "folder",
	onLocation,
	location = "~",
}: {
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
	initial?: "folder" | "location";
	onLocation?: (path: string) => Promise<{ ok: boolean; reason?: string }>;
	location?: string;
}) {
	const native = useMemo(() => desktopWindow()?.chooseDirectory, []);
	const [showBrowser, setShowBrowser] = useState(initial !== "location" || native === undefined);
	const [listing, setListing] = useState<FsListing | null>(null);
	const [home, setHome] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [found, setFound] = useState<{ key: string; answer: FsSearch } | null>(null);
	const [at, setAt] = useState(-1);
	const [initPath, setInitPath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [browsing, setBrowsing] = useState(false);
	const working = useRef(false);
	const mounted = useRef(true);
	const revision = useRef(0);
	const nativeStarted = useRef(false);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const crumbsRef = useRef<HTMLDivElement>(null);
	const title = initial === "location" ? "Choose a folder" : "Open a project or folder";

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			revision.current++;
		};
	}, []);

	const browse = useCallback(async (path?: string) => {
		const mine = ++revision.current;
		setBrowsing(true);
		setNotice(null);
		try {
			const next = await browseDirectory(path);
			if (!mounted.current || mine !== revision.current) return;
			if (next === undefined) {
				setNotice("Could not open this folder. Choose another folder or try again.");
				return;
			}
			setListing(next);
			if (path === undefined) setHome(next.path);
			setQuery("");
			setFound(null);
			setAt(-1);
			setInitPath(null);
		} catch {
			if (mounted.current && mine === revision.current) setNotice("Could not open this folder. Try again.");
		} finally {
			if (mounted.current && mine === revision.current) {
				setBrowsing(false);
				inputRef.current?.focus();
			}
		}
	}, []);

	useEffect(() => {
		if (!showBrowser) return;
		let active = true;
		void (async () => {
			const mine = revision.current + 1;
			await browse();
			if (active && mine === revision.current && location !== "~") await browse(location);
		})();
		return () => {
			active = false;
			revision.current++;
		};
	}, [browse, location, showBrowser]);

	useLayoutEffect(() => {
		if (!showBrowser) return;
		const previous = document.activeElement;
		const dialog = dialogRef.current;
		dialog?.showModal();
		inputRef.current?.focus();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, [showBrowser]);
	useEffect(() => attachHotkeyLayer({ scope: "picker", handlers: {} }), []);

	const run = useCallback(async (action: () => Promise<void>) => {
		if (working.current) return;
		working.current = true;
		setBusy(true);
		setNotice(null);
		try {
			await action();
		} catch (error) {
			if (mounted.current) {
				setShowBrowser(true);
				setNotice(error instanceof Error ? error.message : "Could not open the folder. Try again.");
			}
		} finally {
			working.current = false;
			if (mounted.current) setBusy(false);
		}
	}, []);

	const accept = useCallback(
		async (path: string) => {
			if (initial === "location") {
				const result = await onLocation?.(path);
				if (!mounted.current) return;
				if (result?.ok) onClose();
				else throw new Error(result?.reason ?? "Could not use this folder. Try again.");
			} else {
				const outcome = await openProjectAt(path);
				if (!mounted.current) return;
				if (outcome.kind === "opened") onOpened(outcome);
				else if (outcome.kind === "offer-init") setInitPath(path);
				else throw new Error(outcome.message);
			}
		},
		[initial, onLocation, onClose, onOpened],
	);

	const chooseNative = useCallback(
		() =>
			run(async () => {
				if (native === undefined) return;
				const path = await native({
					path: listing?.path ?? location,
					title,
					buttonLabel: initial === "location" ? "Use folder" : "Open",
				});
				if (!mounted.current) return;
				if (path !== null) await accept(path);
				else if (initial === "location") onClose();
			}),
		[run, native, listing, location, title, accept, initial, onClose],
	);
	useEffect(() => {
		if (initial !== "location" || native === undefined || nativeStarted.current) return;
		nativeStarted.current = true;
		void chooseNative();
	}, [chooseNative, initial, native]);

	const term = query.trim();
	const pathQuery = term.startsWith("/") || term === "~" || term.startsWith("~/") || /^[a-z]:[\\/]/i.test(term);
	const scope =
		home !== null && listing !== null && (listing.path === home || listing.path.startsWith(`${home}/`))
			? listing.path
			: null;
	const key = scope === null || pathQuery || term === "" ? null : `${scope}\0${term}`;
	useEffect(() => {
		if (key === null || scope === null) return;
		let active = true;
		void searchDirectories(term, scope)
			.then((answer) => {
				if (!active) return;
				if (answer === undefined) setNotice("Could not search folders. Try again.");
				else setFound({ key, answer });
			})
			.catch(() => {
				if (active) setNotice("Could not search folders. Try again.");
			});
		return () => {
			active = false;
		};
	}, [key, term, scope]);
	const answered = found?.key === key ? found?.answer : undefined;
	const pending = key !== null && answered === undefined;
	const flat: readonly FsHit[] = pathQuery
		? []
		: key !== null
			? (answered?.hits ?? [])
			: listing === null
				? []
				: browseRows(listing).filter((row) => row.name.toLowerCase().includes(term.toLowerCase()));
	const picked = flat[at];
	const target = pathQuery ? term : (picked?.path ?? (term === "" ? listing?.path : undefined));
	const crumbs = home === null || listing === null ? [] : crumbsOf(listing.path, home);
	const display = (path: string) => (home === null ? path : shortPath(path, home));
	const disabled = busy || browsing || pending || target === undefined;

	useLayoutEffect(() => {
		if (listing === null) return;
		const crumbs = crumbsRef.current;
		if (crumbs !== null) crumbs.scrollLeft = crumbs.scrollWidth;
	}, [listing]);

	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);
	useEffect(() => {
		if (initPath === null) inputRef.current?.focus();
		else dialogRef.current?.querySelector<HTMLButtonElement>(".pj-location-footer button")?.focus();
	}, [initPath]);

	const enter = (row: FsHit) => {
		if (busy || browsing) return;
		if (initial === "folder" && row.isProject) void run(() => accept(row.path));
		else void browse(row.path);
	};
	const confirm = () => {
		if (pathQuery) {
			if (!busy && !browsing) void browse(term);
			return;
		}
		if (!disabled && target !== undefined) void run(() => accept(target));
	};

	if (!showBrowser) return null;
	return (
		<dialog
			ref={dialogRef}
			className="project-picker"
			aria-label={initPath === null ? title : "Create project here?"}
			onCancel={(event) => {
				event.preventDefault();
				if (!working.current) {
					if (initPath !== null) {
						setInitPath(null);
						setNotice(null);
					} else onClose();
				}
			}}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Escape" && query !== "" && initPath === null) {
					event.preventDefault();
					setQuery("");
					setAt(-1);
				}
			}}
		>
			{initPath !== null ? (
				<div className="project-picker-init">
					<h2>Create project here?</h2>
					<p>Spool will add a design folder inside {initPath.split("/").filter(Boolean).at(-1) ?? initPath}.</p>
					<code>{display(initPath)}</code>
				</div>
			) : (
				<>
					<header className="project-picker-heading">
						<h2>{title}</h2>
						{native !== undefined && (
							<button
								type="button"
								className="project-picker-browse"
								disabled={busy}
								onClick={() => void chooseNative()}
							>
								Browse folders…
							</button>
						)}
					</header>
					<div className="project-picker-search">
						<SearchIcon />
						<input
							ref={inputRef}
							value={query}
							aria-label="Search folders or paste a path"
							placeholder="Search folders or paste a path"
							spellCheck={false}
							autoComplete="off"
							disabled={busy || browsing}
							onChange={(event) => {
								setQuery(event.target.value);
								setAt(event.target.value.trim() === "" ? -1 : 0);
								setNotice(null);
							}}
							onKeyDown={(event) => {
								if (event.nativeEvent.isComposing || busy || browsing) return;
								if (event.key === "ArrowDown" || event.key === "ArrowUp") {
									event.preventDefault();
									setAt((n) =>
										Math.max(-1, Math.min(flat.length - 1, n + (event.key === "ArrowDown" ? 1 : -1))),
									);
								} else if (event.key === "Enter") {
									event.preventDefault();
									confirm();
								} else if (
									event.key === "ArrowRight" &&
									picked !== undefined &&
									event.currentTarget.selectionStart === query.length
								) {
									event.preventDefault();
									void browse(picked.path);
								} else if (event.key === "Backspace" && query === "" && listing?.parent != null) {
									event.preventDefault();
									void browse(listing.parent);
								}
							}}
						/>
					</div>
					<div className="project-picker-crumbs">
						<button
							type="button"
							aria-label="Parent folder"
							disabled={listing?.parent == null || busy || browsing}
							onClick={() => {
								if (listing?.parent != null) void browse(listing.parent);
							}}
						>
							<ArrowRightIcon />
						</button>
						<nav ref={crumbsRef} aria-label="Folder location">
							{crumbs.map((crumb) => (
								<button
									type="button"
									key={crumb.path}
									disabled={busy || browsing}
									onClick={() => void browse(crumb.path)}
								>
									{crumb.label === "~" ? "Home" : crumb.label}
									<span>/</span>
								</button>
							))}
						</nav>
					</div>
					<div ref={listRef} className="project-picker-list" aria-busy={browsing || pending}>
						{pathQuery ? (
							<button type="button" className="project-picker-row" disabled={busy || browsing} onClick={confirm}>
								<FolderIcon />
								<span className="truncate">Go to {query}</span>
							</button>
						) : flat.length === 0 ? (
							<p>
								{browsing || pending
									? "Loading folders…"
									: term === ""
										? "No folders here. You can use this folder."
										: "No matching folders."}
							</p>
						) : (
							flat.map((row, index) => (
								<Row
									key={row.path}
									row={row}
									at={index}
									picked={index === at}
									disabled={busy || browsing}
									place={term !== "" && scope !== null ? within(row.parent, scope) : ""}
									onSelect={() => setAt(index)}
									onEnter={() => enter(row)}
									onBrowse={() => void browse(row.path)}
									onConfirm={() => void run(() => accept(row.path))}
								/>
							))
						)}
						{answered !== undefined && answered.answered > flat.length && (
							<p>
								Showing {flat.length} of {answered.answered}. Keep typing to narrow it.
							</p>
						)}
					</div>
				</>
			)}
			{notice !== null && (
				<p role="alert" className="project-picker-notice">
					{notice}
				</p>
			)}
			<div className="pj-location-footer">
				{initPath === null && (
					<code title={target}>
						{target !== undefined && (
							<>
								<span>{display(target).slice(0, display(target).lastIndexOf("/") + 1)}</span>
								<span>{display(target).slice(display(target).lastIndexOf("/") + 1)}</span>
							</>
						)}
					</code>
				)}
				<button
					type="button"
					className="home-action"
					disabled={busy}
					onClick={() => {
						if (initPath !== null) {
							setInitPath(null);
							setNotice(null);
							inputRef.current?.focus();
						} else onClose();
					}}
				>
					{initPath === null ? "Cancel" : "Back"}
				</button>
				<button
					type="button"
					className="home-action home-action-primary"
					disabled={initPath !== null ? busy : pathQuery ? busy || browsing : disabled}
					onClick={() => {
						if (initPath === null) {
							confirm();
							return;
						}
						void run(async () => {
							const outcome = await initProjectAt(initPath);
							if (!mounted.current) return;
							if (outcome.kind === "opened") onOpened(outcome);
							else if (outcome.kind === "error") throw new Error(outcome.message);
						});
					}}
				>
					{busy
						? initPath !== null
							? "Creating…"
							: initial === "location"
								? "Saving…"
								: "Opening…"
						: initPath !== null
							? "Create project here"
							: pathQuery
								? "Go to folder"
								: initial === "location"
									? "Use folder"
									: picked?.isProject
										? "Open project"
										: "Open folder"}
				</button>
			</div>
		</dialog>
	);
}

function Row({
	row,
	at,
	picked,
	disabled,
	place,
	onSelect,
	onEnter,
	onBrowse,
	onConfirm,
}: {
	row: FsHit;
	at: number;
	picked: boolean;
	disabled: boolean;
	place: string;
	onSelect: () => void;
	onEnter: () => void;
	onBrowse: () => void;
	onConfirm: () => void;
}) {
	const weights = charWeights(row.name, row.matched);
	return (
		<button
			type="button"
			data-at={at}
			aria-pressed={picked}
			disabled={disabled}
			onClick={onSelect}
			onDoubleClick={onEnter}
			onKeyDown={(event) => {
				if (event.key === "ArrowRight") {
					event.preventDefault();
					onBrowse();
				} else if (event.key === "Enter") {
					event.preventDefault();
					onConfirm();
				}
			}}
			className={cn("project-picker-row", picked && "is-selected")}
		>
			<FolderIcon className={row.isProject ? "text-thread-strong" : "text-muted"} />
			<span className="min-w-0 truncate">
				{row.matched.length === 0
					? row.name
					: runsIn(row.name, weights).map((run) => (
							<span key={run.at} className={TONE[run.weight]}>
								{run.text}
							</span>
						))}
			</span>
			{place !== "" && <small className="truncate">{place}</small>}
			{row.isProject && <small>{row.frames === undefined ? "Project" : `${row.frames} frames`}</small>}
		</button>
	);
}
