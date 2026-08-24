import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Tvärsö, the demo product every frame on the `variants` page is a variation of.
 *
 * One booking card for an island ferry, drawn once at its intrinsic 360×620 and
 * scaled wherever a canvas mock needs it smaller. It exists to give the page a
 * real thing to vary: four variations that a person would actually author, three
 * of which differ only in the payment block and one of which throws the whole
 * card away. That last one is the interesting one — it is what stops the shell
 * and outlet lane from being an easy answer.
 *
 * The card is its own product with its own palette and its own type. It never
 * speaks in spool's voice.
 */

export const CARD_W = 360;
export const CARD_H = 620;

const PAPER = "#FBFBF9";
const INK = "#14171A";
const MUTED = "#767D84";
const LINE = "#E6E7E3";
const FIELD = "#F2F3F0";
const SEA = "#0F5D4A";

export type VariationId = "card" | "swish" | "invoice" | "empty" | "voucher";

export interface Variation {
	readonly id: VariationId;
	/** the frame folder it lives in under today's `--` convention */
	readonly frame: string;
	/** the file it would be under a variations/ folder */
	readonly file: string;
	/** what a person calls it out loud */
	readonly label: string;
	/** one line of why it exists, for a rail row or a tooltip */
	readonly note: string;
	/** does it fill the shell's outlet, or replace the whole card */
	readonly fills: "outlet" | "card";
}

export const VARIATIONS: readonly Variation[] = [
	{ id: "card", frame: "checkout", file: "frame.tsx", label: "card", note: "the default: pay now, by card", fills: "outlet" },
	{ id: "swish", frame: "checkout--swish", file: "swish.tsx", label: "swish", note: "phone number, confirm in the app", fills: "outlet" },
	{ id: "invoice", frame: "checkout--invoice", file: "invoice.tsx", label: "invoice", note: "companies, 30 day terms", fills: "outlet" },
	{ id: "empty", frame: "checkout--empty", file: "empty.tsx", label: "empty", note: "nothing booked yet", fills: "card" },
];

/**
 * The fifth one, which does not exist yet.
 *
 * The authoring lane needs a variation that arrives while you are watching, so
 * this one is kept out of `VARIATIONS` and handed to the frame that writes it.
 */
export const NEW_VARIATION: Variation = {
	id: "voucher",
	frame: "checkout--voucher",
	file: "voucher.tsx",
	label: "voucher",
	note: "a gift voucher code, then whatever is left on a card",
	fills: "outlet",
};

export function variationAt(index: number): Variation {
	return VARIATIONS[((index % VARIATIONS.length) + VARIATIONS.length) % VARIATIONS.length] ?? VARIATIONS[0]!;
}

export function indexOf(id: VariationId): number {
	const found = VARIATIONS.findIndex((variation) => variation.id === id);
	return found === -1 ? 0 : found;
}

/* ── the card ──────────────────────────────────────────────────────────── */

export function TvarsoCheckout({ variation, className }: { variation: VariationId; className?: string | undefined }) {
	if (variation === "empty") return <EmptyCard className={className} />;
	return (
		<TvarsoShell className={className} action={actionOf(variation)}>
			<TvarsoOutlet variation={variation} />
		</TvarsoShell>
	);
}

function actionOf(variation: VariationId): string {
	if (variation === "swish") return "Pay with Swish";
	if (variation === "invoice") return "Send the invoice";
	if (variation === "voucher") return "Pay 46 kr";
	return "Pay 126 kr";
}

/**
 * Everything the four variations have in common, with a hole in the middle.
 *
 * The hole is deliberately a fixed 208px: the shell lane's whole claim is that
 * the chrome does not move when the fill changes, and a hole that resizes is a
 * chrome that moves.
 */
