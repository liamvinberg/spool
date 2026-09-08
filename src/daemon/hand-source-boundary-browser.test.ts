import { readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult } from "../source-edit";
import { serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { originCanvas } from "./hand-origin-browser-helpers";

const owner = "frames/library/owner/frame.tsx";
const css = "frames/library/owner/owner.css";
const resource = "frames/library/owner/marker.svg";
const authored =
	'import "./owner.css";import marker from "./marker.svg";export function Label(){return <section><h1 id="label">Sibling before</h1><img src={marker} alt="marker"/></section>}export default function Owner(){return <Label/>}';
const consumer =
	'import "./consumer.css";import ownMarker from "./consumer.svg";import {Label} from "../library/owner/frame";export default function Frame(){return <main style={{padding:40}}><Label/><input id="draft" defaultValue="native"/><img id="consumer-resource" src={ownMarker}/></main>}';
const files = {
	"frames/home/consumer.css": "#consumer-resource{width:5px}",
	"frames/second/consumer.css": "#consumer-resource{width:5px}",
	"frames/home/consumer.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>',
	"frames/second/consumer.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>',
	[owner]: authored,
	[css]: "#label{color:rgb(0,100,120)}",
	[resource]:
		'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
};

async function saveSibling(beforeLoad?: (page: Page) => Promise<void>) {
	const f = await originCanvas(files, consumer, "#label", true, beforeLoad);
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("#label").waitFor();
	await f.frame.locator("#draft").fill("first independent");
	await second.locator("#draft").fill("second independent");
	const read = await f.edit();
	expect(read.source.startsWith(`${owner}:`)).toBe(true);
	expect(read.scope).toBe("definition");
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Sibling after");
	await f.page.keyboard.press("Enter");
	await expect
		.poll(() => readFileSync(f.file(owner), "utf8"))
		.toBe(authored.replace("Sibling before", "Sibling after"));
	await f.settled();
	expect(await f.page.evaluate(() => Reflect.get(window, "originOutcomes"))).toEqual([
		expect.objectContaining({ installation: "installed", rendered: "verified" }),
		expect.objectContaining({ installation: "installed", rendered: "verified" }),
	]);
	await expect.poll(() => second.locator("#label").textContent()).toBe("Sibling after");
	expect(readFileSync(f.file(css), "utf8")).toBe(files[css]);
	expect(readFileSync(f.file(resource), "utf8")).toBe(files[resource]);
	return { ...f, second };
}

async function inverseAfterConsumerLoss(f: Awaited<ReturnType<typeof saveSibling>>) {
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	await f.page.locator("[data-source-uses]").getByRole("button", { name: "owner not mounted ↗", exact: true }).click();
	const mounted = f.page.frameLocator('iframe[title="owner"]');
	await expect.poll(() => mounted.locator("#label").textContent()).toBe("Sibling after");
	expect(await f.page.locator('iframe[title="home"]').count()).toBe(0);
	rmSync(f.file("frames/home"), { recursive: true });
	for (const redo of [false, true]) {
		await f.page.mouse.click(5, 5);
		await f.page.keyboard.press(redo ? "ControlOrMeta+Shift+z" : "ControlOrMeta+z");
		await expect
			.poll(() => readFileSync(f.file(owner), "utf8"))
			.toBe(redo ? authored.replace("Sibling before", "Sibling after") : authored);
		await expect.poll(() => mounted.locator("#label").textContent()).toBe(redo ? "Sibling after" : "Sibling before");
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		expect(await mounted.locator("#label").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 100, 120)");
		expect(
			await mounted
				.locator("img")
				.evaluate((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth),
		).toBe(8);
		expect(readFileSync(f.file(css), "utf8")).toBe(files[css]);
		expect(readFileSync(f.file(resource), "utf8")).toBe(files[resource]);
	}
}

it("keeps sibling-owned source, CSS and resources through inverse after deleting its initiating consumer", {
	timeout: 120000,
}, async () => {
	await inverseAfterConsumerLoss(await saveSibling());
});

async function holdSavedInspection(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window !== window.top) return;
		const replies = new Set<string>();
		Reflect.set(window, "savedInspectionReplies", replies);
		let held = false;
		const hold = (event: MessageEvent) => {
			const data = event.data;
			if (
				data?.spool !== "source-reply" ||
				data.frame !== "home" ||
				data.result?.value !== "Sibling after" ||
				!data.result?.publication
			)
				return;
			replies.add(data.id);
			if (held) return;
			held = true;
			event.stopImmediatePropagation();
			Reflect.set(window, "releaseSavedInspection", () => {
				window.dispatchEvent(new MessageEvent("message", { data, origin: event.origin, source: event.source }));
			});
		};
		window.addEventListener("message", hold, true);
	});
}

