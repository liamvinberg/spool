import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";

const BEFORE = `export default function Home() {
 return <main>
  <h1 id="title">Original title</h1>
  <p id="body">Original body</p>
 </main>;
}`;

it("runs file tools through the real host and served canvas, maps every changed element and asks compactly outside design", {
	timeout: 180_000,
}, async () => {
	const directory = join(makeTempDir(), "bundled");
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
		await Promise.all(
			children
				.filter((child) => child.exitCode === null && child.signalCode === null)
				.map(async (child) => {
					const exited = once(child, "exit");
					child.kill();
					await exited;
				}),
		);
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", BEFORE);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":600,"h":400}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	symlinkSync(join(directory, "credentials.json"), join(project.root, "AGENTS.md"));
	const control = join(directory, "../daemon.json");
	writeFileSync(control, "private-control-fixture");
	rmSync(join(project.root, "design/AGENTS.md"));
	symlinkSync(control, join(project.root, "design/AGENTS.md"));
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	const shots = process.env.SPOOL_TEST_SHOTS;
	const shot = async (name: string) => {
		if (shots) {
			mkdirSync(shots, { recursive: true });
			await page.screenshot({
				path: join(shots, `${name}.png`),
				animations: name === "access-design-quiet" ? "allow" : "disabled",
			});
		}
	};
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect
		.poll(() => page.frameLocator('iframe[title="home"]').locator("#title").textContent(), { timeout: 30_000 })
		.toBe("Original title");
	await page.locator('[data-dock-glyph="agent"]').click();
	const field = page.locator("[data-agent-rail] textarea");
	const send = async (calls: { name: string; arguments: Record<string, unknown> }[]) => {
		await field.fill(`file tools: ${JSON.stringify(calls)}`);
		await field.press("Enter");
	};
	const write = (path: string, content = "written") => ({ name: "write", arguments: { path, content } });
	const settled = async () => {
		await expect.poll(() => page.getByRole("button", { name: /stop.*⎋/ }).count()).toBe(0);
	};
	await send([
		{ name: "read", arguments: { path: "design/frames/home/frame.tsx" } },
		{
			name: "edit",
			arguments: {
				path: "design/frames/home/frame.tsx",
				edits: [
					{ oldText: '<h1 id="title">Original title</h1>', newText: '<h1 id="title">Updated title</h1>' },
					{ oldText: '<p id="body">Original body</p>', newText: '<p id="body">Updated body</p>' },
				],
			},
		},
	]);
	const plates = page.locator('[data-hand-plate="home"]');
	await expect.poll(() => plates.count(), { timeout: 30_000, interval: 20 }).toBe(2);
	const boxes = await plates.evaluateAll((elements) =>
		elements.map((element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		}),
	);
	for (const id of ["title", "body"]) {
		const element = page.frameLocator('iframe[title="home"]').locator(`#${id}`);
		const box = await element.boundingBox();
		expect(box).not.toBeNull();
		expect(
			boxes.some((mark) => Math.abs(mark.y + mark.height / 2 - ((box?.y ?? 0) + (box?.height ?? 0) / 2)) < 2),
		).toBe(true);
	}
	expect(await page.frameLocator('iframe[title="home"]').locator("#body").textContent()).toBe("Updated body");
	await expect.poll(() => page.locator('[data-frame-cover="home"], iframe[title="home (held)"]').count()).toBe(0);
	await shot("access-design-quiet");
	await settled();
	expect(await page.locator("[data-agent-ask]").count()).toBe(0);
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8");
	expect(calls).not.toContain("fixture-key");
	expect(calls).not.toContain("private-control-fixture");
	await send([
		write("design/frames/created/frame.json", '{"x":700,"y":0,"w":600,"h":400}'),
		write("design/frames/created/frame.tsx", "export default () => <h1>Created live</h1>"),
	]);
	await expect.poll(() => existsSync(join(project.root, "design/frames/created/frame.tsx"))).toBe(true);
	await settled();
	expect(await page.locator("[data-agent-ask]").count()).toBe(0);
	await page.locator('[data-agent-jump="created"]').click();
	await expect
		.poll(() => page.frameLocator('iframe[title="created"]').locator("h1").textContent(), { timeout: 30_000 })
		.toBe("Created live");
	await page.locator('[data-agent-jump="home"]').last().click();
	await send([write("src/ui/receipt.css")]);
	const open = page.locator('[data-agent-ask="open"]');
	await open.waitFor();
	expect(await open.textContent()).toContain("Allow edits in src/ui/?");
	const onceButton = open.getByRole("button", { name: "allow once", exact: true });
	const buttonTops = await open
		.locator("[data-agent-option]")
		.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
	expect(new Set(buttonTops).size).toBe(1);
	await shot("access-row");
	await open.getByRole("button", { name: "change permissions…" }).click();
	expect(existsSync(join(project.root, "src/ui/receipt.css"))).toBe(false);
	await page.keyboard.press("Escape");
	await onceButton.click();
	await settled();
	await shot("access-result-once");
	expect(await page.locator("[data-agent-rail]").textContent()).toContain("allowed once");
	await send([write("src/ui/second.css")]);
	await open.waitFor();
	await open.getByRole("button", { name: "for this thread", exact: true }).click();
	await settled();
	await shot("access-result-granted");
	expect(await page.locator("[data-agent-rail]").textContent()).toContain("edits in src/ui/ allowed for this thread");
	await send([write("src/ui/quiet.css"), write("other/denied")]);
	await open.waitFor();
	expect(existsSync(join(project.root, "src/ui/quiet.css"))).toBe(true);
	await open.getByRole("button", { name: "deny", exact: true }).click();
	await settled();
	expect(existsSync(join(project.root, "other/denied"))).toBe(false);
	await shot("access-result-denied");
	await send([write("other/stopped")]);
	await open.waitFor();
	await page.getByRole("button", { name: /stop.*⎋/ }).click();
	await settled();
	expect(await open.count()).toBe(0);
	expect(existsSync(join(project.root, "other/stopped"))).toBe(false);
	const child = children.at(-1);
	if (!child) throw new Error("Missing host");
	const exited = once(child, "exit");
	child.kill("SIGKILL");
	await exited;
	await send([write("src/ui/restarted.css")]);
	await open.waitFor();
	await open.getByRole("button", { name: "deny", exact: true }).click();
	await settled();
	expect(children).toHaveLength(2);
	expect(existsSync(join(project.root, "src/ui/restarted.css"))).toBe(false);
	for (const mode of ["edits", "bypass"] as const) {
		const changed = await fetch(`${project.url}/api/settings`, {
			method: "PUT",
			headers: { "Content-Type": "application/json", "X-Spool-Control": project.controlToken },
			body: JSON.stringify({ key: "agent.permissions", value: mode, project: project.name }),
		});
		expect(changed.ok).toBe(true);
		await send([write(`outside-${mode}`)]);
		await expect.poll(() => existsSync(join(project.root, `outside-${mode}`))).toBe(true);
		await settled();
		expect(await open.count()).toBe(0);
	}
});
