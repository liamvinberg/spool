import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { type Chunk, chunksOf, type Span } from "./agent-markdown";
import { closedText } from "./agent-markers";

/**
 * The agent's own words, rendered (#148, #163, #195), and how they arrive: a paragraph at
 * a time (#149).
 *
 * `Said` draws a settled run of markdown and leaves the DOM raw text would leave: a word
 * contributes no element, the block stack and one wrapper per markdown run are all there
 * is. Nothing here is ever a partial message, because the rail stopped drawing the
 * stream: text still arriving cannot be read, so drawing it was motion the reader waited
 * out anyway. `Paragraphs` holds a paragraph until it is whole and then lets it arrive
 * the way a row does, opening into the log with the words rising into it.
 */

/**
 * The live end marker: one static bar, and the *static* is the decision (#149).
 *
 * It rides the end of the last whole paragraph while more is coming, and stands alone on
 * a line of its own before the first paragraph is whole. Nothing that ships blinks one:
 * of thirteen chat surfaces read at the source, zero blink at the live edge. WCAG 2.2.2
 * also lists blinking beside moving and scrolling under the same five-second trigger, so
 * a caret blinking through a twenty-second message would owe a pause mechanism. A CSS
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
 * A paragraph's text never changes once it is whole, and the log around it re-renders on
 * every tick of the rail's clock while a turn runs, so the memo is what lets a settled
 * paragraph sit out the whole of the turn after its own arrival.
 */
