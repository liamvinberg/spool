import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	app,
	BrowserWindow,
	dialog,
	type IpcMainEvent,
	ipcMain,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	powerMonitor,
	screen,
	session,
	shell,
	Tray,
} from "electron";
import { LINK, launcherPath, linkAsAdministrator, linkDirectly, linkState, otherSpool } from "./cli-link";
import { accountItems, type CloudAccountState, followAccount, type Reveal } from "./cloud-account";
import * as daemon from "./daemon";
import { directoryDialogOptions } from "./directory-dialog";
import { log, openLog } from "./log";
import {
	answersTabs,
	closeWindowKey,
	type MenuKeys,
	menuKey,
	nextMenuKeys,
	type TabCommand,
	type TabItem,
	tabItem,
} from "./menu-keys";
import { userPath } from "./path";
import {
	daemonIdentity,
	keepSpare,
	loadFailedForGood,
	type SpareFacts,
	type SpareSurroundings,
	shouldMakeSpare,
	spareForPlay,
	spareUrl,
} from "./play-spare";
import { isPlayMark, type PlayTiming, playTiming, wallClock } from "./play-timing";
import {
	BAR_PX,
	fitRect,
	readRect,
	rectIsReachable,
	rectKey,
	sameRect,
	type WindowRect,
	type WorkArea,
	writeRect,
} from "./play-window";
import { type CanvasDownloads, installCanvasDownloads } from "./project-download";
import {
	type RemoteConfig,
	readRemote,
	readRemoteChoice,
	reclaimTunnel,
	Tunnel,
	type TunnelStatus,
	writeRemoteChoice,
} from "./remote";
import { installRooms, type Rooms } from "./room";
import { roomTalk } from "./room-window";
import { bundledCli, bundledShim, cloudCommand } from "./runtime";
import {
	FULL,
	firstRunLikely,
	grownRect,
	MINIMUM,
	SETUP_SHOWN_SCRIPT,
	SMALL,
	setupSize,
	smallRect,
} from "./setup-window";
import { UpdateCover } from "./update-cover";
import {
	beginUpdateRestart,
	clearUpdateRestart,
	type UpdateWorkspace,
	updateRestartState,
	updateRestartWorkspace,
} from "./update-restart";
import {
	BETA_DOWNLOAD_URL,
	BETA_UPDATE_HOST,
	CHECK_INTERVAL_MS,
	checkCachePath,
	checkForUpdate,
	DOWNLOAD_URL,
	FIRST_CHECK_DELAY_MS,
	type InstallProgress,
	installUpdate,
	lastUpdaterError,
	latestRelease,
	nextCheckDelay,
	RELEASES_PAGE,
	type Release,
	RestartRequiredError,
	readCheckCache,
	relaunchIntoUpdate,
	stagedUpdate,
	UPDATE_HOST,
	UpdateCheckError,
	updaterAvailable,
} from "./updates";
import { compareVersions, formatVersion, isBeta, parseVersion } from "./version";

// Spool, as a Mac app: a window on the canvas the daemon already serves.
//
// The engine is Chromium because the canvas is Chromium's. Transformed iframes
// render blurry under WebKit, so a native WKWebView window would show a worse
// canvas than the browser does; wrapping the same engine the canvas is developed
// against is the only shell that shows it truthfully.
//
// The shape, in four sentences. On launch it looks for a daemon and adopts the
// one it finds, because the app and the CLI share one state directory and two
// supervisors that disagree would both start one. The one daemon it does not
// adopt is one behind the bundle: the daemon is what draws the canvas, so that
// one is stopped and replaced, the way `spool upgrade` replaces it from the
// terminal, and nothing ever downgrades. When nothing answers, or the old one
// has been stopped, it starts the `spool.page` inside the bundle, as a child
// process running under Electron's own binary with ELECTRON_RUN_AS_NODE=1, which
// is plain Node: the native addons in spool's dependency tree load into that
// process rather than into the one drawing the window. Closing the window leaves
// the app in the menu bar with the daemon running; quitting stops a daemon this
// app started and leaves an adopted one alone.

/**
 * Spool Beta (spool#282): main, built on every push and installed beside Spool.
 * Its version says so (`-beta.N`), and so does everything that must stay out of
 * Spool's way: its name, its menu bar mark, its state (`~/.spool-beta`) and port
 * (7768), and its feed. Its app id, Dock icon and file types are the bundle's
 * own, from electron-builder.beta.ts. A released build reads false.
 */
const BETA = isBeta(version());
const FEED = BETA ? BETA_UPDATE_HOST : UPDATE_HOST;
const DOWNLOAD = BETA ? BETA_DOWNLOAD_URL : DOWNLOAD_URL;

const DIRECTORY = daemon.stateDirectory(process.env, BETA);

/**
 * What this copy calls itself.
 *
 * A lane is a checkout's app running beside the installed one, and two windows
 * wearing one name and one mark is a Dock nobody can aim at. So the lane says so:
 * "Spool Dev" in the Dock, the menu bar and the About panel, and the development
 * blue on the icon and the status item. The test is SPOOL_DIR, the same one
 * src/cli.ts uses to decide the daemon is a development daemon, so the app and
 * the canvas it shows agree about which of the two this is.
 *
 * Unset SPOOL_DIR is the released app, unchanged, or Spool Beta.
 */
const LANE = (process.env.SPOOL_DIR ?? "") !== "";
const NAME = LANE ? "Spool Dev" : BETA ? "Spool Beta" : "Spool";

/** Held only so the tray item is not collected out from under the menu bar. */
let tray: Tray | undefined;
let window: BrowserWindow | undefined;
let canvasReady = false;
let workspaceReady = false;
let cover: UpdateCover | undefined;
let reloadQueued = false;
let coverDeadline: NodeJS.Timeout | undefined;
let resumeWorkspace: UpdateWorkspace = {};
let resumeCovered = false;
let dismissedUpdate: string | undefined;
let saveSequence = 0;
let saving: { id: number; resolve: () => void; reject: (error: Error) => void } | undefined;

let canvasDownloads: CanvasDownloads | undefined;

/**
 * The first run's small window (spool#250): where the window stood before it went small, to
 * grow back to, while it is small. undefined when it is not small; null when it opened small
 * and so stood nowhere yet.
 */
let setupFrom: WindowRect | null | undefined;

/** Sound only after a press in the page, as in a browser: Electron's default is `no-user-gesture-required`. */
const AUTOPLAY = { autoplayPolicy: "document-user-activation-required" } as const;

/**
 * The first run's open (spool#250) plays its sound as the setup window shows: the app
 * tells the page it is showing with a press of its own (`executeJavaScript` with a user
 * gesture), which lets that page start its audio. Nothing in the window may play sound
 * unasked otherwise: spool's windows take a browser's rule (`AUTOPLAY`), where Electron's
 * own lets any page play sound without a press.
 */
function startSetupOpen(showing: BrowserWindow): void {
	const tell = () => {
		if (!showing.isDestroyed()) void showing.webContents.executeJavaScript(SETUP_SHOWN_SCRIPT, true).catch(() => {});
	};
	if (showing.isVisible()) tell();
	else showing.once("show", tell);
}

/** spool's window covering its display for a talk's slides: where it stood, whether it could be resized, and where it was pinned on the way */
let presentFilled: { stood: Electron.Rectangle; resizable: boolean; pinned: Electron.Rectangle } | undefined;

/**
 * Spool's window over its whole display for a talk's slides, at once (spool#298, spool#306): simple full screen, which
 * macOS plays with no Space of its own to slide to, so the slide growing from its card is the only thing that moves.
 *
 * Simple full screen alone falls short of a talk twice. It grows the window in an animation macOS draws no frame of the
 * page through, about a fifth of a second after the press. So the window is first set to its display's bounds in one
 * step; macOS keeps a titled window's top under the menu bar, and one that cannot be resized keeps its size there, so
 * all simple full screen has left to animate is the menu bar's height. On the way home it is pinned there again first,
 * leaving it nothing to animate back. And simple full screen only tucks the Dock and the menu bar away, to come back
 * over the slides wherever the pointer touches the screen's edge, so the window stands above both while spool is the
 * app in front (`presentLevel`). The lights go too: nothing of the window's own may stand over the slides. It comes back
 * to exactly where it stood, as the slide lands on its card. A window already full screen is left as it is.
 */
function presentFullScreen(showing: BrowserWindow, on: boolean): boolean {
	if (showing.isDestroyed() || on === (presentFilled !== undefined)) return false;
	if (on && (showing.isFullScreen() || showing.isSimpleFullScreen())) return false;
	if (process.platform === "darwin") showing.setWindowButtonVisibility(!on);
	if (on) {
		const stood = showing.getBounds();
		const resizable = showing.isResizable();
		presentFilled = { stood, resizable, pinned: stood };
		presentLevel(showing);
		showing.setResizable(false);
		showing.setBounds(screen.getDisplayMatching(stood).bounds, false);
		presentFilled.pinned = showing.getBounds();
		showing.setSimpleFullScreen(true);
		return true;
	}
	const filled = presentFilled;
	presentFilled = undefined;
	if (filled === undefined) return false;
	showing.setBounds(filled.pinned, false);
	showing.setSimpleFullScreen(false);
	showing.setResizable(filled.resizable);
	presentLevel(showing);
	showing.setBounds(filled.stood, false);
	return true;
}

/**
 * The window over the Dock and the menu bar while it covers its display for the slides and spool is in front, as
 * Keynote's slides are; back among the other apps' windows the moment another app comes forward (⌘Tab), and again
 * when spool does. Its level, not presentation options, since Electron offers none but kiosk's, which locks ⌘Tab.
 */
function presentLevel(showing: BrowserWindow): void {
	if (showing.isDestroyed()) return;
	if (presentFilled !== undefined && showing.isFocused()) showing.setAlwaysOnTop(true, "pop-up-menu");
	else showing.setAlwaysOnTop(false);
}

function canvasSender(event: Pick<IpcMainEvent, "sender" | "senderFrame">): boolean {
	return window !== undefined && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame;
}

/** The control origin of the daemon the window is on: the remote's, through its tunnel, or this Mac's. */
function controlOrigin(): string | undefined {
	if (tunnel !== undefined) return remote === undefined ? undefined : `http://127.0.0.1:${remote.port}`;
	return daemonOn?.origin;
}

/** The sender's main frame is a page of the daemon's control origin, which is the only origin a play is asked from. */
function controlOriginSender(event: Pick<IpcMainEvent, "sender" | "senderFrame">): boolean {
	const frame = event.senderFrame;
	const origin = controlOrigin();
	return origin !== undefined && frame !== null && frame === event.sender.mainFrame && frame.origin === origin;
}

function saveWorkspace(localOnly = false): Promise<void> {
	if (window === undefined) return Promise.resolve();
	if (!workspaceReady && !localOnly)
		return Promise.reject(new Error("The canvas is still opening. Try again when it is ready."));
	return new Promise<void>((resolve, reject) => {
		const id = ++saveSequence;
		const deadline = setTimeout(() => {
			if (saving?.id === id) saving = undefined;
			reject(new Error("Saving took too long. Your app has not restarted. Try again."));
		}, 10_000);
		saving = {
			id,
			resolve: () => {
				clearTimeout(deadline);
				saving = undefined;
				resolve();
			},
			reject: (error) => {
				clearTimeout(deadline);
				saving = undefined;
				reject(error);
			},
		};
		window?.webContents.send("spool:canvas-save", id, localOnly);
	});
}

function uncover(): void {
	clearTimeout(coverDeadline);
	coverDeadline = undefined;
	const current = cover;
	void current
		?.reveal()
		.catch((error: unknown) => log("updates", "cover", String(error)))
		.finally(() => {
			if (cover === current) cover = undefined;
			if (reloadQueued) {
				reloadQueued = false;
				void reloadCanvasWindow();
			}
		});
}

function awaitWorkspace(): void {
	clearTimeout(coverDeadline);
	coverDeadline = setTimeout(() => {
		cover?.close();
		cover = undefined;
		tell(
			"The canvas is taking longer to open.",
			"Your saved work is still there. Reopen the window to try again.",
			"warning",
		);
	}, 30_000);
}

