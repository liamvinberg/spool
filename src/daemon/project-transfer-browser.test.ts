import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { readRegistry } from "../registry";
import { testBrowser } from "../test-browser";
import { builtUi, makeTempDir, serveProject, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { createSettingsStore } from "./settings";

async function dropProject(page: Page, bytes: Buffer, names = ["project.spool"], selector = "body") {
	await page
		.locator(selector)
		.first()
		.evaluate(
			(element, input) => {
				const dataTransfer = new DataTransfer();
				for (const name of input.names) {
					dataTransfer.items.add(new File([Uint8Array.from(input.bytes)], name, { type: "application/zip" }));
				}
				element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
				element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
				element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
			},
			{ bytes: [...bytes], names },
		);
}

it("round-trips whole projects from Home and an inactive tab without replacing existing work", {
	timeout: 180_000,
}, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	const destination = realpathSync(makeTempDir());
	createSettingsStore(project.spoolDir).write("projects.location", destination);
	const files = {
		"shared/ui/title.tsx": "export function Title() { return <h1>Portable project</h1>; }\n",
		"shared/tokens.css": ":root { --portable: #234567; }\n",
		"shared/fonts.css": "/* Project fonts remain authored. */\n",
		"shared/assets/mark.svg":
			'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12"/></svg>\n',
		"shared/scenarios/default.json": '{"state":{"count":7}}\n',
		"frames/start/frame.json": '{"x":20,"y":30,"w":480,"h":320}\n',
		"frames/finish/frame.json": '{"x":560,"y":30,"w":480,"h":320}\n',
		"frames/details/extra/frame.json": '{"x":12,"y":24,"w":360,"h":240}\n',
	};
	for (const [path, content] of Object.entries(files)) writeDesignFile(project.root, path, content);
	writeFrame(
		project.root,
		"start",
		'import { Title } from "../../shared/ui/title"; export default function Start() { return <main><Title/><button data-go="finish">Continue</button></main>; }',
	);
	writeFrame(project.root, "finish", "export default function Finish() { return <h1>Finished the flow</h1>; }");
	writePageFrame(
		project.root,
		"details",
		"extra",
		"export default function Extra() { return <h1>Another page</h1>; }",
	);
	writeDesignFile(
		project.root,
		"canvas.json",
		JSON.stringify({ format: 1, history: true, order: { pages: ["details"], frames: { "": ["start", "finish"] } } }),
	);
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":40,"y":40,"k":1}}');
	writeDesignFile(project.root, ".spool/session-private.txt", "not portable");
	writeFileSync(join(project.root, ".env"), "PRIVATE=not-portable");
	mkdirSync(join(destination, project.name));
	writeFileSync(join(destination, project.name, "keep.txt"), "existing folder");
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, reducedMotion: "reduce" });
	await page.goto(project.url);
	await page.getByRole("button", { name: `Manage ${project.name}`, exact: true }).click();
	await page.getByText("Export project…", { exact: true }).click();
	const dialog = page.getByRole("dialog", { name: /^Export / });
	await dialog.waitFor();
	expect(await dialog.innerText()).toContain(project.name);
	const downloadEvent = page.waitForEvent("download");
	await dialog.getByRole("button", { name: /^Export/ }).click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe(`${project.name}.spool`);
	const downloadedPath = await download.path();
	if (downloadedPath === null) throw new Error("project archive download failed");
	const bytes = readFileSync(downloadedPath);
	expect(bytes.subarray(0, 2).toString()).toBe("PK");
	expect(await page.getByRole("dialog").count()).toBe(0);

	const picked = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: /^Import/ }).click();
	await (await picked).setFiles({ name: `${project.name}.spool`, mimeType: "application/zip", buffer: bytes });
	await expect.poll(() => readRegistry(project.spoolDir).projects.length).toBe(2);
	const imported = readRegistry(project.spoolDir).projects.find((entry) => entry.root !== project.root);
	if (!imported) throw new Error("import was not registered");
	await page.getByRole("button", { name: `Close ${basename(imported.root)}`, exact: true }).waitFor();
	expect(imported.root).not.toBe(join(destination, project.name));
	for (const [path, content] of Object.entries(files))
		expect(readFileSync(join(imported.root, "design", path), "utf8")).toBe(content);
	const canvas: unknown = JSON.parse(readFileSync(join(imported.root, "design/canvas.json"), "utf8"));
	expect(canvas).toMatchObject({ history: false, order: { pages: ["details"], frames: { "": ["start", "finish"] } } });
	expect(existsSync(join(imported.root, ".env"))).toBe(false);
	expect(existsSync(join(imported.root, "design/.spool/session-private.txt"))).toBe(false);
	expect(readFileSync(join(destination, project.name, "keep.txt"), "utf8")).toBe("existing folder");

	const played = await browser.newPage();
	await played.goto(`${project.url}/play/${encodeURIComponent(basename(imported.root))}?frame=start`);
	await played.frameLocator("iframe").getByRole("heading", { name: "Portable project" }).waitFor();
	await played.frameLocator("iframe").getByRole("button", { name: "Continue" }).click();
	await played.frameLocator("iframe").getByRole("heading", { name: "Finished the flow" }).waitFor();

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("button", { name: `Open ${project.name}`, exact: true }).click();
	const activeUrl = page.url();
	const inactive = page.locator(`[data-tab="${imported.root}"]`);
	await inactive.click({ button: "right" });
	expect(page.url()).toBe(activeUrl);
	await page.getByRole("menuitem", { name: /^Export / }).click();
	expect(await dialog.innerText()).toContain(basename(imported.root));
	const secondDownload = page.waitForEvent("download");
	await dialog.getByRole("button", { name: /^Export/ }).click();
	expect((await secondDownload).suggestedFilename()).toBe(`${basename(imported.root)}.spool`);
	expect(page.url()).toBe(activeUrl);
	await inactive.locator(".project-tab-label").focus();
	await page.keyboard.press("Shift+F10");
	await page.getByRole("menuitem", { name: "Close tab", exact: true }).waitFor();
	await page.keyboard.press("Escape");
	expect(await inactive.locator(".project-tab-label").evaluate((element) => element === document.activeElement)).toBe(
		true,
	);
	await inactive.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Close tab", exact: true }).click();
	expect(readRegistry(project.spoolDir).projects.some((entry) => entry.root === imported.root)).toBe(true);

	await dropProject(page, bytes, ["again.spool"], ".project-tab-label");
	await expect.poll(() => readRegistry(project.spoolDir).projects.length).toBe(3);
	const again = readRegistry(project.spoolDir).projects.find(
		(entry) => entry.root !== project.root && entry.root !== imported.root,
	);
	if (!again) throw new Error("second import was not registered");
	await page.getByRole("button", { name: `Close ${basename(again.root)}`, exact: true }).waitFor();
	expect(again.root).not.toBe(imported.root);
	await page.reload();
	await page.getByRole("button", { name: `Close ${basename(again.root)}`, exact: true }).waitFor();
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("button", { name: `Open ${basename(imported.root)}`, exact: true }).waitFor();
	await dropProject(page, bytes, ["one.spool", "two.spool"]);
	await expect.poll(() => page.locator("body").innerText()).toMatch(/one project file/i);
	expect(readRegistry(project.spoolDir).projects.length).toBe(3);
	await dropProject(page, Buffer.from("invalid archive"));
	await expect.poll(() => page.locator("body").innerText()).toMatch(/invalid|archive|unsupported/i);
	expect(readRegistry(project.spoolDir).projects.length).toBe(3);
});

