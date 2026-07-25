import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";
import { terminalSourceVersion } from "./term-source";

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
		expect(body.frames).toEqual([{ name: "checkout", kind: "html", x: 120, y: 40, w: 800, h: 600, hasThumb: false }]);
	});

	it("fills in missing sidecars on disk, placing frames side by side", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "menu", frameTsx("menu"));
		writeFrame(root, "cart", frameTsx("cart"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames`);

		const { frames } = (await res.json()) as { frames: { name: string; x: number; w: number }[] };
		// name order, phone-sized defaults, gutter apart, no overlap
		expect(frames.map((f) => f.name)).toEqual(["cart", "menu"]);
		expect(frames).toMatchObject([
			{ name: "cart", x: 80, y: 80, w: 390, h: 844 },
			{ name: "menu", x: 80 + 390 + 80, y: 80, w: 390, h: 844 },
		]);
		// the app fills in the sidecar (#3): geometry is durable, not re-rolled per request
		const sidecar = JSON.parse(readFileSync(join(root, "design", "frames", "cart", "frame.json"), "utf8"));
		expect(sidecar).toEqual({ x: 80, y: 80, w: 390, h: 844 });

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
		for (const frame of frames) expect(frame.w).toBe(390);
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

	it("marks frames whose thumbnail is cached", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "covered", frameTsx("covered"));
		const app = makeApp(spoolDir);

		await app.request(`/api/p/${name}/thumbs/covered`, { method: "PUT", body: PNG_BYTES });

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { hasThumb: boolean }[];
		};
		expect(frames[0]?.hasThumb).toBe(true);
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
				hasThumb: boolean;
				terminalCover: { kind: string; message?: string };
			}[];
		};
		const first = Object.fromEntries(projected.frames.map((frame) => [frame.name, frame]));
		expect(first.dash).toMatchObject({ hasThumb: true, terminalCover: { kind: "current" } });
		expect(first.fresh).toMatchObject({
			hasThumb: false,
			terminalCover: { kind: "never-run", message: expect.stringContaining("saving it does not create a screen") },
		});

		writeDesignFile(root, "shared/value.ts", "export const value = 2;\n");
		const refreshed = (await (await app.request(`/api/p/${name}/frames`)).json()) as typeof projected;
		expect(refreshed.frames.find((frame) => frame.name === "dash")).toMatchObject({
			hasThumb: false,
			terminalCover: { kind: "stale", message: expect.stringContaining("stale after its source changed") },
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
		await app.request(`/api/p/${newer.name}/thumbs/cart`, { method: "PUT", body: PNG_BYTES });

		const res = await app.request("/api/projects");

		expect(res.status).toBe(200);
		const { projects } = (await res.json()) as {
			projects: { name: string; root: string; openedAt: string; frameCount: number; covers: string[] }[];
		};
		expect(projects.map((p) => p.name)).toEqual([newer.name, older.name]);
		expect(projects[0]).toMatchObject({ root: newer.root, frameCount: 2, covers: ["cart"] });
		expect(projects[1]).toMatchObject({ frameCount: 1, covers: [] });
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
});

describe("the app session", () => {
	it("round-trips the open-tab list, admitting only registered roots", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect(await (await app.request("/api/session")).json()).toEqual({ open: [] });

		const put = await app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ open: [root] }),
		});
		expect(put.status).toBe(204);
		expect(await (await app.request("/api/session")).json()).toEqual({ open: [root] });

		const rogue = await app.request("/api/session", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ open: ["/somewhere/never-registered"] }),
		});
		expect(rogue.status).toBe(400);
	});

	it("opens a background tab when a project is registered while the daemon runs", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir); // registry exists before the app boots
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request("/api/events", { signal: controller.signal });
		expect(stream.status).toBe(200);
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");

		// `spool open` in a shell writes only the registry (#12: open registers
		// live via SSE) — the daemon notices and opens the tab itself
		const { registerProject } = await import("../registry");
		const late = makeTempDir();
		const { initProject } = await import("../init");
		initProject(late, spoolDir);
		const lateRoot = (await import("node:fs")).realpathSync(late);

		// macOS arms fs.watch asynchronously: keep bumping openedAt until seen
		let seen = false;
		for (let attempt = 0; attempt < 20 && !seen; attempt++) {
			registerProject(spoolDir, lateRoot);
			seen = await events.next(500).then(
				(event) => event.event === "app",
				() => false,
			);
		}
		expect(seen).toBe(true);

		const session = (await (await app.request("/api/session")).json()) as { open: string[] };
		expect(session.open).toContain(lateRoot);
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
	it("round-trips a self-capture through the .spool cache with an etag", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/thumbs/checkout`)).status).toBe(404);

		const put = await app.request(`/api/p/${name}/thumbs/checkout`, {
			method: "PUT",
			headers: { "content-type": "image/png" },
			body: PNG_BYTES,
		});
		expect(put.status).toBe(204);
		// persisted under design/.spool — app-owned, gitignored, never an SSE change event
		expect(existsSync(join(root, "design", ".spool", "thumbs", "checkout.png"))).toBe(true);

		const got = await app.request(`/api/p/${name}/thumbs/checkout`);
		expect(got.status).toBe(200);
		expect(got.headers.get("content-type")).toBe("image/png");
		expect(Buffer.from(await got.arrayBuffer())).toEqual(PNG_BYTES);

		const etag = got.headers.get("etag") ?? "";
		expect(etag).not.toBe("");
		expect((await app.request(`/api/p/${name}/thumbs/checkout`, { headers: { "if-none-match": etag } })).status).toBe(
			304,
		);
	});

	it("serves a cover in the encoding that wrote it, one per frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);
		const cover = (body: Buffer) =>
			app.request(`/api/p/${name}/thumbs/checkout`, { method: "PUT", body: new Uint8Array(body) });
		const thumbs = join(root, "design", ".spool", "thumbs");

		expect((await cover(PNG_BYTES)).status).toBe(204);
		expect(existsSync(join(thumbs, "checkout.png"))).toBe(true);

		// the bounded re-capture retires the legacy cover — never two covers for
		// one frame, or the store would keep answering with the stale one
		expect((await cover(JPEG_BYTES)).status).toBe(204);
		expect(existsSync(join(thumbs, "checkout.jpg"))).toBe(true);
		expect(existsSync(join(thumbs, "checkout.png"))).toBe(false);

		const got = await app.request(`/api/p/${name}/thumbs/checkout`);
		expect(got.headers.get("content-type")).toBe("image/jpeg");
		expect(Buffer.from(await got.arrayBuffer())).toEqual(JPEG_BYTES);
	});

	it("refuses a capture that is not an image the store can serve", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);

		const put = await app.request(`/api/p/${name}/thumbs/checkout`, {
			method: "PUT",
			body: new Uint8Array(Buffer.from("<script>not a cover</script>")),
		});

		expect(put.status).toBe(400);
		expect(existsSync(join(root, "design", ".spool", "thumbs"))).toBe(false);
	});

	it("lets a cover be cached and revalidated instead of re-sent", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx("checkout"));
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/thumbs/checkout`, { method: "PUT", body: new Uint8Array(JPEG_BYTES) });

		const got = await app.request(`/api/p/${name}/thumbs/checkout`);
		// covers are the canvas's bulk traffic: held by the browser, revalidated
		// every read, so an unchanged cover costs a 304 rather than its bytes
		expect(got.headers.get("cache-control")).toBe("no-cache");
		const etag = got.headers.get("etag") ?? "";
		expect(etag).not.toBe("");

		const again = await app.request(`/api/p/${name}/thumbs/checkout`, { headers: { "if-none-match": etag } });
		expect(again.status).toBe(304);
		expect(again.headers.get("cache-control")).toBe("no-cache");
	});

	it("rejects thumbnails for frames that do not exist and unsafe names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const put = await app.request(`/api/p/${name}/thumbs/ghost`, { method: "PUT", body: PNG_BYTES });
		expect(put.status).toBe(404);
		expect((await app.request(`/api/p/${name}/thumbs/${encodeURIComponent("../../escape")}`)).status).toBe(404);
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

		await app.request(`/api/p/${name}/thumbs/checkout`, { method: "PUT", body: PNG_BYTES });

		expect(await events.next()).toEqual({ event: "change", data: { kind: "thumb", frame: "checkout" } });
	});
});
