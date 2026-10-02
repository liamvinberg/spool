import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
	COVER_PNG,
	compositionOf,
	makeApp,
	makeProject,
	makeTempDir,
	type SseEvent,
	sseReader,
	writeDesignFile,
	writeFrame,
	writePageFrame,
} from "../test-helpers";

/**
 * Pages (#39): a page is a subfolder of design/frames, each page its own
 * canvas. A frame is named by its path under frames/ (#336): `shop/checkout`
 * on the page `shop`, `checkout` on the root page. The same folder name on two
 * pages is two frames, so these tests hold the daemon to discovery,
 * attribution, and every store and route keeping two such frames apart.
 */

const label = (text: string) => `export default function F() {\n\treturn <p>${text}</p>;\n}\n`;

function pageProject() {
	const spoolDir = join(makeTempDir(), ".spool");
	const project = makeProject(spoolDir);
	return { spoolDir, ...project };
}

describe("page discovery", () => {
	it("attributes frames to their page and lists pages, empty ones included", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		mkdirSync(join(root, "design", "frames", "admin"), { recursive: true });
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames`);

		expect(res.status).toBe(200);
		const projection = (await res.json()) as {
			pages: string[];
			frames: { name: string; page?: string }[];
		};
		expect(projection.pages).toEqual(["admin", "shop"]);
		expect("collisions" in projection).toBe(false);
		const home = projection.frames.find((frame) => frame.name === "home");
		const checkout = projection.frames.find((frame) => frame.name === "shop/checkout");
		expect(home).toBeDefined();
		expect("page" in (home ?? {})).toBe(false);
		expect(checkout?.page).toBe("shop");
	});

	it("counts page frames into the home card summary", async () => {
		const { spoolDir, root } = pageProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request("/api/projects");

		const { projects } = (await res.json()) as { projects: { frameCount: number }[] };
		expect(projects[0]?.frameCount).toBe(2);
	});

	it("places a frame born without geometry beside its own page's field", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "home", label("home"));
		writeDesignFile(root, "frames/home/frame.json", '{ "x": 5000, "y": 0, "w": 390, "h": 844 }\n');
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writeDesignFile(root, "frames/shop/checkout/frame.json", '{ "x": 100, "y": 40, "w": 390, "h": 844 }\n');
		writePageFrame(root, "shop", "checkout--empty", label("empty"));
		const app = makeApp(spoolDir);

		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; x: number; y: number }[];
		};

		// beside checkout's field (100 + 390 + gutter), never beside home's at 5000
		const born = projection.frames.find((frame) => frame.name === "shop/checkout--empty");
		expect(born?.x).toBe(570);
		expect(born?.y).toBe(40);
		// placement is durable, written into the page folder's own sidecar
		const sidecar = join(root, "design", "frames", "shop", "checkout--empty", "frame.json");
		expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 570, y: 40, w: 1440, h: 900 });
	});
});

/** Everything a frame keeps, asked of one frame by its name through the real routes. */
async function frameStores(app: ReturnType<typeof makeApp>, project: string, frame: string) {
	const segment = encodeURIComponent(frame);
	const doc = await (await app.request(`/p/${project}/frames/${segment}`)).text();
	const body = new FormData();
	body.append("cover", new Blob([COVER_PNG]));
	const put = await app.request(`/api/p/${project}/thumbs/${segment}`, { method: "PUT", body });
	const { hash } = (await put.json()) as { hash: string };
	const served = (await app.request(`/covers/${project}/${segment}/${hash}`)).status;
	await app.request(`/api/p/${project}/selection`, jsonPut({ frames: [frame] }));
	const { selection } = (await (await app.request(`/api/p/${project}/selection`)).json()) as {
		selection: { frame: string; path: string }[];
	};
	return { doc, hash, served, selection };
}

function jsonPut(body: unknown): RequestInit {
	return { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

describe("one folder name on two pages", () => {
	it("keeps spool/buttons and vercel/buttons apart in every store and route", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "spool", "buttons", label("spool buttons"));
		writePageFrame(root, "vercel", "buttons", label("vercel buttons"));
		const app = makeApp(spoolDir);

		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(projection.frames).toMatchObject([
			{ name: "spool/buttons", page: "spool" },
			{ name: "vercel/buttons", page: "vercel" },
		]);

		const spool = await frameStores(app, name, "spool/buttons");
		const vercel = await frameStores(app, name, "vercel/buttons");
		// each serves its own document
		expect(spool.doc).toContain("spool buttons");
		expect(spool.doc).not.toContain("vercel buttons");
		expect(vercel.doc).toContain("vercel buttons");
		expect(vercel.doc).not.toContain("spool buttons");
		// each has its own cover store, one folder per name
		expect(spool.served).toBe(200);
		expect(vercel.served).toBe(200);
		expect(existsSync(join(root, "design", ".spool", "thumbs", "spool%2Fbuttons", `${spool.hash}.png`))).toBe(true);
		expect(existsSync(join(root, "design", ".spool", "thumbs", "vercel%2Fbuttons", `${vercel.hash}.png`))).toBe(true);
		expect(existsSync(join(root, "design", ".spool", "thumbs", "buttons"))).toBe(false);
		// selection points at each one's own source
		expect(spool.selection).toMatchObject([
			{ frame: "spool/buttons", path: "design/frames/spool/buttons/frame.tsx" },
		]);
		expect(vercel.selection).toMatchObject([
			{ frame: "vercel/buttons", path: "design/frames/vercel/buttons/frame.tsx" },
		]);

		// and its own geometry sidecar
		const geometry = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({
				frames: {
					"spool/buttons": { x: 10, y: 20, w: 390, h: 844 },
					"vercel/buttons": { x: 30, y: 40, w: 800, h: 600 },
				},
			}),
		);
		expect(geometry.status).toBe(204);
		const sidecar = (page: string) =>
			JSON.parse(readFileSync(join(root, "design", "frames", page, "buttons", "frame.json"), "utf8"));
		expect(sidecar("spool")).toEqual({ x: 10, y: 20, w: 390, h: 844 });
		expect(sidecar("vercel")).toEqual({ x: 30, y: 40, w: 800, h: 600 });
	});

	it("keeps a root buttons and a nested examples/mobile/buttons apart the same way", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "buttons", label("root buttons"));
		writePageFrame(root, "examples/mobile", "buttons", label("mobile buttons"));
		const app = makeApp(spoolDir);

		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(projection.frames).toMatchObject([
			{ name: "buttons" },
			{ name: "examples/mobile/buttons", page: "examples/mobile" },
		]);
		expect("page" in (projection.frames[0] ?? {})).toBe(false);

		const flat = await frameStores(app, name, "buttons");
		const nested = await frameStores(app, name, "examples/mobile/buttons");
		expect(flat.doc).toContain("root buttons");
		expect(flat.doc).not.toContain("mobile buttons");
		expect(nested.doc).toContain("mobile buttons");
		expect(nested.doc).not.toContain("root buttons");
		expect(flat.served).toBe(200);
		expect(nested.served).toBe(200);
		expect(existsSync(join(root, "design", ".spool", "thumbs", "buttons", `${flat.hash}.png`))).toBe(true);
		expect(
			existsSync(join(root, "design", ".spool", "thumbs", "examples%2Fmobile%2Fbuttons", `${nested.hash}.png`)),
		).toBe(true);
		expect(flat.selection).toMatchObject([{ frame: "buttons", path: "design/frames/buttons/frame.tsx" }]);
		expect(nested.selection).toMatchObject([
			{ frame: "examples/mobile/buttons", path: "design/frames/examples/mobile/buttons/frame.tsx" },
		]);

		const geometry = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({
				frames: {
					buttons: { x: 1, y: 2, w: 390, h: 844 },
					"examples/mobile/buttons": { x: 3, y: 4, w: 390, h: 844 },
				},
			}),
		);
		expect(geometry.status).toBe(204);
		expect(JSON.parse(readFileSync(join(root, "design", "frames", "buttons", "frame.json"), "utf8"))).toEqual({
			x: 1,
			y: 2,
			w: 390,
			h: 844,
		});
		expect(
			JSON.parse(
				readFileSync(join(root, "design", "frames", "examples", "mobile", "buttons", "frame.json"), "utf8"),
			),
		).toEqual({ x: 3, y: 4, w: 390, h: 844 });
	});
});

describe("a frame name is a path, and only a path", () => {
	it("serves nothing for a leaf alone, a traversal, a hidden or empty segment, or a frame inside a frame", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		// a folder inside a frame is the frame's own business, never a frame
		writeDesignFile(root, "frames/shop/checkout/inner/frame.tsx", label("inner"));
		writeDesignFile(root, "shared/secret/frame.tsx", label("kept outside frames"));
		const app = makeApp(spoolDir);

		for (const frame of [
			"checkout",
			"shop/checkout/inner",
			"../shared/secret",
			"shop/../../shared/secret",
			"shop/.hidden",
			".spool",
			"shop//checkout",
			"shop/",
			"/shop/checkout",
			"shop\\checkout",
		]) {
			const res = await app.request(`/p/${name}/frames/${encodeURIComponent(frame)}`);
			expect(res.status, frame).toBe(404);
			expect(await res.text(), frame).not.toContain("kept outside frames");
		}
		expect((await app.request(`/p/${name}/frames/shop%2Fcheckout`)).status).toBe(200);
	});

	it("never follows a page that is a link out of design/", async () => {
		const { spoolDir, root, name } = pageProject();
		const outside = makeTempDir();
		writeDesignFile(outside, "frames/buttons/frame.tsx", label("from outside"));
		mkdirSync(join(root, "design", "frames"), { recursive: true });
		symlinkSync(join(outside, "design", "frames"), join(root, "design", "frames", "linked"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/${encodeURIComponent("linked/buttons")}`);

		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain("from outside");
	});

	it("refuses such names at every write that takes one", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		const body = new FormData();
		body.append("cover", new Blob([COVER_PNG]));

		for (const frame of ["../escape", "shop/../escape", "shop/.hidden", "shop//checkout", "a\\b"]) {
			const geometry = await app.request(
				`/api/p/${name}/geometry`,
				jsonPut({ frames: { [frame]: { x: 0, y: 0, w: 10, h: 10 } } }),
			);
			expect(geometry.status, frame).toBe(400);
			const selection = await app.request(`/api/p/${name}/selection`, jsonPut({ frames: [frame] }));
			expect(selection.status, frame).toBe(400);
			const cover = await app.request(`/api/p/${name}/thumbs/${encodeURIComponent(frame)}`, {
				method: "PUT",
				body,
			});
			expect(cover.status, frame).toBe(404);
		}
		// nothing was written anywhere outside the one frame that exists
		expect(existsSync(join(root, "design", "escape"))).toBe(false);
		expect(existsSync(join(root, "escape"))).toBe(false);
	});
});

