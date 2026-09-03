import { contextBridge, ipcRenderer } from "electron";

// The canvas window's bridge.
//
// The daemon's page already has an update toast, for the npm package the daemon
// runs. Inside this app there is a second thing that can be out of date, the app
// itself, and it is this process that knows, downloads and relaunches. So the
// page is told, through the same kind of bridge the play window has, and draws
// the app's update in the pill it already owns rather than this process drawing
// a second one beside the canvas.
//
// Four fields on `window` and nothing more: the state as it stands at load, a
// subscription for how it changes, and the two things a person can do about it.
// No ipcRenderer, no channel names, nothing a frame could reach through.

const STATE = "spool:app-update-state";
const CHANGED = "spool:app-update-changed";
const INSTALL = "spool:app-update-install";
const DISMISS = "spool:app-update-dismiss";

// Asked once, before the page runs, so a page loaded while a download is under
// way does not paint without the pill and then twitch it in.
const state: unknown = ipcRenderer.sendSync(STATE);

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
