import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navSequence } from "../term/osc";
import {
	type FakeTermProc,
	fixtureTermExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	serveProject,
	settle,
	sseReader,
	termWsClient,
	until,
	writeDesignFile,
} from "../test-helpers";

/**
 * The daemon app seam for terminal frames (#42): a fixture project on disk, a
 * fixture executor instead of the toolchain, assertions over HTTP, SSE, and a
 * real WebSocket — CI never downloads bun or OpenTUI.
 */

const enc = (s: string) => new TextEncoder().encode(s);

describe("terminal frame documents", () => {
	it("serves term.tsx as an emulator document with zero compile", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/dash`);

		expect(res.status).toBe(200);
		const doc = await res.text();
		expect(doc).toContain('<div id="term">');
		expect(doc).toContain("/vendor/spool-term.js");
		expect(doc).toContain("JetBrains Mono");
		expect(doc).toContain(".xterm");
		expect(doc).toContain(".xterm-viewport::-webkit-scrollbar");
		expect(doc).toContain("scrollbar-width: none");
		expect(doc).toContain(`"frame":"dash"`);
	});

	it("serves the terminal runtime as a self-contained bundle", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const res = await app.request("/vendor/spool-term.js");
		expect(res.status).toBe(200);
		const js = await res.text();
		expect(js).toContain("WebSocket");
		expect(js.length).toBeGreaterThan(10_000);
	});

	it("names a folder holding both entries a discovery error", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "both", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "both", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const doc = await app.request(`/p/${name}/frames/both`);
		expect(doc.status).toBe(500);
		expect(await doc.text()).toContain("holds both frame.tsx and term.tsx");

		const verify = await app.request(`/api/p/${name}/verify/both`);
		expect(verify.status).toBe(500);
		const body = (await verify.json()) as { kind: string; message: string };
		expect(body.message).toContain("design/frames/both");
	});

	it("verify reports a terminal frame as ok — kind is knowable without a compile", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "syntax error here ((\n");
		const app = makeApp(spoolDir);
		const res = await app.request(`/api/p/${name}/verify/dash`);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { kind: string }).kind).toBe("ok");
	});

	it("refuses a DOM capture for a terminal frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);
		const res = await app.request(`/api/p/${name}/thumbs/dash`, { method: "PUT", body: new Uint8Array([1]) });
		expect(res.status).toBe(400);
	});
});

describe("the terminal bridge", () => {
	it("attaches, streams, types, resizes, navigates, dies, and stills — one honest process", {
		timeout: 20_000,
	}, async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const client = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await client.open;
		await until(() => spawned.length >= 1);
		// the freshly-armed watcher may replay the term.tsx write as a save —
		// a legitimate restart; let spawns settle and talk to the survivor
		await settle(() => spawned.length);
		const proc = spawned[spawned.length - 1] as FakeTermProc;
		// born at the conventional floor: no sidecar yet, so 80×24
		expect(proc.spawn).toMatchObject({ cols: 80, rows: 24 });

		proc.emit("\x1b[1mWELCOME\x1b[0m to the dash");
		await until(() => client.streamed().includes("WELCOME"));

		client.socket.send(enc("q"));
		await until(() => proc.inputs.includes("q"));

		client.socket.send(JSON.stringify({ t: "resize", cols: 100, rows: 30 }));
		await until(() => proc.sizes.some((s) => s.cols === 100 && s.rows === 30));

		proc.emit(`pick a plan${navSequence("checkout")}`);
		await until(() => client.controls.some((c) => c.t === "nav" && c.target === "checkout"));
		expect(client.streamed()).not.toContain("7770");

		proc.exit(2);
		await until(() => client.controls.some((c) => c.t === "exit" && c.code === 2));

		// the still rasterizes from the daemon-held grid, pinned font embedded
		const still = await fetch(`${url}/api/p/${name}/thumbs/dash`);
		expect(still.status).toBe(200);
		expect(still.headers.get("content-type")).toContain("image/svg+xml");
		const svg = await still.text();
		expect(svg).toContain("WELCOME");
		expect(svg).toContain("JetBrains Mono");
		expect(svg).toContain("data:font/woff2;base64,");
	});

	it("a save restarts the process and tells every attached client to reset", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// v1\n");

		const client = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await client.open;
		await until(() => spawned.length === 1);

		// macOS arms recursive watchers asynchronously — keep saving until seen
		await until(() => {
			writeDesignFile(root, join("frames", "dash", "term.tsx"), `// v2 ${Date.now()}\n`);
			return client.controls.some((c) => c.t === "restart");
		});
		await until(() => spawned.length >= 2);
		expect(spawned[0]?.killed).toBe(true);
	});

	it("stopping the daemon with an open terminal socket still tears down", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const project = await serveProject({ termExecutor: executor });
		writeDesignFile(project.root, join("frames", "dash", "term.tsx"), "// tui\n");

		const client = termWsClient(`${project.url.replace("http", "ws")}/term/${project.name}/dash`);
		await client.open;
		await until(() => spawned.length === 1);
		// onTestFinished closes the daemon; reaching the end IS the assertion —
		// a wedged close() would time this test out
	});
});

describe("shot for terminal frames", () => {
	it("captures the current screen from the grid, no browser involved", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const client = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await client.open;
		await until(() => spawned.length >= 1);
		await settle(() => spawned.length);
		spawned[spawned.length - 1]?.emit("status: all systems go");
		await until(() => client.streamed().includes("all systems"));

		const { shotFrame } = await import("../verify");
		const outcome = await shotFrame({ daemonUrl: url, root, name, frame: "dash", narrate: () => {} });
		expect(outcome.kind).toBe("shot");
		if (outcome.kind === "shot") {
			expect(outcome.file.endsWith("dash.svg")).toBe(true);
			expect(readFileSync(outcome.file, "utf8")).toContain("all systems go");
		}
	});

	it("names a never-run terminal honestly instead of shooting a blank", async () => {
		const { executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const { shotFrame } = await import("../verify");
		const outcome = await shotFrame({ daemonUrl: url, root, name, frame: "dash", narrate: () => {} });
		expect(outcome.kind).toBe("broken");
		if (outcome.kind === "broken") expect(outcome.message).toContain("has not run yet");
	});
});

describe("terminal events over SSE", () => {
	it("an exit publishes a thumb change so the canvas refetches the still", { timeout: 20_000 }, async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const events = await fetch(`${url}/api/p/${name}/events`);
		const reader = sseReader(events);
		expect((await reader.next()).event).toBe("hello");
		await reader.drain(400);

		const client = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await client.open;
		await until(() => spawned.length >= 1);
		await settle(() => spawned.length);
		spawned[spawned.length - 1]?.emit("done");
		spawned[spawned.length - 1]?.exit(0);

		for (;;) {
			const event = await reader.next(8000);
			if (event.event === "change" && (event.data as { kind: string }).kind === "thumb") {
				expect(event.data).toEqual({ kind: "thumb", frame: "dash" });
				break;
			}
		}
	});
});
