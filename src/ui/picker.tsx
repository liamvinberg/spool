import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isSafeName } from "../page-path";
import { browseDirectory, createDirectoryAt, type FsHit, type OpenOutcome, openProjectAt } from "./api";
import { cn } from "./cn";
import { type DirectoryRequest, desktopWindow } from "./desktop-window";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { ArrowRightIcon, BackIcon, ChevronIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { crumbsOf, shortPath } from "./folder-paths";
import { Button, IconButton } from "./primitives/actions";
import { Dialog } from "./primitives/overlays";
import { ListRow } from "./primitives/structure";
import { useFolderBrowser } from "./use-folder-browser";

type Step = "folder" | "location" | "directory";

/** One modal for opening existing work and for choosing a location. */
export function ProjectPicker({
	initial = "folder",
	location,
	onOpened,
	onClose,
	onLocation,
}: {
	initial?: "folder" | "location";
	location?: string | undefined;
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
	onLocation?: (path: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
	const [step, setStep] = useState<Step>(initial);
	const nativeChoose = desktopWindow()?.chooseDirectory;
	const nativeStarted = useRef(false);
	const [directoryName, setDirectoryName] = useState("");
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const working = useRef(false);
	const mounted = useRef(true);
	const dialog = useRef<HTMLDialogElement>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const crumbsRef = useRef<HTMLElement>(null);
	const [initialPath] = useState(location ?? "~");
	const folder = useFolderBrowser(initialPath);
	const browsing = step === "folder" || step === "location";
	const display = (path: string) => (folder.home ? shortPath(path, folder.home) : path);
	const target = folder.target;
	const crumbs = folder.listing && folder.home ? crumbsOf(folder.listing.path, folder.home) : [];
	useLayoutEffect(() => {
		if (folder.listing && crumbsRef.current) crumbsRef.current.scrollLeft = crumbsRef.current.scrollWidth;
	}, [folder.listing]);

	useLayoutEffect(() => {
		const previous = document.activeElement;
		const modal = dialog.current;
		modal?.showModal();
		return () => {
			modal?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "picker", handlers: {} }), []);
	useEffect(() => {
		if (!nativeChoose || nativeStarted.current) return;
		nativeStarted.current = true;
		chooseNative(initial === "location" ? "location" : "open", true);
	});
	useEffect(() => {
		if (busy || (browsing && folder.browsing)) return;
		if (browsing) folder.input.current?.focus();
		else nameInput.current?.focus();
	}, [browsing, busy, folder.browsing, folder.input]);

	async function run(action: () => Promise<void>) {
		if (working.current) return;
		working.current = true;
		setBusy(true);
		setNotice(null);
		try {
			await action();
		} catch (error) {
			if (mounted.current) setNotice(error instanceof Error ? error.message : "Could not finish. Try again.");
		} finally {
			working.current = false;
			if (mounted.current) {
				setBusy(false);
				if (browsing) folder.input.current?.focus();
				else nameInput.current?.focus();
			}
		}
	}
	function opened(outcome: OpenOutcome) {
		if (!mounted.current) return;
		if (outcome.kind === "opened") onOpened(outcome);
		else throw new Error(outcome.kind === "error" ? outcome.message : "This folder has no spool project.");
	}
	function move(next: Step) {
		setNotice(null);
		setStep(next);
	}
	function back() {
		if (working.current) return;
		if (step === "directory") move("location");
		else onClose();
	}
	function up() {
		if (!busy && folder.listing?.parent) void folder.browse(folder.listing.parent);
	}
	function chooseNative(purpose: Extract<DirectoryRequest["purpose"], "location" | "open">, closeOnCancel = false) {
		if (!nativeChoose) return;
		void run(async () => {
			const path = await nativeChoose({ purpose, defaultPath: purpose === "location" ? (location ?? "~") : "~" });
			if (!mounted.current) return;
			if (path === null) {
				if (closeOnCancel) onClose();
				return;
			}
			if (purpose === "location") await saveLocation(path);
			else opened(await openProjectAt(path));
		});
	}
	async function saveLocation(path: string) {
		const result = await onLocation?.(path);
		if (result !== undefined && !result.ok) throw new Error(result.reason ?? "Could not save this location.");
		if (mounted.current) onClose();
	}
	function createDirectory() {
		if (!folder.listing || !isSafeName(directoryName.trim())) return;
		const path = folder.listing.path;
		void run(async () => {
			const created = await createDirectoryAt(path, directoryName.trim());
			if (mounted.current) {
				await folder.browse(created.path);
				move("location");
			}
		});
	}
	function confirm() {
		if (folder.pending || target === undefined) return;
		void run(async () => {
			// Selection may outlive the directory read. Verify its kind before doing the advertised operation.
			const current = await browseDirectory(target.path);
			if (!current) throw new Error("This folder is no longer available. Choose another folder.");
			if (!mounted.current) return;
			if (step === "location") await saveLocation(current.path);
			else opened(await openProjectAt(current.path));
		});
	}
	const label = step === "location" ? "Save projects here" : "Open project";
	return (
		<Dialog
			native
			ref={dialog}
			width="free"
			padded={false}
			className="fixed inset-0 w-[520px] [outline:none] [&_button]:cursor-pointer [&_button]:focus-ring-inset [&_:where(svg)]:size-[14px] [&_svg]:shrink-0 [&_fieldset]:border-0 [&_fieldset]:p-0 [&_fieldset]:min-w-0 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-40"
			tabIndex={-1}
			aria-label={
				browsing ? (step === "location" ? "Choose a save location" : "Choose a project folder") : "New folder"
			}
			onCancel={(event) => {
				event.preventDefault();
				back();
			}}
			onClick={(event) => {
				if (busy || event.target !== event.currentTarget) return;
				const rect = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < rect.left ||
					event.clientX > rect.right ||
					event.clientY < rect.top ||
					event.clientY > rect.bottom
				)
					back();
			}}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.nativeEvent.isComposing && event.key === "Enter") event.preventDefault();
				if (event.key === "Escape" && browsing && folder.query) {
					event.preventDefault();
					folder.setQuery("");
				}
			}}
		>
			{browsing && nativeChoose ? (
				<div className="picker-native flex items-center justify-between gap-[16px] p-[20px] [font:var(--type-title)]">
					<span>{step === "location" ? "Choose a save location" : "Open a spool project"}</span>
					<Button
						variant="primary"
						disabled={busy}
						onClick={() => chooseNative(step === "location" ? "location" : "open", true)}
					>
						{busy ? "Choosing…" : "Choose folder…"}
					</Button>
				</div>
			) : browsing ? (
				<>
					<div className="picker-field flex items-center gap-[8px] h-[52px] py-0 px-[16px] [&_.picker-search-icon]:size-[12px] [&_.picker-search-icon]:text-secondary [&_.picker-search-icon]:opacity-60 [&_input]:[outline:none] [&_input]:min-w-0 [&_input]:flex-1 [&_input]:text-primary [&_input]:bg-transparent [&_input]:caret-accent [&_input]:[font:var(--type-code-input)] [&_input::placeholder]:text-secondary [&_input::placeholder]:opacity-50 [&>code]:[font:var(--type-detail)] [&>code]:text-secondary">
						<IconButton
							size="sm"
							icon={<BackIcon />}
							label="Parent folder"
							title="Go up one folder"
							className="-ml-1"
							disabled={busy || folder.pending || !folder.listing?.parent}
							onClick={up}
						/>
						<SearchIcon className="picker-search-icon" />
						{!folder.query && (
							<nav
								ref={crumbsRef}
								className="picker-crumbs flex shrink overflow-x-auto max-w-[66%] [scrollbar-width:none] [font:var(--type-code-input)] text-secondary [&_button:hover]:text-primary [&_button]:shrink-0 [@media(max-width:480px)]:max-w-[55%]"
								aria-label="Folder location"
							>
								{crumbs.map((crumb) => (
									<button
										type="button"
										key={crumb.path}
										disabled={busy}
										onClick={() => void folder.browse(crumb.path)}
									>
										{crumb.label}
										{crumb.label === "/" ? "" : "/"}
									</button>
								))}
							</nav>
						)}
						<input
							ref={folder.input}
							aria-label="Search folders or paste a path"
							placeholder="Search…"
							autoComplete="off"
							spellCheck={false}
							value={folder.query}
							disabled={busy || folder.browsing}
							onChange={(event) => {
								setNotice(null);
								folder.setQuery(event.target.value);
							}}
							onKeyDown={(event) => {
								if (event.nativeEvent.isComposing || busy) return;
								if (event.key === "ArrowDown" || event.key === "ArrowUp") {
									event.preventDefault();
									folder.select(
										Math.max(
											-1,
											Math.min(folder.rows.length - 1, folder.at + (event.key === "ArrowDown" ? 1 : -1)),
										),
									);
								} else if (event.key === "Enter") {
									event.preventDefault();
									confirm();
								} else if (event.key === "ArrowRight" && !folder.query && target) {
									event.preventDefault();
									void folder.browse(target.path);
								} else if ((event.key === "Backspace" || event.key === "ArrowLeft") && !folder.query) {
									event.preventDefault();
									up();
								}
							}}
						/>
						{step === "location" && (
							<IconButton
								size="sm"
								icon={<PlusIcon />}
								label="New folder here"
								title={folder.listing ? `New folder inside ${display(folder.listing.path)}` : undefined}
								disabled={busy || folder.pending || !folder.listing}
								onClick={() => {
									if (!folder.listing) return;
									setDirectoryName("");
									move("directory");
								}}
							/>
						)}
					</div>
					<div
						ref={folder.list}
						className="picker-folders pt-0 px-0 pb-[6px] max-h-[50dvh] overflow-auto"
						role="listbox"
						aria-label="Folders"
						aria-busy={folder.pending}
					>
						{folder.rows.map((row, index) => (
							<FolderRow
								key={row.path}
								row={row}
								index={index}
								selected={target?.path === row.path}
								disabled={busy || folder.pending}
								searching={folder.query.trim() !== ""}
								display={display}
								onSelect={() => folder.select(index)}
								onBrowse={() => void folder.browse(row.path)}
							/>
						))}
						{folder.rows.length === 0 && (
							<p className="picker-nothing text-secondary [font:var(--type-control)] pt-[12px] px-[16px] pb-[18px]">
								{folder.pending
									? "Loading folders…"
									: folder.query
										? "No matching folders."
										: "No folders inside."}
							</p>
						)}
					</div>
					<div className="picker-footer border-t border-line-strong py-[12px] px-[16px] flex items-center justify-between gap-[16px] [font:var(--type-control)] [&>div]:flex [&>div]:flex-col [&>div]:min-w-0 [&>div]:gap-[5px] [&_code]:truncate [&_code]:[font:var(--type-detail)] [&>div>span]:text-secondary [&>div>span]:[font:var(--type-label)] [&_.picker-path>span]:text-primary [&_.picker-path>span]:[font:var(--type-detail)] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:[&>div]:basis-full [@media(max-width:480px)]:[&>button]:ml-auto">
						<div>
							<code title={target?.path}>
								{target ? <PickerPath path={display(target.path)} /> : "Choose a folder"}
							</code>
							<span>
								{step === "location" ? "New projects will start here." : "Opens an existing spool project."}
							</span>
						</div>
						<Button variant="primary" disabled={busy || folder.pending || target === undefined} onClick={confirm}>
							{busy ? "Working…" : label}
							<ArrowRightIcon />
						</Button>
					</div>
				</>
			) : (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						createDirectory();
					}}
				>
					<fieldset disabled={busy}>
						<div className="picker-small-heading flex items-center gap-[10px] pt-[14px] px-[16px] pb-0 [font:var(--type-control)] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-[6px]">
							<IconButton size="sm" icon={<BackIcon />} label="Back" className="-ml-1" onClick={back} />
							<span>New folder</span>
						</div>
						<div className="picker-name-field flex items-center gap-[14px] py-[16px] px-[20px] h-[64px] [&>svg]:size-[20px] [&>svg]:text-accent [&_input]:w-full [&_input]:[outline:none] [&_input]:bg-transparent [&_input]:text-primary [&_input]:[font:var(--type-title)] [&_input]:caret-accent [&_input::placeholder]:text-secondary [.picker-expanded_&]:h-[58px] [.picker-expanded_&_input]:[font:var(--type-control)] [.picker-expanded_&>svg]:size-[18px]">
							<FolderIcon />
							<input
								ref={nameInput}
								aria-label="Folder name"
								placeholder="Folder name"
								value={directoryName}
								onChange={(event) => setDirectoryName(event.target.value)}
							/>
						</div>
						<div className="picker-name-bottom flex justify-between gap-[16px] pt-0 px-[20px] pb-[18px] items-center [@media(max-width:480px)]:flex-wrap">
							<code>{folder.listing && display(folder.listing.path)}</code>
							<Button type="submit" variant="primary" disabled={!isSafeName(directoryName.trim())}>
								{busy ? "Creating…" : "Create folder"}
								<ArrowRightIcon />
							</Button>
						</div>
					</fieldset>
				</form>
			)}
			{(notice || (browsing && !nativeChoose && folder.notice)) && (
				<p
					className="picker-error m-0 pt-[10px] px-[20px] pb-[16px] text-accent [font:var(--type-label)]"
					role="alert"
				>
					{notice ?? folder.notice}
				</p>
			)}
		</Dialog>
	);
}

