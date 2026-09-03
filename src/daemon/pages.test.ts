import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
	COVER_PNG,
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
 * Pages (#39): a page is a one-level subfolder of design/frames, each page its
 * own canvas. Identity stays the bare leaf name, unique project-wide — these
 * tests hold the daemon to discovery, attribution, collisions, and the
 * leaf-name survival of every keyed store across a move.
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
			collisions: unknown[];
			frames: { name: string; page?: string }[];
		};
		expect(projection.pages).toEqual(["admin", "shop"]);
		expect(projection.collisions).toEqual([]);
		const home = projection.frames.find((frame) => frame.name === "home");
		const checkout = projection.frames.find((frame) => frame.name === "checkout");
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
		const born = projection.frames.find((frame) => frame.name === "checkout--empty");
		expect(born?.x).toBe(570);
		expect(born?.y).toBe(40);
		// placement is durable, written into the page folder's own sidecar
		const sidecar = join(root, "design", "frames", "shop", "checkout--empty", "frame.json");
		expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 570, y: 40, w: 1440, h: 900 });
	});
});

describe("name collisions", () => {
	it("reports both locations and refuses to serve the ambiguous name", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "checkout", label("root checkout"));
		writePageFrame(root, "shop", "checkout", label("shop checkout"));
		const app = makeApp(spoolDir);

		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string }[];
			collisions: { name: string; paths: string[] }[];
		};
		expect(projection.collisions).toEqual([{ name: "checkout", paths: ["frames/checkout", "frames/shop/checkout"] }]);
		expect(projection.frames.some((frame) => frame.name === "checkout")).toBe(false);

		const doc = await app.request(`/p/${name}/frames/checkout`);
		expect(doc.status).toBe(500);
		const text = await doc.text();
		expect(text).toContain("frames/checkout");
		expect(text).toContain("frames/shop/checkout");

		const verify = await app.request(`/api/p/${name}/verify/checkout`);
		expect(verify.status).toBe(500);
		const body = (await verify.json()) as { kind: string; message: string };
		expect(body.kind).toBe("error");
		expect(body.message).toContain("frames/shop/checkout");
	});
});

describe("page-frame stores key by leaf name", () => {
	it("serves the page frame's document from its page folder", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("hello from the shop page"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/checkout`);

		expect(res.status).toBe(200);
		expect(await res.text()).toContain("hello from the shop page");
	});

	it("writes geometry through the page folder's sidecar", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/geometry`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frames: { checkout: { x: 10, y: 20, w: 390, h: 844 } } }),
		});

		expect(res.status).toBe(204);
		const sidecar = join(root, "design", "frames", "shop", "checkout", "frame.json");
		expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 10, y: 20, w: 390, h: 844 });
	});

	it("stores and serves a page frame's cover under its leaf name", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		const body = new FormData();
		body.append("cover", new Blob([COVER_PNG]));

		const put = await app.request(`/api/p/${name}/thumbs/checkout`, { method: "PUT", body });

		expect(put.status).toBe(200);
		const { hash } = (await put.json()) as { hash: string };
		expect(existsSync(join(root, "design", ".spool", "thumbs", "checkout", `${hash}.png`))).toBe(true);
		expect((await app.request(`/covers/${name}/checkout/${hash}`)).status).toBe(200);
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
			body: JSON.stringify({ frames: ["checkout"] }),
		});

		expect(res.status).toBe(204);
		expect(trashed).toEqual([join(root, "design", "frames", "shop", "checkout")]);
	});

	it("serves a page frame's selection with its real path", async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const put = await app.request(`/api/p/${name}/selection`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frames: ["checkout"] }),
		});

		expect(put.status).toBe(200);
		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: { path: string }[];
		};
		expect(selection[0]?.path).toBe("design/frames/shop/checkout/frame.tsx");
	});
});

describe("cross-page flows", () => {
	it("derives a cross-page edge as an ordinary edge and witnesses its walk", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "home", `export default function F() {\n\treturn <button data-go="checkout">go</button>;\n}\n`);
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const flows = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			frames: string[];
			edges: { from: string; to: string; missing?: true; verified?: true }[];
		};
		expect(flows.frames).toEqual(["checkout", "home"]);
		expect(flows.edges).toHaveLength(1);
		expect(flows.edges[0]).toMatchObject({ from: "home", to: "checkout", certainty: "will" });
		expect(flows.edges[0]?.missing).toBeUndefined();

		const walked = await app.request(`/api/p/${name}/walked`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ from: "home", to: "checkout" }),
		});
		expect(walked.status).toBe(204);
		const after = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			edges: { verified?: true }[];
		};
		expect(after.edges[0]?.verified).toBe(true);
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
	it("names the leaf frame for page edits and stays quiet on page sidecars", { timeout: 20_000 }, async () => {
		const { spoolDir, root, name } = pageProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const res = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		const events = sseReader(res);
		expect(await events.next()).toEqual({ event: "hello", data: { project: name } });

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
		await nextMatching({ event: "change", data: { kind: "frame", frame: "checkout" } });

		// a page born on disk reaches the canvas as a discovery change
		mkdirSync(join(root, "design", "frames", "admin"), { recursive: true });
		await nextMatching({ event: "change", data: { kind: "frame", frame: "admin" } });

		// geometry stays hands-owned at its new depth: a page sidecar is a move of
		// the leaf frame rather than an edit of it, and names it (#113)
		await events.drain(300);
		writeDesignFile(root, "frames/shop/checkout/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		await nextMatching({ event: "change", data: { kind: "geometry", frame: "checkout" } });
	});
});

describe("page-blind player", () => {
	it("composes frames across pages into one session", async () => {
		const { spoolDir, root, name } = pageProject();
		writeFrame(root, "home", label("home says hi"));
		writePageFrame(root, "shop", "checkout", label("checkout says hi"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}?frame=checkout`);

		expect(res.status).toBe(200);
		const doc = await res.text();
		expect(doc).toContain("home says hi");
		expect(doc).toContain("checkout says hi");
		const serialized = doc.match(/__SPOOL_PLAY__ = JSON\.parse\(("(?:\\.|[^"\\])*")\)<\/script>/)?.[1];
		const config = JSON.parse(JSON.parse(serialized ?? '"{}"')) as {
			start: string;
			frames: Record<string, unknown>;
		};
		expect(config.start).toBe("checkout");
		expect(Object.keys(config.frames).sort()).toEqual(["checkout", "home"]);
	});
});
