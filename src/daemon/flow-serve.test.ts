import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

const plainFrame = `export default function Plain() {
	return <button data-go="checkout--empty">walk</button>;
}
`;

describe("scenario serve", () => {
	it("serves a scenario file as JSON, CORS-open for null-origin frames", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/scenarios/checkout-error.json",
			'{\n\t"state": { "cart": [] },\n\t"mock": { "POST /api/pay": { "status": 500 } }\n}\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/scenarios/checkout-error`);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(res.headers.get("access-control-allow-origin")).toBe("null");
		expect(await res.json()).toEqual({ state: { cart: [] }, mock: { "POST /api/pay": { status: 500 } } });
	});

	it("serves the built-in empty seed when default.json is absent", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		rmSync(join(root, "design", "shared", "scenarios", "default.json"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/scenarios/default`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ state: {}, mock: {} });
	});

	it("404s a missing named scenario with the expected path", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/scenarios/ghost`);

		expect(res.status).toBe(404);
		expect(await res.text()).toContain("shared/scenarios/ghost.json");
	});

	it("500s invalid scenario JSON and non-object shapes with the filename", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/scenarios/broken.json", "{ not json\n");
		writeDesignFile(root, "shared/scenarios/list.json", "[]\n");
		writeDesignFile(root, "shared/scenarios/bad-state.json", '{ "state": 5 }\n');
		const app = makeApp(spoolDir);

		const broken = await app.request(`/api/p/${name}/scenarios/broken`);
		expect(broken.status).toBe(500);
		expect(await broken.text()).toContain("shared/scenarios/broken.json");

		expect((await app.request(`/api/p/${name}/scenarios/list`)).status).toBe(500);
		expect((await app.request(`/api/p/${name}/scenarios/bad-state`)).status).toBe(500);
	});

	it("404s traversal-shaped scenario names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/scenarios/${encodeURIComponent("../fixtures/x")}`)).status).toBe(404);
	});
});

describe("fixture serve", () => {
	it("serves a fixture by name, CORS-open, nested names included", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/fixtures/products.json", '[{ "id": 1, "title": "yarn" }]\n');
		writeDesignFile(root, "shared/fixtures/users/42.json", '{ "name": "Liam" }\n');
		const app = makeApp(spoolDir);

		const products = await app.request(`/api/p/${name}/fixtures/products`);
		expect(products.status).toBe(200);
		expect(products.headers.get("content-type")).toContain("application/json");
		expect(products.headers.get("access-control-allow-origin")).toBe("null");
		expect(await products.json()).toEqual([{ id: 1, title: "yarn" }]);

		const nested = await app.request(`/api/p/${name}/fixtures/users/42`);
		expect(nested.status).toBe(200);
		expect(await nested.json()).toEqual({ name: "Liam" });
	});

	it("normalizes a trailing .json in the fixture name", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/fixtures/products.json", "[]\n");
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/fixtures/products.json`)).status).toBe(200);
	});

	it("404s a missing fixture with the expected path", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/fixtures/ghost`);

		expect(res.status).toBe(404);
		expect(await res.text()).toContain("shared/fixtures/ghost.json");
	});

	it("never escapes the fixtures dir", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/secret.json", '{ "leak": true }\n');
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/fixtures/${encodeURIComponent("../secret")}`)).status).toBe(404);
		expect((await app.request(`/api/p/${name}/fixtures/..%2Fsecret`)).status).toBe(404);
	});

	it("500s invalid fixture JSON with the filename", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/fixtures/broken.json", "{ nope\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/fixtures/broken`);

		expect(res.status).toBe(500);
		expect(await res.text()).toContain("shared/fixtures/broken.json");
	});
});

describe("vendor spool runtime", () => {
	it("serves the runtime as one CORS-open ESM module with the flow API", async () => {
		const app = makeApp(makeTempDir());

		const res = await app.request("/vendor/spool.js");

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("javascript");
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		const js = await res.text();
		expect(js).toContain("data-go");
		expect(js).toContain("ui");

		const etag = res.headers.get("etag") ?? "";
		expect(etag).not.toBe("");
		const conditional = await app.request("/vendor/spool.js", { headers: { "if-none-match": etag } });
		expect(conditional.status).toBe(304);
	});
});

describe("frame document flow wiring", () => {
	it("injects the document config before the boot module and boots the runtime", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "inbox", plainFrame);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/p/${name}/frames/inbox`)).text();

		const config = doc.match(/window\.__SPOOL__\s*=\s*(\{.*?\})<\/script>/)?.[1];
		expect(config, "document config script").toBeDefined();
		expect(JSON.parse(config ?? "{}")).toEqual({
			project: name,
			frame: "inbox",
			projectCapability: expect.any(String),
		});
		expect(doc.indexOf("window.__SPOOL__")).toBeLessThan(doc.indexOf('<script type="module">'));

		const boot = doc.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
		expect(boot).toContain('import "spool"');
	});

	it("pins spool in the import map where the project map cannot override it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/importmap.json",
			'{\n\t"imports": {\n\t\t"spool": "https://evil.test/spool.js",\n\t\t"react": "https://evil.test/react.js"\n\t}\n}\n',
		);
		writeFrame(root, "inbox", plainFrame);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/p/${name}/frames/inbox`)).text();

		const importMap = JSON.parse(doc.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
		expect(importMap.imports.spool).toBe("/vendor/spool.js");
		expect(importMap.imports.react).toBe("/vendor/react.js");
	});
});

describe("the shared/ui boundary", () => {
	it("fails the compile with a clear message when shared/ui imports spool", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/nav-button.tsx",
			'import { ui } from "spool";\n\nexport function NavButton() {\n\treturn <button onClick={() => ui.back()}>back</button>;\n}\n',
		);
		writeFrame(
			root,
			"inbox",
			'import { NavButton } from "../../shared/ui/nav-button";\n\nexport default function Inbox() {\n\treturn <NavButton />;\n}\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/inbox`);

		expect(res.status).toBe(500);
		const doc = await res.text();
		expect(doc).toContain("failed to compile");
		expect(doc).toContain("shared/ui/nav-button.tsx");
		expect(doc).toContain("&quot;spool&quot;");
		expect(doc).toContain("props");
	});

	it("applies to nested shared/ui files too, and recovers when the import moves to the frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/menu/item.tsx",
			'import { ui } from "spool";\n\nexport function Item() {\n\treturn <span>{String(ui.state.label)}</span>;\n}\n',
		);
		writeFrame(
			root,
			"menu",
			'import { Item } from "../../shared/ui/menu/item";\n\nexport default function Menu() {\n\treturn <Item />;\n}\n',
		);
		const app = makeApp(spoolDir);

		expect((await app.request(`/p/${name}/frames/menu`)).status).toBe(500);

		writeDesignFile(
			root,
			"shared/ui/menu/item.tsx",
			"export function Item({ label }: { label: string }) {\n\treturn <span>{label}</span>;\n}\n",
		);
		writeFrame(
			root,
			"menu",
			'import { ui } from "spool";\nimport { Item } from "../../shared/ui/menu/item";\n\nexport default function Menu() {\n\treturn <Item label={String(ui.state.label ?? "menu")} />;\n}\n',
		);
		const recovered = await app.request(`/p/${name}/frames/menu`);
		expect(recovered.status).toBe(200);
	});

	it("frames themselves import spool freely", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"inbox",
			'import { ui } from "spool";\n\nexport default function Inbox() {\n\treturn <button onClick={() => ui.go("thread")}>open</button>;\n}\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/inbox`);

		expect(res.status).toBe(200);
		expect(await res.text()).toContain("ui.go");
	});
});
