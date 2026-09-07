import { type ReactNode, useEffect, useRef, useState } from "react";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { homeProjects, Thumbnail } from "shared/ui/spool/home-fixture";
import {
	ArrowRightIcon,
	BackIcon,
	ChevronIcon,
	FolderIcon,
	PlusIcon,
	RestartIcon,
	SearchIcon,
} from "shared/ui/spool/icons";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { SpoolShell } from "shared/ui/spool/shell";
import { EntryHome } from "./entry-home";
import "./folder-journey.css";

// Three entry layouts over one compact picker. All folders and writes are simulated.
export type FolderTake = "choices" | "name-first" | "folder-first";
export type FolderScene = "start" | "name" | "folder" | "new-here" | "open" | "ready";
export type FolderValues = {
	draft: string;
	parent: string;
	home: string;
	path: string;
	selected: string;
	resultRoot: string;
	resultKind: string;
	pickerClosed: string;
	hasResult: string;
};

type Directory = { path: string; frames?: number };
const DISK: readonly Directory[] = [
	{ path: "~" },
	{ path: "~/spool" },
	{ path: "~/spool/field-notes", frames: 8 },
	{ path: "~/spool/weekend-idea", frames: 3 },
	{ path: "~/projects" },
	{ path: "~/projects/coffee-shop" },
	{ path: "~/projects/coffee-shop/public" },
	{ path: "~/projects/coffee-shop/src" },
	{ path: "~/projects/portfolio" },
	{ path: "~/projects/tvärsö", frames: 24 },
	{ path: "~/projects/tvärsö/design" },
	{ path: "~/projects/tvärsö/src" },
	{ path: "~/Downloads" },
	{ path: "~/Downloads/shared-prototype", frames: 12 },
];
const leaf = (path: string) => path.split("/").at(-1) ?? path;
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "~");
const TITLES: Record<FolderTake, string> = {
	choices: "Three clear choices",
	"name-first": "Start designing, already expanded",
	"folder-first": "One picker, the folder decides",
};
const NOTES: Record<FolderTake, string> = {
	choices: "Closest to the old launcher. Choose the job, then give the name or folder.",
	"name-first": "My pick to try first. Optional naming is ready; the other two jobs stay visible below.",
	"folder-first": "The smallest entry. The plus starts fresh; a folder offers setup or open when selected.",
};

