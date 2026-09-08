import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it, onTestFinished } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20" fill="red"/></svg>';
const SECOND = SVG.replaceAll('"30"', '"70"').replace('"red"', '"blue"');
const SOURCE = `import {useState} from 'react';import image from 'shared/assets/first.svg';export default function Frame(){const [count,setCount]=useState(0);return <main style={{padding:40}}><img id="hero" src={image} style={{width:180,height:120}}/><button id="counter" onClick={()=>setCount(n=>n+1)}>{count}</button><input id="native" defaultValue="initial"/></main>}`;

it("drops real image bytes through the original source owner and retains native state through undo and redo", {
	timeout: 120000,
}, async () => {
	const f = await originCanvas({ "shared/assets/first.svg": SVG }, SOURCE, "#hero");
	await expect
		.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
		.toBe(30);
	await f.frame.locator("#counter").evaluate((element) => (element as HTMLButtonElement).click());
	await f.frame.locator("#native").evaluate((element) => {
		if (!(element instanceof HTMLInputElement)) throw new Error("missing native input");
		element.value = "dirty native state";
		element.setSelectionRange(2, 5);
		Reflect.set(window, "imageNative", element);
	});
	await f.select();
	const write = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	const transfer = await f.target.evaluateHandle((_element, source) => {
		const transfer = new DataTransfer();
		transfer.items.add(new File([source], "chosen.svg", { type: "image/svg+xml" }));
		return transfer;
	}, SECOND);
	await f.target.dispatchEvent("drop", { dataTransfer: transfer });
	await write;
	expect(f.writes).toEqual(["commit"]);
	const check = async (width: number) => {
		await expect
			.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
			.toBe(width);
		expect(await f.frame.locator("#counter").textContent()).toBe("1");
		expect(
			await f.frame.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing native input");
				return [
					element === Reflect.get(window, "imageNative"),
					element.value,
					element.selectionStart,
					element.selectionEnd,
				];
			}),
		).toEqual([true, "dirty native state", 2, 5]);
		await expect
			.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1)?.rendered))
			.toBe("verified");
	};
	await check(70);
	expect(readFileSync(f.file("frames/home/chosen.svg"), "utf8")).toBe(SECOND);
	for (const redo of [false, true]) {
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history(redo);
		await saved;
		await check(redo ? 70 : 30);
		if (!redo) expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(SOURCE);
		expect(readFileSync(f.file("frames/home/chosen.svg"), "utf8")).toBe(SECOND);
	}
	const cold = await f.browser.newPage();
	await cold.goto(await f.target.evaluate(() => location.href));
	await expect
		.poll(() =>
			cold.locator("#hero").evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth),
		)
		.toBe(70);
	expect(await cold.locator("#counter").textContent()).toBe("0");
	expect(await cold.locator("#native").inputValue()).toBe("initial");
	await check(70);

	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("chooses an existing shared image from the real picker and discloses both affected uses", {
	timeout: 120000,
}, async () => {
	const component =
		'import image from "./assets/first.svg";export function Photo(){return <img id="hero" src={image} style={{width:180,height:120}}/>}';
	const frame = `import {useState} from 'react';import {Photo} from 'shared/photo';export default function Frame(){const [n,set]=useState(0);return <main style={{padding:40}}><Photo/><button onClick={()=>set(n=>n+1)}>{n}</button><input defaultValue="initial"/></main>}`;
	const f = await originCanvas(
		{ "shared/photo.tsx": component, "shared/assets/first.svg": SVG, "shared/assets/second.svg": SECOND },
		frame,
		"#hero",
		true,
	);
	await f.select();
	const uses = f.page.getByRole("button", { name: "Show affected uses", exact: true });
	await expect.poll(() => uses.count()).toBe(1);
	expect(await uses.textContent()).toBe("2");
	await uses.click();
	await expect.poll(() => f.page.locator("[data-source-uses]").textContent()).toContain("shared/photo.tsx");
	await f.page.getByRole("button", { name: "image", exact: true }).click();
	const option = f.page.locator('[data-menu-option="second.svg"]');
	await expect.poll(() => option.count()).toBe(1);
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await option.click();
	await saved;
	for (const name of ["home", "second"]) {
		const image = f.page.frameLocator(`iframe[title="${name}"]`).locator("#hero");
		await expect
			.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
			.toBe(70);
	}
	await f.settled();
	expect(
		await f.page.evaluate(() =>
			Reflect.get(window, "originOutcomes").map((outcome: { rendered: string }) => outcome.rendered),
		),
	).toEqual(["verified", "verified"]);
	expect(readFileSync(f.file("shared/photo.tsx"), "utf8")).toContain('from "./assets/second.svg"');
	expect(f.writes).toEqual(["commit"]);
});

