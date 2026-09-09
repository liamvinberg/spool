import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { originCanvas } from "./hand-origin-browser-helpers";

async function structuralAgent(shared = false) {
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
	const removed = '<Counter key="a" name="A"/>';
	const source = `import {useState} from 'react';function Counter({name}){const [count,setCount]=useState(0);return <button data-name={name} onClick={()=>setCount(n=>n+1)}>{name}:{count}</button>}export default function Frame(){return <main style={{padding:40}}>${removed}<Counter key="b" name="B"/></main>}`;
	const f = await originCanvas(
		shared ? { "shared/structure.tsx": source } : {},
		shared ? 'import Shared from "../../shared/structure";export default function Frame(){return <Shared/>}' : source,
		'[data-name="A"]',
		shared,
		undefined,
		[createSpoolEngine(directory, client)],
	);
	const supervisor = client.source;
	if (!supervisor) throw new Error("daemon did not attach its source owner");
	const acknowledged: string[] = [];
	client.source = {
		open: (options, generation) => {
			const authority = supervisor.open(options, generation);
			return {
				revoke: () => authority.revoke(),
				request: async (request) => {
					const reply = await authority.request(request);
					acknowledged.push(request.kind);
					return reply;
				},
			};
		},
	};
	const path = f.file(shared ? "shared/structure.tsx" : "frames/home/frame.tsx");
	const edit = async (edits: { oldText: string; newText: string }[]) => {
		const before = acknowledged.length;
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
			method: "POST",
			headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
			body: JSON.stringify({
				engine: "spool",
				thread: randomUUID(),
				said: [
					{
						prompt: `file tools: ${JSON.stringify([
							{ name: "read", arguments: { path } },
							{ name: "edit", arguments: { path, edits } },
						])}`,
						selection: [],
					},
				],
			}),
		});
		expect(response.ok).toBe(true);
		await response.text();
		expect(acknowledged.slice(before)).toContain("read-complete");
		expect(acknowledged.slice(before)).toContain("acknowledge");
	};
	const delivered = () =>
		f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
	return { ...f, source, removed, path, edit, delivered };
}

async function holdCommit(f: Awaited<ReturnType<typeof structuralAgent>>) {
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	onTestFinished(() => release());
	let arrived = false;
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action === "commit") {
			arrived = true;
			await held;
		}
		await route.continue();
	});
	return { release, wait: () => expect.poll(() => arrived).toBe(true) };
}

