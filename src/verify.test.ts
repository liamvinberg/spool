import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { terminalSourceVersion } from "./daemon/term-source";
import { writeCaptureError } from "./daemon/thumbs";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "./test-helpers";
import { type BootDeps, logsFrame, planShot, shotFrame } from "./verify";

/**
 * shot/logs against a really-served daemon. The compile paths never need a
 * browser — they always run. The one boot smoke (#18: the shot path is
 * deliberately unseamed beyond this) is gated on a playwright-managed build
 * already being on the machine: tests never trigger the ~90 MB lazy fetch,
 * that narration is #27's second-machine acceptance.
 */

async function browserAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

async function serveVerifyProject() {
	const { spoolDir, root, name, url } = await serveProject();
	const controlToken = readDaemonState(spoolDir)?.controlToken;
	if (controlToken === undefined) throw new Error("test daemon has no control token");
	const deps = (frame: string, overrides: Partial<BootDeps> = {}): BootDeps => ({
		daemonUrl: url,
		controlToken,
		root,
		name,
		frame,
		narrate: () => {},
		...overrides,
	});
	return { root, name, url, controlToken, deps };
}

describe("shot and logs, compile paths", () => {
	it("hands a broken frame's compile error verbatim, without a browser", async () => {
		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "broken", "export default function Broken() { return <main>unclosed;\n}\n");

		const shot = await shotFrame(deps("broken"));
		const logs = await logsFrame(deps("broken"));

		expect(shot.kind).toBe("broken");
		expect(logs.kind).toBe("broken");
		// esbuild's own text, untouched — the agent reads the real diagnosis
		expect((shot as { message: string }).message).toContain("Unexpected end of file");
	});

	it("refuses a frame that does not exist without inventing where it would live", async () => {
		const { root, deps } = await serveVerifyProject();
		// every frame here lives on a page, so the flat folder the hint used to name
		// was never a location this project reads (#156)
		writeDesignFile(
			root,
			join("frames", "site", "site-local--plate", "frame.tsx"),
			"export default function Plate() { return <main>plate</main>; }\n",
		);

		const shot = await shotFrame(deps("site-local--thread"));
		const logs = await logsFrame(deps("site-local--thread"));

		expect(shot.kind).toBe("missing");
		expect(logs.kind).toBe("missing");
		expect((shot as { message: string }).message).toBe(
			'no frame "site-local--thread" on the canvas — a frame is born by writing frame.tsx in its own folder under design/frames/, flat or inside a page folder',
		);
		expect((logs as { message: string }).message).not.toContain("frames/site-local--thread");
	});

	it("does not write a terminal shot through an escaped verify directory", async () => {
		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// inert terminal\n");
		writeDesignFile(
			root,
			join(".spool", "term", "dash.screen"),
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "persisted screen",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);
		const outside = makeTempDir();
		mkdirSync(join(root, "design", ".spool"), { recursive: true });
		symlinkSync(outside, join(root, "design", ".spool", "verify"), "dir");

		await expect(shotFrame(deps("dash"))).rejects.toThrow(
			'design boundary: ".spool/verify/dash.svg" resolves outside design/',
		);
		expect(readdirSync(outside)).toEqual([]);
	});

	it("does not read an html log cache through an escaped verify directory", async () => {
		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const outside = makeTempDir();
		mkdirSync(join(root, "design", ".spool"), { recursive: true });
		symlinkSync(outside, join(root, "design", ".spool", "verify"), "dir");

		await expect(logsFrame(deps("quiet"))).rejects.toThrow(
			'design boundary: ".spool/verify/quiet.logs.json" resolves outside design/',
		);
		expect(readdirSync(outside)).toEqual([]);
	});

	it("surfaces a recorded self-capture failure alongside replayed logs (#173)", async () => {
		const { root, name, url, controlToken, deps } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const verify = await fetch(`${url}/api/p/${name}/verify/quiet`, {
			headers: { "X-Spool-Control": controlToken },
		});
		const { etag } = (await verify.json()) as { etag: string };
		writeDesignFile(
			root,
			".spool/verify/quiet.logs.json",
			`${JSON.stringify({ etag, scenario: "default", entries: [] })}\n`,
		);
		writeCaptureError(root, "quiet", "capture canvases too large");

		const logs = await logsFrame(deps("quiet"));

		expect(logs).toMatchObject({ kind: "logs", replayed: true });
		expect((logs as { captureError?: { error: string; at: string } }).captureError).toMatchObject({
			error: "capture canvases too large",
		});

		// a frame with nothing recorded carries no captureError at all
		writeFrame(root, "clean", "export default function Clean() { return <main>clean</main> }\n");
		const cleanVerify = await fetch(`${url}/api/p/${name}/verify/clean`, {
			headers: { "X-Spool-Control": controlToken },
		});
		const { etag: cleanEtag } = (await cleanVerify.json()) as { etag: string };
		writeDesignFile(
			root,
			".spool/verify/clean.logs.json",
			`${JSON.stringify({ etag: cleanEtag, scenario: "default", entries: [] })}\n`,
		);
		const cleanLogs = await logsFrame(deps("clean"));
		expect((cleanLogs as { captureError?: unknown }).captureError).toBeUndefined();
	});

	it("does not reclassify a terminal when its persisted-screen read escapes design", async () => {
		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// inert terminal\n");
		const termDir = join(root, "design", ".spool", "term");
		mkdirSync(termDir, { recursive: true });
		const outside = join(makeTempDir(), "dash.screen");
		writeFileSync(outside, JSON.stringify({ cols: 80, rows: 24, screen: "outside" }));
		symlinkSync(outside, join(termDir, "dash.screen"));

		await expect(shotFrame(deps("dash"))).rejects.toThrow(
			'design boundary: ".spool/term/dash.screen" resolves outside design/',
		);
	});
});

