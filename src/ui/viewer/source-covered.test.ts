import { describe, expect, it } from "vitest";
import { readLive } from "./source";

describe("the project's live address", () => {
	it("reads new covers landing, apart from saves", () => {
		expect(readLive(JSON.stringify({ type: "covered", frames: ["home", 3, "menu"] }))).toEqual({
			type: "covered",
			frames: ["home", "menu"],
		});
		expect(readLive(JSON.stringify({ type: "covered" }))).toBeUndefined();
		expect(readLive(JSON.stringify({ type: "head", head: 4 }))).toEqual({ type: "head", head: 4 });
		expect(readLive(JSON.stringify({ type: "saved", by: "ana" }))).toBeUndefined();
	});
});
