import { mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { expect, it } from "vitest";
import { readRegistry, registerProject } from "../registry";
import { makeTempDir } from "../test-helpers";
import { exportProject, importProject, TRANSFER_LIMITS } from "./project-transfer";

function fixture() {
	const root = realpathSync(makeTempDir());
	const spool = makeTempDir();
	const location = makeTempDir();
	const files = {
		"design/canvas.json": JSON.stringify({
			format: 1,
			history: true,
			order: { pages: ["page"], frames: { page: ["one"] } },
			places: { page: { x: 123, y: 456 } },
			runtime: { root: "/private" },
		}),
		"design/frames/page/one/frame.tsx": "export default () => <div>Hello</div>;",
		"design/frames/page/one/frame.json": '{"x":1,"y":2,"w":300,"h":400}',
		"design/shared/scenarios/default.json": '{"state":{"hello":true}}',
		"design/shared/fonts.css": "@font-face {font-family: Test; src:url('./assets/font.woff2')}",
		"design/shared/assets/font.woff2": "font bytes",
		"design/shared/lib/one.ts": "export const one = 1;",
		"design/frames/cache/sessions/frame.tsx": "export default () => <div>Session</div>;",
		"design/shared/threads/stills/verify.ts": "export const authored = true;",
		"design/shared/importmap.json": '{"imports":{}}',
	};
	for (const [path, bytes] of Object.entries(files)) {
		const full = join(root, path);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, bytes);
	}
	registerProject(spool, root);
	return { root, spool, location, files };
}
function archive(files: Record<string, Uint8Array>, changes: Record<string, unknown> = {}) {
	return zipSync({
		...files,
		"spool-manifest.json": Buffer.from(
			JSON.stringify({ format: "spool-project", version: 1, name: "copy", files: Object.keys(files), ...changes }),
		),
	});
}
const marker = { "design/canvas.json": Buffer.from('{"format":1}') };

it("round-trips authored bytes and organization, excludes local state, and always reserves separate copies", async () => {
	const f = fixture();
	for (const path of [
		"src/secret.ts",
		"design/.spool/state.json",
		"design/shared/.env",
		"design/shared/node_modules/package/index.js",
		"design/.spool/credentials/token.json",
	]) {
		mkdirSync(join(f.root, path, ".."), { recursive: true });
		writeFileSync(join(f.root, path), "private");
	}
	mkdirSync(join(f.root, "design/frames/empty"));
	const bytes = await exportProject(f.root, f.spool);
	const contents = unzipSync(bytes);
	expect(Object.keys(contents).sort()).toEqual([...Object.keys(f.files), "spool-manifest.json"].sort());
	const [first, second] = await Promise.all([
		importProject(bytes, f.location, f.spool),
		importProject(bytes, f.location, f.spool),
	]);
	expect(first.root).not.toBe(second.root);
	expect(readdirSync(join(first.root, "design/frames/empty"))).toEqual([]);
	for (const [path, content] of Object.entries(f.files))
		if (!path.endsWith("canvas.json")) expect(readFileSync(join(first.root, path), "utf8")).toBe(content);
	expect(JSON.parse(readFileSync(join(first.root, "design/canvas.json"), "utf8"))).toEqual({
		format: 1,
		history: false,
		order: { pages: { "": ["page"] }, frames: { page: ["one"] } },
		places: { page: { x: 123, y: 456 } },
	});
	expect(readRegistry(f.spool).projects).toHaveLength(3);
	expect(readdirSync(f.location)).toHaveLength(2);
});

it.each([
	"../outside",
	"/absolute",
	"design/shared/../escape",
	"design/shared/a\\b",
	"design/shared/.env",
	"design/shared/.credentials/token",
	"design/shared/node_modules/code.js",
])("rejects unsafe or nonportable entry %s before any install", async (path) => {
	const location = makeTempDir(),
		spool = makeTempDir();
	await expect(importProject(archive({ ...marker, [path]: Buffer.from("x") }), location, spool)).rejects.toThrow();
	expect(readdirSync(location)).toEqual([]);
	expect(readRegistry(spool).projects).toEqual([]);
});
it.each([{ version: 2 }, { format: "zip" }, { files: [] }, { files: ["design/canvas.json", "design/canvas.json"] }])(
	"rejects unsupported or inconsistent manifests %j",
	async (changes) => {
		const location = makeTempDir(),
			spool = makeTempDir();
		await expect(importProject(archive(marker, changes), location, spool)).rejects.toThrow();
		expect(readdirSync(location)).toEqual([]);
	},
);
it("rejects corrupt checksums, symlinks, special entries and case-colliding paths", async () => {
	const location = makeTempDir(),
		spool = makeTempDir();
	const original = Buffer.from(archive(marker));
	const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
	for (const mode of [0xa000, 0x1000, 0x4000]) {
		const bytes = Buffer.from(original);
		bytes.writeUInt32LE((mode << 16) >>> 0, central + 38);
		await expect(importProject(bytes, location, spool)).rejects.toThrow();
	}
	for (const offset of [14, 18, 22]) {
		const mismatch = Buffer.from(original);
		mismatch.writeUInt32LE(123, offset);
		await expect(importProject(mismatch, location, spool)).rejects.toThrow(/corrupt/);
	}
	const corrupt = Buffer.from(original);
	corrupt.writeUInt32LE(123, central + 16);
	await expect(importProject(corrupt, location, spool)).rejects.toThrow(/corrupt/);
	await expect(
		importProject(
			archive({ ...marker, "design/shared/A/a.ts": Buffer.from("a"), "design/shared/a/b.ts": Buffer.from("b") }),
			location,
			spool,
		),
	).rejects.toThrow(/colliding/);
	expect(readdirSync(location)).toEqual([]);
});
it("enforces each named size limit at the boundary", async () => {
	const bytes = archive(marker);
	const expanded = Object.values(unzipSync(bytes)).reduce((total, content) => total + content.length, 0);
	for (const [key, value] of [
		["compressedBytes", bytes.length],
		["expandedBytes", expanded],
		["entries", 2],
	] as const) {
		const location = makeTempDir(),
			spool = makeTempDir();
		await expect(
			importProject(bytes, location, spool, undefined, { ...TRANSFER_LIMITS, [key]: value - 1 }),
		).rejects.toThrow();
		expect(readdirSync(location)).toEqual([]);
		await expect(
			importProject(bytes, location, spool, undefined, { ...TRANSFER_LIMITS, [key]: value }),
		).resolves.toHaveProperty("root");
	}
});
it("cleans up cancelled imports and registry write failures", async () => {
	const location = makeTempDir(),
		spool = makeTempDir();
	const controller = new AbortController();
	controller.abort();
	await expect(importProject(archive(marker), location, spool, controller.signal)).rejects.toThrow();
	expect(readdirSync(location)).toEqual([]);
	writeFileSync(join(spool, "registry.json"), "invalid");
	await expect(importProject(archive(marker), location, spool)).rejects.toThrow();
	expect(readdirSync(location)).toEqual([]);
});
it("refuses symlinks instead of reading outside the project", async () => {
	const f = fixture();
	symlinkSync(join(f.root, "design/canvas.json"), join(f.root, "design/shared/leak.json"));
	await expect(exportProject(f.root, f.spool)).rejects.toThrow(/symbolic link/);
});
