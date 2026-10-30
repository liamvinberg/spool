import { describe, expect, it } from "vitest";
import { assignShards, mergeReports, parseDurations } from "./test-shards.ts";

const files = Array.from({ length: 40 }, (_, i) => `src/f${i}.test.ts`);
const durations = Object.fromEntries(files.map((file, i) => [file, (i * 7) % 23]));

describe("test shards", () => {
	it("deals every file to exactly one shard, the same way whatever order the files come in", () => {
		for (const table of [durations, {}]) {
			const shards = assignShards(files, table, 8);
			expect(shards.flat().sort()).toEqual([...files].sort());
			expect(assignShards([...files].reverse(), table, 8)).toEqual(shards);
		}
	});

	it("evens the shards out by time, the long files spread rather than stacked", () => {
		const table = { "src/long.test.ts": 100, "src/longer.test.ts": 120, ...durations };
		const shards = assignShards(Object.keys(table), table, 4);
		const loads = shards.map((shard) => shard.reduce((sum, file) => sum + (table[file] ?? 0) + 1.5, 0));
		expect(shards.findIndex((shard) => shard.includes("src/long.test.ts"))).not.toBe(
			shards.findIndex((shard) => shard.includes("src/longer.test.ts")),
		);
		// No shard further ahead than the longest short file it could have handed on.
		expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(22 + 1.5);
	});

	it("guesses a file the last run didn't have from its kind", () => {
		const [withBrowser] = assignShards(["src/a.test.ts", "src/b.test.ts", "src/new-browser.test.ts"], {}, 2);
		expect(withBrowser).toEqual(["src/new-browser.test.ts"]);
	});

	it("reads the shards' reports into one table from the repository root, wherever they ran", () => {
		const report = (root: string) => ({
			testResults: [{ name: `${root}/src/daemon/x.test.ts`, startTime: 1000, endTime: 3_456 }],
		});
		const merged = mergeReports([report("/runner/spool"), report("/elsewhere/checkout")], "/runner/spool");
		expect(merged).toEqual({ "src/daemon/x.test.ts": 2.5 });
		expect(mergeReports([report("/runner/spool"), { testResults: [] }, {}], "/runner/spool")).toEqual(merged);
	});

	it("takes anything but a table of numbers as no table", () => {
		for (const handed of [undefined, "", "not json", "[1]", "null", '"text"'])
			expect(parseDurations(handed)).toEqual({});
		expect(parseDurations('{"src/a.test.ts": 3, "src/b.test.ts": "slow"}')).toEqual({ "src/a.test.ts": 3 });
	});
});
