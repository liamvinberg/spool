// @vitest-environment happy-dom

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { terminalSourceVersion } from "../daemon/term-source";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The player session (#24), exercised through the really-served /play/
 * document: the config script, chrome, and composed bundle under test come
 * byte-for-byte from app.request(). happy-dom has no View Transitions, which
 * is itself the seam: swaps must work bare, and a stubbed
 * document.startViewTransition observes the types the runtime hands the real
 * API — crossfade directions, data-transition overrides, the motion gate.
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

function happyDom(): { setURL(url: string): void } {
	return (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
}

const bootParent = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".boot-tmp");
mkdirSync(bootParent, { recursive: true });
const bootDir = mkdtempSync(join(bootParent, "play-"));
let bootCount = 0;
const boundListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = [];
afterAll(() => rmSync(bootDir, { recursive: true, force: true }));

type VtCall = { types: string[] | undefined };

/** Load the served player document the way a phone would: one URL, one page. */
async function loadPlayerDocument(harness: Harness, query = "") {
	const { app, name } = harness;
	const res = await app.request(`/play/${name}${query}`);
	expect(res.status, "serving the player").toBe(200);
	const doc = await res.text();

	// the previous document is gone: real navigation destroys its listeners
	for (const { type, listener } of boundListeners.splice(0)) {
		document.removeEventListener(type, listener);
	}
	vi.restoreAllMocks();
	vi.resetModules();
	delete (document as { startViewTransition?: unknown }).startViewTransition;

	happyDom().setURL(`http://run.spool.localhost:7766/play/${name}${query}`);
	const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const addEventListener = document.addEventListener.bind(document);
	vi.spyOn(document, "addEventListener").mockImplementation((type, listener, opts) => {
		if (listener) boundListeners.push({ type, listener });
		addEventListener(type, listener, opts);
	});

	// terminal screens mount iframes (#44) — no daemon listens on the test URL,
	// so happy-dom must not try to really load them. It prints one unsuppressible
	// "Iframe page loading is disabled" notice per mount (it holds the worker's
	// original console, captured before vitest's interception): known noise.
	const settings = (window as unknown as { happyDOM?: { settings?: { disableIframePageLoading?: boolean } } }).happyDOM
		?.settings;
	if (settings !== undefined) settings.disableIframePageLoading = true;

	const fetched: { method: string; url: string }[] = [];
	window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		fetched.push({ method: (init?.method ?? "GET").toUpperCase(), url });
		return Promise.resolve(app.request(url, init));
	}) as typeof fetch;
	Object.defineProperty(window, "parent", {
		configurable: true,
		value: {
			postMessage: (data: unknown) => {
				const message = data as { spool?: string; from?: string; to?: string; frame?: string };
				if (message.spool === "player-close") {
					window.close();
					return;
				}
				if (message.spool === "player-walked" && message.from !== undefined && message.to !== undefined) {
					const url = `/api/p/${name}/walked`;
					fetched.push({ method: "POST", url });
					void app.request(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ from: message.from, to: message.to }),
					});
					return;
				}
			},
		},
	});

	document.body.innerHTML = doc.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
	expect(document.querySelector("#root")?.textContent, "the boot cover").toBe("booting");

	const configScript = doc.match(/<script>(window\.__SPOOL_PLAY__[\s\S]*?)<\/script>/)?.[1];
	expect(configScript, "served player config").toBeDefined();
	new Function(configScript ?? "")();

	const bootJs = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
	expect(bootJs, "served boot module").toBeDefined();
	const bootFile = join(bootDir, `boot-${bootCount++}.js`);
	writeFileSync(bootFile, bootJs ?? "");
	await import(bootFile);

	return { assign, fetched };
}

/** Observe what the runtime hands the View Transitions API. */
function stubViewTransitions(): VtCall[] {
	const calls: VtCall[] = [];
	(
		document as {
			startViewTransition?: (options: { update: () => void; types?: string[] } | (() => void)) => object;
		}
	).startViewTransition = (options) => {
		if (typeof options === "function") {
			options();
			calls.push({ types: undefined });
		} else {
			options.update();
			calls.push({ types: options.types });
		}
		return {};
	};
	return calls;
}