let canvasActive = false;
let pendingCanvasCommand: CanvasCommand | undefined;
/** The menu's keys as the canvas reports them from its hotkey register. */
let menuKeys: MenuKeys = {};
/** The daemon this app started, if it started one. */
let startedPid: number | undefined;
/** The daemon this window is pointed at, for telling its popups from the web. */
let daemonPort: number | undefined;
/** Its credential for native project imports and play geometry. */
let daemonControlToken: string | undefined;
/** The daemon the window is on: whose it is and which version, for the tray. */
let daemonInfo: { version: string; adopted: boolean } | undefined;
/** The account the daemon last answered, for the Cloud Account menu, and the stream that keeps it current. */
let account: CloudAccountState | undefined;
let following: { daemon: string; stop(): void } | undefined;
let shuttingDown = false;

/**
 * Another machine's daemon, when remote.json names one (see src/remote.ts), and the
 * tunnel to it while the window is on it. Hidden entirely without the file.
 *
 * While the window is on the remote, this Mac's daemon is neither started nor
 * adopted for it: one this app already started keeps running until quit, and the
 * CLI starts its own when it needs one. Everything that hands the page a path on
 * this Mac, or reads with this Mac's control token, is off, so the page behaves
 * as it does in a browser tab on the tunnel.
 */
let remote: RemoteConfig | undefined;
let tunnel: Tunnel | undefined;
const TUNNEL_PID = join(DIRECTORY, "remote-tunnel.pid");

/**
 * What this copy calls its version. A packaged app reads the bundle's, which
 * scripts/version.sh stamped from the repo. An unpackaged run (`pnpm dev app`)
 * would get Electron's own number from the same call, and then say it was up to
 * date against every release forever, so it reads the checkout's instead.
 */
export function version(): string {
	if (app.isPackaged) return app.getVersion();
	try {
		const parsed = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
			version?: unknown;
		};
		if (typeof parsed.version === "string") return parsed.version;
	} catch {
		// not a checkout: Electron's number is all there is
	}
	return app.getVersion();
}

/**
 * The commit a Spool Beta build was made from, which the beta workflow stamps
 * into the bundle's package.json as `spoolCommit`, for About. A release is its
 * tag and carries none.
 */
function builtFrom(): string | undefined {
	try {
		const parsed = JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")) as {
			spoolCommit?: unknown;
		};
		return typeof parsed.spoolCommit === "string" && /^[0-9a-f]{7,40}$/.test(parsed.spoolCommit)
			? parsed.spoolCommit
			: undefined;
	} catch {
		return undefined;
	}
}

// MARK: - The window

/**
 * The page the window holds while the daemon comes up, and the one it falls back
 * to when nothing did. A window that is blank for eight seconds reads as broken;
 * this reads as starting.
 */
function holdingPage(heading: string, detail: string): string {
	const body = `<!doctype html><meta charset="utf-8"><title>Spool</title><style>
		html,body{height:100%;margin:0}
		body{background:#0e0e0e;color:#8a8a8a;display:flex;align-items:center;justify-content:center;
			font:400 14px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
		main{text-align:center;max-width:34rem;padding:2rem}
		h1{font-size:14px;font-weight:500;color:#e8e8e8;margin:0 0 .5rem}
		p{margin:0}
	</style><main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(detail)}</p></main>`;
	return `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
}

/**
 * The page the window shows while it waits on a daemon: the canvas's boot
 * curtain drawn before the canvas exists (task 568), the mark winding beside one
 * line in the machine's voice. It stands where Home's curtain will, in the middle
 * of the page beside the 208px sidebar and under the 44px tabs, holds back for
 * the same 160ms gate, and keys its winding to the clock, so when Home takes over
 * the mark stays put, the turn carries on and only the words change.
 */
function waitingPage(line: string): string {
	const mark = readFileSync(join(__dirname, "../assets/update-mark.svg"), "utf8").replace(/<title>.*?<\/title>/, "");
	const body = `<!doctype html><meta charset="utf-8"><title>Spool</title><style>
		html,body{height:100%;margin:0}
		body{background:#0e0e0e;color:#94918d;font:400 12px/16px "Fragment Mono",ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-font-smoothing:antialiased}
		main{position:fixed;left:calc(50% + 104px);top:calc(50% - 18px);transform:translate(-50%,-50%);width:180px;display:flex;align-items:center;gap:10px;animation:in 180ms ease-out 160ms both}
		@media (max-width:720px){main{left:calc(50% + 32px)}}
		.mark{position:relative;width:19px;height:25px;flex-shrink:0}
		.mark svg{position:absolute;inset:0;width:100%;height:100%}
		.mark svg:first-child{opacity:.14}
		.mark svg:last-child{animation:wind 1500ms ease-in-out infinite alternate}
		.line{white-space:nowrap}
		.count{color:#6c6a67;opacity:0;transition:opacity 260ms cubic-bezier(.22,.61,.36,1)}
		@keyframes in{from{opacity:0}}
		@keyframes wind{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
	</style><main role="status"><span class="mark">${mark}${mark}</span><span class="line">${escapeHtml(line)}<span class="count"></span></span></main>
	<script>
		document.querySelector(".mark svg:last-child").style.animationDelay = "-" + (Date.now() % 3000) + "ms";
		const from = Date.now(), count = document.querySelector(".count");
		setInterval(() => {
			const seconds = Math.floor((Date.now() - from) / 1000);
			if (seconds < 3) return;
			count.textContent = " \u00b7 " + seconds + "s";
			count.style.opacity = 1;
		}, 250);
	</script>`;
	return `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
}

/** These strings carry a filesystem path, and a path can hold anything. */
function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (character) => `&#${character.codePointAt(0)};`);
}

function createWindow(): BrowserWindow {
	canvasReady = false;
	canvasActive = false;
	const restored = resumeWorkspace.rect;
	const rect =
		restored &&
		rectIsReachable(
			restored,
			screen.getAllDisplays().map((display) => display.workArea),
		)
			? restored
			: undefined;
	// a first launch opens small at once rather than big and then shrinking; the page still decides
	const small = rect === undefined && tunnel === undefined && firstRunLikely(DIRECTORY);
	setupFrom = small ? null : undefined;
	const created = new BrowserWindow({
		show: false,
		...(rect ? { x: rect.x, y: rect.y } : {}),
		width: small ? SMALL.w : (rect?.w ?? FULL.w),
		height: small ? SMALL.h : (rect?.h ?? FULL.h),
		minWidth: small ? SMALL.w : MINIMUM.w,
		minHeight: small ? SMALL.h : MINIMUM.h,
		resizable: !small,
		...(small ? { center: true } : {}),
		title: NAME,
		backgroundColor: "#0e0e0e",
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 14, y: 16 },
		webPreferences: { spellcheck: false, preload: join(__dirname, "canvas-preload.js"), ...AUTOPLAY },
	});

	if (resumeWorkspace.maximized) created.maximize();
	if (resumeWorkspace.fullscreen) created.setFullScreen(true);
	if (resumeCovered) {
		resumeCovered = false;
		cover = new UpdateCover(created, true);
		awaitWorkspace();
	}
	guard(created);
	const fullscreen = () => created.webContents.send("spool:canvas-fullscreen", created.isFullScreen());
	created.on("enter-full-screen", fullscreen);
	created.on("leave-full-screen", fullscreen);
	created.on("focus", () => {
		updateCanvasMenu();
		if (presentFilled !== undefined) presentLevel(created);
	});
	created.on("blur", () => {
		updateCanvasMenu();
		if (presentFilled !== undefined) presentLevel(created);
	});
	// which daemon the window is on, in the title the Window menu and Mission Control show
	created.on("page-title-updated", (event, title) => {
		if (remote === undefined || tunnel === undefined) return;
		event.preventDefault();
		created.setTitle(`${title} (${remote.name})`);
	});
	created.webContents.on("did-start-navigation", (details) => {
		if (!details.isMainFrame || details.isSameDocument) return;
		canvasReady = false;
		workspaceReady = false;
		canvasActive = false;
		// the spare play window stands on the canvas it was made beside, and is made again once this one answers
		tendSpare();
		// a talk's slides filling the screen end with the page that played them
		presentFullScreen(created, false);
		// the page that loads may be an older daemon's, which answers no tab key
		wearMenuKeys(undefined);
		updateCanvasMenu();
	});
	// a canvas that could not load, or whose page crashed, is only the window's
	// background: the watch below brings it back
	created.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
		if (!isMainFrame || code === ABORTED || !isDaemonUrl(url)) return;
		log("canvas", "FAIL load", description);
		canvasLost = true;
	});
	created.webContents.on("render-process-gone", (_event, details) => {
		if (details.reason === "clean-exit") return;
		log("canvas", "FAIL gone", details.reason);
		canvasLost = true;
	});
	created.on("closed", () => {
		if (created !== window) return;
		// the presenter view is gone, and the talk with it
		rooms?.closeAll();
		clearTimeout(coverDeadline);
		coverDeadline = undefined;
		cover?.close();
		cover = undefined;
		reloadQueued = false;
		saving?.reject(new Error("The canvas closed before saving finished."));
		window = undefined;
		canvasReady = false;
		workspaceReady = false;
		canvasActive = false;
		updateCanvasMenu();
		tendSpare();
	});

	return created;
}

/**
 * What a spool window is allowed to open, and where everything else goes.
 *
 * A popup the daemon opened is part of spool; anything else is the web and
 * belongs in the browser the person already has their tabs in. Loopback and the
 * same port rather than the same origin, because the daemon serves frames and
 * captures from two more hostnames on the one listener.
 *
 * Play is the one popup this app does not let Chromium open for itself (#275).
 * Left to the default, Electron picks a size nobody chose and puts an OS title
 * bar with a URL in it above a prototype, so the app makes that window instead.
 */
function guard(created: BrowserWindow): void {
	created.webContents.setWindowOpenHandler(({ url }) => {
		if (!isDaemonUrl(url)) {
			void shell.openExternal(url);
			return { action: "deny" };
		}
		// a presented talk's room is a window of its own, placed on the room's screen
		const talk = roomTalk(url);
		if (talk !== undefined) {
			rooms?.open(url, talk);
			return { action: "deny" };
		}
		const play = playRequest(url);
		if (play === undefined) return { action: "allow" };
		void openPlayFromPopup(url, play);
		return { action: "deny" };
	});
	created.webContents.on("will-navigate", (event, url) => {
		if (isDaemonUrl(url) || url.startsWith("data:")) return;
		event.preventDefault();
		void shell.openExternal(url);
	});
}

/**
 * What a page in this app may ask the browser for.
 *
 * Chromium asks the app before it hands a page the pointer lock, and a number
 * scrubbed in the rail is a locked pointer (#322): unasked, the drag runs out
 * of screen, and in this window Chromium's own answer is no. Nothing else in
 * here is the web — `guard` sends every other origin to the browser — so the
 * daemon's own pages are the only ones anybody meant to ask, and the answer to
 * everything else is no.
 */
function installPermissions(): void {
	const daemonPage = (url: string | undefined) => url !== undefined && isDaemonUrl(url);
	session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) => {
		callback(daemonPage(details.requestingUrl));
	});
	session.defaultSession.setPermissionCheckHandler((_contents, _permission, origin) => daemonPage(origin));
}

function isDaemonUrl(candidate: string): boolean {
	if (daemonPort === undefined) return false;
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return false;
	}
	if (url.protocol !== "http:") return false;
	if (url.port === "" || Number(url.port) !== daemonPort) return false;
	const host = url.hostname.replace(/^\[|\]$/g, "");
	return host === "127.0.0.1" || host === "::1" || host === "localhost" || host.endsWith(".localhost");
}

/** Bring the canvas up: adopt or start a daemon, then point the window at it. */
export async function openCanvas(raise = true): Promise<void> {
	if (raise) gaveUp = false;
	if (openingCanvas !== undefined) return openingCanvas;
	openingCanvas = showCanvas(raise);
	try {
		await openingCanvas;
	} finally {
		openingCanvas = undefined;
	}
}

let openingCanvas: Promise<void> | undefined;

