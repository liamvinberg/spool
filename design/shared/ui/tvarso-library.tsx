import type { ComponentType, CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils";
import { FIELD, INK, LINE, MUTED, PAPER, SEA } from "./tvarso-checkout";

/**
 * Tvärsö's design system, read the way shape C reads a library
 * ([spool-cloud#29](https://github.com/liamvinberg/spool-cloud/issues/29)):
 * **the component is the unit and the file is the grouping.**
 *
 * The material is deliberately not spool's own `shared/ui/`. A library page that
 * is only ever judged against the folder it was drawn from learns the shape of
 * that folder; this one is a small product's `src/ui/` — eleven files, twenty
 * three components, a tokens sheet — so the page has to answer for a
 * one-export file, a family of ten icons and a five-part file in the same
 * column. Everything renders: a specimen here is the component itself in
 * Tvärsö's own paper and ink, so a card that looks wrong is a card that is
 * wrong.
 *
 * Counts are per component, never per file. `rendered by 12 frames` is a fact
 * about `Button`; `button.tsx` has no such number, because a file is where a
 * component was defined and not a thing a frame can render.
 */

/* ---------- the reading ---------- */

export interface LibPart {
	/** the exported name, which is what the library page calls a row */
	readonly name: string;
	/** how many frames in the project render it */
	readonly frames: number;
	/** which ones, in project order, for a row that opens */
	readonly used: readonly string[];
	/** true size, so a well can decide about scale rather than squash it */
	readonly w: number;
	readonly h: number;
	readonly render: () => ReactNode;
}

export interface LibFile {
	/** the file name with its extension: the grouping, never a row of its own */
	readonly file: string;
	/** one line about what the file is, in Tvärsö's voice */
	readonly note: string;
	readonly parts: readonly LibPart[];
}

/** a file that defines exactly one component reads as a single row */
export function isSolo(file: LibFile): boolean {
	return file.parts.length === 1;
}

export function totalParts(files: readonly LibFile[]): number {
	return files.reduce((sum, file) => sum + file.parts.length, 0);
}

/* ---------- the project the counts are counted over ---------- */

/** Tvärsö's frames, in rail order */
export const TVARSO_FRAMES: readonly string[] = [
	"timetable",
	"departures",
	"checkout",
	"checkout--swish",
	"checkout--invoice",
	"checkout--empty",
	"boarding",
	"ticket",
	"wallet",
	"receipt",
	"refund",
	"season-pass",
	"account",
	"search",
];

/** the pages those frames sit on, in rail order */
export const TVARSO_PAGES: readonly { name: string; frames: readonly string[] }[] = [
	{
		name: "booking",
		frames: ["timetable", "departures", "search", "checkout", "checkout--swish", "checkout--invoice", "checkout--empty"],
	},
	{ name: "travel", frames: ["boarding", "ticket", "wallet", "season-pass"] },
	{ name: "after", frames: ["receipt", "refund", "account"] },
];

/* ---------- the primitives, drawn ---------- */

function Sans({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<div className={cn("font-[Instrument_Sans] antialiased", className)} style={{ color: INK, ...style }}>
			{children}
		</div>
	);
}

function Button() {
	return (
		<Sans className="flex items-center gap-2.5">
			<button
				type="button"
				className="h-9 rounded-[10px] px-4 text-[14px] font-medium leading-none"
				style={{ background: SEA, color: "#FFFFFF" }}
			>
				Pay 126 kr
			</button>
			<button
				type="button"
				className="h-9 rounded-[10px] border px-4 text-[14px] font-medium leading-none"
				style={{ borderColor: LINE, color: INK }}
			>
				Timetable
			</button>
		</Sans>
	);
}

function Card() {
	return (
		<Sans
			className="flex w-[184px] flex-col gap-2 rounded-[14px] border p-3.5"
			style={{ background: PAPER, borderColor: LINE }}
		>
			<span className="text-[14px] font-semibold leading-none">Saturday 14 June</span>
			<span className="text-[12px] leading-none" style={{ color: MUTED }}>
				Four departures to Ramsö
			</span>
			<div className="mt-1 h-px w-full" style={{ background: LINE }} />
			<span className="text-[12px] leading-none" style={{ color: SEA }}>
				See them all
			</span>
		</Sans>
	);
}

function TextField() {
	return (
		<Sans className="flex w-[196px] flex-col gap-1.5">
			<span className="text-[12px] leading-none" style={{ color: MUTED }}>
				Mobile number
			</span>
			<div
				className="flex h-9 items-center rounded-[8px] px-3 text-[14px] leading-none"
				style={{ background: FIELD }}
			>
				070 123 45 67
			</div>
		</Sans>
	);
}

function Badge() {
	return (
		<Sans className="flex items-center gap-2">
			<span className="rounded-full px-2.5 py-1 text-[11px] font-medium leading-none" style={{ background: FIELD, color: SEA }}>
				6 places
			</span>
			<span className="rounded-full px-2.5 py-1 text-[11px] font-medium leading-none" style={{ background: FIELD, color: MUTED }}>
				Full
			</span>
			<span className="rounded-full px-2.5 py-1 text-[11px] font-medium leading-none" style={{ background: SEA, color: "#FFFFFF" }}>
				Boarding
			</span>
		</Sans>
	);
}

function Tick({ label, on }: { label: string; on: boolean }) {
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

function Checkbox() {
	return (
		<Sans className="flex flex-col gap-2.5">
			<Tick label="Remember this card" on />
			<Tick label="Send a paper receipt" on={false} />
		</Sans>
	);
}

function Avatar() {
	return (
		<Sans className="flex items-center gap-2">
			{["IL", "ES", "MK"].map((initials, index) => (
				<span
					key={initials}
					className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium"
					style={{ background: index === 0 ? SEA : FIELD, color: index === 0 ? "#FFFFFF" : MUTED }}
				>
					{initials}
				</span>
			))}
		</Sans>
	);
}

function PriceRow() {
	return (
		<Sans className="flex w-[212px] flex-col">
			<div className="flex items-center justify-between py-1.5 text-[14px] leading-5">
				<span>2 × Adult single</span>
				<span style={{ color: MUTED }}>96 kr</span>
			</div>
			<div className="flex items-center justify-between py-1.5 text-[14px] leading-5">
				<span>1 × Bicycle</span>
				<span style={{ color: MUTED }}>30 kr</span>
			</div>
		</Sans>
	);
}

function Notice() {
	return (
		<Sans className="flex w-[228px] items-start gap-2.5 rounded-[10px] p-3" style={{ background: FIELD }}>
			<ClockIcon className="mt-px h-4 w-4 shrink-0" style={{ color: SEA }} />
			<span className="text-[12px] leading-[17px]" style={{ color: MUTED }}>
				Times are checked against the traffic report ten minutes before each departure.
			</span>
		</Sans>
	);
}

/* ---------- icons.tsx, the family ---------- */

export interface GlyphProps {
	className?: string;
	style?: CSSProperties;
}

function Glyph({ className, style, children }: GlyphProps & { children: ReactNode }) {
	return (
		<svg
			viewBox="0 0 20 20"
			className={cn("h-5 w-5", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={style}
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function FerryIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<path d="M2.5 13.6c1.4 0 1.4 1.2 2.8 1.2s1.4-1.2 2.8-1.2 1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2 1.4 1.2 2.8 1.2" />
			<path d="M4.4 11.2 10 8.9l5.6 2.3M10 8.9V4.6M8.1 4.6h3.8" />
		</Glyph>
	);
}

export function BicycleIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<circle cx="5.1" cy="13.2" r="3.1" />
			<circle cx="14.9" cy="13.2" r="3.1" />
			<path d="m5.1 13.2 3.2-5.4h4.2l2.4 5.4M8.4 7.8h3.6" />
		</Glyph>
	);
}

export function CalendarIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<rect x="3" y="4.6" width="14" height="12.4" rx="2.2" />
			<path d="M3 8.6h14M6.8 2.9v3M13.2 2.9v3" />
		</Glyph>
	);
}

