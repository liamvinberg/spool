import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Caret, Said, closedText } from "../../../shared/ui/spool-say";

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How a block that is still being written grows.
 *
 * The cadence is measured, not chosen. The 3,372-character message in
 * `claude-mcp.json` arrives as **43 `text_delta`s over 19.8 seconds**, bracketed by
 * the two real timestamps either side of it: about one beat every 460ms, each
 * carrying a median of **81 characters**. At the rail's 392px of text that is more
 * than a line and often two. So the thing to smooth is not a typewriter, it is a
 * block getting one to two lines taller, twice a second, for twenty seconds.
 *
 * `stream_event` carries no timestamp of its own — only 75 of the capture's 787
 * events are stamped — so the *spacing between* deltas is interpolated evenly by
 * `place()`. The total and the chunk sizes are real; the evenness is Spool's.
 *
 *   jump  what the rail does now. Height is `auto`, so each delta resizes the block
 *         in one frame and the text above it steps.
 *   hold  #145's rule, kept here as the thing being replaced: the finished height is
 *         reserved from the first character, so nothing grows and nothing steps —
 *         at the cost of opening two and a half screens of blank.
 *   ease  the same jumps, animated. Height transitions to each new height over
 *         260ms, so a two-line step becomes a two-line glide.
 *   line  the chunk is let in one line at a time rather than all at once, so the
 *         block only ever grows by one line and does it twice as often. Nothing is
 *         animated; the steps are just smaller than the eye reads as a step.
 *   type  the chunk is spread across its own 460ms as characters, so text is always
 *         arriving and height grows exactly when a line wraps. The smoothest, and
 *         the only one that is a stylisation: the wire has clauses, not characters.
 */
export type Growth = "jump" | "hold" | "ease" | "line" | "type";

export interface Beat {
	/** the delta's text, exactly as it came off the wire */
	readonly text: string;
	/** ms from the start of the block */
	readonly at: number;
}

/** the measured beat, so a sub-step can divide it rather than invent a duration */
export const BEAT_MS = 460;

/**
 * How much of the message has arrived, in characters, at `elapsed`.
 *
 * `jump`, `hold` and `ease` all read the wire unchanged — a delta is a step. `line`
 * and `type` subdivide the beat, which is where the smoothing comes from and also
 * where the honesty goes: neither is a thing the stream did.
 */
function shownAt(beats: readonly Beat[], elapsed: number, mode: Growth, width: number): number {
	// the last chunk the wire has actually delivered, and everything before it
	let landed = 0;
	let live: Beat | null = null;
	for (const beat of beats) {
		if (beat.at > elapsed) break;
		if (live !== null) landed += live.text.length;
		live = beat;
	}
	if (live === null) return 0;
	const span = live.text.length;
	// a delta is a step, so the whole chunk is on screen the instant it lands
	if (mode !== "line" && mode !== "type") return landed + span;

	// the two smoothed takes spend the live chunk across its own beat. They never run
	// ahead of the wire — nothing is on screen before it arrived — they only finish
	// the chunk just as the next one lands, which is what turns one 40px step into
	// two 20px ones, or into none at all.
	const part = Math.max(0, Math.min(1, (elapsed - live.at) / BEAT_MS));
	if (mode === "type") return landed + Math.max(1, Math.floor(span * part));
	const steps = Math.max(1, Math.ceil(span / width));
	return landed + Math.min(span, Math.min(steps, Math.floor(part * steps) + 1) * width);
}

export function StreamTake({
	beats,
	whole,
	mode,
	run,
	/** characters per rendered line at this width, so `line` can step by one */
	width = 62,
}: {
	beats: readonly Beat[];
	whole: string;
	mode: Growth;
	run: number;
	width?: number;
}) {
	const still = useReducedMotion() === true;
	const [elapsed, setElapsed] = useState(0);
	const frame = useRef(0);
	const started = useRef(0);
	const view = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (still) {
			setElapsed(Number.POSITIVE_INFINITY);
			return;
		}
		started.current = performance.now();
		const total = (beats[beats.length - 1]?.at ?? 0) + BEAT_MS;
		const tick = (now: number) => {
			const since = now - started.current;
			setElapsed(since);
			if (since < total) frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame.current);
	}, [beats, run, still]);

	const upto = mode === "hold" ? shownAt(beats, elapsed, "jump", width) : shownAt(beats, elapsed, mode, width);
	const streaming = upto < whole.length;
	// an unclosed `**`, backtick or fence waits rather than drawing, or it reflows the
	// paragraph under the line being read the moment it closes
	const shown = streaming ? closedText(whole.slice(0, upto)) : whole;

	/*
	 * The message starts at the top, which is a correction this sheet needed as much as
	 * `agent-say-arrive` did. Pinning the bottom drove the report's first line up out of
	 * the box before it could be read, and it made `hold` look like it drew nothing at
	 * all when what it was really doing was filling a reserved block from the top.
	 */
	useLayoutEffect(() => {
		const box = view.current;
		const text = body.current;
		if (box === null || text === null) return;
		box.scrollTop = Math.max(0, text.offsetHeight - box.clientHeight);
	}, [elapsed]);

	const caret = streaming ? <Caret /> : null;

	// the reserve, kept as its own take rather than described: the finished document
	// holds the height invisibly and the arriving one is drawn over it
	/*
	 * The measured node is whatever holds the text that is *visible*, which is not the
	 * same node in `hold`.
	 *
	 * Every other take's wrapper is the shown text, so its height is what decides
	 * whether the message has outgrown the box. `hold`'s wrapper is the reserve — final
	 * height from the first character — so measuring it makes the box follow a bottom
	 * that is already 1,234px down and the column reads as empty for twenty seconds,
	 * which is exactly the artefact that made the reserve look worse than it is. So the
	 * ref goes on the overlay's own content instead.
	 */
	if (mode === "hold")
		return (
			<div ref={view} className="h-full overflow-hidden">
				<div className="relative">
					<div className="invisible" aria-hidden="true">
						<Said text={whole} />
					</div>
					<div className="absolute inset-0">
						<div ref={body}>
							<Said text={shown} caret={caret} />
						</div>
					</div>
				</div>
			</div>
		);

	return (
		<div ref={view} className="h-full overflow-hidden">
			<div ref={body}>
				{mode === "ease" ? (
					<motion.div layout transition={still ? { duration: 0 } : { layout: { duration: 0.26, ease: ARRIVE } }}>
						<Said text={shown} caret={caret} />
					</motion.div>
				) : (
					<Said text={shown} caret={caret} />
				)}
			</div>
		</div>
	);
}

