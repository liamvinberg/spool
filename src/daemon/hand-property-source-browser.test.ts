import { expect, it } from "vitest";
import type { SourceRead, SourceResult } from "../source-edit";
import { originCanvas, watchResponses } from "./hand-origin-browser-helpers";

it("previews an unused property candidate, saves once and reverses retained source", { timeout: 120_000 }, async () => {
	let observer = "";
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button({label}) {return <button id="subject" className="text-red-500 text-sm">{label}</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40,direction:"rtl"}}><Button label="Hello"/></main>}',
		"#subject",
		false,
		async (page) => {
			page.on("request", (request) => {
				const match = /\/source-observer\/([^/?]+)/.exec(request.url());
				if (match) observer = match[1]!;
			});
		},
	);
	await expect.poll(() => observer).not.toBe("");
	const original = await f.target.evaluate((element) =>
		window.__SPOOL_SOURCE__?.read(element as HTMLElement, 9001, "className", {
			kind: "property",
			property: "color",
			scope: "",
		}),
	);
	expect(original).toBeDefined();
	if (!original) throw new Error("no actual committed property observation");
	expect(JSON.parse(original.context).native).toEqual({ direction: "rtl", writingMode: "horizontal-tb" });
	const response = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
		body: JSON.stringify({
			action: "read",
			frame: "home",
			// Presentation supplied by the client is not authority; the private observation owns this reading.
			original: { ...original, propertyNative: { property: "color", value: "counterfeit" } },
			generation: 9001,
			observer,
			operation: { kind: "property", property: "color", scope: "" },
		}),
	});
	const result = (await response.json()) as { ok: boolean; read?: SourceRead; reason?: string };
	expect(result.ok, result.reason).toBe(true);
	expect(result.read?.original.propertyNative).toEqual(original.propertyNative);
	expect(result.read?.property).toMatchObject({
		binding: { kind: "reference", name: "--color-red-500" },
		native: await f.target.evaluate((element) => getComputedStyle(element).color),
	});
	expect(result.read).toMatchObject({
		operation: { kind: "property", property: "color", scope: "" },
		scope: "definition",
		field: "className",
		value: "text-red-500 text-sm",
	});
	expect(result.read?.source).toMatch(/^shared\/button.tsx:1:/);
	expect(f.writes).toEqual([]);

	if (!result.read) throw new Error("no property source read");
	const post = async (body: unknown) => {
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
			body: JSON.stringify(body),
		});
		return (await response.json()) as SourceResult;
	};
	const previewResponse = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
		body: JSON.stringify({
			action: "preview",
			handle: result.read.handle,
			generation: 9001,
			revision: 1,
			original,
			change: { kind: "property", value: { kind: "binding", tokens: ["text-blue-500"] } },
		}),
	});
	const planned = await previewResponse.json();
	expect(planned.ok, planned.reason).toBe(true);
	const beforeColor = await f.target.evaluate((element) => getComputedStyle(element).color);
	const preview = await f.target.evaluate((_element, planned) => {
		const source = window.__SPOOL_SOURCE__;
		return { accepted: source?.previewProperty(planned), original: source?.complete(9001) };
	}, planned.preview);
	expect(preview.accepted).toBe(true);
	expect(preview.original).toEqual(original);
	expect(await f.target.evaluate((element) => getComputedStyle(element).color)).not.toBe(beforeColor);

	const secondPlanResponse = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
		body: JSON.stringify({
			action: "preview",
			handle: result.read.handle,
			generation: 9001,
			revision: 2,
			original,
			change: { kind: "property", value: { kind: "binding", tokens: ["text-green-500"] } },
		}),
	});
	const secondPlan = await secondPlanResponse.json();
	expect(secondPlan.ok, secondPlan.reason).toBe(true);
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), secondPlan.preview),
	).toBe(true);
	const latestColor = await f.target.evaluate((element) => getComputedStyle(element).color);
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), planned.preview),
	).toBe(false);
	expect(await f.target.evaluate((element) => getComputedStyle(element).color)).toBe(latestColor);

	const saved = await post({
		action: "commit",
		handle: result.read.handle,
		generation: result.read.generation,
		original: result.read.original,
		change: { kind: "property", value: { kind: "binding", tokens: ["text-blue-500"] } },
	});
	expect(saved.ok, saved.ok ? undefined : saved.reason).toBe(true);
	if (!saved.ok || !saved.publication) throw new Error("property save did not publish");
	expect(saved.publication.expected.kind).toBe("property");
	await f.target.evaluate(
		async (_element, publication) => window.__SPOOL_SOURCE__?.install(publication),
		saved.publication,
	);
	await post({ action: "delivered", publication: saved.publication.packet.id });
	expect(await f.target.getAttribute("class")).toBe("text-blue-500 text-sm");
	let receipt = saved.publication.receipt;
	for (const value of ["text-red-500 text-sm", "text-blue-500 text-sm"]) {
		const inventory = await f.target.evaluate(() =>
			window.__SPOOL_SOURCE__?.inventory("className", { kind: "property", property: "color", scope: "" }),
		);
		if (!inventory) throw new Error("missing real property inventory");
		const inverse = await post({ action: "inverse", receipt, inventories: [{ frame: "home", ...inventory }] });
		expect(inverse.ok, inverse.ok ? undefined : inverse.reason).toBe(true);
		if (!inverse.ok || !inverse.publication) throw new Error("property inverse did not publish");
		expect(inverse.publication.expected).toMatchObject({ kind: "property", className: value });
		await f.target.evaluate(
			async (_element, publication) => window.__SPOOL_SOURCE__?.install(publication, true),
			inverse.publication,
		);
		await post({ action: "delivered", publication: inverse.publication.packet.id });
		expect(await f.target.getAttribute("class")).toBe(value);
		receipt = inverse.publication.receipt;
	}
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), secondPlan.preview),
	).toBe(false);
	expect(await f.target.getAttribute("class")).toBe("text-blue-500 text-sm");
	const cancelOriginal = await f.target.evaluate((element) =>
		window.__SPOOL_SOURCE__?.read(element as HTMLElement, 9002, "className", {
			kind: "property",
			property: "color",
			scope: "",
		}),
	);
	const request = async (body: unknown) => {
		const reply = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
			body: JSON.stringify(body),
		});
		return reply.json();
	};
	const cancelRead = await request({
		action: "read",
		frame: "home",
		original: cancelOriginal,
		generation: 9002,
		observer,
		operation: { kind: "property", property: "color", scope: "" },
	});
	expect(cancelRead.ok, cancelRead.reason).toBe(true);
	const cancelPlan = await request({
		action: "preview",
		handle: cancelRead.read.handle,
		generation: 9002,
		revision: 1,
		original: cancelOriginal,
		change: { kind: "property", value: { kind: "binding", tokens: ["text-yellow-500"] } },
	});
	expect(cancelPlan.ok, cancelPlan.reason).toBe(true);
	const blue = await f.target.evaluate((element) => getComputedStyle(element).color);
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), cancelPlan.preview),
	).toBe(true);
	expect(await f.target.evaluate((element) => getComputedStyle(element).color)).not.toBe(blue);
	await f.target.evaluate(() => window.__SPOOL_SOURCE__?.cancel(9002));
	await request({ action: "cancel", handle: cancelRead.read.handle });
	expect(await f.target.getAttribute("class")).toBe("text-blue-500 text-sm");
	expect(await f.target.evaluate((element) => getComputedStyle(element).color)).toBe(blue);
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), cancelPlan.preview),
	).toBe(false);
	expect(
		await request({
			action: "preview",
			handle: cancelRead.read.handle,
			generation: 9002,
			revision: 2,
			original: cancelOriginal,
			change: { kind: "property", value: { kind: "binding", tokens: ["text-yellow-500"] } },
		}),
	).toMatchObject({ ok: false });
	const cssOriginal = await f.target.evaluate((element) =>
		window.__SPOOL_SOURCE__?.read(element as HTMLElement, 9003, "className", {
			kind: "property",
			property: "color",
			scope: "",
		}),
	);
	const cssRead = await request({
		action: "read",
		frame: "home",
		original: cssOriginal,
		generation: 9003,
		observer,
		operation: { kind: "property", property: "color", scope: "" },
	});
	expect(cssRead.ok, cssRead.reason).toBe(true);
	const cssPlan = await request({
		action: "preview",
		handle: cssRead.read.handle,
		generation: 9003,
		revision: 1,
		original: cssOriginal,
		change: { kind: "property", value: { kind: "binding", tokens: ["text-yellow-500"] } },
	});
	expect(cssPlan.ok, cssPlan.reason).toBe(true);
	expect(
		await f.target.evaluate((_element, plan) => window.__SPOOL_SOURCE__?.previewProperty(plan), cssPlan.preview),
	).toBe(true);
	const outside = await f.target.evaluate((_element, plan) => {
		const sheet = (document.getElementById("spool-compiled-css") as HTMLStyleElement).sheet!;
		sheet.insertRule(".outside-css-owner {color: rgb(1,2,3)}", sheet.cssRules.length);
		const accepted = window.__SPOOL_SOURCE__?.previewProperty({ ...plan, revision: 2 });
		window.__SPOOL_SOURCE__?.cancel(9003);
		return {
			accepted,
			kept: [...(document.getElementById("spool-compiled-css") as HTMLStyleElement).sheet!.cssRules].some((rule) =>
				rule.cssText.includes(".outside-css-owner"),
			),
		};
	}, cssPlan.preview);
	expect(outside).toEqual({ accepted: false, kept: true });
	await request({ action: "cancel", handle: cssRead.read.handle });
});

