import { expect, it } from "vitest";
import type { SourceRead, SourceResult } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

it("previews an unused property candidate, saves once and reverses retained source", async () => {
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
			original,
			generation: 9001,
			observer,
			operation: { kind: "property", property: "color", scope: "" },
		}),
	});
	const result = (await response.json()) as { ok: boolean; read?: SourceRead; reason?: string };
	expect(result.ok, result.reason).toBe(true);
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

it("edits opacity through the actual Properties control with preview, one save and source inverse", async () => {
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

it("retains the latest typed request when a held original computed-class read is refused", async () => {
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let reached = false;
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className={"opacity-" + 75}>Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		false,
		async (page) => {
			await page.route("**/source", async (route) => {
				const body = route.request().postDataJSON();
				if (body.action !== "read" || body.operation?.kind !== "property") return route.continue();
				const response = await route.fetch();
				expect((await response.json()).ok).toBe(false);
				reached = true;
				await held;
				await route.fulfill({ response });
			});
		},
	);
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input');
	await field.fill("50");
	await expect.poll(() => reached).toBe(true);
	await field.fill("60");
	release();
	const notice = f.page.locator("[data-properties-rail] [data-hand-notice]");
	await expect.poll(() => notice.getByRole("button", { name: "Ask agent", exact: true }).count()).toBe(1);
	await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	const composer = f.page.locator("[data-agent-rail] textarea");
	await expect.poll(() => composer.inputValue()).toContain("opacity-60");
	expect(await composer.inputValue()).toContain("#subject");
	expect(f.writes).toEqual([]);
	expect(f.bytes()["shared/button.tsx"]).toContain('className={"opacity-" + 75}');
});

it("does not prepare an old property read after Escape and a newer preview", async () => {
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

it.each([true, false])("scrubs one retained opacity gesture and completes only on release: %s", async (commit) => {
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button(){return <button id="subject" className="opacity-75">Hello</button>}',
		},
		'import {Button} from "shared/button"; export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
	);
	await f.select();
	const label = f.page.locator('[data-properties-row="opacity"] > span').first();
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
});
