import { electronAccelerator } from "./hotkey-combos";
import { hotkeyEntry } from "./hotkeys";

/** The native canvas window, separate from the app's update bridge. */
export type DesktopCommand =
	| "app.new-project"
	| "app.open-project"
	| "app.settings"
	| "app.help"
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
	onProjectDownload?(
		listener: (result: { status: "completed"; filename: string } | { status: "failed"; message: string }) => void,
	): () => void;
	chooseDirectory?(request: DirectoryRequest): Promise<string | null>;
}

export interface DirectoryRequest {
	purpose: "location" | "add" | "open";
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
 * them from an entered prototype.
 */
const MENU_KEYED = ["app.new-project", "app.open-project", "app.settings"] as const satisfies readonly DesktopCommand[];

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
