import type { DesignProjection } from "../../daemon/design-projection";
import type { ProjectShares, SharesSource, ShareView } from "../../share-view";
import { type Presence, type PresenceState, readPresence } from "../../team-sync-protocol";

/**
 * Where the read-only canvas finds its project. The page that serves it says,
 * in a `<script id="spool-viewer" type="application/json">`: the address it
 * reads the project from, and the path the canvas lives at, under which each
 * page is a path of its own (`<path>/<page>`).
 */
export interface ViewerConfig {
	api: string;
	path: string;
	/**
	 * Whether the page is an app a phone may keep on its Home Screen: a link share's page, which names itself, its
	 * icon and its manifest. Opened in a phone's browser, it says once how to add it there.
	 */
	app?: boolean;
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
	/**
	 * For a member: where who else is on the canvas is heard and where this person is said, a WebSocket address on
	 * the page's own origin. An outsider has none: they see nobody and are seen by nobody.
	 */
	presence?: string;
	/** Each frame's cover, by its name: an image a member's daemon took, on the page's own origin. */
	covers?: Record<string, string>;
	/** Where spool for Mac is got, for whoever has no spool. */
	download?: string;
	/** For a member: the frames saved to last, newest first, from the team's history. */
	recent?: ViewerRecent[];
}

/** A frame as saved to last: who saved it, by name, and when (seconds). */
export interface ViewerRecent {
	frame: string;
	by: string;
	at: number;
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

/** How often a socket of the canvas's is told it is still there, so nothing between closes it as idle. */
const PING_MS = 30_000;

/**
 * Hold a WebSocket to an address on the page's own origin open for as long as the canvas is, connecting again with
 * a growing wait when it drops, and saying it is still there every `PING_MS`.
 */
function keepOpen(
	address: string,
	on: { opened?: (socket: WebSocket) => void; heard: (data: unknown) => void; dropped?: () => void },
): () => void {
	const url = new URL(address, window.location.href);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	let socket: WebSocket | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let wait = 1000;
	let stopped = false;
	const connect = () => {
		const opening = new WebSocket(url);
		socket = opening;
		opening.addEventListener("open", () => {
			wait = 1000;
			ping = setInterval(() => opening.send("ping"), PING_MS);
			on.opened?.(opening);
		});
		opening.addEventListener("message", (event) => on.heard(event.data));
		opening.addEventListener("close", () => {
			clearInterval(ping);
			if (stopped) return;
			on.dropped?.();
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

/**
 * Listen to the project's saves for as long as the canvas is open. The canvas sends nothing over it but the
 * keepalive: it only hears.
 */
export function listen(address: string, heard: (message: ViewerLive) => void): () => void {
	return keepOpen(address, {
		heard: (data) => {
			const message = readLive(data);
			if (message !== undefined) heard(message);
		},
	});
}

/** A member taking part in presence on the canvas: where they are is said with `say`, until `stop`. */
export interface PresenceLink {
	say: (state: PresenceState) => void;
	stop: () => void;
}

/**
 * Take part in presence on the project's canvas (DEV-197), as the Mac's canvas does through its daemon: hear where
 * everyone else is, and say where this person is. A connection that comes back is told who's here afresh, so
 * `dropped` forgets everyone first, and it is told where this person last was again.
 */
export function joinPresence(
	address: string,
	on: { heard: (presence: Presence) => void; dropped: () => void },
): PresenceLink {
	let open: WebSocket | null = null;
	let latest: string | null = null;
	const stop = keepOpen(address, {
		opened: (socket) => {
			open = socket;
			if (latest !== null) socket.send(latest);
		},
		heard: (data) => {
			const message = readJson(data);
			const presence = message === undefined ? undefined : readPresence(message);
			if (presence !== undefined) on.heard(presence);
		},
		dropped: () => {
			open = null;
			on.dropped();
		},
	});
	return {
		say: (state) => {
			latest = JSON.stringify({ type: "presence", state });
			open?.send(latest);
		},
		stop,
	};
}

function readJson(data: unknown): Record<string, unknown> | undefined {
	if (typeof data !== "string") return undefined;
	try {
		const value: unknown = JSON.parse(data);
		return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

function readLive(data: unknown): ViewerLive | undefined {
	const message = readJson(data);
	if (message === undefined || typeof message.head !== "number") return undefined;
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
	const { api, path, app } = value as Record<string, unknown>;
	if (typeof api !== "string" || typeof path !== "string") throw new Error("spool viewer: no configuration");
	return app === true ? { api, path, app } : { api, path };
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
