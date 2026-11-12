import { join } from "node:path";
import { BrowserWindow, type Display, ipcMain, screen, type WebPreferences } from "electron";
import type { WindowRect } from "./play-window";
import {
	carryRect,
	type RoomDisplay,
	type RoomReport,
	roomLost,
	roomPlace,
	roomWindowRect,
	swapPlaces,
} from "./room-window";

// The room's window of a presented talk, as this app makes it (spool#265).
//
// The canvas opens the room with `window.open` on the deck's play address with
// `room=<talk>`. In a browser that is a popup the presenter drags to the
// projector. Here the popup is refused and the window is made: no title bar and
// no bar of ours, covering the display spool's window is not on, or an ordinary
// window when there is only one display. X in the presenter view swaps
// the two screens; unplugging the room's display brings it back as a window. The
// presenter view is told which screen the room is on, by its real name.
//
// What the two windows say to each other about the talk goes over their own
// broadcast channel, never through here: this only places the room's window.

export interface Rooms {
	/** Make the room's window of `talk` at `url`, or show the one already open. */
	open(url: string, talk: string): void;
	/** Close every room: spool's window, the presenter view, is gone. */
	closeAll(): void;
}

export interface RoomsHost {
	/** spool's own window, which is the presenter view while a talk is presented */
	canvas(): BrowserWindow | undefined;
	/** what every window this app makes is allowed to open */
	guard(window: BrowserWindow): void;
	webPreferences: WebPreferences;
	log(...words: string[]): void;
}

interface Room {
	talk: string;
	window: BrowserWindow;
	/** the display it covers, or undefined while it is a window */
	screen: number | undefined;
	/** the display that was unplugged under it, while it is a window because of that */
	unplugged: string | undefined;
}

const ROOM_WINDOWED = "spool:room-windowed";
/** the room's page has drawn its slide: its window may show */
const ROOM_DRAWN = "spool:room-drawn";
/** The longest a room's window is held hidden for its slide to be drawn. */
const ROOM_DRAWN_MS = 3_000;

