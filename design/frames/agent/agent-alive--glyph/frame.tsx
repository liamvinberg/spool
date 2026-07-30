import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--glyph — Claude Code's growing star, verbatim, in one fixed mono cell.
 *
 * **The one take here with a shipped precedent for a glyph rather than a word**, and it comes
 * from the surface this rail is being written inside. `agent-wait-look` recovered the array
 * out of Claude Code 2.1.220's own JavaScriptCore string table — the binary is a 256MB Bun
 * executable compiled to bytecode, so `strings` fails on it and the literals had to be parsed
 * out of the string table directly. Six frames, `·` `✢` `✳` `✶` `✻` `✽`, 720ms a cycle, which
 * is 120ms a frame. Used unchanged.
 *
 * **What it gets right.** The cell is a fixed 14px box, so the widest width step it takes is
 * zero and nothing it does can push anything — which is not automatic, because these are not
 * Fragment Mono glyphs and their natural advance widths differ; the box is what makes it true.
 * It is also the only take that grows and resets rather than travelling or breathing, so it
 * reads as *counting* without counting anything.
 *
 * **And the first render killed it, which is the whole reason to draw a thing rather than
 * describe it.** Neither Fragment Mono nor Familjen Grotesk carries any of these six
 * characters, so all six come out of a fallback font — and in that fallback `✳`, `✶`, `✻` and
 * `✽` render as **the same asterisk**. Read the claim line under the rail in this frame: the
 * array prints as a dot, a plus, and then four glyphs that are indistinguishable. Claude Code's
 * spinner is a star *growing*, and in this document it does not grow. It has two visible frames
 * out of six, so what it actually draws is a dot alternating with an asterisk at 120ms. Shipping
 * this would mean carrying a font file so a spinner can have six shapes.
 *
 * **What it gets wrong beyond that, and the meters say both parts.** It changes the **text**, so Chromium
 * re-renders the run every 120ms and the writes meter reads roughly a hundred a turn against
 * every transform take's zero. That is not a performance argument at this size, it is a
 * classification: this take is main-thread work by construction and the rest of the row is not.
 *
 * And `✻` is Claude's own figure glyph, out of the same symbol table the array came from. Round
 * two ruled out animating spool's mark because a logo that means *working* means it everywhere.
 * Spending somebody else's mark is the same mistake with the additional problem that it is not
 * spool's to spend. If this shape wins, the array has to be spool's own six glyphs, and it is
 * worth saying plainly that once the glyphs are redrawn the precedent evaporates and what is
 * left is a stepped spinner.
 *
 * **A note on the ban, because 120ms sounds close to it.** Nothing blinks: a glyph is on screen
 * in every frame and only its shape changes. But 8.3 changes a second at the edge of the eye is
 * the fastest thing on this row by a factor of two, and it is the one take where the frame rate
 * itself is a design decision rather than an implementation detail.
 */
export default function AliveGlyphFrame() {
	return (
		<AliveFrame
			take="glyph"
			title="glyph · claude code's own six frames, at 120ms"
			claim="· ✢ ✳ ✶ ✻ ✽, read out of the binary's jsc string table and used unchanged, in a fixed 14px cell."
			notes={[
				"four of the six render as the same fallback asterisk",
				"here: neither font has them, so the star never grows.",
				"it changes text, so it is the one take chromium",
				"re-renders. and ✻ is not spool's glyph to spend.",
			]}
		/>
	);
}
