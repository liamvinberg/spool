import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { ElementOutline, findRegion, outlineFor } from "../../../shared/ui/element-outline";
import { type ConnEdge, linkCertainty, SlimConnections, SlimIdentity, SlimIdle } from "../../../shared/ui/inspector-slim";
import {
	byName,
	CanvasScene,
	connectionsOf,
	FolderIcon,
	FRAME_H,
	FRAME_W,
	type FrameNode,
	PAGE_ORDER,
	PAGE_SCENES,
	PageTree,
	type PageName,
	RECT_TOP,
} from "../../../shared/ui/portal-nav";
import { InspectorIcon } from "../../../shared/ui/spool-icons";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Shell rework — synthesis. The resolved composition. Left tree is the pure page
 * switcher, collapsible to a strip. The rail is closed by default and summoned
 * only from the header pill; elements own its resting state, with the mode tabs
 * (elements first) living in the rail header. Connections split by reach: the
 * ones that land on frames currently on the canvas are drawn as quiet lines
 * between frame edges, derived from the directed graph — a plain line when two
 * frames point at each other, a single arrowhead for one-way, dashed when the
 * link is only a branch. Everything else — off-page, off-screen — has no canvas
 * furniture at all; it lives in the connections tab, the one complete list and
 * the only home for destinations a line can't reach.
 */

const RAIL_W = 300;
const TREE_W = 248;
const STRIP_W = 44;

type RailMode = "elements" | "connections";
type Cert = "will" | "might";
interface DirEdge {
	to: string;
	cert: Cert;
}

/**
 * Curated directed edges for the session-page scene, so the derived line grammar
 * shows all three cases at once from the selected `session` frame: a mutual pair
 * (session ↔ session--shell), a one-way (session → session--wide, which does not
 * point back), and a dashed branch-only might (session → home--commands). Frames
 * outside this map derive their on-page edges from the shared graph.
 */
const SCENE_ADJ: Record<string, DirEdge[]> = {
	session: [
		{ to: "session--shell", cert: "will" }, // mutual pair -> plain line, no arrowhead
		{ to: "home", cert: "will" }, // one-way (no edge back) -> solid line, single arrowhead
		{ to: "home--commands", cert: "might" }, // one-way branch-only -> dashed line, single arrowhead
	],
	"session--shell": [{ to: "session", cert: "will" }],
	home: [],
	"home--commands": [],
};

function sceneAdj(name: string): DirEdge[] {
	const curated = SCENE_ADJ[name];
	if (curated) return curated;
	const src = byName(name);
	return src.links
		.filter((l) => l !== name && byName(l).page === src.page)
		.map((l) => ({ to: l, cert: linkCertainty(name, l).certainty }));
}

/** The full connections list for the tab: curated on-page edges plus the real off-page ones. */
function synthEdges(name: string): ConnEdge[] {
	const src = byName(name);
	const onPage: ConnEdge[] = sceneAdj(name).map((e) => ({
		target: byName(e.to),
		certainty: e.cert,
		verified: linkCertainty(name, e.to).verified,
	}));
	const offPage: ConnEdge[] = connectionsOf(name)
		.filter((t) => t.page !== src.page)
		.map((t) => ({ target: t, ...linkCertainty(name, t.name) }));
	return [...onPage, ...offPage];
}

