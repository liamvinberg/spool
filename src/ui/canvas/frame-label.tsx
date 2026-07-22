export function FrameLabel({
	name,
	frameWidth,
	k,
	entered,
	paused,
	selected,
}: {
	name: string;
	frameWidth: number;
	k: number;
	entered: boolean;
	paused: boolean;
	selected: boolean;
}) {
	// The camera scales this after the label's 1/k counter-scale. Pre-scaling
	// the layout width by k keeps its final screen width equal to the frame.
	const width = frameWidth * k;

	return (
		<div
			data-frame-label={name}
			className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
			style={{ width, transform: `scale(${1 / k})` }}
		>
			{entered ? (
				<div className="flex items-center pb-2.5">
					<span className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
						live · esc exits
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
				</div>
			)}
		</div>
	);
}
