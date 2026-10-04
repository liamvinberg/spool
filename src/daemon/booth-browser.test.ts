import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { type HeadlessShell, headlessShellArgs, launchHeadlessShell } from "../headless-shell";
import { initProject } from "../init";
import { removeProject } from "../remove";
import { makeTempDir, serveProject, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import type { BoothSeams } from "./booth";
import { imageSize, SLOW_PER_SECOND } from "./thumbs";

/**
 * The photo booth against a really-served daemon and the pinned headless shell
 * (#12). No canvas is ever opened here: every cover is the daemon's own work,
 * which is the whole of what the booth changed. On a machine without the
 * shell the test returns early rather than fetching ninety megabytes.
 */

async function shellAvailable(): Promise<boolean> {
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

const frameOf = (colour: string, extra = "") => `export default function Frame() {
	${extra}
	return <main style={{ background: "${colour}", width: "100%", height: "100vh" }}>booth</main>;
}
`;

async function served(booth: BoothSeams = {}) {
	// a machine in dark mode would start the booth dark; these start it light
	const project = await serveProject({ booth: { systemScheme: async () => "light", ...booth } });
	const control = { headers: { "X-Spool-Control": project.controlToken } };
	const projection = async () => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, control);
		return (await res.json()) as { frames: { name: string; cover?: { hash: string } }[] };
	};
	const coverOf = async (frame: string) => (await projection()).frames.find((entry) => entry.name === frame)?.cover;
	const image = async (frame: string, hash: string) => {
		const res = await fetch(
			`${project.url}/covers/${encodeURIComponent(project.name)}/${encodeURIComponent(frame)}/${hash}`,
		);
		return { type: res.headers.get("content-type"), bytes: new Uint8Array(await res.arrayBuffer()) };
	};
	const captureError = (frame: string) => {
		const file = join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame), "error.json");
		return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { error: string }).error : undefined;
	};
	const scheme = (frame: string) => {
		const file = join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame), "scheme");
		return existsSync(file) ? readFileSync(file, "utf8").trim() : undefined;
	};
	/** A canvas connecting: its view's name, and a way to say what it shows. */
	const canvas = async () => {
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const stream = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/events`, {
			headers: { "X-Spool-Control": project.controlToken },
			signal: controller.signal,
		});
		const events = sseReader(stream);
		const hello = await events.next();
		const { view } = hello.data as { view: string };
		const show = (frames: string[], shows: "light" | "dark") =>
			fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/view`, {
				method: "PUT",
				headers: { "X-Spool-Control": project.controlToken, "content-type": "application/json" },
				body: JSON.stringify({ view, page: "", frames, scheme: shows }),
			});
		return { events, show };
	};
	return { ...project, projection, coverOf, image, captureError, scheme, canvas };
}

/**
 * A server a frame calls as it loads, synchronously, so whatever the test does
 * on that call happens while the frame is in a tab: before it draws, before
 * the booth photographs it. The line it hands back goes at the top of a frame.
 */
