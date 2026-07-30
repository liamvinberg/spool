import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { CloseIcon, ConnectionsIcon, PlusIcon } from "./spool-icons";
import { SpoolMark } from "./spool-mark";

/**
 * The app bar, with the seams a proposal about the chrome needs to open.
 *
 * `SpoolShell` is the shipped bar and it is closed: one 44px row, lockup, project
 * tabs, plus, then the flow toggle and the zoom. Every take on this row needs to cut
 * it somewhere different — under it, inside the tab group, or across the span that
 * sits over the rail — so this is that bar again with those three seams named, and
 * nothing else changed. Same height, same paddings, same tab pill, same right group.
 *
 * **One thing here is a correction rather than a copy.** The right-hand toggle is
 * `EdgeIcon` in `src/ui/icons.tsx`, not the ribbon: #146 re-iconed it when the toggle
 * grew to govern the whole flow layer. `SpoolShell` still draws the ribbon, which is
 * the design folder lagging the code. It matters here more than usual, because that
 * button's title is literally `Threads` — see the note every frame in this family
 * carries about what that word already means in this bar.
 */

export function DeckShell({
	children,
	activeTab = "kaffe",
	tabs = ["kaffe", "spool"],
	zoom = "39%",
	tabGroup,
	second,
	middle,
	right,
	rail,
	railWidth = 420,
	arrowsOn = true,
	overlay,
}: {
	children: ReactNode;
	activeTab?: string | undefined;
	tabs?: readonly string[] | undefined;
	zoom?: string | undefined;
	/** replaces the whole projects nav, for a take that puts threads inside a tab */
	tabGroup?: ReactNode | undefined;
	/** a row of its own directly under the bar, full window width */
	second?: ReactNode | undefined;
	/** the span between the two groups, which is empty in the shipped bar */
	middle?: ReactNode | undefined;
	/** extra cells in the right group, ahead of the flow toggle */
	right?: ReactNode | undefined;
	/** a cell hugging the right edge at the rail's own width, with the rail's own border */
	rail?: ReactNode | undefined;
	railWidth?: number | undefined;
	arrowsOn?: boolean | undefined;
	/** whatever the chrome drops over the app: a list, a palette, a click-catcher */
	overlay?: ReactNode | undefined;
}) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header
				className={cn(
					"flex h-11 shrink-0 items-center justify-between border-border border-b bg-bg pl-4",
					rail === undefined ? "pr-4" : "pr-0",
				)}
			>
				<div className={cn("flex h-full min-w-0 items-center gap-5", middle === undefined ? "flex-1" : "shrink-0")}>
					<button type="button" className="flex shrink-0 items-center gap-2" aria-label="Home">
						<SpoolMark className="h-[18px] w-3.5 text-thread" />
						<span className="font-semibold text-md tracking-tight leading-sm">spool</span>
					</button>
					{tabGroup === undefined ? <ProjectTabs tabs={tabs} activeTab={activeTab} /> : tabGroup}
				</div>
				{middle === undefined ? null : <div className="flex h-full min-w-0 flex-1 items-center px-6">{middle}</div>}

				<div className="flex h-full shrink-0 items-center gap-4">
					{right}
					<button
						type="button"
						aria-label="Threads"
						aria-pressed={arrowsOn}
						className={cn(
							"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm hover:bg-surface",
							arrowsOn ? "text-text" : "text-muted",
						)}
					>
						<ConnectionsIcon className="h-3.5 w-3.5" />
					</button>
					<span className={cn("min-w-9 text-right font-mono text-muted text-xs leading-xs", rail !== undefined && "mr-4")}>
						{zoom}
					</span>
					{rail === undefined ? null : (
						<div className="flex h-full shrink-0 items-center border-border border-l" style={{ width: railWidth }}>
							{rail}
						</div>
					)}
				</div>
			</header>
			{second}
			<main className="relative min-h-0 flex-1">
				{children}
				{overlay}
			</main>
		</div>
	);
}

export function ProjectTabs({
	tabs,
	activeTab,
	trailing,
}: {
	tabs: readonly string[];
	activeTab: string | undefined;
	/** a cell between the tabs and the plus, for a take that hangs something off them */
	trailing?: ReactNode | undefined;
}) {
	return (
		<nav className="flex min-w-0 items-center gap-unit" aria-label="Projects">
			{tabs.map((tab) => {
				const active = tab === activeTab;
				return (
					<div
						key={tab}
						className={cn(
							"group flex h-[26px] shrink-0 items-center rounded-md",
							active && "border border-border-raised bg-raised",
						)}
					>
						<span
							className={cn("h-full pr-1 pl-3 text-base leading-[24px]", active ? "font-medium text-text" : "text-muted")}
						>
							{tab}
						</span>
						<span className="flex h-full w-5 items-center justify-center pr-1 text-muted opacity-0 group-hover:opacity-100">
							<CloseIcon className="h-2.5 w-2.5" />
						</span>
					</div>
				);
			})}
			{trailing}
			<button
				type="button"
				className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface"
				aria-label="Open a project folder"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
		</nav>
	);
}

/**
 * The case list, outside the product on purpose, in `agent-chat`'s own register.
 *
 * Four cases rather than four frames, because these are states one design passes
 * through rather than four designs being compared — the switcher rule is about
 * variations, and a variation gets its own frame here as it always has. The readout
 * on the right is measured in the browser on every case, never computed by hand.
 */
export function CaseStrip({
	cases,
	picked,
	onPick,
	says,
	readout,
}: {
	cases: readonly { id: string; label: string }[];
	picked: string;
	onPick: (id: string) => void;
	says: string;
	readout: string;
}) {
	return (
		<div className="flex h-14 shrink-0 flex-col justify-center gap-1 border-border border-t bg-surface/40 px-5">
			<div className="flex items-center gap-3">
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">deck</span>
				<div className="flex items-center gap-0.5">
					{cases.map((entry) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => onPick(entry.id)}
							className={cn(
								"rounded px-1.5 py-0.5 font-mono text-2xs leading-3 transition-colors",
								entry.id === picked ? "bg-raised text-text" : "text-muted/70 hover:text-text",
							)}
						>
							{entry.label}
						</button>
					))}
				</div>
				<span className="min-w-0 flex-1 truncate text-right font-mono text-2xs text-muted/45 leading-3">{says}</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">measured</span>
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-text/60 leading-3">{readout}</span>
			</div>
		</div>
	);
}
