import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { initProject } from "../init";
import {
	makeApp,
	makeProject,
	makeTempDir,
	type SseEvent,
	sseReader,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";

const helloTsx = `import { useState } from "react";

export default function Hello() {
	const [count, setCount] = useState(0);
	return (
		<button className="p-4 bg-thread" onClick={() => setCount(count + 1)}>
			hello from spool {count}
		</button>
	);
}
`;

describe("frame documents", () => {
	it("serves a frame.tsx as a complete render-ready document", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/hello`);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const doc = await res.text();
		expect(doc).toContain("<!doctype html>");
		expect(doc).toContain('<div id="root">');
		// the compiled component is inlined in the boot module
		expect(doc).toContain("hello from spool");
		expect(doc).toContain('<script type="module">');
		// the one pinned react: every react specifier resolves to the daemon's vendor bundle
		const importMap = JSON.parse(doc.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
		for (const spec of ["react", "react-dom", "react-dom/client", "react/jsx-runtime"]) {
			expect(importMap.imports[spec]).toBe("/vendor/react.js");
		}
		// the project's own import map entries ride along
		expect(importMap.imports.clsx).toContain("esm.sh");
	});

	it("injects preflight, tokens-driven utilities, fonts and import map in document order", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/tokens.css", "@theme {\n\t--color-thread: #f5391a;\n}\n");
		writeDesignFile(root, "shared/fonts.css", '@font-face {\n\tfont-family: "Familjen Grotesk";\n}\n');
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/p/${name}/frames/hello`)).text();

		// preflight zeroes the document (#15: frame and product start from the identical zero)
		expect(doc).toContain("box-sizing: border-box");
		// tokens.css feeds the compile: the @theme token exists as a var and powers the used utility
		expect(doc).toContain("--color-thread: #f5391a");
		expect(doc).toMatch(/\.bg-thread\s*\{[^}]*var\(--color-thread\)/);
		// unused utilities stay out
		expect(doc).not.toContain(".bg-red-500");
		// fonts.css rides along verbatim
		expect(doc).toContain('font-family: "Familjen Grotesk"');
		// order: compiled css, then fonts, then import map, then the boot module
		const at = (marker: string) => {
			const index = doc.indexOf(marker);
			expect(index, marker).toBeGreaterThan(-1);
			return index;
		};
		expect(at("box-sizing: border-box")).toBeLessThan(at("@font-face"));
		expect(at("@font-face")).toBeLessThan(at('<script type="importmap">'));
		expect(at('<script type="importmap">')).toBeLessThan(at('<script type="module">'));
	});

	it("serves unchanged source from the compile cache and 304s on the etag", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const first = await app.request(`/p/${name}/frames/hello`);
		const second = await app.request(`/p/${name}/frames/hello`);

		expect(first.headers.get("x-spool-cache")).toBe("miss");
		expect(second.headers.get("x-spool-cache")).toBe("hit");
		expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
		expect(await second.text()).toBe(await first.text());

		const etag = first.headers.get("etag") ?? "";
		const conditional = await app.request(`/p/${name}/frames/hello`, { headers: { "if-none-match": etag } });
		expect(conditional.status).toBe(304);
	});

	it("recompiles when the frame source changes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const before = await app.request(`/p/${name}/frames/hello`);
		writeFrame(root, "hello", helloTsx.replace("hello from spool", "hello again"));
		const after = await app.request(`/p/${name}/frames/hello`);

		expect(after.headers.get("x-spool-cache")).toBe("miss");
		expect(after.headers.get("etag")).not.toBe(before.headers.get("etag"));
		expect(await after.text()).toContain("hello again");
	});

	it("recompiles when an imported shared component or tokens.css changes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/label.tsx",
			"export function Label() {\n\treturn <span>first label</span>;\n}\n",
		);
		writeFrame(
			root,
			"hello",
			'import { Label } from "../../shared/ui/label";\n\nexport default function Hello() {\n\treturn <Label />;\n}\n',
		);
		const app = makeApp(spoolDir);

		const first = await (await app.request(`/p/${name}/frames/hello`)).text();
		expect(first).toContain("first label");

		writeDesignFile(
			root,
			"shared/ui/label.tsx",
			"export function Label() {\n\treturn <span>second label</span>;\n}\n",
		);
		const second = await app.request(`/p/${name}/frames/hello`);
		expect(second.headers.get("x-spool-cache")).toBe("miss");
		expect(await second.text()).toContain("second label");

		writeDesignFile(root, "shared/tokens.css", "@theme {\n\t--color-thread: #00ff00;\n}\n");
		const third = await app.request(`/p/${name}/frames/hello`);
		expect(third.headers.get("x-spool-cache")).toBe("miss");
	});

	it("recompiles when a stylesheet imported by tokens.css changes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/tokens.css", '@import "./palette.css";\n');
		writeDesignFile(root, "shared/palette.css", "@theme {\n\t--color-thread: #f5391a;\n}\n");
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const first = await (await app.request(`/p/${name}/frames/hello`)).text();
		expect(first).toContain("#f5391a");

		writeDesignFile(root, "shared/palette.css", "@theme {\n\t--color-thread: #00aa55;\n}\n");
		const second = await app.request(`/p/${name}/frames/hello`);
		expect(second.headers.get("x-spool-cache")).toBe("miss");
		expect(await second.text()).toContain("#00aa55");
	});

	it("reports loaded from a commit-time effect, never rAF", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/p/${name}/frames/hello`)).text();

		const boot = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
		expect(boot).toContain("spool");
		expect(boot).toContain("loaded");
		expect(boot).not.toContain("requestAnimationFrame");
	});
});

describe("frame document failure path", () => {
	it("serves the compile error verbatim and recovers after a fix", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "broken", "export default function Broken() {\n\treturn <button>never closed;\n}\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/broken`);

		expect(res.status).toBe(500);
		const doc = await res.text();
		// the toolchain's message, verbatim: esbuild names the file and the syntax problem
		expect(doc).toContain("frame.tsx");
		expect(doc).toContain("Unexpected end of file");
		expect(doc).toContain("failed to compile");

		writeFrame(root, "broken", "export default function Fixed() {\n\treturn <button>fixed</button>;\n}\n");
		const fixed = await app.request(`/p/${name}/frames/broken`);
		expect(fixed.status).toBe(200);
		expect(await fixed.text()).toContain("fixed");
	});

	it("404s unknown frames and rejects path traversal", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);

		expect((await app.request(`/p/${name}/frames/nope`)).status).toBe(404);
		expect((await app.request(`/p/${name}/frames/nope`)).ok).toBe(false);
		expect((await app.request(`/p/${name}/frames/${encodeURIComponent("../../secret")}`)).status).toBe(404);
	});

	it("404s unregistered projects and 409s ambiguous names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const app = makeApp(spoolDir);

		const unknown = await app.request("/p/ghost/frames/hello");
		expect(unknown.status).toBe(404);
		expect(await unknown.text()).toContain("spool open");

		const a = makeProject(spoolDir);
		const parent = makeTempDir();
		const twinDir = join(parent, a.name);
		mkdirSync(twinDir);
		initProject(twinDir, spoolDir);
		const ambiguous = await app.request(`/p/${a.name}/frames/hello`);
		expect(ambiguous.status).toBe(409);
		expect(await ambiguous.text()).not.toContain(a.root);
	});
});

