import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DirectoryRequest } from "./directory-dialog";
import type { CanvasCommand } from "./main";
import type { ExportDownloadResult, ProjectDownloadResult } from "./project-download";
import type { RoomReport } from "./room-window";

// The canvas window's bridge.
//
// The marker suppresses the daemon's npm update offer; only verified app updates are offered.

const STATE = "spool:app-update-state";
const CHANGED = "spool:app-update-changed";
const INSTALL = "spool:app-update-install";
const DISMISS = "spool:app-update-dismiss";

// Read before the page runs so the desktop bridge is available at first paint.
const state: unknown = ipcRenderer.sendSync(STATE);
// on another machine's daemon a path on this Mac means nothing there, so the page gets a browser tab's open and drop
const local = ipcRenderer.sendSync("spool:canvas-remote") !== true;
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
	ready: () => ipcRenderer.send("spool:canvas-ready"),
	reload: (): Promise<void> => ipcRenderer.invoke("spool:canvas-reload"),
	onPrepareUpdate: (listener: (localOnly: boolean) => Promise<void>): (() => void) => {
		const handler = async (_event: unknown, id: number, localOnly: boolean) => {
			try {
				await listener(localOnly);
				ipcRenderer.send("spool:canvas-saved", id, null);
			} catch (error) {
				ipcRenderer.send(
					"spool:canvas-saved",
					id,
					error instanceof Error ? error.message : "Could not save the canvas.",
				);
			}
		};
		ipcRenderer.on("spool:canvas-save", handler);
		return () => ipcRenderer.removeListener("spool:canvas-save", handler);
	},
});

contextBridge.exposeInMainWorld("spoolCanvasWindow", {
	onProjectDownload: (listener: (result: ProjectDownloadResult) => void): (() => void) => {
		const handler = (_event: unknown, result: ProjectDownloadResult) => listener(result);
		ipcRenderer.on("spool:project-download", handler);
		return () => ipcRenderer.removeListener("spool:project-download", handler);
	},
	// a frame export (.png, .pdf, .html) saved straight to Downloads, or why it was not
	onExportDownload: (listener: (result: ExportDownloadResult) => void): (() => void) => {
		const handler = (_event: unknown, result: ExportDownloadResult) => listener(result);
		ipcRenderer.on("spool:export-download", handler);
		return () => ipcRenderer.removeListener("spool:export-download", handler);
	},
	// shows a file this app saved in Finder; false for any other path
	revealDownload: (path: string): Promise<boolean> => ipcRenderer.invoke("spool:reveal-download", path),
	onCommand: (listener: (command: CanvasCommand) => void): (() => void) => {
		const handler = (_event: unknown, command: CanvasCommand) => listener(command);
		ipcRenderer.on("spool:canvas-command", handler);
		return () => ipcRenderer.removeListener("spool:canvas-command", handler);
	},
	setCanvasActive: (active: boolean) => ipcRenderer.send("spool:canvas-active", active),
	// play in the app's own window, at the size the canvas already has for the frame (spool#301)
	play: (path: string, size: { w: number; h: number }) => ipcRenderer.send("spool:play", path, size),
	setMenuKeys: (keys: Partial<Record<CanvasCommand, string>>) => ipcRenderer.send("spool:canvas-menu-keys", keys),
	closeWindow: () => ipcRenderer.send("spool:canvas-close-window"),
	// a presented talk's room: which screen it is on, by name, and X trading the two screens (spool#265)
	onRoom: (listener: (report: RoomReport) => void): (() => void) => {
		const handler = (_event: unknown, report: RoomReport) => listener(report);
		ipcRenderer.on("spool:room", handler);
		return () => ipcRenderer.removeListener("spool:room", handler);
	},
	roomReport: (talk: string): Promise<RoomReport | null> => ipcRenderer.invoke("spool:room-report", talk),
	swapRoom: (talk: string) => ipcRenderer.send("spool:room-swap", talk),
	showRoom: (talk: string) => ipcRenderer.send("spool:room-show", talk),
	// a talk's slides filling this screen (spool#298): how many displays there are, and the window over its display
	displays: (): number => ipcRenderer.sendSync("spool:displays") as number,
	presentFullScreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke("spool:present-full-screen", on),
	// the first run's small window, and its growing into spool's (spool#250)
	setupWindow: (size: "grow" | { w: number; h: number }): Promise<boolean> =>
		ipcRenderer.invoke("spool:setup-window", size),
	...(local
		? {
				// a document Finder handed the app, for the canvas's Open… to read
				onOpenPath: (listener: (path: string) => void): (() => void) => {
					const handler = (_event: unknown, path: string) => listener(path);
					ipcRenderer.on("spool:canvas-open-path", handler);
					return () => ipcRenderer.removeListener("spool:canvas-open-path", handler);
				},
				chooseDirectory: (request: DirectoryRequest): Promise<string | null> =>
					ipcRenderer.invoke("spool:choose-directory", request),
				// where a file or folder dropped on the window lies, which a page is never told
				pathForFile: (file: File): string => webUtils.getPathForFile(file),
			}
		: {}),
});