export function FolderJourney({
	take,
	scene,
	values,
	onChange,
	onScene,
	onFinish,
	onReset,
}: {
	take: FolderTake;
	scene: FolderScene;
	values: FolderValues;
	onChange: (patch: Partial<FolderValues>) => void;
	onScene: (scene: FolderScene) => void;
	onFinish: (root: string, kind: string) => void;
	onReset: () => void;
}) {
	const [closed, setClosed] = useState(values.pickerClosed === "true");
	const [locationFor, setLocationFor] = useState<"project" | "home" | null>(null);
	const [useAsDefault, setUseAsDefault] = useState(false);
	const [locationPath, setLocationPath] = useState(values.parent);
	const [locationSelection, setLocationSelection] = useState(values.parent);
	const [query, setQuery] = useState("");
	const [extraFolders, setExtraFolders] = useState<Directory[]>([]);
	const [newLocationFolder, setNewLocationFolder] = useState(false);
	const [folderName, setFolderName] = useState("");
	const dialog = useRef<HTMLDialogElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const ready = scene === "ready";
	const naming = scene === "name" || scene === "new-here";
	const embeddedName = scene === "start" && take === "name-first";
	const browsing =
		locationFor !== null || scene === "folder" || scene === "open" || (scene === "start" && take === "folder-first");
	const disk = [...DISK, ...extraFolders];
	const path = locationFor ? locationPath : values.path;
	const selected = locationFor ? locationSelection : values.selected;
	const target = selected || path;
	const targetDirectory = disk.find((item) => item.path === target);
	const isProject = targetDirectory?.frames !== undefined;
	const normalized = query.trim().replace(/\/$/, "");
	const rows = normalized
		? disk.filter((item) => item.path !== "~" && item.path.toLowerCase().includes(normalized.toLowerCase()))
		: disk.filter((item) => item.path !== path && parentOf(item.path) === path);
	const resultName = leaf(values.resultRoot);
	const visibleProjects = homeProjects.slice(0, 6);
	if (values.hasResult === "true" && !visibleProjects.some((project) => project.name === resultName)) {
		visibleProjects.unshift({
			root: values.resultRoot,
			name: resultName,
			openedAt: new Date().toISOString(),
			frameCount: values.resultKind === "open" ? 12 : 0,
			covers: [],
		});
	}
	const known = homeProjects.find((project) => project.name === "tvärsö");
	const cover = known?.covers[0];
	const cleanName = values.draft.trim() || "untitled";
	const nameValid = !/[\/\\]/.test(cleanName) && cleanName !== "." && cleanName !== "..";
	const proposedRoot = `${values.parent}/${cleanName}`;
	const collides = disk.some((item) => item.path === proposedRoot);

	useEffect(() => {
		if (closed || ready) return;
		dialog.current?.showModal();
		if (browsing || naming || embeddedName) input.current?.focus();
		else dialog.current?.focus();
	}, [closed, ready, browsing, naming, embeddedName, newLocationFolder]);

	function move(next: FolderScene) {
		setClosed(false);
		onChange({ pickerClosed: "false" });
		setQuery("");
		onScene(next);
	}
	function browse(next: string) {
		setQuery("");
		if (locationFor) {
			setLocationPath(next);
			setLocationSelection(next);
		} else onChange({ path: next, selected: next });
		input.current?.focus();
	}
	function select(next: string) {
		if (locationFor) setLocationSelection(next);
		else onChange({ selected: next });
		input.current?.focus();
	}
	function startFolder(open = false) {
		onChange({ path: "~/projects", selected: open ? "~/projects/tvärsö" : "~/projects/coffee-shop" });
		move(open ? "open" : "folder");
	}
	function startName(parent: string, here = false) {
		onChange({ parent, draft: "" });
		move(here ? "new-here" : "name");
	}
	function chooseLocation(kind: "project" | "home") {
		const initial = kind === "home" ? values.home : values.parent;
		setUseAsDefault(false);
		setLocationFor(kind);
		setLocationPath(initial);
		setLocationSelection(initial);
		setQuery("");
	}
	function confirmFolder() {
		if (locationFor) {
			onChange(locationFor === "home" || useAsDefault ? { home: target, parent: target } : { parent: target });
			setLocationFor(null);
			setQuery("");
		} else onFinish(target, isProject ? "open" : "setup");
	}
	function create() {
		if (nameValid && !collides) onFinish(proposedRoot, "create");
	}
	function back() {
		if (newLocationFolder) {
			setNewLocationFolder(false);
			return;
		}
		if (locationFor) {
			setLocationFor(null);
			setQuery("");
			return;
		}
		if (scene === "new-here") {
			move("folder");
			return;
		}
		if (scene !== "start") {
			move("start");
			return;
		}
		setClosed(true);
	}
	const action = locationFor
		? locationFor === "home"
			? "Save projects here"
			: "Choose location"
		: isProject
			? "Open project"
			: "Add spool here";

	const nameField = (
		<>
			<div className="fj-name-field">
				<PlusIcon />
				<input
					ref={input}
					aria-label="Project name (optional)"
					placeholder="Project name (optional)"
					value={values.draft}
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => onChange({ draft: event.target.value })}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							create();
						}
					}}
				/>
			</div>
			<div className="fj-name-bottom">
				<button
					type="button"
					className="fj-location-link"
					onClick={() => chooseLocation("project")}
					title="Choose where this project is created"
				>
					<FolderIcon />
					<span>{values.parent}</span>
					<ChevronIcon />
				</button>
				<button type="button" className="fj-primary" onClick={create} disabled={!nameValid || collides}>
					Create project <ArrowRightIcon />
				</button>
			</div>
			{(!nameValid || collides) && (
				<p className="fj-error" role="alert">
					{collides ? "That folder already exists. Choose another name." : "Use a name without slashes."}
				</p>
			)}
		</>
	);

	const folderChoices = (
		<>
			<Choice
				icon={<FolderIcon />}
				title="Add spool to a folder"
				description="Start designing inside an existing codebase or folder."
				onClick={() => startFolder()}
			/>
			<Choice
				icon={<FolderIcon />}
				title="Open a spool project"
				description="Pick a folder that already has a spool design."
				onClick={() => startFolder(true)}
			/>
		</>
	);

	return (
		<div className="fj-study">
			<div className="fj-app">
				<SpoolShell
					tabs={
						ready
							? ["tvärsö", "kaffe", ...(!["tvärsö", "kaffe"].includes(resultName) ? [resultName] : [])]
							: ["tvärsö", "kaffe"]
					}
					activeTab={ready ? resultName : undefined}
					canvasControls={ready}
					zoom="100%"
					onPick={() => move("start")}
					onHome={() => {
						onChange({ pickerClosed: "true" });
						onScene("start");
						setClosed(true);
					}}
					onFocus={(name) => onFinish(`~/projects/${name}`, "open")}
				>
					{ready ? (
						<CanvasChrome
							pages={
								values.resultKind === "open"
									? [{ name: "app", frames: ["home"], open: true, active: true }]
									: []
							}
							tool="none"
							rail={null}
						>
							{values.resultKind === "open" && cover ? (
								<div className="fj-existing">
									<span>home</span>
									<Thumbnail
										project="tvärsö"
										frame={cover.frame}
										cover={cover.cover}
										alt="Sample project canvas"
										className="h-full w-full"
									/>
								</div>
							) : (
								<ProjectEmpty project={resultName} root={values.resultRoot} />
							)}
						</CanvasChrome>
					) : (
						<EntryHome
							projects={visibleProjects}
							openInSidebar={false}
							location={values.home}
							headerActions={
								<>
									<button type="button" className="home-action" onClick={() => startFolder(true)}>
										Open…
									</button>
									<button
										type="button"
										className="home-action home-action-primary"
										onClick={() => move("start")}
									>
										<PlusIcon className="h-3 w-3" />
										New project…
									</button>
								</>
							}
							onStart={() => move("start")}
							onFolder={() => startFolder()}
							onChangeLocation={() => {
								setClosed(false);
								chooseLocation("home");
							}}
							onOpenProject={(project) => onFinish(`~/projects/${project.name}`, "open")}
							onForgetProject={() => {}}
						/>
					)}
				</SpoolShell>

				{!closed && !ready && (
					<dialog
						ref={dialog}
						tabIndex={-1}
						className="fj-panel"
						aria-label={
							browsing ? (locationFor ? "Choose a save location" : "Choose a project folder") : "New project"
						}
						onCancel={(event) => {
							event.preventDefault();
							back();
						}}
						onClick={(event) => {
							if (event.target === event.currentTarget) {
								const box = event.currentTarget.getBoundingClientRect();
								if (
									event.clientX < box.left ||
									event.clientX > box.right ||
									event.clientY < box.top ||
									event.clientY > box.bottom
								)
									setClosed(true);
							}
						}}
					>
						{newLocationFolder ? (
							<>
								<div className="fj-field">
									<button type="button" aria-label="Back" onClick={back}>
										<BackIcon />
									</button>
									<code>{path}/</code>
									<input
										ref={input}
										aria-label="New folder name"
										value={folderName}
										placeholder="Folder name"
										onChange={(event) => setFolderName(event.target.value)}
									/>
								</div>
								<div className="fj-footer">
									<span>A new folder in this location.</span>
									<button
										type="button"
										className="fj-primary"
										disabled={!folderName.trim() || /[\/\\]/.test(folderName)}
										onClick={() => {
											const next = `${path}/${folderName.trim()}`;
											setExtraFolders([...extraFolders, { path: next }]);
											setLocationPath(next);
											setLocationSelection(next);
											setNewLocationFolder(false);
										}}
									>
										Create folder <ArrowRightIcon />
									</button>
								</div>
							</>
						) : browsing ? (
							<>
								{take === "folder-first" && scene === "start" && !locationFor && (
									<button type="button" className="fj-pinned" onClick={() => startName(values.home)}>
										<PlusIcon />
										<span>Start a new project</span>
										<code>{values.home}</code>
										<ArrowRightIcon />
									</button>
								)}
								<div className="fj-field">
									<button type="button" aria-label="Back" onClick={back}>
										<BackIcon />
									</button>
									<SearchIcon className="fj-search-icon" />
									{!query && (
										<span className="fj-crumbs">
											{path.split("/").map((part, index, parts) => (
												<button
													type="button"
													key={parts.slice(0, index + 1).join("/")}
													onClick={() => browse(parts.slice(0, index + 1).join("/"))}
												>
													{part}/
												</button>
											))}
										</span>
									)}
									<input
										ref={input}
										aria-label="Search folders or paste a path"
										value={query}
										autoComplete="off"
										spellCheck={false}
										placeholder={query ? "Search folders or paste a path" : "Search…"}
										onChange={(event) => {
											const next = event.target.value;
											setQuery(next);
											const match = disk.find(
												(item) =>
													item.path !== "~" &&
													item.path.toLowerCase().includes(next.trim().replace(/\/$/, "").toLowerCase()),
											);
											if (match && next) select(match.path);
										}}
										onKeyDown={(event) => {
											if (event.nativeEvent.isComposing) return;
											if (event.key === "ArrowDown" || event.key === "ArrowUp") {
												event.preventDefault();
												const at = rows.findIndex((row) => row.path === target);
												const next =
													rows[
														Math.max(
															0,
															Math.min(rows.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)),
														)
													];
												if (next) select(next.path);
											}
											if (event.key === "ArrowRight" && !query) {
												event.preventDefault();
												browse(target);
											}
											if ((event.key === "Backspace" || event.key === "ArrowLeft") && !query) {
												event.preventDefault();
												browse(parentOf(path));
											}
											if (event.key === "Enter") {
												event.preventDefault();
												if (rows.length || !query) confirmFolder();
											}
											if (event.key === "Escape" && query) {
												event.preventDefault();
												event.stopPropagation();
												setQuery("");
											}
										}}
									/>
									<button
										type="button"
										className="fj-plus"
										title={locationFor ? "New folder here" : "New project inside this folder"}
										aria-label={locationFor ? "New folder here" : "New project inside this folder"}
										onClick={() => {
											if (locationFor) {
												setFolderName("");
												setNewLocationFolder(true);
											} else startName(path, true);
										}}
									>
										<PlusIcon />
									</button>
								</div>
								<div className="fj-folders" role="listbox" aria-label="Folders">
									{rows.map((row) => (
										<div
											className={`fj-folder-row ${row.path === target ? "is-selected" : ""}`}
											key={row.path}
										>
											<button
												type="button"
												role="option"
												aria-selected={row.path === target}
												aria-label={`Select ${leaf(row.path)}`}
												onClick={() => select(row.path)}
												onDoubleClick={() => browse(row.path)}
											>
												<FolderIcon className={row.frames === undefined ? "" : "is-project"} />
												<span>{leaf(row.path)}</span>
												{query && <code>{parentOf(row.path)}</code>}
												{row.frames !== undefined && <code>{row.frames} frames</code>}
											</button>
											<button
												type="button"
												aria-label={`Browse ${leaf(row.path)}`}
												onClick={() => browse(row.path)}
											>
												<ChevronIcon />
											</button>
										</div>
									))}
									{rows.length === 0 && (
										<div className="fj-nothing">
											{query ? "No matching folders in this sample." : "No folders inside."}
										</div>
									)}
								</div>
								<div className="fj-footer">
									<div>
										<code>{target}</code>
										<span>
											{locationFor
												? locationFor === "home"
													? "New projects will start here."
													: `Creates ${cleanName} inside this folder.`
												: isProject
													? "Existing spool project."
													: "Adds a design folder here."}
										</span>
										{locationFor === "project" && (
											<label className="fj-default">
												<input
													type="checkbox"
													checked={useAsDefault}
													onChange={(event) => setUseAsDefault(event.target.checked)}
												/>
												Use for future projects
											</label>
										)}
									</div>
									<button
										type="button"
										className="fj-primary"
										disabled={Boolean(query && rows.length === 0)}
										onClick={confirmFolder}
									>
										{action}
										<ArrowRightIcon />
									</button>
								</div>
							</>
						) : naming ? (
							<>
								<div className="fj-small-heading">
									<button type="button" aria-label="Back" onClick={back}>
										<BackIcon />
									</button>
									<span>{scene === "new-here" ? "New project here" : "Start designing"}</span>
									<span className="fj-untitled-hint">Blank name becomes untitled.</span>
								</div>
								{nameField}
							</>
						) : (
							<>
								{embeddedName ? (
									<div className="fj-expanded">
										<div className="fj-expanded-title">
											Start designing<span>Blank name becomes untitled.</span>
										</div>
										{nameField}
									</div>
								) : (
									<div className="fj-choices">
										<Choice
											icon={<PlusIcon />}
											title="Start designing"
											description="A new project, with a folder of its own."
											onClick={() => startName(values.home)}
											primary
										/>
									</div>
								)}
								<div className="fj-choices">{folderChoices}</div>
								{!embeddedName && (
									<div className="fj-home-location">
										<span>New projects in</span>
										<code>{values.home}</code>
										<button type="button" onClick={() => chooseLocation("home")}>
											Change…
										</button>
									</div>
								)}
							</>
						)}
					</dialog>
				)}
			</div>
			<footer className="fj-notes">
				<div>
					<strong>{TITLES[take]}</strong>
					<p>{NOTES[take]}</p>
					<span>
						{ready
							? values.resultKind === "setup"
								? "The codebase stays the project root. Only its design folder is added."
								: values.resultKind === "open"
									? "The existing project is registered and opened. Its files stay as they are."
									: "A new project folder is created, with design inside it."
							: "New project… opens the picker. Click selects; the arrow browses; the visible action confirms once."}
					</span>
				</div>
				<div className="fj-state">
					<code>
						{ready
							? values.resultKind === "open"
								? values.resultRoot
								: `${values.resultRoot}/design`
							: "prototype · nothing created"}
					</code>
					<span>{ready ? "simulated result · no files changed" : "sample folders · escape goes back"}</span>
					<button type="button" onClick={onReset}>
						<RestartIcon />
						Start again
					</button>
				</div>
			</footer>
		</div>
	);
}