export function TvarsoShell({
	children,
	action,
	className,
	outletRef,
}: {
	children: ReactNode;
	action: string;
	className?: string | undefined;
	outletRef?: React.Ref<HTMLDivElement>;
}) {
	return (
		<Card className={className}>
			<Masthead />
			<Trip />
			<Lines />
			<div ref={outletRef} className="relative flex h-[208px] shrink-0 flex-col px-6 pt-4">
				{children}
			</div>
			<div className="mt-auto flex flex-col gap-2.5 px-6 pb-6">
				<button
					type="button"
					className="h-11 w-full rounded-[10px] text-[15px] font-medium leading-none"
					style={{ background: SEA, color: "#FFFFFF" }}
				>
					{action}
				</button>
				<p className="text-center text-[12px] leading-4" style={{ color: MUTED }}>
					Tickets land in your phone the moment we take the payment.
				</p>
			</div>
		</Card>
	);
}

function Card({ children, className }: { children: ReactNode; className?: string | undefined }) {
	return (
		<div
			className={cn(
				"flex flex-col overflow-hidden rounded-[14px] border font-[Instrument_Sans] antialiased",
				className,
			)}
			style={{ width: CARD_W, height: CARD_H, background: PAPER, borderColor: LINE, color: INK }}
		>
			{children}
		</div>
	);
}

function Masthead() {
	return (
		<div className="flex items-center justify-between px-6 pt-6 pb-4">
			<div className="flex flex-col gap-1">
				<span className="text-[19px] font-semibold leading-none tracking-[-0.01em]">Tvärsö</span>
				<span className="text-[13px] leading-none" style={{ color: MUTED }}>
					Strandvägen to Ramsö
				</span>
			</div>
			<span
				className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium"
				style={{ background: FIELD, color: MUTED }}
			>
				IL
			</span>
		</div>
	);
}

function Trip() {
	return (
		<div className="mx-6 flex items-center justify-between rounded-[10px] px-3.5 py-3" style={{ background: FIELD }}>
			<div className="flex flex-col gap-1">
				<span className="text-[14px] font-medium leading-none">Saturday 14 June, 17:40</span>
				<span className="text-[12px] leading-none" style={{ color: MUTED }}>
					35 minutes, quay 4
				</span>
			</div>
			<span className="text-[12px] leading-none" style={{ color: SEA }}>
				Change
			</span>
		</div>
	);
}

const LINES: readonly { label: string; price: string }[] = [
	{ label: "2 × Adult single", price: "96 kr" },
	{ label: "1 × Bicycle", price: "30 kr" },
];

function Lines() {
	return (
		<div className="mt-4 flex flex-col px-6">
			{LINES.map((line) => (
				<div key={line.label} className="flex items-center justify-between py-2 text-[14px] leading-5">
					<span>{line.label}</span>
					<span style={{ color: MUTED }}>{line.price}</span>
				</div>
			))}
			<div className="mt-2 h-px w-full" style={{ background: LINE }} />
			<div className="flex items-center justify-between pt-3 text-[15px] font-semibold leading-5">
				<span>Total</span>
				<span>126 kr</span>
			</div>
		</div>
	);
}

/* ── the three fills ───────────────────────────────────────────────────── */

export function TvarsoOutlet({ variation }: { variation: Exclude<VariationId, "empty"> }) {
	if (variation === "swish") return <SwishFill />;
	if (variation === "invoice") return <InvoiceFill />;
	if (variation === "voucher") return <VoucherFill />;
	return <CardFill />;
}

function FillTitle({ children }: { children: ReactNode }) {
	return (
		<span className="mb-3 text-[13px] font-medium leading-none" style={{ color: MUTED }}>
			{children}
		</span>
	);
}

function Field({ label, value, className }: { label: string; value: string; className?: string | undefined }) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<span className="text-[12px] leading-none" style={{ color: MUTED }}>
				{label}
			</span>
			<div
				className="flex h-9 items-center rounded-[8px] px-3 text-[14px] leading-none"
				style={{ background: FIELD, color: INK }}
			>
				{value}
			</div>
		</div>
	);
}

