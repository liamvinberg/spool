import { useSyncExternalStore } from "react";

/**
 * The "spool" module (#5, #16): every frame document imports it — explicitly
 * for ui.go/back/state/use, implicitly via the boot module so data-go and the
 * mock layer work in frames that never import it. Evaluation top-level-awaits
 * the session seed, so a frame's first render always sees seeded state and an
 * installed mock. Bundled per spool version and served at /vendor/spool.js;
 * the import map pins the specifier.
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

interface SessionRecord {
	scenario: string;
	state: SpoolState;
	stack: string[];
}

declare global {
	interface Window {
		__SPOOL__?: SpoolDocument;
	}
}

const config = window.__SPOOL__;
if (config === undefined) {
	throw new Error('spool: no document config — "spool" only runs inside a spool-served frame document');
}
const doc: SpoolDocument = config;

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

function loadSession(): SessionRecord | undefined {
	try {
		const raw = storage()?.getItem(storageKey);
		if (raw == null) return undefined;
		const record: unknown = JSON.parse(raw);
		if (typeof record !== "object" || record === null) return undefined;
		const { scenario, state, stack: names } = record as Partial<SessionRecord>;
		if (typeof scenario !== "string" || typeof state !== "object" || state === null) return undefined;
		if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) return undefined;
		return { scenario, state, stack: names };
	} catch {
		return undefined;
	}
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
 * A new session re-seeds state from the scenario.
 */
async function start(): Promise<void> {
	const requested = queryScenario();
	const record = loadSession();
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

function go(target: string, patch?: Record<string, unknown>): void {
	if (!isFrameName(target)) {
		console.error(`spool: not a frame name: "${target}"`);
		return;
	}
	if (patch !== undefined) Object.assign(state, patch);
	if (embedded) {
		// the host owns embedded walks; it mirrors the session its own way
		stack.push(doc.frame);
		persist();
		post({ spool: "go", target });
		return;
	}
	// the push commits only when the walk really happens, so a typo'd target
	// can never corrupt what ui.back() means
	void walkTo(target, () => {
		stack.push(doc.frame);
		persist();
	});
}

function back(): void {
	const target = stack.pop();
	if (target === undefined) return;
	// the pop stays committed even if the frame vanished mid-session: backing
	// past a deleted frame beats retrying it forever
	persist();
	if (embedded) {
		post({ spool: "back", target });
		return;
	}
	void walkTo(target);
}

/**
 * data-go: click-only sugar on any element, nearest ancestor wins, anchors
 * get preventDefault. Everything richer calls ui.go from code.
 */
function bindDataGo(): void {
	window.document.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const carrier = event.target.closest("[data-go]");
		if (carrier === null) return;
		const target = carrier.getAttribute("data-go");
		if (target === null || target === "") return;
		event.preventDefault();
		go(target);
	});
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
// importers wait here: no frame renders before its session is seeded
await start();
