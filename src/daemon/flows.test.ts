import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import type { Flows } from "./flows";

/**
 * The flow layer over the Hono seam (#34): the map is read, not walked —
 * edges derive from navigation sites in source, certainty says how surely a
 * session goes (will = unconditional, might = branched), unreadable names
 * every destination the parser cannot see. Walks can only confirm: they flip
 * verified marks on derived edges, cached in design/.spool and dropped when
 * the from-frame's source changes.
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
	it("derives will edges from data-go literals, sites carried, variants and all", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout", "checkout--empty"]));
		writeFrame(root, "checkout", plainTsx);
		writeFrame(root, "checkout--empty", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.frames).toEqual(["cart", "checkout", "checkout--empty"]);
		expect(flows.unreadable).toEqual([]);
		expect(flows.edges).toEqual([
			{
				from: "cart",
				to: "checkout",
				certainty: "will",
				sites: [{ via: "data-go", path: "frames/cart/frame.tsx", line: 4, anchor: { line: 4, col: 4 } }],
			},
			{
				from: "cart",
				to: "checkout--empty",
				certainty: "will",
				sites: [{ via: "data-go", path: "frames/cart/frame.tsx", line: 5, anchor: { line: 5, col: 4 } }],
			},
		]);
	});

	it("reads nested source files and ui.go calls in the frame folder", async () => {
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
			`import { ui } from "spool";\nexport function Nav() {\n\treturn <a onClick={() => ui.go("inbox")}>inbox</a>;\n}\n`,
		);
		writeFrame(root, "inbox", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.edges).toEqual([
			{
				from: "home",
				to: "inbox",
				certainty: "will",
				sites: [{ via: "ui.go", path: "frames/home/parts/nav.tsx", line: 3, anchor: { line: 3, col: 9 } }],
			},
		]);
	});

	it("derives the same shared nav bar's edge for every frame mounting it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/chrome.tsx",
			`export function Chrome() {\n\treturn <a data-go="index">← all</a>;\n}\n`,
		);
		const mounts = `import { Chrome } from "../../shared/ui/chrome";\nexport default function Frame() {\n\treturn <Chrome />;\n}\n`;
		writeFrame(root, "index", plainTsx);
		writeFrame(root, "one", mounts);
		writeFrame(root, "two", mounts);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		// the site lives in one file; the walk happens on every page carrying it
		expect(flows.edges).toEqual([
			{
				from: "one",
				to: "index",
				certainty: "will",
				sites: [{ via: "data-go", path: "shared/ui/chrome.tsx", line: 2, anchor: { line: 2, col: 9 } }],
			},
			{
				from: "two",
				to: "index",
				certainty: "will",
				sites: [{ via: "data-go", path: "shared/ui/chrome.tsx", line: 2, anchor: { line: 2, col: 9 } }],
			},
		]);
		expect(flows.unreadable).toEqual([]);
	});

	it("names an unreadable site in a shared component against the frame that mounts it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/rows.tsx",
			`export function Rows({ items }) {\n\treturn items.map((it) => <a key={it.id} data-go={it.frame}>{it.id}</a>);\n}\n`,
		);
		writeFrame(
			root,
			"index",
			`import { Rows } from "../../shared/ui/rows";\nexport default function Frame() {\n\treturn <Rows items={[]} />;\n}\n`,
		);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		// a computed target is real information about the mounting frame, not silence
		expect(flows.edges).toEqual([]);
		expect(flows.unreadable).toEqual([{ frame: "index", path: "shared/ui/rows.tsx", line: 2 }]);
	});

	it("drops a verified mark when the shared component behind the edge changes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/ui/go.tsx", `export function Go() {\n\treturn <a data-go="end">on</a>;\n}\n`);
		writeFrame(
			root,
			"start",
			`import { Go } from "../../shared/ui/go";\nexport default function Frame() {\n\treturn <Go />;\n}\n`,
		);
		writeFrame(root, "end", plainTsx);
		const app = makeApp(spoolDir);

		expect((await postWalked(app, name, "start", "end")).status).toBe(204);
		expect((await fetchFlows(app, name)).edges[0]?.verified).toBe(true);

		// the frame's own file is untouched; the walk it claims came from shared/
		writeDesignFile(root, "shared/ui/go.tsx", `export function Go() {\n\treturn <a data-go="end">off</a>;\n}\n`);

		expect((await fetchFlows(app, name)).edges[0]?.verified).toBeUndefined();
	});

	it("two sites claiming the same edge stay grouped on one edge", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "menu", goTsx(["cart", "cart"]));
		writeFrame(root, "cart", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.edges).toHaveLength(1);
		expect(flows.edges[0]?.sites).toHaveLength(2);
	});

	it("a branched site is might; an unconditional site on the same edge wins", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"pay",
			`import { ui } from "spool";
export default function Frame() {
	const { ok } = ui.use();
	return <button onClick={() => ui.go(ok ? "receipt" : "topup")}>pay</button>;
}
`,
		);
		writeFrame(
			root,
			"topup",
			`export default function Frame() {
	return (
		<main>
			<a data-go="receipt">always</a>
			<a data-go={0 ? "receipt" : "receipt"}>branch</a>
		</main>
	);
}
`,
		);
		writeFrame(root, "receipt", plainTsx);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		const certainty = Object.fromEntries(flows.edges.map((e) => [`${e.from}→${e.to}`, e.certainty]));
		expect(certainty).toEqual({
			"pay→receipt": "might",
			"pay→topup": "might",
			"topup→receipt": "will",
		});
		const conditional = flows.edges.find((e) => e.from === "pay" && e.to === "receipt")?.sites[0]?.conditional;
		expect(conditional).toBe(true);
	});

	it("marks an edge whose target frame does not exist, ui.go typos included", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"cart",
			`import { ui } from "spool";
export default function Frame() {
	return (
		<main>
			<a data-go="nowhere">gone</a>
			<button onClick={() => ui.go("reciept")}>typo</button>
		</main>
	);
}
`,
		);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.edges.map(({ from, to, missing }) => ({ from, to, missing }))).toEqual([
			{ from: "cart", to: "nowhere", missing: true },
			{ from: "cart", to: "reciept", missing: true },
		]);
	});

	it("names every unreadable destination instead of papering over it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(
			root,
			"cart",
			`import { ui } from "spool";
const routeFor = (s: unknown) => "somewhere";
export default function Frame() {
	return <button onClick={() => ui.go(routeFor(ui.state))}>pay</button>;
}
`,
		);
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.edges).toEqual([]);
		expect(flows.unreadable).toEqual([{ frame: "cart", path: "frames/cart/frame.tsx", line: 4 }]);
	});

	it("a literal that cannot be a frame name claims nothing", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["../outside", ".hidden"]));
		const app = makeApp(spoolDir);

		const flows = await fetchFlows(app, name);

		expect(flows.edges).toEqual([]);
	});

	it("edges are derived fresh: editing source moves the graph", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);
		expect((await fetchFlows(app, name)).edges).toHaveLength(1);

		writeFrame(root, "cart", plainTsx);

		expect((await fetchFlows(app, name)).edges).toEqual([]);
	});
});

describe("verified marks", () => {
	it("a walk along a derived edge flips verified and persists under design/.spool", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		const res = await postWalked(app, name, "cart", "checkout");
		expect(res.status).toBe(204);

		const flows = await fetchFlows(app, name);
		expect(flows.edges).toEqual([
			{
				from: "cart",
				to: "checkout",
				certainty: "will",
				sites: [{ via: "data-go", path: "frames/cart/frame.tsx", line: 4, anchor: { line: 4, col: 4 } }],
				verified: true,
			},
		]);
		// the cache is a real file, gitignored with the rest of .spool
		const stored = JSON.parse(readFileSync(join(root, "design", ".spool", "walked.json"), "utf8"));
		expect(stored.edges).toHaveLength(1);
	});

	it("a walk the source never claims is discarded — playing cannot add arrows", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", plainTsx);
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		const res = await postWalked(app, name, "cart", "checkout");
		expect(res.status).toBe(204);

		const flows = await fetchFlows(app, name);
		expect(flows.edges).toEqual([]);
	});

	it("drops a verified mark when the from-frame changes, nested files included", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeDesignFile(root, "frames/cart/parts/row.tsx", "export function Row() {\n\treturn <li>row</li>;\n}\n");
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);
		await postWalked(app, name, "cart", "checkout");
		expect((await fetchFlows(app, name)).edges[0]?.verified).toBe(true);

		// the frame is its folder: an edit anywhere in it may unmake the claim
		writeDesignFile(root, "frames/cart/parts/row.tsx", "export function Row() {\n\treturn <li>edited</li>;\n}\n");

		const flows = await fetchFlows(app, name);
		expect(flows.edges).toHaveLength(1);
		expect(flows.edges[0]?.verified).toBeUndefined();
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
	});

	it("publishes a walked event only when a mark really records", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", goTsx(["checkout"]));
		writeFrame(root, "checkout", plainTsx);
		const app = makeApp(spoolDir);

		const events = await app.request(`/api/p/${name}/events`);
		const reader = sseReader(events);
		expect((await reader.next()).event).toBe("hello");
		// the file watcher is still reporting the setup writes — let it settle
		await reader.drain(400);

		// checkout claims nothing, so this walk records nothing — and says nothing
		await postWalked(app, name, "checkout", "cart");
		await reader.expectQuiet(300);

		await postWalked(app, name, "cart", "checkout");
		const seen = await reader.next();
		expect(seen).toEqual({ event: "change", data: { kind: "walked" } });
	});
});

describe("terminal frames in the flow map (#42)", () => {
	it("derives a terminal frame's term.go sites into edges with certainty", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			join("frames", "dash", "term.tsx"),
			`import { term } from "spool/term";
export function onKey(key) {
	term.go("logs");
	if (key === "q") term.go("goodbye");
}
`,
		);
		writeDesignFile(root, join("frames", "logs", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/flows`);
		const flows = (await res.json()) as Flows;

		expect(flows.frames).toEqual(["dash", "logs"]);
		const toLogs = flows.edges.find((e) => e.to === "logs");
		expect(toLogs).toMatchObject({ from: "dash", certainty: "will" });
		expect(toLogs?.sites[0]).toMatchObject({ via: "term.go" });
		// a declared target no frame answers to is real information
		expect(flows.edges.find((e) => e.to === "goodbye")).toMatchObject({ missing: true, certainty: "might" });
	});
});