async function showCanvas(raise: boolean): Promise<void> {
	if (shuttingDown) return;
	if (window === undefined) window = createWindow();
	const showing = window;
	if (raise) {
		showing.show();
		showing.focus();
	}

	if (tunnel !== undefined) {
		showRemote(showing);
		return;
	}

	const current = await daemon.status(DIRECTORY);
	if (shuttingDown || showing.isDestroyed()) return;
	if (current.running && (current.pid === startedPid || !daemon.behind(current.version, version()))) {
		point(
			showing,
			current.url,
			current.pid,
			current.pid === startedPid ? "reused" : "adopted",
			current.version,
			current.controlToken,
		);
		return;
	}

	if (current.running) {
		// Behind the bundle: the cli started it before the app updated, or an older
		// app did. The canvas it would draw is the older one, so it is stopped and
		// the bundled daemon takes the address. The cost is `spool upgrade`'s, every
		// canvas on it and every process under it, spent on the same thing: a newer
		// Spool the person just opened. A daemon that will not exit is adopted after
		// all, and the tray says which version it is on.
		log("daemon", "replacing", `pid=${current.pid}`, `v${current.version}`, `bundle=v${version()}`);
		void showing.loadURL(waitingPage(`updating spool to ${version()}`));
		const stopped = await daemon.stop(current.pid);
		if (!stopped) {
			log("daemon", "FAIL did not exit", `pid=${current.pid}`, "adopting it as it is");
			point(showing, current.url, current.pid, "adopted", current.version, current.controlToken);
			return;
		}
	} else {
		void showing.loadURL(waitingPage("starting spool"));
	}
	if (shuttingDown) return;
	const started = await startBundled();
	if (started === undefined || shuttingDown) return;
	point(showing, started.url, started.pid, "started", started.version, started.controlToken);
}

/**
 * The canvas load `point` started, until it settles. A load cut off by another
 * reports its failure late, and Electron hands that failure to whichever load is
 * waiting then, so the canvas is not sent anywhere else while this one is on its way.
 */
let pointing: { window: BrowserWindow; url: string; settled: Promise<void> } | undefined;

function point(
	showing: BrowserWindow,
	url: string,
	pid: number,
	verdict: string,
	daemonVersion: string,
	controlToken: string,
): void {
	// a local start that finished after the window went to the remote
	if (showing.isDestroyed() || tunnel !== undefined) return;
	daemonPort = Number(new URL(url).port);
	daemonControlToken = controlToken;
	daemonInfo = { version: daemonVersion, adopted: verdict === "adopted" };
	const origin = new URL(url).origin;
	daemonOn = { origin, identity: daemonIdentity(origin, pid) };
	tendSpare();
	tray?.setContextMenu(buildTrayMenu());
	follow(new URL(url).origin, controlToken);
	log("daemon", verdict, `pid=${pid}`, `v${daemonVersion}`, url);
	// Reopening from the Dock should give back the canvas as it was left, not
	// reload it out from under whatever was on screen, nor while it is still on
	// its way there, as when a file opened from Finder at launch asks again.
	if (isDaemonUrl(showing.webContents.getURL())) return;
	loadCanvas(showing, url);
}

/** Point the window at a daemon's canvas, where the person was if a restart kept it, unless it is on its way there. */
function loadCanvas(showing: BrowserWindow, url: string): void {
	if (pointing?.window === showing && isDaemonUrl(pointing.url)) return;
	const loadingAt = performance.now();
	const destination = resumeWorkspace.path === undefined ? url : new URL(resumeWorkspace.path, url).href;
	resumeWorkspace = {};
	const settled = showing.loadURL(destination).then(
		() => {
			log(
				"canvas",
				"loaded",
				`load=${Math.round(performance.now() - loadingAt)}ms`,
				`process=${Math.round(process.uptime() * 1000)}ms`,
			);
		},
		(error: unknown) => log("canvas", "FAIL load", String(error)),
	);
	const load = { window: showing, url: destination, settled };
	pointing = load;
	void settled.then(() => {
		if (pointing === load) pointing = undefined;
	});
}

/** The login shell's answer, asked at most once: the daemon and the command offer both want it. */
let askedPath: { path: string | undefined } | undefined;
function terminalPath(): string | undefined {
	askedPath ??= { path: userPath() };
	return askedPath.path;
}

async function startBundled(): Promise<
	{ url: string; pid: number; version: string; controlToken: string } | undefined
> {
	const cli = bundledCli(process.resourcesPath);
	if (cli === undefined) {
		log("daemon", "FAIL", "no bundled spool");
		tell(
			`This copy of ${NAME} has no daemon in it.`,
			`The app carries its own copy of the spool package, and it is not where it should be. Download ${NAME} again from the releases page.`,
			"error",
		);
		fallback(`${NAME} could not start`, "This copy has no daemon in it. Download it again from the releases page.");
		return undefined;
	}
	// The daemon spawns the agent the person already installed and shells out to
	// the toolchain they already have, and a GUI launch hands this process a PATH
	// that has neither on it. Asked here rather than at boot: an adopted daemon was
	// started from a terminal and already has the answer.
	const path = terminalPath();
	log("path", path === undefined ? "as launched" : "from the login shell");
	try {
		const address = daemon.configuredAddress(DIRECTORY, process.env, BETA);
		const moved = await daemon.moveOffTakenPort(DIRECTORY, address);
		if (moved !== undefined) log("daemon", "port", `${address.port} is another app's, moved to ${moved}`);
		const status = await daemon.start({
			execPath: process.execPath,
			nodeArgs: ["-r", bundledShim(process.resourcesPath)],
			cli,
			directory: DIRECTORY,
			beta: BETA,
			...(path === undefined ? {} : { env: { ...process.env, PATH: path } }),
		});
		if (!status.running) return undefined;
		startedPid = status.pid;
		return {
			url: status.url,
			pid: status.pid,
			version: status.version,
			controlToken: status.controlToken,
		};
	} catch (error) {
		const detail = (error as Error).message;
		log("daemon", "FAIL", detail);
		tell(`${NAME} could not start its daemon.`, detail, "error");
		fallback(`${NAME} could not start its daemon`, `${DIRECTORY}/daemon.log says why.`);
		return undefined;
	}
}

function fallback(heading: string, detail: string): void {
	if (tunnel !== undefined) return;
	void window?.loadURL(holdingPage(heading, detail));
}

// MARK: - Keeping the canvas

/** Chromium's code for a load another load replaced, which is no failure. */
const ABORTED = -3;
const WATCH_MS = 3_000;
/** The canvas page failed to load or crashed, and shows nothing but the window. */
let canvasLost = false;
/** Watches in a row that found no daemon: one is a `spool upgrade` between two of them. */
let missed = 0;
/** A restart that failed already told the person once; the next one waits for them to open the canvas. */
let gaveUp = false;
let bringing = false;

/**
 * Bring the canvas back when what it stands on went away.
 * A daemon that exits leaves the open page retrying a port nothing answers, and
 * a page that failed to load or crashed shows only the window's background, so
 * either one is noticed here and the canvas opened again on a daemon that runs.
 * It does not raise the window: this happens while the person is elsewhere too.
 */
function watchCanvas(): void {
	setInterval(() => {
		if (tunnel !== undefined) {
			missed = 0;
			if (!shuttingDown && !cover && window !== undefined && !window.isDestroyed()) showRemote(window);
			return;
		}
		if (
			shuttingDown ||
			gaveUp ||
			bringing ||
			cover ||
			openingCanvas ||
			window === undefined ||
			window.isDestroyed()
		) {
			missed = 0;
			return;
		}
		missed = daemon.gone(DIRECTORY) ? missed + 1 : 0;
		if (canvasLost || missed >= 2) void bringBack(window);
	}, WATCH_MS).unref();
}

async function bringBack(showing: BrowserWindow): Promise<void> {
	bringing = true;
	try {
		log("canvas", "bringing back", canvasLost ? "the page was lost" : "the daemon is gone");
		const url = showing.webContents.getURL();
		if (isDaemonUrl(url)) {
			// where the person was, and the drafts the page keeps, outlive the page
			if (!canvasLost) await saveWorkspace(true).catch(() => {});
			resumeWorkspace = { ...resumeWorkspace, path: new URL(url).pathname };
		}
		canvasLost = false;
		missed = 0;
		if (shuttingDown || showing.isDestroyed()) return;
		// off the daemon's address first, or pointing the window back at it is taken for already there
		await showing.loadURL(waitingPage("restarting spool")).catch(() => {});
		await openCanvas(false);
		if (daemon.gone(DIRECTORY)) gaveUp = true;
	} finally {
		bringing = false;
	}
}

// MARK: - Another machine's daemon

let switchingRemote = false;

/** The window to the remote's canvas, or back to this Mac's: the menu's checkbox, remembered for the next launch. */
async function connectRemote(on: boolean): Promise<void> {
	if (remote === undefined || switchingRemote || shuttingDown || on === (tunnel !== undefined)) {
		rebuildMenus();
		return;
	}
	switchingRemote = true;
	try {
		writeRemoteChoice(DIRECTORY, on);
		const showing = window;
		// the drafts the page keeps outlive it; where it was means nothing on the other daemon
		if (showing !== undefined && canvasReady && isDaemonUrl(showing.webContents.getURL()))
			await saveWorkspace(true).catch(() => {});
		delete resumeWorkspace.path;
		if (on) startRemote();
		else stopRemote();
		rebuildMenus();
		if (showing === undefined || showing.isDestroyed()) {
			void openCanvas();
			return;
		}
		if (on) {
			showRemote(showing);
			return;
		}
		showing.setTitle(NAME);
		await showing.loadURL(waitingPage("opening spool")).catch(() => {});
		gaveUp = false;
		await openCanvas(false);
	} finally {
		switchingRemote = false;
	}
}

function startRemote(): void {
	if (remote === undefined || tunnel !== undefined) return;
	// this Mac's daemon's account, token and Chrome extension are not the remote's
	following?.stop();
	following = undefined;
	account = undefined;
	daemonPort = remote.port;
	daemonControlToken = undefined;
	daemonInfo = undefined;
	log("remote", "on", remote.name, `port=${remote.port}`);
	tunnel = new Tunnel(remote, { pidFile: TUNNEL_PID, log, onStatus: remoteStatus });
	tunnel.start();
	tray?.setToolTip(`${NAME} (${remote.name})`);
}

function stopRemote(): void {
	if (tunnel === undefined) return;
	log("remote", "off");
	tunnel.stop();
	tunnel = undefined;
	daemonPort = undefined;
	tray?.setToolTip(NAME);
}

function remoteStatus(status: TunnelStatus): void {
	log("remote", status.state, ...(status.state === "failed" ? [status.reason] : []));
	tray?.setContextMenu(buildTrayMenu());
	if (window !== undefined && !cover) showRemote(window);
}

/**
 * The window, on the remote: its canvas once spool answers through the tunnel,
 * the holding page until then. A canvas already up is left alone when the tunnel
 * drops: the page's own event stream reconnects once the port answers again,
 * and a daemon that restarted there sends the page its own reload.
 */
function showRemote(showing: BrowserWindow): void {
	if (remote === undefined || tunnel === undefined || showing.isDestroyed() || shuttingDown) return;
	if (isDaemonUrl(showing.webContents.getURL()) && !canvasLost) return;
	if (pointing?.window === showing && isDaemonUrl(pointing.url)) return;
	const status = tunnel.status;
	if (status.state === "connected" && !canvasLost) {
		log("remote", "opening the canvas", remote.name);
		loadCanvas(showing, `http://127.0.0.1:${remote.port}`);
		return;
	}
	// a canvas that failed to load gives way to the holding page, and the next watch opens it again
	canvasLost = false;
	const page =
		status.state === "failed"
			? holdingPage(`Can't reach ${remote.name}`, `${sentence(status.reason)}. Trying again.`)
			: waitingPage(`connecting to ${remote.name}`);
	if (showing.webContents.getURL() !== page) void showing.loadURL(page).catch(() => {});
}

