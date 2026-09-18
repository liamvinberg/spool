import { contextBridge, ipcRenderer } from "electron";
import type { DirectoryRequest } from "./directory-dialog";
import type { CanvasCommand } from "./main";
import type { ProjectDownloadResult } from "./project-download";

// The canvas window's bridge.
//
// The desktop marker also suppresses the daemon's npm update offer. App updates
// now use native menus and dialogs; the update state returned here is null.

const STATE = "spool:app-update-state";
const CHANGED = "spool:app-update-changed";
const INSTALL = "spool:app-update-install";
const DISMISS = "spool:app-update-dismiss";

// Read before the page runs so the desktop bridge is available at first paint.
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
	onProjectDownload: (listener: (result: ProjectDownloadResult) => void): (() => void) => {
		const handler = (_event: unknown, result: ProjectDownloadResult) => listener(result);
		ipcRenderer.on("spool:project-download", handler);
		return () => ipcRenderer.removeListener("spool:project-download", handler);
	},
	onCommand: (listener: (command: CanvasCommand) => void): (() => void) => {
		const handler = (_event: unknown, command: CanvasCommand) => listener(command);
		ipcRenderer.on("spool:canvas-command", handler);
		return () => ipcRenderer.removeListener("spool:canvas-command", handler);
	},
	setCanvasActive: (active: boolean) => ipcRenderer.send("spool:canvas-active", active),
	chooseDirectory: (request: DirectoryRequest): Promise<string | null> =>
		ipcRenderer.invoke("spool:choose-directory", request),
});
