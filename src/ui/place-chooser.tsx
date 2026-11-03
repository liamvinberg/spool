import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "./cn";
import { type DesktopWindow, type DirectoryRequest, desktopWindow } from "./desktop-window";
import { crumbsOf, type FolderRow, shortPath } from "./folder-paths";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { BackIcon, ChevronIcon, FolderIcon, SearchIcon, SpoolFileIcon } from "./icons";
import { Button, IconButton } from "./primitives/actions";
import { TextField } from "./primitives/inputs";
import { Dialog, DialogFooter } from "./primitives/overlays";
import { ListRow } from "./primitives/structure";
import { useFolderBrowser } from "./use-folder-browser";

/** open takes a folder or a .spool file, or a path or link typed in; a location or a checkout takes a folder */
type Purpose = Exclude<DirectoryRequest["purpose"], "export">;

/**
 * The one chooser for every place spool picks something on this Mac: Open… (a folder or a .spool file), where new
 * projects go, and a checkout a team's project moves into. In the Mac app it is the system's own open panel and draws
 * nothing; in a browser, which has no panel to raise, a slim one on the daemon's folder browser does the same job.
 * Either way it answers once: `onChoose` with what was picked, or `onCancel`.
 *
 * Open… hands on what it was given unread, a pasted link included: what it is is the finding's to say.
 */
export function PlaceChooser({
	purpose,
	start,
	onChoose,
	onCancel,
}: {
	purpose: Purpose;
	/** the folder it opens in, `~` allowed */
	start: string;
	onChoose: (path: string) => void;
	onCancel: () => void;
}) {
	const native = desktopWindow()?.chooseDirectory;
	return native === undefined ? (
		<InAppChooser purpose={purpose} start={start} onChoose={onChoose} onCancel={onCancel} />
	) : (
		<NativeChooser choose={native} purpose={purpose} start={start} onChoose={onChoose} onCancel={onCancel} />
	);
}

function NativeChooser({
	choose,
	purpose,
	start,
	onChoose,
	onCancel,
}: {
	choose: NonNullable<DesktopWindow["chooseDirectory"]>;
	purpose: Purpose;
	start: string;
	onChoose: (path: string) => void;
	onCancel: () => void;
}) {
	const answer = useRef({ onChoose, onCancel });
	answer.current = { onChoose, onCancel };
	const asked = useRef(false);
	useEffect(() => {
		if (asked.current) return;
		asked.current = true;
		let live = true;
		void choose({ purpose, defaultPath: start })
			.catch(() => null)
			.then((path) => {
				if (!live) return;
				if (path === null) answer.current.onCancel();
				else answer.current.onChoose(path);
			});
		return () => {
			live = false;
		};
	}, [choose, purpose, start]);
	return null;
}

/** A path or a link someone typed or pasted, which Open… takes as it is. */
const typedIn = (text: string) => /^(?:[/~]|[a-z][a-z0-9+.-]*:\/\/|[\w.-]+@[\w.-]+:)/iu.test(text);

