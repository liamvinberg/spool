import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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

	it("mirror into the canvas where frames import them", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const mirror = join(root, "design", "shared", "captures");
		mirrorCaptures(home, mirror);

		for (const name of CAPTURES) {
			expect(readFileSync(join(mirror, `${name}.json`), "utf8"), name).toBe(
				readFileSync(join(home, `${name}.json`), "utf8"),
			);
		}

		// a capture edited at its home reaches the canvas, and nothing else survives
		writeFileSync(join(mirror, "claude-turn.json"), "[]");
		writeFileSync(join(mirror, "stray.json"), "[]");
		mirrorCaptures(home, mirror);
		expect(readFileSync(join(mirror, "claude-turn.json"), "utf8")).toBe(
			readFileSync(join(home, "claude-turn.json"), "utf8"),
		);
		expect(existsSync(join(mirror, "stray.json"))).toBe(false);
	});
});
