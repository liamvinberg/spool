import { existsSync, readFileSync } from "node:fs";
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

it.each(["computed source", "failed decode"] as const)(
	"keeps original image intent for explicit Agent preparation after %s",
	{
		timeout: 120000,
	},
	async (failure) => {
		const source = failure === "computed source" ? SOURCE.replace("src={image}", "src={String(image)}") : SOURCE;
		const f = await originCanvas({ "shared/assets/first.svg": SVG }, source, "#hero");
		const sends: string[] = [];
		f.page.on("request", (request) => {
			if (request.url().endsWith("/agent/turn")) sends.push(request.url());
		});
		await f.select();
		const transfer = await f.target.evaluateHandle(() => {
			const data = new DataTransfer();
			data.items.add(new File(["not an SVG image"], "requested-picture.svg", { type: "image/svg+xml" }));
			return data;
		});
		await f.target.dispatchEvent("drop", { dataTransfer: transfer });
		const notice = f.page.locator('[data-properties-rail] [data-hand-notice="blocked"]');
		await expect.poll(() => notice.count()).toBe(1);
		expect(await notice.textContent()).toContain(
			failure === "computed source" ? "image expression is not a direct imported binding" : "decode",
		);
		expect(f.writes).toEqual([]);
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
		expect(existsSync(f.file("frames/home/requested-picture.svg"))).toBe(failure === "failed decode");
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