it("edits opacity through the actual Properties control with preview, one save and source inverse", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className="opacity-75">Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
	);
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input').first();
	await expect.poll(() => field.count()).toBe(1);
	await field.fill("50");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.5");
	expect(f.bytes()["shared/button.tsx"]).toContain("opacity-75");
	expect(f.writes).toEqual([]);
	await field.press("Enter");
	await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain("opacity-50");
	await f.settled();
	expect(f.writes).toEqual(["commit"]);
	expect(f.bytes()["shared/button.tsx"]).toContain("opacity-50");
	await f.history();
	await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain("opacity-75");
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toContain("opacity-75");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
});

// A control the file cannot take says the source's own words for it, and the
// optional additions it offers are named by that same description.
it("says the source's own property refusal on the generic controls", { timeout: 120_000 }, async () => {
	let described: ReturnType<typeof watchResponses> | undefined;
	const reads: unknown[] = [];
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className={"opacity-" + 75}>Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		false,
		async (page) => {
			page.on("request", (request) => {
				if (request.url().endsWith("/source") && request.postDataJSON()?.action === "read")
					reads.push(request.postDataJSON());
			});
			described = watchResponses(page, (response) => {
				if (!response.url().endsWith("/source")) return false;
				const body = response.request().postDataJSON();
				return body?.action === "describe" && body.operation?.kind === "property";
			});
		},
	);
	const refused = () => {
		const said = (described?.bodies ?? [])
			.map((body) => body as { ok?: boolean; reason?: unknown })
			.find((body) => body.ok === false && typeof body.reason === "string");
		return typeof said?.reason === "string" ? said.reason : "";
	};
	await f.select();
	await expect.poll(refused).not.toBe("");
	const refusal = refused();
	await expect
		.poll(() => f.page.locator('[data-properties-row="opacity"] > span').first().getAttribute("title"))
		.toBe(refusal);
	await expect.poll(() => f.page.locator("[data-add-property]").getAttribute("title")).toBe(refusal);
	// Nothing here takes a request: the refusal is at the control, so no read is
	// attempted for a class cell the source will not write.
	expect(await f.page.locator('[data-properties-row="opacity"] input').count()).toBe(0);
	expect(reads).toEqual([]);
	expect(f.writes).toEqual([]);
	expect(f.bytes()["shared/button.tsx"]).toContain('className={"opacity-" + 75}');
});

