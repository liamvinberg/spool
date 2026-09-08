import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { originCanvas } from "./hand-origin-browser-helpers";

const owner = "shared/label.tsx";
const source = 'export function Label(){return <h1 id="label" className="opacity-75">Hello</h1>}';
const app =
	'import {Label} from "shared/label";export default function Frame(){return <main style={{padding:40}}><Label/><input id="draft" defaultValue="initial"/></main>}';

async function fixture(labelSource = source, shared = false) {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			cwd: state,
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		children.push(child);
		return child;
	});
	onTestFinished(async () => {
		for (const child of children)
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				child.kill();
				await exited;
			}
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const f = await originCanvas({ [owner]: labelSource }, app, "#label", shared, undefined, [
		createSpoolEngine(directory, client),
	]);
	const callsFile = join(directory, "provider-calls.jsonl");
	const calls = () => (existsSync(callsFile) ? readFileSync(callsFile, "utf8") : "");
	const agentEdit = async (oldText: string, newText: string) => {
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
			method: "POST",
			headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
			body: JSON.stringify({
				engine: "spool",
				thread: randomUUID(),
				said: [
					{
						selection: [],
						prompt: `file tools: ${JSON.stringify([
							{ name: "read", arguments: { path: f.file(owner) } },
							{ name: "edit", arguments: { path: f.file(owner), edits: [{ oldText, newText }] } },
						])}`,
					},
				],
			}),
		});
		expect(response.ok).toBe(true);
		await response.text();
	};
	const reply = (action: string) =>
		f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
		);
	const notice = f.page.locator("[data-properties-rail] [data-hand-notice]");
	const field = f.page.locator('[data-properties-row="opacity"] input').first();
	const composer = f.page.locator("[data-agent-rail] textarea");
	const opacity = () => f.target.evaluate((element) => getComputedStyle(element).opacity);
	return { ...f, calls, agentEdit, reply, notice, field, composer, opacity };
}

async function conflict(f: Awaited<ReturnType<typeof fixture>>, current = "opacity-25") {
	await f.select();
	await f.field.fill("50");
	await expect.poll(f.opacity).toBe("0.5");
	await f.agentEdit("opacity-75", current);
	const refused = f.reply("commit");
	await f.field.press("Enter");
	expect(await (await refused).json()).toMatchObject({
		ok: false,
		current: { kind: "property", value: { kind: "binding", tokens: [current] } },
	});
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	expect(await f.notice.textContent()).toContain(current);
	expect(readFileSync(f.file(owner), "utf8")).toBe(source.replace("opacity-75", current));
	await expect.poll(f.opacity).toBe("0.75");
}

it("retries the original property after a real competing edit and undoes to checked current source", {
	timeout: 180000,
}, async () => {
	const f = await fixture();
	await f.frame.locator("#draft").fill("retained state");
	const native = await f.frame.locator("#draft").elementHandle();
	await conflict(f);
	const calls = f.calls();
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("opacity-50");
	expect(await f.composer.inputValue()).toContain("Target: home, #label");
	expect(f.calls()).toBe(calls);
	await f.page.locator('[data-dock-glyph="properties"]').click();
	const retry = f.notice.getByRole("button", { name: "Retry this edit", exact: true });
	await expect.poll(() => retry.count()).toBe(1);
	const reading = f.page.waitForResponse((response) => {
		if (!response.url().endsWith("/source")) return false;
		const request = response.request().postDataJSON();
		return request?.action === "read" && request.retry && request.operation?.kind === "property";
	});
	const saved = f.reply("commit"),
		delivered = f.reply("delivered");
	await retry.click();
	expect(await (await reading).json()).toMatchObject({
		ok: true,
		read: { operation: { kind: "property", property: "opacity", scope: "" }, value: "opacity-25" },
	});
	const result = await (await saved).json();
	expect(result).toMatchObject({
		ok: true,
		source: "saved",
		publication: { receipt: { operation: { kind: "property", property: "opacity", scope: "" } } },
	});
	expect((await delivered).ok()).toBe(true);
	await expect.poll(f.opacity).toBe("0.5");
	expect(readFileSync(f.file(owner), "utf8")).toBe(source.replace("opacity-75", "opacity-50"));
	expect(f.writes).toEqual(["commit", "commit"]);
	expect(await f.frame.locator("#draft").evaluate((element, original) => element === original, native)).toBe(true);
	expect(await f.frame.locator("#draft").inputValue()).toBe("retained state");
	const inverse = f.reply("inverse"),
		undone = f.reply("delivered");
	await f.history();
	expect(await (await inverse).json()).toMatchObject({ ok: true, source: "saved" });
	expect((await undone).ok()).toBe(true);
	await expect.poll(f.opacity).toBe("0.25");
	expect(readFileSync(f.file(owner), "utf8")).toBe(source.replace("opacity-75", "opacity-25"));
	expect(f.writes).toEqual(["commit", "commit", "inverse"]);
	expect(f.calls()).toBe(calls);
});

