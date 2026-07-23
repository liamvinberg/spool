import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

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
	const config = doc.match(/window\.__SPOOL_PLAY__\s*=\s*(\{.*?\})<\/script>/)?.[1];
	expect(config, "player config script").toBeDefined();
	return JSON.parse(config ?? "{}");
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
		expect(config.frames.menu).toEqual({ w: 390, h: 844 });

		// one bundle composing every frame's source, booted through the runtime
		const boot = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
		expect(boot).toContain("menu-screen");
		expect(boot).toContain("cart-screen");
		expect(boot).toContain("pay-done-screen");
		expect(boot).toContain("bootPlayer");

		// the frame baseline rides along: compiled utilities, not raw classes
		expect(doc).toContain(".p-4");
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
		expect(await edited.text()).toContain("menu-reborn");

		// a frame born after the first compile joins the bundle
		writeFrame(root, "receipt", payDoneTsx.replace("pay-done-screen", "receipt-screen"));
		const grown = await app.request(`/play/${name}`);
		expect(grown.headers.get("x-spool-cache")).toBe("miss");
		expect(configOf(await grown.text()).frames.receipt).toBeDefined();
	});

	it("serves the compile failure as a loud document naming the file", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = scaffold(spoolDir);
		writeFrame(root, "broken", "export default function Broken() { return <p>oops</p>;\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);

		expect(res.status).toBe(500);
		const doc = await res.text();
		expect(doc).toContain("failed to compile");
		expect(doc).toContain("frames/broken/frame.tsx");
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

		expect(res.status).toBe(500);
		expect(await res.text()).toContain("props");
	});
});

describe("the pill's font", () => {
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

describe("terminal frames in the player (#42)", () => {
	it("composes terminal frames as static grids without breaking the walk", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"menu",
			`export default function Menu() {\n\treturn <div className="p-4">menu-screen</div>;\n}\n`,
		);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/play/${name}`);
		expect(res.status).toBe(200);
		const doc = await res.text();

		const config = configOf(doc) as ReturnType<typeof configOf> & { terminals?: Record<string, { svg: string }> };
		expect(Object.keys(config.frames).sort()).toEqual(["dash", "menu"]);
		// born unplaced at the conventional floor: 80×24 in exact cell pixels
		expect(config.frames.dash).toEqual({ w: 720, h: 480 });
		expect(config.terminals?.dash?.svg).toContain("<svg");
		expect(config.terminals?.dash?.svg).toContain('viewBox="0 0 720 480"');

		// only html frames enter the compile; the terminal never passes esbuild
		const boot = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
		expect(boot).toContain("menu-screen");
		expect(boot).toContain("bootPlayer");
		expect(boot).not.toContain("dash/term.tsx");
	});

	it("plays a project holding only terminal frames", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);
		const res = await app.request(`/play/${name}`);
		expect(res.status).toBe(200);
		const doc = await res.text();
		expect(configOf(doc).start).toBe("dash");
	});
});