it("does not prepare an old property read after Escape and a newer preview", { timeout: 120_000 }, async () => {
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let reached = false;
	let replayed = false;
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className="opacity-75">Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		false,
		async (page) => {
			await page.route("**/source", async (route) => {
				if (route.request().postDataJSON().action !== "reach" || reached) return route.continue();
				const response = await route.fetch();
				expect((await response.json()).ok).toBe(true);
				reached = true;
				await held;
				await route.fulfill({ response });
				replayed = true;
			});
		},
	);
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input');
	await field.fill("50");
	await expect.poll(() => reached).toBe(true);
	await field.press("Escape");
	await field.fill("60");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.6");
	release();
	await expect.poll(() => replayed).toBe(true);
	await f.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	expect(await f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.6");
	await field.press("Escape");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
	expect(f.writes).toEqual([]);
	expect(f.bytes()["shared/button.tsx"]).toContain("opacity-75");
});

it.each([true, false])(
	"scrubs one retained opacity gesture and completes only on release: %s",
	// The same retained-lifecycle budget its multiphase peers here are given: this
	// case boots a canvas, scrubs, saves and reverses, which no 5s default covers.
	{ timeout: 120_000 },
	async (commit) => {
		const f = await originCanvas(
			{
				"shared/button.tsx":
					'export function Button(){return <button id="subject" className="opacity-75">Hello</button>}',
			},
			'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
			"#subject",
		);
		await f.select();
		// The rail scrolls: a pointer gesture reads the row where it actually is.
		const label = f.page.locator('[data-properties-row="opacity"] > span').first();
		await label.scrollIntoViewIfNeeded();
		const box = await label.boundingBox();
		if (!box) throw new Error("opacity scrub label has no box");
		const x = box.x + 5,
			y = box.y + box.height / 2;
		await f.page.mouse.move(x, y);
		await f.page.mouse.down();
		await f.page.mouse.move(x + 8, y);
		await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.77");
		await f.page.mouse.move(x + 16, y);
		await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.79");
		expect(f.writes).toEqual([]);
		expect(f.bytes()["shared/button.tsx"]).toContain("opacity-75");
		if (!commit) await f.page.keyboard.press("Escape");
		await f.page.mouse.up();
		if (commit) {
			await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain("opacity-79");
			await f.settled();
			expect(f.writes).toEqual(["commit"]);
			await f.history();
			await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain("opacity-75");
			await f.settled();
		} else expect(f.writes).toEqual([]);
		await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
	},
);

