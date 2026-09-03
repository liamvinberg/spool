// @vitest-environment happy-dom

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The flow runtime, exercised through really-served documents: every config
 * script and boot module under test comes byte-for-byte from app.request(),
 * compiled by the real pipeline. The harness stands in for the browser only —
 * happy-dom as the realm, window.fetch bridged into the same in-process app,
 * vitest aliases playing the import map (see vitest.config.ts).
 */

interface Harness {
	app: ReturnType<typeof makeApp>;
	root: string;
	name: string;
}

function makeHarness(): Harness {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	return { app: makeApp(spoolDir), root, name };
}

/** window.happyDOM is the environment's controller; not in TS DOM types. */
function happyDom(): { setURL(url: string): void } {
	return (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
}

// Served boot modules must live inside the repo: vite only transforms (and
// alias-resolves) files under its root. Gitignored, removed after the run.
const bootParent = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".boot-tmp");
mkdirSync(bootParent, { recursive: true });
const bootDir = mkdtempSync(join(bootParent, "run-"));
let bootCount = 0;
const boundListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = [];
afterAll(() => rmSync(bootDir, { recursive: true, force: true }));

/**
 * Load a served frame document the way a browser would: fresh modules, the
 * document's own URL, its served body, its served config script, its served
 * boot module. Returns a spy on location.assign — the harness's stand-in for
 * actual navigation.
 */
async function loadFrameDocument(
	harness: Harness,
	frame: string,
	options: {
		scenario?: string;
		outside?: (url: string) => Response | undefined;
		/** Play the canvas: receive parent-bound postMessages. Makes the frame embedded. */
		host?: (message: Record<string, unknown>) => void;
		randomWords?: [number, number][];
	} = {},
) {
	const { app, name } = harness;
	const search = options.scenario === undefined ? "" : `?scenario=${options.scenario}`;
	const res = await app.request(`/p/${name}/frames/${frame}${search}`);
	expect(res.status, `serving frame "${frame}"`).toBe(200);
	const doc = await res.text();

	// the previous document is gone: real navigation destroys its listeners
	for (const { type, listener } of boundListeners.splice(0)) {
		document.removeEventListener(type, listener);
	}
	vi.restoreAllMocks();
	vi.resetModules();
	if (options.randomWords !== undefined) {
		const words = [...options.randomWords];
		vi.spyOn(window.crypto, "getRandomValues").mockImplementation((array) => {
			if (!(array instanceof Uint32Array)) throw new Error("clipboard id expected Uint32Array");
			const next = words.shift();
			if (next === undefined) throw new Error("clipboard id consumed too many random values");
			array.set(next);
			return array;
		});
	}

	happyDom().setURL(`http://run.spool.localhost:7766/p/${name}/frames/${frame}${search}`);
	const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const addEventListener = document.addEventListener.bind(document);
	vi.spyOn(document, "addEventListener").mockImplementation((type, listener, opts) => {
		if (listener) boundListeners.push({ type, listener });
		addEventListener(type, listener, opts);
	});

	// the bridge: the frame realm's network is the in-process daemon app
	window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const outside = options.outside?.(url);
		if (outside !== undefined) return Promise.resolve(outside);
		return Promise.resolve(app.request(url, init));
	}) as typeof fetch;

	document.body.innerHTML = doc.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";

	const configScript = doc.match(/<script>(window\.__SPOOL__[\s\S]*?)<\/script>/)?.[1];
	expect(configScript, "served config script").toBeDefined();
	new Function(configScript ?? "")();

	// embedded means parent !== window: the host option stands in for the canvas
	const host = options.host;
	const parentWindow =
		host === undefined
			? window
			: {
					postMessage: (data: unknown) => host(data as Record<string, unknown>),
				};
	Object.defineProperty(window, "parent", {
		configurable: true,
		value: parentWindow,
	});

	const bootJs = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
	expect(bootJs, "served boot module").toBeDefined();
	const bootFile = join(bootDir, `boot-${bootCount++}.js`);
	writeFileSync(bootFile, bootJs ?? "");
	await import(bootFile);

	return { assign, parentWindow };
}

