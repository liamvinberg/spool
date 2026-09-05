/** The native canvas window, separate from the app's update bridge. */
export type DesktopCommand =
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
