import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The two canvas gestures in a real document (#255).
 *
 * The first test is the frame's half alone: an element made editable in place,
 * the keys it swallows while it is, and the two ways an edit ends. The second
 * is the whole lane out on a canvas — the words typed into the element itself
 * land in the file on disk, and ⌫ takes an element's lines out of it.
 */

const BOOT = `document.getElementById("root").innerHTML =
	'<div class="screen"><h1 id="crumb">cart</h1><button id="pay">Pay now</button></div>';
document.getElementById("pay").addEventListener("click", () => { window.__CLICKED__ = true; });
document.addEventListener("keydown", (event) => {
	window.__TYPED__ = (window.__TYPED__ || "") + event.key;
});`;

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
	if (address === null || typeof address === "string") throw new Error("edit test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "edit-test",
		frame: "cart",
		projectCapability: "edit-test",
		controlOrigin,
		css: "* { margin: 0; padding: 0 } #pay { display: block; height: 40px; width: 200px }",
		fonts: "",
		bundledCss: "",
		importMap: { imports: {} },
		bootJs: BOOT,
	});
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="600" height="400" sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
<script>
	let asked = 0;
	window.said = [];
	window.addEventListener("message", (event) => {
		if (event.data && (event.data.spool === "edit-open" || event.data.spool === "edited")) {
			window.said.push(event.data);
		}
	});
	window.send = (message) => {
		document.getElementById("frame").contentWindow.postMessage({ ...message, id: ++asked }, "*");
	};
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

it("makes an element's own words editable, and ends the edit both ways", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const served = await serveFrame();
	onTestFinished(() => served.close());

	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	await page.waitForFunction(() => (window as unknown as { send?: unknown }).send !== undefined);
	const frame = page.frameLocator("#frame");
	const text = (selector: string) => frame.locator(selector).textContent();
	const editable = (selector: string) => frame.locator(selector).getAttribute("contenteditable");
	const inFrame = <T>(read: () => T) => frame.locator("body").evaluate(read);
	await expect.poll(() => text("#pay")).toBe("Pay now");

	const send = (message: Record<string, unknown>) =>
		page.evaluate((sent) => (window as unknown as { send: (m: unknown) => void }).send(sent), message);
	const said = () => page.evaluate(() => (window as unknown as { said: Record<string, unknown>[] }).said);

	// the words are made editable where they are drawn, and the frame says what
	// they were, which is what an edit that changes nothing is measured against
	await send({ spool: "edit", selector: "#pay", x: 20, y: 20 });
	await expect
		.poll(async () => (await said()).at(-1))
		.toMatchObject({
			spool: "edit-open",
			ok: true,
			text: "Pay now",
		});
	await expect.poll(() => editable("#pay")).toBe("plaintext-only");

	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("Pay later");
	// the keys are the edit's, not the prototype's: nothing frame code bound
	// ran while they were typed
	expect(await inFrame(() => (window as unknown as { __TYPED__?: string }).__TYPED__)).toBe(undefined);

	await page.keyboard.press("Enter");
	await expect
		.poll(async () => (await said()).at(-1))
		.toMatchObject({
			spool: "edited",
			commit: true,
			text: "Pay later",
		});
	// the typed words stand: the reload that carries them into the file is a
	// moment away, and flashing the old ones back is the blink the lane avoids
	await expect.poll(() => text("#pay")).toBe("Pay later");
	expect(await editable("#pay")).toBeNull();
	// the element is the frame's again, and its own handlers answer as before
	await frame.locator("#pay").click();
	expect(await inFrame(() => (window as unknown as { __CLICKED__?: boolean }).__CLICKED__)).toBe(true);

	// Esc cancels and restores, down to the words that were there
	await send({ spool: "edit", selector: "#crumb", x: 4, y: 4 });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edit-open", ok: true, text: "cart" });
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("basket");
	await expect.poll(() => text("#crumb")).toBe("basket");
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edited", commit: false });
	await expect.poll(() => text("#crumb")).toBe("cart");

	// a selector nothing answers to is a no, not an edit nobody can end
	await send({ spool: "edit", selector: "#gone", x: 0, y: 0 });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edit-open", ok: false });
});

