import { hc } from "hono/client";
import type { Attachment } from "../attachment";
import type { Cover } from "../cover";
import type { AgentReply } from "../daemon/agent-control";
import type { AgentEvent } from "../daemon/agent-events";
import type { AgentAsk } from "../daemon/agent-offer";
import type { AgentLogin } from "../daemon/agent-preflight";
import type { ServedThread, ThreadPut } from "../daemon/agent-threads";
import type { AppType } from "../daemon/app";
import type { CanvasOrder } from "../daemon/canvas-order";
import type { FrameCopy } from "../daemon/explorer";
import type { EdgeSite, FlowEdge, Flows, FlowUnreadable } from "../daemon/flows";
import type { FsHit, FsListing, FsSearch } from "../daemon/fs-list";
import type { Geometry } from "../daemon/geometry";
import type { LocatedRange } from "../daemon/locate";
import type { Camera, CanvasState } from "../daemon/project-state";
import type { FrameCollision, ProjectCard, ProjectedFrame, Projection } from "../daemon/projection";
import type { SelectionEntry, SelectionPut } from "../daemon/selection";

declare global {
	interface Window {
		__SPOOL_CONTROL__?: string;
		__SPOOL_RENDER_ORIGIN__?: string;
		__SPOOL_CAPTURE_ORIGIN__?: string;
	}
}

export type {
	AgentEvent,
	Camera,
	CanvasOrder,
	CanvasState,
	Cover,
	EdgeSite,
	FlowEdge,
	Flows,
	FlowUnreadable,
	FrameCollision,
	FrameCopy,
	FsHit,
	FsListing,
	FsSearch,
	Geometry,
	LocatedRange,
	ProjectCard,
	ProjectedFrame,
	Projection,
	SelectionEntry,
	SelectionPut,
	ServedThread,
	ThreadPut,
};

/**
 * The daemon over its typed RPC surface (#12): hc<AppType> is the
 * compile-time tripwire — routes and request bodies type-check against the
 * daemon source, and the response payloads are the daemon's own exported
 * types. Everything the UI asks the daemon lives here, one assumption per
 * helper.
 */
const uiWindow = typeof window === "undefined" ? undefined : window;
const controlToken = typeof uiWindow?.__SPOOL_CONTROL__ === "string" ? uiWindow.__SPOOL_CONTROL__ : "";
const fallbackRenderOrigin =
	uiWindow === undefined
		? "http://run.spool.localhost"
		: `${uiWindow.location.protocol}//run.spool.localhost${uiWindow.location.port === "" ? "" : `:${uiWindow.location.port}`}`;
const renderOrigin =
	typeof uiWindow?.__SPOOL_RENDER_ORIGIN__ === "string" ? uiWindow.__SPOOL_RENDER_ORIGIN__ : fallbackRenderOrigin;
const fallbackCaptureOrigin =
	uiWindow === undefined
		? "http://capture-spool.localhost"
		: `${uiWindow.location.protocol}//capture-spool.localhost${uiWindow.location.port === "" ? "" : `:${uiWindow.location.port}`}`;
export const captureOrigin =
	typeof uiWindow?.__SPOOL_CAPTURE_ORIGIN__ === "string" ? uiWindow.__SPOOL_CAPTURE_ORIGIN__ : fallbackCaptureOrigin;

function controlFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set("X-Spool-Control", controlToken);
	return fetch(input, { ...init, headers });
}

const client = hc<AppType>("", { fetch: controlFetch });

export async function fetchProjects(): Promise<ProjectCard[]> {
	const res = await client.api.projects.$get();
	if (!res.ok) return [];
	return ((await res.json()) as { projects: ProjectCard[] }).projects;
}

/** Home's remove: the registry forgets this root, the folder stays put. */
export async function postForgetProject(root: string): Promise<boolean> {
	try {
		return (await client.api.projects.forget.$post({ json: { root } })).ok;
	} catch {
		return false;
	}
}

/** The page is going away mid-toast — the staged forget still has to land. */
export function beaconForgetProject(root: string): void {
	void controlFetch("/api/projects/forget", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ root }),
		keepalive: true,
	});
}

export async function fetchSession(): Promise<string[]> {
	const res = await client.api.session.$get();
	if (!res.ok) return [];
	return ((await res.json()) as { open: string[] }).open;
}

export function putSession(root: string, open: boolean): void {
	void client.api.session.$put({ json: { root, open } });
}

/** The tabs in the order somebody dragged them into. */
export function putSessionOrder(order: readonly string[]): void {
	void client.api.session.order.$put({ json: { order: [...order] } });
}

export async function fetchProjection(project: string): Promise<Projection | undefined> {
	const res = await client.api.p[":project"].frames.$get({ param: { project } });
	if (!res.ok) return undefined;
	return (await res.json()) as Projection;
}

export async function fetchCanvasState(project: string): Promise<CanvasState | undefined> {
	const res = await client.api.p[":project"].state.$get({ param: { project } });
	if (!res.ok) return undefined;
	return (await res.json()) as CanvasState;
}

export function putCanvasState(project: string, state: CanvasState): void {
	void client.api.p[":project"].state.$put({ param: { project }, json: state });
}

