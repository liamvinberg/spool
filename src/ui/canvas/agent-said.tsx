import { memo, type ReactNode } from "react";
import { cn } from "../cn";
import { type Chunk, chunksOf, drawnText, type Span } from "./agent-markdown";

/**
 * The agent's own words, rendered, with an optional live tail (#148, #149, #192).
 *
 * `live` is a count of trailing drawn characters still arriving. Zero renders
 * finished prose, which is what a settled transcript passes.
 *
 * **The arriving unit is a word, and that is not a preference — per character
 * cannot be made to hold still.** Wrapping a glyph in a span breaks text shaping at
 * the span boundary, so a run of per-character spans measures wider than the same
 * characters as one text node. Every frame, characters at the trailing edge stop
 * being spans and become plain text, so the paragraph's width changes under the
 * cursor continuously: it reads as the block flickering and rebreaking, worst at the
 * start where the whole message is inside the window. Per word, the boundaries land
 * on spaces, so the same trailing edge costs nothing.
 *
 * **A settled word gets no element at all**, and the span an arriving one gets is a
 * plain inline span. Wrapping every word was measured and it was a defect rather
 * than a cost: `white-space: pre` is `text-wrap: nowrap` inside the box, so a
 * wrapped word cannot break *inside itself* — and this corpus is made of words that
 * should (`'kaffe-receipt-copy'`, `design/shared/tokens.css`). It broke the prose
 * differently from raw text at 3 of 12 column widths including the rail's own, and
 * the reflow is lateral, which is why looking at a height never caught it.
 * `inline-block` turned out to be doing nothing; a plain span splits the same word
 * raw text splits.
 *
 * So nothing is unwrapped at a finish line: the live window is the only thing
 * wrapped, and its trailing edge is free to move.
 */

/**
 * A run of text where the trailing `live` characters are arriving.
 *
 * `from` is how many drawn characters precede this run, so distance from the end is
 * absolute across the whole message rather than per span. Whitespace is never
 * wrapped, and that is not a nicety: a span holding a single space keeps that space
 * from collapsing at a soft-wrap opportunity, so every line whose break lands on one
 * begins with a visible indent and the paragraph looks ragged down its left edge.
 */
function Run({ text, from, total, live }: { text: string; from: number; total: number; live: number }) {
	if (live <= 0) return <>{text}</>;
	const start = total - live;
	let at = from;
	return (
		<>
			{text.split(/(\s+)/).map((piece) => {
				const pos = at;
				at += piece.length;
				if (piece === "") return null;
				if (piece.trim() === "") return piece;
				// a settled word is text rather than an element: see the word rule above
				if (pos + piece.length <= start) return piece;
				return (
					/*
					 * The key is the word's own offset in the message, which is what makes it
					 * stable: `closedText` guarantees the drawn text only ever grows, so a word
					 * mounts once and its arrival animation fires once.
					 *
					 * One class and nothing else, which is the frame's own `fade`. A delay across
					 * the last half-line was drawn and it is a defect rather than a softer edge: a
					 * CSS animation with no fill mode has no effect during its delay, so a delayed
					 * word paints at full strength and then snaps to nothing to begin its own fade.
					 * That is the one thing a fade exists to prevent, at the live edge where every
					 * arriving word is.
					 */
					<span key={pos} className="animate-agent-word">
						{piece}
					</span>
				);
			})}
		</>
	);
}

/**
 * The live end marker: one static bar, and the *static* is the decision (#149).
 *
 * That it survives at all is because the pace stalls — every fade completes during a
 * pause, so the caret is then the only thing separating *still writing* from *done*.
 * Nothing that ships blinks one: of thirteen chat surfaces read at the source, zero
 * blink at the live edge, and the two that pair a caret with a per-word fade both
 * draw a static glyph. WCAG 2.2.2 also lists blinking beside moving and scrolling
 * under the same five-second trigger, so a caret blinking through a twenty-second
 * message would owe a pause mechanism — and the exemption for blinking that is
 * *essential* is unavailable, because the fade is already a liveness signal. A CSS
 * blink would also silently defeat macOS's own non-blinking-cursor setting.
 */
export function Caret() {
	return (
		<span
			data-agent-caret=""
			className="ml-[3px] inline-block h-[12px] w-[2px] translate-y-[1px] rounded-[1px] bg-text/70 align-baseline"
			aria-hidden="true"
		/>
	);
}

/**
 * One level of nesting, which is the marker's width and its gap.
 *
 * A sub-list lines up under its parent's *words* rather than under its parent's
 * bullet, which is the only indent that reads as containment in a column this narrow.
 * The depth itself is capped in the parser, so a runaway indent cannot walk the prose
 * off the right edge of a 200px rail.
 */
const INDENT = 14;