async function midSitting(onCall: (frame: string) => void | Promise<void>) {
	const server = createServer((request, response) => {
		const frame = new URL(request.url ?? "/", "http://hook").searchParams.get("frame") ?? "";
		void Promise.resolve(onCall(frame)).finally(() => {
			response.writeHead(204, { "access-control-allow-origin": "*" });
			response.end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("the hook has no port");
	return (frame: string) =>
		`const call = new XMLHttpRequest(); call.open("GET", "http://127.0.0.1:${address.port}/?frame=${frame}", false); call.send();`;
}

/** The colour at the middle of a cover, read by a browser of the test's own. */
async function colourOf(bytes: Uint8Array): Promise<number[]> {
	const browser = await chromium.launch({
		channel: "chromium-headless-shell",
		headless: true,
		args: headlessShellArgs(),
	});
	try {
		const page = await browser.newPage();
		return await page.evaluate(async (data) => {
			const image = new Image();
			image.src = `data:image/jpeg;base64,${data}`;
			await image.decode();
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext("2d");
			if (context === null) throw new Error("no 2d context");
			context.drawImage(image, 0, 0);
			return Array.from(context.getImageData(image.naturalWidth >> 1, image.naturalHeight >> 1, 1, 1).data);
		}, Buffer.from(bytes).toString("base64"));
	} finally {
		await browser.close();
	}
}

it("covers a frame a read finds uncovered, with nothing open", { timeout: 60_000 }, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	writeFrame(project.root, "cover-me", frameOf("#f5391a"));

	// the read that finds no cover is the read that asks for one
	expect(await project.coverOf("cover-me")).toBeUndefined();
	await expect
		.poll(() => project.coverOf("cover-me"), { timeout: 45_000 })
		.toMatchObject({ hash: expect.any(String) });

	const cover = await project.coverOf("cover-me");
	const image = await project.image("cover-me", cover?.hash ?? "");
	// bounded and lossy, sharp at the live threshold (#8): the default 1440 x 900 footprint at 800 wide
	expect(image.type).toBe("image/jpeg");
	expect(imageSize(image.bytes)).toEqual({ width: 800, height: 500 });
});

it("photographs an edit, a resize and a broken frame without a canvas, and leaves a move alone", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	writeFrame(project.root, "edited", frameOf("#f5391a"));
	writeDesignFile(project.root, "frames/edited/frame.json", `${JSON.stringify({ x: 0, y: 0, w: 390, h: 844 })}\n`);
	await project.projection();
	await expect.poll(() => project.coverOf("edited"), { timeout: 45_000 }).toBeDefined();
	const first = (await project.coverOf("edited"))?.hash;
	expect(imageSize((await project.image("edited", first ?? "")).bytes)).toEqual({ width: 800, height: 1731 });

	// an agent's edit to the file is a picture owed, whether or not anyone is looking
	writeFrame(project.root, "edited", frameOf("#1a39f5"));
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(first);
	const edited = (await project.coverOf("edited"))?.hash;

	// a move rewrites the sidecar and owes nothing; give the booth time to be wrong
	writeDesignFile(project.root, "frames/edited/frame.json", `${JSON.stringify({ x: 400, y: 120, w: 390, h: 844 })}\n`);
	await new Promise((done) => setTimeout(done, 3000));
	expect((await project.coverOf("edited"))?.hash).toBe(edited);

	// a resize is: the stored picture has the old size's layout and shape
	writeDesignFile(
		project.root,
		"frames/edited/frame.json",
		`${JSON.stringify({ x: 400, y: 120, w: 1200, h: 800 })}\n`,
	);
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(edited);
	const resized = (await project.coverOf("edited"))?.hash ?? "";
	expect(imageSize((await project.image("edited", resized)).bytes)).toEqual({ width: 800, height: 533 });

	// a broken compile keeps the last good picture and says why beside it (#173)
	writeFrame(project.root, "edited", "export default function Frame() { return <main>unclosed;\n}\n");
	await expect.poll(() => project.captureError("edited"), { timeout: 30_000 }).toContain("Unexpected end of file");
	expect((await project.coverOf("edited"))?.hash).toBe(resized);

	// a frame that throws as it boots is recorded as one, with its own words
	writeFrame(project.root, "thrower", 'export default function Frame() { throw new Error("boom on boot"); }\n');
	await project.projection();
	await expect
		.poll(() => project.captureError("thrower"), { timeout: 30_000 })
		.toBe("threw on boot: Error: boom on boot");
	expect(await project.coverOf("thrower")).toBeUndefined();

	// and the next good edit retires the reason with the picture it lands
	writeFrame(project.root, "edited", frameOf("#11aa11"));
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(resized);
	expect(project.captureError("edited")).toBeUndefined();
});

it("times an edited frame's redraws after its picture, and only an edited one", { timeout: 120_000 }, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	const pace = (frame: string) => {
		const file = join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame), "pace.json");
		return existsSync(file)
			? (JSON.parse(readFileSync(file, "utf8")) as { perSecond: number; scale: number })
			: undefined;
	};
	writeFrame(project.root, "timed", frameOf("#f5391a"));
	await project.projection();
	await expect.poll(() => project.coverOf("timed"), { timeout: 45_000 }).toBeDefined();
	// a picture only missing is a first pass through the project, timed for nobody
	expect(pace("timed")).toBeUndefined();

	// a frame whose every redraw holds its renderer 60 ms can not keep up
	const heavy = `const end = performance.now() + 60; while (performance.now() < end) {}`;
	writeFrame(
		project.root,
		"timed",
		`import { useEffect } from "react";
export default function Frame() {
	useEffect(() => {
		let id = 0;
		const loop = () => { ${heavy} id = requestAnimationFrame(loop); };
		id = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(id);
	}, []);
	return <main style={{ background: "#1a39f5", width: "100%", height: "100vh" }}>heavy</main>;
}
`,
	);
	await expect.poll(() => pace("timed")?.perSecond, { timeout: 45_000 }).toBeLessThan(SLOW_PER_SECOND);
	expect(pace("timed")?.scale).toBe(2);

	// and the edit that lightens it says so
	writeFrame(project.root, "timed", frameOf("#11aa11"));
	await expect.poll(() => pace("timed")?.perSecond ?? 0, { timeout: 45_000 }).toBeGreaterThanOrEqual(SLOW_PER_SECOND);
});

