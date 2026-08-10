import type { ComponentType } from "react";
import * as React from "react";
import { createElement, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { type ClipboardCopyResult, parseClipboardCopyResult } from "./clipboard-protocol";
import { accelChord } from "./platform-keys";
import { BrokenFrame, Player, type PlayerController, TermScreen } from "./player-chrome";
import type { SpoolUi } from "./spool-public";
import { parseWalkDecision } from "./walk-protocol";

/**
 * The "spool" module (#5, #16): every frame document imports it — explicitly
 * for ui.go/back/state/use, implicitly via the boot module so data-go and the
 * mock layer work in frames that never import it. Evaluation top-level-awaits
 * the session seed, so a frame's first render always sees seeded state and an
 * installed mock. Bundled per spool version and served at /vendor/spool.js;
 * the import map pins the specifier.
 *
 * The same module is the player runtime (#24): a /play/ document declares
 * itself with __SPOOL_PLAY__ and composes every frame component, so walking
 * swaps screens in place under the View Transitions API instead of navigating
 * — one session model, three ways of standing in it.
 */

/** Session state is prototype data: schemaless JSON, keys owned by the agent. */
type SpoolState = Record<string, unknown>;

export type { SpoolUi } from "./spool-public";

interface SpoolDocument {
	project: string;
	frame: string;
	projectCapability: string;
}

interface Scenario {
	state: Record<string, unknown>;
	mock: Record<string, unknown>;
}

/** One play session on the wire: storage record, host handoff, walk snapshot. */
export interface SessionRecord {
	scenario: string;
	state: SpoolState;
	stack: string[];
}

/** The /play/ document's config (#24): present only in the player page. */
export interface PlayerConfig {
	project: string;
	projectCapability: string;
	start: string;
	scenario: string;
	frames: Record<string, { w: number; h: number }>;
	/** Terminal frames: the last persisted grid behind Spool's disabled surface. */
	terminals?: Record<string, { svg: string }>;
	shell?: true;
}

declare global {
	interface Window {
		__SPOOL__?: SpoolDocument;
		__SPOOL_PLAY__?: PlayerConfig;
	}
}

const play = window.__SPOOL_PLAY__;
const config =
	play === undefined
		? window.__SPOOL__
		: { project: play.project, frame: play.start, projectCapability: play.projectCapability };
if (config === undefined) {
	throw new Error('spool: no document config — "spool" only runs inside a spool-served document');
}
const doc: SpoolDocument = config;
/** Where the session stands now: fixed in a frame document, walked in the player. */
let currentFrame = doc.frame;
/** What React has committed. Cross-size cuts keep this behind currentFrame. */
let mountedFrame = doc.frame;

/** The runtime's own plumbing (scenario, fixtures) always rides the real fetch. */
const nativeFetch = window.fetch.bind(window);

/** Project data is the render document's only daemon authority. */
function projectFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set("X-Spool-Project", doc.projectCapability);
	return nativeFetch(input, { ...init, headers });
}

/** Embedded in a canvas iframe: navigation is the host's job, posted over the bridge. */
const embedded = window.parent !== window;
let lastEmbeddedWalkId: number | undefined;
let embeddedWalkPending: { id: number; direction: "go" | "back" } | undefined;

type PlayerMessageHandler = (message: Record<string, unknown>) => void;
let playerMessageHandler: PlayerMessageHandler | undefined;
const pendingPlayerMessages: Record<string, unknown>[] = [];
let sendPlayerMessage: ((message: Record<string, unknown>) => void) | undefined;

/**
 * The composed runtime evaluates in its own earlier module script, before any
 * authored frame module. It creates the private player channel here, binds the
 * native port methods before authored code can patch their prototype, and
 * transfers the other end exactly once. Neither port is placed on window.
 */
if (play?.shell === true && embedded) {
	const channel = new MessageChannel();
	const port = channel.port1;
	const postMessage = port.postMessage.bind(port);
	const addMessageListener = port.addEventListener.bind(port);
	const startPort = port.start.bind(port);
	sendPlayerMessage = (message) => postMessage(message);
	addMessageListener("message", (event) => {
		const message = event.data;
		if (typeof message !== "object" || message === null || Array.isArray(message)) return;
		if (playerMessageHandler === undefined) {
			const pending = message as Record<string, unknown>;
			const navigationDecision =
				pending.spool === "player-command" &&
				(pending.command === "transition" ||
					pending.command === "transition-commit" ||
					pending.command === "transition-apply" ||
					pending.command === "prepare");
			if (navigationDecision) {
				const previous = pendingPlayerMessages.findIndex(
					(candidate) =>
						candidate.spool === "player-command" &&
						(candidate.command === "transition" ||
							candidate.command === "transition-commit" ||
							candidate.command === "transition-apply" ||
							candidate.command === "prepare"),
				);
				if (previous >= 0) {
					pendingPlayerMessages.splice(previous, 1);
				} else if (pendingPlayerMessages.length >= 32) {
					pendingPlayerMessages.shift();
				}
				pendingPlayerMessages.push(pending);
			} else if (pending.spool === "player-geometry") {
				const previous = pendingPlayerMessages.findIndex((candidate) => candidate.spool === "player-geometry");
				if (previous >= 0) {
					pendingPlayerMessages.splice(previous, 1);
				} else if (pendingPlayerMessages.length >= 32) {
					pendingPlayerMessages.shift();
				}
				pendingPlayerMessages.push(pending);
			} else if (pendingPlayerMessages.length < 32) {
				pendingPlayerMessages.push(pending);
			}
			return;
		}
		playerMessageHandler(message as Record<string, unknown>);
	});
	startPort();
	window.parent.postMessage(
		{
			spool: "player-connect",
			frames: Object.entries(play.frames).map(([name, geometry]) => ({ name, ...geometry })),
		},
		"*",
		[channel.port2],
	);
}

function receivePlayerMessages(handler: PlayerMessageHandler): void {
	playerMessageHandler = handler;
	for (const message of pendingPlayerMessages.splice(0)) handler(message);
}

function postPlayerMessage(message: Record<string, unknown>): void {
	sendPlayerMessage?.(message);
}

if (play?.shell === true && embedded) {
	const reportRuntimeError = (value: unknown) => {
		const error =
			value instanceof Error
				? value.stack || value.message
				: typeof value === "string"
					? value
					: "the authored runtime failed";
		postPlayerMessage({ spool: "player-runtime-error", error: error.slice(0, 100_000) });
	};
	addEventListener("error", (event) => {
		if (thrownByAnExtension(event.filename, event.error)) return;
		reportRuntimeError(event.error ?? event.message);
	});
	addEventListener("unhandledrejection", (event) => {
		if (thrownByAnExtension(undefined, event.reason)) return;
		reportRuntimeError(event.reason);
	});
}

