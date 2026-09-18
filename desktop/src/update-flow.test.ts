import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { MenuItemConstructorOptions, MessageBoxOptions } from "electron";
import { beginUpdateRestart, updateRestartState } from "./update-restart";
import type { InstallProgress } from "./updates";

const require_ = createRequire(__filename);
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const noop = () => {};
const handlers = new Map<string, (event: ReturnType<typeof sender>) => Promise<void>>();
const ipc = Object.assign(new EventEmitter(), {
	handle: (name: string, handler: (event: ReturnType<typeof sender>) => Promise<void>) => handlers.set(name, handler),
});
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
		const before = {
			preventDefault: () => {
				prevented = true;
			},
		};
		app.emit("before-quit", before);
		if (prevented) return;
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
let progressWindows = 0;
let canvas: Window | undefined;
let saveError: string | null = null;
let saveReplies = true;
let reloads = 0;
let coversClosed = 0;
class Window extends EventEmitter {
	isDestroyed = () => false;
	constructor(options: { title?: string }) {
		super();
		if (options.title === "Spool update") progressWindows++;
		else {
			canvas = this;
			queueMicrotask(() => ipc.emit("spool:canvas-ready", sender()));
		}
	}
	static getFocusedWindow = () => undefined;
	webContents = Object.assign(new EventEmitter(), {
		setWindowOpenHandler: noop,
		getURL: () => "http://localhost:7777/p/example",
		mainFrame: {},
		reload: () => {
			reloads++;
		},
		send: (...args: unknown[]) => {
			sent.push(args);
			if (args[0] === "spool:canvas-save" && saveReplies)
				ipc.emit("spool:canvas-saved", sender(), args[1], saveError);
		},
		executeJavaScript: async () => {},
	});
	close = () => this.emit("closed");
	show = noop;
	focus = noop;
	loadURL = async () => {};
}
function sender() {
	return { sender: canvas?.webContents, senderFrame: canvas?.webContents.mainFrame };
}
const image = { addRepresentation: noop, setTemplateImage: noop, isEmpty: () => false };
const electron = {
	app,
	ipcMain: ipc,
	BrowserWindow: Window,
	Menu: {
		getApplicationMenu: () => null,
		buildFromTemplate: (items: MenuItemConstructorOptions[]) => ({ items }),
		setApplicationMenu: noop,
	},
	nativeImage: { createEmpty: () => image },
	session: { defaultSession: { on: noop, setPermissionRequestHandler: noop, setPermissionCheckHandler: noop } },
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
let statusCalls = 0;
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
	progressWindows = 0;
	reloads = 0;
	coversClosed = 0;
	handlers.clear();
	canvas = undefined;
	saveError = null;
	saveReplies = true;
	replace("./update-cover", {
		UpdateCover: class {
			enter = async () => {};
			reveal = async () => {
				coversClosed++;
			};
			close = () => {
				coversClosed++;
			};
		},
	});
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
		status: async () => {
			statusCalls++;
			return {
				running: true,
				pid: 123,
				version: "0.20.1",
				url: "http://localhost:7777",
				controlToken: "test",
			};
		},
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
	assert.equal(progressWindows, 0);
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	const event = { returnValue: undefined };
	ipc.emit("spool:app-update-state", event);
	assert.equal(event.returnValue, null);
	assert.deepEqual(sent, []);
	finish("0.20.2");
	await turn();
	assert.equal(dialogs.length, 0);
	assert.deepEqual(sent.at(-1), ["spool:app-update-changed", { kind: "ready", version: "0.20.2" }]);
	assert.equal(restarts, 0);
	click("Restart Spool to Update…");
	await turn();
	assert.equal(downloads, 1);
	assert.equal(dialogs.length, 1);
	app.quit();
	await turn();
	assert.equal(quits, 1);
	assert.equal(updateRestartState(directory, "0.20.1"), "waiting");
	assert.equal(exits, 0);
});

test("manual checks prepare immediately but restart only after the ready dialog", async () => {
	click("Check for Updates…");
	assert.equal(progressWindows, 1);
	await turn();
	assert.equal(downloads, 1);
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	response = 0;
	finish("0.20.2");
	await turn();
	assert.equal(restarts, 1);
});

