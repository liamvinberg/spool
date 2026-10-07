import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROJECTS, type Project, UNTITLED } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { CanvasArtwork, ProjectArtwork } from "shared/ui/demo/home-artwork";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { CheckIcon, ChevronIcon, FolderIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { SpoolShell } from "shared/ui/spool/shell";
import { FinderPanel } from "./finder";
import { EASE, GROW, QUICK } from "./motion";
import { type Intent, type Job, Preview } from "./preview";
import { type Row, readField, type Said, say } from "./read";
import { DIRS, type Host, isPath, read, readLink, type Scope, slug, trim } from "./world";

/**
 * start-field: Home's head is one field, and it reads what you give it. A name is
 * a draft, a path is a folder spool reads, a git link is a clone, and @ picks who
 * the project belongs to. ⌘K summons the same field over any canvas, so starting
 * or bringing in a project never needs Home.
 *
 * The right half always draws what ↵ would do, and carries the id of the project
 * it becomes, so ↵ grows that picture into the canvas.
 */

export type StartStep = "home" | "name" | "path" | "link" | "team" | "palette";

type View = { kind: "home" } | { kind: "canvas"; id: string };

const START: Record<StartStep, { query: string; scope: Scope; view: View; palette: boolean; sel: number; job: boolean }> = {
	home: { query: "", scope: "own", view: { kind: "home" }, palette: false, sel: -1, job: false },
	name: { query: "harbor", scope: "own", view: { kind: "home" }, palette: false, sel: 0, job: false },
	path: { query: "~/code/tidemark-api", scope: "own", view: { kind: "home" }, palette: false, sel: 0, job: false },
	link: { query: "github.com/mira-k/orbit", scope: "own", view: { kind: "home" }, palette: false, sel: 0, job: true },
	team: { query: "", scope: "tidemark", view: { kind: "home" }, palette: false, sel: 3, job: false },
	palette: { query: "", scope: "own", view: { kind: "canvas", id: "tvarso" }, palette: true, sel: -1, job: false },
};

export function StartField({ step = "home" }: { step?: StartStep }) {
	const start = START[step];
	const [host, setHost] = useState<Host>("app");
	const [scope, setScopeState] = useState<Scope>(start.scope);
	const [projects, setProjects] = useState<Project[]>(PROJECTS);
	const [tabs, setTabs] = useState<string[]>(step === "team" ? ["tidemark-app", "kaffe"] : ["tvarso", "kaffe"]);
	const [view, setView] = useState<View>(start.view);
	const [palette, setPalette] = useState(start.palette);
	const [query, setQueryState] = useState(start.query);
	const [sel, setSel] = useState(start.sel);
	const [readDone, setReadDone] = useState<string | null>(step === "path" ? start.query : null);
	const [job, setJob] = useState<Job | null>(() => {
		if (!start.job) return null;
		const finding = readLink(start.query);
		return { kind: "clone", id: finding.into, name: finding.name, from: finding.url, into: finding.into, progress: 0.38, stage: "moving", frames: finding.frames };
	});
	const [menu, setMenu] = useState<"pill" | "side" | null>(null);
	const [finder, setFinder] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [born, setBorn] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const field = useRef<HTMLInputElement>(null);

	const read$ = useMemo(() => readField(query, scope, host, projects, readDone, job, view.kind === "home"), [query, scope, host, projects, readDone, job, view.kind]);
	const rows = read$.rows;

	const setQuery = (next: string) => {
		setQueryState(next);
		setNotice(null);
		setSel(next.trim() === "" ? -1 : 0);
	};
	const setScope = (next: Scope) => {
		setScopeState(next);
		setMenu(null);
		setSel(-1);
	};

	/* a typed folder is read once it stops changing: the reading is the daemon's, and takes a beat */
	useEffect(() => {
		const at = trim(query.trim());
		if (!isPath(at) || query.endsWith("/") || readDone === at) return;
		const reading = read(at, projects);
		if (!reading || reading.kind === "dir") return;
		const timer = setTimeout(() => setReadDone(at), 420);
		return () => clearTimeout(timer);
	}, [query, projects, readDone]);

	const byId = (id: string) => projects.find((project) => project.id === id);

	const enter = useCallback((project: Project) => {
		setProjects((all) => (all.some((item) => item.id === project.id) ? all.map((item) => (item.id === project.id ? project : item)) : [project, ...all]));
		setTabs((open) => (open.includes(project.id) ? open : [...open, project.id]));
		setView({ kind: "canvas", id: project.id });
		setPalette(false);
		setQueryState("");
		setSel(-1);
		setJob(null);
		setMenu(null);
	}, []);

	/* clone and fetch run on their own; Esc cancels them */
	useEffect(() => {
		if (!job) return;
		if (job.stage === "reading") {
			const timer = setTimeout(() => {
				const team = scope === "tidemark";
				if (job.kind === "fetch") {
					const project = byId(job.id);
					if (project) enter({ ...project, onMac: true, edited: project.edited });
					return;
				}
				const finding = readLink(job.from);
				enter({
					id: job.id,
					name: job.name,
					art: finding.frames > 0 ? finding.art : "blank",
					frames: finding.frames,
					edited: "now",
					place: team ? { kind: "team", label: "Tidemark", path: job.into } : { kind: "folder", label: job.into, path: job.into, branch: "main" },
					...(team ? { onMac: true, here: [] } : {}),
				});
				setBorn(job.id);
			}, 650);
			return () => clearTimeout(timer);
		}
		const timer = setTimeout(() => {
			setJob((current) => {
				if (!current) return current;
				const progress = Math.min(1, current.progress + (current.kind === "clone" ? 0.012 : 0.03));
				return progress >= 1 ? { ...current, progress: 1, stage: "reading" } : { ...current, progress };
			});
		}, 70);
		return () => clearTimeout(timer);
	});

	const act = (intent: Intent) => {
		const team = scope === "tidemark";
		switch (intent.do) {
			case "create": {
				const into = intent.scope ?? scope;
				const shared = into === "tidemark";
				const name = intent.name || nextUntitled(projects);
				const id = `${into}-${slug(name)}`;
				const path = `${shared ? "~/spool/tidemark" : "~/spool"}/${slug(name)}`;
				enter({
					id,
					name,
					art: "blank",
					frames: 0,
					edited: "now",
					place: shared ? { kind: "team", label: "Tidemark", path } : { kind: "draft", label: "Drafts", path },
					...(shared ? { onMac: true, here: [] } : {}),
				});
				setBorn(id);
				return;
			}
			case "open":
				enter(intent.project);
				return;
			case "fetch":
				setJob({ kind: "fetch", id: intent.project.id, name: intent.project.name, from: "Tidemark", into: intent.project.place.path, progress: 0, stage: "moving", frames: intent.project.frames });
				return;
			case "clone":
				setJob({ kind: "clone", id: intent.finding.into, name: intent.finding.name, from: intent.finding.url, into: intent.finding.into, progress: 0, stage: "moving", frames: intent.finding.frames });
				return;
			case "adopt": {
				const finding = intent.finding;
				if (finding.kind === "inside") {
					const tvarso = byId("tvarso");
					if (tvarso) enter(tvarso);
					return;
				}
				if (finding.kind !== "project" && finding.kind !== "repo" && finding.kind !== "plain") return;
				const place: Project["place"] = team
					? { kind: "team", label: "Tidemark", path: finding.path }
					: { kind: "folder", label: finding.path, path: finding.path, ...("branch" in finding && finding.branch ? { branch: finding.branch } : {}) };
				enter({
					id: finding.path,
					name: finding.name,
					art: finding.kind === "project" ? finding.art : "blank",
					frames: finding.kind === "project" ? finding.frames : 0,
					edited: "now",
					place,
					...(team ? { onMac: true, here: [] } : {}),
				});
				setBorn(finding.path);
				return;
			}
			case "complete":
				setQuery(intent.reading?.kind === "dir" ? `${intent.text}/` : intent.text);
				return;
			case "scope":
				setScope(intent.scope);
				setQueryState("");
				return;
			case "choose":
				setFinder(true);
				return;
			default:
				return;
		}
	};

	const focusRow: Row | null = job ? (rows[0] ?? null) : sel >= 0 ? (rows[sel] ?? null) : query.trim() === "" ? { id: "new", intent: { do: "create", name: "" } } : (rows[0] ?? null);

	const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return;
		const empty = query.trim() === "";
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (rows.length === 0 || job) return;
			const low = empty ? -1 : 0;
			const span = rows.length - low;
			const next = ((sel - low + (event.key === "ArrowDown" ? 1 : -1) + span) % span) + low;
			setSel(next);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (job) return;
			if (focusRow) act(focusRow.intent);
		} else if (event.key === "Tab") {
			event.preventDefault();
			if (job) return;
			if (query.trimStart().startsWith("@")) {
				const row = rows[Math.max(0, sel)];
				if (row) act(row.intent);
			} else if (read$.ghost) {
				const done = query + read$.ghost;
				const reading = isPath(done) ? read(done, projects) : null;
				setQuery(reading?.kind === "dir" && DIRS[trim(done)] ? `${done}/` : done);
			} else if (focusRow?.intent.do === "complete") {
				act(focusRow.intent);
			}
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (menu) setMenu(null);
			else if (job) setJob(null);
			else if (query !== "") setQuery("");
			else if (palette) setPalette(false);
		} else if (event.key === "Backspace" && query === "" && scope !== "own") {
			event.preventDefault();
			setScope("own");
		}
	};

	/* ⌘K and ⌘N bring the field wherever you are; ⌘O is the Finder, in the app */
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			const k = event.key.toLowerCase();
			if (k === "k" || k === "n") {
				event.preventDefault();
				if (view.kind === "home") {
					field.current?.focus();
					field.current?.select();
				} else setPalette((open) => !open || k === "n");
			} else if (k === "o" && host === "app") {
				event.preventDefault();
				setFinder(true);
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [view, host]);

	useEffect(() => {
		if (view.kind === "home" || palette) requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
	}, [view, palette]);

	const drop = (event: React.DragEvent) => {
		event.preventDefault();
		setDragging(false);
		const name = event.dataTransfer.files[0]?.name ?? "moodboard";
		if (host === "browser") {
			setNotice(`dropped ${name} · a browser gives spool no path · paste it to read the folder`);
			return;
		}
		const known = Object.entries(DIRS).find(([, names]) => names.includes(name));
		setQuery(known ? `${known[0]}/${name}` : `~/Desktop/${name}`);
	};

	const current = view.kind === "canvas" ? byId(view.id) : undefined;

	const launcher = (size: "home" | "palette") => (
		<Launcher
			size={size}
			fieldRef={field}
			query={query}
			scope={scope}
			host={host}
			read={read$}
			sel={sel}
			focusRow={focusRow}
			job={job}
			projects={projects}
			born={born}
			notice={notice}
			dragging={dragging}
			menu={menu === "pill"}
			onQuery={setQuery}
			onKey={onKey}
			onSel={setSel}
			onAct={act}
			onPill={() => setMenu(menu === "pill" ? null : "pill")}
			onScope={setScope}
		/>
	);

	return (
		<MotionConfig reducedMotion="user">
			<LayoutGroup>
				<SpoolShell
					activeTab={current?.name}
					tabs={tabs.map((id) => byId(id)?.name ?? id)}
					headerAccessory={
						<HostSwitch
							host={host}
							onHost={(next) => {
								setHost(next);
								setNotice(null);
								requestAnimationFrame(() => field.current?.focus());
							}}
						/>
					}
					onHome={() => {
						if (view.kind === "canvas") {
							const back = recentsIndex(projects, scope, view.id);
							setView({ kind: "home" });
							setQueryState("");
							setSel(back);
						}
						setPalette(false);
					}}
					onFocus={(name) => {
						const project = projects.find((item) => item.name === name);
						if (project) {
							setView({ kind: "canvas", id: project.id });
							setPalette(false);
						}
					}}
					onClose={(name) => {
						const project = projects.find((item) => item.name === name);
						if (!project) return;
						setTabs((open) => open.filter((id) => id !== project.id));
						if (view.kind === "canvas" && view.id === project.id) setView({ kind: "home" });
					}}
					onPick={() => {
						if (view.kind === "home") field.current?.focus();
						else setPalette(true);
					}}
				>
					<div className="relative h-full">
						{view.kind === "home" ? (
							<div
								className="grid h-full grid-cols-[208px_minmax(0,1fr)]"
								onDragOver={(event) => {
									event.preventDefault();
									setDragging(true);
								}}
								onDragLeave={(event) => {
									if (event.currentTarget === event.target) setDragging(false);
								}}
								onDrop={drop}
							>
								<Sidebar scope={scope} host={host} menu={menu === "side"} projects={projects} onMenu={() => setMenu(menu === "side" ? null : "side")} onScope={setScope} />
								<main className="min-w-0 overflow-hidden px-[48px] pt-[40px] pb-[30px]">{launcher("home")}</main>
							</div>
						) : current ? (
							<CanvasView key={current.id} project={current} onRename={(name) => setProjects((all) => all.map((item) => (item.id === current.id ? { ...item, name } : item)))} />
						) : null}
						<AnimatePresence>
							{palette && view.kind === "canvas" && (
								<motion.div key="palette" className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={QUICK}>
									<button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-[color-mix(in_oklab,var(--color-bg)_62%,transparent)]" onClick={() => setPalette(false)} />
									<div className="pointer-events-none absolute inset-x-0 top-[64px] flex justify-center">
										<motion.div
											initial={{ opacity: 0, y: -8, scale: 0.985 }}
											animate={{ opacity: 1, y: 0, scale: 1 }}
											exit={{ opacity: 0, y: -4, scale: 0.99 }}
											transition={{ duration: 0.2, ease: EASE }}
											className="pointer-events-auto w-[940px] overflow-hidden rounded-[12px] border border-border-raised bg-bg"
										>
											{launcher("palette")}
										</motion.div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
						{finder && host === "app" && (
							<FinderPanel
								onCancel={() => setFinder(false)}
								onPick={(path) => {
									setFinder(false);
									setQuery(path);
									field.current?.focus();
								}}
							/>
						)}
					</div>
				</SpoolShell>
			</LayoutGroup>
		</MotionConfig>
	);
}

function nextUntitled(projects: Project[]): string {
	let name = UNTITLED;
	for (let n = 2; projects.some((project) => project.name === name); n += 1) name = `${UNTITLED} ${n}`;
	return name;
}

function recentsIndex(projects: Project[], scope: Scope, id: string): number {
	const list = projects.filter((project) => (scope === "own" ? project.place.kind !== "team" : project.place.kind === "team"));
	return list.findIndex((project) => project.id === id);
}

/* ── the launcher: field, reading, rows, preview ─────────────────── */

function Launcher({
	size,
	fieldRef,
	query,
	scope,
	host,
	read: reading,
	sel,
	focusRow,
	job,
	projects,
	born,
	notice,
	dragging,
	menu,
	onQuery,
	onKey,
	onSel,
	onAct,
	onPill,
	onScope,
}: {
	size: "home" | "palette";
	fieldRef: React.RefObject<HTMLInputElement | null>;
	query: string;
	scope: Scope;
	host: Host;
	read: ReturnType<typeof readField>;
	sel: number;
	focusRow: Row | null;
	job: Job | null;
	projects: Project[];
	born: string | null;
	notice: string | null;
	dragging: boolean;
	menu: boolean;
	onQuery: (query: string) => void;
	onKey: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	onSel: (index: number) => void;
	onAct: (intent: Intent) => void;
	onPill: () => void;
	onScope: (scope: Scope) => void;
}) {
	const home = size === "home";
	const said: Said | null = focusRow ? say(focusRow.intent, scope, job, projects) : null;
	const placeholder = scope === "own" ? "Name a project, paste a path or a git link" : "Name a Tidemark project, paste a path or a git link";
	return (
		<div className={cn("flex flex-col", home ? "h-full" : "")}>
			{/* the field */}
			<div
				className={cn(
					"relative flex shrink-0 items-center gap-[12px]",
					home
						? cn("h-[64px] rounded-[12px] border bg-surface pr-[18px] pl-[12px] [transition:border-color_140ms_ease]", dragging ? "border-dashed border-text" : "border-border-raised focus-within:border-muted")
						: "h-[60px] border-border border-b pr-[18px] pl-[12px]",
				)}
			>
				<ScopePill scope={scope} big={home} onClick={onPill} />
				<div className="relative min-w-0 flex-1">
					<input
						ref={fieldRef}
						value={query}
						spellCheck={false}
						autoComplete="off"
						aria-label="Start or open a project"
						placeholder={placeholder}
						onChange={(event) => onQuery(event.target.value)}
						onKeyDown={onKey}
						className={cn("w-full bg-transparent text-text outline-none placeholder:text-muted", home ? "text-[22px] leading-[30px] tracking-[-0.01em]" : "text-[18px] leading-[26px]")}
					/>
					{reading.ghost && (
						<div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden whitespace-pre", home ? "text-[22px] leading-[30px] tracking-[-0.01em]" : "text-[18px] leading-[26px]")}>
							<span className="invisible">{query}</span>
							<span className="text-muted opacity-60">{reading.ghost}</span>
						</div>
					)}
				</div>
				{dragging ? (
					<span className="shrink-0 text-text type-detail">drop to read this folder</span>
				) : (
					<span className="flex shrink-0 items-center gap-[6px]">
						<Kbd>{home ? "⌘K" : "esc"}</Kbd>
					</span>
				)}
				<AnimatePresence>{menu && <ScopeMenu scope={scope} onScope={onScope} className="top-[calc(100%+6px)] left-[8px]" />}</AnimatePresence>
			</div>

			{/* what spool reads */}
			<div className={cn("flex h-[36px] shrink-0 items-center justify-between gap-[24px]", home ? "px-[16px]" : "px-[20px]")}>
				<span className={cn("min-w-0 truncate type-detail", notice ? "text-text" : "text-muted")}>{notice ?? reading.status}</span>
				<span className="shrink-0 text-muted type-detail">{reading.keys}</span>
			</div>

			{/* rows and the preview of what ↵ does */}
			<div className={cn("grid min-h-0 flex-1 gap-[32px]", home ? "mt-[12px] grid-cols-[minmax(0,1fr)_520px]" : "h-[468px] grid-cols-[minmax(0,1fr)_380px] gap-[24px] border-border border-t px-[12px] pt-[12px] pb-[20px]")}>
				<div className="min-h-0 overflow-hidden">
					<Rows rows={reading.rows} labels={reading.labels} sel={sel} scope={scope} job={job} projects={projects} born={born} host={host} onSel={onSel} onAct={onAct} />
				</div>
				<div className={cn("min-w-0", home ? "pt-[4px]" : "pt-[4px] pr-[8px]")}>
					{said && focusRow && (
						<motion.div key={`${focusRow.id}-${said.stageId ?? ""}`} initial={{ opacity: 0.35 }} animate={{ opacity: 1 }} transition={QUICK}>
							<Preview size={size} stageId={said.stageId} stage={said.stage} title={said.title} meta={said.meta}>
								{said.body}
							</Preview>
						</motion.div>
					)}
				</div>
			</div>
		</div>
	);
}

function Rows({
	rows,
	labels,
	sel,
	scope,
	job,
	projects,
	born,
	host,
	onSel,
	onAct,
}: {
	rows: Row[];
	labels: { at: number; text: string }[];
	sel: number;
	scope: Scope;
	job: Job | null;
	projects: Project[];
	born: string | null;
	host: Host;
	onSel: (index: number) => void;
	onAct: (intent: Intent) => void;
}) {
	return (
		<div className="flex flex-col">
			{rows.map((row, index) => {
				const said = say(row.intent, scope, job, projects);
				return (
					<div key={row.id}>
						{labels
							.filter((label) => label.at === index)
							.map((label) => (
								<div key={label.text} className={cn("flex h-[30px] items-end px-[10px] pb-[6px] text-muted type-detail", index > 0 && "mt-[10px]")}>
									{label.text}
								</div>
							))}
						{row.intent.do === "choose" && index > 0 && <div className="mx-[10px] my-[6px] h-px bg-border" />}
						<RowView
							row={row}
							said={said}
							selected={index === sel}
							born={born !== null && row.id === born}
							dim={row.dim === true}
							job={job}
							host={host}
							onHover={() => onSel(index)}
							onClick={() => onAct(row.intent)}
						/>
					</div>
				);
			})}
		</div>
	);
}

function RowView({ row, said, selected, born, dim, job, onHover, onClick }: { row: Row; said: Said; selected: boolean; born: boolean; dim: boolean; job: Job | null; host: Host; onHover: () => void; onClick: () => void }) {
	const project = row.intent.do === "open" || row.intent.do === "fetch" ? row.intent.project : null;
	const running = job !== null && row.id === `job-${job.id}`;
	const key = row.intent.do === "choose" ? "⌘O" : row.intent.do === "fetch" ? "↵ get" : row.intent.do === "complete" ? "tab" : row.intent.do === "none" || row.intent.do === "reading" ? "" : "↵";
	return (
		<motion.button
			type="button"
			initial={born ? { opacity: 0, height: 0 } : false}
			animate={{ opacity: dim && !selected ? 0.55 : 1, height: 44 }}
			transition={GROW}
			onMouseMove={onHover}
			onClick={onClick}
			className={cn("relative flex h-[44px] w-full items-center gap-[12px] overflow-hidden rounded-[8px] px-[10px] text-left", selected ? "bg-surface" : "")}
		>
			<Glyph said={said} away={project?.onMac === false && !running} active={selected} />
			<span className="flex min-w-0 flex-1 items-baseline gap-[6px] truncate type-control">
				{said.verb && !project && <span className={cn(said.name ? "text-muted" : "text-text")}>{said.verb}</span>}
				{said.name && <span className="truncate text-text">{said.name}</span>}
				{said.tail && <span className="text-muted">{said.tail}</span>}
				{born && <span className="ml-[2px] h-[6px] w-[6px] shrink-0 self-center rounded-full bg-thread" title="new" />}
			</span>
			{project && project.place.kind === "team" && project.here && project.here.length > 0 ? (
				<span className="flex shrink-0 items-center gap-[8px]">
					<Faces ids={project.here} size={18} ring={selected ? "border-surface" : "border-bg"} />
					<span className="text-muted type-detail">{said.detail}</span>
				</span>
			) : (
				<span className="max-w-[260px] shrink-0 truncate text-muted type-detail">{running ? `${Math.round((job?.progress ?? 0) * 100)}%` : said.detail}</span>
			)}
			<span className="w-[44px] shrink-0 text-right text-muted type-detail">{selected && !running ? key : ""}</span>
			{running && (
				<span className="absolute inset-x-[10px] bottom-0 h-px bg-border-raised">
					<motion.span className="absolute inset-y-0 left-0 bg-text" initial={false} animate={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} transition={{ duration: 0.1, ease: "linear" }} />
				</span>
			)}
		</motion.button>
	);
}

function Glyph({ said, away, active }: { said: Said; away: boolean; active: boolean }) {
	if (said.glyph === "art" && said.art) {
		return (
			<span className="h-[24px] w-[44px] shrink-0 overflow-hidden rounded-[4px] bg-canvas">
				<ProjectArtwork kind={said.art} className={cn("h-full w-full", away && "opacity-35 grayscale")} />
			</span>
		);
	}
	const icon: ReactNode =
		said.glyph === "plus" ? (
			<PlusIcon className="h-[10px] w-[10px]" />
		) : said.glyph === "folder" || said.glyph === "finder" ? (
			<FolderIcon className="h-[13px] w-[13px]" />
		) : said.glyph === "link" ? (
			<LinkIcon />
		) : said.glyph === "team" ? (
			said.verb === "Tidemark" ? <TeamMark size={18} /> : <Face id="ada" size={18} ring="border-bg" />
		) : said.glyph === "wait" ? (
			<span className="h-[10px] w-[10px] animate-spin rounded-full border border-muted border-t-transparent motion-reduce:animate-none" />
		) : null;
	return <span className={cn("grid h-[24px] w-[44px] shrink-0 place-items-center rounded-[4px] border border-border-raised", active ? "text-text" : "text-muted")}>{icon}</span>;
}

function LinkIcon() {
	return (
		<svg viewBox="0 0 14 14" className="h-[13px] w-[13px]" fill="none" aria-hidden="true">
			<path d="M6 8.2a2.4 2.4 0 0 0 3.4 0l2-2a2.4 2.4 0 0 0-3.4-3.4l-.7.7M8 5.8a2.4 2.4 0 0 0-3.4 0l-2 2a2.4 2.4 0 0 0 3.4 3.4l.7-.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return <kbd className="grid h-[22px] min-w-[22px] place-items-center rounded-[5px] border border-border-raised px-[6px] text-muted type-detail">{children}</kbd>;
}

/* ── scope: the pill in the field and the switcher in the sidebar are one choice ── */

function ScopePill({ scope, big, onClick }: { scope: Scope; big: boolean; onClick: () => void }) {
	return (
		<motion.button
			layout
			transition={QUICK}
			type="button"
			onClick={onClick}
			className={cn("flex shrink-0 items-center gap-[8px] rounded-[8px] bg-raised pr-[10px] pl-[6px] type-control hover:bg-border-raised", big ? "h-[36px]" : "h-[32px]")}
			title="@ switches"
		>
			{scope === "tidemark" ? <TeamMark size={22} /> : <Face id="ada" size={22} ring="border-raised" />}
			<span>{scope === "tidemark" ? "Tidemark" : "Yours"}</span>
			<ChevronIcon open className="h-[9px] w-[9px] text-muted" />
		</motion.button>
	);
}

function ScopeMenu({ scope, onScope, className }: { scope: Scope; onScope: (scope: Scope) => void; className?: string }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -2 }}
			transition={QUICK}
			className={cn("absolute z-30 w-[260px] rounded-[9px] border border-border-raised bg-raised p-[5px]", className)}
		>
			{(["own", "tidemark"] as const).map((item) => (
				<button key={item} type="button" onClick={() => onScope(item)} className={cn("flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left hover:bg-surface", scope === item && "bg-surface")}>
					<span className="grid w-[22px] place-items-center">{item === "tidemark" ? <TeamMark /> : <Face id="ada" size={20} ring="border-raised" />}</span>
					<span className="flex-1 type-control">{item === "tidemark" ? "Tidemark" : "Your projects"}</span>
					<span className="text-muted type-detail">{item === "tidemark" ? "4 people" : "on this Mac"}</span>
					<span className="w-[12px]">{scope === item && <CheckIcon className="h-[12px] w-[12px]" />}</span>
				</button>
			))}
		</motion.div>
	);
}

