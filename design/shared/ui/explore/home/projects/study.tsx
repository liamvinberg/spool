import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { MenuItem, MenuRule } from "shared/ui/spool/context-menu";
import { ForgetToast } from "shared/ui/spool/forget-toast";
import { SpoolShell } from "shared/ui/spool/shell";
import { CanvasArtwork } from "../artwork";
import { type HomeProject, projects } from "../data";
import { Arrow } from "../parts";
import {
	BrowserFilmstrip,
	BrowserPreview,
	BrowserTable,
	RailCanvases,
	RailCovers,
	RailRows,
	SidebarCanvases,
	SidebarCovers,
	SidebarList,
} from "./layouts";
import { type ProjectActions, type ProjectsState, type ProjectsTake } from "./parts";
import { ProjectPicker, type ProjectPickerMode, ScratchCanvas, WelcomeProjects } from "./start";
import "../home-study.css";
import "./study.css";

const layouts = {
	"sidebar-covers": SidebarCovers,
	"sidebar-canvases": SidebarCanvases,
	"sidebar-list": SidebarList,
	"rail-covers": RailCovers,
	"rail-canvases": RailCanvases,
	"rail-rows": RailRows,
	"browser-preview": BrowserPreview,
	"browser-filmstrip": BrowserFilmstrip,
	"browser-table": BrowserTable,
	"start-direct": SidebarCovers,
	"start-choice": SidebarCovers,
	"start-canvas": SidebarCovers,
};
const moreNames = [
	"atlas",
	"morrow",
	"interval",
	"north",
	"sunday",
	"paperplane",
	"arc",
	"measure",
	"garden",
	"forma",
	"common",
	"harbor",
];
const manyProjects: readonly HomeProject[] = [
	...projects,
	...moreNames.map((name, index) => ({
		name,
		description: "An idea taking shape.",
		frames: 6 + index * 3,
		when: "last month",
		art: projects[index % projects.length]?.art ?? "blank",
		group: "Personal" as const,
	})),
];
const scratch: HomeProject = {
	name: "untitled",
	frames: 0,
	when: "just now",
	art: "blank",
	description: "",
	group: "Personal",
};