/** No authored frame is ever served from one of these, so a throw site here is not the frame's. */
const EXTENSION_SCRIPT =
	/^(?:chrome-extension|moz-extension|safari-web-extension|safari-extension|webkit-masked-url):\/\//;
/** Authored code always executes from a served document or module, so the frame's own throw sites carry these. */
const SERVED_SCRIPT = /^https?:\/\//;

/**
 * A browser extension's content script runs inside this document and its own
 * failures land on these listeners — MetaMask's inpage.js is the usual one, and
 * it used to take the whole player down with it. Chrome exempts content scripts
 * from page CSP and from the sandbox attribute, so refusing to blame the frame
 * is the only move spool has. Judged by throw site, not by the whole stack: an
 * extension calling into frame code still reports the frame's fault. A site is
 * the frame's only when it is a served URL: extensions that inject inline show
 * bare filenames (`inpage.js:7`) with no scheme at all (#185), and no authored
 * module ever runs schemeless.
 */
function thrownByAnExtension(filename: string | undefined, value: unknown): boolean {
	if (filename !== undefined && filename !== "") {
		return EXTENSION_SCRIPT.test(filename) || !SERVED_SCRIPT.test(filename);
	}
	if (!(value instanceof Error) || value.stack === undefined) return false;
	const site = value.stack.match(/(?:[a-z-]+:\/\/[^\s)]+|\b[\w.-]+\.[cm]?js:\d+)/)?.[0];
	if (site === undefined) return false;
	return EXTENSION_SCRIPT.test(site) || !SERVED_SCRIPT.test(site);
}
// --- clipboard --------------------------------------------------------------

interface PendingClipboardWrite {
	frame: string;
	resolve(): void;
	reject(error: unknown): void;
}

type ClipboardFailureResult = Extract<ClipboardCopyResult, { error: unknown }>;

const MAX_PENDING_CLIPBOARD_WRITES = 1024;
const pendingClipboardWrites = new Map<number, PendingClipboardWrite>();
const fillRandom = window.crypto.getRandomValues.bind(window.crypto);

function randomRequestId(inUse: (id: number) => boolean): number | undefined {
	for (let attempt = 0; attempt < 32; attempt++) {
		const words = new Uint32Array(2);
		fillRandom(words);
		const id = ((words[0] ?? 0) & 0x1f_ffff) * 0x1_0000_0000 + (words[1] ?? 0);
		if (id > 0 && !inUse(id)) return id;
	}
	return undefined;
}

function clipboardRequestId(): number | undefined {
	return randomRequestId((id) => pendingClipboardWrites.has(id));
}

function copy(text: string): Promise<void> {
	if (typeof text !== "string") return Promise.reject(new TypeError("ui.copy text must be a string"));
	if (!embedded) {
		return Promise.reject(new DOMException("Clipboard writes require the canvas or player", "NotSupportedError"));
	}
	if (play !== undefined && play.shell !== true) {
		return Promise.reject(new DOMException("Clipboard writes require the canvas or player", "NotSupportedError"));
	}
	if (
		(play?.shell === true && pendingMount !== undefined) ||
		(play === undefined && embeddedWalkPending !== undefined)
	) {
		return Promise.reject(new DOMException("Clipboard request interrupted by navigation", "AbortError"));
	}
	if (pendingClipboardWrites.size >= MAX_PENDING_CLIPBOARD_WRITES) {
		return Promise.reject(new DOMException("Too many pending clipboard writes", "QuotaExceededError"));
	}
	const id = clipboardRequestId();
	if (id === undefined) {
		return Promise.reject(new DOMException("Could not allocate a clipboard request", "OperationError"));
	}
	const frame = play === undefined ? doc.frame : currentFrame;
	return new Promise<void>((resolve, reject) => {
		pendingClipboardWrites.set(id, { frame, resolve, reject });
		if (play?.shell === true) {
			postPlayerMessage({ spool: "copy", frame, id, text });
		} else {
			window.parent.postMessage({ spool: "copy", frame, id, text }, "*");
		}
	});
}

function settleClipboardWrite(result: ClipboardCopyResult): void {
	const pending = pendingClipboardWrites.get(result.id);
	if (pending === undefined || pending.frame !== result.frame) return;
	pendingClipboardWrites.delete(result.id);
	if (isClipboardFailureResult(result)) {
		pending.reject(new DOMException(result.error.message, result.error.name));
	} else {
		pending.resolve();
	}
}

function isClipboardFailureResult(result: ClipboardCopyResult): result is ClipboardFailureResult {
	return Object.hasOwn(result, "error");
}

function abortClipboardWrites(): void {
	if (pendingClipboardWrites.size === 0) return;
	const error = new DOMException("Clipboard request interrupted by navigation", "AbortError");
	for (const pending of pendingClipboardWrites.values()) pending.reject(error);
	pendingClipboardWrites.clear();
}

if (play === undefined) {
	addEventListener("message", (event) => {
		if (event.source !== window.parent) return;
		const result = parseClipboardCopyResult(event.data);
		if (result !== undefined) {
			settleClipboardWrite(result);
			return;
		}
		const decision = parseWalkDecision(event.data);
		if (decision === undefined || decision.frame !== doc.frame || decision.id !== embeddedWalkPending?.id) {
			return;
		}
		const pending = embeddedWalkPending;
		embeddedWalkPending = undefined;
		if (decision.accepted || (decision.reason === "missing" && pending.direction === "back")) {
			if (pending.direction === "go") stack.push(doc.frame);
			else stack.pop();
			persist();
		}
	});
}
addEventListener("pagehide", abortClipboardWrites);
// --- reactive state ---------------------------------------------------------

const stateTarget: SpoolState = {};
const listeners = new Set<() => void>();
const proxies = new WeakMap<object, object>();
let version = 0;
let playerBooted = false;

function notify(): void {
	version++;
	for (const listener of listeners) listener();
	if (playerBooted && play?.shell === true) postPlayerState();
	schedulePersist();
}

interface ReactDispatcher {
	useState?: unknown;
	useMemo?: unknown;
}

interface ReactInternals {
	H?: ReactDispatcher | null;
	ReactCurrentDispatcher?: { current: ReactDispatcher | null };
}

/**
 * "Is a component body running right now?" React publishes no such flag, but
 * its shared dispatcher is one: while a component renders, the dispatcher is
 * the real hooks implementation — a distinct function per hook — and
 * everywhere else (commit, effects, event handlers, timers) React installs the
 * context-only dispatcher, whose every hook is the same throwing stub. Before
 * the first render there is no dispatcher at all. A React that renames these
 * fields reads as "not rendering", so the warning goes quiet instead of
 * guessing.
 */