it("photographs in the scheme the canvas shows, and again only what follows it when that changes", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	writeFrame(
		project.root,
		"night",
		`export default function Frame() {
	return <main className="h-screen bg-white dark:bg-black">night</main>;
}
`,
	);
	writeFrame(project.root, "plain", frameOf("#f5391a"));
	await project.projection();
	await expect
		.poll(
			async () => (await project.coverOf("night")) !== undefined && (await project.coverOf("plain")) !== undefined,
			{
				timeout: 45_000,
			},
		)
		.toBe(true);
	// the writes' own change events ask again behind the read that found them
	// uncovered; let that settle before calling either picture the light one
	await new Promise((done) => setTimeout(done, 3000));
	const lightNight = (await project.coverOf("night"))?.hash;
	const plain = (await project.coverOf("plain"))?.hash;
	expect(project.scheme("night")).toBe("light");
	expect(project.scheme("plain")).toBeUndefined();

	// a canvas connects, and its frames render dark
	const canvas = await project.canvas();
	expect((await canvas.show(["night", "plain"], "dark")).status).toBe(204);

	// the picture that says dark is the one taken in dark, whatever was in a tab
	// when the canvas said so
	await expect
		.poll(async () => project.scheme("night") === "dark" && (await project.coverOf("night"))?.hash !== lightNight, {
			timeout: 30_000,
		})
		.toBe(true);
	// a frame that looks the same in both was not photographed again
	expect((await project.coverOf("plain"))?.hash).toBe(plain);
});

it("stores a picture only of the frame as it stands: none of a frame deleted, none of a source edited, while it sat", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	const seen = new Set<string>();
	const hook = await midSitting((frame) => {
		if (seen.has(frame)) return;
		seen.add(frame);
		if (frame === "ghost") rmSync(join(project.root, "design", "frames", "ghost"), { recursive: true, force: true });
		if (frame === "edited") writeFrame(project.root, "edited", frameOf("#1a39f5"));
	});
	// every picture the edited frame is ever given, read the moment it lands
	const canvas = await project.canvas();
	const landed: number[][] = [];
	void (async () => {
		for (;;) {
			const event = await canvas.events.next(120_000).catch(() => undefined);
			if (event === undefined) return;
			const change = event.data as { kind?: string; frame?: string; cover?: { hash: string } };
			if (change.kind !== "thumb" || change.frame !== "edited" || change.cover === undefined) continue;
			landed.push(await colourOf((await project.image("edited", change.cover.hash)).bytes));
		}
	})();

	writeFrame(project.root, "ghost", frameOf("#f5391a", hook("ghost")));
	writeFrame(project.root, "edited", frameOf("#f5391a", hook("edited")));
	await project.projection();

	// the edit made in the tab is what the cover shows, and nothing before it was stored
	await expect.poll(() => landed.length, { timeout: 45_000 }).toBeGreaterThan(0);
	const [red, green, blue] = landed[0] ?? [];
	expect(blue).toBeGreaterThan(200);
	expect(red).toBeLessThan(60);
	expect(green).toBeLessThan(90);
	expect(landed.every(([r, , b]) => (b ?? 0) > (r ?? 0))).toBe(true);
	// the deleted frame was photographed and left no picture and no reason behind
	expect(seen.has("ghost")).toBe(true);
	expect(existsSync(join(project.root, "design", ".spool", "thumbs", "ghost"))).toBe(false);
});

