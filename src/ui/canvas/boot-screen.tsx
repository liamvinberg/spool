import { useEffect, useReducer, useRef, useState } from "react";
import { type Curtain, EXIT_MS, GATE_MS, MIN_SHOWN_MS, nextCurtain, pickMotion, type ThreadMotion } from "./boot-clock";

/**
 * What stands on the field between the canvas mounting and the projection
 * landing (#244).
 *
 * Before this the field rendered nothing at all for as long as the daemon took,
 * so a slow answer and a project with no frames in it were the same picture.
 * What it draws is the mark's thread travelling, and nothing else: the count,
 * the names and the layout all arrive together with `/frames`, so anything the
 * curtain claimed about the project would be a claim it could not have checked.
 *
 * It is gated at both ends and its pace is rolled per boot: `boot-clock.ts`
 * carries the durations, the four hands, and the reasoning behind them.
 */

/** the wave the thread runs, at the mark's own hand */
const THREAD_PATH = "M6 36C86 36 106 12 186 12C266 12 286 60 366 60C394 60 404 46 414 36";

export function BootCurtain({ ready }: { ready: boolean }) {
	const phase = useCurtain(ready);
	// rolled once and held: a motion that changed underneath a running animation
	// would restart it, which is the one thing a loader must never look like
	const [motion] = useState<ThreadMotion>(() => pickMotion(Math.random()));
	if (phase === null) return null;
	return (
		<div
			data-canvas-booting={phase}
			data-boot-motion={motion.name}
			className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center pb-20 ${
				phase === "leaving" ? "animate-boot-out" : "animate-boot-in"
			}`}
		>
			<svg viewBox="0 0 420 72" className="h-[72px] w-[420px]" fill="none" aria-hidden="true">
				<path
					d={THREAD_PATH}
					className="animate-boot-thread"
					stroke="var(--color-thread)"
					strokeWidth={1.5}
					strokeLinecap="round"
					// pattern and path are the same length, so a cycle of the offset carries
					// the thread across once and there is always exactly this much of it on
					// the wave. A dash as long as the whole path would read better standing
					// still and worse in motion: it empties the field twice a cycle, and a
					// loader that is up for a third of a second can land on the empty half.
					pathLength={1}
					strokeDasharray="0.4 0.6"
					style={{ animationDuration: `${motion.durationMs}ms`, animationTimingFunction: motion.easing }}
				/>
			</svg>
		</div>
	);
}

/**
 * The curtain's clock. Two timers and one signal from outside: the gate that
 * lets it draw, the projection that ends it, and the fade it is allowed to
 * finish. A boot that beats the gate never renders anything, which is the
 * whole reason the gate is here.
 */
function useCurtain(ready: boolean): Exclude<Curtain, "waiting" | "gone"> | null {
	const [phase, signal] = useReducer(nextCurtain, "waiting" as Curtain);
	/** when the curtain actually reached the screen, or null while it never has */
	const shownAt = useRef<number | null>(null);

	useEffect(() => {
		if (phase !== "waiting") return;
		const timer = window.setTimeout(() => signal("gate"), GATE_MS);
		return () => window.clearTimeout(timer);
	}, [phase]);

	useEffect(() => {
		if (phase === "showing" && shownAt.current === null) shownAt.current = Date.now();
	}, [phase]);

	// A curtain that has only just arrived does not turn round and leave: measured
	// against the dev daemon, a cold boot crossed the gate about four milliseconds
	// before the projection landed, and what that drew was a thread fading out of a
	// fade-in. Below the gate nothing is drawn at all; above it, what is drawn is
	// worth the glance.
	useEffect(() => {
		if (!ready) return;
		if (shownAt.current === null) {
			signal("ready");
			return;
		}
		const owed = MIN_SHOWN_MS - (Date.now() - shownAt.current);
		if (owed <= 0) {
			signal("ready");
			return;
		}
		const timer = window.setTimeout(() => signal("ready"), owed);
		return () => window.clearTimeout(timer);
	}, [ready]);

	useEffect(() => {
		if (phase !== "leaving") return;
		const timer = window.setTimeout(() => signal("exited"), EXIT_MS);
		return () => window.clearTimeout(timer);
	}, [phase]);

	return phase === "showing" || phase === "leaving" ? phase : null;
}
