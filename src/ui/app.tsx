import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountFoot } from "./account-foot";
import type { CloudAccountState, DaemonIdentity, ProjectCard, ProjectIcon, ProjectThumbnail } from "./api";
import {
	cancelCloudSignIn,
	daemonShares,
	fetchCloudAccount,
	fetchDaemonIdentity,
	fetchProjects,
	fetchSession,
	postForgetProject,
	postUpgrade,
	putActiveTab,
	putSession,
	putSessionOrder,
	reloadForNewBundle,
	renameProject,
	reopenCloudSignIn,
	signInCloudAccount,
	signOutCloudAccount,
	subscribeSse,
	trashProject,
} from "./api";
import { BarEnd } from "./bar-end";
import { type CanvasChrome, ProjectCanvas } from "./canvas/canvas";
import { PresenceFaces } from "./canvas/presence-faces";
import { desktopBridge } from "./desktop-bridge";
import { desktopWindow } from "./desktop-window";
import { handedOver } from "./handover";
import { coversOf, Home, ProjectGrid } from "./home";
import { attachHotkeyLayer, type HotkeyHandler, runMenuHotkey } from "./hotkey-dispatch";
import { HotkeySheet } from "./hotkey-sheet";
import type { HotkeyIdFor } from "./hotkeys";
import { HomeIcon } from "./icons";
import { ProjectPicker } from "./picker";
import { ProjectTeams } from "./project-icon";
import { useIconChange } from "./project-icon-change";
import { useProjectTransfer } from "./project-transfer";
import { RenameProjectDialog } from "./rename-project-dialog";
import { settingsMoved, useSetting, useSettings } from "./settings";
import { SettingsSheet } from "./settings-sheet";
import { SharedControl, useShares } from "./shares";
import { focusAfterClose, type TabProject, TabStrip } from "./tab-strip";
import { MoveCommitLine, MoveToTeamDialog, moveCommitNote, TeamProjectsAway } from "./team-moves";
import { useTeamHome } from "./teams";
import { TrashProjectDialog } from "./trash-project-dialog";
import { prepareForUpdate, reloadCanvas } from "./update-lifecycle";
import { type UpdateToast, UpdateToastPill } from "./update-toast";

