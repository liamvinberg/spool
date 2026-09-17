import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

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
			json: {
				available,
				title: project.name,
				entry: "home",
				scenario: "default",
				included: available ? ["home"] : [],
				ready: available,
				diagnostics: [],
				association: "missing",
				source: "unavailable",
				recipients: [],
			},
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	expect(await page.getByRole("menuitem", { name: "Share link…" }).count()).toBe(0);
	expect(await page.getByRole("dialog").count()).toBe(0);
	available = true;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await page.getByRole("menuitem", { name: "Share link…" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Create link" }).waitFor();
	available = false;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	expect(await page.getByRole("menuitem", { name: "Share link…" }).count()).toBe(0);
});

it("shares from a frame menu and keeps real upload progress visible while working", { timeout: 180_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.route("**/api/cloud/session", (route) => route.fulfill({ json: { available: true } }));
	const starts: unknown[] = [];
	const model = {
		available: true,
		title: project.name,
		entry: "home",
		scenario: "default",
		included: ["home"],
		ready: true,
		diagnostics: [],
		association: "missing",
		source: "unavailable",
		recipients: [],
	};
	await page.route("**/publication?*", (route) => route.fulfill({ json: model }));
	await page.route("**/publication/jobs", async (route) => {
		starts.push(route.request().postDataJSON());
		await route.fulfill({
			json: {
				id: "upload",
				kind: "create",
				state: "running",
				phase: "uploading",
				upload: { completedBytes: 25, totalBytes: 100, completedObjects: 1, totalObjects: 4 },
			},
		});
	});
	await page.route("**/publication/jobs/upload", (route) =>
		route.fulfill({
			json: {
				id: "upload",
				kind: "create",
				state: "running",
				phase: "uploading",
				upload: { completedBytes: 50, totalBytes: 100, completedObjects: 2, totalObjects: 4 },
			},
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-label="home"]').waitFor();
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "Share link…" }).click();
	await page.getByRole("dialog").waitFor();
	const email = page.getByRole("textbox", { name: "Email addresses" });
	await email.click();
	await page.keyboard.type("alex@example.com; sam@example.com");
	expect(await email.inputValue()).toBe("alex@example.com; sam@example.com");
	await expect
		.poll(async () => {
			const box = await page.getByRole("dialog").boundingBox();
			return box ? Math.abs(box.x + box.width / 2 - 640) : Infinity;
		})
		.toBeLessThan(2);
	await expect
		.poll(async () => {
			const box = await page.getByRole("dialog").boundingBox();
			return box ? Math.abs(box.y + box.height / 2 - 450) : Infinity;
		})
		.toBeLessThan(2);
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("button", { name: "Remove alex@example.com" }).waitFor();
	await page.getByRole("button", { name: "Remove sam@example.com" }).waitFor();
	await page.getByRole("combobox").selectOption("public");
	await page.getByText("Anyone who receives or forwards this link can open it. No sign-in required.").waitFor();
	await page.getByRole("button", { name: "Create link" }).click();
	await page.getByRole("progressbar", { name: "Upload progress" }).waitFor();
	expect(starts).toEqual([
		{ entry: "home", scenario: "default", emails: ["alex@example.com", "sam@example.com"], accessMode: "public" },
	]);
	await page.getByRole("button", { name: "Continue working" }).click();
	const tray = page.getByRole("complementary", { name: "Share progress" });
	await tray.waitFor();
	await expect.poll(() => tray.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
	await page
		.locator('[data-frame-label="home"]')
		.getByRole("button", { name: /uploading/ })
		.waitFor();
	await tray.getByRole("button", { name: "Details" }).click();
	await page.getByRole("dialog").waitFor();
	await page.keyboard.press("Escape");
	await tray.waitFor();
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
			json: {
				available: true,
				title: project.name,
				entry: "home",
				scenario: "default",
				included: ["home"],
				ready: false,
				association: "missing",
				source: "unavailable",
				recipients: [],
				diagnostics: [
					{
						code: "navigation-unreadable",
						frame: "home",
						message: "A navigation destination cannot be established statically.",
						remedy: "Use a literal frame name.",
					},
				],
			},
		}),
	);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-label="home"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "Share link…" }).click();
	const email = page.getByRole("textbox", { name: "Email addresses" });
	await email.waitFor();
	expect(await email.isEnabled()).toBe(true);
	await email.click();
	await page.keyboard.type("alex@example.com");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("button", { name: "Remove alex@example.com" }).waitFor();
	await page.getByRole("combobox").selectOption("public");
	await page.getByText("Anyone who receives or forwards this link can open it. No sign-in required.").waitFor();
	expect(await page.getByRole("button", { name: "Create link" }).isDisabled()).toBe(true);
	await page.getByText("This journey isn’t ready to share.").waitFor();
	await page.getByText(/Use a literal frame name/).waitFor();
	await page.setViewportSize({ width: 390, height: 500 });
	await expect
		.poll(async () => {
			const box = await page.getByRole("dialog").boundingBox();
			return box !== null && box.x >= 20 && box.y >= 20 && box.x + box.width <= 370 && box.y + box.height <= 480;
		})
		.toBe(true);
	await page.getByRole("button", { name: "What they can see" }).click();
	await page.getByRole("region", { name: "Included frames" }).waitFor();
	await page.getByRole("button", { name: "Close sharing" }).click();
	await page.getByRole("dialog").waitFor({ state: "hidden" });
});
