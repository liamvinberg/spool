import { rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { terminalSourceVersion } from "./term-source";

interface Probe {
	rect: { width: number; height: number; x: number; y: number };
	viewport: { width: number; height: number };
	collisions: {
		boot: { rect: { width: number; height: number; x: number; y: number }; position: string; display: string };
		term: { rect: { width: number; height: number; x: number; y: number }; position: string; background: string };
	};
}

async function installPlayerMountGate(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown; command?: unknown } | null;
				if (
					holding &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-command" &&
					candidate.command === "mount"
				) {
					held.push({ port: this, message });
					return;
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolMountGate", {
			value: {
				hold() {
					holding = true;
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	});
}

async function installPlayerGeometryGate(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown } | null;
				if (
					holding &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-geometry"
				) {
					held.push({ port: this, message });
					return;
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolGeometryGate", {
			value: {
				hold() {
					holding = true;
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	});
}

async function installPlayerTransitionGate(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown; command?: unknown } | null;
				if (
					holding &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-command" &&
					candidate.command === "transition"
				) {
					held.push({ port: this, message });
					return;
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolTransitionGate", {
			value: {
				hold() {
					holding = true;
				},
				held() {
					return held.length;
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	});
}

async function installPlayerTransitionGeometryRace(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		let nextGeometry: { name: string; w: number; h: number }[] | undefined;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown; command?: unknown } | null;
				nativePostMessage.call(this, message);
				if (
					nextGeometry !== undefined &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-command" &&
					candidate.command === "transition"
				) {
					const frames = nextGeometry;
					nextGeometry = undefined;
					window.dispatchEvent(
						new CustomEvent("spool-player-geometry", {
							detail: { revision: 1_000_000, frames },
						}),
					);
				}
			},
		});
		Object.defineProperty(window, "__spoolTransitionGeometryRace", {
			value: {
				arm(frames: { name: string; w: number; h: number }[]) {
					nextGeometry = frames;
				},
			},
		});
	});
}

async function installPlayerTransitionCommitGate(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown; command?: unknown } | null;
				if (
					holding &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-command" &&
					candidate.command === "transition-commit"
				) {
					held.push({ port: this, message });
					return;
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolTransitionCommitGate", {
			value: {
				hold() {
					holding = true;
				},
				held() {
					return held.length;
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	});
}

async function installPlayerTransitionApplyGate(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				const candidate = message as { spool?: unknown; command?: unknown } | null;
				if (
					holding &&
					candidate !== null &&
					typeof candidate === "object" &&
					candidate.spool === "player-command" &&
					candidate.command === "transition-apply"
				) {
					held.push({ port: this, message });
					return;
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolTransitionApplyGate", {
			value: {
				hold() {
					holding = true;
				},
				held() {
					return held.length;
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	});
}

async function installPlayerRuntimeMessageGate(page: Page, spool: string): Promise<void> {
	await page.addInitScript((heldSpool) => {
		if (window.top === window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		const held: { port: MessagePort; message: unknown }[] = [];
		const observed: string[] = [];
		let port: MessagePort | undefined;
		let holding = false;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				port = this;
				const candidate = message as { spool?: unknown } | null;
				if (candidate !== null && typeof candidate === "object" && typeof candidate.spool === "string") {
					observed.push(candidate.spool);
					if (holding && candidate.spool === heldSpool) {
						held.push({ port: this, message });
						return;
					}
				}
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolRuntimeMessageGate", {
			value: {
				hold() {
					holding = true;
				},
				held() {
					return held.length;
				},
				messages() {
					return held.map((entry) => entry.message);
				},
				observed() {
					return [...observed];
				},
				send(message: unknown) {
					if (port === undefined) throw new Error("player runtime port is not connected");
					nativePostMessage.call(port, message);
				},
				releaseNext() {
					const entry = held.shift();
					if (entry !== undefined) nativePostMessage.call(entry.port, entry.message);
				},
				release() {
					holding = false;
					for (const entry of held.splice(0)) nativePostMessage.call(entry.port, entry.message);
				},
			},
		});
	}, spool);
}

async function installPlayerCommandInjector(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const nativePostMessage = MessagePort.prototype.postMessage;
		let port: MessagePort | undefined;
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				port = this;
				nativePostMessage.call(this, message);
			},
		});
		Object.defineProperty(window, "__spoolCommandInjector", {
			value: {
				send(message: unknown) {
					if (port === undefined) throw new Error("player shell port is not connected");
					nativePostMessage.call(port, message);
				},
			},
		});
	});
}

async function installPlayerPrebootFlood(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (window.top === window) return;
		const nativeAddEventListener = MessagePort.prototype.addEventListener;
		Object.defineProperty(MessagePort.prototype, "addEventListener", {
			configurable: true,
			value(
				this: MessagePort,
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions,
			) {
				nativeAddEventListener.call(this, type, listener, options);
				if (type !== "message") return;
				for (let index = 0; index < 32; index++) {
					this.dispatchEvent(
						new MessageEvent("message", {
							data: {
								spool: "player-command",
								command: "toggle-motion",
								generation: 0,
								frame: "start",
							},
						}),
					);
				}
			},
		});
	});
}

const same = `export default function Same() {
	return <main><button id="to-same" data-go="same-next">same</button><button id="to-cross" data-go="cross">cross</button><div id="probe" style={{ width: 200, height: 100 }}>same</div><div id="authored-boot" className="spool-boot">authored boot</div><div id="authored-term" className="spool-term-screen">authored terminal</div></main>;
}
`;

const sameNext = `export default function SameNext() {
	return <main><button id="to-cross" data-go="cross">cross</button><div id="probe" style={{ width: 200, height: 100 }}>same-next</div><div id="authored-boot" className="spool-boot">authored boot</div><div id="authored-term" className="spool-term-screen">authored terminal</div></main>;
}
`;

const cross = `export default function Cross() {
	const firstViewport = window.__crossFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main><output id="first-viewport">{firstViewport}</output><div id="probe" style={{ width: 200, height: 100 }}>cross</div><div id="authored-boot" className="spool-boot">authored boot</div><div id="authored-term" className="spool-term-screen">authored terminal</div></main>;
}
`;