export function ClockIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<circle cx="10" cy="10" r="7.1" />
			<path d="M10 5.9V10l2.7 1.6" />
		</Glyph>
	);
}

export function CardIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<rect x="2.4" y="4.8" width="15.2" height="10.4" rx="2.2" />
			<path d="M2.4 8.6h15.2M5.6 12.3h3.2" />
		</Glyph>
	);
}

export function SwishIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<path d="M3.5 13.2c3.6 2.6 8.6-.3 11.6-6.4" />
			<path d="m12.3 5.6 2.9.5-.4 2.9" />
		</Glyph>
	);
}

export function TicketIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<path d="M3.2 6.6h13.6v2.6a1.6 1.6 0 0 0 0 3.2v2.6H3.2v-2.6a1.6 1.6 0 0 0 0-3.2z" />
			<path d="M11.4 6.6v8.4" />
		</Glyph>
	);
}

export function WalletIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<rect x="2.6" y="5.2" width="14.8" height="9.8" rx="2.2" />
			<path d="M2.6 8.2h9.8M13.6 10.4h2.4" />
		</Glyph>
	);
}

export function CheckIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<path d="m4.2 10.4 3.9 3.9 7.7-8.6" />
		</Glyph>
	);
}

export function ChevronIcon(props: GlyphProps) {
	return (
		<Glyph {...props}>
			<path d="m7.6 4.6 5.6 5.4-5.6 5.4" />
		</Glyph>
	);
}

