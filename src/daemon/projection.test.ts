import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pxForCells } from "../term/cells";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { frameKind, listProjectFrames } from "./projection";

describe("frame kinds", () => {
	it("discovers term.tsx folders as terminal frames beside html ones", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "web", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "tui", "term.tsx"), "// tui\n");

		const { frames } = listProjectFrames(root);
		expect(frames.map((f) => ({ name: f.name, kind: f.kind }))).toEqual([
			{ name: "tui", kind: "term" },
			{ name: "web", kind: "html" },
		]);
	});

	it("births terminal frames at 80×24, not phone-sized", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "tui", "term.tsx"), "// tui\n");

		const { frames } = listProjectFrames(root);
		const expected = pxForCells(80, 24);
		expect(frames[0]).toMatchObject({ w: expected.w, h: expected.h });
		// placement is durable, written through the same sidecar path
		const sidecar = JSON.parse(readFileSync(join(root, "design", "frames", "tui", "frame.json"), "utf8"));
		expect(sidecar).toMatchObject({ w: expected.w, h: expected.h });
	});

	it("names a folder holding both entries a conflict, and still shows it", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "both", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "both", "term.tsx"), "// tui\n");

		const designDir = realDesignDir(root);
		expect(frameKind(join(designDir, "frames", "both"), designDir)).toBe("conflict");
		const { frames } = listProjectFrames(root);
		expect(frames.map((f) => f.name)).toEqual(["both"]);
	});

	it("variants are just names — a --variant terminal frame discovers like any frame", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "dash--empty", "term.tsx"), "// tui\n");
		const { frames } = listProjectFrames(root);
		expect(frames[0]).toMatchObject({ name: "dash--empty", kind: "term" });
	});
});
