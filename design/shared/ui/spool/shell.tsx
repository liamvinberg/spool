import { cn } from "shared/lib/utils";
import { ThreadIcon } from "shared/ui/spool/icons";
import "./app-header.css";
import { TabStrip } from "shared/ui/spool/tab-strip";

/**
 * The app shell: one 44px bar over everything — a pinned Home button,
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
	onFocus?: ((root: string) => void) | undefined;
	onClose?: ((root: string) => void) | undefined;
	onReorder?: ((order: readonly string[]) => void) | undefined;
	onPick?: (() => void) | undefined;
	onHome?: (() => void) | undefined;
}

export function SpoolShell({
	children,
	activeTab,
	tabs = ["spool"],
	homeTarget,
	canvasControls = true,
	zoom = "72%",
	arrowsOn = true,
	headerAccessory, onFocus, onClose, onReorder, onPick, onHome,
}: SpoolShellProps) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header className="app-header relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4">
				<div className="flex h-full min-w-0 flex-1 items-center">
					<div className="app-home-zone">
						<button type="button" data-go={homeTarget} className="app-home" title="Home" onClick={onHome} aria-current={activeTab === undefined ? "page" : undefined}>
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
								<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
							</svg>
							<span>Home</span>
						</button>
					</div>
					<TabStrip
						tabs={tabs.map((tab) => ({ root: tab, name: tab }))}
						focused={activeTab ?? null}
						onFocus={onFocus} onClose={onClose} onReorder={onReorder} onPick={onPick}
					/>
				</div>

				{canvasControls || headerAccessory !== undefined ? (
					<div className="flex h-full shrink-0 items-center gap-4">
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
