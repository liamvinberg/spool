import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { base64Length, identifierHint, listAssets, overBudget, specifierFrom } from "./hand-asset";
import { fingerprintOf } from "./hand-write";

/**
 * The asset swap end to end (#260): the picture lands in the project, the
 * import is written, and the `src` points at it.
 *
 * The one hand edit that writes a file, because an image in a frame is an
 * import and never a URL — so the whole of the op is the bytes, the import and
 * the splice, and the refusals are about all three.
 */

/** A one-pixel PNG, which is the smallest honest picture to drop on a frame. */
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

const FRAME = `export default function Frame() {
	return <img src="/hero.png" alt="hero" />;
}
`;

/** The stamp the compiler mints for the element this snippet opens. */
function stamp(source: string, snippet: string, rel: string): string {
	const at = source.indexOf(snippet);
	const before = source.slice(0, at);
	return `${rel}:${before.split("\n").length}:${at - (before.lastIndexOf("\n") + 1) + 1}`;
}

function jsonPost(body: unknown): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function project(frame = FRAME) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeFrame(root, "hero", frame);
	return { root, name, app: makeApp(spoolDir), source: stamp(frame, "<img", "frames/hero/frame.tsx") };
}

function readFrame(root: string): string {
	return readFileSync(join(root, "design/frames/hero/frame.tsx"), "utf8");
}

function put(root: string, rel: string, bytes: Buffer): void {
	const file = join(root, "design", rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, bytes);
}

describe("the asset swap", () => {
	it("writes the file beside the frame, writes the import, and points src at it", async () => {
		const { root, name, app, source } = project();
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(FRAME),
				file: { name: "shot.png", data: PNG.toString("base64") },
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; asset: string };
		expect(body.ok).toBe(true);
		expect(body.asset).toBe("design/frames/hero/shot.png");
		expect(readFileSync(join(root, "design/frames/hero/shot.png"))).toEqual(PNG);
		expect(readFrame(root)).toBe(
			`import shot from "./shot.png";\nexport default function Frame() {\n\treturn <img src={shot} alt="hero" />;\n}\n`,
		);
	});

	it("points at a picture the project already holds without writing a second copy", async () => {
		const { root, name, app, source } = project();
		put(root, "shared/assets/logo.svg", Buffer.from("<svg/>"));
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({ frame: "hero", source, fingerprint: fingerprintOf(FRAME), asset: "shared/assets/logo.svg" }),
		);
		expect(res.status).toBe(200);
		expect(readFrame(root)).toContain('import logo from "../../shared/assets/logo.svg";');
		expect(readFrame(root)).toContain('<img src={logo} alt="hero" />');
		expect(existsSync(join(root, "design/frames/hero/logo.svg"))).toBe(false);
	});

	it("keeps one file when the same picture is dropped twice", async () => {
		const { root, name, app } = project();
		const drop = async () => {
			const held = readFrame(root);
			return app.request(
				`/api/p/${name}/asset`,
				jsonPost({
					frame: "hero",
					source: stamp(held, "<img", "frames/hero/frame.tsx"),
					fingerprint: fingerprintOf(held),
					file: { name: "shot.png", data: PNG.toString("base64") },
				}),
			);
		};
		await drop();
		const second = (await (await drop()).json()) as { asset: string };
		expect(second.asset).toBe("design/frames/hero/shot.png");
		expect(existsSync(join(root, "design/frames/hero/shot-2.png"))).toBe(false);
	});

	it("gives a different picture with the same name a number of its own", async () => {
		const { root, name, app, source } = project();
		put(root, "frames/hero/shot.png", Buffer.from("another picture entirely"));
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(FRAME),
				file: { name: "shot.png", data: PNG.toString("base64") },
			}),
		);
		expect(((await res.json()) as { asset: string }).asset).toBe("design/frames/hero/shot-2.png");
		expect(readFileSync(join(root, "design/frames/hero/shot.png"), "utf8")).toBe("another picture entirely");
	});

	it("refuses a picture one document cannot carry, and writes nothing", async () => {
		const { root, name, app, source } = project();
		const huge = Buffer.alloc(600 * 1024, 7);
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(FRAME),
				file: { name: "huge.png", data: huge.toString("base64") },
			}),
		);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { refusal: { code: string } }).refusal.code).toBe("image-budget");
		expect(existsSync(join(root, "design/frames/hero/huge.png"))).toBe(false);
		expect(readFrame(root)).toBe(FRAME);
	});

	it("refuses a computed src and names it", async () => {
		const frame = `export default function Frame({ photo }) {\n\treturn <img src={photo} />;\n}\n`;
		const { root, name, app, source } = project(frame);
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(frame),
				file: { name: "shot.png", data: PNG.toString("base64") },
			}),
		);
		expect(res.status).toBe(409);
		expect((await res.json()) as unknown).toMatchObject({
			refusal: { code: "expression-attribute", says: "src is an expression", expression: "{photo}" },
		});
		expect(readFrame(root)).toBe(frame);
	});

	it("refuses a file the compiler has no loader for", async () => {
		const { name, app, source } = project();
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(FRAME),
				file: { name: "clip.mp4", data: PNG.toString("base64") },
			}),
		);
		expect(res.status).toBe(400);
	});

	it("refuses a file the swap was not formed against", async () => {
		const { name, app, source } = project();
		const res = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf("something else"),
				file: { name: "shot.png", data: PNG.toString("base64") },
			}),
		);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { refusal: { code: string } }).refusal.code).toBe("stale-file");
	});

	it("puts the file back through the same revert every other hand edit uses", async () => {
		const { root, name, app, source } = project();
		const swap = await app.request(
			`/api/p/${name}/asset`,
			jsonPost({
				frame: "hero",
				source,
				fingerprint: fingerprintOf(FRAME),
				file: { name: "shot.png", data: PNG.toString("base64") },
			}),
		);
		const { undo } = (await swap.json()) as { undo: unknown };
		const back = await app.request(`/api/p/${name}/patch/revert`, jsonPost(undo));
		expect(back.status).toBe(200);
		expect(readFrame(root)).toBe(FRAME);
	});
});

