import { contextBridge, ipcRenderer } from "electron";
import type { CanvasCommand } from "./main";

// The canvas window's bridge.
//
// The daemon's page already has an update toast, for the npm package the daemon
// runs. Inside this app there is a second thing that can be out of date, the app
// itself, and it is this process that knows, downloads and relaunches. So the
// page is told, through the same kind of bridge the play window has, and draws
// the app's update in the pill it already owns rather than this process drawing
// a second one beside the canvas.
//
// Native window commands have their own bridge below. A newer daemon can be
// adopted by an older app, so extending the window must not invalidate that
// app's update bridge.

const STATE = "spool:app-update-state";
const CHANGED = "spool:app-update-changed";
const INSTALL = "spool:app-update-install";
const DISMISS = "spool:app-update-dismiss";

// Asked once, before the page runs, so a page loaded while a download is under
// way does not paint without the pill and then twitch it in.
const state: unknown = ipcRenderer.sendSync(STATE);
let fullscreen = ipcRenderer.sendSync("spool:canvas-fullscreen") === true;
const markWindow = () => {
	if (document.documentElement === null) return;
	document.documentElement.setAttribute("data-desktop", "");
	document.documentElement.setAttribute("data-window-fullscreen", String(fullscreen));
};
window.addEventListener("DOMContentLoaded", markWindow, { once: true });
ipcRenderer.on("spool:canvas-fullscreen", (_event, value: boolean) => {
	fullscreen = value;
	markWindow();
});

contextBridge.exposeInMainWorld("spoolApp", {
	version: ipcRenderer.sendSync("spool:app-version") as string,
	update: state,
	onUpdate: (listener: (state: unknown) => void): (() => void) => {
		const handler = (_event: unknown, next: unknown) => listener(next);
		ipcRenderer.on(CHANGED, handler);
		return () => ipcRenderer.removeListener(CHANGED, handler);
	},
	install: () => ipcRenderer.send(INSTALL),
	dismiss: () => ipcRenderer.send(DISMISS),
});

contextBridge.exposeInMainWorld("spoolCanvasWindow", {
	onCommand: (listener: (command: CanvasCommand) => void): (() => void) => {
		const handler = (_event: unknown, command: CanvasCommand) => listener(command);
		ipcRenderer.on("spool:canvas-command", handler);
		return () => ipcRenderer.removeListener("spool:canvas-command", handler);
	},
	setCanvasActive: (active: boolean) => ipcRenderer.send("spool:canvas-active", active),
});
