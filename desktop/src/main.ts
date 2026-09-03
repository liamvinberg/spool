import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
	CHECK_INTERVAL_MS,
	checkCachePath,
	checkForUpdate,
	DOWNLOAD_URL,
	installUpdate,
	lastUpdaterError,
	latestRelease,
	nextCheckDelay,
	RELEASES_PAGE,
	type Release,
	readCheckCache,
	relaunchIntoUpdate,
	UpdateCheckError,
	updaterAvailable,
} from "./updates";
import { compareVersions, formatVersion, parseVersion } from "./version";

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
/** The daemon the window is on: whose it is and which version, for the tray. */
let daemonInfo: { version: string; adopted: boolean } | undefined;
let shuttingDown = false;

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
		webPreferences: { spellcheck: false, preload: join(__dirname, "canvas-preload.js") },
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
		void showing.loadURL(
			holdingPage("Updating Spool", `The daemon was on ${current.version}. This copy carries ${version()}.`),
		);
		const stopped = await daemon.stop(current.pid);
		if (!stopped) {
			log("daemon", "FAIL did not exit", `pid=${current.pid}`, "adopting it as it is");
			point(showing, current.url, current.pid, "adopted", current.version, current.controlToken);
			return;
		}
	} else {
		void showing.loadURL(holdingPage("Starting Spool", "The canvas opens as soon as the daemon answers."));
	}
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
	daemonInfo = { version: daemonVersion, adopted: verdict === "adopted" };
	tray?.setContextMenu(buildTrayMenu());
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
		// Disabled on purpose: these are labels, not things to click. Which
		// version is running is the first question every bug report answers, and
		// an adopted daemon on another version is the second: the app can be
		// updated and the canvas still be the cli's, and this is where that is said.
		{ label: `${NAME} ${version()}`, enabled: false },
		...(daemonInfo?.adopted && daemonInfo.version !== version()
			? [{ label: `daemon ${daemonInfo.version}, started by the cli`, enabled: false }]
			: []),
		updateItem(),
		{ type: "separator" },
		{ label: `Quit ${NAME}`, accelerator: "Command+Q", click: () => app.quit() },
	]);
}