function click(selector: string): void {
	const el = document.querySelector(selector);
	expect(el, selector).not.toBeNull();
	(el as Element).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

async function waitForText(selector: string, text: string): Promise<void> {
	await vi.waitFor(() => {
		const el = document.querySelector(selector);
		if (el === null || el.textContent !== text) {
			throw new Error(`waiting for ${selector} to show ${JSON.stringify(text)}, got ${el?.textContent}`);
		}
	});
}

/** The pill names the frame the session stands in — the only live readout there is. */
async function waitForFrame(name: string): Promise<void> {
	await waitForText(".spool-pill-name", name);
}

/** How far down the screen is scaled to fit the stage. */
function stageScale(): number {
	const transform = (document.querySelector(".spool-screen") as HTMLElement).style.transform;
	return Number(/scale\((-?\d+(?:\.\d+)?)\)/.exec(transform)?.[1]);
}

/** Where the screen sits on the stage. */
function stageOffsetX(): number {
	const transform = (document.querySelector(".spool-screen") as HTMLElement).style.transform;
	return Number(/translate\((-?\d+(?:\.\d+)?)px/.exec(transform)?.[1]);
}

/** An accel chord as the platform this test runs on spells it. */
function accelKeydown(key: string): void {
	const apple = /^mac|^ip(hone|ad|od)/i.test(
		(navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform,
	);
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, metaKey: apple, ctrlKey: !apple }));
}

const menuTsx = `import { ui } from "spool";

export default function Menu() {
	const state = ui.use();
	return (
		<main>
			<output>{String(state.count ?? "unset")}</output>
			<button type="button" id="bump" onClick={() => { ui.state.count = 5; }}>bump</button>
			<button type="button" id="walk" data-go="cart" data-transition="lift">to cart</button>
			<button type="button" id="typo" data-go="ghost">to ghost</button>
			<button type="button" id="frame-top" style={{ position: "fixed", inset: 0, zIndex: 9999 }}>top layer</button>
			<a id="external" href="https://github.com/liamvinberg/spool">github</a>
			<a id="external-port" href="http://user:secret@example.com:8080/docs">port</a>
		</main>
	);
}
`;

const cartTsx = `import { useEffect } from "react";
import { ui } from "spool";

export default function Cart() {
	const state = ui.use();
	useEffect(() => {
		window.__cartArrivals = (window.__cartArrivals ?? 0) + 1;
	}, []);
	return (
		<main>
			<output>{String(state.count ?? "unset")}</output>
			<button type="button" id="go-back" onClick={() => ui.back()}>back</button>
			<button type="button" id="walk-pay" data-go="pay--done">pay</button>
			<button type="button" id="walk-menu" data-go="menu">menu</button>
		</main>
	);
}
`;

const payDoneTsx = `import { ui } from "spool";

export default function PayDone() {
	return (
		<main>
			<h1>paid</h1>
			<button type="button" id="go-back-pay" onClick={() => ui.back()}>back</button>
		</main>
	);
}
`;

const productsTsx = `import { useEffect, useState } from "react";

export default function Products() {
	const [titles, setTitles] = useState([]);
	useEffect(() => {
		fetch("/api/products")
			.then((res) => res.json())
			.then((items) => setTitles(items.map((item) => item.title)));
	}, []);
	return <ul>{titles.map((title) => <li key={title}>{title}</li>)}</ul>;
}
`;

function scaffold(harness: Harness): void {
	writeFrame(harness.root, "menu", menuTsx);
	writeFrame(harness.root, "cart", cartTsx);
	writeFrame(harness.root, "pay--done", payDoneTsx);
	writeDesignFile(harness.root, "shared/scenarios/default.json", '{\n\t"state": { "count": 2 },\n\t"mock": {}\n}\n');
}

