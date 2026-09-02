import { cn } from "shared/lib/utils";
import { ThreadIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { TabStrip } from "shared/ui/spool/tab-strip";

/**
 * The app shell: one 44px bar over everything — brand lockup as the home door,
 * one tab per open project, "+" for the folder picker, and on the right the
 * threads toggle and the zoom readout, both of which belong to the focused
 * canvas and vanish on home.
 *
 * There is no mode switch and no play button here. Select is the only pointer
 * tool, so "design mode" has nothing left to mean, and play lives on the
 * selection — a bar button could only guess which frame you meant.
 */

interface SpoolShellProps {
	children: React.ReactNode;
	/** the focused project tab; absent on home, where no canvas is focused */
	activeTab?: string | undefined;
	tabs?: readonly string[] | undefined;
	homeTarget?: string | undefined;
	/** canvas-only controls: the right side of the bar is empty on home */
	canvasControls?: boolean | undefined;
	zoom?: string | undefined;
	arrowsOn?: boolean | undefined;
	/** an exploration's own control, docked at the far right — proposals only */
	headerAccessory?: React.ReactNode | undefined;
}

export function SpoolShell({
	children,
	activeTab,
	tabs = ["spool", "kaffe"],
	homeTarget,
	canvasControls = true,
	zoom = "72%",
	arrowsOn = true,
	headerAccessory,
}: SpoolShellProps) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header className="flex h-11 shrink-0 items-center justify-between border-border border-b bg-bg px-4">
				<div className="flex h-full items-center gap-5">
					<button type="button" data-go={homeTarget} className="flex items-center gap-2" aria-label="Home">
						<SpoolMark className="h-[18px] w-3.5 text-thread" />
						<span className="font-semibold text-md tracking-tight leading-sm">spool</span>
					</button>
					<TabStrip
						tabs={tabs.map((tab) => ({ root: tab, name: tab }))}
						focused={activeTab ?? null}
					/>
				</div>

				{canvasControls || headerAccessory !== undefined ? (
					<div className="flex h-full items-center gap-4">
						{canvasControls ? (
							<>
								<button
									type="button"
									aria-label="Threads"
									aria-pressed={arrowsOn}
									className={cn(
										"flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface",
										arrowsOn ? "text-text" : "text-muted",
									)}
								>
									<ThreadIcon className="h-3.5 w-3.5" />
								</button>
								<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">{zoom}</span>
							</>
						) : null}
						{headerAccessory}
					</div>
				) : null}
			</header>
			<main className="min-h-0 flex-1">{children}</main>
		</div>
	);
}