it.each([false, true])(
	"keeps a continuous native scrub current while later compiler plans are held: outside CSSOM %s",
	{ timeout: 120_000 },
	async (outside) => {
		const f = await originCanvas(
			{
				"shared/button.tsx":
					'export function Button(){return <button id="subject" className="opacity-75">Hello</button>}',
			},
			'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/><i hidden className="opacity-75"/></main>}',
			"#subject",
		);
		await f.select();
		const label = f.page.locator('[data-properties-row="opacity"] > span').first();
		await label.scrollIntoViewIfNeeded();
		const box = await label.boundingBox();
		if (!box) throw new Error("opacity scrub label has no box");
		const x = box.x + 5,
			y = box.y + box.height / 2;
		await f.page.mouse.move(x, y);
		await f.page.mouse.down();
		await f.page.mouse.move(x + 8, y);
		await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.77");
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let waiting = 0;
		const replies: Promise<void>[] = [];
		await f.page.route("**/source", async (route) => {
			if (route.request().postDataJSON()?.action !== "preview") return route.continue();
			const response = await route.fetch();
			waiting++;
			const reply = held.then(() => route.fulfill({ response }));
			replies.push(reply);
			await reply;
		});
		try {
			await f.page.mouse.move(x + 16, y);
			await expect.poll(() => waiting).toBe(1);
			await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.79");
			await f.page.mouse.move(x + 24, y);
			await expect.poll(() => waiting).toBe(2);
			await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.81");
			if (outside) {
				await f.target.evaluate(() => {
					const style = document.getElementById("spool-compiled-css");
					if (!(style instanceof HTMLStyleElement) || !style.sheet) throw new Error("missing compiled sheet");
					style.sheet.insertRule("#subject { border-color: rgb(1, 2, 3) }", style.sheet.cssRules.length);
				});
				await f.page.mouse.move(x + 32, y);
				await expect.poll(() => waiting).toBe(3);
				// Neither an immediate sample nor its late compiled reply owns this outside CSSOM edit.
				expect(await f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.81");
			}
			expect(f.writes).toEqual([]);
			expect(f.bytes()["shared/button.tsx"]).toContain("opacity-75");
			await f.page.keyboard.press("Escape");
			await f.page.mouse.up();
			await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
		} finally {
			release();
			await Promise.all(replies);
		}
		await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
		if (outside)
			expect(await f.target.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe("rgb(1, 2, 3)");
		expect(f.writes).toEqual([]);
	},
);

it("uses the approved shared color menu with exact reference metadata and binding-restoring inverse", {
	timeout: 120_000,
}, async () => {
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className="text-red-500 bg-white text-sm">Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		true,
	);
	await f.select();
	const second = f.page.frameLocator('iframe[title="second"]').locator("#subject");
	const before = await f.target.evaluate((element) => getComputedStyle(element).color);
	const trigger = f.page.getByRole("button", { name: "Choose color", exact: true });
	await expect.poll(() => trigger.count()).toBe(1);
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-red-500");
	await trigger.click();
	const search = f.page.getByRole("textbox", { name: "Find color token", exact: true });
	await search.fill("missing-color-choice");
	// No token answers that search; removing the declaration is not a search result.
	expect(
		await f.page.locator(".ep-color-options button").evaluateAll((buttons) => buttons.map((b) => b.textContent)),
	).toEqual(["Remove color"]);
	expect(f.writes).toEqual([]);
	await search.fill("blue-500");
	const blue = f.page.getByRole("button", { name: "Apply --color-blue-500", exact: true });
	expect(await blue.count()).toBe(1);
	await search.press("ArrowDown");
	expect(await blue.evaluate((element) => document.activeElement === element)).toBe(true);
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await f.page.keyboard.press("Enter");
	const result = await (await saved).json();
	expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
	await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain("text-blue-500");
	await f.settled();
	expect(f.writes).toEqual(["commit"]);
	expect(f.bytes()["shared/button.tsx"]).toContain("bg-white text-sm");
	const after = await f.target.evaluate((element) => getComputedStyle(element).color);
	expect(after).not.toBe(before);
	expect(await second.evaluate((element) => getComputedStyle(element).color)).toBe(after);
	const undone = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
	);
	await f.page.keyboard.press("ControlOrMeta+z");
	expect(await (await undone).json()).toMatchObject({ ok: true });
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toContain("text-red-500");
	expect(await second.evaluate((element) => getComputedStyle(element).color)).toBe(before);
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-red-500");
});

