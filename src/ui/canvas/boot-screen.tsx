import { useEffect, useReducer, useRef, useState } from "react";
import { RibbonMark } from "../icons";
import { type Curtain, EXIT_MS, GATE_MS, MIN_SHOWN_MS, nextCurtain } from "./boot-clock";

/**
 * What stands on the field between the canvas mounting and the projection
 * landing (#244).
 *
 * Before this the field rendered nothing at all for as long as the daemon took,
 * so a slow answer and a project with no frames in it were the same picture.
 * What it draws is the mark winding on and off beside one line of what spool is
 * waiting on (`opening kaffe`, `loading projects`), the same at every wait while
 * spool boots (task 568). It says nothing more: the count, the names and the
 * layout all arrive together with `/frames`, so anything more the curtain
 * claimed about the project would be a claim it could not have checked.
 *
 * The mark is the loader rather than a shape invented for the waiting. It is
 * gated at both ends: `boot-clock.ts` carries the durations and why they are
 * what they are.
 */

export function BootCurtain({ ready, waitingOn }: { ready: boolean; waitingOn: string }) {
	const phase = useCurtain(ready);
	const seconds = useSecondsShown(phase !== null);
	// the winding is keyed to the clock, so the next page's curtain carries the turn on
	// from where the Mac app's waiting page, or the last curtain, left it
	const [windAt] = useState(() => `-${Date.now() % WIND_TURN_MS}ms`);
	if (phase === null) return null;
	return (
		<div
			data-canvas-booting={phase}
			className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center pb-20 ${
				phase === "leaving" ? "animate-boot-out" : "animate-boot-in"
			}`}
		>
			{/* the mark holds one spot whatever the line says, so a new page's words never move it:
			    the row is the mark and a fixed run of room the words may overflow */}
			<div role="status" className="flex w-[180px] items-center gap-2.5 text-secondary type-detail">
				<span className="relative h-[25px] w-[19px] shrink-0">
					{/* the ribbon at a fraction of its weight: the thread is laid into a mark
					    that is already standing there, rather than drawn out of nothing */}
					<RibbonMark className="absolute inset-0 h-full w-full opacity-[0.14]" />
					<RibbonMark
						className="animate-boot-wind absolute inset-0 h-full w-full"
						style={{ animationDelay: windAt }}
					/>
				</span>
				<span className="whitespace-nowrap">
					{waitingOn}
					{/* a slow wait counts, so it reads as slow rather than stuck */}
					<span
						className={`text-tertiary transition-opacity duration-slow ease-out ${seconds >= COUNT_FROM_S ? "" : "opacity-0"}`}
					>
						{` · ${seconds}s`}
					</span>
				</span>
			</div>
		</div>
	);
}

/** one full wind on and off, as `--animate-boot-wind` runs it */
const WIND_TURN_MS = 3000;
/** the wait the line starts counting at */
const COUNT_FROM_S = 3;

/** Whole seconds since the curtain reached the screen. */
function useSecondsShown(shown: boolean): number {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		if (!shown) return;
		const from = Date.now();
		const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - from) / 1000)), 250);
		return () => window.clearInterval(timer);
	}, [shown]);
	return seconds;
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
	// before the projection landed, and what that drew was a mark fading out of a
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