describe("planShot", () => {
	it("keeps a screen-sized frame one image at 2×", () => {
		expect(planShot(390, 844)).toEqual({ scale: 2, tiles: [{ y: 0, height: 844 }] });
	});

	it("tapers the scale on wide frames instead of overshooting the raster budget", () => {
		const plan = planShot(1440, 900);
		expect(plan.scale).toBeCloseTo(1600 / 1440);
		expect(plan.tiles).toEqual([{ y: 0, height: 900 }]);
	});

	it("never scales below 1× for width alone", () => {
		expect(planShot(3200, 900).scale).toBe(1);
	});

	it("slices a long frame into overlapping tiles, the last anchored to the bottom edge", () => {
		expect(planShot(160, 2600)).toEqual({
			scale: 2,
			tiles: [
				{ y: 0, height: 1000 },
				{ y: 952, height: 1000 },
				{ y: 1600, height: 1000 },
			],
		});
	});

	it("tolerates a fifth over budget before slicing into near-duplicates", () => {
		expect(planShot(160, 1200).tiles).toHaveLength(1);
		expect(planShot(160, 1201).tiles).toHaveLength(2);
	});

	it("lowers the scale before the raster surface outgrows Chromium", () => {
		const plan = planShot(990, 20_000);
		expect(plan.scale).toBeCloseTo(16_000 / 20_000);
	});
});

