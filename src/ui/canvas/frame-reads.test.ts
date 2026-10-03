import { expect, it } from "vitest";
import { createFrameReads } from "./frame-reads";

const old = { hash: "old" };
const fresh = { hash: "fresh" };

it("keeps a cover heard while a read was out over that read's older answer", () => {
	const reads = createFrameReads();
	const ticket = reads.ask();
	reads.note("home", fresh);
	expect(reads.settle(ticket, [{ name: "home", cover: old }, { name: "other" }])).toEqual([
		{ name: "home", cover: fresh },
		{ name: "other" },
	]);
});

it("takes a read asked after a cover was heard as it answers", () => {
	const reads = createFrameReads();
	reads.settle(reads.ask(), []);
	reads.note("home", fresh);
	const ticket = reads.ask();
	expect(reads.settle(ticket, [{ name: "home", cover: old }])).toEqual([{ name: "home", cover: old }]);
	// the cover is spent: the next read's answer stands too
	expect(reads.settle(reads.ask(), [{ name: "home", cover: old }])).toEqual([{ name: "home", cover: old }]);
});

it("drops a read that lands after a later one", () => {
	const reads = createFrameReads();
	const first = reads.ask();
	const second = reads.ask();
	expect(reads.settle(second, [{ name: "home", cover: fresh }])).toEqual([{ name: "home", cover: fresh }]);
	expect(reads.settle(first, [{ name: "home", cover: old }])).toBeUndefined();
});
