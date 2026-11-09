import type { MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Progress } from "./primitives/feedback";

/**
 * A changelog clip: the poster at once, the video over it the moment it plays,
 * and the thread sweeping along its foot until then. While it plays, `time`
 * follows it from 0 to 1 every loop, smoothly, for whatever draws its clock.
 */
export function Clip({
	src,
	poster,
	time,
	className,
}: {
	src: string;
	poster?: string | undefined;
	time?: MotionValue<number> | undefined;
	className?: string | undefined;
}) {
	const video = useRef<HTMLVideoElement>(null);
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		const v = video.current;
		if (v === null) return;
		v.muted = true;
		v.play().catch(() => {});
		let frame = 0;
		const tick = () => {
			if (v.duration > 0) time?.set(v.currentTime / v.duration);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		const on = () => setPlaying(true);
		v.addEventListener("playing", on);
		return () => {
			cancelAnimationFrame(frame);
			v.removeEventListener("playing", on);
		};
	}, [time]);

	return (
		<div className={cn("absolute inset-0 overflow-hidden bg-surface-panel", className)}>
			{poster === undefined ? null : <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />}
			<video
				ref={video}
				src={src}
				poster={poster}
				autoPlay
				muted
				loop
				playsInline
				preload="auto"
				className={cn(
					"absolute inset-0 size-full object-cover transition-opacity duration-slow ease-out",
					playing ? "opacity-100" : "opacity-0",
				)}
			/>
			{playing ? null : <Progress label="Loading the clip" />}
		</div>
	);
}