it("keeps frame measurements native through canvas and player walks", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "same", same);
	writeFrame(project.root, "same-next", sameNext);
	writeFrame(project.root, "cross", cross);
	writeDesignFile(project.root, "frames/same/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/same-next/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/cross/frame.json", '{ "x": 0, "y": 0, "w": 720, "h": 480 }\n');
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const read = async (frame: Frame): Promise<Probe> =>
		frame.locator("#probe").evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const boot = document.querySelector<HTMLElement>("#authored-boot");
			const term = document.querySelector<HTMLElement>("#authored-term");
			if (boot === null || term === null) throw new Error("missing authored collision probes");
			const bootRect = boot.getBoundingClientRect();
			const termRect = term.getBoundingClientRect();
			const bootStyle = getComputedStyle(boot);
			const termStyle = getComputedStyle(term);
			return {
				rect: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
				viewport: { width: innerWidth, height: innerHeight },
				collisions: {
					boot: {
						rect: { width: bootRect.width, height: bootRect.height, x: bootRect.x, y: bootRect.y },
						position: bootStyle.position,
						display: bootStyle.display,
					},
					term: {
						rect: { width: termRect.width, height: termRect.height, x: termRect.x, y: termRect.y },
						position: termStyle.position,
						background: termStyle.backgroundColor,
					},
				},
			};
		});

	const bare = await context.newPage();
	await bare.setViewportSize({ width: 390, height: 844 });
	await bare.goto(`${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/same`);
	const bareFrame = bare.mainFrame();
	await bareFrame.locator("#probe").waitFor();
	const bareProbe = await read(bareFrame);

	const canvas = await context.newPage();
	await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const canvasFrame = canvas.frameLocator('iframe[title="same"]');
	await canvasFrame.locator("#probe").waitFor();
	const canvasProbe = await canvasFrame.locator("#probe").evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const boot = document.querySelector<HTMLElement>("#authored-boot");
		const term = document.querySelector<HTMLElement>("#authored-term");
		if (boot === null || term === null) throw new Error("missing authored collision probes");
		const bootRect = boot.getBoundingClientRect();
		const termRect = term.getBoundingClientRect();
		const bootStyle = getComputedStyle(boot);
		const termStyle = getComputedStyle(term);
		return {
			rect: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
			viewport: { width: innerWidth, height: innerHeight },
			collisions: {
				boot: {
					rect: { width: bootRect.width, height: bootRect.height, x: bootRect.x, y: bootRect.y },
					position: bootStyle.position,
					display: bootStyle.display,
				},
				term: {
					rect: { width: termRect.width, height: termRect.height, x: termRect.x, y: termRect.y },
					position: termStyle.position,
					background: termStyle.backgroundColor,
				},
			},
		};
	});

	const player = await context.newPage();
	await player.addInitScript(() => {
		const trace: string[] = [];
		Object.defineProperty(window, "__spoolInitialTrace", { value: trace });
		const seen = new WeakSet<Element>();
		new MutationObserver(() => {
			const host = document.querySelector<HTMLIFrameElement>("#spool-player");
			const screen = document.querySelector<HTMLElement>(".spool-screen");
			if (host === null || screen === null) return;
			const record = () => trace.push(`${host.style.opacity}:${screen.style.width}×${screen.style.height}`);
			if (!seen.has(host)) {
				seen.add(host);
				record();
				new MutationObserver(record).observe(host, { attributes: true, attributeFilter: ["style"] });
				new MutationObserver(record).observe(screen, { attributes: true, attributeFilter: ["style"] });
			}
		}).observe(document, { childList: true, subtree: true });
	});
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=same`);
	const playerFrame = player.frameLocator("#spool-player");
	await playerFrame.locator("#probe").waitFor();
	await player.waitForFunction(
		() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1",
	);
	const live = player.frames().find((frame) => frame !== player.mainFrame()) as Frame;
	const playerProbe = await read(live);
	expect(playerProbe.viewport).toEqual({ width: 390, height: 844 });
	expect(playerProbe).toEqual(bareProbe);
	expect(canvasProbe).toEqual(bareProbe);
	const initialTrace = await player.evaluate(
		() => (window as unknown as { __spoolInitialTrace: string[] }).__spoolInitialTrace,
	);
	expect(initialTrace[0]).toBe("0:390px×844px");
	expect(initialTrace.at(-1)).toBe("1:390px×844px");

	await live.evaluate(() => {
		const original = document.startViewTransition?.bind(document);
		let calls = 0;
		Object.defineProperty(window, "__spoolTransitions", { value: () => calls });
		if (original !== undefined)
			document.startViewTransition = ((options) => {
				calls++;
				return original(options);
			}) as typeof document.startViewTransition;
	});
	await playerFrame.locator("#to-same").click();
	await playerFrame.getByText("same-next").waitFor();
	expect(
		await live.evaluate(() => (window as unknown as { __spoolTransitions: () => number }).__spoolTransitions()),
	).toBe(1);
	await live.evaluate(
		() =>
			new Promise<void>((resolve) => {
				parent.postMessage(
					{ spool: "player-resize", generation: 2, from: "same-next", to: "same", w: 390, h: 844 },
					"*",
				);
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
	expect(await player.locator("#spool-player").evaluate((host) => getComputedStyle(host).opacity)).toBe("1");

	await player.evaluate(() => {
		const host = document.querySelector<HTMLIFrameElement>("#spool-player");
		const screen = document.querySelector<HTMLElement>(".spool-screen");
		if (host === null || screen === null) throw new Error("player shell did not mount its host");
		const trace: string[] = [];
		const record = () => trace.push(`${host.style.opacity}:${screen.style.width}×${screen.style.height}`);
		record();
		new MutationObserver(record).observe(host, { attributes: true, attributeFilter: ["style"] });
		new MutationObserver(record).observe(screen, { attributes: true, attributeFilter: ["style"] });
		Object.defineProperty(window, "__spoolCutTrace", { value: trace });
	});
	await playerFrame.locator("#to-cross").click();
	await playerFrame.getByText("cross").waitFor();
	await player.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "cross",
		undefined,
		{ timeout: 5_000 },
	);
	const crossProbe = await read(live);
	expect(crossProbe.viewport).toEqual({ width: 720, height: 480 });
	expect(await playerFrame.locator("#first-viewport").innerText()).toBe("720×480");
	expect(crossProbe.rect).toEqual({ width: 200, height: 100, x: bareProbe.rect.x, y: bareProbe.rect.y });
	expect(
		await live.evaluate(() => (window as unknown as { __spoolTransitions: () => number }).__spoolTransitions()),
	).toBe(1);
	const cutTrace = await player.evaluate(() => (window as unknown as { __spoolCutTrace: string[] }).__spoolCutTrace);
	const hidden = cutTrace.findIndex((entry) => entry.startsWith("0:"));
	const resized = cutTrace.findIndex((entry) => entry.includes("720px×480px"));
	const revealed = cutTrace.findIndex((entry, index) => index > resized && entry.startsWith("1:"));
	expect(hidden).toBeGreaterThanOrEqual(0);
	expect(resized).toBeGreaterThan(hidden);
	expect(revealed).toBeGreaterThan(resized);

	const geometryRefresh = player.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
		{ timeout: 5_000 },
	);
	const liveGeometry = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { cross: { x: 0, y: 0, w: 600, h: 600 } } }),
	});
	expect(liveGeometry.status).toBe(204);
	await geometryRefresh;
	await live.waitForFunction(() => innerWidth === 600 && innerHeight === 600, undefined, { timeout: 5_000 });
	expect((await read(live)).viewport).toEqual({ width: 600, height: 600 });

	// Stale generation, stale frame, wrong dimensions, malformed nested state,
	// and a forged WindowProxy are all inert.
	await live.evaluate(() => {
		parent.postMessage({ spool: "player-resize", generation: 1, from: "cross", to: "same", w: 390, h: 844 }, "*");
		parent.postMessage({ spool: "player-resize", generation: 3, from: "same", to: "same-next", w: 390, h: 844 }, "*");
		parent.postMessage({ spool: "player-resize", generation: 3, from: "cross", to: "same", w: 391, h: 844 }, "*");
		parent.postMessage(
			{
				spool: "player-state",
				generation: 2,
				sequence: 999,
				state: {
					frame: "cross",
					stack: [],
					motion: true,
					arrival: 2,
					externalHref: null,
					log: [{ kind: "go", from: "same", to: "cross", at: 1, changed: [], snapshot: { secret: true } }],
					mock: [],
					elapsed: 1,
					state: { scenario: "default", rows: [] },
				},
			},
			"*",
		);
		parent.postMessage(
			{
				spool: "player-state",
				generation: 2,
				sequence: 1000,
				state: {
					frame: "cross",
					stack: [],
					motion: true,
					arrival: 2,
					externalHref: "javascript:alert(1)",
					log: [],
					mock: [],
					elapsed: 1,
					state: { scenario: "default", rows: [] },
				},
			},
			"*",
		);
	});
	await player.evaluate(() => {
		const forged = document.createElement("iframe");
		document.body.append(forged);
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "player-state",
					state: {
						frame: "same",
						stack: [],
						motion: true,
						arrival: 0,
						externalHref: null,
						log: [],
						mock: [],
						state: { scenario: "default", rows: [] },
					},
				},
				source: forged.contentWindow,
			}),
		);
		forged.remove();
	});
	await player.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
	expect((await read(live)).viewport).toEqual({ width: 600, height: 600 });
	expect(await player.locator(".spool-pill-name").innerText()).toBe("cross");
	expect(await player.locator('[role="dialog"]').count()).toBe(0);
});

it("plays a frame whose name is inherited by ordinary objects", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"constructor",
		'export default function Constructor() { return <main id="constructor-frame">constructor</main>; }\n',
	);
	writeDesignFile(project.root, "frames/constructor/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=constructor`);
	const inner = page.frameLocator("#spool-player");

	await inner.locator("#constructor-frame").waitFor({ state: "attached" });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "constructor",
		undefined,
		{ timeout: 5_000 },
	);
	expect(
		await inner.locator("#constructor-frame").evaluate(() => ({ width: innerWidth, height: innerHeight })),
	).toEqual({
		width: 390,
		height: 844,
	});
});

it("plays a frame named __proto__", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"__proto__",
		'export default function Proto() { return <main id="proto-frame">proto</main>; }\n',
	);
	writeDesignFile(project.root, "frames/__proto__/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=__proto__`);
	const inner = page.frameLocator("#spool-player");

	await inner.locator("#proto-frame").waitFor({ state: "attached" });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "__proto__",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#proto-frame").innerText()).toBe("proto");
});

it("does not hand a private player port to foreign or replayed shell embeds", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "home", 'export default function Home() { return <main id="home">home</main>; }\n');

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);
	await player.frameLocator("#spool-player").locator("#home").waitFor();
	const consumedUrl = await player.locator("#spool-player").getAttribute("src");
	expect(consumedUrl).toContain("handoff=");

	await player.reload();
	await player.frameLocator("#spool-player").locator("#home").waitFor();

	const foreign = await context.newPage();
	const received = async (src: string) =>
		foreign.evaluate(
			(url) =>
				new Promise<string[]>((resolve) => {
					const messages: string[] = [];
					const receive = (event: MessageEvent) => {
						const spool =
							typeof event.data === "object" && event.data !== null && "spool" in event.data
								? String((event.data as { spool: unknown }).spool)
								: "";
						if (spool !== "") messages.push(spool);
					};
					addEventListener("message", receive);
					const iframe = document.createElement("iframe");
					iframe.addEventListener("load", () => {
						setTimeout(() => {
							removeEventListener("message", receive);
							iframe.remove();
							resolve(messages);
						}, 250);
					});
					iframe.src = url;
					document.body.append(iframe);
				}),
			src,
		);

	for (const messages of [
		await received(consumedUrl ?? ""),
		await received(`${project.renderUrl}/play/${encodeURIComponent(project.name)}?frame=home&shell=1`),
	]) {
		expect(messages).not.toContain("player-connect");
		expect(messages).not.toContain("player-state");
	}
});

it("recovers the player when the browser refetches the inner frame", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "home", 'export default function Home() { return <main id="home">home</main>; }\n');

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);
	await player.frameLocator("#spool-player").locator("#home").waitFor();

	// The exact death in #88: anything that refetches the inner URL spends a
	// one-time handoff, and the player used to stay dead until a human reloaded.
	await player.evaluate(() => {
		(window as unknown as { __beforeRepair?: true }).__beforeRepair = true;
	});
	await player.evaluate(() => {
		const frame = document.querySelector<HTMLIFrameElement>("#spool-player");
		if (frame === null) return;
		// Re-assigning the same address is the browser fetching this document a
		// second time, which is all the issue's repro needs.
		const source = frame.src;
		frame.src = source;
	});

	// A repaired shell serves itself again, which is what mints the fresh handoff.
	await player.waitForFunction(() => (window as unknown as { __beforeRepair?: true }).__beforeRepair === undefined);
	await player.frameLocator("#spool-player").locator("#home").waitFor();
	expect(await player.locator(".spool-player-error").count()).toBe(0);
});

