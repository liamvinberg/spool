import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isSafeName } from "../page-path";
import {
	browseDirectory,
	createDirectoryAt,
	createProjectAt,
	type FsHit,
	initProjectAt,
	type OpenOutcome,
	openProjectAt,
} from "./api";
import { cn } from "./cn";
import { type DirectoryRequest, desktopWindow } from "./desktop-window";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { ArrowRightIcon, BackIcon, ChevronIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { crumbsOf, shortPath } from "./picker-model";
import { useWriteSetting } from "./settings";
import { useFolderBrowser } from "./use-folder-browser";

type Step = "start" | "folder" | "location" | "name" | "directory";

/** One modal for creating a project, adding design to a folder, and opening existing work. */
export function ProjectPicker({
	initial = "folder",
	location,
	onOpened,
	onClose,
	onLocation,
}: {
	initial?: "start" | "folder" | "location";
	location?: string | undefined;
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
	onLocation?: (path: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
	const [step, setStep] = useState<Step>(initial);
	const [folderAction, setFolderAction] = useState<"add" | "open">("open");
	const nativeChoose = desktopWindow()?.chooseDirectory;
	const nativeStarted = useRef(false);
	const [returnTo, setReturnTo] = useState<"start" | "name">("start");
	const [name, setName] = useState("");
	const [chosenLocation, setLocation] = useState<string | null>(null);
	const [directoryName, setDirectoryName] = useState("");
	const [useAsDefault, setUseAsDefault] = useState(false);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const working = useRef(false);
	const mounted = useRef(true);
	const dialog = useRef<HTMLDialogElement>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const crumbsRef = useRef<HTMLElement>(null);
	const [initialPath] = useState(initial === "start" ? "~" : (location ?? "~"));
	const folder = useFolderBrowser(initialPath);
	const writeSetting = useWriteSetting();
	const parent = chosenLocation ?? location;
	const browsing = step === "folder" || step === "location";
	const display = (path: string) => (folder.home ? shortPath(path, folder.home) : path);
	const target = folder.target;
	const crumbs = folder.listing && folder.home ? crumbsOf(folder.listing.path, folder.home) : [];
	const canCreate = parent !== undefined && (name.trim() === "" || isSafeName(name.trim()));
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
		if (!nativeChoose || initial === "start" || nativeStarted.current) return;
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
		else
			throw new Error(
				outcome.kind === "error"
					? outcome.message
					: "This folder has no Spool project. Use Add spool to a folder to start one here.",
			);
	}
	function move(next: Step) {
		setNotice(null);
		setStep(next);
	}
	function back() {
		if (working.current) return;
		if (step === "location" && onLocation === undefined) move(returnTo);
		else if (step === "directory") move("location");
		else if (step === "name") move("folder");
		else if (step === "folder" && initial === "start") move("start");
		else onClose();
	}
	function up() {
		if (!busy && folder.listing?.parent) void folder.browse(folder.listing.parent);
	}
	function create() {
		if (canCreate && parent !== undefined)
			void run(async () => {
				if (nativeChoose && useAsDefault) {
					const written = await writeSetting("projects.location", parent);
					if (!written.ok) throw new Error(written.reason);
				}
				opened(await createProjectAt(parent, name.trim()));
			});
	}
	function chooseNative(purpose: DirectoryRequest["purpose"], closeOnCancel = false) {
		if (!nativeChoose) return;
		void run(async () => {
			const path = await nativeChoose({ purpose, defaultPath: purpose === "location" ? (parent ?? "~") : "~" });
			if (!mounted.current) return;
			if (path === null) {
				if (closeOnCancel) onClose();
				return;
			}
			if (purpose === "location") {
				if (onLocation) {
					const result = await onLocation(path);
					if (!result.ok) throw new Error(result.reason ?? "Could not save this location.");
					if (mounted.current) onClose();
				} else setLocation(path);
			} else if (purpose === "open") opened(await openProjectAt(path));
			else {
				const current = await browseDirectory(path);
				if (!current) throw new Error("This folder is no longer available. Choose another folder.");
				if (mounted.current)
					opened(await (current.isProject ? openProjectAt(current.path) : initProjectAt(current.path)));
			}
		});
	}
	function chooseFolder(action: "add" | "open") {
		setFolderAction(action);
		if (nativeChoose) chooseNative(action);
		else move("folder");
	}
	function chooseLocation() {
		if (parent === undefined) return;
		if (nativeChoose) {
			chooseNative("location");
			return;
		}
		setReturnTo(step === "name" ? "name" : "start");
		setUseAsDefault(false);
		move("location");
		void folder.browse(parent);
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
			if (step === "location") {
				if (onLocation) {
					const result = await onLocation(current.path);
					if (!result.ok) throw new Error(result.reason ?? "Could not save this location.");
					if (mounted.current) onClose();
				} else {
					if (useAsDefault) {
						const written = await writeSetting("projects.location", current.path);
						if (!written.ok) throw new Error(written.reason);
					}
					if (mounted.current) {
						setLocation(current.path);
						move(returnTo);
					}
				}
			} else if (folderAction === "open") opened(await openProjectAt(current.path));
			else if (current.isProject !== target.isProject) {
				await folder.browse(current.path);
				throw new Error("This folder changed. Check its action and try again.");
			} else opened(await (current.isProject ? openProjectAt(current.path) : initProjectAt(current.path)));
		});
	}
	const label =
		step === "location"
			? onLocation
				? "Save projects here"
				: "Choose location"
			: folderAction === "open" || target?.isProject
				? "Open project"
				: "Add spool here";
	const fields = (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				create();
			}}
		>
			<fieldset disabled={busy}>
				<div className="picker-name-field flex items-center gap-[14px] py-[16px] px-[20px] h-[64px] [&>svg]:size-[20px] [&>svg]:text-thread [&_input]:w-full [&_input]:[outline:none] [&_input]:bg-transparent [&_input]:text-text [&_input]:[font:var(--type-title)] [&_input]:caret-thread [&_input::placeholder]:text-muted [.picker-expanded_&]:h-[58px] [.picker-expanded_&_input]:[font:var(--type-control)] [.picker-expanded_&>svg]:size-[18px]">
					<PlusIcon />
					<input
						ref={nameInput}
						aria-label="Project name (optional)"
						placeholder="Project name (optional)"
						value={name}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => {
							setName(event.target.value);
							setNotice(null);
						}}
					/>
				</div>
				<div className="picker-name-bottom flex justify-between gap-[16px] pt-0 px-[20px] pb-[18px] items-center [@media(max-width:480px)]:flex-wrap">
					<button
						type="button"
						className="picker-location-link flex items-center gap-[8px] min-w-0 text-muted [font:var(--type-detail)] [&>span]:truncate [&_svg:last-child]:size-[10px] [@media(max-width:480px)]:max-w-full"
						onClick={chooseLocation}
						disabled={parent === undefined}
						aria-label="Choose project location"
						title={parent}
					>
						<FolderIcon />
						{parent === undefined ? <span>Loading…</span> : <PickerPath path={display(parent)} />}
						<ChevronIcon />
					</button>
					<button
						type="submit"
						className="picker-primary inline-flex items-center justify-center shrink-0 gap-[12px] h-[30px] py-0 px-[10px] bg-text text-bg rounded-sm [font:var(--type-control)] disabled:opacity-35 disabled:cursor-default [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-muted))]"
						disabled={!canCreate}
					>
						{busy ? "Creating…" : "Create project"}
						<ArrowRightIcon />
					</button>
				</div>
				{nativeChoose && chosenLocation !== null && (
					<label className="picker-default flex items-center gap-[6px] mt-[4px] text-muted [font:var(--type-label)] [&_input]:size-[12px] [&_input]:accent-thread picker-native-default [&]:mt-0 mx-[20px] mb-[18px]">
						<input
							type="checkbox"
							checked={useAsDefault}
							onChange={(event) => setUseAsDefault(event.target.checked)}
						/>
						Use for future projects
					</label>
				)}
				{name.trim() !== "" && !isSafeName(name.trim()) && (
					<p className="picker-error m-0 pt-[10px] px-[20px] pb-[16px] text-thread [font:var(--type-label)]">
						Use a name without slashes or a leading dot.
					</p>
				)}
			</fieldset>
		</form>
	);

	return (
		<dialog
			ref={dialog}
			className="project-picker fixed m-auto inset-0 p-0 w-[520px] max-w-[calc(100vw-48px)] max-h-[calc(100dvh-48px)] border border-border-raised rounded-lg text-text bg-surface overflow-auto [outline:none] backdrop:bg-[color-mix(in_srgb,var(--color-bg)_70%,transparent)] [&_button]:cursor-pointer [&_button:focus-visible]:[outline:1px_solid_var(--color-thread)] [&_button:focus-visible]:outline-offset-[-3px] [&_:where(svg)]:size-[14px] [&_svg]:shrink-0 [&_fieldset]:border-0 [&_fieldset]:p-0 [&_fieldset]:min-w-0 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-40"
			tabIndex={-1}
			aria-label={
				browsing
					? step === "location"
						? "Choose a save location"
						: "Choose a project folder"
					: step === "directory"
						? "New folder"
						: "New project"
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
					<button
						type="button"
						className="picker-primary inline-flex items-center justify-center shrink-0 gap-[12px] h-[30px] py-0 px-[10px] bg-text text-bg rounded-sm [font:var(--type-control)] disabled:opacity-35 disabled:cursor-default [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-muted))]"
						disabled={busy}
						onClick={() => chooseNative(step === "location" ? "location" : "open", true)}
					>
						{busy ? "Choosing…" : "Choose folder…"}
					</button>
				</div>
			) : browsing ? (
				<>
					<div className="picker-field flex items-center gap-[8px] h-[52px] py-0 px-[16px] [&>button]:flex [&>button]:justify-center [&>button]:items-center [&>button]:shrink-0 [&>button]:size-[24px] [&>button]:rounded-sm [&>button]:text-muted [&>button:first-child]:ml-[-4px] [&>button:hover]:bg-raised [&>button:hover]:text-text [&>.picker-plus]:text-thread [&_.picker-search-icon]:size-[12px] [&_.picker-search-icon]:text-muted [&_.picker-search-icon]:opacity-60 [&_input]:[outline:none] [&_input]:min-w-0 [&_input]:flex-1 [&_input]:text-text [&_input]:bg-transparent [&_input]:caret-thread [&_input]:[font:var(--type-code-input)] [&_input::placeholder]:text-muted [&_input::placeholder]:opacity-50 [&>code]:[font:var(--type-detail)] [&>code]:text-muted">
						<button
							type="button"
							aria-label="Parent folder"
							title="Go up one folder"
							disabled={busy || folder.pending || !folder.listing?.parent}
							onClick={up}
						>
							<BackIcon />
						</button>
						<SearchIcon className="picker-search-icon" />
						{!folder.query && (
							<nav
								ref={crumbsRef}
								className="picker-crumbs flex shrink overflow-x-auto max-w-[66%] [scrollbar-width:none] [font:var(--type-code-input)] text-muted [&_button:hover]:text-text [&_button]:shrink-0 [@media(max-width:480px)]:max-w-[55%]"
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
						<button
							type="button"
							className="picker-plus"
							aria-label={step === "location" ? "New folder here" : "New project inside this folder"}
							title={
								folder.listing
									? `New ${step === "location" ? "folder" : "project"} inside ${display(folder.listing.path)}`
									: undefined
							}
							disabled={busy || folder.pending || !folder.listing}
							onClick={() => {
								if (!folder.listing) return;
								if (step === "location") {
									setDirectoryName("");
									move("directory");
								} else {
									setName("");
									setLocation(folder.listing.path);
									move("name");
								}
							}}
						>
							<PlusIcon />
						</button>
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
							<p className="picker-nothing text-muted [font:var(--type-control)] pt-[12px] px-[16px] pb-[18px]">
								{folder.pending
									? "Loading folders…"
									: folder.query
										? "No matching folders."
										: "No folders inside."}
							</p>
						)}
					</div>
					<div className="picker-footer border-t border-border-raised py-[12px] px-[16px] flex items-center justify-between gap-[16px] [font:var(--type-control)] [&>div]:flex [&>div]:flex-col [&>div]:min-w-0 [&>div]:gap-[5px] [&_code]:truncate [&_code]:[font:var(--type-detail)] [&_span]:text-muted [&_span]:[font:var(--type-label)] [&_.picker-path>span]:text-text [&_.picker-path>span]:[font:var(--type-detail)] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:[&>div]:basis-full [@media(max-width:480px)]:[&>button]:ml-auto">
						<div>
							<code title={target?.path}>
								{target ? <PickerPath path={display(target.path)} /> : "Choose a folder"}
							</code>
							<span>
								{step === "location"
									? onLocation
										? "New projects will start here."
										: `Creates ${name.trim() || "untitled"} inside this folder.`
									: folderAction === "open"
										? "Opens an existing spool project."
										: target?.isProject
											? "Existing spool project."
											: "Adds a design folder here."}
							</span>
							{step === "location" && !onLocation && (
								<label className="picker-default flex items-center gap-[6px] mt-[4px] text-muted [font:var(--type-label)] [&_input]:size-[12px] [&_input]:accent-thread">
									<input
										type="checkbox"
										checked={useAsDefault}
										disabled={busy}
										onChange={(event) => setUseAsDefault(event.target.checked)}
									/>
									Use for future projects
								</label>
							)}
						</div>
						<button
							type="button"
							className="picker-primary inline-flex items-center justify-center shrink-0 gap-[12px] h-[30px] py-0 px-[10px] bg-text text-bg rounded-sm [font:var(--type-control)] disabled:opacity-35 disabled:cursor-default [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-muted))]"
							disabled={busy || folder.pending || target === undefined}
							onClick={confirm}
						>
							{busy ? "Working…" : label}
							<ArrowRightIcon />
						</button>
					</div>
				</>
			) : step === "directory" ? (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						createDirectory();
					}}
				>
					<fieldset disabled={busy}>
						<div className="picker-small-heading flex items-center gap-[10px] pt-[14px] px-[16px] pb-0 [font:var(--type-control)] [&>button]:text-muted [&>button]:p-[4px] [&>button]:ml-[-4px] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-[6px]">
							<button type="button" aria-label="Back" onClick={back}>
								<BackIcon />
							</button>
							<span>New folder</span>
						</div>
						<div className="picker-name-field flex items-center gap-[14px] py-[16px] px-[20px] h-[64px] [&>svg]:size-[20px] [&>svg]:text-thread [&_input]:w-full [&_input]:[outline:none] [&_input]:bg-transparent [&_input]:text-text [&_input]:[font:var(--type-title)] [&_input]:caret-thread [&_input::placeholder]:text-muted [.picker-expanded_&]:h-[58px] [.picker-expanded_&_input]:[font:var(--type-control)] [.picker-expanded_&>svg]:size-[18px]">
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
							<button
								type="submit"
								className="picker-primary inline-flex items-center justify-center shrink-0 gap-[12px] h-[30px] py-0 px-[10px] bg-text text-bg rounded-sm [font:var(--type-control)] disabled:opacity-35 disabled:cursor-default [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-muted))]"
								disabled={!isSafeName(directoryName.trim())}
							>
								{busy ? "Creating…" : "Create folder"}
								<ArrowRightIcon />
							</button>
						</div>
					</fieldset>
				</form>
			) : step === "name" ? (
				<>
					<div className="picker-small-heading flex items-center gap-[10px] pt-[14px] px-[16px] pb-0 [font:var(--type-control)] [&>button]:text-muted [&>button]:p-[4px] [&>button]:ml-[-4px] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-[6px]">
						<button type="button" aria-label="Back" disabled={busy} onClick={back}>
							<BackIcon />
						</button>
						<span>New project here</span>
						<span className="picker-untitled-hint ml-auto text-muted [font:var(--type-label)] [@media(max-width:480px)]:ml-0">
							Blank name becomes untitled.
						</span>
					</div>
					{fields}
				</>
			) : (
				<>
					<div className="picker-expanded border-b border-border-raised">
						<div className="picker-expanded-title flex items-center justify-between pt-[20px] px-[20px] pb-0 [font:var(--type-title)] [&>span]:[font:var(--type-label)] [&>span]:text-muted [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-[6px]">
							Start designing<span>Blank name becomes untitled.</span>
						</div>
						{fields}
					</div>
					<div className="picker-choices p-[6px]">
						<Choice
							title="Add spool to a folder"
							description="Start designing inside an existing codebase or folder."
							disabled={busy}
							onClick={() => chooseFolder("add")}
						/>
						<Choice
							title="Open a spool project"
							description="Pick a folder that already has a spool design."
							disabled={busy}
							onClick={() => chooseFolder("open")}
						/>
					</div>
				</>
			)}
			{(notice || (browsing && !nativeChoose && folder.notice)) && (
				<p
					className="picker-error m-0 pt-[10px] px-[20px] pb-[16px] text-thread [font:var(--type-label)]"
					role="alert"
				>
					{notice ?? folder.notice}
				</p>
			)}
		</dialog>
	);
}

