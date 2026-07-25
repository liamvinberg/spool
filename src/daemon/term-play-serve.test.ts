import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureTermExecutor, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { terminalSourceVersion } from "./term-source";

/**
 * The old player restart route remains shape-compatible while terminal frames
 * are static, but it cannot start a project process.
 */

describe("the terminal restart endpoint", () => {
	it("refuses restart while terminal execution has no OS sandbox", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, renderUrl, controlToken } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		writeDesignFile(
			root,
			join(".spool", "term", "dash.screen"),
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "persisted screen",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);

		const play = await fetch(`${renderUrl}/play/${encodeURIComponent(name)}?frame=dash`);
		expect(play.status).toBe(200);
		expect(spawned).toHaveLength(0);

		const res = await fetch(`${url}/api/p/${name}/term/dash/restart`, {
			method: "POST",
			headers: { "X-Spool-Control": controlToken },
		});
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("terminal execution is disabled");
		expect(spawned).toHaveLength(0);
	});

	it("404s an html frame, a ghost frame, and an unknown project", async () => {
		const { executor } = fixtureTermExecutor();
		const { root, name, url, controlToken } = await serveProject({ termExecutor: executor });
		writeFrame(root, "menu", "export default () => null;\n");

		const headers = { "X-Spool-Control": controlToken };
		expect((await fetch(`${url}/api/p/${name}/term/menu/restart`, { method: "POST", headers })).status).toBe(404);
		expect((await fetch(`${url}/api/p/${name}/term/ghost/restart`, { method: "POST", headers })).status).toBe(404);
		expect((await fetch(`${url}/api/p/nowhere/term/dash/restart`, { method: "POST", headers })).status).toBe(404);
	});
});
