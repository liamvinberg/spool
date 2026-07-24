import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	byName,
	CURRENT_PAGE,
	FRAME_H,
	FRAME_W,
	type FrameNode,
	FrameBox,
	FrameLabel,
	groupByPage,
	ON_CANVAS,
	outbound,
	pageLabel,
	RECT_TOP,
	SelectionCorners,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Variant A — Selection halo. Quiet by default. Select a frame and its links
 * surface where they belong: targets on this canvas get drawn tethers, targets
 * that live off-page (nowhere to point) collapse into one bounded edge chip
 * that expands into a compact, scrollable list. Density never grows a stack.
 */

interface Rect {
	x: number;
	top: number;
	cx: number;
	cy: number;
}

function rectOf(frame: FrameNode): Rect {
	const x = frame.pos!.x;
	const top = frame.pos!.y + RECT_TOP;
	return { x, top, cx: x + FRAME_W / 2, cy: top + FRAME_H / 2 };
}

function tetherPath(from: Rect, to: Rect): { d: string; ex: number; ey: number } {
	const rightward = to.cx >= from.cx;
	const sx = rightward ? from.x + FRAME_W : from.x;
	const sy = from.cy;
	const ex = rightward ? to.x : to.x + FRAME_W;
	const ey = to.cy;
	const dx = (ex - sx) * 0.5;
	return { d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`, ex, ey };
}

export default function PortalNavA() {
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [jumped, setJumped] = useState<FrameNode | null>(null);

	const clear = () => {
		setSelected(null);
		setExpanded(false);
		setJumped(null);
	};

	const select = (name: string) => {
		setSelected(name);
		setExpanded(false);
		setJumped(null);
	};

	const jump = (target: FrameNode) => {
		if (target.pos) {
			select(target.name);
		} else {
			setJumped(target);
			setSelected(null);
			setExpanded(false);
		}
	};

	const links = selected ? outbound(selected) : [];
	const onPageTargets = links.filter((t) => t.pos && t.name !== selected);
	const offPageTargets = links.filter((t) => t.page !== CURRENT_PAGE);
	const targetNames = new Set(onPageTargets.map((t) => t.name));
	const src = selected ? rectOf(byName(selected)) : null;

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="relative h-full w-full overflow-hidden bg-canvas" onClick={clear}>
				{/* Tethers to targets that live on this canvas. */}
				<svg
					className="pointer-events-none absolute inset-0 h-full w-full"
					viewBox="0 0 1440 856"
					fill="none"
					aria-hidden="true"
				>
					<AnimatePresence>
						{src
							? onPageTargets.map((t) => {
									const { d, ex, ey } = tetherPath(src, rectOf(t));
									return (
										<motion.g
											key={t.name}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
										>
											<motion.path
												d={d}
												stroke="var(--color-thread)"
												strokeWidth={1.5}
												strokeOpacity={0.55}
												initial={{ pathLength: 0 }}
												animate={{ pathLength: 1 }}
												transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
											/>
											<circle cx={ex} cy={ey} r={3} fill="var(--color-thread)" />
										</motion.g>
									);
								})
							: null}
					</AnimatePresence>
				</svg>

				{/* Frames. */}
				{ON_CANVAS.map((frame) => {
					const isSelected = frame.name === selected;
					const isTarget = targetNames.has(frame.name);
					const isJumped = jumped?.name === frame.name;
					const dimmed = (selected !== null && !isSelected && !isTarget) || (jumped !== null && !isJumped);
					return (
						<div
							key={frame.name}
							className="absolute flex flex-col gap-1.5"
							style={{ left: frame.pos!.x, top: frame.pos!.y, width: FRAME_W }}
						>
							<FrameLabel name={frame.name} selected={isSelected} dimmed={dimmed} />
							<div className="relative">
								<FrameBox
									selected={isSelected}
									ringed={isTarget}
									dimmed={dimmed}
									onSelect={() => select(frame.name)}
									style={{ width: FRAME_W, height: FRAME_H }}
								/>
								{isSelected ? <SelectionCorners /> : null}
								{isSelected ? (
									<span className="pointer-events-none absolute -inset-3 -z-10 rounded-2xl bg-thread/12 blur-xl" />
								) : null}
							</div>
						</div>
					);
				})}

				{/* One bounded edge affordance for the off-page destinations. */}
				{src && selected && offPageTargets.length ? (
					<div
						className="absolute"
						style={{ left: src.x + FRAME_W + 14, top: src.top + FRAME_H - 30 }}
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className={cn(
								"flex items-center gap-1.5 rounded-sm border px-2 py-[5px] font-mono text-2xs leading-3 transition-colors",
								expanded
									? "border-thread bg-raised text-text"
									: "border-border-raised bg-raised text-muted hover:border-thread hover:text-text",
							)}
						>
							<span className="text-thread">→</span>
							<span>{offPageTargets.length} off-page</span>
							<span className={cn("transition-transform", expanded && "rotate-90")}>›</span>
						</button>

						<AnimatePresence>
							{expanded ? (
								<motion.div
									initial={{ opacity: 0, y: -4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
									className="mt-1.5 w-[228px] overflow-hidden rounded-md border border-border-raised bg-raised"
								>
									<div className="flex items-center justify-between border-border border-b px-3 py-2">
										<span className="font-mono text-2xs text-muted leading-3">links · off this page</span>
										<span className="font-mono text-2xs text-muted/70 leading-3">
											{onPageTargets.length} shown as threads
										</span>
									</div>
									<div className="max-h-[184px] overflow-y-auto py-1">
										{groupByPage(offPageTargets).map((group) => (
											<div key={group.page} className="px-1 py-1">
												<div className="px-2 pb-1 font-mono text-2xs text-muted/70 leading-3">
													{pageLabel(group.page)}
												</div>
												{group.items.map((t) => (
													<button
														key={t.name}
														type="button"
														onClick={() => jump(t)}
														className="flex w-full items-center gap-1.5 rounded-xs px-2 py-1.5 text-left font-mono text-2xs text-muted leading-3 hover:bg-surface hover:text-text"
													>
														<span className="text-thread/70">→</span>
														<span className="truncate">{t.name}</span>
													</button>
												))}
											</div>
										))}
									</div>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				) : null}

				{/* Status + hint. */}
				<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
					page · session
				</div>

				<AnimatePresence>
					{jumped ? (
						<motion.div
							key="jumped"
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 6 }}
							className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border-raised bg-raised px-3.5 py-2"
							onClick={(e) => e.stopPropagation()}
						>
							<span className="font-mono text-2xs text-muted leading-3">selected</span>
							<span className="font-mono text-xs text-text leading-3">{jumped.name}</span>
							<span className="font-mono text-2xs text-muted leading-3">· {jumped.page}</span>
							<button
								type="button"
								onClick={() => select("session")}
								className="font-mono text-2xs text-thread leading-3"
							>
								◂ session
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>

				{!selected && !jumped ? (
					<div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 font-mono text-2xs text-muted leading-3">
						select a frame to reveal where it links
					</div>
				) : null}
			</div>
		</SpoolShell>
	);
}