export const Said = memo(function Said({ text, caret }: { text: string; caret?: ReactNode }) {
	const chunks = chunksOf(text);
	/*
	 * A span is one element carrying whatever its markers added, rather than one element
	 * per marker. Nesting them would wrap an emphasised path in three tags to say what
	 * two classes say (#163).
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
							{span.text}
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
							{span.text}
						</a>
					);
				}
				if (span.bold === true) {
					return (
						<strong key={key} className={cn("font-medium text-text", face)}>
							{span.text}
						</strong>
					);
				}
				return (
					<span key={key} className={face}>
						{span.text}
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
							{chunk.text}
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

/* ---------- a paragraph at a time (#149) ----------
 * The rail drew the stream, per word, through a drain that paced the wire's chunks into a
 * cadence. Text still arriving cannot be read, so all of that was motion the reader waited
 * out anyway; and a message gaining a line gained it at once under the reader, which is the
 * step the rows had already stopped making. So the unit is the paragraph: held until it is
 * whole, then arriving the way a row does, a box opening to its height with the words
 * rising into it. A caret alone between paragraphs says more is coming.
 *
 * A paragraph is whole when the text after it has begun, which is when its break landed,
 * or when the message has ended. A fence is never split: blank lines inside one are its
 * own, and a half fence renders as a swallowed message, so blank lines are counted against
 * open fences before a break is honoured. */

/** paragraphs of `text`, with fences kept whole; an empty run between two breaks is not one */
export function paragraphsOf(text: string): string[] {
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
	return out.filter((paragraph) => paragraph.trim() !== "");
}

/**
 * The least two paragraphs are apart, so two completing in one delta land as two arrivals.
 *
 * The wire delivers two paragraphs in one delta often enough that without the gap they
 * land as one block, which is the step this exists to remove: a burst becomes a cadence.
 */
export const UNIT_GAP_MS = 700;
/** the caret's own line, which is what the first paragraph opens out of */
const CARET_LINE = 20;
/** a paragraph that was whole when this mounted: drawn settled, never arriving, gating nothing */
const SETTLED = Number.NEGATIVE_INFINITY;

/**
 * The agent's prose, a paragraph at a time.
 *
 * `text` is what has landed, and `finished` says the message is over, so the last
 * paragraph is whole too. Every paragraph that is whole when this mounts is drawn settled
 * at once — a restored thread, a thread switched back to and a message that arrived whole
 * are all pictures rather than arrivals — and only a paragraph that becomes whole while
 * this is on screen arrives. Under stillness everything landed is drawn settled and no
 * caret says more is coming: the arrival is what the reader asked not to see, and the
 * updates are not.
 *
 * The open is CSS: a grid row going from no height to its own, the words rising into it.
 * Nothing here re-renders per frame; a render happens when the wire moves and when a held
 * paragraph comes due, and never otherwise.
 */
export function Paragraphs({
	text,
	finished,
	still,
	caret,
}: {
	text: string;
	finished: boolean;
	/** the reader asked for stillness, so nothing is held and nothing opens */
	still: boolean;
	/** the live marker, at the end of the last whole paragraph while more is coming */
	caret?: ReactNode;
}) {
	/**
	 * When each paragraph was let onto the screen, by index. A paragraph is whole when the
	 * wire says so, and released at that moment or `UNIT_GAP_MS` after the paragraph before
	 * it, whichever is later. `SETTLED` is a paragraph that was already whole at mount, which is
	 * drawn without arriving.
	 */
	const released = useRef(new Map<number, number>());
	const mounted = useRef(false);
	const [, wake] = useState(0);
	const now = performance.now();

	const paragraphs = paragraphsOf(text);
	const whole = (at: number) => finished || at < paragraphs.length - 1;
	/** the latest arrival so far; a picture drawn at mount is not one, so it gates nothing */
	let last: number | null = null;
	for (const at of released.current.values()) if (Number.isFinite(at)) last = last === null ? at : Math.max(last, at);
	let next: number | null = null;
	if (!still) {
		paragraphs.forEach((_, at) => {
			if (!whole(at)) return;
			let when = released.current.get(at);
			if (when === undefined) {
				when = !mounted.current ? SETTLED : last === null ? now : Math.max(now, last + UNIT_GAP_MS);
				released.current.set(at, when);
			}
			if (Number.isFinite(when)) last = last === null ? when : Math.max(last, when);
			if (when > now && (next === null || when < next)) next = when;
		});
	}
	mounted.current = true;
	// wake exactly when the next held paragraph is due, and not before
	useEffect(() => {
		if (next === null) return;
		const timer = window.setTimeout(() => wake((count) => count + 1), Math.max(0, next - performance.now()));
		return () => window.clearTimeout(timer);
	}, [next]);

	if (still) {
		return (
			<div data-agent-paragraphs="">
				<Said text={closedText(text)} />
			</div>
		);
	}

	const out = (at: number) => whole(at) && (released.current.get(at) ?? Number.POSITIVE_INFINITY) <= now;
	const shown = paragraphs.map((paragraph, at) => ({ at, paragraph })).filter(({ at }) => out(at));
	const lastOut = shown[shown.length - 1];
	/** something is still to come: not landed, not whole, or whole and held */
	const more = !finished || shown.length < paragraphs.length;
	/** the caret stands on a line of its own only until there is a paragraph to stand at the end of */
	const alone = more && lastOut === undefined;

	return (
		<div data-agent-paragraphs="" className="flex flex-col">
			{shown.map(({ at, paragraph }, index) => {
				// the caret rides the end of the last whole paragraph, so the message ending
				// removes a glyph and never a line
				const tail = more && at === lastOut?.at ? caret : undefined;
				const inner = (
					<div className={index === 0 ? undefined : "pt-2"}>
						<Said text={closedText(paragraph)} caret={tail} />
					</div>
				);
				// already whole at mount: a picture, not an arrival
				if (released.current.get(at) === SETTLED) {
					return (
						<div key={at} data-agent-paragraph="">
							{inner}
						</div>
					);
				}
				return (
					<div key={at} data-agent-paragraph="" className="grid animate-agent-paragraph">
						{/* the first paragraph opens out of the caret's own line rather than out of
						    nothing, so the line it replaces never reads as the log dropping */}
						<div className={cn("overflow-hidden", index === 0 ? "min-h-5" : "min-h-0")}>
							<div className="animate-agent-rise">{inner}</div>
						</div>
					</div>
				);
			})}
			{alone && caret !== undefined ? (
				<div data-agent-caret-line="" className="flex items-center" style={{ height: CARET_LINE }}>
					{caret}
				</div>
			) : null}
		</div>
	);
}
