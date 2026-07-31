import { hc } from "hono/client";
import type { Attachment } from "../attachment";
import type { Cover } from "../cover";
import type { AgentReply } from "../daemon/agent-control";
import type { AgentEvent } from "../daemon/agent-events";
import type { AgentAsk } from "../daemon/agent-offer";
import type { AgentLogin } from "../daemon/agent-preflight";
import type { ServedThread, ThreadPut } from "../daemon/agent-threads";
import type { AppType } from "../daemon/app";
import type { EdgeSite, FlowEdge, Flows, FlowUnreadable } from "../daemon/flows";
import type { FsListing } from "../daemon/fs-list";
import type { Geometry } from "../daemon/geometry";
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

/** Read one SSE body to its end, dispatching each message by its event name. */
async function drainSse(body: ReadableStream<Uint8Array>, handlers: Record<string, (data: unknown) => void>) {
	const reader = body.getReader();
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
			await drainSse(res.body, handlers);
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

export interface AgentReading {
	readonly attached?: ((attached: AgentAttached) => void) | undefined;
	readonly event: (event: AgentEvent) => void;
	readonly end: (error?: string) => void;
}

/**
 * Read one open response as a turn, however the response was asked for.
 *
 * Both doors return the same stream, so both read it the same way: the POST that starts a
 * turn and the GET that picks one up differ in what they send and in nothing after that.
 */
async function readTurn(open: Promise<Response>, on: AgentReading, disposed: () => boolean): Promise<void> {
	try {
		const res = await open;
		if (!res.ok || res.body === null) {
			if (!disposed()) on.end(res.body === null ? "the turn stream never opened" : await res.text());
			return;
		}
		// `disposed` gates the events too, not only the end: letting go of a read can leave
		// a decoded batch in flight, and it must not land in the turn that replaced it
		await drainSse(res.body, {
			attached: (data) => {
				if (!disposed()) on.attached?.(data as AgentAttached);
			},
			agent: (data) => {
				if (!disposed()) on.event(data as AgentEvent);
			},
		});
		if (!disposed()) on.end();
	} catch (error) {
		/*
		 * The reason, rather than silence (#211).
		 *
		 * An aborted read is the caller letting go and never reaches here — `disposed` is
		 * set before the abort. Everything else is the transport dying, and it used to be
		 * reported as a clean end: the rail drew *the turn stream ended* over a dropped
		 * socket, a sleeping laptop and a daemon that had gone, with no way to tell them
		 * apart. What the browser said is worth more than that, however terse.
		 */
		if (!disposed()) on.end(error instanceof Error ? error.message : String(error));
	}
}

export function streamAgentTurn(
	project: string,
	said: {
		/** the conversation this turn continues, which is the agent's session id (#120) */
		readonly thread: string;
		/** what the rail calls this turn, which is the address its stop names (#165) */
		readonly turn: string;
		/** one message, or the several a queue fired as one turn (#170) */
		readonly saying: readonly AgentSaying[];
	},
	on: AgentReading,
): () => void {
	const controller = new AbortController();
	let disposed = false;
	// `init` is spread over what the client built, so `headers` here would replace its own
	// `content-type: application/json` and the daemon would reject the body
	void readTurn(
		client.api.p[":project"].agent.turn.$post(
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
			{ init: { signal: controller.signal } },
		),
		on,
		() => disposed,
	);
	return () => {
		disposed = true;
		controller.abort();
	};
}

/**
 * The turn this conversation already has, picked up where it was left (#211).
 *
 * The door a returning rail knocks on. A turn outlives the request that started it, so a
 * refresh loses the response and nothing else: this asks the daemon for the turn running
 * in a thread and reads it from `from` — zero for a fresh page, which replays the whole
 * log and rebuilds exactly what was on screen.
 *
 * A 404 is the ordinary answer and not a failure: it means nothing is being held for this
 * conversation, which is every thread that is not mid-turn. The picture on disk is the
 * whole of what the rail can draw for one of those, and it already has it.
 */
export function attachAgentTurn(project: string, thread: string, from: number, on: AgentReading): () => void {
	const controller = new AbortController();
	let disposed = false;
	void readTurn(
		client.api.p[":project"].agent.turn[":thread"].$get(
			{ param: { project, thread }, query: { from: String(from) } },
			{ init: { signal: controller.signal } },
		),
		on,
		() => disposed,
	);
	return () => {
		disposed = true;
		controller.abort();
	};
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
