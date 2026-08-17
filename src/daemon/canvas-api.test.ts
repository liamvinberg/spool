import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
	makeApp,
	makeProject,
	makeTempDir,
	sseReader,
	writeDesignFile,
	writeFrame,
	writePageFrame,
} from "../test-helpers";
import { createDaemonApp } from "./app";
import { writeSession } from "./session";
import { createMachineStateWatchHarness } from "./session-test-harness";
import { terminalSourceVersion } from "./term-source";
import { readCaptureError } from "./thumbs";

/** Smallest real PNG: 1×1 transparent pixel. */
const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);

/** Smallest real JPEG: 1×1 — the encoding bounded covers arrive in. */
const JPEG_BYTES = Buffer.from(
	"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
	"base64",
);

const frameTsx = (label: string) => `export default function Frame() {
	return <p>${label}</p>;
}
`;

/** A cover arrives as one image. */
function coverBody(bytes: Buffer): FormData {
	const body = new FormData();
	body.append("cover", new Blob([new Uint8Array(bytes)]));
	return body;
}

const putCover = (app: ReturnType<typeof makeApp>, name: string, frame: string, body: FormData) =>
	app.request(`/api/p/${name}/thumbs/${frame}`, { method: "PUT", body });

const postCaptureError = (app: ReturnType<typeof makeApp>, name: string, frame: string, error: unknown) =>
	app.request(`/api/p/${name}/thumbs/${frame}/error`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ error }),
	});

interface Cover {
	hash: string;
}

