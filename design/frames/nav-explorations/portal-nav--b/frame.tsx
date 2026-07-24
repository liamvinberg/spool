import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
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
	SelectionCorners,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Variant B — Navigator dock. Connections never touch the canvas. Selecting a
 * frame fills one fixed rail with every outbound link, same-page and cross-page
 * folded into the same grouped, filterable list. The canvas stays pristine at
 * any zoom, so density is a scroll problem, never a pile-up.
 */

const ZOOMS = [1, 0.55] as const;

export default function PortalNavB() {
	const [selected, setSelected] = useState<string | null>(null);
	const [jumped, setJumped] = useState<FrameNode | null>(null);
	const [query, setQuery] = useState("");
	const [zoom, setZoom] = useState<number>(1);

	const select = (name: string) => {
		setSelected(name);
		setJumped(null);
		setQuery("");
	};

	const jump = (target: FrameNode) => {
		if (target.pos) select(target.name);
		else {
			setJumped(target);
			setSelected(null);
		}
	};

	const links = selected ? outbound(selected).filter((t) => t.name !== selected) : [];
	const groups = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = q ? links.filter((t) => t.name.includes(q) || t.page.includes(q)) : links;
		return groupByPage(filtered);
	}, [links, query]);

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom={`${Math.round(zoom * 100)}%`}>
			<div className="flex h-full w-full">
				{/* Canvas — never draws a connection, at any zoom. */}
				<div
					className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
					onClick={() => {
						setSelected(null);
						setJumped(null);
					}}
				>
					<div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: "24px 24px" }}>
						{ON_CANVAS.map((frame) => {
							const isSelected = frame.name === selected;
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
											onSelect={() => select(frame.name)}
											style={{ width: FRAME_W, height: FRAME_H }}
										/>
										{isSelected ? <SelectionCorners /> : null}
									</div>
								</div>
							);
						})}
					</div>

					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · session
					</div>

					{/* Zoom toggle — proof the canvas holds at any scale. */}
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
				</div>

				{/* The navigator. */}
				<aside className="flex w-[300px] shrink-0 flex-col border-border border-l bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
						<span className="font-medium text-base text-text leading-none">Connections</span>
						{selected ? (
							<span className="font-mono text-2xs text-muted leading-3">{links.length} outbound</span>
						) : null}
					</div>

					{!selected && !jumped ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
							<span className="font-mono text-2xs text-muted/70 leading-4">
								select a frame to list every frame it links to, on this page or any other
							</span>
						</div>
					) : null}

					{jumped ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
							<span className="font-mono text-xs text-text leading-3">{jumped.name}</span>
							<span className="font-mono text-2xs text-muted leading-3">now selected on · {jumped.page}</span>
							<button
								type="button"
								onClick={() => select("session")}
								className="font-mono text-2xs text-thread leading-3"
							>
								◂ back to session
							</button>
						</div>
					) : null}

					{selected ? (
						<>
							<div className="border-border border-b px-4 py-3">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-thread text-xs leading-3">▸</span>
									<span className="font-mono text-text text-xs leading-3">{selected}</span>
								</div>
								<div className="mt-1.5 font-mono text-2xs text-muted/70 leading-3">
									frames/{selected}/frame.tsx
								</div>
							</div>

							<div className="px-3 pt-3 pb-2">
								<input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="filter links"
									className="w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-2xs text-text leading-3 placeholder:text-muted/60 focus:border-border-raised focus:outline-none"
								/>
							</div>

							<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
								{groups.map((group) => (
									<div key={group.page} className="pt-2">
										<div className="flex items-center justify-between px-1 pb-1.5">
											<span
												className={cn(
													"font-mono text-2xs leading-3",
													group.page === CURRENT_PAGE ? "text-text/80" : "text-muted/80",
												)}
											>
												{pageLabel(group.page)}
											</span>
											<span className="font-mono text-2xs text-muted/50 leading-3">{group.items.length}</span>
										</div>
										<div className="space-y-[2px]">
											{group.items.map((t) => (
												<button
													key={t.name}
													type="button"
													onClick={() => jump(t)}
													className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface"
												>
													<span className="text-thread/70 text-xs leading-3">→</span>
													<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
														{t.name}
													</span>
													{t.pos ? (
														<span className="font-mono text-2xs text-muted/40 leading-3">on-canvas</span>
													) : null}
												</button>
											))}
										</div>
									</div>
								))}
								{groups.length === 0 ? (
									<div className="px-2 pt-6 text-center font-mono text-2xs text-muted/60 leading-3">
										no links match
									</div>
								) : null}
							</div>
						</>
					) : null}
				</aside>
			</div>
		</SpoolShell>
	);
}