export type Glyph = ComponentType<GlyphProps>;

/** the family in source order, so a row and a chip read the same list */
export const ICONS: readonly { name: string; frames: number; used: readonly string[]; Icon: Glyph }[] = [
	{ name: "FerryIcon", frames: 9, used: ["timetable", "departures", "boarding", "ticket"], Icon: FerryIcon },
	{ name: "BicycleIcon", frames: 4, used: ["checkout", "ticket", "receipt", "refund"], Icon: BicycleIcon },
	{ name: "CalendarIcon", frames: 6, used: ["timetable", "departures", "search", "season-pass"], Icon: CalendarIcon },
	{ name: "ClockIcon", frames: 7, used: ["timetable", "departures", "boarding", "checkout"], Icon: ClockIcon },
	{ name: "CardIcon", frames: 3, used: ["checkout", "wallet", "account"], Icon: CardIcon },
	{ name: "SwishIcon", frames: 2, used: ["checkout--swish", "wallet"], Icon: SwishIcon },
	{ name: "TicketIcon", frames: 5, used: ["ticket", "wallet", "boarding", "refund"], Icon: TicketIcon },
	{ name: "WalletIcon", frames: 2, used: ["wallet", "account"], Icon: WalletIcon },
	{ name: "CheckIcon", frames: 6, used: ["checkout", "receipt", "boarding", "refund"], Icon: CheckIcon },
	{ name: "ChevronIcon", frames: 11, used: ["timetable", "departures", "account", "search"], Icon: ChevronIcon },
];

function IconSpecimen({ Icon }: { Icon: Glyph }) {
	return (
		<div className="flex items-center justify-center" style={{ color: INK }}>
			<Icon className="h-5 w-5" />
		</div>
	);
}

/* ---------- checkout-parts.tsx, the part family ---------- */

function Masthead() {
	return (
		<Sans className="flex w-[232px] items-center justify-between">
			<div className="flex flex-col gap-1">
				<span className="text-[17px] font-semibold leading-none tracking-[-0.01em]">Tvärsö</span>
				<span className="text-[12px] leading-none" style={{ color: MUTED }}>
					Strandvägen to Ramsö
				</span>
			</div>
			<span
				className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium"
				style={{ background: FIELD, color: MUTED }}
			>
				IL
			</span>
		</Sans>
	);
}

