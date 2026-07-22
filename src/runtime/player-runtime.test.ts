// @vitest-environment happy-dom

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { createDaemonApp } from "../daemon/app";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The player session (#24), exercised through the really-served /play/
 * document: the config script, chrome, and composed bundle under test come
 * byte-for-byte from app.request(). happy-dom has no View Transitions, which
 * is itself the seam: swaps must work bare, and a stubbed
 * document.startViewTransition observes the types the runtime hands the real
 * API — crossfade directions, data-transition overrides, the motion gate.
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

	happyDom().setURL(`http://localhost:7766/play/${name}${query}`);
	const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const addEventListener = document.addEventListener.bind(document);
	vi.spyOn(document, "addEventListener").mockImplementation((type, listener, opts) => {
		if (listener) boundListeners.push({ type, listener });
		addEventListener(type, listener, opts);
	});

	window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		return Promise.resolve(app.request(url, init));
	}) as typeof fetch;

	document.body.innerHTML = doc.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
	expect(document.querySelector(".spool-boot")?.textContent, "the boot cover").toBe("booting");

	const configScript = doc.match(/<script>(window\.__SPOOL_PLAY__[\s\S]*?)<\/script>/)?.[1];
	expect(configScript, "served player config").toBeDefined();
	new Function(configScript ?? "")();

	const bootJs = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
	expect(bootJs, "served boot module").toBeDefined();
	const bootFile = join(bootDir, `boot-${bootCount++}.js`);
	writeFileSync(bootFile, bootJs ?? "");
	await import(bootFile);

	return { assign };
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

async function waitForStack(text: string): Promise<void> {
	await waitForText(".spool-stack", text);
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

const payDoneTsx = `export default function PayDone() {
	return <h1>paid</h1>;
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
		await waitForStack("menu");
		expect((document.querySelector("#spool-back") as HTMLButtonElement).disabled).toBe(true);
	});

	it("walks data-go in the same document, carries state, remounts fresh on every arrival", async () => {
		const harness = makeHarness();
		scaffold(harness);

		const { assign } = await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");

		click("#walk");
		await waitForStack("menu/cart");
		// the walked-to screen is in the same document, session state intact
		await waitForText("output", "5");
		expect((window as { __cartArrivals?: number }).__cartArrivals).toBe(1);

		// pill back pops the name-stack; the screen script runs fresh on return
		click("#spool-back");
		await waitForStack("menu");
		click("#walk");
		await waitForStack("menu/cart");
		expect((window as { __cartArrivals?: number }).__cartArrivals).toBe(2);

		// ui.back pops too, and the player never navigates
		click("#go-back");
		await waitForStack("menu");
		expect((document.querySelector("#spool-back") as HTMLButtonElement).disabled).toBe(true);
		expect(assign).not.toHaveBeenCalled();
	});

	it("stacks names through a three-frame walk", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");

		click("#walk");
		await waitForStack("menu/cart");
		click("#walk-pay");
		await waitForStack("menu/cart/pay--done");
		await waitForText("h1", "paid");

		click("#spool-back");
		await waitForStack("menu/cart");
		click("#spool-back");
		await waitForStack("menu");
	});

	it("shows the deep stack's tail in the pill, full path on the title", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");

		// a loop-heavy session: the history is unbounded, the readout is not
		click("#walk");
		await waitForStack("menu/cart");
		click("#walk-menu");
		await waitForStack("menu/cart/menu");
		click("#walk");
		await waitForStack("menu/cart/menu/cart");
		click("#walk-menu");
		await waitForStack("…/cart/menu/cart/menu");

		expect(document.querySelector(".spool-stack")?.getAttribute("title")).toBe("menu / cart / menu / cart / menu");

		// back still pops through the buried entries one by one
		click("#spool-back");
		await waitForStack("menu/cart/menu/cart");
	});

	it("restart re-seeds the session from a fresh scenario read at the start frame", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		click("#bump");
		await waitForText("output", "5");
		click("#walk");
		await waitForStack("menu/cart");

		// the agent edits the seed mid-session; restart reads it fresh
		writeDesignFile(
			harness.root,
			"shared/scenarios/default.json",
			'{\n\t"state": { "count": 9 },\n\t"mock": {}\n}\n',
		);
		click("#spool-restart");

		await waitForStack("menu");
		await waitForText("output", "9");
		expect((document.querySelector("#spool-back") as HTMLButtonElement).disabled).toBe(true);
	});

	it("hands the View Transitions API its direction types and per-link overrides", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		const calls = stubViewTransitions();

		// data-transition rides along as an extra type over the forward direction
		click("#walk");
		await waitForStack("menu/cart");
		expect(calls.at(-1)?.types).toEqual(["forward", "lift"]);

		click("#go-back");
		await waitForStack("menu");
		expect(calls.at(-1)?.types).toEqual(["back"]);

		click("#spool-restart");
		await vi.waitFor(() => expect(calls.at(-1)?.types).toEqual(["restart"]));
	});

	it("gates motion behind the pill toggle: off swaps bare, on transitions", async () => {
		const harness = makeHarness();
		scaffold(harness);

		await loadPlayerDocument(harness, "?frame=menu");
		await waitForText("output", "2");
		const calls = stubViewTransitions();

		const toggle = document.querySelector("#spool-motion") as HTMLButtonElement;
		expect(toggle.getAttribute("aria-pressed")).toBe("true");

		click("#spool-motion");
		await vi.waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("false"));

		// motion off: the walk still lands, the API is never touched
		click("#walk");
		await waitForStack("menu/cart");
		expect(calls).toEqual([]);

		click("#spool-motion");
		click("#go-back");
		await waitForStack("menu");
		expect(calls.at(-1)?.types).toEqual(["back"]);
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
		await waitForStack("menu");
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
			const titles = [...document.querySelectorAll("li")].map((li) => li.textContent);
			expect(titles).toEqual(["yarn", "thread"]);
		});
	});

	it("a driven session leaves its coded walks as dashed edges in the flows graph (#25)", async () => {
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
		await waitForStack("coded/pay--done");

		// the walk was witnessed: the daemon serves it as a dashed edge, while the
		// declared data-go links stay derived-not-stored
		await vi.waitFor(async () => {
			const flows = (await (await harness.app.request(`/api/p/${harness.name}/flows`)).json()) as {
				links: { from: string; to: string; kind: string }[];
			};
			expect(flows.links).toContainEqual({ from: "coded", to: "pay--done", kind: "walked" });
		});
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