/**
 * Rendered on its props and nothing else, which is why it is held.
 *
 * The block that is arriving draws twice: an invisible copy of the whole landed message
 * holding the height open, and the words the edge has reached drawn over it. The
 * invisible one is the same string for the whole of the message's life and the visible
 * one changes ten times a second, so the reserve is re-rendered a hundred times for
 * nothing unless it is told it may sit still.
 */
export const Said = memo(function Said({ text, live = 0, caret }: { text: string; live?: number; caret?: ReactNode }) {
	const chunks = chunksOf(text);
	const total = drawnText(chunks).length;
	let seen = 0;
	const run = (value: string): ReactNode => {
		const node = <Run text={value} from={seen} total={total} live={live} />;
		seen += value.length;
		return node;
	};
	/*
	 * A span is one element carrying whatever its markers added, rather than one element
	 * per marker. Nesting them would wrap an emphasised path in three tags to say what
	 * two classes say, and every extra element is one more thing between an arriving word
	 * and the text shaping it belongs to (#163).
	 *
	 * A link is the exception and has to be: it is the one marker that is an element
	 * rather than a face.
	 */
	const spans = (list: readonly Span[]) => (
		<>
			{list.map((span, at) => {
				const key = `${at}-${span.text.slice(0, 12)}`;
				const face = cn(
					span.italic === true && "italic",
					// struck text is over, so it is dimmed as well as ruled: a line alone at full
					// strength reads as emphasis at a glance
					span.strike === true && "text-text/50 line-through",
				);
				const inner = run(span.text);
				if (span.code === true) {
					return (
						<code
							key={key}
							className={cn(
								"rounded-xs bg-surface px-[3px] py-px font-mono text-2xs",
								span.bold === true ? "text-text" : "text-text/85",
								face,
							)}
						>
							{inner}
						</code>
					);
				}
				if (span.href !== undefined) {
					return (
						/*
						 * Underlined rather than coloured, because the one accent in this rail belongs
						 * to the selection and a link is not the selection. It leaves for the browser:
						 * a frame is navigated to by its own row (#194), so a URL in prose is the web
						 * and nothing spool owns.
						 *
						 * A bold link is an `<a>` carrying the weight rather than a `<strong>` inside
						 * one, because the anchor is already the element this span is owed and #163
						 * is about not spending a second.
						 */
						<a
							key={key}
							href={span.href}
							target="_blank"
							rel="noreferrer"
							className={cn(
								"underline decoration-border-raised underline-offset-2 transition-colors duration-150 hover:decoration-text",
								span.bold === true && "font-medium text-text",
								face,
							)}
						>
							{inner}
						</a>
					);
				}
				if (span.bold === true) {
					return (
						<strong key={key} className={cn("font-medium text-text", face)}>
							{inner}
						</strong>
					);
				}
				return (
					<span key={key} className={face}>
						{inner}
					</span>
				);
			})}
		</>
	);

	return (
		<div className="flex flex-col gap-2 text-base text-text/90 leading-base">
			{chunks.map((chunk: Chunk, at) => {
				const key = `${at}-${chunk.kind}`;
				/*
				 * The caret goes *inside* the last block rather than after it. Rendered prose
				 * is a stack of block elements, so a caret handed in as a sibling lands on a
				 * line of its own under the paragraph it belongs to and reads as an empty next
				 * paragraph — and inside a fence it has to be inside the `<pre>`.
				 */
				const end = at === chunks.length - 1 ? caret : null;
				if (chunk.kind === "fence") {
					return (
						<pre
							key={key}
							className="pages-scrollbar overflow-x-auto rounded-sm border border-border bg-surface px-2.5 py-2 font-mono text-2xs text-text/80 leading-4"
						>
							{run(chunk.text)}
							{end}
						</pre>
					);
				}
				if (chunk.kind === "quote") {
					return (
						<p key={key} className="border-border-raised border-l-2 pl-2.5 text-text/70">
							{spans(chunk.spans)}
							{end}
						</p>
					);
				}
				if (chunk.kind === "rule") {
					// a rule is the agent ending a section, so it is drawn at the strength of the
					// borders that already separate things here rather than as a line of its own
					return <hr key={key} className="my-1 border-border border-t" />;
				}
				if (chunk.kind === "item") {
					return (
						<p key={key} className="flex gap-2 pl-0.5" style={{ marginLeft: chunk.depth * INDENT }}>
							{/* the one glyph in the block that is the renderer's rather than the
							    agent's, and marked as such: a word count over this prose has to
							    skip it */}
							<span data-marker="" className="shrink-0 text-muted/70 tabular-nums">
								{chunk.done === undefined ? chunk.marker : chunk.done ? "☑" : "☐"}
							</span>
							<span className={chunk.done === true ? "text-text/50" : undefined}>
								{spans(chunk.spans)}
								{end}
							</span>
						</p>
					);
				}
				return (
					<p key={key}>
						{spans(chunk.spans)}
						{end}
					</p>
				);
			})}
		</div>
	);
});
