import { expect, it } from "vitest";
import type { SourceRead, SourceResult } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

it.each([false, true])(
	"binds grouped scope save/inverse to its original purpose (changed scope: %s)",
	{ timeout: 120_000 },
	async (changedScope) => {
		let observer = "";
		const source =
			'export function Button(){return <button id="subject" className="p-6 opacity-75 hover:opacity-50 hover:text-red-500 md:opacity-25">Hello</button>}';
		const f = await originCanvas(
			{ "shared/button.tsx": source },
			'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
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
		const operation = { kind: "properties", target: { kind: "remove-scope", scope: "hover:" } } as const;
		const original = await f.target.evaluate(
			(element, operation) => window.__SPOOL_SOURCE__?.read(element as HTMLElement, 9001, "className", operation),
			operation,
		);
		if (!original) throw new Error("missing actual original class observation");
		const post = (body: unknown) =>
			f.page.evaluate(
				async ({ url, token, body }) => {
					const response = await fetch(url, {
						method: "POST",
						headers: { "Content-Type": "application/json", "X-Spool-Control": token },
						body: JSON.stringify(body),
					});
					return response.json();
				},
				{ url: `${f.project.url}/api/p/${f.project.name}/source`, token: f.project.controlToken, body },
			);
		const read = (await post({ action: "read", frame: "home", original, generation: 9001, observer, operation })) as {
			ok: boolean;
			read?: SourceRead;
			reason?: string;
		};
		expect(read.ok, read.reason).toBe(true);
		if (!read.read) throw new Error("missing grouped source read");
		expect(read.read.operation).toEqual(operation);
		const saved = (await post({
			action: "commit",
			handle: read.read.handle,
			generation: 9001,
			original,
			change: { kind: "properties", value: { kind: "remove-scope", scope: changedScope ? "md:" : "hover:" } },
		})) as SourceResult;
		if (changedScope) {
			expect(saved).toMatchObject({
				ok: false,
				reason: "the grouped request differs from its original source purpose",
			});
			expect(f.bytes()["shared/button.tsx"]).toBe(source);
			return;
		}
		expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, source: "saved" });
		if (!saved.ok || !saved.publication) throw new Error("missing grouped publication");
		expect(saved.publication.expected).toMatchObject({ kind: "properties" });
		expect(f.bytes()["shared/button.tsx"]).toBe(
			source.replace("hover:opacity-50", "").replace("hover:text-red-500", ""),
		);
		await post({ action: "delivered", publication: saved.publication.packet.id });
		const inverse = (await post({
			action: "inverse",
			receipt: saved.publication.receipt,
			inventories: [],
		})) as SourceResult;
		expect(inverse, JSON.stringify(inverse)).toMatchObject({ ok: true, source: "saved" });
		expect(f.bytes()["shared/button.tsx"]).toBe(source);
		expect(f.writes).toEqual(["commit", "inverse"]);
	},
);