describe("frame projection", () => {
	it("lists frames with geometry from their sidecars", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		writeDesignFile(root, "frames/checkout/frame.json", '{ "x": 120, "y": 40, "w": 800, "h": 600 }\n');
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { root: string; frames: unknown[] };
		expect(body.root).toBe(root);
		expect(body.frames).toEqual([
			{ name: "checkout", kind: "html", x: 120, y: 40, w: 800, h: 600, born: expect.any(Number) },
		]);
	});

	it("fills in missing sidecars on disk, placing frames side by side", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "menu", frameTsx("menu"));
		writeFrame(root, "cart", frameTsx("cart"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames`);

		const { frames } = (await res.json()) as { frames: { name: string; x: number; w: number }[] };
		// name order, page-sized defaults, gutter apart, no overlap
		expect(frames.map((f) => f.name)).toEqual(["cart", "menu"]);
		expect(frames).toMatchObject([
			{ name: "cart", x: 80, y: 80, w: 1440, h: 900 },
			{ name: "menu", x: 80 + 1440 + 80, y: 80, w: 1440, h: 900 },
		]);
		// the app fills in the sidecar (#3): geometry is durable, not re-rolled per request
		const sidecar = JSON.parse(readFileSync(join(root, "design", "frames", "cart", "frame.json"), "utf8"));
		expect(sidecar).toEqual({ x: 80, y: 80, w: 1440, h: 900 });

		const again = (await (await app.request(`/api/p/${name}/frames`)).json()) as { frames: unknown[] };
		expect(again.frames).toEqual(frames);
	});

	it("places new frames beyond the existing field, never on top of it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", frameTsx("home"));
		writeDesignFile(root, "frames/home/frame.json", '{ "x": -500, "y": -200, "w": 1280, "h": 800 }\n');
		writeFrame(root, "detail", frameTsx("detail"));
		const app = makeApp(spoolDir);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; x: number; y: number; w: number; h: number }[];
		};

		const detail = frames.find((f) => f.name === "detail");
		// to the right of the field's right edge (-500 + 1280 = 780) plus a gutter
		expect(detail).toMatchObject({ x: 780 + 80, y: -200 });
	});

	it("heals a corrupt or partial sidecar instead of failing the projection", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "broken", frameTsx("broken"));
		writeDesignFile(root, "frames/broken/frame.json", "{ nope\n");
		writeFrame(root, "partial", frameTsx("partial"));
		writeDesignFile(root, "frames/partial/frame.json", '{ "x": 10 }\n');
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames`);

		expect(res.status).toBe(200);
		const { frames } = (await res.json()) as { frames: { name: string; w: number }[] };
		expect(frames).toHaveLength(2);
		for (const frame of frames) expect(frame.w).toBe(1440);
	});

	it("projects only folders holding a frame.tsx and 404s unknown projects", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "real", frameTsx("real"));
		mkdirSync(join(root, "design", "frames", "empty-folder"), { recursive: true });
		writeFileSync(join(root, "design", "frames", ".DS_Store"), "junk");
		const app = makeApp(spoolDir);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string }[];
		};
		expect(frames.map((f) => f.name)).toEqual(["real"]);

		expect((await app.request("/api/p/ghost/frames")).status).toBe(404);
	});

	it("hands each covered frame the immutable image that addresses its cover", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "covered", frameTsx("covered"));
		writeFrame(root, "bare", frameTsx("bare"));
		const app = makeApp(spoolDir);

		const put = await putCover(app, name, "covered", coverBody(JPEG_BYTES));
		expect(put.status).toBe(200);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; cover?: Cover }[];
		};
		const byName = Object.fromEntries(frames.map((frame) => [frame.name, frame]));
		expect(byName.covered?.cover).toEqual(await put.json());
		// a frame with no cover simply has none: the canvas shows its placeholder
		expect(byName.bare?.cover).toBeUndefined();
	});

	it("does not see the pre-image-store bare file as a cover", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		// the old store's address has no reader: an unhashed file is nobody's cover
		writeDesignFile(root, ".spool/thumbs/checkout.jpg", "whatever the old store wrote");
		const app = makeApp(spoolDir);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; cover?: Cover }[];
		};
		expect(frames[0]?.cover).toBeUndefined();
	});

	it("projects actionable terminal cover state and refreshes it after shared source changes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "frames/dash/term.tsx", "// current\n");
		writeDesignFile(root, "frames/fresh/term.tsx", "// never run\n");
		writeDesignFile(root, "shared/value.ts", "export const value = 1;\n");
		writeDesignFile(
			root,
			".spool/term/dash.screen",
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "current grid",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);
		const app = makeApp(spoolDir);

		const projected = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: {
				name: string;
				cover?: Cover;
				terminalCover: { kind: string; message?: string };
			}[];
		};
		const first = Object.fromEntries(projected.frames.map((frame) => [frame.name, frame]));
		// a terminal's persisted screen is one immutable image.
		expect(first.dash?.cover?.hash).toMatch(/^[0-9a-f]{32}$/);
		expect(first.dash?.terminalCover).toEqual({ kind: "current" });
		expect(first.fresh?.cover).toBeUndefined();
		expect(first.fresh).toMatchObject({
			terminalCover: { kind: "never-run", message: expect.stringContaining("saving it does not create a screen") },
		});

		writeDesignFile(root, "shared/value.ts", "export const value = 2;\n");
		const refreshed = (await (await app.request(`/api/p/${name}/frames`)).json()) as typeof projected;
		const staled = refreshed.frames.find((frame) => frame.name === "dash");
		expect(staled?.cover).toBeUndefined();
		expect(staled?.terminalCover).toMatchObject({
			kind: "stale",
			message: expect.stringContaining("stale after its source changed"),
		});

		writeDesignFile(
			root,
			".spool/term/dash.screen",
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "refreshed grid",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);
		writeDesignFile(root, "frames/dash/term.tsx", "// changed\n");
		const frameRefreshed = (await (await app.request(`/api/p/${name}/frames`)).json()) as typeof projected;
		expect(frameRefreshed.frames.find((frame) => frame.name === "dash")?.terminalCover.kind).toBe("stale");
	});

	it("lists an empty frames/ as an empty projection, even when the folder is missing", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect(((await (await app.request(`/api/p/${name}/frames`)).json()) as { frames: unknown[] }).frames).toEqual([]);

		// a project whose frames/ was never created (or was removed) still projects
		const bare = makeTempDir();
		mkdirSync(join(bare, "design"), { recursive: true });
		writeFileSync(join(bare, "design", "canvas.json"), '{ "format": 1 }\n');
		expect(existsSync(join(bare, "design", "frames"))).toBe(false);
	});
});