function Tick({ label, on = false }: { label: string; on?: boolean }) {
	return (
		<div className="flex items-center gap-2 text-[13px] leading-none">
			<span
				className="flex h-4 w-4 items-center justify-center rounded-[5px] border"
				style={{ borderColor: on ? SEA : LINE, background: on ? SEA : "transparent" }}
			>
				{on ? (
					<svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
						<path d="m2.5 6.2 2.3 2.3L9.5 3.6" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				) : null}
			</span>
			<span style={{ color: MUTED }}>{label}</span>
		</div>
	);
}

function CardFill() {
	return (
		<>
			<FillTitle>Card</FillTitle>
			<div className="flex flex-col gap-3">
				<Field label="Card number" value="4242 4242 4242 4242" />
				<div className="flex gap-3">
					<Field label="Expires" value="04 / 28" className="flex-1" />
					<Field label="CVC" value="•••" className="w-[92px]" />
				</div>
				<Tick label="Remember this card" on />
			</div>
		</>
	);
}

function SwishFill() {
	return (
		<>
			<FillTitle>Swish</FillTitle>
			<div className="flex gap-3">
				<div className="flex flex-1 flex-col gap-3">
					<Field label="Mobile number" value="070 123 45 67" />
					<p className="text-[12px] leading-4" style={{ color: MUTED }}>
						Open Swish on that phone and confirm within three minutes.
					</p>
				</div>
				<div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: FIELD }}>
					<QrBlock />
				</div>
			</div>
		</>
	);
}

function QrBlock() {
	const cells = [
		1, 1, 1, 0, 1, 0, 1, 1,
		1, 0, 1, 0, 0, 1, 0, 1,
		1, 1, 1, 1, 0, 1, 1, 0,
		0, 0, 1, 0, 1, 0, 1, 1,
		1, 1, 0, 1, 1, 1, 0, 0,
		0, 1, 1, 0, 1, 0, 1, 1,
		1, 0, 1, 1, 0, 1, 1, 0,
		1, 1, 0, 0, 1, 1, 0, 1,
	];
	return (
		<div className="grid grid-cols-8 gap-[2px]">
			{cells.map((cell, index) => (
				<span
					key={`${index}-${cell}`}
					className="h-[7px] w-[7px] rounded-[1px]"
					style={{ background: cell === 1 ? INK : "transparent" }}
				/>
			))}
		</div>
	);
}

function InvoiceFill() {
	return (
		<>
			<FillTitle>Invoice</FillTitle>
			<div className="flex flex-col gap-3">
				<Field label="Company" value="Ramsö Segelsällskap" />
				<div className="flex gap-3">
					<Field label="Organisation number" value="556677-8899" className="flex-1" />
					<Field label="Reference" value="IL" className="w-[92px]" />
				</div>
				<Tick label="30 day terms accepted" />
			</div>
		</>
	);
}

function VoucherFill() {
	return (
		<>
			<FillTitle>Voucher</FillTitle>
			<div className="flex flex-col gap-3">
				<div className="flex items-end gap-2">
					<Field label="Voucher code" value="RAMSO-80" className="flex-1" />
					<button
						type="button"
						className="h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-medium leading-none"
						style={{ background: SEA, color: "#FFFFFF" }}
					>
						Apply
					</button>
				</div>
				<div className="flex items-center justify-between text-[13px] leading-5">
					<span style={{ color: MUTED }}>Voucher</span>
					<span style={{ color: SEA }}>-80 kr</span>
				</div>
				<Tick label="Put the rest on the saved card" on />
			</div>
		</>
	);
}

/**
 * The variation that will not fit an outlet.
 *
 * No trip, no lines, no total, no pay button — the whole card is one sentence
 * and a way back to the timetable. Any model that says a variation is a fill
 * has to answer for this one.
 */