export default function ShellReworkSynthesis() {
	const reduceMotion = useReducedMotion();
	const [activePage, setActivePage] = useState<PageName>("session");
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});
	const [treeCollapsed, setTreeCollapsed] = useState(false);
	const [railOpen, setRailOpen] = useState(false); // sticky across selection changes
	const [mode, setMode] = useState<RailMode>("elements");
	const [hoveredEl, setHoveredEl] = useState<string | null>(null);
	const [pinnedEl, setPinnedEl] = useState<string | null>(null);
	const [closedEl, setClosedEl] = useState<Set<string>>(new Set());

	const switchPage = (page: PageName) => {
		setActivePage(page);
		setSelected(null);
		setHoveredEl(null);
		setPinnedEl(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const selectFrame = (name: string) => {
		const page = byName(name).page;
		setActivePage(page);
		setSelected(name);
		setHoveredEl(null);
		setPinnedEl(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const jump = (target: FrameNode) => selectFrame(target.name);

	const outline = selected ? outlineFor(selected) : [];
	const activeEl = hoveredEl ?? pinnedEl;
	const activeRegion =
		selected && railOpen && mode === "elements" && activeEl ? findRegion(outline, activeEl) : null;

	const badgeCount = selected && !railOpen ? synthEdges(selected).length : null;

	return (
		<SpoolShell
			activeTab="opencode"
			tabs={["opencode", "kaffe"]}
			zoom="100%"
			headerAccessory={<SummonPill open={railOpen} count={badgeCount} onToggle={() => setRailOpen((o) => !o)} />}
		>
			<div className="flex h-full min-h-0">
				{/* Left tree — pure page switcher, collapsible to a strip. */}
				<aside
					className="relative shrink-0 overflow-hidden border-border border-r bg-bg transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
					style={{ width: treeCollapsed ? STRIP_W : TREE_W }}
				>
					{treeCollapsed ? (
						<div className="flex h-full w-11 flex-col items-center">
							<button
								type="button"
								aria-label="Expand pages"
								onClick={() => setTreeCollapsed(false)}
								className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
							>
								<Caret dir="right" className="h-3.5 w-2.5" />
							</button>
							<div className="flex flex-col items-center gap-0.5 pt-1">
								{PAGE_ORDER.map((page) => {
									const isActive = page === activePage;
									return (
										<button
											key={page}
											type="button"
											aria-label={page}
											title={page}
											onClick={() => switchPage(page)}
											className="relative flex h-9 w-11 items-center justify-center"
										>
											{isActive ? (
												<span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-thread" />
											) : null}
											<FolderIcon className={cn("h-4 w-4", isActive ? "text-thread" : "text-muted")} />
										</button>
									);
								})}
							</div>
						</div>
					) : (
						<div className="flex h-full w-[248px] flex-col">
							<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
								<div className="flex items-baseline gap-2">
									<span className="font-semibold text-base leading-base">Pages</span>
									<span className="font-mono text-muted text-xs leading-xs">{4}</span>
								</div>
								<button
									type="button"
									aria-label="Collapse pages"
									onClick={() => setTreeCollapsed(true)}
									className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 hover:text-text"
								>
									<Caret dir="left" className="h-3.5 w-2.5" />
								</button>
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
						</div>
					)}
				</aside>

				{/* Canvas — full-bleed to the right edge; connection lines and the rail are overlays. */}
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" onClick={() => setSelected(null)}>
					{selected ? <ConnectionLines selected={selected} page={activePage} /> : null}
					<CanvasScene
						page={activePage}
						selected={selected}
						onSelectFrame={selectFrame}
						overlay={() =>
							activeRegion ? (
								<div
									className="pointer-events-none absolute rounded-[3px] border border-thread bg-thread/10"
									style={{
										left: activeRegion.x,
										top: activeRegion.y,
										width: activeRegion.w,
										height: activeRegion.h,
									}}
								/>
							) : null
						}
					/>
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {activePage}
					</div>

					{/* Open rail — sticky. Elements at rest; the header pill is the only toggle. */}
					<AnimatePresence initial={false}>
						{railOpen ? (
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
								<div className="flex h-11 shrink-0 items-stretch border-border border-b px-4">
									<RailTabs mode={mode} onMode={setMode} />
								</div>

								{selected ? (
									mode === "elements" ? (
										<div className="flex min-h-0 flex-1 flex-col">
											<SlimIdentity name={selected} />
											<div className="flex items-center justify-between px-4 pt-1 pb-0.5">
												<span className="font-mono text-2xs text-muted leading-3">elements</span>
												<span className="font-mono text-2xs text-muted/45 leading-3">hover to locate</span>
											</div>
											<ElementOutline
												outline={outline}
												handlers={{
													closedEl,
													hoveredEl,
													pinnedEl,
													onHover: setHoveredEl,
													onPin: (id) => setPinnedEl((cur) => (cur === id ? null : id)),
													onToggle: (id) =>
														setClosedEl((cur) => {
															const next = new Set(cur);
															if (next.has(id)) next.delete(id);
															else next.add(id);
															return next;
														}),
												}}
											/>
										</div>
									) : (
										<div className="flex min-h-0 flex-1 flex-col">
											<SlimIdentity name={selected} />
											<SlimConnections source={selected} onJump={jump} edges={synthEdges(selected)} />
										</div>
									)
								) : (
									<SlimIdle line="select a frame to inspect it" />
								)}
							</motion.aside>
						) : null}
					</AnimatePresence>
				</div>
			</div>
		</SpoolShell>
	);
}

/**
 * Selection-scoped connection lines: the selected frame's edges to frames on the
 * same canvas, drawn border-to-border. Grammar is derived per pair — plain line
 * when mutual, single arrowhead when one-way, dashed when every edge in the pair
 * is a branch-only might. The SVG renders behind the frame boxes, so lines read
 * as emanating from edges. Off-page destinations never appear here.
 */
function ConnectionLines({ selected, page }: { selected: string; page: PageName }) {
	const pos = new Map(PAGE_SCENES[page].map((s) => [s.name, s]));
	const source = pos.get(selected);
	if (!source) return null;

	const hw = FRAME_W / 2;
	const hh = FRAME_H / 2;
	const scx = source.x + hw;
	const scy = source.y + RECT_TOP + hh;
	const edges = sceneAdj(selected).filter((e) => pos.has(e.to));

	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full text-thread" aria-hidden="true">
			{edges.map((e) => {
				const target = pos.get(e.to);
				if (!target) return null;
				const tcx = target.x + hw;
				const tcy = target.y + RECT_TOP + hh;
				const reverse = sceneAdj(e.to).find((r) => r.to === selected);
				const mutual = Boolean(reverse);
				const certs: Cert[] = [e.cert, ...(reverse ? [reverse.cert] : [])];
				const dashed = certs.every((c) => c === "might");
				const [sx, sy] = borderPoint(scx, scy, hw, hh, tcx, tcy);
				const [tx, ty] = borderPoint(tcx, tcy, hw, hh, scx, scy);
				return (
					<g key={e.to}>
						<line
							x1={sx}
							y1={sy}
							x2={tx}
							y2={ty}
							stroke="currentColor"
							strokeOpacity={0.42}
							strokeWidth={1.5}
							strokeLinecap="round"
							strokeDasharray={dashed ? "5 4" : undefined}
						/>
						{mutual ? null : <Arrowhead x={tx} y={ty} towardX={tcx} towardY={tcy} />}
					</g>
				);
			})}
		</svg>
	);
}

/** Point on a rectangle's border (centered cx,cy, half hw,hh) toward (tx,ty). */
function borderPoint(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number): [number, number] {
	const dx = tx - cx;
	const dy = ty - cy;
	const scale = Math.min(hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dy) || 1e-6));
	return [cx + dx * scale, cy + dy * scale];
}