it("cancels a slow import cleanly and retries after invalid input and a write failure", {
	timeout: 120_000,
}, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	const parent = realpathSync(makeTempDir());
	const store = createSettingsStore(project.spoolDir);
	store.write("projects.location", parent);
	writeFrame(project.root, "start", "export default function Start() { return <h1>Retry works</h1>; }");
	const response = await fetch(`${project.url}/api/projects/export`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ root: project.root }),
	});
	expect(response.ok).toBe(true);
	const bytes = Buffer.from(await response.arrayBuffer());
	const browser = await testBrowser();
	const page = await browser.newPage({ reducedMotion: "reduce" });
	await page.goto(project.url);
	let release: (() => void) | undefined;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/projects/import?*", async (route) => {
		await held;
		await route.continue();
	});
	await dropProject(page, bytes);
	await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
	const cancelled = page.waitForResponse((res) => res.url().endsWith("/api/projects/transfer/cancel"));
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await cancelled).ok()).toBe(true);
	release?.();
	await expect.poll(() => page.locator("body").innerText()).toMatch(/cancelled/i);
	expect(readRegistry(project.spoolDir).projects.length).toBe(1);
	expect(existsSync(join(parent, project.name))).toBe(false);
	await page.unroute("**/api/projects/import?*");

	const unavailable = join(parent, "not-a-directory");
	store.write("projects.location", unavailable);
	writeFileSync(unavailable, "keep");
	await dropProject(page, bytes);
	await expect.poll(() => page.locator("body").innerText()).toMatch(/could not|unable|failed|directory|ENOTDIR/i);
	expect(readRegistry(project.spoolDir).projects.length).toBe(1);
	expect(readFileSync(unavailable, "utf8")).toBe("keep");
	store.write("projects.location", parent);
	await dropProject(page, Buffer.from("broken"));
	await expect.poll(() => page.locator("body").innerText()).toMatch(/invalid|archive|unsupported/i);
	expect(readRegistry(project.spoolDir).projects.length).toBe(1);
	await dropProject(page, bytes);
	await expect.poll(() => readRegistry(project.spoolDir).projects.length).toBe(2);
	const imported = readRegistry(project.spoolDir).projects.find((entry) => entry.root !== project.root);
	if (!imported) throw new Error("retry did not install a project");
	await page.getByRole("button", { name: `Close ${basename(imported.root)}`, exact: true }).waitFor();
});

