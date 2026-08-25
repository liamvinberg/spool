import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixtureTermExecutor, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createTermSessions } from "./term-sessions";

const SENTINEL = "outside-design-sentinel";
const HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

function json(method: "POST" | "PUT", body: unknown): RequestInit {
	return {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

async function expectBoundary(response: Response, path: string, root: string): Promise<void> {
	expect(response.status).toBe(400);
	const body = await response.text();
	expect(body).toBe(`design boundary: "${path}" resolves outside design/`);
	expect(body).not.toContain(root);
	expect(body).not.toContain(SENTINEL);
}

describe("project filesystem sinks", () => {
	it("does not read or overwrite geometry through an escaped sidecar symlink", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", "export default function Frame() { return <p>inside</p> }\n");
		const outside = join(root, "outside.json");
		const sentinel = JSON.stringify({ x: 900, y: 901, w: 902, h: 903, secret: SENTINEL });
		writeFileSync(outside, sentinel);
		symlinkSync(outside, join(root, "design", "frames", "checkout", "frame.json"));
		const app = makeApp(spoolDir);

		await expectBoundary(await app.request(`/api/p/${name}/frames`), "frames/checkout/frame.json", root);

		const write = await app.request(
			`/api/p/${name}/geometry`,
			json("PUT", { frames: { checkout: { x: 1, y: 2, w: 300, h: 400 } } }),
		);
		await expectBoundary(write, "frames/checkout/frame.json", root);
		expect(readFileSync(outside, "utf8")).toBe(sentinel);
	});

	it("does not read or write app state and covers through escaped cache symlinks", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", "export default function Frame() { return <p>inside</p> }\n");
		const cache = join(root, "design", ".spool");
		mkdirSync(join(cache, "thumbs"), { recursive: true });
		const outsideState = join(root, "outside-state.json");
		const outsideCovers = join(root, "outside-covers");
		mkdirSync(outsideCovers, { recursive: true });
		writeFileSync(outsideState, JSON.stringify({ arrows: false, secret: SENTINEL }));
		writeFileSync(join(outsideCovers, `${HASH}.png`), SENTINEL);
		symlinkSync(outsideState, join(cache, "state.json"));
		// a frame's cover folder is where its image lives, so that is the entry an
		// escape would come through
		symlinkSync(outsideCovers, join(cache, "thumbs", "checkout"));
		const app = makeApp(spoolDir);

		await expectBoundary(await app.request(`/api/p/${name}/state`), ".spool/state.json", root);
		await expectBoundary(await app.request(`/covers/${name}/checkout/${HASH}`), ".spool/thumbs/checkout", root);
		const stateWrite = await app.request(`/api/p/${name}/state`, json("PUT", { camera: { x: 1, y: 2, k: 1 } }));
		await expectBoundary(stateWrite, ".spool/state.json", root);
		const body = new FormData();
		body.append("cover", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])]));
		const coverWrite = await app.request(`/api/p/${name}/thumbs/checkout`, { method: "PUT", body });
		await expectBoundary(coverWrite, ".spool/thumbs/checkout", root);
		expect(readFileSync(outsideState, "utf8")).toContain(SENTINEL);
		expect(readFileSync(join(outsideCovers, `${HASH}.png`), "utf8")).toBe(SENTINEL);
		// and the projection reads past it rather than through it
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; cover?: unknown }[];
		};
		expect(frames[0]?.cover).toBeUndefined();
	});

	it("does not follow a pre-planted atomic-write staging symlink", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const cache = join(root, "design", ".spool");
		mkdirSync(cache, { recursive: true });
		const outside = join(root, "outside-state.json");
		writeFileSync(outside, SENTINEL);
		symlinkSync(outside, join(cache, "state.json.tmp"));
		const app = makeApp(spoolDir);

		const response = await app.request(`/api/p/${name}/state`, json("PUT", { camera: { x: 1, y: 2, k: 1 } }));
		expect(response.status).toBe(204);
		expect(readFileSync(outside, "utf8")).toBe(SENTINEL);
		expect(JSON.parse(readFileSync(join(cache, "state.json"), "utf8"))).toEqual({
			camera: { x: 1, y: 2, k: 1 },
		});
	});

	it("refuses an escaped editor read without launching the editor", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const outside = join(root, "outside.tsx");
		writeFileSync(outside, `<button>${SENTINEL}</button>\n`);
		const link = join(root, "design", "shared", "escape.tsx");
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(outside, link);
		const launchEditor = vi.fn();
		const app = makeApp(spoolDir, { launchEditor });

		const editor = await app.request(
			`/api/p/${name}/editor`,
			json("POST", { path: "design/shared/escape.tsx", line: 1 }),
		);
		expect(editor.status).toBe(400);
		expect(await editor.text()).toContain("design boundary");
		expect(launchEditor).not.toHaveBeenCalled();
	});

	it("does not derive flow sites from source symlinks leaving design", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", "export default function Frame() { return <p>inside</p> }\n");
		writeFrame(root, "outside", "export default function Frame() { return <p>target</p> }\n");
		const outside = join(root, "outside.tsx");
		writeFileSync(outside, `export const leak = <button data-go="outside">${SENTINEL}</button>;\n`);
		symlinkSync(outside, join(root, "design", "frames", "checkout", "escape.tsx"));
		const app = makeApp(spoolDir);

		await expectBoundary(await app.request(`/api/p/${name}/flows`), "frames/checkout/escape.tsx", root);
	});

	it("does not read or overwrite witnessed walks through an escaped cache symlink", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", 'export default function Frame() { return <button data-go="done">go</button> }\n');
		writeFrame(root, "done", "export default function Frame() { return <p>done</p> }\n");
		const cache = join(root, "design", ".spool");
		mkdirSync(cache, { recursive: true });
		const outside = join(root, "outside-walked.json");
		const sentinel = JSON.stringify({ secret: SENTINEL, edges: [] });
		writeFileSync(outside, sentinel);
		symlinkSync(outside, join(cache, "walked.json"));
		const app = makeApp(spoolDir);

		const response = await app.request(`/api/p/${name}/walked`, json("POST", { from: "checkout", to: "done" }));
		await expectBoundary(response, ".spool/walked.json", root);
		expect(readFileSync(outside, "utf8")).toBe(sentinel);
	});

	it("rejects an escaped terminal entry before invoking the process executor", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const termDir = join(root, "design", "frames", "dash");
		mkdirSync(termDir, { recursive: true });
		const outside = join(root, "outside.tsx");
		writeFileSync(outside, `process.stdout.write(${JSON.stringify(SENTINEL)});\n`);
		symlinkSync(outside, join(termDir, "term.tsx"));
		const { spawned, executor } = fixtureTermExecutor();
		const sessions = createTermSessions({ executor, publish: () => {} });

		await expect(sessions.attach(root, "dash", { send: () => {} })).rejects.toThrow("design boundary");
		expect(spawned).toEqual([]);
		await sessions.close();
	});

	it("does not read a persisted terminal screen through an escaped cache symlink", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "frames/dash/term.tsx", "export default function Dash() {}\n");
		const cache = join(root, "design", ".spool", "term");
		mkdirSync(cache, { recursive: true });
		const outside = join(root, "outside-screen.json");
		writeFileSync(outside, JSON.stringify({ cols: 1, rows: 1, screen: SENTINEL }));
		symlinkSync(outside, join(cache, "dash.screen"));
		const app = makeApp(spoolDir);

		await expectBoundary(await app.request(`/api/p/${name}/thumbs/dash`), ".spool/term/dash.screen", root);
	});

	it("does not search out of home through a symlink pointing above it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const home = makeTempDir();
		const outside = makeTempDir();
		mkdirSync(join(outside, `${SENTINEL}-folder`), { recursive: true });
		mkdirSync(join(home, "personal"), { recursive: true });
		symlinkSync(outside, join(home, "personal", "escape"), "dir");
		const app = makeApp(spoolDir, { home });

		const response = await app.request(`/api/fs/search?q=${SENTINEL}`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).not.toContain(SENTINEL);
		expect(body).not.toContain(outside);
		expect(JSON.parse(body)).toMatchObject({ hits: [] });
	});

	it("does not move an escaped frame-directory symlink to Trash", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const outside = join(root, "outside-frame");
		mkdirSync(outside);
		writeFileSync(join(outside, "frame.tsx"), `export default function Frame() { return <p>${SENTINEL}</p> }\n`);
		const framesDir = join(root, "design", "frames");
		rmSync(join(framesDir, "checkout"), { recursive: true, force: true });
		symlinkSync(outside, join(framesDir, "checkout"), "dir");
		const moveToTrash = vi.fn(async () => {});
		const app = makeApp(spoolDir, { moveToTrash });

		const response = await app.request(`/api/p/${name}/trash`, json("POST", { frames: ["checkout"] }));
		expect(response.status).toBe(404);
		expect(moveToTrash).not.toHaveBeenCalled();
		expect(readFileSync(join(outside, "frame.tsx"), "utf8")).toContain(SENTINEL);
	});
});
