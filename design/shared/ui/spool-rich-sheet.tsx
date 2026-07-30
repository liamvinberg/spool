import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { closedRich } from "../lib/rich-markdown";
import { LIVE_TAIL, RAIL_DEFAULT, RAIL_PAD } from "../lib/rich-copy";
import { drawnBy, type Landed } from "../lib/say-pace";
import { cn } from "../lib/utils";

/**
 * The rig every `agent-rich--` frame is drawn on.
 *
 * Two things it exists to stop. The first is a hand-computed width: this page's history is
 * full of them and #184 found that even the careful ones were wrong once the truncating
 * child moved a level deeper, so nothing here states a pixel it did not read off a box. The
 * second is a claim about streaming: a table is the worst shape the live edge has ever been
 * handed, and the only honest way to say what a take does while one is arriving is to walk
 * every prefix of the message through the take and measure what the block did.
 */

/* ---------- the sheet ---------- */

export function RichSheet({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* the arriving word's own fade, as a class rather than a motion component: what ships
			    in `agent-said.tsx` is one CSS animation, and the walk below renders this tree a
			    couple of thousand times */}
			<style>{`
@keyframes rich-word { from { opacity: 0 } to { opacity: 1 } }
.rich-word { animation: rich-word 170ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) { .rich-word { animation: none } }
`}</style>
			{children}
		</div>
	);
}

export function RichHead({ title, note }: { title: string; note: string }) {
	return (
		<div className="flex shrink-0 items-baseline gap-3 border-border border-y bg-surface/40 px-5 py-1.5">
			<span className="font-mono text-sm text-text leading-4">{title}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/70 leading-3">{note}</span>
		</div>
	);
}

export function RichNote({ children }: { children: ReactNode }) {
	return <div className="shrink-0 px-5 py-1.5 font-mono text-2xs text-muted/60 leading-4">{children}</div>;
}

/* ---------- a rail-shaped column ---------- */

/**
 * The transcript's own text column at a real rail width.
 *
 * `width` is the rail; the box inside it is `width - 28`, which is the `px-3.5` the
 * transcript carries either side. Nothing else about the rail is drawn, because nothing
 * else about it is what a table has to survive.
 */
