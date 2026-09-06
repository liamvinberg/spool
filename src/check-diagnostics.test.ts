import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeFrame } from "./test-helpers";

describe("design diagnostic reporting", () => {
	it("sorts diagnostics by code units independently of locale", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "z", "missingZ;\n");
		writeFrame(root, "ä", "missingA;\n");

		expect(messages(root).map((message) => message.split(":")[0])).toEqual([
			"design/frames/z/frame.tsx",
			"design/frames/ä/frame.tsx",
		]);
	});

	it.each([
		["LF", "\n"],
		["CRLF", "\r\n"],
		["CR", "\r"],
		["Unicode line separator", "\u2028"],
		["Unicode paragraph separator", "\u2029"],
	])("reports exact positions after a $name line break", (_, lineBreak) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `const before = 1;${lineBreak}missingName;\n`);

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:2:1 TS2304: Cannot find name 'missingName'."]);
	});

	it("counts diagnostic columns in UTF-16 code units", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'const value = "😀"; missingName;\n');

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:1:21 TS2304: Cannot find name 'missingName'."]);
	});

	it("preserves distinct diagnostic identities when paths contain whitespace controls", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "bad name", "missing;\n");
		writeFrame(root, "bad\nname", "missing;\n");

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.stringContaining("design/frames/bad\\u000aname/frame.tsx"),
				expect.stringContaining("design/frames/bad name/frame.tsx"),
			]),
		);
		expect(result.every((message) => !message.includes("\n"))).toBe(true);
	});

	it("escapes terminal controls and Unicode line separators visibly", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "bad\u007f\u0085\u2028\u2029name", "missing;\n");

		const [message] = messages(root);

		expect(message).toContain("bad\\u007f\\u0085\\u2028\\u2029name");
		for (const character of ["\u007f", "\u0085", "\u2028", "\u2029"]) {
			expect(message).not.toContain(character);
		}
	});

	it("preserves ordinary backslashes in displayed diagnostics", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import value from "pkg\\\\name";\nvoid value;\n');

		const [message] = messages(root);

		expect(message).toContain("Cannot find module 'pkg\\name'");
		expect(message).not.toContain("Cannot find module 'pkg\\\\name'");
	});

	it("flattens diagnostic chains and sanitizes display paths", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"bad\n\u001bname",
			"function choose(value: string): string;\nfunction choose(value: number): number;\nfunction choose(value: string | number) { return value; }\nchoose(true);\n",
		);

		const [message] = messages(root);

		expect(message).toContain("TS2769: No overload matches this call.");
		expect(message).toContain("The last overload gave the following error.");
		expect(message).toContain("Argument of type 'boolean' is not assignable");
		expect(message).not.toContain("\n");
		expect(message).not.toContain("\u001b");
		expect(message).not.toContain(root);
	});

	it("sanitizes control characters decoded from module specifiers", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import missing from "missing\\n\\x1bmodule";\nvoid missing;\n');

		const [message] = messages(root);

		expect(message).toContain("TS2307");
		expect(message).not.toContain("\n");
		expect(message).not.toContain("\u001b");
		expect(message).toContain("\\u001b");
	});
});
