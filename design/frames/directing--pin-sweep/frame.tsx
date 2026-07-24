import { motion } from "motion/react";
import { cn } from "../../shared/lib/utils";
import { CheckIcon } from "../../shared/ui/spool-icons";

/**
 * directing — pin language, consumed. The proof that an annotation is a work order,
 * not a comment thread: when the agent reads a pin, the order is done and the pin is
 * gone. No replies, no resolve button, nothing to archive. Here a sweep is halfway
 * through one frame: two orders read and cleared, one being read now, one still
 * queued. The rail is the queue draining, the frame is where the orders lived.
 */

type Sweep = "read" | "reading" | "queued";

const ORDERS: { id: string; order: string; sweep: Sweep }[] = [
	{ id: "brygg", order: "make this row denser", sweep: "read" },
	{ id: "bulle", order: "delete this", sweep: "read" },
	{ id: "promo", order: "swap this for the terminal variant", sweep: "reading" },
	{ id: "frame", order: "rework this", sweep: "queued" },
];

export default function DirectingPinSweep() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<DotGrid />

			<div className="absolute flex items-start gap-[72px]" style={{ left: 372, top: 214 }}>
				<div style={{ width: 320 }}>
					<Label />
					<Checkout />
				</div>
				<SweepRail />
			</div>
		</div>
	);
}

/* ---------- the frame being swept ---------- */

function Label() {
	return (
		<div className="mb-1.5 flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
			<span className="text-2xs text-muted/70">▸</span>
			<span className="text-muted">checkout</span>
		</div>
	);
}

function Checkout() {
	const rows = [
		{ id: "brygg", name: "Bryggkaffe", price: "30 kr", sweep: "read" as Sweep },
		{ id: "oat", name: "Havremjölk", price: "5 kr" },
		{ id: "bulle", name: "Kanelbulle", price: "35 kr", sweep: "read" as Sweep },
		{ id: "promo", name: "Rabattkod", price: "Lös in", sweep: "reading" as Sweep },
	];
	return (
		<div className="rounded-md border border-border bg-surface">
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
			<div className="flex flex-col px-3 py-2">
				{rows.map((r) => {
					const read = r.sweep === "read";
					const reading = r.sweep === "reading";
					return (
						<div key={r.id} className="relative">
							{reading ? (
								<span className="-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border border-thread/60 bg-thread/[0.06]" />
							) : null}
							{reading ? (
								<motion.span
									className="-left-2.5 -translate-y-1/2 absolute top-1/2 h-4 w-[3px] rounded-full bg-thread"
									animate={{ opacity: [1, 0.35, 1] }}
									transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
								/>
							) : null}
							<div className="relative flex h-9 items-center justify-between">
								<span className={cn("font-sans text-base leading-none", read ? "text-muted/60" : "text-text")}>
									{r.name}
								</span>
								{r.id === "promo" ? (
									<span className="rounded-[3px] border border-border-raised px-2 py-1 font-sans text-muted text-sm leading-none">
										{r.price}
									</span>
								) : (
									<span
										className={cn(
											"font-mono text-sm leading-none tabular-nums",
											read ? "text-muted/40" : "text-muted",
										)}
									>
										{r.price}
									</span>
								)}
							</div>
						</div>
					);
				})}
				<div className="mt-1.5 flex items-center justify-between border-border-raised/60 border-t pt-2.5">
					<span className="font-sans text-sm text-muted leading-none">Summa</span>
					<span className="font-mono text-base text-text leading-none tabular-nums">80 kr</span>
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

/** the on-frame trace: a read order fades to a check, the one being read pulses */
function RowMark({ sweep }: { sweep: Sweep }) {
	if (sweep === "read") {
		return (
			<span className="-right-[9px] -translate-y-1/2 absolute top-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-raised">
				<CheckIcon className="h-2.5 w-2.5 text-muted" />
			</span>
		);
	}
	if (sweep === "reading") {
		return (
			<span className="-right-[10px] -translate-y-1/2 absolute top-1/2 flex h-4 w-4 items-center justify-center">
				<motion.span
					className="absolute h-4 w-4 rounded-full border border-thread/50"
					animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
					transition={{ duration: 1.3, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
				/>
				<span className="h-2.5 w-2.5 rounded-full bg-thread" />
			</span>
		);
	}
	return null;
}

/* ---------- the queue draining ---------- */

function SweepRail() {
	const read = ORDERS.filter((o) => o.sweep === "read").length;
	return (
		<div className="w-[312px] overflow-hidden rounded-md border border-border-raised bg-bg/80 backdrop-blur">
			<div className="flex flex-col gap-2 border-border border-b px-4 py-3">
				<div className="flex items-center justify-between">
					<span className="font-mono text-2xs text-muted leading-3">sweep</span>
					<span className="font-mono text-2xs text-muted leading-3 tabular-nums">
						{read} / {ORDERS.length}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="relative flex h-1.5 w-1.5">
						<motion.span
							className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-thread"
							animate={{ opacity: [1, 0.3, 1] }}
							transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
					</span>
					<span className="font-sans text-sm text-text leading-none">opencode is reading</span>
				</div>
				<div className="h-[3px] w-full overflow-hidden rounded-full bg-raised">
					<div className="h-full rounded-full bg-thread/80" style={{ width: `${(read / ORDERS.length) * 100}%` }} />
				</div>
			</div>

			<ul className="flex flex-col">
				{ORDERS.map((o) => (
					<OrderRow key={o.id} order={o.order} sweep={o.sweep} />
				))}
			</ul>
		</div>
	);
}

function OrderRow({ order, sweep }: { order: string; sweep: Sweep }) {
	return (
		<li className="flex items-center gap-2.5 px-4 py-2.5">
			<SweepGlyph sweep={sweep} />
			<span
				className={cn(
					"min-w-0 flex-1 truncate font-sans text-base leading-none",
					sweep === "read" ? "text-muted/60" : sweep === "reading" ? "text-text" : "text-muted",
				)}
			>
				{order}
			</span>
			<span
				className={cn(
					"shrink-0 font-mono text-2xs leading-3",
					sweep === "reading" ? "text-thread" : "text-muted/50",
				)}
			>
				{sweep}
			</span>
		</li>
	);
}

function SweepGlyph({ sweep }: { sweep: Sweep }) {
	if (sweep === "read") {
		return (
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-raised">
				<CheckIcon className="h-2.5 w-2.5 text-muted" />
			</span>
		);
	}
	if (sweep === "reading") {
		return (
			<span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
				<motion.span
					className="absolute h-4 w-4 rounded-full border border-thread/50"
					animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
					transition={{ duration: 1.3, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
				/>
				<span className="h-2 w-2 rounded-full bg-thread" />
			</span>
		);
	}
	return (
		<span className="flex h-4 w-4 shrink-0 items-center justify-center">
			<span className="h-2 w-2 rounded-full border border-muted/50" />
		</span>
	);
}

/* ---------- shared ---------- */

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
