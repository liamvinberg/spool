import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Entry, entriesAt, periodOf, SAY, type Script, TURN } from "shared/lib/explore/agent/stream-script";
import { closedText } from "shared/lib/spool/say-markers";
import { cn } from "shared/lib/utils";
import { ChevronIcon, PlusIcon } from "shared/ui/spool/icons";
import { StateMark } from "shared/ui/spool/play-rail";
import { Caret, chunksOf, Paragraphs, Said } from "shared/ui/spool/say";
import { LIVE, THREADS } from "shared/lib/explore/threads/threads-fixture";
import { DockStrip, ThreadDrop, ThreadPlate } from "shared/ui/explore/threads/threads-stage";

/**
 * The agent rail, playing one scripted turn, with two knobs the frames on
 * `explore/agent/say` and `explore/agent/log` set one at a time.
 *
 * `words` is what a character does in the milliseconds after the pace lets it on screen.
 * `log` is what everything already on screen does when something new lands under it.
 * The pace itself is #149's drain in every take and is not in question here.
 *
 *   words   fade    the rail today: each word fades in over 170ms as the edge reaches it
 *           plain   the same edge with the fade taken off, so a word is simply there
 *           pen     the landed text is laid out whole and a mask uncovers it one character
 *                   at a time, so nothing ever re-wraps and the caret rides the edge
 *           soft    the same mask with a 36px feather, so the edge is a gradient rather
 *                   than a glyph, and there is no caret because the edge is the caret
 *           line    a line is uncovered whole once its wrap is final, fading in over 200ms
 *           paragraph  nothing is drawn until a paragraph is whole; it then opens into the
 *                   log the way a row does, and a caret alone says more is being written
 *           sentence   the same rule with the sentence as the unit
 *           ghost      the arriving paragraph streams dimmed to shape and comes up whole
 *
 *   log     cut     the rail today: a row takes its height in the frame it mounts and the
 *                   log snaps up by that much
 *           open    a row opens from no height to its own over 260ms and rises into it
 *           glide   rows land instantly and the picture eases into place: one offset on
 *                   the log, added to by every growth and decaying toward zero
 *           flow    the log's height is the eased number; content is uncovered as the
 *                   space for it opens, prose lines included
 *
 * The mask takes are one mechanism and it is the reason they exist. Rendering the drawn
 * prefix as text means the paragraph is laid out over a string that changes sixty times a
 * second, which is why the rail draws per word and not per character: a word breaking
 * mid-way jumps lines as it grows. Laying out every landed character once and revealing
 * with a mask means the layout is final before the edge reaches it, so the unit can be
 * the character and the per-frame work is one rectangle and one style write. It is also
 * why the mask takes need no reserve: the block is the landed text, which is the height
 * the rail already holds open.
 */
export type Words = "fade" | "plain" | "pen" | "soft" | "line" | "paragraph" | "sentence" | "ghost";
export type Log = "cut" | "open" | "glide" | "flow";

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** the drawn tail the fade take treats as still arriving, the play rail's own number */
const LIVE_TAIL = 150;
/** the soft edge, in px: about five characters at the rail's size */
const FEATHER = 36;
/** how long a line takes to come up, and the least two lines are apart */
const LINE_MS = 200;
const LINE_GAP_MS = 120;
/** the glide's time constant: 95% of the way in about 270ms */
const TAU_MS = 90;

/**
 * Where the loop is, off the wall clock rather than off mount, so every frame on the
 * canvas plays the same instant of the same turn.
 */
function useLoop(still: boolean, period: number): { elapsed: number; run: number } {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (still) return;
		let frame = 0;
		const tick = () => {
			setNow(Date.now());
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [still]);
	if (still) return { elapsed: Number.POSITIVE_INFINITY, run: 0 };
	return { elapsed: now % period, run: Math.floor(now / period) };
}

/**
 * The say loop and its one message, bare, for a sheet that puts the word takes side by
 * side. One clock for the whole sheet: the caller reads it once and hands `elapsed` down,
 * so five columns are five renders of one instant rather than five loops.
 */
export function useSayLoop(): { elapsed: number; run: number; still: boolean } {
	const still = useReducedMotion() === true;
	const loop = useLoop(still, periodOf(SAY));
	return { ...loop, still };
}

