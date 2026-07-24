import { motion } from "motion/react";
import { cn } from "../../shared/lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "../../shared/ui/spool-icons";
import { SpoolShell } from "../../shared/ui/spool-shell";

/**
 * directing — A-shape: annotate is a fourth tool.
 *
 * The toolbar gains a marker beside the navigation tools (interact / select /
 * hand), keyed C, lit here. With annotate held you drop a work order on whatever
 * you point at: an element resolves its source location, a frame takes a note, and
 * (only in this shape) empty canvas takes an order for something that does not
 * exist yet. Two pins are live: one mid-typing over a cart row, one already placed
 * on empty canvas asking for a frame that is not there. The order text is the
 * payload, in the human's voice; everything around it is quiet mono scaffolding.
 */

function AnnotateIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12 21c4-3.6 6.5-6.9 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 14.1 8 17.4 12 21Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			<circle cx="12" cy="10.4" r="2.5" fill="currentColor" />
		</svg>
	);
}

const TOOLS = [
	{ id: "interact", label: "interact", key: null, Icon: CursorIcon },
	{ id: "select", label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon },
] as const;

export default function DirectingToolPin() {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} zoom="100%" showCanvasControls={false}>
			<div className="relative h-full w-full cursor-crosshair overflow-hidden bg-canvas">
				<DotGrid />

				{/* the subject: a compact coffee cart, a real thing to point at */}
				<div className="absolute" style={{ left: 214, top: 214, width: 300 }}>
					<FrameLabel name="cart" />
					<Cart annotatedRow="brygg" />
				</div>

				{/* pin 1 — open, mid-typing, pinned to the cart's first row */}
				<div className="absolute" style={{ left: 548, top: 260 }}>
					<WritingLeader />
					<WritingBubble target="cart · row" order="make this row denser" />
				</div>

				{/* pin 2 — placed on empty canvas: an order for a frame that is not there yet */}
				<div className="absolute" style={{ left: 936, top: 250 }}>
					<PlacedBubble n={2} target="canvas · here" order="put a settings frame here" />
				</div>
				<GhostFrame left={936} top={350} w={252} h={300} />

				<Toolbar />
			</div>
		</SpoolShell>
	);
}

/* ---------- the floating toolbar, annotate as the fourth tool ---------- */

function Toolbar() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs text-muted leading-3 backdrop-blur">
				<span className="text-thread">annotate</span>
				<span className="text-muted/60">mark an element, a frame, or a spot</span>
			</div>
			<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{TOOLS.map((meta) => (
					<ToolButton key={meta.id} label={meta.label} kbd={meta.key} active={false} Icon={meta.Icon} />
				))}
				<span className="mx-1 h-5 w-px bg-border-raised" />
				<ToolButton label="annotate" kbd="C" active Icon={AnnotateIcon} accent />
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	active,
	accent,
	Icon,
}: {
	label: string;
	kbd: string | null;
	active: boolean;
	accent?: boolean;
	Icon: (p: { className?: string }) => React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
				active
					? accent
						? "bg-raised text-thread"
						: "bg-raised text-text"
					: "text-muted hover:bg-surface hover:text-text",
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
			<span className="pointer-events-none absolute -top-8 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{label}
				{kbd ? <Kbd>{kbd}</Kbd> : null}
			</span>
		</button>
	);
}

/* ---------- pins ---------- */

function WritingBubble({ target, order }: { target: string; order: string }) {
	return (
		<div className="w-[248px] overflow-hidden rounded-md border border-thread/70 bg-bg/95 backdrop-blur">
			<div className="border-thread/30 border-b bg-thread/[0.06] px-3 py-2">
				<p className="font-sans text-base text-text leading-base">
					{order}
					<motion.span
						aria-hidden="true"
						className="ml-px inline-block h-[15px] w-px translate-y-[2px] bg-thread"
						animate={{ opacity: [1, 1, 0, 0] }}
						transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear", times: [0, 0.5, 0.5, 1] }}
					/>
				</p>
			</div>
			<div className="flex items-center justify-between px-3 py-1.5 font-mono text-2xs text-muted leading-3">
				<span>{target}</span>
				<span className="flex items-center gap-1.5">
					<Kbd>esc</Kbd>
					<span className="text-muted/50">discard</span>
					<Kbd>⏎</Kbd>
					<span className="text-muted/50">pin</span>
				</span>
			</div>
		</div>
	);
}

