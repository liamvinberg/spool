import { describe, expect, it } from "vitest";
import { withoutComments } from "./check-alt";

describe("withoutComments", () => {
	it("blanks comments and keeps strings and lines where they were", () => {
		const source = [
			'const a = "// not a comment"; // altKey',
			"/* altKey",
			"   still */ const b = `/* nor this */`;",
			"const c = 'it\\'s'; // gone",
		].join("\n");
		expect(withoutComments(source).split("\n")).toEqual([
			'const a = "// not a comment"; ',
			"         ",
			"            const b = `/* nor this */`;",
			"const c = 'it\\'s'; ",
		]);
	});
});
