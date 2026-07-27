import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page, type Request } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

interface GeometryPut {
	surface: string;
	pageUrl: string;
	gesture: "idle" | "trusted-control";
}

// A viewport change must stay idle beyond this finite window before a surface
// can close or its next request can be deliberately attributed to a gesture.
const IDLE_GEOMETRY_QUIET_WINDOW_MS = 500;
const VIEWPORT_OBSERVATION_TIMEOUT_MS = 5_000;

it("keeps authored geometry byte-identical across idle player and canvas viewport changes", {
	timeout: 180_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	const authored = '{ "x": 41, "y": 73, "w": 390, "h": 1900 }\n';
	const sidecar = join(project.root, "design", "frames", "authored", "frame.json");
	writeFrame(
		project.root,
		"authored",
		`export default function Authored() {
	return <main id="geometry-probe" style={{ minHeight: "100%" }}>authored</main>;
}
`,
	);
	writeDesignFile(project.root, "frames/authored/frame.json", authored);
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

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const surfaces = new Map<Page, string>();
	const gestures = new Map<Page, GeometryPut["gesture"]>();
	const puts: GeometryPut[] = [];
	context.on("request", (request: Request) => {
		if (request.method() !== "PUT" || !new URL(request.url()).pathname.endsWith("/geometry")) return;
		const page = request.frame().page();
		puts.push({
			surface: surfaces.get(page) ?? "unknown",
			pageUrl: page.url(),
			gesture: gestures.get(page) ?? "idle",
		});
	});

	const assertAuthored = (step: string) => {
		expect(readFileSync(sidecar, "utf8"), step).toBe(authored);
		expect(puts, `${step}: unexpected trusted geometry writes`).toEqual([]);
	};
	const assertIdleQuietWindow = async (page: Page, step: string) => {
		const putsBeforeQuietWindow = puts.length;
		await page.waitForTimeout(IDLE_GEOMETRY_QUIET_WINDOW_MS);
		expect(puts.slice(putsBeforeQuietWindow), `${step}: unexpected geometry writes during idle quiet window`).toEqual(
			[],
		);
		assertAuthored(step);
	};
	const assertIdleAtViewport = async (page: Page, width: number, height: number, step: string) => {
		await page.waitForFunction(
			({ width, height }) => window.innerWidth === width && window.innerHeight === height,
			{ width, height },
			{ timeout: VIEWPORT_OBSERVATION_TIMEOUT_MS },
		);
		const observed = await page.evaluate(
			() =>
				new Promise<{ width: number; height: number }>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => resolve({ width: window.innerWidth, height: window.innerHeight }));
					});
				}),
		);
		expect(observed, `${step}: page did not render the requested viewport`).toEqual({ width, height });
		assertAuthored(step);
	};

	const player = await context.newPage();
	surfaces.set(player, "player-only");
	gestures.set(player, "idle");
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=authored`);
	await player.frameLocator("#spool-player").locator("#geometry-probe").waitFor();
	assertAuthored("player load at 900px");
	for (const height of [640, 1200, 1668, 2170, 760]) {
		await player.setViewportSize({ width: 1280, height });
		await assertIdleAtViewport(player, 1280, height, `player resize to ${height}px`);
	}
	await assertIdleQuietWindow(player, "player final resize to 760px");
	await player.close();

	const canvas = await context.newPage();
	surfaces.set(canvas, "canvas-only");
	gestures.set(canvas, "idle");
	await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	// Go inside it. On the canvas a frame stands as its own still and holds no
	// document unless something asks for one (#112), and the frame you went
	// inside is the one that holds a live document through every resize below —
	// which is the document this leg is about.
	const authoredStill = canvas.locator('[data-frame-cover="authored"]');
	await authoredStill.waitFor({ timeout: 30_000 });
	const stillBox = await authoredStill.boundingBox();
	if (stillBox === null) throw new Error("the frame's own still is not on the canvas");
	await canvas.mouse.dblclick(stillBox.x + stillBox.width / 2, stillBox.y + Math.min(stillBox.height / 2, 200));
	await canvas.frameLocator('iframe[title="authored"]').locator("#geometry-probe").waitFor({ timeout: 30_000 });
	assertAuthored("canvas load at 900px");
	for (const height of [700, 1100, 1668]) {
		await canvas.setViewportSize({ width: 1280, height });
		await assertIdleAtViewport(canvas, 1280, height, `canvas resize to ${height}px`);
	}
	await assertIdleQuietWindow(canvas, "canvas final resize to 1668px");

	const concurrentPlayer = await context.newPage();
	surfaces.set(concurrentPlayer, "player-with-canvas-open");
	gestures.set(concurrentPlayer, "idle");
	await concurrentPlayer.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=authored`);
	await concurrentPlayer.frameLocator("#spool-player").locator("#geometry-probe").waitFor();
	for (const height of [2170, 844, 1900]) {
		await concurrentPlayer.setViewportSize({ width: 390, height });
		await assertIdleAtViewport(concurrentPlayer, 390, height, `concurrent player resize to ${height}px`);
	}
	await assertIdleQuietWindow(concurrentPlayer, "concurrent player final resize to 1900px");

	// Negative control: the harness sees and attributes a deliberate trusted
	// write after proving that every idle surface stayed silent.
	gestures.set(canvas, "trusted-control");
	const status = await canvas.evaluate(
		async ({ name, token }) =>
			(
				await fetch(`/api/p/${encodeURIComponent(name)}/geometry`, {
					method: "PUT",
					headers: { "content-type": "application/json", "X-Spool-Control": token },
					body: JSON.stringify({ frames: { authored: { x: 41, y: 73, w: 390, h: 2001 } } }),
				})
			).status,
		{ name: project.name, token: project.controlToken },
	);
	expect(status).toBe(204);
	expect(puts).toEqual([
		{
			surface: "canvas-only",
			pageUrl: `${project.url}/p/${project.name}`,
			gesture: "trusted-control",
		},
	]);
	expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 41, y: 73, w: 390, h: 2001 });
});