export async function browseDirectory(path?: string): Promise<FsListing | undefined> {
	const res = await client.api.fs.list.$get({ query: path === undefined ? {} : { path } });
	if (!res.ok) return undefined;
	return (await res.json()) as FsListing;
}

/** Every folder under home the query answers to, ranked (#251) — the daemon walks, the picker draws. */
export async function searchDirectories(query: string): Promise<FsSearch | undefined> {
	const res = await client.api.fs.search.$get({ query: { q: query } });
	if (!res.ok) return undefined;
	return (await res.json()) as FsSearch;
}

export type OpenOutcome =
	| { kind: "opened"; root: string; name: string }
	| { kind: "offer-init" }
	| { kind: "error"; message: string };

export async function openProjectAt(path: string): Promise<OpenOutcome> {
	const res = await client.api.projects.open.$post({ json: { path } });
	if (res.ok) return { kind: "opened", ...((await res.json()) as { root: string; name: string }) };
	if (res.status === 404) return { kind: "offer-init" };
	return { kind: "error", message: await errorText(res) };
}

export async function initProjectAt(path: string): Promise<OpenOutcome> {
	const res = await client.api.projects.init.$post({ json: { path } });
	if (res.ok) return { kind: "opened", ...((await res.json()) as { root: string; name: string }) };
	return { kind: "error", message: await errorText(res) };
}

export type UpgradeStart = { ok: true } | { ok: false; error: string };

/** The toast door (#30): ask the daemon to spawn the upgrader and stand back. */
export async function postUpgrade(): Promise<UpgradeStart> {
	try {
		const res = await client.api.upgrade.$post();
		if (res.ok) return { ok: true };
		return { ok: false, error: await errorText(res) };
	} catch {
		return { ok: false, error: "the daemon is unreachable" };
	}
}

async function errorText(res: { text(): Promise<string> }): Promise<string> {
	const raw = await res.text();
	try {
		return (JSON.parse(raw) as { error?: string }).error ?? raw;
	} catch {
		return raw;
	}
}

/** The link graph (#34): read from source, verified by witnessed sessions. */
export async function fetchFlows(project: string): Promise<Flows | undefined> {
	const res = await client.api.p[":project"].flows.$get({ param: { project } });
	if (!res.ok) return undefined;
	return (await res.json()) as Flows;
}

/**
 * Ask the daemon to fill targets the parser could not read by rendering the
 * frames that declare them (#34). Explicitly asked for, because it costs a page
 * load per frame per scenario; frames whose read is already fresh cost nothing.
 */
export async function resolveFlows(project: string): Promise<{ read: number } | undefined> {
	try {
		const res = await client.api.p[":project"].flows.resolve.$post({ param: { project } });
		if (!res.ok) return undefined;
		return (await res.json()) as { read: number };
	} catch {
		return undefined;
	}
}

/**
 * These frames have been looked at — the canvas is the witness.
 *
 * Fire and forget, then read the projection back: the mark goes out when the
 * record agrees, so nothing on screen claims a state the daemon does not hold.
 */
export async function postSeen(project: string, frames: readonly string[]): Promise<boolean> {
	if (frames.length === 0) return false;
	try {
		return (await client.api.p[":project"].seen.$post({ param: { project }, json: { frames: [...frames] } })).ok;
	} catch {
		return false;
	}
}

/** An entered walk really happened — the canvas is the witness (#25). */
export function postWalk(project: string, from: string, to: string): void {
	void client.api.p[":project"].walked.$post({ param: { project }, json: { from, to } }).catch(() => {});
}

/**
 * What Liam points at (#23) — daemon memory, the agent's read surface.
 *
 * The enriched list comes back, because the composer's chips are the promise of
 * what a prompt will carry and only the daemon knows the paths, the sizes, the line
 * ranges and the excerpts (#116). Undefined is the put that never landed, which
 * leaves the chips as they were rather than emptying them.
 */
export async function putSelection(project: string, selection: SelectionPut): Promise<SelectionEntry[] | undefined> {
	try {
		const res = await client.api.p[":project"].selection.$put({ param: { project }, json: selection });
		if (!res.ok) return undefined;
		return ((await res.json()) as { selection: SelectionEntry[] }).selection;
	} catch {
		return undefined;
	}
}

/** Move and resize write geometry sidecars alone — never source (#23). */
export async function putGeometry(project: string, frames: Record<string, Geometry>): Promise<boolean> {
	try {
		return (await client.api.p[":project"].geometry.$put({ param: { project }, json: { frames } })).ok;
	} catch {
		return false;
	}
}

export async function postTrash(project: string, frames: string[], pages: string[] = []): Promise<boolean> {
	try {
		return (await client.api.p[":project"].trash.$post({ param: { project }, json: { frames, pages } })).ok;
	} catch {
		return false;
	}
}

/**
 * The explorer's verbs (#228, #229).
 *
 * Every one of them is a folder operation the daemon refuses before it starts
 * rather than resolves by guessing, so what comes back here is either the thing
 * happening or the reason it did not.
 *
 * Who says the reason depends on whose name it is about. A rename and a new
 * page carry a name somebody typed, so the rail keeps the row's input open and
 * says why, rather than quietly minting a different name. A duplicate, a paste
 * and a move carry no typed name and can only be refused pathologically — the
 * daemon mints the copy names itself and cannot collide, so a refusal means the
 * disk moved underneath the projection — and there the rail re-reads the
 * projection instead, which is the only thing that would make it right again.
 */
