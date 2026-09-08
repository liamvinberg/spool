import { expect, it, onTestFinished } from "vitest";
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

it("removes an authored scope through one actual rail source operation and inverse", { timeout: 120_000 }, async () => {
	const source =
		'export function Button(){return <button id="subject" className="p-6 opacity-75 hover:opacity-50 hover:text-red-500 md:opacity-25">Hello</button>}';
	const f = await originCanvas(
		{ "shared/button.tsx": source },
		'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
		"#subject",
		false,
	);
	await f.select();
	await f.page
		.locator("[data-scope-chip]")
		.filter({ hasText: /^hover:$/ })
		.click();
	const readReply = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
	);
	await f.page.getByRole("button", { name: "remove hover:", exact: true }).click();
	const reading = await (await readReply).json();
	expect(reading, JSON.stringify(reading)).toMatchObject({ ok: true });
	await expect.poll(() => f.writes).toEqual(["commit"]);
	expect(f.bytes()["shared/button.tsx"]).toBe(
		source.replace("hover:opacity-50", "").replace("hover:text-red-500", ""),
	);
	await f.settled();
	await f.history();
	await expect.poll(() => f.writes).toEqual(["commit", "inverse"]);
	expect(f.bytes()["shared/button.tsx"]).toBe(source);
});

it.each([false, true])(
	"retains a raw token request through its original rail read (cancel: %s)",
	{ timeout: 120_000 },
	async (cancel) => {
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		onTestFinished(() => release());
		let reading = false;
		let returned = false;
		const source =
			'export function Button(){return <button id="subject" className="p-6 opacity-75 hover:opacity-50">Hello</button>}';
		const f = await originCanvas(
			{ "shared/button.tsx": source },
			'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button/></main>}',
			"#subject",
			false,
			async (page) => {
				await page.route("**/source", async (route) => {
					const body = route.request().postDataJSON();
					if (body?.action !== "read" || body.operation?.kind !== "properties") return route.continue();
					const response = await route.fetch();
					reading = true;
					await held;
					await route.fulfill({ response });
					returned = true;
				});
			},
		);
		await f.select();
		await f.page
			.locator("[data-properties-source] button")
			.filter({ hasText: /^hover:opacity-50$/ })
			.click();
		await expect.poll(() => reading).toBe(true);
		expect(f.writes).toEqual([]);
		const canceled = cancel
			? f.page.waitForResponse(
					(response) =>
						response.url().endsWith("/source") && response.request().postDataJSON()?.action === "cancel",
				)
			: undefined;
		if (cancel) await f.page.keyboard.press("Escape");
		release();
		await expect.poll(() => returned).toBe(true);
		if (cancel) {
			await canceled;
			expect(f.bytes()["shared/button.tsx"]).toBe(source);
			expect(f.writes).toEqual([]);
			return;
		}
		await expect.poll(() => f.writes).toEqual(["commit"]);
		await f.settled();
		expect(f.bytes()["shared/button.tsx"]).toBe(source.replace("hover:opacity-50", ""));
		await f.history();
		await expect.poll(() => f.writes).toEqual(["commit", "inverse"]);
		expect(f.bytes()["shared/button.tsx"]).toBe(source);
	},
);

it.each([false, true])(
	"verifies every shared use of a raw class removal (masked: %s)",
	{ timeout: 120_000 },
	async (masked) => {
		const file = "shared/button.tsx";
		const source = 'export function Button(){return <button id="subject" className="p-6 opacity-75">Hello</button>}';
		const f = await originCanvas(
			{ [file]: source },
			'import {Button} from "shared/button";export default function Frame(){return <main className="p-10"><Button/><input id="native" defaultValue="initial"/></main>}',
			"#subject",
			true,
			async (page) => {
				await page.addInitScript(() => {
					const outcomes: Record<string, unknown> = {};
					Reflect.set(window, "groupOutcomes", outcomes);
					addEventListener("message", (event) => {
						if (event.data?.spool !== "source-reply" || !event.data.result?.installation) return;
						const frame = [...document.querySelectorAll("iframe")].find(
							(frame) => frame.contentWindow === event.source,
						);
						if (frame) outcomes[frame.title] = event.data.result;
					});
				});
			},
		);
		const documents = [f.frame, f.page.frameLocator('iframe[title="second"]')];
		if (masked)
			await documents[1]!.locator("#subject").evaluate((element) => {
				new MutationObserver(() => {
					if (!element.classList.contains("opacity-75")) element.setAttribute("style", "opacity:.25");
					else element.removeAttribute("style");
				}).observe(element, { attributes: true, attributeFilter: ["class"] });
			});
		for (const document of documents)
			await document.locator("#native").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
				element.value = "kept group";
				Reflect.set(window, "groupInput", element);
			});
		await f.select();
		const committed = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		const delivered = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
		await f.page
			.locator("[data-properties-source] button")
			.filter({ hasText: /^opacity-75$/ })
			.click();
		expect(await (await committed).json()).toMatchObject({
			ok: true,
			source: "saved",
			publication: { expected: { kind: "properties" } },
		});
		await delivered;
		await f.settled();
		expect(f.bytes()[file]).toBe(source.replace("opacity-75", ""));
		for (const [index, document] of documents.entries())
			expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).opacity)).toBe(
				masked && index === 1 ? "0.25" : "1",
			);
		const result = await f.page.evaluate(() => {
			const results = Reflect.get(window, "groupOutcomes");
			return [results.home, results.second].flatMap((result) => result?.uses ?? []);
		});
		expect(result.map((use: { rendered: string }) => use.rendered)).toEqual(
			masked ? ["verified", "mismatching"] : ["verified", "verified"],
		);
		const notice = f.page.locator("[data-properties-rail] [data-hand-notice]");
		expect(await notice.count()).toBe(masked ? 1 : 0);
		await f.page.keyboard.press("ControlOrMeta+z");
		await f.settled();
		expect(f.bytes()[file]).toBe(source);
		for (const document of documents) {
			expect(await document.locator("#subject").evaluate((element) => getComputedStyle(element).opacity)).toBe(
				"0.75",
			);
			expect(
				await document
					.locator("#native")
					.evaluate((element) => [
						element === Reflect.get(window, "groupInput"),
						element instanceof HTMLInputElement ? element.value : null,
					]),
			).toEqual([true, "kept group"]);
		}
		await expect
			.poll(() =>
				f.page.evaluate(() => {
					const results = Reflect.get(window, "groupOutcomes");
					return [results.home, results.second].flatMap(
						(result) => result?.uses?.map((use: { rendered: string }) => use.rendered) ?? [],
					);
				}),
			)
			.toEqual(["verified", "verified"]);
		await expect.poll(() => notice.count()).toBe(0);
		expect(f.writes).toEqual(["commit", "inverse"]);
	},
);