function sentence(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The checkbox, in the app menu and the menu bar, and only when remote.json names a machine. */
function remoteItems(withStatus: boolean): MenuItemConstructorOptions[] {
	if (remote === undefined) return [];
	const items: MenuItemConstructorOptions[] = [
		{
			label: `Connect to ${remote.name}`,
			type: "checkbox",
			checked: tunnel !== undefined,
			click: (item) => void connectRemote(item.checked),
		},
	];
	if (withStatus && tunnel !== undefined) {
		const status = tunnel.status;
		const label =
			status.state === "connected"
				? `On ${remote.name}`
				: status.state === "connecting"
					? `Connecting to ${remote.name}…`
					: `Can't reach ${remote.name}: ${status.reason}`;
		items.push({ label, enabled: false });
	}
	return items;
}

function rebuildMenus(): void {
	Menu.setApplicationMenu(buildAppMenu());
	updateCanvasMenu();
	tray?.setContextMenu(buildTrayMenu());
}

// MARK: - The play window

/**
 * Play, as a window this app made (#275).
 *
 * The canvas opens `/play/<project>?frame=<name>`. In a browser that is a tab
 * and #227 designed every part of it. Here it was a second BrowserWindow at
 * whatever size Electron felt like, wearing an OS title bar with a URL in it —
 * three decisions nobody made. So the popup is refused and the window is built:
 *
 *   - sized from the frame's own two numbers, which only the daemon knows;
 *   - no title bar, `hiddenInset`, the lights inset into the 30px bar the page
 *     draws in its place;
 *   - and the rect a hand puts it at outlives the window, per project and per
 *     authored width.
 *
 * The bar is the page's, not this process's: the preload hands it the reset
 * operation a page cannot do for itself, and the page having that bridge is also
 * how it knows to draw a bar at all. A tab has no bridge and so keeps its edge
 * bar exactly.
 */
interface PlayRequest {
	project: string;
	frame?: string;
}

/** `/play/<project>` on this daemon, and nothing else, is a window this app owns. */
function playRequest(candidate: string): PlayRequest | undefined {
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return undefined;
	}
	const encoded = /^\/play\/([^/]+)$/.exec(url.pathname)?.[1];
	if (encoded === undefined) return undefined;
	let project: string;
	try {
		project = decodeURIComponent(encoded);
	} catch {
		return undefined;
	}
	const frame = url.searchParams.get("frame");
	return frame === null ? { project } : { project, frame };
}

/** What each play window remembers by, and what it opened as. */
interface PlayedWindow {
	request: PlayRequest;
	key: string;
	authored: { w: number; h: number };
	/** Whether it opened on a remembered rect, which its bar says once. */
	restored: boolean;
	/** Where this play's time went, logged once its frame is revealed. */
	timing: PlayTiming;
}

const played = new Map<number, PlayedWindow>();

/** The rooms of talks presented from spool's window, once the app is up. */
let rooms: Rooms | undefined;

/**
 * The size to fall back on when the daemon will not say. A refusal here is not
 * worth refusing to play over: a window at a plausible size is recoverable by
 * hand, and the hand's rect is then remembered like any other.
 */
const UNKNOWN_AUTHORED = { w: 1440, h: 900 };

/**
 * A play the canvas asked for by opening its URL, as a page that predates the
 * canvas bridge's `play` does: the frame's size is the daemon's to say, so it
 * is asked for first. Every canvas this app's daemon serves hands the size over
 * with the press instead, and nothing stands between that press and the window.
 */
async function openPlayFromPopup(url: string, request: PlayRequest): Promise<void> {
	const pressedAt = wallClock();
	const authored =
		daemonControlToken === undefined
			? undefined
			: await daemon.frameGeometry(new URL(url).origin, daemonControlToken, request.project, request.frame);
	if (authored === undefined) log("play", "no geometry", request.project, request.frame ?? "(first)");
	showPlayWindow(url, request, authored ?? UNKNOWN_AUTHORED, pressedAt);
}

/**
 * Put a play window on screen at once (spool#301): the spare when there is one
 * to adopt, else a window made for the press, shown dark before it has loaded
 * anything. Either way it is placed and titled first, shown, and only then
 * pointed at the play URL, which mints the single-use handoff for this play.
 */
function showPlayWindow(url: string, request: PlayRequest, size: { w: number; h: number }, pressedAt: number): void {
	// the remote's projects are not this Mac's, though they may share a name
	const key = rectKey(
		tunnel !== undefined && remote !== undefined ? `${remote.name}:${request.project}` : request.project,
		size.w,
	);
	const stored = readRect(DIRECTORY, key);
	// A rect stored on a display that has since been unplugged is a window
	// nobody can see, so it is not a preference any more.
	const restored = stored !== undefined && rectIsReachable(stored, workAreas());
	const rect = restored && stored !== undefined ? stored : fitRect(size, canvasArea());
	const title = request.frame ?? request.project;

	const choice = spareForPlay(spare, new URL(url).origin, daemonOn?.identity);
	if (choice === "discard") dropSpare("its daemon is gone");
	const adopted = choice === "adopt" ? takeSpare() : undefined;
	const window_ = adopted ?? makePlayWindow(rect, title);
	if (adopted !== undefined) {
		window_.setBounds({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
		window_.setTitle(title);
	}
	const timing = playTiming(adopted === undefined ? "fresh" : "spare", pressedAt);
	const id = window_.webContents.id;
	played.set(id, { request, key, authored: size, restored, timing });
	window_.once("show", () => timing.mark("window-shown", wallClock()));

	const remember = () => {
		if (window_.isDestroyed() || window_.isFullScreen() || window_.isMinimized()) return;
		const state = played.get(id);
		if (state === undefined) return;
		const now = boundsOf(window_);
		// A window standing exactly where this frame would have put it says
		// nothing, so nothing is stored. That is also what makes reset safe: the
		// move events its own setBounds fires arrive at the fit rect and forget.
		writeRect(DIRECTORY, state.key, sameRect(now, fitRect(state.authored, areaOf(window_))) ? undefined : now);
	};
	// A drag reports continuously and only where it comes to rest is a preference.
	let settling: NodeJS.Timeout | undefined;
	const settle = () => {
		if (settling !== undefined) clearTimeout(settling);
		settling = setTimeout(remember, SETTLE_MS);
	};
	// listened for after the placement above, which is the app's and no preference
	window_.on("move", settle);
	window_.on("resize", settle);
	window_.on("close", () => {
		if (settling !== undefined) clearTimeout(settling);
		remember();
		logPlayTiming(request, timing);
	});
	window_.on("closed", () => {
		played.delete(id);
		revealed(id);
	});
	window_.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
		if (loadFailedForGood(code, isMainFrame)) revealed(id);
	});
	window_.webContents.on("render-process-gone", () => revealed(id));
	awaitReveal(id);

	log(
		"play",
		request.project,
		request.frame ?? "(first)",
		`${rect.w}x${rect.h}`,
		restored ? "restored" : "authored",
		adopted === undefined ? `fresh (${choice === "adopt" ? "spare gone" : spareMissing(choice)})` : "spare",
	);
	window_.show();
	void window_.loadURL(url);
}

/** Why a press made its own window, for its log line. */
function spareMissing(choice: "fresh" | "discard"): string {
	if (choice === "discard") return "spare stale";
	if (spare === undefined) return "no spare";
	return spare.ready ? "another origin" : "spare loading";
}

/** A play window, hidden: dark, its own bar's room, and the bridge its page reads. */
function makePlayWindow(rect: WindowRect, title: string): BrowserWindow {
	const window_ = new BrowserWindow({
		x: rect.x,
		y: rect.y,
		width: rect.w,
		height: rect.h,
		minWidth: 240,
		minHeight: 200,
		title,
		// shown by its caller, dark, before anything has loaded: a window on screen
		// at the press, and the page fills it in
		show: false,
		backgroundColor: "#0e0e0e",
		// The bar is spool's, so the title bar is not the OS's. The lights are
		// still the OS's and are placed to sit centred in a 30px strip.
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: Math.round((BAR_PX - 12) / 2) },
		webPreferences: {
			spellcheck: false,
			preload: join(__dirname, "play-preload.js"),
			...AUTOPLAY,
		},
	});
	guard(window_);
	return window_;
}

// MARK: - The spare play window

/** The hidden play window kept ready while a canvas is open (spool#301, play-spare.ts). */
let spare: (SpareFacts & { window: BrowserWindow }) | undefined;
/** The daemon the canvas is on: its control origin, and that run of it as `daemonIdentity` names it. */
let daemonOn: { identity: string; origin: string } | undefined;
/** A daemon that answered the spare's page with an error, and is not asked again. */
let spareRefusedBy: string | undefined;
/** Play windows whose frame is not revealed yet: each holds the next spare back until it is, or it can no longer be. */
const awaitingReveal = new Set<number>();
let makingSpare: NodeJS.Timeout | undefined;

/** A beat after the last play revealed its frame, so a new spare never shares its dissolve. */
const SPARE_AFTER_MS = 1_000;

function spareSurroundings(): SpareSurroundings {
	return {
		canvasOpen: window !== undefined && !window.isDestroyed() && canvasReady,
		daemon: daemonOn?.identity,
		remote: tunnel !== undefined,
		quitting: shuttingDown,
		refusedBy: spareRefusedBy,
		awaitingReveal: awaitingReveal.size,
	};
}

/** Throw the spare away when it has no reason to be, and make one when it is wanted and missing. */
function tendSpare(): void {
	const now = spareSurroundings();
	if (spare !== undefined && !keepSpare(spare, now)) dropSpare(now.canvasOpen ? "its daemon is gone" : "no canvas");
	if (!shouldMakeSpare(spare, now)) {
		clearTimeout(makingSpare);
		makingSpare = undefined;
		return;
	}
	if (makingSpare !== undefined) return;
	makingSpare = setTimeout(() => {
		makingSpare = undefined;
		if (shouldMakeSpare(spare, spareSurroundings())) makeSpare();
	}, SPARE_AFTER_MS);
}

function makeSpare(): void {
	if (window === undefined || daemonOn === undefined) return;
	// the daemon's own origin, never the canvas window's: that can still be a remote's while the daemon is ours
	const { origin, identity } = daemonOn;
	const made = makePlayWindow(fitRect(UNKNOWN_AUTHORED, canvasArea()), NAME);
	// it is no window of the app's until a press adopts it: hidden, it is in no
	// list, and this keeps it out of the Window menu's
	made.excludedFromShownWindowsMenu = true;
	const facts = { window: made, origin, daemon: identity, ready: false };
	spare = facts;
	let answered = false;
	made.webContents.on("did-navigate", (_event, _url, code) => {
		answered = code >= 200 && code < 300;
	});
	made.once("ready-to-show", () => {
		if (spare !== facts) return;
		if (!answered) {
			// an older daemon, with no such page: it is not asked again
			spareRefusedBy = facts.daemon;
			dropSpare("its page was refused");
			return;
		}
		facts.ready = true;
		log("play", "spare ready", origin);
	});
	made.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
		if (spare === facts && loadFailedForGood(code, isMainFrame)) dropSpare("its page did not load");
	});
	made.webContents.on("render-process-gone", () => {
		if (spare === facts) dropSpare("its page is gone");
	});
	made.on("closed", () => {
		if (spare === facts) spare = undefined;
	});
	void made.loadURL(spareUrl(origin)).catch(() => {});
}

/** The spare, handed to a press: a window of the app's from here on. */
function takeSpare(): BrowserWindow | undefined {
	const taken = spare;
	spare = undefined;
	if (taken === undefined || taken.window.isDestroyed()) return undefined;
	taken.window.excludedFromShownWindowsMenu = false;
	return taken.window;
}

function dropSpare(why: string): void {
	const dropped = spare;
	spare = undefined;
	if (dropped === undefined) return;
	log("play", "spare dropped", why);
	if (!dropped.window.isDestroyed()) dropped.window.destroy();
}

/** A play window is bringing its frame up: the next spare waits until it has, however long that takes. */
function awaitReveal(id: number): void {
	clearTimeout(makingSpare);
	makingSpare = undefined;
	awaitingReveal.add(id);
}

/** The play revealed its frame, or never will: it closed, or its page failed for good. */
function revealed(id: number): void {
	if (!awaitingReveal.delete(id)) return;
	tendSpare();
}

/** A frame's size as the canvas hands it over: a pixel at least, and no larger than any screen could be asked for. */
function isAuthoredSize(value: unknown): value is { w: number; h: number } {
	if (typeof value !== "object" || value === null) return false;
	const { w, h } = value as Record<string, unknown>;
	const pixels = (n: unknown) => typeof n === "number" && n >= 1 && n <= 100_000;
	return pixels(w) && pixels(h);
}

