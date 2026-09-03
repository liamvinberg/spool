import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { closedText } from "shared/lib/spool/say-markers";
import { cn } from "shared/lib/utils";

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/* ---------- the agent's own words (#148) ----------
 * **The rail drew markdown as source until this ticket.** Claude Code writes markdown
 * because its own surface is a terminal that renders it, and nothing in `spool-play-rail.tsx`
 * did — so `**bold**` kept its asterisks, a fence drew three literal backticks
 * mid-paragraph, and a numbered list was one grey paragraph. Nobody decided that; the
 * median message on the page is 87 characters and a one-line reply has no markers in
 * it, so it only surfaced when a message was long enough to have structure.
 *
 * The subset is the corpus's, not CommonMark's. Measured over the thirty-five messages
 * that reach a transcript: bold, inline code, fenced blocks, blockquotes, ordered and
 * unordered lists. **No heading appears in any of them** — the only message with
 * headings is a sub-agent's, which never reaches the log — so `#` is not implemented
 * rather than implemented and unused.
 *
 * It lives here rather than in the rail because the streaming sheets render the same
 * prose and a second copy of a markdown subset is a second set of bugs. */

/** re-exported so a caller needs one import to render prose that is still arriving */
export { closedText };

type Span = { readonly text: string; readonly code?: boolean; readonly bold?: boolean };
type Chunk =
	| { readonly kind: "p" | "quote"; readonly spans: readonly Span[] }
	| { readonly kind: "item"; readonly marker: string; readonly spans: readonly Span[] }
	| { readonly kind: "fence"; readonly text: string };

/**
 * What a character does in the milliseconds after it lands (#148).
 *
 * **The unit is a word, and that is not a preference — per character cannot be made to
 * hold still.** Wrapping a glyph in a span breaks text shaping at the span boundary, so
 * a run of per-character spans measures wider than the same characters as one text
 * node. Every frame, characters at the trailing edge of the live window stop being
 * spans and become plain text, so the paragraph's width changes under the cursor
 * continuously: it reads as the block flickering and rebreaking, worst at the start
 * where the whole message is inside the window. Per word, the boundaries land on spaces,
 * so the same trailing edge costs nothing.
 *
 * **The second half of that sentence used to be "and every word is wrapped for the whole
 * message, live or settled", and #163 measured it wrong.** Wrapping every word was not the
 * price of a stable edge, it was a price paid for nothing: an `inline-block` word cannot
 * break inside itself, so a hyphenated path re-wrapped the paragraph away from what raw
 * text does — at the rail's own width. The word rule below is what replaced it, and under
 * it the settled part of a message carries no spans at all.
 *
 * Two mechanisms then, crossed with the fade/blur axis. `fade` and `blur` animate a
 * word on mount; `edge` and `soften` animate nothing and compute opacity — and, for
 * `soften`, blur — from how far a word sits from the live edge.
 *
 * **`fade` ships, and the argument that ruled it out was stale (#149).** This doc used to
 * say the computed ramp was the mechanism that survives markdown, because an
 * animate-on-mount unit is keyed by position and rendered position *moves* when a closing
 * `**` deletes four characters. That was true of the renderer that *held markers back*.
 * `closedText` closes them instead, which makes what is drawn a prefix of what will be
 * drawn — measured by walking all three streamed messages one character at a time, 5,808
 * characters: holding back broke the prefix 61 times, closing broke it 6, and one further
 * rule (a lone `-`, `*` or `1.` waits for its space) takes it to **0**. Nothing re-fires,
 * so the mechanism stopped deciding anything and the choice became what it looks like.
 *
 * **Blur loses on the compositor rather than on taste.** Chromium disqualifies an animated
 * pixel-moving filter from compositing by name — `kFilterRelatedPropertyMayMovePixels` in
 * `compositor_animations.cc`, which Lighthouse surfaces as "Filter-related property may
 * move pixels" — and Chrome's own writing on it is blunt: *"Animating a blur is not really
 * an option as it is very slow."* Every blurred word also becomes its own stacking context
 * with an ink-overflow rectangle overlapping its neighbours. That is a poor trade on a tree
 * the pace already re-renders sixty times a second, and it is why `soften` is the worst of
 * the four rather than the most refined: it recomputes a per-word blur every frame.
 *
 * **And a computed ramp has one failure an animation does not: it freezes.** #149's drain
 * leaves 12% to 23% of frames with no new character, so the edge does stop. A word part-way
 * through a fade finishes anyway; a word whose opacity is a function of a distance that has
 * stopped changing sits at 8% opacity indefinitely, which reads as a rendering bug rather
 * than as waiting. `edge` and `soften` stay drawn on `agent-say-arrive` as the argument.
 */
