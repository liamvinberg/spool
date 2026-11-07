import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { exportReach, needsInternet } from "./html-export";

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

	it("names a frame online when it loads from the web, not when it only names a web address", () => {
		const offFile = ["confetti", "icons/"];

		expect(needsInternet(['const r = await fetch("https://api.kaffe.se/menu");'], offFile)).toBe(true);
		expect(needsInternet(['<img src="https://images.example.com/a.png" />'], offFile)).toBe(true);
		expect(needsInternet(["background: url(https://cdn.example.com/x.jpg);"], offFile)).toBe(true);
		expect(needsInternet(['import confetti from "confetti";'], offFile)).toBe(true);
		expect(needsInternet(['import { cup } from "icons/cup.js";'], offFile)).toBe(true);
		expect(
			needsInternet(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" />',
					'<a href="https://kaffe.se">kaffe</a>',
					'import { ui } from "spool";',
					'import confettiCannon from "confetti-cannon";',
				],
				offFile,
			),
		).toBe(false);
	});
});

describe("the export routes", () => {
	it("plans the walk a file would hold, and refuses a frame that is not there or will not build", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/importmap.json",
			JSON.stringify({ imports: { confetti: "https://esm.sh/confetti" } }),
		);
		writeFrame(root, "menu", `export default () => <button data-go="cart">Order</button>;\n`);
		writeFrame(root, "cart", `export default () => <button data-go="pay">Pay</button>;\n`);
		writeFrame(
			root,
			"pay",
			`import confetti from "confetti";\nexport default () => <p onClick={() => confetti()}>Paid</p>;\n`,
		);
		writeFrame(root, "broken", `export default () => <p>{</p>;\n`);
		const app = makeApp(spoolDir);

		const plan = await app.request(`/api/p/${name}/export/plan?frame=menu`);
		expect(await plan.json()).toEqual({ reach: ["cart", "pay"], online: ["pay"] });
		expect((await app.request(`/api/p/${name}/export/plan?frame=nowhere`)).status).toBe(404);
		expect((await app.request(`/api/p/${name}/export/html?frame=nowhere`)).status).toBe(404);
		const broken = await app.request(`/api/p/${name}/export/html?frame=broken&scope=one`);
		expect(broken.status).toBe(422);
		expect(await broken.text()).toContain("frame.tsx");
	});
});
