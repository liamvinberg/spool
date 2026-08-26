import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The frame's half of the selection ladder (#254), in a real document.
 *
 * `pick` names a rung by where the pointer is; `kin` names one by kinship,
 * which is what the keyboard has instead. Both answer the same ancestry shape,
 * and the selectors `kin` takes back are the ones `pick` handed out — that
 * round trip is the whole contract, and only a browser can show it.
 */

const BOOT = `document.getElementById("root").innerHTML =
	'<div class="screen">' +
		'<header class="header"><button>back</button><h1 id="crumb">cart</h1></header>' +
		'<ul class="items"><li>brygg</li><li>bulle</li><li>latte</li></ul>' +
	'</div>';`;

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
	if (address === null || typeof address === "string") throw new Error("ladder test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "ladder-test",
		frame: "cart",
		projectCapability: "ladder-test",
		controlOrigin,
		// laid out to the pixel so a point in the test names one row and no other
		css: `* { margin: 0; padding: 0 }
			.header { height: 40px }
			.items { list-style: none }
			.items li { height: 30px }`,
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
		if (event.data && event.data.spool === "picked") {
			const settle = waiting.get(event.data.id);
			waiting.delete(event.data.id);
			if (settle) settle(event.data.chain);
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

it("answers a point with an ancestry, and kinship with the rung next to it", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const served = await serveFrame();
	onTestFinished(() => served.close());

	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	await page.waitForFunction(() => (window as unknown as { ask?: unknown }).ask !== undefined);

	const ask = (message: Record<string, unknown>) =>
		page.evaluate(async (sent) => {
			const chain = (await (window as unknown as { ask: (m: unknown) => Promise<unknown[]> }).ask(sent)) as {
				selector: string;
			}[];
			return chain.map((hit) => hit.selector);
		}, message);

	// the boot root is not a rung: the frame's own root element is the first one
	const first = await ask({ spool: "kin", selector: "", step: "child" });
	expect(first).toEqual(["div"]);

	// a point inside the second row answers the whole ancestry down to it: the
	// header takes the first 40px, then three rows of 30
	const chain = await ask({ spool: "pick", x: 10, y: 85 });
	expect(chain).toEqual(["div", "div > ul", "div > ul > li:nth-of-type(2)"]);

	// the selectors a pick handed out are the ones kinship takes back
	const held = chain[chain.length - 1] ?? "";
	expect(await ask({ spool: "kin", selector: held, step: "next" })).toEqual([
		"div",
		"div > ul",
		"div > ul > li:nth-of-type(3)",
	]);
	expect(await ask({ spool: "kin", selector: held, step: "previous" })).toEqual([
		"div",
		"div > ul",
		"div > ul > li:nth-of-type(1)",
	]);
	expect(await ask({ spool: "kin", selector: "div", step: "child" })).toEqual(["div", "div > header"]);

	// a rung that does not exist answers with nothing, and the selection holds
	expect(await ask({ spool: "kin", selector: held, step: "child" })).toEqual([]);
	expect(await ask({ spool: "kin", selector: "div", step: "next" })).toEqual([]);

	// an id shortcut, which is where a rebuilt path is the only honest check
	expect(await ask({ spool: "kin", selector: "#crumb", step: "previous" })).toEqual([
		"div",
		"div > header",
		"div > header > button",
	]);
});

/** The cart, as an agent would have written it: a root element and rows inside it. */
const CART = `export default function Frame() {
	return (
		<div className="flex h-full flex-col gap-2 p-6">
			<h1>cart</h1>
			<ul className="flex flex-col gap-1">
				<li>brygg</li>
				<li>bulle</li>
				<li>latte</li>
			</ul>
		</div>
	);
}
`;

it("walks the ladder from the keyboard and goes inside on a double-click, out on a real canvas", {
	timeout: 180_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "cart", CART);
	writeDesignFile(project.root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect.poll(() => page.locator('iframe[title="cart"]').count(), { timeout: 60_000 }).toBe(1);
	await expect.poll(() => page.frameLocator('iframe[title="cart"]').locator("li").count()).toBe(3);

	// the middle row: a frame locator's box is already in the page's own coordinates
	const row = await page.frameLocator('iframe[title="cart"]').locator("li").nth(1).boundingBox();
	if (row === null) throw new Error("the cart drew no rows");
	const at = { x: row.x + 4, y: row.y + row.height / 2 };

	/** What the canvas last told the daemon it is pointing at (#116's own read). */
	const held = async (): Promise<string> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await res.json()) as { selection?: { kind: string; selector?: string }[] };
		const [only] = body.selection ?? [];
		return only === undefined ? "nothing" : (only.selector ?? only.kind);
	};

	await page.mouse.click(at.x, at.y);
	// one click on the body takes the frame, exactly as it always has
	await expect.poll(held).toBe("frame");
	expect(await page.locator('[data-frame-label="cart"] .text-thread').count()).toBe(1);

	// and now down the ladder by kinship: ⌘⏎ takes the first child, Tab the
	// next sibling — root element, heading, the list beside it, its first row
	for (const { key, rung } of [
		{ key: "ControlOrMeta+Enter", rung: "div" },
		{ key: "ControlOrMeta+Enter", rung: "div > h1" },
		{ key: "Tab", rung: "div > ul" },
		{ key: "ControlOrMeta+Enter", rung: "div > ul > li:nth-of-type(1)" },
		{ key: "Tab", rung: "div > ul > li:nth-of-type(2)" },
	]) {
		await page.keyboard.press(key);
		await expect.poll(held).toBe(rung);
	}

	// ⇧⏎ climbs back out of the row and into the list that holds it
	await page.keyboard.press("Shift+Enter");
	await expect.poll(held).toBe("div > ul");

	// ⌘-click is the pointer's whole ladder: the deepest rung, in one go
	const accel = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.down(accel);
	await page.mouse.click(at.x, at.y);
	await page.keyboard.up(accel);
	await expect.poll(held).toBe("div > ul > li:nth-of-type(2)");

	// and a double-click on the body goes inside the frame, which the label says
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(() => page.locator('[data-frame-label="cart"]').innerText()).toContain("esc exits");
});