function TripRow() {
	return (
		<Sans className="flex w-[232px] items-center justify-between rounded-[10px] px-3.5 py-3" style={{ background: FIELD }}>
			<div className="flex flex-col gap-1">
				<span className="text-[14px] font-medium leading-none">Saturday 14 June, 17:40</span>
				<span className="text-[12px] leading-none" style={{ color: MUTED }}>
					35 minutes, quay 4
				</span>
			</div>
			<span className="text-[12px] leading-none" style={{ color: SEA }}>
				Change
			</span>
		</Sans>
	);
}

function LineItems() {
	return (
		<Sans className="flex w-[212px] flex-col">
			{[
				["2 × Adult single", "96 kr"],
				["1 × Bicycle", "30 kr"],
			].map(([label, price]) => (
				<div key={label} className="flex items-center justify-between py-1.5 text-[14px] leading-5">
					<span>{label}</span>
					<span style={{ color: MUTED }}>{price}</span>
				</div>
			))}
			<div className="mt-1 h-px w-full" style={{ background: LINE }} />
		</Sans>
	);
}

function TotalRow() {
	return (
		<Sans className="flex w-[196px] items-center justify-between text-[15px] font-semibold leading-5">
			<span>Total</span>
			<span>126 kr</span>
		</Sans>
	);
}

function PayBar() {
	return (
		<Sans className="flex w-[232px] flex-col gap-2.5">
			<button
				type="button"
				className="h-10 w-full rounded-[10px] text-[15px] font-medium leading-none"
				style={{ background: SEA, color: "#FFFFFF" }}
			>
				Pay 126 kr
			</button>
			<p className="text-center text-[12px] leading-4" style={{ color: MUTED }}>
				Tickets land in your phone the moment we take the payment.
			</p>
		</Sans>
	);
}

/* ---------- the folder ---------- */

