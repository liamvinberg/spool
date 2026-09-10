import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { makeApp, makeProject, makeTempDir, SseTimeout, sseReader, writeDesignFile, writeFrame } from "../test-helpers";
import { fingerprintOf } from "./hand-write";

/**
 * The canvas's hands over the API (#23, #253). Selection is daemon memory
 * served as #6's payload; geometry writes touch frame.json alone; delete rides
 * the OS Trash seam. Frame source is written only through the write lane below: a typed
 * op, gated against a fresh parse, spliced into the exact characters it named.
 */

const frameTsx = `export default function Frame() {
	return (
		<main>
			<button className="pay">Pay now</button>
		</main>
	);
}
`;

function jsonPut(body: unknown): RequestInit {
	return { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function jsonPost(body: unknown): RequestInit {
	return { ...jsonPut(body), method: "POST" };
}

describe("the selection API", () => {
	it("starts empty and round-trips a frame selection with path and size", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeDesignFile(root, "frames/checkout/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
		const app = makeApp(spoolDir);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual({ selection: [] });

		const put = await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["checkout"] }));
		// the put answers with what it enriched, because the composer's chips are the
		// promise of what a prompt will carry and only this side knows the paths (#116)
		expect(put.status).toBe(200);
		const enriched = {
			selection: [
				{ kind: "frame", frame: "checkout", path: "design/frames/checkout/frame.tsx", size: { w: 800, h: 600 } },
			],
		};
		expect(await put.json()).toEqual(enriched);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual(enriched);
	});

	it("serves an element selection as name/path/lines/selector/excerpt from the stamp", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		// the button's stamp: line 4, column 4 of frame.tsx (tabs count as one)
		const put = await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > button",
						outerHtml: '<button class="pay">Pay now</button>',
						source: "frames/checkout/frame.tsx:4:4",
						generated: false,
					},
				],
			}),
		);
		expect(put.status).toBe(200);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual({
			selection: [
				{
					kind: "element",
					frame: "checkout",
					// what the source calls it, which is the noun a chip and the prompt
					// block both print
					name: "button",
					path: "design/frames/checkout/frame.tsx",
					lines: [4, 4],
					selector: "main > button",
					excerpt: '<button className="pay">Pay now</button>',
				},
			],
		});
	});

	it("serves a multi-element selection as one entry per element, in put order", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		const put = await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > button",
						outerHtml: '<button class="pay">Pay now</button>',
						source: "frames/checkout/frame.tsx:4:4",
						generated: false,
					},
					{
						frame: "checkout",
						selector: "main",
						outerHtml: "<main></main>",
						source: "frames/checkout/frame.tsx:3:3",
						generated: false,
					},
				],
			}),
		);
		expect(put.status).toBe(200);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection.map((entry) => [entry.kind, entry.name, entry.selector, entry.lines])).toEqual([
			["element", "button", "main > button", [4, 4]],
			["element", "main", "main", [3, 5]],
		]);
	});

	it("degrades generated elements honestly: ancestor lines, live outerHTML excerpt", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > ul > li:nth-of-type(2)",
						outerHtml: "<li>b</li>",
						source: "frames/checkout/frame.tsx:3:3",
						generated: true,
					},
				],
			}),
		);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection[0]).toMatchObject({
			kind: "element",
			generated: true,
			// its name comes from the same place its excerpt does — the stamped
			// ancestor's own word for itself would be somebody else's
			name: "li",
			lines: [3, 5],
			excerpt: "<li>b</li>",
			selector: "main > ul > li:nth-of-type(2)",
		});
	});

	it("treats a stamp escaping design/ as no stamp at all", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > i",
						outerHtml: "<i>x</i>",
						source: "../../secrets.txt:1:1",
						generated: false,
					},
				],
			}),
		);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection[0]).toMatchObject({
			path: "design/frames/checkout/frame.tsx",
			lines: [1, 1],
			excerpt: "<i>x</i>",
			generated: true,
		});
	});

	it("rejects malformed selections and unsafe frame names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/selection`, jsonPut({}))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["../escape"] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ frames: [42] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ elements: [{ frame: "x" }] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ elements: "main" }))).status).toBe(400);
	});

	it("drops selected frames that no longer exist instead of fabricating entries", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["checkout", "ghost"] }));

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<{ frame: string }>;
		};
		expect(selection.map((entry) => entry.frame)).toEqual(["checkout"]);
	});
});