describe("the player session", () => {
	it("boots on the start frame with the seeded scenario, at the frame's geometry", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");

		const screen = document.querySelector(".spool-screen") as HTMLElement;
		expect(screen.style.width).toBe("390px");
		expect(screen.style.height).toBe("844px");
		await waitForFrame("menu");
	});

	it("walks data-go in the same document, carries state, remounts fresh on every arrival", async () => {
		const harness = makeHarness();
		scaffold(harness);

		const { assign } = await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");

		click("#walk");
		await waitForFrame("cart");
		// the walked-to screen is in the same document, session state intact
		await waitForText("output", "5");
		expect((window as { __cartArrivals?: number }).__cartArrivals).toBe(1);

		// ui.back pops the name-stack; the screen script runs fresh on return
		click("#go-back");
		await waitForFrame("menu");
		click("#walk");
		await waitForFrame("cart");
		expect((window as { __cartArrivals?: number }).__cartArrivals).toBe(2);

		// the player never navigates the document itself
		click("#go-back");
		await waitForFrame("menu");
		expect(assign).not.toHaveBeenCalled();
	});

	it("confirms external links above the current screen without disturbing the session", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");

		click("#external");
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());

		const open = document.querySelector<HTMLAnchorElement>(
			'[role="dialog"] a[href="https://github.com/liamvinberg/spool"]',
		);
		expect(open?.target).toBe("_blank");
		expect(open?.rel).toBe("noopener noreferrer");
		expect(document.querySelector("output")?.textContent).toBe("5");
		expect(document.querySelector(".spool-pill-name")?.textContent).toBe("menu");
		expect((document.querySelector("#spool-restart") as HTMLButtonElement).disabled).toBe(true);
		expect((document.querySelector(".spool-screen-scroll") as HTMLElement).style.getPropertyValue("isolation")).toBe(
			"isolate",
		);
		(document.querySelector("#spool-restart") as HTMLButtonElement).click();
		expect(document.querySelector("output")?.textContent).toBe("5");

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
		expect(document.querySelector("output")?.textContent).toBe("5");
		expect(document.querySelector(".spool-pill-name")?.textContent).toBe("menu");

		click("#external-port");
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("http://example.com:8080/docs");
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Open example.com:8080");
		expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("secret");
		const portOpen = document.querySelector<HTMLAnchorElement>(
			'[role="dialog"] a[href="http://example.com:8080/docs"]',
		);
		expect(portOpen?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
	});

	it("stacks names through a three-frame walk", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");

		click("#walk");
		await waitForFrame("cart");
		click("#walk-pay");
		await waitForFrame("pay--done");
		await waitForText("h1", "paid");

		click("#go-back-pay");
		await waitForFrame("cart");
		click("#go-back");
		await waitForFrame("menu");
	});

	it("restart re-seeds the session from a fresh scenario read at the start frame", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");
		click("#walk");
		await waitForFrame("cart");

		// the agent edits the seed mid-session; restart reads it fresh
		writeDesignFile(
			harness.root,
			"shared/scenarios/default.json",
			'{\n\t"state": { "count": 9 },\n\t"mock": {}\n}\n',
		);
		click("#spool-restart");

		await waitForFrame("menu");
		await waitForText("output", "9");
	});

	it("hands the View Transitions API its direction types and per-link overrides", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		const calls = stubViewTransitions();

		// data-transition rides along as an extra type over the forward direction
		click("#walk");
		await waitForFrame("cart");
		expect(calls.at(-1)?.types).toEqual(["forward", "lift"]);

		click("#go-back");
		await waitForFrame("menu");
		expect(calls.at(-1)?.types).toEqual(["back"]);

		click("#spool-restart");
		await vi.waitFor(() => expect(calls.at(-1)?.types).toEqual(["restart"]));
	});

	it("a missing walk target is loud but harmless", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		const notices = vi.spyOn(console, "error").mockImplementation(() => {});

		click("#typo");

		await vi.waitFor(() => {
			expect(notices).toHaveBeenCalledWith(expect.stringContaining('no frame "ghost"'));
		});
		await waitForFrame("menu");
	});

	it("seeds from the ?scenario= the URL names", async () => {
		const harness = makeHarness();
		scaffold(harness);
		writeDesignFile(harness.root, "shared/scenarios/vip.json", '{\n\t"state": { "count": 41 },\n\t"mock": {}\n}\n');

		await loadPlayerDocument(harness, "?frame=menu&scenario=vip");

		await waitForText("output", "41");
	});

	it("serves the mock layer to composed frames", async () => {
		const harness = makeHarness();
		scaffold(harness);
		writeFrame(harness.root, "products", productsTsx);
		writeDesignFile(harness.root, "shared/fixtures/products.json", '[{ "title": "yarn" }, { "title": "thread" }]\n');

		await loadPlayerDocument(harness, "?frame=products");

		await vi.waitFor(() => {
			const titles = [...document.querySelectorAll(".spool-screen li")].map((li) => li.textContent);
			expect(titles).toEqual(["yarn", "thread"]);
		});
	});

	it("a driven session flips a verified mark on the derived edge it walks (#34)", async () => {
		const harness = makeHarness();
		scaffold(harness);
		writeFrame(
			harness.root,
			"coded",
			`import { ui } from "spool";

export default function Coded() {
	return <button type="button" id="coded-walk" onClick={() => ui.go("pay--done")}>pay</button>;
}
`,
		);

		await loadPlayerDocument(harness, "?frame=coded");
		await vi.waitFor(() => expect(document.querySelector("#coded-walk")).not.toBeNull());

		click("#coded-walk");
		await waitForFrame("pay--done");

		// the map already claimed this edge from source; the walk can only confirm it
		await vi.waitFor(async () => {
			const flows = (await (await harness.app.request(`/api/p/${harness.name}/flows`)).json()) as {
				edges: { from: string; to: string; certainty: string; verified?: boolean }[];
			};
			const edge = flows.edges.find((e) => e.from === "coded" && e.to === "pay--done");
			expect(edge?.certainty).toBe("will");
			expect(edge?.verified).toBe(true);
		});
	});

	it("keeps clickable-area hints out of the player", async () => {
		const harness = makeHarness();
		scaffold(harness);
		writeFrame(
			harness.root,
			"hints",
			`import { ui } from "spool";

export default function Hints() {
	return (
		<main>
			<button type="button" id="coded" onClick={() => ui.go("menu")}>coded</button>
			<a id="markup" data-go="cart">markup</a>
		</main>
	);
}
`,
		);

		await loadPlayerDocument(harness, "?frame=hints");
		await waitForFrame("hints");

		expect(document.querySelector("#spool-hint")).toBeNull();
		expect(document.querySelectorAll(".spool-hint")).toHaveLength(0);
		expect(document.querySelector("#coded")?.className).toBe("");
		expect(document.querySelector("#coded")?.getAttribute("style")).toBeNull();
	});

	it("close closes the tab the canvas opened", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		const close = vi.spyOn(window, "close").mockImplementation(() => {});

		click("#spool-close");

		expect(close).toHaveBeenCalled();
	});
});