describe("the one boot smoke", () => {
	it("boots, shoots, logs, replays, refreshes on edit, surfaces boot errors", { timeout: 180_000 }, async () => {
		if (!(await browserAvailable())) return; // no build on this machine: #27 covers the fetch path

		const { root, deps } = await serveVerifyProject();
		const narrations: string[] = [];
		writeFrame(
			root,
			"noisy",
			`console.log("hello from boot");

export default function Noisy() {
	return <main>noisy</main>;
}
`,
		);
		writeFrame(root, "defaulted", "export default function Defaulted() { return <main>defaulted</main>; }\n");
		const defaultNarrations: string[] = [];
		const defaultWaits: number[] = [];
		await expect(
			shotFrame(
				deps("defaulted", {
					narrate: (line) => defaultNarrations.push(line),
					wait: async (milliseconds) => {
						defaultWaits.push(milliseconds);
					},
				}),
			),
		).resolves.toMatchObject({ kind: "shot" });
		expect(defaultNarrations).toEqual(['no valid frame.json for "defaulted" — using the 1440×900 default viewport']);
		expect(defaultWaits).toEqual([300]);
		expect(existsSync(join(root, "design", "frames", "defaulted", "frame.json"))).toBe(false);

		const waits: number[] = [];
		const shot = await shotFrame(
			deps("noisy", {
				viewport: { width: 160, height: 120 },
				at: 17,
				wait: async (milliseconds) => {
					waits.push(milliseconds);
				},
				narrate: (line) => narrations.push(line),
			}),
		);
		expect(shot.kind).toBe("shot");
		const files = (shot as { files: string[] }).files;
		expect(files).toEqual([join(root, "design", ".spool", "verify", "noisy.png")]);
		const file = files[0] as string;
		expect(existsSync(file)).toBe(true);
		expect((shot as { bootErrors: string[] }).bootErrors).toEqual([]);
		expect(waits).toEqual([17]);
		// Playwright captures at the documented 2× device scale.
		const png = readPngSize(file);
		expect(png).toEqual({ width: 320, height: 240 });
		// Verification reads geometry without materializing the canvas sidecar.
		expect(existsSync(join(root, "design", "frames", "noisy", "frame.json"))).toBe(false);
		expect(narrations).toEqual([]);

		// logs replay the shot's boot — same source, no second boot
		const replay = await logsFrame(deps("noisy"));
		expect(replay).toMatchObject({ kind: "logs", replayed: true });
		expect((replay as { entries: { type: string; text: string }[] }).entries).toContainEqual({
			type: "log",
			text: "hello from boot",
		});

		// An edit followed by shot refreshes the boot, then logs replays that
		// exact edited boot rather than launching a second one.
		writeFrame(
			root,
			"noisy",
			`console.log("edited boot");

export default function Noisy() {
	return <main>noisy</main>;
}
`,
		);
		await expect(shotFrame(deps("noisy"))).resolves.toMatchObject({ kind: "shot" });
		const editedReplay = await logsFrame(deps("noisy"));
		expect(editedReplay).toMatchObject({ kind: "logs", replayed: true });
		expect((editedReplay as { entries: { type: string; text: string }[] }).entries).toContainEqual({
			type: "log",
			text: "edited boot",
		});

		// A frame much taller than a screen shoots as slices, each legible on its
		// own, and every address the run did not write retires with it — a stack
		// read back by path must never serve last shot's truth.
		const tiled = await shotFrame(deps("noisy", { viewport: { width: 160, height: 2600 } }));
		expect(tiled.kind).toBe("shot");
		const tiles = (tiled as { files: string[] }).files;
		expect(tiles).toEqual([1, 2, 3].map((n) => join(root, "design", ".spool", "verify", `noisy.${n}.png`)));
		expect(existsSync(file)).toBe(false);
		for (const tile of tiles) expect(readPngSize(tile)).toEqual({ width: 320, height: 2000 });

		// and back: one short shot retires the whole stack
		const single = await shotFrame(deps("noisy", { viewport: { width: 160, height: 120 } }));
		expect((single as { files: string[] }).files).toEqual([file]);
		expect(tiles.some((tile) => existsSync(tile))).toBe(false);

		// a frame that throws on boot: the shot lands, the errors mark it broken
		writeFrame(
			root,
			"thrower",
			`export default function Thrower() {
	throw new Error("boom at boot");
}
`,
		);
		const thrown = await shotFrame(deps("thrower"));
		expect(thrown.kind).toBe("shot");
		const errors = (thrown as { bootErrors: string[] }).bootErrors;
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.join("\n")).toContain("boom at boot");
	});

	it("seeds and caches boots by scenario", { timeout: 180_000 }, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, "shared/scenarios/review.json", '{ "state": {}, "mock": {} }\n');
		writeFrame(
			root,
			"seeded",
			`console.log(window.location.search);

export default function Seeded() {
	return <main>seeded</main>;
}
`,
		);

		await expect(shotFrame(deps("seeded", { scenario: "review" }))).resolves.toMatchObject({ kind: "shot" });
		const review = await logsFrame(deps("seeded", { scenario: "review" }));
		expect(review).toMatchObject({ kind: "logs", replayed: true });
		expect((review as { entries: { type: string; text: string }[] }).entries).toContainEqual({
			type: "log",
			text: "?scenario=review",
		});
		expect(await logsFrame(deps("seeded"))).toMatchObject({ kind: "logs", replayed: false });
	});
});

function readPngSize(file: string): { width: number; height: number } {
	const png = readFileSync(file);
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
