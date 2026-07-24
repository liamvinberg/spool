import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectCard } from "./api";
import { fetchProjects, fetchSession, postUpgrade, putSession, subscribeSse } from "./api";
import { type CanvasChrome, ProjectCanvas } from "./canvas/canvas";
import { Home } from "./home";
import { CloseIcon, PlayIcon, PlusIcon, RibbonMark, ThreadIcon } from "./icons";
import { FolderPicker } from "./picker";
import { type UpdateToast, UpdateToastPill } from "./update-toast";

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
	const [toast, setToast] = useState<UpdateToast | null>(null);
	const toastRef = useRef(toast);
	toastRef.current = toast;
	// the daemon version this page first heard — a different one on a later
	// hello is the upgraded daemon back up (#30)
	const daemonVersion = useRef<string | null>(null);
	const dismissedLatest = useRef<string | null>(null);

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

	const offerUpdate = useCallback((latest: string) => {
		if (dismissedLatest.current === latest) return;
		if (toastRef.current !== null && toastRef.current.kind !== "offer") return;
		setToast({ kind: "offer", latest });
	}, []);

	// `spool open` in a shell lands here as a session event — a background tab;
	// hello doubles as the update loop's truth (#30): reload on a version flip,
	// fail honestly when the same daemon comes back mid-update
	useEffect(() => {
		return subscribeSse("/api/events", {
			hello: (data) => {
				const { version, latest } = data as { version?: unknown; latest?: unknown };
				if (typeof version !== "string") return;
				if (daemonVersion.current === null) {
					daemonVersion.current = version;
				} else if (daemonVersion.current !== version) {
					window.location.reload();
					return;
				} else if (toastRef.current?.kind === "updating") {
					setToast({ kind: "failed" });
				}
				if (typeof latest === "string") offerUpdate(latest);
			},
			app: (data) => {
				const event = data as { kind?: unknown; latest?: unknown };
				if (event.kind === "update" && typeof event.latest === "string") offerUpdate(event.latest);
				void refetch();
			},
		});
	}, [refetch, offerUpdate]);

	const startUpgrade = useCallback(async () => {
		setToast({ kind: "updating" });
		const res = await postUpgrade();
		if (!res.ok) setToast({ kind: "failed", message: res.error });
	}, []);

	const dismissToast = useCallback(() => {
		if (toastRef.current?.kind === "offer") dismissedLatest.current = toastRef.current.latest;
		setToast(null);
	}, []);

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
							className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface"
							title="Play"
							onClick={() => window.open(`/play/${encodeURIComponent(focusedTab.name)}`, "_blank")}
						>
							<PlayIcon />
						</button>
						{/* the threads toggle (#34): the map is identity, so on is the default */}
						<button
							type="button"
							className={`flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface ${
								chrome.arrowsOn ? "text-text" : "text-muted"
							}`}
							title="Threads (T)"
							aria-pressed={chrome.arrowsOn}
							onClick={chrome.toggleArrows}
						>
							<ThreadIcon />
						</button>
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

			{toast !== null && (
				<UpdateToastPill
					toast={toast}
					aboveCanvasTools={focusedTab !== undefined && chrome !== null}
					onUpdate={() => void startUpgrade()}
					onDismiss={dismissToast}
				/>
			)}

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

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
