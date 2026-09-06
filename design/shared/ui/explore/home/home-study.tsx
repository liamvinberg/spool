import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CloseIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";
import { CanvasArtwork, ProjectArtwork } from "./artwork";
import { BrowserHome, DeskHome, LibraryHome, SearchHome, StartHome, WorkbenchHome } from "./dashboard-layouts";
import {
	categories,
	type Category,
	type HomeProject,
	type HomeState,
	type HomeTake,
	projects,
	type RegistryItem,
	registry,
} from "./data";
import { Action, Arrow, Heading, type HomeActions, RegistryTile, Search } from "./parts";
import { CoversHome, IndexHome, QuietHome, ResumeHome, ShelfHome, SpacesHome } from "./project-layouts";
import "./home-study.css";

const layouts = {
	quiet: QuietHome,
	covers: CoversHome,
	shelf: ShelfHome,
	resume: ResumeHome,
	index: IndexHome,
	spaces: SpacesHome,
	workbench: WorkbenchHome,
	library: LibraryHome,
	search: SearchHome,
	start: StartHome,
	desk: DeskHome,
	browser: BrowserHome,
};

/** Twelve separate frames ask how much home should hold. All interactions stay in memory. */
export function HomeStudy({ take, state = "home" }: { take: HomeTake; state?: HomeState }) {
	const [query, setQuery] = useState(state === "filtered" ? "kaffe" : "");
	const [localProjects, setLocalProjects] = useState<readonly HomeProject[]>(state === "empty" ? [] : projects);
	const [tabs, setTabs] = useState(state === "empty" ? [] : ["tvärsö", "kaffe"]);
	const [active, setActive] = useState<string | undefined>();
	const [surface, setSurface] = useState<"home" | "registry">(
		state === "registry" || state === "detail" ? "registry" : "home",
	);
	const [detail, setDetail] = useState<RegistryItem | undefined>(state === "detail" ? registry[4] : undefined);
	const [creation, setCreation] = useState<{ starter?: RegistryItem; name?: string; folder?: boolean } | null>(
		state === "create" ? {} : null,
	);
	const [keyboard, setKeyboard] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const Layout = layouts[take];

	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			setKeyboard(true);
			const target = event.target;
			if (
				event.key === "/" &&
				!(target instanceof HTMLElement && target.closest("input,textarea,[contenteditable]"))
			) {
				event.preventDefault();
				root.current?.querySelector<HTMLInputElement>(".home-search input")?.focus();
			}
		};
		const pointer = () => setKeyboard(false);
		window.addEventListener("keydown", key);
		window.addEventListener("pointerdown", pointer);
		return () => {
			window.removeEventListener("keydown", key);
			window.removeEventListener("pointerdown", pointer);
		};
	}, []);

	function openProject(project: HomeProject) {
		setTabs((current) => (current.includes(project.name) ? current : [...current, project.name]));
		setActive(project.name);
	}
	const actions: HomeActions = {
		query,
		setQuery,
		visible: localProjects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
		openProject,
		openRegistry: () => {
			setSurface("registry");
			setDetail(undefined);
			setQuery("");
		},
		inspectItem: (item) => {
			setSurface("registry");
			setDetail(item);
			setQuery("");
		},
		create: (starter, name) => setCreation({ ...(starter ? { starter } : {}), ...(name ? { name } : {}) }),
		openFolder: () => setCreation({ folder: true }),
	};
	const opened = localProjects.find((project) => project.name === active);
	return (
		<div ref={root} className={cn("home-study", keyboard && "home-keyboard")} data-home-take={take}>
			<div className="home-window-lights" aria-hidden="true">
				<i />
				<i />
				<i />
			</div>
			<SpoolShell
				tabs={tabs}
				activeTab={active}
				canvasControls={false}
				onFocus={setActive}
				onHome={() => {
					setActive(undefined);
					setSurface("home");
					setQuery("");
				}}
				onReorder={(order) => setTabs([...order])}
				onClose={(name) => {
					setTabs((current) => current.filter((tab) => tab !== name));
					if (active === name) setActive(undefined);
				}}
				onPick={() => setCreation({})}
			>
				<div className="home-study-body">
					{opened ? (
						<OpenedProject project={opened} onBack={() => setActive(undefined)} />
					) : surface === "registry" ? (
						<RegistryBrowser
							actions={actions}
							detail={detail}
							setDetail={setDetail}
							onBack={() => {
								setSurface("home");
								setQuery("");
							}}
						/>
					) : (
						<Layout actions={actions} />
					)}
				</div>
			</SpoolShell>
			{creation !== null && (
				<CreateProject
					initial={creation}
					onClose={() => setCreation(null)}
					onCreate={(name, starter) => {
						const project: HomeProject = {
							name,
							description: starter ? `Starting with ${starter.name}.` : "Something new.",
							art: starter?.art ?? "blank",
							frames: starter ? 4 : 0,
							when: "just now",
							group: "Personal",
						};
						setLocalProjects((current) => [project, ...current.filter((item) => item.name !== name)]);
						setCreation(null);
						openProject(project);
					}}
					onOpen={(project) => {
						setLocalProjects((current) =>
							current.some((item) => item.name === project.name) ? current : [...current, project],
						);
						setCreation(null);
						openProject(project);
					}}
				/>
			)}
		</div>
	);
}