test("a cached newer release is prepared without waiting another hour", async () => {
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

test("retryable background failures retry after five minutes without interrupting work", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	const { UpdateCheckError } = require_("./updates") as typeof import("./updates");
	fail(new UpdateCheckError("offline"));
	await turn();
	assert.equal(dialogs.length, 0);
	assert.equal(restarts, 0);
	mock.timers.tick(5 * 60 * 1000);
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

for (const event of ["activate", "second-instance"]) {
	test(`reopening during restart does not enter the old canvas: ${event}`, async () => {
		api.boot();
		await turn();
		click("Check for Updates…");
		await turn();
		response = 0;
		finish("0.20.2");
		await turn();
		assert.equal(restarts, 1);
		const before = statusCalls;
		app.emit(event);
		await turn();
		assert.equal(statusCalls, before);
	});
}

test("a new old-version process exits during the native replacement", async () => {
	beginUpdateRestart(directory, "0.20.2");
	const before = statusCalls;
	api.boot();
	await turn();
	assert.equal(exits, 1);
	assert.equal(statusCalls, before);
	assert.equal(checks, 0);
});

test("a delayed native quit never reopens the old canvas", async () => {
	api.boot();
	await turn();
	click("Check for Updates…");
	await turn();
	response = 0;
	finish("0.20.2");
	await turn();
	const before = statusCalls;
	mock.timers.tick(15_000);
	await turn();
	assert.equal(quits, 1);
	assert.equal(statusCalls, before);
	assert.equal(updateRestartState(directory, "0.20.1"), "waiting");
});

test("dismissal hides the notice but preserves the verified update in the menu", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	finish("0.20.2");
	await turn();
	ipc.emit("spool:app-update-dismiss", sender());
	const event = { ...sender(), returnValue: undefined };
	ipc.emit("spool:app-update-state", event);
	assert.equal(event.returnValue, null);
	assert.deepEqual(sent.at(-1), ["spool:app-update-changed", null]);
	click("Restart Spool to Update…");
	await turn();
	assert.equal(dialogs.length, 1);
	assert.equal(downloads, 1);
});

test("frames cannot dismiss or install an app update", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	finish("0.20.2");
	await turn();
	const frame = { ...sender(), senderFrame: {} };
	ipc.emit("spool:app-update-dismiss", frame);
	ipc.emit("spool:app-update-install", frame);
	await turn();
	assert.equal(restarts, 0);
	const event = { ...sender(), returnValue: undefined };
	ipc.emit("spool:app-update-state", event);
	assert.deepEqual(event.returnValue, { kind: "ready", version: "0.20.2" });
});

test("a save refusal leaves the daemon and verified update available", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	finish("0.20.2");
	await turn();
	saveError = "An unsent draft could not be saved.";
	ipc.emit("spool:app-update-install", sender());
	await turn();
	assert.equal(restarts, 0);
	assert.equal(updateRestartState(directory, "0.20.1"), "none");
	assert.match(dialogs.at(-1)?.detail ?? "", /draft could not be saved/);
	saveError = null;
	ipc.emit("spool:app-update-install", sender());
	await turn();
	assert.equal(restarts, 1);
});

test("a canvas that never acknowledges saving cannot trigger replacement", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	finish("0.20.2");
	await turn();
	saveReplies = false;
	ipc.emit("spool:app-update-install", sender());
	await turn();
	mock.timers.tick(10_000);
	await turn();
	assert.equal(restarts, 0);
	assert.equal(updateRestartState(directory, "0.20.1"), "none");
	assert.match(dialogs.at(-1)?.detail ?? "", /Saving took too long/);
});

test("background preparation does not block a reload and only the canvas can uncover it", async () => {
	api.boot();
	await turn();
	mock.timers.tick(10_000);
	await turn();
	const reload = handlers.get("spool:canvas-reload");
	assert.ok(reload);
	await reload(sender());
	assert.equal(reloads, 1);
	assert.equal(coversClosed, 0);
	ipc.emit("spool:canvas-ready", { ...sender(), senderFrame: {} });
	await turn();
	assert.equal(coversClosed, 0);
	ipc.emit("spool:canvas-ready", sender());
	await turn();
	assert.equal(coversClosed, 1);
	finish("0.20.2");
	await turn();
});

test("another bundle arriving during the cover is refreshed after the reveal", async () => {
	api.boot();
	await turn();
	const reload = handlers.get("spool:canvas-reload");
	assert.ok(reload);
	await reload(sender());
	await reload(sender());
	assert.equal(reloads, 1);
	ipc.emit("spool:canvas-ready", sender());
	await turn();
	assert.equal(reloads, 2);
	ipc.emit("spool:canvas-ready", sender());
	await turn();
	assert.equal(coversClosed, 2);
});

test("a renderer that never becomes ready cannot leave a permanent cover", async () => {
	api.boot();
	await turn();
	const reload = handlers.get("spool:canvas-reload");
	assert.ok(reload);
	await reload(sender());
	mock.timers.tick(30_000);
	await turn();
	assert.equal(coversClosed, 1);
	assert.match(dialogs.at(-1)?.message ?? "", /taking longer/);
});