/** The update as one tray line: an offer to take, a download to watch, a failure to read. */
function updateItem(): MenuItemConstructorOptions {
	if (update === null) return { label: "Check for Updates…", click: () => void checkForUpdates() };
	switch (update.kind) {
		case "offer": {
			const { version: target } = update;
			return { label: `Update to ${target}…`, click: () => void downloadAndRelaunch(target) };
		}
		case "downloading":
			return { label: `Downloading ${update.version}… ${update.percent}%`, enabled: false };
		case "restarting":
			return { label: `Restarting into ${update.version}…`, enabled: false };
		case "failed":
			return { label: `Download Spool ${update.version}…`, click: () => void shell.openExternal(DOWNLOAD_URL) };
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
 * What the app knows about its own next version, as one value the tray, the
 * Dock and the canvas all draw from. null is nothing to say.
 */
type AppUpdate =
	| { kind: "offer"; version: string }
	| { kind: "downloading"; version: string; percent: number }
	| { kind: "restarting"; version: string }
	| { kind: "failed"; version: string; message: string };

let update: AppUpdate | null = null;
/** A check or a download in flight, so a second click does not stack one. */
let busy = false;
/** The next automatic check, so a manual one can push it out a day. */
let nextCheck: NodeJS.Timeout | undefined;

/** Every surface at once: the pill in the canvas, the tray, the Dock. */
function setUpdate(next: AppUpdate | null): void {
	update = next;
	window?.webContents.send("spool:app-update-changed", next);
	window?.setProgressBar(next?.kind === "downloading" ? next.percent / 100 : -1);
	tray?.setContextMenu(buildTrayMenu());
}

/**
 * The page's side of the bridge. The state is answered synchronously because
 * the preload asks before the page runs; the two verbs are refused from any
 * window that is not the canvas, which is the only one carrying the preload.
 */
function installUpdateChannels(): void {
	ipcMain.on("spool:app-version", (event) => {
		event.returnValue = version();
	});
	ipcMain.on("spool:app-update-state", (event) => {
		event.returnValue = update;
	});
	ipcMain.on("spool:app-update-install", (event) => {
		if (window === undefined || event.sender.id !== window.webContents.id) return;
		if (update?.kind !== "offer") return;
		void downloadAndRelaunch(update.version);
	});
	ipcMain.on("spool:app-update-dismiss", (event) => {
		if (window === undefined || event.sender.id !== window.webContents.id) return;
		if (update?.kind === "downloading" || update?.kind === "restarting") return;
		setUpdate(null);
	});
}

/**
 * The clock. A packaged app asks the feed ten seconds after launch, unless it
 * asked within the day, and daily after that. A newer release becomes an offer
 * and nothing more: no dialog, no download, a pill in the canvas and a line in
 * the tray until somebody says yes.
 */
function scheduleChecks(): void {
	if (!updaterAvailable()) return;
	const cache = readCheckCache(DIRECTORY);
	const installed = parseVersion(version());
	// A cached answer that is already newer than this copy is an offer that
	// costs no network at all.
	const cached = cache === undefined ? undefined : parseVersion(cache.latest);
	if (installed !== undefined && cached !== undefined && compareVersions(cached, installed) > 0 && update === null) {
		setUpdate({ kind: "offer", version: formatVersion(cached) });
	}
	scheduleCheckIn(nextCheckDelay(cache));
}

function scheduleCheckIn(delay: number): void {
	if (nextCheck !== undefined) clearTimeout(nextCheck);
	nextCheck = setTimeout(() => {
		nextCheck = undefined;
		void automaticCheck().finally(() => scheduleCheckIn(CHECK_INTERVAL_MS));
	}, delay);
	nextCheck.unref();
}

async function automaticCheck(): Promise<void> {
	if (busy || update !== null) return;
	busy = true;
	try {
		const found = await checkForUpdate((line) => log("updates", line));
		rememberCheck(found.latest);
		log("updates", "OK", `installed=${version()}`, `latest=${found.latest}`, found.newer ? "offer" : "current");
		if (found.newer) setUpdate({ kind: "offer", version: found.latest });
	} catch (error) {
		// Offline is a normal day. The check can only ever add a pill.
		log("updates", "skip", error instanceof UpdateCheckError ? error.message : String(error));
	} finally {
		busy = false;
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
	if (busy) return;
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

	// A copy with no feed, which is every checkout build, can only be pointed
	// at the download. It still gets told whether there is one.
	if (!updaterAvailable()) {
		let latest: Release;
		try {
			latest = await latestRelease();
		} catch (error) {
			const detail = error instanceof UpdateCheckError ? error.message : String(error);
			log("updates", "FAIL", detail);
			tell("Spool could not check for updates.", `${detail}\n\nYou have ${formatVersion(installed)}.`, "warning");
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
			tell("Spool is up to date.", `You have ${formatVersion(installed)}, which is the latest release.`, "info");
			return;
		}
		const answer = await dialog.showMessageBox({
			type: "info",
			message: `Spool ${formatVersion(latest.version)} is available.`,
			detail: `You have ${formatVersion(installed)}. This copy was built from a checkout, so it cannot replace itself: Download starts the dmg, and replacing Spool in Applications by hand is the rest.`,
			buttons: ["Download", "Later"],
			defaultId: 0,
			cancelId: 1,
		});
		if (answer.response === 0) void shell.openExternal(DOWNLOAD_URL);
		return;
	}

	busy = true;
	let found: Awaited<ReturnType<typeof checkForUpdate>>;
	try {
		found = await checkForUpdate((line) => log("updates", line));
	} catch (error) {
		busy = false;
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "FAIL", detail);
		tell("Spool could not check for updates.", `${detail}\n\nYou have ${formatVersion(installed)}.`, "warning");
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
		tell("Spool is up to date.", `You have ${formatVersion(installed)}, which is the latest release.`, "info");
		return;
	}

	const answer = await dialog.showMessageBox({
		type: "info",
		message: `Spool ${found.latest} is available.`,
		detail: `You have ${formatVersion(installed)}. Update downloads in the background and Spool relaunches into it. A daemon this app started is stopped and started again; one the CLI runs is left alone.`,
		buttons: ["Update and Relaunch", "Later"],
		defaultId: 0,
		cancelId: 1,
	});
	if (answer.response !== 0) {
		setUpdate({ kind: "offer", version: found.latest });
		return;
	}
	await downloadAndRelaunch(found.latest);
}

/**
 * Whether Squirrel can replace this bundle at all. It cannot from a mounted dmg
 * or a Gatekeeper-translocated copy, and it says so only after the download,
 * so the reason is given first and the download never starts.
 */
function whyNotInstallable(): string | undefined {
	if (process.platform !== "darwin" || !app.isPackaged || LANE) return undefined;
	if (process.execPath.includes("/AppTranslocation/")) {
		return "Spool is running from a quarantined copy, which macOS does not let it replace. Move Spool to Applications and open it from there.";
	}
	if (!app.isInApplicationsFolder()) {
		return "Spool is not in the Applications folder, so macOS will not let it replace itself. Move it there and open it again.";
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
		message: "Move Spool to the Applications folder?",
		detail:
			"Spool runs from anywhere, but it can only update itself from Applications. Moving it takes a moment and opens it again from there.",
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
 * The download, and the exit that swaps the bundle.
 *
 * Nothing here blocks the window, so the progress has to be somewhere a person
 * can see it without a panel in the way: the pill in the canvas counts, the
 * Dock icon fills, and the tray item says the same. A hundred megabytes with no
 * sign of movement is the same as a button that did nothing.
 *
 * The daemon is stopped and the window blanked only once Squirrel has said the
 * bundle is verified and ready. Everything that can go wrong with the download
 * or the bundle arrives before that as a rejection, and the person is still
 * looking at a working canvas when it does.
 */
async function downloadAndRelaunch(target: string): Promise<void> {
	if (busy) return;
	const refusal = whyNotInstallable();
	if (refusal !== undefined) {
		log("updates", "FAIL", refusal);
		setUpdate({ kind: "failed", version: target, message: refusal });
		tell(
			"Spool cannot update itself from here.",
			`${refusal}\n\nDownload starts the dmg, which is the other way onto ${target}.`,
			"warning",
		);
		return;
	}
	busy = true;
	setUpdate({ kind: "downloading", version: target, percent: 0 });
	try {
		await installUpdate(
			(line) => log("updates", line),
			(percent) => setUpdate({ kind: "downloading", version: target, percent }),
		);
	} catch (error) {
		busy = false;
		const detail = error instanceof UpdateCheckError ? error.message : String(error);
		log("updates", "FAIL", detail);
		setUpdate({ kind: "failed", version: target, message: detail });
		return;
	}
	busy = false;

	// Squirrel replaces the app on quit and relaunches it. The daemon this app
	// started is stopped here, on purpose, before the updater owns the exit:
	// will-quit's own preventDefault path would fight it.
	setUpdate({ kind: "restarting", version: target });
	shuttingDown = true;
	await shutdown();
	log("updates", "relaunching");
	fallback("Updating Spool", `Spool ${target} is being swapped in, and the app reopens by itself.`);

	// Squirrel has already said yes, so the quit that follows is immediate. A
	// Spool still running after this clock is one whose exit was refused by
	// something in this process, and it has to say so and put its daemon back.
	const deadline = setTimeout(() => {
		shuttingDown = false;
		const detail = lastUpdaterError() ?? "The updater staged the new version but the app did not quit into it.";
		log("updates", "FAIL", "no relaunch", detail);
		setUpdate({ kind: "failed", version: target, message: detail });
		void openCanvas();
	}, RELAUNCH_DEADLINE_MS);

	try {
		relaunchIntoUpdate();
	} catch (error) {
		clearTimeout(deadline);
		shuttingDown = false;
		log("updates", "FAIL", String(error));
		setUpdate({ kind: "failed", version: target, message: String(error) });
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
	installUpdateChannels();
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

	void app.whenReady().then(async () => {
		log("boot", `pid=${process.pid}`, `v${version()}`, DIRECTORY);
		await offerApplicationsFolder();
		Menu.setApplicationMenu(buildAppMenu());
		installDockIcon();
		installTray();
		scheduleChecks();
		return openCanvas();
	});
}