function renderingComponent(): boolean {
	const react = React as unknown as {
		__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternals;
		__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: ReactInternals;
	};
	const internals =
		react.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ??
		react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
	const dispatcher = internals?.H ?? internals?.ReactCurrentDispatcher?.current;
	return dispatcher != null && dispatcher.useState !== dispatcher.useMemo;
}

const warnedRenderWrites = new Set<string>();

/** The first stack frame outside this module: the frame's own write site. */
function writeSite(): string {
	const here = import.meta.url;
	const lines = (new Error().stack ?? "").split("\n").slice(1);
	return lines.find((line) => line.includes("at ") && !line.includes(here))?.trim() ?? "";
}

/**
 * Writing session state from a render is silent data loss (#183): the write
 * lands in the object, but it notifies the subscribed frame mid-render, React
 * re-runs the body, and the value that render read is gone — the one-shot flag
 * a walk hands over reads as if the frame arrived fresh. Named once per site,
 * because renders repeat and a spammed console teaches nothing.
 */
function warnRenderWrite(key: PropertyKey, verb: "written" | "deleted"): void {
	if (!renderingComponent()) return;
	const site = writeSite();
	const id = `${verb} ${String(key)} ${site}`;
	if (warnedRenderWrites.has(id)) return;
	warnedRenderWrites.add(id);
	console.warn(
		`spool: ui.state.${String(key)} was ${verb} during render — a write during render makes React run that render again, so the value this frame read is dropped. Move the write into an event handler or an effect: read a one-shot flag in render, clear it in an effect.`,
		site,
	);
}

/**
 * Deep reactive view over the session state: one version counter, any write
 * anywhere notifies every subscriber. Flat means top-level keys are the unit
 * agents reason about; nesting still reacts so mutation never goes silent.
 */
function reactive<T extends object>(target: T): T {
	const existing = proxies.get(target);
	if (existing !== undefined) return existing as T;
	const proxy = new Proxy(target, {
		get(t, key, receiver) {
			const value = Reflect.get(t, key, receiver);
			return typeof value === "object" && value !== null ? reactive(value) : value;
		},
		set(t, key, value, receiver) {
			if (Object.is(Reflect.get(t, key, receiver), value)) return true;
			// creating a key that was absent is the documented defensive seed
			// (ui.state.items ??= []) — idempotent, so a render is free to do it;
			// replacing a value that was already there is the trap
			const replaced = Reflect.has(t, key);
			const ok = Reflect.set(t, key, value, receiver);
			if (ok) {
				if (replaced) warnRenderWrite(key, "written");
				notify();
			}
			return ok;
		},
		deleteProperty(t, key) {
			const had = Reflect.has(t, key);
			const ok = Reflect.deleteProperty(t, key);
			if (ok && had) {
				warnRenderWrite(key, "deleted");
				notify();
			}
			return ok;
		},
	});
	proxies.set(target, proxy);
	return proxy as T;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function seedState(seed: Record<string, unknown>): void {
	for (const key of Object.keys(stateTarget)) delete stateTarget[key];
	Object.assign(stateTarget, structuredClone(seed));
	notify();
}

// --- session ----------------------------------------------------------------

const stack: string[] = [];
let scenarioName = "default";
let mockConfig: Record<string, unknown> = {};

const storageKey = `spool:session:${doc.project}`;

/** Sandboxed null-origin frames throw on storage access — no persistence there. */
function storage(): Storage | undefined {
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}

function parseSessionRecord(record: unknown): SessionRecord | undefined {
	if (typeof record !== "object" || record === null) return undefined;
	const { scenario, state, stack: names } = record as Partial<SessionRecord>;
	if (typeof scenario !== "string" || typeof state !== "object" || state === null) return undefined;
	if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) return undefined;
	return { scenario, state, stack: names };
}

function loadSession(): SessionRecord | undefined {
	try {
		const raw = storage()?.getItem(storageKey);
		if (raw == null) return undefined;
		return parseSessionRecord(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

/**
 * Embedded session continuity (#22): a sandboxed frame has no storage, so the
 * canvas is the keeper — on boot the frame asks its host for the in-flight
 * session and the host answers with the record a previous frame's walk posted.
 * A host that stays silent (a foreign embedder, a plain iframe) costs one
 * 250ms beat and the frame seeds from the scenario as if standalone.
 */
function requestHostSession(): Promise<SessionRecord | undefined> {
	if (!embedded) return Promise.resolve(undefined);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			removeEventListener("message", onMessage);
			resolve(undefined);
		}, 250);
		function onMessage(event: MessageEvent): void {
			const message = event.data as { spool?: string; record?: unknown } | null;
			if (message === null || typeof message !== "object" || message.spool !== "session") return;
			clearTimeout(timer);
			removeEventListener("message", onMessage);
			resolve(parseSessionRecord(message.record));
		}
		addEventListener("message", onMessage);
		post({ spool: "session?" });
	});
}

/** What the host needs to seed the next frame: storage semantics, JSON-clean. */
function sessionSnapshot(history: readonly string[] = stack): SessionRecord {
	return JSON.parse(JSON.stringify({ scenario: scenarioName, state: stateTarget, stack: history })) as SessionRecord;
}

let persistScheduled = false;

function schedulePersist(): void {
	if (persistScheduled) return;
	persistScheduled = true;
	queueMicrotask(() => {
		persistScheduled = false;
		persist();
	});
}

function persist(): void {
	// the player session is the page: a reload is a restart, never a resume
	if (play !== undefined) return;
	try {
		storage()?.setItem(storageKey, JSON.stringify({ scenario: scenarioName, state: stateTarget, stack }));
	} catch {
		// quota or sandbox: session continuity degrades, play does not
	}
}

function queryScenario(): string | undefined {
	try {
		return new URL(window.location.href).searchParams.get("scenario") ?? undefined;
	} catch {
		return undefined;
	}
}

async function loadScenario(name: string): Promise<Scenario> {
	try {
		const res = await projectFetch(`/api/p/${encodeURIComponent(doc.project)}/scenarios/${encodeURIComponent(name)}`);
		if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
		const value = (await res.json()) as Partial<Scenario>;
		return { state: value.state ?? {}, mock: value.mock ?? {} };
	} catch (error) {
		// a broken scenario never blanks the frame: loud notice, empty seed
		console.error(`spool: scenario "${name}" failed to load — playing with an empty seed`, error);
		return { state: {}, mock: {} };
	}
}

/**
 * Session start: resume the stored session when one exists, unless the URL
 * names a different scenario — switching scenario restarts the session (#5).
 * A new session re-seeds state from the scenario. Embedded, the host is the
 * storage: the handshake record plays the stored session's part.
 */