it("transports a pending structural delete and its history across an acknowledged SDK prefix edit", {
	timeout: 120_000,
}, async () => {
	const f = await structuralAgent();
	const { source, removed, path } = f;
	const survivor = f.frame.locator('[data-name="B"]');
	await survivor.evaluate((element) => {
		Reflect.set(window, "structuralSurvivor", element);
		(element as HTMLElement).click();
	});
	await expect.poll(() => survivor.textContent()).toBe("B:1");
	const held = await holdCommit(f);
	await f.select();
	const saved = f.delivered();
	void saved.catch(() => {});
	await f.page.keyboard.press("Backspace");
	await held.wait();
	const prefix = "// independent SDK prefix\n";
	await f.edit([{ oldText: "import", newText: `${prefix}import` }]);
	expect(readFileSync(path, "utf8")).toBe(prefix + source);
	held.release();
	await saved;
	const checked = async (present: boolean) => {
		await f.settled();
		expect(readFileSync(path, "utf8")).toBe(prefix + (present ? source : source.replace(removed, "")));
		expect(await f.target.count()).toBe(present ? 1 : 0);
		expect(await survivor.textContent()).toBe("B:1");
		expect(await survivor.evaluate((element) => element === Reflect.get(window, "structuralSurvivor"))).toBe(true);
		const outcome = await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1));
		expect(outcome, JSON.stringify(outcome)).toMatchObject({ installation: "installed", rendered: "verified" });
	};
	await checked(false);
	for (const redo of [false, true]) {
		const inverse = f.delivered();
		await f.history(redo);
		await inverse;
		await checked(!redo);
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it.each([
	{
		name: "original parent",
		edits: [
			{ oldText: "<main ", newText: "<aside " },
			{ oldText: "</main>", newText: "</aside>" },
		],
	},
	{ name: "surviving executable payload", edits: [{ oldText: "n=>n+1", newText: "n=>n+2" }] },
])("refuses a pending delete after the SDK changes its $name", { timeout: 120_000 }, async ({ edits }) => {
	const f = await structuralAgent();
	const held = await holdCommit(f);
	await f.select();
	const committed = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	// This wait outlives the page when anything below it fails first, and a wait
	// nobody is left to read must not reject into the run after teardown.
	void committed.catch(() => {});
	await f.page.keyboard.press("Backspace");
	await held.wait();
	await f.edit(edits);
	const changed = edits.reduce((source, edit) => source.replace(edit.oldText, edit.newText), f.source);
	expect(readFileSync(f.path, "utf8")).toBe(changed);
	held.release();
	const result = await (await committed).json();
	expect(result, JSON.stringify(result)).toMatchObject({ ok: false });
	expect(result.reason).toBe("the source role or executable context changed before saving");
	expect(result.publication).toBeUndefined();
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
	expect(readFileSync(f.path, "utf8")).toBe(changed);
	expect(f.writes).toEqual(["commit"]);
	await f.page.getByRole("button", { name: "Dismiss notice", exact: true }).click();
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(0);
	expect(readFileSync(f.path, "utf8")).toBe(changed);
});

it.each([
	{
		name: "occupied original insertion position",
		edits: [{ oldText: '<Counter key="b"', newText: '<i key="occupied">Agent child</i><Counter key="b"' }],
	},
	{ name: "changed component payload", edits: [{ oldText: "n=>n+1", newText: "n=>n+2" }] },
])(
	"refuses structural Undo after an acknowledged SDK edit leaves an $name",
	{ timeout: 120_000 },
	async ({ edits }) => {
		const f = await structuralAgent();
		await f.select();
		const saved = f.delivered();
		await f.page.keyboard.press("Backspace");
		await saved;
		await f.settled();
		const deleted = f.source.replace(f.removed, "");
		expect(readFileSync(f.path, "utf8")).toBe(deleted);
		await f.edit(edits);
		const changed = edits.reduce((source, edit) => source.replace(edit.oldText, edit.newText), deleted);
		expect(readFileSync(f.path, "utf8")).toBe(changed);
		const inverse = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history();
		const result = await (await inverse).json();
		expect(result, JSON.stringify(result)).toMatchObject({ ok: false });
		expect(result.publication).toBeUndefined();
		const notice = f.page.locator('[data-hand-notice="blocked"]');
		await expect.poll(() => notice.count()).toBe(1);
		expect(readFileSync(f.path, "utf8")).toBe(changed);
		expect(f.writes).toEqual(["commit", "inverse"]);
		const sends: string[] = [];
		f.page.on("request", (request) => {
			if (request.url().endsWith("/agent/turn")) sends.push(request.url());
		});
		await notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		const composer = f.page.locator("[data-agent-rail] textarea");
		await expect.poll(() => composer.inputValue()).toContain("undo delete this element");
		expect(await composer.inputValue()).toContain("frames/home/frame.tsx");
		expect(await composer.inputValue()).toContain(result.reason);
		expect(sends).toEqual([]);
		expect(readFileSync(f.path, "utf8")).toBe(changed);
	},
);

it("retains every shared use when an acknowledged prefix precedes reach in a newer mounted publication", {
	timeout: 120_000,
}, async () => {
	const f = await structuralAgent(true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => second.locator('[data-name="A"]').count()).toBe(1);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	onTestFinished(() => release());
	let readCompleted = false;
	let originalPublication = "";
	await f.page.route("**/source", async (route) => {
		const request = route.request().postDataJSON();
		if (request?.action === "read" && request.operation?.kind === "delete") {
			const response = await route.fetch();
			const result = await response.json();
			expect(result).toMatchObject({ ok: true });
			originalPublication = result.read.original.publication;
			readCompleted = true;
			await held;
			await route.fulfill({ response });
			return;
		}
		await route.continue();
	});
	await f.select();
	await f.page.keyboard.press("Backspace");
	await expect.poll(() => readCompleted).toBe(true);
	const prefix = "// acknowledged prefix before structural reach\n";
	await f.edit([{ oldText: "import", newText: `${prefix}import` }]);
	expect(readFileSync(f.path, "utf8")).toBe(prefix + f.source);
	await expect.poll(() => second.locator('[data-name="A"]').count()).toBe(1);
	const secondElement = await f.page.locator('iframe[title="second"]').elementHandle();
	const secondDocument = await secondElement?.contentFrame();
	if (!secondDocument) throw new Error("the actual second frame is missing");
	const reloaded = f.page.waitForEvent("framenavigated", (frame) => frame === secondDocument);
	await second.locator('[data-name="A"]').evaluate(() => location.reload());
	await reloaded;
	await expect.poll(() => second.locator('[data-name="A"]').count()).toBe(1);
	const reached = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "reach",
	);
	const delivered = f.delivered();
	void delivered.catch(() => {});
	release();
	const reachResponse = await reached;
	const inventories = reachResponse.request().postDataJSON().inventories;
	expect(inventories.find((inventory: { frame: string }) => inventory.frame === "home").publication).toBe(
		originalPublication,
	);
	expect(inventories.find((inventory: { frame: string }) => inventory.frame === "second").publication).not.toBe(
		originalPublication,
	);
	const reach = await reachResponse.json();
	expect(reach).toMatchObject({ ok: true });
	expect(reach.read.reach.uses.map((use: { frame: string }) => use.frame).sort()).toEqual(["home", "second"]);
	await delivered;
	await f.settled();
	const outcomes = await f.page.evaluate(() => Reflect.get(window, "originOutcomes"));
	expect(outcomes, JSON.stringify(outcomes)).toHaveLength(2);
	for (const outcome of outcomes)
		expect(outcome, JSON.stringify(outcomes)).toMatchObject({ installation: "installed", rendered: "verified" });
	await expect.poll(() => f.target.count()).toBe(0);
	await expect.poll(() => second.locator('[data-name="A"]').count()).toBe(0);
	expect(readFileSync(f.path, "utf8")).toBe(prefix + f.source.replace(f.removed, ""));
});
