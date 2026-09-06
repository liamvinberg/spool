import { useEffect, useRef, useState } from "react";
import { HOME, shortPath } from "shared/lib/spool/picker-disk";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { FolderIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { Empty, MinRow, PathPrefix } from "shared/ui/spool/picker-field";
import { InitLine, NameLine, NamingField, useNewProject } from "shared/ui/spool/picker-new";
import { ListBox } from "shared/ui/spool/picker-parts";
import { type HomeProject, projects } from "../data";
import { Action, Arrow } from "../parts";
import { type ProjectActions, ProjectNavigation } from "./parts";

export type ProjectPickerMode = "new" | "folder" | "start";

/** The shipped field and rows, with local callbacks standing in for filesystem writes. */
export function ProjectPicker({
	initial,
	onClose,
	onOpen,
	onCreate,
	onScratch,
}: {
	initial: ProjectPickerMode;
	onClose: () => void;
	onOpen: (project: HomeProject) => void;
	onCreate: (name: string, parent: string) => void;
	onScratch: () => void;
}) {
	const [mode, setMode] = useState(initial);
	const np = useNewProject({ path: `${HOME}/personal/projects`, naming: initial === "new" });
	const { picker } = np;
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		dialog.current?.showModal();
		if (initial !== "start") dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
	}, [initial]);
	useEffect(() => {
		if (picker.landed?.kind !== "opened") return;
		const known = projects.find((project) => project.name === picker.landed?.name);
		onOpen(
			known ?? {
				name: picker.landed.name,
				frames: 8,
				when: "just now",
				art: "blank",
				description: "",
				group: "Personal",
			},
		);
	}, [picker.landed, onOpen]);
	const browse = () => {
		setMode("folder");
		requestAnimationFrame(() => picker.inputRef.current?.focus());
	};
	const name = () => {
		setMode("new");
		np.begin();
	};
	return (
		<dialog
			ref={dialog}
			className="pj-native-picker"
			aria-label={mode === "start" ? "New project" : np.naming ? "Name the new project" : "Open a folder"}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onClick={(event) => {
				if (event.target !== event.currentTarget) return;
				const box = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < box.left ||
					event.clientX > box.right ||
					event.clientY < box.top ||
					event.clientY > box.bottom
				)
					onClose();
			}}
			onKeyDownCapture={(event) => {
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
					event.preventDefault();
					event.stopPropagation();
					name();
				}
				if (event.key === "Escape" && !np.naming && picker.query === "") {
					event.preventDefault();
					event.stopPropagation();
					onClose();
				}
				if (event.key === "Enter" && np.naming) {
					event.preventDefault();
					event.stopPropagation();
					if (np.name.trim()) onCreate(np.name.trim(), shortPath(picker.path));
				}
				if (event.key === "Enter" && !np.naming && picker.landed?.kind === "init") {
					event.preventDefault();
					event.stopPropagation();
					onCreate(
						picker.landed.name,
						shortPath(picker.landed.path.slice(0, picker.landed.path.lastIndexOf("/"))),
					);
				}
			}}
		>
			{mode === "start" ? (
				<div className="pj-start-choices">
					<button type="button" onClick={onScratch}>
						<PlusIcon />
						<span>
							<strong>Start designing</strong>
							<small>A blank project, saved on this Mac.</small>
						</span>
						<Arrow />
					</button>
					<button type="button" onClick={name}>
						<FolderIcon />
						<span>
							<strong>New project in a folder</strong>
							<small>Choose where your project lives.</small>
						</span>
						<Arrow />
					</button>
					<button type="button" onClick={browse}>
						<FolderIcon />
						<span>
							<strong>Open a folder</strong>
							<small>Use a project or codebase you already have.</small>
						</span>
						<Arrow />
					</button>
				</div>
			) : np.naming ? (
				<>
					<NamingField np={np} />
					<NameLine np={np} />
				</>
			) : (
				<>
					<div className="flex h-[52px] shrink-0 items-center px-4">
						<SearchIcon className="mr-2 h-3 w-3 shrink-0 text-muted/45" />
						{picker.searching ? null : <PathPrefix picker={picker} />}
						<input
							ref={picker.inputRef}
							value={picker.query}
							spellCheck={false}
							autoComplete="off"
							aria-label="Search folders"
							onChange={(event) => picker.setQuery(event.target.value)}
							onKeyDown={picker.onKeyDown}
							className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none"
						/>
						<button
							type="button"
							onClick={name}
							title="new project ⌘N"
							aria-label="New project"
							className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-100 hover:bg-raised hover:text-text"
						>
							<PlusIcon className="h-2.5 w-2.5" />
						</button>
					</div>
					<ListBox picker={picker} min={0} max={408}>
						{picker.rows.length === 0 ? <Empty picker={picker} /> : null}
						{picker.rows.map((row, index) => (
							<MinRow
								key={row.dir.path}
								row={row}
								index={index}
								picked={index === picker.at}
								searching={picker.searching}
								onPoint={() => picker.point(index)}
								onEnter={() => picker.enter(index)}
							/>
						))}
						{picker.landed?.kind === "init" ? <InitLine /> : null}
					</ListBox>
				</>
			)}
		</dialog>
	);
}

export function WelcomeProjects({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout">
			<ProjectNavigation actions={actions} />
			<main className="pj-welcome-main">
				<div className="pj-welcome">
					<h1>Start with an idea.</h1>
					<p>Your next project can start here, or in a folder you already have.</p>
					<div className="pj-welcome-options">
						<button type="button" onClick={actions.create}>
							<PlusIcon />
							<strong>
								Start designing
								<Arrow />
							</strong>
							<small>
								Open a blank canvas.
								<br />
								spool saves the project on your Mac.
							</small>
						</button>
						<button type="button" onClick={actions.folder}>
							<FolderIcon />
							<strong>
								Open a folder
								<Arrow />
							</strong>
							<small>
								Bring your codebase.
								<br />
								Keep the design beside your code.
							</small>
						</button>
					</div>
				</div>
			</main>
		</div>
	);
}

export function ScratchCanvas({
	name,
	managed,
	location,
	onRename,
	onFolder,
}: {
	name: string;
	managed: boolean;
	location?: string | undefined;
	onRename: (name: string) => boolean;
	onFolder: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [draft, setDraft] = useState(name);
	const path =
		location ?? (managed ? `~/.spool/projects/${name}` : `${shortPath(`${HOME}/personal/projects`)}/${name}`);
	return (
		<CanvasChrome pages={[{ name: "frames", frames: [], active: true, open: true }]} rail={null}>
			<div className="pj-scratch">
				<div className="pj-scratch-title">
					<input
						aria-label="Rename project"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => {
							if (!draft.trim() || !onRename(draft.trim())) setDraft(name);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") {
								event.preventDefault();
								setDraft(name);
							}
						}}
					/>
					<span>saved on this mac</span>
				</div>
				<SpoolMark />
				<h1>Your canvas is ready.</h1>
				<p>Open this project with your agent and tell it what you’d like to design.</p>
				<div className="pj-scratch-location">
					<code>{path}</code>
					<Action
						onClick={() => {
							void navigator.clipboard
								.writeText(path)
								.then(() => setCopied(true))
								.catch(() => setCopied(false));
						}}
					>
						{copied ? "Copied" : "Copy project path"}
						<Arrow />
					</Action>
				</div>
				<button type="button" onClick={onFolder}>
					Open an existing project folder
				</button>
			</div>
		</CanvasChrome>
	);
}
