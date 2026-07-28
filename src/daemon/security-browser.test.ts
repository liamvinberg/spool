import { createServer } from "node:http";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Frame, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

interface HostileResult {
	surface: "canvas" | "player" | "direct";
	js: "executed";
	ownFixture: unknown;
	scenarioSeed: unknown;
	remote: unknown;
	controlRead: string;
	controlWrite: string;
	crossProject: string;
	controlCookie: string | null;
	controlStorage: string | null;
	parentCookie: string | null;
	parentStorage: string | null;
	parentToken: string | null;
}

const CONTROL_SECRET = "control-only-secret";

async function launchBrowser(): Promise<Browser | undefined> {
	try {
		return await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	} catch {
		return undefined;
	}
}

async function serveRemoteProbe(): Promise<{ origin: string; close(): Promise<void> }> {
	const server = createServer((req, res) => {
		res.setHeader("access-control-allow-origin", "*");
		res.setHeader("access-control-allow-methods", "GET, OPTIONS");
		res.setHeader("access-control-allow-private-network", "true");
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ network: "open" }));
	});
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("remote probe did not bind a TCP port"));
				return;
			}
			resolve(address.port);
		});
	});
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}

function denied(outcome: string): boolean {
	return outcome === "blocked" || /^denied:(401|403|404|421)$/.test(outcome);
}

function hostileFrameSource({
	controlOrigin,
	renderOrigin,
	project,
	foreignProject,
	remoteOrigin,
}: {
	controlOrigin: string;
	renderOrigin: string;
	project: string;
	foreignProject: string;
	remoteOrigin: string;
}): string {
	return `import { useEffect, useState } from "react";
import { ui } from "spool";

interface Result {
	surface: "canvas" | "player" | "direct";
	js: "executed";
	ownFixture: unknown;
	scenarioSeed: unknown;
	remote: unknown;
	controlRead: string;
	controlWrite: string;
	crossProject: string;
	controlCookie: string | null;
	controlStorage: string | null;
	parentCookie: string | null;
	parentStorage: string | null;
	parentToken: string | null;
}

const controlOrigin = ${JSON.stringify(controlOrigin)};
const renderOrigin = ${JSON.stringify(renderOrigin)};
const project = ${JSON.stringify(project)};
const foreignProject = ${JSON.stringify(foreignProject)};
const remoteOrigin = ${JSON.stringify(remoteOrigin)};

function probe(read: () => unknown): string | null {
	try {
		const value = read();
		return typeof value === "string" ? value : value == null ? null : String(value);
	} catch {
		return "blocked";
	}
}

async function requestOutcome(input: string, init?: RequestInit): Promise<string> {
	try {
		const response = await fetch(input, init);
		return response.ok ? "allowed:" + response.status : "denied:" + response.status;
	} catch {
		return "blocked";
	}
}

async function tryForeignFixture(): Promise<string> {
	try {
		let capability = (window as any).__SPOOL__.projectCapability as string;
		if (window.parent === window) {
			const foreignDocument = await fetch(
				renderOrigin + "/p/" + encodeURIComponent(foreignProject) + "/frames/foreign",
			);
			if (foreignDocument.ok) {
				const html = await foreignDocument.text();
				capability = html.match(/"projectCapability":"([^"]+)"/)?.[1] ?? capability;
			}
		}
		const response = await fetch(
			renderOrigin + "/api/p/" + encodeURIComponent(foreignProject) + "/fixtures/secret",
			{ headers: { "X-Spool-Project": capability } },
		);
		return response.ok ? "allowed:" + response.status : "denied:" + response.status;
	} catch {
		return "blocked";
	}
}

export default function Hostile() {
	const state = ui.use();
	const [result, setResult] = useState<Result | null>(null);
	useEffect(() => {
		void (async () => {
			const surface =
				(window as any).__SPOOL_PLAY__ !== undefined
					? "player"
					: window.parent === window
						? "direct"
						: "canvas";
			const ownFixture = await fetch("/api/own").then((response) => response.json());
			const remote = await fetch(remoteOrigin + "/probe").then((response) => response.json());
			setResult({
				surface,
				js: "executed",
				ownFixture,
				scenarioSeed: state.scenarioSeed,
				remote,
				controlRead: await requestOutcome(controlOrigin + "/api/projects"),
				controlWrite: await requestOutcome(controlOrigin + "/api/p/" + encodeURIComponent(project) + "/state", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ camera: { x: 999, y: 999, zoom: 9 } }),
				}),
				crossProject: await tryForeignFixture(),
				controlCookie: probe(() => document.cookie),
				controlStorage: probe(() => localStorage.getItem("control-secret")),
				parentCookie: probe(() => window.parent.document.cookie),
				parentStorage: probe(() => window.parent.localStorage.getItem("control-secret")),
				parentToken: probe(() => (window.parent as any).__SPOOL_CONTROL__),
			});
		})();
	}, [state.scenarioSeed]);

	function tryEscape() {
		window.open(controlOrigin + "/hostile-popup", "_blank");
		try {
			window.top!.location.href = controlOrigin + "/hostile-navigation";
		} catch {}
	}

	function walk() {
		const onCanvas = window.parent !== window && (window as any).__SPOOL_PLAY__ === undefined;
		if (!onCanvas) {
			ui.go("next");
			return;
		}
		window.parent.postMessage({ spool: "key", frame: "next", key: "Escape" }, "*");
		setTimeout(() => ui.go("next"), 50);
	}

	return (
		<main>
			<pre id="hostile-result">{result === null ? "pending" : JSON.stringify(result)}</pre>
			<button id="walk" onClick={walk}>walk</button>
			<button id="escape" onClick={tryEscape}>escape</button>
		</main>
	);
}
`;
}

