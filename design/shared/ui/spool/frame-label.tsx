// Mirrors src/ui/canvas/frame-label.tsx.
// The terminal exit chord is a prop; Unseen is unseen-mark.tsx's own Mark.

import { type Mark, UnseenMark } from "shared/ui/spool/unseen-mark";

export function FrameLabel({
	name,
	frameWidth,
	k,
	entered,
	paused,
	selected,
	hovered,
	terminal = false,
	exitChord = "⌃⌥⎋",
	unseen,
	playTarget,
	onPlay,
}: {
	name: string;
	frameWidth: number;
	k: number;
	entered: boolean;
	paused: boolean;
	selected: boolean;
	hovered: boolean;
	/** An entered terminal owns every key — the chip must show the one way out. */
	terminal?: boolean;
	/** the exit binding as this platform spells it, since a frame cannot ask */
	exitChord?: string;
	/**
	 * Nobody has looked at this frame, or nobody has since it moved. The mark rides
	 * the label because the label is the one thing on the field that does not scale:
	 * a disc painted on the frame itself shrinks with the zoom, and being zoomed out
	 * is when you most need to know which of these is new.
	 */
	unseen?: Mark | undefined;
	/** a walk target, for a label standing inside the player's flow */
	playTarget?: string | undefined;
	/** Play this frame. Offered on the selection, where the attention already is. */
	onPlay?: (() => void) | undefined;
}) {
	// The camera scales this after the label's 1/k counter-scale. Pre-scaling
	// the layout width by k keeps its final screen width equal to the frame.
	const width = frameWidth * k;
	const state = paused ? "paused" : "live";

	return (
		<div
			data-frame-label={name}
			className="pointer-events-auto absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
			style={{ width, transform: `scale(${1 / k})` }}
		>
			{entered ? (
				<div className="flex items-center pb-2.5">
					<span className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
						{terminal ? `${state} · ${exitChord} exits` : `${state} · esc exits`}
					</span>
				</div>
			) : (
				<div className="flex w-full min-w-0 items-center gap-1.5 pb-2.5">
					{paused && <span className="shrink-0 font-mono text-2xs text-muted leading-3">▸</span>}
					{unseen !== undefined && <UnseenMark mark={unseen} className="-ml-0.5" />}
					<span
						className={`min-w-0 truncate font-mono text-sm leading-4 ${
							selected ? "text-thread" : hovered || unseen !== undefined ? "text-text" : "text-muted"
						}`}
					>
						{name}
					</span>
					{/* the selection's own verb, at the far end of its own row: no
					    travelling to a corner of the chrome to act on what is right
					    here. Ghost until wanted — the label is not a toolbar. */}
					{selected && (
						<button
							type="button"
							data-go={playTarget}
							aria-label={`Play ${name}`}
							className="ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 font-mono text-2xs text-muted leading-3 transition-colors hover:text-thread"
							onPointerDown={(event) => {
								event.stopPropagation();
								onPlay?.();
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