describe("page-frame stores key by the frame's path", () => {
	it("serves the page frame's document from its page folder", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("hello from the shop page"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/shop%2Fcheckout`);

		expect(res.status).toBe(200);
		expect(await res.text()).toContain("hello from the shop page");
	});

	it("moves a trashed page frame's folder", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const trashed: string[] = [];
		const app = makeApp(spoolDir, {
			moveToTrash: async (paths) => {
				trashed.push(...paths);
			},
		});

		const res = await app.request(`/api/p/${name}/trash`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frames: ["shop/checkout"] }),
		});

		expect(res.status).toBe(204);
		expect(trashed).toEqual([join(root, "design", "frames", "shop", "checkout")]);
	});
});

describe("cross-page flows", () => {
	it("derives a cross-page edge as an ordinary edge and witnesses its walk", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(
			root,
			"home",
			`export default function F() {\n\treturn <button data-go="shop/checkout">go</button>;\n}\n`,
		);
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const flows = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			frames: string[];
			edges: { from: string; to: string; missing?: true; verified?: true }[];
		};
		expect(flows.frames).toEqual(["home", "shop/checkout"]);
		expect(flows.edges).toHaveLength(1);
		expect(flows.edges[0]).toMatchObject({ from: "home", to: "shop/checkout", certainty: "will" });
		expect(flows.edges[0]?.missing).toBeUndefined();

		const walked = await app.request(`/api/p/${name}/walked`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ from: "home", to: "shop/checkout" }),
		});
		expect(walked.status).toBe(204);
		const after = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			edges: { verified?: true }[];
		};
		expect(after.edges[0]?.verified).toBe(true);
	});

	it("walks to exactly the frame a path names, and a bare name only to the root page", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "spool", "buttons", label("spool buttons"));
		writePageFrame(root, "vercel", "buttons", label("vercel buttons"));
		writeFrame(
			root,
			"home",
			'export default () => <nav><a data-go="vercel/buttons">v</a><a data-go="buttons">b</a></nav>;\n',
		);
		const app = makeApp(spoolDir);
		const edges = async () =>
			(
				(await (await app.request(`/api/p/${name}/flows`)).json()) as {
					edges: { from: string; to: string; missing?: true }[];
				}
			).edges.map(({ from, to, missing }) => ({ from, to, missing: missing === true }));

		// no frame on the root page answers to "buttons", so that walk lands nowhere
		expect(await edges()).toEqual([
			{ from: "home", to: "buttons", missing: true },
			{ from: "home", to: "vercel/buttons", missing: false },
		]);

		writeFrame(root, "buttons", label("root buttons"));
		expect(await edges()).toEqual([
			{ from: "home", to: "buttons", missing: false },
			{ from: "home", to: "vercel/buttons", missing: false },
		]);
	});
});

describe("page canvas state", () => {
	it("persists the active page and per-page cameras", async () => {
		const { spoolDir, name } = pageProject();
		const app = makeApp(spoolDir);
		const state = {
			arrows: true,
			camera: { x: 1, y: 2, k: 1 },
			activePage: "shop",
			pageCameras: { shop: { x: 10, y: 20, k: 0.5 } },
		};

		const put = await app.request(`/api/p/${name}/state`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(state),
		});

		expect(put.status).toBe(204);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual(state);
	});

	it("rejects unsafe page names and malformed page cameras", async () => {
		const { spoolDir, name } = pageProject();
		const app = makeApp(spoolDir);
		const put = (body: unknown) =>
			app.request(`/api/p/${name}/state`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		expect((await put({ activePage: "../escape" })).status).toBe(400);
		expect((await put({ pageCameras: { shop: { x: 1, y: 2 } } })).status).toBe(400);
		expect((await put({ pageCameras: { ".dot": { x: 1, y: 2, k: 1 } } })).status).toBe(400);
	});
});

describe("page-aware change events", () => {
	it("names the frame by its path for page edits and stays quiet on page sidecars", { timeout: 20_000 }, async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const res = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		const events = sseReader(res);
		expect(await events.next()).toEqual({ event: "hello", data: { project: name, view: expect.any(String) } });

		// macOS arms the recursive watcher asynchronously — probe until it fires
		let armed = false;
		for (let attempt = 0; attempt < 20 && !armed; attempt++) {
			writeDesignFile(root, "shared/arming-probe.css", `/* ${attempt} */\n`);
			armed = await events.next(500).then(
				() => true,
				() => false,
			);
		}
		expect(armed).toBe(true);
		await events.drain(300);

		const nextMatching = async (expected: SseEvent) => {
			for (let skipped = 0; skipped < 5; skipped++) {
				if (JSON.stringify(await events.next()) === JSON.stringify(expected)) return;
			}
			throw new Error(`never saw ${JSON.stringify(expected)}`);
		};

		writePageFrame(root, "shop", "checkout", label("edited"));
		await nextMatching({ event: "change", data: { kind: "frame", frame: "shop/checkout" } });

		// a page born on disk reaches the canvas as a discovery change
		mkdirSync(join(root, "design", "frames", "admin"), { recursive: true });
		await nextMatching({ event: "change", data: { kind: "frame", frame: "admin" } });

		// geometry stays hands-owned at its new depth: a page sidecar is a move of
		// the frame rather than an edit of it, and names it (#113)
		await events.drain(300);
		writeDesignFile(root, "frames/shop/checkout/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		await nextMatching({ event: "change", data: { kind: "geometry", frame: "shop/checkout" } });
	});
});

describe("page-blind player", () => {
	it("composes frames across pages into one session", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "home", label("home says hi"));
		writePageFrame(root, "shop", "checkout", label("checkout says hi"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}?frame=${encodeURIComponent("shop/checkout")}`);

		expect(res.status).toBe(200);
		const doc = await res.text();
		const composed = await compositionOf(app, doc);
		expect(composed.all).toContain("home says hi");
		expect(composed.all).toContain("checkout says hi");
		// the paged frame's module lives under its page, the flat one under frames/
		expect([...composed.modules.keys()].some((url) => url.includes("/-/frames/shop/checkout/"))).toBe(true);
		expect([...composed.modules.keys()].some((url) => url.includes("/-/frames/home/"))).toBe(true);
		const serialized = doc.match(/__SPOOL_PLAY__ = JSON\.parse\(("(?:\\.|[^"\\])*")\)<\/script>/)?.[1];
		const config = JSON.parse(JSON.parse(serialized ?? '"{}"')) as {
			start: string;
			frames: Record<string, unknown>;
		};
		expect(config.start).toBe("shop/checkout");
		expect(Object.keys(config.frames).sort()).toEqual(["home", "shop/checkout"]);
	});
});
