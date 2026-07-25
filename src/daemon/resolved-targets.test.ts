import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { type Flows, frameSourceHash } from "./flows";
import { createResolvePass } from "./resolve-pass";
import { projectScenarios, type RenderedTarget } from "./resolved-targets";

/**
 * Filling a dark target from a render (#34). The law under every test here:
 * the parser enumerates the sites, the render only supplies values for sites it
 * already found. A rendered attribute with no unreadable site behind it mints
 * nothing, exactly as a walk cannot mint an edge.
 *
 * Derivation stays sync and browserless — the cache in design/.spool is the
 * seam, so these tests write it directly and read the graph over the Hono
 * surface. The one Playwright path is deliberately unseamed, like the shot
 * taker's: see the tolerant smoke in go-reader.test.ts.
 */

/** A shared row component whose target is computed — notaker's real shape. */
const ROWS = `export function Rows({ items }) {
	return items.map((it) => (
		<button
			key={it.id}
			type="button"
			data-go={it.frame}
		>
			{it.id}
		</button>
	));
}
`;

const INDEX = `import { Rows } from "../../shared/ui/rows";
const ITEMS = [{ id: "a", frame: "one" }, { id: "b", frame: "two" }];
export default function Frame() {
	return <Rows items={ITEMS} />;
}
`;

const plainTsx = `export default function Frame() {\n\treturn <main>here</main>;\n}\n`;

function seedProject(): { root: string; name: string; app: ReturnType<typeof makeApp> } {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeDesignFile(root, "shared/ui/rows.tsx", ROWS);
	writeFrame(root, "index", INDEX);
	writeFrame(root, "one", plainTsx);
	writeFrame(root, "two", plainTsx);
	return { root, name, app: makeApp(spoolDir) };
}

async function fetchFlows(app: ReturnType<typeof makeApp>, name: string): Promise<Flows> {
	const res = await app.request(`/api/p/${name}/flows`);
	expect(res.status).toBe(200);
	return (await res.json()) as Flows;
}

/** Write the cache the way a completed pass would, hash and all. */
function writeCache(root: string, frame: string, targets: RenderedTarget[], overrides?: { hash?: string }): void {
	const dir = join(root, "design", ".spool");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "resolved.json"),
		`${JSON.stringify({
			version: 1,
			frames: [
				{
					frame,
					hash: overrides?.hash ?? frameSourceHash(root, frame),
					scenarios: projectScenarios(root).hash,
					targets,
					at: "2026-07-25T00:00:00.000Z",
				},
			],
		})}\n`,
	);
}

describe("a render fills a dark target", () => {
	it("turns one unreadable site into an edge per value, marked resolved", async () => {
		const { root, name, app } = seedProject();

		// before: the site is named, and there is no edge at all
		const before = await fetchFlows(app, name);
		expect(before.edges).toEqual([]);
		expect(before.unreadable).toEqual([{ frame: "index", path: "shared/ui/rows.tsx", line: 6 }]);

		// the attribute sits on line 6 but its element is authored at 3:3 — the
		// anchor is what a rendered carrier's stamp matches, never the site line
		writeCache(root, "index", [
			{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 },
			{ target: "two", path: "shared/ui/rows.tsx", line: 3, col: 3 },
		]);

		const after = await fetchFlows(app, name);
		expect(after.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(["index->one", "index->two"]);
		expect(after.edges.every((edge) => edge.resolved === true)).toBe(true);
		// one site resolving to two targets: neither is certain
		expect(after.edges.every((edge) => edge.certainty === "might")).toBe(true);
		// the site is answered, so it is no longer reported dark
		expect(after.unreadable).toEqual([]);
	});

	it("mints nothing for a rendered attribute with no unreadable site behind it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "index", `export default function Frame() {\n\treturn <a data-go="one">go</a>;\n}\n`);
		writeFrame(root, "one", plainTsx);
		const app = makeApp(spoolDir);

		// a render claiming a target the parser never found a site for
		writeCache(root, "index", [{ target: "two", path: "frames/index/frame.tsx", line: 2, col: 9 }]);

		const flows = await fetchFlows(app, name);
		expect(flows.edges.map((edge) => edge.to)).toEqual(["one"]);
		expect(flows.edges[0]?.resolved).toBeUndefined();
	});

	it("drops the read when the source behind the site changes", async () => {
		const { root, name, app } = seedProject();
		writeCache(root, "index", [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }]);
		expect((await fetchFlows(app, name)).edges).toHaveLength(1);

		// the shared component is edited: the stored read is about older bytes
		writeDesignFile(root, "shared/ui/rows.tsx", `${ROWS}\n// touched\n`);

		const after = await fetchFlows(app, name);
		expect(after.edges).toEqual([]);
		expect(after.unreadable).toHaveLength(1);
	});

	it("drops the read when a scenario is added", async () => {
		const { root, name, app } = seedProject();
		writeCache(root, "index", [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }]);
		expect((await fetchFlows(app, name)).edges).toHaveLength(1);

		// a new scenario is a state nobody rendered: the read is incomplete now
		writeDesignFile(root, "shared/scenarios/empty.json", `{ "state": {} }\n`);

		expect((await fetchFlows(app, name)).edges).toEqual([]);
	});

	it("keeps a resolved target that names no frame honest about being missing", async () => {
		const { root, name, app } = seedProject();
		writeCache(root, "index", [{ target: "ghost", path: "shared/ui/rows.tsx", line: 3, col: 3 }]);

		const flows = await fetchFlows(app, name);
		expect(flows.edges).toEqual([
			expect.objectContaining({ from: "index", to: "ghost", missing: true, resolved: true }),
		]);
	});

	it("reads a malformed cache as nothing resolved", async () => {
		const { root, name, app } = seedProject();
		const dir = join(root, "design", ".spool");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "resolved.json"), "{ not json\n");

		const flows = await fetchFlows(app, name);
		expect(flows.edges).toEqual([]);
		expect(flows.unreadable).toHaveLength(1);
	});
});

