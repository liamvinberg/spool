import type { ComponentType } from "react";
import { createElement, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Player, type PlayerController, TermScreen } from "./player-chrome";

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

export interface SpoolUi {
	/** One flat reactive object per play session, seeded from the scenario. */
	readonly state: SpoolState;
	/** Subscribe the calling component to state: re-renders on any change. */
	use(): SpoolState;
	/** Merge patch into state, push this frame onto the stack, walk to target. */
	go(target: string, patch?: Record<string, unknown>): void;
	/** Pop the stack and walk back. Empty stack: quiet no-op, never an exit. */
	back(): void;
}

interface SpoolDocument {
	project: string;
	frame: string;
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
	start: string;
	scenario: string;
	frames: Record<string, { w: number; h: number }>;
	/** Stamps of coded-navigation elements per frame, for the hint layer (#34). */
	hints: Record<string, string[]>;
	/** Terminal frames (#42): the daemon's grid rides along as each live screen's boot poster (#44). */
	terminals?: Record<string, { svg: string }>;
}

declare global {
	interface Window {
		__SPOOL__?: SpoolDocument;
		__SPOOL_PLAY__?: PlayerConfig;
	}
}

const play = window.__SPOOL_PLAY__;
const config = play === undefined ? window.__SPOOL__ : { project: play.project, frame: play.start };
if (config === undefined) {
	throw new Error('spool: no document config — "spool" only runs inside a spool-served document');
}
const doc: SpoolDocument = config;
/** Where the session stands now: fixed in a frame document, walked in the player. */
let currentFrame = doc.frame;

/** The runtime's own plumbing (scenario, fixtures) always rides the real fetch. */
const nativeFetch = window.fetch.bind(window);

/** Embedded in a canvas iframe: navigation is the host's job, posted over the bridge. */
const embedded = window.parent !== window;

// --- reactive state ---------------------------------------------------------

const stateTarget: SpoolState = {};
const listeners = new Set<() => void>();
const proxies = new WeakMap<object, object>();
let version = 0;

function notify(): void {
	version++;
	for (const listener of listeners) listener();
	schedulePersist();
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
			const ok = Reflect.set(t, key, value, receiver);
			if (ok) notify();
			return ok;
		},
		deleteProperty(t, key) {
			const had = Reflect.has(t, key);
			const ok = Reflect.deleteProperty(t, key);
			if (ok && had) notify();
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
function sessionSnapshot(): SessionRecord {
	return JSON.parse(JSON.stringify({ scenario: scenarioName, state: stateTarget, stack })) as SessionRecord;
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
		const res = await nativeFetch(`/api/p/${encodeURIComponent(doc.project)}/scenarios/${encodeURIComponent(name)}`);
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
	void nativeFetch(`/api/p/${encodeURIComponent(doc.project)}/walked`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ from, to }),
		keepalive: true,
	}).catch(() => {});
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
	commit?.();
	window.location.assign(url);
}

