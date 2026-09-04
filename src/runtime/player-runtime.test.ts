// @vitest-environment happy-dom

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { compositionOf, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

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

	// The composition is split at every frame and served by name (#24): lay
	// its modules out on disk the way the chunk route names them, so their
	// relative imports resolve, and boot from the entry the document imports.
	const composed = await compositionOf(app, doc);
	const bootHome = join(bootDir, `boot-${bootCount++}`);
	for (const [url, js] of composed.modules) {
		const file = join(bootHome, url.slice(url.indexOf("/-/") + 3));
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, js);
	}
	await import(join(bootHome, composed.entry.slice(composed.entry.indexOf("/-/") + 3)));
	// the opening screen is fetched before anything renders
	await vi.waitFor(() => expect(document.querySelector("#root")?.textContent).not.toBe("booting"));

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

/** The bar names the frame the session stands in — the only live readout there is. */
async function waitForFrame(name: string): Promise<void> {
	await waitForText(".spool-bar-name", name);
}

/**
 * A remembered choice needs somewhere to be remembered. happy-dom hands this
 * document no storage, so the test gives it one that lasts the test.
 */
function rememberIn(store: Map<string, string>): void {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key),
		},
	});
	onTestFinished(() => {
		Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
	});
}

/**
 * The hand arriving on the strip, or leaving it, as React sees it: it draws
 * enter and leave from the pair the browser bubbles, so that pair is what a
 * test sends.
 */
function hover(target: Element, on: boolean): void {
	target.dispatchEvent(new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: document.body }));
}