it("plays the healthy frames and errors only on the broken one", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"home",
		'export default function Home() { return <button id="home" data-go="broken">home</button>; }\n',
	);
	writeFrame(project.root, "broken", 'import { missing } from "../../shared/lib/absent";\nexport default missing;\n');

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	// The healthy frame plays, though a sibling cannot compile at all.
	const inner = player.frameLocator("#spool-player");
	await inner.locator("#home").waitFor();
	expect(await player.locator(".spool-player-error").count()).toBe(0);

	// Walking to the broken one is where its failure finally shows up.
	await inner.locator("#home").click();
	const card = inner.locator(".spool-broken-frame");
	await card.waitFor();
	const text = await card.innerText();
	expect(text).toContain("broken failed to compile");
	expect(text).toContain("Fix the compile error in design/frames/broken/frame.tsx");
	// The player itself never failed, so the shell shows no load error.
	expect(await player.locator(".spool-player-error").count()).toBe(0);
});

it("plays on when a browser extension's script throws inside the frame", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	// What MetaMask's inpage.js does to every page it is injected into. It runs in
	// this document's realm, so its rejection lands on spool's listeners.
	writeFrame(
		project.root,
		"home",
		`const failure = new Error("Failed to connect to MetaMask");
failure.stack = 'i: Failed to connect to MetaMask\\n    at Object.connect (chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js:7:84179)';
dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: failure }));

export default function Home() {
	return <main id="home">home</main>;
}
`,
	);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	await player.frameLocator("#spool-player").locator("#home").waitFor();
	expect(await player.locator(".spool-player-error").count()).toBe(0);
});

it("still blames the frame for a failure thrown by its own code", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"home",
		`dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
	promise: Promise.resolve(),
	reason: new Error("the frame's own fault"),
}));

export default function Home() {
	return <main id="home">home</main>;
}
`,
	);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	await expect.poll(() => player.locator(".spool-player-error").count()).toBe(1);
	expect(await player.locator(".spool-player-error").innerText()).toContain("the frame's own fault");
});

it("plays on when an injected wallet shim fails without a scheme in its stack", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	// The same MetaMask death as above, as it looks when the shim is injected
	// inline: no chrome-extension:// anywhere, only bare inpage.js frames (#185).
	writeFrame(
		project.root,
		"home",
		`const failure = new Error("MetaMask extension not found");
failure.stack = 'Error: MetaMask extension not found\\n    at Object.connect (inpage.js:7:84179)\\n    at inpage.js:4:41709';
dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: failure }));

export default function Home() {
	return <main id="home">home</main>;
}
`,
	);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	await player.frameLocator("#spool-player").locator("#home").waitFor();
	expect(await player.locator(".spool-player-error").count()).toBe(0);
});

it("names a mute player instead of hiding it and offers the bare player", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "home", 'export default function Home() { return <main id="home">home</main>; }\n');

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	// An extension that kills the runtime before it can speak looks, from the
	// shell's seat, like player-connect simply never arriving (#185).
	await player.addInitScript(() => {
		if (window.top !== window) return;
		window.addEventListener(
			"message",
			(event) => {
				const data = event.data as { spool?: unknown } | null;
				if (typeof data === "object" && data !== null && data.spool === "player-connect") {
					event.stopImmediatePropagation();
				}
			},
			true,
		);
	});
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	// White is indistinguishable from loading until the deadline names it.
	await player.locator(".spool-player-error").waitFor({ timeout: 20_000 });
	expect(await player.locator(".spool-player-error pre").innerText()).toContain("never connected");
	const hatch = player.locator(".spool-player-escape");
	const href = await hatch.getAttribute("href");
	expect(href).not.toBeNull();
	expect(href).toContain("/play/");
	expect(href).not.toContain("shell=1");
	expect(href).not.toContain("handoff=");

	// The escape hatch is a real door: the bare player mounts the prototype.
	await hatch.click();
	await player.locator("#home").waitFor({ timeout: 20_000 });
});

it("names a player that connects but is starved of animation frames", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "home", 'export default function Home() { return <main id="home">home</main>; }\n');

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	// What headed Chromium does to a render-throttled iframe (#185): the runtime
	// connects, then its animation-frame gates never run, so player-ready and
	// the geometry acks never leave. The shell must not hide that forever.
	await player.addInitScript(() => {
		if (window.top === window) return;
		window.requestAnimationFrame = () => 0;
	});
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);

	await player.locator(".spool-player-error").waitFor({ timeout: 20_000 });
	expect(await player.locator(".spool-player-error pre").innerText()).toContain("first stable layout");

	// The same door out: the bare player is top-level, so nothing throttles it.
	await player.locator(".spool-player-escape").click();
	await player.locator("#home").waitFor({ timeout: 20_000 });
});

it("ignores an authored exact resize while real runtime navigation still works", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`const target = (window as unknown as {
	__SPOOL_PLAY__: { frames: Record<string, { w: number; h: number }> };
}).__SPOOL_PLAY__.frames.target;
const forged = new MessageChannel();
parent.postMessage({
	spool: "player-connect",
	frames: [{ name: "start", w: 390, h: 844 }, { name: "target", w: target?.w, h: target?.h }],
}, "*", [forged.port2]);
const nativePortPostMessage = MessagePort.prototype.postMessage;
Object.defineProperty(MessagePort.prototype, "postMessage", {
	configurable: true,
	value(message: unknown) {
		if (typeof message === "object" && message !== null && "spool" in message) {
			throw new Error("authored MessagePort.postMessage");
		}
		nativePortPostMessage.call(this, message);
	},
});
if (target) {
	parent.postMessage({
		spool: "player-resize",
		generation: 1,
		from: "start",
		to: "target",
		w: target.w,
		h: target.h,
	}, "*");
}
parent.postMessage({ spool: "player-load-error", error: "authored failure" }, "*");
parent.postMessage({ spool: "player-walked", from: "start", to: "target" }, "*");
export default function Start() {
	return <button id="to-target" data-go="target">target</button>;
}
`,
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	return <main id="target">target</main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "start",
		undefined,
		{ timeout: 5_000 },
	);
	const targetVerified = async () => {
		const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/flows`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const flows = (await response.json()) as {
			edges?: { from?: string; to?: string; verified?: boolean }[];
		};
		return flows.edges?.find((edge) => edge.from === "start" && edge.to === "target")?.verified === true;
	};
	expect(await targetVerified()).toBe(false);
	expect(await page.locator('[role="alert"]').count()).toBe(0);

	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").click();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
		undefined,
		{ timeout: 5_000 },
	);
	await inner.locator("#target").waitFor();
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
	await expect.poll(targetVerified).toBe(true);
});

it("waits for current geometry when shell and runtime snapshots split", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`export default function Start() {
	return <main id="start"><button id="to-target" data-go="target">target</button></main>;
}
`,
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	return <main id="target">target</main>;
}
`,
	);
	const writeGeometry = (start: number, target: number) => {
		writeDesignFile(
			project.root,
			"frames/start/frame.json",
			`${JSON.stringify({ x: 0, y: 0, w: start, h: start })}\n`,
		);
		writeDesignFile(
			project.root,
			"frames/target/frame.json",
			`${JSON.stringify({ x: start + 10, y: 0, w: target, h: target })}\n`,
		);
	};
	writeGeometry(390, 720);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const visibleSizes: string[] = [];
		Object.defineProperty(window, "__spoolVisibleSizes", { value: visibleSizes });
		const record = () => {
			const host = document.querySelector<HTMLIFrameElement>("#spool-player");
			const screen = document.querySelector<HTMLElement>(".spool-screen");
			if (host?.style.opacity === "1" && screen !== null) {
				visibleSizes.push(`${screen.style.width}×${screen.style.height}`);
			}
		};
		new MutationObserver(record).observe(document, {
			attributes: true,
			attributeFilter: ["style"],
			childList: true,
			subtree: true,
		});
	});
	let innerRequestedResolve: () => void = () => {};
	const innerRequested = new Promise<void>((resolve) => {
		innerRequestedResolve = resolve;
	});
	let snapshotInnerResolve: () => void = () => {};
	const snapshotInner = new Promise<void>((resolve) => {
		snapshotInnerResolve = resolve;
	});
	let innerCapturedResolve: () => void = () => {};
	const innerCaptured = new Promise<void>((resolve) => {
		innerCapturedResolve = resolve;
	});
	let releaseInnerResolve: () => void = () => {};
	const releaseInner = new Promise<void>((resolve) => {
		releaseInnerResolve = resolve;
	});
	const cdp = await page.context().newCDPSession(page);
	cdp.on("Fetch.requestPaused", async (event) => {
		innerCapturedResolve();
		await releaseInner;
		await cdp.send("Fetch.continueResponse", { requestId: event.requestId });
	});
	await cdp.send("Fetch.enable", {
		patterns: [
			{
				urlPattern: `${project.renderUrl}/play/${encodeURIComponent(project.name)}*`,
				requestStage: "Response",
			},
		],
	});
	await page.route(`${project.renderUrl}/play/${encodeURIComponent(project.name)}**`, async (route) => {
		innerRequestedResolve();
		await snapshotInner;
		await route.continue();
	});
	let snapshotFirstGeometryResolve: () => void = () => {};
	const snapshotFirstGeometry = new Promise<void>((resolve) => {
		snapshotFirstGeometryResolve = resolve;
	});
	let firstGeometryCapturedResolve: () => void = () => {};
	const firstGeometryCaptured = new Promise<void>((resolve) => {
		firstGeometryCapturedResolve = resolve;
	});
	let nextGeometryCapturedResolve: () => void = () => {};
	const nextGeometryCaptured = new Promise<void>((resolve) => {
		nextGeometryCapturedResolve = resolve;
	});
	let releaseNextGeometryResolve: () => void = () => {};
	const releaseNextGeometry = new Promise<void>((resolve) => {
		releaseNextGeometryResolve = resolve;
	});
	let geometryRequest = 0;
	await page.route(`**/api/p/${project.name}/frames`, async (route) => {
		geometryRequest++;
		if (geometryRequest === 1) {
			await snapshotFirstGeometry;
			const response = await route.fetch();
			firstGeometryCapturedResolve();
			await route.fulfill({ response });
			return;
		}
		if (geometryRequest === 2) {
			const response = await route.fetch();
			nextGeometryCapturedResolve();
			await releaseNextGeometry;
			await route.fulfill({ response });
			return;
		}
		await releaseNextGeometry;
		await route.continue();
	});

	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	await innerRequested;
	writeGeometry(500, 500);
	snapshotInnerResolve();
	await innerCaptured;
	snapshotFirstGeometryResolve();
	await firstGeometryCaptured;
	await page.waitForFunction(() => {
		const host = document.querySelector<HTMLIFrameElement>("#spool-player");
		const screen = document.querySelector<HTMLElement>(".spool-screen");
		return host?.style.opacity === "0" && screen?.style.width === "500px" && screen.style.height === "500px";
	});

	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({
			frames: {
				start: { x: 0, y: 0, w: 600, h: 600 },
				target: { x: 610, y: 0, w: 600, h: 600 },
			},
		}),
	});
	expect(update.status).toBe(204);
	await nextGeometryCaptured;
	releaseInnerResolve();
	await navigation;
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor({ state: "attached" });
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			}),
	);
	expect(await page.locator("#spool-player").evaluate((host) => host.style.opacity)).toBe("0");
	expect(
		await page.locator(".spool-screen").evaluate((screen) => `${screen.style.width}×${screen.style.height}`),
	).toBe("500px×500px");

	releaseNextGeometryResolve();
	await page.waitForFunction(
		() => {
			const host = document.querySelector<HTMLIFrameElement>("#spool-player");
			const screen = document.querySelector<HTMLElement>(".spool-screen");
			return host?.style.opacity === "1" && screen?.style.width === "600px" && screen.style.height === "600px";
		},
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#start").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 600,
		height: 600,
	});
	const visibleSizes = await page.evaluate(
		() => (window as unknown as { __spoolVisibleSizes: string[] }).__spoolVisibleSizes,
	);
	expect(visibleSizes).not.toContain("500px×500px");
	expect(visibleSizes.at(-1)).toBe("600px×600px");

	await inner.locator("#to-target").click();
	await page.waitForFunction(() => document.querySelector(".spool-pill-name")?.textContent === "target");
	await inner.locator("#target").waitFor();
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 600,
		height: 600,
	});
});

