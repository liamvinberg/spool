import { contextBridge, ipcRenderer } from "electron";

// The play window's bridge (#275).
//
// This window has no title bar of its own, so the page draws the bar — and a
// bar drawn by the page needs the three things only the window's owner can do:
// raise the canvas standing behind it, put the window back on the frame's
// authored size, and close. They arrive as four fields on `window` and nothing
// more; no ipcRenderer, no channel names, nothing a played frame could reach
// through to reach the main process.
//
// The bridge existing at all is also the signal. The player looks for it to
// decide which chrome it is in, which is why a browser tab needs no flag, no
// query parameter and no change to the served document: there is no bridge
// there, so there is the edge bar there.

const RESTORED = "spool:play-window-restored";
const RESET = "spool:play-window-reset";
const CANVAS = "spool:play-window-canvas";
const CLOSE = "spool:play-window-close";

// Asked once, before the page loads, because the bar wants it at first paint: a
// restore that announces itself a beat late reads as the window twitching.
// Synchronous by necessity — a sandboxed preload has no argv to read it off.
const restored = ipcRenderer.sendSync(RESTORED) === true;

contextBridge.exposeInMainWorld("spoolPlayWindow", {
	restored,
	reset: () => ipcRenderer.send(RESET),
	canvas: () => ipcRenderer.send(CANVAS),
	close: () => ipcRenderer.send(CLOSE),
});
