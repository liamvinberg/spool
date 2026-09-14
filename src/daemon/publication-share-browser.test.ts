import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, Route } from "playwright-core";
import { expect, it, onTestFinished, vi } from "vitest";
import type { PublishResult } from "../cloud-publication";
import { initProject } from "../init";
import { testBrowser } from "../test-browser";
import { makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import type { PublicationJobServices } from "./publication-jobs";
import { serveDaemon } from "./server";

function result(ownerId: string): PublishResult {
	const publication = {
		id: "publication",
		projectId: "project",
		ownerId,
		title: "Kaffe",
		hostname: "p.test.beta.onspool.page",
		url: "https://p.test.beta.onspool.page",
		entry: "menu",
		scenario: "default",
		state: "active" as const,
		revision: 1,
		accessGeneration: 1,
		currentVersion: { id: "version", contentIdentity: "identity" },
		invitedEmails: ["alex@example.com"],
		createdAt: 1,
		updatedAt: 1,
	};
	return {
		publisherId: ownerId,
		publication,
		operation: {
			id: "operation",
			publicationId: publication.id,
			kind: "create",
			state: "succeeded",
			contentIdentity: "identity",
			expectedRevision: 0,
			expectedAccessGeneration: 1,
			createdAt: 1,
			expiresAt: 2,
			missingObjectIndices: [],
			result: { publication, versionId: "version" },
			error: null,
		},
		localSource: "current",
	};
}

async function openShare(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Share", exact: true }).click();
	await page.getByRole("dialog", { name: "Share Kaffe" }).waitFor();
}

it("ports the accepted player share sheet and original-entry picker into the trusted shell", {
	timeout: 60_000,
}, async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const parent = makeTempDir();
	const projectDir = join(parent, "Kaffe");
	mkdirSync(projectDir);
	const { root } = initProject(projectDir, spoolDir);
	writeFrame(
		root,
		"menu",
		'export default function Menu() { return <main><h1>Menu</h1><button data-go="cart">Cart</button></main> }',
	);
	writeFrame(root, "cart", "export default function Cart() { return <main><h1>Cart</h1></main> }");
	writeFrame(root, "rewards", "export default function Rewards() { return <main><h1>Rewards</h1></main> }");
	writeFrame(root, "draft", "export default function Draft() { return <main><h1>Draft</h1></main> }");
	for (const frame of ["menu", "cart", "rewards", "draft"])
		writeDesignFile(root, join("frames", frame, "frame.json"), '{ "w": 1440, "h": 900 }\n');
	writeDesignFile(root, "shared/scenarios/default.json", '{ "state": {} }\n');
	let publisher: string | undefined = "owner";
	let rejectFirstPublish!: (error: Error) => void;
	const firstPublish = new Promise<PublishResult>((_resolve, reject) => {
		rejectFirstPublish = reject;
	});
	let publishCount = 0;
	const services: PublicationJobServices = {
		account: vi.fn(async () => {
			if (publisher === undefined) throw new Error("signed out");
			return { publisherId: publisher };
		}),
		readiness: async (_root, entry) => ({
			entry,
			ok: true,
			included: ["menu", "cart", "rewards"],
			outgoing: [],
			diagnostics: [],
		}),
		status: async () => {
			const current = result("owner");
			return {
				publication: current.publication,
				operation: current.operation,
				operations: [],
				nextCursor: null,
				localSource: current.localSource,
			};
		},
		publish: vi.fn(async (options) => {
			expect(options.expectedPublisherId).toBe("owner");
			options.progress("capturing website");
			options.progress("uploading 1/1");
			publishCount += 1;
			if (publishCount === 1) return firstPublish;
			return result("owner");
		}),
		grant: async () => {},
		stop: async () => {},
		origin: () => "https://cloud.test",
	};
	const daemon = await serveDaemon({
		spoolDir,
		version: "test",
		host: "127.0.0.1",
		port: 0,
		publicationServices: services,
	});
	onTestFinished(() => daemon.close());
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await page.getByRole("button", { name: "Share", exact: true }).waitFor();
	const evidence = process.env.SPOOL_174_EVIDENCE;
	if (evidence !== undefined) {
		mkdirSync(evidence, { recursive: true });
		await page.screenshot({ path: join(evidence, "share-closed-1440.png") });
	}

	await page.frameLocator("#spool-player").getByRole("button", { name: "Cart" }).click();
	await expect.poll(() => page.locator(".spool-bar-name").textContent()).toBe("cart");
	await openShare(page);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(220);
	expect(await page.locator(".spool-sharing-panel").boundingBox()).toMatchObject({ x: 480, width: 480, height: 345 });
	expect(
		await page.locator(".spool-sharing-panel").evaluate((node) => {
			const style = getComputedStyle(node);
			return { opacity: style.opacity, background: style.backgroundColor, color: style.color };
		}),
	).toEqual({ opacity: "1", background: "rgb(28, 28, 28)", color: "rgb(240, 239, 237)" });
	expect(await page.locator(".spool-top").evaluate((node) => getComputedStyle(node).height)).toBe("30px");
	expect(await page.locator(".spool-top").evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
		"rgb(40, 40, 40)",
	);
	expect(await page.locator(".spool-sharing-panel").evaluate((node) => getComputedStyle(node).fontFamily)).toContain(
		"Instrument Sans Variable",
	);
	expect(await page.locator("#spool-share-email").evaluate((node) => node === document.activeElement)).toBe(true);
	expect(await page.locator(".spool-screen").getAttribute("inert")).not.toBeNull();
	expect(await page.locator(".spool-top").getAttribute("inert")).not.toBeNull();
	await page.keyboard.press("Shift+Tab");
	expect(
		await page.getByRole("button", { name: "Close sharing" }).evaluate((node) => node === document.activeElement),
	).toBe(true);
	await page.keyboard.press("Shift+Tab");
	expect(
		await page.getByRole("button", { name: "Create link" }).evaluate((node) => node === document.activeElement),
	).toBe(true);
	await page.keyboard.press("Tab");
	expect(
		await page.getByRole("button", { name: "Close sharing" }).evaluate((node) => node === document.activeElement),
	).toBe(true);
	await page.keyboard.press("Tab");
	expect(await page.locator("#spool-share-email").evaluate((node) => node === document.activeElement)).toBe(true);

	if (evidence !== undefined) {
		await page.screenshot({ path: join(evidence, "share-open-1440.png") });
	}

	await page.getByRole("button", { name: "What they can see" }).click();
	const included = page.getByRole("region", { name: "Included frames" });
	await expect.poll(() => included.locator("code").allTextContents()).toEqual(["menu", "cart", "rewards"]);
	expect(await included.textContent()).not.toContain("draft");
	expect(await page.getByText("Opens at menu.").textContent()).toContain("menu");

	if (evidence !== undefined) {
		await page.screenshot({ path: join(evidence, "share-open-details-1440.png") });
	}
	await page.getByRole("button", { name: "What they can see" }).click();

	await page.keyboard.press("Escape");
	await expect.poll(() => page.getByRole("dialog", { name: "Share Kaffe" }).count()).toBe(0);
	expect(
		await page
			.getByRole("button", { name: "Share", exact: true })
			.evaluate((node) => node === document.activeElement),
	).toBe(true);

	await page.locator("#spool-switcher").click();
	const search = page.getByRole("searchbox", { name: "Find a linked frame" });
	await search.fill("ReWa");
	await search.press("Enter");
	await expect.poll(() => page.locator(".spool-bar-name").textContent()).toBe("rewards");
	await page.locator("#spool-switcher").click();
	await search.fill("missing");
	await page.getByText("No linked frames found.").waitFor();
	expect(await page.locator(".spool-picker").textContent()).not.toContain("draft");
	await page.keyboard.press("Escape");
	expect(await page.locator("#spool-switcher").evaluate((node) => node === document.activeElement)).toBe(true);

	await page.setViewportSize({ width: 2322, height: 1191 });
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "share-closed-2322.png") });
	await openShare(page);
	expect(
		await page.locator(".spool-sharing-panel").evaluate((node) => getComputedStyle(node).transitionDuration),
	).toBe("0.18s, 0.18s");
	expect(
		await page.locator(".spool-sharing-scrim").evaluate((node) => getComputedStyle(node).transitionDuration),
	).toBe("0.14s");
	await page.waitForTimeout(220);
	expect(await page.locator(".spool-sharing-panel").boundingBox()).toMatchObject({ x: 921, width: 480, height: 345 });
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "share-open-2322.png") });
	await page.getByRole("button", { name: "Close sharing" }).click();
	expect(
		await page.locator(".spool-sharing-panel").evaluate((node) => getComputedStyle(node).transitionDuration),
	).toBe("0.12s, 0.12s");
	await page.getByRole("button", { name: "Share", exact: true }).click();
	await page.getByRole("button", { name: "Dismiss sharing" }).click({ position: { x: 8, y: 8 } });
	await page.getByRole("button", { name: "Share", exact: true }).click();
	await page.getByRole("button", { name: "Close sharing" }).click();

	const mac = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await mac.addInitScript(() => {
		Object.defineProperty(window, "spoolPlayWindow", { value: { restored: false, reset() {} } });
	});
	await mac.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await mac.getByRole("button", { name: "Share", exact: true }).waitFor();
	expect(await mac.locator(".spool-top.is-desk").evaluate((node) => getComputedStyle(node).paddingLeft)).toBe("76px");
	expect(await mac.locator(".spool-bar-back, #spool-bar-eye, #spool-close").count()).toBe(0);
	if (evidence !== undefined) await mac.screenshot({ path: join(evidence, "share-mac-closed-1440.png") });
	await openShare(mac);
	await mac.waitForTimeout(220);
	if (evidence !== undefined) await mac.screenshot({ path: join(evidence, "share-mac-open-1440.png") });

	const reducedContext = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
	const reduced = await reducedContext.newPage();
	await reduced.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await reduced.getByRole("button", { name: "Share", exact: true }).waitFor();
	await openShare(reduced);
	expect(
		await reduced.locator(".spool-sharing-panel").evaluate((node) => getComputedStyle(node).transitionDuration),
	).toBe("0s");

	const expired = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await expired.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await expired.getByRole("button", { name: "Share", exact: true }).waitFor();
	let heldModel: Route | undefined;
	let modelRequests = 0;
	await expired.route("**/publication?**", async (route) => {
		modelRequests += 1;
		if (modelRequests === 1) {
			heldModel = route;
			return;
		}
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				available: false,
				title: "Kaffe",
				entry: "menu",
				scenario: "default",
				included: [],
				ready: false,
				diagnostics: [],
			}),
		});
	});
	await expired.getByRole("button", { name: "Share", exact: true }).click();
	await expect.poll(() => heldModel).toBeDefined();
	await expired.getByRole("button", { name: "Share", exact: true }).click();
	await expect.poll(() => expired.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	expect(await expired.getByRole("dialog", { name: "Share Kaffe" }).count()).toBe(0);
	await heldModel?.fulfill({
		contentType: "application/json",
		body: JSON.stringify({
			available: true,
			title: "Kaffe",
			entry: "menu",
			scenario: "default",
			included: ["menu", "cart", "rewards"],
			ready: true,
			diagnostics: [],
		}),
	});
	await expired.waitForTimeout(300);
	expect(await expired.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	expect(services.publish).not.toHaveBeenCalled();

	const expiringForm = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await expiringForm.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await expiringForm.getByRole("button", { name: "Share", exact: true }).waitFor();
	await openShare(expiringForm);
	await expiringForm.locator("#spool-share-email").fill("alex@example.com");
	publisher = undefined;
	await expiringForm.getByRole("button", { name: "Create link" }).click();
	await expect.poll(() => expiringForm.getByRole("dialog", { name: "Share Kaffe" }).count()).toBe(0);
	await expect.poll(() => expiringForm.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	publisher = "owner";
	await expiringForm.waitForTimeout(300);
	expect(services.publish).not.toHaveBeenCalled();

	const signedOut = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	publisher = undefined;
	await signedOut.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await signedOut.waitForTimeout(200);
	expect(await signedOut.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	publisher = "owner";
	await signedOut.evaluate(() => window.dispatchEvent(new Event("focus")));
	await signedOut.getByRole("button", { name: "Share", exact: true }).waitFor();
	expect(services.publish).not.toHaveBeenCalled();
	await signedOut.close();

	const workflow = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await workflow.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await workflow.getByRole("button", { name: "Share", exact: true }).waitFor();
	await openShare(workflow);
	await workflow.getByRole("button", { name: "Create link" }).click();
	await workflow.getByText("Enter the person’s email address.").waitFor();
	await workflow.locator("#spool-share-email").fill("alex@example.com");
	await workflow.getByRole("button", { name: "Create link" }).click();
	await workflow.getByRole("button", { name: "Creating link…" }).waitFor();
	expect(services.publish).toHaveBeenCalledTimes(1);
	publisher = undefined;
	await expect.poll(() => workflow.getByRole("dialog", { name: "Share Kaffe" }).count()).toBe(0);
	await expect.poll(() => workflow.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	publisher = "owner";
	await workflow.waitForTimeout(300);
	expect(services.publish).toHaveBeenCalledTimes(1);
	await workflow.close();
	rejectFirstPublish(new Error("The connection ended before the link was ready. Try again."));

	const recovered = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await recovered.goto(`${daemon.url}/play/Kaffe?frame=menu`);
	await recovered.getByRole("button", { name: "Share", exact: true }).waitFor();
	await openShare(recovered);
	await recovered.getByText("The connection ended before the link was ready. Try again.").waitFor();
	expect(await recovered.locator("#spool-share-email").inputValue()).toBe("alex@example.com");
	await recovered.getByRole("button", { name: "Retry" }).click();
	await recovered.getByRole("button", { name: "Copy link" }).waitFor();
	expect(await recovered.getByLabel("Shared link").inputValue()).toBe("https://p.test.beta.onspool.page");
	expect(await recovered.getByText("alex@example.com").count()).toBeGreaterThan(0);
	const openLink = recovered.getByRole("link", { name: "Open link ↗" });
	expect(await openLink.getAttribute("href")).toBe("https://p.test.beta.onspool.page");
	expect(await openLink.getAttribute("target")).toBe("_blank");
	await recovered.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: daemon.url });
	await recovered.getByRole("button", { name: "Copy link" }).click();
	await recovered.getByRole("button", { name: "Copied" }).waitFor();
	expect(await recovered.evaluate(() => navigator.clipboard.readText())).toBe("https://p.test.beta.onspool.page");
	await recovered.evaluate(() => {
		Object.defineProperty(navigator.clipboard, "writeText", {
			configurable: true,
			value: async () => {
				throw new Error("denied");
			},
		});
	});
	await recovered.getByRole("button", { name: "Copied" }).click();
	await recovered.getByText("Select the link to copy it. Clipboard access was unavailable.").waitFor();
	expect(services.publish).toHaveBeenCalledTimes(2);
});
