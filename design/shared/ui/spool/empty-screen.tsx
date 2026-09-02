import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A registered project with nothing in it yet. The chrome is the same chrome —
 * rails, tool bar, the lot — because the project is open and real; only the
 * field is empty. The rails say so honestly rather than hiding.
 */

interface SpoolEmptyScreenProps {
	homeTarget?: string | undefined;
	/** the folder this canvas belongs to: the tab wears its name */
	project?: string | undefined;
}

export function SpoolEmptyScreen({ homeTarget, project = "spool-cloud" }: SpoolEmptyScreenProps) {
	return (
		<SpoolShell activeTab={project} tabs={[project]} homeTarget={homeTarget} zoom="100%">
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