it("gives up on a frame that never answers again once it has drawn, keeps its old cover, and goes on", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served({ timing: { sittingMs: 4000, shotMs: 4000 } });
	writeFrame(project.root, "spinner", frameOf("#f5391a"));
	await project.projection();
	await expect.poll(() => project.coverOf("spinner"), { timeout: 45_000 }).toBeDefined();
	const good = (await project.coverOf("spinner"))?.hash;

	// it draws, and then its main thread never comes back
	writeFrame(
		project.root,
		"spinner",
		`import { useEffect } from "react";
export default function Frame() {
	useEffect(() => {
		setTimeout(() => {
			for (;;) {}
		}, 0);
	}, []);
	return <main style={{ background: "#1a39f5", width: "100%", height: "100vh" }}>spin</main>;
}
`,
	);
	await expect
		.poll(() => project.captureError("spinner"), { timeout: 30_000 })
		.toBe("the frame did not finish being photographed within 4 s");
	expect((await project.coverOf("spinner"))?.hash).toBe(good);

	// an agent's shot of it is told the same, in plain words, and does not hang
	const boot = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/boot/spinner`, {
		method: "POST",
		headers: { "X-Spool-Control": project.controlToken, "content-type": "application/json" },
		body: JSON.stringify({ width: 390, height: 844 }),
	});
	const lines = (await boot.text()).trim().split("\n");
	expect(JSON.parse(lines.at(-1) ?? "{}")).toEqual({
		outcome: { kind: "failed", message: "the frame did not finish booting within 4 s" },
	});

	// and the booth goes on: the next edit lands in a fresh tab
	writeFrame(project.root, "spinner", frameOf("#11aa11"));
	await expect.poll(async () => (await project.coverOf("spinner"))?.hash, { timeout: 30_000 }).not.toBe(good);
	expect(project.captureError("spinner")).toBeUndefined();
});

/**
 * A frame covered and quiet, its own write's events long since handled, so the
 * one sitting a test then asks for (its cover forgotten, a read finding none) is
 * the only thing that can photograph it again.
 */
async function coveredAndQuiet(project: Awaited<ReturnType<typeof served>>, frame: string) {
	await project.projection();
	await expect.poll(() => project.coverOf(frame), { timeout: 45_000 }).toBeDefined();
	await new Promise((done) => setTimeout(done, 2000));
	rmSync(join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame)), {
		recursive: true,
		force: true,
	});
}

it("photographs again a frame whose canvas changed scheme while it sat", { timeout: 120_000 }, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	const canvas = await project.canvas();
	await canvas.show(["night"], "light");
	let armed = false;
	const hook = await midSitting(async (frame) => {
		if (frame !== "night" || !armed) return;
		armed = false;
		// the canvas goes dark while the frame is in a tab, light
		await canvas.show(["night"], "dark");
	});
	writeFrame(
		project.root,
		"night",
		`${hook("night")}
export default function Frame() {
	return <main className="h-screen bg-white dark:bg-black">night</main>;
}
`,
	);
	await coveredAndQuiet(project, "night");
	armed = true;
	await project.projection();

	await expect.poll(() => project.scheme("night"), { timeout: 45_000 }).toBe("dark");
	expect(armed).toBe(false);
});

it("photographs in a new browser the frames that were in one that died, and blames none of them", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const shells: HeadlessShell[] = [];
	const project = await served({
		launch: async () => {
			const shell = await launchHeadlessShell();
			shells.push(shell);
			return shell;
		},
	});
	let armed = false;
	const hook = await midSitting(async (frame) => {
		if (frame !== "victim" || !armed) return;
		armed = false;
		await shells.at(-1)?.kill();
	});
	writeFrame(project.root, "victim", frameOf("#f5391a", hook("victim")));
	await coveredAndQuiet(project, "victim");
	const launched = shells.length;
	// a reason written and retired again would leave nothing behind, so watch for one
	const blamed: string[] = [];
	const watch = setInterval(() => {
		const reason = project.captureError("victim");
		if (reason !== undefined) blamed.push(reason);
	}, 20);
	onTestFinished(() => clearInterval(watch));
	armed = true;
	await project.projection();

	await expect.poll(() => project.coverOf("victim"), { timeout: 45_000 }).toBeDefined();
	expect(armed).toBe(false);
	expect(shells).toHaveLength(launched + 1);
	expect(blamed).toEqual([]);
});

it("owes a project that left nothing more, even when another folder now answers to its name", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	let armed = false;
	let elsewhere = 0;
	const hook = await midSitting((frame) => {
		if (frame === "elsewhere") elsewhere++;
		if (frame !== "home" || !armed) return;
		armed = false;
		// the frame changes while it sits, and its project moves to another
		// folder of the same name, where a frame of the same name is someone else's
		writeFrame(project.root, "home", frameOf("#1a39f5"));
		const moved = join(makeTempDir(), project.name);
		mkdirSync(moved);
		initProject(moved, project.spoolDir);
		writeFrame(moved, "home", frameOf("#11aa11", hook("elsewhere")));
		removeProject(project.root, project.spoolDir);
	});
	writeFrame(project.root, "home", frameOf("#f5391a", hook("home")));
	await coveredAndQuiet(project, "home");
	armed = true;
	await project.projection();
	await expect.poll(() => armed, { timeout: 45_000 }).toBe(false);

	// the picture of the old source is owed again only while its project is kept
	await new Promise((done) => setTimeout(done, 6000));
	expect(elsewhere).toBeLessThanOrEqual(1);
});