describe("the project registry for home", () => {
	it("lists registered projects with frame counts and cover frames, most recent first", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const older = makeProject(spoolDir);
		writeFrame(older.root, "menu", frameTsx("menu"));
		const newer = makeProject(spoolDir);
		writeFrame(newer.root, "checkout", frameTsx("checkout"));
		writeFrame(newer.root, "cart", frameTsx("cart"));
		const app = makeApp(spoolDir);
		const put = await putCover(app, newer.name, "cart", coverBody(PNG_BYTES));

		const res = await app.request("/api/projects");

		expect(res.status).toBe(200);
		const { projects } = (await res.json()) as {
			projects: {
				name: string;
				root: string;
				openedAt: string;
				frameCount: number;
				covers: { frame: string; cover: Cover }[];
			}[];
		};
		expect(projects.map((p) => p.name)).toEqual([newer.name, older.name]);
		expect(projects[0]).toMatchObject({
			root: newer.root,
			frameCount: 2,
			covers: [{ frame: "cart", cover: await put.json() }],
		});
		expect(projects[1]).toMatchObject({ frameCount: 1, covers: [] });
	});

	it("summarizes across pages: three freshest covers, a name claimed twice counted as none", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "one", frameTsx("one"));
		writeFrame(root, "two", frameTsx("two"));
		writePageFrame(root, "shop", "three", frameTsx("three"));
		writePageFrame(root, "shop", "four", frameTsx("four"));
		// the same name from two folders is a collision, and a collision is not a frame
		writeFrame(root, "twin", frameTsx("twin"));
		writePageFrame(root, "shop", "twin", frameTsx("twin"));
		const app = makeApp(spoolDir);
		for (const frame of ["one", "two", "three", "four"]) {
			expect((await putCover(app, name, frame, coverBody(PNG_BYTES))).status).toBe(200);
		}
		// the store's own folder times order the cards, so name them rather than race the clock
		const shotAt = { one: 1_000, two: 4_000, three: 2_000, four: 3_000 };
		for (const [frame, seconds] of Object.entries(shotAt)) {
			utimesSync(join(root, "design", ".spool", "thumbs", frame), seconds, seconds);
		}

		const { projects } = (await (await app.request("/api/projects")).json()) as {
			projects: { frameCount: number; covers: { frame: string }[] }[];
		};

		expect(projects[0]?.frameCount).toBe(4);
		expect(projects[0]?.covers.map((cover) => cover.frame)).toEqual(["two", "four", "three"]);
	});

	it("keeps listing projects whose disk has vanished", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const { rmSync } = await import("node:fs");
		rmSync(join(root, "design"), { recursive: true });
		expect(existsSync(join(root, "design"))).toBe(false);
		const app = makeApp(spoolDir);

		const { projects } = (await (await app.request("/api/projects")).json()) as {
			projects: { name: string; frameCount: number }[];
		};

		// the registry is the only truth (#4): a missing design/ is the project's
		// problem to surface on open, not a reason to hide the card
		expect(projects.map((p) => p.name)).toEqual([name]);
		expect(projects[0]?.frameCount).toBe(0);
	});

	it("forgets a project without touching its folder, and closes its tab", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = makeProject(spoolDir);
		const gone = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: gone.root }),
		});

		expect(res.status).toBe(204);
		const { projects } = (await (await app.request("/api/projects")).json()) as { projects: { root: string }[] };
		expect(projects.map((p) => p.root)).toEqual([kept.root]);
		// the registry forgets; the folder is the human's, and stays
		expect(existsSync(join(gone.root, "design"))).toBe(true);
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [kept.root] });
	});

	it("emits one registry and one session event when forgetting an open project", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = makeProject(spoolDir);
		const gone = makeProject(spoolDir);
		const watchHarness = createMachineStateWatchHarness();
		const app = makeApp(spoolDir, { machineStateWatchAdapter: watchHarness.adapter });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const response = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: gone.root }),
		});

		expect(response.status).toBe(204);
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [kept.root] });

		// The mutation publishes synchronously. Its later filesystem notifications
		// must not replay either event through the watcher.
		watchHarness.changed("registry.json");
		watchHarness.changed("session.json");
		watchHarness.flush();

		writeSession(spoolDir, { open: [] });
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });

		const { registerProject } = await import("../registry");
		registerProject(spoolDir, makeTempDir());
		watchHarness.changed("registry.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [] });
		expect((await (await app.request("/api/projects")).json()).projects).toHaveLength(2);
	});

	it("emits only a registry event when forgetting a registered closed project", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = makeProject(spoolDir);
		const gone = makeProject(spoolDir);
		const watchHarness = createMachineStateWatchHarness();
		const app = makeApp(spoolDir, { machineStateWatchAdapter: watchHarness.adapter });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		// Closing elsewhere is already on disk, but its watcher notification has
		// not reconciled yet when home forgets the now-closed project.
		writeSession(spoolDir, { open: [kept.root] });
		watchHarness.changed("session.json");
		const response = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: gone.root }),
		});

		expect(response.status).toBe(204);
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });

		watchHarness.changed("registry.json");
		watchHarness.changed("session.json");
		watchHarness.flush();

		writeSession(spoolDir, { open: [] });
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });

		const { registerProject } = await import("../registry");
		registerProject(spoolDir, makeTempDir());
		watchHarness.changed("registry.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
	});

	it("does not swallow a queued registry event when forgetting an unknown root", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const watchHarness = createMachineStateWatchHarness();
		const app = makeApp(spoolDir, { machineStateWatchAdapter: watchHarness.adapter });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const { registerProject } = await import("../registry");
		registerProject(spoolDir, makeTempDir());
		watchHarness.changed("registry.json");
		const response = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: "/somewhere/never-registered" }),
		});

		expect(response.status).toBe(404);
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
	});

	it("404s forgetting a root that was never registered", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: "/somewhere/never-registered" }),
		});

		expect(res.status).toBe(404);
	});

	it("rejects a forget without a root", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const app = makeApp(spoolDir);

		const res = await app.request("/api/projects/forget", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
	});
});