it("reveals the last valid geometry while live geometry transport retries", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "start", 'export default function Start() { return <main id="start">start</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	let geometryRequests = 0;
	await page.route(`**/api/p/${project.name}/events`, (route) =>
		route.fulfill({ status: 503, contentType: "text/plain", body: "events unavailable" }),
	);
	await page.route(`**/api/p/${project.name}/frames`, (route) => {
		geometryRequests++;
		return geometryRequests === 1
			? route.fulfill({ status: 200, contentType: "application/json", body: "not json" })
			: route.fulfill({ status: 503, contentType: "text/plain", body: "geometry unavailable" });
	});

	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor({ state: "attached" });
	await page.waitForFunction(
		() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#start").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 390,
		height: 844,
	});
	await expect.poll(() => geometryRequests, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
});

it("reveals the preflight geometry while the first live geometry request hangs", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "start", 'export default function Start() { return <main id="start">start</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.route(`**/api/p/${project.name}/events`, (route) =>
		route.fulfill({ status: 503, contentType: "text/plain", body: "events unavailable" }),
	);
	await page.route(`**/api/p/${project.name}/frames`, () => new Promise<void>(() => {}));

	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor({ state: "attached" });
	await page.waitForFunction(
		() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#start").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 390,
		height: 844,
	});
});

it("replays geometry emitted before the shell runtime connects without SSE", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "start", 'export default function Start() { return <main id="start">start</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.route(`**/api/p/${project.name}/events`, (route) =>
		route.fulfill({ status: 503, contentType: "text/plain", body: "events unavailable" }),
	);
	let releaseShellResolve: () => void = () => {};
	const releaseShell = new Promise<void>((resolve) => {
		releaseShellResolve = resolve;
	});
	let shellCapturedResolve: () => void = () => {};
	const shellCaptured = new Promise<void>((resolve) => {
		shellCapturedResolve = resolve;
	});
	await page.route("**/player-assets/player-shell.js", async (route) => {
		const response = await route.fetch();
		shellCapturedResolve();
		await releaseShell;
		await route.fulfill({ response });
	});

	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	await shellCaptured;
	await page.waitForResponse((response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`, {
		timeout: 5_000,
	});
	releaseShellResolve();
	await navigation;

	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor({ state: "attached" });
	await page.waitForFunction(
		() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1",
		undefined,
		{ timeout: 5_000 },
	);
});

it("retains the latest geometry while authored modules delay boot", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
export default function Start() {
	return <main id="start">start</main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.addInitScript(() => {
		Object.defineProperty(window, "__spoolRuntimeConnected", { configurable: true, value: false, writable: true });
		window.addEventListener("spool-player-geometry-request", () => {
			(window as unknown as { __spoolRuntimeConnected: boolean }).__spoolRuntimeConnected = true;
		});
	});
	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	await page.waitForFunction(
		() => (window as unknown as { __spoolRuntimeConnected: boolean }).__spoolRuntimeConnected,
	);
	await page.evaluate(() => {
		const frames = [{ name: "start", w: 640, h: 640 }];
		for (let revision = 100; revision < 140; revision++) {
			window.dispatchEvent(new CustomEvent("spool-player-geometry-pending", { detail: { revision } }));
			window.dispatchEvent(new CustomEvent("spool-player-geometry", { detail: { revision, frames } }));
		}
	});

	await navigation;
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor({ state: "attached" });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector<HTMLElement>(".spool-screen")?.style.width === "640px",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#start").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 640,
		height: 640,
	});
});

it("finishes an in-flight cut at the latest live geometry", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"from",
		`export default function From() {
	return <button id="to-target" data-go="target">target</button>;
}
`,
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	const firstViewport = window.__targetFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main><output id="target-viewport">{firstViewport}</output><button id="to-after" data-go="after">after</button></main>;
}
`,
	);
	writeFrame(project.root, "after", 'export default function After() { return <main id="after">after</main>; }\n');
	writeDesignFile(project.root, "frames/from/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');
	writeDesignFile(project.root, "frames/after/frame.json", '{ "x": 800, "y": 0, "w": 600, "h": 600 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerMountGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=from`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "from",
	);
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolMountGate: { hold(): void };
			}
		).__spoolMountGate.hold();
	});

	await inner.locator("#to-target").click();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "0");

	const geometryRefresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { target: { x: 400, y: 0, w: 600, h: 600 } } }),
	});
	expect(update.status).toBe(204);
	await geometryRefresh;
	await page.waitForFunction(
		() => {
			const host = document.querySelector<HTMLIFrameElement>("#spool-player");
			const screen = document.querySelector<HTMLElement>(".spool-screen");
			return host?.style.opacity === "0" && screen?.style.width === "600px" && screen.style.height === "600px";
		},
		undefined,
		{ timeout: 5_000 },
	);

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolMountGate: { release(): void };
			}
		).__spoolMountGate.release();
	});
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#target-viewport").innerText()).toBe("600×600");
	expect(await inner.locator("#target-viewport").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(
		{
			width: 600,
			height: 600,
		},
	);

	await inner.locator("#to-after").click();
	await inner.locator("#after").waitFor();
	expect(await page.locator(".spool-pill-name").innerText()).toBe("after");
});