function Choice({
	title,
	description,
	disabled,
	onClick,
}: {
	title: string;
	description: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="picker-choice flex items-center gap-[16px] w-full py-[16px] px-[14px] rounded-sm text-left [&:hover]:bg-raised [&>svg]:size-[18px] [&>svg]:text-muted [&>svg:last-child]:w-[14px] [&>span]:flex [&>span]:flex-1 [&>span]:flex-col [&>span]:gap-[6px] [&_strong]:[font:var(--type-title)] [&_small]:text-muted [&_small]:[font:var(--type-label)]"
			disabled={disabled}
			onClick={onClick}
		>
			<FolderIcon />
			<span>
				<strong>{title}</strong>
				<small>{description}</small>
			</span>
			<ArrowRightIcon />
		</button>
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
		<div
			className={cn(
				"picker-folder-row flex relative h-[36px] [&:hover]:bg-raised [&.is-selected]:bg-raised [&.is-selected]:before:content-[''] [&.is-selected]:before:w-[2px] [&.is-selected]:before:rounded-[2px] [&.is-selected]:before:absolute [&.is-selected]:before:left-0 [&.is-selected]:before:top-[4px] [&.is-selected]:before:bottom-[4px] [&.is-selected]:before:bg-thread [&_button]:flex [&_button]:items-center [&>button:first-child]:min-w-0 [&>button:first-child]:flex-1 [&>button:first-child]:py-0 [&>button:first-child]:px-[16px] [&>button:first-child]:gap-[12px] [&>button:first-child]:text-left [&>button:first-child]:[font:var(--type-control)] [&>button:first-child>span]:flex-1 [&>button:first-child>span]:truncate [&>button:first-child>svg]:text-muted [&>button:first-child>svg]:opacity-50 [&>button:first-child>svg]:size-[12px] [&>button:first-child>.is-project]:text-thread [&>button:first-child>.is-project]:opacity-90 [&_code]:[font:var(--type-detail)] [&_code]:text-muted [&_code]:truncate [&_code]:max-w-[45%] [&>button:last-child]:py-0 [&>button:last-child]:pr-[16px] [&>button:last-child]:pl-[8px] [&>button:last-child]:text-muted [&>button:last-child>svg]:size-[11px]",
				selected ? "is-selected" : "",
			)}
			data-at={index}
		>
			<button
				type="button"
				role="option"
				aria-selected={selected}
				aria-label={`Select ${row.name}`}
				disabled={disabled}
				onClick={onSelect}
				onDoubleClick={onBrowse}
			>
				<FolderIcon className={row.isProject ? "is-project" : ""} />
				<span>{row.name}</span>
				{searching && <code>{display(row.parent)}</code>}
				{row.frames !== undefined && <code>{row.frames} frames</code>}
			</button>
			<button type="button" aria-label={`Browse ${row.name}`} disabled={disabled} onClick={onBrowse}>
				<ChevronIcon />
			</button>
		</div>
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