describe("the app session", () => {
	it("reports a post-start session read failure and observes its repair", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const watchHarness = createMachineStateWatchHarness();
		const failures: Error[] = [];
		const app = makeApp(spoolDir, {
			machineStateWatchAdapter: watchHarness.adapter,
			onMachineStateWatchError: (error) => failures.push(error),
		});
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const sessionFile = join(spoolDir, "session.json");
		rmSync(sessionFile);
		mkdirSync(sessionFile);
		watchHarness.changed("session.json");
		watchHarness.flush();

		expect(failures.at(-1)?.message).toContain(`cannot read session at ${sessionFile}`);
		expect((await app.request("/api/health")).status).toBe(200);

		const { registerProject } = await import("../registry");
		registerProject(spoolDir, makeTempDir());
		watchHarness.changed("registry.json");
		watchHarness.flush();

		rmSync(sessionFile, { recursive: true });
		writeSession(spoolDir, { open: [root] });
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });

		writeSession(spoolDir, { open: [] });
		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });
	});

	it("round-trips the open-tab list, admitting only registered roots", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect(await (await app.request("/api/session")).json()).toEqual({ open: [root] });

		const put = await app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root, open: false }),
		});
		expect(put.status).toBe(204);
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [] });

		const rogue = await app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root: "/somewhere/never-registered", open: true }),
		});
		expect(rogue.status).toBe(400);
	});

	/**
	 * Tabs dragged into an arrangement. The list is the whole mutation: it says
	 * where the open tabs stand and nothing about which ones are open, so a root
	 * it never names stays exactly where it was rather than being closed by it.
	 */
	it("arranges the open tabs without opening or closing one", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const first = makeProject(spoolDir);
		const second = makeProject(spoolDir);
		const third = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		expect(await (await app.request("/api/session")).json()).toEqual({
			open: [first.root, second.root, third.root],
		});

		const put = await app.request("/api/session/order", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ order: [third.root, first.root, second.root] }),
		});
		expect(put.status).toBe(204);
		expect(await (await app.request("/api/session")).json()).toEqual({
			open: [third.root, first.root, second.root],
		});

		// a list that has never heard of the third tab leaves it open, at the end
		const partial = await app.request("/api/session/order", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ order: [second.root, first.root, "/somewhere/never-registered"] }),
		});
		expect(partial.status).toBe(204);
		expect(await (await app.request("/api/session")).json()).toEqual({
			open: [second.root, first.root, third.root],
		});

		const rogue = await app.request("/api/session/order", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ order: first.root }),
		});
		expect(rogue.status).toBe(400);
	});

	it("emits every successful API session mutation inside one watcher debounce", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const { writeSession } = await import("./session");
		writeSession(spoolDir, { open: [root] });
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const stream = await app.request("/api/events", { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const close = app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root, open: false }),
		});
		const reopen = app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root, open: true }),
		});
		expect((await close).status).toBe(204);
		expect((await reopen).status).toBe(204);

		expect(await events.next(500)).toEqual({ event: "app", data: { kind: "session" } });
		expect(await events.next(500)).toEqual({ event: "app", data: { kind: "session" } });
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [root] });
	});

	it("emits one session event for one API mutation after its watcher settles", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const watchHarness = createMachineStateWatchHarness();
		const app = makeApp(spoolDir, { machineStateWatchAdapter: watchHarness.adapter });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const stream = await app.request("/api/events", { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const put = await app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root, open: false }),
		});
		expect(put.status).toBe(204);
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });

		watchHarness.changed("session.json");
		watchHarness.flush();
		const { registerProject } = await import("../registry");
		registerProject(spoolDir, makeTempDir());
		watchHarness.changed("registry.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
	});

	it("does not infer a tab from simultaneous registry and session writes", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const stream = await app.request("/api/events", { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const { readRegistry, registerProject } = await import("../registry");
		let armed = false;
		for (let attempt = 0; attempt < 20 && !armed; attempt++) {
			registerProject(spoolDir, root);
			armed = await events.next(500).then(
				(event) => event.event === "app" && (event.data as { kind?: string }).kind === "registry",
				() => false,
			);
		}
		expect(armed).toBe(true);

		const registeredOnly = (await import("node:fs")).realpathSync(makeTempDir());
		const { writeSession } = await import("./session");
		registerProject(spoolDir, registeredOnly);
		writeSession(spoolDir, { open: [] });

		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root, registeredOnly]);
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [] });
	});

	it("keeps a project open when remove is immediately followed by open", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const stream = await app.request("/api/events", { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const { readRegistry, registerProject } = await import("../registry");
		let armed = false;
		for (let attempt = 0; attempt < 20 && !armed; attempt++) {
			registerProject(spoolDir, root);
			armed = await events.next(500).then(
				(event) => event.event === "app" && (event.data as { kind?: string }).kind === "registry",
				() => false,
			);
		}
		expect(armed).toBe(true);

		const { removeProject } = await import("../remove");
		const { openProject } = await import("../open");
		expect(removeProject(root, spoolDir)).toEqual({ root, removed: true });
		expect(openProject(root, spoolDir)).toEqual({ root });

		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [root] });
	});

	it("notifies the running daemon when a command opens a project", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir); // registry exists before the app boots
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request("/api/events", { signal: controller.signal });
		expect(stream.status).toBe(200);
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		// `spool init` and `spool open` durably write both machine-state files;
		// the daemon observes those writes and tells every already-running page.
		const late = makeTempDir();
		const { initProject } = await import("../init");
		initProject(late, spoolDir);
		const lateRoot = (await import("node:fs")).realpathSync(late);
		const { openProject } = await import("../open");

		// macOS arms fs.watch asynchronously: keep bumping openedAt until seen
		let seen = false;
		for (let attempt = 0; attempt < 20 && !seen; attempt++) {
			openProject(lateRoot, spoolDir);
			seen = await events.next(500).then(
				(event) => event.event === "app",
				() => false,
			);
		}
		expect(seen).toBe(true);

		const session = (await (await app.request("/api/session")).json()) as { open: string[] };
		expect(session.open).toContain(lateRoot);
	});

	it("emits a session event when remove closes an unknown root while the daemon runs", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const unknown = (await import("node:fs")).realpathSync(makeTempDir());
		writeSession(spoolDir, { open: [unknown] });
		const watchHarness = createMachineStateWatchHarness();
		const app = makeApp(spoolDir, { machineStateWatchAdapter: watchHarness.adapter });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request("/api/events", { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const { removeProject } = await import("../remove");
		expect(removeProject(unknown, spoolDir)).toEqual({ root: unknown, removed: false });

		watchHarness.changed("session.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "session" } });

		const { registerProject } = await import("../registry");
		const registryRoot = (await import("node:fs")).realpathSync(makeTempDir());
		registerProject(spoolDir, registryRoot);
		watchHarness.changed("registry.json");
		watchHarness.flush();
		expect(await events.next()).toEqual({ event: "app", data: { kind: "registry" } });

		expect(await (await app.request("/api/session")).json()).toEqual({ open: [] });
	});
});