async function waitForExpiredInspection(f: Awaited<ReturnType<typeof saveSibling>>) {
	await f.page.waitForFunction(() => typeof Reflect.get(window, "releaseSavedInspection") === "function");
	// The real request's unchanged deadline expires before its held native reply.
	await f.page.locator("[data-source-ownership]").waitFor({ state: "detached" });
}

async function releaseSavedInspection(page: Page) {
	await page.evaluate(() => {
		const release = Reflect.get(window, "releaseSavedInspection");
		if (typeof release !== "function") throw new Error("the saved inspection reply was not held");
		release();
	});
}

it("refreshes late source disclosure before sibling-owned inverse after consumer loss", {
	timeout: 120000,
}, async () => {
	const f = await saveSibling(holdSavedInspection);
	await waitForExpiredInspection(f);
	await releaseSavedInspection(f.page);
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).waitFor();
	expect(await f.page.evaluate(() => Reflect.get(window, "savedInspectionReplies").size)).toBeGreaterThan(1);
	await inverseAfterConsumerLoss(f);
});

it("retires a delayed source disclosure when its selection leaves", { timeout: 120000 }, async () => {
	let descriptions = 0;
	const f = await saveSibling(async (page) => {
		await holdSavedInspection(page);
		page.on("request", (request) => {
			if (request.url().endsWith("/source") && request.postDataJSON()?.action === "describe") descriptions++;
		});
	});
	await waitForExpiredInspection(f);
	await f.page.mouse.click(800, 700);
	await expect
		.poll(async () => {
			const response = await fetch(`${f.project.url}/api/p/${f.project.name}/selection`, {
				headers: { "X-Spool-Control": f.project.controlToken },
			});
			return (await response.json()).selection;
		})
		.toEqual([]);
	const before = descriptions;
	await releaseSavedInspection(f.page);
	await f.page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
	);
	expect(descriptions).toBe(before);
	expect(await f.page.getByRole("button", { name: "Show affected uses", exact: true }).count()).toBe(0);
	expect(f.writes).toHaveLength(1);
	expect(readFileSync(f.file(owner), "utf8")).toBe(authored.replace("Sibling before", "Sibling after"));
});

it.each([owner, css, resource])(
	"refuses sibling source inverse when required %s is removed",
	{ timeout: 120000 },
	async (dependency) => {
		const f = await saveSibling();
		rmSync(f.file(dependency));
		const reply = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history();
		const result = (await (await reply).json()) as SourceResult;
		expect(result.ok).toBe(false);
		if (dependency !== owner)
			expect(readFileSync(f.file(owner), "utf8")).toBe(authored.replace("Sibling before", "Sibling after"));
		await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
	},
);

