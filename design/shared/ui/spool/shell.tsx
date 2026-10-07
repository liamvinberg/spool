import { PROJECT_ICONS, PROJECT_TEAMS } from "shared/lib/spool/project-icon";
import { TabStrip, type TabProject } from "shared/ui/spool/tab-strip";

/**
 * The app shell: one 44px bar over everything — a pinned Home button,
 * one tab per open project, "+" for the folder picker, and on the right
 * whoever else is on a team project's canvas. Every tab leads with its
 * project's icon (`shared/lib/spool/project-icon.ts` holds the fixtures').
 *
 * There is no mode switch, no play button, no threads switch and no zoom
 * readout here. Select is the only pointer tool, play lives on the selection,
 * showing threads is a setting, and the canvas shows its own zoom.
 */

interface SpoolShellProps {
	children: React.ReactNode;
	/** the focused project tab; absent on home, where no canvas is focused */
	activeTab?: string | undefined;
	/** a fixture project's name, or a tab drawn out in full */
	tabs?: readonly (string | TabProject)[] | undefined;
	homeTarget?: string | undefined;
	/** specimen: the root whose tab menu is open */
	menuAt?: string | undefined;
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
	menuAt,
	headerAccessory, onFocus, onClose, onReorder, onPick, onHome,
}: SpoolShellProps) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header className="app-header after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:pointer-events-none [&_button:focus-visible]:[outline:2px_solid_var(--color-muted)] [&_button:focus-visible]:outline-offset-[-2px] relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4">
				<div className="flex h-full min-w-0 flex-1 items-center">
					<div className="app-home-zone relative flex items-center shrink-0 h-full mr-[12px] pr-[16px] after:content-[''] after:absolute after:right-0 after:w-px after:h-[18px] after:bg-border-raised">
						<button type="button" data-go={homeTarget} className="app-home flex items-center gap-[9px] h-[32px] [padding:0_4px_0_6px] [font:var(--type-control)] [color:var(--color-muted)] cursor-pointer [&:is(:hover,[aria-current])]:text-text active:[transform:translateY(1px)] motion-reduce:active:transform-none" title="Home" onClick={onHome} aria-current={activeTab === undefined ? "page" : undefined}>
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
								<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
							</svg>
							<span>Home</span>
						</button>
					</div>
					<TabStrip
						tabs={tabs.map(tabProject)}
						focused={activeTab ?? null}
						menuAt={menuAt}
						onChangeIcon={() => {}}
						onRemoveIcon={() => {}}
						onFocus={onFocus} onClose={onClose} onReorder={onReorder} onPick={onPick}
					/>
				</div>

				{headerAccessory !== undefined ? (
					<div className="flex h-full shrink-0 items-center gap-4">{headerAccessory}</div>
				) : null}
			</header>
			<main className="min-h-0 flex-1">{children}</main>
		</div>
	);
}

/** A fixture project's tab: its icon, and its team's mark when the project is a team's local copy. */
function tabProject(tab: string | TabProject): TabProject {
	if (typeof tab !== "string") return tab;
	return { root: tab, name: tab, icon: PROJECT_ICONS[tab], teamAddress: PROJECT_TEAMS[tab] };
}
