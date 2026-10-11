import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it, onTestFinished } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { writeCaptureError } from "./daemon/thumbs";
import { planShot, recordBoot, SHOT_AT_MAX_MS, type ShotFile } from "./daemon/verify-record";
import { headlessShellArgs } from "./headless-shell";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "./test-helpers";
import { type BatchShot, type BootDeps, formatBatchShot, logsFrame, shotFrame, shotFrames } from "./verify";

/**
 * shot/logs against a really-served daemon. The compile paths never need a
 * browser — they always run. The one boot smoke (#18: the shot path is
 * deliberately unseamed beyond this) is gated on a playwright-managed build
 * already being on the machine: tests never trigger the ~90 MB lazy fetch,
 * that narration is #27's second-machine acceptance. The boot itself is the
 * daemon's photo booth, so these drive it exactly as an agent does.
 */

async function browserAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({
			channel: "chromium-headless-shell",
			headless: true,
			args: headlessShellArgs(),
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

async function serveVerifyProject() {
	// the scheme a boot renders in is the machine's until a canvas says; this one is held light
	const { spoolDir, root, name, url } = await serveProject({ booth: { systemScheme: async () => "light" } });
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

	it("keeps a page frame's records under its own path (#336)", async () => {
		const { root, name, url, controlToken, deps } = await serveVerifyProject();
		writeFrame(root, "checkout", "export default function Checkout() { return <main>root</main> }\n");
		writeDesignFile(
			root,
			join("frames", "shop", "checkout", "frame.tsx"),
			"export default function Checkout() { return <main>shop</main> }\n",
		);
		const verify = await fetch(`${url}/api/p/${name}/verify/shop%2Fcheckout`, {
			headers: { "X-Spool-Control": controlToken },
		});
		expect(verify.status).toBe(200);
		const { etag, scheme } = (await verify.json()) as { etag: string; scheme: string };
		writeDesignFile(
			root,
			".spool/verify/shop/checkout.logs.json",
			`${JSON.stringify({ etag, scenario: "default", scheme, entries: [] })}\n`,
		);
		writeCaptureError(root, "shop/checkout", "shop only");

		const logs = await logsFrame(deps("shop/checkout"));

		expect(logs).toMatchObject({ kind: "logs", replayed: true, captureError: { error: "shop only" } });
		// the root frame with the same folder name shares none of it
		expect(existsSync(join(root, "design", ".spool", "verify", "checkout.logs.json"))).toBe(false);
	});

	it("surfaces a recorded cover failure alongside replayed logs (#173)", async () => {
		const { root, name, url, controlToken, deps } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const verify = await fetch(`${url}/api/p/${name}/verify/quiet`, {
			headers: { "X-Spool-Control": controlToken },
		});
		const { etag, scheme } = (await verify.json()) as { etag: string; scheme: string };
		writeDesignFile(
			root,
			".spool/verify/quiet.logs.json",
			`${JSON.stringify({ etag, scenario: "default", scheme, entries: [] })}\n`,
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
		const { etag: cleanEtag, scheme: cleanScheme } = (await cleanVerify.json()) as { etag: string; scheme: string };
		writeDesignFile(
			root,
			".spool/verify/clean.logs.json",
			`${JSON.stringify({ etag: cleanEtag, scenario: "default", scheme: cleanScheme, entries: [] })}\n`,
		);
		const cleanLogs = await logsFrame(deps("clean"));
		expect((cleanLogs as { captureError?: unknown }).captureError).toBeUndefined();
	});

	it("answers a batch in the order named, each frame its own outcome, without a browser", async () => {
		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "broken", "export default function Broken() { return <main>unclosed;\n}\n");
		const { frame: _, ...batch } = deps("unused");

		const shots: BatchShot[] = [];
		for await (const shot of shotFrames(batch, ["nope", "broken", "nope"])) shots.push(shot);

		// a name given twice is shot once
		expect(shots.map((shot) => [shot.frame, shot.outcome.kind])).toEqual([
			["nope", "missing"],
			["broken", "broken"],
		]);
		expect(formatBatchShot(shots[0] as BatchShot)).toBe(
			'nope: not found\n  no frame "nope" on the canvas — a frame is born by writing frame.tsx in its own folder under design/frames/, flat or inside a page folder',
		);
		const broken = formatBatchShot(shots[1] as BatchShot).split("\n");
		expect(broken[0]).toBe("broken: does not compile");
		expect(broken.slice(1).join("\n")).toContain("Unexpected end of file");
		expect(broken.slice(1).every((line) => line.startsWith("  "))).toBe(true);
	});

	it("reports a frame the daemon fails on as that frame's answer, not the batch's", async () => {
		const { deps } = await serveVerifyProject();
		const { frame: _, ...batch } = deps("unused");

		const shots: BatchShot[] = [];
		for await (const shot of shotFrames({ ...batch, name: "no-such-project" }, ["one", "two"])) shots.push(shot);

		expect(shots.map((shot) => [shot.frame, shot.outcome.kind])).toEqual([
			["one", "failed"],
			["two", "failed"],
		]);
		expect(formatBatchShot(shots[0] as BatchShot)).toMatch(/^one: failed\n {2}\S/);
	});

	it("refuses a fixed wait longer than any shot waits", async () => {
		const { root, name, url, controlToken } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const boot = (at: number[]) =>
			fetch(`${url}/api/p/${name}/boot/quiet`, {
				method: "POST",
				headers: { "X-Spool-Control": controlToken, "content-type": "application/json" },
				body: JSON.stringify({ width: 160, height: 120, at }),
			});
		expect((await boot([0, SHOT_AT_MAX_MS + 1])).status).toBe(400);
		expect((await boot([])).status).toBe(400);
	});
});

describe("a boot the daemon goes quiet on", () => {
	it("stops waiting and says so in plain words", async () => {
		// a daemon that compiles the frame and then never says another word
		const server = createServer((request, response) => {
			if (request.url?.includes("/verify/") === true) {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(JSON.stringify({ kind: "ok", etag: '"one"', scheme: "light" }));
				return;
			}
			response.writeHead(200, { "content-type": "application/x-ndjson" });
			response.flushHeaders();
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		onTestFinished(() => {
			server.closeAllConnections();
			return new Promise<void>((resolve) => server.close(() => resolve()));
		});
		const address = server.address();
		if (address === null || typeof address === "string") throw new Error("the quiet daemon has no port");
		const root = makeTempDir();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const deps: BootDeps = {
			daemonUrl: `http://127.0.0.1:${address.port}`,
			controlToken: "token",
			root,
			name: "quiet-project",
			frame: "quiet",
			narrate: () => {},
			viewport: { width: 160, height: 120 },
			quietMs: 1000,
		};

		await expect(shotFrame(deps)).rejects.toThrow(
			'the daemon said nothing for 1 s while it booted "quiet" — `spool status` says whether it is still running',
		);
	});
});

describe("a shot's block", () => {
	const shot = (overrides: Partial<Extract<BatchShot["outcome"], { kind: "shot" }>>): BatchShot => ({
		frame: "explore/landing",
		outcome: {
			kind: "shot",
			files: [],
			scale: 1600 / 1440,
			width: 1440,
			height: 900,
			sizedBy: "frame.json",
			bootErrors: [],
			consoleErrors: [],
			warnings: [],
			contentHeight: 900,
			...overrides,
		},
	});

	it("indents spool's warnings under the frame, after its console errors", () => {
		const block = formatBatchShot(
			shot({ consoleErrors: ["[error] boom"], warnings: ["[spool] classes with no CSS: bg-white"] }),
		).split("\n");
		expect(block.slice(1)).toEqual(["  [error] boom", "  [spool] classes with no CSS: bg-white"]);
	});

	it("says each file's CSS rows and the device scale", () => {
		const tiles = planShot(1440, 3765).tiles;
		const files = tiles.map((tile, index) => ({ file: `/v/explore/landing.${index + 1}.png`, ...tile }));
		const block = formatBatchShot(shot({ files, height: 3765, contentHeight: 3765 })).split("\n");
		expect(block[0]).toBe("explore/landing: shot, content 3765px tall, no console errors");
		expect(block[1]).toBe(`  /v/explore/landing.1.png  css y 0-${tiles[0]?.height} of 3765, scale 1.111`);
		expect(block.at(-1)).toBe(
			`  /v/explore/landing.${tiles.length}.png  css y ${3765 - (tiles.at(-1)?.height ?? 0)}-3765 of 3765, scale 1.111`,
		);
	});

	it("names the height the frame was shot at when the content runs otherwise", () => {
		expect(formatBatchShot(shot({ height: 6400, contentHeight: 6967 })).split("\n")[0]).toBe(
			"explore/landing: shot, frame.json h 6400, content 6967, no console errors",
		);
		expect(formatBatchShot(shot({ sizedBy: "--viewport", contentHeight: 412 })).split("\n")[0]).toBe(
			"explore/landing: shot, --viewport h 900, content 412, no console errors",
		);
	});
});

describe("verify records", () => {
	it("mirror the frame's path, keep other times, and retire the old encoded names", () => {
		const root = makeTempDir();
		writeFrame(root, "home", "export default function Home() { return <main /> }\n");
		const verify = join(root, "design", ".spool", "verify");
		writeDesignFile(root, ".spool/verify/shop%2Fcheckout.png", "old");
		writeDesignFile(root, ".spool/verify/shop%2Fcheckout.logs.json", "{}");
		writeDesignFile(root, ".spool/verify/shop/checkout.3.png", "stale slice");
		const record = (shots: { at?: number; pngs: Buffer[] }[]) =>
			recordBoot(root, "shop/checkout", {
				etag: '"e"',
				scenario: "default",
				scheme: "light",
				tiles: [{ y: 0, height: 900 }],
				shots,
				entries: [],
			});

		expect(record([{ at: 1500, pngs: [Buffer.from("a")] }]).map((each) => each.file)).toEqual([
			join(verify, "shop", "checkout@1500.png"),
		]);
		expect(record([{ pngs: [Buffer.from("b")] }])).toEqual([
			{ file: join(verify, "shop", "checkout.png"), y: 0, height: 900 },
		]);
		expect(readdirSync(join(verify, "shop")).sort()).toEqual([
			"checkout.logs.json",
			"checkout.png",
			"checkout@1500.png",
		]);
		expect(readdirSync(verify).sort()).toEqual(["shop"]);
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
	it("measures overflowing content after a delayed font loads without resizing the shot", {
		timeout: 30_000,
	}, async () => {
		if (!(await browserAvailable())) return;
		const font = readFileSync(
			join(process.cwd(), "node_modules/@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2"),
		);
		// Every request is answered, each well past the settle's whole budget, so
		// the measurement has to wait for the font rather than for the settle. The
		// daemon's photo booth loads the frame for its cover as well as for the
		// shot, so the font is asked for more than once.
		const server = createServer((_request, response: ServerResponse) => {
			setTimeout(() => {
				response.writeHead(200, { "Content-Type": "font/woff2", "Access-Control-Allow-Origin": "*" });
				response.end(font);
			}, 2500);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		onTestFinished(() => {
			server.closeAllConnections();
			return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		});
		const address = server.address();
		if (address === null || typeof address === "string") throw new Error("font server has no port");
		const { root, deps } = await serveVerifyProject();
		writeFrame(
			root,
			"tall",
			`import { useLayoutEffect } from "react";
const font = new FontFace("Shot Test", "url(http://127.0.0.1:${address.port}/font.woff2)");
document.fonts.add(font);
font.load();
export default function Tall() {
	useLayoutEffect(() => {
		const bottom = () => Math.ceil(document.querySelector("main").getBoundingClientRect().bottom);
		console.log("before-font:" + bottom());
		document.fonts.ready.then(() => console.log("after-font:" + bottom()));
	}, []);
	return <main style={{ width: 100, fontFamily: '"Shot Test", Arial', fontSize: 40, lineHeight: 1, wordBreak: "break-all" }}>{"i".repeat(300)}</main>;
}
`,
		);
		const shot = await shotFrame(deps("tall", { viewport: { width: 160, height: 120 } }));
		expect(shot.kind).toBe("shot");
		if (shot.kind !== "shot") throw new Error("shot failed");
		const logs = await logsFrame(deps("tall"));
		if (logs.kind !== "logs") throw new Error("logs failed");
		const before = logs.entries.find((entry) => entry.text.startsWith("before-font:"));
		const after = logs.entries.find((entry) => entry.text.startsWith("after-font:"));
		expect(before).toBeDefined();
		expect(after).toBeDefined();
		expect(shot.contentHeight).toBe(Number(after?.text.split(":")[1]));
		expect(shot.contentHeight).toBeGreaterThan(Number(before?.text.split(":")[1]));
		expect(shot.contentHeight).toBeGreaterThan(120);
		expect(shot.files).toHaveLength(1);
		expect(readPngSize(shot.files[0]?.file as string)).toEqual({ width: 320, height: 240 });
		expect(existsSync(join(root, "design", "frames", "tall", "frame.json"))).toBe(false);
	});

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
		await expect(
			shotFrame(deps("defaulted", { narrate: (line) => defaultNarrations.push(line) })),
		).resolves.toMatchObject({ kind: "shot", height: 900, sizedBy: "default" });
		expect(defaultNarrations).toEqual(['no valid frame.json for "defaulted" — using the 1440×900 default viewport']);
		expect(existsSync(join(root, "design", "frames", "defaulted", "frame.json"))).toBe(false);

		const shot = await shotFrame(
			deps("noisy", {
				viewport: { width: 160, height: 120 },
				narrate: (line) => narrations.push(line),
			}),
		);
		expect(shot.kind).toBe("shot");
		const files = (shot as { files: ShotFile[] }).files.map((each) => each.file);
		expect(files).toEqual([join(root, "design", ".spool", "verify", "noisy.png")]);
		const file = files[0] as string;
		expect(existsSync(file)).toBe(true);
		expect((shot as { bootErrors: string[] }).bootErrors).toEqual([]);
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
		const tiled_ = (tiled as { files: ShotFile[] }).files;
		const tiles = tiled_.map((each) => each.file);
		expect(tiles).toEqual([1, 2, 3].map((n) => join(root, "design", ".spool", "verify", `noisy.${n}.png`)));
		// each slice says which CSS rows it holds, overlap and bottom anchor included
		expect(tiled_.map(({ y, height }) => ({ y, height }))).toEqual(planShot(160, 2600).tiles);
		expect(existsSync(file)).toBe(false);
		for (const tile of tiles) expect(readPngSize(tile)).toEqual({ width: 320, height: 2000 });

		// and back: one short shot retires the whole stack
		const single = await shotFrame(deps("noisy", { viewport: { width: 160, height: 120 } }));
		expect((single as { files: ShotFile[] }).files.map((each) => each.file)).toEqual([file]);
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

	it("shoots a batch in parallel, each frame with its own console errors", { timeout: 120_000 }, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "calm", "export default function Calm() { return <main>calm</main>; }\n");
		writeFrame(
			root,
			"loud",
			`console.error("loud at boot");
console.log("not an error");

export default function Loud() {
	throw new Error("boom in a batch");
}
`,
		);
		writeFrame(root, "broken", "export default function Broken() { return <main>unclosed;\n}\n");
		const { frame: _, ...batch } = deps("unused", { viewport: { width: 160, height: 120 } });

		const shots: BatchShot[] = [];
		for await (const shot of shotFrames(batch, ["calm", "loud", "broken"])) shots.push(shot);

		expect(shots.map((shot) => shot.frame)).toEqual(["calm", "loud", "broken"]);
		const verify = join(root, "design", ".spool", "verify");
		const calm = shots[0]?.outcome;
		if (calm?.kind !== "shot") throw new Error("calm was not shot");
		// one line of text runs as tall as its line, not as the viewport around it
		expect(calm.contentHeight).toBeLessThan(120);
		expect(formatBatchShot(shots[0] as BatchShot)).toBe(
			`calm: shot, --viewport h 120, content ${calm.contentHeight}, no console errors\n  ${join(verify, "calm.png")}  css 160x120, scale 2`,
		);
		const loud = shots[1]?.outcome;
		if (loud?.kind !== "shot") throw new Error("loud was not shot");
		expect(loud.consoleErrors[0]).toBe("[error] loud at boot");
		expect(
			loud.consoleErrors.some((line) => line.startsWith("[pageerror]") && line.includes("boom in a batch")),
		).toBe(true);
		expect(loud.consoleErrors.join("\n")).not.toContain("not an error");
		// a frame that threw drew nothing of its own: it runs as tall as the document
		expect(loud.contentHeight).toBe(120);
		const block = formatBatchShot(shots[1] as BatchShot).split("\n");
		expect(block[0]).toBe(
			`loud: shot, content 120px tall, ${loud.consoleErrors.length} console errors, ${loud.bootErrors.length} uncaught error${loud.bootErrors.length === 1 ? "" : "s"}`,
		);
		expect(block.slice(1)).toEqual(
			[`${join(verify, "loud.png")}  css 160x120, scale 2`, ...loud.consoleErrors]
				.flatMap((line) => line.split("\n"))
				.map((line) => `  ${line}`),
		);
		expect(existsSync(join(verify, "loud.png"))).toBe(true);
		expect(shots[2]?.outcome.kind).toBe("broken");
	});

	it("says what the console never does, and a throw in the frame's own words and lines", {
		timeout: 120_000,
	}, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeFrame(
			root,
			"lost",
			`import { useEffect, useRef } from "react";

export default function Lost() {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		ref.current?.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
	}, []);
	return <canvas ref={ref} width={40} height={40} className="text-nonexistent p-2" />;
}
`,
		);
		writeFrame(
			root,
			"thrower",
			`export default function Thrower() {
	throw new Error("boom at boot");
}
`,
		);
		writeFrame(
			root,
			"looping",
			`import { useLayoutEffect, useState } from "react";

export default function Looping() {
	const [count, setCount] = useState(0);
	useLayoutEffect(() => setCount(count + 1));
	return <main>{count}</main>;
}
`,
		);
		const { frame: _, ...batch } = deps("unused", { viewport: { width: 160, height: 120 } });
		const shots: BatchShot[] = [];
		for await (const shot of shotFrames(batch, ["lost", "thrower", "looping"])) shots.push(shot);
		const [lost, thrower, looping] = shots.map((shot) => shot.outcome);

		// a lost context and a class no stylesheet built leave the console clean
		if (lost?.kind !== "shot") throw new Error("lost was not shot");
		expect(lost.consoleErrors).toEqual([]);
		expect(lost.warnings).toContain("[spool] WebGL context lost: the canvas shows nothing it drew after this");
		expect(lost.warnings).toContain(
			"[spool] classes with no CSS: text-nonexistent (no token or utility builds them)",
		);
		const block = formatBatchShot(shots[0] as BatchShot).split("\n");
		expect(block[0]).toMatch(/^lost: shot, .*, no console errors$/);
		expect(block).toContain("  [spool] WebGL context lost: the canvas shows nothing it drew after this");

		// the stack names the frame's file and line rather than the document's
		if (thrower?.kind !== "shot") throw new Error("thrower was not shot");
		expect(thrower.bootErrors[0]).toMatch(
			/^Error: boom at boot\n {4}at Thrower \(frames\/thrower\/frame\.tsx:2:\d+\)$/,
		);

		// React's own words, where the production build gives a number
		if (looping?.kind !== "shot") throw new Error("looping was not shot");
		expect(looping.bootErrors.join("\n")).toContain("Maximum update depth exceeded");
		expect(looping.bootErrors.join("\n")).toContain("frames/looping/frame.tsx:");
	});

	it("seeks the frame's own time with --at: the same --at is the same picture", { timeout: 120_000 }, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeFrame(
			root,
			"slide",
			`export default function Slide() {
	return (
		<main>
			<style>{"@keyframes slide { from { transform: translateX(0) } to { transform: translateX(120px) } } .box { animation: slide 1000ms linear forwards; width: 40px; height: 40px; background: #f00 }"}</style>
			<div className="box" />
		</main>
	);
}
`,
		);
		const shotsAt = async (...at: number[]) => {
			const shot = await shotFrame(deps("slide", { viewport: { width: 160, height: 60 }, at }));
			if (shot.kind !== "shot") throw new Error("slide was not shot");
			return shot.files.map(({ file }) => readFileSync(file));
		};
		const shotAt = async (at: number) => (await shotsAt(at))[0] as Buffer;
		const half = await shotAt(500);
		expect((await shotAt(500)).equals(half)).toBe(true);
		const quarter = await shotAt(250);
		expect(quarter.equals(half)).toBe(false);
		// a list runs one clock on from each time to the next, landing where each alone does
		const [first, second] = await shotsAt(250, 500);
		expect(first?.equals(quarter)).toBe(true);
		expect(second?.equals(half)).toBe(true);

		// the stopped clocks are the shot's alone, never a boot's beside it
		writeFrame(
			root,
			"clockless",
			`console.log("fake clock: " + String((Date as { isFake?: boolean }).isFake === true));

export default function Clockless() {
	return <main>clockless</main>;
}
`,
		);
		const [, plain] = await Promise.all([shotAt(500), shotFrame(deps("clockless"))]);
		expect(plain.kind).toBe("shot");
		const logs = await logsFrame(deps("clockless"));
		if (logs.kind !== "logs") throw new Error("logs failed");
		expect(logs.entries).toContainEqual({ type: "log", text: "fake clock: false" });
	});

	it("settles the way a cover does, or runs the frame's timers as far as --at says", {
		timeout: 120_000,
	}, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeFrame(
			root,
			"late",
			`import { useEffect } from "react";

export default function Late() {
	useEffect(() => {
		const timer = setTimeout(() => console.log("late"), 2500);
		return () => clearTimeout(timer);
	}, []);
	return <main>late</main>;
}
`,
		);
		const lines = async () => {
			const logs = await logsFrame(deps("late"));
			if (logs.kind !== "logs") throw new Error("logs failed");
			return logs.entries.map((entry) => entry.text);
		};

		// a quiet frame settles in a beat and is shot long before its timer fires
		await expect(shotFrame(deps("late", { viewport: { width: 160, height: 120 } }))).resolves.toMatchObject({
			kind: "shot",
		});
		expect(await lines()).not.toContain("late");

		// a fixed wait is the agent saying when, and the settle is not asked;
		// several times are one boot, each time its own file beside the settled one
		const timed = await shotFrame(deps("late", { viewport: { width: 160, height: 120 }, at: [0, 3500] }));
		if (timed.kind !== "shot") throw new Error("the timed shot failed");
		const verify = join(root, "design", ".spool", "verify");
		expect(timed.files).toEqual([
			{ file: join(verify, "late@0.png"), y: 0, height: 120, at: 0 },
			{ file: join(verify, "late@3500.png"), y: 0, height: 120, at: 3500 },
		]);
		expect(existsSync(join(verify, "late.png"))).toBe(true);
		expect(await lines()).toContain("late");
	});

	it("does not replay logs booted in the other colour scheme", { timeout: 60_000 }, async () => {
		if (!(await browserAvailable())) return;
		const { root, name, url, controlToken, deps } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const verify = await fetch(`${url}/api/p/${name}/verify/quiet`, {
			headers: { "X-Spool-Control": controlToken },
		});
		const { etag, scheme } = (await verify.json()) as { etag: string; scheme: string };
		expect(scheme).toBe("light");
		// the same source, booted dark: nothing a light boot would say
		writeDesignFile(
			root,
			".spool/verify/quiet.logs.json",
			`${JSON.stringify({ etag, scenario: "default", scheme: "dark", entries: [{ type: "log", text: "dark only" }] })}\n`,
		);

		const logs = await logsFrame(deps("quiet", { viewport: { width: 160, height: 120 } }));

		expect(logs).toMatchObject({ kind: "logs", replayed: false });
		expect((logs as { entries: { text: string }[] }).entries).not.toContainEqual(
			expect.objectContaining({ text: "dark only" }),
		);
	});

	it("seeds and caches boots by scenario", { timeout: 180_000 }, async () => {
		if (!(await browserAvailable())) return;

		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, "shared/scenarios/review.json", '{ "state": {} }\n');
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