describe("the imports a swap may choose from", () => {
	it("serves one frame's own listing, and refuses to be asked about no frame", async () => {
		const { root, name, app } = project();
		put(root, "frames/hero/beside.png", PNG);
		const res = await app.request(`/api/p/${name}/assets?frame=hero`);
		expect(res.status).toBe(200);
		expect((await res.json()) as unknown).toEqual({
			assets: [{ path: "frames/hero/beside.png", bytes: PNG.length }],
		});

		expect((await app.request(`/api/p/${name}/assets`)).status).toBe(400);
		expect((await app.request(`/api/p/${name}/assets?frame=ghost`)).status).toBe(404);
	});

	it("offers what sits beside the frame and what shared/assets holds, and nothing else", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeFrame(root, "hero", FRAME);
		writeFrame(root, "cart", FRAME);
		put(root, "frames/hero/beside.png", PNG);
		put(root, "frames/cart/elsewhere.png", PNG);
		put(root, "shared/assets/logo.svg", Buffer.from("<svg/>"));
		put(root, "shared/assets/fonts/local.woff2", Buffer.from("not a picture"));
		expect(listAssets(root, join(root, "design/frames/hero")).map((asset) => asset.path)).toEqual([
			"frames/hero/beside.png",
			"shared/assets/logo.svg",
		]);
	});
});

describe("what the swap works out before it writes", () => {
	it("weighs a file as the characters the compiler will write for it", () => {
		expect(base64Length(3)).toBe(4);
		expect(overBudget(1024)).toBeUndefined();
		expect(overBudget(512 * 1024)?.code).toBe("image-budget");
	});

	it("mints an identifier an author would have typed", () => {
		expect(identifierHint("cart-hero.png")).toBe("cartHero");
		expect(identifierHint("2x.png")).toBe("image2x");
		expect(identifierHint("logo.svg")).toBe("logo");
	});

	it("spells the specifier the way a relative import reads", () => {
		expect(specifierFrom("/p/design/frames/hero/frame.tsx", "/p/design/frames/hero/shot.png")).toBe("./shot.png");
		expect(specifierFrom("/p/design/frames/hero/frame.tsx", "/p/design/shared/assets/logo.svg")).toBe(
			"../../shared/assets/logo.svg",
		);
	});
});