/** The bar is worn, not summoned: it is there as soon as the page is. */
async function summonEdgeBar(): Promise<HTMLElement> {
	await vi.waitFor(() => expect(document.querySelector(".spool-top:not(.is-away)")).not.toBeNull());
	return document.querySelector(".spool-page") as HTMLElement;
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

function scaffold(harness: Harness): void {
	writeFrame(harness.root, "menu", menuTsx);
	// stated rather than inherited: the width cap is what these tests are about,
	// and a default wider than the test viewport would never reach one
	writeDesignFile(harness.root, join("frames", "menu", "frame.json"), '{ "w": 390, "h": 844 }\n');
	writeFrame(harness.root, "cart", cartTsx);
	writeFrame(harness.root, "pay--done", payDoneTsx);
	writeDesignFile(harness.root, "shared/scenarios/default.json", '{\n\t"state": { "count": 2 }\n}\n');
}

describe("the player session", () => {
	it("boots on the start frame with the seeded scenario, at the frame's geometry", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");

		// the authored width is a cap, never a size: the page takes the viewport
		// below it, and its height is whatever its content is
		const screen = document.querySelector(".spool-screen") as HTMLElement;
		expect(screen.style.width).toBe(`${Math.min(window.innerWidth, 390)}px`);
		expect(screen.style.height).toBe("");
		expect(screen.style.transform).toBe("");
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
		expect(document.querySelector(".spool-bar-name")?.textContent).toBe("menu");

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
		expect(document.querySelector("output")?.textContent).toBe("5");
		expect(document.querySelector(".spool-bar-name")?.textContent).toBe("menu");

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

		// the switcher walks like anything else, so its swap is filmed like one
		await summonEdgeBar();
		click("#spool-switcher");
		click(".spool-picker-row:not(.is-here)");
		await waitForFrame("cart");
		expect(calls.at(-1)?.types).toEqual(["forward"]);
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
		writeDesignFile(harness.root, "shared/scenarios/vip.json", '{\n\t"state": { "count": 41 }\n}\n');

		await loadPlayerDocument(harness, "?frame=menu&scenario=vip");

		await waitForText("output", "41");
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

describe("the played page and its bar (#227)", () => {
	it("lays the page out at the viewport, capped at the authored width", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");

		// the authored width is the cap and the viewport is the rest: nothing is
		// scaled, nothing is letterboxed, and the height is the content's own
		const screen = document.querySelector(".spool-screen") as HTMLElement;
		expect(screen.style.width).toBe(`${Math.min(window.innerWidth, 390)}px`);
		expect(screen.style.height).toBe("");
		expect(screen.style.transform).toBe("");
	});

	it("wears the bar, puts it away on the eye, and peeks it back on a rest against the top edge", async () => {
		const harness = makeHarness();
		scaffold(harness);
		const remembered = new Map<string, string>();
		rememberIn(remembered);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		const page = document.querySelector(".spool-page") as HTMLElement;
		const away = () => document.querySelector(".spool-top.is-away");

		// worn by default, and the page is inset by it
		expect(document.querySelector(".spool-top")).not.toBeNull();
		expect(away()).toBeNull();
		expect(page.classList.contains("has-bar")).toBe(true);
		expect(document.querySelector(".spool-nub")).toBeNull();

		// the eye puts it away: the page gets its 30px back, the nub is the trace,
		// and the choice is remembered
		click("#spool-bar-eye");
		await vi.waitFor(() => expect(away()).not.toBeNull());
		expect(page.classList.contains("has-bar")).toBe(false);
		expect(document.querySelector(".spool-nub")).not.toBeNull();
		expect(remembered.get("spool:player-bar-hidden")).toBe("1");

		// resting against the top edge peeks it in over the page, and the dwell
		// is what makes it a rest rather than a pass
		const strip = document.querySelector(".spool-peek") as HTMLElement;
		hover(strip, true);
		expect(away()).not.toBeNull();
		await vi.waitFor(() => expect(away()).toBeNull());
		expect(document.querySelector(".spool-peek.is-open")).not.toBeNull();
		expect(page.classList.contains("has-bar")).toBe(false);

		// leaving takes it away at once
		hover(strip, false);
		await vi.waitFor(() => expect(away()).not.toBeNull());

		// a pass through the strip on the way out never peeks it
		hover(strip, true);
		hover(strip, false);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(away()).not.toBeNull();

		// pressing the nub puts it back on
		click(".spool-nub");
		await vi.waitFor(() => expect(document.querySelector(".spool-peek")).toBeNull());
		expect(page.classList.contains("has-bar")).toBe(true);
		expect(remembered.has("spool:player-bar-hidden")).toBe(false);
	});

	it("opens put away when it was put away last time", async () => {
		const harness = makeHarness();
		scaffold(harness);
		rememberIn(new Map([["spool:player-bar-hidden", "1"]]));

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		expect(document.querySelector(".spool-top.is-away")).not.toBeNull();
		expect(document.querySelector(".spool-nub")).not.toBeNull();
		expect((document.querySelector(".spool-page") as HTMLElement).classList.contains("has-bar")).toBe(false);
	});

	it("carries the switcher and the exits, and nothing the pill used to", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		await summonEdgeBar();

		for (const gone of [".spool-rail", ".spool-walk-hop", ".spool-ticks", ".spool-hud", ".spool-pill"]) {
			expect(document.querySelector(gone), gone).toBeNull();
		}
		// the pill's own controls are gone with it: a tab reloads to restart and
		// fills the screen through the browser
		for (const gone of ["#spool-inspector", "#spool-motion", "#spool-back", "#spool-restart", "#spool-fullscreen"]) {
			expect(document.querySelector(gone), gone).toBeNull();
		}
		expect(document.querySelector("#spool-close")).not.toBeNull();

		// the switcher is closed by default, and names every screen when opened
		expect(document.querySelector(".spool-picker.is-open")).toBeNull();
		click("#spool-switcher");
		await vi.waitFor(() => expect(document.querySelector(".spool-picker.is-open")).not.toBeNull());
		expect([...document.querySelectorAll(".spool-picker-row")].map((row) => row.textContent)).toEqual([
			"cart",
			"menu",
			"pay--done",
		]);
	});

	it("walks from the switcher and names the arrival in the URL and the title", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		expect(new URL(window.location.href).searchParams.get("frame")).toBe("menu");
		expect(document.title).toBe(`menu · ${harness.name}`);

		click("#walk");
		await waitForFrame("cart");
		expect(new URL(window.location.href).searchParams.get("frame")).toBe("cart");
		expect(document.title).toBe(`cart · ${harness.name}`);

		// and the browser's own back button walks the session back
		window.history.back();
		await waitForFrame("menu");
		expect(new URL(window.location.href).searchParams.get("frame")).toBe("menu");
	});

	it("walks back on the browser's own button, and witnesses no edge doing it", async () => {
		const harness = makeHarness();
		scaffold(harness);

		const { fetched } = await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		const calls = stubViewTransitions();
		const witnessed = () => fetched.filter((call) => call.method === "POST" && call.url.endsWith("/walked")).length;

		// a press inside the prototype is a walk the session really took
		click("#walk");
		await waitForFrame("cart");
		expect(calls.at(-1)?.types).toEqual(["forward", "lift"]);
		expect(witnessed()).toBe(1);

		// the browser's own button is a step back through the walk, so it plays as
		// one — and nobody pressed anything inside the prototype, so there is no
		// claim on the map for it to confirm (#25)
		window.history.back();
		await waitForFrame("menu");
		expect(calls.at(-1)?.types).toEqual(["back"]);
		expect(witnessed()).toBe(1);

		// and the switcher is the same: spool's own chrome never mints an edge
		await summonEdgeBar();
		click("#spool-switcher");
		click(".spool-picker-row:not(.is-here)");
		await waitForFrame("cart");
		expect(calls.at(-1)?.types).toEqual(["forward"]);
		expect(witnessed()).toBe(1);
	});

	it("never takes a plain key from the prototype, and answers only its own chord", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForFrame("menu");
		click("#walk");
		await waitForFrame("cart");
		const close = vi.spyOn(window, "close").mockImplementation(() => {});

		// every ordinary key belongs to the app being played, esc included (#227)
		for (const key of ["Escape", "Backspace", "ArrowLeft", "i", "r", "f"]) {
			window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
			document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(document.querySelector(".spool-bar-name")?.textContent).toBe("cart");
		expect(close).not.toHaveBeenCalled();

		// behind accel, the same key is spool's
		accelKeydown("Escape");
		expect(close).toHaveBeenCalled();
	});
});