/** The cart, as an agent would have written it. */
const CART = `export default function Frame() {
	return (
		<div className="flex h-full flex-col gap-4 p-6">
			<h1 className="text-2xl">cart</h1>
			<p className="text-sm">two items</p>
		</div>
	);
}
`;

it("types into the element and writes the file, then takes an element's lines", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "cart", CART);
	writeDesignFile(project.root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);
	const file = join(project.root, "design", "frames", "cart", "frame.tsx");

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect.poll(() => page.locator('iframe[title="cart"]').count(), { timeout: 60_000 }).toBe(1);
	await expect.poll(() => page.frameLocator('iframe[title="cart"]').locator("h1").count()).toBe(1);

	/** The middle of an element, in the page's own coordinates, once it is drawn. */
	const middleOf = async (tag: string): Promise<{ x: number; y: number }> => {
		const box = { x: 0, y: 0, width: 0, height: 0 };
		await expect
			.poll(
				async () => {
					const drawn = await page.frameLocator('iframe[title="cart"]').locator(tag).boundingBox();
					Object.assign(box, drawn ?? {});
					return drawn === null ? 0 : Math.min(drawn.width, drawn.height);
				},
				{ timeout: 20_000 },
			)
			.toBeGreaterThan(0);
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	};
	/** What the canvas last told the daemon it is pointing at. */
	const held = async (): Promise<string> => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await res.json()) as { selection?: { kind: string; selector?: string }[] };
		const [only] = body.selection ?? [];
		return only === undefined ? "nothing" : (only.selector ?? only.kind);
	};
	/**
	 * Down the ladder to a rung, by kinship (#254): ⌘⏎ takes the first child,
	 * Tab the next sibling. The pointer no longer descends, so a walk that
	 * wants the second child asks for the first and steps sideways.
	 */
	const descendTo = async (
		tag: string,
		walk: readonly { step: "child" | "next"; rung: string }[],
	): Promise<{ x: number; y: number }> => {
		const at = await middleOf(tag);
		await page.mouse.click(at.x, at.y);
		await expect.poll(held, { timeout: 20_000 }).toBe("frame");
		for (const { step, rung } of walk) {
			await page.keyboard.press(step === "child" ? "ControlOrMeta+Enter" : "Tab");
			await expect.poll(held, { timeout: 20_000 }).toBe(rung);
		}
		return at;
	};
	/** A write reloads the frame it wrote; the ladder waits for what boots. */
	const settled = async (): Promise<void> => {
		await expect.poll(() => page.locator('iframe[title="cart (held)"]').count(), { timeout: 30_000 }).toBe(0);
	};

	// the words: down to the heading, then a second click on it opens the edit
	const heading = await descendTo("h1", [
		{ step: "child", rung: "div" },
		{ step: "child", rung: "div > h1" },
	]);
	await page.mouse.click(heading.x, heading.y);
	await expect
		.poll(() => page.frameLocator('iframe[title="cart"]').locator("h1[contenteditable]").count(), {
			timeout: 20_000,
		})
		.toBe(1);
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("basket");
	await page.keyboard.press("Enter");

	// the file says what was typed, and everything else about it is untouched
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 20_000 }).toContain(">basket</h1>");
	expect(readFileSync(file, "utf8")).toBe(CART.replace(">cart<", ">basket<"));
	await settled();
	await expect
		.poll(() => page.frameLocator('iframe[title="cart"]').locator("h1").textContent(), { timeout: 20_000 })
		.toBe("basket");

	// the lines: down to the paragraph, then ⌫ takes it out of the file
	await descendTo("p", [
		{ step: "child", rung: "div" },
		{ step: "child", rung: "div > h1" },
		{ step: "next", rung: "div > p" },
	]);
	await page.keyboard.press("Backspace");
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 20_000 }).not.toContain("<p");
	expect(readFileSync(file, "utf8")).toBe(
		CART.replace(">cart<", ">basket<").replace('\t\t\t<p className="text-sm">two items</p>\n', ""),
	);

	// and one press puts it back, because a patch is its own inverse
	await settled();
	await page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => readFileSync(file, "utf8"), { timeout: 20_000 }).toContain("<p");
});