export function SayProse({ words, elapsed, still }: { words: Words; elapsed: number; still: boolean }) {
	const entry = entriesAt(elapsed, SAY).find((found) => found.kind === "prose");
	if (entry === undefined || entry.kind !== "prose") return null;
	return <Prose entry={entry} words={words} still={still} />;
}

/** the keyframes the takes share, rendered once by whichever frame holds them */
export const STAGE_CSS = `
@keyframes stage-open { from { grid-template-rows: 0fr; } to { grid-template-rows: 1fr; } }
@keyframes stage-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes stage-fade { from { opacity: 0; } }
.stage-open { animation: stage-open 260ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.stage-in { animation: stage-in 300ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.stage-fade { animation: stage-fade 220ms cubic-bezier(0.22, 0.61, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .stage-open, .stage-in, .stage-fade { animation: none; } }
`;

export function StreamStage({
	words,
	log,
	focus = "turn",
	chrome = "strip",
}: {
	words: Words;
	log: Log;
	/** `say` loops one message and nothing else, so the words are arriving the moment you look */
	focus?: "turn" | "say";
	/** `plate` wears the decided threads plate and the dock strip, for the compile */
	chrome?: "strip" | "plate";
}) {
	const still = useReducedMotion() === true;
	const [listing, setListing] = useState(false);
	const script: Script = focus === "say" ? SAY : TURN;
	const period = periodOf(script);
	const { elapsed, run } = useLoop(still, period);
	const entries = entriesAt(elapsed, script);
	const fading = Number.isFinite(elapsed) && elapsed > period - 360;
	return (
		<div className="flex h-full w-full bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<style>{STAGE_CSS}</style>
			<div className="min-w-0 flex-1" />
			<div className="flex h-full w-[420px] shrink-0 flex-col border-border border-l bg-bg">
				{chrome === "plate" ? (
					<ThreadPlate threads={THREADS} open={LIVE.id} listing={listing} onToggle={() => setListing(!listing)} />
				) : (
					<ThreadStrip title="tidy the receipt and shoot it" live={elapsed < script.turnMs} />
				)}
				<div className={cn("relative min-h-0 flex-1 transition-opacity duration-300", fading ? "opacity-0" : "opacity-100")}>
					<Transcript key={run} entries={entries} log={log} words={words} still={still} />
					{chrome === "plate" && listing ? (
						<ThreadDrop threads={THREADS} open={LIVE.id} onPick={() => setListing(false)} />
					) : null}
				</div>
				<Composer />
			</div>
			{chrome === "plate" ? (
				<DockStrip surface="agent" threads={false} elsewhere={THREADS.filter((thread) => thread.id !== LIVE.id)} />
			) : null}
		</div>
	);
}

function ThreadStrip({ title, live }: { title: string; live: boolean }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-2.5 border-border border-b px-3">
			<span className="flex h-6 w-6 items-center justify-center rounded-sm text-muted/60">
				<PlusIcon className="h-3 w-3" />
			</span>
			<span className="h-4 w-px bg-border-raised" />
			<StateMark state={live ? "running" : "done"} className="ml-1" />
			<span className="truncate font-mono text-sm text-text/85 leading-4">{title}</span>
		</div>
	);
}

function Composer() {
	return (
		<div className="shrink-0 px-3.5 pb-3.5">
			<div className="flex min-h-[104px] flex-col gap-3 rounded-md border border-border-raised bg-surface p-3">
				<div className="flex">
					<span className="flex h-6 items-center gap-1.5 rounded-sm bg-raised px-2 font-mono text-2xs text-text/85 leading-3">
						<span className="h-3 w-[2px] rounded-full bg-thread" />
						cart
					</span>
				</div>
				<span className="font-mono text-sm text-muted/60 leading-4">say what to change</span>
			</div>
		</div>
	);
}

/** consecutive machine work reads as one run, so it sits tighter than a turn boundary */
function gapBefore(previous: Entry | undefined, entry: Entry): number {
	if (previous === undefined) return 0;
	if (previous.kind === "line" && entry.kind === "line") return 6;
	return 14;
}

/**
 * The log, and the one place the `log` knob acts.
 *
 * Every take keeps the shipped rule that the box follows the live end: a size watcher on
 * the content pins the scroll to the bottom whenever the content grows. What differs is
 * whether the growth reaches the eye as a step.
 */