/**
 * The shell (#4/#12/#13): one top bar with a pinned Home button, one
 * tab per open project (focus-not-duplicate, machine session restored), "+"
 * as the picker — and the focused view below. Routerless: / and /p/<name>
 * only; the path is read once at boot and replaceState'd on focus.
 */

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
	const [projectsLoaded, setProjectsLoaded] = useState(false);
	const [open, setOpen] = useState<string[]>([]);
	const openRef = useRef(open);
	openRef.current = open;
	const [focused, setFocused] = useState<string | null>(null);
	const [booted, setBooted] = useState(false);
	/** A team project a link at spool.page handed this page, until it has been opened. */
	const [handed, setHanded] = useState(() => handedOver(window.location.search));
	const [picking, setPicking] = useState<"new" | "folder" | false>(false);
	const location = useSetting("projects.location");
	const [trashRequest, setTrashRequest] = useState<TabProject | null>(null);
	const [account, setAccount] = useState<CloudAccountState>({ state: "unreachable" });
	const readAccount = useCallback(async () => setAccount(await fetchCloudAccount()), []);
	/** The team New project starts in, while the picker is open for one. */
	const [pickingTeam, setPickingTeam] = useState<string | undefined>();
	const [teamMenu, setTeamMenu] = useState<string | null>(null);
	/** The project "Move to team…" is asking about. */
	const [moving, setMoving] = useState<{ root: string; name: string } | null>(null);
	/** What became of a move's commit, when it wasn't made, until dismissed. */
	const [moveNote, setMoveNote] = useState<string | null>(null);
	useEffect(() => {
		void readAccount();
	}, [readAccount]);
	const [renameRequest, setRenameRequest] = useState<{
		project: TabProject;
		initialName: string;
		resolve: (name: string | null) => void;
	} | null>(null);
	const requestRename = (project: TabProject, initialName = project.name) =>
		new Promise<string | null>((resolve) => setRenameRequest({ project, initialName, resolve }));
	const [chrome, setChrome] = useState<CanvasChrome | null>(null);
	const [forgetting, setForgetting] = useState<ReadonlySet<string>>(new Set());
	const [keysOpen, setKeysOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [toast, setToast] = useState<UpdateToast | null>(null);
	const toastRef = useRef(toast);
	toastRef.current = toast;
	const dismissedLatest = useRef<string | null>(null);
	/** The Mac app around this window, if there is one; a tab has none. */
	const bridge = useMemo(() => desktopBridge(), []);
	const appWindow = useMemo(() => desktopWindow(), []);
	useEffect(() => bridge?.onPrepareUpdate?.(prepareForUpdate), [bridge]);
	useEffect(() => {
		if (booted && focused === null && projectsLoaded) bridge?.ready?.();
	}, [bridge, booted, focused, projectsLoaded]);

	const byRoot = useMemo(() => new Map(projects.map((p) => [p.root, p])), [projects]);
	const tabs: TabProject[] = useMemo(
		() =>
			open
				.filter((root) => !forgetting.has(root))
				.map((root) => {
					const card = byRoot.get(root);
					return {
						root,
						name: card?.name ?? basename(root),
						icon: card?.icon,
						teamAddress: card?.team?.team,
						paused: card?.syncPaused !== undefined,
					};
				}),
		[open, byRoot, forgetting],
	);
	const focusedTab = tabs.find((tab) => tab.root === focused);
	/** The focused project's shares with outsiders, for the Shared control at the window's top right (DEV-193). */
	const focusedName = focusedTab?.name;
	const tabShares = useMemo(() => (focusedName === undefined ? null : daemonShares(focusedName)), [focusedName]);
	const { shares: focusedShares } = useShares(tabShares);

	const projectRevision = useRef(0);
	const remapProject = useCallback((from: string, renamed: { root: string; name: string }) => {
		projectRevision.current += 1;
		setProjects((cards) => cards.map((card) => (card.root === from ? { ...card, ...renamed } : card)));
		setOpen((roots) => roots.map((root) => (root === from ? renamed.root : root)));
		setFocused((root) => (root === from ? renamed.root : root));
		if (window.location.pathname === `/p/${encodeURIComponent(basename(from))}`) {
			window.history.replaceState(null, "", `/p/${encodeURIComponent(renamed.name)}`);
		}
	}, []);

	/** One card's icon or sync pause moved: that card changes, and nothing is read again. */
	const patchCard = useCallback((root: string, patch: (card: ProjectCard) => ProjectCard) => {
		setProjects((cards) => cards.map((card) => (card.root === root ? patch(card) : card)));
	}, []);
	const setIcon = useCallback(
		(root: string, icon: ProjectIcon | undefined) => patchCard(root, (card) => withIcon(card, icon)),
		[patchCard],
	);
	const setThumbnail = useCallback(
		(root: string, thumbnail: ProjectThumbnail | undefined) =>
			patchCard(root, (card) => withThumbnail(card, thumbnail)),
		[patchCard],
	);

	/**
	 * When this page last reported each tab active, as the daemon answered. A
	 * list read while that report was on its way says the older time, and a card
	 * keeps whichever is later.
	 */
	const visited = useRef(new Map<string, string>());
	const withVisits = useCallback(
		(cards: ProjectCard[]) =>
			cards.map((card) => {
				const openedAt = visited.current.get(card.root);
				return openedAt !== undefined && openedAt > card.openedAt ? { ...card, openedAt } : card;
			}),
		[],
	);

	const refetch = useCallback(async () => {
		const revision = ++projectRevision.current;
		const [cards, session] = await Promise.all([fetchProjects(), fetchSession()]);
		if (revision !== projectRevision.current) return;
		setProjects(withVisits(cards));
		setProjectsLoaded(true);
		setOpen(session);
	}, [withVisits]);

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
			const revision = projectRevision.current;
			const cards = await fetchProjects();
			if (revision === projectRevision.current) {
				setProjects(withVisits(cards));
				setProjectsLoaded(true);
			}
		})();
	}, [withVisits]);

	// a project the path names that the session did not have yet: `spool open` in
	// a shell lands as a session event, and the tab it opens is the one this page
	// was asked for
	useEffect(() => {
		if (!booted || focused !== null) return;
		const root = pathFocus(open);
		if (root !== null) setFocused(root);
	}, [booted, focused, open]);

	// Recent is where you were last on this Mac: the tab you land on or switch
	// to, and none of the others a launch restores. The card moves here as the
	// daemon answers, so Home is in order the moment you come back to it.
	useEffect(() => {
		if (focused === null) return;
		void putActiveTab(focused).then((openedAt) => {
			if (openedAt === undefined) return;
			visited.current.set(focused, openedAt);
			patchCard(focused, (card) => ({ ...card, openedAt }));
		});
	}, [focused, patchCard]);

	const offerUpdate = useCallback((latest: string) => {
		if (desktopBridge() !== undefined || dismissedLatest.current === latest) return;
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
					const event = data as {
						kind?: unknown;
						latest?: unknown;
						from?: unknown;
						root?: unknown;
						name?: unknown;
					};
					// the checkout rebuilt the bundle this page is running: the same
					// dead end an upgrade reaches, without the 401 that rescues it
					if (event.kind === "ui") return reloadForNewBundle();
					if (event.kind === "update" && typeof event.latest === "string") offerUpdate(event.latest);
					// a setting moved somewhere on this machine: every reading is stale,
					// and a theme has to land on this page without a reload
					if (event.kind === "settings") return settingsMoved();
					if (event.kind === "account") return void readAccount();
					// a project's icon changed on disk, or a team copy's sync paused or lifted: one card moves
					if (event.kind === "icon" && typeof event.root === "string") {
						const icon = (data as { icon?: ProjectIcon | null }).icon ?? undefined;
						return setIcon(event.root, icon);
					}
					// its thumbnail file changed: the card shows it, or its top-left frame again
					if (event.kind === "thumbnail" && typeof event.root === "string") {
						const thumbnail = (data as { thumbnail?: ProjectThumbnail | null }).thumbnail ?? undefined;
						return setThumbnail(event.root, thumbnail);
					}
					if (event.kind === "sync" && typeof event.root === "string") {
						const paused = (data as { paused?: unknown }).paused;
						return patchCard(event.root, (card) =>
							withPause(card, typeof paused === "string" ? paused : undefined),
						);
					}
					if (
						event.kind === "project-renamed" &&
						typeof event.from === "string" &&
						typeof event.root === "string" &&
						typeof event.name === "string"
					) {
						remapProject(event.from, { root: event.root, name: event.name });
					}
					void refetch();
				},
			},
			// nothing was delivered while the stream was down, and a project opened
			// or forgotten in a shell across that gap left no other trace here
			{ onReconnect: () => void refetch() },
		);
	}, [refetch, offerUpdate, remapProject, readAccount, setIcon, setThumbnail, patchCard]);

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
				reloadCanvas();
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

	// a team project handed over from its link at spool.page: this Mac's local copy opens, and with none here
	// Home shows the team it is in
	useEffect(() => {
		if (handed === null || !booted || !projectsLoaded) return;
		setHanded(null);
		const copy = projects.find(
			(project) => project.team?.team === handed.team && project.team.project === handed.project,
		);
		if (copy !== undefined) openTab(copy);
		else window.history.replaceState(null, "", "/");
	}, [handed, booted, projectsLoaded, projects, openTab]);

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
			if (focused === root) focusProject(focusAfterClose(openRef.current, root));
		},
		[focused, focusProject],
	);

	const forgetProject = useCallback(
		async (project: TabProject) => {
			setForgetting((roots) => new Set([...roots, project.root]));
			const ok = await postForgetProject(project.root);
			if (ok) {
				// Replace the cards before lifting the hide, and discard reads begun
				// before the write so an older registry cannot bring the card back.
				projectRevision.current += 1;
				setProjects((cards) => cards.filter((card) => card.root !== project.root));
				setOpen((roots) => roots.filter((root) => root !== project.root));
			}
			setForgetting((roots) => new Set([...roots].filter((root) => root !== project.root)));
			void refetch();
		},
		[refetch],
	);

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
				"app.new-project": (event) => {
					event?.preventDefault();
					setPicking("new");
				},
				"app.open-project": (event) => {
					event?.preventDefault();
					setPicking("folder");
				},
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
				case "app.new-project":
					setSettingsOpen(false);
					setKeysOpen(false);
					setPicking("new");
					break;
				case "app.open-project":
					setSettingsOpen(false);
					setKeysOpen(false);
					setPicking("folder");
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

	const icons = useIconChange(setIcon, setThumbnail);
	const transfer = useProjectTransfer(async (project) => {
		await refetch();
		openTab(project);
	});
	const teamHome = useTeamHome(account, openExternally, handed?.team ?? null, {
		covers: (address, here) => {
			const covers = coversOf(
				projects.filter((project) => !forgetting.has(project.root) && project.team?.team === address),
			);
			return covers.length === 0 ? undefined : (
				<ProjectGrid
					projects={covers}
					menu={teamMenu}
					onMenu={setTeamMenu}
					onOpenProject={(project) => openTab(project)}
					onForgetProject={(project) => void forgetProject(project)}
					onTrashProject={setTrashRequest}
					onRenameProject={(project) => void requestRename(project)}
					onExportProject={transfer.exportProject}
					onChangeIcon={icons.change}
					onRemoveIcon={icons.remove}
					onRemoveThumbnail={icons.removeThumbnail}
					here={here}
				/>
			);
		},
		onNewProject: (team) => {
			setPickingTeam(team.address);
			setPicking("new");
		},
		// keyed on this Mac's copies of the team's projects, so one just got leaves the list
		away: (team, here) => (
			<TeamProjectsAway
				key={projects
					.filter((project) => project.team?.team === team.address)
					.map((project) => project.root)
					.join("\n")}
				team={team}
				here={here}
				onGot={(project) => {
					void refetch();
					openTab(project);
				}}
			/>
		),
	});
	/** "Move to team…", while this account edits in a team; a team project has nowhere to move. */
	const moveToTeam =
		teamHome.editing.length === 0 ? undefined : (project: { root: string; name: string }) => setMoving(project);
	/** The teams this Mac knows, for the marks a team project's tab and cover wear. */
	const markTeams = useMemo(() => new Map(teamHome.all.map((team) => [team.address, team])), [teamHome.all]);
	const focusedSolo =
		focusedTab !== undefined && byRoot.get(focusedTab.root)?.team === undefined ? focusedTab : undefined;
	const canvasActive =
		focusedTab !== undefined &&
		chrome !== null &&
		!picking &&
		!keysOpen &&
		!settingsOpen &&
		renameRequest === null &&
		trashRequest === null &&
		moving === null &&
		!transfer.confirming;
	useEffect(() => {
		appWindow?.setCanvasActive(canvasActive);
		return () => appWindow?.setCanvasActive(false);
	}, [appWindow, canvasActive]);

	return (
		<ProjectTeams.Provider value={markTeams}>
			<div className="flex h-full flex-col bg-bg">
				<header className="app-header after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:pointer-events-none [&_button:focus-visible]:[outline:2px_solid_var(--color-muted)] [&_button:focus-visible]:outline-offset-[-2px] relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4">
					<div className="flex h-full min-w-0 flex-1 items-center">
						<div className="app-home-zone relative flex items-center shrink-0 h-full mr-[12px] pr-[16px] after:content-[''] after:absolute after:right-0 after:w-px after:h-[18px] after:bg-border-raised">
							<button
								type="button"
								className="app-home flex items-center gap-[9px] h-[32px] [padding:0_4px_0_6px] [font:var(--type-control)] [color:var(--color-muted)] cursor-pointer [&:is(:hover,[aria-current])]:text-text active:[transform:translateY(1px)] motion-reduce:active:transform-none"
								onClick={() => focusProject(null)}
								aria-current={focusedTab === undefined ? "page" : undefined}
								title="Home"
							>
								<HomeIcon />
								<span>Home</span>
							</button>
						</div>

						<TabStrip
							tabs={tabs}
							focused={focused}
							onFocus={focusProject}
							onClose={closeTab}
							onReorder={reorderTabs}
							onExport={transfer.exportProject}
							onChangeIcon={icons.change}
							onRemoveIcon={icons.remove}
							onPick={() => setPicking("new")}
						/>
					</div>

					{focusedTab !== undefined && chrome !== null && (
						<div className="flex h-full shrink-0 items-center gap-4">
							{/* Play lives on the selection now (#13/#24), where the frame it
						    would open is the frame you are looking at. A header button
						    could only ever guess, and its guess with nothing selected was
						    the first frame by name — a start that means nothing. */}
							{/* who else is on a team project's canvas (DEV-196), at the window's top right */}
							{chrome.presence !== undefined && (
								<PresenceFaces
									room={chrome.presence.room}
									page={chrome.presence.page}
									following={chrome.presence.following}
									onFollow={chrome.presence.follow}
								/>
							)}
							{/* who the project's pages are shared with, outside the team (DEV-193) */}
							{tabShares !== null && <SharedControl source={tabShares} shares={focusedShares} />}
						</div>
					)}
					{/* the same on Home and on every canvas, so nothing in the bar moves on the way between them */}
					<div data-bar-end-group="" className="flex h-full shrink-0 items-center gap-0.5">
						<BarEnd
							onSettings={openSettings}
							onShortcuts={() => {
								setSettingsOpen(false);
								setKeysOpen(true);
							}}
							onUseAgent={focusedTab === undefined ? undefined : chrome?.useAgent}
						/>
					</div>
				</header>

				<main className="min-h-0 flex-1">
					{focusedTab === undefined ? (
						<Home
							projects={projects.filter(
								(project) =>
									!forgetting.has(project.root) &&
									(project.team === undefined || !teamHome.teams.has(project.team.team)),
							)}
							loading={!projectsLoaded}
							onStart={() => {
								setPickingTeam(undefined);
								setPicking("new");
							}}
							onFolder={() => setPicking("folder")}
							onSettings={openSettings}
							onImport={transfer.importProject}
							onExportProject={transfer.exportProject}
							onChangeIcon={icons.change}
							onRemoveIcon={icons.remove}
							onRemoveThumbnail={icons.removeThumbnail}
							onOpenProject={(project) => openTab(project)}
							onForgetProject={(project) => void forgetProject(project)}
							onTrashProject={setTrashRequest}
							onRenameProject={(project) => void requestRename(project)}
							onMoveToTeam={moveToTeam}
							switcher={teamHome.switcher}
							notice={
								moveNote === null ? (
									teamHome.notice
								) : (
									<>
										<MoveCommitLine note={moveNote} onDismiss={() => setMoveNote(null)} />
										{teamHome.notice}
									</>
								)
							}
							team={teamHome.team}
							account={
								<AccountFoot
									account={account}
									onSignIn={() => {
										setAccount({ state: "signing-in" });
										void signInCloudAccount();
									}}
									onReopen={() => void reopenCloudSignIn()}
									onCancel={() => void cancelCloudSignIn()}
									onSignOut={() => void signOutCloudAccount().finally(readAccount)}
								/>
							}
						/>
					) : (
						<ProjectCanvas
							key={focusedTab.root}
							project={focusedTab.name}
							root={focusedTab.root}
							onChrome={setChrome}
							onFolder={() => setPicking("folder")}
							onRename={(name) => requestRename(focusedTab, name)}
						/>
					)}
				</main>

				{transfer.surface}
				{icons.surface}
				{toast !== null && (
					<UpdateToastPill
						toast={toast}
						aboveCanvasTools={focusedTab !== undefined && chrome !== null}
						onUpdate={() => (toast.kind === "app" ? bridge?.install() : void startUpgrade())}
						onDismiss={dismissToast}
					/>
				)}

				{picking === "new" && (
					<ProjectPicker
						initial="start"
						location={
							pickingTeam === undefined || location === undefined ? location : `${location}/${pickingTeam}`
						}
						team={pickingTeam}
						onOpened={(project) => {
							setPicking(false);
							setPickingTeam(undefined);
							openTab(project);
						}}
						onClose={() => {
							setPicking(false);
							setPickingTeam(undefined);
						}}
					/>
				)}
				{picking === "folder" && (
					<ProjectPicker
						onOpened={(project) => {
							setPicking(false);
							openTab(project);
						}}
						onClose={() => setPicking(false)}
					/>
				)}

				{renameRequest !== null && (
					<RenameProjectDialog
						project={renameRequest.project}
						initialName={renameRequest.initialName}
						onRename={async (name) => {
							const renamed = await renameProject(renameRequest.project.root, name);
							remapProject(renameRequest.project.root, renamed);
							renameRequest.resolve(renamed.name);
							void refetch();
						}}
						onClose={() => {
							renameRequest.resolve(null);
							setRenameRequest(null);
						}}
					/>
				)}

				{trashRequest !== null && (
					<TrashProjectDialog
						project={trashRequest}
						onTrash={async () => {
							await trashProject(trashRequest.root);
							projectRevision.current += 1;
							setProjects((cards) => cards.filter((card) => card.root !== trashRequest.root));
							setOpen((roots) => roots.filter((root) => root !== trashRequest.root));
							if (focused === trashRequest.root) focusProject(null);
							void refetch();
						}}
						onClose={() => setTrashRequest(null)}
					/>
				)}

				{keysOpen && <HotkeySheet onClose={() => setKeysOpen(false)} />}
				{settingsOpen && (
					<SettingsSheet
						project={focusedTab?.name}
						onClose={closeSettings}
						onMoveToTeam={
							moveToTeam && focusedSolo
								? () => {
										closeSettings();
										moveToTeam(focusedSolo);
									}
								: undefined
						}
					/>
				)}
				{moving !== null && (
					<MoveToTeamDialog
						project={moving}
						teams={teamHome.editing}
						onMoved={(outcome, team) => {
							setMoveNote(moveCommitNote(outcome, team) ?? null);
							void refetch();
						}}
						onClose={() => setMoving(null)}
					/>
				)}
			</div>
		</ProjectTeams.Provider>
	);
}

function withIcon(card: ProjectCard, icon: ProjectIcon | undefined): ProjectCard {
	const { icon: _was, ...rest } = card;
	return icon === undefined ? rest : { ...rest, icon };
}

function withThumbnail(card: ProjectCard, thumbnail: ProjectThumbnail | undefined): ProjectCard {
	const { thumbnail: _was, ...rest } = card;
	return thumbnail === undefined ? rest : { ...rest, thumbnail };
}

function withPause(card: ProjectCard, paused: string | undefined): ProjectCard {
	const { syncPaused: _was, ...rest } = card;
	return paused === undefined ? rest : { ...rest, syncPaused: paused };
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

/** The desktop app hands a new window's URL to the system browser. */
function openExternally(url: string): void {
	window.open(url, "_blank", "noopener,noreferrer");
}