async function childFrame(page: Page, selector: string): Promise<Frame> {
	// A walk arrival replaces its target's document (#28), so the element found
	// a moment ago can be between documents: ask again rather than read a stale
	// handle. Wait for attachment because a document may be hidden while it boots.
	for (let attempt = 0; ; attempt++) {
		const element = await page.waitForSelector(selector, { state: "attached" });
		const frame = await element.contentFrame();
		if (frame !== null) return frame;
		if (attempt >= 20) throw new Error(`${selector} has no content frame`);
		await page.waitForTimeout(100);
	}
}

async function readHostileResult(frame: Frame): Promise<HostileResult> {
	const result = frame.locator("#hostile-result");
	await frame.waitForFunction(
		() => {
			const text = document.querySelector("#hostile-result")?.textContent;
			return typeof text === "string" && text !== "pending";
		},
		undefined,
		{ timeout: 30_000 },
	);
	return JSON.parse(await result.innerText()) as HostileResult;
}

function expectAuthorityDenied(result: HostileResult, controlToken: string): void {
	expect(result.js).toBe("executed");
	expect(result.ownFixture).toEqual({ owner: "own" });
	expect(result.scenarioSeed).toBe("own");
	expect(result.remote).toEqual({ network: "open" });
	expect(denied(result.controlRead)).toBe(true);
	expect(denied(result.controlWrite)).toBe(true);
	expect(denied(result.crossProject)).toBe(true);
	expect(JSON.stringify(result)).not.toContain(CONTROL_SECRET);
	expect(JSON.stringify(result)).not.toContain(controlToken);
}

async function expectSandboxEscapeDenied(context: BrowserContext, page: Page, frame: Frame): Promise<void> {
	const beforePages = context.pages().length;
	const beforeUrl = page.url();
	await frame.locator("#escape").click({ force: true });
	await page.waitForTimeout(250);
	expect(page.url()).toBe(beforeUrl);
	expect(context.pages()).toHaveLength(beforePages);
}

