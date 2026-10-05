import type { DesignProjection } from "../../daemon/design-projection";
import type { ProjectShares, SharesSource, ShareView } from "../../share-view";

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
 * One project as the read-only canvas draws it, which is all it is ever
 * told: the team, the project, who is looking, the canvas core reads from the
 * project's files (`projectDesign`), and where each frame's document is
 * served, `<frames><encoded frame name>`, on an origin of its own.
 *
 * An outsider is told only what was shared with them (`shared`): its pages as
 * they last settled, and nothing else of the project.
 */
export interface ViewerProject {
	/** The team a team project belongs to; null for a solo project shared on its own. */
	team: { address: string; name: string; logo: string | null } | null;
	project: string;
	/** Who is looking, by address; null for whoever holds a link share's link. */
	account: string | null;
	canvas: DesignProjection;
	frames: string;
	/** For an outsider: who shared these pages with them, which, and when they last changed for outsiders. */
	shared?: ViewerShared;
	/** For a member: where the project's shares are read, and changed by its editors and admins. */
	shares?: string;
	/** The role of whoever is looking. Editors and admins may hand the project over to spool on their Mac. */
	role?: ViewerRole;
	/** Where the project's saves are told as they land: a WebSocket address on the page's own origin. */
	live?: string;
	/** Each frame's cover, by its name: an image a member's daemon took, on the page's own origin. */
	covers?: Record<string, string>;
	/** Where spool for Mac is got, for whoever has no spool. */
	download?: string;
}

export type ViewerRole = "admin" | "editor" | "viewer";

/** What an outsider's one line says: who shared, which pages, and when they last changed (seconds), if ever. */
export interface ViewerShared {
	by: string;
	pages: string[];
	updated: number | null;
}

/** Whether a role edits: holds the folders, so has a spool to hand the project over to. */
export function edits(role: ViewerRole | undefined): boolean {
	return role === "admin" || role === "editor";
}

/**
 * What the project's live address says. `head` is the newest save the cloud holds, told on every connect, so a
 * canvas that was away knows whether it missed any. `saved` is one save as it lands: who made it, the frames
 * whose own files it changed (marked, and named in the toast), and every frame that renders what it changed,
 * whose documents are made again.
 */
export type ViewerLive =
	| { type: "head"; head: number }
	| { type: "saved"; head: number; by: string; changed: string[]; touched: string[] };

/** How often the live address is told this canvas is still there, so nothing between closes it as idle. */
const LIVE_PING_MS = 30_000;

/**
 * Listen to the project's saves for as long as the canvas is open, connecting again with a growing wait when
 * the connection drops. The canvas sends nothing over it but the keepalive: it only hears.
 */
export function listen(address: string, heard: (message: ViewerLive) => void): () => void {
	const url = new URL(address, window.location.href);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	let socket: WebSocket | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let wait = 1000;
	let stopped = false;
	const connect = () => {
		socket = new WebSocket(url);
		socket.addEventListener("open", () => {
			wait = 1000;
			ping = setInterval(() => socket?.send("ping"), LIVE_PING_MS);
		});
		socket.addEventListener("message", (event) => {
			const message = readLive(event.data);
			if (message !== undefined) heard(message);
		});
		socket.addEventListener("close", () => {
			clearInterval(ping);
			if (stopped) return;
			retry = setTimeout(connect, wait);
			wait = Math.min(wait * 2, 30_000);
		});
	};
	connect();
	return () => {
		stopped = true;
		clearInterval(ping);
		clearTimeout(retry);
		socket?.close();
	};
}

function readLive(data: unknown): ViewerLive | undefined {
	if (typeof data !== "string") return undefined;
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null) return undefined;
	const message = value as Record<string, unknown>;
	if (typeof message.head !== "number") return undefined;
	if (message.type === "head") return { type: "head", head: message.head };
	const names = (list: unknown) =>
		Array.isArray(list) ? list.filter((name): name is string => typeof name === "string") : [];
	if (message.type === "saved" && typeof message.by === "string")
		return {
			type: "saved",
			head: message.head,
			by: message.by,
			changed: names(message.changed),
			touched: names(message.touched),
		};
	return undefined;
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
	// a link share's canvas lives at its host's root, whose path is ""
	const path =
		page === "" ? config.path || "/" : `${config.path}/${page.split("/").map(encodeURIComponent).join("/")}`;
	return frame === null ? path : `${path}?${new URLSearchParams({ frame })}`;
}

/**
 * A project's shares at spool.page, for a member's Shared control: read by any member, changed by its editors and
 * admins, whom spool.page alone decides. These are the only requests the canvas sends that change anything, and
 * only when an editor presses for them.
 */
export function viewerShares(address: string, manage: boolean): SharesSource {
	const send = async (url: string, init: RequestInit): Promise<string | null> => {
		const response = await fetch(url, { credentials: "same-origin", ...init });
		if (response.ok) return null;
		return (((await response.json().catch(() => null)) as { error?: string } | null)?.error ??
			"unavailable") as string;
	};
	return {
		async read(): Promise<ProjectShares> {
			try {
				const response = await fetch(address, {
					credentials: "same-origin",
					headers: { accept: "application/json" },
				});
				if (!response.ok) return { state: "unreachable" };
				const { shares } = (await response.json()) as { shares: ShareView[] };
				return { state: "ready", shares, manage };
			} catch {
				return { state: "unreachable" };
			}
		},
		change: (share, change) =>
			send(`${address}/${encodeURIComponent(share)}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(change),
			}),
		stop: (share) => send(`${address}/${encodeURIComponent(share)}`, { method: "DELETE" }),
	};
}
