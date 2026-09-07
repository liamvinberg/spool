import { type ReactNode, useEffect, useRef, useState } from "react";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { homeProjects, Thumbnail } from "shared/ui/spool/home-fixture";
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon, RestartIcon } from "shared/ui/spool/icons";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { ProjectPicker } from "shared/ui/spool/project-picker";
import { SpoolShell } from "shared/ui/spool/shell";
import { EntryHome } from "./entry-home";
import "./project-entry.css";

// Throwaway exploration: three ways into a project, with no filesystem writes.
export type EntryTake = "instant" | "split" | "inline";
export type EntryScene = "home" | "options" | "created" | "renaming";

const NOTES: Record<EntryTake, { title: string; action: string; cost: string }> = {
	instant: {
		title: "Create immediately",
		action: "New project opens a blank canvas. The name is there when you want to change it.",
		cost: "One click to start. Naming still happens after creation.",
	},
	split: {
		title: "Create immediately, with options",
		action: "New project opens a canvas. The arrow beside it lets you name it and choose a folder first.",
		cost: "One click to start. Adds one small arrow for the less frequent choice.",
	},
	inline: {
		title: "Name it in Home",
		action: "New project opens a row in Home. Type a name or press Enter to keep untitled.",
		cost: "Naming happens before creation. Every new project takes a second action.",
	},
};

export function ProjectEntryPrototype({
	take,
	scene,
	project,
	hasProject,
	location,
	onCreate,
	onOptions,
	onHome,
	onRename,
	onRestart,
}: {
	take: EntryTake;
	scene: EntryScene;
	project: string;
	hasProject: boolean;
	location: string;
	onCreate: (name: string, location: string) => void;
	onOptions: () => void;
	onHome: () => void;
	onRename: (name: string) => void;
	onRestart: () => void;
}) {
	const [draft, setDraft] = useState("");
	const [parent, setParent] = useState(location);
	const [picker, setPicker] = useState<"folder" | "location" | null>(null);
	const [queryProjects, setProjects] = useState(homeProjects.slice(0, 6));
	const [agent, setAgent] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const created = scene === "created" || scene === "renaming";
	const existing = homeProjects.find((item) => item.name === project);
	const cover = existing?.covers[0];
	const options = scene === "options";
	const note = NOTES[take];
	const visibleProjects =
		hasProject && !queryProjects.some((item) => item.name === project)
			? [
					{
						root: `${location}/${project}`,
						name: project,
						openedAt: new Date().toISOString(),
						frameCount: 0,
						covers: [],
					},
					...queryProjects,
				]
			: queryProjects;
	const quickCreate = () => onCreate("untitled", "~/spool");
	const newProject = () => (take === "inline" ? onOptions() : quickCreate());
	const openFolder = () => setPicker("folder");
	useEffect(() => {
		if (scene === "options") nameInput.current?.focus();
		if (scene === "renaming") {
			const input = root.current?.querySelector<HTMLInputElement>('[aria-label="Rename project"]');
			input?.focus();
			input?.select();
		}
	}, [scene]);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape" && picker === null && options) onHome();
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [picker, options, onHome]);
	const naming = (
		<form
			className={take === "inline" ? "entry-inline-form" : "entry-options-form"}
			onSubmit={(event) => {
				event.preventDefault();
				onCreate(draft.trim() || "untitled", parent);
			}}
		>
			<label>
				<span>Project name</span>
				<input
					ref={nameInput}
					aria-label="Project name"
					value={draft}
					placeholder="Untitled"
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							onCreate(draft.trim() || "untitled", parent);
						}
					}}
				/>
			</label>
			<button type="button" className="entry-location" onClick={() => setPicker("location")}>
				<FolderIcon className="h-3.5 w-3.5" />
				<span>{parent.replace(/^~/, "Home").split("/").join(" / ")}</span>
				<ChevronIcon className="h-3 w-3" />
			</button>
			<div className="entry-form-actions">
				<button type="button" className="entry-quiet" onClick={onHome}>
					Cancel
				</button>
				<button
					type="button"
					className="home-action home-action-primary"
					onClick={() => onCreate(draft.trim() || "untitled", parent)}
				>
					Create project
				</button>
			</div>
		</form>
	);
	const actions = (
		<>
			{take !== "instant" && (
				<button type="button" className="home-action" onClick={openFolder}>
					Open…
				</button>
			)}
			<div className="entry-new-anchor">
				<div className={take === "split" ? "entry-split-button" : ""}>
					<button
						type="button"
						className="home-action home-action-primary"
						onClick={newProject}
						disabled={take === "inline" && options}
					>
						<PlusIcon className="h-3 w-3" /> New project
					</button>
					{take === "split" && (
						<button
							type="button"
							className="entry-more"
							aria-label="Name and location"
							aria-expanded={options}
							onClick={options ? onHome : onOptions}
						>
							<ChevronIcon className="h-3 w-3" />
						</button>
					)}
				</div>
				{take === "split" && options && (
					<section className="entry-options" aria-label="Name and location">
						<div className="entry-options-heading">
							<h2>Name and location</h2>
							<button type="button" aria-label="Close options" onClick={onHome}>
								<CloseIcon className="h-3 w-3" />
							</button>
						</div>
						{naming}
					</section>
				)}
			</div>
		</>
	);
	return (
		<div ref={root} className="entry-study">
			<div
				className="entry-app"
				onClickCapture={(event) => {
					if (!(event.target instanceof Element)) return;
					const glyph = event.target.closest<HTMLElement>("[data-dock-glyph]")?.dataset.dockGlyph;
					if (glyph === "agent") setAgent(!agent);
					if (glyph === "properties") setAgent(false);
				}}
			>
				<SpoolShell
					tabs={created || hasProject ? [...new Set(["tvärsö", "kaffe", project])] : ["tvärsö", "kaffe"]}
					activeTab={created ? project : undefined}
					canvasControls={created}
					zoom="100%"
					onPick={newProject}
					onHome={onHome}
					onFocus={(name) => onCreate(name, "~/spool")}
				>
					{created ? (
						<CanvasChrome
							pages={cover === undefined ? [] : [{ name: "app", frames: ["home"], open: true, active: true }]}
							tool="none"
							railLabel={agent ? "agent" : "properties"}
							railWidth={agent ? 420 : 300}
							rail={agent ? <PrototypeAgent /> : undefined}
						>
							{cover === undefined ? (
								<ProjectEmpty
									key={project}
									project={project}
									root={`${location}/${project}`}
									onRename={async (name) => onRename(name)}
									onFolder={openFolder}
								/>
							) : (
								<div className="entry-existing">
									<span>home</span>
									<Thumbnail
										project={project}
										frame={cover.frame}
										cover={cover.cover}
										alt={project}
										className="h-full w-full"
									/>
								</div>
							)}
						</CanvasChrome>
					) : (
						<EntryHome
							projects={visibleProjects}
							location={parent}
							headerActions={actions}
							inlineEntry={take === "inline" && options ? naming : null}
							openInSidebar={take === "instant"}
							onStart={newProject}
							onFolder={openFolder}
							onChangeLocation={() => setPicker("location")}
							onOpenProject={(opened) => onCreate(opened.name, "~/spool")}
							onForgetProject={(removed) =>
								setProjects((all) => all.filter((item) => item.root !== removed.root))
							}
						/>
					)}
				</SpoolShell>
				{picker !== null && (
					<ProjectPicker
						initial={picker}
						projectLocation={parent}
						onClose={() => setPicker(null)}
						onScratch={quickCreate}
						onCreate={(name, folder) => onCreate(name, folder)}
						onOpen={(opened) => onCreate(opened.name, "~/spool")}
						onChangeLocation={() => setPicker("location")}
						onLocation={(folder) => {
							setParent(folder);
							setPicker(null);
						}}
					/>
				)}
			</div>
			<footer className="entry-notes">
				<div>
					<strong>{note.title}</strong>
					<p>{note.action}</p>
					<span>{note.cost}</span>
				</div>
				<div className="entry-notes-state">
					<code>{created || hasProject ? `${location}/${project}` : "project not created yet"}</code>
					<span>prototype · nothing saved</span>
					<button type="button" onClick={onRestart}>
						<RestartIcon className="h-3 w-3" /> Start again
					</button>
				</div>
			</footer>
		</div>
	);
}

