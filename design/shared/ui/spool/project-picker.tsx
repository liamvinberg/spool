import { useEffect, useRef, useState } from "react";
import { HOME, shortPath } from "shared/lib/spool/picker-disk";
import { FolderIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { Empty, MinRow, PathPrefix } from "shared/ui/spool/picker-field";
import { InitLine, NameLine, NamingField, useNewProject } from "shared/ui/spool/picker-new";
import { ListBox } from "shared/ui/spool/picker-parts";
import { type HomeProject, projects } from "shared/ui/demo/home-data";
import { Arrow } from "./home";
import { ProjectLocation } from "./project-location";
import "./project-picker.css";

export type ProjectPickerMode = "new" | "folder" | "start" | "location";

/** The shipped field and rows, with local callbacks standing in for filesystem writes. */
export function ProjectPicker({
	initial,
	onClose,
	onOpen,
	onCreate,
	onScratch,
	projectLocation,
	onChangeLocation,
	onLocation,
}: {
	initial: ProjectPickerMode;
	onClose: () => void;
	onOpen: (project: HomeProject) => void;
	onCreate: (name: string, parent: string) => void;
	onScratch: () => void;
	projectLocation: string;
	onChangeLocation: () => void;
	onLocation: (path: string) => void;
}) {
	const [mode, setMode] = useState(initial);
	const np = useNewProject({
		path: initial === "location" ? HOME : `${HOME}/personal/projects`,
		naming: initial === "new",
	});
	const { picker } = np;
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		dialog.current?.showModal();
		if (initial !== "start") dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
	}, [initial]);
	useEffect(() => {
		if (mode === "location" || picker.landed?.kind !== "opened") return;
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
	}, [mode, picker.landed, onOpen]);
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
			aria-label={
				mode === "location"
					? "Save projects in"
					: mode === "start"
						? "New project"
						: np.naming
							? "Name the new project"
							: "Open a folder"
			}
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
				if (mode === "location" && event.key === "Enter" && event.target instanceof HTMLInputElement) {
					event.preventDefault();
					event.stopPropagation();
					if (picker.picked) picker.browse(picker.picked.dir.path);
					return;
				}
				if (mode !== "location" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
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
				<>
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
					<ProjectLocation path={projectLocation} onChange={onChangeLocation} />
				</>
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
						{mode !== "location" && (
							<button
								type="button"
								onClick={name}
								title="new project ⌘N"
								aria-label="New project"
								className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-100 hover:bg-raised hover:text-text"
							>
								<PlusIcon className="h-2.5 w-2.5" />
							</button>
						)}
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
								onEnter={() => (mode === "location" ? picker.browse(row.dir.path) : picker.enter(index))}
							/>
						))}
						{picker.landed?.kind === "init" ? <InitLine /> : null}
					</ListBox>
					{mode === "location" && (
						<div className="pj-location-footer">
							<code>{shortPath(picker.path)}</code>
							<Action onClick={onClose}>Cancel</Action>
							<Action primary onClick={() => onLocation(shortPath(picker.path))}>
								Use this folder
							</Action>
						</div>
					)}
				</>
			)}
		</dialog>
	);
}

function Action({ children, primary = false, onClick }: { children: React.ReactNode; primary?: boolean; onClick: () => void }) {
	return <button type="button" className={`home-action ${primary ? "home-action-primary" : ""}`} onClick={onClick}>{children}</button>;
}
