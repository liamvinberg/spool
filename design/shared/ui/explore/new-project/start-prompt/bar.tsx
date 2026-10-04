import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { ThreadIcon } from "shared/ui/spool/icons";
import { StateMark } from "shared/ui/spool/play-rail";
import { EASE } from "./marks";

/**
 * SpoolShell's 44px bar, redrawn so its tabs can move: a tab is born beside the
 * others, and a tab whose project is named mid-turn changes its words in place, the
 * old name lifting out as the new one rises in and the tab's width following.
 */

export interface BarTab {
	id: string;
	name: string;
	/** the project's agent is in a turn: the tab says so while you are elsewhere */
	working?: boolean;
}

export function Bar({
	tabs,
	active,
	onHome,
	onFocus,
	onClose,
	onPlus,
	right,
}: {
	tabs: BarTab[];
	active: string | null;
	onHome: () => void;
	onFocus: (id: string) => void;
	onClose: (id: string) => void;
	onPlus: () => void;
	right?: ReactNode;
}) {
	return (
		<header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
			<div className="flex h-full min-w-0 flex-1 items-center">
				<div className="relative mr-[12px] flex h-full shrink-0 items-center pr-[16px] after:absolute after:right-0 after:h-[18px] after:w-px after:bg-border-raised after:content-['']">
					<button
						type="button"
						onClick={onHome}
						aria-current={active === null ? "page" : undefined}
						className="flex h-[32px] items-center gap-[9px] pr-[4px] pl-[6px] text-muted type-control hover:text-text aria-[current]:text-text"
					>
						<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
						</svg>
						<span>Home</span>
					</button>
				</div>
				<LayoutGroup id="bar">
					<nav className="flex h-full min-w-0 items-center gap-[2px] px-[2px]">
						<AnimatePresence initial={false} mode="popLayout">
							{tabs.map((tab) => {
								const on = tab.id === active;
								return (
									<motion.div
										key={tab.id}
										layout
										initial={{ opacity: 0, scale: 0.92, y: 4 }}
										animate={{ opacity: 1, scale: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.96 }}
										transition={{ duration: 0.24, ease: EASE }}
										className="group/tab relative h-[36px] min-w-[112px] max-w-[228px] shrink-0"
									>
										{on && (
											<motion.span
												layoutId="tab-on"
												transition={{ duration: 0.2, ease: EASE }}
												className="pointer-events-none absolute inset-x-0 top-0 -bottom-[4px] rounded-t-[8px] border border-border border-b-0 bg-canvas"
											/>
										)}
										<button
											type="button"
											onClick={() => onFocus(tab.id)}
											className={cn("relative flex h-full w-full items-center gap-[8px] pr-[38px] pl-[12px] type-control", on ? "text-text" : "text-muted hover:text-text")}
										>
											{tab.working && <StateMark state="running" className="h-3 w-3" />}
											<TabName name={tab.name} />
										</button>
										<button
											type="button"
											aria-label={`Close ${tab.name}`}
											onClick={() => onClose(tab.id)}
											className={cn(
												"absolute top-[6px] right-[4px] grid h-[24px] w-[24px] place-items-center rounded-[5px] text-muted hover:bg-[#ffffff12] hover:text-text",
												on ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
											)}
										>
											<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
												<path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
											</svg>
										</button>
									</motion.div>
								);
							})}
						</AnimatePresence>
						<motion.button
							layout="position"
							type="button"
							onClick={onPlus}
							title="New ask"
							className="ml-[6px] grid h-[30px] w-[32px] place-items-center rounded-[6px] text-muted hover:bg-[#ffffff06] hover:text-text"
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
							</svg>
						</motion.button>
					</nav>
				</LayoutGroup>
			</div>
			{right !== undefined && <div className="flex h-full shrink-0 items-center gap-[14px]">{right}</div>}
		</header>
	);
}

/** a name that can change under you: the old one lifts away as the new one rises in */
function TabName({ name }: { name: string }) {
	return (
		<span className="relative inline-flex min-w-0 overflow-hidden">
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={name}
					layout="position"
					initial={{ y: 12, opacity: 0, filter: "blur(4px)" }}
					animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
					exit={{ y: -12, opacity: 0, filter: "blur(4px)" }}
					transition={{ duration: 0.28, ease: EASE }}
					className="truncate whitespace-nowrap"
				>
					{name}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

export function CanvasReadouts({ zoom = "64%" }: { zoom?: string }) {
	return (
		<>
			<span className="grid h-7 w-7 place-items-center rounded-sm text-text">
				<ThreadIcon className="h-3.5 w-3.5" />
			</span>
			<span className="min-w-9 text-right text-muted type-detail">{zoom}</span>
		</>
	);
}
