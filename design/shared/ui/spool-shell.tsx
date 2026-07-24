import { cn } from "../lib/utils";
import { PlayIcon, PlusIcon } from "./spool-icons";
import { SpoolMark } from "./spool-mark";

type CanvasMode = "live" | "design";

interface SpoolShellProps {
	activeTab?: string;
	children: React.ReactNode;
	/** Optional control docked at the far right of the header (e.g. inspector summon). */
	headerAccessory?: React.ReactNode;
	homeTarget?: string;
	liveTarget?: string;
	designTarget?: string;
	mode?: CanvasMode;
	playTarget?: string;
	showCanvasControls?: boolean;
	tabs?: readonly string[];
	zoom?: string;
}

export function SpoolShell({
	activeTab,
	children,
	headerAccessory,
	homeTarget,
	liveTarget,
	designTarget,
	mode = "live",
	playTarget,
	showCanvasControls = true,
	tabs = ["kaffe", "tretolv"],
	zoom = "72%",
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
						{tabs.map((tab) => (
							<button
								key={tab}
								type="button"
								className={cn(
									"flex h-[26px] items-center rounded-md px-3 text-base leading-none",
									tab === activeTab
										? "border border-border-raised bg-raised font-medium text-text"
										: "text-muted",
								)}
							>
								{tab}
							</button>
						))}
						<button
							type="button"
							className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted"
							aria-label="Open project"
						>
							<PlusIcon className="h-2.5 w-2.5" />
						</button>
					</nav>
				</div>

				{showCanvasControls || headerAccessory ? (
					<div className="flex h-full items-center gap-4">
						{showCanvasControls ? (
							<>
								<button
									type="button"
									data-go={playTarget}
									className="flex h-7 w-7 items-center justify-center"
									aria-label="Play"
								>
									<PlayIcon className="h-3 w-3" />
								</button>
								<div className="flex items-center gap-[2px] rounded-md bg-surface p-[2px]">
									<button
										type="button"
										data-go={liveTarget}
										className={cn(
											"flex items-center rounded-sm px-3 py-unit font-medium text-sm leading-xs",
											mode === "live" ? "border border-border-raised bg-raised text-text" : "text-muted",
										)}
									>
										Live
									</button>
									<button
										type="button"
										data-go={designTarget}
										className={cn(
											"flex items-center rounded-sm px-3 py-unit font-medium text-sm leading-xs",
											mode === "design" ? "border border-border-raised bg-raised text-text" : "text-muted",
										)}
									>
										Design
									</button>
								</div>
								<span className="min-w-7 text-right font-mono text-muted text-xs leading-xs">{zoom}</span>
							</>
						) : null}
						{headerAccessory ? (
							<>
								{showCanvasControls ? <span className="h-4 w-px bg-border" /> : null}
								{headerAccessory}
							</>
						) : null}
					</div>
				) : null}
			</header>
			<main className="min-h-0 flex-1">{children}</main>
		</div>
	);
}
