import { cn } from "../../shared/lib/utils";

/**
 * directing — pin language, at density. Orders accumulate on one busy frame before
 * an agent sweeps them. The read stays legible because pins are not all open at
 * once: two orders sit expanded in the margins, one rests as a numbered chip on its
 * row, and a fourth is pinned to the whole frame. A quiet count gathers them. This
 * is the case only the pins themselves have to solve, whichever shape placed them.
 */

type Side = "left" | "right" | "collapsed";
interface Pin {
	n: number;
	order: string;
	target: string;
	side: Side;
}

const ROWS: { id: string; name: string; price: string; pin?: Pin }[] = [
	{ id: "brygg", name: "Bryggkaffe", price: "30 kr", pin: { n: 1, order: "make this row denser", target: "row", side: "left" } },
	{ id: "oat", name: "Havremjölk", price: "5 kr" },
	{ id: "bulle", name: "Kanelbulle", price: "35 kr", pin: { n: 2, order: "delete this", target: "row", side: "right" } },
	{
		id: "promo",
		name: "Rabattkod",
		price: "Lös in",
		pin: { n: 3, order: "swap this for the terminal variant", target: "PromoField", side: "collapsed" },
	},
];

export default function DirectingPinCluster() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<DotGrid />

			<div className="absolute" style={{ left: 550, top: 232, width: 340 }}>
				{/* frame-level order: pinned to the whole checkout, riding its label */}
				<FramePin n={4} order="rework this" target="whole frame" />
				<Checkout />
			</div>
		</div>
	);
}

function Checkout() {
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
				{ROWS.map((r) => (
					<Row key={r.id} row={r} />
				))}
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

function Row({ row }: { row: (typeof ROWS)[number] }) {
	const pin = row.pin;
	const pinned = pin !== undefined;
	return (
		<div className="relative">
			{pinned ? (
				<span className="-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border border-thread/45 bg-thread/[0.05]" />
			) : null}
			<div className="relative flex h-9 items-center justify-between">
				<span className="font-sans text-base text-text leading-none">{row.name}</span>
				{row.id === "promo" ? (
					<span className="rounded-[3px] border border-border-raised px-2 py-1 font-sans text-muted text-sm leading-none">
						{row.price}
					</span>
				) : (
					<span className="font-mono text-sm text-muted leading-none tabular-nums">{row.price}</span>
				)}
			</div>
			{pin ? <RowPin pin={pin} /> : null}
		</div>
	);
}

function RowPin({ pin }: { pin: Pin }) {
	if (pin.side === "collapsed") {
		return (
			<span className="-right-[9px] -translate-y-1/2 absolute top-1/2">
				<Chip n={pin.n} />
			</span>
		);
	}
	const left = pin.side === "left";
	return (
		<div className={cn("-translate-y-1/2 absolute top-1/2 flex items-center", left ? "right-full" : "left-full")}>
			{left ? (
				<>
					<Bubble n={pin.n} order={pin.order} target={pin.target} />
					<Leader dir="right" />
				</>
			) : (
				<>
					<Leader dir="left" />
					<Bubble n={pin.n} order={pin.order} target={pin.target} />
				</>
			)}
		</div>
	);
}

/* ---------- the frame-level order ---------- */

function FramePin({ n, order, target }: { n: number; order: string; target: string }) {
	return (
		<>
			{/* bubble above the frame, tied by a hairline to the label that names it */}
			<div className="-top-[74px] absolute left-0 flex flex-col items-start">
				<Bubble n={n} order={order} target={target} />
				<span className="ml-2.5 h-4 w-px bg-thread/50" />
			</div>
			{/* the label doubles as the frame anchor */}
			<div className="mb-1.5 flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				<Chip n={n} />
				<span className="text-thread">checkout</span>
				<span className="text-muted/50">· frame</span>
			</div>
		</>
	);
}

/* ---------- shared pin bits ---------- */

function Bubble({ n, order, target }: { n: number; order: string; target: string }) {
	return (
		<div className="flex w-[228px] items-start gap-2 rounded-md border border-border-raised bg-bg/95 px-3 py-2.5 backdrop-blur">
			<Chip n={n} />
			<div className="min-w-0 flex-1">
				<p className="font-sans text-base text-text leading-base">{order}</p>
				<p className="mt-1 font-mono text-2xs text-muted leading-3">
					{target} <span className="text-muted/40">·</span> <span className="text-muted/70">queued</span>
				</p>
			</div>
		</div>
	);
}

function Leader({ dir }: { dir: "left" | "right" }) {
	return (
		<span className="flex w-9 items-center">
			{dir === "right" ? <span className="h-px flex-1 bg-thread/60" /> : null}
			<span className="h-2 w-2 shrink-0 rounded-full bg-thread" />
			{dir === "left" ? <span className="h-px flex-1 bg-thread/60" /> : null}
		</span>
	);
}

function Chip({ n }: { n: number }) {
	return (
		<span className="mt-px flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
			{n}
		</span>
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
