import { exitChordLabel } from "../../runtime/term-keys";

/** The exit binding as this platform spells it — the chip must show a chord that works here. */
const EXIT_CHORD = exitChordLabel(typeof navigator === "undefined" ? "Mac" : navigator.platform);

export function FrameLabel({
	name,
	frameWidth,
	k,
	entered,
	paused,
	selected,
	terminal = false,
	onPlay,
}: {
	name: string;
	frameWidth: number;
	k: number;
	entered: boolean;
	paused: boolean;
	selected: boolean;
	/** An entered terminal owns every key (#42) — the chip must show the one way out. */
	terminal?: boolean;
	/** Play this frame. Offered on the selection, where the attention already is. */
	onPlay?: () => void;
}) {
	// The camera scales this after the label's 1/k counter-scale. Pre-scaling
	// the layout width by k keeps its final screen width equal to the frame.
	const width = frameWidth * k;
	const state = paused ? "paused" : "live";

	return (
		<div
			data-frame-label={name}
			className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
			style={{ width, transform: `scale(${1 / k})` }}
		>
			{entered ? (
				<div className="flex items-center pb-2.5">
					<span className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
						{terminal ? `${state} · ${EXIT_CHORD} exits` : `${state} · esc exits`}
					</span>
				</div>
			) : (
				<div className="flex w-full min-w-0 items-center gap-1.5 pb-2.5">
					{paused && <span className="shrink-0 font-mono text-2xs text-muted leading-3">▸</span>}
					<span
						className={`min-w-0 truncate font-mono text-sm leading-4 ${selected ? "text-thread" : "text-muted"}`}
					>
						{name}
					</span>
					{/* the selection's own verb, at the far end of its own row: no
					    travelling to a corner of the chrome to act on what is right
					    here. Ghost until wanted — the label is not a toolbar. */}
					{selected && onPlay !== undefined && (
						<button
							type="button"
							aria-label={`Play ${name}`}
							className="ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 font-mono text-2xs text-muted leading-3 transition-colors hover:text-thread"
							onPointerDown={(event) => {
								event.stopPropagation();
								onPlay();
							}}
							onDoubleClick={(event) => event.stopPropagation()}
						>
							<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
								<path d="M2 1.2 8.4 5 2 8.8Z" />
							</svg>
							play
						</button>
					)}
				</div>
			)}
		</div>
	);
}
