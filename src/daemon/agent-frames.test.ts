import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { changedRange, frameWritten, linesOf, partialField, sourceWritten, spotName } from "./agent-frames";
import { listProjectFrames } from "./projection";

describe("reading a call's input for the frame it writes", () => {
	it("reads a string field out of JSON that has not finished arriving", () => {
		expect(partialField('{"file_path":"design/frames/a/frame.tsx","content":"one\\ntw', "content")).toBe("one\ntw");
		expect(partialField('{"content":"cut mid-escape \\', "content")).toBe("cut mid-escape ");
		expect(partialField('{"content":"\\u00e9\\u00', "content")).toBe("é");
		expect(partialField('{"file_path":"x"', "content")).toBeUndefined();
	});

	it("knows a frame's entry by its path, nested pages and all, and nothing else", () => {
		expect(frameWritten("/p/design/frames/home/frame.tsx")).toBe("home");
		expect(frameWritten("design/frames/onboarding/step-1/frame.tsx")).toBe("onboarding/step-1");
		expect(frameWritten("design/frames/home/parts.tsx")).toBeUndefined();
		expect(frameWritten("design/shared/frame.tsx")).toBeUndefined();
	});

	it("reads a heredoc's body as the frame's source while it streams", () => {
		const command = "mkdir -p design/frames/calm && cat > design/frames/calm/frame.tsx <<'EOF'\nline 1\nline 2\n";
		expect(sourceWritten("Bash", JSON.stringify({ command }))).toEqual({ frame: "calm", source: "line 1\nline 2\n" });
		const closed = `${command}EOF\nwc -l design/frames/calm/frame.tsx`;
		expect(sourceWritten("Bash", JSON.stringify({ command: closed }))?.source).toBe("line 1\nline 2\n");
		expect(sourceWritten("Bash", JSON.stringify({ command: "cat design/frames/calm/frame.tsx" }))).toBeUndefined();
		expect(
			sourceWritten("Write", JSON.stringify({ file_path: "design/frames/calm/frame.tsx", content: "x" })),
		).toEqual({
			frame: "calm",
			source: "x",
		});
	});

	it("counts lines the way an editor does", () => {
		expect([linesOf(""), linesOf("a"), linesOf("a\n"), linesOf("a\nb")]).toEqual([0, 1, 1, 2]);
	});
});

describe("what moved in a frame", () => {
	it("is the run of new lines between what stayed the same at both ends", () => {
		expect(changedRange("a\nb\nc\n", "a\nB\nc\n")).toEqual({ from: 2, to: 2 });
		expect(changedRange("a\nb\nc\n", "a\nb\nx\ny\nc\n")).toEqual({ from: 3, to: 4 });
		// a deletion is the line it closed up on
		expect(changedRange("a\nb\nc\n", "a\nc\n")).toEqual({ from: 2, to: 2 });
	});
});

describe("a held spot", () => {
	it("is named from the delegation's own words", () => {
		expect(spotName("Design hello-calm frame")).toBe("hello-calm");
		expect(spotName("Design cart--empty restrained")).toBe("cart-empty-restrained");
		expect(spotName(null)).toBe("designer");
	});

	it("takes the frame born into it, and keeps every other new frame off it", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeFrame(root, "home", "export default () => null;\n");
		writeDesignFile(root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		writeFrame(root, "calm", "export default () => null;\n");
		writeFrame(root, "other", "export default () => null;\n");
		const held = [{ name: "calm", x: 5000, y: 0, w: 390, h: 844 }];

		const frames = listProjectFrames(root, { held }).frames;
		expect(frames.find((frame) => frame.name === "calm")).toMatchObject({ x: 5000, y: 0 });
		const other = frames.find((frame) => frame.name === "other");
		expect(other !== undefined && (other.x >= 5000 + 390 || other.x + other.w <= 5000)).toBe(true);
	});
});