it("previews fractional shared typography, steps its current draft and restores the binding through history", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Button(){return <button id="subject" className="text-sm leading-6 text-red-500">Hello</button>}';
	const f = await originCanvas(
		{ "shared/button.tsx": original },
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		true,
	);
	await f.select();
	const second = f.page.frameLocator('iframe[title="second"]').locator("#subject");
	const field = f.page.getByRole("textbox", { name: "font-size", exact: true });
	await field.fill("7.999");
	await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).fontSize)).toBe("7.999px");
	await field.press("ArrowUp");
	await expect.poll(() => second.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8.999px");
	expect(f.bytes()["shared/button.tsx"]).toBe(original);
	expect(f.writes).toEqual([]);
	await field.press("Escape");
	await expect.poll(() => second.evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px");
	expect(f.writes).toEqual([]);
	await field.fill("7.999");
	await field.press("ArrowUp");
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	expect(await (await saved).json()).toMatchObject({ ok: true });
	await f.settled();
	expect(f.writes).toEqual(["commit"]);
	expect(f.bytes()["shared/button.tsx"]).toContain("8.999px");
	expect(f.bytes()["shared/button.tsx"]).toContain("leading-6 text-red-500");
	expect(await second.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8.999px");
	expect(await second.evaluate((element) => getComputedStyle(element).lineHeight)).toBe("24px");
	const changed = f.bytes()["shared/button.tsx"];
	await f.history();
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(original);
	expect(await second.evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px");
	await f.history(true);
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(changed);
	expect(await second.evaluate((element) => getComputedStyle(element).fontSize)).toBe("8.999px");
});

it("applies a shared project background reference and explicitly detaches it without losing other properties", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Button(){return <button id="subject" className="bg-white text-red-500 text-sm rounded-lg">Hello</button>}';
	const f = await originCanvas(
		{ "shared/button.tsx": original, "shared/tokens.css": "@theme { --color-brand: #123456; }" },
		'import "shared/tokens.css";import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/><input id="native" defaultValue="initial"/></main>}',
		"#subject",
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	for (const frame of [f.frame, second])
		await frame.locator("#native").evaluate((element) => {
			if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
			element.value = "kept background state";
			element.setSelectionRange(2, 5);
			Reflect.set(window, "backgroundInput", element);
		});
	await f.select();
	const trigger = f.page.getByRole("button", { name: "Choose background-color", exact: true });
	await trigger.click();
	await f.page.getByRole("textbox", { name: "Find background-color token", exact: true }).fill("brand");
	const option = f.page.getByRole("button", { name: "Apply --color-brand", exact: true });
	expect(await option.locator("..").textContent()).toContain("Project");
	const save = async (action: () => Promise<unknown>) => {
		const reply = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await action();
		expect(await (await reply).json()).toMatchObject({ ok: true, source: "saved" });
		await f.settled();
	};
	await save(() => option.click());
	const bound = f.bytes()["shared/button.tsx"];
	expect(bound).toContain("bg-brand");
	expect(bound).toContain("text-red-500 text-sm rounded-lg");
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-brand");
	for (const frame of [f.frame, second])
		expect(await frame.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
			"rgb(18, 52, 86)",
		);
	await trigger.click();
	expect(
		await f.page.getByRole("button", { name: "Apply --color-brand", exact: true }).getAttribute("aria-pressed"),
	).toBe("true");
	await save(() => f.page.getByRole("button", { name: "Use custom value", exact: true }).click());
	await expect.poll(() => trigger.getAttribute("title")).toBe("Custom value");
	const custom = f.bytes()["shared/button.tsx"];
	expect(custom).not.toContain("bg-brand");
	expect(custom).toContain("text-red-500 text-sm rounded-lg");
	await trigger.click();
	const field = f.page.getByRole("textbox", { name: "background-color", exact: true });
	await field.fill("#abcdef");
	await expect
		.poll(() => second.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor))
		.toBe("rgb(171, 205, 239)");
	expect(f.bytes()["shared/button.tsx"]).toBe(custom);
	await field.press("Escape");
	await expect
		.poll(() => second.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor))
		.toBe("rgb(18, 52, 86)");
	await f.history();
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(bound);
	await f.select();
	await expect.poll(() => trigger.getAttribute("title")).toBe("Linked to --color-brand");
	await f.history();
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(original);
	await f.history(true);
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(bound);
	for (const frame of [f.frame, second]) {
		expect(await frame.locator("#subject").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
			"rgb(18, 52, 86)",
		);
		expect(
			await frame.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				return [
					element === Reflect.get(window, "backgroundInput"),
					element.value,
					element.selectionStart,
					element.selectionEnd,
				];
			}),
		).toEqual([true, "kept background state", 2, 5]);
	}
	expect(f.writes).toEqual(["commit", "commit", "inverse", "inverse", "inverse"]);
});

