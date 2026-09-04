import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compositionOf, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The player page (#24), exercised at the serve seam: one light document under
 * /play/ composing every frame component, Zod-validated params, none of the
 * canvas SPA's weight. The runtime behavior of the served document lives in
 * runtime/player-runtime.test.ts; here the contract is what the daemon ships.
 */

const menuTsx = `export default function Menu() {
	return <button data-go="cart" data-transition="lift">menu-screen</button>;
}
`;

const cartTsx = `export default function Cart() {
	return <p style={{ viewTransitionName: "hero" }} className="p-4">cart-screen</p>;
}
`;

const payDoneTsx = `export default function PayDone() {
	return <h1>pay-done-screen</h1>;
}
`;

function scaffold(spoolDir: string) {
	const project = makeProject(spoolDir);
	writeFrame(project.root, "menu", menuTsx);
	writeFrame(project.root, "cart", cartTsx);
	writeFrame(project.root, "pay--done", payDoneTsx);
	return project;
}

function configOf(doc: string): {
	project: string;
	start: string;
	scenario: string;
	frames: Record<string, { w: number; h: number }>;
} {
	const config = doc.match(/window\.__SPOOL_PLAY__\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)<\/script>/)?.[1];
	expect(config, "player config script").toBeDefined();
	return JSON.parse(JSON.parse(config ?? '"{}"'));
}