describe("the stage and the pill (#210)", () => {
	it("fits the frame edge to edge", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");

		// nothing is reserved for chrome any more: the fit is min(1, vw/w, vh/h)
		// and the bars it leaves are aspect mismatch, exactly like a video player
		const scale = Math.min(1, window.innerWidth / 390, window.innerHeight / 844);
		expect(stageScale()).toBeCloseTo(scale, 6);
		expect(stageOffsetX()).toBeCloseTo((window.innerWidth - 390 * scale) / 2, 6);

		// and the pill says where you are, not how big it is: a size and a zoom
		// are the canvas's business, and the pill sits over the prototype
		expect(document.querySelector(".spool-pill")?.textContent).toBe("menu");
	});

	it("keeps the rail, the tape and the registration ticks out of the player", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");

		for (const gone of [".spool-rail", ".spool-walk-hop", ".spool-mock", ".spool-ticks", ".spool-hud"]) {
			expect(document.querySelector(gone), gone).toBeNull();
		}
		// and no controls that only made sense beside them
		for (const gone of ["#spool-inspector", "#spool-motion", "#spool-back"]) {
			expect(document.querySelector(gone), gone).toBeNull();
		}
		expect(document.querySelector("#spool-restart")).not.toBeNull();
		expect(document.querySelector("#spool-fullscreen")).not.toBeNull();
		expect(document.querySelector("#spool-close")).not.toBeNull();
	});

	it("gets out of the way of the prototype, and comes back when reached for", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		const stage = document.querySelector(".spool-stage") as HTMLElement;
		const move = (y: number) => stage.dispatchEvent(new MouseEvent("mousemove", { clientY: y, bubbles: true }));
		// one look on arrival, so you know it is there
		expect(stage.classList.contains("is-asleep")).toBe(false);

		// using a prototype means moving the pointer around it, and that must not
		// keep the pill up: it would sit on whatever the frame draws along its
		// own bottom edge for as long as the prototype was being used
		move(window.innerHeight / 2);
		await vi.waitFor(() => expect(stage.classList.contains("is-asleep")).toBe(true));
		move(window.innerHeight / 3);
		expect(stage.classList.contains("is-asleep")).toBe(true);

		// reaching down to where it lives is what brings it back
		move(window.innerHeight - 10);
		await vi.waitFor(() => expect(stage.classList.contains("is-asleep")).toBe(false));

		// and leaving again puts it away, with no wait to sit through
		move(window.innerHeight / 2);
		await vi.waitFor(() => expect(stage.classList.contains("is-asleep")).toBe(true));
	});

	it("never takes a plain key from the prototype, and answers only its own chords", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		click("#walk");
		await waitForFrame("cart");
		const close = vi.spyOn(window, "close").mockImplementation(() => {});

		// every ordinary key belongs to the app being played, esc included (#210)
		for (const key of ["Escape", "Backspace", "ArrowLeft", "i", "r", "f"]) {
			window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
			document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(document.querySelector(".spool-pill-name")?.textContent).toBe("cart");
		expect(close).not.toHaveBeenCalled();

		// behind accel, the same key is spool's
		accelKeydown("Escape");
		expect(close).toHaveBeenCalled();
	});

	it("fills the screen behind accel+f and from the pill", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		const request = vi.fn(() => Promise.resolve());
		document.documentElement.requestFullscreen =
			request as unknown as typeof document.documentElement.requestFullscreen;

		// earlier tests in this file leave their own players mounted in the same
		// document, so what is asserted is the delta this player adds
		accelKeydown("f");
		const afterChord = request.mock.calls.length;
		expect(afterChord).toBeGreaterThan(0);

		click("#spool-fullscreen");
		expect(request.mock.calls.length).toBe(afterChord + 1);
	});
});