function FolderRow({
	row,
	index,
	selected,
	disabled,
	searching,
	display,
	onSelect,
	onBrowse,
}: {
	row: FsHit;
	index: number;
	selected: boolean;
	disabled: boolean;
	searching: boolean;
	display: (path: string) => string;
	onSelect: () => void;
	onBrowse: () => void;
}) {
	return (
		<ListRow
			size="lg"
			tone="raised"
			marked={selected}
			className={cn("picker-folder-row", selected && "bg-state-selected-strong")}
			data-at={index}
			icon={FolderIcon}
			lit={row.isProject}
			label={
				<>
					{row.name}
					{searching && <span className="ml-3 text-secondary type-detail">{display(row.parent)}</span>}
				</>
			}
			meta={row.frames === undefined ? undefined : `${row.frames} frames`}
			decor={
				<button
					type="button"
					role="option"
					aria-selected={selected}
					aria-label={`Select ${row.name}`}
					disabled={disabled}
					onClick={onSelect}
					onDoubleClick={onBrowse}
					className="absolute inset-0 z-1 focus-ring-inset"
				/>
			}
			trailing={
				<button
					type="button"
					aria-label={`Browse ${row.name}`}
					disabled={disabled}
					onClick={onBrowse}
					className="flex size-control-sm items-center justify-center rounded-xs text-secondary hover:text-primary focus-ring-inset [&>svg]:size-3"
				>
					<ChevronIcon />
				</button>
			}
		/>
	);
}

function PickerPath({ path }: { path: string }) {
	const split = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
	return (
		<span className="picker-path flex min-w-0 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:last-child]:shrink-0 [&>span:last-child]:max-w-[85%] [&>span:last-child]:truncate">
			<span>{path.slice(0, split)}</span>
			<span>{path.slice(split)}</span>
		</span>
	);
}
