import { createServer } from "node:http";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { assembleFrameDocument } from "./document";
import { RENDER_HOST } from "./security";

/**
 * The frame's half of the text gesture alone (#255, #314): an element made
 * editable in place, the keys and presses it swallows while it is, what it
 * says when the edit ends, and the words put back on the same nodes.
 */

const BOOT = `document.getElementById("root").innerHTML =
	'<div class="screen"><h1 id="crumb">cart<br><i>now</i></h1><button id="pay">Pay now</button></div>';
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
		if (event.data && ["edit-open", "edited", "restored", "classed"].includes(event.data.spool)) {
			window.said.push(event.data);
		}
	});
	window.send = (message) => {
		document.getElementById("frame").contentWindow.postMessage({ id: ++asked, ...message }, "*");
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
	// ran while they were typed, and a press on the button under the edit
	// places the caret rather than pressing it
	expect(await inFrame(() => (window as unknown as { __TYPED__?: string }).__TYPED__)).toBe(undefined);
	await frame.locator("#pay").click();
	expect(await inFrame(() => (window as unknown as { __CLICKED__?: boolean }).__CLICKED__)).toBe(undefined);
	expect(await editable("#pay")).toBe("plaintext-only");

	await page.keyboard.press("Enter");
	await expect
		.poll(async () => (await said()).at(-1))
		.toMatchObject({
			spool: "edited",
			commit: true,
			nodes: [{ text: "Pay later" }],
			owner: null,
		});
	// the typed words stand: the reload that carries them into the file is a
	// moment away, and flashing the old ones back is the blink the lane avoids
	await expect.poll(() => text("#pay")).toBe("Pay later");
	expect(await editable("#pay")).toBeNull();
	// the element is the frame's again, and its own handlers answer as before
	await frame.locator("#pay").click();
	expect(await inFrame(() => (window as unknown as { __CLICKED__?: boolean }).__CLICKED__)).toBe(true);

	// Esc cancels and restores, down to the words that were there — on the
	// nodes that were there, line break and inline element included
	await send({ spool: "edit", selector: "#crumb", x: 4, y: 4 });
	await expect
		.poll(async () => (await said()).at(-1))
		.toMatchObject({ spool: "edit-open", ok: true, text: "cart\nnow" });
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("basket");
	await expect.poll(() => text("#crumb")).toBe("basket");
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edited", commit: false });
	await expect.poll(() => frame.locator("#crumb").innerHTML()).toBe("cart<br><i>now</i>");

	// a committed edit is held by its ask: the words before it and after it
	// come back on request, and a document that has moved on says no
	await send({ spool: "edit", selector: "#crumb", x: 4, y: 4 });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edit-open", ok: true });
	const opened = (await said()).at(-1) as { id: number };
	await page.keyboard.press("End");
	await page.keyboard.type("!");
	await page.keyboard.press("Enter");
	await expect
		.poll(async () => (await said()).at(-1))
		.toMatchObject({ spool: "edited", commit: true, nodes: [{ text: "cart!" }, { tag: "br" }, { tag: "i" }] });
	await send({ spool: "restore", id: opened.id, way: "before" });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "restored", ok: true });
	expect(await frame.locator("#crumb").innerHTML()).toBe("cart<br><i>now</i>");
	await send({ spool: "restore", id: opened.id, way: "after" });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "restored", ok: true });
	expect(await frame.locator("#crumb").innerHTML()).toBe("cart!<br><i>now</i>");
	await send({ spool: "restore", id: 999, way: "before" });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "restored", ok: false });

	// a save moved the stamps on its line, and the document carries them on
	await inFrame(() => {
		document.getElementById("crumb")?.setAttribute("data-spool-source", "frames/cart/frame.tsx:7:10");
		document.getElementById("pay")?.setAttribute("data-spool-source", "frames/cart/frame.tsx:7:40");
	});
	await send({ spool: "restamp", file: "frames/cart/frame.tsx", shifts: [{ line: 7, column: 14, delta: 3 }] });
	await expect.poll(() => frame.locator("#pay").getAttribute("data-spool-source")).toBe("frames/cart/frame.tsx:7:43");
	expect(await frame.locator("#crumb").getAttribute("data-spool-source")).toBe("frames/cart/frame.tsx:7:10");

	// a selector nothing answers to is a no, not an edit nobody can end
	await send({ spool: "edit", selector: "#gone", x: 0, y: 0 });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "edit-open", ok: false });

	// the rail's preview is inline style on the element (#315), lifted again
	// to whatever the inline style said before it
	const width = () => frame.locator("#pay").evaluate((el) => getComputedStyle(el).width);
	await inFrame(() => document.getElementById("pay")?.style.setProperty("width", "150px"));
	await send({ spool: "style", selector: "#pay", declarations: { width: "700px", "padding-left": "12px" } });
	await expect.poll(width).toBe("700px");
	await send({ spool: "style", selector: "#pay", declarations: null });
	await expect.poll(width).toBe("150px");
	expect(await frame.locator("#pay").evaluate((el) => el.style.paddingLeft)).toBe("");

	// the file's class arrives: the tokens that changed are swapped on the
	// element beside whatever else it wears, the sheet is the file's, and the
	// preview that stood in for it is lifted
	await inFrame(() => {
		document.getElementById("pay")?.style.removeProperty("width");
		document.getElementById("pay")?.setAttribute("class", "w-[990px] action");
	});
	await send({ spool: "style", selector: "#pay", declarations: { width: "700px" } });
	await expect.poll(width).toBe("700px");
	await send({
		spool: "class",
		selector: "#pay",
		was: "veil-art w-[990px]",
		now: "veil-art w-[700px]",
		css: "#pay { display: block; height: 40px } .w-\\[700px\\] { width: 700px }",
	});
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "classed", ok: true });
	expect(await frame.locator("#pay").getAttribute("class")).toBe("action w-[700px]");
	expect(await frame.locator("#pay").evaluate((el) => el.style.width)).toBe("");
	expect(await width()).toBe("700px");
	await send({ spool: "class", selector: "#gone", was: "", now: "p-2", css: undefined });
	await expect.poll(async () => (await said()).at(-1)).toMatchObject({ spool: "classed", ok: false });
});