async function start(): Promise<void> {
	if (play !== undefined) {
		// the player seeds fresh every load: the URL names the scenario, and
		// reload is just restart spelled by the browser
		scenarioName = play.scenario;
		const scenario = await loadScenario(scenarioName);
		mockConfig = scenario.mock;
		seedState(scenario.state);
		return;
	}
	const requested = queryScenario();
	const record = (await requestHostSession()) ?? loadSession();
	const resume =
		record !== undefined && (requested === undefined || requested === record.scenario) ? record : undefined;
	scenarioName = resume?.scenario ?? requested ?? "default";
	const scenario = await loadScenario(scenarioName);
	mockConfig = scenario.mock;
	if (resume === undefined) {
		seedState(scenario.state);
	} else {
		seedState(resume.state);
		stack.push(...resume.stack);
	}
	persist();
}

// --- navigation -------------------------------------------------------------

function post(message: Record<string, unknown>): void {
	if (embedded) window.parent.postMessage({ ...message, frame: doc.frame }, "*");
}

function reserveEmbeddedWalk(direction: "go" | "back"): boolean {
	if (embeddedWalkPending !== undefined) return false;
	const id = randomRequestId((candidate) => candidate === lastEmbeddedWalkId);
	if (id === undefined) {
		console.error("spool: could not allocate a canvas walk");
		return false;
	}
	lastEmbeddedWalkId = id;
	embeddedWalkPending = { id, direction };
	return true;
}

function postEmbeddedWalk(message: Record<string, unknown>): void {
	const pending = embeddedWalkPending;
	if (pending === undefined) return;
	post({ ...message, id: pending.id });
}

function isFrameName(name: string): boolean {
	return name.length > 0 && !name.startsWith(".") && !name.includes("/") && !name.includes("\\");
}

/**
 * A session really walked from → to: witnessed edges draw the dashed arrows
 * (#25). Only the player reports — embedded walks ride the bridge and the
 * canvas is their witness, and standalone documents stay silent because
 * `spool shot`/`logs` boots exactly that surface: a robot's boot must never
 * mint an edge (#5: no robo-simulation). Plumbing rides nativeFetch so the
 * mock never swallows it.
 */
function reportWalk(from: string, to: string): void {
	if (play !== undefined && embedded) {
		if (play.shell === true) {
			postPlayerMessage({ spool: "player-walked", from, to });
		} else {
			window.parent.postMessage({ spool: "player-walked", from, to }, "*");
		}
	}
}

/** Sibling frame document, same project, same scenario query. */
function frameUrl(target: string): string {
	const path = window.location.pathname.replace(/[^/]+$/, encodeURIComponent(target));
	return `${path}${window.location.search}`;
}

/**
 * Probe the target document before leaving this one: a missing target is loud
 * but harmless (#5), never a dead-end 404 page that eats the session. Any
 * served answer walks — a compile-failure document is its own loud surface —
 * and the probe doubles as a prefetch that warms the compile cache.
 *
 * Only this standalone path walks by navigation, and a served frame document
 * always answers under `Content-Security-Policy: sandbox allow-scripts` (#182,
 * app.ts), so in a real browser the probe reads as cross-origin: the request
 * still warms the compile, the status never arrives, and the browser logs a
 * CORS error that this walk ignores. The 404 branch below is reachable
 * same-origin only — a bare frame document lands on the daemon's 404 text
 * instead of staying put, which the skill's url topic says out loud.
 */
async function walkTo(target: string, commit?: () => void): Promise<void> {
	const url = frameUrl(target);
	try {
		const probe = await nativeFetch(url);
		if (probe.status === 404) {
			console.error(`spool: no frame "${target}" to walk to`);
			return;
		}
	} catch {
		// the probe failing is no reason to hold the walk — let the browser tell
	}
	abortClipboardWrites();
	commit?.();
	window.location.assign(url);
}

function navigate(target: string, patch?: Record<string, unknown>, transition?: string): void {
	if (!isFrameName(target)) {
		console.error(`spool: not a frame name: "${target}"`);
		return;
	}
	if (play !== undefined && deferPlayerAction(() => navigate(target, patch, transition))) return;
	// the patch is a write like any other: it lands in the stay it belongs to,
	// and rolls up into this hop's changed keys
	if (patch !== undefined) Object.assign(state, patch);
	if (play === undefined && embedded && !reserveEmbeddedWalk("go")) return;
	if (play !== undefined) {
		// the composition is the map: a target outside it is loud but harmless,
		// exactly like a frame document's failed probe (#5)
		if (!Object.hasOwn(play.frames, target)) {
			console.error(`spool: no frame "${target}" to walk to`);
			return;
		}
		abortClipboardWrites();
		const from = currentFrame;
		stack.push(from);
		reportWalk(from, target);
		currentFrame = target;
		requestScreenSwap(from, "forward", transition);
		return;
	}
	if (embedded) {
		// the host owns embedded walks; the snapshot rides along so it can
		// seed the target frame's boot with this session
		abortClipboardWrites();
		postEmbeddedWalk({ spool: "go", target, session: sessionSnapshot([...stack, doc.frame]) });
		return;
	}
	// the push commits only when the walk really happens, so a typo'd target
	// can never corrupt what ui.back() means
	void walkTo(target, () => {
		stack.push(doc.frame);
		persist();
	});
}

function go(target: string, patch?: Record<string, unknown>): void {
	navigate(target, patch);
}

function back(): void {
	if (deferPlayerAction(back)) return;
	const target = stack.at(-1);
	if (target === undefined) return;
	if (play !== undefined) {
		stack.pop();
		abortClipboardWrites();
		const from = currentFrame;
		currentFrame = target;
		requestScreenSwap(from, "back");
		return;
	}
	if (embedded && !reserveEmbeddedWalk("back")) return;
	// the pop stays committed even if the frame vanished mid-session: backing
	// past a deleted frame beats retrying it forever
	if (embedded) {
		abortClipboardWrites();
		postEmbeddedWalk({ spool: "back", target, session: sessionSnapshot(stack.slice(0, -1)) });
		return;
	}
	stack.pop();
	persist();
	void walkTo(target);
}

/**
 * A walk the reader asked spool for rather than the prototype: the edge bar's
 * switcher, and the browser's own back and forward buttons (#227).
 *
 * It moves the session exactly the way an authored walk does — same name-stack,
 * same screen swap, same direction riding the View Transition — and witnesses
 * nothing. Nobody pressed anything inside the prototype, so there is no claim on
 * the flow map for this to verify (#25): reporting it would mint a verified edge
 * out of a press on spool's own chrome.
 */