function RegistryBrowser({
	actions,
	detail,
	setDetail,
	onBack,
}: {
	actions: HomeActions;
	detail: RegistryItem | undefined;
	setDetail: (item: RegistryItem | undefined) => void;
	onBack: () => void;
}) {
	const [category, setCategory] = useState<Category>("All");
	const [source, setSource] = useState("All registries");
	const [message, setMessage] = useState("The next version is ready to review.");
	const [sent, setSent] = useState(false);
	const items = registry.filter(
		(item) =>
			(category === "All" || item.kind === category) &&
			(source === "All registries" || source === item.source) &&
			`${item.name} ${item.kind}`.toLowerCase().includes(actions.query.toLowerCase()),
	);
	return (
		<div className="home-page home-registry-page">
			<button
				type="button"
				className="home-text-link home-back"
				onClick={detail ? () => setDetail(undefined) : onBack}
			>
				<Arrow className="rotate-180" />
				{detail ? "Registry" : "Home"}
			</button>
			{detail ? (
				<>
					<Heading title={detail.name} description={detail.description}>
						<Action primary onClick={() => actions.create(detail)}>
							Use in a project
							<Arrow />
						</Action>
					</Heading>
					<div className="home-registry-detail">
						<div>
							<ProjectArtwork kind={detail.art} />
							{detail.art === "slack" && (
								<div className="home-slack-play">
									<label>
										Bot message
										<input
											aria-label="Bot message"
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													event.preventDefault();
													setSent(true);
												}
											}}
											value={message}
											onChange={(event) => {
												setMessage(event.target.value);
												setSent(false);
											}}
										/>
									</label>
									<button type="button" onClick={() => setSent(true)} className="home-action">
										Send preview
										<Arrow />
									</button>
									{sent && <p role="status">Shipbot: {message}</p>}
								</div>
							)}
						</div>
						<aside>
							<h2>Inside this source</h2>
							<dl>
								<div>
									<dt>Type</dt>
									<dd>{detail.kind}</dd>
								</div>
								<div>
									<dt>Contains</dt>
									<dd>{detail.count}</dd>
								</div>
								<div>
									<dt>Registry</dt>
									<dd>{detail.source}</dd>
								</div>
								<div>
									<dt>Format</dt>
									<dd>spool project</dd>
								</div>
							</dl>
							<p>
								{detail.art === "slack"
									? "Use a familiar conversation to prototype the part of your flow that happens in Slack."
									: "Explore the frames and use their code as a starting point in your project."}
							</p>
							<div className="home-source-files">
								<span>frames/</span>
								<span>shared/ui/</span>
								<span>shared/tokens.css</span>
							</div>
						</aside>
					</div>
				</>
			) : (
				<>
					<Heading title="Registry" description="A starting point for what you make next.">
						<Search actions={actions} placeholder="Search the registry" />
						<label className="home-source-select">
							<span className="sr-only">Registry source</span>
							<select
								aria-label="Registry source"
								value={source}
								onChange={(event) => setSource(event.target.value)}
							>
								<option>All registries</option>
								<option>my-registry</option>
								<option>spool-registry</option>
							</select>
						</label>
					</Heading>
					<div className="home-category-tabs">
						{categories.map((name) => (
							<button
								type="button"
								key={name}
								aria-pressed={category === name}
								onClick={() => setCategory(name)}
							>
								{name}
							</button>
						))}
					</div>
					<div className="home-grid home-grid-three">
						{items.map((item) => (
							<RegistryTile key={item.name} item={item} onClick={() => setDetail(item)} />
						))}
					</div>
					{items.length === 0 && (
						<div className="home-empty">
							<h2>No matching sources.</h2>
							<Action
								onClick={() => {
									actions.setQuery("");
									setCategory("All");
									setSource("All registries");
								}}
							>
								Clear filters
							</Action>
						</div>
					)}
				</>
			)}
		</div>
	);
}