/** A play's marks, once: when its frame is revealed, or as far as it got when it closes first. */
function logPlayTiming(request: PlayRequest, timing: PlayTiming): void {
	const line = timing.line();
	if (line !== undefined) log("play", "marks", request.project, request.frame ?? "(first)", line);
}

/** Long enough to be the end of a drag rather than a frame of one. */
const SETTLE_MS = 400;

function boundsOf(window_: BrowserWindow): WindowRect {
	const { x, y, width, height } = window_.getBounds();
	return { x, y, w: width, h: height };
}

function workAreas(): WorkArea[] {
	return screen.getAllDisplays().map((display) => display.workArea);
}

/** The screen the canvas is on: a played window opens beside its own canvas. */
function canvasArea(): WorkArea {
	if (window === undefined || window.isDestroyed()) return screen.getPrimaryDisplay().workArea;
	return screen.getDisplayMatching(window.getBounds()).workArea;
}

function areaOf(window_: BrowserWindow): WorkArea {
	return screen.getDisplayMatching(window_.getBounds()).workArea;
}

/**
 * What the bar can ask for. Every one of them is refused unless the asking
 * window is one this app made for play, so a played frame that somehow reached
 * these channels moves nothing.
 */
function installPlayChannels(): void {
	ipcMain.on("spool:play-window-restored", (event) => {
		event.returnValue = played.get(event.sender.id)?.restored === true;
	});
	// Play from the canvas (spool#301), with the frame's size the canvas already has, so the window is on screen at
	// the press: the one route in the app from a press to a play window that waits on nothing
	ipcMain.on("spool:play", (event, path: unknown, size: unknown) => {
		const pressedAt = wallClock();
		if (!canvasSender(event) || !controlOriginSender(event)) return;
		if (typeof path !== "string" || !isAuthoredSize(size)) return;
		let url: string;
		try {
			url = new URL(path, event.sender.getURL()).href;
		} catch {
			return;
		}
		const request = isDaemonUrl(url) ? playRequest(url) : undefined;
		if (request === undefined) return;
		showPlayWindow(url, request, { w: Math.round(size.w), h: Math.round(size.h) }, pressedAt);
	});
	ipcMain.on("spool:play-window-mark", (event, mark: unknown, at: unknown) => {
		const state = played.get(event.sender.id);
		if (state === undefined || !controlOriginSender(event)) return;
		if (!isPlayMark(mark) || typeof at !== "number") return;
		if (!state.timing.mark(mark, at)) return;
		logPlayTiming(state.request, state.timing);
		revealed(event.sender.id);
	});
	ipcMain.on("spool:play-window-reset", (event) => {
		const window_ = BrowserWindow.fromWebContents(event.sender);
		const state = played.get(event.sender.id);
		if (window_ === null || state === undefined) return;
		state.restored = false;
		writeRect(DIRECTORY, state.key, undefined);
		const fit = fitRect(state.authored, areaOf(window_));
		window_.setBounds({ x: fit.x, y: fit.y, width: fit.w, height: fit.h });
	});
}

// MARK: - Menus

/** Mirrored by the page's DesktopCommand; no raw IPC is exposed to the page. */
export type CanvasCommand =
	| "app.new-project"
	| "app.open-project"
	| "app.settings"
	| "app.help"
	| TabCommand
	| "canvas.zoom-in"
	| "canvas.zoom-out"
	| "canvas.zoom-reset"
	| "canvas.fit-all"
	| "canvas.fit-selection";

function sendCanvasCommand(command: CanvasCommand): void {
	if (command.startsWith("canvas.")) {
		if (canvasReady && canvasActive && window?.isFocused()) window.webContents.send("spool:canvas-command", command);
		return;
	}
	if (window === undefined) {
		pendingCanvasCommand = command;
		void openCanvas();
		return;
	}
	window.show();
	window.focus();
	if (canvasReady) window.webContents.send("spool:canvas-command", command);
	else pendingCanvasCommand = command;
}

/** Finder's documents (a .spool opened with spool, say), waiting for a canvas to take them. */
const openedPaths: string[] = [];

/**
 * A document from Finder goes to the canvas's own Open…, which reads it as it reads anything it is handed and asks
 * before it imports. Before the launch is ready it only waits: the launch opens the canvas, which takes it once up.
 */
function openPath(path: string): void {
	openedPaths.push(path);
	if (!app.isReady()) return;
	if (window === undefined) {
		void openCanvas();
		return;
	}
	window.show();
	window.focus();
	handOpenedPaths();
}

function handOpenedPaths(): void {
	if (!canvasReady || window === undefined) return;
	if (tunnel !== undefined && remote !== undefined) {
		if (openedPaths.splice(0).length > 0)
			tell(
				`${NAME} is on ${remote.name}.`,
				`A file on this Mac can't be opened there. Uncheck Connect to ${remote.name} to open it here.`,
				"info",
			);
		return;
	}
	for (const path of openedPaths.splice(0)) window.webContents.send("spool:canvas-open-path", path);
}

/**
 * A tab key from the menu. ⌘W in another of the app's windows closes that
 * window, as it always has; in the canvas the page decides what closes, and
 * a canvas not up yet is only a window. ⌘T is the one that brings the canvas
 * back; the rest mean nothing without it.
 */
function sendTabCommand(command: TabCommand): void {
	if (command === "app.home") {
		sendCanvasCommand(command);
		return;
	}
	const focused = BrowserWindow.getFocusedWindow();
	if (command === "app.close-tab" && focused !== null && focused !== window) {
		focused.close();
		return;
	}
	if (window === undefined || focused !== window) return;
	if (!canvasReady) {
		if (command === "app.close-tab") window.close();
		return;
	}
	window.webContents.send("spool:canvas-command", command);
}

/** File > Close Window, with the key the page leaves it, if any. */
function closeWindowItem(): MenuItemConstructorOptions {
	const accelerator = closeWindowKey(menuKeys);
	// the role would wear its own ⌘W, which is Close Tab's once the page answers tabs
	return accelerator === undefined
		? { label: "Close Window", click: () => BrowserWindow.getFocusedWindow()?.close() }
		: { role: "close", accelerator };
}

/** The menu items of the tab keys the page reports, each sending its command. */
function tabItems(items: readonly (TabItem | undefined)[]): MenuItemConstructorOptions[] {
	return items
		.filter((item): item is TabItem => item !== undefined)
		.map(({ command, label, accelerator, visible }) => ({
			label,
			accelerator,
			visible,
			click: () => sendTabCommand(command),
		}));
}

const CANVAS_ZOOM_COMMANDS = [
	["canvas.zoom-in", "Zoom In"],
	["canvas.zoom-out", "Zoom Out"],
	["canvas.zoom-reset", "Actual Size"],
	["canvas.fit-all", "Zoom to Fit"],
	["canvas.fit-selection", "Zoom to Selection"],
] as const satisfies readonly (readonly [CanvasCommand, string])[];

function updateCanvasMenu(): void {
	const menu = Menu.getApplicationMenu();
	for (const [command] of CANVAS_ZOOM_COMMANDS) {
		const item = menu?.getMenuItemById(command);
		if (item != null) item.enabled = canvasReady && canvasActive && window?.isFocused() === true;
	}
}

function installCanvasChannels(): void {
	// only a file this app saved in this session, so the page cannot point Finder anywhere else
	ipcMain.handle("spool:reveal-download", (event, path: unknown) => {
		if (!canvasSender(event) || canvasDownloads === undefined || !canvasDownloads.saved(path)) return false;
		shell.showItemInFolder(path);
		return true;
	});
	let choosingDirectory: Promise<string | null> | undefined;
	ipcMain.handle("spool:choose-directory", (event, request: unknown) => {
		if (window === undefined || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame)
			throw new Error("Only the canvas can choose a folder.");
		// a folder on this Mac means nothing to a daemon on another machine
		if (tunnel !== undefined) throw new Error("The canvas is on another machine.");
		const options = directoryDialogOptions(request);
		if (choosingDirectory) return null;
		choosingDirectory = dialog
			.showOpenDialog(window, options)
			.then((result) => (result.canceled ? null : (result.filePaths[0] ?? null)))
			.finally(() => {
				choosingDirectory = undefined;
			});
		return choosingDirectory;
	});
	// the preload leaves out what hands the page this Mac's paths: the open panel, Finder's documents, drops
	ipcMain.on("spool:canvas-remote", (event) => {
		event.returnValue = tunnel !== undefined;
	});
	ipcMain.on("spool:canvas-fullscreen", (event) => {
		event.returnValue = window?.isFullScreen() ?? false;
	});
	// a deck's slides filling this screen (spool#298): two displays play the presenter view instead
	ipcMain.on("spool:displays", (event) => {
		event.returnValue = screen.getAllDisplays().length;
	});
	ipcMain.handle("spool:present-full-screen", (event, on: unknown) => {
		if (!canvasSender(event) || window === undefined || typeof on !== "boolean") return false;
		return presentFullScreen(window, on);
	});
	ipcMain.on("spool:canvas-menu-keys", (event, keys: unknown) => {
		if (canvasSender(event)) wearMenuKeys(keys);
	});
	ipcMain.on("spool:canvas-close-window", (event) => {
		if (canvasSender(event)) window?.close();
	});
	// the first run (spool#250): one ordinary window that goes small for the setup and grows into spool's.
	// It answers whether the window changed, so a page in a window that can't (full screen) draws its own box.
	ipcMain.handle("spool:setup-window", (event, size: unknown) => {
		if (!canvasSender(event) || window === undefined) return false;
		const showing = window;
		if (size !== "grow") startSetupOpen(showing);
		const areas = screen.getAllDisplays().map((display) => display.workArea);
		const area = screen.getDisplayMatching(showing.getBounds()).workArea;
		if (size === "grow") {
			if (setupFrom === undefined) return false;
			const to = grownRect(setupFrom ?? undefined, area, areas);
			setupFrom = undefined;
			showing.setResizable(true);
			// macOS animates the frame; elsewhere it is one step, and the page's own fade covers it
			showing.setBounds({ x: to.x, y: to.y, width: to.w, height: to.h }, true);
			showing.setMinimumSize(MINIMUM.w, MINIMUM.h);
			return true;
		}
		const step = setupSize(size);
		if (step === undefined) return false;
		if (setupFrom === undefined) {
			// full screen or maximised has no small window in it: the page draws its own box there
			if (showing.isFullScreen() || showing.isMaximized()) return false;
			const { x, y, width, height } = showing.getBounds();
			setupFrom = { x, y, w: width, h: height };
		}
		showing.setMinimumSize(Math.min(SMALL.w, step.w), Math.min(SMALL.h, step.h));
		const to = smallRect(area, step);
		showing.setBounds({ x: to.x, y: to.y, width: to.w, height: to.h }, true);
		showing.setResizable(false);
		return true;
	});
	ipcMain.on("spool:canvas-active", (event, active: unknown) => {
		if (window === undefined || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame)
			return;
		if (typeof active !== "boolean") return;
		canvasReady = true;
		canvasActive = active;
		updateCanvasMenu();
		tendSpare();
		if (pendingCanvasCommand !== undefined) {
			const command = pendingCanvasCommand;
			pendingCanvasCommand = undefined;
			sendCanvasCommand(command);
		}
		handOpenedPaths();
	});
}

/** The menu's keys as the page reports them; nothing reported is the defaults, and no tab items. */
function wearMenuKeys(reported: unknown): void {
	const next = nextMenuKeys(menuKeys, reported);
	if (next === undefined) return;
	menuKeys = next;
	// an accelerator is fixed once built, so the menu is built again around the keys
	Menu.setApplicationMenu(buildAppMenu());
	updateCanvasMenu();
}