function jump(target: string, back: boolean): void {
	if (play === undefined) return;
	if (deferPlayerAction(() => jump(target, back))) return;
	if (!Object.hasOwn(play.frames, target)) {
		console.error(`spool: no frame "${target}" to walk to`);
		return;
	}
	abortClipboardWrites();
	const from = currentFrame;
	// Stepping back onto the frame the stack was holding pops it, so the walk
	// history and the browser's agree on where back goes next.
	if (back && stack.at(-1) === target) stack.pop();
	else stack.push(from);
	currentFrame = target;
	requestScreenSwap(from, back ? "back" : "forward");
}

/**
 * data-go: click-only sugar on any element, nearest ancestor wins, anchors
 * get preventDefault. A data-transition on the same element names the
 * per-link transition type (#24) — meaningful in the player, inert elsewhere.
 * Everything richer calls ui.go from code.
 */
function bindDataGo(): void {
	window.document.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const carrier = event.target.closest("[data-go]");
		if (carrier === null) return;
		const target = carrier.getAttribute("data-go");
		if (target === null || target === "") return;
		event.preventDefault();
		navigate(target, undefined, carrier.getAttribute("data-transition") ?? undefined);
	});
}

/** Plain web anchors leave through the owning Spool surface, never through a screen. */
function bindExternalLinks(): void {
	window.document.addEventListener("click", (event) => {
		if (event.defaultPrevented) return;
		if (!(event.target instanceof Element)) return;
		const anchor = event.target.closest("a[href]");
		if (!(anchor instanceof HTMLAnchorElement)) return;
		const href = anchor.getAttribute("href");
		if (href === null || href.startsWith("#")) return;
		let url: URL;
		try {
			url = new URL(href, window.location.href);
		} catch {
			return;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") return;
		if (play === undefined && !embedded) return;
		url.username = "";
		url.password = "";
		event.preventDefault();
		if (play !== undefined) {
			externalHref = url.href;
			notifyPlay();
		} else {
			post({ spool: "external", href: url.href });
		}
	});
}

// --- player (#24) -----------------------------------------------------------

let arrival = 0;
let motionOn = true;
let externalHref: string | null = null;
let playVersion = 0;
const playListeners = new Set<() => void>();
let navigationGeneration = 0;
let stateSequence = 0;
let playerReady = play?.shell !== true;

function notifyPlay(): void {
	playVersion++;
	for (const listener of playListeners) listener();
	if (play?.shell === true) postPlayerState();
}

function postPlayerState(): void {
	if (!embedded || play?.shell !== true) return;
	const read = playerController.read();
	postPlayerMessage({
		spool: "player-state",
		generation: navigationGeneration,
		sequence: ++stateSequence,
		state: {
			frame: read.frame,
			arrival: read.arrival,
			externalHref: read.externalHref,
		},
	});
}

type SwapDirection = "forward" | "back";
interface PendingMount {
	generation: number;
	from: string;
	to: string;
	w: number;
	h: number;
	mounted: boolean;
	decision?: "transition" | "transition-commit" | "cut" | undefined;
	direction: SwapDirection;
	transition?: string | undefined;
	controllerCommand?: PlayerControllerCommand | undefined;
}
let pendingMount: PendingMount | undefined;
const deferredPlayerActions: (() => void)[] = [];

/**
 * A destination effect can run after React commits the hard cut but before
 * the shell settles it. Preserve that intent until the prior generation is
 * closed; code still running on the unmounted source stays inert.
 */
function deferPlayerAction(action: () => void): boolean {
	if (pendingMount === undefined) return false;
	if (pendingMount.mounted) deferredPlayerActions.push(action);
	return true;
}

function replayDeferredPlayerActions(): void {
	while (pendingMount === undefined) {
		const action = deferredPlayerActions.shift();
		if (action === undefined) return;
		action();
	}
}

/** A viewport resize cannot join a View Transition without filming stale pixels. */
function requestScreenSwap(fromFrame: string, direction: SwapDirection, transition?: string): void {
	if (pendingMount?.mounted === true) pendingMount = undefined;
	const from = play?.frames[fromFrame];
	const to = play?.frames[currentFrame];
	navigationGeneration++;
	if (play?.shell === true && embedded && from !== undefined && to !== undefined) {
		pendingMount = {
			generation: navigationGeneration,
			from: fromFrame,
			to: currentFrame,
			w: to.w,
			h: to.h,
			mounted: false,
			direction,
			transition,
		};
		postPlayerMessage({
			spool: "player-navigate",
			generation: pendingMount.generation,
			from: pendingMount.from,
			to: pendingMount.to,
			w: window.innerWidth,
			h: window.innerHeight,
		});
		return;
	}
	mountedFrame = currentFrame;
	swapScreen(direction, transition);
}

/**
 * Swap the active screen, letting the View Transitions API film it: the
 * direction rides as a transition type, any data-transition override on top,
 * so transitions.css can style forward, back, and named moves apart. Default
 * is the API's own crossfade; morphs come free from matching
 * view-transition-names because the screens share one document. No API, or
 * motion off: the swap lands bare — reduce-motion means never starting a
 * transition at all.
 */
function swapScreen(direction: SwapDirection, transition?: string, committed?: () => void): void {
	arrival++;
	externalHref = null;
	const update = () => {
		flushSync(notifyPlay);
		committed?.();
	};
	const startViewTransition = (
		window.document as {
			startViewTransition?: (options: { update: () => void; types: string[] } | (() => void)) => unknown;
		}
	).startViewTransition?.bind(window.document);
	// A startup auto-walk can land before the shell has ever revealed the
	// source. Commit it directly: there are no visible old pixels to film.
	if (!motionOn || !playerReady || startViewTransition === undefined) {
		update();
		return;
	}
	const types = transition === undefined ? [direction] : [direction, transition];
	try {
		startViewTransition({ update, types });
	} catch {
		// a View Transitions v1 engine: plain callback, default crossfade —
		// and whatever the engine does, the swap itself must always land
		try {
			startViewTransition(update);
		} catch {
			update();
		}
	}
}

interface PlayerControllerCommand {
	request: number;
	command: string;
	generation: number;
	frame: string;
}

function playerControllerCommand(
	message: Record<string, unknown>,
	command: string,
	extra: string[] = [],
): PlayerControllerCommand | undefined {
	const required = ["spool", "command", "request", "generation", "frame", ...extra];
	const keys = Object.keys(message);
	if (
		keys.length !== required.length ||
		!required.every((key) => keys.includes(key)) ||
		message.spool !== "player-command" ||
		message.command !== command ||
		typeof message.request !== "number" ||
		!Number.isSafeInteger(message.request) ||
		message.request <= 0 ||
		typeof message.generation !== "number" ||
		!Number.isInteger(message.generation) ||
		typeof message.frame !== "string" ||
		!(
			(message.generation === navigationGeneration && message.frame === currentFrame) ||
			(pendingMount !== undefined &&
				message.generation === pendingMount.generation - 1 &&
				message.frame === pendingMount.from)
		)
	) {
		return;
	}
	return {
		request: message.request,
		command,
		generation: message.generation,
		frame: message.frame,
	};
}

function completePlayerControllerCommand(command: PlayerControllerCommand, outcome: "completed" | "failed"): void {
	postPlayerMessage({
		spool: "player-command-complete",
		request: command.request,
		command: command.command,
		generation: command.generation,
		frame: command.frame,
		outcome,
	});
}

let deferredPlayerControllerCommand: (() => void) | undefined;

function deferPlayerControllerCommand(action: () => void): boolean {
	if (pendingMount === undefined) return false;
	deferredPlayerControllerCommand = action;
	return true;
}

function replayDeferredPlayerControllerCommand(): void {
	if (pendingMount !== undefined) return;
	const action = deferredPlayerControllerCommand;
	if (action === undefined) return;
	deferredPlayerControllerCommand = undefined;
	action();
}

function completeAfterNavigation(command: PlayerControllerCommand): void {
	const mount = pendingMount;
	if (mount === undefined) {
		completePlayerControllerCommand(command, "completed");
		return;
	}
	mount.controllerCommand = command;
}

function runDismissExternalControllerCommand(command: PlayerControllerCommand): void {
	if (deferPlayerControllerCommand(() => runDismissExternalControllerCommand(command))) return;
	playerController.dismissExternal();
	completePlayerControllerCommand(command, "completed");
}

function runWalkControllerCommand(command: PlayerControllerCommand, to: string, back: boolean): void {
	if (deferPlayerControllerCommand(() => runWalkControllerCommand(command, to, back))) return;
	// A screen that left the composition mid-session is a walk that cannot be
	// taken, and it says so: a command that went quiet would leave the shell
	// waiting on a completion that never comes, with everything behind it stuck.
	if (play === undefined || !Object.hasOwn(play.frames, to)) {
		completePlayerControllerCommand(command, "failed");
		return;
	}
	jump(to, back);
	completeAfterNavigation(command);
}

function handlePlayerControllerCommand(message: Record<string, unknown>): boolean {
	switch (message.command) {
		case "walk": {
			const command = playerControllerCommand(message, "walk", ["to", "back"]);
			if (command !== undefined && typeof message.to === "string" && typeof message.back === "boolean") {
				runWalkControllerCommand(command, message.to, message.back);
			}
			return true;
		}
		case "dismiss-external": {
			const command = playerControllerCommand(message, "dismiss-external");
			if (command !== undefined) runDismissExternalControllerCommand(command);
			return true;
		}
		default:
			return false;
	}
}

/**
 * The canvas owns geometry: the player follows sidecar changes over the
 * control shell's bridge so every screen remains fitted to its current size.
 */
function followGeometry(): void {
	const config = play;
	if (config === undefined || !embedded) return;
	let geometryRevision = 0;
	let geometryReadyScheduled = false;
	/**
	 * Something asked while a pass was already in flight. The ask is kept rather
	 * than dropped, because the two are not the same question: a resize landing
	 * mid-pass means the frame this pass is about to measure has not finished
	 * changing size, so the pass reads the old box, says nothing, and nothing is
	 * left to ask again. That is a shell that waits on a reveal forever.
	 */
	let geometryReadyAgain = false;
	const scheduleGeometryReady = () => {
		if (geometryRevision === 0) return;
		if (geometryReadyScheduled) {
			geometryReadyAgain = true;
			return;
		}
		geometryReadyScheduled = true;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				geometryReadyScheduled = false;
				const geometry = config.frames[currentFrame];
				if (geometry !== undefined && window.innerWidth === geometry.w && window.innerHeight === geometry.h) {
					geometryReadyAgain = false;
					postPlayerMessage({
						spool: "player-geometry-ready",
						revision: geometryRevision,
						frame: currentFrame,
						w: window.innerWidth,
						h: window.innerHeight,
					});
					return;
				}
				if (!geometryReadyAgain) return;
				geometryReadyAgain = false;
				scheduleGeometryReady();
			});
		});
	};
	receivePlayerMessages((message) => {
		const clipboard = parseClipboardCopyResult(message);
		if (clipboard !== undefined) {
			settleClipboardWrite(clipboard);
			return;
		}
		if (message.spool === "player-geometry") {
			if (
				typeof message.revision !== "number" ||
				!Number.isInteger(message.revision) ||
				message.revision <= geometryRevision ||
				!Array.isArray(message.frames)
			) {
				return;
			}
			geometryRevision = message.revision;
			let moved = false;
			for (const frame of message.frames) {
				if (!isPlayerGeometry(frame)) continue;
				const known = Object.hasOwn(config.frames, frame.name) ? config.frames[frame.name] : undefined;
				if (known !== undefined && (known.w !== frame.w || known.h !== frame.h)) {
					config.frames[frame.name] = { w: frame.w, h: frame.h };
					if (pendingMount?.to === frame.name) {
						pendingMount.w = frame.w;
						pendingMount.h = frame.h;
					}
					moved = true;
				}
			}
			if (moved) {
				notifyPlay();
				announcePendingMount();
			}
			scheduleGeometryReady();
			return;
		}
		if (message.spool !== "player-command") return;
		if (handlePlayerControllerCommand(message)) return;
		if (
			typeof message.generation !== "number" ||
			message.generation !== navigationGeneration ||
			message.frame !== currentFrame
		) {
			return;
		}
		switch (message.command) {
			case "transition": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					mount.mounted ||
					mount.decision === "cut" ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					!isPositivePlayerInteger(message.w) ||
					!isPositivePlayerInteger(message.h) ||
					currentFrame !== mount.to ||
					mountedFrame !== mount.from ||
					message.w !== mount.w ||
					message.h !== mount.h ||
					window.innerWidth !== message.w ||
					window.innerHeight !== message.h
				) {
					if (
						mount !== undefined &&
						!mount.mounted &&
						message.generation === mount.generation &&
						message.from === mount.from &&
						message.to === mount.to
					) {
						postPlayerMessage({
							spool: "player-transition-mismatch",
							generation: mount.generation,
							from: mount.from,
							to: mount.to,
							w: window.innerWidth,
							h: window.innerHeight,
						});
					}
					return;
				}
				mount.decision = "transition";
				postPlayerMessage({
					spool: "player-transition-ready",
					generation: mount.generation,
					from: mount.from,
					to: mount.to,
					w: mount.w,
					h: mount.h,
				});
				return;
			}
			case "transition-commit": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					mount.mounted ||
					mount.decision !== "transition" ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					message.w !== mount.w ||
					message.h !== mount.h ||
					currentFrame !== mount.to ||
					mountedFrame !== mount.from ||
					window.innerWidth !== mount.w ||
					window.innerHeight !== mount.h
				) {
					if (mount !== undefined && !mount.mounted && message.generation === mount.generation) {
						postPlayerMessage({
							spool: "player-transition-mismatch",
							generation: mount.generation,
							from: mount.from,
							to: mount.to,
							w: window.innerWidth,
							h: window.innerHeight,
						});
					}
					return;
				}
				mount.decision = "transition-commit";
				postPlayerMessage({
					spool: "player-transition-commit-ready",
					generation: mount.generation,
					from: mount.from,
					to: mount.to,
					w: mount.w,
					h: mount.h,
				});
				return;
			}
			case "transition-apply": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					mount.mounted ||
					mount.decision !== "transition-commit" ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					message.w !== mount.w ||
					message.h !== mount.h ||
					currentFrame !== mount.to ||
					mountedFrame !== mount.from ||
					window.innerWidth !== mount.w ||
					window.innerHeight !== mount.h
				) {
					if (mount !== undefined && !mount.mounted && message.generation === mount.generation) {
						postPlayerMessage({
							spool: "player-transition-mismatch",
							generation: mount.generation,
							from: mount.from,
							to: mount.to,
							w: window.innerWidth,
							h: window.innerHeight,
						});
					}
					return;
				}
				mount.mounted = true;
				mountedFrame = mount.to;
				swapScreen(mount.direction, mount.transition, () => {
					if (pendingMount !== mount) return;
					postPlayerMessage({
						spool: "player-transitioned",
						generation: mount.generation,
						from: mount.from,
						to: mount.to,
						w: mount.w,
						h: mount.h,
					});
					pendingMount = undefined;
					if (mount.controllerCommand !== undefined) {
						completePlayerControllerCommand(mount.controllerCommand, "completed");
					}
					replayDeferredPlayerControllerCommand();
					replayDeferredPlayerActions();
				});
				return;
			}
			case "prepare": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					mount.mounted ||
					mount.decision === "cut" ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					!isPositivePlayerInteger(message.w) ||
					!isPositivePlayerInteger(message.h) ||
					currentFrame !== mount.to ||
					mountedFrame !== mount.from
				) {
					return;
				}
				mount.decision = "cut";
				mount.w = message.w;
				mount.h = message.h;
				config.frames[mount.to] = { w: mount.w, h: mount.h };
				notifyPlay();
				announcePendingMount();
				return;
			}
			case "mount": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					message.w !== mount.w ||
					message.h !== mount.h ||
					currentFrame !== mount.to ||
					window.innerWidth !== mount.w ||
					window.innerHeight !== mount.h
				) {
					return;
				}
				if (!mount.mounted) {
					if (mountedFrame !== mount.from) return;
					mount.mounted = true;
					mountedFrame = mount.to;
					arrival++;
					externalHref = null;
					flushSync(notifyPlay);
				} else if (mountedFrame !== mount.to) {
					return;
				}
				announcePendingMount();
				return;
			}
			case "settle": {
				const mount = pendingMount;
				if (
					mount === undefined ||
					!mount.mounted ||
					message.generation !== mount.generation ||
					message.from !== mount.from ||
					message.to !== mount.to ||
					message.w !== window.innerWidth ||
					message.h !== window.innerHeight ||
					currentFrame !== mount.to ||
					mountedFrame !== mount.to
				) {
					return;
				}
				const controllerCommand = mount.controllerCommand;
				pendingMount = undefined;
				if (controllerCommand !== undefined) {
					completePlayerControllerCommand(controllerCommand, "completed");
				}
				replayDeferredPlayerControllerCommand();
				replayDeferredPlayerActions();
				return;
			}
		}
	});
	if (config.shell === true) {
		addEventListener("resize", () => {
			announcePendingMount();
			scheduleGeometryReady();
		});
		// Where the pointer is, not merely that it moved: the edge bar is summoned
		// by resting against the top of the window, and this document covers it,
		// so the shell can only know where the hand is by being told (#227).
		addEventListener("mousemove", (event) => {
			postPlayerMessage({ spool: "player-wake", y: event.clientY });
		});
		// And that it has gone. A pointer on its way to the browser's own chrome
		// crosses the top edge and leaves; without this the dwell it started on
		// the way through would finish and peel the bar in behind it.
		window.document.documentElement.addEventListener("mouseleave", () => {
			postPlayerMessage({ spool: "player-wake", y: -1 });
		});
		// Spool never steals a plain key from a live frame; its own gesture lives
		// behind accel (#227). Focus sits in here whenever a prototype is being
		// used, so this chord only reaches the shell by being forwarded.
		addEventListener("keydown", (event) => {
			if (accelChord(event) === undefined) return;
			event.preventDefault();
			postPlayerMessage({ spool: "player-key", key: "leave" });
		});
	}
}

