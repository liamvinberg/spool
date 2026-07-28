import { FrameThumb } from "../../../shared/ui/spool-play-field";

/**
 * Another page's canvas, at the same camera.
 *
 * Every page in spool is its own canvas, so walking to one is the only thing that
 * happens when you reach a thread this way: the frames change and nothing else
 * does. The geometry matches spool-play-field so the two read as the same camera
 * moving rather than two different drawings, and the frames are drawn by the same
 * component the rail draws its thumbnails with.
 */

const COLS = [114, 310, 506] as const;
const TOP = 46;
const FW = 152;
const FH = 329;
const LABEL_LIFT = 22;

export function PageCanvas({ frames }: { frames: readonly string[] }) {
	return (
		<div className="absolute inset-0">
			{frames.map((name, index) => (
				<div
					key={name}
					className="absolute flex flex-col"
					style={{ left: COLS[index] ?? 0, top: TOP - LABEL_LIFT, width: FW }}
				>
					<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
						<span className="min-w-0 truncate text-text">{name}</span>
					</div>
					<div
						className="overflow-hidden rounded-lg border border-border-raised bg-bg"
						style={{ width: FW, height: FH }}
					>
						<FrameThumb name={name} width={FW} />
					</div>
				</div>
			))}
		</div>
	);
}