it("cancels a real staged drop before its delayed response without a late save or preview", {
	timeout: 120000,
}, async () => {
	const f = await originCanvas({ "shared/assets/first.svg": SVG }, SOURCE, "#hero");
	await f.select();
	await f.frame.locator("#native").evaluate((element) => {
		if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
		element.value = "kept through staging";
		element.setSelectionRange(2, 5);
		Reflect.set(window, "stagedNative", element);
	});
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	onTestFinished(release);
	let arrived = false;
	let delivered = false;
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action !== "stage-image") return route.continue();
		const response = await route.fetch();
		expect((await response.json()).ok).toBe(true);
		arrived = true;
		await held;
		await route.fulfill({ response });
		delivered = true;
	});
	const transfer = await f.target.evaluateHandle((_element, source) => {
		const transfer = new DataTransfer();
		transfer.items.add(new File([source], "canceled.svg", { type: "image/svg+xml" }));
		return transfer;
	}, SECOND);
	await f.target.dispatchEvent("drop", { dataTransfer: transfer });
	await expect.poll(() => arrived).toBe(true);
	expect(readFileSync(f.file("frames/home/canceled.svg"), "utf8")).toBe(SECOND);
	const canceled = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "cancel",
	);
	await f.page.keyboard.press("Escape");
	await canceled;
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	release();
	await expect.poll(() => delivered).toBe(true);
	expect(f.writes).toEqual([]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(SOURCE);
	expect(await f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBe(30);
	// A subsequent real operation only starts after the original completion has
	// released its write slot. It therefore also proves the late stage reply ran.
	await f.select();
	expect(
		await f.frame.locator("#native").evaluate((element) => {
			if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
			return [
				element === Reflect.get(window, "stagedNative"),
				element.value,
				element.selectionStart,
				element.selectionEnd,
			];
		}),
	).toEqual([true, "kept through staging", 2, 5]);
	await f.page.getByRole("button", { name: "image", exact: true }).click();
	const retained = f.page.locator('[data-menu-option="canceled.svg"]');
	await expect.poll(() => retained.count()).toBe(1);
	const next = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await retained.click();
	await next;
	expect(f.writes).toEqual(["commit"]);
	await expect
		.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
		.toBe(70);
	await f.history();
	await expect
		.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
		.toBe(30);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(SOURCE);
	expect(readFileSync(f.file("frames/home/canceled.svg"), "utf8")).toBe(SECOND);
});

