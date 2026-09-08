import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { originCanvas } from "./hand-origin-browser-helpers";

it("transports a pending structural delete and its history across an acknowledged SDK prefix edit", {
	timeout: 120_000,
}, async () => {
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
	const f = await originCanvas({}, source, '[data-name="A"]', false, undefined, [
		createSpoolEngine(directory, client),
	]);
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
	const survivor = f.frame.locator('[data-name="B"]');
	await survivor.evaluate((element) => {
		Reflect.set(window, "structuralSurvivor", element);
		(element as HTMLElement).click();
	});
	await expect.poll(() => survivor.textContent()).toBe("B:1");
	let releaseCommit = () => {};
	const heldCommit = new Promise<void>((resolve) => {
		releaseCommit = resolve;
	});
	onTestFinished(() => releaseCommit());
	let commitArrived = false;
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action === "commit") {
			commitArrived = true;
			await heldCommit;
		}
		await route.continue();
	});
	const delivered = () =>
		f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
	await f.select();
	const saved = delivered();
	void saved.catch(() => {});
	await f.page.keyboard.press("Backspace");
	await expect.poll(() => commitArrived).toBe(true);
	const prefix = "// independent SDK prefix\n";
	const path = f.file("frames/home/frame.tsx");
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
						{ name: "edit", arguments: { path, edits: [{ oldText: "import", newText: `${prefix}import` }] } },
					])}`,
					selection: [],
				},
			],
		}),
	});
	expect(response.ok).toBe(true);
	await response.text();
	expect(acknowledged).toContain("read-complete");
	expect(acknowledged).toContain("acknowledge");
	expect(readFileSync(path, "utf8")).toBe(prefix + source);
	releaseCommit();
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
		const inverse = delivered();
		await f.history(redo);
		await inverse;
		await checked(!redo);
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});
