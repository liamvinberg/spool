import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	screen,
	shell,
	Tray,
} from "electron";
import * as daemon from "./daemon";
import { log, openLog } from "./log";
import { userPath } from "./path";
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
import { bundledCli, bundledShim } from "./runtime";
import {
	installUpdate,
	lastUpdaterError,
	latestRelease,
	RELEASES_PAGE,
	relaunchIntoUpdate,
	UpdateCheckError,
	updaterAvailable,
} from "./updates";
import { compareVersions, formatVersion, parseVersion, type Version } from "./version";

// Spool, as a Mac app: a window on the canvas the daemon already serves.
//
// The engine is Chromium because the canvas is Chromium's. Transformed iframes
// render blurry under WebKit, so a native WKWebView window would show a worse
// canvas than the browser does; wrapping the same engine the canvas is developed
// against is the only shell that shows it truthfully.
//
// The shape, in three sentences. On launch it looks for a daemon and adopts the
// one it finds, because the app and the CLI share one state directory and two
// supervisors that disagree would both start one. Only when nothing answers does
// it start the `spool.page` inside the bundle, as a child process running under
// Electron's own binary with ELECTRON_RUN_AS_NODE=1, which is plain Node: the
// native addons in spool's dependency tree load into that process rather than
// into the one drawing the window. Closing the window leaves the app in the menu
// bar with the daemon running; quitting stops a daemon this app started and
// leaves an adopted one alone.

const DIRECTORY = daemon.stateDirectory();

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
 * Unset SPOOL_DIR is the released app, unchanged.
 */
const LANE = (process.env.SPOOL_DIR ?? "") !== "";
const NAME = LANE ? "Spool Dev" : "Spool";

/** Held only so the tray item is not collected out from under the menu bar. */
let tray: Tray | undefined;
let window: BrowserWindow | undefined;
/** The daemon this app started, if it started one. */
let startedPid: number | undefined;
/** The daemon this window is pointed at, for telling its popups from the web. */
let daemonPort: number | undefined;
/** Its credential, held for the one control request this app makes: play geometry. */
let daemonControlToken: string | undefined;
let checkingForUpdates = false;
/** The download in flight, if one is, for the menu bar and the Dock. */
let downloading: { version: string; percent: number } | undefined;
let shuttingDown = false;

export function version(): string {
	return app.getVersion();
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

/** These strings carry a filesystem path, and a path can hold anything. */
function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (character) => `&#${character.codePointAt(0)};`);
}

