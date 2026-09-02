import { cn } from "shared/lib/utils";
import { CloseIcon, PlusIcon, ThreadIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";

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
					<nav className="flex items-center gap-unit" aria-label="Projects">
						{tabs.map((tab) => {
							const active = tab === activeTab;
							return (
								<div
									key={tab}
									className={cn(
										"group flex h-[26px] items-center rounded-md",
										active && "border border-border-raised bg-raised",
									)}
								>
									<span
										className={cn(
											"h-full pl-3 pr-1 text-base leading-[24px]",
											active ? "font-medium text-text" : "text-muted",
										)}
									>
										{tab}
									</span>
									<span className="flex h-full w-5 items-center justify-center pr-1 text-muted opacity-0 group-hover:opacity-100">
										<CloseIcon className="h-2.5 w-2.5" />
									</span>
								</div>
							);
						})}
						<button
							type="button"
							className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted hover:bg-surface"
							aria-label="Open a project folder"
						>
							<PlusIcon className="h-2.5 w-2.5" />
						</button>
					</nav>
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