/**
 * Console warnings from the frame realm, patched in by hand: the loader
 * restores vi mocks on its way in, and a render-phase warning fires before it
 * returns.
 */
function captureWarnings(): { lines: string[]; restore: () => void } {
	const lines: string[] = [];
	const real = console.warn;
	console.warn = (...args: unknown[]) => lines.push(args.map((arg) => String(arg)).join(" "));
	return {
		lines,
		restore: () => {
			console.warn = real;
		},
	};
}

/** Answer the frame realm's message listener the way a canvas would. */
function hostReply(data: Record<string, unknown>, source = window.parent as WindowProxy): void {
	window.dispatchEvent(new MessageEvent("message", { data, source }));
}

function click(selector: string): boolean {
	const el = document.querySelector(selector);
	expect(el, selector).not.toBeNull();
	return (el as Element).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function session(harness: Harness): { scenario: string; state: Record<string, unknown>; stack: string[] } {
	const raw = sessionStorage.getItem(`spool:session:${harness.name}`);
	expect(raw, "persisted session").not.toBeNull();
	return JSON.parse(raw ?? "{}");
}

async function waitForText(selector: string, text: string): Promise<void> {
	await vi.waitFor(() => {
		const el = document.querySelector(selector);
		if (el === null || el.textContent !== text) {
			throw new Error(`waiting for ${selector} to show ${JSON.stringify(text)}, got ${el?.textContent}`);
		}
	});
}

/** Walks probe the target document first, so navigation lands a beat after the click. */
async function waitForWalk(assign: { mock: { calls: unknown[][] } }, url: string): Promise<void> {
	await vi.waitFor(() => expect(assign.mock.calls).toContainEqual([url]));
}

const inboxTsx = `import { ui } from "spool";

export default function Inbox() {
	const state = ui.use();
	return (
		<main>
			<output>{String(state.unread ?? "unset")}</output>
			<button type="button" id="walk" data-go="thread--detail">open thread</button>
			<button type="button" id="bump" onClick={() => { ui.state.unread = 5; }}>bump</button>
			<button type="button" id="carry" onClick={() => ui.go("thread--detail", { unread: 99 })}>carry</button>
			<button type="button" id="back-empty" onClick={() => ui.back()}>back</button>
			<button type="button" id="typo" data-go="thread--detial">typo</button>
			<span id="outer" data-go="checkout--empty"><em id="inner" data-go="thread--detail">nested</em></span>
			<a id="external" href="https://github.com/liamvinberg/spool">github</a>
			<a id="handled" href="https://example.com" onClick={(event) => event.preventDefault()}>handled</a>
			<a id="empty-go" data-go="" href="https://example.com/empty-go">empty go</a>
		</main>
	);
}
`;

const threadDetailTsx = `import { ui } from "spool";

export default function ThreadDetail() {
	const state = ui.use();
	return (
		<main>
			<output>{String(state.unread ?? "unset")}</output>
			<button type="button" id="go-back" onClick={() => ui.back()}>back</button>
		</main>
	);
}
`;

const checkoutEmptyTsx = `export default function CheckoutEmpty() {
	return <p data-go="inbox">checkout is empty</p>;
}
`;

const clipboardTsx = `import { useState } from "react";
import { ui } from "spool";

function result(error: unknown) {
	if (typeof error !== "object" || error === null) return String(error);
	const value = error as { name?: unknown; message?: unknown };
	return String(value.name) + ":" + String(value.message);
}

export default function Clipboard() {
	const [first, setFirst] = useState("idle");
	const [second, setSecond] = useState("idle");
	const [race, setRace] = useState("idle");
	async function copy(text: string, set: (value: string) => void) {
		set("pending");
		try {
			await ui.copy(text);
			set("copied");
		} catch (error) {
			set(result(error));
		}
	}
	async function leaveThenCopy() {
		setRace("pending");
		ui.go("next");
		try {
			await ui.copy("must not write");
			setRace("copied");
		} catch (error) {
			setRace(result(error));
		}
	}
	function repeatWalks() {
		ui.go("next");
		ui.go("third");
	}
	return (
		<main>
			<output id="first-result">{first}</output>
			<output id="second-result">{second}</output>
			<output id="race-result">{race}</output>
			<button id="copy-first" onClick={() => void copy("first text", setFirst)}>first</button>
			<button id="copy-second" onClick={() => void copy("second text", setSecond)}>second</button>
			<button id="leave" data-go="next">leave</button>
			<button id="leave-then-copy" onClick={() => void leaveThenCopy()}>leave then copy</button>
			<button id="repeat-walks" onClick={() => repeatWalks()}>repeat walks</button>
			<button id="walk-third" onClick={() => ui.go("third")}>walk third</button>
		</main>
	);
}
`;

const arrivalTsx = `import { useState } from "react";
import { ui } from "spool";

export default function Arrival() {
	const state = ui.use();
	const arrived = state.justArrived;
	// the trap (#183): the render that reads the one-shot flag also clears it
	if (arrived === true) state.justArrived = false;
	if (state.stale !== undefined) delete state.stale;
	// the defensive seed of a missing key is idempotent, not a dropped write
	state.seen ??= "seed";
	const [rearmed, setRearmed] = useState("no");
	function rearm() {
		ui.state.justArrived = true;
		ui.state.stale = "again";
		setRearmed("yes");
	}
	return (
		<main>
			<output id="arrived">{String(arrived)}</output>
			<output id="seen">{String(state.seen)}</output>
			<output id="rearmed">{rearmed}</output>
			<button type="button" id="rearm" onClick={rearm}>rearm</button>
		</main>
	);
}
`;

function scaffoldFlow(harness: Harness): void {
	writeFrame(harness.root, "inbox", inboxTsx);
	writeFrame(harness.root, "thread--detail", threadDetailTsx);
	writeFrame(harness.root, "checkout--empty", checkoutEmptyTsx);
	writeDesignFile(harness.root, "shared/scenarios/default.json", '{\n\t"state": { "unread": 2 }\n}\n');
}

describe("walking a flow", () => {
	it("seeds from the scenario, re-renders subscribers, walks data-go, carries the session, pops back", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		// session start: ui.state seeded from the default scenario
		const inbox = await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");

		// ui.state patch re-renders the ui.use subscriber
		click("#bump");
		await waitForText("output", "5");

		// data-go: click sugar, preventDefault, navigation to the sibling document
		const walkClick = click("#walk");
		expect(walkClick, "data-go click default-prevented").toBe(false);
		await waitForWalk(inbox.assign, `/p/${harness.name}/frames/thread--detail`);
		expect(session(harness)).toEqual({
			scenario: "default",
			state: { unread: 5 },
			stack: ["inbox"],
		});

		// arrival: the walked-to document resumes the session, state intact
		const detail = await loadFrameDocument(harness, "thread--detail");
		await waitForText("output", "5");

		// ui.back pops the stack and walks back
		click("#go-back");
		await waitForWalk(detail.assign, `/p/${harness.name}/frames/inbox`);
		expect(session(harness).stack).toEqual([]);

		// back with an empty stack: quiet no-op, never an exit
		const inboxAgain = await loadFrameDocument(harness, "inbox");
		await waitForText("output", "5");
		click("#back-empty");
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(inboxAgain.assign).not.toHaveBeenCalled();

		// a new session re-seeds ui.state from the scenario
		sessionStorage.clear();
		await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");
	});

	it("ui.go carries a state patch into the walk", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		const inbox = await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");

		click("#carry");
		await waitForWalk(inbox.assign, `/p/${harness.name}/frames/thread--detail`);
		expect(session(harness)).toEqual({
			scenario: "default",
			state: { unread: 99 },
			stack: ["inbox"],
		});
	});

	// Same-origin only: the harness answers the probe, a served frame document
	// cannot (it is sandboxed onto an opaque origin), so a bare frame document
	// really does land on the daemon's 404 — see walkTo and the skill's url topic.
	it("a missing data-go target is loud but harmless — never a dead-end page", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		const inbox = await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");
		const notices = vi.spyOn(console, "error").mockImplementation(() => {});

		click("#typo");

		await vi.waitFor(() => {
			expect(notices).toHaveBeenCalledWith(expect.stringContaining('no frame "thread--detial"'));
		});
		expect(inbox.assign).not.toHaveBeenCalled();
		// the walk never happened, so ui.back's meaning is untouched
		expect(session(harness).stack).toEqual([]);
	});

	it("the nearest data-go ancestor wins", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		const inbox = await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");

		click("#inner");
		await waitForWalk(inbox.assign, `/p/${harness.name}/frames/thread--detail`);

		click("#outer");
		await waitForWalk(inbox.assign, `/p/${harness.name}/frames/checkout--empty`);
	});

	it("data-go works in a frame that never imports spool", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		const checkout = await loadFrameDocument(harness, "checkout--empty");
		await vi.waitFor(() => {
			expect(document.querySelector("p")?.textContent).toBe("checkout is empty");
		});

		click("p");
		await waitForWalk(checkout.assign, `/p/${harness.name}/frames/inbox`);
	});

	it("a ?scenario= URL starts and restarts the session on that scenario, and walks preserve it", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		writeDesignFile(harness.root, "shared/scenarios/vip.json", '{\n\t"state": { "unread": 9 }\n}\n');

		// an existing default-scenario session is mid-walk…
		await loadFrameDocument(harness, "inbox");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");

		// …and naming a different scenario restarts instead of resuming
		const vip = await loadFrameDocument(harness, "inbox", { scenario: "vip" });
		await waitForText("output", "9");
		expect(session(harness).scenario).toBe("vip");

		click("#walk");
		await waitForWalk(vip.assign, `/p/${harness.name}/frames/thread--detail?scenario=vip`);
	});
});

