import type { ComponentType } from "react";
import { createElement, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
	type MockCall,
	Player,
	type PlayerController,
	type SessionState,
	TermScreen,
	type WalkEvent,
} from "./player-chrome";

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

// --- reactive state ---------------------------------------------------------

const stateTarget: SpoolState = {};
const listeners = new Set<() => void>();
const proxies = new WeakMap<object, object>();
/** Where each reactive object sits in the store, so a write knows its address. */
const addresses = new WeakMap<object, string>();
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
 * Every write also names itself for the tape (#60) — passive observation of a
 * mutation that was going to happen anyway, never a hook the prototype can see.
 */
function reactive<T extends object>(target: T, address = ""): T {
	const existing = proxies.get(target);
	if (existing !== undefined) return existing as T;
	addresses.set(target, address);
	const proxy = new Proxy(target, {
		get(t, key, receiver) {
			const value = Reflect.get(t, key, receiver);
			return typeof value === "object" && value !== null ? reactive(value, addressOf(t, key)) : value;
		},
		set(t, key, value, receiver) {
			if (Object.is(Reflect.get(t, key, receiver), value)) return true;
			const ok = Reflect.set(t, key, value, receiver);
			if (ok) {
				touch(addressOf(t, key));
				notify();
			}
			return ok;
		},
		deleteProperty(t, key) {
			const had = Reflect.has(t, key);
			const ok = Reflect.deleteProperty(t, key);
			if (ok && had) {
				touch(addressOf(t, key));
				notify();
			}
			return ok;
		},
	});
	proxies.set(target, proxy);
	return proxy as T;
}

/**
 * The dotted address of a key under the object that holds it. A list is one
 * value the whole way down (#60): pushing an item changes `cart.items`, not
 * `cart.items.3` and `cart.items.length` — the rail is not a debugger.
 */
function addressOf(target: object, key: string | symbol): string {
	const base = addresses.get(target) ?? "";
	if (Array.isArray(target)) return base;
	if (typeof key === "symbol") return "";
	return base === "" ? key : `${base}.${key}`;
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

// --- the tape (#60) ---------------------------------------------------------

/**
 * The session's recording: append-only, never truncated, so a rewound walk
 * still shows where it had been. Every hop carries the snapshot the session
 * stood in once it landed — state is JSON-serializable by contract, which is
 * what makes scrubbing back to a hop a restore rather than a replay.
 */
/** What the rail shows, plus the snapshot only a scrub needs. */
interface Hop extends WalkEvent {
	snapshot: SessionRecord;
}

const walkLog: Hop[] = [];
const mockLog: MockCall[] = [];
/** State keys written since the last hop; they roll up into the next one. */
let touched = new Set<string>();
const opened = now();

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now();
}

function elapsed(): number {
	return Math.round(now() - opened);
}

function touch(address: string): void {
	if (address !== "") touched.add(address);
}

/**
 * Close the stay on `from` and open the one on `to`: whatever the screen wrote
 * while standing there becomes this hop's changed keys, and the tape takes the
 * snapshot only after the walk has committed.
 */
function recordHop(kind: WalkEvent["kind"], from: string, to: string, label?: string): void {
	walkLog.push({
		kind,
		from,
		to,
		...(label === undefined ? {} : { label }),
		at: elapsed(),
		changed: [...touched],
		snapshot: sessionSnapshot(),
	});
	touched = new Set();
}

function recordMock(method: string, path: string, status: number, ms: number): void {
	mockLog.push({ method, path, status, ms: Math.round(ms) });
	notifyPlay();
}

/**
 * The store as the rail reads it: dotted leaf keys, one-line JSON values. An
 * array is a leaf — a prototype's list is one value, not a numbered tree.
 */
function flatten(value: unknown, address: string, rows: { key: string; value: string }[]): void {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const entries = Object.entries(value);
		if (entries.length > 0) {
			for (const [key, nested] of entries) flatten(nested, `${address}.${key}`, rows);
			return;
		}
	}
	rows.push({ key: address, value: oneLine(value) });
}

function oneLine(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		// a cyclic prototype value still deserves a row, just not a faithful one
		return String(value);
	}
}

/** A write marks a row when either address contains the other. */
function isTouched(key: string): boolean {
	for (const address of touched) {
		if (address === key || address.startsWith(`${key}.`) || key.startsWith(`${address}.`)) return true;
	}
	return false;
}

function sessionState(): SessionState {
	// the store itself is never a row: an empty session is an empty list, not "{}"
	const rows: { key: string; value: string }[] = [];
	for (const [key, value] of Object.entries(stateTarget)) flatten(value, key, rows);
	return { scenario: scenarioName, rows: rows.map((row) => ({ ...row, changed: isTouched(row.key) })) };
}

/**
 * Scrub the tape: restore the snapshot of the hop at `index`. The move is
 * itself a hop, so the recording keeps growing — a rewind never erases what
 * the session already did.
 */