function PlacedBubble({ n, target, order }: { n: number; target: string; order: string }) {
	return (
		<div className="flex w-[240px] items-start gap-2 rounded-md border border-border-raised bg-bg/95 px-3 py-2.5 backdrop-blur">
			<PinChip n={n} />
			<div className="min-w-0 flex-1">
				<p className="font-sans text-base text-text leading-base">{order}</p>
				<p className="mt-1 flex items-center gap-1.5 font-mono text-2xs text-muted leading-3">
					{target}
					<span className="text-muted/40">·</span>
					<span className="text-muted/70">queued</span>
				</p>
			</div>
		</div>
	);
}

function PinChip({ n }: { n: number }) {
	return (
		<span className="mt-px flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
			{n}
		</span>
	);
}

/** open pin: a pulsing thread dot on the element, a hairline out to the bubble */
function WritingLeader() {
	return (
		<span className="-left-10 absolute top-[26px] flex w-10 items-center">
			<span className="-ml-1.5 relative flex h-3 w-3 items-center justify-center">
				<motion.span
					className="absolute h-3 w-3 rounded-full border border-thread/50"
					animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
					transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
				/>
				<span className="h-2 w-2 rounded-full bg-thread" />
			</span>
			<span className="h-px flex-1 bg-thread/60" />
		</span>
	);
}

/** empty-canvas order: a dashed spot where the requested frame would land */
function GhostFrame({ left, top, w, h }: { left: number; top: number; w: number; h: number }) {
	return (
		<div
			className="absolute flex items-center justify-center rounded-md border border-thread/40 border-dashed bg-thread/[0.02]"
			style={{ left, top, width: w, height: h }}
		>
			{/* insertion crosshair at the marked spot */}
			<span className="-top-px -left-px absolute h-3 w-3">
				<span className="absolute top-1/2 left-0 h-px w-3 bg-thread/60" />
				<span className="absolute top-0 left-1/2 h-3 w-px bg-thread/60" />
			</span>
			<span className="font-mono text-2xs text-muted/50 leading-3">new frame</span>
		</div>
	);
}

/* ---------- the cart subject ---------- */

function Cart({ annotatedRow }: { annotatedRow: string }) {
	const rows = [
		{ id: "brygg", name: "Bryggkaffe", price: "30 kr" },
		{ id: "oat", name: "Havremjölk", price: "5 kr" },
		{ id: "shot", name: "Extra shot", price: "10 kr" },
	];
	return (
		<div className="overflow-hidden rounded-md border border-border bg-surface">
			<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
				<div className="flex items-center gap-1.5">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<span className="font-mono text-2xs text-muted leading-3">live</span>
				</div>
				<div className="flex items-end gap-[3px]" aria-hidden="true">
					{[9, 14, 7].map((barHeight) => (
						<span key={barHeight} className="w-[3px] rounded-full bg-thread/70" style={{ height: barHeight }} />
					))}
				</div>
			</div>
			<div className="px-3 py-2.5">
				<div className="flex flex-col gap-0.5">
					{rows.map((r) => {
						const marked = r.id === annotatedRow;
						return (
							<div key={r.id} className="relative">
								{marked ? (
									<span className="-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border border-thread/70 bg-thread/[0.07]" />
								) : null}
								<div className="relative flex items-center justify-between py-1.5">
									<span className="font-sans text-base text-text leading-none">{r.name}</span>
									<span className="font-mono text-sm text-muted leading-none tabular-nums">{r.price}</span>
								</div>
							</div>
						);
					})}
				</div>
				<div className="mt-2 flex items-center justify-between border-border-raised/60 border-t pt-2.5">
					<span className="font-sans text-sm text-muted leading-none">Summa</span>
					<span className="font-mono text-base text-text leading-none tabular-nums">45 kr</span>
				</div>
				<button
					type="button"
					className="mt-2.5 flex h-8 w-full items-center justify-center rounded-sm bg-thread font-sans font-medium text-on-thread text-sm leading-none"
				>
					Till kassan
				</button>
			</div>
		</div>
	);
}

/* ---------- shared bits ---------- */

function FrameLabel({ name }: { name: string }) {
	return (
		<div className="mb-1.5 flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
			<span className="text-2xs text-thread">▸</span>
			<span className="text-thread">{name}</span>
		</div>
	);
}

function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 opacity-40"
			style={{
				backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
				backgroundSize: "22px 22px",
			}}
		/>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