/** Separate frames compare home layouts and creation flows. All project writes stay in memory. */
export function ProjectsStudy({ take, state = "home" }: { take: ProjectsTake; state?: ProjectsState }) {
	const instant = take.startsWith("start-");
	const firstLaunch = take === "start-choice" || take === "start-canvas";
	const seededScratch = state === "scratch" || state === "returned" || (take === "start-canvas" && state === "home");
	const seedItems = state === "empty" || firstLaunch ? [] : state === "many" ? manyProjects : projects;
	const [items, setItems] = useState<readonly HomeProject[]>(
		seededScratch ? [scratch, ...seedItems.filter((item) => item.name !== scratch.name)] : seedItems,
	);
	const [managed, setManaged] = useState<readonly string[]>(seededScratch ? [scratch.name] : []);
	const [locations, setLocations] = useState<Readonly<Record<string, string>>>({});
	const [query, setQuery] = useState(state === "filtered" ? "kaffe" : "");
	const [sort, setSort] = useState<"Recent" | "Name">("Recent");
	const [selectedName, setSelectedName] = useState(state === "selected" ? "kaffe" : "tvärsö");
	const [tabs, setTabs] = useState<string[]>(
		seededScratch
			? firstLaunch
				? [scratch.name]
				: ["tvärsö", "kaffe", scratch.name]
			: state === "empty" || firstLaunch
				? []
				: ["tvärsö", "kaffe"],
	);
	const [active, setActive] = useState<string | undefined>(
		seededScratch && state !== "returned" ? scratch.name : undefined,
	);
	const [picker, setPicker] = useState<ProjectPickerMode | null>(
		state === "create" ? "new" : state === "folder" ? "folder" : state === "start" ? "start" : null,
	);
	const [menu, setMenu] = useState<{ project: HomeProject; x: number; y: number } | null>(null);
	const [removed, setRemoved] = useState<readonly string[]>([]);
	const [undo, setUndo] = useState<HomeProject | null>(null);
	const [keyboard, setKeyboard] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuTrigger = useRef<HTMLButtonElement | null>(null);
	const Layout = layouts[take];
	const needle = query.trim().toLowerCase();
	const visible = items.filter(
		(project) => !removed.includes(project.name) && `projects/${project.name}/design`.toLowerCase().includes(needle),
	);
	if (sort === "Name") visible.sort((left, right) => left.name.localeCompare(right.name));
	const selected = visible.find((project) => project.name === selectedName) ?? visible[0];
	const opened = items.find((project) => project.name === active);
	function open(project: HomeProject) {
		setTabs((current) => (current.includes(project.name) ? current : [...current, project.name]));
		setActive(project.name);
	}
	function home() {
		setActive(undefined);
		setQuery("");
	}
	function restore() {
		if (!undo) return;
		setRemoved((current) => current.filter((name) => name !== undo.name));
		setUndo(null);
	}
	function create(name: string, isScratch = false, parent?: string) {
		const project: HomeProject = { ...scratch, name };
		setItems((current) => [project, ...current.filter((item) => item.name !== name)]);
		setRemoved((current) => current.filter((item) => item !== name));
		if (parent) setLocations((current) => ({ ...current, [name]: `${parent}/${name}` }));
		if (isScratch) setManaged((current) => [...current, name]);
		setPicker(null);
		open(project);
	}
	function startScratch() {
		let name = "untitled";
		let index = 2;
		while (items.some((item) => item.name === name)) name = `untitled-${index++}`;
		create(name, true);
	}
	useEffect(() => {
		if (menu) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
	}, [menu]);
	useEffect(() => {
		if (!undo) return;
		const timer = window.setTimeout(() => setUndo(null), 6000);
		return () => window.clearTimeout(timer);
	}, [undo]);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			setKeyboard(true);
			if (event.key === "Escape" && menu) {
				setMenu(null);
				menuTrigger.current?.focus();
			}
			if (
				(event.metaKey || event.ctrlKey) &&
				event.key === "z" &&
				undo &&
				!(event.target instanceof HTMLInputElement)
			) {
				event.preventDefault();
				setRemoved((current) => current.filter((name) => name !== undo.name));
				setUndo(null);
			}
			if (
				event.key === "/" &&
				!picker &&
				!(event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable]"))
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
	}, [undo, menu, picker]);
	const actions: ProjectActions = {
		query,
		setQuery,
		projects: visible,
		selected,
		select: (project) => setSelectedName(project.name),
		open,
		create: instant ? startScratch : () => setPicker("new"),
		folder: () => setPicker("folder"),
		sort,
		setSort,
		manage: (project, target) => {
			const box = target.getBoundingClientRect();
			menuTrigger.current = target;
			setMenu({ project, x: Math.max(10, box.right - 200), y: Math.min(window.innerHeight - 90, box.bottom + 6) });
		},
	};
	return (
		<div
			ref={root}
			className={cn("home-study projects-study", keyboard && "home-keyboard")}
			data-projects-take={take}
		>
			<div className="home-window-lights" aria-hidden="true">
				<i />
				<i />
				<i />
			</div>
			<SpoolShell
				tabs={tabs}
				activeTab={active}
				canvasControls={opened !== undefined && opened.frames === 0}
				zoom="100%"
				onHome={home}
				onFocus={setActive}
				onReorder={(order) => setTabs([...order])}
				onPick={() => setPicker(instant ? "start" : "folder")}
				onClose={(name) => {
					setTabs((current) => current.filter((item) => item !== name));
					if (active === name) setActive(undefined);
				}}
			>
				<div className="pj-body">
					{opened ? (
						opened.frames === 0 ? (
							<ScratchCanvas
								key={opened.name}
								name={opened.name}
								managed={managed.includes(opened.name)}
								location={locations[opened.name]}
								onFolder={actions.folder}
								onRename={(name) => {
									if (name === opened.name) return true;
									if (items.some((item) => item.name === name) || /[\/]/.test(name)) return false;
									setItems((current) =>
										current.map((item) => (item.name === opened.name ? { ...item, name } : item)),
									);
									setTabs((current) => current.map((item) => (item === opened.name ? name : item)));
									setManaged((current) => current.map((item) => (item === opened.name ? name : item)));
									setLocations((current) => {
										const old = current[opened.name];
										return old
											? { ...current, [name]: `${old.slice(0, old.lastIndexOf("/"))}/${name}` }
											: current;
									});
									setActive(name);
									return true;
								}}
							/>
						) : (
							<div className="pj-open-project">
								<aside>
									<strong>{opened.name}</strong>
									<span>Pages</span>
									<span className="is-selected">app</span>
									<button type="button" onClick={home}>
										<Arrow className="rotate-180" />
										Back to projects
									</button>
								</aside>
								<div>
									<span className="pj-open-crumb">{opened.name} / app</span>
									<CanvasArtwork kind={opened.art} />
								</div>
							</div>
						)
					) : firstLaunch && !items.length ? (
						<WelcomeProjects actions={actions} />
					) : (
						<Layout actions={actions} />
					)}
				</div>
			</SpoolShell>
			{menu && (
				<>
					<button
						type="button"
						className="pj-menu-backdrop"
						aria-label="Close project menu"
						onClick={() => setMenu(null)}
					/>
					<div
						ref={menuRef}
						role="menu"
						aria-label={`Manage ${menu.project.name}`}
						className="pj-menu flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit"
						style={{ left: menu.x, top: menu.y }}
						onKeyDown={(event) => {
							if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
							event.preventDefault();
							const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
							const index = buttons.findIndex((button) => button === document.activeElement);
							buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
						}}
					>
						<MenuItem
							label="Open project"
							onClick={() => {
								open(menu.project);
								setMenu(null);
							}}
						/>
						<MenuRule />
						<MenuItem
							label="Remove from spool"
							onClick={() => {
								setRemoved((current) => [...current, menu.project.name]);
								setUndo(menu.project);
								setMenu(null);
							}}
						/>
					</div>
				</>
			)}
			{undo && <ForgetToast key={undo.name} name={undo.name} windowMs={6000} onUndo={restore} />}
			{picker && (
				<ProjectPicker
					initial={picker}
					onClose={() => setPicker(null)}
					onScratch={startScratch}
					onOpen={(project) => {
						setItems((current) =>
							current.some((item) => item.name === project.name) ? current : [...current, project],
						);
						setRemoved((current) => current.filter((name) => name !== project.name));
						setPicker(null);
						open(project);
					}}
					onCreate={(name, parent) => create(name, false, parent)}
				/>
			)}
		</div>
	);
}
