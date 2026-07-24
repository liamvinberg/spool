import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	byName,
	connectionsOf,
	CURRENT_PAGE,
	FRAME_H,
	FRAME_W,
	FRAMES,
	type FrameNode,
	FrameBox,
	FrameLabel,
	ON_CANVAS,
	type PageName,
	pageLabel,
	SelectionCorners,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Tree home — no new surface anywhere. The canvas' existing file tree stays the
 * one place that answers "where do frames live", organized by page. Select a
 * frame and a single links group nests under its row to also answer "where does
 * this go": the same unified set, same-page and cross-page alike, each row a
 * jump that reveals its target's page in the tree. The canvas never draws a
 * connection.
 */

const PAGE_ORDER: PageName[] = ["session", "dialogs", "tools", "gates"];

const PAGE_FRAMES: { page: PageName; frames: FrameNode[] }[] = PAGE_ORDER.map((page) => ({
	page,
	frames: FRAMES.filter((f) => f.page === page),
}));

export default function PortalNavTree() {
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});

	const selectOnCanvas = (name: string) => {
		setSelected(name);
	};

	const jump = (target: FrameNode) => {
		setSelected(target.name);
		setExpanded((cur) => ({ ...cur, [target.page]: true }));
	};

	const selectedFrame = selected ? byName(selected) : null;
	const viewPage = selectedFrame?.page ?? CURRENT_PAGE;
	const offCanvas = viewPage !== CURRENT_PAGE;

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%" mode="design">
			<div className="flex h-full min-h-0">
				<aside className="flex w-[268px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<span className="font-semibold text-base leading-base">Frames</span>
						<span className="font-mono text-muted text-xs leading-xs">{FRAMES.length}</span>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto py-2">
						{PAGE_FRAMES.map(({ page, frames }) => (
							<div key={page}>
								<button
									type="button"
									onClick={() => setExpanded((cur) => ({ ...cur, [page]: !cur[page] }))}
									className="group flex h-8 w-full items-center gap-1.5 px-2 text-left font-mono text-sm leading-sm text-muted hover:bg-surface"
								>
									<span className="flex h-8 w-4 items-center justify-center">
										<ChevronIcon open={expanded[page]} className="h-2.5 w-2.5" />
									</span>
									<FolderIcon className="h-3.5 w-3.5 shrink-0" />
									<span className="min-w-0 flex-1 truncate">{page}</span>
									<span className="pr-1.5 text-2xs text-muted/60">{frames.length}</span>
								</button>

								<TreeGroup open={expanded[page]}>
									<div className="relative pb-0.5">
										<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
										{frames.map((frame) => {
											const isSelected = frame.name === selected;
											const links = isSelected ? [...connectionsOf(frame.name)].sort(byPageThenName) : [];
											return (
												<div key={frame.name}>
													<div
														className={cn(
															"relative flex h-7 items-center hover:bg-surface",
															isSelected ? "bg-surface" : "",
														)}
													>
														<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
														<button
															type="button"
															onClick={() => setSelected(frame.name)}
															className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 pl-[34px] text-left"
														>
															<FrameIcon
																className={cn("h-3.5 w-3.5 shrink-0", isSelected && "text-thread")}
															/>
															<span
																className={cn(
																	"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
																	isSelected ? "text-text" : "text-muted",
																)}
															>
																{frame.name}
															</span>
															{frame.pos ? null : (
																<span className="shrink-0 font-mono text-2xs text-muted/40 leading-3">
																	off-canvas
																</span>
															)}
														</button>
													</div>

													<TreeGroup open={isSelected && links.length > 0}>
														<div className="relative pb-1">
															<span className="absolute top-0 bottom-1 left-[42px] w-px bg-thread/40" />
															<div className="flex h-6 items-center gap-1.5 pl-[52px] font-mono text-2xs text-muted leading-3">
																<span className="text-thread">→</span>
																<span>links</span>
																<span className="text-muted/50">{links.length}</span>
															</div>
															{links.map((t) => (
																<div key={t.name} className="relative flex h-7 items-center hover:bg-surface">
																	<span className="absolute top-1/2 left-[42px] h-px w-2.5 bg-thread/40" />
																	<button
																		type="button"
																		onClick={() => jump(t)}
																		className="group flex h-7 w-full min-w-0 items-center gap-2 pr-3 pl-[58px] text-left"
																	>
																		<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
																			{t.name}
																		</span>
																		<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">
																			{pageLabel(t.page)}
																		</span>
																	</button>
																</div>
															))}
														</div>
													</TreeGroup>
												</div>
											);
										})}
									</div>
								</TreeGroup>
							</div>
						))}
					</div>

					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						{selected ? (
							<span>
								<span className="text-thread">→</span> {connectionsOf(selected).length} links from {selected}
							</span>
						) : (
							<span>select a frame to trace where it links</span>
						)}
					</div>
				</aside>

				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
					<div className={cn("absolute inset-0 transition-opacity", offCanvas && "opacity-35")}>
						{ON_CANVAS.map((frame) => {
							const isSelected = frame.name === selected && !offCanvas;
							return (
								<div
									key={frame.name}
									className="absolute flex flex-col gap-1.5"
									style={{ left: frame.pos!.x, top: frame.pos!.y, width: FRAME_W }}
								>
									<FrameLabel name={frame.name} selected={isSelected} />
									<div className="relative">
										<FrameBox
											selected={isSelected}
											onSelect={() => selectOnCanvas(frame.name)}
											style={{ width: FRAME_W, height: FRAME_H }}
										/>
										{isSelected ? <SelectionCorners /> : null}
									</div>
								</div>
							);
						})}
					</div>

					{offCanvas ? (
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
							<span className="font-mono text-2xs text-muted leading-3">
								{selectedFrame?.name} lives on · {viewPage}
							</span>
						</div>
					) : null}

					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {viewPage}
					</div>
				</div>
			</div>
		</SpoolShell>
	);
}

function byPageThenName(a: FrameNode, b: FrameNode) {
	const pa = PAGE_ORDER.indexOf(a.page);
	const pb = PAGE_ORDER.indexOf(b.page);
	return pa - pb || a.name.localeCompare(b.name);
}

function TreeGroup({ children, open }: { children: React.ReactNode; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="group"
					initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
					animate={
						reduceMotion
							? { opacity: 1 }
							: {
									height: "auto",
									opacity: 1,
									transition: {
										height: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					exit={
						reduceMotion
							? { opacity: 0 }
							: {
									height: 0,
									opacity: 0,
									transition: {
										height: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.09, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					className="overflow-hidden"
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

function ChevronIcon({ className, open }: { className?: string; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.svg
			viewBox="0 0 12 12"
			className={cn("origin-center text-muted", className)}
			fill="none"
			aria-hidden="true"
			animate={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
			transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
		>
			<path d="m4 2.5 3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</motion.svg>
	);
}

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={cn("text-muted", className)} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
