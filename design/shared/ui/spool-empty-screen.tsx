import { SpoolMark } from "./spool-mark";
import { SpoolShell } from "./spool-shell";

interface SpoolEmptyScreenProps {
	designTarget?: string;
	homeTarget?: string;
	liveTarget?: string;
	playTarget?: string;
}

export function SpoolEmptyScreen({ designTarget, homeTarget, liveTarget, playTarget }: SpoolEmptyScreenProps) {
	return (
		<SpoolShell
			activeTab="kaffe"
			tabs={["kaffe"]}
			homeTarget={homeTarget}
			liveTarget={liveTarget}
			designTarget={designTarget}
			playTarget={playTarget}
			zoom="100%"
		>
			<div className="flex h-full flex-col items-center justify-center bg-canvas pb-20">
				<div className="flex flex-col items-center gap-3">
					<SpoolMark className="h-7 w-[22px] text-thread opacity-40" />
					<h1 className="font-medium text-base leading-base">No frames yet.</h1>
					<p className="font-mono text-muted text-sm leading-sm">
						An agent births a frame by writing frames/&lt;name&gt;/frame.tsx
					</p>
					<p className="font-mono text-muted text-xs leading-xs">spool skill · spool url</p>
				</div>
			</div>
		</SpoolShell>
	);
}