function Sidebar({ scope, host, menu, projects, onMenu, onScope }: { scope: Scope; host: Host; menu: boolean; projects: Project[]; onMenu: () => void; onScope: (scope: Scope) => void }) {
	const count = projects.filter((project) => (scope === "own" ? project.place.kind !== "team" : project.place.kind === "team")).length;
	return (
		<aside className="relative flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
			<div className="mb-[26px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
				<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
				<span>spool</span>
			</div>
			<button type="button" onClick={onMenu} className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left outline-none hover:bg-surface focus-visible:border-muted">
				{scope === "tidemark" ? <TeamMark /> : <Face id="ada" size={20} ring="border-bg" />}
				<span className="flex-1 type-control">{scope === "tidemark" ? "Tidemark" : "Your projects"}</span>
				<ChevronIcon open className="h-[10px] w-[10px] text-muted" />
			</button>
			<AnimatePresence>{menu && <ScopeMenu scope={scope} onScope={onScope} className="top-[138px] left-[16px] w-[240px]" />}</AnimatePresence>
			<nav className="mt-[18px] flex flex-col gap-[2px]">
				<span className="flex h-[36px] items-center gap-[12px] rounded-[7px] bg-surface px-[12px] type-control [&>svg]:h-[16px] [&>svg]:w-[16px]">
					<FrameIcon />
					<span className="flex-1">Projects</span>
					<span className="text-muted type-detail">{count}</span>
				</span>
				{scope === "tidemark" && (
					<span className="flex h-[36px] items-center gap-[12px] rounded-[7px] px-[12px] text-muted type-control">
						<span className="w-[16px]" />
						<span className="flex-1">People</span>
						<span className="type-detail">4</span>
					</span>
				)}
			</nav>
			<div className="mt-auto pl-[12px] text-muted type-detail">{host === "app" ? "On this Mac" : "localhost:7767"}</div>
		</aside>
	);
}