describe("the pass", () => {
	const frames = [
		{ name: "index", width: 390, height: 844 },
		{ name: "one", width: 390, height: 844 },
		{ name: "two", width: 390, height: 844 },
	];

	it("renders only the frames with a dark site, once per scenario", async () => {
		const { root } = seedProject();
		writeDesignFile(root, "shared/scenarios/default.json", `{ "state": {} }\n`);
		writeDesignFile(root, "shared/scenarios/full.json", `{ "state": { "n": 1 } }\n`);
		const urls: string[] = [];
		const pass = createResolvePass({
			read: async (target) => {
				urls.push(target.url);
				return [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }];
			},
			moved: () => {},
			now: () => "2026-07-25T00:00:00.000Z",
		});

		const result = await pass.run({ root, project: "p", origin: "http://host", frames });

		// "one" and "two" declare no walk at all: they are never rendered
		expect(urls).toEqual([
			"http://host/p/p/frames/index?scenario=default",
			"http://host/p/p/frames/index?scenario=full",
		]);
		expect(result).toEqual({ skipped: 0, read: 1, unavailable: 0 });
	});

	it("skips a frame whose read is already fresh, and announces only real movement", async () => {
		const { root } = seedProject();
		const moved: string[] = [];
		const pass = createResolvePass({
			read: async () => [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }],
			moved: (at) => moved.push(at),
			now: () => "2026-07-25T00:00:00.000Z",
		});

		expect((await pass.run({ root, project: "p", origin: "http://host", frames })).read).toBe(1);
		expect(moved).toHaveLength(1);

		const second = await pass.run({ root, project: "p", origin: "http://host", frames });
		expect(second).toEqual({ skipped: 1, read: 0, unavailable: 0 });
		expect(moved).toHaveLength(1);
	});

	it("records nothing and stays dark when the reader cannot answer", async () => {
		const { root, name, app } = seedProject();
		const pass = createResolvePass({
			read: async () => undefined,
			moved: () => {},
			now: () => "2026-07-25T00:00:00.000Z",
		});

		const result = await pass.run({ root, project: name, origin: "http://host", frames });

		expect(result).toEqual({ skipped: 0, read: 0, unavailable: 1 });
		const flows = await fetchFlows(app, name);
		expect(flows.edges).toEqual([]);
		expect(flows.unreadable).toHaveLength(1);
	});

	it("sweeps a record whose frame is gone", async () => {
		const { root } = seedProject();
		writeCache(root, "deleted-frame", [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }]);
		const pass = createResolvePass({
			read: async () => [{ target: "one", path: "shared/ui/rows.tsx", line: 3, col: 3 }],
			moved: () => {},
			now: () => "2026-07-25T00:00:00.000Z",
		});

		await pass.run({ root, project: "p", origin: "http://host", frames });

		const stored = JSON.parse(readFileSync(join(root, "design", ".spool", "resolved.json"), "utf8")) as {
			frames: { frame: string }[];
		};
		expect(stored.frames.map((record) => record.frame)).toEqual(["index"]);
	});
});
