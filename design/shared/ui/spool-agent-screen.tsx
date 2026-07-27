import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import { AgentRail, type AgentContext, type AgentEvent, StateMark } from "./spool-agent-rail";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { SpoolShell } from "./spool-shell";

/**
 * The canvas with the agent tab open. Same shell, same Pages rail, same tool
 * bar, same frames on the field: the only diff against what shipped is the right
 * rail, which is the point.
 *
 * Three bets, three frames:
 *   rail     the agent inside the rail at its shipped 300, three tabs where
 *            there were two, resting with a selection already attached.
 *   wide     the agent tab pushes the rail to 420; elements and connections
 *            stay at 300. Identical conversation, so the diff is only ever the
 *            treatment.
 *   working  the same rail mid-turn. The edit in the transcript has already
 *            reached disk, the daemon has already noticed, and cart out on the
 *            canvas is repainting while the text is still arriving.
 */

export type AgentSpecimen = "rail" | "wide" | "working";

const RAIL_W = { rail: 300, wide: 420, working: 420 } as const;

/* ---------- the conversation ----------
 * One conversation across all three frames: `rail` and `wide` hold the same
 * finished turn, `working` is that conversation one turn later. The selection
 * never moved, which is why the chip is still on cart's checkout bar. */

const CONTEXT: AgentContext = { frame: "cart", element: "checkout-bar", lines: "34-41" };

const SETTLED: readonly AgentEvent[] = [
	{ kind: "compaction", text: "context compacted", usage: "112k → 24.1k" },
	{ kind: "user", text: "make the checkout bar stick to the bottom on mobile", context: CONTEXT },
	{ kind: "error", tool: "read", label: "shared/ui/safe-area.tsx", message: "not found" },
	{
		kind: "tool",
		tool: "edit",
		label: "shared/ui/checkout-bar.tsx",
		state: "completed",
		diff: { added: 6, removed: 2 },
		detail: "1 hunk at line 34",
	},
	{
		kind: "assistant",
		text: "Pinned it with sticky and a safe-area inset. It holds under 640px now.",
	},
];

/** the same conversation one turn on: the settled turn is scrolled up to its
 * tail, so the run below it is the only run in view */
const WORKING: readonly AgentEvent[] = [
	{ kind: "compaction", text: "context compacted", usage: "112k → 24.1k" },
	{ kind: "user", text: "make the checkout bar stick to the bottom on mobile", context: CONTEXT },
	{
		kind: "assistant",
		text: "Pinned it with sticky and a safe-area inset. It holds under 640px now.",
	},
	{ kind: "user", text: "now try three variants of the empty state", context: CONTEXT },
	{ kind: "thinking", text: "thought for 8s" },
	{
		kind: "tool",
		tool: "read",
		label: "frames/app/cart/frame.tsx",
		state: "completed",
		detail: "214 lines",
	},
	{
		kind: "tool",
		tool: "read",
		label: "shared/ui/checkout-bar.tsx",
		state: "completed",
		detail: "86 lines",
	},
	{
		kind: "tool",
		tool: "edit",
		label: "shared/ui/checkout-bar.tsx",
		state: "completed",
		diff: { added: 6, removed: 2 },
		repainted: "cart",
	},
	{
		kind: "task",
		label: "3 variants",
		state: "running",
		runs: [
			{ name: "cart--empty", state: "completed" },
			{ name: "cart--empty-b", state: "completed" },
			{ name: "cart--empty-c", state: "running" },
		],
	},
	{
		kind: "tool",
		tool: "grep",
		label: "checkout-bar",
		state: "running",
		detail: "across design",
	},
	{
		kind: "assistant",
		text: "Reading the cart frame and the shared bar, then branching three takes",
		streaming: true,
	},
	{ kind: "approval", tool: "bash", command: "rm -rf design/frames/app/cart--old" },
];

/* ---------- the field ---------- */

const SCREEN_W = 240;
const SCREEN_H = 520;
const LABEL_H = 22;

interface Placed {
	name: string;
	screen: CoffeeScreenName;
	left: number;
	top: number;
}

/**
 * One camera for all three frames: same pan, same zoom, same three frames at the
 * same coordinates. So the field is a control. At 300 receipt sits clear of the
 * rail; at 420 the rail runs over it, and the 120px is a thing you can see
 * rather than a number in a spec.
 */
const ROW: readonly Placed[] = [
	{ name: "menu", screen: "menu", left: 25, top: 72 },
	{ name: "cart", screen: "cart", left: 325, top: 72 },
	{ name: "receipt", screen: "receipt", left: 625, top: 72 },
];

