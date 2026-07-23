// @vitest-environment happy-dom

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { createDaemonApp } from "../daemon/app";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The flow runtime, exercised through really-served documents: every config
 * script and boot module under test comes byte-for-byte from app.request(),
 * compiled by the real pipeline. The harness stands in for the browser only —
 * happy-dom as the realm, window.fetch bridged into the same in-process app,
 * vitest aliases playing the import map (see vitest.config.ts).
 */

interface Harness {
	app: ReturnType<typeof createDaemonApp>["app"];
	root: string;
	name: string;
}

function makeHarness(): Harness {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test" });
	onTestFinished(() => daemon.close());
	return { app: daemon.app, root, name };
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

	happyDom().setURL(`http://localhost:7766/p/${name}/frames/${frame}${search}`);
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
	Object.defineProperty(window, "parent", {
		configurable: true,
		value: host === undefined ? window : { postMessage: (data: unknown) => host(data as Record<string, unknown>) },
	});

	const bootJs = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
	expect(bootJs, "served boot module").toBeDefined();
	const bootFile = join(bootDir, `boot-${bootCount++}.js`);
	writeFileSync(bootFile, bootJs ?? "");
	await import(bootFile);

	return { assign };
}

/** Answer the frame realm's message listener the way a canvas would. */
function hostReply(data: Record<string, unknown>): void {
	window.dispatchEvent(new MessageEvent("message", { data }));
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

const productsTsx = `import { useEffect, useState } from "react";

export default function Products() {
	const [titles, setTitles] = useState<string[]>([]);
	useEffect(() => {
		fetch("/api/products")
			.then((res) => res.json())
			.then((items: Array<{ title: string }>) => setTitles(items.map((item) => item.title)));
	}, []);
	return <ul>{titles.map((title) => <li key={title}>{title}</li>)}</ul>;
}
`;

function scaffoldFlow(harness: Harness): void {
	writeFrame(harness.root, "inbox", inboxTsx);
	writeFrame(harness.root, "thread--detail", threadDetailTsx);
	writeFrame(harness.root, "checkout--empty", checkoutEmptyTsx);
	writeDesignFile(harness.root, "shared/scenarios/default.json", '{\n\t"state": { "unread": 2 },\n\t"mock": {}\n}\n');
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

	it("data-go and the mock work in a frame that never imports spool", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		writeDesignFile(harness.root, "shared/fixtures/products.json", '[{ "title": "yarn" }]\n');

		const checkout = await loadFrameDocument(harness, "checkout--empty");
		await vi.waitFor(() => {
			expect(document.querySelector("p")?.textContent).toBe("checkout is empty");
		});

		const res = await window.fetch("/api/products");
		expect(await res.json()).toEqual([{ title: "yarn" }]);

		click("p");
		await waitForWalk(checkout.assign, `/p/${harness.name}/frames/inbox`);
	});

	it("a ?scenario= URL starts and restarts the session on that scenario, and walks preserve it", async () => {
		const harness = makeHarness();
		scaffoldFlow(harness);
		writeDesignFile(harness.root, "shared/scenarios/vip.json", '{\n\t"state": { "unread": 9 },\n\t"mock": {}\n}\n');

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

describe("the mock layer", () => {
	it("serves fixtures to a frame's fetch with configured latency and status", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "products", productsTsx);
		writeDesignFile(harness.root, "shared/fixtures/products.json", '[{ "title": "yarn" }, { "title": "thread" }]\n');
		writeDesignFile(
			harness.root,
			"shared/scenarios/default.json",
			'{\n\t"state": {},\n\t"mock": {\n\t\t"latency": 60,\n\t\t"POST /api/pay": { "status": 500 }\n\t}\n}\n',
		);

		await loadFrameDocument(harness, "products");

		// the frame's own fetch resolves the fixture by name, felt through latency
		await vi.waitFor(() => {
			const titles = [...document.querySelectorAll("li")].map((li) => li.textContent);
			expect(titles).toEqual(["yarn", "thread"]);
		});

		// latency: the bare top-level dial slows every mocked response
		const before = performance.now();
		const products = await window.fetch("/api/products");
		expect(performance.now() - before).toBeGreaterThanOrEqual(55);
		expect(products.status).toBe(200);
		expect(products.headers.get("content-type")).toContain("application/json");
		expect(await products.json()).toEqual([{ title: "yarn" }, { title: "thread" }]);

		// status: the method-prefixed rule answers the write with its canned status
		const pay = await window.fetch("/api/pay", { method: "POST" });
		expect(pay.status).toBe(500);

		// a GET of the same path misses the POST rule and falls through
		const getPay = await window.fetch("/api/pay");
		expect(getPay.status).toBe(404);
	});

	it("resolves rules over convention, inline bodies, rule fixtures, and latency-only rules", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "products", productsTsx);
		writeDesignFile(harness.root, "shared/fixtures/products.json", '[{ "title": "from-convention" }]\n');
		writeDesignFile(harness.root, "shared/fixtures/vip-products.json", '[{ "title": "from-rule-fixture" }]\n');
		writeDesignFile(
			harness.root,
			"shared/scenarios/default.json",
			`{
	"state": {},
	"mock": {
		"/api/products": { "fixture": "vip-products" },
		"GET /api/inline": { "greeting": "hi" },
		"/api/slow": { "latency": 40 }
	}
}
`,
		);
		writeDesignFile(harness.root, "shared/fixtures/slow.json", '{ "ok": true }\n');

		await loadFrameDocument(harness, "products");

		// scenario rules sit above the fixtures convention in the resolution order
		await vi.waitFor(() => {
			const titles = [...document.querySelectorAll("li")].map((li) => li.textContent);
			expect(titles).toEqual(["from-rule-fixture"]);
		});

		// an object of non-reserved keys is an inline body
		expect(await (await window.fetch("/api/inline")).json()).toEqual({ greeting: "hi" });

		// a latency-only rule shapes timing while the body resolves by convention
		const before = performance.now();
		const slow = await window.fetch("/api/slow");
		expect(performance.now() - before).toBeGreaterThanOrEqual(35);
		expect(await slow.json()).toEqual({ ok: true });
	});

	it("passes absolute URLs through and 404s unmocked relative fetches loudly", async () => {
		const harness = makeHarness();
		writeFrame(harness.root, "checkout--empty", checkoutEmptyTsx);

		await loadFrameDocument(harness, "checkout--empty", {
			outside: (url) => (url.startsWith("https://outside.test/") ? new Response("outside network") : undefined),
		});

		const outside = await window.fetch("https://outside.test/ping");
		expect(await outside.text()).toBe("outside network");

		const missing = await window.fetch("/api/ghost");
		expect(missing.status).toBe(404);
		const notice = await missing.text();
		expect(notice).toContain("GET /api/ghost");
		expect(notice).toContain("scenario rule");
	});
});

describe("embedded in a canvas", () => {
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
