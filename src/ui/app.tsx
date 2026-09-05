import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DaemonIdentity, ProjectCard } from "./api";
import {
	beaconForgetProject,
	fetchDaemonIdentity,
	fetchProjects,
	fetchSession,
	postForgetProject,
	postUpgrade,
	putSession,
	putSessionOrder,
	reloadForNewBundle,
	subscribeSse,
} from "./api";
import { type CanvasChrome, ProjectCanvas } from "./canvas/canvas";
import { desktopBridge } from "./desktop-bridge";
import { desktopWindow } from "./desktop-window";
import { ForgetToast } from "./forget-toast";
import { Home } from "./home";
import { attachHotkeyLayer, type HotkeyHandler, runMenuHotkey } from "./hotkey-dispatch";
import { HotkeySheet } from "./hotkey-sheet";
import { type HotkeyIdFor, hotkeyKey } from "./hotkeys";
import { EdgeIcon, RibbonMark } from "./icons";
import { FolderPicker } from "./picker";
import { settingsMoved, useSettings } from "./settings";
import { SettingsSheet } from "./settings-sheet";
import { type TabProject, TabStrip } from "./tab-strip";
import { type UpdateToast, UpdateToastPill } from "./update-toast";

/**
 * The shell (#4/#12/#13): one top bar — brand lockup as the home door, one
 * tab per open project (focus-not-duplicate, machine session restored), "+"
 * as the picker — and the focused view below. Routerless: / and /p/<name>
 * only; the path is read once at boot and replaceState'd on focus.
 */

/** Same undo window the Trash toast stands for (#23) — one feel across the app. */
const FORGET_UNDO_MS = 5000;

/** How often the page asks who is answering while an upgrade runs. */
const UPDATE_POLL_MS = 1000;
/**
 * How long the pill may keep promising. Long enough for a cold global install
 * and a supervised restart on a slow machine, short enough that an upgrade
 * which quietly did nothing says so while the person is still watching.
 */
const UPDATE_DEADLINE_MS = 120_000;