describe("a ui.state write from a render", () => {
	it("names the dropped write once per site, and stays quiet for handlers and defensive seeds", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "arrival", arrivalTsx);
		writeDesignFile(
			harness.root,
			"shared/scenarios/default.json",
			'{\n\t"state": { "justArrived": true, "stale": "x" }\n}\n',
		);
		const warnings = captureWarnings();
		try {
			await loadFrameDocument(harness, "arrival");
			await waitForText("#seen", "seed");

			// the harm the warning explains: the flag the walk handed over is gone,
			// so the frame boots as if it had arrived fresh
			expect(document.querySelector("#arrived")?.textContent).toBe("false");

			const written = warnings.lines.filter((line) => line.includes("ui.state.justArrived"));
			expect(written).toHaveLength(1);
			expect(written[0]).toContain("was written during render");
			expect(written[0]).toContain("Move the write into an event handler or an effect");
			const deleted = warnings.lines.filter((line) => line.includes("ui.state.stale"));
			expect(deleted).toHaveLength(1);
			expect(deleted[0]).toContain("was deleted during render");
			expect(warnings.lines.filter((line) => line.includes("ui.state.seen"))).toEqual([]);

			// the handler re-arms both flags and the render clears them again: the
			// handler's own writes are fine, and a repeat render never repeats itself
			click("#rearm");
			await waitForText("#rearmed", "yes");
			await waitForText("#arrived", "false");
			expect(warnings.lines).toHaveLength(2);
		} finally {
			warnings.restore();
		}
	});
});