it.each(["computed source", "failed decode", "unavailable content"] as const)(
	"keeps original image intent for explicit Agent preparation after %s",
	{
		timeout: 120000,
	},
	async (failure) => {
		const source = failure === "computed source" ? SOURCE.replace("src={image}", "src={String(image)}") : SOURCE;
		const f = await originCanvas({ "shared/assets/first.svg": SVG }, source, "#hero", false, async (page) => {
			if (failure !== "unavailable content") return;
			await page.addInitScript(() => {
				addEventListener(
					"message",
					(event) => {
						if (event.data?.spool === "source-request" && event.data.action === "preview-image") {
							Reflect.set(window, "unavailableImageRequest", event.data.id);
							event.stopImmediatePropagation();
						}
					},
					true,
				);
			});
		});
		const sends: string[] = [];
		f.page.on("request", (request) => {
			if (request.url().endsWith("/agent/turn")) sends.push(request.url());
		});
		await f.select();
		const transfer = await f.target.evaluateHandle(
			(_element, bytes) => {
				const data = new DataTransfer();
				data.items.add(new File([bytes], "requested-picture.svg", { type: "image/svg+xml" }));
				return data;
			},
			failure === "unavailable content" ? SECOND : "not an SVG image",
		);
		await f.target.dispatchEvent("drop", { dataTransfer: transfer });
		if (failure === "unavailable content")
			await expect
				.poll(() => f.target.evaluate(() => typeof Reflect.get(window, "unavailableImageRequest")))
				.toBe("string");
		const notice = f.page.locator('[data-properties-rail] [data-hand-notice="blocked"]');
		// Unavailable delivery is concluded by the existing four-second source request deadline.
		await expect.poll(() => notice.count(), { timeout: failure === "unavailable content" ? 8000 : 1000 }).toBe(1);
		expect(await notice.textContent()).toContain(
			failure === "computed source"
				? "image expression is not a direct imported binding"
				: failure === "unavailable content"
					? "unavailable"
					: "decode",
		);
		expect(f.writes).toEqual([]);
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
		expect(existsSync(f.file("frames/home/requested-picture.svg"))).toBe(failure !== "computed source");
		expect(await f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBe(
			30,
		);
		const other = await f.frame.locator("#counter").boundingBox();
		if (!other) throw new Error("missing other selection");
		await f.page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await f.page.mouse.click(other.x + 8, other.y + other.height / 2);
		await f.page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		await expect
			.poll(async () => {
				const response = await fetch(`${f.project.url}/api/p/${f.project.name}/selection`, {
					headers: { "X-Spool-Control": f.project.controlToken },
				});
				const body = await response.json();
				return body.selection?.[0]?.selector;
			})
			.toBe("#counter");
		await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		const composer = f.page.locator("[data-agent-rail] textarea");
		await expect.poll(() => composer.inputValue()).toContain("requested-picture.svg");
		expect(await composer.inputValue()).toContain("#hero");
		expect(await composer.inputValue()).toContain("frames/home/frame.tsx");
		expect(sends).toEqual([]);
		expect(f.writes).toEqual([]);
	},
);

it.each(["absent", "empty literal"] as const)(
	"uses the existing empty image control and restores original %s source on Undo",
	{
		timeout: 120000,
	},
	async (kind) => {
		const source = `export default function Frame(){return <main style={{padding:40}}><img id="hero" ${kind === "absent" ? "" : 'src=""'} alt="empty image" style={{width:180,height:120}}/></main>}`;
		const f = await originCanvas({ "shared/assets/second.svg": SECOND }, source, "#hero");
		await f.select();
		const control = f.page.getByRole("button", { name: "image", exact: true });
		await expect.poll(() => control.count()).toBe(1);
		expect(await control.textContent()).toContain("none");
		await control.click();
		const choice = f.page.locator('[data-menu-option="second.svg"]');
		await expect.poll(() => choice.count()).toBe(1);
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await choice.click();
		expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
		await expect
			.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
			.toBe(70);
		await f.settled();
		const undone = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history();
		expect(await (await undone).json()).toMatchObject({
			ok: true,
			source: "saved",
			publication: { expected: { kind: "image", value: "", absent: kind === "absent" } },
		});
		await f.settled();
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
		expect(await f.target.getAttribute("src")).toBeNull();
		expect(await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1).rendered)).toBe("verified");
		expect(f.writes).toEqual(["commit", "inverse"]);
	},
);

it.each([false, true])(
	"retires a saved mismatching image prompt only after explicit reload verifies its original source and decoded bytes (changed binding: %s)",
	{
		timeout: 120000,
	},
	async (changedBinding) => {
		const first = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;
		const source = SOURCE.replace("{useState}", "{useState,useLayoutEffect,useRef}")
			.replace(
				"const [count,setCount]",
				`const imageRef=useRef(null);useLayoutEffect(()=>{if(window.imageCorrupt)imageRef.current.src=${JSON.stringify(first)}});const [count,setCount]`,
			)
			.replace('<img id="hero"', '<img ref={imageRef} id="hero"');
		const f = await originCanvas(
			{ "shared/assets/first.svg": SVG, "shared/assets/second.svg": SECOND, "shared/assets/thirdx.svg": SECOND },
			source,
			"#hero",
		);
		const sends: string[] = [];

		f.page.on("request", (request) => {
			if (request.url().endsWith("/agent/turn")) sends.push(request.url());
		});
		await f.select();
		await f.target.evaluate(() => Reflect.set(window, "imageCorrupt", true));
		await f.page.getByRole("button", { name: "image", exact: true }).click();
		const choice = f.page.locator('[data-menu-option="second.svg"]');
		await expect.poll(() => choice.count()).toBe(1);
		const savedReply = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await choice.click();
		expect(await (await savedReply).json()).toMatchObject({ ok: true, source: "saved" });
		const saved = readFileSync(f.file("frames/home/frame.tsx"), "utf8");
		expect(saved).toContain("second.svg");
		await expect
			.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1)?.rendered))
			.toBe("mismatching");
		await expect
			.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
			.toBe(30);
		const notice = f.page.locator('[data-properties-rail] [data-hand-notice="mismatching"]');
		await expect.poll(() => notice.count()).toBe(1);
		await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		const composer = f.page.locator("[data-agent-rail] textarea");
		await expect.poll(() => composer.inputValue()).toContain("second.svg");
		expect(await composer.inputValue()).toContain("#hero");
		const prepared = await composer.inputValue();
		const current = changedBinding ? saved.replace("shared/assets/second.svg", "shared/assets/thirdx.svg") : saved;
		if (changedBinding) {
			expect(current).not.toBe(saved);
			writeFileSync(f.file("frames/home/frame.tsx"), current);
		}

		await f.page.locator('[data-dock-glyph="properties"]').click();
		await notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
		await expect
			.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
			.toBe(70);
		await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").length)).toBe(2);
		await expect.poll(() => notice.count()).toBe(changedBinding ? 1 : 0);
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await expect.poll(() => composer.inputValue()).toBe(changedBinding ? prepared : "");
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(current);
		expect(f.writes).toEqual(["commit"]);
		expect(sends).toEqual([]);
	},
);