export const TVARSO_FILES: readonly LibFile[] = [
	{
		file: "avatar.tsx",
		note: "the passenger on the booking",
		parts: [
			{
				name: "Avatar",
				frames: 6,
				used: ["checkout", "account", "wallet", "ticket", "boarding", "season-pass"],
				w: 104,
				h: 32,
				render: () => <Avatar />,
			},
		],
	},
	{
		file: "badge.tsx",
		note: "how full a departure is",
		parts: [
			{
				name: "Badge",
				frames: 5,
				used: ["timetable", "departures", "boarding", "season-pass", "search"],
				w: 216,
				h: 22,
				render: () => <Badge />,
			},
		],
	},
	{
		file: "button.tsx",
		note: "one filled, one quiet, nothing else",
		parts: [
			{
				name: "Button",
				frames: 12,
				used: ["timetable", "departures", "checkout", "checkout--swish", "checkout--invoice", "checkout--empty"],
				w: 226,
				h: 36,
				render: () => <Button />,
			},
		],
	},
	{
		file: "card.tsx",
		note: "the paper everything else stands on",
		parts: [
			{
				name: "Card",
				frames: 9,
				used: ["timetable", "checkout", "ticket", "wallet", "receipt", "account"],
				w: 184,
				h: 104,
				render: () => <Card />,
			},
		],
	},
	{
		file: "checkbox.tsx",
		note: "consent, and the saved card",
		parts: [
			{
				name: "Checkbox",
				frames: 4,
				used: ["checkout", "checkout--invoice", "account", "refund"],
				w: 176,
				h: 42,
				render: () => <Checkbox />,
			},
		],
	},
	{
		file: "checkout-parts.tsx",
		note: "the five blocks the booking card is assembled from",
		parts: [
			{ name: "Masthead", frames: 9, used: ["checkout", "timetable", "ticket", "wallet"], w: 232, h: 36, render: () => <Masthead /> },
			{ name: "TripRow", frames: 5, used: ["checkout", "boarding", "ticket", "refund"], w: 232, h: 52, render: () => <TripRow /> },
			{ name: "LineItems", frames: 4, used: ["checkout", "receipt", "refund", "season-pass"], w: 212, h: 54, render: () => <LineItems /> },
			{ name: "TotalRow", frames: 4, used: ["checkout", "receipt", "refund", "season-pass"], w: 196, h: 20, render: () => <TotalRow /> },
			{ name: "PayBar", frames: 6, used: ["checkout", "checkout--swish", "checkout--invoice", "season-pass"], w: 232, h: 66, render: () => <PayBar /> },
		],
	},
	{
		file: "icons.tsx",
		note: "ten glyphs, one stroke, no fills",
		parts: ICONS.map((icon) => ({
			name: icon.name,
			frames: icon.frames,
			used: icon.used,
			w: 20,
			h: 20,
			render: () => <IconSpecimen Icon={icon.Icon} />,
		})),
	},
	{
		file: "notice.tsx",
		note: "what the timetable cannot promise",
		parts: [
			{
				name: "Notice",
				frames: 2,
				used: ["timetable", "departures"],
				w: 228,
				h: 60,
				render: () => <Notice />,
			},
		],
	},
	{
		file: "price-row.tsx",
		note: "a line of the bill",
		parts: [
			{
				name: "PriceRow",
				frames: 4,
				used: ["checkout", "receipt", "refund", "season-pass"],
				w: 212,
				h: 48,
				render: () => <PriceRow />,
			},
		],
	},
	{
		file: "text-field.tsx",
		note: "label over field, never beside it",
		parts: [
			{
				name: "TextField",
				frames: 7,
				used: ["checkout", "checkout--swish", "checkout--invoice", "account", "search", "refund"],
				w: 196,
				h: 52,
				render: () => <TextField />,
			},
		],
	},
];

export const TVARSO_PARTS = totalParts(TVARSO_FILES);

/* ---------- tokens.css, the other half ---------- */

export interface Token {
	readonly name: string;
	readonly value: string;
	/** how many components read it */
	readonly used: number;
	/** a colour to draw, where the token is one */
	readonly swatch?: string;
	/** the sample line, where the token is type */
	readonly sample?: string;
	/** a corner radius to draw, where the token is one */
	readonly radius?: number;
	/** a gap to draw at true size, where the token is one */
	readonly gap?: number;
}

export interface TokenGroup {
	readonly name: string;
	readonly kind: "colour" | "type" | "radius" | "space";
	readonly tokens: readonly Token[];
}

export const TVARSO_TOKENS: readonly TokenGroup[] = [
	{
		name: "colour",
		kind: "colour",
		tokens: [
			{ name: "--sea", value: SEA, used: 11, swatch: SEA },
			{ name: "--ink", value: INK, used: 19, swatch: INK },
			{ name: "--paper", value: PAPER, used: 8, swatch: PAPER },
			{ name: "--muted", value: MUTED, used: 16, swatch: MUTED },
			{ name: "--field", value: FIELD, used: 9, swatch: FIELD },
			{ name: "--line", value: LINE, used: 7, swatch: LINE },
		],
	},
	{
		name: "type",
		kind: "type",
		tokens: [
			{ name: "--title", value: "19 / 24", used: 3, sample: "Strandvägen" },
			{ name: "--body", value: "14 / 20", used: 14, sample: "2 × Adult single" },
			{ name: "--small", value: "12 / 16", used: 12, sample: "35 minutes, quay 4" },
			{ name: "--label", value: "11 / 14", used: 4, sample: "6 places" },
		],
	},
	{
		name: "radius",
		kind: "radius",
		tokens: [
			{ name: "--card", value: "14px", used: 4, radius: 14 },
			{ name: "--field", value: "8px", used: 6, radius: 8 },
			{ name: "--pill", value: "999px", used: 3, radius: 20 },
		],
	},
	{
		name: "space",
		kind: "space",
		tokens: [
			{ name: "--tight", value: "8px", used: 10, gap: 8 },
			{ name: "--step", value: "12px", used: 13, gap: 12 },
			{ name: "--block", value: "24px", used: 6, gap: 24 },
		],
	},
];

