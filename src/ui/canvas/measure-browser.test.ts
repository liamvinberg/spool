import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { assembleFrameDocument } from "../../daemon/document";
import { RENDER_HOST } from "../../daemon/security";
import { decompose } from "./measure-spacing";
import type { SpacingReading } from "./protocol";

/**
 * The frame's half of the measurement overlay (#261), against a real
 * stylesheet.
 *
 * Everything this reads — the used gap, a collapsed margin, what `--spacing`
 * resolves to — is a computed value, and computed values only exist in a
 * browser. So the reading is taken here and handed to the same decomposition
 * the canvas runs, which is the round trip the whole overlay rests on: the
 * pixels a layout actually produced, named with the class in the file.
 *
 * It sits with the canvas rather than with the daemon's other browser suites
 * because it spans both halves, and only this direction is allowed: the canvas
 * reads the daemon's types and modules, never the other way round.
 */

const BOOT = `document.getElementById("root").innerHTML =
	'<div class="screen">' +
		'<ul class="items flex gap-4">' +
			'<li class="row">brygg</li>' +
			'<li class="row mr-2">bulle</li>' +
			'<li class="row"><span class="word">latte</span></li>' +
		'</ul>' +
		'<section class="stack space-y-6">' +
			'<p class="line">one</p>' +
			'<p class="line">two</p>' +
		'</section>' +
	'</div>';`;

// the shape of a compiled Tailwind, written by hand: the classes are the
// literal the overlay attributes against, and these rules are what produced the
// pixels it attributes
//
// The root font is 20px on purpose: `--spacing` is a rem, so a step here is
// five pixels and not four. A reading that assumed the default would name every
// token against the wrong scale, and this is the cheapest place to catch it.
const CSS = `* { margin: 0; padding: 0; box-sizing: border-box }
	:root { font-size: 20px; --spacing: 0.25rem }
	body { font: 12px sans-serif }
	.items { display: flex; column-gap: 20px; row-gap: 20px; list-style: none }
	.row { width: 60px; height: 30px }
	.mr-2 { margin-right: 10px }
	.stack { display: block }
	.line { height: 20px }
	.space-y-6 > :not(:last-child) { margin-bottom: 30px }`;

interface Served {
	url: string;
	close(): Promise<void>;
}

async function serveFrame(): Promise<Served> {
	let frameDocument = "";
	let controlDocument = "";
	const server = createServer((request, response) => {
		const authority = request.headers.host;
		if (authority === undefined) {
			response.writeHead(400).end("missing host");
			return;
		}
		const url = new URL(request.url ?? "/", `http://${authority}`);
		if (url.hostname === "127.0.0.1" && url.pathname === "/") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("cache-control", "no-store");
			response.end(controlDocument);
			return;
		}
		if (url.hostname === RENDER_HOST && url.pathname === "/frame") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("content-security-policy", "sandbox allow-scripts");
			response.end(frameDocument);
			return;
		}
		response.writeHead(404).end("not found");
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("measure test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "measure-test",
		frame: "cart",
		projectCapability: "measure-test",
		controlOrigin,
		css: CSS,
		fonts: "",
		bundledCss: "",
		importMap: { imports: {} },
		bootJs: BOOT,
	});
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="600" height="400" sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
<script>
	let asked = 0;
	const waiting = new Map();
	window.addEventListener("message", (event) => {
		if (!event.data) return;
		if (event.data.spool === "picked" || event.data.spool === "measured") {
			const settle = waiting.get(event.data.id);
			waiting.delete(event.data.id);
			if (settle) settle(event.data.spool === "picked" ? event.data.chain : event.data.reading);
		}
	});
	window.ask = (message) => new Promise((settle) => {
		const id = ++asked;
		waiting.set(id, settle);
		document.getElementById("frame").contentWindow.postMessage({ ...message, id }, "*");
	});
</script>
</body></html>`;
	return {
		url: `${controlOrigin}/`,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}

it("reads a distance off a real layout, and the decomposition names the class", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const served = await serveFrame();
	onTestFinished(() => served.close());

	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	await page.waitForFunction(() => (window as unknown as { ask?: unknown }).ask !== undefined);

	const ask = <T>(message: Record<string, unknown>): Promise<T> =>
		page.evaluate(
			(sent) => (window as unknown as { ask: (m: unknown) => Promise<unknown> }).ask(sent),
			message,
		) as Promise<T>;

	// the selectors come out of a pick, exactly as the canvas's do
	const rowChain = await ask<{ selector: string; tag: string }[]>({ spool: "pick", x: 30, y: 15 });
	const firstRow = rowChain.at(-1)?.selector;
	expect(rowChain.at(-1)?.tag).toBe("li");

	// --- the gap, on the parent ---------------------------------------------
	const gap = await ask<SpacingReading | null>({ spool: "measure", selector: firstRow, x: 100, y: 15 });
	if (gap === null) throw new Error("no reading between the first two rows");
	expect(gap.axis).toBe("x");
	expect(gap.to - gap.from).toBe(20);
	expect(gap.step).toBe(5);
	expect(gap.root).toBe(20);
	expect(gap.parent?.className).toBe("items flex gap-4");
	expect(decompose(gap).parts).toEqual([
		{ kind: "gap", px: 20, token: "gap-4", owner: { selector: gap.parent.selector, tag: "ul", parent: true } },
	]);

	// --- the sibling's own margin, on the sibling ----------------------------
	const secondRow = (await ask<{ selector: string }[]>({ spool: "pick", x: 100, y: 15 })).at(-1)?.selector;
	const margin = await ask<SpacingReading | null>({ spool: "measure", selector: secondRow, x: 190, y: 15 });
	if (margin === null) throw new Error("no reading between the second and third rows");
	expect(margin.to - margin.from).toBe(30);
	expect(decompose(margin).parts).toEqual([
		{ kind: "gap", px: 20, token: "gap-4", owner: { selector: margin.parent.selector, tag: "ul", parent: true } },
		{ kind: "margin", px: 10, token: "mr-2", owner: { selector: secondRow, tag: "li" } },
	]);

	// --- a `space-y-*`, which is the parent's even though the child carries it
	const firstLine = (await ask<{ selector: string }[]>({ spool: "pick", x: 30, y: 40 })).at(-1)?.selector;
	const stacked = await ask<SpacingReading | null>({ spool: "measure", selector: firstLine, x: 30, y: 90 });
	if (stacked === null) throw new Error("no reading between the two lines");
	expect(stacked.axis).toBe("y");
	expect(stacked.to - stacked.from).toBe(30);
	expect(stacked.first.margins.bottom).toBe(30);
	expect(decompose(stacked).parts).toEqual([
		{
			kind: "margin",
			px: 30,
			token: "space-y-6",
			owner: { selector: stacked.parent.selector, tag: "section", parent: true },
		},
	]);

	// --- the pointer rests on a word, and the row it is in is what answers ----
	const word = await ask<SpacingReading | null>({ spool: "measure", selector: secondRow, x: 190, y: 15 });
	expect(word?.second.tag).toBe("li");

	// --- nothing to measure --------------------------------------------------
	// itself, empty space, and the row two along: a distance with a whole box
	// standing in it has no honest decomposition, so it has no reading
	expect(await ask({ spool: "measure", selector: firstRow, x: 30, y: 15 })).toBeNull();
	expect(await ask({ spool: "measure", selector: firstRow, x: 590, y: 390 })).toBeNull();
	expect(await ask({ spool: "measure", selector: firstRow, x: 190, y: 15 })).toBeNull();
});
