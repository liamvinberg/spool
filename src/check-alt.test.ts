import { describe, expect, it } from "vitest";
import { altReaders, withoutComments } from "./check-alt";
import { makeTempDir, markProject, writeDesignFile } from "./test-helpers";

describe("withoutComments", () => {
	it("takes an apostrophe in words for no string, nor a quote left open past its line", () => {
		expect(withoutComments("<p>Don't</p> // altKey")).toBe("<p>Don't</p> ");
		expect(withoutComments("<p>it ' s</p>\n// altKey")).toBe("<p>it ' s</p>\n");
	});

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

describe("altReaders", () => {
	it("looks through the frame's folders, past JSX words and comments, for any read of ⌥", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"frames/help/frame.tsx",
			[
				"export default function Frame() {",
				"\treturn <p>Don't worry</p>; // altKey is only said here",
				"}",
				"",
			].join("\n"),
		);
		writeDesignFile(root, "frames/board/frame.tsx", "export default function Frame() { return <main />; }\n");
		writeDesignFile(root, "frames/board/parts/keys.ts", '// keys\nexport const combo = "mod+Alt+K";\n');
		writeDesignFile(root, "frames/plain/frame.tsx", 'export const k = "alternate";\n');

		expect(altReaders(root, ["board", "help", "plain"])).toEqual([
			{ path: "design/frames/board/parts/keys.ts", line: 2 },
		]);
	});
});