export type ExplorerRefusal = { kind: "refused"; status: number; message: string };

/** A verb that either happened or was refused, with nothing else to hand back. */
export type ExplorerDone = { kind: "done" } | ExplorerRefusal;

/** A duplicate hands back the names it minted: only the daemon knows them. */
export type ExplorerCopies = { kind: "done"; copies: readonly FrameCopy[] } | ExplorerRefusal;

async function refusalOf(res: Response): Promise<ExplorerRefusal> {
	return { kind: "refused", status: res.status, message: await errorText(res) };
}

/** A door that never answered reads as a refusal with no status behind it. */
const unreachable: ExplorerRefusal = { kind: "refused", status: 0, message: "the daemon is unreachable" };

export async function renameFrame(project: string, from: string, to: string): Promise<ExplorerDone> {
	try {
		const res = await client.api.p[":project"].frames.rename.$post({ param: { project }, json: { from, to } });
		return res.ok ? { kind: "done" } : await refusalOf(res);
	} catch {
		return unreachable;
	}
}

export async function renamePage(project: string, from: string, to: string): Promise<ExplorerDone> {
	try {
		const res = await client.api.p[":project"].pages.rename.$post({ param: { project }, json: { from, to } });
		return res.ok ? { kind: "done" } : await refusalOf(res);
	} catch {
		return unreachable;
	}
}

/** Drag's other meaning: the frames move page, folder and sidecar and all. */
export async function moveFrames(project: string, frames: string[], page: string): Promise<ExplorerDone> {
	try {
		const res = await client.api.p[":project"].frames.move.$post({ param: { project }, json: { frames, page } });
		return res.ok ? { kind: "done" } : await refusalOf(res);
	} catch {
		return unreachable;
	}
}

/** The same drag over a page: the folder moves, and its whole subtree with it. */
export async function movePages(project: string, pages: string[], page: string): Promise<ExplorerDone> {
	try {
		const res = await client.api.p[":project"].pages.move.$post({ param: { project }, json: { pages, page } });
		return res.ok ? { kind: "done" } : await refusalOf(res);
	} catch {
		return unreachable;
	}
}

/** No page asked for leaves each copy where its original lives. */
export async function duplicateFrames(project: string, frames: string[], page?: string): Promise<ExplorerCopies> {
	try {
		const res = await client.api.p[":project"].frames.duplicate.$post({ param: { project }, json: { frames, page } });
		if (!res.ok) return await refusalOf(res);
		return { kind: "done", copies: ((await res.json()) as { frames: FrameCopy[] }).frames };
	} catch {
		return unreachable;
	}
}

export type PageCopy = { kind: "done"; page: string; copies: readonly FrameCopy[] } | ExplorerRefusal;

export async function duplicatePage(project: string, name: string): Promise<PageCopy> {
	try {
		const res = await client.api.p[":project"].pages.duplicate.$post({ param: { project }, json: { name } });
		if (!res.ok) return await refusalOf(res);
		const done = (await res.json()) as { page: string; frames: FrameCopy[] };
		return { kind: "done", page: done.page, copies: done.frames };
	} catch {
		return unreachable;
	}
}

export async function createPage(project: string, name: string): Promise<ExplorerDone> {
	try {
		const res = await client.api.p[":project"].pages.create.$post({ param: { project }, json: { name } });
		return res.ok ? { kind: "done" } : await refusalOf(res);
	} catch {
		return unreachable;
	}
}

/**
 * The rail's manual arrangement (#228).
 *
 * Advisory on the wire in both directions: a stale name round-trips untouched
 * and a missing one is not an error, because the client is what merges the
 * stored list against the projection. Nothing empty is stored — an order
 * naming nothing and no order at all are the same fact about a canvas.
 *
 * The wire carries the document rather than this side's reading of it, so a
 * flat project's `pages` arrives as the bare list it has always been (#231) and
 * this is where it becomes the root parent's list. One door, one normalization.
 */
export async function fetchOrder(project: string): Promise<CanvasOrder> {
	try {
		const res = await client.api.p[":project"].order.$get({ param: { project } });
		return res.ok ? storedAsOrder(await res.json()) : {};
	} catch {
		return {};
	}
}

function storedAsOrder(value: unknown): CanvasOrder {
	const stored = (value ?? {}) as { pages?: unknown; frames?: Record<string, string[]> };
	const pages = Array.isArray(stored.pages)
		? { "": stored.pages as string[] }
		: (stored.pages as Record<string, string[]> | undefined);
	return {
		...(pages === undefined ? {} : { pages }),
		...(stored.frames === undefined ? {} : { frames: stored.frames }),
	};
}

export function putOrder(project: string, order: CanvasOrder): void {
	void client.api.p[":project"].order.$put({ param: { project }, json: order }).catch(() => {});
}

