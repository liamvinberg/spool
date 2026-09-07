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
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { ArrowRightIcon, BackIcon, ChevronIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { crumbsOf, shortPath } from "./picker-model";
import { useWriteSetting } from "./settings";
import { useFolderBrowser } from "./use-folder-browser";
import "./picker.css";

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
		if (busy) return;
		if (browsing) folder.input.current?.focus();
		else nameInput.current?.focus();
	}, [browsing, busy, folder.input]);

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
					: "This folder no longer has a spool project. Choose it again to add spool.",
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
		if (canCreate && parent !== undefined) void run(async () => opened(await createProjectAt(parent, name.trim())));
	}
	function chooseLocation() {
		if (parent === undefined) return;
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
			} else if (current.isProject !== target.isProject) {
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
			: target?.isProject
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
				<div className="picker-name-field">
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
				<div className="picker-name-bottom">
					<button
						type="button"
						className="picker-location-link"
						onClick={chooseLocation}
						disabled={parent === undefined}
						aria-label="Choose project location"
						title={parent}
					>
						<FolderIcon />
						{parent === undefined ? <span>Loading…</span> : <PickerPath path={display(parent)} />}
						<ChevronIcon />
					</button>
					<button type="submit" className="picker-primary" disabled={!canCreate}>
						{busy ? "Creating…" : "Create project"}
						<ArrowRightIcon />
					</button>
				</div>
				{name.trim() !== "" && !isSafeName(name.trim()) && (
					<p className="picker-error">Use a name without slashes or a leading dot.</p>
				)}
			</fieldset>
		</form>
	);

	return (
		<dialog
			ref={dialog}
			className="project-picker"
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
			{browsing ? (
				<>
					<div className="picker-field">
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
							<nav ref={crumbsRef} className="picker-crumbs" aria-label="Folder location">
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
						className="picker-folders"
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
							<p className="picker-nothing">
								{folder.pending
									? "Loading folders…"
									: folder.query
										? "No matching folders."
										: "No folders inside."}
							</p>
						)}
					</div>
					<div className="picker-footer">
						<div>
							<code title={target?.path}>
								{target ? <PickerPath path={display(target.path)} /> : "Choose a folder"}
							</code>
							<span>
								{step === "location"
									? onLocation
										? "New projects will start here."
										: `Creates ${name.trim() || "untitled"} inside this folder.`
									: target?.isProject
										? "Existing spool project."
										: "Adds a design folder here."}
							</span>
							{step === "location" && !onLocation && (
								<label className="picker-default">
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
							className="picker-primary"
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
						<div className="picker-small-heading">
							<button type="button" aria-label="Back" onClick={back}>
								<BackIcon />
							</button>
							<span>New folder</span>
						</div>
						<div className="picker-name-field">
							<FolderIcon />
							<input
								ref={nameInput}
								aria-label="Folder name"
								placeholder="Folder name"
								value={directoryName}
								onChange={(event) => setDirectoryName(event.target.value)}
							/>
						</div>
						<div className="picker-name-bottom">
							<code>{folder.listing && display(folder.listing.path)}</code>
							<button type="submit" className="picker-primary" disabled={!isSafeName(directoryName.trim())}>
								{busy ? "Creating…" : "Create folder"}
								<ArrowRightIcon />
							</button>
						</div>
					</fieldset>
				</form>
			) : step === "name" ? (
				<>
					<div className="picker-small-heading">
						<button type="button" aria-label="Back" disabled={busy} onClick={back}>
							<BackIcon />
						</button>
						<span>New project here</span>
						<span className="picker-untitled-hint">Blank name becomes untitled.</span>
					</div>
					{fields}
				</>
			) : (
				<>
					<div className="picker-expanded">
						<div className="picker-expanded-title">
							Start designing<span>Blank name becomes untitled.</span>
						</div>
						{fields}
					</div>
					<div className="picker-choices">
						<Choice
							title="Add spool to a folder"
							description="Start designing inside an existing codebase or folder."
							disabled={busy}
							onClick={() => move("folder")}
						/>
						<Choice
							title="Open a spool project"
							description="Pick a folder that already has a spool design."
							disabled={busy}
							onClick={() => move("folder")}
						/>
					</div>
				</>
			)}
			{(notice || (browsing && folder.notice)) && (
				<p className="picker-error" role="alert">
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
		<button type="button" className="picker-choice" disabled={disabled} onClick={onClick}>
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
		<div className={`picker-folder-row ${selected ? "is-selected" : ""}`} data-at={index}>
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
		<span className="picker-path">
			<span>{path.slice(0, split)}</span>
			<span>{path.slice(split)}</span>
		</span>
	);
}