export function installRooms(host: RoomsHost): Rooms {
	const rooms = new Map<string, Room>();
	const displays = (): RoomDisplay[] => screen.getAllDisplays().map(roomDisplayOf);
	const canvasDisplay = (): number => {
		const canvas = host.canvas();
		return canvas === undefined || canvas.isDestroyed()
			? screen.getPrimaryDisplay().id
			: screen.getDisplayMatching(canvas.getBounds()).id;
	};

	/** spool's window's page, the presenter view, on its display */
	const canvasRect = () => {
		const canvas = host.canvas();
		if (canvas === undefined || canvas.isDestroyed()) return undefined;
		const { x, y, width, height } = canvas.getContentBounds();
		return { x, y, w: width, h: height };
	};

	const report = (room: Room) => {
		const canvas = host.canvas();
		if (canvas === undefined || canvas.isDestroyed()) return;
		canvas.webContents.send("spool:room", reportOf(room));
	};
	const reportOf = (room: Room): RoomReport => {
		const all = displays();
		const on = all.find((display) => display.id === room.screen);
		return {
			talk: room.talk,
			screen: on?.label ?? null,
			swaps: all.length > 1,
			...(room.unplugged === undefined ? {} : { unplugged: room.unplugged }),
		};
	};
	const tellWindowed = (room: Room) => {
		if (!room.window.isDestroyed()) room.window.webContents.send(ROOM_WINDOWED, room.screen === undefined);
	};

	/** Put the room over the whole of `display`, or a window at `rect`, in one step. */
	const place = (room: Room, to: { display: RoomDisplay } | { rect: WindowRect }) => {
		room.screen = "display" in to ? to.display.id : undefined;
		tellWindowed(room);
		report(room);
		if (room.window.isDestroyed()) return;
		if ("display" in to) cover(room.window, to.display.bounds);
		else uncover(room.window, { x: to.rect.x, y: to.rect.y, width: to.rect.w, height: to.rect.h });
	};

	/** the rooms waiting to be shown till their slide is drawn, by their page */
	const drawing = new Map<Electron.WebContents, () => void>();
	/** A room's window shown again, unless it still waits for its slide: then it shows by itself, on the slide. */
	const showAgain = (room: Room) => {
		if (!room.window.isDestroyed() && !drawing.has(room.window.webContents)) room.window.showInactive();
	};

	const open = (url: string, talk: string) => {
		const already = rooms.get(talk);
		if (already !== undefined && !already.window.isDestroyed()) {
			showAgain(already);
			return;
		}
		watchDisplays();
		const where = roomPlace(displays(), canvasDisplay(), canvasRect());
		const rect =
			where.kind === "screen"
				? {
						x: where.display.bounds.x,
						y: where.display.bounds.y,
						w: where.display.bounds.width,
						h: where.display.bounds.height,
					}
				: where.rect;
		const window = new BrowserWindow({
			x: rect.x,
			y: rect.y,
			width: rect.w,
			height: rect.h,
			minWidth: 240,
			minHeight: 135,
			// the slide and nothing else: no title bar, no lights, no bar of spool's; not even the hidden title bar of a
			// frameless window, whose corners macOS rounds and whose top it keeps under the menu bar
			fullscreenable: false,
			frame: false,
			roundedCorners: false,
			show: false,
			backgroundColor: "#000000",
			webPreferences: { ...host.webPreferences, preload: join(__dirname, "room-preload.js") },
		});
		const room: Room = {
			talk,
			window,
			screen: where.kind === "screen" ? where.display.id : undefined,
			unplugged: undefined,
		};
		if (where.kind === "screen") cover(window, where.display.bounds);
		rooms.set(talk, room);
		host.guard(window);
		const page = window.webContents;
		window.on("closed", () => {
			if (rooms.get(talk) === room) rooms.delete(talk);
			drawing.delete(page);
		});
		// hidden until its slide is drawn, so it opens on the slide and never on the black it loads in (spool#306); a
		// room that never says so still gets its window: late, not lost
		const showing = setTimeout(() => reveal(), ROOM_DRAWN_MS);
		const reveal = () => {
			clearTimeout(showing);
			drawing.delete(page);
			if (window.isDestroyed() || window.isVisible()) return;
			// shown without the keys: they stay with the presenter view
			window.showInactive();
		};
		drawing.set(page, reveal);
		host.log("room", talk.slice(0, 6), where.kind === "screen" ? `screen ${where.display.label}` : "window");
		report(room);
		void window.loadURL(url);
	};

	ipcMain.on(ROOM_DRAWN, (event) => {
		if (event.senderFrame === event.sender.mainFrame) drawing.get(event.sender)?.();
	});
	ipcMain.on(ROOM_WINDOWED, (event) => {
		const room = [...rooms.values()].find((one) => one.window.webContents === event.sender);
		event.returnValue = room === undefined ? true : room.screen === undefined;
	});
	const fromCanvas = (sender: Electron.WebContents) => host.canvas()?.webContents === sender;
	ipcMain.handle("spool:room-report", (event, talk: unknown) => {
		if (!fromCanvas(event.sender) || typeof talk !== "string") return null;
		const room = rooms.get(talk);
		return room === undefined || room.window.isDestroyed() ? null : reportOf(room);
	});
	ipcMain.on("spool:room-show", (event, talk: unknown) => {
		if (!fromCanvas(event.sender) || typeof talk !== "string") return;
		const room = rooms.get(talk);
		if (room !== undefined) showAgain(room);
	});
	ipcMain.on("spool:room-swap", (event, talk: unknown) => {
		if (!fromCanvas(event.sender) || typeof talk !== "string") return;
		const room = rooms.get(talk);
		const canvas = host.canvas();
		if (room === undefined || room.window.isDestroyed() || canvas === undefined || canvas.isDestroyed()) return;
		const all = displays();
		const here = canvasDisplay();
		const plan = swapPlaces(all, here, room.screen);
		if (plan === undefined) return;
		host.log("room", talk.slice(0, 6), "swap", plan.room.label);
		room.unplugged = undefined;
		place(room, { display: plan.room });
		const from = all.find((display) => display.id === here);
		const to = plan.canvas;
		if (to !== undefined && from !== undefined) void carry(canvas, from, to);
	});

	// a display that goes mid-talk: the room on it, or on the one spool's window was carried to, is a window again;
	// heard from the first room on, since `screen` answers only once the app is ready
	let watching = false;
	const watchDisplays = () => {
		if (watching) return;
		watching = true;
		screen.on("display-removed", displayRemoved);
		// one plugged in may be swapped to
		screen.on("display-added", () => {
			for (const room of rooms.values()) report(room);
		});
	};
	const displayRemoved = (_event: unknown, gone: Display) => {
		const all = displays();
		const here = canvasDisplay();
		for (const room of rooms.values()) {
			if (room.window.isDestroyed() || room.screen === undefined || !roomLost(all, here, room.screen)) continue;
			host.log("room", room.talk.slice(0, 6), "display gone", gone.label);
			room.unplugged = gone.label || "The room's display";
			const home = all.find((display) => display.id === here) ?? all[0];
			if (home !== undefined) place(room, { rect: roomWindowRect(home.workArea, canvasRect()) });
		}
	};

	return {
		open,
		closeAll() {
			for (const room of rooms.values()) if (!room.window.isDestroyed()) room.window.close();
			rooms.clear();
		},
	};
}