describe("embedded in a canvas", () => {
	it("shares writes with the page through the host and applies the page's state without echoing it", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});
		await waitForText("output", "2");
		// the seed is where this frame starts, not a fact about the app
		expect(messages.filter((message) => message.spool === "state")).toEqual([]);

		click("#bump");
		await waitForText("output", "5");
		await vi.waitFor(() => {
			expect(messages.filter((message) => message.spool === "state")).toEqual([
				{ spool: "state", frame: "inbox", scenario: "default", state: { unread: 5 } },
			]);
		});

		// a sibling wrote: the page's state lands whole and re-renders, and is not sent back
		hostReply({ spool: "state", state: { unread: 9 } });
		await waitForText("output", "9");
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(messages.filter((message) => message.spool === "state")).toHaveLength(1);
	});

	it("boots onto a page's session when the host hands one over", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				if (message.spool === "session?") {
					hostReply({ spool: "session", record: { scenario: "default", state: { unread: 7 }, stack: [] } });
				}
			},
		});
		await waitForText("output", "7");
	});

	it("routes concurrent ui.copy results by safe request id and preserves browser failures", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		writeFrame(harness.root, "next", "export default function Next() { return <main>next</main> }");
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
			randomWords: [
				[0, 17],
				[0, 17],
				[0, 18],
			],
		});

		await waitForText("#first-result", "idle");
		click("#copy-first");
		click("#copy-second");
		await waitForText("#first-result", "pending");
		await waitForText("#second-result", "pending");
		const copies = messages.filter((message) => message.spool === "copy");
		expect(copies).toHaveLength(2);
		expect(copies.map((message) => message.text)).toEqual(["first text", "second text"]);
		expect(copies.every((message) => Number.isSafeInteger(message.id) && Number(message.id) > 0)).toBe(true);
		expect(copies.map((message) => message.id)).toEqual([17, 18]);
		expect(copies[0]).toEqual({
			spool: "copy",
			frame: "clipboard",
			id: copies[0]?.id,
			text: "first text",
		});

		hostReply({
			spool: "copy-result",
			frame: "clipboard",
			id: copies[1]?.id,
			error: { name: "NotAllowedError", message: "Write permission denied" },
		});
		await waitForText("#second-result", "NotAllowedError:Write permission denied");
		expect(document.querySelector("#first-result")?.textContent).toBe("pending");

		hostReply({ spool: "copy-result", frame: "clipboard", id: copies[0]?.id });
		await waitForText("#first-result", "copied");
	});

	it("settles an exact copy success under Object.prototype error pollution", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#first-result", "idle");
		click("#copy-first");
		await waitForText("#first-result", "pending");
		const request = messages.find((message) => message.spool === "copy");
		expect(request).toBeDefined();

		Object.defineProperty(Object.prototype, "error", {
			configurable: true,
			value: { name: "PollutedError", message: "inherited failure" },
		});
		try {
			hostReply({ spool: "copy-result", frame: "clipboard", id: request?.id });
		} finally {
			delete (Object.prototype as { error?: unknown }).error;
		}

		await waitForText("#first-result", "copied");
	});

	it("ignores spoofed, unknown, malformed, and duplicate copy results", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		const messages: Record<string, unknown>[] = [];
		const { parentWindow } = await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#first-result", "idle");
		click("#copy-first");
		await waitForText("#first-result", "pending");
		const request = messages.find((message) => message.spool === "copy");
		expect(request).toBeDefined();
		const success = { spool: "copy-result", frame: "clipboard", id: request?.id };

		hostReply(success, {} as WindowProxy);
		hostReply({ ...success, id: Number(request?.id) + 1 }, parentWindow as WindowProxy);
		hostReply({ ...success, extra: true }, parentWindow as WindowProxy);
		hostReply({ ...success, frame: "other" }, parentWindow as WindowProxy);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(document.querySelector("#first-result")?.textContent).toBe("pending");

		hostReply(success, parentWindow as WindowProxy);
		await waitForText("#first-result", "copied");
		hostReply(
			{
				...success,
				error: { name: "NotAllowedError", message: "late duplicate" },
			},
			parentWindow as WindowProxy,
		);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(document.querySelector("#first-result")?.textContent).toBe("copied");
	});

	it("rejects pending copy requests when a frame leaves or reloads", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		writeFrame(harness.root, "next", "export default function Next() { return <main>next</main> }");
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#first-result", "idle");
		click("#copy-first");
		await waitForText("#first-result", "pending");
		window.dispatchEvent(new PageTransitionEvent("pagehide"));
		await waitForText("#first-result", "AbortError:Clipboard request interrupted by navigation");

		click("#copy-second");
		await waitForText("#second-result", "pending");
		click("#leave");
		await waitForText("#second-result", "AbortError:Clipboard request interrupted by navigation");
		expect(messages.some((message) => message.spool === "go" && message.target === "next")).toBe(true);
	});

	it("rejects a same-tick canvas copy without posting it after a walk begins", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		writeFrame(harness.root, "next", "export default function Next() { return <main>next</main> }");
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#race-result", "idle");
		click("#leave-then-copy");
		await waitForText("#race-result", "AbortError:Clipboard request interrupted by navigation");
		expect(messages.some((message) => message.spool === "go" && message.target === "next")).toBe(true);
		expect(messages.filter((message) => message.spool === "copy")).toHaveLength(0);
	});

	it("keeps a newer walk pending through repeated intents and stale decisions", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		writeFrame(harness.root, "next", "export default function Next() { return <main>next</main> }");
		writeFrame(harness.root, "third", "export default function Third() { return <main>third</main> }");
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#race-result", "idle");
		click("#repeat-walks");
		const firstWalks = messages.filter((message) => message.spool === "go");
		expect(firstWalks).toHaveLength(1);
		const firstId = firstWalks[0]?.id;
		expect(typeof firstId === "number" && Number.isSafeInteger(firstId) && firstId > 0).toBe(true);

		hostReply({ spool: "walk-decision", frame: "clipboard", id: firstId, accepted: false, reason: "inactive" });
		click("#walk-third");
		const walks = messages.filter((message) => message.spool === "go");
		expect(walks).toHaveLength(2);
		const secondId = walks[1]?.id;
		expect(typeof secondId === "number" && Number.isSafeInteger(secondId) && secondId > 0).toBe(true);
		expect(secondId).not.toBe(firstId);

		hostReply({ spool: "walk-decision", frame: "clipboard", id: firstId, accepted: false, reason: "inactive" });
		click("#copy-second");
		await waitForText("#second-result", "AbortError:Clipboard request interrupted by navigation");
		expect(messages.filter((message) => message.spool === "copy")).toHaveLength(0);

		hostReply({ spool: "walk-decision", frame: "clipboard", id: secondId, accepted: false, reason: "inactive" });
		click("#copy-first");
		await waitForText("#first-result", "pending");
		expect(messages.filter((message) => message.spool === "copy")).toHaveLength(1);
	});

	it("clears a canvas walk only for its exact parent decision", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "clipboard", clipboardTsx);
		writeFrame(harness.root, "third", "export default function Third() { return <main>third</main> }");
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "clipboard", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		await waitForText("#race-result", "idle");
		click("#walk-third");
		const walk = messages.find((message) => message.spool === "go");
		const decision = {
			spool: "walk-decision",
			frame: "clipboard",
			id: walk?.id,
			accepted: false,
			reason: "inactive",
		};

		hostReply(decision, {} as WindowProxy);
		hostReply({ ...decision, frame: "other" });
		hostReply({ ...decision, extra: true });
		hostReply({ ...decision, id: 0 });
		hostReply({ ...decision, accepted: "false" });
		hostReply({ ...decision, reason: "unknown" });
		const { reason: _reason, ...missingReason } = decision;
		hostReply(missingReason);
		click("#copy-second");
		await waitForText("#second-result", "AbortError:Clipboard request interrupted by navigation");
		expect(messages.filter((message) => message.spool === "copy")).toHaveLength(0);

		hostReply(decision);
		click("#copy-first");
		await waitForText("#first-result", "pending");
		expect(messages.filter((message) => message.spool === "copy")).toHaveLength(1);
	});

	it("hands an external anchor to the host without navigating the frame", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		const messages: Record<string, unknown>[] = [];
		const { assign } = await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});
		await waitForText("output", "2");

		expect(click("#handled"), "handled click default-prevented").toBe(false);
		expect(messages.some((message) => message.spool === "external")).toBe(false);
		expect(click("#empty-go"), "empty data-go click default-prevented").toBe(false);
		expect(messages).toContainEqual({
			spool: "external",
			frame: "inbox",
			href: "https://example.com/empty-go",
		});
		expect(click("#external"), "external click default-prevented").toBe(false);
		expect(messages).toContainEqual({
			spool: "external",
			frame: "inbox",
			href: "https://github.com/liamvinberg/spool",
		});
		expect(assign).not.toHaveBeenCalled();
	});

	it("asks the host for a session on boot and resumes the answered record", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		const messages: Record<string, unknown>[] = [];

		await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") {
					// the canvas carries the walk's session into the freshly booted frame
					hostReply({
						spool: "session",
						record: { scenario: "default", state: { unread: 7 }, stack: ["thread--detail"] },
					});
				}
			},
		});

		// the handed state wins over the scenario seed (2)
		await waitForText("output", "7");
		expect(messages.some((m) => m.spool === "session?")).toBe(true);

		// ui.back pops the handed stack and posts the walk to the host
		click("#back-empty");
		await vi.waitFor(() => {
			const back = messages.find((m) => m.spool === "back");
			expect(back).toBeDefined();
			expect(back).toMatchObject({ target: "thread--detail", frame: "inbox" });
			expect((back as { session: { stack: string[] } }).session.stack).toEqual([]);
		});
	});

	it("commits embedded history only for accepted walks and missing backs", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		const messages: Record<string, unknown>[] = [];
		await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") {
					hostReply({
						spool: "session",
						record: {
							scenario: "default",
							state: { unread: 7 },
							stack: ["previous", "deleted"],
						},
					});
				}
			},
		});
		await waitForText("output", "7");

		const walks = () => messages.filter((message) => message.spool === "go" || message.spool === "back");
		const latest = () =>
			walks().at(-1) as {
				spool: "go" | "back";
				frame: string;
				id: number;
				target: string;
				session: { state: Record<string, unknown>; stack: string[] };
			};
		const reject = (message: ReturnType<typeof latest>, reason: "inactive" | "missing") => {
			hostReply({
				spool: "walk-decision",
				frame: message.frame,
				id: message.id,
				accepted: false,
				reason,
			});
		};

		click("#carry");
		const inactiveGo = latest();
		expect(inactiveGo).toMatchObject({
			spool: "go",
			target: "thread--detail",
			session: { state: { unread: 99 }, stack: ["previous", "deleted", "inbox"] },
		});
		reject(inactiveGo, "inactive");

		click("#back-empty");
		const inactiveBack = latest();
		expect(inactiveBack).toMatchObject({
			spool: "back",
			target: "deleted",
			session: { stack: ["previous"] },
		});
		reject(inactiveBack, "inactive");
		click("#back-empty");
		const missingBack = latest();
		expect(missingBack.target).toBe("deleted");
		reject(missingBack, "missing");

		click("#back-empty");
		const previousBack = latest();
		expect(previousBack.target).toBe("previous");
		reject(previousBack, "inactive");

		click("#carry");
		const missingGo = latest();
		expect(missingGo.session.stack).toEqual(["previous", "inbox"]);
		reject(missingGo, "missing");
		click("#back-empty");
		const afterMissingGo = latest();
		expect(afterMissingGo.target).toBe("previous");
		reject(afterMissingGo, "inactive");

		click("#carry");
		const acceptedGo = latest();
		hostReply({
			spool: "walk-decision",
			frame: acceptedGo.frame,
			id: acceptedGo.id,
			accepted: true,
		});
		click("#back-empty");
		const acceptedBack = latest();
		expect(acceptedBack.target).toBe("inbox");
		hostReply({
			spool: "walk-decision",
			frame: acceptedBack.frame,
			id: acceptedBack.id,
			accepted: true,
		});
		click("#back-empty");
		expect(latest().target).toBe("previous");
	});

	it("posts go with the session snapshot instead of navigating, seeding fresh when the host has nothing", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		const messages: Record<string, unknown>[] = [];

		const { assign } = await loadFrameDocument(harness, "inbox", {
			host: (message) => {
				messages.push(message);
				if (message.spool === "session?") hostReply({ spool: "session", record: null });
			},
		});

		// nothing to resume: the scenario seed is the session
		await waitForText("output", "2");

		click("#carry");
		await vi.waitFor(() => {
			const go = messages.find((m) => m.spool === "go");
			expect(go).toBeDefined();
			expect(go).toMatchObject({ target: "thread--detail", frame: "inbox" });
			const session = (go as { session: { scenario: string; state: Record<string, unknown>; stack: string[] } })
				.session;
			// the patch landed before the snapshot; this frame is on the stack
			expect(session.state.unread).toBe(99);
			expect(session.stack).toEqual(["inbox"]);
			expect(session.scenario).toBe("default");
		});
		// the host owns embedded walks — never a navigation
		expect(assign).not.toHaveBeenCalled();
	});

	it("boots on the scenario seed when the host never answers", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);

		// a silent host (or a foreign embedder): the 250ms handshake times out
		await loadFrameDocument(harness, "inbox", { host: () => {} });

		await waitForText("output", "2");
	});
});
