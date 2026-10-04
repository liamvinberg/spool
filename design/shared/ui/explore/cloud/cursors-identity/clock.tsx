import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

/**
 * The loop's one clock. Everything on the page is a function of `t`, so pausing
 * freezes every person mid-gesture and scrubbing replays them exactly.
 */
export function useLoop(duration: number, start: number) {
	const [t, setT] = useState(start);
	const [playing, setPlaying] = useState(true);
	const last = useRef<number | null>(null);

	useEffect(() => {
		if (!playing) {
			last.current = null;
			return;
		}
		let raf = 0;
		const tick = (now: number) => {
			if (last.current !== null) {
				const dt = Math.min(0.1, (now - last.current) / 1000);
				setT((prev) => (prev + dt) % duration);
			}
			last.current = now;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration]);

	return { t, playing, setPlaying, seek: (to: number) => setT(((to % duration) + duration) % duration) };
}

export function ScrubBar({
	t,
	duration,
	playing,
	moments,
	onToggle,
	onSeek,
	onHold,
}: {
	t: number;
	duration: number;
	playing: boolean;
	moments: readonly { t: number; label: string }[];
	onToggle: () => void;
	onSeek: (t: number) => void;
	onHold: (held: boolean) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const seekAt = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onSeek(Math.min(0.999, Math.max(0, (clientX - box.left) / box.width)) * duration);
	};
	const at = t / duration;
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-4">
			<button
				type="button"
				aria-label={playing ? "Pause" : "Play"}
				onClick={onToggle}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text transition-[background-color,transform] duration-[140ms] hover:bg-surface active:scale-90"
			>
				{playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
						<rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<path d="M3 1.6 10.2 6 3 10.4Z" />
					</svg>
				)}
			</button>
			<span className="w-10 shrink-0 text-text tabular-nums type-value">{t.toFixed(1).padStart(4, "0")}</span>
			<div
				ref={track}
				className="relative h-full flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					onHold(true);
					seekAt(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event.clientX);
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					onHold(false);
				}}
			>
				<div className="absolute inset-x-0 top-[36px] h-[2px] rounded-full bg-border-raised" />
				<div className="absolute left-0 top-[36px] h-[2px] rounded-full bg-muted" style={{ width: `${at * 100}%` }} />
				{moments.map((moment) => (
					<div
						key={`${moment.t}-${moment.label}`}
						className="absolute top-[14px] flex -translate-x-1/2 flex-col items-center gap-1"
						style={{ left: `${(moment.t / duration) * 100}%` }}
					>
						<span className={cn("type-detail", t >= moment.t ? "text-text" : "text-muted")}>{moment.label}</span>
						<span className="h-[6px] w-px bg-border-raised" />
					</div>
				))}
				<div
					className="absolute top-[30px] h-[14px] w-[2px] -translate-x-1/2 rounded-full bg-text"
					style={{ left: `${at * 100}%` }}
				/>
			</div>
			<span className="w-10 shrink-0 text-right text-muted tabular-nums type-value">{duration.toFixed(1)}</span>
		</div>
	);
}
