import type { DesignProjection } from "../../daemon/design-projection";

/**
 * Where the read-only canvas finds its project. The page that serves it says,
 * in a `<script id="spool-viewer" type="application/json">`: the address it
 * reads the project from, and the path the canvas lives at, under which each
 * page is a path of its own (`<path>/<page>`).
 */
export interface ViewerConfig {
	api: string;
	path: string;
}

/**
 * One team project as the read-only canvas draws it, which is all it is ever
 * told: the team, the project, who is looking, the canvas core reads from the
 * project's files (`projectDesign`), and where each frame's document is
 * served, `<frames><encoded frame name>`, on an origin of its own.
 */
export interface ViewerProject {
	team: { address: string; name: string; logo: string | null };
	project: string;
	account: string;
	canvas: DesignProjection;
	frames: string;
}

export function readConfig(): ViewerConfig {
	const script = document.getElementById("spool-viewer");
	const value: unknown = JSON.parse(script?.textContent ?? "null");
	if (typeof value !== "object" || value === null) throw new Error("spool viewer: no configuration");
	const { api, path } = value as Record<string, unknown>;
	if (typeof api !== "string" || typeof path !== "string") throw new Error("spool viewer: no configuration");
	return { api, path };
}

/**
 * The project, read. The canvas only ever reads: there is no request here, or
 * anywhere in the viewer, that asks anything to change.
 */
export async function readProject(config: ViewerConfig): Promise<ViewerProject | undefined> {
	const response = await fetch(config.api, { credentials: "same-origin", headers: { accept: "application/json" } });
	if (!response.ok) return undefined;
	return (await response.json()) as ViewerProject;
}

/** The page and the played frame a canvas URL names. */
export function locate(config: ViewerConfig, url: URL): { page: string; frame: string | null } {
	const rest = url.pathname.startsWith(`${config.path}/`) ? url.pathname.slice(config.path.length + 1) : "";
	const page = rest
		.split("/")
		.filter((segment) => segment !== "")
		.map(decodeURIComponent)
		.join("/");
	return { page, frame: url.searchParams.get("frame") };
}

/** The canvas URL of a page, with the frame being played on it, if any. */
export function address(config: ViewerConfig, page: string, frame: string | null): string {
	const path = page === "" ? config.path : `${config.path}/${page.split("/").map(encodeURIComponent).join("/")}`;
	return frame === null ? path : `${path}?${new URLSearchParams({ frame })}`;
}