export function App() {
	// #281: the machine's settings, held from the first paint on so a theme that
	// moves on another page lands on this one too
	useSettings();
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
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [toast, setToast] = useState<UpdateToast | null>(null);
	const toastRef = useRef(toast);
	toastRef.current = toast;
	const dismissedLatest = useRef<string | null>(null);
	/** The Mac app around this window, if there is one; a tab has none. */
	const bridge = useMemo(() => desktopBridge(), []);
	const appWindow = useMemo(() => desktopWindow(), []);

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

	/*
	 * Boot: the session first, alone, and the registry behind it.
	 *
	 * These used to be awaited together, and the registry is the expensive half —
	 * every card in it is a walk of a project's whole design folder, so the shell
	 * of a machine with a dozen projects registered waited on hundreds of frames
	 * being counted before it drew a tab. Nothing on the way to a canvas needs a
	 * card: a tab falls back to its folder's name and the canvas asks the daemon
	 * about its own project directly. So the cards arrive when they arrive, and
	 * Home is the only thing that was ever waiting for them.
	 *
	 * The focus is resolved in the same commit as the session for the same
	 * reason. Landing it an effect later left one render where the session was
	 * known and the focus was not, and what that renders is Home — every project
	 * card, every cover in them fetched, for a frame nobody sees.
	 */
	useEffect(() => {
		void (async () => {
			const session = await fetchSession();
			setOpen(session);
			setFocused((current) => current ?? pathFocus(session));
			setBooted(true);
			setProjects(await fetchProjects());
		})();
	}, []);

	// a project the path names that the session did not have yet: `spool open` in
	// a shell lands as a session event, and the tab it opens is the one this page
	// was asked for
	useEffect(() => {
		if (!booted || focused !== null) return;
		const root = pathFocus(open);
		if (root !== null) setFocused(root);
	}, [booted, focused, open]);

	const offerUpdate = useCallback((latest: string) => {
		if (dismissedLatest.current === latest) return;
		if (toastRef.current !== null && toastRef.current.kind !== "offer") return;
		setToast({ kind: "offer", latest });
	}, []);

	// The app's own update, over its bridge. It takes the pill whenever it has
	// something to say: the app is what the person is looking at, and the
	// daemon's offer comes back the next time the daemon says it.
	useEffect(() => {
		if (bridge === undefined) return;
		const show = (update: typeof bridge.update) => {
			setToast((current) => {
				if (update !== null) return { kind: "app", update };
				return current?.kind === "app" ? null : current;
			});
		};
		show(bridge.update);
		return bridge.onUpdate(show);
	}, [bridge]);

	// `spool open` in a shell lands here as a session event — a background tab.
	// hello carries what the daily check found, on every connection, so a page
	// left open overnight hears about a release without being reloaded (#30).
	// It says nothing about an upgrade in flight: a successor daemon refuses
	// this page's capability rather than greeting it, so the reload that answers
	// that lives in the client, and how an upgrade went is health's to tell.
	useEffect(() => {
		return subscribeSse(
			"/api/events",
			{
				hello: (data) => {
					const { latest } = data as { latest?: unknown };
					if (typeof latest === "string") offerUpdate(latest);
				},
				app: (data) => {
					const event = data as { kind?: unknown; latest?: unknown };
					// the checkout rebuilt the bundle this page is running: the same
					// dead end an upgrade reaches, without the 401 that rescues it
					if (event.kind === "ui") return reloadForNewBundle();
					if (event.kind === "update" && typeof event.latest === "string") offerUpdate(event.latest);
					// a setting moved somewhere on this machine: every reading is stale,
					// and a theme has to land on this page without a reload
					if (event.kind === "settings") return settingsMoved();
					void refetch();
				},
			},
			// nothing was delivered while the stream was down, and a project opened
			// or forgotten in a shell across that gap left no other trace here
			{ onReconnect: () => void refetch() },
		);
	}, [refetch, offerUpdate]);

	const startUpgrade = useCallback(async () => {
		setToast({ kind: "updating", stage: "installing" });
		const res = await postUpgrade();
		if (!res.ok) setToast({ kind: "failed", message: res.error });
	}, []);

	/**
	 * Watching the upgrade happen (#30).
	 *
	 * The daemon spawns the upgrader and stands back, then dies partway through
	 * its own replacement, so nothing it could have said survives to say how it
	 * went — and the stream is no help either, because the successor will not
	 * have this page's capability. Health will: it takes no credential, so it
	 * can be asked straight across the restart, and it names the daemon that
	 * answers. A version it did not have before is the upgrade landing, and the
	 * page reloads onto it. The same daemon back on the same version is an
	 * upgrade that decided there was nothing to install, or could not. And a
	 * deadline covers everything that leaves no trace at all — an install that
	 * failed, an orchestrator that never started. Any of those used to leave
	 * "Updating…" on the screen for as long as the tab stayed open.
	 *
	 * Deliberately not the last word: whenever a new daemon does come up, the
	 * 401 on the stream reloads the page anyway. This only decides how long the
	 * pill keeps promising.
	 */
	const updating = toast?.kind === "updating";
	useEffect(() => {
		if (!updating) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let before: DaemonIdentity | undefined;
		const deadline = Date.now() + UPDATE_DEADLINE_MS;

		const tick = async () => {
			const answering = await fetchDaemonIdentity();
			if (stopped) return;
			if (answering === undefined) {
				// nothing on the port: the daemon has gone to be replaced, which is
				// the last step rather than a failure. The stage never walks back —
				// what follows is a reload or a verdict, not a return to installing.
				setToast((current) =>
					current?.kind === "updating" && current.stage !== "restarting"
						? { kind: "updating", stage: "restarting" }
						: current,
				);
			} else if (before === undefined) {
				before = answering;
			} else if (answering.version !== before.version) {
				window.location.reload();
				return;
			} else if (answering.startedAt !== before.startedAt) {
				setToast({ kind: "failed", message: `Update did not land — still v${answering.version}` });
				return;
			}
			if (Date.now() >= deadline) {
				setToast({ kind: "failed", message: "Update is taking too long" });
				return;
			}
			timer = setTimeout(() => void tick(), UPDATE_POLL_MS);
		};

		void tick();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [updating]);

	const dismissToast = useCallback(() => {
		if (toastRef.current?.kind === "offer") dismissedLatest.current = toastRef.current.latest;
		if (toastRef.current?.kind === "app") bridge?.dismiss();
		setToast(null);
	}, [bridge]);

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

	/**
	 * The tabs, arranged. Local state moves first and the PUT follows, exactly as
	 * opening one does: the session event that comes back says the same thing this
	 * page already drew.
	 */
	const reorderTabs = useCallback((order: readonly string[]) => {
		setOpen([...order]);
		putSessionOrder(order);
	}, []);

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

	// ? opens the shortcut sheet and ⌘, the settings sheet over whatever the
	// shell is showing; one of the two at a time, so each puts the other away
	const openSettings = useCallback(() => {
		setKeysOpen(false);
		setSettingsOpen(true);
	}, []);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);
	useEffect(() => {
		return attachHotkeyLayer({
			scope: "app",
			handlers: {
				"app.help": () => {
					setSettingsOpen(false);
					setKeysOpen(true);
				},
				"app.settings": (event) => {
					event?.preventDefault();
					openSettings();
				},
			} satisfies Record<HotkeyIdFor<"app">, HotkeyHandler>,
		});
	}, [openSettings]);

	useEffect(() => {
		return appWindow?.onCommand((command) => {
			switch (command) {
				case "app.open-project":
					setSettingsOpen(false);
					setKeysOpen(false);
					setPicking(true);
					break;
				case "app.settings":
					setPicking(false);
					openSettings();
					break;
				case "app.help":
					setPicking(false);
					setSettingsOpen(false);
					setKeysOpen(true);
					break;
				default:
					runMenuHotkey(command);
			}
		});
	}, [appWindow, openSettings]);

	const canvasActive = focusedTab !== undefined && chrome !== null && !picking && !keysOpen && !settingsOpen;
	useEffect(() => {
		appWindow?.setCanvasActive(canvasActive);
		return () => appWindow?.setCanvasActive(false);
	}, [appWindow, canvasActive]);

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
			<header className="app-header relative z-20 flex h-11 shrink-0 items-center justify-between border-border border-b bg-bg px-4">
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

					<TabStrip
						tabs={tabs}
						focused={focused}
						onFocus={focusProject}
						onClose={closeTab}
						onReorder={reorderTabs}
						onPick={() => setPicking(true)}
					/>
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
					<ProjectCanvas
						key={focusedTab.root}
						project={focusedTab.name}
						onChrome={setChrome}
						onSettings={openSettings}
					/>
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
					onUpdate={() => (toast.kind === "app" ? bridge?.install() : void startUpgrade())}
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
			{settingsOpen && <SettingsSheet project={focusedTab?.name} onClose={closeSettings} />}
		</div>
	);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** Which open root this page's path names, if the session has it open at all. */
function pathFocus(open: readonly string[]): string | null {
	const match = window.location.pathname.match(/^\/p\/([^/]+)$/);
	if (match?.[1] === undefined) return null;
	const name = decodeURIComponent(match[1]);
	return open.find((root) => basename(root) === name) ?? null;
}
