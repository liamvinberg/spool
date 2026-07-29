import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFixture } from "./daemon/project-files";
import { mirrorCaptures } from "./dev-captures";
import { CAPTURES, makeProject, makeTempDir } from "./test-helpers";

/** The tracked home, named the way any shipped reader has to name it (#190). */
const home = fileURLToPath(new URL("../fixtures/captures", import.meta.url));

describe("the agent captures", () => {
	it("are read from the repo's own home rather than the canvas", () => {
		for (const name of CAPTURES) {
			const events = JSON.parse(readFileSync(join(home, `${name}.json`), "utf8")) as { type?: string }[];
			expect(events.length, name).toBeGreaterThan(0);
			expect(
				events.some((event) => event.type === "system"),
				name,
			).toBe(true);
		}
	});

	it("mirror into the canvas where its fixtures convention serves them", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const mirror = join(root, "design", "shared", "fixtures", "captures");
		mirrorCaptures(home, mirror);

		for (const name of CAPTURES) {
			const served = readFixture(root, `captures/${name}`);
			expect(served.kind, name).toBe("ok");
			expect(served.kind === "ok" && served.json).toBe(readFileSync(join(home, `${name}.json`), "utf8"));
		}

		// a capture edited at its home reaches the canvas, and nothing else survives
		writeFileSync(join(mirror, "claude-turn.json"), "[]");
		writeFileSync(join(mirror, "stray.json"), "[]");
		mirrorCaptures(home, mirror);
		const turn = readFixture(root, "captures/claude-turn");
		expect(turn.kind === "ok" && turn.json).toBe(readFileSync(join(home, "claude-turn.json"), "utf8"));
		expect(readFixture(root, "captures/stray").kind).toBe("missing");
	});
});