function InAppChooser({
	purpose,
	start,
	onChoose,
	onCancel,
}: {
	purpose: Purpose;
	start: string;
	onChoose: (path: string) => void;
	onCancel: () => void;
}) {
	const opening = purpose === "open";
	const folder = useFolderBrowser(start, { files: opening });
	const dialog = useRef<HTMLDialogElement>(null);
	const crumbsRef = useRef<HTMLElement>(null);
	const term = folder.query.trim();
	const display = (path: string) => (folder.home ? shortPath(path, folder.home) : path);
	const crumbs = folder.listing && folder.home ? crumbsOf(folder.listing.path, folder.home) : [];
	const target = folder.target;
	// Open… hands a typed path or link on as it is; the finding says what it is
	const handOn = opening && typedIn(term) ? term : undefined;
	const chosen = handOn ?? target?.path;
	useLayoutEffect(() => {
		const modal = dialog.current;
		const previous = document.activeElement;
		modal?.showModal();
		return () => {
			modal?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	useLayoutEffect(() => {
		if (folder.listing && crumbsRef.current) crumbsRef.current.scrollLeft = crumbsRef.current.scrollWidth;
	}, [folder.listing]);
	const up = () => {
		if (!folder.pending && folder.listing?.parent) void folder.browse(folder.listing.parent);
	};
	const confirm = () => {
		if (chosen === undefined || (handOn === undefined && folder.pending)) return;
		onChoose(chosen);
	};
	const enter = (row: FolderRow) => {
		if (row.file) onChoose(row.path);
		else void folder.browse(row.path);
	};
	const notice = handOn === undefined ? folder.notice : null;
	return (
		<Dialog
			native
			ref={dialog}
			width="free"
			padded={false}
			className="w-[520px]"
			aria-label={opening ? "Open" : "Choose a folder"}
			onCancel={(event) => {
				event.preventDefault();
				if (folder.query) folder.setQuery("");
				else onCancel();
			}}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<div className="flex items-center gap-1 border-line-default border-b px-3 pt-3 pb-2">
				<IconButton
					size="sm"
					icon={<BackIcon />}
					label="Parent folder"
					disabled={folder.pending || !folder.listing?.parent}
					onClick={up}
				/>
				<nav
					ref={crumbsRef}
					aria-label="Folder location"
					className="flex min-w-0 flex-1 overflow-x-auto text-secondary type-value [scrollbar-width:none]"
				>
					{crumbs.map((crumb) => (
						<button
							type="button"
							key={crumb.path}
							className="shrink-0 rounded-xs focus-ring hover:text-primary"
							onClick={() => void folder.browse(crumb.path)}
						>
							{crumb.label}
							{crumb.label === "/" ? "" : "/"}
						</button>
					))}
				</nav>
			</div>
			<div className="px-3 pt-3">
				<TextField
					size="md"
					mono
					icon={<SearchIcon className="size-3" />}
					label={opening ? "Search, or paste a path or a link" : "Search, or paste a path"}
					placeholder={opening ? "Search, or paste a path or a link" : "Search, or paste a path"}
					value={folder.query}
					onValueChange={folder.setQuery}
					inputProps={{
						ref: folder.input,
						autoFocus: true,
						autoComplete: "off",
						onKeyDown: (event) => {
							if (event.nativeEvent.isComposing) return;
							if (event.key === "ArrowDown" || event.key === "ArrowUp") {
								event.preventDefault();
								const step = event.key === "ArrowDown" ? 1 : -1;
								folder.select(Math.max(-1, Math.min(folder.rows.length - 1, folder.at + step)));
							} else if (event.key === "Enter") {
								event.preventDefault();
								confirm();
							} else if (
								event.key === "ArrowRight" &&
								!folder.query &&
								target !== undefined &&
								"matched" in target
							) {
								event.preventDefault();
								enter(target);
							} else if ((event.key === "Backspace" || event.key === "ArrowLeft") && !folder.query) {
								event.preventDefault();
								up();
							}
						},
					}}
				/>
			</div>
			<div
				ref={folder.list}
				role="listbox"
				aria-label={opening ? "Folders and .spool files" : "Folders"}
				aria-busy={folder.pending}
				className="mt-2 h-[min(360px,50dvh)] overflow-auto px-1.5 pb-1.5"
			>
				{folder.rows.map((row, index) => (
					<ListRow
						key={row.path}
						size="lg"
						tone="raised"
						data-at={index}
						marked={target?.path === row.path}
						className={cn(target?.path === row.path && "bg-state-selected-strong")}
						icon={row.file ? SpoolFileIcon : FolderIcon}
						lit={row.isProject}
						label={
							<>
								{row.name}
								{term !== "" && !row.file && (
									<span className="ml-3 text-secondary type-detail">{display(row.parent)}</span>
								)}
							</>
						}
						decor={
							<button
								type="button"
								role="option"
								aria-selected={target?.path === row.path}
								aria-label={`Select ${row.name}`}
								onClick={() => folder.select(index)}
								onDoubleClick={() => enter(row)}
								className="absolute inset-0 z-1 focus-ring-inset"
							/>
						}
						trailing={
							row.file ? undefined : (
								<IconButton
									size="sm"
									icon={<ChevronIcon />}
									label={`Browse ${row.name}`}
									onClick={() => void folder.browse(row.path)}
								/>
							)
						}
					/>
				))}
				{folder.rows.length === 0 && (
					<p className="px-3 pt-3 text-secondary type-control">
						{handOn !== undefined
							? "Open takes it as it is."
							: folder.pending
								? "Loading…"
								: term
									? "Nothing here matches."
									: opening
										? "No folders or .spool files inside."
										: "No folders inside."}
					</p>
				)}
			</div>
			<DialogFooter className="justify-between border-line-default border-t px-4 py-3">
				<code className="min-w-0 truncate text-secondary type-detail" title={chosen}>
					{notice ?? (chosen === undefined ? "Choose a folder" : (handOn ?? display(chosen)))}
				</code>
				<div className="flex shrink-0 gap-2">
					<Button onClick={onCancel}>Cancel</Button>
					<Button
						variant="primary"
						disabled={chosen === undefined || (handOn === undefined && folder.pending)}
						onClick={confirm}
					>
						{opening ? "Open" : "Choose"}
					</Button>
				</div>
			</DialogFooter>
		</Dialog>
	);
}
