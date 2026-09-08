import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { base64Length, identifierHint, inlinedSize, listAssets, overBudget, specifierFrom } from "./hand-asset";
import { fingerprintOf } from "./hand-write";

/** Asset listing/budget utilities and the retired writer boundary. Actual source
 * transactions are exercised by source-image-owner and source-image-browser. */

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

it("does not expose the retired fingerprint-based asset source writer", async () => {
	const { root, name, app, source } = project();
	const response = await app.request(
		`/api/p/${name}/asset`,
		jsonPost({
			frame: "hero",
			source,
			fingerprint: fingerprintOf(FRAME),
			file: { name: "shot.png", data: PNG.toString("base64") },
		}),
	);
	expect(response.status).toBe(404);
	expect(readFrame(root)).toBe(FRAME);
	expect(existsSync(join(root, "design/frames/hero/shot.png"))).toBe(false);
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
		// the `data:` head rides in front of the base64, so a file at the ceiling
		// is already over it
		expect(inlinedSize(3 * 1024)).toBe(4 * 1024 + "data:image/svg+xml;base64,".length);
		expect(overBudget(inlinedSize(1024))).toBeUndefined();
		expect(overBudget(inlinedSize(512 * 1024))?.code).toBe("image-budget");
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
