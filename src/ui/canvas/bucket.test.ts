import { describe, expect, it } from "vitest";
import { bucketOf } from "./bucket";

describe("bucketOf", () => {
	it("puts a name in the same bucket every time", () => {
		expect(bucketOf("n200/n200-001", 4)).toBe(bucketOf("n200/n200-001", 4));
	});

	it("spreads a page of names over every bucket", () => {
		const counts = [0, 0, 0, 0];
		for (let i = 0; i < 200; i++) {
			const bucket = bucketOf(`n200/n200-${String(i).padStart(3, "0")}`, 4);
			counts[bucket] = (counts[bucket] ?? 0) + 1;
		}
		for (const count of counts) expect(count).toBeGreaterThan(30);
	});

	it("has one bucket to give when asked for none", () => {
		expect(bucketOf("anything", 0)).toBe(0);
	});
});