function Transcript({ entries, log, words, still }: { entries: readonly Entry[]; log: Log; words: Words; still: boolean }) {
	const view = useRef<HTMLDivElement>(null);
	const wrap = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the watcher reads refs and the box, nothing rendered
	useEffect(() => {
		const box = view.current;
		const outer = wrap.current;
		const content = body.current;
		if (box === null || outer === null || content === null) return;
		const pin = () => {
			box.scrollTop = box.scrollHeight - box.clientHeight;
		};
		if (still || log === "cut" || log === "open") {
			const watcher = new ResizeObserver(pin);
			watcher.observe(content);
			pin();
			return () => watcher.disconnect();
		}

		/*
		 * glide: `offset` is how far the picture still sits below where layout put it. Every
		 * growth adds to it, every frame takes a fixed fraction off, so a burst of three rows
		 * in a second is one motion and a single row is the same motion at a smaller size.
		 *
		 * flow: `height` is the eased number and the content is uncovered as it opens. The
		 * wrapper clips; the content's own height is what the watcher reads.
		 */
		let offset = 0;
		let seen: number | null = null;
		let height: number | null = null;
		let target = 0;
		let last = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const dt = Math.min(64, now - last);
			last = now;
			const keep = Math.exp(-dt / TAU_MS);
			let moving = false;
			if (log === "glide") {
				offset *= keep;
				if (offset < 0.3) offset = 0;
				else moving = true;
				content.style.transform = offset === 0 ? "" : `translateY(${offset.toFixed(2)}px)`;
			} else if (height !== null) {
				height = target + (height - target) * keep;
				if (Math.abs(target - height) < 0.3) height = target;
				else moving = true;
				outer.style.height = `${height.toFixed(2)}px`;
				pin();
			}
			if (moving) frame = requestAnimationFrame(tick);
			else frame = 0;
		};
		const start = () => {
			if (frame !== 0) return;
			last = performance.now();
			frame = requestAnimationFrame(tick);
		};
		const watcher = new ResizeObserver(() => {
			const grown = content.offsetHeight;
			if (log === "glide") {
				if (seen !== null && grown > seen) {
					offset += grown - seen;
					content.style.transform = `translateY(${offset.toFixed(2)}px)`;
				}
				seen = grown;
				pin();
				start();
				return;
			}
			target = grown;
			if (height === null) {
				height = grown;
				outer.style.height = `${grown}px`;
			}
			pin();
			start();
		});
		watcher.observe(content);
		return () => {
			watcher.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [log, still]);

	const flow = log === "flow" && !still;
	const glide = log === "glide" && !still;
	return (
		<div className="relative flex h-full min-h-0 flex-col overflow-hidden">
			<div ref={view} // scroll anchoring off: Chrome would otherwise re-aim the box every frame the
				// glide moves the content under it, and the two fight
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3.5 pt-6 pb-4 [overflow-anchor:none]">
				{/* `mt-auto` rather than `justify-end`: a flex container that end-justifies its
				    overflow puts the top of it out of reach of the scrollbar. The clip on the
				    glide's outer box is what keeps a translated body from stretching the scroll
				    range: overflow stops propagating at a clipped box, so the row slides in from
				    under the log's own foot rather than from under a longer scrollbar. */}
				<div ref={wrap} className={cn("mt-auto shrink-0", flow && "overflow-hidden", glide && "overflow-clip")}>
					<div ref={body}>
						{entries.map((entry, index) => (
							<Arrive key={entry.key} log={log} still={still} gap={gapBefore(entries[index - 1], entry)}>
								<Row entry={entry} words={words} still={still} />
							</Arrive>
						))}
					</div>
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
		</div>
	);
}

/** what a row does in the frame it mounts, which is the `log` knob's other half */
function Arrive({ log, still, gap, children }: { log: Log; still: boolean; gap: number; children: ReactNode }) {
	if (still) return <div style={{ paddingTop: gap }}>{children}</div>;
	if (log === "open") {
		// the padding rides inside the clipped cell so the gap opens with the row rather
		// than landing ahead of it
		return (
			<div className="stage-open grid">
				<div className="min-h-0 overflow-hidden">
					<div className="stage-in" style={{ paddingTop: gap }}>
						{children}
					</div>
				</div>
			</div>
		);
	}
	if (log === "flow") {
		// the space opening is the motion, so the row only fades: a rise on top of an
		// uncover reads as two gestures for one arrival
		return (
			<div className="stage-fade" style={{ paddingTop: gap }}>
				{children}
			</div>
		);
	}
	return (
		<div className="animate-agent-entry" style={{ paddingTop: gap }}>
			{children}
		</div>
	);
}

function Row({ entry, words, still }: { entry: Entry; words: Words; still: boolean }) {
	if (entry.kind === "user") {
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-base text-text leading-base">{entry.text}</p>
				<span className="truncate font-mono text-2xs text-muted/55 leading-3">{entry.context}</span>
			</div>
		);
	}
	if (entry.kind === "prose") return <Prose entry={entry} words={words} still={still} />;
	return <Line entry={entry} still={still} />;
}

