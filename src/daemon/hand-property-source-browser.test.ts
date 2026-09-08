import { expect, it } from "vitest";
import type { SourceRead, SourceResult } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

it("reads a property from the actual committed shared class and captured native context", async () => {
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
	const preview = await f.target.evaluate(() => {
		const source = window.__SPOOL_SOURCE__;
		return { accepted: source?.preview(9001, "text-blue-500 text-sm"), original: source?.complete(9001) };
	});
	expect(preview.accepted).toBe(true);
	expect(preview.original).toEqual(original);
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
});
