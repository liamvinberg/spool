import { useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Said, closedText } from "shared/ui/spool-say";

/**
 * When a character is allowed on screen, which is a separate question from what it does
 * once it gets there (#149).
 *
 * `agent-say-stream` asked how to arrange the wire's own steps and found none of them
 * smooth. `agent-say-arrive` then spent each chunk across a fixed 460ms beat and moved
 * on to the live edge. This sheet is the question both of them stepped over: **the beat
 * is not a number the wire ever sends.** `stream_event` carries no timestamp — 75 of
 * the capture's 787 events are stamped — so 460ms is `place()`'s own interpolation of a
 * measured total, and a policy built on it is built on a constant the real stream has
 * never promised.
 *
 *   wire    the rail today. A delta is a step, so the whole chunk is on screen in the
 *           frame it lands.
 *   beat    what both sheets do. The live chunk is spread across a fixed 460ms, so it
 *           finishes exactly as the next one is assumed to land.
 *   drain   the pending characters are drained over a fixed *window*, so the rate is
 *           set by how far behind the edge is rather than by how big the chunk was.
 *           `ms per character = min(floor, window / pending)`, recomputed every frame.
 */
export type Pace = "wire" | "beat" | "drain";

export interface Beat {
	/** the delta's text, exactly as it came off the wire */
	readonly text: string;
	/** ms from the start of the block */
	readonly at: number;
}

/** the interpolated beat: 43 deltas across the 19.8 real seconds of the long message */
export const BEAT_MS = 460;

/**
 * The drain window, and the slowest it is allowed to go.
 *
 * `window / pending` is assistant-ui's `useSmooth` — the one implementation of this
 * anywhere that speeds up when it falls behind rather than pacing at a constant. Its own
 * defaults are 250ms with a 200 characters-a-second floor, and the floor is the part that
 * does not transfer: **Opus 5 writes this message at 170 c/s**, so a drain that refuses
 * to go slower than 200 outruns the model, empties its buffer, and stands still for 23%
 * of the message. Dropping the floor to 83 c/s keeps the window and lets the edge idle at
 * the rate the model actually writes: measured, 2% of frames still instead of 23%, for
 * 0.05s more lag.
 */
const DRAIN_MS = 250;
const FLOOR_MS_PER_CHAR = 12;

/**
 * The deltas of one streamed block, scheduled.
 *
 * `even` is what `place()` does and what both other sheets assume: the measured total
 * divided by the number of deltas. `jitter` keeps every chunk, and the total, and only
 * varies the gaps between them — 150ms to 1.2s, deterministically, so the two frames are
 * the same message at the same average rate and differ in nothing but evenness.
 *
 * Which of the two is real is not knowable from any capture: `stream_event` carries no
 * timestamp. Even spacing is the one thing we know the wire does *not* guarantee, so a
 * policy that only holds under `even` is a policy resting on Spool's own interpolation.
 */
export function schedule(chunks: readonly string[], spacing: "even" | "jitter"): readonly Beat[] {
	const gaps = chunks.map((_, index) =>
		spacing === "even" ? BEAT_MS : Math.max(150, BEAT_MS * (1 + 0.9 * Math.sin(index * 1.7) + 0.5 * Math.sin(index * 0.41))),
	);
	const at: number[] = [];
	let clock = 0;
	for (const gap of gaps) {
		at.push(clock);
		clock += gap;
	}
	// rescale so both spacings take exactly the measured wall time
	const span = at[at.length - 1] ?? 1;
	const scale = span === 0 ? 1 : ((chunks.length - 1) * BEAT_MS) / span;
	return chunks.map((text, index) => ({ text, at: (at[index] ?? 0) * scale }));
}

/** characters the wire has actually delivered by `elapsed` */
function arrived(beats: readonly Beat[], elapsed: number): number {
	let total = 0;
	for (const beat of beats) {
		if (beat.at > elapsed) break;
		total += beat.text.length;
	}
	return total;
}

/** the live chunk spread across a fixed beat — `agent-say-arrive`'s policy, kept as the diff */
function acrossBeat(beats: readonly Beat[], elapsed: number): number {
	let landed = 0;
	let live: Beat | null = null;
	for (const beat of beats) {
		if (beat.at > elapsed) break;
		if (live !== null) landed += live.text.length;
		live = beat;
	}
	if (live === null) return 0;
	const part = Math.max(0, Math.min(1, (elapsed - live.at) / BEAT_MS));
	return landed + Math.max(1, Math.floor(live.text.length * part));
}

/** how many samples the trace holds, at one per animation frame */
const TRACE = 150;

