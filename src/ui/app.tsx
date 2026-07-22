import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasMode, ProjectCard } from "./api";
import { fetchProjects, fetchSession, putSession, subscribeSse } from "./api";
import { type CanvasChrome, ProjectCanvas } from "./canvas/canvas";
import { Home } from "./home";
import { CloseIcon, PlayIcon, PlusIcon, RibbonMark } from "./icons";
import { FolderPicker } from "./picker";

/**
 * The shell (#4/#12/#13): one top bar — brand lockup as the home door, one
 * tab per open project (focus-not-duplicate, machine session restored), "+"
 * as the picker — and the focused view below. Routerless: / and /p/<name>
 * only; the path is read once at boot and replaceState'd on focus.
 */

interface TabProject {
	root: string;
	name: string;
}

export function App() {
	const [projects, setProjects] = useState<ProjectCard[]>([]);
	const [open, setOpen] = useState<string[]>([]);
	const openRef = useRef(open);
	openRef.current = open;
	const [focused, setFocused] = useState<string | null>(null);
	const [booted, setBooted] = useState(false);
	const [picking, setPicking] = useState(false);
	const [chrome, setChrome] = useState<CanvasChrome | null>(null);

	const byRoot = useMemo(() => new Map(projects.map((p) => [p.root, p])), [projects]);
	const tabs: TabProject[] = useMemo(
		() => open.map((root) => ({ root, name: byRoot.get(root)?.name ?? basename(root) })),
		[open, byRoot],
	);
	const focusedTab = tabs.find((tab) => tab.root === focused);

	const refetch = useCallback(async () => {
		const [cards, session] = await Promise.all([fetchProjects(), fetchSession()]);
		setProjects(cards);
		setOpen(session);
	}, []);

	// boot: session + registry, then focus what the path names
	useEffect(() => {
		void (async () => {
			await refetch();
			setBooted(true);
		})();
	}, [refetch]);

	useEffect(() => {
		if (!booted || focused !== null) return;
		const match = window.location.pathname.match(/^\/p\/([^/]+)$/);
		if (match?.[1] === undefined) return;
		const name = decodeURIComponent(match[1]);
		const root = open.find((r) => basename(r) === name);
		if (root !== undefined) setFocused(root);
	}, [booted, focused, open]);

	// `spool open` in a shell lands here as a session event — a background tab
	useEffect(() => {
		return subscribeSse("/api/events", {
			app: () => void refetch(),
		});
	}, [refetch]);

	useEffect(() => {
		document.title = focusedTab === undefined ? "spool" : `${focusedTab.name} · spool`;
	}, [focusedTab]);

	const focusProject = useCallback((root: string | null) => {
		setFocused(root);
		const path = root === null ? "/" : `/p/${encodeURIComponent(basename(root))}`;
		window.history.replaceState(null, "", path);
	}, []);

	/**
	 * Open-or-focus (#4 focus-not-duplicate). Local state moves first, the PUT
	 * follows, and the session SSE event is the convergence path — no eager
	 * refetch that could race the PUT and flicker the tab away.
	 */
	const openTab = useCallback(
		(project: TabProject, focus = true) => {
			if (!openRef.current.includes(project.root)) {
				const next = [...openRef.current, project.root];
				setOpen(next);
				putSession(next);
			}
			if (focus) focusProject(project.root);
		},
		[focusProject],
	);

	const closeTab = useCallback(
		(root: string) => {
			const next = openRef.current.filter((r) => r !== root);
			setOpen(next);
			putSession(next);
			if (focused === root) focusProject(null);
		},
		[focused, focusProject],
	);

	return (
		<div className="flex h-full flex-col bg-bg">
			<header className="flex h-11 shrink-0 items-center justify-between border-border border-b bg-bg px-4">
				<div className="flex h-full items-center gap-5">
					<button
						type="button"
						className="flex items-center gap-2"
						onClick={() => focusProject(null)}
						title="Home"
					>
						<RibbonMark className="h-[18px] w-3.5" />
						<span className="font-semibold text-md text-text tracking-tight leading-sm">spool</span>
					</button>

					<nav className="flex items-center gap-unit">
						{tabs.map((tab) => {
							const active = focused === tab.root;
							return (
								<div
									key={tab.root}
									className={`group flex h-[26px] items-center rounded-md ${
										active ? "border border-border-raised bg-raised" : ""
									}`}
								>
									<button
										type="button"
										className={`h-full pl-3 text-base leading-none ${
											active ? "pr-1 font-medium text-text" : "pr-1 text-muted hover:text-text"
										}`}
										onClick={() => focusProject(tab.root)}
										title={tab.root}
									>
										{tab.name}
									</button>
									<button
										type="button"
										className="flex h-full w-5 items-center justify-center pr-1 text-muted opacity-0 hover:text-text group-hover:opacity-100"
										onClick={() => closeTab(tab.root)}
										title="Close tab"
									>
										<CloseIcon />
									</button>
								</div>
							);
						})}
						<button
							type="button"
							className="flex h-[26px] w-[26px] items-center justify-center rounded-sm hover:bg-surface"
							onClick={() => setPicking(true)}
							title="Open a project folder"
						>
							<PlusIcon />
						</button>
					</nav>
				</div>

				{focusedTab !== undefined && chrome !== null && (
					<div className="flex h-full items-center gap-4">
						<button
							type="button"
							className="flex h-7 w-7 items-center justify-center rounded-sm opacity-40"
							title="Play — the player arrives with #24"
							disabled
						>
							<PlayIcon />
						</button>
						<ModeControl mode={chrome.mode} onMode={chrome.setMode} />
						<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">{chrome.zoomPct}%</span>
					</div>
				)}
			</header>

			<main className="min-h-0 flex-1">
				{focusedTab === undefined ? (
					<Home projects={projects} onOpenProject={(project) => openTab(project)} />
				) : (
					<ProjectCanvas key={focusedTab.root} project={focusedTab.name} onChrome={setChrome} />
				)}
			</main>

			{picking && (
				<div className="absolute inset-0">
					<FolderPicker
						onOpened={(project) => {
							setPicking(false);
							openTab(project);
						}}
						onClose={() => setPicking(false)}
					/>
				</div>
			)}
		</div>
	);
}

function ModeControl({ mode, onMode }: { mode: CanvasMode; onMode: (mode: CanvasMode) => void }) {
	return (
		<div className="flex items-center gap-[2px] rounded-md bg-surface p-[2px]">
			{(["live", "design"] as const).map((option) => {
				const active = mode === option;
				return (
					<button
						key={option}
						type="button"
						className={`flex items-center rounded-sm px-3 py-unit font-medium text-sm leading-xs ${
							active ? "border border-border-raised bg-raised text-text" : "text-muted hover:text-text"
						}`}
						onClick={() => onMode(option)}
					>
						{option === "live" ? "Live" : "Design"}
					</button>
				);
			})}
		</div>
	);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
