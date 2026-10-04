import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { EASE } from "./motion";

/**
 * The shipped 44px bar with one change: a tab knows whether its canvas is saved.
 * An unsaved tab wears a dot where its close button sits, the way every Mac editor
 * marks a document with changes, and the dot turns into the close button under
 * the pointer. A tab is also what a save sheet hangs from, so each one carries
 * `data-tab` for the sheet to find its left edge.
 */

export interface BarTab {
	id: string;
	name: string;
	unsaved: boolean;
	team?: boolean;
}

export function Bar({
	tabs,
	active,
	hung,
	right,
	onHome,
	onFocus,
	onClose,
	onNew,
}: {
	tabs: BarTab[];
	active: string | null;
	/** the tab a sheet is hanging from, drawn as if pressed */
	hung?: string | null;
	right?: ReactNode;
	onHome: () => void;
	onFocus: (id: string) => void;
	onClose: (id: string) => void;
	onNew: () => void;
}) {
	return (
		<header className="relative z-40 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
			<div className="flex h-full min-w-0 flex-1 items-center">
				<div className="relative mr-[12px] flex h-full shrink-0 items-center pr-[16px] after:absolute after:right-0 after:h-[18px] after:w-px after:bg-border-raised after:content-['']">
					<button
						type="button"
						title="Home"
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
					<nav aria-label="Open projects" className="flex h-full min-w-0 items-center gap-[2px] px-[2px]">
						<AnimatePresence initial={false} mode="popLayout">
							{tabs.map((tab) => {
								const on = active === tab.id;
								return (
									<motion.div
										key={tab.id}
										layout="position"
										data-tab={tab.id}
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
										transition={{ duration: 0.22, ease: EASE }}
										className={cn("group/tab relative flex h-[36px] max-w-[228px] min-w-[112px] shrink-0 items-center rounded-t-[8px]", !on && "hover:bg-white/[0.016]")}
									>
										{!on && hung === tab.id && (
											<span className="pointer-events-none absolute inset-x-0 top-0 -bottom-[4px] rounded-t-[8px] border border-border-raised border-b-0 bg-surface" />
										)}
										{on && (
											<motion.span
												layoutId="tab-on"
												transition={{ duration: 0.2, ease: EASE }}
												className={cn("pointer-events-none absolute inset-x-0 top-0 -bottom-[4px] rounded-t-[8px] border border-border border-b-0 bg-canvas", hung === tab.id && "border-border-raised bg-surface")}
											/>
										)}
										<button
											type="button"
											title={tab.name}
											onClick={() => onFocus(tab.id)}
											className={cn("relative flex h-full min-w-0 flex-1 items-center gap-[7px] pr-[38px] pl-[12px] type-control", on || hung === tab.id ? "text-text" : "text-muted")}
										>
											{tab.team && <TeamMark size={14} />}
											<AnimatePresence mode="popLayout" initial={false}>
												<motion.span
													key={tab.name}
													initial={{ opacity: 0, y: 4 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: -4 }}
													transition={{ duration: 0.18, ease: EASE }}
													className="truncate"
												>
													{tab.name}
												</motion.span>
											</AnimatePresence>
										</button>
										<button
											type="button"
											aria-label={tab.unsaved ? `Close ${tab.name}, not saved` : `Close ${tab.name}`}
											title={tab.unsaved ? "Not saved" : "Close tab"}
											onClick={() => onClose(tab.id)}
											className="absolute right-[4px] grid h-[24px] w-[24px] place-items-center rounded-[5px] text-muted hover:bg-white/[0.07] hover:text-text"
										>
											{tab.unsaved && (
												<span className="absolute h-[7px] w-[7px] rounded-full bg-text/80 transition-opacity duration-100 group-hover/tab:opacity-0" />
											)}
											<svg
												width="10"
												height="10"
												viewBox="0 0 12 12"
												fill="none"
												aria-hidden="true"
												className={cn("transition-opacity duration-100", tab.unsaved ? "opacity-0 group-hover/tab:opacity-100" : on ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100")}
											>
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
							title="New project"
							onClick={onNew}
							className="ml-[6px] grid h-[30px] w-[32px] shrink-0 place-items-center rounded-[6px] text-muted hover:bg-white/[0.03] hover:text-text"
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
							</svg>
						</motion.button>
					</nav>
				</LayoutGroup>
			</div>
			{right && <div className="flex h-full shrink-0 items-center gap-[14px]">{right}</div>}
		</header>
	);
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return <kbd className={cn("text-muted type-detail", className)}>{children}</kbd>;
}