it.each([true, false])(
	"preserves shared color and exact type size in either edit order: color first %s",
	{
		timeout: 120_000,
	},
	async (colorFirst) => {
		const original =
			'export function Button(){return <button id="subject" className="text-red-500 text-sm leading-6 bg-white">Hello</button>}';
		const f = await originCanvas(
			{ "shared/button.tsx": original },
			'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
			"#subject",
			true,
		);
		const second = f.page.frameLocator('iframe[title="second"]').locator("#subject");
		const beforeColor = await f.target.evaluate((element) => getComputedStyle(element).color);
		for (const target of [f.target, second])
			await target.evaluate((element) => Reflect.set(window, "orderedPropertyNode", element));
		await f.select();
		const color = async () => {
			await f.page.getByRole("button", { name: "Choose color", exact: true }).click();
			await f.page.getByRole("textbox", { name: "Find color token", exact: true }).fill("blue-500");
			await f.page.getByRole("button", { name: "Apply --color-blue-500", exact: true }).click();
		};
		const size = async () => {
			const field = f.page.getByRole("textbox", { name: "font-size", exact: true });
			await field.fill("8.999px");
			await field.press("Enter");
		};
		let afterColor = beforeColor;
		for (const action of colorFirst ? [color, size] : [size, color]) {
			const saved = f.page.waitForResponse(
				(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
			);
			await action();
			expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
			await f.settled();
			if (action === color) afterColor = await f.target.evaluate((element) => getComputedStyle(element).color);
			for (const target of [f.target, second])
				expect(await target.evaluate((element) => getComputedStyle(element).lineHeight)).toBe("24px");
		}
		const changed = f.bytes()["shared/button.tsx"];
		expect(changed).toContain("text-blue-500");
		expect(changed).toContain("8.999px");
		expect(changed).toContain("leading-6 bg-white");
		expect(afterColor).not.toBe(beforeColor);
		const check = async (color: string, size: string) => {
			for (const target of [f.target, second])
				expect(
					await target.evaluate((element) => ({
						color: getComputedStyle(element).color,
						size: getComputedStyle(element).fontSize,
						leading: getComputedStyle(element).lineHeight,
						same: element === Reflect.get(window, "orderedPropertyNode"),
					})),
				).toEqual({ color, size, leading: "24px", same: true });
		};
		await check(afterColor, "8.999px");
		for (const redo of [false, false, true, true]) {
			const saved = f.page.waitForResponse(
				(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
			);
			await f.history(redo);
			expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
			await f.settled();
			if (f.writes.length === 4) {
				expect(f.bytes()["shared/button.tsx"]).toBe(original);
				await check(beforeColor, "14px");
			}
		}
		expect(f.bytes()["shared/button.tsx"]).toBe(changed);
		await check(afterColor, "8.999px");
		expect(f.writes).toEqual(["commit", "commit", "inverse", "inverse", "inverse", "inverse"]);
	},
);

it("edits one shared radius corner through the approved numeric control and preserves the other corners", {
	timeout: 120_000,
}, async () => {
	const original =
		'export function Button(){return <button id="subject" className="p-6 rounded-lg bg-white text-red-500">Hello</button>}';
	const f = await originCanvas(
		{ "shared/button.tsx": original },
		'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		true,
	);
	await f.select();
	await f.page
		.locator('[data-properties-row="border-radius"]')
		.getByRole("button", { name: "unfold", exact: true })
		.click();
	const field = f.page.getByRole("textbox", { name: "border-top-left-radius", exact: true });
	await expect.poll(() => field.count()).toBe(1);
	const targets = [f.target, f.page.frameLocator('iframe[title="second"]').locator("#subject")];
	const check = async (corner: string) => {
		for (const target of targets)
			expect(
				await target.evaluate((element) => {
					const css = getComputedStyle(element);
					return [
						css.borderTopLeftRadius,
						css.borderTopRightRadius,
						css.borderBottomRightRadius,
						css.borderBottomLeftRadius,
					];
				}),
			).toEqual([corner, "8px", "8px", "8px"]);
	};
	await field.fill("3.25px");
	await expect
		.poll(() => f.target.evaluate((element) => getComputedStyle(element).borderTopLeftRadius))
		.toBe("3.25px");
	await check("3.25px");
	expect(f.bytes()["shared/button.tsx"]).toBe(original);
	await field.press("Escape");
	await check("8px");
	await field.fill("3.25px");
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
	await f.settled();
	await check("3.25px");
	const changed = f.bytes()["shared/button.tsx"];
	expect(changed).toContain("rounded-lg");
	expect(changed).toContain("rounded-tl-[3.25px]");
	expect(changed).toContain("bg-white text-red-500");
	await f.history();
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(original);
	await check("8px");
	await f.history(true);
	await f.settled();
	expect(f.bytes()["shared/button.tsx"]).toBe(changed);
	await check("3.25px");
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it.each(["letter-spacing", "border-width"])(
	"adds optional shared %s from the approved searchable entry and reverses source",
	{ timeout: 120_000 },
	async (property) => {
		const original =
			'export function Button(){return <button id="subject" className="p-6 text-sm bg-white">Hello</button>}';
		const f = await originCanvas(
			{ "shared/button.tsx": original },
			'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
			"#subject",
			true,
		);
		await f.select();
		expect(await f.page.getByRole("textbox", { name: property, exact: true }).count()).toBe(0);
		await f.page.getByRole("button", { name: "Add property", exact: true }).click();
		const option = f.page.locator(`[data-menu-option="${property}"]`);
		await option.waitFor();
		const saved = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await option.click();
		expect(await (await saved).json()).toMatchObject({ ok: true, source: "saved" });
		await f.settled();
		await expect.poll(() => f.page.locator(`[data-properties-row="${property}"]`).count()).toBe(1);
		const after = f.bytes()["shared/button.tsx"];
		expect(after).toContain(property === "border-width" ? "border-[1px]" : "tracking-[0px]");
		const targets = [f.target, f.page.frameLocator('iframe[title="second"]').locator("#subject")];
		for (const target of targets) {
			const native = await target.evaluate((element, property) => {
				const css = getComputedStyle(element);
				return property === "border-width"
					? [
							css.borderTopWidth,
							css.borderRightWidth,
							css.borderBottomWidth,
							css.borderLeftWidth,
							css.borderTopStyle,
						]
					: [css.letterSpacing];
			}, property);
			expect(native).toEqual(property === "border-width" ? ["1px", "1px", "1px", "1px", "solid"] : ["normal"]);
		}
		const undone = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history();
		expect(await (await undone).json()).toMatchObject({ ok: true, source: "saved" });
		await f.settled();
		expect(f.bytes()["shared/button.tsx"]).toBe(original);
		for (const target of targets)
			expect(
				await target.evaluate(
					(element, property) =>
						getComputedStyle(element).getPropertyValue(
							property === "border-width" ? "border-top-width" : property,
						),
					property,
				),
			).toBe(property === "border-width" ? "0px" : "normal");
		expect(f.writes).toEqual(["commit", "inverse"]);
	},
);
