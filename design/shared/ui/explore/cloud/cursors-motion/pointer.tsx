import type { CSSProperties } from "react";
import { type FrameBox, type Scene, type Spring, settle, spanAt, type Track, viewAt } from "shared/ui/explore/cloud/cursors-motion/engine";
import type { Cam } from "shared/ui/explore/cloud/cursors-motion/stage";

/**
 * The pointer every take starts from. Its shape is deliberately the one a
 * person already owns; what the takes argue about is how it moves.
 * The tip sits at (1, 1), so `left/top` are the hand minus one pixel.
 */
export function Arrow({ color, style }: { color: string; style?: CSSProperties | undefined }) {
	return (
		<svg
			viewBox="0 0 16 20"
			width="16"
			height="20"
			className="absolute top-0 left-0 origin-[1px_1px] overflow-visible"
			style={style}
			aria-hidden="true"
		>
			<path
				d="M1.2 1.2v14.6l3.9-3.7 2.7 6.1 2.6-1.1-2.7-6h5.5Z"
				fill={color}
				stroke="#0e0e0e"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** a name chip's width at 11px Instrument Sans medium, near enough to wind and dock by */
export function chipWidth(name: string): number {
	return Math.round(name.length * 6.5 + 13);
}

/** seconds since arriving and until leaving, at any past instant */
export function arrivalAt(track: Track, scene: Scene, t: number): { since: number; until: number } {
	return spanAt(track, scene.length, t) ?? { since: 0, until: 0 };
}

/** the followed person's view, eased the way a take eases its camera */
export function easedView(scene: Scene, t: number, s: Spring): Cam {
	return {
		x: settle((x) => viewAt(scene, x).x, t, s, 2.4),
		y: settle((x) => viewAt(scene, x).y, t, s, 2.4),
		z: settle((x) => viewAt(scene, x).z, t, s, 2.4),
	};
}

/** a camera that frames one frame at the zoom the followed view uses */
export function framing(frame: FrameBox | null, z: number): Cam {
	if (frame === null) return { x: 574, y: 428, z: 1 };
	return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 - 10, z };
}
