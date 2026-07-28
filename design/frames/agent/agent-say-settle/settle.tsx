import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { chunksOf, Said } from "../../../shared/ui/spool-say";
import { cn } from "../../../shared/lib/utils";

/**
 * The rig behind `agent-say-settle` (#163): the same prose, drawn four ways, measured.
 *
 * `Said` renders one of these — `block` — and cannot render the others, so the comparison
 * needs a rig. It mirrors `Said`'s markup line for line and takes its blocks from the same
 * exported `chunksOf`, so the only thing that varies between columns is what a word is
 * wrapped in. **`block` is also drawn as a control**: it must measure identically to
 * `Said` itself, and the sheet checks that rather than assuming it.
 */

type Chunk = ReturnType<typeof chunksOf>[number];
type Span = Extract<Chunk, { readonly spans: unknown }>["spans"][number];

/**
 * The four treatments, and they are chosen to isolate a cause rather than to offer taste.
 *
 * `block` is what ships. It carries two independent reasons a word cannot break: an
 * `inline-block` is an atomic inline-level box, and `white-space: pre` sets `text-wrap:
 * nowrap` inside it. `nowrap` keeps only the second, `inline` keeps neither. So the three
 * of them read out which half of `WORD` — if either — is what moves the text.
 */
export type Unit = "raw" | "block" | "nowrap" | "inline" | "nodes";

/**
 * The two shipped states, measured rather than reasoned about.
 *
 * `said` is `Said` settled and `live` is `Said` with the real 150-character window open, so
 * the sheet reads the renderer as it actually is instead of a rig standing in for it. `live`
 * is the one that matters most and the one no other column can express: half the message
 * wrapped, half of it not, which is what the reader looks at for twenty seconds.
 *
 * The rig kept its own `block` column after the decision because `Said` can no longer draw
 * it — and before the change, `block` measured 0.0px of height and 0 elements apart from
 * `Said`, which is what earns it the right to stand for what the renderer used to do.
 */
export type Cell = Unit | "said" | "live";

const BOX: Record<Exclude<Unit, "raw" | "nodes">, string> = {
	block: "inline-block whitespace-pre",
	nowrap: "whitespace-pre",
	inline: "",
};

export const UNIT_NOTE: Record<Cell, string> = {
	raw: "no span at all — one text node per markdown run",
	block: "inline-block whitespace-pre — what every word carried before this ticket",
	nowrap: "the same span without inline-block: white-space alone",
	inline: "a plain span — display untouched, opacity still animatable",
	nodes: "no span either, but a text node per word — what a settled message is now",
	said: "`Said` settled: the shipped renderer with nothing arriving",
	live: "`Said` mid-stream: the real 150-character window open over the tail",
};

/** every word its own span, or its own text node, or the run left as one text node */
function Tokens({ text, unit }: { text: string; unit: Unit }) {
	if (unit === "raw") return <>{text}</>;
	return (
		<>
			{text.split(/(\s+)/).map((piece, index) => {
				if (piece === "") return null;
				// whitespace is never wrapped, exactly as `Run` leaves it — a wrapped space does
				// not collapse at a soft wrap and every broken line starts with an indent
				if (piece.trim() === "") return piece;
				const key = `${index}-${piece}`;
				// what `Run` now returns for a settled word: the string, which React commits as a
				// text node of its own. Measured rather than assumed, because a run split into
				// many adjacent text nodes is not obviously the same thing as one text node.
				if (unit === "nodes") return piece;
				if (unit === "inline") return <span key={key}>{piece}</span>;
				return (
					<span key={key} className={BOX[unit]}>
						{piece}
					</span>
				);
			})}
		</>
	);
}

