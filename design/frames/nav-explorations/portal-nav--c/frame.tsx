import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	FRAME_H,
	FRAME_W,
	type FrameNode,
	FrameBox,
	groupByPage,
	ON_CANVAS,
	outbound,
	type PageGroup,
	pageLabel,
	RECT_TOP,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Variant C — Edge ports. Every linked frame carries a near-silent column of
 * port dots on its edge, one per destination page — bounded, and held at a
 * constant screen size so they never grow into a stack, even zoomed out.
 * Touch a port and just that group fans out in place.
 */

const ZOOMS = [1, 0.55] as const;
const DOT_GAP = 13;

function portGroups(frame: FrameNode): PageGroup[] {
	return groupByPage(outbound(frame.name).filter((t) => t.name !== frame.name));
}

export default function PortalNavC() {
	const [zoom, setZoom] = useState<number>(1);
	const [openKey, setOpenKey] = useState<string | null>("session|dialogs");
	const [selected, setSelected] = useState<string | null>(null);
	const [jumped, setJumped] = useState<FrameNode | null>(null);

	const clearFloat = () => {
		setOpenKey(null);
		setJumped(null);
	};

	const jump = (target: FrameNode) => {
		setOpenKey(null);
		if (target.pos) {
			setSelected(target.name);
			setJumped(null);
		} else {
			setSelected(null);
			setJumped(target);
		}
	};

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom={`${Math.round(zoom * 100)}%`}>
			<div className="relative h-full w-full overflow-hidden bg-canvas" onClick={clearFloat}>
				{/* Scaled cluster — the frame boxes only. */}
				<div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
					{ON_CANVAS.map((frame) => (
						<FrameBox
							key={frame.name}
							selected={frame.name === selected}
							onSelect={() => setSelected(frame.name)}
							className="absolute"
							style={{
								left: frame.pos!.x,
								top: frame.pos!.y + RECT_TOP,
								width: FRAME_W,
								height: FRAME_H,
							}}
						/>
					))}
				</div>

				{/* Constant-size overlay — labels, ports, fan-outs never scale. */}
				{ON_CANVAS.map((frame) => {
					const boxTop = (frame.pos!.y + RECT_TOP) * zoom;
					const boxRight = (frame.pos!.x + FRAME_W) * zoom;
					const boxLeft = frame.pos!.x * zoom;
					const centerY = boxTop + (FRAME_H * zoom) / 2;
					const groups = portGroups(frame);
					const stackH = (groups.length - 1) * DOT_GAP;

					return (
						<div key={frame.name}>
							<div
								className="pointer-events-none absolute font-mono text-sm leading-xs"
								style={{ left: boxLeft, top: boxTop - 22 }}
							>
								<span
									className={cn(
										"mr-1.5 text-2xs",
										frame.name === selected ? "text-thread" : "text-muted/70",
									)}
								>
									▸
								</span>
								<span className={cn(frame.name === selected ? "text-thread" : "text-muted")}>{frame.name}</span>
							</div>

							{groups.map((group, i) => {
								const key = `${frame.name}|${group.page}`;
								const open = openKey === key;
								const dotY = centerY - stackH / 2 + i * DOT_GAP;
								return (
									<div key={group.page}>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												setOpenKey(open ? null : key);
											}}
											onMouseEnter={() => setOpenKey(key)}
											className="absolute flex h-3.5 w-3.5 items-center justify-center rounded-full"
											style={{ left: boxRight + 3, top: dotY - 7 }}
											aria-label={`${group.items.length} links to ${pageLabel(group.page)}`}
										>
											<span
												className={cn(
													"block rounded-full transition-all duration-150",
													open
														? "h-[7px] w-[7px] bg-thread"
														: "h-[5px] w-[5px] bg-muted/60 hover:bg-muted",
												)}
											/>
										</button>

										<AnimatePresence>
											{open ? (
												<motion.div
													initial={{ opacity: 0, x: -4 }}
													animate={{ opacity: 1, x: 0 }}
													exit={{ opacity: 0, x: -4 }}
													transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
													className="absolute z-10 w-[202px] overflow-hidden rounded-md border border-border-raised bg-raised"
													style={{ left: boxRight + 16, top: dotY - 16 }}
													onClick={(e) => e.stopPropagation()}
													onMouseLeave={() => setOpenKey((k) => (k === key ? null : k))}
												>
													<div className="flex items-center justify-between border-border border-b px-2.5 py-1.5">
														<span className="font-mono text-2xs text-muted leading-3">{pageLabel(group.page)}</span>
														<span className="font-mono text-2xs text-muted/50 leading-3">{group.items.length}</span>
													</div>
													<div className="py-1">
														{group.items.map((t) => (
															<button
																key={t.name}
																type="button"
																onClick={() => jump(t)}
																className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-2xs text-muted leading-3 hover:bg-surface hover:text-text"
															>
																<span className="text-thread/70">→</span>
																<span className="truncate">{t.name}</span>
															</button>
														))}
													</div>
												</motion.div>
											) : null}
										</AnimatePresence>
									</div>
								);
							})}
						</div>
					);
				})}

				<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
					page · session
				</div>

				<div
					className="absolute right-4 bottom-3 flex items-center gap-[2px] rounded-md bg-surface p-[2px]"
					onClick={(e) => e.stopPropagation()}
				>
					{ZOOMS.map((z) => (
						<button
							key={z}
							type="button"
							onClick={() => setZoom(z)}
							className={cn(
								"rounded-sm px-2 py-[3px] font-mono text-2xs leading-3",
								zoom === z ? "bg-raised text-text" : "text-muted",
							)}
						>
							{Math.round(z * 100)}%
						</button>
					))}
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
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</SpoolShell>
	);
}