export function buildAppMenu(): Menu {
	const template: MenuItemConstructorOptions[] = [
		{
			role: "appMenu",
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{
					label: "Settings…",
					accelerator: menuKey("app.settings", menuKeys),
					click: () => sendCanvasCommand("app.settings"),
				},
				// this Mac's account; on the remote, the canvas's own Home shows that machine's
				...(tunnel === undefined
					? [
							{
								label: "Cloud Account",
								submenu: accountItems(account, {
									signIn: () => void cloudAccount("login"),
									signOut: () => void cloudAccount("logout"),
								}),
							},
						]
					: []),
				// /usr/local/bin/spool is Spool's: the beta never puts its own there
				...(BETA ? [] : [{ label: "Install Command Line Tool…", click: () => void installCommand() }]),
				...remoteItems(false),
				{ type: "separator" },
				{ ...updateItem(), id: "app-update" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "File",
			submenu: [
				{ label: "Open Canvas", click: () => void openCanvas() },
				{
					label: "New Project",
					accelerator: menuKey("app.new-project", menuKeys),
					click: () => sendCanvasCommand("app.new-project"),
				},
				{
					label: "Open…",
					accelerator: menuKey("app.open-project", menuKeys),
					click: () => sendCanvasCommand("app.open-project"),
				},
				{ type: "separator" },
				...tabItems([tabItem("app.close-tab", "Close Tab", menuKeys)]),
				// Closing the window leaves the app running in the menu bar, which
				// is the whole reason Cmd+W and Cmd+Q are different keys here.
				closeWindowItem(),
				...tabItems([tabItem("app.reopen-tab", "Reopen Closed Tab", menuKeys)]),
			],
		},
		{ role: "editMenu" },
		{
			label: "View",
			submenu: [
				// Canvas shortcuts stay in the page, where an entered prototype can
				// own its keys. These menu clicks call the same camera commands.
				...CANVAS_ZOOM_COMMANDS.map(([command, label]) => ({
					id: command,
					label,
					enabled: false,
					click: () => sendCanvasCommand(command),
				})),
				{ type: "separator" },
				{ role: "togglefullscreen" },
				{ type: "separator" },
				{ label: "Developer", submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }] },
			],
		},
		// a browser's Tab menu, once the page answers the keys; ⌘1-9 are kept
		// off it, the sheet tells them
		...(answersTabs(menuKeys)
			? [
					{
						label: "Tab",
						submenu: [
							...tabItems([
								tabItem("app.home", "Show Home", menuKeys),
								tabItem("app.next-tab", "Select Next Tab", menuKeys),
								tabItem("app.previous-tab", "Select Previous Tab", menuKeys),
							]),
							...tabItems([
								...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) =>
									tabItem(`app.tab-${n}`, `Select Tab ${n}`, menuKeys, false),
								),
								tabItem("app.tab-last", "Select Last Tab", menuKeys, false),
							]),
						],
					},
				]
			: []),
		{ role: "windowMenu" },
		{
			role: "help",
			submenu: [
				{ label: "Keyboard Shortcuts", click: () => sendCanvasCommand("app.help") },
				{ type: "separator" },
				{ label: "spool.page", click: () => void shell.openExternal("https://spool.page") },
				{ label: "Releases", click: () => void shell.openExternal(RELEASES_PAGE) },
			],
		},
	];
	return Menu.buildFromTemplate(template);
}

export function trayImage(): Electron.NativeImage {
	// Read and added by hand rather than by path: nativeImage resolves @2x off
	// the filesystem, and inside an asar there is no filesystem to resolve on.
	const image = nativeImage.createEmpty();
	const marks = LANE
		? ([
				[1, "markDev.png"],
				[2, "markDev@2x.png"],
			] as const)
		: BETA
			? ([
					[1, "markBetaTemplate.png"],
					[2, "markBetaTemplate@2x.png"],
				] as const)
			: ([
					[1, "markTemplate.png"],
					[2, "markTemplate@2x.png"],
				] as const);
	for (const [scaleFactor, file] of marks) {
		try {
			image.addRepresentation({ scaleFactor, buffer: readFileSync(join(__dirname, "..", "assets", file)) });
		} catch {
			// a missing representation is a smaller mark, not a missing app
		}
	}
	// A status item that keeps its own colour does not belong in the bar, which is
	// exactly the point for the lane: it is the one that should not blend in.
	image.setTemplateImage(!LANE);
	return image;
}

/**
 * The lane's Dock icon, handed over at runtime.
 *
 * The bundle carries one icon and signing seals it, so a lane cannot have its own
 * in Contents/Resources. The Dock takes one from a running app, which is also the
 * only icon an unpackaged `pnpm start` has any way of showing — without this it
 * wears Electron's.
 */
function installDockIcon(): void {
	if (!LANE || app.dock === undefined) return;
	const icon = nativeImage.createFromPath(join(__dirname, "..", "assets", "iconDev.png"));
	if (icon.isEmpty()) {
		log("dock", "FAIL no lane icon");
		return;
	}
	app.dock.setIcon(icon);
	log("dock", "OK", "the lane mark");
}

export function buildTrayMenu(): Menu {
	return Menu.buildFromTemplate([
		{ label: "Open Canvas", click: () => void openCanvas() },
		{ type: "separator" },
		// Disabled on purpose: these are labels, not things to click. Which
		// version is running is the first question every bug report answers, and
		// an adopted daemon on another version is the second: the app can be
		// updated and the canvas still be the cli's, and this is where that is said.
		{ label: `${NAME} ${version()}`, enabled: false },
		...(daemonInfo?.adopted && daemonInfo.version !== version()
			? [{ label: `daemon ${daemonInfo.version}, started by the cli`, enabled: false }]
			: []),
		updateItem(),
		...(remote === undefined ? [] : [{ type: "separator" as const }, ...remoteItems(true)]),
		{ type: "separator" },
		{ label: `Quit ${NAME}`, accelerator: "Command+Q", click: () => app.quit() },
	]);
}

/** Preparation, restart and recovery stay available from the menu bar. */
function updateItem(): MenuItemConstructorOptions {
	if (update === null) return { label: "Check for Updates…", click: () => void checkForUpdates() };
	switch (update.kind) {
		case "ready":
			return { label: `Restart ${NAME} to Update…`, click: () => void offerRestart() };
		case "downloading":
			return { label: "Downloading Update…", enabled: false };
		case "checking":
			return { label: "Checking for updates…", enabled: false };
		case "preparing":
			return { label: `Preparing ${NAME} ${update.version}…`, enabled: false };
		case "restarting":
			return { label: `Restarting into ${update.version}…`, enabled: false };
		case "failed":
			if (update.retryable) {
				const { version: target } = update;
				return { label: `Retry update to ${target}…`, click: () => void prepareUpdate(target) };
			}
			if (update.restart) return { label: `Restart ${NAME} to Retry Update…`, click: () => relaunchToRetryUpdate() };
			return { label: `Download ${NAME} ${update.version}…`, click: () => void shell.openExternal(DOWNLOAD) };
	}
}

function installTray(): void {
	const image = trayImage();
	tray = new Tray(image);
	tray.setToolTip(NAME);
	tray.setContextMenu(buildTrayMenu());
	log("tray", image.isEmpty() ? "FAIL no mark" : "OK");
}

// MARK: - Updates

/**
 * The update state shown by the native menus. null is nothing to say.
 */
type AppUpdate =
	| { kind: "ready"; version: string }
	| { kind: "checking"; version: string }
	| InstallProgress
	| { kind: "restarting"; version: string }
	| { kind: "failed"; version: string; message: string; retryable: boolean; restart?: boolean };

let update: AppUpdate | null = null;
/** A check or a download in flight, so a second click does not stack one. */
let busy = false;
/** The next automatic check, so a manual one can push it out a day. */
let nextCheck: NodeJS.Timeout | undefined;
let updateWindow: BrowserWindow | undefined;
let updateWindowLoaded = false;

function showUpdateProgress(): void {
	if (updateWindow === undefined) {
		const panel = new BrowserWindow({
			width: 420,
			height: 180,
			resizable: false,
			minimizable: false,
			maximizable: false,
			title: `${NAME} update`,
			backgroundColor: "#0e0e0e",
			webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
		});
		updateWindow = panel;
		updateWindowLoaded = false;
		panel.on("closed", () => {
			if (updateWindow === panel) {
				updateWindow = undefined;
				updateWindowLoaded = false;
			}
		});
		void panel
			.loadURL(holdingPage("Checking for updates…", `You can keep working while ${NAME} updates.`))
			.then(() => {
				if (updateWindow !== panel) return;
				updateWindowLoaded = true;
				renderUpdateProgress();
			})
			.catch(() => {});
	}
	updateWindow.show();
	updateWindow.focus();
}

function closeUpdateProgress(): void {
	updateWindow?.close();
	updateWindow = undefined;
	updateWindowLoaded = false;
}

function renderUpdateProgress(): void {
	if (updateWindow === undefined || !updateWindowLoaded || update === null) return;
	let heading: string;
	switch (update.kind) {
		case "checking":
			heading = "Checking for updates…";
			break;
		case "downloading":
			heading = `Downloading ${NAME} ${update.version}: ${update.percent}%`;
			break;
		case "preparing":
			heading = `Preparing ${NAME} ${update.version}…`;
			break;
		default:
			return;
	}
	void updateWindow.webContents
		.executeJavaScript(`document.querySelector('h1').textContent = ${JSON.stringify(heading)}`)
		.catch(() => {});
}

/** Manual progress has its own window; background work stays in the menu. */
function setUpdate(next: AppUpdate | null): void {
	const previous = visibleUpdate();
	update = next;
	tray?.setContextMenu(buildTrayMenu());
	const item = Menu.getApplicationMenu()?.getMenuItemById("app-update");
	if (item) {
		const state = updateItem();
		item.label = state.label ?? "Check for Updates…";
		item.enabled = state.enabled ?? true;
		item.click = state.click ?? (() => {});
	}
	if (JSON.stringify(previous) !== JSON.stringify(visibleUpdate()))
		window?.webContents.send("spool:app-update-changed", visibleUpdate());
	renderUpdateProgress();
}

function visibleUpdate(): AppUpdate | null {
	return update?.kind === "ready" && update.version !== dismissedUpdate ? update : null;
}

function installUpdateChannels(): void {
	ipcMain.on("spool:app-version", (event) => {
		event.returnValue = canvasSender(event) ? version() : null;
	});
	ipcMain.on("spool:app-update-state", (event) => {
		event.returnValue = canvasSender(event) ? visibleUpdate() : null;
	});
	ipcMain.on("spool:app-update-install", (event) => {
		if (canvasSender(event)) void restartUpdate();
	});
	ipcMain.on("spool:app-update-dismiss", (event) => {
		if (!canvasSender(event) || update?.kind !== "ready") return;
		dismissedUpdate = update.version;
		window?.webContents.send("spool:app-update-changed", null);
	});
	ipcMain.on("spool:canvas-ready", (event) => {
		if (!canvasSender(event)) return;
		workspaceReady = true;
		log("canvas", "ready", `process=${Math.round(process.uptime() * 1000)}ms`);
		if (coverDeadline !== undefined) uncover();
	});
	ipcMain.on("spool:canvas-saved", (event, id: unknown, error: unknown) => {
		if (!canvasSender(event) || saving?.id !== id) return;
		if (error === null) saving?.resolve();
		else saving?.reject(new Error(typeof error === "string" ? error : "Could not save the canvas."));
	});
	ipcMain.handle("spool:canvas-reload", async (event) => {
		if (canvasSender(event)) await reloadCanvasWindow();
	});
}

async function reloadCanvasWindow(): Promise<void> {
	if (shuttingDown || !window) return;
	if (cover) {
		reloadQueued = true;
		return;
	}
	// A successor daemon has already invalidated the old page's capability.
	// Local drafts still need a checkpoint before discarding that page.
	const showing = window;
	cover = new UpdateCover(showing);
	try {
		await cover.enter();
		await saveWorkspace(true);
		workspaceReady = false;
		awaitWorkspace();
		showing.webContents.reload();
	} catch (error) {
		uncover();
		log("canvas", "FAIL reload", String(error));
		tell(`${NAME} could not refresh yet.`, String(error), "warning");
	}
}

/** Check hourly; a cached newer release should be prepared on this launch. */
function scheduleChecks(): void {
	if (!updaterAvailable()) return;
	const cache = readCheckCache(DIRECTORY);
	const installed = parseVersion(version());
	const cached = cache === undefined ? undefined : parseVersion(cache.latest);
	const newer = installed !== undefined && cached !== undefined && compareVersions(cached, installed) > 0;
	scheduleCheckIn(newer ? FIRST_CHECK_DELAY_MS : nextCheckDelay(cache));
}

