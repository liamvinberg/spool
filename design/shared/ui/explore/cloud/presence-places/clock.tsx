import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import type { Beat } from "shared/ui/explore/cloud/presence-places/scenarios";

/**
 * One clock for a whole frame. Everything drawn reads `t` and nothing keeps time
 * of its own, so the scene is the same scene at the same second on every play,
 * every recording and every scrub.
 */
export function useClock(total: number): {
	t: number;
	playing: boolean;
	toggle: () => void;
	seek: (to: number) => void;
} {
	const [t, setT] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [epoch, setEpoch] = useState(0);
	const at = useRef(0);

	useEffect(() => {
		if (!playing) return;
		const from = at.current;
		const start = performance.now();
		let raf = 0;
		const tick = (now: number) => {
			const next = (from + (now - start) / 1000) % total;
			at.current = next;
			setT(next);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
		// epoch restarts the run from wherever a scrub left it
	}, [playing, total, epoch]);

	const seek = useCallback(
		(to: number) => {
			const next = Math.min(total - 0.001, Math.max(0, to));
			at.current = next;
			setT(next);
			setEpoch((value) => value + 1);
		},
		[total],
	);

	return { t, playing, toggle: () => setPlaying((value) => !value), seek };
}

/** the window at 1440×900, and the scrub under it */
export function Stage({
	t,
	total,
	playing,
	beats,
	onToggle,
	onSeek,
	children,
}: {
	t: number;
	total: number;
	playing: boolean;
	beats: readonly Beat[];
	onToggle: () => void;
	onSeek: (to: number) => void;
	children: ReactNode;
}) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="h-[900px] shrink-0 overflow-hidden">{children}</div>
			<Scrub t={t} total={total} playing={playing} beats={beats} onToggle={onToggle} onSeek={onSeek} />
		</div>
	);
}

function Scrub({
	t,
	total,
	playing,
	beats,
	onToggle,
	onSeek,
}: {
	t: number;
	total: number;
	playing: boolean;
	beats: readonly Beat[];
	onToggle: () => void;
	onSeek: (to: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState(false);
	const toTime = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return 0;
		return ((clientX - box.left) / box.width) * total;
	};
	let current: Beat | null = null;
	for (const beat of beats) if (beat.at <= t) current = beat;

	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-5">
			<button
				type="button"
				onClick={onToggle}
				aria-label={playing ? "Pause" : "Play"}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
			>
				{playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
						<rect x="2.5" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
						<rect x="7.1" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
						<path d="M3.5 2.2v7.6L9.6 6Z" fill="currentColor" />
					</svg>
				)}
			</button>
			<span className="w-[78px] shrink-0 text-muted tabular-nums type-detail">
				{t.toFixed(1).padStart(4, "0")} / {total.toFixed(1)}
			</span>
			<div
				ref={track}
				className="relative h-8 min-w-0 flex-1 cursor-pointer"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					setDragging(true);
					onSeek(toTime(event.clientX));
				}}
				onPointerMove={(event) => {
					if (dragging) onSeek(toTime(event.clientX));
				}}
				onPointerUp={() => setDragging(false)}
			>
				<span className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<span className="absolute top-1/2 left-0 h-px bg-muted" style={{ width: `${(t / total) * 100}%` }} />
				{beats.map((beat) => (
					<span
						key={`${beat.at}-${beat.label}`}
						className={cn(
							"-translate-x-1/2 absolute top-[calc(50%-4px)] h-2 w-px",
							beat.at <= t ? "bg-muted" : "bg-border-raised",
						)}
						style={{ left: `${(beat.at / total) * 100}%` }}
					/>
				))}
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-2.5 w-2.5 rounded-full bg-text"
					style={{ left: `${(t / total) * 100}%` }}
				/>
			</div>
			<span className="w-[300px] shrink-0 truncate text-right text-muted type-detail">{current?.label ?? ""}</span>
		</div>
	);
}