/** a proposal's own control: the same take in the Mac app or in a browser tab */
function HostSwitch({ host, onHost }: { host: Host; onHost: (host: Host) => void }) {
	return (
		<div className="flex items-center gap-[8px]">
			<span className="text-muted type-detail">runs in</span>
			<div className="flex rounded-[7px] border border-border-raised p-[2px]">
				{(["app", "browser"] as const).map((item) => (
					<button key={item} type="button" onClick={() => onHost(item)} className={cn("h-[24px] rounded-[5px] px-[9px] type-detail", host === item ? "bg-raised text-text" : "text-muted hover:text-text")}>
						{item}
					</button>
				))}
			</div>
		</div>
	);
}

/* ── the canvas a project opens to ─────────────────────────────── */

function CanvasView({ project, onRename }: { project: Project; onRename: (name: string) => void }) {
	const fresh = project.frames === 0;
	return (
		<CanvasChrome
			pages={fresh ? [] : [{ name: "flows", frames: ["start", "explore", "detail"], open: true, active: true }, { name: "system", frames: ["tokens", "type"] }, { name: "explore", frames: ["a", "b", "c", "d"] }]}
			selected={fresh ? undefined : "start"}
			tool={fresh ? "none" : "select"}
		>
			<motion.div layoutId={`stage-${project.id}`} transition={GROW} className="absolute inset-0 overflow-hidden bg-canvas" style={{ borderRadius: 0 }}>
				<motion.div className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, delay: 0.12, ease: EASE }}>
					{fresh ? (
						<ProjectEmpty
							project={project.name}
							root={project.place.path}
							onRename={async (name) => {
								if (!name || name.includes("/")) throw new Error("Use a folder name without slashes.");
								onRename(name);
							}}
						/>
					) : (
						<CanvasArtwork kind={project.art} />
					)}
				</motion.div>
			</motion.div>
		</CanvasChrome>
	);
}
