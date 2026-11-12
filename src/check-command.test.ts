import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { runCheck } from "./check-command";
import { shareCheckerInFile } from "./check-test-harness";
import { writeCaptureError, writePace } from "./daemon/thumbs";
import { makeTempDir, markProject, writeDesignFile, writeFrame, writePageFrame } from "./test-helpers";

const FRAME = "export default function Frame() { return <main />; }\n";
const BROKEN = "export default function Frame() { const n: string = 1; return <main>{n}</main>; }\n";
/** The release checking, whose booth's failures the canvas shows. */
const SPOOL = "0.56.0";

shareCheckerInFile();

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

		expect(await runCheck(root, root, ["design/frames/home"], { spool: SPOOL })).toEqual({
			stderr: [],
			stdout: ["checked 1 frame (1 source file), 0 errors"],
			ok: true,
		});
		// a frame's name under design/frames works from anywhere in the project
		expect((await runCheck(root, join(root, "design"), ["shop/list"], { spool: SPOOL })).stdout).toEqual([
			"checked 1 frame (1 source file), 0 errors",
		]);
		const page = await runCheck(root, root, ["design/frames/shop"], { spool: SPOOL });
		expect(page.stderr).toEqual([
			"design/frames/shop/cart/frame.tsx:1:41 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
		expect(page.stdout).toEqual(["checked 2 frames (2 source files), 1 error"]);
		expect(page.ok).toBe(false);
		expect((await runCheck(root, root, [], { spool: SPOOL })).stdout).toEqual([
			"checked 3 frames (3 source files), 1 error",
		]);
		expect((await runCheck(root, root, ["."], { spool: SPOOL })).stdout).toEqual([
			"checked 3 frames (3 source files), 1 error",
		]);
	});

	it("refuses a path that names no frame before checking anything", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writeDesignFile(root, "frames/app/menu.tsx", FRAME);
		writeDesignFile(root, "shared/ui/card.tsx", FRAME);

		expect(await runCheck(root, root, ["design/frames/app/menu.tsx"], { spool: SPOOL })).toEqual({
			stderr: ["design/frames/app/menu.tsx is not a frame: a frame is design/frames/<name>/frame.tsx"],
			stdout: [],
			ok: false,
		});
		expect((await runCheck(root, root, ["design/shared"], { spool: SPOOL })).stderr).toEqual([
			"design/shared holds no frame: name a frame's folder, its frame.tsx, or a folder of frames",
		]);
		expect((await runCheck(root, root, ["nowhere"], { spool: SPOOL })).stderr).toEqual([
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

		const result = await runCheck(root, root, [], { spool: SPOOL });

		// part.tsx is imported, so it is a part, not a frame meant
		expect(result.stderr).toEqual([
			"design/frames/app/menu.tsx is not a frame: a frame is design/frames/<name>/frame.tsx",
			"design/frames/outer/inner/frame.tsx is not a frame: it is inside another frame's folder, and a frame folder can't hold a frame",
		]);
		expect(result.ok).toBe(true);
	});

	it("checks a closure over the limit in batches, saying a shared source's error once", async () => {
		const root = project();
		writeDesignFile(root, "shared/common.ts", "export const common: string = 1;\n");
		const half = Math.ceil(checkSourceLimits.maxFiles / 2) + 1;
		for (let index = 0; index < half; index += 1) {
			writeDesignFile(root, `shared/part${index}.ts`, `export const part = ${index};\n`);
			writePageFrame(
				root,
				"many",
				`f${index}`,
				`import { common } from "../../../shared/common";\nimport { part } from "../../../shared/part${index}";\nexport default function F() { return <p>{part}{common}</p>; }\n`,
			);
		}

		expect(await runCheck(root, root, [], { spool: SPOOL })).toEqual({
			stderr: ["design/shared/common.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'."],
			stdout: [`checked ${half} frames (${half * 2 + 1} source files) in 2 batches, 1 error`],
			ok: false,
		});
	});

	it("leaves out only a frame whose own imports are over the limit, and says how far over", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		const parts = checkSourceLimits.maxFiles;
		writeFrame(
			root,
			"huge",
			`${Array.from({ length: parts }, (_, index) => `import "../../shared/part${index}";`).join("\n")}\n${FRAME}`,
		);
		for (let index = 0; index < parts; index += 1) writeDesignFile(root, `shared/part${index}.ts`, "export {};\n");
		const over = `design/frames/huge/frame.tsx: not checked: it imports ${parts + 1} source files, the limit is ${parts}`;

		expect(await runCheck(root, root, [], { spool: SPOOL })).toEqual({
			stderr: [over],
			stdout: ["checked 1 frame (1 source file), 0 errors"],
			ok: false,
		});
		expect(await runCheck(root, root, ["huge"], { spool: SPOOL })).toEqual({ stderr: [over], stdout: [], ok: false });
	});

	it("names the frames the canvas shows broken, as a note", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writeFrame(root, "cart", FRAME);
		writeFrame(root, "big", FRAME);
		writeCaptureError(root, "home", "threw on boot: TypeError: items is undefined\n    at Home", "boot", SPOOL);
		writeCaptureError(
			root,
			"cart",
			'\u2718 [ERROR] No matching export for import "Pay"\n\n    cart.tsx:1:9:',
			"compile",
			SPOOL,
		);
		writeCaptureError(root, "big", "too large for a cover", "capture", SPOOL);

		expect(await runCheck(root, root, [], { spool: SPOOL })).toEqual({
			stderr: [
				'design/frames/cart/frame.tsx: broken on the canvas: failed to compile: \u2718 [ERROR] No matching export for import "Pay"',
				"design/frames/home/frame.tsx: broken on the canvas: threw on boot: TypeError: items is undefined",
			],
			stdout: ["checked 3 frames (3 source files), 0 errors; 2 broken on the canvas"],
			ok: true,
		});
		expect((await runCheck(root, root, ["big"], { spool: SPOOL })).stdout).toEqual([
			"checked 1 frame (1 source file), 0 errors",
		]);
	});

	it("fails a team project on each file that stays on this Mac, and says nothing of them in a solo one", async () => {
		const root = project();
		writeFrame(root, "home", FRAME);
		writeDesignFile(root, "p-01-home.png", "png");
		expect((await runCheck(root, root, [], { spool: SPOOL })).ok).toBe(true);

		writeFileSync(join(root, "spool.json"), JSON.stringify({ project: "https://spool.page/devosurf/shop" }));
		expect(await runCheck(root, root, [], { spool: SPOOL })).toEqual({
			stderr: [
				"design/p-01-home.png: stays on this Mac, teammates never get it: only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync; move it under frames/ or shared/ if the design uses it, or out of design/ if it is scratch (a screenshot, a script)",
			],
			stdout: ["checked 1 frame (1 source file), 0 errors; 1 file stays on this Mac"],
			ok: false,
			staying: ["p-01-home.png"],
		});
	});

	it("spells out a slow frame only when it is named, and sums up the rest after the diagnostics", async () => {
		const root = project();
		writeFrame(root, "glass", BROKEN);
		writePace(root, "glass", { perSecond: 8, slowestMs: 139, scale: 2 });
		writePageFrame(root, "deck", "reel", FRAME);
		writePace(root, "deck/reel", { perSecond: 20, slowestMs: 60, scale: 2 });

		const all = await runCheck(root, root, [], { spool: SPOOL });
		expect(all.stderr).toEqual([
			"design/frames/glass/frame.tsx:1:41 TS2322: Type 'number' is not assignable to type 'string'.",
			"2 frames timed slow (deck/reel, glass); name one, as in spool check design/frames/deck/reel, to see why",
		]);

		const named = await runCheck(root, root, ["deck/reel"], { spool: SPOOL });
		expect(named.stderr).toHaveLength(1);
		expect(named.stderr[0]).toMatch(/^design\/frames\/deck\/reel\/frame\.tsx: slow: drew 20 frames a second/);

		// a frame outside what was checked is not mentioned at all
		expect((await runCheck(root, root, ["design/frames/deck"], { spool: SPOOL })).stderr).toEqual([
			"1 frame timed slow (deck/reel); name one, as in spool check design/frames/deck/reel, to see why",
		]);
	});

	it("says a talk's slow slides whole, by their place in it, and counts them; a shared file's edit dates their timing", async () => {
		const root = project();
		writeDesignFile(root, "frames/talk/deck.json", '{ "version": 1, "slides": ["intro", "chart", "end"] }\n');
		writeDesignFile(root, "shared/bars.tsx", "export const Bars = () => <div />;\n");
		writePageFrame(root, "talk", "intro", FRAME);
		writePageFrame(
			root,
			"talk",
			"chart",
			'import { Bars } from "../../../shared/bars";\nexport default function Chart() { return <Bars />; }\n',
		);
		writePageFrame(root, "talk", "end", FRAME);
		const census = {
			elements: 300,
			animations: [{ properties: ["height"], elements: 120, endless: false }],
			canvasCount: 0,
			canvases: [],
			videos: 0,
			oversized: [],
			webgl: 0,
			loop: false,
		};
		writePace(root, "talk/chart", {
			perSecond: 60,
			slowestMs: 17,
			scale: 2,
			beats: [{ beat: 1, name: "bars", perSecond: 12, slowestMs: 150, census }],
		});
		writePace(root, "talk/end", { perSecond: 60, slowestMs: 17, scale: 2 });
		const at = (file: string, seconds: number) => utimesSync(join(root, "design", file), seconds, seconds);
		for (const file of ["frames/talk/chart/frame.tsx", "shared/bars.tsx"]) at(file, 1000);
		at(".spool/thumbs/talk%2Fchart/pace.json", 2000);
		const note = [
			'design/frames/talk/chart/frame.tsx: slide 2, slow while beat 2 ("bars") enters: drew 12 frames a second at Retina density when last timed (smooth is 60; its longest took 150 ms).',
			"  animates height on 120 elements: these re-lay the page out every frame; move and size with transform",
		].join("\n");

		expect(await runCheck(root, root, ["design/frames/talk"], () => true)).toEqual({
			stderr: [note],
			stdout: ["checked 3 frames (4 source files), 0 errors; 1 of the 3 slides in talk timed slow"],
			ok: true,
		});
		// the slide named on its own says the same, and the shared component it draws, fixed, dates the timing
		at("shared/bars.tsx", 3000);
		expect((await runCheck(root, root, ["talk/chart"], () => true)).stderr).toEqual([
			note.replace("150 ms).", "150 ms). Timed before its latest edit."),
		]);
	});

	it("shows the parser's own message and place for a source it cannot parse", async () => {
		const root = project();
		writeFrame(root, "home", "const b = 1;\nconst b = 2;\nexport default function Home() { return <p>{b}</p>; }\n");
		writeFrame(root, "open", "export default function Open() { return <p>;\n");

		const result = await runCheck(root, root, [], { spool: SPOOL });

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

		const all = await runCheck(root, root, [], { spool: SPOOL });
		expect(all.ok).toBe(true);
		expect(all.stderr).toEqual([
			"design/frames/board/keys.ts:3 reads the ⌥ key: inside a live frame ⌥ arrows and a held ⌥ move between frames unless the frame calls preventDefault on them",
			"design/frames/editor/frame.tsx:3 reads the ⌥ key: inside a live frame ⌥ arrows and a held ⌥ move between frames unless the frame calls preventDefault on them",
		]);
		expect((await runCheck(root, root, ["design/frames/home"], { spool: SPOOL })).stderr).toEqual([]);
	});

	it("says what a deck needs with the deck experiment on, and nothing of it with it off", async () => {
		const root = project();
		const deck = (on: boolean) => () => on;
		const slide = (beats: string, extra = "") =>
			`import { ui } from "spool";${extra}\nconst NAMES = ["a", "b"] as const;\nexport default function Slide() {\n\tconst beat = ui.beats(${beats});\n\tui.live();\n\treturn <p>{String(beat.reached("a"))}</p>;\n}\n`;
		writeDesignFile(
			root,
			"frames/talk/deck.json",
			`${JSON.stringify({ version: 1, slides: ["intro", "body", "phone", "ghost"] }, null, "\t")}\n`,
		);
		writePageFrame(root, "talk", "intro", slide('["a", "b", "c"]'));
		writeDesignFile(root, "frames/talk/intro/frame.json", JSON.stringify({ w: 1280, h: 720 }));
		writeDesignFile(root, "frames/talk/intro/notes.md", "One.\n\nTwo.\n");
		writePageFrame(root, "talk", "body", slide("NAMES"));
		writeDesignFile(root, "frames/talk/body/frame.json", JSON.stringify({ x: 0, y: 0, w: 1440, h: 900 }));
		writeDesignFile(root, "frames/talk/body/notes.md", "One.\n\nTwo.\n");
		writePageFrame(
			root,
			"talk",
			"phone",
			slide('["a"]', '\nimport words from "./notes.md?raw";\nconsole.log(words);'),
		);
		writeDesignFile(root, "frames/talk/phone/frame.json", JSON.stringify({ w: 390, h: 844 }));
		writeDesignFile(root, "frames/talk/phone/notes.md", "One.\n");
		writePageFrame(root, "draft", "a", FRAME);
		writeDesignFile(root, "frames/draft/deck.json", '{ "slides": ["a",] }');

		const on = await runCheck(root, root, [], { spool: SPOOL, on: deck(true) });
		const notesTs2307 =
			"design/frames/talk/phone/frame.tsx:2:19 TS2307: Cannot find module './notes.md?raw' or its corresponding type declarations.";
		expect(on.stderr).toEqual([
			notesTs2307,
			'design/frames/talk/body/frame.tsx:4:15 deck: ui.beats takes one list of beat names written out in the call, as ui.beats(["title", "price"])',
			expect.stringMatching(
				/^design\/frames\/talk\/phone\/frame\.tsx:2:19 deck: imports "\.\/notes\.md\?raw": a slide never imports its notes/,
			),
			expect.stringMatching(/^design\/frames\/draft\/deck\.json:1:1 deck: does not parse as JSON: /),
			'design/frames/talk/deck.json:7:3 deck: lists "ghost", and there is no design/frames/talk/ghost/frame.tsx: a slide is a frame\'s folder on this page',
			"design/frames/talk/body/frame.json:1:1 deck warning: is 1440×900 and the talk is 1280×720: a slide is the talk's size (leave w and h out and spool sets them), or a shape plainly its own, such as a phone, shown fitted",
			"design/frames/talk/body/notes.md:1:1 deck warning: has 2 paragraphs and the slide 1 beat: one paragraph per beat, and the rest show with its last beat",
		]);
		// what the typecheck finds of ui.beats is nothing: a slide calling it is ordinary, typed code
		expect(on.stdout).toEqual(["checked 4 frames (4 source files), 5 errors"]);
		expect(on.ok).toBe(false);
		// named alone, a slide is checked with its own deck's rules
		expect(
			(await runCheck(root, root, ["design/frames/talk/intro"], { spool: SPOOL, on: deck(true) })).stderr,
		).toEqual([
			'design/frames/talk/deck.json:7:3 deck: lists "ghost", and there is no design/frames/talk/ghost/frame.tsx: a slide is a frame\'s folder on this page',
		]);

		const off = await runCheck(root, root, [], { spool: SPOOL, on: deck(false) });
		expect(off).toEqual({ stderr: [notesTs2307], stdout: ["checked 4 frames (4 source files), 1 error"], ok: false });
	});
});