export function RailColumn({
	width,
	label,
	note,
	height,
	tone,
	children,
	onHeight,
}: {
	width: number;
	label: string;
	note: string;
	height: number;
	tone?: string;
	children: ReactNode;
	onHeight?: ((height: number) => void) | undefined;
}) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = box.current;
		if (node === null || onHeight === undefined) return;
		onHeight(Math.round(node.getBoundingClientRect().height));
	});
	return (
		<div className="flex shrink-0 flex-col gap-2" style={{ width: `${width}px` }}>
			<div className="flex h-7 shrink-0 flex-col gap-0.5">
				<span className={cn("font-mono text-sm leading-4", tone ?? "text-muted")}>{label}</span>
				<span className="truncate font-mono text-2xs text-muted/55 leading-3">{note}</span>
			</div>
			<div
				className="relative overflow-hidden border-border border-x bg-bg pt-3 pb-3"
				style={{ height: `${height}px`, paddingLeft: `${RAIL_PAD / 2}px`, paddingRight: `${RAIL_PAD / 2}px` }}
			>
				<div ref={box}>{children}</div>
				<span
					className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg to-transparent"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}

/* ---------- the live edge, for real ---------- */

/**
 * The message arriving on the wire's own shape.
 *
 * A `text_delta` carries a median of **81 characters** and the capture's own mean gap is
 * **460ms** (`say-pace.ts`), so the schedule below is that rather than a smooth ramp: the
 * point of watching a table arrive is that it lands a line and a half at a time. What is
 * allowed on screen at each instant is `drawnBy`, the shipped pace, unchanged.
 */
export function useArrive(
	text: string,
	/**
	 * Where the clock starts.
	 *
	 * The live column exists so the take can be watched arriving, and a still cannot watch
	 * anything — so the clock opens part-way in and a screenshot lands mid-table rather than
	 * on an empty box. `replay` puts it back to zero, which is where you watch it from.
	 */
	from = 0,
): {
	shown: string;
	live: number;
	done: boolean;
	elapsed: number;
	total: number;
	replay: () => void;
} {
	const landed = useMemo<readonly Landed[]>(() => {
		const out: Landed[] = [];
		for (let at = 81; at < text.length + 81; at += 81)
			out.push({ at: (out.length + 1) * 460, upto: Math.min(text.length, at) });
		return out;
	}, [text]);
	const total = landed[landed.length - 1]?.at ?? 0;
	const [run, setRun] = useState(0);
	const [elapsed, setElapsed] = useState(from);

	useEffect(() => {
		const head = run === 0 ? from : 0;
		const start = performance.now() - head;
		let raf = 0;
		const tick = () => {
			const now = performance.now() - start;
			setElapsed(now);
			if (now < total + 1400) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [total, run, from]);

	const at = Math.round(drawnBy(landed, elapsed));
	const done = at >= text.length;
	const shown = done ? text : closedRich(text.slice(0, at));
	return {
		shown,
		live: done ? 0 : Math.min(LIVE_TAIL, shown.length),
		done,
		elapsed,
		total,
		replay: () => setRun((value) => value + 1),
	};
}

/**
 * Three moments in the arrival, fixed so a still can carry the argument.
 *
 * They are the table's own fragile frames rather than three even fractions: the header
 * complete with no delimiter row yet, the delimiter row half written, and the last row
 * mid-cell. A live column beside them shows the same thing moving; these are what a
 * screenshot can hold.
 */
export function arrivalCuts(text: string): readonly { readonly at: number; readonly note: string }[] {
	const delim = text.indexOf("\n|---");
	const last = text.lastIndexOf("\n| ");
	const head = delim === -1 ? Math.round(text.length * 0.4) : delim;
	return [
		{ at: head, note: "header in, no delimiter row yet" },
		{ at: delim === -1 ? head + 6 : delim + 7, note: "the delimiter row, half written" },
		{ at: last === -1 ? Math.round(text.length * 0.85) : last + 44, note: "the last row, mid-cell" },
	];
}

/* ---------- the walk ---------- */

export interface Walk {
	readonly width: number;
	/** how many prefixes were drawn: one per character of the message */
	readonly steps: number;
	/** prefixes at which the block got shorter than the one before it */
	readonly drops: number;
	/** the worst of those, in px */
	readonly worst: number;
	/** prefixes at which the grid's own width changed: the lateral half of the same problem */
	readonly lateral: number;
	/** what the block ends up */
	readonly height: number;
	/** what the block asks for beyond the column, at the end */
	readonly overflow: number;
	/** how long the whole walk took, so the rig is honest about its own cost */
	readonly ms: number;
	/**
	 * Where it first went down, and what was being written at the time.
	 *
	 * A count on its own says a take is wrong and not what to change, and every fix on this
	 * page came from being able to name the character. `agent-say-settle` printed the first
	 * word that moved for the same reason.
	 */
	readonly firstAt: number;
	readonly firstText: string;
}

/**
 * Every prefix of the message, drawn through the take, measured.
 *
 * **The metric is #148's and it is not a new one.** `say-markers.ts` was tuned by walking
 * all three streamed messages one character at a time and requiring that the rendered
 * height never decreases, because a height that decreases is text you were reading moving
 * up under your eye. It scored zero over 5,808 characters. A table is the first shape that
 * can break it in a new way, so it is walked the same way.
 *
 * **`lateral` is the column the height metric cannot see.** A grid re-measures its columns
 * on every row, so the last row's long label can widen column one and shift every cell in
 * the table sideways without changing a single line count. #163 found the same blind spot
 * from the other end: the reflow was lateral, which is why looking at a total never caught
 * it.
 *
 * The walk renders into a detached root with `flushSync`, from a timeout rather than from a
 * lifecycle, so it is one blocking pass. Blocking is a feature here for the same reason it
 * is on `agent-say-settle`: nothing paints until it is done, so a screenshot cannot catch
 * the sheet still measuring.
 */
export function StreamWalk({
	text,
	widths,
	render,
	onDone,
	close = closedRich,
}: {
	text: string;
	widths: readonly number[];
	render: (shown: string, live: number) => ReactNode;
	onDone: (walks: readonly Walk[]) => void;
	/** how a half-arrived message is repaired: the control passes `closedText` alone */
	close?: (text: string) => string;
}) {
	const host = useRef<HTMLDivElement>(null);
	const spent = useRef(false);

	useEffect(() => {
		if (spent.current) return;
		let alive = true;
		let timer = 0;
		const walk = () => {
			const root = host.current;
			if (root === null || !alive) return;
			spent.current = true;
			const began = performance.now();
			const out: Walk[] = [];
			for (const width of widths) {
				const cell = document.createElement("div");
				cell.style.width = `${width - RAIL_PAD}px`;
				root.appendChild(cell);
				const mount = createRoot(cell);
				let last = 0;
				let drops = 0;
				let worst = 0;
				let lateral = 0;
				let wide = -1;
				let firstAt = -1;
				let firstText = "";
				for (let at = 1; at <= text.length; at += 1) {
					const shown = close(text.slice(0, at));
					flushSync(() => mount.render(render(shown, Math.min(LIVE_TAIL, shown.length))));
					const now = cell.getBoundingClientRect().height;
					if (now < last - 0.5) {
						drops += 1;
						worst = Math.max(worst, last - now);
						if (firstAt === -1) {
							firstAt = at;
							firstText = JSON.stringify(text.slice(Math.max(0, at - 22), at + 1));
						}
					}
					last = now;
					const grid = cell.querySelector<HTMLElement>("[data-rich-table]");
					const span = grid === null ? -1 : Math.round(grid.getBoundingClientRect().width);
					if (wide !== -1 && span !== -1 && span !== wide) lateral += 1;
					wide = span;
				}
				flushSync(() => mount.render(render(text, 0)));
				const box = cell.querySelector<HTMLElement>("[data-rich-scroller]");
				out.push({
					width,
					steps: text.length,
					drops,
					worst,
					lateral,
					height: Math.round(cell.getBoundingClientRect().height),
					overflow: box === null ? 0 : Math.max(0, box.scrollWidth - box.clientWidth),
					ms: 0,
					firstAt,
					firstText,
				});
				mount.unmount();
				cell.remove();
			}
			const ms = Math.round(performance.now() - began);
			if (alive) onDone(out.map((one) => ({ ...one, ms })));
		};
		void document.fonts.ready.then(() => {
			if (alive) timer = window.setTimeout(walk, 0);
		});
		return () => {
			alive = false;
			window.clearTimeout(timer);
		};
	}, [text, widths, render, onDone, close]);

	return <div ref={host} className="pointer-events-none absolute top-0 left-[-20000px]" aria-hidden="true" />;
}

/* ---------- the readout ---------- */

const COLS: readonly { readonly key: keyof Walk | "px"; readonly label: string; readonly wide: number }[] = [
	{ key: "width", label: "rail", wide: 56 },
	{ key: "px", label: "text px", wide: 62 },
	{ key: "steps", label: "prefixes", wide: 68 },
	{ key: "drops", label: "height drops", wide: 92 },
	{ key: "worst", label: "worst px", wide: 68 },
	{ key: "lateral", label: "grid re-widths", wide: 100 },
	{ key: "height", label: "settled h", wide: 72 },
	{ key: "overflow", label: "off column", wide: 80 },
];

export function WalkTable({ walks, note }: { walks: readonly Walk[]; note: string }) {
	return (
		<div className="flex min-w-0 flex-col">
			<div className="flex items-center px-5 py-1 font-mono text-2xs text-muted/40 leading-3">
				{COLS.map((col) => (
					<span key={col.label} className="shrink-0 text-right" style={{ width: `${col.wide}px` }}>
						{col.label}
					</span>
				))}
				<span className="min-w-0 flex-1 pl-5">where it first went down</span>
			</div>
			{walks.map((walk) => (
				<div key={walk.width} className="flex items-center px-5 py-[3px]">
					<span
						className={cn(
							"shrink-0 text-right font-mono text-2xs leading-4 tabular-nums",
							walk.width === RAIL_DEFAULT ? "text-text" : "text-muted/70",
						)}
						style={{ width: "56px" }}
					>
						{walk.width}
					</span>
					<span className="shrink-0 text-right font-mono text-2xs text-muted/70 leading-4 tabular-nums" style={{ width: "62px" }}>
						{walk.width - RAIL_PAD}
					</span>
					<span className="shrink-0 text-right font-mono text-2xs text-muted/50 leading-4 tabular-nums" style={{ width: "68px" }}>
						{walk.steps}
					</span>
					<span
						className={cn(
							"shrink-0 text-right font-mono text-2xs leading-4 tabular-nums",
							walk.drops > 0 ? "text-thread" : "text-muted/45",
						)}
						style={{ width: "92px" }}
					>
						{walk.drops}
					</span>
					<span
						className={cn(
							"shrink-0 text-right font-mono text-2xs leading-4 tabular-nums",
							walk.worst > 0.5 ? "text-thread" : "text-muted/45",
						)}
						style={{ width: "68px" }}
					>
						{walk.worst.toFixed(1)}
					</span>
					<span
						className={cn(
							"shrink-0 text-right font-mono text-2xs leading-4 tabular-nums",
							walk.lateral > 0 ? "text-text/80" : "text-muted/45",
						)}
						style={{ width: "100px" }}
					>
						{walk.lateral}
					</span>
					<span className="shrink-0 text-right font-mono text-2xs text-muted/70 leading-4 tabular-nums" style={{ width: "72px" }}>
						{walk.height}
					</span>
					<span
						className={cn(
							"shrink-0 text-right font-mono text-2xs leading-4 tabular-nums",
							walk.overflow > 0 ? "text-text/80" : "text-muted/45",
						)}
						style={{ width: "80px" }}
					>
						{walk.overflow}
					</span>
					<span className="min-w-0 flex-1 truncate pl-5 font-mono text-2xs text-thread/70 leading-4">
						{walk.firstAt === -1 ? "" : `first drop at ${walk.firstAt}c, writing ${walk.firstText}`}
					</span>
				</div>
			))}
			<div className="px-5 pt-1 font-mono text-2xs text-muted/50 leading-4">
				{walks.length === 0 ? "walking…" : `${note} · the walk itself took ${walks[0]?.ms ?? 0}ms`}
			</div>
		</div>
	);
}