it.each([false, true])(
	"acknowledges the current image without saving or adding an Undo entry (unapplied: %s)",
	{ timeout: 120000 },
	async (unapplied) => {
		const replacement = `data:image/svg+xml;base64,${Buffer.from(SECOND).toString("base64")}`;
		const source = unapplied
			? SOURCE.replace("{useState}", "{useState,useLayoutEffect,useRef}")
					.replace(
						"const [count,setCount]",
						`const imageRef=useRef(null);useLayoutEffect(()=>{if(window.imageCorrupt)imageRef.current.src=${JSON.stringify(replacement)}});const [count,setCount]`,
					)
					.replace('<img id="hero"', '<img ref={imageRef} id="hero"')
			: SOURCE;
		const f = await originCanvas({ "shared/assets/first.svg": SVG }, source, "#hero");
		if (unapplied) {
			await f.page.route("**/source", async (route) => {
				if (route.request().postDataJSON()?.action !== "commit") return route.continue();
				const response = await route.fetch();
				// The original read was valid. The authored app changes while its real unchanged reply is held.
				await f.target.evaluate(() => Reflect.set(window, "imageCorrupt", true));
				await f.frame.locator("#counter").evaluate((element) => {
					if (!(element instanceof HTMLButtonElement)) throw new Error("missing counter");
					element.click();
				});
				await expect.poll(() => f.frame.locator("#counter").textContent()).toBe("1");
				await expect
					.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
					.toBe(70);
				await route.fulfill({ response });
			});
		}
		await f.select();
		await f.page.getByRole("button", { name: "image", exact: true }).click();
		const choice = f.page.locator('[data-menu-option="first.svg"]');
		await expect.poll(() => choice.count()).toBe(1);
		const completion = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await choice.click();
		expect(await (await completion).json()).toEqual({ ok: true, source: "unchanged", publication: null });
		await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").length)).toBe(1);
		expect(await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1).rendered)).toBe(
			unapplied ? "mismatching" : "verified",
		);
		if (unapplied) {
			const notice = f.page.locator('[data-hand-notice="unverified"]');
			await expect.poll(() => notice.count()).toBe(1);
			expect(await notice.textContent()).toContain("No new edit saved");
			expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
			expect(await f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBe(
				70,
			);
			await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
			const composer = f.page.locator("[data-agent-rail] textarea");
			await expect.poll(() => composer.inputValue()).toContain("first.svg");
			await f.page.locator('[data-dock-glyph="properties"]').click();
			await notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
			await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").length)).toBe(2);
			await expect.poll(() => notice.count()).toBe(0);
			await f.page.locator('[data-dock-glyph="agent"]').click();
			await expect.poll(() => composer.inputValue()).toBe("");
		}
		await expect.poll(() => f.page.locator("[data-hand-notice]").count()).toBe(0);
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
		expect(await f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBe(
			30,
		);
		const inverse: string[] = [];
		f.page.on("request", (request) => {
			if (request.url().endsWith("/source") && request.postDataJSON()?.action === "inverse")
				inverse.push(request.url());
		});
		await f.history();
		await f.page.keyboard.press("Tab");
		expect(inverse).toEqual([]);
		expect(f.writes).toEqual(["commit"]);
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	},
);