function Choice({
	icon,
	title,
	description,
	onClick,
	primary = false,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	onClick: () => void;
	primary?: boolean;
}) {
	return (
		<button type="button" className={`fj-choice ${primary ? "is-primary" : ""}`} onClick={onClick}>
			{icon}
			<span>
				<strong>{title}</strong>
				<small>{description}</small>
			</span>
			<ArrowRightIcon />
		</button>
	);
}

export function FolderDirections({
	choices,
	nameFirst,
	folderFirst,
}: {
	choices: ReactNode;
	nameFirst: ReactNode;
	folderFirst: ReactNode;
}) {
	return (
		<div className="fj-directions">
			<h1>Three ways to bring a project into spool.</h1>
			<p>A new idea, a codebase you already have, or a spool project someone shared.</p>
			<div className="fj-direction-grid">
				<section>
					<h2>Three clear choices</h2>
					<p>Keep the old launcher’s shape. Each job gets its own row.</p>
					{choices}
				</section>
				<section>
					<h2>Start designing, expanded</h2>
					<p>My pick. Name it if you want, create it, or choose either folder action below.</p>
					{nameFirst}
				</section>
				<section>
					<h2>One folder picker</h2>
					<p>The plus creates a project. Select a folder and it offers the action that fits.</p>
					{folderFirst}
				</section>
			</div>
			<div className="fj-walks">
				<div>
					<strong>A new idea</strong>
					<span>Optional name → Create project</span>
					<code>~/spool/idea/design</code>
				</div>
				<div>
					<strong>An existing codebase</strong>
					<span>Select coffee-shop → Add spool here</span>
					<code>~/projects/coffee-shop/design</code>
				</div>
				<div>
					<strong>A shared spool project</strong>
					<span>Select tvärsö → Open project</span>
					<code>~/projects/tvärsö · existing files</code>
				</div>
			</div>
			<small>
				Each row below is a separate take. Its states continue to the right. All three use the same compact folder
				picker.
			</small>
		</div>
	);
}
