import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer as createTlsServer } from "node:tls";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { runCheck } from "../check-command";
import { type HeadlessShell, headlessShellArgs, launchHeadlessShell } from "../headless-shell";
import { initProject } from "../init";
import { removeProject } from "../remove";
import { makeTempDir, serveProject, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import type { BoothSeams } from "./booth";
import { imageSize, readCaptureError, SLOW_PER_SECOND } from "./thumbs";

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

async function served(booth: BoothSeams = {}, experiments?: { deck: boolean }) {
	// a machine in dark mode would start the booth dark; these start it light
	const project = await serveProject({
		booth: { systemScheme: async () => "light", ...booth },
		...(experiments === undefined ? {} : { experiments }),
	});
	const control = { headers: { "X-Spool-Control": project.controlToken } };
	const projection = async () => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, control);
		return (await res.json()) as { frames: { name: string; cover?: { hash: string; opening?: string } }[] };
	};
	const coverOf = async (frame: string) => (await projection()).frames.find((entry) => entry.name === frame)?.cover;
	const image = async (frame: string, hash: string) => {
		const res = await fetch(
			`${project.url}/covers/${encodeURIComponent(project.name)}/${encodeURIComponent(frame)}/${hash}`,
		);
		return { type: res.headers.get("content-type"), bytes: new Uint8Array(await res.arrayBuffer()) };
	};
	const captureError = (frame: string) => {
		return readCaptureError(project.root, frame, "0.0.0-test")?.error;
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
 *
 * Frames are https-only, and the booth's browser trusts no certificate of a
 * test's, so the call is an https one held at its handshake: the frame names
 * itself in the host it dials, the server holds that handshake open for as
 * long as the test works, then refuses it, and the frame carries on.
 */
async function midSitting(onCall: (frame: string) => void | Promise<void>) {
	const server = createTlsServer({
		SNICallback: (servername, refuse) => {
			const frame = servername.slice(0, -".hook.localhost".length);
			void Promise.resolve(onCall(frame)).finally(() => refuse(new Error("held, never served")));
		},
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("the hook has no port");
	return (frame: string) =>
		`const call = new XMLHttpRequest(); call.open("GET", "https://${frame}.hook.localhost:${address.port}/", false); try { call.send(); } catch {}`;
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
	// and what it said in the picture, which the frame finder answers by
	const said = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frame-words`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	expect(await said.json()).toEqual({ words: { edited: ["booth"] } });

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

/** A served project whose booth's shell says it draws on the GPU or in software, whichever it really draws on. */
async function servedDrawing(software: boolean) {
	const project = await served({ launch: async () => ({ ...(await launchHeadlessShell()), software }) });
	const pace = (frame: string) => {
		const file = join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame), "pace.json");
		return existsSync(file)
			? (JSON.parse(readFileSync(file, "utf8")) as { perSecond: number; scale: number })
			: undefined;
	};
	return { project, pace };
}

it("times an edited frame's redraws after its picture, and only an edited one", { timeout: 120_000 }, async () => {
	if (!(await shellAvailable())) return;
	const { project, pace } = await servedDrawing(false);
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

it("times nothing in a browser that draws in software, and forgets what it timed before", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const { project, pace } = await servedDrawing(true);
	writeFrame(project.root, "untimed", frameOf("#f5391a"));
	await project.projection();
	await expect.poll(() => project.coverOf("untimed"), { timeout: 45_000 }).toBeDefined();
	// a slow timing a software booth recorded before #225
	const file = join(project.root, "design", ".spool", "thumbs", "untimed", "pace.json");
	writeFileSync(file, `${JSON.stringify({ perSecond: 3, slowestMs: 400, scale: 2 })}\n`);
	writeFrame(project.root, "untimed", frameOf("#1a39f5"));
	await expect.poll(() => pace("untimed"), { timeout: 45_000 }).toBeUndefined();
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
	// whichever step it was at when its thread stopped: its boot, or its settle
	expect(JSON.parse(lines.at(-1) ?? "{}")).toEqual({
		outcome: {
			kind: "failed",
			message: expect.stringMatching(/^the frame did not answer for 4 s while (booting|settling)$/),
		},
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

/**
 * Reads the project, the way an open canvas keeps reading it, until the frame
 * has sat again (`sat`). One read is not always enough: on a slow machine the
 * sitting for the frame's own write can still be in its tab, timing its redraws,
 * when the cover is forgotten, and that tab counts the missing picture as the
 * one it is making; only a read after it lets go owes the frame again.
 */
async function readUntilSat(project: Awaited<ReturnType<typeof served>>, sat: () => boolean) {
	await expect
		.poll(
			async () => {
				if (!sat()) await project.projection();
				return sat();
			},
			{ timeout: 45_000, interval: 500 },
		)
		.toBe(true);
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
	await readUntilSat(project, () => !armed);

	await expect.poll(() => project.scheme("night"), { timeout: 45_000 }).toBe("dark");
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
	await readUntilSat(project, () => !armed);

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
	await readUntilSat(project, () => !armed);

	// the picture of the old source is owed again only while its project is kept
	await new Promise((done) => setTimeout(done, 6000));
	expect(elsewhere).toBeLessThanOrEqual(1);
});

/** A PNG of one colour, `width` by `height`: a picture far larger than any slide draws it, in a few bytes. */
function flatPng(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.alloc(1 + width * 3, 0x60);
	row[0] = 0;
	const rows = Buffer.concat(Array.from({ length: height }, () => row));
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/**
 * A talk of five slides, each slow in its own way but the first: what `spool
 * check` names for each once the booth has timed them (spool#318).
 */
/**
 * Work that holds the slide's thread 60 ms every 16, from a timer rather than
 * a frame callback: slow on any machine, and invisible to the census, so what
 * check names is what the slide does besides.
 */
const heavy = (while_ = "true", forMs = "Infinity") => `useEffect(() => {
		if (!(${while_})) return;
		const until = performance.now() + ${forMs};
		const id = setInterval(() => {
			if (performance.now() > until) return clearInterval(id);
			const end = performance.now() + 60;
			while (performance.now() < end) {}
		}, 16);
		return () => clearInterval(id);
	}, [${while_ === "true" ? "" : while_}]);`;

const TALK: Record<string, string> = {
	clean: `export default function Clean() {
	return (
		<main style={{ height: "100%", background: "#111", color: "#eee", padding: 64 }}>
			<h1>Clean</h1>
		</main>
	);
}
`,
	layout: `import { useEffect } from "react";
const BOXES = Array.from({ length: 1500 }, (_, i) => i);
export default function Layout() {
	${heavy()}
	return (
		<main style={{ height: "100%", position: "relative", overflow: "hidden" }}>
			<style>{"@keyframes slide { from { left: 0; width: 4px } to { left: 900px; width: 300px } }"}</style>
			{BOXES.map((i) => (
				<div key={i} style={{ position: "absolute", top: (i % 140) * 5, height: 4, background: "#345", animation: "slide 900ms infinite alternate" }} />
			))}
		</main>
	);
}
`,
	endless: `import { useEffect } from "react";
export default function Endless() {
	${heavy()}
	return (
		<main className="endless" style={{ height: "100%" }}>
			<style>{"@property --t { syntax: '<number>'; inherits: true; initial-value: 0; } @keyframes swell { to { --t: 1 } } .endless { animation: swell 900ms infinite alternate }"}</style>
		</main>
	);
}
`,
	picture: `import { useEffect } from "react";
import big from "./big.png";
const PICTURES = Array.from({ length: 12 }, (_, i) => i);
export default function Picture() {
	${heavy()}
	return (
		<main style={{ height: "100%", display: "flex", flexWrap: "wrap" }}>
			{PICTURES.map((i) => <img key={i} src={big} alt="" style={{ width: 300, height: 200 }} />)}
		</main>
	);
}
`,
	reveal: `import { useEffect } from "react";
import { ui } from "spool";
const BOXES = Array.from({ length: 1000 }, (_, i) => i);
export default function Reveal() {
	const beat = ui.beats(["title", "claim", "detail"]);
	const detail = beat.reached("detail");
	${heavy("detail", "1500")}
	return (
		<main style={{ height: "100%", position: "relative", overflow: "hidden" }}>
			<h1 style={{ opacity: beat.reached("claim") ? 1 : 0, transition: "opacity 300ms" }}>Reveal</h1>
			{BOXES.map((i) => (
				<div key={i} style={{ position: "absolute", top: (i % 140) * 5, height: 4, background: "#354", left: detail ? 900 : 0, width: detail ? 300 : 4, transition: "left 900ms, width 900ms" }} />
			))}
		</main>
	);
}
`,
};

it("times a talk's slides beat by beat, and check names the slow ones with why", { timeout: 240_000 }, async () => {
	if (!(await shellAvailable())) return;
	const { project, pace } = await servedDrawing(false);
	writeDesignFile(
		project.root,
		"frames/talk/deck.json",
		`${JSON.stringify({ version: 1, w: 1280, h: 720, slides: Object.keys(TALK) }, null, "\t")}\n`,
	);
	const pictureDir = join(project.root, "design", "frames", "talk", "picture");
	mkdirSync(pictureDir, { recursive: true });
	writeFileSync(join(pictureDir, "big.png"), flatPng(6000, 4000));
	// written while the project is open, each is an edit, which is what has a frame timed
	for (const [slide, source] of Object.entries(TALK)) {
		writeDesignFile(project.root, `frames/talk/${slide}/frame.json`, `${JSON.stringify({ w: 1280, h: 720 })}\n`);
		writeFrame(project.root, `talk/${slide}`, source);
	}
	await project.projection();
	for (const slide of Object.keys(TALK))
		await expect.poll(() => pace(`talk/${slide}`), { timeout: 90_000 }).toBeDefined();
	const reveal = pace("talk/reveal") as { beats?: { beat: number; name: string }[] } | undefined;
	expect(reveal?.beats?.map(({ beat, name }) => [beat, name])).toEqual([
		[1, "claim"],
		[2, "detail"],
	]);

	const checked = await runCheck(project.root, project.root, ["design/frames/talk"], {
		spool: "0.0.0-test",
		on: () => true,
	});
	const noteOf = (slide: string) =>
		checked.stderr.find((note) => note.startsWith(`design/frames/talk/${slide}/frame.tsx`)) ?? "";
	expect(checked.stderr.join("\n")).not.toContain("talk/clean");
	expect(noteOf("layout")).toMatch(/^design\/frames\/talk\/layout\/frame\.tsx: slide 2, slow: /);
	expect(noteOf("layout")).toContain(
		"animates left and width on 1500 elements: these re-lay the page out every frame; move and size with transform",
	);
	// an animation of a registered custom property, which names no property a stylesheet would
	expect(noteOf("endless")).toContain("an animation that never ends keeps the slide drawing while you talk");
	expect(noteOf("picture")).toContain("12 images of 6000 by 4000 drawn at 300 by 200; make them about 600 by 400");
	// and what it counted as a beat entered: the transitions that beat started
	expect(noteOf("reveal")).toContain('slide 5, slow while beat 3 ("detail") enters');
	expect(noteOf("reveal")).toContain("animates left and width on 1000 elements");
	expect(checked.stdout).toEqual([
		"checked 5 frames (5 source files), 0 errors; 4 of the 5 slides in talk timed slow",
	]);
	expect(checked.ok).toBe(true);
});

it("photographs a slide of a talk again as the talk draws it, on the beat it opens on, and no other frame", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served({}, { deck: true });
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	writeDesignFile(
		project.root,
		"frames/talk/deck.json",
		json({ version: 1, w: 1280, h: 720, slides: ["one", "two"] }),
	);
	// a slide red on the beat it opens on and blue on its last, which its cover shows
	writeFrame(
		project.root,
		"talk/one",
		`import { ui } from "spool";

export default function Slide() {
	const beat = ui.beats(["red", "blue"]);
	return <main style={{ background: beat.name, width: "100%", height: "100vh" }}>one</main>;
}
`,
	);
	writeFrame(project.root, "talk/two", frameOf("#11aa11"));
	writeFrame(project.root, "talk/loose", frameOf("#11aa11"));
	for (const [index, name] of ["one", "two", "loose"].entries()) {
		writeDesignFile(project.root, `frames/talk/${name}/frame.json`, json({ x: index * 1440, y: 0, w: 1280, h: 720 }));
	}
	await project.projection();
	await expect.poll(async () => (await project.coverOf("talk/one"))?.opening, { timeout: 60_000 }).toBeDefined();
	const one = await project.coverOf("talk/one");
	const still = await project.image("talk/one", one?.opening ?? "");
	expect(still.type).toBe("image/jpeg");
	// as wide as the presenter view draws it on a Retina laptop, where the cover is made for a card
	expect(imageSize(still.bytes)).toEqual({ width: 1920, height: 1080 });
	expect(imageSize((await project.image("talk/one", one?.hash ?? "")).bytes)).toEqual({ width: 800, height: 450 });
	const red = await colourOf(still.bytes);
	expect(red[0]).toBeGreaterThan(200);
	expect(red[2]).toBeLessThan(60);
	const blue = await colourOf((await project.image("talk/one", one?.hash ?? "")).bytes);
	expect(blue[2]).toBeGreaterThan(200);
	// a slide of one beat stands on it already
	await expect.poll(async () => (await project.coverOf("talk/two"))?.opening, { timeout: 30_000 }).toBeDefined();
	// a frame on the deck's page that is no slide of its talk is never presented
	await expect.poll(() => project.coverOf("talk/loose"), { timeout: 30_000 }).toBeDefined();
	expect((await project.coverOf("talk/loose"))?.opening).toBeUndefined();

	// an edit takes both again
	writeFrame(project.root, "talk/two", frameOf("#1a39f5"));
	const was = (await project.coverOf("talk/two"))?.opening;
	await expect
		.poll(async () => (await project.coverOf("talk/two"))?.opening, { timeout: 30_000 })
		.not.toBeOneOf([undefined, was]);

	// a slide photographed before the booth took opening stills is owed one once a canvas reads it
	const folder = join(project.root, "design", ".spool", "thumbs", encodeURIComponent("talk/one"));
	rmSync(join(folder, `opening-${one?.opening}.jpg`));
	expect((await project.coverOf("talk/one"))?.opening).toBeUndefined();
	await expect.poll(async () => (await project.coverOf("talk/one"))?.opening, { timeout: 30_000 }).toBeDefined();
});