describe("the geometry API", () => {
	it("writes moved and resized geometry to the sidecar alone — frame source untouched", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeFrame(root, "menu", frameTsx);
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/frames`); // sidecars filled in

		const sources = ["checkout", "menu"].map((frame) => {
			const file = join(root, "design", "frames", frame, "frame.tsx");
			return { file, bytes: readFileSync(file), mtime: statSync(file).mtimeMs };
		});

		const put = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({
				frames: { checkout: { x: -20, y: 40, w: 800, h: 600 }, menu: { x: 900, y: 40.4, w: 390, h: 844 } },
			}),
		);
		expect(put.status).toBe(204);

		// the seam (#23): move and resize write geometry, never source
		for (const source of sources) {
			expect(readFileSync(source.file)).toEqual(source.bytes);
			expect(statSync(source.file).mtimeMs).toBe(source.mtime);
		}
		expect(JSON.parse(readFileSync(join(root, "design", "frames", "checkout", "frame.json"), "utf8"))).toEqual({
			x: -20,
			y: 40,
			w: 800,
			h: 600,
		});
		// geometry lands as integers
		expect(JSON.parse(readFileSync(join(root, "design", "frames", "menu", "frame.json"), "utf8"))).toEqual({
			x: 900,
			y: 40,
			w: 390,
			h: 844,
		});

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: Array<{ name: string; x: number }>;
		};
		expect(frames.find((f) => f.name === "checkout")?.x).toBe(-20);
	});

	it("publishes a geometry event, never a frame change, for sidecar writes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");
		// macOS FSEvents can replay the setup writes from just before the stream
		// armed — flush them so the assertions below see only the PUT's doing
		await events.drain(400);

		await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 1, y: 2, w: 300, h: 400 } } }));

		expect(await events.next()).toEqual({ event: "change", data: { kind: "geometry", frame: "checkout" } });
		// the watcher sees the same sidecar and says the same thing about it (#113),
		// and a move heard twice moves nothing twice. What must never arrive for a
		// frame.json write is a frame change, because that is what reloads a document
		for (;;) {
			try {
				expect(await events.next(300)).toEqual({ event: "change", data: { kind: "geometry", frame: "checkout" } });
			} catch (error) {
				if (error instanceof SseTimeout) break;
				throw error;
			}
		}
	});

	it("rejects unknown frames before writing anything, and malformed geometry", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		const ghost = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({ frames: { checkout: { x: 0, y: 0, w: 100, h: 100 }, ghost: { x: 0, y: 0, w: 100, h: 100 } } }),
		);
		expect(ghost.status).toBe(404);
		// all-or-nothing: the known frame's sidecar was not written either
		expect(existsSync(join(root, "design", "frames", "checkout", "frame.json"))).toBe(false);

		expect((await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 0 } } }))).status).toBe(
			400,
		);
		expect(
			(await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 0, y: 0, w: 0, h: 100 } } })))
				.status,
		).toBe(400);
	});

	it("answers 400, never 500, to a null JSON body on every hands route", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { moveToTrash: async () => {} });

		expect((await app.request(`/api/p/${name}/geometry`, jsonPut(null))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost(null))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut(null))).status).toBe(400);
	});
});

describe("the trash API", () => {
	it("moves whole frame folders through the OS Trash seam", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeFrame(root, "menu", frameTsx);
		const graveyard = makeTempDir();
		const trashed: string[] = [];
		const app = makeApp(spoolDir, {
			moveToTrash: async (paths) => {
				for (const path of paths) {
					trashed.push(path);
					renameSync(path, join(graveyard, basename(path)));
				}
			},
		});

		const res = await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["checkout"] }));

		expect(res.status).toBe(204);
		expect(trashed).toEqual([join(root, "design", "frames", "checkout")]);
		expect(existsSync(join(root, "design", "frames", "checkout"))).toBe(false);
		expect(existsSync(join(graveyard, "checkout", "frame.tsx"))).toBe(true);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: Array<{ name: string }>;
		};
		expect(frames.map((f) => f.name)).toEqual(["menu"]);
	});

	it("refuses ghosts and unsafe names without touching the trash", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const moveToTrash = vi.fn(async () => {});
		const app = makeApp(spoolDir, { moveToTrash });

		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: [] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["../escape"] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["checkout", "ghost"] }))).status).toBe(404);
		expect(moveToTrash).not.toHaveBeenCalled();
		expect(existsSync(join(root, "design", "frames", "checkout", "frame.tsx"))).toBe(true);
	});
});

/**
 * The write lane (#253). Every assertion here is external: what came back over
 * the API, and what the bytes on disk say afterwards.
 */

const cartTsx = `const ITEMS = ["latte", "bun"];

export default function Frame() {
	return (
		<main className="flex flex-col gap-2 p-4">
			<h1 className="text-lg">Cart</h1>
			<button className="rounded-md px-3 py-2" onClick={() => pay()}>
				Pay now
			</button>
			<p className={busy ? "opacity-50" : "opacity-100"}>state</p>
			<ul>
				{ITEMS.map((item) => (
					<li key={item} className="px-2">{item}</li>
				))}
			</ul>
		</main>
	);
}
`;

/** The stamp the compiler mints for the element a snippet opens. */
function stampFor(source: string, snippet: string): string {
	const at = source.indexOf(snippet);
	const before = source.slice(0, at);
	return `frames/cart/frame.tsx:${before.split("\n").length}:${at - (before.lastIndexOf("\n") + 1) + 1}`;
}

describe("the rungs read", () => {
	interface RungAnswer {
		source: string;
		name?: string;
		className: string;
		path?: string;
		line?: number;
		mapped?: true;
		refusal?: { code: string; says: string; expression?: string };
		attributes?: { name: string; value?: string; expression?: string; asset?: string }[];
		fingerprint?: string;
	}

	/**
	 * The read with the file's own hash taken off.
	 *
	 * Every rung carries it — a gesture formed from what the rail drew is
	 * measured against the file the rail read (#260) — and it is a hash of the
	 * whole file rather than a fact about the rung, so it is asserted once
	 * below and left out of the readings.
	 */
	async function rungs(
		app: ReturnType<typeof makeApp>,
		name: string,
		sources: readonly string[],
		frame = "cart",
	): Promise<RungAnswer[]> {
		return (await readRungs(app, name, sources, frame)).map(({ fingerprint, ...rung }) => {
			expect(fingerprint === undefined || fingerprint.length === 64).toBe(true);
			return rung;
		});
	}

	async function readRungs(
		app: ReturnType<typeof makeApp>,
		name: string,
		sources: readonly string[],
		frame = "cart",
	): Promise<RungAnswer[]> {
		const res = await app.request(`/api/p/${name}/rungs`, jsonPost({ frame, sources }));
		expect(res.status).toBe(200);
		return ((await res.json()) as { rungs: RungAnswer[] }).rungs;
	}

	it("carries the hash of the file it read, which is what a gesture is measured against", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", cartTsx);
		const app = makeApp(spoolDir);

		const [read] = await readRungs(app, name, [stampFor(cartTsx, "<main")]);
		expect(read?.fingerprint).toBe(fingerprintOf(cartTsx));
	});

	it("reads the string attributes the tag carries, and names the ones that are not literals", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const frame = `import hero from "./hero.png";\nexport default function Frame() {\n\treturn (\n\t\t<main>\n\t\t\t<img src={hero} alt="a latte" />\n\t\t\t<button data-go="checkout" onClick={() => pay()}>Pay</button>\n\t\t</main>\n\t);\n}\n`;
		writeFrame(root, "cart", frame);
		const app = makeApp(spoolDir);

		const [image, button] = await rungs(app, name, [stampFor(frame, "<img"), stampFor(frame, "<button")]);
		// a src bound to an image import is the picture it draws, not an expression
		expect(image?.attributes).toEqual([
			{ name: "src", asset: "./hero.png" },
			{ name: "alt", value: "a latte" },
		]);
		expect(button?.attributes).toEqual([
			{ name: "data-go", value: "checkout" },
			{ name: "onClick", expression: "{() => pay()}" },
		]);
	});

	it("reads a whole ancestry in rung order: the authored name, the literal, and where it is written", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", cartTsx);
		const app = makeApp(spoolDir);

		expect(await rungs(app, name, [stampFor(cartTsx, "<main"), stampFor(cartTsx, "<button")])).toEqual([
			{
				source: stampFor(cartTsx, "<main"),
				name: "main",
				className: "flex flex-col gap-2 p-4",
				path: "design/frames/cart/frame.tsx",
				line: 5,
			},
			{
				source: stampFor(cartTsx, "<button"),
				name: "button",
				className: "rounded-md px-3 py-2",
				path: "design/frames/cart/frame.tsx",
				line: 7,
				attributes: [{ name: "onClick", expression: "{() => pay()}" }],
			},
		]);
	});

	it("carries the refusal a write would have given rather than going quiet", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", cartTsx);
		const app = makeApp(spoolDir);

		const [computed, mapped] = await rungs(app, name, [
			stampFor(cartTsx, "<p className={busy"),
			stampFor(cartTsx, "<li"),
		]);
		expect(computed?.refusal).toEqual({
			code: "computed-class",
			says: "class is computed here; edit frames/cart/frame.tsx line 10 or ask the agent",
			expression: '{busy ? "opacity-50" : "opacity-100"}',
			line: 10,
		});
		expect(computed?.className).toBe("");
		expect(mapped).toMatchObject({ className: "px-2", mapped: true });
	});

	it("reads an element a shared file defines, and says how far an edit would reach", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/card.tsx",
			'export function Card() {\n\treturn <div className="p-2">card</div>;\n}\n',
		);
		writeFrame(root, "cart", 'import { Card } from "../../shared/ui/card";\n\nexport default () => <Card />;\n');
		const app = makeApp(spoolDir);

		// the crumbs still have to name it, so the rung reads whole and adjusts nowhere
		expect(await rungs(app, name, ["shared/ui/card.tsx:2:9"])).toEqual([
			{
				source: "shared/ui/card.tsx:2:9",
				name: "div",
				className: "p-2",
				path: "design/shared/ui/card.tsx",
				line: 2,
				refusal: { code: "shared-definition", says: "defined in shared/ui/card.tsx:2, rendered by 1 frame" },
			},
		]);
	});

	it("answers a stamp that hits nothing with the stale-stamp refusal, not an error", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", cartTsx);
		const app = makeApp(spoolDir);

		expect(await rungs(app, name, ["frames/cart/frame.tsx:2:1"])).toEqual([
			{
				source: "frames/cart/frame.tsx:2:1",
				className: "",
				path: "design/frames/cart/frame.tsx",
				line: 2,
				refusal: { code: "stale-stamp", says: "the stamp hits nothing" },
			},
		]);
	});

	it("turns away a malformed read and an unknown frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", cartTsx);
		const app = makeApp(spoolDir);
		const source = stampFor(cartTsx, "<main");

		expect((await app.request(`/api/p/${name}/rungs`, jsonPost({ frame: "cart", sources: [] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/rungs`, jsonPost({ frame: "cart", sources: ["nope"] }))).status).toBe(
			400,
		);
		expect((await app.request(`/api/p/${name}/rungs`, jsonPost({ frame: "ghost", sources: [source] }))).status).toBe(
			404,
		);
	});
});