it("refuses a property retry when another original ancestry input changes after its fresh read", {
	timeout: 180000,
}, async () => {
	const f = await fixture();
	await conflict(f);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let observed = () => {};
	const reading = new Promise<void>((resolve) => {
		observed = resolve;
	});
	onTestFinished(release);
	await f.page.route("**/source", async (route) => {
		const request = route.request().postDataJSON();
		if (request?.action !== "read" || !request.retry) return route.continue();
		const response = await route.fetch();
		expect(await response.json()).toMatchObject({ ok: true, read: { value: "opacity-25" } });
		observed();
		await held;
		await route.fulfill({ response });
	});
	await f.notice.getByRole("button", { name: "Retry this edit", exact: true }).click();
	await reading;
	await f.agentEdit("Hello", "Changed ancestry input");
	const refused = f.reply("commit");
	release();
	expect(await (await refused).json()).toMatchObject({
		ok: false,
		reason: expect.stringMatching(/ancestry|original|context/i),
	});
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	expect(readFileSync(f.file(owner), "utf8")).toBe(
		source.replace("opacity-75", "opacity-25").replace("Hello", "Changed ancestry input"),
	);
	await expect.poll(f.opacity).toBe("0.75");
	expect(f.writes).toEqual(["commit", "commit"]);
});

it("checks an unknown property save without replay or invented history", { timeout: 180000 }, async () => {
	const f = await fixture();
	let acknowledged: unknown;
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action !== "commit") return route.continue();
		const response = await route.fetch();
		acknowledged = await response.json();
		await route.abort("failed");
	});
	await f.select();
	await f.field.fill("50");
	await expect.poll(f.opacity).toBe("0.5");
	const failed = f.page.waitForEvent(
		"requestfailed",
		(request) => request.url().endsWith("/source") && request.postDataJSON()?.action === "commit",
	);
	await f.field.press("Enter");
	await failed;
	expect(acknowledged).toMatchObject({ ok: true, source: "saved" });
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("unknown");
	expect(readFileSync(f.file(owner), "utf8")).toBe(source.replace("opacity-75", "opacity-50"));
	await expect.poll(f.opacity).toBe("0.75");
	expect(f.writes).toEqual(["commit"]);
	expect(await f.notice.getByRole("button", { name: "Retry this edit", exact: true }).count()).toBe(0);
	const check = f.notice.getByRole("button", { name: "Check current source", exact: true });
	await expect.poll(() => check.count()).toBe(1);
	await check.click();
	await expect.poll(() => f.notice.textContent()).toContain("Current source says");
	expect(await f.notice.textContent()).toContain("opacity-50");
	expect(await f.notice.getAttribute("data-hand-notice")).toBe("unknown");
	expect(f.writes).toEqual(["commit"]);
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("opacity-50");
	expect(await f.composer.inputValue()).toContain("Target: home, #label");
	expect(f.calls()).toBe("");
	await f.history();
	await f.page.keyboard.press("Tab");
	expect(f.writes).toEqual(["commit"]);
});

it("does not claim property success or create Undo for unchanged source with a different native result", {
	timeout: 180000,
}, async () => {
	const f = await fixture();
	await f.frame.locator("#draft").fill("kept through no-op");
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action !== "commit") return route.continue();
		const response = await route.fetch();
		await f.target.evaluate((element) => {
			element.style.opacity = "0.25";
		});
		await route.fulfill({ response });
	});
	await f.select();
	// A changed text draft normalizes to the same authored numeric token.
	await f.field.fill("75 ");
	const reply = f.reply("commit");
	await f.field.press("Enter");
	const result = await (await reply).json();
	expect(result).toMatchObject({ ok: true, source: "unchanged", publication: null });
	expect(result).not.toHaveProperty("receipt");
	await expect.poll(() => f.notice.textContent()).toContain("No new edit was saved");
	expect(await f.notice.getAttribute("data-hand-notice")).toBe("unverified");
	expect(readFileSync(f.file(owner), "utf8")).toBe(source);
	expect(await f.opacity()).toBe("0.25");
	expect(await f.frame.locator("#draft").inputValue()).toBe("kept through no-op");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("opacity-75");
	expect(f.calls()).toBe("");
	await f.history();
	await f.page.keyboard.press("Tab");
	expect(f.writes).toEqual(["commit"]);
});

const mutable = `import {useRef,useLayoutEffect} from 'react';export function Label(){const ref=useRef(null);useLayoutEffect(()=>{if(window.propertyCorrupt)ref.current.style.opacity=window.propertyCorrupt});return <h1 ref={ref} id="label" className="opacity-75">Hello</h1>}`;

