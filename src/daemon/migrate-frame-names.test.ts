import { existsSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	makeApp,
	makeProject,
	makeTempDir,
	markProject,
	writeDesignFile,
	writeFrame,
	writePageFrame,
} from "../test-helpers";
import { readCanvasFields } from "./canvas-file";
import { FOLDER_NAMES_FORMAT, migrateFrameNames } from "./migrate-frame-names";
import { frameDirectories } from "./projection";
import { unseenNow } from "./seen";
import { coverDir } from "./thumbs";

/** A project the way a format-1 spool left it: frames named by folder alone. */
function legacyProject(root = join(makeTempDir(), "project")): string {
	markProject(root);
	const canvas = join(root, "design", "canvas.json");
	const fields = JSON.parse(readFileSync(canvas, "utf8")) as Record<string, unknown>;
	writeFileSync(canvas, `${JSON.stringify({ ...fields, format: FOLDER_NAMES_FORMAT, order: { frames: {} } })}\n`);
	return root;
}

const read = (root: string, rel: string) => readFileSync(join(root, "design", rel), "utf8");

describe("migrating a project named by folder", () => {
	it("writes every walk at its frame's path and stamps the project current", () => {
		const root = legacyProject();
		writeFrame(root, "home", `export default () => <a data-go="checkout">buy</a>;\n`);
		writePageFrame(root, "shop", "checkout", `export default () => <a data-go="receipt">pay</a>;\n`);
		writePageFrame(root, "shop/done", "receipt", `export default () => <a data-go="home">home</a>;\n`);
		writeDesignFile(root, "shared/nav.tsx", `export const Nav = () => <a data-go="receipt">receipt</a>;\n`);

		const done = migrateFrameNames(root);

		expect(done).toEqual({
			files: ["frames/home/frame.tsx", "frames/shop/checkout/frame.tsx", "shared/nav.tsx"],
			ambiguous: [],
		});
		expect(read(root, "frames/home/frame.tsx")).toContain(`data-go="shop/checkout"`);
		expect(read(root, "frames/shop/checkout/frame.tsx")).toContain(`data-go="shop/done/receipt"`);
		// a frame on the root page already answers to its folder name
		expect(read(root, "frames/shop/done/receipt/frame.tsx")).toContain(`data-go="home"`);
		expect(read(root, "shared/nav.tsx")).toContain(`data-go="shop/done/receipt"`);
		expect(readCanvasFields(root)).toMatchObject({ format: 2, order: { frames: {} } });
	});

	it("runs once, and a second run finds nothing to do", () => {
		const root = legacyProject();
		writePageFrame(root, "shop", "checkout", `export default () => <p>checkout</p>;\n`);
		writeFrame(root, "home", `export default () => <a data-go="checkout">buy</a>;\n`);

		expect(migrateFrameNames(root)?.files).toEqual(["frames/home/frame.tsx"]);
		expect(migrateFrameNames(root)).toBeUndefined();
		expect(read(root, "frames/home/frame.tsx")).toContain(`data-go="shop/checkout"`);
	});

	it("leaves a folder name two frames share as written, and names it", () => {
		const root = legacyProject();
		writePageFrame(root, "spool", "buttons", `export default () => <p>spool</p>;\n`);
		writePageFrame(root, "vercel", "buttons", `export default () => <p>vercel</p>;\n`);
		writeFrame(root, "home", `export default () => <a data-go="buttons">buttons</a>;\n`);

		expect(migrateFrameNames(root)).toEqual({ files: [], ambiguous: ["buttons"] });
		expect(read(root, "frames/home/frame.tsx")).toContain(`data-go="buttons"`);
	});

	it("carries a nested frame's covers to its path", () => {
		const root = legacyProject();
		writePageFrame(root, "shop", "checkout", `export default () => <p>checkout</p>;\n`);
		writeDesignFile(root, ".spool/thumbs/checkout/0123456789abcdef0123456789abcdef.png", "png");

		migrateFrameNames(root);

		expect(existsSync(join(coverDir(root, "shop/checkout"), "0123456789abcdef0123456789abcdef.png"))).toBe(true);
	});

	it("keeps a nested frame seen when its own walks are rewritten", () => {
		const root = legacyProject();
		writePageFrame(root, "shop", "checkout", `export default () => <a data-go="receipt">pay</a>;\n`);
		writePageFrame(root, "shop", "receipt", `export default () => <p>receipt</p>;\n`);
		const past = new Date(Date.now() - 60_000);
		utimesSync(join(root, "design", "frames", "shop", "checkout", "frame.tsx"), past, past);
		writeDesignFile(
			root,
			".spool/seen.json",
			`${JSON.stringify({ version: 1, frames: { checkout: past.getTime() + 1000, receipt: Date.now() + 60_000 } })}\n`,
		);

		migrateFrameNames(root);

		const frames = [...frameDirectories(root)].map(([name, dir]) => ({ name, dir }));
		expect(read(root, "frames/shop/checkout/frame.tsx")).toContain(`data-go="shop/receipt"`);
		expect(unseenNow(root, frames).get("shop/checkout")).toBeUndefined();
	});

	it("drops what was stored under a folder name two frames share, since its owner is unknowable", () => {
		const root = legacyProject();
		writeFrame(root, "buttons", `export default () => <p>root</p>;\n`);
		writePageFrame(root, "shop", "buttons", `export default () => <p>shop</p>;\n`);
		writeDesignFile(root, ".spool/thumbs/buttons/0123456789abcdef0123456789abcdef.png", "png");

		migrateFrameNames(root);

		expect(existsSync(coverDir(root, "buttons"))).toBe(false);
	});

	it("leaves a project already on the current format exactly alone", () => {
		const root = join(makeTempDir(), "project");
		markProject(root);
		writePageFrame(root, "shop", "checkout", `export default () => <p>checkout</p>;\n`);
		writeFrame(root, "home", `export default () => <a data-go="checkout">buy</a>;\n`);

		expect(migrateFrameNames(root)).toBeUndefined();
		expect(read(root, "frames/home/frame.tsx")).toContain(`data-go="checkout"`);
	});
});

describe("when the migration runs", () => {
	it("runs on the daemon's first read of the project", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		legacyProject(root);
		writePageFrame(root, "shop", "checkout", `export default () => <p>checkout</p>;\n`);
		writeFrame(root, "home", `export default () => <a data-go="checkout">buy</a>;\n`);
		const app = makeApp(spoolDir);

		const flows = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			edges: { from: string; to: string; missing?: true }[];
		};

		expect(flows.edges).toEqual([expect.objectContaining({ from: "home", to: "shop/checkout" })]);
		expect(flows.edges[0]?.missing).toBeUndefined();
	});
});
