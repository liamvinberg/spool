import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One clock per frame. Everything on the stage is a function of its `t`, so the
 * loop is deterministic: a recording, a scrub and a still all show the same
 * picture at the same second.
 */
export function useLoop(length: number, poster: number) {
	const [t, setT] = useState(poster);
	const [playing, setPlaying] = useState(true);
	const origin = useRef<number | null>(null);
	const base = useRef(poster);
	const tRef = useRef(t);
	tRef.current = t;

	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		origin.current = null;
		const tick = (now: number) => {
			if (origin.current === null) origin.current = now;
			const next = (base.current + (now - origin.current) / 1000) % length;
			setT(next);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			base.current = tRef.current;
		};
	}, [playing, length]);

	const seek = useCallback((to: number) => {
		const next = Math.max(0, Math.min(length - 0.001, to));
		base.current = next;
		origin.current = null;
		tRef.current = next;
		setT(next);
	}, [length]);

	return { t, playing, toggle: () => setPlaying((p) => !p), seek };
}

function clockText(s: number): string {
	const whole = Math.floor(s);
	return `0:${String(whole).padStart(2, "0")}`;
}

/**
 * The bar under the window: play and pause, the scene's beats on one hairline,
 * and the beat you are in, said the way the machine would print it.
 */
export function ScrubBar({
	t,
	length,
	playing,
	beats,
	onToggle,
	onSeek,
}: {
	t: number;
	length: number;
	playing: boolean;
	beats: readonly { t: number; label: string }[];
	onToggle: () => void;
	onSeek: (t: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const at = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		onSeek(((clientX - box.left) / box.width) * length);
	};
	const current = [...beats].reverse().find((beat) => beat.t <= t);
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-5">
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
			<span className="w-[92px] shrink-0 text-muted tabular-nums type-detail">
				{clockText(t)} / {clockText(length)}
			</span>
			<div
				ref={track}
				className="relative h-full flex-1 cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					at(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) at(event.clientX);
				}}
			>
				<span className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<span
					className="absolute top-1/2 left-0 h-px bg-muted"
					style={{ width: `${(t / length) * 100}%` }}
				/>
				{beats.map((beat) => (
					<span
						key={beat.t}
						className="-translate-x-1/2 absolute top-1/2 h-2 w-px -translate-y-1/2 bg-muted/70"
						style={{ left: `${(beat.t / length) * 100}%` }}
					/>
				))}
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-2.5 w-2.5 rounded-full bg-text"
					style={{ left: `${(t / length) * 100}%` }}
				/>
			</div>
			<span className="w-[380px] shrink-0 truncate text-text type-detail">{current?.label ?? ""}</span>
		</div>
	);
}
