import { electronAccelerator } from "./hotkey-combos";
import { hotkeyEntry } from "./hotkeys";

/** The tab keys, which the Mac menu wears once the page says it answers them. */
export const TAB_COMMANDS = [
	"app.close-tab",
	"app.close-window",
	"app.reopen-tab",
	"app.home",
	"app.next-tab",
	"app.previous-tab",
	"app.tab-1",
	"app.tab-2",
	"app.tab-3",
	"app.tab-4",
	"app.tab-5",
	"app.tab-6",
	"app.tab-7",
	"app.tab-8",
	"app.tab-last",
] as const;

export type TabCommand = (typeof TAB_COMMANDS)[number];

/** The native canvas window, separate from the app's update bridge. */
export type DesktopCommand =
	| "app.new-project"
	| "app.open-project"
	| "app.settings"
	| "app.help"
	| TabCommand
	| "canvas.zoom-in"
	| "canvas.zoom-out"
	| "canvas.zoom-reset"
	| "canvas.fit-all"
	| "canvas.fit-selection";

export interface DesktopWindow {
	onCommand(listener: (command: DesktopCommand) => void): () => void;
	setCanvasActive(active: boolean): void;
	/** the menu's keys, from the register; an older app has no such call */
	setMenuKeys?(keys: Partial<Record<DesktopCommand, string>>): void;
	/** close the window the canvas is in; an older app has no such call */
	closeWindow?(): void;
	/**
	 * The first run's window (spool#250): a step's size, centred and fixed (560 by 480, a
	 * little taller on a step that holds more), or `grow` back to spool's own. True when the
	 * window itself changed; false where it can't (full screen, not small), and an older app
	 * has no such call: the page draws the small box itself then.
	 */
	setupWindow?(size: "grow" | { w: number; h: number }): Promise<boolean>;
	/** a project (.spool) the app saved to Downloads, or could not; an older app does not say where */
	onProjectDownload?(listener: (report: ProjectDownload) => void): () => void;
	/** a canvas export (.png, .pdf, .html) the app saved to Downloads, or could not; `requested` is the name the canvas asked for */
	onExportDownload?(listener: (report: ExportDownload) => void): () => void;
	/** Finder, showing a file `onExportDownload` or `onProjectDownload` reported saved */
	revealDownload?(path: string): unknown;
	/** the system's open panel: a folder, or for Open… a folder or a .spool file */
	chooseDirectory?(request: DirectoryRequest): Promise<string | null>;
	/** a document Finder handed the app, a .spool opened with it say, for Open… to read */
	onOpenPath?(listener: (path: string) => void): () => void;
	/** where a dropped file or folder lies on this Mac; an older app has no such call */
	pathForFile?(file: File): string;
	/** a presented talk's room changed screens, or a display came or went; an older app makes no room */
	onRoom?(listener: (report: RoomReport) => void): () => void;
	/** where the room of `talk` is now; null while it has no window */
	roomReport?(talk: string): Promise<RoomReport | null>;
	/** X: the room and spool's window trade screens */
	swapRoom?(talk: string): void;
	/** the room's window brought to the front, without the keys */
	showRoom?(talk: string): void;
	/** how many displays this Mac has, now (spool#298); an older app does not say */
	displays?(): number;
	/**
	 * Spool's window over its whole display at once for a talk's slides, with no Space to slide to, or back as it was
	 * (spool#298). True when the window changed; a window already full screen is left as it is. An older app cannot.
	 */
	presentFullScreen?(on: boolean): Promise<boolean>;
}

/** What the Mac app says of a presented talk's room (spool#265). */
export interface RoomReport {
	talk: string;
	/** the display the room is full screen on, by its name; null while the room is a window */
	screen: string | null;
	/** whether X has another screen to swap to */
	swaps: boolean;
	/** the display unplugged under the room, which is a window again because of it */
	unplugged?: string;
}

export type ProjectDownload =
	| { status: "completed"; filename: string; path?: string | undefined }
	| { status: "failed"; message: string };

export type ExportDownload =
	| { status: "completed"; requested: string; filename: string; path: string }
	| { status: "failed"; requested: string; message: string };

export interface DirectoryRequest {
	purpose: "location" | "checkout" | "open" | "export";
	defaultPath: string;
}

export function desktopWindow(
	host: unknown = typeof window === "undefined" ? undefined : window,
): DesktopWindow | undefined {
	if (typeof host !== "object" || host === null) return undefined;
	const candidate = (host as { spoolCanvasWindow?: unknown }).spoolCanvasWindow;
	if (typeof candidate !== "object" || candidate === null) return undefined;
	const bridge = candidate as Record<string, unknown>;
	if (typeof bridge.onCommand !== "function" || typeof bridge.setCanvasActive !== "function") return undefined;
	return bridge as unknown as DesktopWindow;
}

/**
 * The menu items that wear a key in the Mac app. The canvas's own chords stay
 * off the menu: a menu accelerator fires before the page, so it would take
 * them from an entered prototype. The tab keys are the window's, not the
 * prototype's, the way a browser's are.
 */
const MENU_KEYED = [
	"app.new-project",
	"app.open-project",
	"app.settings",
	...TAB_COMMANDS,
] as const satisfies readonly DesktopCommand[];

/** Each keyed menu item's accelerator, read off the register's first combo for it. */
export function menuAccelerators(): Partial<Record<DesktopCommand, string>> {
	const keys: Partial<Record<DesktopCommand, string>> = {};
	for (const command of MENU_KEYED) {
		const entry = hotkeyEntry(command);
		const first = "keys" in entry ? entry.keys[0] : undefined;
		const accelerator = first === undefined ? undefined : electronAccelerator(first);
		if (accelerator !== undefined) keys[command] = accelerator;
	}
	return keys;
}
