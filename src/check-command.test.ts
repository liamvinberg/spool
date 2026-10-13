import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { runCheck } from "./check-command";
import { writePace } from "./daemon/thumbs";
import { makeTempDir, markProject, writeDesignFile, writeFrame, writePageFrame } from "./test-helpers";

const FRAME = "export default function Frame() { return <main />; }\n";
const BROKEN = "export default function Frame() { const n: string = 1; return <main>{n}</main>; }\n";

function project(): string {
	const root = makeTempDir();
	markProject(root);
	return root;
}

describe("spool check [paths…]", { timeout: 30_000 }, () => {
	it("checks only the frames a path names, and counts what it covered", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writePageFrame(root, "shop", "cart", BROKEN);
		writePageFrame(root, "shop", "list", FRAME);

		expect(await runCheck(root, root, ["design/frames/home"])).toEqual({
			stderr: [],
			stdout: ["checked 1 frame (1 source file), 0 errors"],
			ok: true,
		});
		// a frame's name under design/frames works from anywhere in the project
		expect((await runCheck(root, join(root, "design"), ["shop/list"])).stdout).toEqual([
			"checked 1 frame (1 source file), 0 errors",
		]);
		const page = await runCheck(root, root, ["design/frames/shop"]);
		expect(page.stderr).toEqual([
			"design/frames/shop/cart/frame.tsx:1:41 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
		expect(page.stdout).toEqual(["checked 2 frames (2 source files), 1 error"]);
		expect(page.ok).toBe(false);
		expect((await runCheck(root, root, [])).stdout).toEqual(["checked 3 frames (3 source files), 1 error"]);
		expect((await runCheck(root, root, ["."])).stdout).toEqual(["checked 3 frames (3 source files), 1 error"]);
	});

	it("refuses a path that names no frame before checking anything", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writeDesignFile(root, "frames/app/menu.tsx", FRAME);
		writeDesignFile(root, "shared/ui/card.tsx", FRAME);

		expect(await runCheck(root, root, ["design/frames/app/menu.tsx"])).toEqual({
			stderr: ["design/frames/app/menu.tsx is not a frame: a frame is design/frames/<name>/frame.tsx"],
			stdout: [],
			ok: false,
		});
		expect((await runCheck(root, root, ["design/shared"])).stderr).toEqual([
			"design/shared holds no frame: name a frame's folder, its frame.tsx, or a folder of frames",
		]);
		expect((await runCheck(root, root, ["nowhere"])).stderr).toEqual([
			"nowhere: no such file, and no frame is named that",
		]);
	});

	it("names a page-level source and a frame inside a frame, neither of which is a frame", async () => {
		const root = project();
		writeFrame(
			root,
			"home",
			'import { Part } from "../app/part";\nexport default function Home() { return <Part />; }\n',
		);
		writeDesignFile(root, "frames/app/part.tsx", "export function Part() { return <p />; }\n");
		writeDesignFile(root, "frames/app/menu.tsx", FRAME);
		writeFrame(root, "outer", FRAME);
		writeDesignFile(root, "frames/outer/inner/frame.tsx", FRAME);

		const result = await runCheck(root, root, []);

		// part.tsx is imported, so it is a part, not a frame meant
		expect(result.stderr).toEqual([
			"design/frames/app/menu.tsx is not a frame: a frame is design/frames/<name>/frame.tsx",
			"design/frames/outer/inner/frame.tsx is not a frame: it is inside another frame's folder, and a frame folder can't hold a frame",
		]);
		expect(result.ok).toBe(true);
	});

	it("says how far over the file limit the closure is, and that naming frames checks fewer", async () => {
		const root = project();
		const half = Math.ceil(checkSourceLimits.maxFiles / 2) + 1;
		for (let index = 0; index < half; index += 1) {
			writeDesignFile(root, `shared/part${index}.ts`, `export const part = ${index};\n`);
			writePageFrame(
				root,
				"many",
				`f${index}`,
				`import { part } from "../../../shared/part${index}";\nexport default function F() { return <p>{part}</p>; }\n`,
			);
		}

		expect(await runCheck(root, root, [])).toEqual({
			stderr: [
				`not checked: ${half * 2} source files, the limit is ${checkSourceLimits.maxFiles}; name frames or folders of frames to check fewer, as in spool check design/frames/<page>`,
			],
			stdout: [],
			ok: false,
		});
		expect((await runCheck(root, root, ["design/frames/many"])).stderr[0]).toMatch(
			/^not checked: \d+ source files, the limit is \d+; name fewer frames to check fewer$/,
		);
		expect((await runCheck(root, root, ["many/f0", "many/f1"])).stdout).toEqual([
			"checked 2 frames (4 source files), 0 errors",
		]);
	});

	it("spells out a slow frame only when it is named, and sums up the rest after the diagnostics", async () => {
		const root = project();
		writeFrame(root, "glass", BROKEN);
		writePace(root, "glass", { perSecond: 8, slowestMs: 139, scale: 2 });
		writePageFrame(root, "deck", "reel", FRAME);
		writePace(root, "deck/reel", { perSecond: 20, slowestMs: 60, scale: 2 });

		const all = await runCheck(root, root, []);
		expect(all.stderr).toEqual([
			"design/frames/glass/frame.tsx:1:41 TS2322: Type 'number' is not assignable to type 'string'.",
			"2 frames timed slow (deck/reel, glass); name one, as in spool check design/frames/deck/reel, to see why",
		]);

		const named = await runCheck(root, root, ["deck/reel"]);
		expect(named.stderr).toHaveLength(1);
		expect(named.stderr[0]).toMatch(/^design\/frames\/deck\/reel\/frame\.tsx: slow: drew 20 frames a second/);

		// a frame outside what was checked is not mentioned at all
		expect((await runCheck(root, root, ["design/frames/deck"])).stderr).toEqual([
			"1 frame timed slow (deck/reel); name one, as in spool check design/frames/deck/reel, to see why",
		]);
	});

	it("shows the parser's own message and place for a source it cannot parse", async () => {
		const root = project();
		writeFrame(root, "home", "const b = 1;\nconst b = 2;\nexport default function Home() { return <p>{b}</p>; }\n");
		writeFrame(root, "open", "export default function Open() { return <p>;\n");

		const result = await runCheck(root, root, []);

		expect(result.stderr).toEqual([
			"design/frames/home/frame.tsx:2:7 TS1003: Identifier 'b' has already been declared.",
			expect.stringMatching(/^design\/frames\/open\/frame\.tsx:\d+:\d+ TS1003: (?!Source syntax)/),
		]);
	});

	it("notes a frame whose own source reads the ⌥ key, without failing the check (DEV-295)", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writeFrame(
			root,
			"editor",
			[
				"// altKey in a comment is no read",
				"export default function Frame() {",
				"\treturn <main onKeyDown={(event) => event.altKey && event.preventDefault()} />;",
				"}",
				"",
			].join("\n"),
		);
		writeDesignFile(root, "frames/board/frame.tsx", FRAME);
		writeDesignFile(
			root,
			"frames/board/keys.ts",
			'/* a comment\n   saying "Alt" */\nexport const held = (e: KeyboardEvent) => e.getModifierState("Alt");\n',
		);

		const all = await runCheck(root, root, []);
		expect(all.ok).toBe(true);
		expect(all.stderr).toEqual([
			"design/frames/board/keys.ts:3 reads the ⌥ key: inside a live frame ⌥ arrows and a held ⌥ move between frames unless the frame calls preventDefault on them",
			"design/frames/editor/frame.tsx:3 reads the ⌥ key: inside a live frame ⌥ arrows and a held ⌥ move between frames unless the frame calls preventDefault on them",
		]);
		expect((await runCheck(root, root, ["design/frames/home"])).stderr).toEqual([]);
	});
});