function cutMessage(
	spool: string,
	mount: PendingMount,
	w = window.innerWidth,
	h = window.innerHeight,
): Record<string, unknown> {
	return {
		spool,
		generation: mount.generation,
		from: mount.from,
		to: mount.to,
		w,
		h,
	};
}

function announcePendingMount(): void {
	const mount = pendingMount;
	if (mount === undefined) return;
	if (!mount.mounted) {
		postPlayerMessage(cutMessage("player-viewport", mount));
		return;
	}
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (pendingMount !== mount || !mount.mounted) return;
			postPlayerMessage(cutMessage("player-mounted", mount));
		});
	});
}

function isPlayerGeometry(value: unknown): value is { name: string; w: number; h: number } {
	if (typeof value !== "object" || value === null) return false;
	const { name, w, h } = value as { name?: unknown; w?: unknown; h?: unknown };
	return (
		typeof name === "string" &&
		typeof w === "number" &&
		Number.isInteger(w) &&
		w > 0 &&
		typeof h === "number" &&
		Number.isInteger(h) &&
		h > 0
	);
}

function isPositivePlayerInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function closePlayer(): void {
	if (!embedded) return;
	if (play?.shell === true) {
		postPlayerMessage({ spool: "player-close" });
	} else {
		window.parent.postMessage({ spool: "player-close" }, "*");
	}
}

