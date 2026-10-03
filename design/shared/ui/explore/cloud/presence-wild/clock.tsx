import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

/**
 * One clock per frame, in seconds, looping. Everything drawn reads `t` and nothing keeps
 * time of its own, so a scrub is exact and a screen recording of the frame is the
 * scenario playing out. Under reduced motion it holds at the poster moment.
 */
export function useClock(duration: number, poster: number) {
	// `#t=9.5` opens the frame held at that moment, for reviewing one instant of the loop
	const [t, setT] = useState(() => heldAt() ?? poster);
	const [playing, setPlaying] = useState(true);
	const last = useRef<number | null>(null);

	useEffect(() => {
		if (heldAt() !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
	}, []);

	useEffect(() => {
		if (!playing) {
			last.current = null;
			return;
		}
		let raf = 0;
		const tick = (now: number) => {
			const before = last.current;
			last.current = now;
			if (before !== null) setT((value) => (value + Math.min(0.1, (now - before) / 1000)) % duration);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration]);

	return { t, playing, setPlaying, seek: (value: number) => setT(Math.max(0, Math.min(duration - 0.001, value))) };
}

function heldAt(): number | null {
	if (typeof window === "undefined") return null;
	const match = /t=([\d.]+)/.exec(window.location.hash);
	return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * The control under the window: play or hold, the scenario's beats as ticks, and the beat
 * that is playing said in a sentence. It belongs to the specimen rather than to spool.
 */
export function ScrubBar({
	t,
	duration,
	playing,
	beats,
	onPlay,
	onSeek,
}: {
	t: number;
	duration: number;
	playing: boolean;
	beats: readonly { readonly at: number; readonly say: string }[];
	onPlay: (playing: boolean) => void;
	onSeek: (t: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const current = beats.filter((beat) => beat.at <= t).at(-1);
	const seekAt = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onSeek(((clientX - box.left) / box.width) * duration);
	};
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-4">
			<button
				type="button"
				aria-label={playing ? "Pause" : "Play"}
				onClick={() => onPlay(!playing)}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text active:scale-95"
			>
				{playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
						<rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<path d="M3 1.8v8.4c0 .5.5.8.9.5l6.4-4.2c.4-.2.4-.8 0-1L3.9 1.3c-.4-.3-.9 0-.9.5Z" />
					</svg>
				)}
			</button>
			<span className="w-[420px] shrink-0 truncate text-muted type-label">{current?.say ?? ""}</span>
			<div
				ref={track}
				role="slider"
				tabIndex={0}
				aria-label="Scrub"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={Math.round(t * 10) / 10}
				className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					onPlay(false);
					seekAt(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) seekAt(event.clientX);
				}}
			>
				<span className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<span className="absolute top-1/2 left-0 h-px bg-muted" style={{ width: `${(t / duration) * 100}%` }} />
				{beats.map((beat) => (
					<span
						key={beat.at}
						className={cn("absolute top-1/2 h-2 w-px -translate-y-1/2", beat.at <= t ? "bg-text" : "bg-border-raised")}
						style={{ left: `${(beat.at / duration) * 100}%` }}
					/>
				))}
				<span
					className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text"
					style={{ left: `${(t / duration) * 100}%` }}
				/>
			</div>
			<span className="w-[92px] shrink-0 text-right text-muted tabular-nums type-detail">
				{t.toFixed(1).padStart(4, "0")} / {duration.toFixed(1)} s
			</span>
		</div>
	);
}