/** The page is going away — keepalive preserves the control credential a beacon cannot carry. */
export function beaconTrash(project: string, frames: string[], pages: string[] = []): void {
	void controlFetch(`/api/p/${encodeURIComponent(project)}/trash`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ frames, pages }),
		keepalive: true,
	});
}

export function openInEditor(project: string, path: string, line?: number): void {
	void client.api.p[":project"].editor.$post({
		param: { project },
		json: line === undefined ? { path } : { path, line },
	});
}

/**
 * Where one write landed, asked of the side that owns the file (#214).
 *
 * The canvas reads the transcript and knows the strings an edit was made of; the
 * daemon reads the disk and knows which lines they are on now. Nothing found is an
 * ordinary answer — a file the agent has already moved on from — and costs a mark
 * rather than anything else.
 */
export async function locateWrite(project: string, path: string, find: string[]): Promise<LocatedRange | undefined> {
	try {
		const res = await client.api.p[":project"].locate.$post({ param: { project }, json: { path, find } });
		if (!res.ok) return undefined;
		return ((await res.json()) as { range: LocatedRange | null }).range ?? undefined;
	} catch {
		return undefined;
	}
}

export function frameDocumentUrl(project: string, frame: string, nonce: number): string {
	const base = `/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame)}`;
	return new URL(nonce === 0 ? base : `${base}?v=${nonce}`, renderOrigin).href;
}

/**
 * One immutable cover image. The hash addresses its exact content,
 * which is what lets an `<img>` reach it at all: an image element cannot carry
 * the control header, so the unguessable address is the credential. It is also
 * why the daemon can answer immutable — a changed cover is a changed URL, so a
 * warm reload fetches none of them and there is no validator to revalidate.
 */
export function coverUrl(project: string, frame: string, hash: string): string {
	return `/covers/${encodeURIComponent(project)}/${encodeURIComponent(frame)}/${hash}`;
}

/**
 * A terminal cover as bytes for export. A plain fetch works because the
 * content-addressed URL is the credential.
 */
export async function fetchCover(project: string, frame: string, cover: Cover): Promise<Blob | undefined> {
	try {
		const res = await fetch(coverUrl(project, frame, cover.hash));
		return res.ok ? await res.blob() : undefined;
	} catch {
		return undefined;
	}
}

/**
 * A self-capture rides a plain PUT as one image. The answer is its immutable
 * address, which the canvas puts on screen straight away.
 */
export async function putCover(project: string, frame: string, cover: Blob): Promise<Cover | undefined> {
	const body = new FormData();
	body.append("cover", cover);
	const res = await controlFetch(`/api/p/${encodeURIComponent(project)}/thumbs/${encodeURIComponent(frame)}`, {
		method: "PUT",
		body,
	});
	if (!res.ok) return undefined;
	return (await res.json()) as Cover;
}

/**
 * A self-capture failed, and the reason is worth keeping (#173) — but never
 * worth waiting on: `spool logs` is the only reader, so a lost post costs the
 * next look a blank line, not a stuck errand.
 */
export function postCaptureFailure(project: string, frame: string, error: string): void {
	void controlFetch(`/api/p/${encodeURIComponent(project)}/thumbs/${encodeURIComponent(frame)}/error`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ error }),
	}).catch(() => {});
}

/**
 * Read one SSE body to its end, dispatching each message by its event name.
 * `onBytes` is told about every chunk, comments and heartbeats included: what
 * the caller is watching for is a connection that is still there, and a stream
 * carrying nothing but beats is as alive as one carrying edits.
 */
async function drainSse(
	body: ReadableStream<Uint8Array>,
	handlers: Record<string, (data: unknown) => void>,
	onBytes: () => void = () => {},
) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const next = await reader.read();
		if (next.done) return;
		onBytes();
		buffer += decoder.decode(next.value, { stream: true });
		const messages = buffer.split("\n\n");
		buffer = messages.pop() ?? "";
		for (const message of messages) {
			const event = message.match(/^event: (.*)$/m)?.[1] ?? "message";
			const raw = message.match(/^data: (.*)$/m)?.[1];
			const handle = handlers[event];
			if (raw === undefined || handle === undefined) continue;
			try {
				handle(JSON.parse(raw));
			} catch {
				// a malformed event is dropped, the stream lives on
			}
		}
	}
}

/**
 * How long a stream may say nothing before it is treated as dead. The daemon
 * beats every 15 seconds, so three missed beats is the bar: a half-open
 * connection — a laptop that slept, a network that moved underneath it — never
 * reports anything, it simply stops arriving, and without a deadline the read
 * below waits on it for the rest of the session.
 */
export const SSE_SILENCE_MS = 45_000;
/** How often the watchdog asks. Background tabs throttle it; coming back asks straight away. */
const SSE_WATCH_MS = 15_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_CAP_MS = 10_000;

/**
 * How long to wait before the next attempt. Exponential from the base to the
 * cap, and jittered across the top half of each step so a page with several
 * streams does not knock on a downed daemon in lockstep. A connection that
 * delivered anything starts the count over: a daemon that is up and dropped one
 * stream deserves the fast retry, and a daemon that is gone deserves the slow one.
 */
function reconnectDelay(attempt: number): number {
	const ceiling = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt);
	return ceiling / 2 + Math.random() * (ceiling / 2);
}

