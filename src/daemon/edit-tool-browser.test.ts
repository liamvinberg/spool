import { createServer } from "node:http";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The Edit tool's selection (#339), in a real document.
 *
 * `pick` names an element by where the pointer is, down to the deepest one
 * under it; `kin` names one by kinship, which is what the keyboard has
 * instead; `family` names a whole generation. All of them answer in the same
 * hit shape, and the selectors `kin` and `family` take back are the ones
 * `pick` handed out — that round trip is the whole contract, and only a
 * browser can show it.
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
	if (address === null || typeof address === "string") throw new Error("edit tool test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "edit-tool-test",
		frame: "cart",
		projectCapability: "edit-tool-test",
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
		if (event.data && (event.data.spool === "picked" || event.data.spool === "generation")) {
			const settle = waiting.get(event.data.id);
			waiting.delete(event.data.id);
			if (settle) settle(event.data.spool === "picked" ? event.data.chain : event.data.hits);
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

it("answers a point down to the deepest element, kinship round the row, and a whole generation", {
	timeout: 60_000,
}, async () => {
	const browser = await testBrowser();
	const served = await serveFrame();
	onTestFinished(() => served.close());

	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	await page.waitForFunction(() => (window as unknown as { ask?: unknown }).ask !== undefined);

	const ask = (message: Record<string, unknown>) =>
		page.evaluate(async (sent) => {
			const hits = (await (window as unknown as { ask: (m: unknown) => Promise<unknown[]> }).ask(sent)) as {
				selector: string;
			}[];
			return hits.map((hit) => hit.selector);
		}, message);

	// the boot root is the frame: its first child is the frame's own root element
	expect(await ask({ spool: "kin", selector: "", step: "child" })).toEqual(["div"]);

	// a point inside the second row answers the whole ancestry down to the
	// deepest element there: the header takes the first 40px, then rows of 30
	const chain = await ask({ spool: "pick", x: 10, y: 85 });
	expect(chain).toEqual(["div", "div > ul", "div > ul > li:nth-of-type(2)"]);

	// the selectors a pick handed out are the ones kinship takes back, and the
	// row goes round at both ends
	const held = chain[chain.length - 1] ?? "";
	expect((await ask({ spool: "kin", selector: held, step: "next" })).at(-1)).toBe("div > ul > li:nth-of-type(3)");
	expect((await ask({ spool: "kin", selector: "div > ul > li:nth-of-type(3)", step: "next" })).at(-1)).toBe(
		"div > ul > li:nth-of-type(1)",
	);
	expect((await ask({ spool: "kin", selector: "div > ul > li:nth-of-type(1)", step: "previous" })).at(-1)).toBe(
		"div > ul > li:nth-of-type(3)",
	);
	// an element that does not exist answers with nothing, and the selection holds
	expect(await ask({ spool: "kin", selector: held, step: "child" })).toEqual([]);
	// an id shortcut, which is where a rebuilt path is the only honest check
	expect(await ask({ spool: "kin", selector: "#crumb", step: "previous" })).toEqual([
		"div",
		"div > header",
		"div > header > button",
	]);

	// a whole generation: the siblings of a row, and the children of the list
	expect(await ask({ spool: "family", selector: held, of: "siblings" })).toEqual([
		"div > ul > li:nth-of-type(1)",
		"div > ul > li:nth-of-type(2)",
		"div > ul > li:nth-of-type(3)",
	]);
	expect(await ask({ spool: "family", selector: "div", of: "children" })).toEqual(["div > header", "div > ul"]);
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

it("selects the deepest element in Edit and walks from it with the keys, out on a real canvas", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "cart", CART);
	writeDesignFile(project.root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect.poll(() => page.locator('iframe[title="cart"]').count(), { timeout: 60_000 }).toBe(1);
	const cart = page.frameLocator('iframe[title="cart"]');
	await expect.poll(() => cart.locator("li").count()).toBe(3);

	// the middle row: a frame locator's box is already in the page's own coordinates
	const row = await cart.locator("li").nth(1).boundingBox();
	if (row === null) throw new Error("the cart drew no rows");
	const at = { x: row.x + 4, y: row.y + row.height / 2 };

	/** What the canvas last told the daemon it is pointing at (#116's own read). */
	const held = async (): Promise<string> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await res.json()) as { selection?: { kind: string; selector?: string }[] };
		const all = body.selection ?? [];
		return all.length === 0 ? "nothing" : all.map((one) => one.selector ?? one.kind).join(", ");
	};

	await page.mouse.click(at.x, at.y);
	// one click on the body in Select takes the frame, exactly as it always has
	await expect.poll(held).toBe("frame");

	// ⌘-click borrows Edit: the deepest element, in one go
	const accel = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.down(accel);
	await page.mouse.click(at.x, at.y);
	await page.keyboard.up(accel);
	await expect.poll(held).toBe("div > ul > li:nth-of-type(2)");

	// in Edit a plain click is the same deepest element, named beside its outline
	await page.keyboard.press("e");
	await page.locator('[data-frame-label="cart"]').click();
	await expect.poll(held).toBe("frame");
	await page.mouse.click(at.x, at.y);
	await expect.poll(held).toBe("div > ul > li:nth-of-type(2)");
	await expect.poll(() => page.locator("[data-name-label]").textContent()).toBe("List item");

	// the keys walk from there: round the row, up to the parent, all the siblings
	for (const { key, selection } of [
		{ key: "Tab", selection: "div > ul > li:nth-of-type(3)" },
		{ key: "Tab", selection: "div > ul > li:nth-of-type(1)" },
		{ key: "Shift+Tab", selection: "div > ul > li:nth-of-type(3)" },
		{ key: "Escape", selection: "div > ul" },
		{ key: "Shift+Enter", selection: "div" },
		{ key: "Escape", selection: "frame" },
		// ⏎ from the frame takes its top-level element, and from a group its children
		{ key: "Enter", selection: "div" },
		{ key: "Enter", selection: "div > h1, div > ul" },
		{ key: "Escape", selection: "div" },
	]) {
		await page.keyboard.press(key);
		await expect.poll(held).toBe(selection);
	}
	await page.mouse.click(at.x, at.y);
	await expect.poll(held).toBe("div > ul > li:nth-of-type(2)");
	await page.keyboard.press("ControlOrMeta+a");
	await expect
		.poll(held)
		.toBe("div > ul > li:nth-of-type(1), div > ul > li:nth-of-type(2), div > ul > li:nth-of-type(3)");
	await page.keyboard.press("Escape");
	await expect.poll(held).toBe("div > ul");

	// a double-click on words opens them where they are drawn, with no label
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(() => cart.locator("li").nth(1).getAttribute("contenteditable")).toBe("plaintext-only");
	await expect.poll(held).toBe("div > ul > li:nth-of-type(2)");
	expect(await page.locator("[data-name-label]").count()).toBe(0);
	// Esc finishes them, and the keyboard comes back out here with them: the
	// frame holds it until its own answer lands, so the tool key waits
	await page.keyboard.press("Escape");
	await expect.poll(() => cart.locator("li").nth(1).getAttribute("contenteditable")).toBe(null);
	await expect
		.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role") ?? "none"))
		.toBe("application");
	// and none of that went inside, which is the other tool's meaning
	expect(await page.locator('[data-frame-label="cart"]').innerText()).not.toContain("esc exits");

	// back in Select, a double-click on the body goes inside, which the label says
	await page.keyboard.press("v");
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(() => page.locator('[data-frame-label="cart"]').innerText()).toContain("esc exits");
});
