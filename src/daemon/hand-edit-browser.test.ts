import { createServer } from "node:http";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The two canvas gestures in a real document (#255).
 *
 * The first test is the frame's half alone: an element made editable in place,
 * the keys it swallows while it is, and the two ways an edit ends. The second
 * is the whole lane out on a canvas — the words typed into the element itself
 * land in the file on disk, and ⌫ removes one keyed authored child.
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
	const browser = await testBrowser();
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
