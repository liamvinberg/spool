import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { exportReach } from "./html-export";

describe("what an exported file carries", () => {
	it("reaches every frame a walk can get to from the start, in the order a walk meets them", () => {
		const edges = [
			{ from: "menu", to: "cart" },
			{ from: "menu", to: "help" },
			{ from: "cart", to: "pay" },
			{ from: "pay", to: "menu" },
			{ from: "pay", to: "gone" },
			{ from: "elsewhere", to: "menu" },
		];
		const frames = new Set(["menu", "cart", "help", "pay", "elsewhere"]);

		expect(exportReach(edges, "menu", frames)).toEqual(["cart", "help", "pay"]);
		expect(exportReach(edges, "help", frames)).toEqual([]);
	});
});

describe("the export routes", () => {
	it("plans the walk a file would hold, and refuses a frame that is not there or will not build", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "menu", `export default () => <button data-go="cart">Order</button>;\n`);
		writeFrame(root, "cart", `export default () => <button data-go="pay">Pay</button>;\n`);
		writeFrame(root, "pay", `export default () => <p>Paid</p>;\n`);
		writeFrame(root, "broken", `export default () => <p>{</p>;\n`);
		const app = makeApp(spoolDir);

		const plan = await app.request(`/api/p/${name}/export/plan?frame=menu`);
		expect(await plan.json()).toEqual({ reach: ["cart", "pay"] });
		expect((await app.request(`/api/p/${name}/export/plan?frame=nowhere`)).status).toBe(404);
		expect((await app.request(`/api/p/${name}/export/html?frame=nowhere`)).status).toBe(404);
		const broken = await app.request(`/api/p/${name}/export/html?frame=broken&scope=one`);
		expect(broken.status).toBe(422);
		expect(await broken.text()).toContain("frame.tsx");
	});

	it("carries the faces a slide imports from the web in its own style, so a talk keeps its type offline", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experimental: { deck: true } }));
		const { root, name } = makeProject(spoolDir);
		writePageFrame(
			root,
			"talk",
			"title",
			`const STYLE = '@import url("https://fonts.example/css2?family=Talk+Sans&display=swap");';
export default () => <main><style>{STYLE}</style><h1 style={{ fontFamily: "Talk Sans" }}>Hello</h1></main>;\n`,
		);
		writeDesignFile(
			root,
			"frames/talk/deck.json",
			JSON.stringify({ version: 1, w: 1280, h: 720, slides: ["title"] }),
		);
		const app = makeApp(spoolDir, {
			webfonts: {
				// as a foundry answers the import: its faces, each file re-pointed at the daemon
				resolve: async (css) =>
					css?.includes("https://fonts.example/css2?family=Talk+Sans&display=swap")
						? '@font-face { font-family: "Talk Sans"; src: url(/vendor/webfont/talksans) format("woff2"); }'
						: css,
				read: async (key) =>
					key === "talksans" ? { bytes: Buffer.from([1, 2, 3]), type: "font/woff2" } : undefined,
				revision: () => 0,
			},
		});

		const res = await app.request(`/api/p/${name}/deck-export?page=talk`);
		expect(res.status, await res.clone().text()).toBe(200);
		expect(await res.text()).toContain(
			'@font-face { font-family: "Talk Sans"; src: url(data:font/woff2;base64,AQID) format("woff2"); }',
		);
	});
});