it("accepts a real file drag over a live frame and leaves image drags alone", { timeout: 120_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	const destination = realpathSync(makeTempDir());
	createSettingsStore(project.spoolDir).write("projects.location", destination);
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <main style={{height:"100%"}}>A live frame</main>; }',
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{"x":0,"y":0,"w":480,"h":320}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	const response = await fetch(`${project.url}/api/projects/export`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ root: project.root }),
	});
	expect(response.ok).toBe(true);
	const archive = join(makeTempDir(), "live.spool");
	writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, reducedMotion: "reduce" });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.frameLocator('iframe[title="start"]').getByText("A live frame").waitFor();
	await page.locator('[data-frame-label="start"]').click();
	await page.keyboard.press("Enter");
	const iframe = page.locator('iframe[title="start"]');
	await expect.poll(() => iframe.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");
	const rect = await iframe.boundingBox();
	if (!rect) throw new Error("live frame has no bounds");
	const cdp = await page.context().newCDPSession(page);
	const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	const data = { items: [], files: [archive], dragOperationsMask: 1 };
	await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...point, data });
	await cdp.send("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
	await expect.poll(() => page.locator("body").innerText()).toMatch(/drop.*project/i);
	await cdp.send("Input.dispatchDragEvent", { type: "drop", ...point, data });
	await expect.poll(() => readRegistry(project.spoolDir).projects.length).toBe(2);
	const imported = readRegistry(project.spoolDir).projects.find((entry) => entry.root !== project.root);
	if (!imported) throw new Error("live frame drop did not import");
	await page.getByRole("button", { name: `Close ${basename(imported.root)}`, exact: true }).waitFor();
	await page.evaluate(() => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(new File(["image"], "photo.png", { type: "image/png" }));
		const enter = new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer });
		const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer });
		document.body.dispatchEvent(enter);
		document.body.dispatchEvent(over);
		if (enter.defaultPrevented || over.defaultPrevented) throw new Error("Project import intercepted an image drag");
		document.body.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer }));
	});
	expect(readRegistry(project.spoolDir).projects.length).toBe(2);
	await cdp.detach();
});