export const TOKEN_COUNT = TVARSO_TOKENS.reduce((sum, group) => sum + group.tokens.length, 0);

/* ---------- drawing one ---------- */

/**
 * A specimen on Tvärsö's own paper, at true size where it fits and scaled where
 * it does not, with the scale said out loud in the same mono the canvas says its
 * zoom in. Both takes share this well so the only thing that differs between
 * them is the arrangement.
 */
export function Well({
	part,
	width,
	height,
	pad = 12,
	scaleReadout = true,
	className,
}: {
	part: LibPart;
	width: number;
	height: number;
	/** breathing room inside the paper, taken off before the fit is worked out */
	pad?: number;
	scaleReadout?: boolean;
	className?: string;
}) {
	const scale = Math.min(1, (width - pad * 2) / part.w, (height - pad * 2) / part.h);
	return (
		<div
			className={cn("relative flex shrink-0 items-center justify-center overflow-clip rounded-md border", className)}
			style={{ width, height, background: PAPER, borderColor: LINE }}
		>
			<div
				style={{
					width: part.w,
					height: part.h,
					transform: scale === 1 ? undefined : `scale(${scale})`,
					transformOrigin: "center",
				}}
			>
				{part.render()}
			</div>
			{scaleReadout && scale < 1 ? (
				<span className="absolute right-1.5 bottom-1 font-mono text-2xs leading-3" style={{ color: MUTED }}>
					{Math.round(scale * 100)}%
				</span>
			) : null}
		</div>
	);
}

/**
 * A specimen in a row's worth of paper: scaled down until it is as wide as the
 * strip and then cropped rather than scaled again, so a 104px card keeps the
 * type size a 36px button has instead of shrinking to an illegible thumbnail.
 * What you get is the top of the component, at a size you can read.
 */
export function Strip({
	part,
	width,
	height,
	className,
}: {
	part: LibPart;
	width: number;
	height: number;
	className?: string;
}) {
	const scale = Math.min(1, (width - 18) / part.w);
	const drawn = part.h * scale;
	const fits = drawn <= height - 12;
	return (
		<div
			className={cn("relative shrink-0 overflow-clip rounded-[5px] border", className)}
			style={{ width, height, background: PAPER, borderColor: LINE }}
		>
			<div
				className="absolute"
				style={{
					left: 9,
					top: fits ? Math.round((height - drawn) / 2) : 7,
					width: part.w,
					height: part.h,
					transform: scale === 1 ? undefined : `scale(${scale})`,
					transformOrigin: "top left",
				}}
			>
				{part.render()}
			</div>
		</div>
	);
}

/** a scrap of Tvärsö's paper with anything on it: the type sample, the radius chip */
export function Chip({
	width,
	height,
	radius = 5,
	className,
	children,
}: {
	width: number;
	height: number;
	radius?: number;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn("flex shrink-0 items-center overflow-clip border", className)}
			style={{ width, height, borderRadius: radius, background: PAPER, borderColor: LINE }}
		>
			{children}
		</div>
	);
}

/** the face the library page wears where a page of frames wears a folder */
export function LibraryFace({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={cn("h-3.5 w-3.5", className)} fill="none" aria-hidden="true">
			<rect x="4.75" y="1.75" width="7.5" height="7.5" rx="1.6" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.45" />
			<rect x="1.75" y="4.75" width="7.5" height="7.5" rx="1.6" stroke="currentColor" strokeWidth="1.2" fill="var(--color-bg)" />
		</svg>
	);
}