function navigate(target: string, patch?: Record<string, unknown>, transition?: string): void {
	if (!isFrameName(target)) {
		console.error(`spool: not a frame name: "${target}"`);
		return;
	}
	if (patch !== undefined) Object.assign(state, patch);
	if (play !== undefined) {
		// the composition is the map: a target outside it is loud but harmless,
		// exactly like a frame document's failed probe (#5)
		if (play.frames[target] === undefined) {
			console.error(`spool: no frame "${target}" to walk to`);
			return;
		}
		stack.push(currentFrame);
		reportWalk(currentFrame, target);
		currentFrame = target;
		swapScreen("forward", transition);
		return;
	}
	if (embedded) {
		// the host owns embedded walks; the snapshot rides along so it can
		// seed the target frame's boot with this session
		stack.push(doc.frame);
		persist();
		post({ spool: "go", target, session: sessionSnapshot() });
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
	const target = stack.pop();
	if (target === undefined) return;
	if (play !== undefined) {
		currentFrame = target;
		swapScreen("back");
		return;
	}
	// the pop stays committed even if the frame vanished mid-session: backing
	// past a deleted frame beats retrying it forever
	persist();
	if (embedded) {
		post({ spool: "back", target, session: sessionSnapshot() });
		return;
	}
	void walkTo(target);
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
// the hint layer (#34): outlines every element that navigates. Off by default
// — the player is the immersive stage — and never persisted.
let hintOn = false;
let playVersion = 0;
const playListeners = new Set<() => void>();

function notifyPlay(): void {
	playVersion++;
	for (const listener of playListeners) listener();
}

type SwapDirection = "forward" | "back" | "restart";

/**
 * Swap the active screen, letting the View Transitions API film it: the
 * direction rides as a transition type, any data-transition override on top,
 * so transitions.css can style forward, back, and named moves apart. Default
 * is the API's own crossfade; morphs come free from matching
 * view-transition-names because the screens share one document. No API, or
 * motion off: the swap lands bare — reduce-motion means never starting a
 * transition at all.
 */
function swapScreen(direction: SwapDirection, transition?: string): void {
	arrival++;
	externalHref = null;
	const update = () => flushSync(notifyPlay);
	const startViewTransition = (
		window.document as {
			startViewTransition?: (options: { update: () => void; types: string[] } | (() => void)) => unknown;
		}
	).startViewTransition?.bind(window.document);
	if (!motionOn || startViewTransition === undefined) {
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

async function restartSession(): Promise<void> {
	if (play === undefined) return;
	// a new epoch: terminal frames the restarted walk reaches start clean (#44)
	termEpoch++;
	termEnsured.clear();
	// a fresh read, so an edited seed lands without a reload
	const scenario = await loadScenario(scenarioName);
	mockConfig = scenario.mock;
	stack.length = 0;
	currentFrame = play.start;
	seedState(scenario.state);
	swapScreen("restart");
}

// --- terminal screens (#44) --------------------------------------------------

/**
 * The play session's claim to clean runs: a pill restart opens a new epoch,
 * and the first arrival at each terminal frame inside it asks the daemon for
 * a fresh process before joining. Epoch zero joins whatever already runs —
 * mirrored attach means one process, one truth, and a canvas-staged process
 * is the demo, not dirt.
 */
let termEpoch = 0;
const termEnsured = new Set<string>();
/** The current screen's iframe — the only document allowed to speak for the walk. */
const termIframes = new Map<string, HTMLIFrameElement>();

async function ensureTermFresh(frame: string): Promise<void> {
	if (termEpoch === 0 || termEnsured.has(frame)) return;
	termEnsured.add(frame);
	try {
		await nativeFetch(`/api/p/${encodeURIComponent(doc.project)}/term/${encodeURIComponent(frame)}/restart`, {
			method: "POST",
		});
	} catch {
		// the walk still lands on the live session; only the clean-run ask failed
	}
}

/**
 * The player as terminal host (#44): the embedded term document speaks the
 * same protocol it speaks to the canvas — a nav the TUI fired walks forward
 * (verifying its edge, never minting one), and the exit chord hands the
 * keyboard back to the chrome. Only the current screen's own document is
 * heard; chrome touches no other key.
 */
function bindTermHost(): void {
	window.addEventListener("message", (event) => {
		const message = event.data as { spool?: string; target?: string; key?: string } | null;
		if (message === null || typeof message !== "object") return;
		const iframe = termIframes.get(currentFrame);
		if (iframe === undefined || event.source !== iframe.contentWindow) return;
		if (message.spool === "go" && typeof message.target === "string") navigate(message.target);
		else if (message.spool === "key" && message.key === "Escape") iframe.blur();
	});
}

function closePlayer(): void {
	window.close();
	// a tab the canvas opened closes; a phone's direct URL walks to the canvas
	setTimeout(() => {
		if (!window.closed) window.location.href = `/p/${encodeURIComponent(doc.project)}`;
	}, 150);
}

const playerController: PlayerController = {
	subscribe(listener) {
		playListeners.add(listener);
		return () => playListeners.delete(listener);
	},
	version: () => playVersion,
	read: () => ({
		frame: currentFrame,
		stack: [...stack],
		motion: motionOn,
		hint: hintOn,
		arrival,
		externalHref,
	}),
	// the fallback restates the projection's default footprint across the
	// compile-unit boundary; unreachable while navigate guards membership
	geometry: (frame) => play?.frames[frame] ?? { w: 390, h: 844 },
	hintStamps: (frame) => play?.hints?.[frame] ?? [],
	terminal: (frame) => play?.terminals?.[frame] !== undefined,
	back,
	restart: () => void restartSession(),
	toggleMotion() {
		motionOn = !motionOn;
		notifyPlay();
	},
	toggleHint() {
		hintOn = !hintOn;
		notifyPlay();
	},
	dismissExternal() {
		if (externalHref === null) return;
		externalHref = null;
		notifyPlay();
	},
	close: closePlayer,
};

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
	// terminal frames are live (#44): the same term document the canvas embeds,
	// attached to the same daemon session, over the daemon's grid as poster
	const termScreens = Object.fromEntries(
		Object.entries(config.terminals ?? {}).map(([name, screen]) => [
			name,
			() =>
				createElement(TermScreen, {
					src: `/p/${encodeURIComponent(config.project)}/frames/${encodeURIComponent(name)}`,
					poster: screen.svg,
					title: name,
					ensureFresh: () => ensureTermFresh(name),
					register: (el: HTMLIFrameElement | null) => {
						if (el === null) termIframes.delete(name);
						else termIframes.set(name, el);
					},
				}),
		]),
	);
	bindTermHost();
	createRoot(root).render(
		createElement(Player, { frames: { ...frames, ...termScreens }, controller: playerController }),
	);
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
		const res = await nativeFetch(fixtureUrl(rule.fixture));
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
	const res = await nativeFetch(fixtureUrl(name));
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
	return (
		response ??
		new Response(
			`spool mock: no response for ${method} ${path} — add a scenario rule or shared/fixtures/<name>.json (served at /api/<name>)`,
			{ status: 404 },
		)
	);
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

export const ui: SpoolUi = Object.freeze({ state, use: useSpoolState, go, back });

installMock();
bindDataGo();
bindExternalLinks();
// importers wait here: no frame renders before its session is seeded
await start();