const playerController: PlayerController = {
	subscribe(listener) {
		playListeners.add(listener);
		return () => playListeners.delete(listener);
	},
	version: () => playVersion,
	read: () => ({ frame: currentFrame, arrival, externalHref }),
	// the fallback restates the projection's default footprint across the
	// compile-unit boundary; unreachable while navigate guards membership
	geometry: (frame) =>
		play !== undefined && Object.hasOwn(play.frames, frame)
			? (play.frames[frame] as { w: number; h: number })
			: { w: 1440, h: 900 },
	frames: () => (play === undefined ? [] : Object.keys(play.frames)),
	terminal: (frame) => play?.terminals !== undefined && Object.hasOwn(play.terminals, frame),
	walk: (frame, back = false) => jump(frame, back),
	dismissExternal() {
		if (externalHref === null) return;
		externalHref = null;
		notifyPlay();
	},
	close: closePlayer,
};

/**
 * Stands in for a frame the player could not compile. The served composition
 * calls this instead of importing that frame, so one bad import costs its own
 * screen and nothing else. Not in spool-public.d.ts on purpose: generated
 * composition code reaches for it, authored frames have no business with it.
 */
export function brokenFrame(details: { frame: string; file: string; error: string }): ComponentType {
	return () => createElement(BrokenFrame, details);
}

