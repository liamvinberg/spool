import { CanvasChrome } from "./spool-canvas-chrome";
import { SpoolMark } from "./spool-mark";
import { SpoolShell } from "./spool-shell";

/**
 * A registered project with nothing in it yet. The chrome is the same chrome —
 * rails, tool bar, the lot — because the project is open and real; only the
 * field is empty. The rails say so honestly rather than hiding.
 */

interface SpoolEmptyScreenProps {
	homeTarget?: string | undefined;
}

export function SpoolEmptyScreen({ homeTarget }: SpoolEmptyScreenProps) {
	return (
		<SpoolShell activeTab="spool-cloud" tabs={["spool-cloud"]} homeTarget={homeTarget} zoom="100%">
			<CanvasChrome pages={[{ name: "frames", frames: [], active: true, open: true }]}>
				<div className="flex h-full flex-col items-center justify-center pb-20">
					<div className="flex flex-col items-center gap-3">
						<SpoolMark className="h-7 w-[22px] text-thread opacity-40" />
						<h1 className="font-medium text-base leading-base">No frames yet.</h1>
						<p className="font-mono text-muted text-sm leading-sm">
							An agent births a frame by writing frames/&lt;name&gt;/frame.tsx
						</p>
						<p className="font-mono text-muted text-xs leading-xs">spool skill · spool url</p>
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