/**
 * The one answer no amount of reconnecting can survive (#30).
 *
 * A daemon mints its capability per process and bakes it into the documents it
 * serves, so a restarted daemon — an upgrade, a crash, a `spool serve` by hand —
 * leaves every open page holding a credential for a daemon that no longer
 * exists. Every stream it owns then 401s forever, and the page sits there
 * looking alive while nothing reaches it. The page cannot be given the new
 * capability without being served again, so it goes and gets served again.
 *
 * Once per load. A 401 means a daemon is answering and this page is not its own,
 * which is a fact one reload settles; anything that could keep saying it — some
 * other server on the port — must not be able to turn this into a loop.
 */
let credentialSpent = false;

function reloadForNewDaemon(): void {
	if (credentialSpent || uiWindow === undefined) return;
	credentialSpent = true;
	uiWindow.location.reload();
}

/**
 * Which daemon is answering, asked without a capability.
 *
 * Health is the one route that takes no credential, which is exactly what makes
 * it readable across a restart the page's own capability cannot survive. The
 * version says whether an upgrade landed; the start time separates a daemon
 * that came back from one that never left.
 */
export interface DaemonIdentity {
	version: string;
	startedAt: string;
}

export async function fetchDaemonIdentity(): Promise<DaemonIdentity | undefined> {
	try {
		const res = await fetch("/api/health", { cache: "no-store" });
		if (!res.ok) return undefined;
		const body = (await res.json()) as { version?: unknown; startedAt?: unknown };
		if (typeof body.version !== "string" || typeof body.startedAt !== "string") return undefined;
		return { version: body.version, startedAt: body.startedAt };
	} catch {
		return undefined;
	}
}

/**
 * Every live stream's health check. A tab coming back asks all of them at once
 * rather than waiting out the watchdog it was throttling.
 */
const streamChecks = new Set<() => void>();

function checkStreamsOnReturn(): void {
	if (document.visibilityState !== "visible") return;
	for (const check of [...streamChecks]) check();
}

function watchSseHealth(check: () => void): () => void {
	streamChecks.add(check);
	if (streamChecks.size === 1) document.addEventListener("visibilitychange", checkStreamsOnReturn);
	return () => {
		streamChecks.delete(check);
		if (streamChecks.size === 0) document.removeEventListener("visibilitychange", checkStreamsOnReturn);
	};
}

export interface SseOptions {
	/**
	 * A connection after the first one has delivered its first bytes.
	 *
	 * The daemon keeps no replay, so whatever it published while nobody was
	 * listening is gone. The subscriber's job on this is to read the state it
	 * cares about again rather than to trust what is on screen.
	 */
	onReconnect?: () => void;
}

/** An authenticated SSE fetch stream that dies with the component. */
export function subscribeSse(
	url: string,
	handlers: Record<string, (data: unknown) => void>,
	options: SseOptions = {},
): () => void {
	let disposed = false;
	/** Consecutive attempts that delivered nothing — the backoff's whole memory. */
	let attempt = 0;
	/** Connections that delivered bytes: the first is an open, every one after it is a return. */
	let opened = 0;
	let connection: AbortController | undefined;
	let lastByteAt = Date.now();
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	// a stream that has gone quiet past the bar is hung up on here rather than
	// waited on: aborting it lands in the reconnect path a dropped stream takes
	const check = () => {
		if (disposed || connection === undefined || Date.now() - lastByteAt < SSE_SILENCE_MS) return;
		connection.abort();
	};
	const watchdog = setInterval(check, SSE_WATCH_MS);
	const unwatch = watchSseHealth(check);

	const connect = async () => {
		const controller = new AbortController();
		connection = controller;
		lastByteAt = Date.now();
		let delivered = false;
		try {
			const res = await controlFetch(url, {
				headers: { accept: "text/event-stream" },
				signal: controller.signal,
			});
			// a daemon that will not have this page's capability is not a daemon
			// this page can back off and wait for
			if (res.status === 401) return reloadForNewDaemon();
			if (!res.ok || res.body === null) return;
			await drainSse(res.body, handlers, () => {
				lastByteAt = Date.now();
				if (delivered) return;
				delivered = true;
				attempt = 0;
				opened += 1;
				if (opened > 1) options.onReconnect?.();
			});
		} catch {
			// connection failures follow the same reconnect path as a clean EOF
		} finally {
			connection = undefined;
			if (!disposed) reconnectTimer = setTimeout(() => void connect(), reconnectDelay(attempt++));
		}
	};

	void connect();
	return () => {
		disposed = true;
		clearInterval(watchdog);
		unwatch();
		if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
		connection?.abort();
	};
}

/**
 * One turn against the developer's own agent (#191, #192, #211).
 *
 * A POST whose response is the stream, and the one SSE surface here that must never
 * reconnect *by itself*: reopening the POST would spawn a second agent against a prompt
 * that has already been answered. What it may do — and what `attachAgentTurn` below is —
 * is go and read the same turn again through its own door, because the turn no longer
 * belongs to this request. Letting go of the handle lets go of the read, and the daemon
 * carries on.
 */