it("replays a destination mount auto-walk after a cross-size cut settles", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`export default function Start() {
	return <button id="to-target" data-go="target">target</button>;
}
`,
	);
	writeFrame(
		project.root,
		"target",
		`import { useEffect } from "react";
import { ui } from "spool";
export default function Target() {
	useEffect(() => {
		window.__targetAttempts = (window.__targetAttempts ?? 0) + 1;
		ui.go("after");
	}, []);
	return <main id="target">target</main>;
}
`,
	);
	writeFrame(
		project.root,
		"after",
		`export default function After() {
	return <main id="after"><output id="attempts">{window.__targetAttempts ?? 0}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');
	writeDesignFile(project.root, "frames/after/frame.json", '{ "x": 800, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").click();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "after",
		undefined,
		{ timeout: 5_000 },
	);
	await inner.locator("#after").waitFor();
	expect(await inner.locator("#attempts").innerText()).toBe("1");
	expect(await inner.locator("#after").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
});

it("ignores an older geometry response released during a cut", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`export default function Start() {
	return <button id="to-target" data-go="target">target</button>;
}
`,
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	const firstViewport = window.__orderedFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main id="target"><output id="target-viewport">{firstViewport}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerMountGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "start",
	);
	const framesPath = `/api/p/${project.name}/frames`;
	let requestNumber = 0;
	let firstCapturedResolve: () => void = () => {};
	const firstCaptured = new Promise<void>((resolve) => {
		firstCapturedResolve = resolve;
	});
	let releaseFirstResolve: () => void = () => {};
	const releaseFirst = new Promise<void>((resolve) => {
		releaseFirstResolve = resolve;
	});
	await page.route(`**${framesPath}`, async (route) => {
		const response = await route.fetch();
		requestNumber++;
		if (requestNumber === 1) {
			firstCapturedResolve();
			await releaseFirst;
		}
		await route.fulfill({ response });
	});
	const updateGeometry = async (w: number, h: number) => {
		const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
			method: "PUT",
			headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
			body: JSON.stringify({ frames: { target: { x: 400, y: 0, w, h } } }),
		});
		expect(response.status).toBe(204);
	};
	const inner = page.frameLocator("#spool-player");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolMountGate: { hold(): void };
			}
		).__spoolMountGate.hold();
	});
	await inner.locator("#to-target").click();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "0");

	await updateGeometry(500, 500);
	await firstCaptured;
	const latestResponse = page.waitForResponse(async (response) => {
		if (new URL(response.url()).pathname !== framesPath) return false;
		const listing = (await response.json()) as { frames?: { name?: string; w?: number; h?: number }[] };
		return listing.frames?.some((frame) => frame.name === "target" && frame.w === 600 && frame.h === 600) === true;
	});
	await updateGeometry(600, 600);
	await latestResponse;
	await page.waitForFunction(
		() => {
			const screen = document.querySelector<HTMLElement>(".spool-screen");
			return screen?.style.width === "600px" && screen.style.height === "600px";
		},
		undefined,
		{ timeout: 5_000 },
	);

	const staleResponse = page.waitForResponse(async (response) => {
		if (new URL(response.url()).pathname !== framesPath) return false;
		const listing = (await response.json()) as { frames?: { name?: string; w?: number; h?: number }[] };
		return listing.frames?.some((frame) => frame.name === "target" && frame.w === 500 && frame.h === 500) === true;
	});
	releaseFirstResolve();
	await staleResponse;
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
	expect(
		await page.locator(".spool-screen").evaluate((screen) => ({
			width: (screen as HTMLElement).style.width,
			height: (screen as HTMLElement).style.height,
		})),
	).toEqual({ width: "600px", height: "600px" });

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolMountGate: { release(): void };
			}
		).__spoolMountGate.release();
	});
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#target-viewport").innerText()).toBe("600×600");
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 600,
		height: 600,
	});
});

it("classifies old-same new-cross walks from the shell's latest geometry", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		'export default function Target() { return <main id="target"><button id="to-after" data-go="after">after</button></main>; }\n',
	);
	writeFrame(project.root, "after", 'export default function After() { return <main id="after">after</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/after/frame.json", '{ "x": 800, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerGeometryGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolGeometryGate: { hold(): void };
			}
		).__spoolGeometryGate.hold();
	});

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { target: { x: 400, y: 0, w: 720, h: 480 } } }),
	});
	expect(update.status).toBe(204);
	await refresh;
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__SPOOL_SHELL__: { frames: Record<string, { w: number }> };
				}
			).__SPOOL_SHELL__.frames.target?.w === 720,
	);

	await inner.locator("#to-target").click();
	await inner.locator("#target").waitFor();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolGeometryGate: { release(): void };
			}
		).__spoolGeometryGate.release();
	});
	await inner.locator("#to-after").click();
	await inner.locator("#after").waitFor();
	expect(await page.locator(".spool-pill-name").innerText()).toBe("after");
});

it("classifies old-cross new-same walks from the shell's latest geometry", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		'export default function Target() { return <main id="target"><button id="to-after" data-go="after">after</button></main>; }\n',
	);
	writeFrame(project.root, "after", 'export default function After() { return <main id="after">after</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');
	writeDesignFile(project.root, "frames/after/frame.json", '{ "x": 800, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerGeometryGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolGeometryGate: { hold(): void };
			}
		).__spoolGeometryGate.hold();
	});

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { target: { x: 400, y: 0, w: 390, h: 844 } } }),
	});
	expect(update.status).toBe(204);
	await refresh;
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__SPOOL_SHELL__: { frames: Record<string, { w: number }> };
				}
			).__SPOOL_SHELL__.frames.target?.w === 390,
	);

	await inner.locator("#to-target").click();
	await inner.locator("#target").waitFor();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
		undefined,
		{ timeout: 5_000 },
	);
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 390,
		height: 844,
	});

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolGeometryGate: { release(): void };
			}
		).__spoolGeometryGate.release();
	});
	await inner.locator("#to-after").click();
	await inner.locator("#after").waitFor();
	expect(await page.locator(".spool-pill-name").innerText()).toBe("after");
});

it("does not publish same-size destination state before the transition commits", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`import { ui } from "spool";
export default function Start() {
	return <main id="start"><button id="to-target" onClick={() => {
		ui.go("target");
		ui.state.changed = true;
	}}>target</button></main>;
}
`,
	);
	writeFrame(project.root, "target", 'export default function Target() { return <main id="target">target</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { hold(): void };
			}
		).__spoolTransitionGate.hold();
	});

	await inner.locator("#to-target").click();
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await page.locator(".spool-pill-name").innerText()).toBe("start");
	expect(await inner.locator("#start").count()).toBe(1);
	expect(await inner.locator("#target").count()).toBe(0);

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { release(): void };
			}
		).__spoolTransitionGate.release();
	});
	await inner.locator("#target").waitFor();
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("target");
});

it("reclassifies a queued transition when newer geometry arrives before runtime delivery", {
	timeout: 60_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	const firstViewport = window.__targetFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main id="target"><output id="first-viewport">{firstViewport}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionGeometryRace(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGeometryRace: {
					arm(frames: { name: string; w: number; h: number }[]): void;
				};
			}
		).__spoolTransitionGeometryRace.arm([
			{ name: "start", w: 720, h: 480 },
			{ name: "target", w: 720, h: 480 },
		]);
	});

	await inner.locator("#to-target").click();
	await inner.locator("#target").waitFor({ timeout: 5_000 });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
	);
	expect(await inner.locator("#first-viewport").innerText()).toBe("720×480");
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
});

it("mounts a target at newer geometry while its stale transition is held", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	const firstViewport = window.__targetFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main id="target"><output id="first-viewport">{firstViewport}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { hold(): void };
			}
		).__spoolTransitionGate.hold();
	});
	await inner.locator("#to-target").click();

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { target: { x: 400, y: 0, w: 720, h: 480 } } }),
	});
	expect(update.status).toBe(204);
	await refresh;

	await inner.locator("#target").waitFor({ timeout: 5_000 });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
	);
	expect(await inner.locator("#first-viewport").innerText()).toBe("720×480");

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { release(): void };
			}
		).__spoolTransitionGate.release();
	});
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await inner.locator("#first-viewport").innerText()).toBe("720×480");
});

it("reclassifies newer geometry while a transition commit is held", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	const firstViewport = window.__targetFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main id="target"><output id="first-viewport">{firstViewport}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionCommitGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionCommitGate: { hold(): void };
			}
		).__spoolTransitionCommitGate.hold();
	});
	await inner.locator("#to-target").click();
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__spoolTransitionCommitGate: { held(): number };
				}
			).__spoolTransitionCommitGate.held() === 1,
	);

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({
			frames: {
				start: { x: 0, y: 0, w: 720, h: 480 },
				target: { x: 800, y: 0, w: 720, h: 480 },
			},
		}),
	});
	expect(update.status).toBe(204);
	await refresh;

	await inner.locator("#target").waitFor({ timeout: 5_000 });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
	);
	expect(await inner.locator("#first-viewport").innerText()).toBe("720×480");

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionCommitGate: { release(): void };
			}
		).__spoolTransitionCommitGate.release();
	});
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await page.locator(".spool-pill-name").innerText()).toBe("target");
	expect(await inner.locator("#first-viewport").innerText()).toBe("720×480");
});

it("settles newer geometry before revealing a transition whose apply is held", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-target" data-go="target">target</button>; }\n',
	);
	writeFrame(
		project.root,
		"target",
		`export default function Target() {
	return <main id="target"><output id="viewport">{innerWidth + "×" + innerHeight}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionApplyGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionApplyGate: { hold(): void };
			}
		).__spoolTransitionApplyGate.hold();
	});
	await inner.locator("#to-target").click();
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__spoolTransitionApplyGate: { held(): number };
				}
			).__spoolTransitionApplyGate.held() === 1,
	);

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({
			frames: {
				start: { x: 0, y: 0, w: 720, h: 480 },
				target: { x: 800, y: 0, w: 720, h: 480 },
			},
		}),
	});
	expect(update.status).toBe(204);
	await refresh;
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "0");

	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionApplyGate: { release(): void };
			}
		).__spoolTransitionApplyGate.release();
	});
	await inner.locator("#target").waitFor({ timeout: 5_000 });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
	);
	expect(await inner.locator("#viewport").innerText()).toBe("720×480");
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
});

it("runs Restart after a pending transition settles", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <main id="start"><button id="to-target" data-go="target">target</button></main>; }\n',
	);
	writeFrame(project.root, "target", 'export default function Target() { return <main id="target">target</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { hold(): void };
			}
		).__spoolTransitionGate.hold();
	});

	await inner.locator("#to-target").click();
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__spoolTransitionGate: { held(): number };
				}
			).__spoolTransitionGate.held() === 1,
	);
	// far past MAX_PENDING_CONTROLLER_COMMANDS: the oldest are dropped, and
	// whatever survives still drains once the transition settles
	await page.evaluate(() => {
		const restart = document.querySelector<HTMLButtonElement>("#spool-restart");
		if (restart === null) throw new Error("missing restart control");
		for (let index = 0; index < 40; index++) restart.click();
	});
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { release(): void };
			}
		).__spoolTransitionGate.release();
	});

	await inner.locator("#start").waitFor({ timeout: 5_000 });
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("start");
});

