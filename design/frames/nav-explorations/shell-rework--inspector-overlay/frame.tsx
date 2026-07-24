import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { SlimInspector } from "../../../shared/ui/inspector-slim";
import { byName, CanvasScene, type FrameNode, PageTree, type PageName } from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Shell rework — overlay rail. The inspector does not exist until something is
 * selected: the canvas runs full-bleed to the right edge and reads as almost
 * nothing but frames. Selecting a frame slides the same slim rail in over the
 * canvas; clicking empty canvas deselects and dismisses it. Same lean content as
 * inspector-slim — this variant only tests whether the rail should be absent when
 * idle rather than persistently quiet.
 */

const RAIL_W = 300;

export default function ShellReworkInspectorOverlay() {
	const reduceMotion = useReducedMotion();
	const [activePage, setActivePage] = useState<PageName>("session");
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});

	const switchPage = (page: PageName) => {
		setActivePage(page);
		setSelected(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const selectFrame = (name: string) => {
		const page = byName(name).page;
		setActivePage(page);
		setSelected(name);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const jump = (target: FrameNode) => selectFrame(target.name);

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="flex h-full min-h-0">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<span className="font-semibold text-base leading-base">Pages</span>
						<span className="font-mono text-muted text-xs leading-xs">{4}</span>
					</div>
					<PageTree
						activePage={activePage}
						expanded={expanded}
						selected={selected}
						onTogglePage={(page) => setExpanded((cur) => ({ ...cur, [page]: !cur[page] }))}
						onSwitchPage={switchPage}
						onSelectFrame={selectFrame}
					/>
					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						folder switches page
					</div>
				</aside>

				{/* Canvas is full-bleed to the right edge; the rail is an overlay, not a column. */}
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" onClick={() => setSelected(null)}>
					<CanvasScene page={activePage} selected={selected} onSelectFrame={selectFrame} />
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {activePage}
					</div>

					<AnimatePresence initial={false}>
						{selected ? (
							<motion.aside
								key="rail"
								onClick={(e) => e.stopPropagation()}
								initial={reduceMotion ? { opacity: 0 } : { x: RAIL_W + 16, opacity: 0 }}
								animate={{
									x: 0,
									opacity: 1,
									transition: reduceMotion
										? { duration: 0.12 }
										: {
												x: { type: "spring", stiffness: 420, damping: 42, mass: 0.9 },
												opacity: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
											},
								}}
								exit={
									reduceMotion
										? { opacity: 0, transition: { duration: 0.1 } }
										: {
												x: RAIL_W + 16,
												opacity: 0,
												transition: {
													x: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
													opacity: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
												},
											}
								}
								style={{ width: RAIL_W }}
								className="absolute top-0 right-0 bottom-0 flex flex-col border-border border-l bg-bg"
							>
								<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
									<span className="font-medium text-base text-text leading-none">Selection</span>
									<span className="font-mono text-2xs text-muted leading-3">frame</span>
								</div>
								<SlimInspector selected={selected} onJump={jump} />
							</motion.aside>
						) : null}
					</AnimatePresence>
				</div>
			</div>
		</SpoolShell>
	);
}
