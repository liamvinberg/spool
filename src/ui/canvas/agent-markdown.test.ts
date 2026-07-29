import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "../../daemon/agent-claude";
import { readCapture } from "../../test-helpers";
import { chunksOf, drawnText } from "./agent-markdown";
import { closedText } from "./agent-markers";

/**
 * The prose half of the rail (#148, #149, #192): the markdown subset, and the
 * repair that lets a half-arrived message be drawn without the block structure
 * moving under the reader.
 *
 * The property at the bottom is the whole claim, and it is asserted against a real
 * streamed message rather than an authored one: every prefix of it, one character
 * at a time, must draw a prefix of what the finished message draws. Anything else
 * is text on screen being unwritten.
 */

/** the longest prose message a capture streamed, reassembled off the adapter's own events */
function longestMessage(capture: string): string {
	const adapter = createClaudeAdapter();
	const blocks = new Map<number, string>();
	for (const line of readCapture(capture)) {
		for (const event of adapter.read(JSON.stringify(line))) {
			if (event.kind !== "say" || event.parent !== null) continue;
			blocks.set(event.block, (blocks.get(event.block) ?? "") + event.text);
		}
	}
	return [...blocks.values()].reduce((longest, text) => (text.length > longest.length ? text : longest), "");
}

describe("the markdown subset", () => {
	it("reads bold, inline code, fences, quotes and both list kinds", () => {
		const chunks = chunksOf("**done.** the `cart` frame\n\n- one\n2. two\n\n> aside\n\n```\ncode\n```");

		expect(chunks.map((chunk) => chunk.kind)).toEqual(["p", "item", "item", "quote", "fence"]);
		expect(chunks[0]).toEqual({
			kind: "p",
			spans: [{ text: "done.", bold: true }, { text: " the " }, { text: "cart", code: true }, { text: " frame" }],
		});
		expect(chunks[1]).toMatchObject({ marker: "•" });
		expect(chunks[2]).toMatchObject({ marker: "2." });
		expect(chunks[4]).toEqual({ kind: "fence", text: "code" });
	});

	/** code inside bold happens in the corpus; bold inside code cannot, since code is verbatim */
	it("keeps a path inside a bold lead-in as code rather than as literal backticks", () => {
		expect(chunksOf("**1. no `kaffe-receipt-copy`.**")[0]).toEqual({
			kind: "p",
			spans: [
				{ text: "1. no ", bold: true },
				{ text: "kaffe-receipt-copy", code: true, bold: true },
				{ text: ".", bold: true },
			],
		});
	});

	/** no message in the corpus that reaches a transcript has one, so `#` is not a heading */
	it("leaves a hash as text, because no captured message uses one", () => {
		expect(chunksOf("# not a heading")).toEqual([{ kind: "p", spans: [{ text: "# not a heading" }] }]);
	});

	it("draws no marker character: the glyphs are the renderer's, the text is the agent's", () => {
		expect(drawnText(chunksOf("**bold** and `code`"))).toBe("bold and code");
	});
});

describe("closing what has not been written yet", () => {
	it("closes an open bold run so it renders bold from its first character", () => {
		expect(closedText("the **sho")).toBe("the **sho**");
	});

	it("closes an open code span", () => {
		expect(closedText("read `frame.ts")).toBe("read `frame.ts`");
	});

	it("closes an unterminated fence rather than swallowing the rest of the message", () => {
		expect(closedText("look:\n```\nconst a = 1")).toBe("look:\n```\nconst a = 1\n```");
	});

	/** `****` is not bold and an empty code span is a chip with no text in it */
	it("drops an opener with nothing behind it", () => {
		expect(closedText("the **")).toBe("the ");
		expect(closedText("the ``")).toBe("the ");
	});

	/** the one case where a drawn character *leaves* the text again: it waits for its space */
	it("holds a nascent list marker back until its space arrives", () => {
		expect(closedText("done.\n-")).toBe("done.\n");
		expect(closedText("done.\n1.")).toBe("done.\n");
		expect(closedText("done.\n- o")).toBe("done.\n- o");
	});

	/** stripping this as a run of backticks reopens the fence for one frame */
	it("leaves a completed closing fence alone", () => {
		expect(closedText("```\nbody\n```")).toBe("```\nbody\n```");
	});

	it("leaves a finished message byte-identical", () => {
		const full = longestMessage("claude-mcp");

		expect(full.length).toBeGreaterThan(3000);
		expect(closedText(full)).toBe(full);
	});
});

/**
 * The property, over every prefix of a real 3,372-character message.
 *
 * Holding unclosed markers back scored six breaks here and drawing them raw scored
 * six too; closing them scores none, which is what makes an animate-on-mount
 * arrival safe at all — a word only ever mounts once, because nothing it is inside
 * is ever redrawn as something else.
 */
describe("what is drawn is always a prefix of what will be drawn", () => {
	for (const capture of ["claude-mcp", "claude-turn", "claude-interrupt"]) {
		it(`holds across every prefix of ${capture}'s longest message`, () => {
			const full = longestMessage(capture);
			const settled = drawnText(chunksOf(full));
			const broken: number[] = [];
			for (let at = 1; at <= full.length; at += 1) {
				const drawn = drawnText(chunksOf(closedText(full.slice(0, at))));
				if (!settled.startsWith(drawn)) broken.push(at);
			}

			expect(broken).toEqual([]);
		});
	}
});