/** `Said`'s markup with the word wrapper swapped out, and nothing else changed */
export function Prose({ text, unit }: { text: string; unit: Unit }) {
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
							<Tokens text={span.text} unit={unit} />
						</code>
					);
				if (span.bold === true)
					return (
						<strong key={key} className="font-medium text-text">
							<Tokens text={span.text} unit={unit} />
						</strong>
					);
				return (
					<span key={key}>
						<Tokens text={span.text} unit={unit} />
					</span>
				);
			})}
		</>
	);

	return (
		<div className="flex flex-col gap-2 text-base text-text/90 leading-base">
			{chunksOf(text).map((chunk, at) => {
				const key = `${at}-${chunk.kind}`;
				if (chunk.kind === "fence")
					return (
						<pre
							key={key}
							className="pages-scrollbar overflow-x-auto rounded-sm border border-border bg-surface px-2.5 py-2 font-mono text-2xs text-text/80 leading-4"
						>
							<Tokens text={chunk.text} unit={unit} />
						</pre>
					);
				if (chunk.kind === "quote")
					return (
						<p key={key} className="border-border-raised border-l-2 pl-2.5 text-text/70">
							{spans(chunk.spans)}
						</p>
					);
				if (chunk.kind === "item")
					return (
						<p key={key} className="flex gap-2 pl-0.5">
							{/* the marker is the renderer's own glyph rather than the agent's word, so the
							    measurement skips it: `Said` does not wrap it either */}
							<span data-marker="" className="shrink-0 text-muted/70 tabular-nums">
								{chunk.marker}
							</span>
							<span>{spans(chunk.spans)}</span>
						</p>
					);
				return <p key={key}>{spans(chunk.spans)}</p>;
			})}
		</div>
	);
}

/* ---------- measuring ---------- */

interface Token {
	readonly word: string;
	/** where the word starts: the first of its line fragments */
	readonly left: number;
	readonly top: number;
	/** the whole advance, summed over fragments, so a word that broke is still comparable */
	readonly width: number;
	/** every line box this word put ink on */
	readonly tops: readonly number[];
	/** true when the browser broke the word itself across lines */
	readonly split: boolean;
}

/**
 * Every word in a subtree, as the browser actually placed it.
 *
 * One code path for all four units, and that is the point: the tokens come from the text
 * nodes rather than from the spans, so a column with no spans in it is tokenised exactly
 * the same way as one with a span per word. A `Range` over the characters measures the same
 * box a span would report, so the two are comparable without special-casing either.
 *
 * **Per fragment rather than per bounding box, and that correction is the whole of the
 * first pass being wrong.** `getBoundingClientRect` on a word the browser broke across two
 * lines returns the *union* of both halves — a box as wide as the column — so the first
 * reading of this sheet said one word differed by 243.8px when what had actually happened
 * was that raw text broke `'kaffe-receipt-copy'` after its hyphen and the wrapped one could
 * not. `getClientRects` gives one rect per line fragment instead: their count says whether
 * the word broke, their sum is the advance either way, and the first of them is where the
 * word starts.
 */
function tokensIn(root: HTMLElement): readonly Token[] {
	const found: Token[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.dataset.marker === undefined ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
	});
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const text = node.nodeValue ?? "";
		const finder = /\S+/g;
		for (let hit = finder.exec(text); hit !== null; hit = finder.exec(text)) {
			const range = document.createRange();
			range.setStart(node, hit.index);
			range.setEnd(node, hit.index + hit[0].length);
			const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0);
			const first = rects[0];
			if (first === undefined) continue;
			found.push({
				word: hit[0],
				left: first.left,
				top: first.top,
				width: rects.reduce((sum, rect) => sum + rect.width, 0),
				tops: rects.map((rect) => rect.top),
				split: rects.length > 1,
			});
		}
	}
	return found;
}

/**
 * How many line boxes the prose occupies.
 *
 * Counted off the ink rather than off the markup, because a soft wrap leaves no node
 * behind. Every fragment top is clustered with a 10px tolerance: a line is 20px, so
 * neighbouring lines never merge, while an inline `code` run — 10px type sitting about 4px
 * lower inside the same line box — never counts as a line of its own.
 */
function lineCount(tokens: readonly Token[]): number {
	const tops = [...new Set(tokens.flatMap((token) => token.tops))].sort((a, b) => a - b);
	let lines = 0;
	let last: number | undefined;
	for (const top of tops) {
		if (last === undefined || top - last > 10) lines += 1;
		last = top;
	}
	return lines;
}

/**
 * Which line each word landed on.
 *
 * Read off the geometry rather than the markup, because the markup does not know: a line
 * break inside a paragraph leaves no node behind. A word starts a new line when its left
 * edge goes backwards, or when it drops far enough to have crossed a block boundary — the
 * second is needed because a new paragraph can begin at the same left edge as the last
 * word of the one before it, and a 6px floor keeps an inline `code` run, which sits about
 * 2px lower at 10px, from reading as a line of its own.
 */
function linesOf(tokens: readonly Token[]): readonly number[] {
	let line = 0;
	let last: Token | undefined;
	return tokens.map((token) => {
		if (last !== undefined && (token.left < last.left - 0.5 || token.top > last.top + 6)) line += 1;
		last = token;
		return line;
	});
}