it("waits for queued Restart to finish before running the next control", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-middle" data-go="middle">middle</button>; }\n',
	);
	writeFrame(project.root, "middle", 'export default function Middle() { return <main id="middle">middle</main>; }\n');
	for (const [index, frame] of ["start", "middle"].entries()) {
		writeDesignFile(
			project.root,
			`frames/${frame}/frame.json`,
			`{ "x": ${index * 400}, "y": 0, "w": 390, "h": 844 }\n`,
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerTransitionGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-middle").waitFor();

	let releaseScenario: (() => void) | undefined;
	const scenarioRelease = new Promise<void>((resolve) => {
		releaseScenario = resolve;
	});
	let markScenarioRequested: (() => void) | undefined;
	const scenarioRequested = new Promise<void>((resolve) => {
		markScenarioRequested = resolve;
	});
	let scenarioRequests = 0;
	await page.route(`**/api/p/${project.name}/scenarios/default`, async (route) => {
		scenarioRequests++;
		markScenarioRequested?.();
		await scenarioRelease;
		await route.continue();
	});
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolTransitionGate: { hold(): void };
			}
		).__spoolTransitionGate.hold();
	});

	await inner.locator("#to-middle").click();
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__spoolTransitionGate: { held(): number };
				}
			).__spoolTransitionGate.held() === 1,
	);
	await page.locator("#spool-restart").click();
	await page.evaluate(() => {
		const restart = document.querySelector<HTMLButtonElement>("#spool-restart");
		if (restart === null) throw new Error("missing restart control");
		restart.click();
		(
			window as unknown as {
				__spoolTransitionGate: { release(): void };
			}
		).__spoolTransitionGate.release();
	});

	await scenarioRequested;
	// the second Restart has not started: a restart reads its scenario fresh,
	// so a second read is what running it would look like
	expect(scenarioRequests).toBe(1);
	releaseScenario?.();
	await inner.locator("#to-middle").waitFor({ timeout: 5_000 });
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("start");
	await expect.poll(() => scenarioRequests).toBe(2);
});

it("reports a Restart that fails instead of losing it", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-middle" data-go="middle">middle</button>; }\n',
	);
	writeFrame(
		project.root,
		"middle",
		`const nativeStructuredClone = globalThis.structuredClone;
Object.defineProperty(globalThis, "structuredClone", {
	configurable: true,
	value() {
		Object.defineProperty(globalThis, "structuredClone", { configurable: true, value: nativeStructuredClone });
		throw new Error("clone failed");
	},
});
export default function Middle() { return <main id="middle">middle</main>; }
`,
	);
	writeDesignFile(project.root, "shared/scenarios/default.json", '{ "state": { "count": 2 }, "mock": {} }\n');
	for (const [index, frame] of ["start", "middle"].entries()) {
		writeDesignFile(
			project.root,
			`frames/${frame}/frame.json`,
			`{ "x": ${index * 400}, "y": 0, "w": 390, "h": 844 }\n`,
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-command-complete");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-middle").waitFor();
	await inner.locator("#to-middle").click();
	await inner.locator("#middle").waitFor();
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("middle");
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});

	// This Restart throws inside the seed clone. What must not happen is the
	// command going quiet: an outcome comes back either way, or the shell waits
	// on a completion that will never arrive and every later control is stuck
	// behind it.
	await page.locator("#spool-restart").click();
	await expect
		.poll(
			() =>
				inner.locator("body").evaluate(
					() =>
						(
							window as unknown as {
								__spoolRuntimeMessageGate: { messages(): Record<string, unknown>[] };
							}
						).__spoolRuntimeMessageGate.messages().length,
				),
			{ timeout: 5_000 },
		)
		.toBe(1);
	const completion = await inner.locator("body").evaluate(
		() =>
			(
				window as unknown as {
					__spoolRuntimeMessageGate: { messages(): Record<string, unknown>[] };
				}
			).__spoolRuntimeMessageGate.messages()[0],
	);
	expect(completion?.command).toBe("restart");
	expect(completion?.outcome).toBe("failed");
});

it("waits for both navigation and its matching completion before draining controls", {
	timeout: 60_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-middle" data-go="middle">middle</button>; }\n',
	);
	writeFrame(project.root, "middle", 'export default function Middle() { return <main id="middle">middle</main>; }\n');
	for (const [index, frame] of ["start", "middle"].entries()) {
		writeDesignFile(
			project.root,
			`frames/${frame}/frame.json`,
			`{ "x": ${index * 400}, "y": 0, "w": 390, "h": 844 }\n`,
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	let scenarioRequests = 0;
	await page.route(`**/api/p/${project.name}/scenarios/default`, async (route) => {
		scenarioRequests++;
		await route.continue();
	});
	await installPlayerRuntimeMessageGate(page, "player-command-complete");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-middle").click();
	await inner.locator("#middle").waitFor();
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("middle");
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});

	const before = scenarioRequests;
	await page.locator("#spool-restart").click();
	await page.locator("#spool-restart").click();
	await inner.locator("#to-middle").waitFor({ timeout: 5_000 });
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("start");
	// the navigation landed, but its completion is still held: nothing behind it
	// has run, so the second Restart has not read the scenario again
	expect(scenarioRequests).toBe(before + 1);
	const order = await inner.locator("body").evaluate(() =>
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { observed(): string[] };
			}
		).__spoolRuntimeMessageGate.observed(),
	);
	expect(order.lastIndexOf("player-navigate")).toBeLessThan(order.lastIndexOf("player-command-complete"));
	expect(
		await inner.locator("body").evaluate(() =>
			(
				window as unknown as {
					__spoolRuntimeMessageGate: { held(): number };
				}
			).__spoolRuntimeMessageGate.held(),
		),
	).toBe(1);

	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { releaseNext(): void };
			}
		).__spoolRuntimeMessageGate.releaseNext();
	});
	await expect.poll(() => scenarioRequests).toBe(before + 2);
});

it("retains a controller command sent before an authored navigation reaches the shell", {
	timeout: 60_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-middle" data-go="middle">middle</button>; }\n',
	);
	writeFrame(project.root, "middle", 'export default function Middle() { return <main id="middle">middle</main>; }\n');
	for (const [index, frame] of ["start", "middle"].entries()) {
		writeDesignFile(
			project.root,
			`frames/${frame}/frame.json`,
			`{ "x": ${index * 400}, "y": 0, "w": 390, "h": 844 }\n`,
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-navigate");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-middle").waitFor();
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});

	await inner.locator("#to-middle").click();
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);
	expect(await page.locator(".spool-pill-name").innerText()).toBe("start");
	await page.locator("#spool-restart").click();
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { release(): void };
			}
		).__spoolRuntimeMessageGate.release();
	});

	await expect
		.poll(() =>
			inner.locator("body").evaluate(
				() =>
					(
						window as unknown as {
							__spoolRuntimeMessageGate: { observed(): string[] };
						}
					).__spoolRuntimeMessageGate
						.observed()
						.filter((spool) => spool === "player-navigate").length,
			),
		)
		.toBe(2);
	await inner.locator("#to-middle").waitFor({ timeout: 5_000 });
	await expect.poll(() => page.locator(".spool-pill-name").innerText()).toBe("start");
	const observed = await inner.locator("body").evaluate(() =>
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { observed(): string[] };
			}
		).__spoolRuntimeMessageGate.observed(),
	);
	const secondNavigate = observed.lastIndexOf("player-navigate");
	const restarted = observed.lastIndexOf("player-transitioned");
	expect(secondNavigate).toBeGreaterThanOrEqual(0);
	expect(restarted).toBeGreaterThan(secondNavigate);
	expect(observed.indexOf("player-command-complete", secondNavigate)).toBeGreaterThan(restarted);
});

it("rejects controller requests outside the current or pending-source context", {
	timeout: 60_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <button id="to-middle" data-go="middle">middle</button>; }\n',
	);
	writeFrame(project.root, "middle", 'export default function Middle() { return <main id="middle">middle</main>; }\n');
	for (const [index, frame] of ["start", "middle"].entries()) {
		writeDesignFile(
			project.root,
			`frames/${frame}/frame.json`,
			`{ "x": ${index * 400}, "y": 0, "w": 390, "h": 844 }\n`,
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-navigate");
	await installPlayerCommandInjector(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-middle").waitFor();
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});
	await inner.locator("#to-middle").click();
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);

	await page.evaluate(() => {
		const injector = (
			window as unknown as {
				__spoolCommandInjector: { send(message: unknown): void };
			}
		).__spoolCommandInjector;
		for (const message of [
			{ spool: "player-command", command: "restart", request: 101, generation: -1, frame: "start" },
			{ spool: "player-command", command: "restart", request: 102, generation: 0, frame: "middle" },
			{ spool: "player-command", command: "restart", request: 103, generation: 0, frame: "wrong" },
			{ spool: "player-command", command: "restart", request: 104, generation: 2, frame: "start" },
		]) {
			injector.send(message);
		}
	});
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(
		await inner.locator("body").evaluate(
			() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { observed(): string[] };
					}
				).__spoolRuntimeMessageGate
					.observed()
					.filter((spool) => spool === "player-command-complete").length,
		),
	).toBe(0);

	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { release(): void };
			}
		).__spoolRuntimeMessageGate.release();
	});
	await inner.locator("#middle").waitFor({ timeout: 5_000 });
});

it("rejects extra private-port fields on every controller command", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "start", 'export default function Start() { return <main id="start">start</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-command-complete");
	await installPlayerCommandInjector(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor();

	await page.evaluate(() => {
		const injector = (
			window as unknown as {
				__spoolCommandInjector: { send(message: unknown): void };
			}
		).__spoolCommandInjector;
		for (const message of [
			{ spool: "player-command", command: "restart", request: 202, generation: 0, frame: "start", extra: true },
			{
				spool: "player-command",
				command: "dismiss-external",
				request: 205,
				generation: 0,
				frame: "start",
				extra: true,
			},
		]) {
			injector.send(message);
		}
	});
	await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
	expect(await page.locator(".spool-pill-name").innerText()).toBe("start");
	expect(
		await inner.locator("body").evaluate(
			() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { observed(): string[] };
					}
				).__spoolRuntimeMessageGate
					.observed()
					.filter((spool) => spool === "player-command-complete" || spool === "player-navigate").length,
		),
	).toBe(0);
});