/** the two variants the sub-agent has written so far, landing under their base */
const ARRIVING: readonly { name: string; left: number; top: number }[] = [
	{ name: "cart--empty", left: 325, top: 648 },
	{ name: "cart--empty-b", left: 625, top: 648 },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/** the sub-agent's files are on disk, so the rail already lists them */
const PAGES_WORKING: readonly PageRow[] = [
	{
		name: "app",
		frames: ["menu", "cart", "cart--empty", "cart--empty-b", "receipt"],
		active: true,
		open: true,
	},
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export function SpoolAgentScreen({ variant }: { variant: AgentSpecimen }) {
	const working = variant === "working";
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="72%">
			<CanvasChrome
				pages={working ? PAGES_WORKING : PAGES}
				selected="cart"
				tool="select"
				railWidth={RAIL_W[variant]}
				railLabel="Agent"
				rail={
					<AgentRail
						density={variant === "rail" ? "narrow" : "wide"}
						events={working ? WORKING : SETTLED}
						context={CONTEXT}
						usage={working ? "26.8k in context" : "24.1k in context"}
						working={working}
					/>
				}
			>
				<AgentStage variant={variant} />
			</CanvasChrome>
		</SpoolShell>
	);
}

function AgentStage({ variant }: { variant: AgentSpecimen }) {
	return (
		<>
			<Threads row={ROW} />
			{ROW.map((frame) => (
				<StageFrame key={frame.name} frame={frame} repainting={variant === "working" && frame.name === "cart"} />
			))}
			{variant === "working"
				? ARRIVING.map((slot, index) => <ArrivingFrame key={slot.name} slot={slot} index={index} />)
				: null}
		</>
	);
}

/**
 * A frame on the field. cart is the one the selection descended into, so it
 * wears the element outline rather than the frame's own handles, and while a
 * write is landing its edge breathes: your outline is crisp, the repaint is not.
 */
function StageFrame({ frame, repainting }: { frame: Placed; repainting: boolean }) {
	const still = useReducedMotion() === true;
	const selected = frame.name === "cart";
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left: frame.left, top: frame.top }}>
			<div className="flex w-[240px] min-w-0 items-center gap-1.5 font-mono text-sm leading-4">
				{selected ? null : <span className="shrink-0 text-2xs text-muted leading-3">▸</span>}
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-muted")}>{frame.name}</span>
				{repainting ? (
					<span className="flex shrink-0 items-center gap-1">
						<span className="h-1 w-1 rounded-full bg-thread" />
						<span className="text-2xs text-muted leading-3">repainted</span>
					</span>
				) : null}
				{selected ? (
					<span className="ml-auto flex shrink-0 items-center gap-1 px-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				) : null}
			</div>
			<div className="relative" style={{ width: SCREEN_W, height: SCREEN_H }}>
				<CoffeeScreen screen={frame.screen} />
				{repainting ? (
					<motion.span
						className="pointer-events-none absolute inset-0 rounded-lg border border-thread"
						animate={still ? { opacity: 0.4 } : { opacity: [0.5, 0.18, 0.5] }}
						transition={still ? undefined : { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					/>
				) : null}
				{selected ? <ElementSelection /> : null}
			</div>
		</div>
	);
}

/**
 * The element the chip names, outlined where it lives. The checkout bar is the
 * total and the pay button together, 34-41 in cart's source, and this outline is
 * the other end of the same object the composer is holding.
 */
function ElementSelection() {
	return (
		<>
			<span className="pointer-events-none absolute rounded-xs border-[1.5px] border-thread" style={{ left: 14, top: 442, width: 212, height: 64 }} />
			<span
				className="absolute rounded-xs bg-thread px-1.5 py-[2px] font-mono text-2xs text-on-thread leading-3"
				style={{ left: 14, top: 424 }}
			>
				checkout-bar
			</span>
		</>
	);
}

/**
 * A frame the sub-agent has just written. The file is on disk, the daemon saw
 * it, the document is booting: no still to stand in for it yet, so it is an
 * empty socket with its name and a live mark, clipped by the bottom of the
 * viewport the way anything below the pan is.
 */
function ArrivingFrame({ slot, index }: { slot: { name: string; left: number; top: number }; index: number }) {
	const still = useReducedMotion() === true;
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left: slot.left, top: slot.top }}>
			<div className="flex w-[240px] min-w-0 items-center gap-1.5 font-mono text-sm leading-4">
				<StateMark state="running" className="h-2.5 w-2.5" />
				<span className="min-w-0 truncate text-muted">{slot.name}</span>
			</div>
			<motion.div
				className="rounded-lg border border-border-raised bg-bg"
				style={{ width: SCREEN_W, height: SCREEN_H }}
				animate={still ? { opacity: 0.9 } : { opacity: [1, 0.68, 1] }}
				transition={
					still
						? undefined
						: { duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: index * 0.4 }
				}
			/>
		</div>
	);
}

/**
 * The thread layer. menu to cart is unconditional, cart to receipt sits inside a
 * branch, so it is drawn faint rather than dashed (CONTEXT.md retired dashes).
 */
function Threads({ row }: { row: readonly Placed[] }) {
	const edges: { d: string; head: string; faint: boolean }[] = [];
	for (let index = 0; index < row.length - 1; index += 1) {
		const from = row[index];
		const to = row[index + 1];
		if (from === undefined || to === undefined) continue;
		const x1 = from.left + SCREEN_W + 4;
		const y1 = from.top + LABEL_H + 250;
		const x2 = to.left - 10;
		const y2 = to.top + LABEL_H + 292;
		edges.push({
			d: `M${x1} ${y1}C${x1 + 24} ${y1} ${x2 - 16} ${y2} ${x2} ${y2}`,
			head: `m${x2 + 9} ${y2}-9-5v10Z`,
			faint: index > 0,
		});
	}
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			{edges.map((edge) => (
				<g key={edge.d} opacity={edge.faint ? 0.45 : 1}>
					<path d={edge.d} stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d={edge.head} fill="var(--color-thread)" />
				</g>
			))}
		</svg>
	);
}
