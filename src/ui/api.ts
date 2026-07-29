import { hc } from "hono/client";
import type { Cover } from "../cover";
import type { AppType } from "../daemon/app";
import type { EdgeSite, FlowEdge, Flows, FlowUnreadable } from "../daemon/flows";
import type { FsListing } from "../daemon/fs-list";
import type { Geometry } from "../daemon/geometry";
import type { Camera, CanvasState } from "../daemon/project-state";
import type { FrameCollision, ProjectCard, ProjectedFrame, Projection } from "../daemon/projection";
import type { SelectionPut } from "../daemon/selection";

declare global {
	interface Window {
		__SPOOL_CONTROL__?: string;
		__SPOOL_RENDER_ORIGIN__?: string;
		__SPOOL_CAPTURE_ORIGIN__?: string;
	}
}

export type {
	Camera,
	CanvasState,
	Cover,
	EdgeSite,
	FlowEdge,
	Flows,
	FlowUnreadable,
	FrameCollision,
	FsListing,
	Geometry,
	ProjectCard,
	ProjectedFrame,
	Projection,
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

/** An entered walk really happened — the canvas is the witness (#25). */
export function postWalk(project: string, from: string, to: string): void {
	void client.api.p[":project"].walked.$post({ param: { project }, json: { from, to } }).catch(() => {});
}

/** What Liam points at (#23) — daemon memory, the agent's read surface. */
export function putSelection(project: string, selection: SelectionPut): void {
	void client.api.p[":project"].selection.$put({ param: { project }, json: selection });
}

/** Move and resize write geometry sidecars alone — never source (#23). */
export async function putGeometry(project: string, frames: Record<string, Geometry>): Promise<boolean> {
	try {
		return (await client.api.p[":project"].geometry.$put({ param: { project }, json: { frames } })).ok;
	} catch {
		return false;
	}
}

export async function postTrash(project: string, frames: string[]): Promise<boolean> {
	try {
		return (await client.api.p[":project"].trash.$post({ param: { project }, json: { frames } })).ok;
	} catch {
		return false;
	}
}

/** The page is going away — keepalive preserves the control credential a beacon cannot carry. */
export function beaconTrash(project: string, frames: string[]): void {
	void controlFetch(`/api/p/${encodeURIComponent(project)}/trash`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ frames }),
		keepalive: true,
	});
}

export function openInEditor(project: string, path: string, line?: number): void {
	void client.api.p[":project"].editor.$post({
		param: { project },
		json: line === undefined ? { path } : { path, line },
	});
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

/** An authenticated SSE fetch stream that dies with the component. */
export function subscribeSse(url: string, handlers: Record<string, (data: unknown) => void>): () => void {
	const controller = new AbortController();
	let disposed = false;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	const connect = async () => {
		try {
			const res = await controlFetch(url, {
				headers: { accept: "text/event-stream" },
				signal: controller.signal,
			});
			if (!res.ok || res.body === null) return;
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const next = await reader.read();
				if (next.done) return;
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
		} catch {
			// connection failures follow the same reconnect path as a clean EOF
		} finally {
			if (!disposed) reconnectTimer = setTimeout(() => void connect(), 500);
		}
	};

	void connect();
	return () => {
		disposed = true;
		if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
		controller.abort();
	};
}