describe("serving the player", () => {
	it("composes every frame into one document starting at the first frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const doc = await res.text();

		const config = configOf(doc);
		expect(config.project).toBe(name);
		expect(config.start).toBe("cart");
		expect(config.scenario).toBe("default");
		expect(Object.keys(config.frames).sort()).toEqual(["cart", "menu", "pay--done"]);
		expect(config.frames.menu).toEqual({ w: 1440, h: 900 });

		// one composition holding every frame's source, booted through the
		// runtime — split at every frame, so the document carries the entry and
		// the opening screen's modules, and the rest answer at the chunk route
		const composed = await compositionOf(app, doc);
		expect(composed.all).toContain("menu-screen");
		expect(composed.all).toContain("cart-screen");
		expect(composed.all).toContain("pay-done-screen");
		expect(composed.modules.get(composed.entry)).toContain("bootPlayer");
		expect(composed.entry).toMatch(new RegExp(`^/play/${name}/-/play-[A-Z0-9]+\\.js$`));
		expect(composed.preloads[0]).toBe(composed.entry);
		const startModule = composed.preloads.find((url) => url.includes("/frames/cart/"));
		expect(startModule, "the start screen is preloaded").toBeDefined();
		expect(composed.modules.get(startModule ?? "")).toContain("cart-screen");
		expect(composed.preloads.some((url) => url.includes("/frames/menu/"))).toBe(false);

		// the frame baseline rides along: compiled utilities, not raw classes
		expect(doc).toContain(".p-4");
	});

	it("serves the composition's modules by name, immutable, and 404s the rest", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		// nothing answers before the project has been composed
		expect((await app.request(`/play/${name}/-/play-NOTYET.js`)).status).toBe(404);

		const composed = await compositionOf(app, await (await app.request(`/play/${name}`)).text());
		const res = await app.request(composed.entry);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/javascript");
		expect(res.headers.get("cache-control")).toContain("immutable");
		// the document runs with an opaque origin, so its module fetches are CORS
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		expect((await app.request(`/play/${name}/-/ghost.js`)).status).toBe(404);
		expect((await app.request("/play/ghost-project/-/play-X.js")).status).toBe(404);

		// a tab served before an edit still finds the modules it was served with
		writeFrame(root, "menu", menuTsx.replace("menu-screen", "menu-reborn"));
		const rebuilt = await compositionOf(app, await (await app.request(`/play/${name}`)).text());
		expect(rebuilt.entry).not.toBe(composed.entry);
		expect((await app.request(composed.entry)).status).toBe(200);
		expect(rebuilt.all).toContain("menu-reborn");
	});

	it("constructs __proto__ as an own frame in both config and compiled components", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeFrame(root, "__proto__", "export default function Proto() { return <main>proto</main>; }\n");
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/play/${name}?frame=__proto__`)).text();
		const config = configOf(doc);
		const composed = await compositionOf(app, doc);
		const boot = composed.modules.get(composed.entry) ?? "";

		expect(config.start).toBe("__proto__");
		expect(Object.hasOwn(config.frames, "__proto__")).toBe(true);
		expect(Object.getOwnPropertyDescriptor(config.frames, "__proto__")?.value).toEqual({ w: 1440, h: 900 });
		expect(boot).toContain("Object.fromEntries");
		expect(boot).toContain('["__proto__"');
		expect(composed.preloads.some((url) => url.includes("/frames/__proto__/"))).toBe(true);
	});

	it("pins the import map and ships none of the canvas SPA", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/play/${name}`)).text();

		const importMap = JSON.parse(doc.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
		expect(importMap.imports.spool).toBe("/vendor/spool.js");
		expect(importMap.imports.react).toBe("/vendor/react.js");

		// the player is its own light page: no canvas assets, no canvas config,
		// no canvas shim protocol
		expect(doc).not.toContain("/ui/");
		expect(doc).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
		expect(doc).not.toContain("window.__SPOOL__ ");
		expect(doc).not.toContain('"freeze"');
	});

	it("loads transitions.css and fonts.css into the document", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeDesignFile(root, "shared/transitions.css", "::view-transition-old(root) { animation-duration: 0.2s; }\n");
		writeDesignFile(root, "shared/fonts.css", '@import url("https://fonts.test/inter.css");\n');
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/play/${name}`)).text();

		expect(doc).toContain("::view-transition-old(root)");
		expect(doc).toContain("https://fonts.test/inter.css");
	});

	it("starts at ?frame= and 404s a frame that is not there, loudly", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const named = await app.request(`/play/${name}?frame=pay--done`);
		expect(configOf(await named.text()).start).toBe("pay--done");

		const ghost = await app.request(`/play/${name}?frame=ghost`);
		expect(ghost.status).toBe(404);
		expect(await ghost.text()).toContain('no frame "ghost"');
	});

	it("starts at the selected frame when the canvas has a selection", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		await app.request(`/api/p/${name}/selection`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frames: ["pay--done"] }),
		});

		const res = await app.request(`/play/${name}`);
		expect(configOf(await res.text()).start).toBe("pay--done");

		// an explicit ?frame= wins over the selection
		const explicit = await app.request(`/play/${name}?frame=menu`);
		expect(configOf(await explicit.text()).start).toBe("menu");
	});

	it("validates params with zod: traversal shapes and repeats are 400s", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const traversal = await app.request(`/play/${name}?frame=${encodeURIComponent("../evil")}`);
		expect(traversal.status).toBe(400);
		expect(await traversal.text()).toContain("frame");

		const scenario = await app.request(`/play/${name}?scenario=${encodeURIComponent("a/b")}`);
		expect(scenario.status).toBe(400);

		const repeated = await app.request(`/play/${name}?frame=menu&frame=cart`);
		expect(repeated.status).toBe(400);
	});

	it("rides ?scenario= into the config", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}?scenario=checkout-error`);
		expect(configOf(await res.text()).scenario).toBe("checkout-error");
	});

	it("404s an unknown project and an empty project, each loudly", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const empty = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const unknown = await app.request("/play/ghost-project");
		expect(unknown.status).toBe(404);
		expect(await unknown.text()).toContain("spool open");

		const nothing = await app.request(`/play/${empty.name}`);
		expect(nothing.status).toBe(404);
		expect(await nothing.text()).toContain("frame.tsx");
	});

	it("reports every rejected shell request through the player load protocol", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const empty = makeProject(spoolDir);
		const existing = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		// A rejected handoff reports through its own signal, because that is the one
		// failure the outer shell repairs by reloading for a fresh token (#88).
		const cases = [
			{
				path: "/play/ghost-project?shell=1",
				status: 403,
				message: "invalid or expired player shell handoff",
				signal: "player-handoff-rejected",
			},
			{
				path: `/play/${empty.name}?shell=1`,
				status: 403,
				message: "invalid or expired player shell handoff",
				signal: "player-handoff-rejected",
			},
			{
				path: `/play/${existing.name}?frame=ghost&shell=1`,
				status: 403,
				message: "invalid or expired player shell handoff",
				signal: "player-handoff-rejected",
			},
			{
				path: `/play/${existing.name}?scenario=${encodeURIComponent("a/b")}&shell=1`,
				status: 400,
				message: "not a playable request",
				signal: "player-load-error",
			},
		];
		for (const entry of cases) {
			const response = await app.request(entry.path);
			expect(response.status).toBe(entry.status);
			const document = await response.text();
			expect(document).toContain(entry.message);
			expect(document).toContain(`"${entry.signal}"`);
		}
	});

	it("caches the composed bundle by content, re-assembling config per request", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		const app = makeApp(spoolDir);

		const first = await app.request(`/play/${name}`);
		expect(first.headers.get("x-spool-cache")).toBe("miss");
		const etag = first.headers.get("etag") ?? "";
		expect(etag).not.toBe("");

		const second = await app.request(`/play/${name}`);
		expect(second.headers.get("x-spool-cache")).toBe("hit");
		expect(second.headers.get("etag")).toBe(etag);

		const conditional = await app.request(`/play/${name}`, { headers: { "if-none-match": etag } });
		expect(conditional.status).toBe(304);

		// a different start is a different document on the same cached bundle
		const named = await app.request(`/play/${name}?frame=menu`);
		expect(named.headers.get("x-spool-cache")).toBe("hit");
		expect(named.headers.get("etag")).not.toBe(etag);

		// an edit reaches the next request without a restart
		writeFrame(root, "menu", menuTsx.replace("menu-screen", "menu-reborn"));
		const edited = await app.request(`/play/${name}`);
		expect(edited.headers.get("x-spool-cache")).toBe("miss");
		expect((await compositionOf(app, await edited.text())).all).toContain("menu-reborn");

		// a frame born after the first compile joins the bundle
		writeFrame(root, "receipt", payDoneTsx.replace("pay-done-screen", "receipt-screen"));
		const grown = await app.request(`/play/${name}`);
		expect(grown.headers.get("x-spool-cache")).toBe("miss");
		expect(configOf(await grown.text()).frames.receipt).toBeDefined();
	});

	it("keeps the player playable when one frame will not compile", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeFrame(root, "broken", "export default function Broken() { return <p>oops</p>;\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);

		// The broken frame costs its own screen and nothing else: every healthy
		// frame is still in the composition, and its error rides along to be shown
		// when someone walks to it.
		expect(res.status).toBe(200);
		const doc = await res.text();
		expect(Object.keys(configOf(doc).frames).sort()).toEqual(["broken", "cart", "menu", "pay--done"]);
		const composed = await compositionOf(app, doc);
		const boot = composed.modules.get(composed.entry) ?? "";
		expect(boot).toContain("brokenFrame");
		expect(boot).toContain("design/frames/broken/frame.tsx");
		// The error travels with the stub so the screen can show it on arrival.
		expect(boot).toContain("frames/broken/frame.tsx");
		// The healthy frames are really compiled, not stubbed alongside it.
		expect(composed.all).toContain("menu-screen");
		expect(composed.all).toContain("cart-screen");
	});

	it("recompiles a stubbed player until the broken frame is fixed", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeFrame(root, "broken", "export default function Broken() { return <p>oops</p>;\n");
		const app = makeApp(spoolDir);

		const stubbed = await app.request(`/play/${name}`);
		expect(stubbed.status).toBe(200);
		// Never cached, so the fix cannot be stranded behind a stale bundle.
		expect(stubbed.headers.get("x-spool-cache")).toBe("miss");
		expect((await app.request(`/play/${name}`)).headers.get("x-spool-cache")).toBe("miss");

		writeFrame(root, "broken", "export default function Broken() { return <p>mended-screen</p>; }\n");
		const mended = await app.request(`/play/${name}`);
		expect(mended.status).toBe(200);
		const composed = await compositionOf(app, await mended.text());
		expect(composed.all).toContain("mended-screen");
		expect(composed.all).not.toContain("brokenFrame(");
	});

	it("serves the control shell before anything is compiled", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeDesignFile(root, "shared/importmap.json", "{ not json");
		const app = makeApp(spoolDir);

		// The bar and the frame's name paint at once; the compile, and its
		// failure, belong to the iframe's own request and report through the
		// load protocol the shell already listens for.
		const shell = await app.controlRequest(`/play/${name}?frame=menu`);
		expect(shell.status).toBe(200);
		const doc = await shell.text();
		expect(doc).toContain("bootPlayerShell");
		expect(doc).toContain("shell=1");
		expect(doc).not.toContain("failed to compile");
		expect(shell.headers.get("x-spool-cache")).toBeNull();
	});

	it("still fails the whole player when nothing frame-shaped is to blame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeDesignFile(root, "shared/importmap.json", "{ not json");
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);

		expect(res.status).toBe(500);
		expect(await res.text()).toContain("failed to compile");
	});

	it("holds the shared/ui boundary in the player compile too", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/nav.tsx",
			'import { ui } from "spool";\n\nexport function Nav() {\n\treturn <button onClick={() => ui.back()}>back</button>;\n}\n',
		);
		writeFrame(
			root,
			"menu",
			'import { Nav } from "../../shared/ui/nav";\n\nexport default function Menu() {\n\treturn <Nav />;\n}\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);

		// The rule still refuses to compile the frame that broke it. What changed is
		// that it no longer takes the frames that kept to it down as well.
		expect(res.status).toBe(200);
		const composed = await compositionOf(app, await res.text());
		const boot = composed.modules.get(composed.entry) ?? "";
		expect(boot).toContain("brokenFrame");
		expect(boot).toContain("props");
		expect(boot).toContain("design/frames/menu/frame.tsx");
		expect(composed.all).toContain("cart-screen");
	});
});

describe("the chrome's font", () => {
	it("serves the chrome's mono woff2 and 404s anything else", async () => {
		const app = makeApp(makeTempDir());

		const woff2 = await app.request("/vendor/fonts/fragment-mono-latin-400-normal.woff2");
		expect(woff2.status).toBe(200);
		expect(woff2.headers.get("content-type")).toBe("font/woff2");
		expect((await woff2.arrayBuffer()).byteLength).toBeGreaterThan(1000);

		expect((await app.request("/vendor/fonts/ghost.woff2")).status).toBe(404);
		expect((await app.request(`/vendor/fonts/${encodeURIComponent("../react.js")}`)).status).toBe(404);
	});
});