function scheduleCheckIn(delay: number): void {
	if (nextCheck !== undefined) clearTimeout(nextCheck);
	nextCheck = setTimeout(() => {
		nextCheck = undefined;
		void automaticCheck().finally(() =>
			scheduleCheckIn(update?.kind === "failed" && update.retryable ? 5 * 60_000 : CHECK_INTERVAL_MS),
		);
	}, delay);
	nextCheck.unref();
}

async function automaticCheck(): Promise<void> {
	if (busy || shuttingDown || update?.kind === "restarting") return;
	// A waiting update is still checked past, so a newer release replaces it
	// before the restart rather than after it. The ready state stays up meanwhile.
	const waiting = update?.kind === "ready" ? update.version : undefined;
	busy = true;
	if (waiting === undefined) setUpdate({ kind: "checking", version: version() });
	let found: Awaited<ReturnType<typeof checkForUpdate>>;
	try {
		found = await checkForUpdate((line) => log("updates", line));
		rememberCheck(found.latest);
		log("updates", "OK", `installed=${version()}`, `latest=${found.latest}`, found.newer ? "available" : "current");
	} catch (error) {
		// Offline is a normal day; automatic failures stay in the menu and log.
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "skip", detail);
		if (waiting !== undefined) return;
		setUpdate({ kind: "failed", version: version(), message: detail, retryable: true });
		closeUpdateProgress();
		return;
	} finally {
		busy = false;
	}
	if (waiting !== undefined) {
		if (newerThan(found.latest, waiting)) await prepareUpdate(found.latest, false);
		return;
	}
	if (found.newer) await prepareUpdate(found.latest, false);
	else {
		closeUpdateProgress();
		setUpdate(null);
	}
}

function rememberCheck(latest: string): void {
	try {
		writeFileSync(
			checkCachePath(DIRECTORY),
			`${JSON.stringify({ latest, checkedAt: new Date().toISOString() }, null, "\t")}\n`,
		);
	} catch {
		// an unwritable state directory is the daemon's problem to report
	}
}

/** The menu item: the same check, with an answer either way. */
async function checkForUpdates(): Promise<void> {
	if (shuttingDown) return;
	if (update?.kind === "ready") return offerRestart();
	if (busy) {
		showUpdateProgress();
		return;
	}
	const installed = parseVersion(version());
	if (installed === undefined) {
		log("updates", "FAIL", "no version in bundle");
		tell(
			`${NAME} cannot tell which version it is.`,
			"This copy has no version number in it, which usually means it was not packaged by scripts/build.sh. Compare it against the releases page yourself.",
			"warning",
		);
		return;
	}

	// A copy with no feed, which is every checkout build, can only be pointed
	// at the download. It still gets told whether there is one.
	if (!updaterAvailable()) {
		let latest: Release;
		try {
			latest = await latestRelease(FEED);
		} catch (error) {
			const detail = error instanceof UpdateCheckError ? error.message : String(error);
			log("updates", "FAIL", detail);
			tell(`${NAME} could not check for updates.`, `${detail}\n\nYou have ${formatVersion(installed)}.`, "warning");
			return;
		}
		log(
			"updates",
			"OK",
			`installed=${formatVersion(installed)}`,
			`latest=${formatVersion(latest.version)}`,
			"no feed",
		);
		// Not a mismatch test: a local build ahead of the published release is
		// every machine that ever builds this app, and offering it a downgrade
		// would be nonsense.
		if (compareVersions(latest.version, installed) <= 0) {
			tell(`${NAME} is up to date.`, `You have ${formatVersion(installed)}, which is the latest release.`, "info");
			return;
		}
		const answer = await dialog.showMessageBox({
			type: "info",
			message: `${NAME} ${formatVersion(latest.version)} is available.`,
			detail: `You have ${formatVersion(installed)}. This copy was built from a checkout, so it cannot replace itself: Download starts the dmg, and replacing ${NAME} in Applications by hand is the rest.`,
			buttons: ["Download", "Later"],
			defaultId: 0,
			cancelId: 1,
		});
		if (answer.response === 0) void shell.openExternal(DOWNLOAD);
		return;
	}

	busy = true;
	setUpdate({ kind: "checking", version: version() });
	showUpdateProgress();
	let found: Awaited<ReturnType<typeof checkForUpdate>>;
	try {
		found = await checkForUpdate((line) => log("updates", line));
	} catch (error) {
		busy = false;
		closeUpdateProgress();
		setUpdate(null);
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "FAIL", detail);
		tell(`${NAME} could not check for updates.`, `${detail}\n\nYou have ${formatVersion(installed)}.`, "warning");
		return;
	}
	busy = false;
	rememberCheck(found.latest);
	// Asked by hand today, so the clock need not ask again until tomorrow.
	scheduleCheckIn(CHECK_INTERVAL_MS);
	log(
		"updates",
		"OK",
		`installed=${formatVersion(installed)}`,
		`latest=${found.latest}`,
		found.newer ? "offer" : "current",
	);
	if (!found.newer) {
		closeUpdateProgress();
		setUpdate(null);
		tell(`${NAME} is up to date.`, `You have ${formatVersion(installed)}, which is the latest release.`, "info");
		return;
	}

	await prepareUpdate(found.latest);
}

/**
 * Whether Squirrel can replace this bundle at all. It cannot from a mounted dmg
 * or a Gatekeeper-translocated copy, and it says so only after the download,
 * so the reason is given first and the download never starts.
 */
function whyNotInstallable(): string | undefined {
	if (process.platform !== "darwin" || !app.isPackaged || LANE) return undefined;
	if (process.execPath.includes("/AppTranslocation/")) {
		return `${NAME} is running from a quarantined copy, which macOS does not let it replace. Move ${NAME} to Applications and open it from there.`;
	}
	if (!app.isInApplicationsFolder()) {
		return `${NAME} is not in the Applications folder, so macOS will not let it replace itself. Move it there and open it again.`;
	}
	return undefined;
}

/**
 * First launch from the dmg or Downloads: offer the move, once. Nothing about
 * the app needs Applications to run, but the self-update does, and the offer
 * here is a sentence where the refusal later would be a wait.
 */
async function offerApplicationsFolder(): Promise<void> {
	if (process.platform !== "darwin" || !app.isPackaged || LANE) return;
	if (app.isInApplicationsFolder()) return;
	// Declined once is declined: a question on every launch is a nag, and the
	// refusal at update time says the same thing at the moment it matters.
	const declined = join(app.getPath("userData"), "stay-put");
	if (existsSync(declined)) return;
	const answer = await dialog.showMessageBox({
		type: "question",
		message: `Move ${NAME} to the Applications folder?`,
		detail: `${NAME} runs from anywhere, but it can only update itself from Applications. Moving it takes a moment and opens it again from there.`,
		buttons: ["Move to Applications", "Not Now"],
		defaultId: 0,
		cancelId: 1,
	});
	if (answer.response !== 0) {
		try {
			writeFileSync(declined, "");
		} catch {
			// asked again next launch, which is the worse of two small things
		}
		return;
	}
	log("boot", "moving to Applications");
	// On success this process is replaced by the moved copy; a false here is a
	// declined system prompt, and the launch goes on from where it is.
	if (!app.moveToApplicationsFolder()) log("boot", "the move was declined");
}

/**
 * The spool command, linked on launch whenever that needs no question, and
 * offered once when it needs the administrator prompt. Declined is declined, as
 * with the move to Applications; the app menu has the same install for later.
 */
async function offerCommand(): Promise<void> {
	if (process.platform !== "darwin" || !app.isPackaged || LANE || BETA) return;
	// a link into a dmg or Downloads breaks the moment the app is moved
	if (!app.isInApplicationsFolder()) return;
	const launcher = launcherPath(process.resourcesPath);
	if (!existsSync(launcher)) return;
	const state = linkState(launcher);
	if (state === "current" || state === "foreign") return;
	if (state === "absent") {
		const other = otherSpool(terminalPath() ?? process.env.PATH);
		if (other !== undefined) {
			log("command", "already on PATH", other);
			return;
		}
	}
	if (linkDirectly(launcher)) {
		log("command", "linked", LINK);
		return;
	}
	const offered = join(app.getPath("userData"), "command-offered");
	if (existsSync(offered)) return;
	try {
		writeFileSync(offered, "");
	} catch {
		// asked again next launch, which is the worse of two small things
	}
	const answer = await dialog.showMessageBox({
		type: "question",
		message: "Add the spool command to your terminal?",
		detail:
			"Spool can put the spool command in /usr/local/bin, so you and your agents can drive the canvas from any terminal. macOS will ask for your password. You can also do this later from the Spool menu.",
		buttons: ["Add Command", "Not Now"],
		defaultId: 0,
		cancelId: 1,
	});
	if (answer.response === 0) await installCommand();
}

async function installCommand(): Promise<void> {
	const launcher = launcherPath(process.resourcesPath);
	if (!existsSync(launcher)) {
		tell(
			`This copy of ${NAME} has no spool command in it.`,
			`Download ${NAME} again from the releases page.`,
			"error",
		);
		return;
	}
	if (!app.isInApplicationsFolder()) {
		tell(
			`Move ${NAME} to the Applications folder first.`,
			"The command points into the app, so it would stop working the moment the app moved.",
			"warning",
		);
		return;
	}
	const state = linkState(launcher);
	if (state === "foreign") {
		tell(
			"Another spool command is already installed.",
			`${LINK} was not put there by this app, so it is left alone.`,
			"warning",
		);
		return;
	}
	if (state !== "current" && !linkDirectly(launcher) && !(await linkAsAdministrator(launcher))) {
		log("command", "the administrator prompt was declined");
		return;
	}
	log("command", "linked", LINK);
	tell("The spool command is installed.", "Open a new terminal window and run spool.", "info");
}

function newerThan(candidate: string, current: string): boolean {
	const a = parseVersion(candidate);
	const b = parseVersion(current);
	return a !== undefined && b !== undefined && compareVersions(a, b) > 0;
}

/**
 * Prepare while the canvas remains usable; only a verified bundle earns a restart
 * offer. With `offer` off, a manual preparation shows its progress and asks nothing
 * after, for the restart that is waiting on it.
 */
async function prepareUpdate(target: string, manual = true, offer = manual): Promise<void> {
	if (busy || shuttingDown) return;
	const refusal = whyNotInstallable();
	if (refusal !== undefined) {
		closeUpdateProgress();
		log("updates", "FAIL", refusal);
		setUpdate({ kind: "failed", version: target, message: refusal, retryable: false });
		if (manual)
			tell(
				`${NAME} cannot update itself from here.`,
				`${refusal}\n\nDownload starts the dmg, which is the other way onto ${target}.`,
				"warning",
			);
		return;
	}
	busy = true;
	setUpdate({ kind: "checking", version: target });
	if (manual) showUpdateProgress();
	try {
		target = await installUpdate(
			(line) => log("updates", line),
			(state) => {
				target = state.version;
				setUpdate(state);
			},
		);
	} catch (error) {
		busy = false;
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "FAIL", detail);
		const staged = stagedUpdate();
		if (staged !== undefined) {
			// A newer release failed to replace the waiting one, which still stands.
			closeUpdateProgress();
			setUpdate({ kind: "ready", version: staged });
			return;
		}
		setUpdate({
			kind: "failed",
			version: target,
			message: detail,
			retryable: error instanceof UpdateCheckError && error.retryable,
			restart: error instanceof RestartRequiredError,
		});
		closeUpdateProgress();
		if (update?.kind === "failed" && update.retryable) scheduleCheckIn(5 * 60_000);
		if (manual) tell(`${NAME} could not prepare the update.`, detail, "warning");
		return;
	}
	busy = false;
	if (shuttingDown) return;
	closeUpdateProgress();
	setUpdate({ kind: "ready", version: target });
	if (offer) await offerRestart();
}

/** A fresh process clears an attempt Squirrel could not cancel; the cached check prepares it again on launch. */
function relaunchToRetryUpdate(): void {
	if (shuttingDown) return;
	log("updates", "relaunching to retry");
	app.relaunch();
	app.quit();
}

