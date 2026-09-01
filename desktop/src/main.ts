import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, nativeImage, shell, Tray } from "electron";
import * as daemon from "./daemon";
import { log, openLog } from "./log";
import { userPath } from "./path";
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

/** Held only so the tray item is not collected out from under the menu bar. */
let tray: Tray | undefined;
let window: BrowserWindow | undefined;
/** The daemon this app started, if it started one. */
let startedPid: number | undefined;
/** The daemon this window is pointed at, for telling its popups from the web. */
let daemonPort: number | undefined;
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
		title: "Spool",
		backgroundColor: "#0e0e0e",
		webPreferences: { spellcheck: false },
	});

	// A popup the daemon opened is part of spool and gets a window; anything else
	// is the web and belongs in the browser the person already has their tabs in.
	// Loopback and the same port rather than the same origin, because the daemon
	// serves frames and captures from two more hostnames on the one listener.
	created.webContents.setWindowOpenHandler(({ url }) => {
		if (isDaemonUrl(url)) return { action: "allow" };
		void shell.openExternal(url);
		return { action: "deny" };
	});
	created.webContents.on("will-navigate", (event, url) => {
		if (isDaemonUrl(url) || url.startsWith("data:")) return;
		event.preventDefault();
		void shell.openExternal(url);
	});
	created.on("closed", () => {
		if (created === window) window = undefined;
	});

	return created;
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
		point(showing, current.url, current.pid, current.pid === startedPid ? "reused" : "adopted", current.version);
		return;
	}

	void showing.loadURL(holdingPage("Starting Spool", "The canvas opens as soon as the daemon answers."));
	const started = await startBundled();
	if (started === undefined) return;
	point(showing, started.url, started.pid, "started", started.version);
}

function point(showing: BrowserWindow, url: string, pid: number, verdict: string, daemonVersion: string): void {
	daemonPort = Number(new URL(url).port);
	log("daemon", verdict, `pid=${pid}`, `v${daemonVersion}`, url);
	// Reopening from the Dock should give back the canvas as it was left, not
	// reload it out from under whatever was on screen.
	if (isDaemonUrl(showing.webContents.getURL())) return;
	void showing.loadURL(url);
}

async function startBundled(): Promise<{ url: string; pid: number; version: string } | undefined> {
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
		return { url: status.url, pid: status.pid, version: status.version };
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
	for (const [scaleFactor, file] of [
		[1, "markTemplate.png"],
		[2, "markTemplate@2x.png"],
	] as const) {
		try {
			image.addRepresentation({ scaleFactor, buffer: readFileSync(join(__dirname, "..", "assets", file)) });
		} catch {
			// a missing representation is a smaller mark, not a missing app
		}
	}
	image.setTemplateImage(true);
	return image;
}

export function buildTrayMenu(): Menu {
	return Menu.buildFromTemplate([
		{ label: "Open Canvas", click: () => void openCanvas() },
		{ type: "separator" },
		// Disabled on purpose: it is a label, not a thing to click. Which version
		// is running is the first question every bug report answers.
		{ label: `Spool ${version()}`, enabled: false },
		downloading === undefined
			? { label: "Check for Updates…", click: () => void checkForUpdates() }
			: { label: `Downloading ${downloading.version}… ${downloading.percent}%`, enabled: false },
		{ type: "separator" },
		{ label: "Quit Spool", accelerator: "Command+Q", click: () => app.quit() },
	]);
}

function installTray(): void {
	const image = trayImage();
	tray = new Tray(image);
	tray.setToolTip("Spool");
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
	// One app, one daemon. A second launch is somebody asking for the window they
	// already have.
	if (!app.requestSingleInstanceLock()) {
		app.exit(0);
		return;
	}
	app.on("second-instance", () => void openCanvas());

	openLog(DIRECTORY);
	app.setAboutPanelOptions({ applicationName: "Spool", applicationVersion: version(), credits: "MIT" });

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
		installTray();
		return openCanvas();
	});
}