export function PaceTake({
	label,
	note,
	beats,
	whole,
	mode,
	run,
}: {
	label: string;
	note: string;
	beats: readonly Beat[];
	whole: string;
	mode: Pace;
	run: number;
}) {
	const still = useReducedMotion() === true;
	const [upto, setUpto] = useState(0);
	const [rate, setRate] = useState(0);
	const [trace, setTrace] = useState<readonly number[]>([]);
	const drawn = useRef(0);
	const last = useRef(0);
	const frame = useRef(0);
	const view = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (still) {
			setUpto(whole.length);
			return;
		}
		const from = performance.now();
		const total = (beats[beats.length - 1]?.at ?? 0) + BEAT_MS;
		drawn.current = 0;
		last.current = from;
		setTrace([]);
		const tick = (now: number) => {
			const since = now - from;
			const dt = Math.min(64, now - last.current);
			last.current = now;
			const have = arrived(beats, since);
			const before = drawn.current;
			if (mode === "wire") drawn.current = have;
			else if (mode === "beat") drawn.current = Math.max(before, acrossBeat(beats, since));
			else {
				/*
				 * The rate is read off the backlog, so nothing here knows the beat.
				 *
				 * `window / pending` alone would never converge — an exponential decay
				 * approaches the end without reaching it — and it would also crawl whenever the
				 * backlog is one or two characters. The floor fixes both: it is the slowest the
				 * edge may move, so a nearly-empty buffer still clears.
				 */
				const pending = have - before;
				if (pending > 0) drawn.current = before + dt / Math.min(FLOOR_MS_PER_CHAR, DRAIN_MS / pending);
			}
			// never ahead of the wire: no character is on screen before it arrived
			drawn.current = Math.min(have, drawn.current);
			setUpto(Math.floor(drawn.current));
			const speed = ((drawn.current - before) / dt) * 1000;
			setRate(speed);
			setTrace((seen) => [...seen.slice(-(TRACE - 1)), speed]);
			if (since < total || drawn.current < whole.length) frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame.current);
	}, [beats, mode, run, still, whole.length]);

	/*
	 * Top-anchored, which #148 settled: the first line of a report is where its verdict
	 * is, and pinning the bottom drives that line up out of the box before it can be read.
	 * The view only starts following once the message is taller than the box.
	 */
	useLayoutEffect(() => {
		const box = view.current;
		const text = body.current;
		if (box === null || text === null) return;
		box.scrollTop = Math.max(0, text.offsetHeight - box.clientHeight);
	}, [upto]);

	const shownUpto = Math.min(whole.length, upto);
	const streaming = shownUpto < whole.length;
	const shown = streaming ? closedText(whole.slice(0, shownUpto)) : whole;

	return (
		<div className="flex min-h-0 w-[420px] shrink-0 flex-col gap-2">
			<div className="flex h-8 shrink-0 flex-col gap-1">
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-muted text-sm leading-4">{label}</span>
					<span className="ml-auto font-mono text-2xs text-text/60 leading-3 tabular-nums">
						{streaming ? `${Math.round(rate / 10) * 10} c/s` : "done"}
					</span>
				</div>
				<span className="truncate font-mono text-2xs text-muted/60 leading-3">{note}</span>
			</div>
			<Trace samples={trace} />
			<div className="relative min-h-0 flex-1 border-border border-x bg-bg px-3.5 pt-4">
				<div ref={view} className="h-full overflow-hidden">
					<div ref={body}>
						<Said text={shown} />
					</div>
				</div>
				<span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
			</div>
		</div>
	);
}

/**
 * The last two and a half seconds of arrival rate.
 *
 * The whole argument of this sheet is a thing a still cannot hold and a number flickers
 * too fast to read: how *evenly* characters arrive. A trace holds it — the wire is a comb
 * of spikes over a flat line, and a drain is a ridge. The scale tops out at 500 c/s,
 * which is above every rate any capture measured, so a spike that clips is a spike worth
 * seeing.
 */
function Trace({ samples }: { samples: readonly number[] }) {
	const height = 22;
	const width = 420;
	const step = width / TRACE;
	// newest sample pinned to the right edge, so the trace rolls rather than filling in
	const line = samples.map((value, at) => {
		const y = height - Math.max(0, Math.min(1, value / 500)) * (height - 2) - 1;
		const x = width - (samples.length - 1 - at) * step;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	return (
		<svg
			className="h-[22px] w-[420px] shrink-0"
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label="arrival rate over the last two and a half seconds"
		>
			<line x1="0" y1={height - 1} x2={width} y2={height - 1} className="stroke-border" strokeWidth="1" />
			{line.length > 1 ? (
				<polyline points={line.join(" ")} fill="none" className="stroke-text/45" strokeWidth="1" />
			) : null}
		</svg>
	);
}
