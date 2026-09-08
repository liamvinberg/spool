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