it("ignores malformed, stale, and duplicate controller completions without reordering", {
	timeout: 60_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "start", 'export default function Start() { return <main id="start">start</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-command-complete");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#start").waitFor();
	/** How many Restarts have actually run: each one navigates, exactly once. */
	const restarts = () =>
		inner.locator("body").evaluate(
			() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { observed(): string[] };
					}
				).__spoolRuntimeMessageGate
					.observed()
					.filter((spool) => spool === "player-navigate").length,
		);
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});

	// two Restarts: the first runs and its completion is held, so the second is
	// still queued — and a queued Restart has not navigated.
	await page.locator("#spool-restart").click();
	await page.locator("#spool-restart").click();
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);
	expect(await restarts()).toBe(1);
	const firstCompletion = await inner.locator("body").evaluate(
		() =>
			(
				window as unknown as {
					__spoolRuntimeMessageGate: { messages(): Record<string, unknown>[] };
				}
			).__spoolRuntimeMessageGate.messages()[0],
	);
	expect(firstCompletion).toBeDefined();
	await inner.locator("body").evaluate(() => {
		const gate = (
			window as unknown as {
				__spoolRuntimeMessageGate: {
					messages(): Record<string, unknown>[];
					send(message: unknown): void;
				};
			}
		).__spoolRuntimeMessageGate;
		const completion = gate.messages()[0];
		if (completion === undefined) throw new Error("missing held completion");
		const { outcome: _outcome, ...missingOutcome } = completion;
		for (const message of [
			missingOutcome,
			{ ...completion, extra: true },
			{ ...completion, request: Number.MAX_SAFE_INTEGER },
			{ ...completion, command: "dismiss-external" },
			{ ...completion, generation: 99 },
			{ ...completion, frame: "wrong" },
			{ ...completion, outcome: "unknown" },
		]) {
			gate.send(message);
		}
	});
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	// none of them was the completion the shell is waiting for
	expect(await restarts()).toBe(1);

	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { releaseNext(): void };
			}
		).__spoolRuntimeMessageGate.releaseNext();
	});
	await expect.poll(restarts).toBe(2);
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);
	// the first completion arriving a second time is a duplicate, and drains nothing
	await page.locator("#spool-restart").click();
	await inner.locator("body").evaluate((_body, completion) => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { send(message: unknown): void };
			}
		).__spoolRuntimeMessageGate.send(completion);
	}, firstCompletion);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await restarts()).toBe(2);

	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { releaseNext(): void };
			}
		).__spoolRuntimeMessageGate.releaseNext();
	});
	await expect.poll(restarts).toBe(3);
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { release(): void };
			}
		).__spoolRuntimeMessageGate.release();
	});
});

it("cuts when the source viewport no longer matches same-size shell geometry", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		'export default function Start() { return <main id="start"><button id="to-target" data-go="target">target</button></main>; }\n',
	);
	writeFrame(project.root, "target", 'export default function Target() { return <main id="target">target</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/target/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerGeometryGate(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-target").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await page.evaluate(() => {
		(
			window as unknown as {
				__spoolGeometryGate: { hold(): void };
			}
		).__spoolGeometryGate.hold();
	});

	const refresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === `/api/p/${project.name}/frames`,
	);
	const update = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({
			frames: {
				start: { x: 0, y: 0, w: 720, h: 480 },
				target: { x: 800, y: 0, w: 720, h: 480 },
			},
		}),
	});
	expect(update.status).toBe(204);
	await refresh;
	await page.waitForFunction(
		() =>
			(
				window as unknown as {
					__SPOOL_SHELL__: { frames: Record<string, { w: number; h: number }> };
				}
			).__SPOOL_SHELL__.frames.start?.w === 720,
	);
	await page.locator("#spool-player").evaluate((host) => {
		host.style.width = "390px";
		host.style.height = "844px";
	});
	await expect
		.poll(() => inner.locator("html").evaluate(() => ({ width: innerWidth, height: innerHeight })))
		.toEqual({ width: 390, height: 844 });

	await inner.locator("#to-target").click();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "0");
	await page.locator("#spool-player").evaluate((host) => {
		host.style.removeProperty("width");
		host.style.removeProperty("height");
	});
	await inner.locator("#target").waitFor();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "target",
	);
	expect(await inner.locator("#target").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
});

it("reveals a same-size startup auto-walk", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`import { useEffect } from "react";
import { ui } from "spool";
export default function Start() {
	useEffect(() => { ui.go("next"); }, []);
	return <main id="start">start</main>;
}
`,
	);
	writeFrame(project.root, "next", 'export default function Next() { return <main id="next">next</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/next/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "next",
		undefined,
		{ timeout: 5_000 },
	);
	await inner.locator("#next").waitFor();
	expect(await inner.locator("#next").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 390,
		height: 844,
	});
});

it("retains a queued navigation decision after the pre-boot message cap", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`import { ui } from "spool";
setTimeout(() => ui.go("next"), 500);
await new Promise((resolve) => setTimeout(resolve, 1_000));
export default function Start() { return <main id="start">start</main>; }
`,
	);
	writeFrame(project.root, "next", 'export default function Next() { return <main id="next">next</main>; }\n');
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/next/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerPrebootFlood(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);

	const inner = page.frameLocator("#spool-player");
	await inner.locator("#next").waitFor({ timeout: 5_000 });
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "next",
	);
});

it("reveals a cross-size startup auto-walk only after the target paints", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`import { useEffect } from "react";
import { ui } from "spool";
export default function Start() {
	useEffect(() => { ui.go("next"); }, []);
	return <main id="start">start</main>;
}
`,
	);
	writeFrame(
		project.root,
		"next",
		`export default function Next() {
	const firstViewport = window.__nextFirstViewport ??= innerWidth + "×" + innerHeight;
	return <main id="next"><output id="next-viewport">{firstViewport}</output></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/next/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1" &&
			document.querySelector(".spool-pill-name")?.textContent === "next",
		undefined,
		{ timeout: 5_000 },
	);
	await inner.locator("#next").waitFor();
	expect(await inner.locator("#next-viewport").innerText()).toBe("720×480");
	expect(await inner.locator("#next").evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
		width: 720,
		height: 480,
	});
});

it("shows a broken player frame instead of a hidden shell", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "broken", "export default function Broken() { return <main>broken</main>;\n");

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	const response = await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=broken`);

	// The player itself compiles now — the frame that will not is the only thing
	// that fails, and it says so in its own place rather than blanking the shell.
	expect(response?.status()).toBe(200);
	const card = page.frameLocator("#spool-player").locator(".spool-broken-frame");
	await card.waitFor();
	const text = await card.innerText();
	expect(text).toContain("Unexpected end of file");
	expect(text).toContain("Fix the compile error in design/frames/broken/frame.tsx");
	expect(await page.locator('[role="alert"]').count()).toBe(0);
});

