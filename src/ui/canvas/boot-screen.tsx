import { useEffect, useReducer, useRef } from "react";
import { bootGrid, type Curtain, EXIT_MS, GATE_MS, MIN_SHOWN_MS, nextCurtain, WAVE_MS, waveDelay } from "./boot-grid";

/**
 * What stands on the field between the canvas mounting and the projection
 * landing (#244).
 *
 * Before this the field rendered nothing at all for as long as the daemon
 * took, so a slow answer and a project with no frames in it were the same
 * picture. The curtain says the one true thing available that early — how many
 * frames are down there — as one cell per frame, and says nothing whatever
 * about where they sit, because it does not know.
 *
 * It is gated at both ends: `boot-grid.ts` carries the two durations and the
 * reasoning behind them.
 */

export function BootCurtain({ frameCount, ready }: { frameCount: number; ready: boolean }) {
	const phase = useCurtain(ready);
	// a project with nothing in it has nothing to count, and the empty surface
	// that lands a moment later is the honest picture of it
	if (frameCount <= 0 || phase === null) return null;
	const grid = bootGrid(frameCount);
	return (
		<div
			data-canvas-booting={phase}
			className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 pb-20 ${
				phase === "leaving" ? "animate-boot-out" : "animate-boot-in"
			}`}
		>
			<div
				className="grid"
				style={{
					gridTemplateColumns: `repeat(${grid.columns}, ${grid.cellW}px)`,
					gap: grid.gap,
					width: grid.columns * grid.cellW + (grid.columns - 1) * grid.gap,
				}}
			>
				{Array.from({ length: frameCount }, (_, index) => (
					<span
						// a cell stands for a frame whose name is not known yet, so position is the
						// only identity it has. The list never reorders and the whole block is
						// replaced when the count changes.
						// biome-ignore lint/suspicious/noArrayIndexKey: nothing else identifies a cell
						key={index}
						className="animate-boot-cell rounded-[3px] bg-raised"
						// the wave crosses the block on a diagonal: a row at a time would read as a
						// list being worked through, which is a claim the curtain cannot make
						style={{
							height: grid.cellH,
							animationDuration: `${WAVE_MS}ms`,
							animationDelay: `${Math.round(waveDelay(index, grid))}ms`,
						}}
					/>
				))}
			</div>
			<div
				className="flex items-baseline justify-between font-mono text-2xs text-muted/60 leading-3"
				style={{ width: grid.columns * grid.cellW + (grid.columns - 1) * grid.gap }}
			>
				<span>design/frames</span>
				<span>
					{frameCount} {frameCount === 1 ? "frame" : "frames"}
				</span>
			</div>
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
	// before the projection landed, and what that drew was a block fading out of a
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
