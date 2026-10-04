import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

/**
 * One clock for a whole take. The window above reads it through `useLoopTime`,
 * so only what moves re-renders, and the bar under the window plays, pauses and
 * scrubs it. Scrubbing pauses; pressing play carries on from where you let go.
 */

const Time = createContext(0);

export function useLoopTime(): number {
	return useContext(Time);
}

export function CursorLoop({
	duration,
	start = 0,
	beats,
	children,
}: {
	duration: number;
	/** where the loop opens, so the still a frame boots into is a moment worth seeing */
	start?: number;
	beats: readonly { at: number; label: string }[];
	children: ReactNode;
}) {
	const [t, setT] = useState(start);
	const [playing, setPlaying] = useState(true);
	const base = useRef<{ wall: number; t: number } | null>(null);
	const latest = useRef(t);
	latest.current = t;

	useEffect(() => {
		if (!playing) {
			base.current = null;
			return;
		}
		let raf = 0;
		const tick = (wall: number) => {
			if (base.current === null) base.current = { wall, t: latest.current };
			const next = (base.current.t + (wall - base.current.wall) / 1000) % duration;
			setT(next);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration]);

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative h-[900px] shrink-0 overflow-hidden">
				<Time.Provider value={t}>{children}</Time.Provider>
			</div>
			<ScrubBar
				t={t}
				duration={duration}
				beats={beats}
				playing={playing}
				onToggle={() => setPlaying((p) => !p)}
				onScrub={(next) => {
					setPlaying(false);
					setT(next);
				}}
			/>
		</div>
	);
}

function ScrubBar({
	t,
	duration,
	beats,
	playing,
	onToggle,
	onScrub,
}: {
	t: number;
	duration: number;
	beats: readonly { at: number; label: string }[];
	playing: boolean;
	onToggle: () => void;
	onScrub: (t: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const read = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onScrub(Math.min(duration - 0.001, Math.max(0, ((clientX - box.left) / box.width) * duration)));
	};
	return (
		<div className="relative flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-4">
			<button
				type="button"
				aria-label={playing ? "Pause" : "Play"}
				onClick={onToggle}
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
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
			<span className="w-10 shrink-0 text-text tabular-nums type-detail">{t.toFixed(1).padStart(4, "0")}</span>
			<div
				ref={track}
				className="relative h-full min-w-0 flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					read(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) read(event.clientX);
				}}
			>
				<div className="absolute inset-x-0 top-[30px] h-px bg-border-raised" />
				<div className="absolute top-[30px] left-0 h-px bg-muted" style={{ width: `${(t / duration) * 100}%` }} />
				{beats.map((beat, i) => {
					const above = i % 2 === 1;
					return (
						<div
							key={beat.label}
							className={cn(
								"absolute flex -translate-x-px items-start gap-[5px]",
								above ? "top-[7px] flex-col-reverse" : "top-[30px] flex-col",
							)}
							style={{ left: `${(beat.at / duration) * 100}%` }}
						>
							<span className={cn("h-[6px] w-px", t >= beat.at ? "bg-muted" : "bg-border-raised")} />
							<span
								className={cn(
									"whitespace-nowrap leading-3 type-detail",
									t >= beat.at && t - beat.at < 1.6 ? "text-text" : "text-muted",
								)}
							>
								{beat.label}
							</span>
						</div>
					);
				})}
				<div
					className="absolute top-[25px] h-[11px] w-[3px] -translate-x-1/2 rounded-full bg-text"
					style={{ left: `${(t / duration) * 100}%` }}
				/>
			</div>
			<span className="w-10 shrink-0 text-right text-muted tabular-nums type-detail">{duration.toFixed(1)}</span>
		</div>
	);
}
