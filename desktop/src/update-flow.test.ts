import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { MenuItemConstructorOptions, MessageBoxOptions } from "electron";
import type { InstallProgress } from "./updates";

const require_ = createRequire(__filename);
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const noop = () => {};
const ipc = Object.assign(new EventEmitter(), { handle: noop });
const app = Object.assign(new EventEmitter(), {
	isPackaged: true,
	getVersion: () => "0.20.1",
	getPath: () => directory,
	setPath: noop,
	setName: noop,
	requestSingleInstanceLock: () => true,
	setAboutPanelOptions: noop,
	isInApplicationsFolder: () => true,
	whenReady: async () => {},
	quit: () => {
		let prevented = false;
		app.emit("will-quit", {
			preventDefault: () => {
				prevented = true;
			},
		});
		if (!prevented) quits++;
	},
	exit: () => {
		exits++;
	},
});
class Window extends EventEmitter {
	static getFocusedWindow = () => undefined;
	webContents = Object.assign(new EventEmitter(), {
		setWindowOpenHandler: noop,
		getURL: () => "http://localhost:7777",
		send: (...args: unknown[]) => sent.push(args),
	});
	show = noop;
	focus = noop;
	loadURL = async () => {};
}
const image = { addRepresentation: noop, setTemplateImage: noop, isEmpty: () => false };
const electron = {
	app,
	ipcMain: ipc,
	BrowserWindow: Window,
	Menu: { buildFromTemplate: (items: MenuItemConstructorOptions[]) => ({ items }), setApplicationMenu: noop },
	nativeImage: { createEmpty: () => image },
	session: { defaultSession: { setPermissionRequestHandler: noop, setPermissionCheckHandler: noop } },
	Tray: class {
		setToolTip = noop;
		setContextMenu = noop;
	},
	dialog: {
		showMessageBox: async (options: MessageBoxOptions) => {
			dialogs.push(options);
			return dialogResponse === undefined ? { response } : dialogResponse;
		},
	},
};
let directory: string;
let api: typeof import("./main");
let dialogs: MessageBoxOptions[];
let sent: unknown[][];
let response: number;
let dialogResponse: Promise<{ response: number }> | undefined;
let newer: boolean;
let downloads: number;
let checks: number;
let restarts: number;
let quits: number;
let exits: number;
let finish: (version: string) => void;
let fail: (error: Error) => void;
let cache: { latest: string; checkedAt: string } | undefined;

function replace(id: string, exports: unknown): void {
	require_.cache[require_.resolve(id)] = { exports } as NodeJS.Module;
}

beforeEach(async () => {
	directory = mkdtempSync(join(tmpdir(), "spool-update-flow-"));
	dialogs = [];
	sent = [];
	response = 1;
	dialogResponse = undefined;
	newer = true;
	downloads = 0;
	checks = 0;
	restarts = 0;
	quits = 0;
	exits = 0;
	cache = undefined;
	app.removeAllListeners();
	ipc.removeAllListeners();
	mock.timers.enable({ apis: ["setTimeout"] });
	replace("electron", electron);
	delete require_.cache[require_.resolve("./updates")];
	const updates = require_("./updates") as typeof import("./updates");
	replace("./updates", {
		...updates,
		updaterAvailable: () => true,
		readCheckCache: () => cache,
		checkForUpdate: async () => {
			checks++;
			return { latest: "0.20.2", newer };
		},
		installUpdate: async (_report: unknown, progress: (state: InstallProgress) => void) => {
			downloads++;
			progress({ kind: "downloading", version: "0.20.2", percent: 20 });
			return new Promise<string>((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
		},
		relaunchIntoUpdate: () => {
			restarts++;
		},
	});
	delete require_.cache[require_.resolve("./daemon")];
	const daemon = require_("./daemon") as typeof import("./daemon");
	replace("./daemon", {
		...daemon,
		stateDirectory: () => directory,
		status: async () => ({
			running: true,
			pid: 123,
			version: "0.20.1",
			url: "http://localhost:7777",
			controlToken: "test",
		}),
	});
	delete require_.cache[require_.resolve("./main")];
	api = require_("./main") as typeof import("./main");
});
afterEach(() => {
	mock.timers.reset();
	rmSync(directory, { recursive: true, force: true });
});

function click(label: string): void {
	const menu = api.buildTrayMenu();
	const item = menu.items.find((item) => item.label === label);
	assert.ok(item, `missing menu item: ${label}`);
	item.click();
}

test("automatic updates prepare silently and Later preserves the ready update", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	assert.equal(downloads, 1);
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	const event = { returnValue: undefined };
	ipc.emit("spool:app-update-state", event);
	assert.equal(event.returnValue, null);
	assert.deepEqual(sent, []);
	finish("0.20.2");
	await turn();
	assert.deepEqual(dialogs[0]?.buttons, ["Restart Spool", "Later"]);
	assert.equal(restarts, 0);
	click("Restart Spool to Update…");
	await turn();
	assert.equal(downloads, 1);
	assert.equal(dialogs.length, 2);
	app.quit();
	await turn();
	assert.equal(quits, 1);
	assert.equal(exits, 0);
});

test("manual checks prepare immediately but restart only after the ready dialog", async () => {
	click("Check for Updates…");
	await turn();
	assert.equal(downloads, 1);
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	response = 0;
	finish("0.20.2");
	await turn();
	assert.equal(restarts, 1);
});

test("a cached newer release is prepared without waiting another day", async () => {
	cache = { latest: "0.20.2", checkedAt: new Date().toISOString() };
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	assert.equal(checks, 1);
	assert.equal(downloads, 1);
	finish("0.20.2");
	await turn();
});

test("background failures do not interrupt work and can retry on the next daily check", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	fail(new Error("offline"));
	await turn();
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	mock.timers.tick(24 * 60 * 60 * 1000);
	await turn();
	assert.equal(downloads, 2);
	finish("0.20.2");
	await turn();
});

test("an up-to-date manual check answers without downloading", async () => {
	newer = false;
	click("Check for Updates…");
	await turn();
	assert.equal(downloads, 0);
	assert.equal(dialogs[0]?.message, "Spool is up to date.");
});

test("manual preparation failures explain the problem without restarting", async () => {
	click("Check for Updates…");
	await turn();
	fail(new Error("offline"));
	await turn();
	assert.equal(dialogs[0]?.message, "Spool could not prepare the update.");
	assert.match(dialogs[0]?.detail ?? "", /offline/);
	assert.equal(restarts, 0);
});

test("repeated restart actions share one dialog and never download again", async () => {
	click("Check for Updates…");
	await turn();
	let answer: (value: { response: number }) => void = noop;
	dialogResponse = new Promise((resolve) => {
		answer = resolve;
	});
	finish("0.20.2");
	await turn();
	click("Restart Spool to Update…");
	click("Restart Spool to Update…");
	await turn();
	assert.equal(dialogs.length, 1);
	assert.equal(downloads, 1);
	answer({ response: 1 });
	await turn();
	assert.equal(restarts, 0);
});

test("quitting during preparation never opens a late restart dialog", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	app.quit();
	await turn();
	finish("0.20.2");
	await turn();
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	assert.equal(quits, 1);
});
