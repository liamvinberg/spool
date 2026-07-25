import { hc } from "hono/client";
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
	}
}

export type {
	Camera,
	CanvasState,
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

export async function fetchSession(): Promise<string[]> {
	const res = await client.api.session.$get();
	if (!res.ok) return [];
	return ((await res.json()) as { open: string[] }).open;
}

export function putSession(open: string[]): void {
	void client.api.session.$put({ json: { open } });
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

/** The rail's call-site rows (#58): each stamp's repeating call, or null. */
export async function fetchStampLabels(project: string, stamps: string[]): Promise<Record<string, string | null>> {
	try {
		const res = await client.api.p[":project"]["stamp-labels"].$post({ param: { project }, json: { stamps } });
		if (!res.ok) return {};
		return ((await res.json()) as { labels: Record<string, string | null> }).labels;
	} catch {
		return {};
	}
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

function thumbUrl(project: string, frame: string, nonce: number): string {
	const base = `/api/p/${encodeURIComponent(project)}/thumbs/${encodeURIComponent(frame)}`;
	return nonce === 0 ? base : `${base}?v=${nonce}`;
}

/**
 * Thumbnail reads stay on the trusted host, where the control token is
 * required. Covers are the canvas's bulk traffic and a remount asks for one it
 * usually already holds, so this rides the HTTP cache: the daemon answers
 * `no-cache`, every read revalidates against the stored ETag, and an unchanged
 * cover costs a 304 instead of its megabytes.
 */
export async function fetchThumb(project: string, frame: string, nonce: number): Promise<Blob | undefined> {
	try {
		const res = await controlFetch(thumbUrl(project, frame, nonce));
		return res.ok ? await res.blob() : undefined;
	} catch {
		return undefined;
	}
}

/** Self-captures ride a plain PUT — binary body, outside the JSON RPC surface. */
export async function putThumb(project: string, frame: string, cover: Blob): Promise<boolean> {
	const res = await controlFetch(thumbUrl(project, frame, 0), {
		method: "PUT",
		headers: { "content-type": cover.type === "" ? "application/octet-stream" : cover.type },
		body: cover,
	});
	return res.ok;
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