describe("hostile project browser boundary", () => {
	it("keeps canvas, Play, and direct execution useful without granting daemon authority", {
		timeout: 180_000,
	}, async () => {
		const browser = await launchBrowser();
		if (browser === undefined) return;
		onTestFinished(() => browser.close());

		const remote = await serveRemoteProbe();
		onTestFinished(() => remote.close());

		const uiDir = join(makeTempDir(), "ui");
		const project = await serveProject({ uiDir });
		const foreign = makeProject(project.spoolDir);
		writeDesignFile(project.root, "shared/fixtures/own.json", JSON.stringify({ owner: "own" }));
		writeDesignFile(
			project.root,
			"shared/scenarios/default.json",
			JSON.stringify({ state: { scenarioSeed: "own" }, mock: {} }),
		);
		writeDesignFile(foreign.root, "shared/fixtures/secret.json", JSON.stringify({ owner: "foreign" }));
		writeFrame(foreign.root, "foreign", "export default function Foreign() { return <main>foreign</main> }");
		writeFrame(project.root, "next", 'export default function Next() { return <main id="next">next</main> }');
		writeFrame(
			project.root,
			"hostile",
			hostileFrameSource({
				controlOrigin: project.url,
				renderOrigin: project.renderUrl,
				project: project.name,
				foreignProject: foreign.name,
				remoteOrigin: remote.origin,
			}),
		);
		await buildUi({
			configFile: join(process.cwd(), "vite.config.ts"),
			logLevel: "silent",
			build: { outDir: uiDir, emptyOutDir: true },
		});
		const session = await fetch(`${project.url}/api/session`, {
			method: "PUT",
			headers: {
				"content-type": "application/json",
				"X-Spool-Control": project.controlToken,
			},
			body: JSON.stringify({ root: project.root, open: true }),
		});
		expect(session.status).toBe(204);

		const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
		onTestFinished(() => context.close());
		await context.addCookies([{ name: "control-cookie", value: CONTROL_SECRET, url: project.url }]);

		const canvasPage = await context.newPage();
		await canvasPage.goto(project.url);
		await canvasPage.evaluate((secret) => {
			localStorage.setItem("control-secret", secret);
		}, CONTROL_SECRET);
		await canvasPage.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
		const canvasFrame = await childFrame(canvasPage, 'iframe[title="hostile"]');
		await childFrame(canvasPage, 'iframe[title="next"]');
		const canvasResult = await readHostileResult(canvasFrame);
		expect(canvasResult.surface).toBe("canvas");
		expectAuthorityDenied(canvasResult, project.controlToken);
		expect(canvasResult.parentCookie).toBe("blocked");
		expect(canvasResult.parentStorage).toBe("blocked");
		expect(canvasResult.parentToken).toBe("blocked");
		await expectSandboxEscapeDenied(context, canvasPage, canvasFrame);

		const hostileLabel = canvasPage.locator('[data-frame-label="hostile"]');
		await hostileLabel.dispatchEvent("dblclick");
		await expect.poll(() => hostileLabel.innerText()).toContain("live");
		// entering is instant and the camera flight that follows is not: a click
		// aimed mid-flight lands where the button was, not where it is
		await canvasPage.waitForTimeout(400);
		await canvasFrame.locator("#walk").click();
		const nextLabel = canvasPage.locator('[data-frame-label="next"]');
		await expect.poll(() => nextLabel.innerText()).toContain("live");
		await canvasPage.frameLocator('iframe[title="next"]').locator("#next").waitFor({ state: "attached" });

		const playPage = await context.newPage();
		await playPage.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=hostile`);
		const playerFrame = await childFrame(playPage, "#spool-player");
		const playerResult = await readHostileResult(playerFrame);
		expect(playerResult.surface).toBe("player");
		expectAuthorityDenied(playerResult, project.controlToken);
		expect(playerResult.parentCookie).toBe("blocked");
		expect(playerResult.parentStorage).toBe("blocked");
		expect(playerResult.parentToken).toBe("blocked");
		await expectSandboxEscapeDenied(context, playPage, playerFrame);
		await playerFrame.locator("#walk").click();
		await playerFrame.locator("#next").waitFor();
		expect(await playerFrame.locator("#next").innerText()).toBe("next");
		await expect
			.poll(async () => {
				const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/flows`, {
					headers: { "X-Spool-Control": project.controlToken },
				});
				const flows = (await response.json()) as {
					edges: { from: string; to: string; verified?: true }[];
				};
				return flows.edges.some((edge) => edge.from === "hostile" && edge.to === "next" && edge.verified === true);
			})
			.toBe(true);

		const directPage = await context.newPage();
		await directPage.goto(`${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/hostile`);
		const directResult = await readHostileResult(directPage.mainFrame());
		expect(directResult.surface).toBe("direct");
		expectAuthorityDenied(directResult, project.controlToken);
		expect(directResult.controlCookie).not.toContain(CONTROL_SECRET);
		expect(directResult.controlStorage).not.toContain(CONTROL_SECRET);

		const state = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/state`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		expect(await state.json()).not.toMatchObject({ camera: { x: 999, y: 999, zoom: 9 } });
	});
});