export interface AgentSaying {
	readonly prompt: string;
	/**
	 * What the hands were pointing at when these words were said (#116, #170).
	 *
	 * The daemon's own enriched list, handed back to it so a message the queue held
	 * carries the block from its own Enter rather than from the moment it fired.
	 * Absent asks the daemon for what the hands are pointing at now, which is the same
	 * moment for a message that goes out on the press that made it.
	 */
	readonly selection?: readonly SelectionEntry[] | undefined;
	/**
	 * A reference riding with the words (#119), as base64 rather than a path.
	 *
	 * Look-only and nothing lands: the bytes go down the same stdin the prompt does,
	 * so the project gains no file. A browser never reveals a dropped file's path,
	 * which is why this is bytes at all.
	 */
	readonly attached?: Attachment | undefined;
}

/**
 * What the daemon says as a read opens (#211).
 *
 * It is the turn introducing itself rather than anything the agent said, which is why it
 * rides its own SSE event: the rail is picking a conversation back up and needs the three
 * facts it lost with the last response — what this turn is called, whether the process is
 * still up, and how much of what follows is a replay rather than something happening now.
 */
export interface AgentAttached {
	/** the name a stop quotes (#165), absent for a turn nobody intends to stop */
	readonly turn?: string;
	readonly running: boolean;
	/** the first event id this read will carry */
	readonly from: number;
	/** how long the log was when the read opened: `logged - from` events are replay */
	readonly logged: number;
}

/**
 * How a follow ended, which is the only thing that ends a turn in the rail (#211).
 *
 * Three, because the rail does three different things about them. `ended` is the daemon's
 * own terminal event having landed, and it is the one that lets a queue fire. `cut` is the
 * turn being gone with nobody left to say how it went — a daemon that restarted, or an
 * ending that aged out of the keep — so the rail draws the cut and fires nothing. `refused`
 * is the door saying no before there was a turn at all, which the rail reads: a 409 is the
 * thread already running one, and everything else is a line in the log.
 */
export type AgentEnding =
	| { readonly kind: "ended" }
	| { readonly kind: "cut" }
	| { readonly kind: "refused"; readonly status: number; readonly why: string };

export interface AgentReading {
	readonly attached?: ((attached: AgentAttached) => void) | undefined;
	readonly event: (event: AgentEvent) => void;
	readonly end: (ending: AgentEnding) => void;
}

/** what one read of a turn came to, which is not the same question as what the turn came to */
type TurnRead =
	| { readonly kind: "drained" }
	| { readonly kind: "dropped"; readonly why: string }
	| { readonly kind: "refused"; readonly status: number; readonly why: string };

/**
 * Read one open response as a turn, however the response was asked for.
 *
 * Both doors return the same stream, so both read it the same way: the POST that starts a
 * turn and the GET that picks one up differ in what they send and in nothing after that.
 * What comes back is how the read ended and never how the turn did — that judgement is
 * `followAgentTurn`'s, because only it knows whether the daemon said anything on the way.
 */
async function readTurn(
	open: Promise<Response>,
	on: { readonly attached: (attached: AgentAttached) => void; readonly event: (event: AgentEvent) => void },
	disposed: () => boolean,
	onBytes: () => void,
): Promise<TurnRead> {
	try {
		const res = await open;
		if (!res.ok || res.body === null) {
			return {
				kind: "refused",
				status: res.status,
				why: res.body === null ? "the turn stream never opened" : await res.text(),
			};
		}
		// `disposed` gates the events too, not only the end: letting go of a read can leave
		// a decoded batch in flight, and it must not land in the turn that replaced it
		await drainSse(
			res.body,
			{
				attached: (data) => {
					if (!disposed()) on.attached(data as AgentAttached);
				},
				agent: (data) => {
					if (!disposed()) on.event(data as AgentEvent);
				},
			},
			onBytes,
		);
		return { kind: "drained" };
	} catch (error) {
		/*
		 * The reason, rather than silence (#211).
		 *
		 * An aborted read is the caller letting go or the watchdog hanging up, and both are
		 * answered above. Everything else is the transport dying, and what the browser said
		 * about it is worth keeping, however terse: it is the difference between a dropped
		 * socket and a daemon that has gone.
		 */
		return { kind: "dropped", why: error instanceof Error ? error.message : String(error) };
	}
}

/** the POST that says something, which is opened once for a turn and never again */
function sayTurn(
	project: string,
	said: { readonly thread: string; readonly turn: string; readonly saying: readonly AgentSaying[] },
	signal: AbortSignal,
): Promise<Response> {
	// `init` is spread over what the client built, so `headers` here would replace its own
	// `content-type: application/json` and the daemon would reject the body
	return client.api.p[":project"].agent.turn.$post(
		{
			param: { project },
			json: {
				thread: said.thread,
				turn: said.turn,
				said: said.saying.map((one) => ({
					prompt: one.prompt,
					...(one.selection === undefined ? {} : { selection: [...one.selection] }),
					...(one.attached === undefined ? {} : { attachment: one.attached }),
				})),
			},
		},
		{ init: { signal } },
	);
}