function PrototypeAgent() {
	const [draft, setDraft] = useState("");
	return (
		<div className="entry-agent">
			<span>new conversation</span>
			<div>
				<h2>What would you like to make?</h2>
				<p>Describe a screen or a flow.</p>
			</div>
			<textarea
				aria-label="Message the agent"
				placeholder="Ask for a screen…"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
			/>
			<small>Sample composer for trying the entry flow.</small>
		</div>
	);
}

export function EntryDirections({
	instant,
	split,
	inline,
}: {
	instant: ReactNode;
	split: ReactNode;
	inline: ReactNode;
}) {
	return (
		<div className="entry-directions">
			<h1>What should New project do?</h1>
			<p>Try the button, give the project a name, then go back and open an existing folder.</p>
			<div className="entry-direction-grid">
				<section>
					<h2>Create immediately</h2>
					<p>Home → blank canvas</p>
					<span>The smallest UI. Every project starts as untitled.</span>
					{instant}
				</section>
				<section>
					<h2>Immediate, with options</h2>
					<p>Home → canvas, or name first</p>
					<span>My current pick. The main button stays fast; the arrow holds name and location.</span>
					{split}
				</section>
				<section>
					<h2>Name it in Home</h2>
					<p>Home → inline name → canvas</p>
					<span>Keeps Home visible. Still asks for an extra action every time.</span>
					{inline}
				</section>
			</div>
			<small>Separate rows below. The following states sit to the right. All actions use sample projects.</small>
		</div>
	);
}
