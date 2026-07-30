import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectCard } from "./api";
import {
	beaconForgetProject,
	fetchProjects,
	fetchSession,
	postForgetProject,
	postUpgrade,
	putSession,
	subscribeSse,
} from "./api";
import { type CanvasChrome, ProjectCanvas } from "./canvas/canvas";
import { ForgetToast } from "./forget-toast";
import { Home } from "./home";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { HotkeySheet } from "./hotkey-sheet";
import { type HotkeyIdFor, hotkeyKey } from "./hotkeys";
import { CloseIcon, EdgeIcon, PlusIcon, RibbonMark } from "./icons";
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

/** Same undo window the Trash toast stands for (#23) — one feel across the app. */
const FORGET_UNDO_MS = 5000;

export function App() {
	const [projects, setProjects] = useState<ProjectCard[]>([]);
	const [open, setOpen] = useState<string[]>([]);
	const openRef = useRef(open);
	openRef.current = open;
	const [focused, setFocused] = useState<string | null>(null);
	const [booted, setBooted] = useState(false);
	const [picking, setPicking] = useState(false);
	const [chrome, setChrome] = useState<CanvasChrome | null>(null);
	const [pendingForget, setPendingForget] = useState<TabProject | null>(null);
	const pendingForgetRef = useRef<TabProject | null>(null);
	const forgetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [keysOpen, setKeysOpen] = useState(false);
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
				putSession(project.root, true);
			}
			if (focus) focusProject(project.root);
		},
		[focusProject],
	);

	const closeTab = useCallback(
		(root: string) => {
			const next = openRef.current.filter((r) => r !== root);
			setOpen(next);
			putSession(root, false);
			if (focused === root) focusProject(null);
		},
		[focused, focusProject],
	);

	// --- forget (#13): the card vanishes now, the registry write waits on the
	// toast. Undo means nothing was ever written, so openedAt survives and the
	// card returns to the slot it came from.

	const commitForget = useCallback(() => {
		const project = pendingForgetRef.current;
		pendingForgetRef.current = null;
		clearTimeout(forgetTimer.current);
		setPendingForget(null);
		if (project === null) return;
		if (openRef.current.includes(project.root) && focused === project.root) focusProject(null);
		void postForgetProject(project.root).then((ok) => {
			// the registry still knows it: bring the card back rather than lose it
			if (!ok) void refetch();
		});
	}, [focused, focusProject, refetch]);

	const stageForget = useCallback(
		(project: TabProject) => {
			commitForget(); // an earlier toast still open commits now — one undo slot
			pendingForgetRef.current = project;
			setPendingForget(project);
			forgetTimer.current = setTimeout(commitForget, FORGET_UNDO_MS);
		},
		[commitForget],
	);

	const undoForget = useCallback(() => {
		if (pendingForgetRef.current === null) return;
		pendingForgetRef.current = null;
		clearTimeout(forgetTimer.current);
		setPendingForget(null);
	}, []);

	// ⌘Z answers the toast, the way it does on the canvas (#7); the toast
	// scope outranks the canvas, so one press means one undo
	useEffect(() => {
		return attachHotkeyLayer({
			scope: "toast",
			active: () => pendingForgetRef.current !== null,
			handlers: {
				"toast.undo": (event) => {
					event?.preventDefault();
					undoForget();
				},
			} satisfies Record<HotkeyIdFor<"toast">, HotkeyHandler>,
		});
	}, [undoForget]);

	// ? opens the shortcut sheet over whatever the shell is showing
	useEffect(() => {
		return attachHotkeyLayer({
			scope: "app",
			handlers: {
				"app.help": () => setKeysOpen(true),
			} satisfies Record<HotkeyIdFor<"app">, HotkeyHandler>,
		});
	}, []);

	// leaving the page mid-toast: the staged forget still happens
	useEffect(() => {
		const flush = () => {
			const project = pendingForgetRef.current;
			if (project === null) return;
			pendingForgetRef.current = null;
			beaconForgetProject(project.root);
		};
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, []);

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
							className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted hover:bg-surface"
							onClick={() => setPicking(true)}
							title="Open a project folder"
						>
							<PlusIcon />
						</button>
					</nav>
				</div>

				{focusedTab !== undefined && chrome !== null && (
					<div className="flex h-full items-center gap-4">
						{/* Play lives on the selection now (#13/#24), where the frame it
						    would open is the frame you are looking at. A header button
						    could only ever guess, and its guess with nothing selected was
						    the first frame by name — a start that means nothing. */}
						{/* the threads toggle (#34): the map is identity, so on is the
						    default — but a page with no thread gets no switch. It governs
						    the whole flow layer now (#151), the arrows and the docked
						    walks together. It carried a dot over hidden faults until #203
						    took the faults off the canvas; with nothing left to whisper
						    about, the toggle is a toggle again. */}
						{chrome.hasThreads && (
							<button
								type="button"
								className={`flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface ${
									chrome.arrowsOn ? "text-text" : "text-muted"
								}`}
								title={`Threads (${hotkeyKey("canvas.threads")})`}
								aria-pressed={chrome.arrowsOn}
								onClick={chrome.toggleArrows}
							>
								<EdgeIcon />
							</button>
						)}
						<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">{chrome.zoomPct}%</span>
					</div>
				)}
			</header>

			<main className="min-h-0 flex-1">
				{focusedTab === undefined ? (
					<Home
						projects={projects}
						forgetting={pendingForget?.root ?? null}
						onOpenProject={(project) => openTab(project)}
						onForgetProject={(project) => stageForget(project)}
					/>
				) : (
					<ProjectCanvas key={focusedTab.root} project={focusedTab.name} onChrome={setChrome} />
				)}
			</main>

			{pendingForget !== null && (
				<ForgetToast name={pendingForget.name} windowMs={FORGET_UNDO_MS} onUndo={undoForget} />
			)}

			{toast !== null && (
				<UpdateToastPill
					toast={toast}
					aboveCanvasTools={focusedTab !== undefined && chrome !== null}
					stacked={pendingForget !== null}
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

			{keysOpen && <HotkeySheet onClose={() => setKeysOpen(false)} />}
		</div>
	);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
