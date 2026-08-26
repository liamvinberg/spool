import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The drop half of the asset swap in a real document (#260).
 *
 * A file dragged onto an image lands inside the frame's own document, so the
 * shim is the only thing that can catch it — and what has to be proved is that
 * it catches nothing until the canvas says so. A frame with a drop zone of its
 * own behaves exactly as its bare document does, which is the parity law; the
 * arming is what makes an interception honest.
 */

const BOOT = `document.getElementById("root").innerHTML =
	'<div class="screen"><img id="hero" alt="hero" width="200" height="120"><div id="zone">drop here</div></div>';
document.addEventListener("drop", (event) => {
	window.__DROPPED__ = (window.__DROPPED__ || 0) + 1;
});
document.addEventListener("dragover", (event) => { event.preventDefault(); });`;

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
	if (address === null || typeof address === "string") throw new Error("asset test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "asset-test",
		frame: "cart",
		projectCapability: "asset-test",
		controlOrigin,
		css: "* { margin: 0; padding: 0 } #hero { display: block } #zone { height: 60px }",
		fonts: "",
		bundledCss: "",
		importMap: { imports: {} },
		bootJs: BOOT,
	});
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="600" height="400" sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
<script>
	window.said = [];
	window.addEventListener("message", (event) => {
		if (event.data && event.data.spool === "dropped") {
			window.said.push({ selector: event.data.selector, name: event.data.file && event.data.file.name });
		}
	});
	window.send = (message) => {
		document.getElementById("frame").contentWindow.postMessage(message, "*");
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

it("catches a drop only on the element the canvas armed", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const served = await serveFrame();
	onTestFinished(() => served.close());

	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	await page.waitForFunction(() => (window as unknown as { send?: unknown }).send !== undefined);
	const frame = page.frameLocator("#frame");
	await expect.poll(() => frame.locator("#hero").count()).toBe(1);

	const send = (message: Record<string, unknown>) =>
		page.evaluate((sent) => (window as unknown as { send: (m: unknown) => void }).send(sent), message);
	const said = () => page.evaluate(() => (window as unknown as { said: unknown[] }).said);
	const ownDrops = () =>
		frame.locator("body").evaluate(() => (window as unknown as { __DROPPED__?: number }).__DROPPED__ ?? 0);
	const drop = async (selector: string) => {
		const carrier = await frame.locator("body").evaluateHandle(() => {
			const data = new DataTransfer();
			data.items.add(new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }));
			return data;
		});
		await frame.locator(selector).dispatchEvent("drop", { dataTransfer: carrier });
	};

	// nothing is armed: the frame's own drop zone answers, exactly as its bare
	// document would, and the canvas hears nothing at all
	await drop("#zone");
	await expect.poll(ownDrops).toBe(1);
	expect(await said()).toEqual([]);

	// an unarmed image is no different from anything else in the frame
	await drop("#hero");
	await expect.poll(ownDrops).toBe(2);
	expect(await said()).toEqual([]);

	// armed: the drop is the canvas's, and the frame's own handler never sees it
	await send({ spool: "drop-target", selector: "#hero" });
	await drop("#hero");
	await expect.poll(said).toEqual([{ selector: "#hero", name: "shot.png" }]);
	expect(await ownDrops()).toBe(2);

	// the arming is one element's, so the zone beside it is still the frame's
	await drop("#zone");
	await expect.poll(ownDrops).toBe(3);
	expect(await said()).toHaveLength(1);

	// and it is taken back the moment the selection moves
	await send({ spool: "drop-target", selector: null });
	await drop("#hero");
	await expect.poll(ownDrops).toBe(4);
	expect(await said()).toHaveLength(1);
});