it.each([".spool", ".git", "node_modules"])(
	"refuses actual rendered literals inside design/%s",
	{ timeout: 120000 },
	async (folder) => {
		const file = `${folder}/private/boundary-label.tsx`;
		const source = 'export function Label(){return <h1 id="label">Protected words</h1>}';
		const f = await originCanvas(
			{ [file]: source },
			`import {Label} from '../../${file}';export default function Frame(){return <main style={{padding:40}}><Label/></main>}`,
			"#label",
		);
		await f.select();
		const field = f.page.getByRole("textbox", { name: "Text", exact: true });
		const reply = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await field.fill("Must not write");
		await field.press("Enter");
		const result = await (await reply).json();
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("not editable project source");
		expect(readFileSync(f.file(file), "utf8")).toBe(source);
		expect(f.writes).toEqual([]);
		expect(await f.target.textContent()).toBe("Protected words");
	},
);

it.each(["canvas.json", "frames/home/frame.json"])(
	"refuses data-derived text from app-owned %s",
	{ timeout: 120000 },
	async (file) => {
		const specifier = file === "canvas.json" ? "../../canvas.json" : "./frame.json";
		const source = `import data from '${specifier}';export default function Frame(){return <main style={{padding:40}}><h1 id="label">{String(data.x??'Metadata words')}</h1></main>}`;
		const f = await originCanvas(file === "canvas.json" ? { [file]: '{"x":42}' } : {}, source, "#label");
		const before = readFileSync(f.file(file), "utf8");
		await f.select();
		const field = f.page.getByRole("textbox", { name: "Text", exact: true });
		const reply = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await field.fill("Must not write");
		await field.press("Enter");
		expect((await (await reply).json()).ok).toBe(false);
		expect(readFileSync(f.file(file), "utf8")).toBe(before);
		expect(f.writes).toEqual([]);
	},
);

it.each(["outside relative", "outside symlink", "canonical retarget"])(
	"retires the original real source intent on %s",
	{ timeout: 120000 },
	async (kind) => {
		const file = "shared/label.tsx";
		const source = 'export function Label(){return <h1 id="label">Boundary before</h1>}';
		const f = await originCanvas(
			{ [file]: source },
			'import {Label} from "shared/label";export default function Frame(){return <main style={{padding:40}}><Label/></main>}',
			"#label",
		);
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Must not write");
		const outside = join(f.project.root, "outside.tsx");
		writeFileSync(outside, source.replace("Boundary before", "Outside words"));
		if (kind === "outside relative") writeFileSync(f.file(file), 'export {Label} from "../../outside.tsx";');
		else if (kind === "outside symlink") {
			unlinkSync(f.file(file));
			symlinkSync(outside, f.file(file));
		} else {
			const other = f.file("shared/other.tsx");
			writeFileSync(other, source);
			unlinkSync(f.file(file));
			symlinkSync(other, f.file(file));
		}
		const before = readFileSync(f.file(file), "utf8");
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
		expect(readFileSync(f.file(file), "utf8")).toBe(before);
		expect(readFileSync(outside, "utf8")).toBe(source.replace("Boundary before", "Outside words"));
		expect(f.writes).toEqual(["commit"]);
	},
);

it.each(["relative traversal", "symlink escape", "absolute external path"])(
	"refuses the real frame compiler's %s before any source owner exists",
	async (kind) => {
		const project = await serveProject();
		const outside = join(project.root, "outside.tsx");
		const bytes = "export default function Outside(){return <h1>External words</h1>}";
		writeFileSync(outside, bytes);
		let specifier = "../../../outside.tsx";
		if (kind === "symlink escape") {
			writeDesignFile(project.root, "shared/anchor.ts", "export {};");
			symlinkSync(outside, join(project.root, "design/shared/outside.tsx"));
			specifier = "shared/outside";
		} else if (kind === "absolute external path") specifier = outside;
		const source = `import Outside from ${JSON.stringify(specifier)};export default function Frame(){return <Outside/>}`;
		writeFrame(project.root, "home", source);
		const response = await fetch(`${project.renderUrl}/p/${project.name}/frames/home`);
		expect(response.status).toBe(500);
		expect(await response.text()).toContain("design boundary");
		expect(readFileSync(outside, "utf8")).toBe(bytes);
		expect(readFileSync(join(project.root, "design/frames/home/frame.tsx"), "utf8")).toBe(source);
	},
);