function createWindow(): BrowserWindow {
	const created = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 720,
		minHeight: 480,
		title: NAME,
		backgroundColor: "#0e0e0e",
		webPreferences: { spellcheck: false },
	});

	guard(created);
	created.on("closed", () => {
		if (created === window) window = undefined;
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
		const play = playRequest(url);
		if (play === undefined) return { action: "allow" };
		void openPlayWindow(url, play);
		return { action: "deny" };
	});
	created.webContents.on("will-navigate", (event, url) => {
		if (isDaemonUrl(url) || url.startsWith("data:")) return;
		event.preventDefault();
		void shell.openExternal(url);
	});
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
export async function openCanvas(): Promise<void> {
	if (window === undefined) window = createWindow();
	const showing = window;
	showing.show();
	showing.focus();

	const current = await daemon.status(DIRECTORY);
	if (current.running) {
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

	void showing.loadURL(holdingPage("Starting Spool", "The canvas opens as soon as the daemon answers."));
	const started = await startBundled();
	if (started === undefined) return;
	point(showing, started.url, started.pid, "started", started.version, started.controlToken);
}

function point(
	showing: BrowserWindow,
	url: string,
	pid: number,
	verdict: string,
	daemonVersion: string,
	controlToken: string,
): void {
	daemonPort = Number(new URL(url).port);
	daemonControlToken = controlToken;
	log("daemon", verdict, `pid=${pid}`, `v${daemonVersion}`, url);
	// Reopening from the Dock should give back the canvas as it was left, not
	// reload it out from under whatever was on screen.
	if (isDaemonUrl(showing.webContents.getURL())) return;
	void showing.loadURL(url);
}

async function startBundled(): Promise<
	{ url: string; pid: number; version: string; controlToken: string } | undefined
> {
	const cli = bundledCli(process.resourcesPath);
	if (cli === undefined) {
		log("daemon", "FAIL", "no bundled spool");
		tell(
			"This copy of Spool has no daemon in it.",
			"The app carries its own copy of the spool package, and it is not where it should be. Download Spool again from the releases page.",
			"error",
		);
		fallback("Spool could not start", "This copy has no daemon in it. Download it again from the releases page.");
		return undefined;
	}
	// The daemon spawns the agent the person already installed and shells out to
	// the toolchain they already have, and a GUI launch hands this process a PATH
	// that has neither on it. Asked here rather than at boot: an adopted daemon was
	// started from a terminal and already has the answer.
	const path = userPath();
	log("path", path === undefined ? "as launched" : "from the login shell");
	try {
		const status = await daemon.start({
			execPath: process.execPath,
			nodeArgs: ["-r", bundledShim(process.resourcesPath)],
			cli,
			directory: DIRECTORY,
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
		tell("Spool could not start its daemon.", detail, "error");
		fallback("Spool could not start its daemon", `${DIRECTORY}/daemon.log says why.`);
		return undefined;
	}
}

function fallback(heading: string, detail: string): void {
	void window?.loadURL(holdingPage(heading, detail));
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
 * The bar is the page's, not this process's: the preload hands it the three
 * things a page cannot do for itself, and the page having that bridge is also
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
	key: string;
	authored: { w: number; h: number };
	/** Whether it opened on a remembered rect, which its bar says once. */
	restored: boolean;
}

const played = new Map<number, PlayedWindow>();

/**
 * The size to fall back on when the daemon will not say. A refusal here is not
 * worth refusing to play over: a window at a plausible size is recoverable by
 * hand, and the hand's rect is then remembered like any other.
 */
const UNKNOWN_AUTHORED = { w: 1440, h: 900 };

async function openPlayWindow(url: string, request: PlayRequest): Promise<void> {
	const authored =
		daemonControlToken === undefined
			? undefined
			: await daemon.frameGeometry(new URL(url).origin, daemonControlToken, request.project, request.frame);
	if (authored === undefined) log("play", "no geometry", request.project, request.frame ?? "(first)");
	const size = authored ?? UNKNOWN_AUTHORED;

	const key = rectKey(request.project, size.w);
	const stored = readRect(DIRECTORY, key);
	// A rect stored on a display that has since been unplugged is a window
	// nobody can see, so it is not a preference any more.
	const restored = stored !== undefined && rectIsReachable(stored, workAreas());
	const rect = restored && stored !== undefined ? stored : fitRect(size, canvasArea());

	const window_ = new BrowserWindow({
		x: rect.x,
		y: rect.y,
		width: rect.w,
		height: rect.h,
		minWidth: 240,
		minHeight: 200,
		title: request.frame ?? request.project,
		backgroundColor: "#0e0e0e",
		// The bar is spool's, so the title bar is not the OS's. The lights are
		// still the OS's and are placed to sit centred in a 30px strip.
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: Math.round((BAR_PX - 12) / 2) },
		webPreferences: {
			spellcheck: false,
			preload: join(__dirname, "play-preload.js"),
		},
	});
	const id = window_.webContents.id;
	played.set(id, { key, authored: size, restored });
	guard(window_);

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
	window_.on("move", settle);
	window_.on("resize", settle);
	window_.on("close", () => {
		if (settling !== undefined) clearTimeout(settling);
		remember();
	});
	window_.on("closed", () => played.delete(id));

	log("play", request.project, request.frame ?? "(first)", `${rect.w}x${rect.h}`, restored ? "restored" : "authored");
	void window_.loadURL(url);
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
	ipcMain.on("spool:play-window-reset", (event) => {
		const window_ = BrowserWindow.fromWebContents(event.sender);
		const state = played.get(event.sender.id);
		if (window_ === null || state === undefined) return;
		state.restored = false;
		writeRect(DIRECTORY, state.key, undefined);
		const fit = fitRect(state.authored, areaOf(window_));
		window_.setBounds({ x: fit.x, y: fit.y, width: fit.w, height: fit.h });
	});
	ipcMain.on("spool:play-window-canvas", (event) => {
		if (!played.has(event.sender.id)) return;
		void openCanvas();
		BrowserWindow.fromWebContents(event.sender)?.close();
	});
	ipcMain.on("spool:play-window-close", (event) => {
		if (!played.has(event.sender.id)) return;
		BrowserWindow.fromWebContents(event.sender)?.close();
	});
}

// MARK: - Menus

export function buildAppMenu(): Menu {
	const template: MenuItemConstructorOptions[] = [
		{
			role: "appMenu",
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ label: "Check for Updates…", click: () => void checkForUpdates() },
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
				{ label: "Open Canvas", accelerator: "CmdOrCtrl+N", click: () => void openCanvas() },
				{ type: "separator" },
				// Closing the window leaves the app running in the menu bar, which
				// is the whole reason Cmd+W and Cmd+Q are different keys here.
				{ role: "close" },
			],
		},
		{ role: "editMenu" },
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{ role: "windowMenu" },
		{
			role: "help",
			submenu: [
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
		// Disabled on purpose: it is a label, not a thing to click. Which version
		// is running is the first question every bug report answers.
		{ label: `${NAME} ${version()}`, enabled: false },
		downloading === undefined
			? { label: "Check for Updates…", click: () => void checkForUpdates() }
			: { label: `Downloading ${downloading.version}… ${downloading.percent}%`, enabled: false },
		{ type: "separator" },
		{ label: `Quit ${NAME}`, accelerator: "Command+Q", click: () => app.quit() },
	]);
}

function installTray(): void {
	const image = trayImage();
	tray = new Tray(image);
	tray.setToolTip(NAME);
	tray.setContextMenu(buildTrayMenu());
	log("tray", image.isEmpty() ? "FAIL no mark" : "OK");
}

// MARK: - Updates

async function checkForUpdates(): Promise<void> {
	if (checkingForUpdates) return;
	checkingForUpdates = true;
	try {
		const installed = parseVersion(version());
		if (installed === undefined) {
			log("updates", "FAIL", "no version in bundle");
			tell(
				"Spool cannot tell which version it is.",
				"This copy has no version number in it, which usually means it was not packaged by scripts/build.sh. Compare it against the releases page yourself.",
				"warning",
			);
			return;
		}
		let latest: Awaited<ReturnType<typeof latestRelease>>;
		try {
			latest = await latestRelease();
		} catch (error) {
			const detail = error instanceof UpdateCheckError ? error.message : String(error);
			log("updates", "FAIL", detail);
			tell("Spool could not check for updates.", `${detail}\n\nYou have ${formatVersion(installed)}.`, "warning");
			return;
		}
		log("updates", "OK", `installed=${formatVersion(installed)}`, `latest=${formatVersion(latest.version)}`);

		// Not a mismatch test: a local build ahead of the published release is
		// every machine that ever builds this app, and offering it a downgrade
		// would be nonsense.
		if (compareVersions(latest.version, installed) <= 0) {
			tell("Spool is up to date.", `You have ${formatVersion(installed)}, which is the latest release.`, "info");
			return;
		}

		// The packaged, feed-carrying app updates itself; anything else (a local
		// build, a release from before the feed existed) is pointed at the page.
		if (!updaterAvailable()) {
			const answer = await dialog.showMessageBox({
				type: "info",
				message: `Spool ${formatVersion(latest.version)} is available.`,
				detail: `You have ${formatVersion(installed)}. The release page has the download and the checksum to check it against.\n\nUpdating means replacing Spool in your Applications folder, so quit this copy first.`,
				buttons: ["Open Release Page", "Later"],
				defaultId: 0,
				cancelId: 1,
			});
			if (answer.response === 0) void shell.openExternal(latest.page);
			return;
		}

		const answer = await dialog.showMessageBox({
			type: "info",
			message: `Spool ${formatVersion(latest.version)} is available.`,
			detail: `You have ${formatVersion(installed)}. Update downloads in the background and Spool relaunches into it. A daemon this app started is stopped and started again; one the CLI runs is left alone.`,
			buttons: ["Update and Relaunch", "Later"],
			defaultId: 0,
			cancelId: 1,
		});
		if (answer.response !== 0) return;
		await downloadAndRelaunch(latest.version, latest.page);
	} finally {
		checkingForUpdates = false;
	}
}

/**
 * The download, and the exit that swaps the bundle.
 *
 * Nothing here blocks the window, so the progress has to be somewhere a person
 * can see it without a panel in the way: the Dock icon fills, and the menu bar
 * item counts. A hundred megabytes with no sign of movement is the same as a
 * button that did nothing, and that is what this used to be.
 */
async function downloadAndRelaunch(target: Version, page: string): Promise<void> {
	downloading = { version: formatVersion(target), percent: 0 };
	showProgress();
	try {
		await installUpdate(
			(line) => log("updates", line),
			(percent) => {
				if (downloading === undefined) return;
				downloading.percent = percent;
				showProgress();
			},
		);
	} catch (error) {
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "FAIL", detail);
		clearProgress();
		tell(
			"The update did not install.",
			`${detail}\n\nThe release page has the download; replacing Spool in Applications by hand still works.`,
			"warning",
		);
		void shell.openExternal(page);
		return;
	}
	clearProgress();

	// Squirrel replaces the app on quit and relaunches it. The daemon this app
	// started is stopped here, on purpose, before the updater owns the exit:
	// will-quit's own preventDefault path would fight it.
	shuttingDown = true;
	await shutdown();
	log("updates", "relaunching");
	fallback("Updating Spool", `Spool ${formatVersion(target)} is being swapped in, and the app reopens by itself.`);

	// Squirrel's own step is silent when it refuses — an unwritable Applications
	// folder, a bundle whose signature does not match this one's — and what a
	// person sees then is a window that stopped. So the exit is raced against a
	// clock, and a Spool still running after it is one that has to say so and
	// put its daemon back.
	const deadline = setTimeout(() => {
		shuttingDown = false;
		const detail = lastUpdaterError();
		log("updates", "FAIL", "no relaunch", detail ?? "no reason given");
		tell(
			"Spool could not swap itself out.",
			`${detail ?? "The updater staged the new version but macOS did not install it."}\n\nThis usually means Spool is not in Applications, or the copy running was not the one installed there. The release page has the download.`,
			"warning",
		);
		void shell.openExternal(page);
		void openCanvas();
	}, RELAUNCH_DEADLINE_MS);

	try {
		relaunchIntoUpdate();
	} catch (error) {
		clearTimeout(deadline);
		shuttingDown = false;
		log("updates", "FAIL", String(error));
		tell("The update did not install.", String(error), "warning");
		void openCanvas();
	}
}