it("reloads a saved image inverse and prepares the actual restored asset", { timeout: 120000 }, async () => {
	const replacement = `data:image/svg+xml;base64,${Buffer.from(SECOND).toString("base64")}`;
	const source = SOURCE.replace("{useState}", "{useState,useLayoutEffect,useRef}")
		.replace(
			"const [count,setCount]",
			`const imageRef=useRef(null);useLayoutEffect(()=>{if(window.imageCorrupt)imageRef.current.src=${JSON.stringify(replacement)}});const [count,setCount]`,
		)
		.replace('<img id="hero"', '<img ref={imageRef} id="hero"');
	const f = await originCanvas(
		{ "shared/assets/first.svg": SVG, "shared/assets/second.svg": SECOND },
		source,
		"#hero",
	);
	const sends: string[] = [];
	f.page.on("request", (request) => {
		if (request.url().endsWith("/agent/turn")) sends.push(request.url());
	});
	await f.select();
	await f.page.getByRole("button", { name: "image", exact: true }).click();
	const choice = f.page.locator('[data-menu-option="second.svg"]');
	await expect.poll(() => choice.count()).toBe(1);
	await choice.click();
	await expect
		.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1)?.rendered))
		.toBe("verified");
	await expect
		.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
		.toBe(70);
	await f.target.evaluate(() => Reflect.set(window, "imageCorrupt", true));
	const undone = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
	);
	await f.history();
	expect(await (await undone).json()).toMatchObject({ ok: true, source: "saved" });
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	await expect
		.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1)?.rendered))
		.toBe("mismatching");
	const notice = f.page.locator('[data-hand-notice="mismatching"]');
	await expect.poll(() => notice.count()).toBe(1);
	await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	const composer = f.page.locator("[data-agent-rail] textarea");
	await expect
		.poll(() => composer.inputValue())
		.toContain('Requested result: image references "shared/assets/first.svg".');
	expect(await composer.inputValue()).not.toContain("data:image/");
	expect(await composer.inputValue()).toContain("#hero");
	await f.page.locator('[data-dock-glyph="properties"]').click();
	await notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect
		.poll(() => f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
		.toBe(30);
	await expect.poll(() => notice.count()).toBe(0);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => composer.inputValue()).toBe("");
	expect(f.writes).toEqual(["commit", "inverse"]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	expect(readFileSync(f.file("shared/assets/second.svg"), "utf8")).toBe(SECOND);
	expect(sends).toEqual([]);
});

it.each(["escape", "reselect"] as const)(
	"retires a pending real image decode after %s without a late preview or save",
	{ timeout: 120000 },
	async (cancel) => {
		const f = await originCanvas({ "shared/assets/first.svg": SVG }, SOURCE, "#hero");
		await f.frame.locator("#native").evaluate((element) => {
			if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
			element.value = "kept during decode";
			element.setSelectionRange(2, 5);
			Reflect.set(window, "decodeNative", element);
		});
		await f.select();
		await f.page.evaluate(() => {
			const replies: unknown[] = [];
			Reflect.set(window, "decodeReplies", replies);
			addEventListener("message", (event) => {
				if (event.data?.spool === "source-reply") replies.push(event.data);
			});
		});
		await f.target.evaluate(() => {
			addEventListener("message", (event) => {
				if (event.data?.spool === "source-request" && event.data.action === "preview-image")
					Reflect.set(window, "decodeRequest", event.data.id);
			});
			const decode = HTMLImageElement.prototype.decode;
			HTMLImageElement.prototype.decode = function () {
				return decode
					.call(this)
					.then(() => new Promise<void>((resolve) => Reflect.set(window, "releaseDecode", resolve)));
			};
		});
		const transfer = await f.target.evaluateHandle((_element, source) => {
			const data = new DataTransfer();
			data.items.add(new File([source], "pending.svg", { type: "image/svg+xml" }));
			return data;
		}, SECOND);
		await f.target.dispatchEvent("drop", { dataTransfer: transfer });
		await expect.poll(() => f.target.evaluate(() => typeof Reflect.get(window, "releaseDecode"))).toBe("function");
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').textContent()).toContain("Decoding image");
		expect(readFileSync(f.file("frames/home/pending.svg"), "utf8")).toBe(SECOND);
		const canceled = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "cancel",
		);
		if (cancel === "escape") await f.page.keyboard.press("Escape");
		else {
			const box = await f.frame.locator("#counter").boundingBox();
			if (!box) throw new Error("missing new target");
			await f.page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
			await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
			await f.page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		}
		await canceled;
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		const id: string = await f.target.evaluate(() => Reflect.get(window, "decodeRequest"));
		await f.target.evaluate(() => Reflect.get(window, "releaseDecode")());
		await expect
			.poll(() =>
				f.page.evaluate(
					(id) => Reflect.get(window, "decodeReplies").find((reply: { id: string }) => reply.id === id)?.result,
					id,
				),
			)
			.toBe("unavailable");
		expect(f.writes).toEqual([]);
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(SOURCE);
		expect(readFileSync(f.file("frames/home/pending.svg"), "utf8")).toBe(SECOND);
		expect(await f.target.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBe(
			30,
		);
		expect(
			await f.frame.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				return [
					element === Reflect.get(window, "decodeNative"),
					element.value,
					element.selectionStart,
					element.selectionEnd,
				];
			}),
		).toEqual([true, "kept during decode", 2, 5]);
	},
);
