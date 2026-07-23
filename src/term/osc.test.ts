import { describe, expect, it } from "vitest";
import { createOscFilter, navSequence } from "./osc";

const text = (s: string) => new TextEncoder().encode(s);
const out = (chunks: Uint8Array[]) => new TextDecoder().decode(Buffer.concat(chunks));

describe("navSequence", () => {
	it("spells the helper's escape for a target", () => {
		expect(navSequence("checkout")).toBe("\x1b]7770;go;checkout\x07");
	});
});

describe("createOscFilter", () => {
	it("strips a spool nav sequence and surfaces its target, leaving the stream intact", () => {
		const filter = createOscFilter();
		const result = filter.push(text(`before${navSequence("checkout")}after`));
		expect(result.navs).toEqual(["checkout"]);
		expect(out([result.out])).toBe("beforeafter");
	});

	it("passes an unrelated OSC through byte-exact", () => {
		const filter = createOscFilter();
		const title = "\x1b]0;my app\x07";
		const result = filter.push(text(`${title}body`));
		expect(result.navs).toEqual([]);
		expect(out([result.out])).toBe(`${title}body`);
	});

	it("leaves CSI styling untouched", () => {
		const filter = createOscFilter();
		const styled = "\x1b[31mred\x1b[0m";
		const result = filter.push(text(styled));
		expect(result.navs).toEqual([]);
		expect(out([result.out])).toBe(styled);
	});

	it("reads a nav split across chunk boundaries", () => {
		const filter = createOscFilter();
		const whole = `a${navSequence("pay--done")}b`;
		const bytes = text(whole);
		const pieces: Uint8Array[] = [];
		const navs: string[] = [];
		let offset = 0;
		for (const size of [4, 7, bytes.length - 11]) {
			const result = filter.push(bytes.slice(offset, offset + size));
			pieces.push(result.out);
			navs.push(...result.navs);
			offset += size;
		}
		expect(navs).toEqual(["pay--done"]);
		expect(out(pieces)).toBe("ab");
	});

	it("accepts the ST terminator as well as BEL", () => {
		const filter = createOscFilter();
		const result = filter.push(text("x\x1b]7770;go;menu\x1b\\y"));
		expect(result.navs).toEqual(["menu"]);
		expect(out([result.out])).toBe("xy");
	});

	it("reads several navs in one chunk", () => {
		const filter = createOscFilter();
		const result = filter.push(text(`${navSequence("a")}${navSequence("b")}`));
		expect(result.navs).toEqual(["a", "b"]);
		expect(out([result.out])).toBe("");
	});

	it("flushes a never-terminated sequence as plain output instead of buffering forever", () => {
		const filter = createOscFilter();
		const runaway = `\x1b]7770;go;${"x".repeat(5000)}`;
		const result = filter.push(text(runaway));
		expect(result.navs).toEqual([]);
		expect(out([result.out])).toBe(runaway);
	});
});