/** What the room's placing reads of a display. */
function roomDisplayOf(display: Display): RoomDisplay {
	return {
		id: display.id,
		label: display.label || (display.internal ? "Built-in Display" : "Display"),
		internal: display.internal,
		bounds: display.bounds,
		workArea: display.workArea,
	};
}

/** spool's window carried to another display, out of full screen and back into it if it was. */
async function carry(window: BrowserWindow, from: RoomDisplay, to: RoomDisplay): Promise<void> {
	const full = window.isFullScreen();
	await setFullScreen(window, false);
	if (window.isDestroyed()) return;
	const bounds = window.getBounds();
	const rect = carryRect({ x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }, from.workArea, to.workArea);
	window.setBounds({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
	if (full) await setFullScreen(window, true);
	refocus(window);
}

/**
 * The room over the whole of a display, at once (spool#308). Not macOS's full screen, which slides the window into a
 * Space of its own and showed the audience the wallpaper on the way: the window takes the display's bounds in one
 * step and stands above the Dock and the menu bar, as Keynote's slides do. Its shadow goes, or it falls on the display
 * beside it.
 */
function cover(window: BrowserWindow, bounds: Electron.Rectangle): void {
	window.setAlwaysOnTop(true, "pop-up-menu");
	window.setHasShadow(false);
	window.setBounds(bounds, false);
}

/** The room as an ordinary window again, at `bounds`, among the other windows. */
function uncover(window: BrowserWindow, bounds: Electron.Rectangle): void {
	window.setAlwaysOnTop(false);
	window.setHasShadow(true);
	window.setBounds(bounds, false);
}

/**
 * Full screen on or off, resolved once macOS has finished the move, or given up on after a moment. The event comes
 * from inside the move, where a frame set on another display is held to this one, so it resolves a task later: a
 * window set there on X stayed on its own screen.
 */
function setFullScreen(window: BrowserWindow, on: boolean): Promise<void> {
	if (window.isDestroyed() || window.isFullScreen() === on) return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(late);
			if (!window.isDestroyed()) {
				window.off("enter-full-screen", done);
				window.off("leave-full-screen", done);
			}
			setTimeout(resolve, 0);
		};
		const late = setTimeout(done, 1_500);
		if (on) window.once("enter-full-screen", done);
		else window.once("leave-full-screen", done);
		window.setFullScreen(on);
	});
}

function refocus(window: BrowserWindow | undefined): void {
	if (window !== undefined && !window.isDestroyed()) window.focus();
}