export type Arrival = "none" | "fade" | "blur" | "edge" | "soften";

/** the opacity ramp, in characters. Roughly half a line, so about five words */
const RAMP = 30;
/**
 * The blur ramp, deliberately half the opacity one.
 *
 * Matching them was drawn first and it smears: 26 characters is most of a line, so
 * until the message is longer than that the *whole* first line is out of focus, and
 * after it a permanent half-line of unreadable text follows the edge. Blur reads as
 * broken much sooner than dimness does, so it gets a tighter span and the opacity ramp
 * carries the softness.
 */
const BLUR_RAMP = 14;

/**
 * `**bold**` and `` `code` ``, in that order because they nest that way.
 *
 * The corpus decides the order: the long message's three findings are each a bold
 * lead-in with a path inside it — `**1. Notion — no \`kaffe-receipt-copy\`.**` — so a
 * single pass over both markers leaves the backticks sitting literal inside the bold
 * run. Code inside bold happens; bold inside code does not, and cannot, since a code
 * span is verbatim by definition.
 */
function spansOf(line: string): readonly Span[] {
	const spans: Span[] = [];
	const code = (text: string, bold: boolean) => {
		for (const piece of text.split(/(`[^`]+`)/g)) {
			if (piece === "") continue;
			const inline = piece.startsWith("`") && piece.endsWith("`") && piece.length > 2;
			spans.push({
				text: inline ? piece.slice(1, -1) : piece,
				...(inline ? { code: true } : {}),
				...(bold ? { bold: true } : {}),
			});
		}
	};
	for (const piece of line.split(/(\*\*[^*]+?\*\*)/g)) {
		if (piece === "") continue;
		const strong = piece.startsWith("**") && piece.endsWith("**") && piece.length > 4;
		code(strong ? piece.slice(2, -2) : piece, strong);
	}
	return spans;
}

export function chunksOf(text: string): readonly Chunk[] {
	const chunks: Chunk[] = [];
	const lines = text.split("\n");
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length > 0) chunks.push({ kind: "p", spans: spansOf(paragraph.join(" ")) });
		paragraph = [];
	};
	for (let at = 0; at < lines.length; at += 1) {
		const line = lines[at] ?? "";
		if (line.startsWith("```")) {
			flush();
			const body: string[] = [];
			for (at += 1; at < lines.length && !(lines[at] ?? "").startsWith("```"); at += 1) body.push(lines[at] ?? "");
			chunks.push({ kind: "fence", text: body.join("\n") });
			continue;
		}
		if (line.trim() === "") {
			flush();
			continue;
		}
		const bullet = /^\s*([-*])\s+(.*)$/.exec(line);
		const number = /^\s*(\d+)\.\s+(.*)$/.exec(line);
		if (bullet !== null || number !== null) {
			flush();
			chunks.push({
				kind: "item",
				marker: bullet !== null ? "•" : `${number?.[1]}.`,
				spans: spansOf(bullet?.[2] ?? number?.[2] ?? ""),
			});
			continue;
		}
		if (line.startsWith(">")) {
			flush();
			chunks.push({ kind: "quote", spans: spansOf(line.replace(/^>\s?/, "")) });
			continue;
		}
		paragraph.push(line.trim());
	}
	flush();
	return chunks;
}

/** every character the render will draw, so the live tail can be found from the end */
function drawn(chunks: readonly Chunk[]): number {
	return chunks.reduce(
		(total, chunk) =>
			total + (chunk.kind === "fence" ? chunk.text.length : chunk.spans.reduce((sum, span) => sum + span.text.length, 0)),
		0,
	);
}

/* ---------- the word rule (#163) ----------
 * A word is wrapped only while it is arriving, and the wrapper is a **plain inline span**.
 *
 * Both halves of that are corrections, and both were measured on `agent-say-settle` rather
 * than argued. What stood here until this ticket was `inline-block whitespace-pre` on
 * *every* word, live or settled, on the stated grounds that a word boundary is a space and
 * so nothing is lost by breaking there. **A word is not only its width.**
 *
 * `white-space: pre` is `text-wrap: nowrap` inside the box, so a wrapped word cannot break
 * *inside itself* — and this corpus is full of words that should: `'kaffe-receipt-copy'`,
 * `finance/service-design`, `design/shared/tokens.css`. Raw text breaks them after the
 * hyphen or the slash; the wrapped one cannot, so it pushes the whole token to the next
 * line. Measured over the four samples across twelve column widths: the old span broke the
 * prose differently from raw text at 3, 8 and 9 of 12 widths, **including the rail's own
 * 392px**, where the long message puts word #102 on a different line and leaves a visibly
 * short one above it. The height and the line count never changed — the reflow is lateral,
 * which is why nobody caught it by looking at a total.
 *
 * `inline-block` turned out to be doing nothing at all: an inline span carrying only
 * `white-space: pre` diverges at exactly the same widths, and no word's advance ever
 * differed from a bare word's by as much as half a pixel. A plain span diverges at 0 widths
 * for the mid-length message and at none at all at 392px, and it splits the same word raw
 * splits.
 *
 * So a settled word gets no span, which makes the answer to *what a settled message leaves
 * behind* the same DOM a plain markdown render leaves: 74 elements for the 3,372-character
 * message rather than 633. Nothing has to be unwrapped at a finish line, because the live
 * window is the only thing that was ever wrapped and its trailing edge is free to move.
 */

/**
 * `fade` is 170ms because that is where the sourced numbers land, not because it looked
 * right at 260 (#149). Streamdown — the one shipped library doing per-word animation on
 * streaming markdown — defaults to **150ms** and recommends 200–300 only for streams faster
 * than this one; Kowalski's rule is under 300ms, with ease-out for anything entering,
 * *"because it accelerates at the beginning which gives the user a feeling of
 * responsiveness"*. `ARRIVE` is already that shape. 260 was the top of the sensible band and
 * the drain leaves less room than before: a word must finish well inside the ~1.2s it stays
 * inside the live window, and at 260ms four words are mid-fade at once against two at 170.
 */
const UNIT: Record<"fade" | "blur", { from: Record<string, unknown>; to: Record<string, unknown>; ms: number }> = {
	fade: { from: { opacity: 0 }, to: { opacity: 1 }, ms: 170 },
	blur: { from: { opacity: 0, filter: "blur(3px)" }, to: { opacity: 1, filter: "blur(0px)" }, ms: 320 },
};

/**
 * A run of text where the trailing `live` characters are arriving.
 *
 * `from` is how many drawn characters precede this run, so distance-from-the-end is
 * absolute across the whole message rather than per span — which is what lets `edge`
 * and `soften` ramp across a paragraph boundary without restarting.
 */
function Run({
	text,
	from,
	total,
	live,
	mode,
	still,
}: {
	text: string;
	from: number;
	total: number;
	live: number;
	mode: Arrival;
	still: boolean;
}) {
	if (mode === "none" || still) return <>{text}</>;
	const start = total - live;
	/*
	 * Whitespace is never wrapped, and that is not a nicety.
	 *
	 * A span holding a single space keeps that space from collapsing at a soft-wrap
	 * opportunity, so every line whose break lands on one begins with a visible indent and
	 * the paragraph looks ragged down its left edge. Spaces are invisible anyway, so nothing
	 * is lost by leaving them as raw text — and the word boundaries they create are exactly
	 * where breaking shaping costs nothing.
	 */
	let at = from;
	return (
		<>
			{text.split(/(\s+)/).map((piece, index) => {
				const pos = at;
				at += piece.length;
				if (piece === "") return null;
				if (piece.trim() === "") return piece;
				const key = `${pos}-${index}`;
				// how far this word's start sits from the live edge, in drawn characters
				const back = total - pos;
				const settled = live <= 0 || pos + piece.length <= start;
				// a settled word is text rather than an element: see the word rule above
				if (settled) return piece;
				if (mode === "edge" || mode === "soften")
					return (
						<span
							key={key}
							style={{
								opacity: 1 - 0.92 * Math.max(0, Math.min(1, 1 - back / RAMP)),
								...(mode === "soften"
									? { filter: `blur(${(Math.max(0, Math.min(1, 1 - back / BLUR_RAMP)) * 2.6).toFixed(2)}px)` }
									: {}),
							}}
						>
							{piece}
						</span>
					);
				const spec = UNIT[mode];
				return (
					<motion.span
						key={key}
						initial={spec.from}
						animate={spec.to}
						transition={{ duration: spec.ms / 1000, ease: ARRIVE }}
					>
						{piece}
					</motion.span>
				);
			})}
		</>
	);
}

/**
 * The live end marker: one static bar, and the *static* is the decision (#149).
 *
 * That the caret survives at all is because the pace stalls. Every fade completes during a
 * pause — 13 mid-stream stalls under jittered gaps, median 200ms against a 170ms fade — so
 * thirteen times a message the caret is the only thing separating *still writing* from
 * *done*. Gating it on stillness was priced and rejected: at a 300ms threshold it would
 * appear three times in twenty seconds rather than flicker, but it would arrive *because*
 * nothing was happening and pull the eye to the least interesting moment in the turn.
 *
 * **It blinked until this ticket, and nothing that ships blinks.** Of thirteen chat surfaces
 * read at the source, not one draws a blinking caret at the live edge of streaming text. The
 * only two that combine a caret with a per-word fade — Streamdown and assistant-ui, which
 * wraps it — both draw a **static** glyph; Streamdown's own docs call it blinking and its CSS
 * contains no blink keyframe. LibreChat draws a static `⬤`. Cline built a 1Hz blinking block,
 * wrote the story for it, and then passes `showCursor={false}` everywhere in the live path.
 * Aider *hides* the terminal cursor while generating.
 *
 * And the standard names it. WCAG 2.2.2 lists **blinking** beside moving and scrolling under
 * the same five-second trigger, so a caret blinking through a twenty-second message obliges a
 * pause/stop/hide mechanism — and the exemption for blinking that is *essential* is the one
 * argument not available here, because the fade above is already a liveness signal and so
 * proves the blink is not essential. A CSS-animated caret also silently defeats macOS's own
 * "Prefer non-blinking cursor" setting, which is a user who has explicitly asked for this to
 * stop. Static costs nothing: a bar that is simply present says *more is coming* for as long
 * as it is there, which is exactly as long as the answer needs it to.
 */
export function Caret() {
	return (
		<span
			className="ml-[3px] inline-block h-[12px] w-[2px] translate-y-[1px] rounded-[1px] bg-text/70 align-baseline"
			aria-hidden="true"
		/>
	);
}

/**
 * The agent's prose, rendered, with an optional live tail.
 *
 * `live` is a count of trailing drawn characters still arriving. Zero renders finished
 * prose and is what a settled transcript and a restored one both pass.
 */
export function Said({
	text,
	live = 0,
	arrival = "none",
	caret,
}: {
	text: string;
	live?: number;
	arrival?: Arrival;
	/**
	 * The live end marker, drawn *inside* the last block rather than after it.
	 *
	 * Rendered prose is a stack of block elements, so a caret handed in as a sibling
	 * lands on a line of its own under the paragraph it belongs to and reads as an
	 * empty next paragraph. It has to be inline in the final block, and in a fence it
	 * has to be inside the `<pre>`.
	 */
	caret?: ReactNode;
}) {
	const still = useReducedMotion() === true;
	const chunks = chunksOf(text);
	const total = drawn(chunks);
	let seen = 0;
	const run = (value: string): ReactNode => {
		const node = <Run text={value} from={seen} total={total} live={live} mode={arrival} still={still} />;
		seen += value.length;
		return node;
	};
	const spans = (list: readonly Span[]) => (
		<>
			{list.map((span, at) => {
				const key = `${at}-${span.text.slice(0, 12)}`;
				if (span.code === true)
					return (
						<code
							key={key}
							className={cn(
								"rounded-xs bg-surface px-[3px] py-px font-mono text-2xs",
								span.bold === true ? "text-text" : "text-text/85",
							)}
						>
							{run(span.text)}
						</code>
					);
				if (span.bold === true)
					return (
						<strong key={key} className="font-medium text-text">
							{run(span.text)}
						</strong>
					);
				return <span key={key}>{run(span.text)}</span>;
			})}
		</>
	);

	return (
		<div className="flex flex-col gap-2 text-base text-text/90 leading-base">
			{chunks.map((chunk, at) => {
				const key = `${at}-${chunk.kind}`;
				const end = at === chunks.length - 1 ? caret : null;
				if (chunk.kind === "fence")
					return (
						<pre
							key={key}
							className="pages-scrollbar overflow-x-auto rounded-sm border border-border bg-surface px-2.5 py-2 font-mono text-2xs text-text/80 leading-4"
						>
							{run(chunk.text)}
							{end}
						</pre>
					);
				if (chunk.kind === "quote")
					return (
						<p key={key} className="border-border-raised border-l-2 pl-2.5 text-text/70">
							{spans(chunk.spans)}
							{end}
						</p>
					);
				if (chunk.kind === "item")
					return (
						<p key={key} className="flex gap-2 pl-0.5">
							{/* the one glyph in the block that is the renderer's rather than the agent's, and
								marked as such: a word count over this prose has to skip it */}
							<span data-marker="" className="shrink-0 text-muted/70 tabular-nums">
								{chunk.marker}
							</span>
							<span>
								{spans(chunk.spans)}
								{end}
							</span>
						</p>
					);
				return (
					<p key={key}>
						{spans(chunk.spans)}
						{end}
					</p>
				);
			})}
		</div>
	);
}

/* ---------- a unit at a time ----------
 * The take that stops showing the stream. Text still arriving cannot be read, so drawing it
 * is motion the reader waits out anyway; a unit is held until it is whole and then arrives
 * the way a row does, a box opening to its height over 260ms with the words rising into it.
 *
 *   whole      the unit is the paragraph. Whole once the next paragraph has begun, or the
 *              message has ended. A caret alone between paragraphs says more is coming.
 *   sentence   the unit is the sentence, inside prose paragraphs only: a fence or a list
 *              item stays a paragraph. Finer grain, less wait, the same rule.
 *   ghost      the arriving paragraph is drawn as it streams but dimmed to shape, and comes
 *              up to full strength when it is whole. Something to look at, nothing to read.
 *
 * A fence is never split: blank lines inside one are its own, and a half fence renders as a
 * swallowed message. Blank lines are counted against open fences before a break is honoured.
 */
export type UnitMode = "whole" | "sentence" | "ghost";

const OPEN_MS = 0.34;

/** paragraphs of `text`, with fences kept whole */
function paragraphsOf(text: string): string[] {
	const out: string[] = [];
	let held = "";
	let fenced = false;
	for (const part of text.split(/\n\n+/)) {
		const ticks = (part.match(/```/g) ?? []).length;
		if (fenced) {
			held += `\n\n${part}`;
			if (ticks % 2 === 1) {
				fenced = false;
				out.push(held);
				held = "";
			}
			continue;
		}
		if (ticks % 2 === 1) {
			fenced = true;
			held = part;
			continue;
		}
		out.push(part);
	}
	if (held !== "") out.push(held);
	return out;
}

/** a prose paragraph split at sentence ends; anything with structure is left as one unit */
function sentencesOf(paragraph: string): string[] {
	if (paragraph.startsWith("```") || /^\s*([-*]|\d+\.)\s/.test(paragraph) || paragraph.startsWith(">")) return [paragraph];
	return paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9"'`*])/);
}

/** the least two units are apart, so two completing in one delta land as two arrivals */
const UNIT_GAP_MS = 700;
/** the caret's own line, which is what the first unit opens out of */
const CARET_LINE = 20;

export function Paragraphs({
	text,
	finished,
	mode,
	caret,
}: {
	/** what has landed so far, or the whole message once `finished` */
	text: string;
	finished: boolean;
	mode: UnitMode;
	/** the live marker, at the end of the last whole unit while more is coming */
	caret?: ReactNode;
}) {
	const still = useReducedMotion() === true;
	/**
	 * When each unit was let onto the screen, by key. A unit is whole when the wire says so,
	 * and released at that moment or `UNIT_GAP_MS` after the unit before it, whichever is
	 * later: the wire delivers two paragraphs in one delta often enough that without the gap
	 * they land as one block, which is the step this take exists to remove.
	 */
	const released = useRef(new Map<string, number>());
	const [, wake] = useState(0);
	const now = still ? Number.POSITIVE_INFINITY : performance.now();

	const paragraphs = paragraphsOf(text);
	const units: { key: string; text: string; whole: boolean; gap: boolean }[] = [];
	paragraphs.forEach((paragraph, at) => {
		const lastParagraph = at === paragraphs.length - 1;
		const pieces = mode === "sentence" ? sentencesOf(paragraph) : [paragraph];
		pieces.forEach((piece, index) => {
			const lastPiece = index === pieces.length - 1;
			units.push({
				key: `${at}-${index}`,
				text: piece,
				// whole once the text after it has begun, which is when its break landed
				whole: finished || !lastParagraph || !lastPiece,
				gap: index === 0 && at > 0,
			});
		});
	});

	let last = 0;
	for (const at of released.current.values()) last = Math.max(last, at);
	let next: number | null = null;
	for (const unit of units) {
		if (!unit.whole) continue;
		let at = released.current.get(unit.key);
		if (at === undefined) {
			at = still ? 0 : Math.max(now, last + UNIT_GAP_MS);
			released.current.set(unit.key, at);
		}
		last = Math.max(last, at);
		if (at > now && (next === null || at < next)) next = at;
	}
	// wake exactly when the next held unit is due, and not before
	useEffect(() => {
		if (next === null) return;
		const timer = window.setTimeout(() => wake((n) => n + 1), Math.max(0, next - performance.now()));
		return () => window.clearTimeout(timer);
	}, [next]);

	const out = (unit: (typeof units)[number]) => unit.whole && (released.current.get(unit.key) ?? Number.POSITIVE_INFINITY) <= now;
	const shown = mode === "ghost" ? units.filter((unit) => !unit.whole || out(unit)) : units.filter(out);
	const lastOut = [...shown].reverse().find(out);
	/** something is still to come: not landed, not whole, or whole and held */
	const more = !finished || shown.length < units.length;
	/** the caret stands on a line of its own only until there is a unit to stand at the end of */
	const alone = more && lastOut === undefined && !(mode === "ghost" && shown.some((unit) => !unit.whole));

	return (
		<div className="flex flex-col">
			{shown.map((unit, index) => {
				const settled = out(unit);
				// the caret rides the end of the last whole unit, or the ghost's arriving one, so
				// the message ending removes a glyph and never a line
				const tail = (mode === "ghost" && !unit.whole) || (more && unit === lastOut && !shown.some((seen) => !seen.whole)) ? caret : undefined;
				const inner = (
					<div className={cn(unit.gap ? "pt-2" : index === 0 ? undefined : "pt-1")}>
						<div className={cn(mode === "ghost" && "transition-opacity duration-300", mode === "ghost" && !settled && "opacity-30")}>
							<Said text={closedText(unit.text)} caret={tail} />
						</div>
					</div>
				);
				// a ghost paragraph is already on screen while it arrives, so it has no open to
				// perform: it only comes up. A whole unit arriving is a row arriving
				if (still || (mode === "ghost" && !unit.whole)) return <div key={unit.key}>{inner}</div>;
				return (
					<motion.div
						key={unit.key}
						className="overflow-hidden"
						// the first unit opens out of the caret's own line rather than out of nothing,
						// so the line it replaces never reads as the log dropping
						initial={{ height: index === 0 ? CARET_LINE : 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						transition={{ height: { duration: OPEN_MS, ease: ARRIVE }, opacity: { duration: 0.22, ease: "linear" } }}
					>
						<motion.div initial={{ y: 6 }} animate={{ y: 0 }} transition={{ duration: 0.34, ease: ARRIVE }}>
							{inner}
						</motion.div>
					</motion.div>
				);
			})}
			{alone && caret !== undefined ? (
				<div className="flex items-center" style={{ height: CARET_LINE }}>
					{caret}
				</div>
			) : null}
		</div>
	);
}
