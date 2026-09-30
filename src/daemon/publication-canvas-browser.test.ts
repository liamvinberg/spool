import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const LINK = "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page";

function modelFor(project: string, entry: string, overrides: Record<string, unknown> = {}) {
	return {
		available: true,
		title: project,
		entry,
		scenario: "default",
		included: [entry],
		ready: true,
		diagnostics: [],
		association: "missing",
		source: "unavailable",
		recipients: [],
		...overrides,
	};
}

async function evidence(page: Page, name: string): Promise<void> {
	const directory = process.env.SPOOL_SHARE_EVIDENCE;
	if (directory === undefined) return;
	mkdirSync(directory, { recursive: true });
	await page.screenshot({ path: join(directory, `${name}.png`) });
}

it("hides beta sharing until login and removes it again after logout", { timeout: 180_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const page = await browser.newPage();
	let available = false;
	await page.route("**/api/cloud/session", (route) => route.fulfill({ json: { available } }));
	await page.route("**/publication?*", (route) =>
		route.fulfill({
			json: modelFor(project.name, "home", { available, included: available ? ["home"] : [], ready: available }),
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	expect(await page.getByRole("menuitem", { name: "Copy share link" }).count()).toBe(0);
	expect(await page.getByRole("dialog").count()).toBe(0);
	available = true;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	// nothing to reuse yet, so the first link asks who can open it
	await page.getByRole("menuitem", { name: "Copy share link" }).click();
	await page
		.getByRole("dialog", { name: "Share home" })
		.getByRole("button", { name: "Create and copy link" })
		.waitFor();
	available = false;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	expect(await page.getByRole("menuitem", { name: "Copy share link" }).count()).toBe(0);
});

it("makes a link beside its frame, copies it before the upload ends, and reuses the access next time", {
	timeout: 180_000,
}, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeFrame(project.root, "about", "export default function About() { return <main>About</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, "frames/about/frame.json", '{"x":0,"y":400,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: project.url });
	const page = await context.newPage();
	await page.route("**/api/cloud/session", (route) => route.fulfill({ json: { available: true } }));
	const starts: { entry: string; body: unknown }[] = [];
	await page.route("**/publication?*", (route) => {
		const entry = new URL(route.request().url()).searchParams.get("entry") ?? "";
		return route.fulfill({ json: modelFor(project.name, entry) });
	});
	await page.route("**/publication/jobs", async (route) => {
		const body = route.request().postDataJSON() as { entry: string };
		starts.push({ entry: body.entry, body });
		await route.fulfill({
			json: {
				id: `upload-${body.entry}`,
				kind: "create",
				state: "running",
				phase: "capturing",
			},
		});
	});
	await page.route("**/publication/jobs/upload-*", (route) =>
		route.fulfill({
			json: {
				id: route.request().url().split("/").at(-1),
				kind: "create",
				state: "running",
				phase: "uploading",
				url: LINK,
				upload: { completedBytes: 50, totalBytes: 100, completedObjects: 2, totalObjects: 4 },
			},
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const home = page.locator('[data-frame-label="home"]');
	await home.waitFor();
	await home.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Copy share link" }).click();
	const dialog = page.getByRole("dialog", { name: "Share home" });
	await dialog.waitFor();
	await evidence(page, "canvas-compose");

	// the popover stands beside its frame, not over the middle of the canvas
	const label = await home.boundingBox();
	const box = await dialog.boundingBox();
	expect(label).not.toBeNull();
	expect(box).not.toBeNull();
	if (label !== null && box !== null) {
		expect(box.x).toBeGreaterThanOrEqual(label.x + label.width);
		expect(Math.abs(box.y - label.y)).toBeLessThan(2);
	}

	const email = dialog.getByRole("textbox", { name: "Email addresses" });
	expect(await email.evaluate((node) => node === document.activeElement)).toBe(true);
	await page.keyboard.type("alex@example.com; sam@example.com");
	await page.keyboard.press("Enter");
	await dialog.getByRole("button", { name: "Remove alex@example.com" }).waitFor();
	await dialog.getByRole("button", { name: "Remove sam@example.com" }).waitFor();
	await dialog.getByRole("radio", { name: "Anyone with the link" }).check();
	await dialog.getByText("Anyone who has the link can open it, without signing in.").waitFor();
	await dialog.getByRole("button", { name: "Create and copy link" }).click();
	expect(starts).toEqual([
		{
			entry: "home",
			body: {
				entry: "home",
				scenario: "default",
				emails: ["alex@example.com", "sam@example.com"],
				accessMode: "public",
			},
		},
	]);

	// the address arrives before the files do, and the press already asked for the clipboard
	await expect.poll(() => dialog.getByRole("textbox", { name: "Shared link" }).inputValue()).toBe(LINK);
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
	await dialog.getByText("2 of 4 files").waitFor();
	await dialog.getByText("It opens for them once the upload finishes.").waitFor();
	await evidence(page, "canvas-uploading");
	await page.keyboard.press("Escape");
	await dialog.waitFor({ state: "hidden" });
	const chip = home.getByRole("button", { name: "Sharing: uploading 50%" });
	await chip.waitFor();
	await evidence(page, "canvas-chip");
	await chip.click();
	await dialog.waitFor();
	await page.mouse.click(1200, 860);
	await dialog.waitFor({ state: "hidden" });

	// a second frame reuses the access this machine chose: one press, no popover
	const about = page.locator('[data-frame-label="about"]');
	await about.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Copy share link" }).click();
	await expect.poll(() => starts.length).toBe(2);
	expect(starts[1]).toEqual({
		entry: "about",
		body: {
			entry: "about",
			scenario: "default",
			emails: ["alex@example.com", "sam@example.com"],
			accessMode: "public",
		},
	});
	expect(await page.getByRole("dialog").count()).toBe(0);
	await about.getByRole("button", { name: /^Sharing: / }).waitFor();
});

it("keeps share settings editable when a journey cannot be published", { timeout: 180_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.route("**/api/cloud/session", (route) => route.fulfill({ json: { available: true } }));
	await page.route("**/publication?*", (route) =>
		route.fulfill({
			json: modelFor(project.name, "home", {
				ready: false,
				diagnostics: [
					{
						code: "navigation-unreadable",
						frame: "home",
						message: "A navigation destination cannot be established statically.",
						remedy: "Use a literal frame name.",
					},
				],
			}),
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "Copy share link" }).click();
	const email = page.getByRole("textbox", { name: "Email addresses" });
	await email.waitFor();
	expect(await email.isEnabled()).toBe(true);
	await email.click();
	await page.keyboard.type("alex@example.com");
	await page.keyboard.press("Enter");
	await page.getByRole("button", { name: "Remove alex@example.com" }).waitFor();
	await page.getByRole("radio", { name: "Anyone with the link" }).check();
	await page.getByText("Anyone who has the link can open it, without signing in.").waitFor();
	expect(await page.getByRole("button", { name: "Create and copy link" }).isDisabled()).toBe(true);
	await page.getByText("This journey isn’t ready to share.").waitFor();
	await page.getByText(/Use a literal frame name/).waitFor();
	await evidence(page, "canvas-not-ready");
	await page.setViewportSize({ width: 390, height: 500 });
	await expect
		.poll(async () => {
			const box = await page.getByRole("dialog").boundingBox();
			return box !== null && box.x >= 12 && box.y >= 12 && box.x + box.width <= 378;
		})
		.toBe(true);
	await page.getByRole("button", { name: "What they can see" }).click();
	await page.getByRole("region", { name: "Included frames" }).waitFor();
	await page.keyboard.press("Escape");
	await page.getByRole("dialog").waitFor({ state: "hidden" });
});