/* ---------- one line ----------
 * mark, verb, subject: the play rail's row, at its sizes. The subject lands a beat after
 * the verb because that is how it arrives on the wire. */
function Line({ entry, still }: { entry: Extract<Entry, { kind: "line" }>; still: boolean }) {
	const expandable = entry.detail || entry.shot;
	return (
		<div className="flex flex-col">
			<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5">
				<StateMark state={entry.state} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span className={cn("shrink-0 font-mono text-sm leading-4", entry.quiet ? "text-muted/70" : "text-muted")}>
						{entry.verb}
					</span>
					{entry.subject === null ? null : (
						<motion.span
							className={cn(
								"min-w-0 truncate font-mono text-sm leading-4",
								entry.quiet ? "text-muted/60 tabular-nums" : "text-text/85",
							)}
							initial={still ? false : { opacity: 0, x: -3 }}
							animate={{ opacity: 1, x: 0 }}
							transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
						>
							{entry.subject}
						</motion.span>
					)}
					{entry.count === null ? null : (
						<span className="shrink-0 font-mono text-sm text-text/85 tabular-nums leading-4">×{entry.count}</span>
					)}
				</span>
				{expandable ? <ChevronIcon open={entry.shot} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" /> : null}
			</div>
			{entry.shot ? (
				// the picture the agent read back, elided the way the captures elide it: the
				// row holds its place and names the frame. It opens the way a row does, because a
				// disclosure landing is the same growth as a row landing and the log above it
				// glides for the same reason
				<div className={still ? undefined : "stage-open grid"}>
					<div className="min-h-0 overflow-hidden">
						<div className={cn("flex flex-col gap-1 pt-1 pb-1 pl-6", !still && "stage-in")}>
							<span className="h-[3px] w-[3px] rounded-full bg-border-raised" />
							<span className="font-mono text-2xs text-muted/45 leading-3">home</span>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

/* ---------- the agent's own words ----------
 * `fade` and `plain` are the shipped renderer: the drawn prefix as text, over an invisible
 * copy of the landed text that holds the height. The three mask takes lay the landed text
 * out once and uncover it. */
function Prose({ entry, words, still }: { entry: Extract<Entry, { kind: "prose" }>; words: Words; still: boolean }) {
	const streaming = !still && entry.upto < entry.full.length;
	if (words === "fade" || words === "plain" || still) {
		const shown = streaming ? closedText(entry.landed.slice(0, entry.upto)) : entry.landed;
		const live = streaming && words === "fade" ? Math.min(LIVE_TAIL, shown.length) : 0;
		return (
			<div className="relative">
				<div className="invisible" aria-hidden="true">
					<Said text={closedText(entry.landed)} />
				</div>
				<div className="absolute inset-0">
					<Said text={shown} live={live} arrival={words === "fade" ? "fade" : "none"} caret={streaming ? <Caret /> : null} />
				</div>
			</div>
		);
	}
	if (words === "line") return <Lines landed={entry.landed} full={entry.full} />;
	if (words === "paragraph" || words === "sentence" || words === "ghost")
		return (
			<Paragraphs
				text={entry.landed}
				finished={entry.landed.length >= entry.full.length}
				mode={words === "paragraph" ? "whole" : words}
				caret={<Caret />}
			/>
		);
	return <Pen landed={entry.landed} upto={entry.upto} full={entry.full} soft={words === "soft"} />;
}

/** the characters the renderer will actually draw for `text`: markers stripped, glyphs the agent wrote */
function drawnLength(text: string): number {
	return chunksOf(text).reduce(
		(total, chunk) =>
			total + (chunk.kind === "fence" ? chunk.text.length : chunk.spans.reduce((sum, span) => sum + span.text.length, 0)),
		0,
	);
}

/** the text nodes a reader would count, in order: the renderer's own bullets are skipped */
function textNodesOf(root: HTMLElement): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest("[data-marker]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
	});
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node as Text);
	return nodes;
}

/** the line box a text node sits in, as its block's line-height, so a band covers the full line */
function lineHeightOf(node: Text): number {
	const block = node.parentElement?.closest("p, pre");
	const read = block === null || block === undefined ? Number.NaN : Number.parseFloat(getComputedStyle(block).lineHeight);
	return Number.isFinite(read) ? read : 20;
}

interface Edge {
	/** px from the block's left, where the next character would start */
	readonly x: number;
	/** the top of the line's band, px from the block's top */
	readonly top: number;
	/** the band's height */
	readonly height: number;
}

/** where drawn character `k` ends, in the block's own coordinates; null when nothing is drawn */
function edgeAt(root: HTMLElement, k: number): Edge | null {
	if (k <= 0) return null;
	const box = root.getBoundingClientRect();
	const at = (node: Text, offset: number): Edge => {
		const range = document.createRange();
		range.setStart(node, offset);
		range.collapse(true);
		const rect = range.getBoundingClientRect();
		const line = lineHeightOf(node);
		const mid = rect.top + rect.height / 2 - box.top;
		return { x: rect.left - box.left, top: mid - line / 2, height: line };
	};
	let seen = 0;
	let last: Text | null = null;
	for (const node of textNodesOf(root)) {
		const length = node.data.length;
		if (k <= seen + length) return at(node, k - seen);
		seen += length;
		last = node;
	}
	// past every character there is: the edge sits after the last one
	return last === null ? null : at(last, last.data.length);
}

/** one mask layer: a solid band of the block's width */
function band(top: number, height: number, alpha = 1): string {
	const ink = alpha >= 1 ? "#000" : `rgba(0,0,0,${alpha.toFixed(3)})`;
	return `linear-gradient(${ink}, ${ink}) 0 ${top.toFixed(2)}px / 100% ${height.toFixed(2)}px no-repeat`;
}

function setMask(element: HTMLElement, layers: readonly string[] | null) {
	const value = layers === null ? "" : layers.length === 0 ? "linear-gradient(transparent, transparent)" : layers.join(", ");
	element.style.setProperty("-webkit-mask", value);
	element.style.setProperty("mask", value);
}

/**
 * The pen: the landed text laid out whole, a mask uncovering it to the character the pace
 * has reached. Above the current line the mask is solid; on the current line it ends at
 * the edge, hard or feathered. The caret is a sibling of the masked block rather than a
 * child, because a child would be masked with the text.
 */
function Pen({ landed, upto, full, soft }: { landed: string; upto: number; full: string; soft: boolean }) {
	const block = useRef<HTMLDivElement>(null);
	const caret = useRef<HTMLSpanElement>(null);
	const text = closedText(landed);
	const settled = landed.length >= full.length && upto >= landed.length;
	const drawn = settled ? Number.POSITIVE_INFINITY : drawnLength(closedText(landed.slice(0, upto)));

	useLayoutEffect(() => {
		const root = block.current;
		const bar = caret.current;
		if (root === null) return;
		if (settled) {
			setMask(root, null);
			if (bar !== null) bar.style.display = "none";
			return;
		}
		const edge = edgeAt(root, drawn);
		if (edge === null) {
			setMask(root, []);
			if (bar !== null) bar.style.display = "none";
			return;
		}
		const feather = soft ? FEATHER : 0;
		const line = `linear-gradient(to right, #000 ${(edge.x - feather).toFixed(2)}px, transparent ${edge.x.toFixed(2)}px) 0 ${edge.top.toFixed(2)}px / 100% ${edge.height.toFixed(2)}px no-repeat`;
		setMask(root, [band(0, Math.max(0, edge.top)), line]);
		if (bar !== null) {
			bar.style.display = "";
			bar.style.transform = `translate(${(edge.x + 3).toFixed(2)}px, ${(edge.top + (edge.height - 12) / 2).toFixed(2)}px)`;
		}
	}, [text, drawn, settled, soft]);

	return (
		<div className="relative">
			<div ref={block}>
				<Said text={text} />
			</div>
			{soft ? null : (
				<span
					ref={caret}
					aria-hidden="true"
					className="pointer-events-none absolute top-0 left-0 h-[12px] w-[2px] rounded-[1px] bg-text/70"
					style={{ display: "none" }}
				/>
			)}
		</div>
	);
}

interface LineBand {
	readonly top: number;
	readonly height: number;
	/** the right edge of the line's last glyph, px from the block's left */
	readonly right: number;
}

/** the lines the landed text wraps to, measured off the text itself */
function bandsOf(root: HTMLElement): LineBand[] {
	const box = root.getBoundingClientRect();
	const bands: { top: number; bottom: number; right: number }[] = [];
	for (const node of textNodesOf(root)) {
		const line = lineHeightOf(node);
		const range = document.createRange();
		range.selectNodeContents(node);
		for (const rect of Array.from(range.getClientRects())) {
			if (rect.width === 0 && rect.height === 0) continue;
			const mid = rect.top + rect.height / 2 - box.top;
			const top = mid - line / 2;
			const bottom = mid + line / 2;
			const right = rect.right - box.left;
			const near = bands.find((seen) => Math.abs(seen.top - top) < line / 2);
			if (near === undefined) bands.push({ top, bottom, right });
			else {
				near.top = Math.min(near.top, top);
				near.bottom = Math.max(near.bottom, bottom);
				near.right = Math.max(near.right, right);
			}
		}
	}
	return bands.sort((a, b) => a.top - b.top).map((seen) => ({ top: seen.top, height: seen.bottom - seen.top, right: seen.right }));
}

/**
 * A line at a time: a line is uncovered once the text after it has started, so its wrap
 * cannot change under it, and the last line when the message ends. Two lines completing
 * in one delta come up 120ms apart rather than together.
 */
function Lines({ landed, full }: { landed: string; full: string }) {
	const block = useRef<HTMLDivElement>(null);
	const caret = useRef<HTMLSpanElement>(null);
	/** when each line was released, by index; a line never goes back */
	const released = useRef<number[]>([]);
	const frame = useRef(0);
	const text = closedText(landed);
	const finished = landed.length >= full.length;

	useLayoutEffect(() => {
		const root = block.current;
		const bar = caret.current;
		if (root === null) return;
		const bands = bandsOf(root);
		const complete = finished ? bands.length : Math.max(0, bands.length - 1);
		const now = performance.now();
		const queue = released.current;
		while (queue.length < complete) {
			const previous = queue[queue.length - 1];
			queue.push(previous === undefined ? now : Math.max(now, previous + LINE_GAP_MS));
		}
		const paint = (at: number) => {
			let busy = false;
			const layers: string[] = [];
			queue.forEach((from, index) => {
				const line = bands[index];
				if (line === undefined) return;
				const alpha = Math.max(0, Math.min(1, (at - from) / LINE_MS));
				if (alpha < 1) busy = true;
				if (alpha > 0) layers.push(band(line.top, line.height, alpha));
			});
			const done = finished && queue.length >= bands.length && !busy;
			setMask(root, done ? null : layers);
			if (bar !== null) {
				const last = bands[queue.length - 1];
				const shown = !finished && last !== undefined && at >= (queue[queue.length - 1] ?? at);
				bar.style.display = shown ? "" : "none";
				if (shown && last !== undefined)
					bar.style.transform = `translate(${(last.right + 3).toFixed(2)}px, ${(last.top + (last.height - 12) / 2).toFixed(2)}px)`;
			}
			return busy || (!finished && queue.length > 0 && at < (queue[queue.length - 1] ?? 0));
		};
		const tick = (at: number) => {
			frame.current = paint(at) ? requestAnimationFrame(tick) : 0;
		};
		cancelAnimationFrame(frame.current);
		tick(now);
		return () => cancelAnimationFrame(frame.current);
	}, [text, finished]);

	return (
		<div className="relative">
			<div ref={block}>
				<Said text={text} />
			</div>
			<span
				ref={caret}
				aria-hidden="true"
				className="pointer-events-none absolute top-0 left-0 h-[12px] w-[2px] rounded-[1px] bg-text/70"
				style={{ display: "none" }}
			/>
		</div>
	);
}