function rewindTo(index: number): void {
	if (play === undefined) return;
	const hop = walkLog[index];
	if (hop === undefined || index === walkLog.length - 1) return;
	const from = currentFrame;
	stack.length = 0;
	stack.push(...hop.snapshot.stack);
	currentFrame = hop.to;
	seedState(hop.snapshot.state);
	recordHop("rewind", from, hop.to);
	swapScreen("rewind");
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
	if (play !== undefined && embedded) {
		window.parent.postMessage({ spool: "player-walked", from, to }, "*");
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

function navigate(target: string, patch?: Record<string, unknown>, transition?: string, label?: string): void {
	if (!isFrameName(target)) {
		console.error(`spool: not a frame name: "${target}"`);
		return;
	}
	// the patch is a write like any other: it lands in the stay it belongs to,
	// and rolls up into this hop's changed keys
	if (patch !== undefined) Object.assign(state, patch);
	if (play !== undefined) {
		// the composition is the map: a target outside it is loud but harmless,
		// exactly like a frame document's failed probe (#5)
		if (play.frames[target] === undefined) {
			console.error(`spool: no frame "${target}" to walk to`);
			return;
		}
		const from = currentFrame;
		stack.push(from);
		reportWalk(from, target);
		currentFrame = target;
		recordHop("go", from, target, label);
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
		const from = currentFrame;
		currentFrame = target;
		recordHop("back", from, target);
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
		navigate(target, undefined, carrier.getAttribute("data-transition") ?? undefined, carrierLabel(carrier));
	});
}

/**
 * How the tape names an edge (#60): the carrier's own accessible name, read at
 * click time. A walk called from code has no element and stays label-less —
 * the recording says what it saw, never what it guessed.
 */
function carrierLabel(carrier: Element): string | undefined {
	const name = (carrier.getAttribute("aria-label") ?? carrier.textContent ?? "").replace(/\s+/g, " ").trim();
	if (name === "") return undefined;
	return name.length > 24 ? `${name.slice(0, 23)}…` : name;
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

function notifyPlay(): void {
	playVersion++;
	for (const listener of playListeners) listener();
}

type SwapDirection = "forward" | "back" | "restart" | "rewind";

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
	// a fresh read, so an edited seed lands without a reload
	const scenario = await loadScenario(scenarioName);
	mockConfig = scenario.mock;
	const from = currentFrame;
	stack.length = 0;
	currentFrame = play.start;
	seedState(scenario.state);
	recordHop("restart", from, play.start);
	swapScreen("restart");
}

/**
 * The canvas owns geometry: the player follows sidecar changes over the
 * control shell's bridge so every screen remains fitted to its current size.
 */
function followGeometry(): void {
	const config = play;
	if (config === undefined || !embedded) return;
	addEventListener("message", (event) => {
		if (event.source !== window.parent) return;
		const message = event.data as { spool?: string; frames?: { name: string; w: number; h: number }[] } | null;
		if (message?.spool !== "player-geometry" || !Array.isArray(message.frames)) return;
		let moved = false;
		for (const frame of message.frames) {
			const known = config.frames[frame.name];
			if (known !== undefined && (known.w !== frame.w || known.h !== frame.h)) {
				config.frames[frame.name] = { w: frame.w, h: frame.h };
				moved = true;
			}
		}
		if (moved) notifyPlay();
	});
}

function closePlayer(): void {
	if (embedded) window.parent.postMessage({ spool: "player-close" }, "*");
}

const playerController: PlayerController = {
	subscribe(listener) {
		playListeners.add(listener);
		return () => playListeners.delete(listener);
	},
	version: () => playVersion,
	stateSubscribe: subscribe,
	stateVersion: () => version,
	read: () => ({
		project: doc.project,
		frame: currentFrame,
		stack: [...stack],
		motion: motionOn,
		arrival,
		externalHref,
		log: [...walkLog],
		mock: [...mockLog],
	}),
	state: sessionState,
	elapsed,
	// the fallback restates the projection's default footprint across the
	// compile-unit boundary; unreachable while navigate guards membership
	geometry: (frame) => play?.frames[frame] ?? { w: 390, h: 844 },
	terminal: (frame) => play?.terminals?.[frame] !== undefined,
	back,
	restart: () => void restartSession(),
	rewind: rewindTo,
	toggleMotion() {
		motionOn = !motionOn;
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
	// the tape opens where the session does, so hop zero is the start frame
	recordHop("restart", config.start, config.start);
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
	const started = now();

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
	// the rail shows what the prototype asked for and what came back, never a
	// header or a body (#60) — this is a prototyping tool, not a debugger
	recordMock(method, path, response.status, now() - started);
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

export const ui: SpoolUi = Object.freeze({ state, use: useSpoolState, go, back });

installMock();
bindDataGo();
bindExternalLinks();
// importers wait here: no frame renders before its session is seeded
await start();