/**
 * The turn this conversation already has, read from the event the rail has reached (#211).
 *
 * A turn outlives the request that started it, so a lost response is a read to open again
 * rather than a turn to start: this asks the daemon for the turn running in a thread and
 * reads it from `from` — zero for a fresh page, which replays the whole log and rebuilds
 * exactly what was on screen, and the count already taken for a rail coming back mid-turn,
 * which replays nothing.
 */
function readAgainFrom(project: string, thread: string, from: number, signal: AbortSignal): Promise<Response> {
	return client.api.p[":project"].agent.turn[":thread"].$get(
		{ param: { project, thread }, query: { from: String(from) } },
		{ init: { signal } },
	);
}

/**
 * One turn, followed for as long as it runs (#191, #192, #211).
 *
 * A turn belongs to the daemon rather than to the request that streamed it, so a read of
 * one is a view that can be dropped and opened again. That is what makes this a follow
 * rather than a stream. The POST that says something is opened once and never reopened —
 * a second one would spawn a second agent against a prompt that has already been answered
 * — and every read after it goes up the attach door instead, from the event this rail has
 * already taken.
 *
 * **Only the daemon ends a turn.** A transport that stops without the terminal `closed`
 * event stopped on this side: a dropped socket, a lid, a laptop that slept. Reading that
 * as an ending drew the turn as finished while it went on writing to the repo, and fired
 * the queue into a thread the daemon was still running one in. So it is a reconnect, on
 * the silence watchdog and the jittered backoff `subscribeSse` already runs on.
 *
 * The one answer that does end it without a word from the turn is the attach door's 404:
 * nothing is being held for this conversation, which means the turn is gone and its ending
 * with it.
 */
export function followAgentTurn(
	project: string,
	opening:
		| {
				readonly say: {
					/** the conversation this turn continues, which is the agent's session id (#120) */
					readonly thread: string;
					/** what the rail calls this turn, which is the address its stop names (#165) */
					readonly turn: string;
					/** one message, or the several a queue fired as one turn (#170) */
					readonly saying: readonly AgentSaying[];
				};
		  }
		| { readonly attach: { readonly thread: string } },
	on: AgentReading,
): () => void {
	const thread = "say" in opening ? opening.say.thread : opening.attach.thread;
	let done = false;
	/** consecutive reads that delivered nothing, which is the backoff's whole memory */
	let attempt = 0;
	/** how many of this turn's events have landed here, which is where the next read starts */
	let taken = 0;
	/** the daemon said the turn is over, so the next transport end is an ending rather than a drop */
	let over = false;
	let connection: AbortController | undefined;
	let lastByteAt = Date.now();
	let waiting: ReturnType<typeof setTimeout> | undefined;

	const check = () => {
		if (done || connection === undefined || Date.now() - lastByteAt < SSE_SILENCE_MS) return;
		connection.abort();
	};
	const watchdog = setInterval(check, SSE_WATCH_MS);
	const unwatch = watchSseHealth(check);

	const letGo = () => {
		done = true;
		clearInterval(watchdog);
		unwatch();
		if (waiting !== undefined) clearTimeout(waiting);
		connection?.abort();
		connection = undefined;
	};

	const end = (ending: AgentEnding) => {
		if (done) return;
		letGo();
		on.end(ending);
	};

	const read = async (first: boolean) => {
		const controller = new AbortController();
		connection = controller;
		lastByteAt = Date.now();
		let delivered = false;
		const outcome = await readTurn(
			first && "say" in opening
				? sayTurn(project, opening.say, controller.signal)
				: readAgainFrom(project, thread, taken, controller.signal),
			{
				attached: (info) => on.attached?.(info),
				event: (event) => {
					taken += 1;
					if (event.kind === "closed") over = true;
					on.event(event);
				},
			},
			() => done,
			() => {
				lastByteAt = Date.now();
				if (delivered) return;
				delivered = true;
				// a read that answered is a daemon that is up: a dropped stream deserves the
				// fast retry and a daemon that is gone deserves the slow one
				attempt = 0;
			},
		);
		connection = undefined;
		if (done) return;
		if (outcome.kind === "refused") {
			// nothing is being held for this conversation: it ended long enough ago to have
			// been let go of, or the daemon that held it is not the one answering now
			if (outcome.status === 404) end({ kind: "cut" });
			else end({ kind: "refused", status: outcome.status, why: outcome.why });
			return;
		}
		if (over) {
			end({ kind: "ended" });
			return;
		}
		// the turn said nothing about being over, so this is the read that ended and not the
		// turn: go back and ask for it again from where this one stopped
		waiting = setTimeout(() => void read(false), reconnectDelay(attempt++));
	};

	void read(true);
	return letGo;
}

/**
 * What the person said to a request the turn is parked on (#121, #145).
 *
 * A refusal is silence on purpose. Being turned away means the daemon holds no such
 * waiting request, which happens exactly when the turn already ended, the request was
 * already answered, or the answer was in the other one's vocabulary — and the first
 * two the stream has already said or is about to.
 */
export async function answerAgentTurn(project: string, request: string, reply: AgentReply): Promise<void> {
	await client.api.p[":project"].agent.answer.$post({ param: { project }, json: { request, reply } });
}

