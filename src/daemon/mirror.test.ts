import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writePageFrame } from "../test-helpers";
import { mirrorOf } from "./mirror";
import { listProjectFramesAwaited } from "./projection";

/**
 * Mirrors (spool#232): a frame whose whole source re-exports another frame's
 * entry is recognised as that frame's mirror, so the rail can say so; anything
 * more is a frame of its own.
 */

describe("recognising a mirror", () => {
	const frames = new Set(["app/checkout", "scania/checkout", "wide"]);

	it("names the frame a one-line re-export of its entry points at, and nothing else", () => {
		const cases: [string, string | undefined][] = [
			['export { default } from "../../app/checkout/frame";\n', "app/checkout"],
			["// the client's copy\nexport {default} from '../../app/checkout/frame.tsx'", "app/checkout"],
			// more than the re-export is a frame that happens to use another
			['export { default } from "../../app/checkout/frame";\nexport const links = {};\n', undefined],
			['import Checkout from "../../app/checkout/frame";\nexport default Checkout;\n', undefined],
			// a file beside the entry, a folder no frame answers to, itself, and outside frames/
			['export { default } from "../../app/checkout/parts";\n', undefined],
			['export { default } from "../../app/gone/frame";\n', undefined],
			['export { default } from "./frame";\n', undefined],
			['export { default } from "../../../shared/frame";\n', undefined],
		];
		for (const [source, original] of cases) expect(mirrorOf(source, "scania/checkout", frames)).toBe(original);
	});

	it("marks the mirror in the canvas's projection, only when asked", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writePageFrame(root, "app", "checkout", "export default () => <p>pay</p>;\n");
		writePageFrame(root, "scania", "checkout", 'export { default } from "../../app/checkout/frame";\n');

		const marked = await listProjectFramesAwaited(root, { mirrors: true });
		expect(marked.frames.map((frame) => [frame.name, frame.mirrorOf])).toEqual([
			["app/checkout", undefined],
			["scania/checkout", "app/checkout"],
		]);
		const plain = await listProjectFramesAwaited(root);
		expect(plain.frames.some((frame) => frame.mirrorOf !== undefined)).toBe(false);
	});
});