let restartDialogOpen = false;

async function offerRestart(): Promise<void> {
	if (restartDialogOpen || shuttingDown || update?.kind !== "ready") return;
	restartDialogOpen = true;
	try {
		const answer = await dialog.showMessageBox({
			type: "info",
			message: `A ${NAME} update is ready.`,
			detail: `Restart to use ${NAME} ${update.version}. If you choose Later, the update will finish when you quit ${NAME}.`,
			buttons: [`Restart ${NAME}`, "Later"],
			defaultId: 0,
			cancelId: 1,
		});
		if (answer.response === 0) await restartUpdate();
	} finally {
		restartDialogOpen = false;
	}
}

/**
 * Before a restart, ask once more whether a newer release than the waiting one
 * is out, and prepare it in its place: one restart then lands on the newest. A
 * check that fails or is slow leaves the waiting update to restart into.
 */
async function catchUpBeforeRestart(waiting: string): Promise<void> {
	busy = true;
	let latest: string;
	try {
		latest = (await checkForUpdate((line) => log("updates", line), RESTART_CHECK_TIMEOUT_MS)).latest;
	} catch (error) {
		log("updates", "skip", error instanceof UpdateCheckError ? error.message : String(error));
		return;
	} finally {
		busy = false;
	}
	rememberCheck(latest);
	if (!newerThan(latest, waiting) || shuttingDown) return;
	log("updates", "replacing", `waiting=${waiting}`, `latest=${latest}`);
	await prepareUpdate(latest, true, false);
}

/** Short: the person has asked for a restart, and the waiting update is fine. */
const RESTART_CHECK_TIMEOUT_MS = 5_000;

async function restartUpdate(relaunch = true): Promise<void> {
	if (busy || shuttingDown || cover || update?.kind !== "ready") return;
	if (relaunch) {
		await catchUpBeforeRestart(update.version);
		if (busy || shuttingDown || cover || update?.kind !== "ready") return;
	}
	const target = update.version;
	busy = true;
	// Squirrel replaces the app on quit and relaunches it. The daemon this app
	// started is stopped here, on purpose, before the updater owns the exit:
	// will-quit's own preventDefault path would fight it.

	let deadline: NodeJS.Timeout | undefined;
	try {
		if (window) {
			cover = new UpdateCover(window);
			await cover.enter();
		}
		await saveWorkspace();
		const workspace: UpdateWorkspace = {};
		if (window) {
			const bounds = window.getNormalBounds();
			workspace.path = new URL(window.webContents.getURL()).pathname;
			workspace.rect = { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
			workspace.maximized = window.isMaximized();
			workspace.fullscreen = window.isFullScreen();
		}
		beginUpdateRestart(DIRECTORY, target, Date.now(), workspace);
		setUpdate({ kind: "restarting", version: target });
		shuttingDown = true;
		await shutdown(true);
		if (!relaunch) {
			app.quit();
			return;
		}
		log("updates", "relaunching");

		// macOS has verified the bundle. This covers an exit refused by the app.
		deadline = setTimeout(() => {
			log("updates", "quit delayed", lastUpdaterError() ?? "finishing the verified update");
			app.quit();
		}, RELAUNCH_DEADLINE_MS);
		relaunchIntoUpdate();
	} catch (error) {
		busy = false;
		clearTimeout(deadline);
		clearUpdateRestart(DIRECTORY);
		shuttingDown = false;
		tunnel?.start();
		log("updates", "FAIL", String(error));
		uncover();
		setUpdate({ kind: "ready", version: target });
		tell(`${NAME} could not restart yet.`, error instanceof Error ? error.message : String(error), "warning");
		void openCanvas();
	}
}

/** Squirrel has verified the bundle by now; this only covers a quit that never came. */
const RELAUNCH_DEADLINE_MS = 15_000;

/**
 * One thing to say and a button to dismiss it, and never a modal that blocks the
 * process: a panel the main process is waiting on is a window that stops
 * redrawing and a daemon nobody is watching.
 */
function tell(message: string, detail: string, type: "info" | "warning" | "error"): void {
	void dialog.showMessageBox({ type, message, detail, buttons: ["OK"] });
}

/** Keep the Cloud Account menu on the account of the daemon the window is pointed at. */
function follow(origin: string, controlToken: string): void {
	const daemon = `${origin} ${controlToken}`;
	if (following?.daemon === daemon) return;
	following?.stop();
	following = {
		daemon,
		...followAccount(
			origin,
			controlToken,
			(next) => {
				if (JSON.stringify(next) === JSON.stringify(account)) return;
				account = next;
				// a submenu is fixed once built, so the menu is built again around the account
				Menu.setApplicationMenu(buildAppMenu());
				updateCanvasMenu();
			},
			undefined,
			reveal,
		),
	};
}

/**
 * Open in spool, from the Chrome extension: the window comes forward over Chrome, and the canvas in it, which hears
 * the same event, opens the project and flies to the frame. With no window, a new one opens on the frame's address.
 */
function reveal({ root, frame }: Reveal): void {
	if (window === undefined || window.isDestroyed()) {
		resumeWorkspace = {
			...resumeWorkspace,
			path: `/p/${encodeURIComponent(basename(root))}?${new URLSearchParams({ frame })}`,
		};
		void openCanvas();
		return;
	}
	if (window.isMinimized()) window.restore();
	window.show();
	app.focus({ steal: true });
	window.focus();
}

async function cloudAccount(command: "login" | "logout"): Promise<void> {
	const spec = cloudCommand(process.execPath, process.resourcesPath, DIRECTORY, command, process.env);
	if (spec === undefined) {
		tell(`This copy of ${NAME} cannot open its account.`, `Download ${NAME} again from the releases page.`, "error");
		return;
	}
	const result = await new Promise<{ code: number; stderr: string }>((done) => {
		const child = spawn(spec.command, spec.args, {
			env: spec.env,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		if (child.stderr === null) return done({ code: 1, stderr: `${NAME} could not start its account command.` });
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (part: string) => (stderr += part));
		child.on("error", (error) => done({ code: 1, stderr: error.message }));
		child.on("close", (code) => done({ code: code ?? 1, stderr }));
	});
	if (result.code === 0) {
		tell(command === "login" ? "Signed in to spool Cloud." : "Signed out of spool Cloud.", "", "info");
		return;
	}
	const detail = result.stderr.trim().split("\n").at(-1) || "Try again.";
	log("cloud account", "FAIL", `command=${command}`, `code=${result.code}`);
	// The CLI owns redaction. This process never receives its stdout or credential.
	tell(command === "login" ? `${NAME} could not sign in.` : `${NAME} could not sign out.`, detail, "error");
}

// MARK: - Lifecycle

/**
 * Stop the daemon only if it is still the one this app started. The pid is
 * checked again here rather than trusted from launch: if `spool upgrade`
 * restarted the daemon in between, the thing running is no longer the thing this
 * app started, and stopping it would be a stranger killing a process.
 */
export async function shutdown(requireStopped = false): Promise<void> {
	const started = performance.now();
	// the remote daemon is never stopped from here, only the tunnel to it
	tunnel?.stop();
	if (startedPid === undefined) {
		log("quit", "left the daemon running");
		return;
	}
	const current = await daemon.status(DIRECTORY);
	if (!current.running || current.pid !== startedPid) {
		log("quit", "the daemon it started is already gone");
		return;
	}
	const stopped = await daemon.stop(current.pid);
	if (!stopped && requireStopped) throw new Error("The background server has not stopped yet. Try updating again.");
	log(
		"quit",
		stopped ? "stopped" : "FAIL did not exit",
		`pid=${current.pid}`,
		`elapsed=${Math.round(performance.now() - started)}ms`,
	);
}

export function boot(): void {
	// Registered synchronously: Finder sends cold-launch documents before ready.
	app.on("open-file", (event, path) => {
		event.preventDefault();
		openPath(path);
	});
	openLog(DIRECTORY);
	const restart = updateRestartState(DIRECTORY, version());
	if (restart === "waiting") {
		log("updates", "waiting for native replacement", `installed=${version()}`);
		app.exit(0);
		return;
	}
	if (restart === "completed") {
		resumeWorkspace = updateRestartWorkspace(DIRECTORY);
		resumeCovered = true;
	}
	if (restart === "completed" || restart === "expired") {
		clearUpdateRestart(DIRECTORY);
		log("updates", restart, `installed=${version()}`);
	}
	// First, because the lock the next line asks for lives in this directory, and
	// a lane that shares it with the installed app can never hold one of its own.
	const userData = daemon.userDataDirectory(app.getPath("userData"));
	mkdirSync(userData, { recursive: true });
	app.setPath("userData", userData);
	// After the path, never before: the default userData directory is named after
	// the app, so renaming first would move the daily app's out from under it.
	app.setName(NAME);

	// One app, one daemon. A second launch is somebody asking for the window they
	// already have.
	if (!app.requestSingleInstanceLock()) {
		app.exit(0);
		return;
	}
	app.on("second-instance", () => void openCanvas());

	// After the lock, so a second launch never ends the first one's tunnel.
	const configured = readRemote(DIRECTORY);
	if (configured.error !== undefined) log("remote", "FAIL", configured.error, "no remote until it is fixed");
	remote = configured.config;
	if (remote !== undefined) {
		const reclaimed = reclaimTunnel(TUNNEL_PID, remote.port);
		if (reclaimed !== undefined) log("remote", "ended the ssh a previous run left", `pid=${reclaimed}`);
		// a quit that never reaches will-quit still takes its ssh with it
		process.once("exit", () => tunnel?.stop());
	}

	installPlayChannels();
	rooms = installRooms({
		canvas: () => window,
		guard,
		webPreferences: { spellcheck: false, ...AUTOPLAY },
		log: (...words) => log(...words),
	});
	installUpdateChannels();
	installCanvasChannels();
	const commit = builtFrom();
	// macOS writes the build version in brackets after the version: a beta's is the commit it was built from
	app.setAboutPanelOptions({
		applicationName: NAME,
		applicationVersion: version(),
		...(commit === undefined ? {} : { version: commit.slice(0, 7) }),
		credits: "FSL-1.1-MIT",
	});

	app.on("window-all-closed", () => {
		// Deliberately nothing. Closing the window leaves the app in the menu bar
		// with its daemon running, which is what Cmd+W is for; Cmd+Q is how you
		// mean it.
	});
	app.on("activate", () => void openCanvas());

	app.on("before-quit", (event) => {
		if (shuttingDown || update?.kind !== "ready") return;
		event.preventDefault();
		void restartUpdate(false);
	});

	app.on("will-quit", (event) => {
		if (shuttingDown) return;
		if (update?.kind === "ready") beginUpdateRestart(DIRECTORY, update.version);
		shuttingDown = true;
		event.preventDefault();
		void shutdown().then(() => app.quit());
	});

	void app.whenReady().then(async () => {
		log("boot", `pid=${process.pid}`, `v${version()}`, DIRECTORY);
		if (restart === "expired")
			tell(
				`${NAME} did not finish updating.`,
				"The previous update did not finish. Check for Updates to try again.",
				"warning",
			);
		await offerApplicationsFolder();
		installPermissions();
		canvasDownloads = installCanvasDownloads(
			session.defaultSession,
			() => app.getPath("downloads"),
			(contents, url) =>
				contents === window?.webContents && isDaemonUrl(url.startsWith("blob:") ? url.slice(5) : url),
		);
		Menu.setApplicationMenu(buildAppMenu());
		installDockIcon();
		if (remote !== undefined) {
			if (readRemoteChoice(DIRECTORY)) {
				startRemote();
				Menu.setApplicationMenu(buildAppMenu());
			}
			// sleep leaves a tunnel that only looks alive; a screen lock alone does not, so it restarts only a broken one
			powerMonitor.on("resume", () => tunnel?.restart());
			powerMonitor.on("unlock-screen", () => {
				if (tunnel !== undefined && tunnel.status.state !== "connected") tunnel.restart();
			});
		}
		installTray();
		scheduleChecks();
		await openCanvas();
		watchCanvas();
		// a convenience: nothing about it may stop a launch or escape as a rejection
		void offerCommand().catch((error: unknown) => log("command", "FAIL", String(error)));
	});
}
