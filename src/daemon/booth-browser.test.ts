import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it } from "vitest";
import { headlessShellArgs } from "../headless-shell";
import { serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { imageSize } from "./thumbs";

/**
 * The photo booth against a really-served daemon and the pinned headless shell
 * (#12). No canvas is ever opened here: every cover is the daemon's own work,
 * which is the whole of what the booth changed. On a machine without the
 * shell the test returns early rather than fetching ninety megabytes.
 */

async function shellAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({
			channel: "chromium-headless-shell",
			headless: true,
			args: headlessShellArgs(),
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

const frameOf = (colour: string, extra = "") => `export default function Frame() {
	${extra}
	return <main style={{ background: "${colour}", width: "100%", height: "100vh" }}>booth</main>;
}
`;

async function served() {
	const project = await serveProject();
	const control = { headers: { "X-Spool-Control": project.controlToken } };
	const projection = async () => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, control);
		return (await res.json()) as { frames: { name: string; cover?: { hash: string } }[] };
	};
	const coverOf = async (frame: string) => (await projection()).frames.find((entry) => entry.name === frame)?.cover;
	const image = async (frame: string, hash: string) => {
		const res = await fetch(
			`${project.url}/covers/${encodeURIComponent(project.name)}/${encodeURIComponent(frame)}/${hash}`,
		);
		return { type: res.headers.get("content-type"), bytes: new Uint8Array(await res.arrayBuffer()) };
	};
	const captureError = (frame: string) => {
		const file = join(project.root, "design", ".spool", "thumbs", encodeURIComponent(frame), "error.json");
		return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { error: string }).error : undefined;
	};
	return { ...project, projection, coverOf, image, captureError };
}

it("covers a frame a read finds uncovered, with nothing open", { timeout: 60_000 }, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	writeFrame(project.root, "cover-me", frameOf("#f5391a"));

	// the read that finds no cover is the read that asks for one
	expect(await project.coverOf("cover-me")).toBeUndefined();
	await expect
		.poll(() => project.coverOf("cover-me"), { timeout: 45_000 })
		.toMatchObject({ hash: expect.any(String) });

	const cover = await project.coverOf("cover-me");
	const image = await project.image("cover-me", cover?.hash ?? "");
	// bounded and lossy, sharp at the live threshold (#8): the default 1440 x 900 footprint at 800 wide
	expect(image.type).toBe("image/jpeg");
	expect(imageSize(image.bytes)).toEqual({ width: 800, height: 500 });
});

it("photographs an edit, a resize and a broken frame without a canvas, and leaves a move alone", {
	timeout: 120_000,
}, async () => {
	if (!(await shellAvailable())) return;
	const project = await served();
	writeFrame(project.root, "edited", frameOf("#f5391a"));
	writeDesignFile(project.root, "frames/edited/frame.json", `${JSON.stringify({ x: 0, y: 0, w: 390, h: 844 })}\n`);
	await project.projection();
	await expect.poll(() => project.coverOf("edited"), { timeout: 45_000 }).toBeDefined();
	const first = (await project.coverOf("edited"))?.hash;
	expect(imageSize((await project.image("edited", first ?? "")).bytes)).toEqual({ width: 800, height: 1731 });

	// an agent's edit to the file is a picture owed, whether or not anyone is looking
	writeFrame(project.root, "edited", frameOf("#1a39f5"));
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(first);
	const edited = (await project.coverOf("edited"))?.hash;

	// a move rewrites the sidecar and owes nothing; give the booth time to be wrong
	writeDesignFile(project.root, "frames/edited/frame.json", `${JSON.stringify({ x: 400, y: 120, w: 390, h: 844 })}\n`);
	await new Promise((done) => setTimeout(done, 3000));
	expect((await project.coverOf("edited"))?.hash).toBe(edited);

	// a resize is: the stored picture has the old size's layout and shape
	writeDesignFile(
		project.root,
		"frames/edited/frame.json",
		`${JSON.stringify({ x: 400, y: 120, w: 1200, h: 800 })}\n`,
	);
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(edited);
	const resized = (await project.coverOf("edited"))?.hash ?? "";
	expect(imageSize((await project.image("edited", resized)).bytes)).toEqual({ width: 800, height: 533 });

	// a broken compile keeps the last good picture and says why beside it (#173)
	writeFrame(project.root, "edited", "export default function Frame() { return <main>unclosed;\n}\n");
	await expect.poll(() => project.captureError("edited"), { timeout: 30_000 }).toContain("Unexpected end of file");
	expect((await project.coverOf("edited"))?.hash).toBe(resized);

	// a frame that throws as it boots is recorded as one, with its own words
	writeFrame(project.root, "thrower", 'export default function Frame() { throw new Error("boom on boot"); }\n');
	await project.projection();
	await expect
		.poll(() => project.captureError("thrower"), { timeout: 30_000 })
		.toBe("threw on boot: Error: boom on boot");
	expect(await project.coverOf("thrower")).toBeUndefined();

	// and the next good edit retires the reason with the picture it lands
	writeFrame(project.root, "edited", frameOf("#11aa11"));
	await expect.poll(async () => (await project.coverOf("edited"))?.hash, { timeout: 30_000 }).not.toBe(resized);
	expect(project.captureError("edited")).toBeUndefined();
});
