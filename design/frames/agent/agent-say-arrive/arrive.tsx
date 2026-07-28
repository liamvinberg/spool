import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawnBy } from "../../../shared/lib/say-pace";
import { type Arrival, Caret, Said, closedText } from "../../../shared/ui/spool-say";

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

export interface Beat {
	readonly text: string;
	readonly at: number;
}

export interface Take {
	readonly id: string;
	readonly note: string;
	readonly beats: readonly Beat[];
	readonly whole: string;
}

/** the measured beat: 43 deltas across 19.8 real seconds on the long message */
export const BEAT_MS = 460;
/**
 * How much of the message stays live behind the edge, in drawn characters.
 *
 * About a second at the measured 171 characters a second, which is longer than any
 * arrival animation, so a character always finishes before it stops being live.
 */
const LIVE_TAIL = 150;

/**
 * The pace this sheet runs at, which is now the shipped one (#149).
 *
 * It used to spread the live chunk across a fixed 460ms, and that lost: 460ms is
 * `place()`'s interpolation of a measured total, not a number any delta sends, and under
 * uneven gaps spending-across-the-beat dumps its unspent remainder in a single frame at
 * 5,520 characters a second. `agent-say-pace` is that argument. What matters here is only
 * that the four arrivals are compared at the pace that ships rather than at one that
 * doesn't — the drain in `say-pace.ts`, which nothing in this file needs to know the shape
 * of.
 */
function spent(beats: readonly Beat[], elapsed: number): number {
	let upto = 0;
	const landed = beats.map((beat) => {
		upto += beat.text.length;
		return { at: beat.at, upto };
	});
	return drawnBy(landed, elapsed);
}

export function ArriveTake({
	beats,
	whole,
	mode,
	run,
}: {
	beats: readonly Beat[];
	whole: string;
	mode: Arrival;
	run: number;
}) {
	const still = useReducedMotion() === true;
	const [elapsed, setElapsed] = useState(0);
	const frame = useRef(0);
	const view = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (still) {
			setElapsed(Number.POSITIVE_INFINITY);
			return;
		}
		const from = performance.now();
		const total = (beats[beats.length - 1]?.at ?? 0) + BEAT_MS;
		const step = (now: number) => {
			const since = now - from;
			setElapsed(since);
			if (since < total) frame.current = requestAnimationFrame(step);
		};
		frame.current = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame.current);
	}, [beats, run, still]);

	/*
	 * The message starts at the top and stays there.
	 *
	 * Bottom-pinning is what the transcript does once a turn is finished, and it is
	 * wrong while one is arriving: the first line of a report is where its verdict is,
	 * and pinning the bottom drives that line upward out of the box before it has been
	 * read. So the top is anchored and text fills downward into empty space, and the
	 * view only starts following once the message is taller than the box.
	 */
	useLayoutEffect(() => {
		const box = view.current;
		const text = body.current;
		if (box === null || text === null) return;
		box.scrollTop = Math.max(0, text.offsetHeight - box.clientHeight);
	}, [elapsed]);

	const upto = Math.min(whole.length, spent(beats, elapsed));
	const streaming = upto < whole.length;
	// an unclosed `**`, backtick or fence waits, or it reflows the paragraph under the
	// line being read the moment it closes
	const shown = streaming ? closedText(whole.slice(0, upto)) : whole;
	const live = streaming ? Math.min(LIVE_TAIL, shown.length) : 0;

	return (
		<div ref={view} className="h-full overflow-hidden">
			<motion.div ref={body} layout transition={still ? { duration: 0 } : { layout: { duration: 0.24, ease: ARRIVE } }}>
				<Said text={shown} live={live} arrival={mode} caret={streaming ? <Caret /> : null} />
			</motion.div>
		</div>
	);
}