export interface Reading {
	readonly unit: Cell;
	readonly height: number;
	readonly lines: number;
	/** elements in the subtree: the DOM a settled message leaves behind */
	readonly nodes: number;
	readonly words: number;
	/** words the browser broke across lines, inside the word */
	readonly split: number;
	/** words whose advance differs from the same word as raw text by more than 1/20 of a pixel */
	readonly widthOff: number;
	/** the worst of those, in px */
	readonly worstWidth: number;
	/** the first word that lands on a different line than it does raw, or -1 */
	readonly breakOff: number;
	/** the word itself, so the sheet can name what moved */
	readonly breakWord: string;
	/** false when the columns did not tokenise the same, which would make every other number here noise */
	readonly aligned: boolean;
	/** the widths in the sweep at which this unit breaks the prose differently from raw */
	readonly divergent: readonly number[];
	/**
	 * The worst height difference from raw anywhere in the sweep.
	 *
	 * The column that separates *a word swapped lines* from *the block gained a line*: a break
	 * can move without changing the total, and only one of those two is a reader watching
	 * prose reflow.
	 */
	readonly worstHeight: number;
}

export type Readings = Readonly<Record<string, readonly Reading[]>>;

/** one column's geometry, against raw's */
function compare(unit: Cell, root: HTMLElement, raw: readonly Token[], rawLines: readonly number[]): Omit<Reading, "divergent"> {
	const tokens = tokensIn(root);
	const lines = linesOf(tokens);
	let aligned = tokens.length === raw.length;
	let widthOff = 0;
	let worstWidth = 0;
	let breakOff = -1;
	let breakWord = "";
	for (let at = 0; at < tokens.length; at += 1) {
		const mine = tokens[at];
		const theirs = raw[at];
		if (mine === undefined || theirs === undefined) break;
		if (mine.word !== theirs.word) aligned = false;
		const off = Math.abs(mine.width - theirs.width);
		if (off > 0.05) widthOff += 1;
		worstWidth = Math.max(worstWidth, off);
		if (breakOff === -1 && lines[at] !== rawLines[at]) {
			breakOff = at;
			breakWord = mine.word;
		}
	}
	return {
		unit,
		height: root.getBoundingClientRect().height,
		lines: lineCount(tokens),
		nodes: root.querySelectorAll("*").length,
		words: tokens.length,
		split: tokens.filter((token) => token.split).length,
		widthOff,
		worstWidth,
		breakOff,
		breakWord,
		aligned,
	};
}

export interface Sample {
	readonly id: string;
	readonly note: string;
	readonly text: string;
}

export const UNITS: readonly Cell[] = ["raw", "block", "nowrap", "inline", "nodes", "said", "live"];
/** every cell is both a candidate and a reading, so the sweep measures the list as it stands */
const CELLS: readonly Cell[] = UNITS;
/** how much of a message `Said` treats as still arriving, matching the rail's own window */
const LIVE_TAIL = 150;

/**
 * The rig: every sample in every unit, mounted once, then walked across the sweep and
 * measured — and it does the whole walk in one blocking pass rather than a render per width.
 *
 * **A render per width was the first shape and it does not finish.** Twelve passes of
 * fourteen thousand spans is twelve React commits, twelve style recalcs and twelve paints,
 * which takes longer than the 300ms `spool shot` settles for — so the screenshot caught the
 * sheet still measuring. Resizing the cells through `style.width` instead keeps React out of
 * it: the loop writes a width, reads a rect, and the read forces exactly the layout it
 * needs. Nothing paints in between, and blocking the thread is a *feature* here, since the
 * shot cannot fire until the pass is done.
 *
 * Two things it waits for. `document.fonts.ready`, because measured against a fallback face
 * every number here would be a number about Helvetica; and the sample list to stop changing.
 * **Both fixture loads, not one**: the samples come from two captures and `useCapture`
 * fetches, so the list arrives in pieces — gating on merely non-empty measured the first
 * three samples and declared itself finished before `claude-fanout` had landed. So the sweep
 * is keyed to the list it measured rather than to a flag, and a new list re-runs it.
 */
