import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:tls";
import { type Browser, type BrowserContext, chromium, type Frame, type Page } from "playwright-core";
import { describe, expect, it, onTestFinished } from "vitest";
import { builtUi, makeProject, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { logsFrame, shotFrame } from "../verify";

interface HostileResult {
	surface: "canvas" | "player" | "direct";
	js: "executed";
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

async function tryForeignScenario(): Promise<string> {
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
			renderOrigin + "/api/p/" + encodeURIComponent(foreignProject) + "/scenarios/default",
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
			const remote = await requestOutcome(remoteOrigin + "/probe");
			setResult({
				surface,
				js: "executed",
				scenarioSeed: state.scenarioSeed,
				remote,
				controlRead: await requestOutcome(controlOrigin + "/api/projects"),
				controlWrite: await requestOutcome(controlOrigin + "/api/p/" + encodeURIComponent(project) + "/state", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ camera: { x: 999, y: 999, zoom: 9 } }),
				}),
				crossProject: await tryForeignScenario(),
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
	expect(result.scenarioSeed).toBe("own");
	// a frame is https-only (DEV-175): plain http on loopback is never reached
	expect(result.remote).toBe("blocked");
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

		const uiDir = await builtUi();
		const project = await serveProject({ uiDir });
		const foreign = makeProject(project.spoolDir);
		writeDesignFile(
			project.root,
			"shared/scenarios/default.json",
			JSON.stringify({ state: { scenarioSeed: "own" } }),
		);
		writeDesignFile(foreign.root, "shared/scenarios/default.json", JSON.stringify({ state: { owner: "foreign" } }));
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

	/**
	 * The price of the opaque origin, priced out loud (#182): a bare frame document
	 * has no storage, so its session cannot outlive the document. The skill says
	 * exactly this under the url verb and scopes the session contract to the canvas
	 * and the player — if this test ever fails, that text is what to fix first.
	 */
	it("keeps no session in a bare frame document, across a walk or a reload", { timeout: 60_000 }, async () => {
		const browser = await launchBrowser();
		if (browser === undefined) return;
		onTestFinished(() => browser.close());

		const project = await serveProject();
		writeDesignFile(project.root, "shared/scenarios/default.json", JSON.stringify({ state: { count: 0 } }));
		writeFrame(
			project.root,
			"one",
			`import { ui } from "spool";
export default function One() {
	ui.use();
	return (
		<main>
			<span id="count">{String(ui.state.count)}</span>
			<button id="bump" onClick={() => { ui.state.count = (ui.state.count as number) + 1; }}>bump</button>
			<button id="walk" onClick={() => ui.go("two")}>walk</button>
		</main>
	);
}`,
		);
		writeFrame(
			project.root,
			"two",
			`import { ui } from "spool";
export default function Two() {
	ui.use();
	return <main id="two">{String(ui.state.count)}</main>;
}`,
		);

		const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
		onTestFinished(() => context.close());
		const page = await context.newPage();
		const raw = `${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/one`;

		await page.goto(raw);
		await page.locator("#bump").click();
		await expect.poll(() => page.locator("#count").innerText()).toBe("1");
		expect(
			await page.evaluate(() => {
				try {
					void window.sessionStorage;
					return "readable";
				} catch (error) {
					return (error as Error).name;
				}
			}),
		).toBe("SecurityError");

		// the walk really happens — it is the state that stays behind
		await page.locator("#walk").click();
		await page.locator("#two").waitFor();
		expect(page.url()).toBe(`${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/two`);
		expect(await page.locator("#two").innerText()).toBe("0");

		await page.goto(raw);
		await page.locator("#bump").click();
		await expect.poll(() => page.locator("#count").innerText()).toBe("1");
		await page.reload();
		await expect.poll(() => page.locator("#count").innerText()).toBe("0");
	});
});

/** What a frame could reach, as it reports it: each probe either got through or was refused. */
interface Reach {
	vendored: "loaded";
	localFetch: string;
	localImage: string;
	localScript: string;
	httpsFetch: string;
	dataImage: string;
}

const ONE_PIXEL_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * A frame that reaches for plain http on loopback three ways, and for https
 * and a `data:` image the ordinary way. It draws nothing until it knows, so a
 * shot and a cover wait for the whole answer.
 */
function reachFrameSource(localOrigin: string, httpsUrl: string): string {
	return `import { useEffect, useState } from "react";
import { ui } from "spool";

const localOrigin = ${JSON.stringify(localOrigin)};
const httpsUrl = ${JSON.stringify(httpsUrl)};

function image(src: string): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve("loaded");
		img.onerror = () => resolve("refused");
		img.src = src;
	});
}

async function reach() {
	const result = {
		vendored: typeof ui.go === "function" ? "loaded" : "missing",
		localFetch: await fetch(localOrigin + "/fetch").then(() => "reached", () => "refused"),
		localImage: await image(localOrigin + "/image.png"),
		localScript: await import(/* @vite-ignore */ localOrigin + "/module.js").then(() => "reached", () => "refused"),
		httpsFetch: await fetch(httpsUrl).then((response) => response.text(), (error) => "failed: " + String(error)),
		dataImage: await image(${JSON.stringify(ONE_PIXEL_PNG)}),
	};
	console.log("reach " + JSON.stringify(result));
	return result;
}

export default function Reach() {
	const [result, setResult] = useState<object | null>(null);
	useEffect(() => {
		void reach().then(setResult);
	}, []);
	return result === null ? null : <pre id="reach">{JSON.stringify(result)}</pre>;
}
`;
}

