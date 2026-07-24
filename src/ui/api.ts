import { hc } from "hono/client";
import type { AppType } from "../daemon/app";
import type { EdgeSite, FlowEdge, Flows } from "../daemon/flows";
import type { FsListing } from "../daemon/fs-list";
import type { Geometry } from "../daemon/geometry";
import type { Camera, CanvasState } from "../daemon/project-state";
import type { FrameCollision, ProjectCard, ProjectedFrame, Projection } from "../daemon/projection";
import type { SelectionPut } from "../daemon/selection";

export type {
	Camera,
	CanvasState,
	EdgeSite,
	FlowEdge,
	Flows,
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
const client = hc<AppType>("");

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

export async function restartTerminalFrame(project: string, frame: string): Promise<boolean> {
	try {
		return (await client.api.p[":project"].term[":frame"].restart.$post({ param: { project, frame } })).ok;
	} catch {
		return false;
	}
}

/** The page is going away — a beacon outlives it where fetch would not. */
export function beaconTrash(project: string, frames: string[]): void {
	navigator.sendBeacon(
		`/api/p/${encodeURIComponent(project)}/trash`,
		new Blob([JSON.stringify({ frames })], { type: "application/json" }),
	);
}

export function openInEditor(project: string, path: string, line?: number): void {
	void client.api.p[":project"].editor.$post({
		param: { project },
		json: line === undefined ? { path } : { path, line },
	});
}

export function frameDocumentUrl(project: string, frame: string, nonce: number): string {
	const base = `/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame)}`;
	return nonce === 0 ? base : `${base}?v=${nonce}`;
}

export function thumbUrl(project: string, frame: string, nonce: number): string {
	const base = `/api/p/${encodeURIComponent(project)}/thumbs/${encodeURIComponent(frame)}`;
	return nonce === 0 ? base : `${base}?v=${nonce}`;
}

/** Self-captures ride a plain PUT — binary body, outside the JSON RPC surface. */
export async function putThumb(project: string, frame: string, png: Blob): Promise<boolean> {
	const res = await fetch(thumbUrl(project, frame, 0), {
		method: "PUT",
		headers: { "content-type": "image/png" },
		body: png,
	});
	return res.ok;
}

/** An EventSource that hands over parsed event payloads and dies with the component. */
export function subscribeSse(url: string, handlers: Record<string, (data: unknown) => void>): () => void {
	const source = new EventSource(url);
	for (const [event, handle] of Object.entries(handlers)) {
		source.addEventListener(event, (message) => {
			try {
				handle(JSON.parse((message as MessageEvent).data as string));
			} catch {
				// a malformed event is dropped, the stream lives on
			}
		});
	}
	return () => source.close();
}
