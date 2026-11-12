import { contextBridge, ipcRenderer } from "electron";

// The room's window's bridge (spool#265).
//
// The room has no bar and no title bar, and this app, not the page, decides
// whether it is full screen. The page learns one thing: whether it is a window
// just now, so it can leave a strip at its top to drag it by, and that it is in
// the app at all, so it never puts itself full screen as it does in a browser.
// It says two things back: that its slide is drawn, which its window waits for
// before it shows (spool#306), and that the talk is over, when its window goes
// at once, on its slide, before its page is taken down (spool#308).

const WINDOWED = "spool:room-windowed";

const windowed = ipcRenderer.sendSync(WINDOWED) === true;

contextBridge.exposeInMainWorld("spoolRoomWindow", {
	windowed,
	onWindowed: (listener: (windowed: boolean) => void): (() => void) => {
		const handler = (_event: unknown, value: unknown) => listener(value === true);
		ipcRenderer.on(WINDOWED, handler);
		return () => ipcRenderer.removeListener(WINDOWED, handler);
	},
	drawn: () => ipcRenderer.send("spool:room-drawn"),
	close: () => ipcRenderer.send("spool:room-close"),
});