describe("the folder picker", () => {
	it("lists directories only, hides dotfolders, marks spool projects", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const parent = makeTempDir();
		mkdirSync(join(parent, "plain-folder"));
		mkdirSync(join(parent, ".hidden"));
		writeFileSync(join(parent, "loose-file.txt"), "not a dir");
		const project = join(parent, "a-project");
		mkdirSync(project);
		const { initProject } = await import("../init");
		initProject(project, spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/fs/list?path=${encodeURIComponent(parent)}`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			path: string;
			parent: string | null;
			dirs: { name: string; path: string; isProject: boolean }[];
		};
		expect(body.dirs.map((d) => d.name)).toEqual(["a-project", "plain-folder"]);
		expect(body.dirs[0]?.isProject).toBe(true);
		expect(body.dirs[1]?.isProject).toBe(false);
		expect(body.parent).not.toBeNull();

		expect((await app.request("/api/fs/list?path=/definitely/not/there")).status).toBe(404);
		// no path starts at home
		const home = (await (await app.request("/api/fs/list")).json()) as { path: string };
		expect(home.path).toBe((await import("node:os")).homedir());
	});

	it("opens by walk-up through the app door, registering the found root", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const nested = join(root, "src", "deep");
		mkdirSync(nested, { recursive: true });
		const app = makeApp(spoolDir);

		const res = await app.request("/api/projects/open", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: nested }),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ root, name });
	});

	it("offers init when the walk-up finds nothing, and init scaffolds through the one code path", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const bare = makeTempDir();
		const app = makeApp(spoolDir);

		const miss = await app.request("/api/projects/open", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: bare }),
		});
		expect(miss.status).toBe(404);
		expect(((await miss.json()) as { offerInit: boolean }).offerInit).toBe(true);

		const init = await app.request("/api/projects/init", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: bare }),
		});
		expect(init.status).toBe(200);
		const { root } = (await init.json()) as { root: string; name: string };
		// the canonical scaffold (#4): same code path as `spool init`
		expect(existsSync(join(root, "design", "canvas.json"))).toBe(true);
		expect(existsSync(join(root, "design", "AGENTS.md"))).toBe(true);

		const twice = await app.request("/api/projects/init", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: bare }),
		});
		expect(twice.status).toBe(409);
	});
});

describe("serving the canvas page", () => {
	function makeUi(): string {
		const uiDir = makeTempDir();
		writeFileSync(join(uiDir, "index.html"), "<!doctype html><title>spool</title><div id=app></div>\n");
		mkdirSync(join(uiDir, "assets"));
		writeFileSync(join(uiDir, "assets", "app-abc123.js"), 'console.log("spool ui")\n');
		writeFileSync(join(uiDir, "assets", "app-abc123.css"), "body{background:#0e0e0e}\n");
		return uiDir;
	}

	it("serves the page at / and /p/<name>, assets under /ui/", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test", uiDir: makeUi() });
		onTestFinished(() => daemon.close());
		const app = daemon.app;

		for (const path of ["/", "/p/anything"]) {
			const res = await app.request(path);
			expect(res.status, path).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/html");
			// The boot document carries the daemon token: it is never retained
			// in an HTTP cache, and foreign pages cannot frame its authority.
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
			expect(res.headers.get("x-frame-options")).toBe("DENY");
			expect(await res.text()).toContain("<div id=app>");
		}

		const js = await app.request("/ui/assets/app-abc123.js");
		expect(js.status).toBe(200);
		expect(js.headers.get("content-type")).toContain("javascript");
		// hashed assets are immutable
		expect(js.headers.get("cache-control")).toContain("immutable");
		const css = await app.request("/ui/assets/app-abc123.css");
		expect(css.headers.get("content-type")).toContain("text/css");

		const favicon = await app.request("/favicon.svg");
		expect(favicon.status).toBe(200);
		expect(favicon.headers.get("content-type")).toContain("image/svg+xml");
		expect(await favicon.text()).toContain('fill="#f5391a"');

		expect((await app.request("/ui/assets/nope.js")).status).toBe(404);
		expect((await app.request(`/ui/assets/${encodeURIComponent("../../../etc/passwd")}`)).status).toBe(404);
	});

	it("serves the blue mark for the development daemon", async () => {
		const app = makeApp(join(makeTempDir(), ".spool-dev"), { development: true });

		const favicon = await app.request("/favicon.svg");

		expect(favicon.status).toBe(200);
		expect(await favicon.text()).toContain('fill="#3b82f6"');
	});

	it("says what is wrong when the UI build is absent", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const app = makeApp(spoolDir); // no uiDir at all

		const res = await app.request("/");

		expect(res.status).toBe(503);
		expect(await res.text()).toContain("ui");
	});

	it("never shadows frame documents or the api", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", frameTsx("hello"));
		const app = makeApp(spoolDir, { uiDir: makeUi() });

		expect((await app.request(`/p/${name}/frames/hello`)).headers.get("content-type")).toContain("text/html");
		expect(await (await app.request(`/p/${name}/frames/hello`)).text()).toContain("hello");
		expect((await app.request("/api/health")).status).toBe(200);
	});
});

describe("thumbnails", () => {
	it("round-trips one immutable image through the .spool store", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);

		const put = await putCover(app, name, "checkout", coverBody(JPEG_BYTES));
		expect(put.status).toBe(200);
		const cover = (await put.json()) as Cover;
		expect(cover.hash).toMatch(/^[0-9a-f]{32}$/);
		// persisted under design/.spool — app-owned, gitignored, never an SSE change event
		expect(existsSync(join(root, "design", ".spool", "thumbs", "checkout", `${cover.hash}.jpg`))).toBe(true);

		const got = await app.request(`/covers/${name}/checkout/${cover.hash}`);
		expect(got.status).toBe(200);
		expect(got.headers.get("content-type")).toBe("image/jpeg");
		expect(Buffer.from(await got.arrayBuffer())).toEqual(JPEG_BYTES);
	});

	it("serves a cover with no credential but its own address, and goes immutable", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);
		const put = await putCover(app, name, "checkout", coverBody(JPEG_BYTES));
		const { hash } = (await put.json()) as Cover;

		// the harness credentials /api/ paths and nothing else, so this read carries
		// no control header — an <img> cannot, which is why the hash is the credential
		const got = await app.request(`/covers/${name}/checkout/${hash}`);
		expect(got.status).toBe(200);
		expect(got.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
		// no validator to offer: a changed cover is a changed address, so a warm
		// reload asks for nothing at all
		expect(got.headers.get("etag")).toBeNull();
	});

	it("retires the image it replaces, so no stale address answers", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);

		const stale = (await (await putCover(app, name, "checkout", coverBody(PNG_BYTES))).json()) as Cover;
		const fresh = (await (await putCover(app, name, "checkout", coverBody(JPEG_BYTES))).json()) as Cover;
		expect(fresh.hash).not.toBe(stale.hash);

		expect((await app.request(`/covers/${name}/checkout/${stale.hash}`)).status).toBe(404);
		const got = await app.request(`/covers/${name}/checkout/${fresh.hash}`);
		expect(Buffer.from(await got.arrayBuffer())).toEqual(JPEG_BYTES);
	});

	it("refuses an image the store cannot serve", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);

		const put = await putCover(app, name, "checkout", coverBody(Buffer.from("<script>no</script>")));

		expect(put.status).toBe(400);
		expect(existsSync(join(root, "design", ".spool", "thumbs", "checkout"))).toBe(false);
	});

	it("refuses a request that is not exactly one cover image", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);
		const mislabelled = new FormData();
		mislabelled.append("w390", new Blob([new Uint8Array(JPEG_BYTES)]));

		expect((await putCover(app, name, "checkout", mislabelled)).status).toBe(400);
		expect((await putCover(app, name, "checkout", new FormData())).status).toBe(400);
	});

	it("rejects covers for frames that do not exist and unsafe names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const hash = "f".repeat(32);

		expect((await putCover(app, name, "ghost", coverBody(JPEG_BYTES))).status).toBe(404);
		expect((await app.request(`/covers/${name}/ghost/${hash}`)).status).toBe(404);
		expect((await app.request(`/covers/${name}/${encodeURIComponent("../../escape")}/${hash}`)).status).toBe(404);
		expect((await app.request(`/covers/${name}/ghost/nothex`)).status).toBe(404);
	});

	it("serves and persists per-project canvas state — camera only", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		// before anything is stored, the state is empty
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({});

		const put = await app.request(`/api/p/${name}/state`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ camera: { x: -120.5, y: 40, k: 0.72 } }),
		});
		expect(put.status).toBe(204);

		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({
			camera: { x: -120.5, y: 40, k: 0.72 },
		});
		// persisted in design/.spool, surviving a daemon restart
		const onDisk = JSON.parse(readFileSync(join(root, "design", ".spool", "state.json"), "utf8"));
		expect(onDisk).toEqual({ camera: { x: -120.5, y: 40, k: 0.72 } });

		expect(
			(
				await app.request(`/api/p/${name}/state`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ mode: "design" }),
				})
			).status,
		).toBe(400);
		expect(
			(
				await app.request(`/api/p/${name}/state`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify([]),
				})
			).status,
		).toBe(400);
	});

	it("treats persisted mode state as absent", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		mkdirSync(join(root, "design", ".spool"));
		writeFileSync(
			join(root, "design", ".spool", "state.json"),
			JSON.stringify({ mode: "design", camera: { x: -120.5, y: 40, k: 0.72 } }),
		);
		const app = makeApp(spoolDir);

		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({});
	});

	it("remembers the arrows toggle with the rest of the canvas state (#34)", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		// unset means on — the map is spool's identity; a fresh project stores nothing
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({});

		const put = await app.request(`/api/p/${name}/state`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ arrows: false }),
		});
		expect(put.status).toBe(204);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({ arrows: false });

		const bad = await app.request(`/api/p/${name}/state`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ arrows: "hidden" }),
		});
		expect(bad.status).toBe(400);
	});

	it("publishes a thumb event to the project's SSE stream on write", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		const put = await putCover(app, name, "checkout", coverBody(PNG_BYTES));

		// the image rides the event, so another browser swaps addresses without a
		// projection read of its own
		expect(await events.next()).toEqual({
			event: "change",
			data: { kind: "thumb", frame: "checkout", cover: await put.json() },
		});
	});

	describe("recording a capture failure (#173)", () => {
		it("stores the reason beside the frame's cover", async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeFrame(root, "checkout", frameTsx("checkout"));
			const app = makeApp(spoolDir);

			const post = await postCaptureError(app, name, "checkout", "capture canvases too large");

			expect(post.status).toBe(204);
			expect(readCaptureError(root, "checkout")).toMatchObject({ error: "capture canvases too large" });
		});

		it("requires the same control token and origin policy as the cover PUT", async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeFrame(root, "checkout", frameTsx("checkout"));
			const app = makeApp(spoolDir);

			const bare = await app.fetch(`/api/p/${name}/thumbs/checkout/error`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ error: "capture reply timed out" }),
			});
			expect(bare.status).toBe(401);
		});

		it("rejects a non-string or empty reason", async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeFrame(root, "checkout", frameTsx("checkout"));
			const app = makeApp(spoolDir);

			expect((await postCaptureError(app, name, "checkout", "")).status).toBe(400);
			expect((await postCaptureError(app, name, "checkout", 1)).status).toBe(400);
			expect(
				(
					await app.request(`/api/p/${name}/thumbs/checkout/error`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({}),
					})
				).status,
			).toBe(400);
		});

		it("rejects a frame that does not exist or is a terminal", async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeDesignFile(root, "frames/dash/term.tsx", "// inert terminal\n");
			const app = makeApp(spoolDir);

			expect((await postCaptureError(app, name, "ghost", "capture reply timed out")).status).toBe(404);
			expect((await postCaptureError(app, name, "dash", "capture reply timed out")).status).toBe(400);
		});

		it("clears once a landed cover retires every other file in the frame's cover dir", async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeFrame(root, "checkout", frameTsx("checkout"));
			const app = makeApp(spoolDir);
			await postCaptureError(app, name, "checkout", "capture reply timed out");
			expect(readCaptureError(root, "checkout")).toBeDefined();

			await putCover(app, name, "checkout", coverBody(JPEG_BYTES));

			expect(readCaptureError(root, "checkout")).toBeUndefined();
		});
	});
});