it("shows a frame that breaks between the shell preflight and render load", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "raced", "export default function Raced() { return <main>ready</main>; }\n");

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	let innerRequestedResolve: () => void = () => {};
	const innerRequested = new Promise<void>((resolve) => {
		innerRequestedResolve = resolve;
	});
	let releaseInnerResolve: () => void = () => {};
	const releaseInner = new Promise<void>((resolve) => {
		releaseInnerResolve = resolve;
	});
	await page.route(`${project.renderUrl}/play/${encodeURIComponent(project.name)}**`, async (route) => {
		innerRequestedResolve();
		await releaseInner;
		await route.continue();
	});
	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=raced`);
	await innerRequested;
	writeFrame(project.root, "raced", "export default function Raced() { return <main>broken</main>;\n");
	releaseInnerResolve();
	const response = await navigation;

	expect(response?.status()).toBe(200);
	// Broken after the preflight said it was fine, so the render-origin compile is
	// where it is caught — and it lands on that frame alone.
	const card = page.frameLocator("#spool-player").locator(".spool-broken-frame");
	await card.waitFor({ timeout: 10_000 });
	expect(await card.innerText()).toContain("Unexpected end of file");
	expect(await page.locator('[role="alert"]').count()).toBe(0);
});

it("shows an explicit frame deleted between the shell preflight and render load", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(project.root, "kept", "export default function Kept() { return <main>kept</main>; }\n");
	writeFrame(project.root, "removed", "export default function Removed() { return <main>removed</main>; }\n");

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	let innerRequestedResolve: () => void = () => {};
	const innerRequested = new Promise<void>((resolve) => {
		innerRequestedResolve = resolve;
	});
	let releaseInnerResolve: () => void = () => {};
	const releaseInner = new Promise<void>((resolve) => {
		releaseInnerResolve = resolve;
	});
	await page.route(`${project.renderUrl}/play/${encodeURIComponent(project.name)}**`, async (route) => {
		innerRequestedResolve();
		await releaseInner;
		await route.continue();
	});
	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=removed`);
	await innerRequested;
	rmSync(join(project.root, "design/frames/removed/frame.tsx"));
	releaseInnerResolve();
	const response = await navigation;

	expect(response?.status()).toBe(200);
	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain('no frame "removed"');
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("shows an authored top-level exception reported over the private runtime channel", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"explodes",
		`throw new Error("authored top-level exploded");
export default function Explodes() { return <main>unreachable</main>; }
`,
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	const response = await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=explodes`);

	expect(response?.status()).toBe(200);
	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain("authored top-level exploded");
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("shows an authored render exception reported over the private runtime channel", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"explodes",
		`export default function Explodes() {
	throw new Error("authored render exploded");
}
`,
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	const response = await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=explodes`);

	expect(response?.status()).toBe(200);
	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain("authored render exploded");
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("shows a destination render exception during a same-size View Transition", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`export default function Start() {
	return <main><button id="to-boom" data-go="boom">boom</button></main>;
}
`,
	);
	writeFrame(
		project.root,
		"boom",
		`export default function Boom() {
	throw new Error("same-size destination render exploded");
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/boom/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-transition-ready");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-boom").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});
	await inner.locator("#to-boom").click();
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { send(message: unknown): void };
			}
		).__spoolRuntimeMessageGate.send({
			spool: "player-runtime-error",
			error: "same-size destination render exploded",
			extra: true,
		});
	});
	await page.waitForTimeout(100);
	expect(await page.locator('[role="alert"]').count()).toBe(0);
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { releaseNext(): void };
			}
		).__spoolRuntimeMessageGate.releaseNext();
	});

	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain("same-size destination render exploded");
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("shows a destination render exception during a cross-size hard cut", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"start",
		`export default function Start() {
	return <main><button id="to-boom" data-go="boom">boom</button></main>;
}
`,
	);
	writeFrame(
		project.root,
		"boom",
		`export default function Boom() {
	throw new Error("cross-size destination render exploded");
}
`,
	);
	writeDesignFile(project.root, "frames/start/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/boom/frame.json", '{ "x": 400, "y": 0, "w": 720, "h": 480 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#to-boom").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await inner.locator("#to-boom").click();

	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain("cross-size destination render exploded");
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("keeps a ready player visible after a late authored exception", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"home",
		`export default function Home() {
	return <button id="home" onClick={() => setTimeout(() => { throw new Error("late authored exception"); }, 100)}>home</button>;
}
`,
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await installPlayerRuntimeMessageGate(page, "player-command-complete");
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=home`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#home").waitFor();
	await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#spool-player")?.style.opacity === "1");
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { hold(): void };
			}
		).__spoolRuntimeMessageGate.hold();
	});
	await page.locator("#spool-restart").click();
	await expect
		.poll(() =>
			inner.locator("body").evaluate(() =>
				(
					window as unknown as {
						__spoolRuntimeMessageGate: { held(): number };
					}
				).__spoolRuntimeMessageGate.held(),
			),
		)
		.toBe(1);
	await inner.locator("#home").click();
	await page.waitForTimeout(250);

	expect(await page.locator('[role="alert"]').count()).toBe(0);
	expect(await page.locator("#spool-player").count()).toBe(1);
	expect(await inner.locator("#home").innerText()).toBe("home");
	await inner.locator("body").evaluate(() => {
		(
			window as unknown as {
				__spoolRuntimeMessageGate: { releaseNext(): void };
			}
		).__spoolRuntimeMessageGate.releaseNext();
	});
});

it("shows a terminal that becomes stale between the shell preflight and render load", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeDesignFile(project.root, "frames/dash/term.tsx", "// current terminal source\n");
	writeDesignFile(
		project.root,
		".spool/term/dash.screen",
		`${JSON.stringify({
			cols: 80,
			rows: 24,
			screen: "current terminal",
			sourceVersion: terminalSourceVersion(project.root, "dash"),
		})}\n`,
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	let innerRequestedResolve: () => void = () => {};
	const innerRequested = new Promise<void>((resolve) => {
		innerRequestedResolve = resolve;
	});
	let releaseInnerResolve: () => void = () => {};
	const releaseInner = new Promise<void>((resolve) => {
		releaseInnerResolve = resolve;
	});
	await page.route(`${project.renderUrl}/play/${encodeURIComponent(project.name)}**`, async (route) => {
		innerRequestedResolve();
		await releaseInner;
		await route.continue();
	});
	const navigation = page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=dash`);
	await innerRequested;
	writeDesignFile(project.root, "frames/dash/term.tsx", "// changed terminal source\n");
	releaseInnerResolve();
	const response = await navigation;

	expect(response?.status()).toBe(200);
	await page.locator('[role="alert"]').waitFor({ timeout: 5_000 });
	expect(await page.locator('[role="alert"]').innerText()).toContain("stale after its source changed");
	expect(await page.locator("#spool-player").count()).toBe(0);
});

it("does not register Spool fonts under an authored family name", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeFrame(
		project.root,
		"font",
		`export default function Font() {
	return <output id="font-probe" style={{ display: "block", width: "max-content", fontFamily: '"JetBrains Mono", monospace', fontSize: 50 }}>MMMMMMMM</output>;
}
`,
	);
	writeDesignFile(project.root, "frames/font/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const measure = (frame: Frame) =>
		frame.locator("#font-probe").evaluate((element) => ({
			width: element.getBoundingClientRect().width,
			faces: [...document.fonts].filter((face) => face.family.replaceAll('"', "") === "JetBrains Mono").length,
		}));

	const bare = await context.newPage();
	await bare.setViewportSize({ width: 390, height: 844 });
	await bare.goto(`${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/font`);
	await bare.locator("#font-probe").waitFor();
	const bareFont = await measure(bare.mainFrame());
	expect(bareFont.faces).toBe(0);

	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=font`);
	const inner = player.frameLocator("#spool-player");
	await inner.locator("#font-probe").waitFor();
	const live = player.frames().find((frame) => frame !== player.mainFrame()) as Frame;
	const playerFont = await measure(live);

	expect(playerFont).toEqual(bareFont);
});

it("keeps existing player behavior through the control shell", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeDesignFile(
		project.root,
		"shared/scenarios/default.json",
		'{ "state": { "count": 2 }, "mock": { "GET /api/value": { "body": { "value": "mocked" } } } }\n',
	);
	writeFrame(
		project.root,
		"menu",
		`import { useEffect, useState } from "react";
import { ui } from "spool";
export default function Menu() {
	const state = ui.use();
	const [mocked, setMocked] = useState("loading");
	const [key, setKey] = useState("");
	useEffect(() => {
		fetch("/api/value").then((response) => response.json()).then((body) => setMocked(body.value));
	}, []);
	return <main><output id="count">{state.count}</output><output id="mocked">{mocked}</output><button id="key" onKeyDown={(event) => setKey(event.key)}>{key || "key"}</button><button id="bump" onClick={() => { ui.state.count = 5; }}>bump</button><button id="next" data-go="next">next</button></main>;
}
`,
	);
	writeFrame(
		project.root,
		"next",
		`import { ui } from "spool";
export default function Next() {
	const state = ui.use();
	return <main><output id="count">{state.count}</output><a id="external" href="https://example.com/path">external</a><button id="back" onClick={() => ui.back()}>back</button></main>;
}
`,
	);
	writeDesignFile(project.root, "frames/menu/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
	writeDesignFile(project.root, "frames/next/frame.json", '{ "x": 400, "y": 0, "w": 390, "h": 844 }\n');

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=menu`);
	const inner = page.frameLocator("#spool-player");
	await inner.locator("#mocked").filter({ hasText: "mocked" }).waitFor();
	expect(await inner.locator("#count").innerText()).toBe("2");
	await inner.locator("#bump").click();
	await inner.locator("#next").click();
	await inner.getByText("external").waitFor();
	expect(await inner.locator("#count").innerText()).toBe("5");

	await inner.locator("#external").click();
	await page.locator('[role="dialog"]').waitFor();
	expect(await page.locator('[role="dialog"]').innerText()).toContain("example.com");
	await page.getByRole("button", { name: "Stay here", exact: true }).click();

	await inner.locator("#back").click();
	await inner.locator("#count").filter({ hasText: "5" }).waitFor();
	await inner.locator("#key").press("K");
	expect(await inner.locator("#key").innerText()).toBe("K");
	await page.locator("#spool-restart").click();
	await inner.locator("#count").filter({ hasText: "2" }).waitFor();
	expect(await page.locator(".spool-pill-name").innerText()).toBe("menu");

	await page.waitForFunction(
		() => document.querySelector(".spool-stage")?.classList.contains("is-asleep"),
		undefined,
		{
			timeout: 5_000,
		},
	);
	await inner.locator("body").hover({ position: { x: 200, y: 300 } });
	await page.waitForFunction(() => !document.querySelector(".spool-stage")?.classList.contains("is-asleep"));

	await page.locator("#spool-close").click();
	await page.waitForURL(`${project.url}/p/${encodeURIComponent(project.name)}`);
});

it("keeps terminal poster and chrome behavior through the control shell", { timeout: 60_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await serveProject();
	writeDesignFile(project.root, "frames/dash/term.tsx", "// execution disabled until OS-sandboxed\n");
	writeDesignFile(
		project.root,
		".spool/term/dash.screen",
		`${JSON.stringify({
			cols: 80,
			rows: 24,
			screen: "persisted terminal",
			sourceVersion: terminalSourceVersion(project.root, "dash"),
		})}\n`,
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=dash`);
	const inner = page.frameLocator("#spool-player");
	const poster = inner.locator("img.spool-term-poster");
	await poster.waitFor();
	const posterSvg = await poster.getAttribute("src");
	expect(decodeURIComponent(posterSvg?.split(",", 2)[1] ?? "")).toContain("persisted terminal");
	const viewport = await inner
		.locator(".spool-term-screen")
		.evaluate(() => ({ width: innerWidth, height: innerHeight }));
	expect(viewport).toEqual({ width: 720, height: 480 });
	expect(await page.locator("#spool-player").evaluate((host) => getComputedStyle(host).opacity)).toBe("1");

	const started = await page.evaluate(() => performance.now());
	await page.waitForFunction((at) => performance.now() - at > 2_300, started);
	expect(await page.locator(".spool-stage").getAttribute("class")).not.toContain("is-asleep");
});