const hallTsx = `export default function Hall() {
	return <button type="button" id="to-dash" data-go="dash">to dash</button>;
}
`;

function scaffoldTerminal(harness: Harness): void {
	writeDesignFile(harness.root, join("frames", "dash", "term.tsx"), "// execution disabled until OS-sandboxed\n");
	writeDesignFile(
		harness.root,
		join(".spool", "term", "dash.screen"),
		`${JSON.stringify({
			cols: 80,
			rows: 24,
			screen: "persisted screen",
			sourceVersion: terminalSourceVersion(harness.root, "dash"),
		})}\n`,
	);
	writeFrame(harness.root, "hall", hallTsx);
	writeDesignFile(harness.root, "shared/scenarios/default.json", '{\n\t"state": {},\n\t"mock": {}\n}\n');
}

function termIframe(): HTMLIFrameElement {
	const el = document.querySelector<HTMLIFrameElement>(".spool-term-screen iframe");
	expect(el, "the terminal screen's iframe").not.toBeNull();
	return el as HTMLIFrameElement;
}

function postFromTerm(iframe: HTMLIFrameElement, data: Record<string, unknown>): void {
	window.dispatchEvent(new MessageEvent("message", { data, source: iframe.contentWindow }));
}

describe("static terminal screens", () => {
	it("hosts the disabled term document over the last persisted grid", async () => {
		const harness = makeHarness();
		scaffoldTerminal(harness);

		await loadPlayerDocument(harness, "?frame=dash");
		await vi.waitFor(() => termIframe());

		const iframe = termIframe();
		expect(iframe.getAttribute("src")).toBe(`/p/${harness.name}/frames/dash`);
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.getAttribute("title")).toBe("dash");
		const poster = document.querySelector<HTMLImageElement>("img.spool-term-poster");
		expect(poster).not.toBeNull();
		expect(decodeURIComponent(poster?.src.split(",", 2)[1] ?? "")).toContain("persisted screen");

		// The static surface keeps terminal framing and takes focus explicitly
		// once its Spool-owned document loads.
		expect.soft(document.querySelector(".spool-term-chord")).toBeNull();
		expect.soft(document.querySelector("#spool-hint")).toBeNull();
		expect.soft(document.querySelector(".spool-screen-scroll")?.classList.contains("is-terminal")).toBe(true);

		const screen = document.querySelector<HTMLElement>(".spool-screen");
		expect
			.soft(screen?.style.transform)
			.toBe(`translate(${(window.innerWidth - 720) / 2}px, ${(window.innerHeight - 480) / 2}px) scale(1)`);

		const postMessage = vi.fn();
		Object.defineProperty(iframe, "contentWindow", {
			configurable: true,
			value: { postMessage },
		});
		iframe.dispatchEvent(new Event("load"));
		expect.soft(postMessage).toHaveBeenCalledWith({ spool: "focus", surface: "player" }, "*");
	});

	it("names the terminal frame on the pill like any other screen", async () => {
		const harness = makeHarness();
		scaffoldTerminal(harness);

		await loadPlayerDocument(harness, "?frame=dash");
		await vi.waitFor(() => termIframe());

		expect(document.querySelector(".spool-pill-name")?.textContent).toBe("dash");
	});

	it("keeps the player chrome awake over a static terminal surface", async () => {
		const harness = makeHarness();
		scaffoldTerminal(harness);

		await loadPlayerDocument(harness, "?frame=dash");
		await vi.waitFor(() => termIframe());
		const stage = document.querySelector(".spool-stage") as HTMLElement;

		// mousemove inside the term document never reaches the stage, so stillness
		// here means nothing — sleeping would strand the chrome with no way back
		await new Promise((resolve) => setTimeout(resolve, 2400));
		expect(stage.classList.contains("is-asleep")).toBe(false);
	});

	it("has no keyboard exit state", async () => {
		const harness = makeHarness();
		scaffoldTerminal(harness);

		await loadPlayerDocument(harness, "?frame=dash");
		await vi.waitFor(() => termIframe());

		const iframe = termIframe();
		await vi.waitFor(() => expect(document.activeElement).toBe(iframe));

		postFromTerm(iframe, { spool: "key", key: "Escape" });
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(document.activeElement).toBe(iframe);
	});
});
