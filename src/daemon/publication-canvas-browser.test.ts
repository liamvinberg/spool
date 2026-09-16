import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

it("explains unavailable Cloud sharing and checks again without losing the panel", { timeout: 180_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const page = await browser.newPage();
	let available = false;
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
	await page.getByRole("menuitem", { name: "Share link…" }).click();
	await page.getByRole("dialog").getByText("Spool Cloud isn’t connected.").waitFor();
	expect(await page.getByRole("button", { name: "Create link" }).count()).toBe(0);
	available = true;
	await page.getByRole("button", { name: "Check again" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Create link" }).waitFor();
	await page.keyboard.press("Escape");
	await page.getByRole("dialog").waitFor({ state: "hidden" });
});

it("shares from a frame menu and keeps real upload progress visible while working", { timeout: 180_000 }, async () => {
	const project = await serveProject({ uiDir: await builtUi() });
	writeFrame(project.root, "home", "export default function Home() { return <main>Home</main> }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":320,"h":240}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":100,"y":100,"k":1}}');
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
	await page.getByRole("textbox", { name: "Email addresses" }).fill("alex@example.com; sam@example.com");
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