/** A quiet open arrowhead whose tip sits at (x,y), pointing toward (towardX,towardY). */
function Arrowhead({ x, y, towardX, towardY }: { x: number; y: number; towardX: number; towardY: number }) {
	const dx = towardX - x;
	const dy = towardY - y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const size = 7;
	const spread = 0.55;
	const bx = x - ux * size;
	const by = y - uy * size;
	const px = -uy * size * spread;
	const py = ux * size * spread;
	return (
		<polyline
			points={`${bx + px},${by + py} ${x},${y} ${bx - px},${by - py}`}
			fill="none"
			stroke="currentColor"
			strokeOpacity={0.55}
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	);
}

/** Header summon — the player's InspectorIcon pill, with a quiet count when closed on a selection. */
function SummonPill({ open, count, onToggle }: { open: boolean; count: number | null; onToggle: () => void }) {
	return (
		<button
			type="button"
			aria-label={open ? "Close inspector" : "Open inspector"}
			onClick={onToggle}
			className={cn(
				"flex h-7 items-center gap-1.5 rounded-sm px-1.5 transition-colors hover:bg-surface",
				open ? "bg-surface text-text" : "text-muted",
			)}
		>
			<InspectorIcon className="h-4 w-4" />
			{count !== null ? <span className="font-mono text-2xs text-muted leading-3">{count}</span> : null}
		</button>
	);
}

/** The rail's mode tabs — elements first and default, connections second. */
function RailTabs({ mode, onMode }: { mode: RailMode; onMode: (m: RailMode) => void }) {
	return (
		<div className="flex h-full items-stretch gap-5">
			{(["elements", "connections"] as const).map((m) => {
				const active = mode === m;
				return (
					<button
						key={m}
						type="button"
						onClick={() => onMode(m)}
						className={cn(
							"relative flex h-full items-center font-mono text-xs leading-xs transition-colors",
							active ? "text-text" : "text-muted/60 hover:text-muted",
						)}
					>
						{m}
						{active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
					</button>
				);
			})}
		</div>
	);
}

function Caret({ dir, className }: { dir: "left" | "right"; className?: string }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
