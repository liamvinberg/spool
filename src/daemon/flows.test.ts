import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import type { Flows } from "./flows";

/**
 * The flow layer over the Hono seam (#25): declared links re-derived from
 * source on every read, walked edges cached in design/.spool and dropped when
 * the source frame changes — never stored truth, always derived or witnessed.
 */

const goTsx = (targets: string[]) => `export default function Frame() {
	return (
		<main>
${targets.map((t) => `\t\t\t<button data-go="${t}">to ${t}</button>`).join("\n")}
		</main>
	);
}
`;

const plainTsx = `export default function Frame() {
	return <main>nowhere to go</main>;
}
`;

async function fetchFlows(app: ReturnType<typeof makeApp>, name: string): Promise<Flows> {
	const res = await app.request(`/api/p/${name}/flows`);
	expect(res.status).toBe(200);
	return (await res.json()) as Flows;
}

async function postWalked(app: ReturnType<typeof makeApp>, name: string, from: string, to: string): Promise<Response> {
	return app.request(`/api/p/${name}/walked`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ from, to }),
	});
}

describe("flows derivation", () => {
	it("derives declared links from data-go literals, variants and all", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout", "checkout--empty"]));
		writeFrame(root, "checkout", plainTsx);
		writeFrame(root, "checkout--empty", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.frames).toEqual(["cart", "checkout", "checkout--empty"]);
		expect(flows.links).toEqual([
			{ from: "cart", to: "checkout", kind: "declared" },
			{ from: "cart", to: "checkout--empty", kind: "declared" },
		]);
	});

	it("reads nested source files in the frame folder and the jsx expression forms", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"home",
			`import { Nav } from "./parts/nav.tsx";\nexport default function Frame() {\n\treturn <Nav />;\n}\n`,
		);
		writeDesignFile(
			root,
			"frames/home/parts/nav.tsx",
			`export function Nav() {\n\treturn <a data-go={"inbox"}>inbox</a>;\n}\n`,
		);
		writeFrame(root, "inbox", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.links).toEqual([{ from: "home", to: "inbox", kind: "declared" }]);
	});

	it("marks a declared link whose target frame does not exist", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["nowhere"]));
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.links).toEqual([{ from: "cart", to: "nowhere", kind: "declared", missing: true }]);
	});

	it("declared links are derived fresh: editing source moves the graph", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);
		expect((await fetchFlows(app, name)).links).toHaveLength(1);

		writeFrame(root, "cart", plainTsx);

		expect((await fetchFlows(app, name)).links).toEqual([]);
	});
});

describe("walked edges", () => {
	it("records a walk, serves it dashed, and persists it under design/.spool", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", plainTsx);
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		const res = await postWalked(app, name, "cart", "checkout");
		expect(res.status).toBe(204);

		const flows = await fetchFlows(app, name);
		expect(flows.links).toEqual([{ from: "cart", to: "checkout", kind: "walked" }]);
		// the cache is a real file, gitignored with the rest of .spool
		const stored = JSON.parse(readFileSync(join(root, "design", ".spool", "walked.json"), "utf8"));
		expect(stored.edges).toHaveLength(1);
	});

	it("a walked edge that duplicates a declared link is absorbed by it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		await postWalked(app, name, "cart", "checkout");

		const flows = await fetchFlows(app, name);
		expect(flows.links).toEqual([{ from: "cart", to: "checkout", kind: "declared" }]);
	});

	it("drops a walked edge when the source frame changes, nested files included", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", plainTsx);
		writeDesignFile(root, "frames/cart/parts/row.tsx", "export function Row() {\n\treturn <li>row</li>;\n}\n");
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);
		await postWalked(app, name, "cart", "checkout");
		expect((await fetchFlows(app, name)).links).toHaveLength(1);

		// the frame is its folder: an edit anywhere in it may remove the coded walk
		writeDesignFile(root, "frames/cart/parts/row.tsx", "export function Row() {\n\treturn <li>edited</li>;\n}\n");

		expect((await fetchFlows(app, name)).links).toEqual([]);
	});

	it("rejects walks for frames that do not exist", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", plainTsx);
		const app = makeApp(spoolDir);

		const ghostTo = await postWalked(app, name, "cart", "nowhere");
		const ghostFrom = await postWalked(app, name, "nowhere", "cart");

		expect(ghostTo.status).toBe(404);
		expect(ghostFrom.status).toBe(404);
		expect((await fetchFlows(app, name)).links).toEqual([]);
	});

	it("publishes a walked event so open canvases redraw", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", plainTsx);
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		const events = await app.request(`/api/p/${name}/events`);
		const reader = sseReader(events);
		expect((await reader.next()).event).toBe("hello");

		await postWalked(app, name, "cart", "checkout");

		const seen = await reader.next();
		expect(seen).toEqual({ event: "change", data: { kind: "walked" } });
	});
});