/**
 * Stop a turn that is already running (#165).
 *
 * Its own door for the same reason an answer has one: the turn's stream is a
 * response with no way back up. What it sends is a request rather than a kill — the
 * process survives it and ends the turn itself — so there is nothing to read back
 * here. Everything the press produces arrives on the stream the rail is already
 * reading, which is also why a refusal is silence: being turned away means nothing
 * is running under that name, and a turn that already ended is stopped.
 */
export async function interruptAgentTurn(project: string, turn: string): Promise<void> {
	await client.api.p[":project"].agent.interrupt.$post({ param: { project }, json: { turn } });
}

/**
 * Every thread this project has, as spool wrote them down (#120, #136, #200).
 *
 * The picture is the whole of it, so this is the rail's own drawing coming back rather
 * than a stream to re-fold: a resume restores the agent's memory for free and emits no
 * history, which is why the record is spool's problem. Nothing on the way back is capped
 * or elided, because live and restored are the same view.
 *
 * An empty list is also what a daemon that cannot answer gives, and it is the right
 * answer either way: a rail with no stored threads opens on a fresh one.
 */
export async function fetchAgentThreads(project: string): Promise<ServedThread[]> {
	try {
		const res = await client.api.p[":project"].agent.threads.$get({ param: { project } });
		if (!res.ok) return [];
		const { threads } = (await res.json()) as { threads?: ServedThread[] };
		return Array.isArray(threads) ? threads : [];
	} catch {
		return [];
	}
}

/** one thread's picture, written whole: stored is exactly drawn, with no lossy tier */
export async function putAgentThread(project: string, thread: string, picture: ThreadPut): Promise<void> {
	try {
		await client.api.p[":project"].agent.threads[":thread"].$put({
			param: { project, thread },
			json: { ...picture, entries: [...picture.entries], queued: [...picture.queued] },
		});
	} catch {
		// a write that never landed costs what the next one will land anyway: the picture is
		// rewritten on every boundary, so nothing here is the only chance to record it
	}
}

/**
 * Closing a thread, which is a tidy rather than a delete (#136).
 *
 * It leaves the strip and nothing else goes: not the agent's own session, and not
 * spool's stored picture. Spool does not throw away a readable record because a tab was
 * put away.
 */
export async function closeAgentThread(project: string, thread: string): Promise<void> {
	try {
		await client.api.p[":project"].agent.threads[":thread"].close.$post({ param: { project, thread } });
	} catch {
		// the tab is gone from the strip either way; the flag is the only thing at stake
	}
}

/**
 * Is there an agent on this machine at all (#201).
 *
 * A `which` on the daemon's side, asked when the rail opens and again on every press
 * behind the wall. Null is a door that said nothing, which is not the same fact as a
 * machine with no agent on it: only a look that came back and found nothing draws a wall,
 * because a wall is spool saying it looked.
 */
export async function fetchAgentInstalled(project: string): Promise<boolean | null> {
	try {
		const res = await client.api.p[":project"].agent.installed.$get({ param: { project } });
		if (!res.ok) return null;
		const { installed } = (await res.json()) as { installed?: unknown };
		return typeof installed === "boolean" ? installed : null;
	} catch {
		return null;
	}
}

/**
 * Whose login the binary reports (#201).
 *
 * Asked of the agent rather than read out of its files, and opened only by a press on
 * `check again`: never at boot and never before a send. Null where the door said nothing,
 * which the strip reads as the answer it already had.
 */
export async function fetchAgentLogin(project: string): Promise<AgentLogin | null> {
	try {
		const res = await client.api.p[":project"].agent.login.$get({ param: { project } });
		if (!res.ok) return null;
		const login = (await res.json()) as { signedIn?: unknown; account?: unknown };
		if (typeof login.signedIn !== "boolean") return null;
		return { signedIn: login.signedIn, account: typeof login.account === "string" ? login.account : null };
	} catch {
		return null;
	}
}

/**
 * What the model menu may offer, and what is answering (#118, #199).
 *
 * The list is the installed binary's answer to a control request rather than a table
 * spool shipped, so it is asked for at runtime and cached nowhere. It costs one spawn
 * and no turn and no token.
 *
 * The body arrives unread, the way an event off the turn's stream does: `offerOf` in
 * `agent-model.ts` owns the shape, so a daemon on another version costs the menu its
 * rows rather than the rail its render. Undefined where the door said no, which is not
 * the same fact as a machine with nothing to pick — the footer keeps what it had.
 */
export async function agentModelOffer(project: string, thread: string): Promise<unknown> {
	const res = await client.api.p[":project"].agent.threads[":thread"].models.$get({ param: { project, thread } });
	return res.ok ? await res.json() : undefined;
}

/**
 * Choose one, which is sending the message (#118, #199).
 *
 * The menu is a shortcut for `/model haiku` and never a second source of truth, so what
 * comes back is the binary's own report of what it is now running — and that, rather
 * than the press, is what moves the readout. An alias it will not take leaves the
 * report where it was, which is what the footer then says.
 */
export async function chooseAgentModel(project: string, thread: string, next: AgentAsk): Promise<unknown> {
	const res = await client.api.p[":project"].agent.threads[":thread"].model.$post({
		param: { project, thread },
		json: next,
	});
	return res.ok ? await res.json() : undefined;
}