it.each([false, true])(
	"retires shared property recovery only after every affected use shows its saved expectation (inverse: %s)",
	{ timeout: 180000 },
	async (inverse) => {
		const f = await fixture(mutable, true);
		const second = f.page.frameLocator('iframe[title="second"]');
		for (const frame of [f.frame, second])
			await frame.locator("#draft").evaluate((element) => {
				if (!(element instanceof HTMLInputElement)) throw new Error("missing native input");
				element.value = "dirty input";
				element.setSelectionRange(2, 5);
				Reflect.set(window, "propertyNativeInput", element);
			});
		if (!inverse) await second.locator("#label").evaluate(() => Reflect.set(window, "propertyCorrupt", "0.75"));
		await f.select();
		await f.field.fill("50");
		const saved = f.reply("commit"),
			delivered = f.reply("delivered");
		await f.field.press("Enter");
		const result = await (await saved).json();
		expect(result).toMatchObject({
			ok: true,
			source: "saved",
			publication: { expected: { kind: "property", property: "opacity", className: "opacity-50" } },
		});
		expect((await delivered).ok()).toBe(true);
		await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").length)).toBe(2);
		if (inverse) {
			expect(
				await f.page.evaluate(() =>
					Reflect.get(window, "originOutcomes").map((outcome: { rendered: string }) => outcome.rendered),
				),
			).toEqual(["verified", "verified"]);
			await second.locator("#label").evaluate(() => Reflect.set(window, "propertyCorrupt", "0.5"));
			const undone = f.reply("inverse"),
				installed = f.reply("delivered");
			await f.history();
			expect(await (await undone).json()).toMatchObject({
				ok: true,
				source: "saved",
				publication: { expected: { kind: "property", property: "opacity", className: "opacity-75" } },
			});
			expect((await installed).ok()).toBe(true);
			await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "originOutcomes").length)).toBe(4);
		}
		const desired = inverse ? "0.75" : "0.5",
			other = inverse ? "0.5" : "0.75";
		expect(
			await f.page.evaluate(() =>
				Reflect.get(window, "originOutcomes")
					.slice(-2)
					.map((outcome: { rendered: string }) => outcome.rendered)
					.sort(),
			),
		).toEqual(["mismatching", "verified"]);
		await expect.poll(f.opacity).toBe(desired);
		expect(await second.locator("#label").evaluate((element) => getComputedStyle(element).opacity)).toBe(other);
		for (const frame of [f.frame, second])
			expect(
				await frame.locator("#draft").evaluate((element) => {
					if (!(element instanceof HTMLInputElement)) throw new Error("missing input");
					return [
						element === Reflect.get(window, "propertyNativeInput"),
						element.value,
						element.selectionStart,
						element.selectionEnd,
					];
				}),
			).toEqual([true, "dirty input", 2, 5]);
		const bytes = inverse ? mutable : mutable.replace("opacity-75", "opacity-50");
		expect(readFileSync(f.file(owner), "utf8")).toBe(bytes);
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
		await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		await expect.poll(() => f.composer.inputValue()).toContain("Property: opacity.");
		expect(await f.composer.inputValue()).toContain("Target: home, #label");
		expect(f.calls()).toBe("");
		expect(f.writes).toEqual(inverse ? ["commit", "inverse"] : ["commit"]);
		if (inverse)
			expect(
				(await f.composer.inputValue()).split("\n").find((line) => line.startsWith("Requested result:")) ?? "",
			).toContain("opacity-75");
		const prepared = await f.composer.inputValue();
		await f.page.locator('[data-dock-glyph="properties"]').click();
		await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
		await expect.poll(() => f.frame.locator("#draft").inputValue()).toBe("initial");
		await expect.poll(f.opacity).toBe(desired);
		expect(await second.locator("#draft").inputValue()).toBe("dirty input");
		expect(await second.locator("#label").evaluate((element) => getComputedStyle(element).opacity)).toBe(other);
		expect(await f.notice.count()).toBe(1);
		await f.page.locator('[data-dock-glyph="agent"]').click();
		expect(await f.composer.inputValue()).toBe(prepared);
		const secondElement = await f.page.locator('iframe[title="second"]').elementHandle();
		const document = await secondElement?.contentFrame();
		if (!document) throw new Error("missing second frame");
		const navigated = f.page.waitForEvent("framenavigated", (frame) => frame === document);
		await second.locator("#label").evaluate(() => location.reload());
		await navigated;
		await expect
			.poll(() => second.locator("#label").evaluate((element) => getComputedStyle(element).opacity))
			.toBe(desired);
		await f.page.locator('[data-dock-glyph="properties"]').click();
		await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
		await expect.poll(() => f.notice.count()).toBe(0);
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await expect.poll(() => f.composer.inputValue()).toBe("");
		expect(f.calls()).toBe("");
		expect(f.writes).toEqual(inverse ? ["commit", "inverse"] : ["commit"]);
		expect(readFileSync(f.file(owner), "utf8")).toBe(bytes);
	},
);