function EmptyCard({ className }: { className?: string | undefined }) {
	return (
		<Card className={className}>
			<Masthead />
			<div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
				<span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: FIELD }}>
					<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
						<path
							d="M3 16.5c1.6 0 1.6 1.2 3.2 1.2s1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2M5.5 13.5 12 11l6.5 2.5M12 11V6.5M9.5 6.5h5"
							stroke={MUTED}
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
				<span className="text-[16px] font-semibold leading-5">Nothing booked yet</span>
				<span className="text-[13px] leading-[19px]" style={{ color: MUTED }}>
					Pick a departure and the tickets, the bicycle and the total show up here.
				</span>
			</div>
			<div className="flex flex-col gap-2.5 px-6 pb-6">
				<button
					type="button"
					className="h-11 w-full rounded-[10px] border text-[15px] font-medium leading-none"
					style={{ borderColor: LINE, color: INK, background: "transparent" }}
				>
					See the timetable
				</button>
			</div>
		</Card>
	);
}

/* ── the two neighbours on the field ───────────────────────────────────── */

const DEPARTURES: readonly { time: string; quay: string; left: string }[] = [
	{ time: "16:20", quay: "Quay 4", left: "12 places" },
	{ time: "17:40", quay: "Quay 4", left: "6 places" },
	{ time: "19:05", quay: "Quay 2", left: "full" },
	{ time: "20:30", quay: "Quay 4", left: "20 places" },
];

export function TvarsoTimetable({ className }: { className?: string | undefined }) {
	return (
		<Card className={className}>
			<Masthead />
			<div className="flex flex-col px-6">
				<span className="pb-2 text-[13px] font-medium leading-none" style={{ color: MUTED }}>
					Saturday
				</span>
				{DEPARTURES.map((departure, index) => (
					<div
						key={departure.time}
						className="flex items-center justify-between rounded-[10px] px-3.5 py-3"
						style={{ background: index === 1 ? FIELD : "transparent" }}
					>
						<div className="flex flex-col gap-1">
							<span className="text-[15px] font-medium leading-none">{departure.time}</span>
							<span className="text-[12px] leading-none" style={{ color: MUTED }}>
								{departure.quay}
							</span>
						</div>
						<span className="text-[12px] leading-none" style={{ color: departure.left === "full" ? MUTED : SEA }}>
							{departure.left}
						</span>
					</div>
				))}
			</div>
			<div className="mt-auto flex flex-col gap-2.5 px-6 pb-6">
				<div className="h-px w-full" style={{ background: LINE }} />
				<p className="text-[12px] leading-4" style={{ color: MUTED }}>
					Times are checked against the traffic report ten minutes before each departure.
				</p>
			</div>
		</Card>
	);
}

export function TvarsoTicket({ className }: { className?: string | undefined }) {
	return (
		<Card className={className}>
			<Masthead />
			<div className="flex flex-1 flex-col items-center gap-4 px-6 pt-2">
				<div className="flex h-[150px] w-[150px] items-center justify-center rounded-[12px]" style={{ background: FIELD }}>
					<div className="scale-[1.7]">
						<QrBlock />
					</div>
				</div>
				<div className="flex flex-col items-center gap-1">
					<span className="text-[15px] font-semibold leading-none">2 adults, 1 bicycle</span>
					<span className="text-[13px] leading-none" style={{ color: MUTED }}>
						17:40 to Ramsö, quay 4
					</span>
				</div>
				<div className="h-px w-full" style={{ background: LINE }} />
				<span className="text-center text-[12px] leading-4" style={{ color: MUTED }}>
					Show this to the deckhand. It works without a signal.
				</span>
			</div>
			<div className="mt-auto px-6 pb-6">
				<button
					type="button"
					className="h-11 w-full rounded-[10px] border text-[15px] font-medium leading-none"
					style={{ borderColor: LINE, color: INK, background: "transparent" }}
				>
					Add to the wallet
				</button>
			</div>
		</Card>
	);
}

/**
 * A card at canvas size.
 *
 * Transform rather than a second set of type scales: one card, one source, and
 * the thumbnail is the same pixels the player would show.
 */
export function Scaled({
	scale,
	width = CARD_W,
	height = CARD_H,
	children,
	className,
}: {
	scale: number;
	width?: number;
	height?: number;
	children: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div className={cn("relative overflow-hidden", className)} style={{ width: width * scale, height: height * scale }}>
			<div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
		</div>
	);
}