function CreateProject({
	initial,
	onClose,
	onCreate,
	onOpen,
}: {
	initial: { starter?: RegistryItem; name?: string; folder?: boolean };
	onClose: () => void;
	onCreate: (name: string, starter?: RegistryItem) => void;
	onOpen: (project: HomeProject) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [name, setName] = useState(initial.name ?? "");
	const [folder, setFolder] = useState(initial.folder ?? false);
	const [starterName, setStarterName] = useState(initial.starter?.name ?? "Blank canvas");
	useEffect(() => {
		dialog.current?.showModal();
		dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
	}, []);
	const create = () => {
		if (name.trim())
			onCreate(
				name.trim(),
				registry.find((item) => item.name === starterName),
			);
	};
	return (
		<dialog
			ref={dialog}
			className="home-create-dialog"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="home-dialog-header">
				<h2>{folder ? "Open a folder" : "New project"}</h2>
				<button type="button" aria-label="Close dialog" onClick={onClose}>
					<CloseIcon className="h-4 w-4" />
				</button>
			</div>
			<div className="home-inline-tabs">
				<button type="button" aria-pressed={!folder} onClick={() => setFolder(false)}>
					Create new
				</button>
				<button type="button" aria-pressed={folder} onClick={() => setFolder(true)}>
					Open a folder
				</button>
			</div>
			{folder ? (
				<div className="home-folder-picker">
					<p>Choose a project folder.</p>
					{projects.slice(0, 4).map((project) => (
						<button type="button" key={project.name} onClick={() => onOpen(project)}>
							<span>◧ &nbsp; {project.name}</span>
							<Arrow />
						</button>
					))}
				</div>
			) : (
				<div>
					<label className="home-form-field">
						Name
						<input
							aria-label="Name"
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									create();
								}
							}}
							placeholder="my-next-idea"
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
						/>
					</label>
					<label className="home-form-field">
						Start with
						<select value={starterName} onChange={(event) => setStarterName(event.target.value)}>
							<option>Blank canvas</option>
							{registry.map((item) => (
								<option key={item.name}>{item.name}</option>
							))}
						</select>
					</label>
					<p className="home-create-path">projects/{name.trim() || "my-next-idea"}/design</p>
					<div className="home-dialog-footer">
						<Action onClick={onClose}>Cancel</Action>
						<button
							type="button"
							onClick={create}
							disabled={!name.trim()}
							className="home-action home-action-primary"
						>
							Create project
							<Arrow />
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}

function OpenedProject({ project, onBack }: { project: HomeProject; onBack: () => void }) {
	return (
		<div className="home-opened">
			<aside>
				<h2>{project.name}</h2>
				<span>Pages</span>
				<strong>◧ &nbsp; app</strong>
				<span>◧ &nbsp; explore</span>
				<span>◧ &nbsp; system</span>
				<button type="button" className="home-text-link" onClick={onBack}>
					<Arrow className="rotate-180" />
					Back home
				</button>
			</aside>
			<div>
				<div className="home-opened-crumb">{project.name} / app</div>
				<CanvasArtwork kind={project.art} />
				<span className="home-opened-caption">{project.frames} frames</span>
			</div>
		</div>
	);
}