export function Sweep({
	samples,
	widths,
	real,
	onDone,
}: {
	samples: readonly Sample[];
	widths: readonly number[];
	/** the width whose full reading is reported: the rail's own text column */
	real: number;
	onDone: (readings: Readings) => void;
}) {
	const [ready, setReady] = useState(false);
	const [measured, setMeasured] = useState<readonly Sample[] | null>(null);
	const box = useRef<HTMLDivElement>(null);
	/** the rig stands exactly while there is a sample list nobody has measured yet */
	const up = ready && samples.length > 0 && measured !== samples;

	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) setReady(true);
		});
		return () => {
			live = false;
		};
	}, []);

	useLayoutEffect(() => {
		if (!up) return;
		const root = box.current;
		if (root === null) return;
		const cells = [...root.querySelectorAll<HTMLElement>("[data-cell]")];
		const at = (id: string): HTMLElement | undefined => cells.find((cell) => cell.dataset.cell === id);
		const collected: Record<string, Reading> = {};
		const divergent: Record<string, number[]> = {};
		const worstHeight: Record<string, number> = {};

		for (const width of widths) {
			for (const cell of cells) cell.style.width = `${width}px`;
			for (const sample of samples) {
				const rawBox = at(`${sample.id}-raw`);
				if (rawBox === undefined) continue;
				const raw = tokensIn(rawBox);
				const rawLines = linesOf(raw);
				const rawHeight = rawBox.getBoundingClientRect().height;
				for (const unit of CELLS) {
					const cell = at(`${sample.id}-${unit}`);
					if (cell === undefined) continue;
					const reading = compare(unit, cell, raw, rawLines);
					const key = `${sample.id}-${unit}`;
					if (width === real) collected[key] = { ...reading, divergent: [], worstHeight: 0 };
					const off = Math.abs(reading.height - rawHeight);
					worstHeight[key] = Math.max(worstHeight[key] ?? 0, off);
					// a width diverges when a word lands on a different line or the block ends up a
					// different height: either one is prose the reader would watch move
					const moved = reading.breakOff !== -1 || off > 0.5;
					if (unit !== "raw" && moved) (divergent[key] ??= []).push(width);
				}
			}
		}

		const out: Record<string, readonly Reading[]> = {};
		for (const [key, reading] of Object.entries(collected))
			out[key] = [{ ...reading, divergent: divergent[key] ?? [], worstHeight: worstHeight[key] ?? 0 }];
		setMeasured(samples);
		onDone(out);
	}, [up, widths, samples, real, onDone]);

	if (!up) return null;
	return (
		/*
		 * Off screen rather than hidden, and that is a constraint rather than a style choice:
		 * `Range.getClientRects()` returns *nothing* for text under `visibility: hidden`, where
		 * `getBoundingClientRect()` returns the real box. The rig sits 20,000px to the left of a
		 * sheet that already clips, which keeps every word laid out and measurable.
		 */
		<div ref={box} className="pointer-events-none absolute top-0 left-[-20000px]" aria-hidden="true">
			{samples.map((sample) => (
				<div key={sample.id} className="flex">
					{CELLS.map((unit) => (
						<div key={unit} data-cell={`${sample.id}-${unit}`} style={{ width: `${real}px` }}>
							{unit === "said" || unit === "live" ? (
								<Said text={sample.text} live={unit === "live" ? LIVE_TAIL : 0} arrival="fade" />
							) : (
								<Prose text={sample.text} unit={unit} />
							)}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

/** a column of prose at a fixed width, clipped, for the standing-up bands */
export function Column({
	label,
	note,
	width,
	height,
	text,
	unit,
	tone,
}: {
	label: string;
	note: string;
	width: number;
	height: number;
	text: string;
	/** `said` draws the shipped renderer rather than the rig, so a band can show what ships */
	unit: Unit | "said";
	tone?: string;
}) {
	return (
		<div className="flex shrink-0 flex-col gap-2" style={{ width: `${width}px` }}>
			<div className="flex h-7 shrink-0 flex-col gap-0.5">
				<span className={cn("font-mono text-sm leading-4", tone ?? "text-muted")}>{label}</span>
				<span className="truncate font-mono text-2xs text-muted/55 leading-3">{note}</span>
			</div>
			<div className="relative overflow-hidden border-border border-x bg-bg px-3.5 pt-3" style={{ height: `${height}px` }}>
				{unit === "said" ? <Said text={text} live={0} arrival="fade" /> : <Prose text={text} unit={unit} />}
				<span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg to-transparent" />
			</div>
		</div>
	);
}

export function Head({ title, note }: { title: string; note: string }) {
	return (
		<div className="flex shrink-0 items-baseline gap-3 border-border border-y bg-surface/40 px-5 py-1.5">
			<span className="font-mono text-sm text-text leading-4">{title}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/70 leading-3">{note}</span>
		</div>
	);
}

export function Sheet({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{children}
		</div>
	);
}