/**
 * Boot the /play/ document (#24): called by the served composition with every
 * frame component, after this module's top-level await has seeded the session
 * — the first paint of any screen sees seeded state and an installed mock.
 */
export function bootPlayer(frames: Record<string, ComponentType>): void {
	if (play === undefined) {
		throw new Error("spool: bootPlayer only runs inside a /play/ document");
	}
	const config = play;
	motionOn = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const root = window.document.getElementById("root");
	if (root === null) throw new Error("spool: the player document has no #root");
	// Terminal frames keep their screen shape and persisted poster, but their
	// document is a Spool-owned disabled surface until an OS sandbox exists.
	const termScreens = Object.fromEntries(
		Object.entries(config.terminals ?? {}).map(([name, screen]) => [
			name,
			() =>
				createElement(TermScreen, {
					src: `/p/${encodeURIComponent(config.project)}/frames/${encodeURIComponent(name)}`,
					poster: screen.svg,
					title: name,
				}),
		]),
	);
	followGeometry();
	const screens = Object.fromEntries([...Object.entries(frames), ...Object.entries(termScreens)]);
	playerBooted = true;
	if (config.shell === true) {
		const playerRoot = createRoot(root);
		flushSync(() => playerRoot.render(createElement(PlayerDocument, { frames: screens })));
		postPlayerState();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const geometry = config.frames[mountedFrame];
				if (geometry === undefined) return;
				playerReady = true;
				postPlayerMessage({
					spool: "player-ready",
					generation: navigationGeneration,
					frame: mountedFrame,
					w: window.innerWidth,
					h: window.innerHeight,
				});
			});
		});
		return;
	}
	createRoot(root).render(
		createElement(Player, { project: config.project, frames: screens, controller: playerController }),
	);
}

function PlayerDocument({ frames }: { frames: Record<string, ComponentType> }) {
	useSyncExternalStore(playerController.subscribe, playerController.version);
	const Screen = frames[mountedFrame];
	return Screen === undefined ? null : createElement(Screen, { key: arrival });
}

// --- mock -------------------------------------------------------------------

interface MockRule {
	status?: number;
	fixture?: string;
	latency?: number;
	body?: unknown;
}

const RULE_KEYS = new Set(["status", "fixture", "latency", "body"]);
const JSON_HEADERS = { "content-type": "application/json" };

/** A rule object uses reserved keys only; any other object is an inline body. */
function asRule(value: unknown): MockRule | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const keys = Object.keys(value);
	if (keys.length === 0 || !keys.every((key) => RULE_KEYS.has(key))) return undefined;
	return value as MockRule;
}

function isAbsolute(url: string): boolean {
	return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fixtureUrl(name: string): string {
	const path = name.split("/").map(encodeURIComponent).join("/");
	return `/api/p/${encodeURIComponent(doc.project)}/fixtures/${path}`;
}

/** Method-prefixed key wins over the bare path; "latency" is the reserved dial. */
function lookupRule(method: string, path: string): unknown {
	return mockConfig[`${method} ${path}`] ?? (path === "latency" ? undefined : mockConfig[path]);
}

async function ruleResponse(value: unknown): Promise<Response | undefined> {
	const rule = asRule(value);
	if (rule === undefined) return jsonResponse(value, 200);
	if (rule.body !== undefined) return jsonResponse(rule.body, rule.status ?? 200);
	if (rule.fixture !== undefined) {
		const res = await projectFetch(fixtureUrl(rule.fixture));
		// a configured-but-broken fixture surfaces the daemon's message verbatim
		if (!res.ok) return new Response(await res.text(), { status: res.status });
		return new Response(await res.text(), { status: rule.status ?? 200, headers: JSON_HEADERS });
	}
	if (rule.status !== undefined) return new Response(null, { status: rule.status });
	return undefined; // latency-only rule: shapes timing, body resolves by convention
}

/** Zero config: /api/<name> serves shared/fixtures/<name>.json, any method. */
async function conventionResponse(path: string): Promise<Response | undefined> {
	if (!path.startsWith("/api/")) return undefined;
	const name = path.slice("/api/".length).replace(/\/+$/, "");
	if (name.length === 0) return undefined;
	const res = await projectFetch(fixtureUrl(name));
	if (res.status === 404) return undefined;
	if (!res.ok) return new Response(await res.text(), { status: res.status });
	return new Response(await res.text(), { status: 200, headers: JSON_HEADERS });
}

/**
 * The boundary (#5): relative URL strings are the fake backend, absolute URLs
 * pass through to the real network. Resolution order — [slot zero reserved
 * for the programmable shared/mock.js handler layer] → scenario rules →
 * fixtures convention → 404. Writes are theater: any method gets its canned
 * response; persistence is the frame updating ui.state.
 */
async function mockedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	if (isAbsolute(url)) return nativeFetch(input, init);
	const method = (
		init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
	).toUpperCase();
	const path = url.split(/[?#]/, 1)[0] ?? url;
	const ruleValue = lookupRule(method, path);
	const rule = asRule(ruleValue);
	const baseLatency = typeof mockConfig.latency === "number" ? mockConfig.latency : 0;
	const latency = rule?.latency ?? baseLatency;
	if (latency > 0) await sleep(latency);

	let response: Response | undefined;
	if (ruleValue !== undefined) response = await ruleResponse(ruleValue);
	response ??= await conventionResponse(path);
	response ??= new Response(
		`spool mock: no response for ${method} ${path} — add a scenario rule or shared/fixtures/<name>.json (served at /api/<name>)`,
		{ status: 404 },
	);
	return response;
}

function installMock(): void {
	window.fetch = mockedFetch;
}

// --- boot -------------------------------------------------------------------

const state = reactive(stateTarget);

function useSpoolState(): SpoolState {
	useSyncExternalStore(subscribe, () => version);
	return state;
}

export const ui: SpoolUi = Object.freeze({ state, use: useSpoolState, go, back, copy });

installMock();
bindDataGo();
bindExternalLinks();
// importers wait here: no frame renders before its session is seeded
await start();
