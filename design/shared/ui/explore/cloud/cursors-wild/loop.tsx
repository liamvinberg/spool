import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

/**
 * The specimen's clock: one time value drives everything in the window above,
 * and the 60px bar under it plays, pauses and scrubs that value. Nothing in a
 * take keeps its own timer, so a paused frame is a true still and a scrub
 * lands on exactly what the loop would have drawn there.
 */

/** set while checking stills: every loop opens paused here */
const HOLD_AT: number | null = null;

export function Loop({
	duration,
	moments,
	start = 0,
	children,
}: {
	duration: number;
	moments: readonly { t: number; label: string }[];
	/** where the loop opens, so the frame's cover is a moment worth seeing */
	start?: number | undefined;
	children: (t: number) => ReactNode;
}) {
	const [t, setT] = useState(HOLD_AT ?? start);
	const [playing, setPlaying] = useState(HOLD_AT === null);
	const last = useRef<number | null>(null);

	useEffect(() => {
		if (!playing) {
			last.current = null;
			return;
		}
		let frame = 0;
		const tick = (now: number) => {
			const before = last.current ?? now;
			last.current = now;
			setT((value) => (value + (now - before)) % duration);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, duration]);

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative h-[900px] shrink-0 overflow-hidden">{children(t)}</div>
			<ScrubBar
				t={t}
				duration={duration}
				moments={moments}
				playing={playing}
				onToggle={() => setPlaying((value) => !value)}
				onSeek={(value) => setT(value)}
			/>
		</div>
	);
}

function ScrubBar({
	t,
	duration,
	moments,
	playing,
	onToggle,
	onSeek,
}: {
	t: number;
	duration: number;
	moments: readonly { t: number; label: string }[];
	playing: boolean;
	onToggle: () => void;
	onSeek: (t: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const seekAt = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onSeek(Math.min(duration - 1, Math.max(0, ((clientX - box.left) / box.width) * duration)));
	};
	const share = t / duration;
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-5 border-border border-t bg-bg px-5">
			<button
				type="button"
				aria-label={playing ? "Pause" : "Play"}
				onClick={onToggle}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
			>
				{playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<rect x="2.5" y="2" width="2.4" height="8" rx="0.6" />
						<rect x="7.1" y="2" width="2.4" height="8" rx="0.6" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<path d="M3 1.8 10 6 3 10.2Z" />
					</svg>
				)}
			</button>
			<div
				ref={track}
				role="slider"
				tabIndex={0}
				aria-label="Loop time"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={Math.round(t)}
				className="relative h-full min-w-0 flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					seekAt(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event.clientX);
				}}
			>
				<div className="absolute inset-x-0 top-[26px] h-[2px] rounded-full bg-raised" />
				<div className="absolute top-[26px] left-0 h-[2px] rounded-full bg-muted" style={{ width: `${share * 100}%` }} />
				{moments.map((moment) => (
					<div key={moment.label} className="absolute top-0 h-full" style={{ left: `${(moment.t / duration) * 100}%` }}>
						<span className="absolute top-[22px] h-2.5 w-px bg-border-raised" />
						<span
							className={cn(
								"absolute top-[34px] -translate-x-1/2 whitespace-nowrap type-detail transition-colors duration-150",
								t >= moment.t ? "text-muted" : "text-muted/50",
							)}
						>
							{moment.label}
						</span>
					</div>
				))}
				<span
					className="absolute top-[21px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-bg bg-text"
					style={{ left: `${share * 100}%` }}
				/>
			</div>
			<span className="w-[92px] shrink-0 text-right text-muted tabular-nums type-detail">
				{(t / 1000).toFixed(1).padStart(4, "0")}s / {(duration / 1000).toFixed(0)}s
			</span>
		</div>
	);
}
