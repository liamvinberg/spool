import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";
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
});
