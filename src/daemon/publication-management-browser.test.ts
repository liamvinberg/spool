import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudPublication, PublishResult } from "../cloud-publication";
import { initProject } from "../init";
import { associationIdentity, type PublicationAssociation } from "../publication/associations";
import { canonicalJson } from "../publication/manifest";
import { testBrowser } from "../test-browser";
import { makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import type { PublicationJobServices } from "./publication-jobs";
import { serveDaemon } from "./server";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const chip = (page: Page, word: string | RegExp) =>
	page.getByRole("button", { name: typeof word === "string" ? `Sharing: ${word}` : word, exact: true });
const SHARED = /^Sharing: (shared|updated)$/u;

async function openShare(page: Page): Promise<void> {
	if ((await page.getByRole("dialog", { name: "Share menu" }).count()) === 0)
		await page.getByRole("button", { name: "Share", exact: true }).click();
	await page.getByRole("dialog", { name: "Share menu" }).waitFor();
}

it("keeps update, grants, stop, and restore in the accepted player surface", { timeout: 60_000 }, async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const projectDir = join(makeTempDir(), "Kaffe");
	mkdirSync(projectDir);
	const { root } = initProject(projectDir, spoolDir);
	writeFrame(root, "menu", 'export default function Menu() { return <main data-go="cart">Menu</main> }');
	writeFrame(root, "cart", "export default function Cart() { return <main>Cart</main> }");
	for (const frame of ["menu", "cart"])
		writeDesignFile(root, join("frames", frame, "frame.json"), '{ "w": 1440, "h": 900 }\n');
	writeDesignFile(root, "shared/scenarios/default.json", '{ "state": {} }\n');

	const identity = associationIdentity(spoolDir, "https://cloud.test", "owner", root, "menu", "default");
	const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
	const association: PublicationAssociation = {
		key,
		identity,
		projectId: "11111111-1111-4111-8111-111111111111",
		title: "Kaffe",
		intent: {
			kind: "create",
			operationId: "22222222-2222-4222-8222-222222222222",
			contentIdentity: "a".repeat(64),
			inputIdentity: "input",
			invitedEmails: ["alex@example.com"],
		},
		binding: {
			operationId: "22222222-2222-4222-8222-222222222222",
			contentIdentity: "a".repeat(64),
			inputIdentity: "input",
		},
		publicationId: "publication",
		hostname: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
	};
	const associationFile = join(spoolDir, "publications", "associations", `${key}.json`);
	mkdirSync(dirname(associationFile), { recursive: true });
	writeFileSync(associationFile, JSON.stringify(association));

	let current: CloudPublication = {
		id: "publication",
		projectId: "project",
		ownerId: "owner",
		title: "Kaffe",
		hostname: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
		entry: "menu",
		scenario: "default",
		state: "active",
		revision: 1,
		accessGeneration: 1,
		currentVersion: { id: "version-1", contentIdentity: "a".repeat(64) },
		invitedEmails: ["alex@example.com"],
		createdAt: 1,
		updatedAt: 1,
	};
	let source: PublishResult["localSource"] = "changed";
	const publishes: ReturnType<typeof deferred<PublishResult>>[] = [];
	let publisher: string | undefined = "owner";
	const services: PublicationJobServices = {
		account: async () => {
			if (publisher === undefined) throw new Error("signed out");
			return { publisherId: publisher };
		},
		readiness: async () => ({ entry: "menu", ok: true, included: ["menu", "cart"], outgoing: [], diagnostics: [] }),
		status: vi.fn(async () => ({
			publication: current,
			operations: [],
			nextCursor: null,
			localSource: source,
		})),
		publish: vi.fn((options) => {
			expect(options.expectedPublisherId).toBe("owner");
			expect(options.publicationId).toBe("publication");
			options.progress("capturing website");
			options.progress("uploading 1/1");
			const pending = deferred<PublishResult>();
			publishes.push(pending);
			return pending.promise;
		}),
		grant: vi.fn(async (_spoolDir, publicationId, email, kind, publisherId) => {
			expect({ publicationId, publisherId }).toEqual({ publicationId: "publication", publisherId: "owner" });
			current = {
				...current,
				invitedEmails:
					kind === "invite"
						? [...new Set([...current.invitedEmails, email])]
						: current.invitedEmails.filter((person) => person !== email),
			};
		}),
		stop: vi.fn(async (_spoolDir, publicationId, publisherId) => {
			expect({ publicationId, publisherId }).toEqual({ publicationId: "publication", publisherId: "owner" });
			current = { ...current, state: "stopped", accessGeneration: current.accessGeneration + 1 };
		}),
		origin: () => "https://cloud.test",
	};
	services.access = async () => ({
		mode: "invited",
		emails: current.invitedEmails,
		generation: current.accessGeneration,
	});
	services.setAccess = async (_dir, _id, input) => {
		current = { ...current, invitedEmails: input.emails, accessGeneration: current.accessGeneration + 1 };
		return { mode: input.mode, emails: input.emails, generation: current.accessGeneration };
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
	await page.frameLocator("#spool-player").getByText("Menu", { exact: true }).waitFor();

	await chip(page, "changed").waitFor();
	const evidence = process.env.SPOOL_SHARE_EVIDENCE;
	if (evidence !== undefined) {
		mkdirSync(evidence, { recursive: true });
		await page.screenshot({ path: join(evidence, "player-changed.png") });
	}
	await chip(page, "changed").click();
	const dialog = page.getByRole("dialog", { name: "Share menu" });
	await dialog.waitFor();
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(260);
	// it hangs from the bar's share controls, right edges together
	const share = await page.locator(".spool-bar-sharing").boundingBox();
	const panel = await dialog.boundingBox();
	expect(share).not.toBeNull();
	expect(panel).not.toBeNull();
	if (share !== null && panel !== null) {
		expect(Math.abs(panel.x + panel.width - (share.x + share.width))).toBeLessThan(2);
		expect(panel.y).toBeGreaterThan(share.y + share.height);
	}
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "player-changed-open.png") });
	await page.getByRole("button", { name: "Update link", exact: true }).click();
	await chip(page, "updating").waitFor();
	services.status = vi.fn(async () => {
		throw new Error("status temporarily unavailable");
	});
	const transient = page.waitForResponse(
		(response) => response.url().includes("/publication?") && response.status() === 200,
	);
	await page.evaluate(() => window.dispatchEvent(new CustomEvent("spool-player-publication-change")));
	expect(await (await transient).json()).toMatchObject({
		association: "current",
		source: "unavailable",
		job: { state: "running" },
	});
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
	);
	expect(await chip(page, "updating").count()).toBe(1);
	const heldRefresh = deferred<{
		publication: CloudPublication;
		operations: [];
		nextCursor: null;
		localSource: "current";
	}>();
	let updateRefreshes = 0;
	services.status = vi.fn(async () => {
		updateRefreshes += 1;
		if (updateRefreshes === 1) return heldRefresh.promise;
		return { publication: current, operations: [], nextCursor: null, localSource: "changed" as const };
	});
	const modelResponse = deferred<void>();
	const modelCaptured = deferred<void>();
	const modelDelivered = deferred<void>();
	// Only the first model is held. The refresh that trails it passes through a
	// route left in place: one removed while that request is paused can strand it.
	let held = false;
	await page.route("**/publication?*", async (route) => {
		if (held) return route.continue();
		held = true;
		const response = await route.fetch();
		modelCaptured.resolve();
		await modelResponse.promise;
		await route.fulfill({ response });
		modelDelivered.resolve();
	});
	await page.evaluate(() => window.dispatchEvent(new CustomEvent("spool-player-publication-change")));
	await expect.poll(() => updateRefreshes).toBe(1);
	const captured = current;
	current = {
		...current,
		revision: 2,
		currentVersion: { id: "version-2", contentIdentity: "b".repeat(64) },
	};
	writeFileSync(
		associationFile,
		JSON.stringify({
			...association,
			binding: {
				...association.binding,
				operationId: "33333333-3333-4333-8333-333333333333",
				contentIdentity: "b".repeat(64),
			},
		}),
	);
	publishes[0]?.resolve(publishResult(current, "changed"));
	heldRefresh.resolve({ publication: captured, operations: [], nextCursor: null, localSource: "current" });
	await modelCaptured.promise;
	await page.getByRole("button", { name: "Update link", exact: true }).waitFor();
	modelResponse.resolve();
	await modelDelivered.promise;
	await expect.poll(() => updateRefreshes).toBe(2);
	await page.unroute("**/publication?*");
	await page.getByRole("button", { name: "Update link", exact: true }).waitFor();
	services.status = vi.fn(async () => ({
		publication: current,
		operations: [],
		nextCursor: null,
		localSource: source,
	}));
	await page.getByRole("button", { name: "Update link", exact: true }).click();
	await chip(page, "updating").waitFor();
	current = {
		...current,
		revision: 3,
		currentVersion: { id: "version-3", contentIdentity: "c".repeat(64) },
	};
	source = "current";
	publishes[1]?.resolve(publishResult(current, "current"));
	await chip(page, "updated").waitFor();
	await chip(page, "shared").waitFor();

	const positionRead = vi.mocked(services.status).mock.calls.length;
	writeDesignFile(root, join("frames", "menu", "frame.json"), '{ "x": 220, "y": 140, "w": 1440, "h": 900 }\n');
	await expect.poll(() => vi.mocked(services.status).mock.calls.length).toBeGreaterThan(positionRead);
	await chip(page, "shared").waitFor();

	source = "changed";
	const sizeRead = vi.mocked(services.status).mock.calls.length;
	writeDesignFile(root, join("frames", "menu", "frame.json"), '{ "x": 220, "y": 140, "w": 1200, "h": 900 }\n');
	await expect.poll(() => vi.mocked(services.status).mock.calls.length).toBeGreaterThan(sizeRead);
	await chip(page, "changed").waitFor();
	await openShare(page);
	await page.getByRole("button", { name: "Update link", exact: true }).click();
	publishes[2]?.reject(new Error("The upload was interrupted. Try again."));
	await chip(page, "interrupted").waitFor();
	await dialog.getByText("The upload was interrupted. Try again.").waitFor();
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "player-interrupted.png") });
	await dialog.getByRole("button", { name: "Retry", exact: true }).click();
	await chip(page, "updating").waitFor();
	current = {
		...current,
		revision: 4,
		currentVersion: { id: "version-4", contentIdentity: "d".repeat(64) },
	};
	source = "current";
	publishes[3]?.resolve(publishResult(current, "current"));
	await chip(page, SHARED).waitFor();

	await openShare(page);
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "player-shared-open.png") });
	const people = dialog.getByRole("button", { name: /^Invited people/ });
	await people.click();
	await dialog.getByRole("textbox", { name: "Email addresses" }).fill("sam@example.com");
	await dialog.getByRole("textbox", { name: "Email addresses" }).press("Enter");
	await dialog.getByRole("button", { name: "Remove sam@example.com" }).waitFor();
	await dialog.getByRole("button", { name: "Remove alex@example.com", exact: true }).click();
	await expect.poll(() => dialog.getByText("alex@example.com", { exact: true }).count()).toBe(0);
	await dialog.getByRole("button", { name: "Save access" }).click();
	await expect.poll(() => people.getAttribute("aria-expanded")).toBe("false");

	await dialog.getByRole("button", { name: "Stop sharing", exact: true }).click();
	await dialog.getByText("Stop it for everyone?", { exact: true }).waitFor();
	if (evidence !== undefined) await page.screenshot({ path: join(evidence, "player-stopping.png") });
	await dialog.getByRole("button", { name: "Keep", exact: true }).click();
	await expect.poll(() => dialog.getByText("Stop it for everyone?", { exact: true }).count()).toBe(0);
	await dialog.getByRole("button", { name: "Stop sharing", exact: true }).click();
	services.stop = vi.fn(async () => {
		throw new Error("Stopping could not be confirmed. Try again.");
	});
	const failedRead = deferred<void>();
	let failedReads = 0;
	await page.route("**/publication?*", async (route) => {
		failedReads += 1;
		await failedRead.promise;
		await route.abort("connectionfailed");
	});
	const uncertainStop = dialog.getByRole("button", { name: "Stop link", exact: true }).click();
	await expect.poll(() => failedReads).toBe(1);
	publisher = undefined;
	await page.evaluate(() => window.dispatchEvent(new CustomEvent("spool-player-publication-change")));
	await page.waitForTimeout(120);
	failedRead.resolve();
	await uncertainStop;
	await page.getByText("Sharing could not be completed. Try again.", { exact: true }).waitFor();
	await page.getByRole("button", { name: "Check status", exact: true }).waitFor();
	expect(await page.getByRole("dialog", { name: "Share menu" }).count()).toBe(1);
	expect(failedReads).toBe(2);
	expect(await page.getByRole("textbox", { name: "Shared link" }).count()).toBe(0);
	expect(await page.getByRole("button", { name: "Remove sam@example.com" }).count()).toBe(0);
	await page.unroute("**/publication?*");
	await page.getByRole("button", { name: "Check status", exact: true }).click();
	await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
	await expect.poll(() => page.getByRole("button", { name: "Share", exact: true }).count()).toBe(0);
	publisher = "owner";
	services.status = vi.fn(async () => ({
		publication: current,
		operations: [],
		nextCursor: null,
		localSource: source,
	}));
	services.stop = vi.fn(async (_spoolDir, publicationId, publisherId) => {
		expect({ publicationId, publisherId }).toEqual({ publicationId: "publication", publisherId: "owner" });
		current = { ...current, state: "stopped", accessGeneration: current.accessGeneration + 1 };
	});
	await page.evaluate(() => window.dispatchEvent(new CustomEvent("spool-player-publication-change")));
	await chip(page, SHARED).waitFor();
	await openShare(page);
	await dialog.getByRole("button", { name: /What they can see/ }).click();
	await dialog.getByRole("button", { name: "Stop sharing", exact: true }).click();
	await dialog.getByRole("button", { name: "Stop link", exact: true }).click();
	await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
	await page.getByRole("button", { name: "Share", exact: true }).waitFor();
	expect(await page.getByRole("button", { name: /^Sharing: / }).count()).toBe(0);

	await openShare(page);
	expect(await dialog.getByRole("textbox", { name: "Shared link" }).count()).toBe(0);
	expect(await dialog.getByRole("button", { name: "Remove sam@example.com" }).count()).toBe(1);
	await dialog.getByRole("button", { name: "Create and copy link", exact: true }).click();
	await page.getByRole("button", { name: /^Sharing: (preparing link|uploading|updating)/ }).waitFor();
	current = {
		...current,
		state: "active",
		revision: 5,
		currentVersion: { id: "version-5", contentIdentity: "e".repeat(64) },
	};
	publishes[4]?.resolve(publishResult(current, "current"));
	await chip(page, SHARED).waitFor();
	await dialog.getByRole("button", { name: "Copy link", exact: true }).waitFor();
	expect(await dialog.getByRole("textbox", { name: "Shared link" }).inputValue()).toBe(
		"https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-beta.onspool.page",
	);
	expect(services.publish).toHaveBeenCalledTimes(5);
	expect(vi.mocked(services.publish).mock.calls[4]?.[0].invitedEmails).toEqual(["sam@example.com"]);

	const firstRefresh = deferred<{
		publication: CloudPublication;
		operations: [];
		nextCursor: null;
		localSource: "current";
	}>();
	let refreshes = 0;
	services.status = vi.fn(async () => {
		refreshes += 1;
		if (refreshes === 1) return firstRefresh.promise;
		return { publication: current, operations: [], nextCursor: null, localSource: "current" as const };
	});
	await page.evaluate(() => {
		for (let index = 0; index < 5; index++) window.dispatchEvent(new CustomEvent("spool-player-publication-change"));
	});
	await expect.poll(() => refreshes).toBe(1);
	await page.evaluate(() => {
		for (let index = 0; index < 5; index++) window.dispatchEvent(new CustomEvent("spool-player-publication-change"));
	});
	await page.waitForTimeout(120);
	expect(refreshes).toBe(1);
	firstRefresh.resolve({ publication: current, operations: [], nextCursor: null, localSource: "current" });
	await expect.poll(() => refreshes).toBe(2);
});

function publishResult(publication: CloudPublication, localSource: PublishResult["localSource"]): PublishResult {
	return {
		publisherId: publication.ownerId,
		publication,
		operation: {
			id: crypto.randomUUID(),
			publicationId: publication.id,
			kind: "update",
			state: "succeeded",
			contentIdentity: publication.currentVersion?.contentIdentity ?? "d".repeat(64),
			expectedRevision: publication.revision - 1,
			expectedAccessGeneration: publication.accessGeneration,
			createdAt: 1,
			expiresAt: 2,
			missingObjectIndices: [],
			result: { publication, versionId: publication.currentVersion?.id ?? "version" },
			error: null,
		},
		localSource,
	};
}
