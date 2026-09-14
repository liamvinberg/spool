import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spool } from "./cli-test-helpers";
import { makeProject, makeTempDir, writeFrame, writePageFrame } from "./test-helpers";

describe("offline publication checks", () => {
	it("prints the connected set without starting a daemon or checking unrelated drafts", () => {
		const home = makeTempDir();
		const { root } = makeProject(join(home, ".spool"));
		writeFrame(root, "start", 'export default () => <a data-go="next"/>;');
		writePageFrame(root, "journey", "next", 'export default () => <a data-go="start"/>;');
		writeFrame(root, "draft", "broken {{{");
		const result = spool(["check", "--entry", "start"], home, root);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: true,
			entry: "start",
			included: ["start", "next"],
			diagnostics: [],
		});
		expect(existsSync(join(home, ".spool", "daemon.json"))).toBe(false);
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