/** Long enough for Squirrel to unpack and verify a bundle on a slow disk. */
const RELAUNCH_DEADLINE_MS = 90_000;

function showProgress(): void {
	if (downloading === undefined) return;
	window?.setProgressBar(downloading.percent / 100);
	tray?.setContextMenu(buildTrayMenu());
}

function clearProgress(): void {
	downloading = undefined;
	// -1 is how a Dock progress bar is taken away again.
	window?.setProgressBar(-1);
	tray?.setContextMenu(buildTrayMenu());
}

/**
 * One thing to say and a button to dismiss it, and never a modal that blocks the
 * process: a panel the main process is waiting on is a window that stops
 * redrawing and a daemon nobody is watching.
 */
function tell(message: string, detail: string, type: "info" | "warning" | "error"): void {
	void dialog.showMessageBox({ type, message, detail, buttons: ["OK"] });
}

// MARK: - Lifecycle

/**
 * Stop the daemon only if it is still the one this app started. The pid is
 * checked again here rather than trusted from launch: if `spool upgrade`
 * restarted the daemon in between, the thing running is no longer the thing this
 * app started, and stopping it would be a stranger killing a process.
 */
export async function shutdown(): Promise<void> {
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
	log("quit", stopped ? "stopped" : "FAIL did not exit", `pid=${current.pid}`);
}

export function boot(): void {
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

	openLog(DIRECTORY);
	installPlayChannels();
	app.setAboutPanelOptions({ applicationName: NAME, applicationVersion: version(), credits: "MIT" });

	app.on("window-all-closed", () => {
		// Deliberately nothing. Closing the window leaves the app in the menu bar
		// with its daemon running, which is what Cmd+W is for; Cmd+Q is how you
		// mean it.
	});
	app.on("activate", () => void openCanvas());

	app.on("will-quit", (event) => {
		if (shuttingDown) return;
		shuttingDown = true;
		event.preventDefault();
		void shutdown().then(() => app.exit(0));
	});

	void app.whenReady().then(() => {
		log("boot", `pid=${process.pid}`, `v${version()}`, DIRECTORY);
		Menu.setApplicationMenu(buildAppMenu());
		installDockIcon();
		installTray();
		return openCanvas();
	});
}
