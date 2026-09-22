import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spool } from "./cli-test-helpers";
import { FOLDER_NAMES_FORMAT } from "./daemon/migrate-frame-names";
import { FORMAT_VERSION } from "./templates";
import { makeProject, makeTempDir, writeDesignFile, writeFrame, writePageFrame } from "./test-helpers";

describe("offline publication checks", () => {
	it("prints the connected set without starting a daemon or checking unrelated drafts", () => {
		const home = makeTempDir();
		const { root } = makeProject(join(home, ".spool"));
		writeFrame(root, "start", 'export default () => <a data-go="journey/next"/>;');
		writePageFrame(root, "journey", "next", 'export default () => <a data-go="start"/>;');
		writeFrame(root, "draft", "broken {{{");
		const result = spool(["check", "--entry", "start"], home, root);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: true,
			entry: "start",
			included: ["start", "journey/next"],
			diagnostics: [],
		});
		expect(existsSync(join(home, ".spool", "daemon.json"))).toBe(false);
	});
	it("takes an entry on a page by its path, and refuses a name that is not a path", () => {
		const home = makeTempDir();
		const { root } = makeProject(join(home, ".spool"));
		writeFrame(root, "start", 'export default () => <a data-go="journey/next"/>;');
		writePageFrame(root, "journey", "next", 'export default () => <a data-go="start"/>;');

		const paged = spool(["check", "--entry", "journey/next"], home, root);
		expect(paged.status, paged.stderr).toBe(0);
		expect(JSON.parse(paged.stdout)).toMatchObject({ ok: true, entry: "journey/next" });

		for (const entry of ["../escape", "journey/.hidden", "journey//next"]) {
			const refused = spool(["check", "--entry", entry], home, root);
			expect(refused.status, entry).not.toBe(0);
			expect(refused.stderr, entry).toContain("a frame is named by its path under design/frames");
		}
	});
	it("renames the walks of a project still naming frames by folder before it checks one", () => {
		const home = makeTempDir();
		const { root } = makeProject(join(home, ".spool"));
		writeDesignFile(root, "canvas.json", `${JSON.stringify({ format: FOLDER_NAMES_FORMAT, history: false })}\n`);
		writeFrame(root, "start", 'export default () => <a data-go="next"/>;');
		writePageFrame(root, "journey", "next", 'export default () => <a data-go="start"/>;');

		const result = spool(["check", "--entry", "start"], home, root);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr).toContain("named by their path now");
		expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, included: ["start", "journey/next"] });
		expect(readFileSync(join(root, "design", "frames", "start", "frame.tsx"), "utf8")).toBe(
			'export default () => <a data-go="journey/next"/>;',
		);
		expect(JSON.parse(readFileSync(join(root, "design", "canvas.json"), "utf8"))).toMatchObject({
			format: FORMAT_VERSION,
		});
	});
	it("returns structured repairs and a failing exit code", () => {
		const home = makeTempDir();
		const { root } = makeProject(join(home, ".spool"));
		writeFrame(root, "start", 'export default () => <a data-go="missing"/>;');
		const result = spool(["check", "--entry", "start"], home, root);
		expect(result.status).toBe(1);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: false,
			diagnostics: [
				{
					code: "target-missing",
					frame: "start",
					path: "frames/start/frame.tsx",
					remedy: expect.stringContaining("missing"),
				},
			],
		});
	});
});

it("builds a portable directory offline and rejects missing explicit scenarios without touching it", {
	timeout: 30_000,
}, () => {
	const home = makeTempDir();
	const { root } = makeProject(join(home, ".spool"));
	writeFrame(root, "start", "export default () => <h1>Exported</h1>");
	const out = join(home, "website");
	const built = spool(["build", "start", "--out", out], home, root, {}, 15_000);
	expect(built.status, built.stderr).toBe(0);
	expect(JSON.parse(built.stdout)).toMatchObject({ entry: "start", included: ["start"] });
	const before = readFileSync(join(out, "manifest.json"), "utf8");
	const failed = spool(["build", "start", "--out", out, "--scenario", "missing"], home, root, {}, 15_000);
	expect(failed.status).toBe(1);
	expect(failed.stderr).toContain('Scenario "missing"');
	expect(readFileSync(join(out, "manifest.json"), "utf8")).toBe(before);
	expect(existsSync(join(home, ".spool", "daemon.json"))).toBe(false);
});