/** A plain-http server on loopback that counts every request that ever arrives. */
async function serveLocalHttp(): Promise<{ origin: string; arrived: string[]; close(): Promise<void> }> {
	const arrived: string[] = [];
	const server = createServer((request, response) => {
		arrived.push(request.url ?? "");
		response.setHeader("access-control-allow-origin", "*");
		response.end("reached");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	return {
		origin: `http://127.0.0.1:${port}`,
		arrived,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}

/**
 * An https endpoint on loopback the booth's own browser can only knock on:
 * its certificate is nobody's, so the knock is the proof the policy let it go.
 */
async function serveTlsKnock(): Promise<{ url: string; knocks(): number; close(): void }> {
	let knocks = 0;
	const server = createTlsServer(() => {});
	server.on("connection", () => knocks++);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	return { url: `https://127.0.0.1:${port}/knock`, knocks: () => knocks, close: () => server.close() };
}

describe("frames are https-only", () => {
	it("keeps the canvas, the player, spool shot and the booth off plain http, and https, data: and vendored libraries on", {
		timeout: 180_000,
	}, async () => {
		const browser = await launchBrowser();
		if (browser === undefined) return;
		onTestFinished(() => browser.close());
		const local = await serveLocalHttp();
		onTestFinished(() => local.close());
		const knock = await serveTlsKnock();
		onTestFinished(() => knock.close());

		const project = await serveProject({ uiDir: await builtUi(), booth: { systemScheme: async () => "light" } });
		const control = { "X-Spool-Control": project.controlToken };
		const session = await fetch(`${project.url}/api/session`, {
			method: "PUT",
			headers: { "content-type": "application/json", ...control },
			body: JSON.stringify({ root: project.root, open: true }),
		});
		expect(session.status).toBe(204);

		// the canvas and the player answer a real https request through the browser's own network
		const httpsUrl = "https://api.spool.test/hello";
		const expected: Reach = {
			vendored: "loaded",
			localFetch: "refused",
			localImage: "refused",
			localScript: "refused",
			httpsFetch: "hello over https",
			dataImage: "loaded",
		};
		writeFrame(project.root, "reach", reachFrameSource(local.origin, httpsUrl));
		const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
		onTestFinished(() => context.close());
		const answered: string[] = [];
		await context.route(httpsUrl, (route) => {
			answered.push(route.request().url());
			return route.fulfill({ body: "hello over https", headers: { "access-control-allow-origin": "*" } });
		});
		const reachOf = async (frame: Frame) => {
			await frame.locator("#reach").waitFor({ timeout: 30_000 });
			return JSON.parse(await frame.locator("#reach").innerText()) as Reach;
		};

		const canvas = await context.newPage();
		const consoleLines: string[] = [];
		canvas.on("console", (message) => {
			consoleLines.push(message.text());
		});
		await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
		expect(await reachOf(await childFrame(canvas, 'iframe[title="reach"]'))).toEqual(expected);
		// the frame's console says what was refused, address and all
		const refusal = `Connecting to '${local.origin}/fetch' violates the following Content Security Policy directive`;
		expect(consoleLines.some((line) => line.startsWith(refusal))).toBe(true);

		const player = await context.newPage();
		await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=reach`);
		expect(await reachOf(await childFrame(player, "#spool-player"))).toEqual(expected);
		expect(answered.length).toBe(2);

		// spool shot runs in the booth's browser, where https can only be knocked on
		writeFrame(project.root, "knock", reachFrameSource(local.origin, knock.url));
		const deps = {
			daemonUrl: project.url,
			controlToken: project.controlToken,
			root: project.root,
			name: project.name,
		};
		const shot = await shotFrame({ ...deps, frame: "knock", narrate: () => {} });
		expect(shot.kind).toBe("shot");
		const logs = await logsFrame({ ...deps, frame: "knock", narrate: () => {} });
		if (logs.kind !== "logs") throw new Error(`logs failed: ${JSON.stringify(logs)}`);
		const reported = logs.entries.find((entry) => entry.text.startsWith("reach "));
		expect(JSON.parse(reported?.text.slice("reach ".length) ?? "null")).toMatchObject({
			...expected,
			httpsFetch: expect.stringMatching(/^failed: /),
		});
		expect(knock.knocks()).toBeGreaterThan(0);
		expect(logs.entries.some((entry) => entry.text.startsWith(refusal))).toBe(true);

		// and the booth photographs both under the same policy
		await expect
			.poll(
				async () => {
					const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, {
						headers: control,
					});
					const { frames } = (await res.json()) as { frames: { name: string; cover?: unknown }[] };
					return frames.filter((frame) => frame.cover !== undefined).length;
				},
				{ timeout: 60_000 },
			)
			.toBe(2);
		expect(local.arrived).toEqual([]);
	});
});
