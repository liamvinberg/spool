import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import type { Mark } from "shared/ui/explore/cloud/cursors-motion/engine";

/**
 * The one clock. It plays from a poster instant, so a still of the frame is
 * a moment worth looking at, and loops forever after.
 */
export function useLoopClock(length: number, start: number) {
	const [t, setT] = useState(start);
	const [playing, setPlaying] = useState(true);
	const tRef = useRef(start);

	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			tRef.current = (tRef.current + dt) % length;
			setT(tRef.current);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, length]);

	const seek = useCallback(
		(next: number) => {
			tRef.current = ((next % length) + length) % length;
			setT(tRef.current);
		},
		[length],
	);

	return { t, playing, setPlaying, seek };
}

export function ScrubBar({
	t,
	length,
	playing,
	marks,
	packets,
	onToggle,
	onSeek,
	onPackets,
}: {
	t: number;
	length: number;
	playing: boolean;
	marks: readonly Mark[];
	packets: boolean;
	onToggle: () => void;
	onSeek: (t: number) => void;
	onPackets: () => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const resume = useRef(false);

	const seekAt = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onSeek(Math.min(0.999, Math.max(0, (clientX - box.left) / box.width)) * length);
	};

	return (
		<div className="relative flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg pr-5 pl-3">
			<button
				type="button"
				aria-label={playing ? "Pause" : "Play"}
				onClick={onToggle}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text transition-[background-color,transform] duration-[140ms] hover:bg-surface active:scale-90"
			>
				{playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<rect x="2.2" y="1.5" width="2.6" height="9" rx="0.6" />
						<rect x="7.2" y="1.5" width="2.6" height="9" rx="0.6" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<path d="M3 1.6 10.2 6 3 10.4Z" />
					</svg>
				)}
			</button>
			<span className="w-[92px] shrink-0 text-muted tabular-nums type-detail">
				<span className="text-text">{t.toFixed(1).padStart(4, "0")}</span> / {length.toFixed(1)}s
			</span>
			<div
				ref={track}
				data-scrub=""
				className="relative h-full min-w-0 flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					resume.current = playing;
					if (playing) onToggle();
					seekAt(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) seekAt(event.clientX);
				}}
				onPointerUp={() => {
					if (resume.current) onToggle();
					resume.current = false;
				}}
			>
				<span className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<span className="absolute top-1/2 left-0 h-px bg-muted" style={{ width: `${(t / length) * 100}%` }} />
				{marks.map((mark, i) => (
					<span
						key={`${mark.t}-${mark.label}`}
						className="absolute top-0 bottom-0"
						style={{ left: `${(mark.t / length) * 100}%` }}
					>
						<span className="-translate-x-1/2 absolute top-[27px] h-[6px] w-px bg-muted/70" />
						<span
							className={cn(
								"absolute whitespace-nowrap text-[10px] leading-3 transition-colors duration-200",
								i % 2 === 0 ? "top-[10px]" : "top-[38px]",
								Math.abs(t - mark.t) < 1.2 && t >= mark.t ? "text-text" : "text-muted/70",
							)}
							style={{ fontFamily: "var(--font-mono)", transform: "translateX(-2px)" }}
						>
							{mark.label}
						</span>
					</span>
				))}
				<span
					className="absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text"
					style={{ left: `${(t / length) * 100}%` }}
				/>
			</div>
			<button
				type="button"
				aria-pressed={packets}
				onClick={onPackets}
				className={cn(
					"flex h-7 shrink-0 items-center gap-2 rounded-sm px-2 type-detail transition-colors duration-[140ms] hover:bg-surface",
					packets ? "text-text" : "text-muted",
				)}
			>
				<span
					className={cn(
						"h-2.5 w-2.5 rounded-[2px] border transition-colors duration-[140ms]",
						packets ? "border-text bg-text" : "border-muted",
					)}
				/>
				packets
			</button>
		</div>
	);
}