describe("vendor react", () => {
	it("serves the pinned react as one ESM bundle fetchable from null-origin frames", async () => {
		const app = makeApp(makeTempDir());

		const res = await app.request("/vendor/react.js");

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("javascript");
		// sandboxed srcdoc frames have a null origin; the bundle must be CORS-open
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		const js = await res.text();
		expect(js).toContain("createRoot");
		expect(js).toContain("useState");
		expect(js).toContain("jsx");

		const etag = res.headers.get("etag") ?? "";
		expect(etag).not.toBe("");
		const conditional = await app.request("/vendor/react.js", { headers: { "if-none-match": etag } });
		expect(conditional.status).toBe(304);
	});
});

describe("change events", () => {
	it("pushes hello on connect, then frame and shared changes, ignoring .spool", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", helloTsx);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const res = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const events = sseReader(res);

		expect(await events.next()).toEqual({ event: "hello", data: { project: name } });

		// macOS arms the recursive FSEvents watcher asynchronously — probe with
		// throwaway shared/ writes until the first change lands, then settle, so
		// the assertions below never race the arming window
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

		// FSEvents may deliver a straggler from an earlier write between two
		// assertions — payloads are exact, arrival order is the OS's business
		const nextMatching = async (expected: SseEvent) => {
			for (let skipped = 0; skipped < 5; skipped++) {
				if (JSON.stringify(await events.next()) === JSON.stringify(expected)) return;
			}
			throw new Error(`never saw ${JSON.stringify(expected)}`);
		};

		writeFrame(root, "hello", helloTsx.replace("hello from spool", "hello edited"));
		await nextMatching({ event: "change", data: { kind: "frame", frame: "hello" } });

		writeDesignFile(root, "shared/tokens.css", "@theme {\n\t--color-thread: #222222;\n}\n");
		await nextMatching({ event: "change", data: { kind: "shared" } });

		await events.drain(300);
		writeDesignFile(root, ".spool/thumbs/hello.png", "not really a png");
		await events.expectQuiet(400);

		// geometry is hands-owned, never a source edit — no reload for a sidecar
		writeDesignFile(root, "frames/hello/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		await events.expectQuiet(400);
	});

	it("404s events for unregistered projects", async () => {
		const app = makeApp(makeTempDir());

		expect((await app.request("/api/p/ghost/events")).status).toBe(404);
	});

	it("keeps serving when a registered project's design/ has vanished", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		rmSync(join(root, "design"), { recursive: true });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		// push degrades to silence; the daemon must not crash
		const res = await app.request(`/api/p/${name}/events`, { signal: controller.signal });

		expect(res.status).toBe(200);
		const events = sseReader(res);
		expect(await events.next()).toEqual({ event: "hello", data: { project: name } });
	});
});

describe("health", () => {
	it("identifies the daemon with name, version and pid", async () => {
		const app = makeApp(makeTempDir());

		const res = await app.request("/api/health");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			name: "spool",
			version: "0.0.0-test",
			pid: process.pid,
			startedAt: expect.any(String),
		});
	});
});
