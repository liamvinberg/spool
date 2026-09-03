import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
import boardPhoto from "./brasa-board.jpg";
import bokehPhoto from "./brasa-bokeh.jpg";
import candlePhoto from "./brasa-candle.jpg";
import silverPhoto from "./brasa-silver.jpg";
import tablePhoto from "./brasa-table.jpg";

/**
 * The product imagery for site-clean--ledger.
 *
 * Wherever this page shows spool, it shows spool. Every number below is read off
 * the shipped source rather than eyeballed, and where the running canvas and a
 * drawing disagreed the canvas won:
 *
 *   app bar          src/ui/app.tsx: h-11, border-b, px-4, the mark and the
 *                    wordmark at text-md, the tab strip at h-[26px], the zoom
 *                    read-out in mono at the right
 *   pages rail       src/ui/canvas/sidebar.tsx and rail-rows.ts: 248 wide,
 *                    an h-11 header, py-2 list, PAGE_ROW 32, FRAME_ROW 28,
 *                    INDENT 10, contentX = depth*10+24, guideX = (depth-1)*10+18,
 *                    an h-9 footer that says what a folder press does
 *   dock strip       src/ui/canvas/dock.tsx: STRIP_WIDTH 44, border-l, two
 *                    h-8 glyphs, properties over agent
 *   the field        src/ui/canvas/canvas.tsx: bg-canvas and nothing else.
 *                    There is no dot grid on spool's canvas, so there is none
 *                    here either
 *   a frame          rounded at shellRadius, 12px at 1:1, no border of its own
 *   the label        src/ui/canvas/frame-label.tsx: mono text-sm/leading-4,
 *                    pb-2.5, thread when selected, and the selection carries
 *                    `play` at the far end of its own row
 *   the ring         src/ui/canvas/overlays.tsx: 1.5px thread inset 3, radius
 *                    14, four 8px handles centred on its corners, and the size
 *                    chip 14px below the frame
 *   the unseen mark  src/ui/canvas/unseen-mark.tsx: white ink, a filled disc
 *                    for new, in a 14px box so the name never shifts
 *   an arrow         src/ui/canvas/flow-arrows.tsx: 1.5px thread, head 10 long
 *                    and 9 across, bow max(40, distance * 0.4)
 *
 * The other rule: red belongs to spool and nothing else. Rings, threads, labels
 * and the rail's spine carry the thread; Brasa, the restaurant standing on the
 * canvas, brings its own warm dark, its own four typefaces and its own ember,
 * which is an orange far enough from --color-thread to read as another world. So
 * a visitor can tell at a glance which pixels are the tool and which are the
 * thing being designed.
 *
 * Screens are drawn at the size they are shown, 1:1. Where a composition is
 * smaller than life it is one transform on a real screen, with the labels and
 * rings left at screen size because that is what the canvas does at any zoom.
 */

export const MONO = "font-mono [font-variant-ligatures:none]";

/* ---------- glyphs, verbatim from src/ui/icons.tsx and sidebar.tsx ---------- */

export function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2 1.2 8.4 5 2 8.8Z" />
		</svg>
	);
}

export function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.6 8.4 8.4 3.6M4.7 3.6h3.7v3.7"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M7 1.9v7.3M4 6.2 7 9.2l3-3M2.5 11.8h9"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.4" y="4.4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
			<path
				d="M2.7 7.6h-.45a.8.8 0 0 1-.8-.8V2.3a.8.8 0 0 1 .8-.8h4.5a.8.8 0 0 1 .8.8v.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.4 4.9 8.7 9.5 3.4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn("origin-center text-muted", open && "rotate-90", className)}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PanelCaret({ dir, className }: { dir: "left" | "right"; className?: string }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PlusIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path d="M5 .75v8.5M.75 5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function FoldIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 1.5 5 4.25 8.25 1.5M1.75 8.5 5 5.75 8.25 8.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function EdgeIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

function PropertiesIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M5.5 2.4v3.1M5.5 9.1v4.5M10.5 2.4v6.3M10.5 12.3v1.3"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<circle cx="5.5" cy="7.3" r="1.5" fill="currentColor" />
			<circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" />
		</svg>
	);
}

function AgentIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r="1.15" fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.15" fill="currentColor" />
			<path d="M6.4 5.4h7.2M6.4 10.6h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

function SelectIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path
				d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
				fill="currentColor"
			/>
		</svg>
	);
}

function EditIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12.03 12.68a.5.5 0 0 1 .65-.65l9 3.5a.5.5 0 0 1-.03.95l-3.45 1.06a1 1 0 0 0-.66.66l-1.06 3.45a.5.5 0 0 1-.95.03z"
				fill="currentColor"
			/>
			<path
				d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1"
				stroke="currentColor"
				strokeWidth="1.9"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function HandIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** unseen-mark.tsx: white ink in a 14px box, a filled disc for new. */
function UnseenMark({ mark, className }: { mark: "new" | "changed"; className?: string }) {
	return (
		<span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			<span
				className={cn(
					"block rounded-full",
					mark === "new" ? "h-[5px] w-[5px] bg-text/85" : "h-[7px] w-[7px] border-[1.5px] border-text/70",
				)}
			/>
		</span>
	);
}

/* ---------- Brasa: the product standing on the canvas ---------- */

/**
 * Brasa is a twenty-four seat restaurant on Hökens gata that cooks everything
 * over wood. Its site was prototyped in spool, so the frames on this page are
 * the ones that exist: home and its four takes, menu, reserve and the state
 * after it, the booking card, and the phone flow.
 *
 * Its whole system arrives from Brasa's own design/shared/tokens.css and
 * nothing is invented here: a warm near-black ground, cream ink, one ember and
 * one candle gold, a paper side for the daylight takes, and four faces with one
 * job each.
 *
 *   Fraunces             the restaurant's own voice, everything at display size
 *   Instrument Serif     the editorial take, headline and pull quote
 *   Bricolage Grotesque  the playful take, where type is the whole design
 *   Inter Tight          every sentence, label, price and field on every screen
 *
 * Atmosphere is drawn rather than decorated. Light comes from two radial
 * sources, a low ember and a high candle, a photograph is always laid under a
 * warm scrim so type stays readable on it, and a fine grain sits over the whole
 * ground at overlay so the flat fills stop looking like flat fills. One thing
 * on the page moves by itself: the glow behind the candle breathes on a six
 * second cycle, and it stops under prefers-reduced-motion.
 *
 * The photographs are Unsplash-licensed and land beside this file as imports,
 * because an image is an import and never a URL.
 */

const APP_W = 1440;
const APP_H = 900;
const PHONE_W = 390;
const PHONE_H = 844;
const CARD_W = 460;
const CARD_H = 392;

const BRASA_CSS = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:opsz,wght@9..144,300..700&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400..600&display=swap');
.brs {
	--ink: #0d0908;
	--ink-2: #17100d;
	--ink-3: #221812;
	--line: rgba(246,236,225,0.14);
	--line-2: rgba(246,236,225,0.30);
	--cream: #f6ece1;
	--dim: #c8b4a4;
	--faint: #8d7b6d;
	--ember: #e0642b;
	--gold: #eab96c;
	--paper: #f2ebe0;
	--paper-2: #e6dccd;
	--paper-line: rgba(23,17,14,0.16);
	--paper-ink: #17110e;
	--paper-dim: #6d5f52;
	font-family: "Inter Tight", ui-sans-serif, system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
}
.brs .disp {
	font-family: Fraunces, "Iowan Old Style", Georgia, serif;
	font-variation-settings: "opsz" 144, "SOFT" 24, "WONK" 0;
}
.brs .ed { font-family: "Instrument Serif", "Iowan Old Style", Georgia, serif; }
.brs .pop { font-family: "Bricolage Grotesque", "Inter Tight", ui-sans-serif, sans-serif; }
.brs .num { font-variant-numeric: tabular-nums; }
@keyframes brasa-breathe {
	0%, 100% { opacity: 0.72; }
	50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
	@keyframes brasa-breathe { 0%, 100% { opacity: 0.86; } }
}`;

/** One stylesheet for the whole restaurant, mounted with every plate. */
function BrasaType() {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: a stylesheet, written here
	return <style dangerouslySetInnerHTML={{ __html: BRASA_CSS }} />;
}

/** A tiled fractal noise, laid over the ground at overlay so fills gain a tooth. */
const GRAIN =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";

const BLEND = {
	overlay: "mix-blend-overlay",
	"soft-light": "mix-blend-soft-light",
	multiply: "mix-blend-multiply",
} as const;

function Grain({ opacity = 0.13, blend = "overlay" }: { opacity?: number; blend?: keyof typeof BLEND }) {
	return (
		<span
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0", BLEND[blend])}
			style={{ backgroundImage: GRAIN, backgroundSize: "180px 180px", opacity }}
		/>
	);
}

/** Two light sources on the ground: a low ember, a high candle. */
function Hearth({ style }: { style?: CSSProperties }) {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-0"
			style={
				style ?? {
					background:
						"radial-gradient(62% 58% at 10% 84%, rgba(224,100,43,0.20), rgba(224,100,43,0) 68%), radial-gradient(48% 42% at 72% 4%, rgba(234,185,108,0.10), rgba(234,185,108,0) 70%)",
				}
			}
		/>
	);
}

/** A flame cut to one shape, so the mark reads at 12px and at 120. */
function Flame({ className, style }: { className?: string; style?: CSSProperties }) {
	return (
		<svg viewBox="0 0 16 20" fill="none" aria-hidden="true" className={className} style={style}>
			<path d="M8 0.8c3.6 4.6 5.4 7.5 5.4 10.6a5.4 5.4 0 0 1-10.8 0C2.6 8.3 4.4 5.4 8 0.8Z" fill="currentColor" />
			<path d="M8 8.4c1.5 2 2.3 3.3 2.3 4.6a2.3 2.3 0 0 1-4.6 0c0-1.3 0.8-2.6 2.3-4.6Z" fill="#0d0908" opacity="0.55" />
		</svg>
	);
}

/* ---- the small parts every Brasa screen shares ---- */

function Rule({ tone = "dark", className }: { tone?: "dark" | "paper"; className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("block h-px w-full", className)}
			style={{ background: tone === "paper" ? "var(--paper-line)" : "var(--line)" }}
		/>
	);
}

/**
 * The one filled action, in bone on the dark and in ink on the paper. Brasa's
 * fire lives in the light behind the page rather than in a button, which is also
 * how it stays out of spool's red.
 */
function SolidButton({
	children,
	height = 48,
	className,
	onClick,
	full = false,
	tone = "dark",
}: {
	children: ReactNode;
	height?: number;
	className?: string;
	onClick?: () => void;
	full?: boolean;
	tone?: "dark" | "paper";
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={
				tone === "paper"
					? { height, background: "var(--paper-ink)", color: "var(--paper)" }
					: { height, background: "var(--cream)", color: "#17110e" }
			}
			className={cn(
				"inline-flex cursor-pointer select-none items-center justify-center rounded-full px-7 font-medium leading-none transition-opacity duration-200 hover:opacity-88",
				full && "w-full",
				className,
			)}
		>
			{children}
		</button>
	);
}

function QuietLink({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "paper" }) {
	return (
		<span
			className="cursor-pointer border-b pb-1 text-[14px] leading-none transition-colors duration-200"
			style={{
				color: tone === "paper" ? "var(--paper-ink)" : "var(--cream)",
				borderColor: tone === "paper" ? "var(--paper-line)" : "var(--line-2)",
			}}
		>
			{children}
		</span>
	);
}

const HOURS: readonly { days: string; time: string }[] = [
	{ days: "Tuesday to Thursday", time: "17:30 to 23:00" },
	{ days: "Friday and Saturday", time: "17:00 to midnight" },
	{ days: "Sunday and Monday", time: "Closed" },
];

function HoursList({ tone = "dark", width = 380 }: { tone?: "dark" | "paper"; width?: number }) {
	const dim = tone === "paper" ? "var(--paper-dim)" : "var(--faint)";
	const ink = tone === "paper" ? "var(--paper-ink)" : "var(--dim)";
	return (
		<div style={{ width }}>
			{HOURS.map((h) => (
				<div key={h.days}>
					<Rule tone={tone} />
					<div className="flex items-baseline justify-between py-2.5">
						<span className="text-[13.5px]" style={{ color: dim }}>
							{h.days}
						</span>
						<span className="num text-[13.5px]" style={{ color: h.time === "Closed" ? dim : ink }}>
							{h.time}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

const NAV = ["Menu", "Hours", "Find us"] as const;

/** 80 tall, ruled underneath, the wordmark at the left and one filled action at the right. */
function BrasaBar({ page = "home", tone = "dark" }: { page?: string; tone?: "dark" | "paper" }) {
	const paper = tone === "paper";
	return (
		<header
			className="relative z-10 flex h-[80px] shrink-0 items-center justify-between px-14"
			style={{ borderBottom: `1px solid ${paper ? "var(--paper-line)" : "var(--line)"}` }}
		>
			<span className="flex items-center gap-3">
				<Flame className="h-[19px] w-[15px]" style={{ color: "var(--gold)" }} />
				<span
					className="disp text-[23px] leading-none tracking-[0.015em]"
					style={{ color: paper ? "var(--paper-ink)" : "var(--cream)", fontWeight: 500 }}
				>
					Brasa
				</span>
			</span>
			<nav className="flex items-center gap-9">
				{NAV.map((item) => (
					<span
						key={item}
						className="cursor-pointer text-[13.5px] leading-none transition-colors duration-200"
						style={{
							color:
								item.toLowerCase() === page
									? paper
										? "var(--paper-ink)"
										: "var(--cream)"
									: paper
										? "var(--paper-dim)"
										: "var(--faint)",
						}}
					>
						{item}
					</span>
				))}
				<span
					className="flex h-9 cursor-pointer items-center rounded-full border px-5 text-[13px] leading-none"
					style={{
						borderColor: paper ? "var(--paper-line)" : "var(--line-2)",
						color: paper ? "var(--paper-ink)" : "var(--cream)",
					}}
				>
					Book a table
				</span>
			</nav>
		</header>
	);
}

/** A photograph, always under a warm scrim so cream type survives on top of it. */
function Photo({
	src,
	className,
	scrim = "linear-gradient(90deg, var(--ink) 0%, rgba(13,9,8,0.55) 26%, rgba(13,9,8,0.10) 62%, rgba(13,9,8,0.45) 100%)",
	tint = "radial-gradient(88% 70% at 62% 80%, rgba(224,100,43,0.26), rgba(13,9,8,0) 58%)",
	position = "center",
}: {
	src: string;
	className?: string;
	scrim?: string;
	tint?: string;
	position?: string;
}) {
	return (
		<div className={cn("relative overflow-hidden", className)}>
			<img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: position }} />
			<span aria-hidden="true" className="absolute inset-0" style={{ background: tint }} />
			<span aria-hidden="true" className="absolute inset-0" style={{ background: scrim }} />
			<Grain opacity={0.1} blend="soft-light" />
		</div>
	);
}

/* ---- home ---- */

const HOME_LINE = "Everything here has been over the fire.";
const HOME_INTENT =
	"Twenty-four seats on Hökens gata. Two sittings a night, six courses, and a room that smells of oak from four in the afternoon.";
const ADDRESS = "Hökens gata 4, Södermalm, Stockholm";

export function HomeScreen() {
	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "var(--ink)", color: "var(--cream)" }}
		>
			<BrasaType />
			<Hearth />
			<Grain />
			<BrasaBar page="home" />
			<div className="relative flex min-h-0 flex-1">
				<div className="flex min-w-0 flex-1 flex-col justify-between py-[64px] pr-14 pl-[72px]">
					<div>
						<h1
							className="disp"
							style={{ fontSize: 92, lineHeight: 0.96, fontWeight: 300, letterSpacing: "-0.03em" }}
						>
							Everything here
							<br />
							has been over
							<br />
							the fire.
						</h1>
						<p className="mt-8 max-w-[440px] text-[16.5px] leading-[28px]" style={{ color: "var(--dim)" }}>
							{HOME_INTENT}
						</p>
						<div className="mt-10 flex items-center gap-8">
							<SolidButton className="text-[14px]">Book a table</SolidButton>
							<QuietLink>See the menu</QuietLink>
						</div>
					</div>
					<div>
						<HoursList width={420} />
						<div className="mt-5 text-[13px]" style={{ color: "var(--faint)" }}>
							{ADDRESS}
						</div>
					</div>
				</div>
				<Photo src={tablePhoto} className="w-[552px] shrink-0" position="60% 50%" />
			</div>
		</div>
	);
}

/* ---- home--candlelit: the same page with the lights taken down ---- */

export function HomeCandlelit() {
	return (
		<div
			className="brs relative overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "#070403", color: "var(--cream)" }}
		>
			<BrasaType />
			<img
				src={candlePhoto}
				alt=""
				className="absolute top-0 right-0 h-full w-[1120px] object-cover"
				style={{ objectPosition: "50% 50%" }}
			/>
			<span
				aria-hidden="true"
				className="absolute top-0 right-0 h-full w-[1120px]"
				style={{
					background:
						"radial-gradient(38% 30% at 50% 52%, rgba(234,150,60,0.36), rgba(7,4,3,0) 64%)",
					animation: "brasa-breathe 6s cubic-bezier(0.45, 0, 0.55, 1) infinite",
				}}
			/>
			<span
				aria-hidden="true"
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(90deg, #070403 34%, rgba(7,4,3,0.88) 48%, rgba(7,4,3,0.34) 70%, rgba(7,4,3,0.74) 100%)",
				}}
			/>
			<Grain opacity={0.16} />
			<div className="relative flex h-full flex-col justify-between px-[72px] py-[60px]">
				<div className="flex items-center justify-between">
					<span className="flex items-center gap-3">
						<Flame className="h-[18px] w-[14px]" style={{ color: "var(--gold)" }} />
						<span
							className="disp text-[21px] leading-none tracking-[0.02em]"
							style={{ color: "var(--cream)", fontWeight: 400 }}
						>
							Brasa
						</span>
					</span>
					<span
						className="flex h-9 cursor-pointer items-center rounded-full border px-5 text-[13px] leading-none"
						style={{ borderColor: "rgba(234,185,108,0.34)", color: "var(--gold)" }}
					>
						Book a table
					</span>
				</div>

				<div className="max-w-[720px]">
					<h1
						className="disp"
						style={{
							fontSize: 96,
							lineHeight: 0.98,
							fontWeight: 300,
							letterSpacing: "-0.034em",
							color: "#fbf2e6",
						}}
					>
						Everything here
						<br />
						has been over
						<br />
						the fire.
					</h1>
					<p className="mt-8 max-w-[430px] text-[16px] leading-[28px]" style={{ color: "var(--dim)" }}>
						Twenty-four seats. Two sittings. Oak, birch, and time enough to use them properly.
					</p>
					<div className="mt-9 flex items-center gap-9">
						<span
							className="num text-[13px] leading-none"
							style={{ color: "var(--gold)" }}
						>
							17:30
						</span>
						<span className="num text-[13px] leading-none" style={{ color: "var(--gold)" }}>
							20:30
						</span>
						<span className="text-[13px] leading-none" style={{ color: "var(--faint)" }}>
							Tuesday to Saturday
						</span>
					</div>
				</div>

				<div className="flex items-end justify-between">
					<span className="text-[12.5px]" style={{ color: "var(--faint)" }}>
						{ADDRESS}
					</span>
					<span className="text-[12.5px]" style={{ color: "var(--faint)" }}>
						Closed Sunday and Monday
					</span>
				</div>
			</div>
		</div>
	);
}

/* ---- home--editorial: the same page as a broadsheet ---- */

export function HomeEditorial() {
	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "var(--paper)", color: "var(--paper-ink)" }}
		>
			<BrasaType />
			<Grain opacity={0.16} blend="multiply" />
			<div className="relative flex items-center justify-between px-[72px] pt-9 pb-6">
				<span className="num text-[12px]" style={{ color: "var(--paper-dim)" }}>
					Est. 2019
				</span>
				<span className="ed text-[40px] leading-none tracking-[0.06em]">BRASA</span>
				<span className="text-[12px]" style={{ color: "var(--paper-dim)" }}>
					Södermalm, Stockholm
				</span>
			</div>
			<div className="px-[72px]">
				<span className="block h-px w-full" style={{ background: "var(--paper-ink)" }} />
				<span className="mt-[3px] block h-px w-full" style={{ background: "var(--paper-line)" }} />
			</div>

			<div className="relative flex min-h-0 flex-1 flex-col px-[72px] pt-10 pb-9">
				<h1
					className="ed max-w-[1080px] italic"
					style={{ fontSize: 68, lineHeight: 1.04, letterSpacing: "-0.01em" }}
				>
					Everything here has been over the fire.
				</h1>

				<div className="mt-9 grid min-h-0 flex-1 grid-cols-[1fr_452px_268px] gap-12">
					<div className="flex flex-col">
						<p className="text-[14.5px] leading-[25px]" style={{ color: "var(--paper-ink)" }}>
							<span
								className="ed float-left mt-[9px] mr-3 leading-[0.72]"
								style={{ fontSize: 68 }}
							>
								T
							</span>
							wenty-four seats on Hökens gata, one long room, and a hearth that is lit at two in the
							afternoon. Six courses arrive in the order the coals allow, so the menu is written each
							morning and printed once.
						</p>
						<p className="mt-4 text-[14.5px] leading-[25px]" style={{ color: "var(--paper-dim)" }}>
							Two sittings a night, at 17:30 and at 20:30. The kitchen keeps the last hour of the
							evening for whatever is left in the embers.
						</p>
						<span className="mt-7 block h-px w-full" style={{ background: "var(--paper-ink)" }} />
						<span className="ed mt-4 block text-[22px] leading-none">Tonight</span>
						<div className="mt-3">
							{COURSES.map((c) => (
								<div key={c.numeral} className="flex items-baseline gap-3 py-[7px]">
									<span
										className="ed w-[26px] shrink-0 text-[12px] leading-none"
										style={{ color: "var(--paper-dim)" }}
									>
										{c.numeral}
									</span>
									<span className="min-w-0 flex-1 truncate text-[13.5px] leading-none">{c.name}</span>
									<span className="num text-[13px] leading-none" style={{ color: "var(--paper-dim)" }}>
										{c.price}
									</span>
								</div>
							))}
						</div>
						<div className="mt-auto pt-6">
							<QuietLink tone="paper">Read the whole menu</QuietLink>
						</div>
					</div>

					<figure className="m-0 flex min-h-0 flex-col">
						<img
							src={boardPhoto}
							alt=""
							className="min-h-0 w-full flex-1 object-cover"
							style={{ filter: "saturate(0.86) contrast(1.04)" }}
						/>
						<figcaption className="mt-2.5 text-[11.5px] leading-[17px]" style={{ color: "var(--paper-dim)" }}>
							The table is laid at four, an hour before the first sitting.
						</figcaption>
					</figure>

					<div className="flex flex-col">
						<HoursList tone="paper" width={268} />
						<span className="mt-6 block h-px w-full" style={{ background: "var(--paper-ink)" }} />
						<p className="mt-4 text-[13px] leading-[21px]" style={{ color: "var(--paper-dim)" }}>
							Bookings open thirty days ahead. Larger tables are arranged in the room, and the kitchen
							works around allergies when it knows about them.
						</p>
						<div className="mt-6">
							<SolidButton className="text-[13.5px]" height={44} full tone="paper">
								Book a table
							</SolidButton>
						</div>
						<p className="mt-auto text-[12.5px] leading-[19px]" style={{ color: "var(--paper-dim)" }}>
							{ADDRESS}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---- home--playful: the type is the whole design ---- */

export function HomePlayful() {
	return (
		<div
			className="brs relative overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "#f2ddbe", color: "#231007" }}
		>
			<BrasaType />
			<Grain opacity={0.2} blend="multiply" />

			<div className="relative flex h-[92px] items-center justify-between px-12">
				<span className="pop text-[17px] leading-none" style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
					BRASA
				</span>
				<span className="flex items-center gap-2.5">
					{["Menu", "Hours", "Find us"].map((item) => (
						<span
							key={item}
							className="pop flex h-10 cursor-pointer items-center rounded-full px-5 text-[13.5px] leading-none"
							style={{ background: "#e7cda6", fontWeight: 600 }}
						>
							{item}
						</span>
					))}
					<span
						className="pop flex h-10 cursor-pointer items-center rounded-full px-5 text-[13.5px] leading-none"
						style={{ background: "#d78419", color: "#fdf0dd", fontWeight: 600 }}
					>
						Book a table
					</span>
				</span>
			</div>

			<div
				className="pop absolute left-[-44px] whitespace-nowrap"
				style={{
					top: 152,
					fontSize: 330,
					lineHeight: 0.78,
					fontWeight: 800,
					letterSpacing: "-0.048em",
					color: "#d78419",
				}}
			>
				BRASA
			</div>

			<div className="absolute right-12 left-12" style={{ top: 452 }}>
				<span aria-hidden="true" className="block h-[3px] w-full" style={{ background: "#231007" }} />
				<div className="mt-4 flex items-center justify-between">
					{["Wood fire", "Twenty-four seats", "Two sittings", "Södermalm"].map((word) => (
						<span key={word} className="pop text-[22px] leading-none" style={{ fontWeight: 600 }}>
							{word}
						</span>
					))}
				</div>
			</div>

			<div
				className="absolute flex items-center justify-center rounded-full"
				style={{
					right: 74,
					top: 176,
					width: 176,
					height: 176,
					background: "#231007",
					transform: "rotate(-12deg)",
				}}
			>
				<span className="flex flex-col items-center gap-1" style={{ color: "#f2ddbe" }}>
					<span className="pop num text-[27px] leading-none" style={{ fontWeight: 800 }}>
						17:30
					</span>
					<span className="pop num text-[27px] leading-none" style={{ fontWeight: 800 }}>
						20:30
					</span>
					<span className="pop mt-1 text-[11px] leading-none" style={{ fontWeight: 600 }}>
						two sittings
					</span>
				</span>
			</div>

			<div className="absolute right-12 bottom-11 left-12 flex items-end gap-8">
				<div
					className="flex flex-1 flex-col justify-between rounded-[22px] p-9"
					style={{ height: 300, background: "#231007", color: "#f7e6cc" }}
				>
					<p className="pop text-[36px] leading-[1.12]" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
						Six courses over open fire, written each morning and served twice a night.
					</p>
					<div className="flex items-end justify-between gap-8">
						<p className="max-w-[430px] text-[14px] leading-[22px]" style={{ color: "#c39a72" }}>
							The room holds twenty-four, so a table booked is a table kept. Bookings open thirty days
							ahead and the kitchen works around allergies when it knows about them.
						</p>
						<span className="pop shrink-0 text-[14px]" style={{ color: "#f7e6cc", fontWeight: 600 }}>
							{ADDRESS}
						</span>
					</div>
				</div>
				<div
					className="flex flex-col justify-between rounded-[22px] p-8"
					style={{ width: 386, height: 300, background: "#e7cda6" }}
				>
					{HOURS.map((h) => (
						<span key={h.days} className="flex items-baseline justify-between">
							<span className="pop text-[15px] leading-none" style={{ fontWeight: 600 }}>
								{h.days.replace("Tuesday to Thursday", "Tue to Thu").replace("Friday and Saturday", "Fri and Sat").replace("Sunday and Monday", "Sun and Mon")}
							</span>
							<span className="pop num text-[15px] leading-none" style={{ color: "#8b5a33", fontWeight: 600 }}>
								{h.time}
							</span>
						</span>
					))}
					<span className="pop text-[13px] leading-[19px]" style={{ color: "#8b5a33" }}>
						The fire is lit at two. Everything after that is timing.
					</span>
				</div>
			</div>
		</div>
	);
}

/* ---- home--classic: centred, ruled, and quiet ---- */

export function HomeClassic() {
	return (
		<div
			className="brs relative flex flex-col items-center overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "#f6f3ec", color: "#1a1714" }}
		>
			<BrasaType />
			<Grain opacity={0.13} blend="multiply" />

			<div className="relative flex w-full items-center justify-between px-16 pt-10">
				<span className="text-[11.5px] tracking-[0.22em]" style={{ color: "#6f675d" }}>
					SÖDERMALM
				</span>
				<span className="text-[11.5px] tracking-[0.22em]" style={{ color: "#6f675d" }}>
					SINCE 2019
				</span>
			</div>

			<div className="relative mt-9 flex flex-col items-center">
				<Flame className="h-[22px] w-[17px]" style={{ color: "#9a6b3c" }} />
				<span
					className="disp mt-4 text-[30px] leading-none tracking-[0.42em]"
					style={{ fontWeight: 500, paddingLeft: "0.42em" }}
				>
					BRASA
				</span>
			</div>

			<div className="relative mt-8 w-[1096px]">
				<span className="block h-px w-full" style={{ background: "#c9c1b4" }} />
				<span className="mt-[3px] block h-[2px] w-full" style={{ background: "#1a1714" }} />
			</div>

			<h1
				className="disp relative mt-10 max-w-[880px] text-center"
				style={{ fontSize: 50, lineHeight: 1.12, fontWeight: 400, letterSpacing: "-0.012em" }}
			>
				Everything here has been over the fire.
			</h1>
			<p className="relative mt-5 max-w-[560px] text-center text-[14.5px] leading-[25px]" style={{ color: "#5d564d" }}>
				Twenty-four seats, one long room, six courses. The kitchen writes the menu each morning and cooks all
				of it over wood.
			</p>

			<div className="relative mt-10 h-[298px] w-[1096px] overflow-hidden">
				<img
					src={silverPhoto}
					alt=""
					className="h-full w-full object-cover"
					style={{ objectPosition: "50% 46%", filter: "grayscale(1) contrast(1.06) brightness(1.04)" }}
				/>
			</div>

			<div className="relative mt-9 grid w-[1096px] grid-cols-3">
				{HOURS.map((h, i) => (
					<div
						key={h.days}
						className="flex flex-col items-center gap-2 px-6"
						style={{ borderLeft: i === 0 ? "none" : "1px solid #d6cfc3" }}
					>
						<span className="text-[11px] tracking-[0.2em]" style={{ color: "#6f675d" }}>
							{h.days.toUpperCase()}
						</span>
						<span className="disp num text-[19px] leading-none" style={{ fontWeight: 400 }}>
							{h.time}
						</span>
					</div>
				))}
			</div>

			<div className="relative mt-9 flex items-center gap-7">
				<span
					className="flex h-[46px] cursor-pointer items-center px-8 text-[13px] tracking-[0.14em]"
					style={{ background: "#1a1714", color: "#f6f3ec" }}
				>
					BOOK A TABLE
				</span>
				<span className="text-[13px]" style={{ color: "#6f675d" }}>
					{ADDRESS}
				</span>
			</div>
		</div>
	);
}

/* ---- menu ---- */

interface Course {
	numeral: string;
	name: string;
	note: string;
	price: string;
}

const COURSES: readonly Course[] = [
	{
		numeral: "I",
		name: "Fire bread, cultured butter",
		note: "Baked straight in the ash, brushed with last week’s whey.",
		price: "95",
	},
	{
		numeral: "II",
		name: "Oysters, burnt apple, dill",
		note: "Three from the west coast, thirty seconds over the coals.",
		price: "145",
	},
	{
		numeral: "III",
		name: "Cabbage in its own leaves",
		note: "Two hours in the embers, then vinegar and brown butter.",
		price: "165",
	},
	{
		numeral: "IV",
		name: "Pike-perch over birch",
		note: "Whole fish, split at the pass and salted at noon.",
		price: "265",
	},
	{
		numeral: "V",
		name: "Ox rib, three days over oak",
		note: "Carved at the table. Enough for everyone sitting at it.",
		price: "340",
	},
	{
		numeral: "VI",
		name: "Burnt cream, sea buckthorn",
		note: "The oven’s last heat does most of the work.",
		price: "120",
	},
];

export function MenuScreen() {
	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "var(--ink)", color: "var(--cream)" }}
		>
			<BrasaType />
			<Hearth
				style={{
					background:
						"radial-gradient(52% 46% at 6% 16%, rgba(224,100,43,0.13), rgba(224,100,43,0) 70%), radial-gradient(40% 38% at 44% 96%, rgba(234,185,108,0.08), rgba(234,185,108,0) 70%)",
				}}
			/>
			<Grain />
			<BrasaBar page="menu" />
			<div className="relative flex min-h-0 flex-1">
				<div className="flex min-w-0 flex-1 flex-col py-[44px] pr-14 pl-[72px]">
					<h1 className="disp" style={{ fontSize: 50, lineHeight: 1.04, fontWeight: 300, letterSpacing: "-0.026em" }}>
						Six courses, written
						<br />
						this morning.
					</h1>
					<p className="mt-4 max-w-[520px] text-[15px] leading-[26px]" style={{ color: "var(--dim)" }}>
						One menu for the whole room, 795 kr. It changes when the market and the fire change, which is
						most days.
					</p>

					<div className="mt-7">
						{COURSES.map((c) => (
							<div key={c.numeral}>
								<Rule />
								<div className="flex items-start gap-6 py-[11px]">
									<span
										className="disp w-[34px] shrink-0 pt-[3px] text-[13px] leading-none tracking-[0.08em]"
										style={{ color: "var(--gold)" }}
									>
										{c.numeral}
									</span>
									<span className="min-w-0 flex-1">
										<span
											className="disp block text-[21px] leading-[1.2]"
											style={{ fontWeight: 400, letterSpacing: "-0.012em" }}
										>
											{c.name}
										</span>
										<span
											className="mt-1 block max-w-[420px] text-[13px] leading-[19px]"
											style={{ color: "var(--faint)" }}
										>
											{c.note}
										</span>
									</span>
									<span className="num shrink-0 pt-[5px] text-[14px]" style={{ color: "var(--dim)" }}>
										{c.price}
									</span>
								</div>
							</div>
						))}
						<Rule />
					</div>

					<p
						className="ed mt-6 max-w-[560px] text-[26px] leading-[1.34] italic"
						style={{ color: "var(--gold)" }}
					>
						“The fire is lit at two. Everything after that is timing.”
					</p>

					<div className="mt-auto flex items-baseline gap-8 pt-6">
						<span className="num text-[13px]" style={{ color: "var(--dim)" }}>
							Wine pairing 545
						</span>
						<span className="num text-[13px]" style={{ color: "var(--dim)" }}>
							Juice pairing 295
						</span>
						<span className="text-[13px]" style={{ color: "var(--faint)" }}>
							Tell us about allergies when you book and the kitchen works around them.
						</span>
					</div>
				</div>
				<Photo
					src={boardPhoto}
					className="w-[476px] shrink-0"
					position="52% 50%"
					scrim="linear-gradient(90deg, var(--ink) 0%, rgba(13,9,8,0.62) 24%, rgba(13,9,8,0.14) 58%, rgba(13,9,8,0.40) 100%)"
					tint="radial-gradient(84% 66% at 60% 74%, rgba(224,100,43,0.22), rgba(13,9,8,0) 60%)"
				/>
			</div>
		</div>
	);
}

/* ---- reserve, and the state after it ---- */

const DAYS: readonly { day: string; date: string; closed?: boolean }[] = [
	{ day: "Wed", date: "10" },
	{ day: "Thu", date: "11" },
	{ day: "Fri", date: "12" },
	{ day: "Sat", date: "13" },
	{ day: "Sun", date: "14", closed: true },
	{ day: "Mon", date: "15", closed: true },
	{ day: "Tue", date: "16" },
];

const SITTINGS = ["17:30", "20:30"] as const;
const PARTY = ["1", "2", "3", "4", "5", "6"] as const;

function FieldLabel({ children }: { children: string }) {
	return (
		<span className="block text-[12.5px] leading-none" style={{ color: "var(--faint)" }}>
			{children}
		</span>
	);
}

function DayPill({
	day,
	date,
	on,
	closed = false,
	width = 84,
	height = 68,
}: {
	day: string;
	date: string;
	on: boolean;
	closed?: boolean;
	width?: number;
	height?: number;
}) {
	return (
		<span
			className="flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border transition-colors duration-200"
			style={{
				width,
				height,
				borderColor: on ? "var(--gold)" : "var(--line)",
				background: on ? "rgba(234,185,108,0.10)" : "transparent",
				opacity: closed ? 0.34 : 1,
			}}
		>
			<span className="text-[11.5px] leading-none" style={{ color: on ? "var(--gold)" : "var(--faint)" }}>
				{day}
			</span>
			<span
				className="disp num text-[19px] leading-none"
				style={{ fontWeight: 400, color: on ? "var(--cream)" : closed ? "var(--faint)" : "var(--dim)" }}
			>
				{closed ? "–" : date}
			</span>
		</span>
	);
}

function ChoicePill({
	label,
	on,
	width,
	height = 46,
}: {
	label: string;
	on: boolean;
	width?: number;
	height?: number;
}) {
	return (
		<span
			className="num flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-[14px] leading-none transition-colors duration-200"
			style={{
				width,
				height,
				borderColor: on ? "var(--gold)" : "var(--line)",
				background: on ? "rgba(234,185,108,0.10)" : "transparent",
				color: on ? "var(--cream)" : "var(--dim)",
			}}
		>
			{label}
		</span>
	);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<Rule />
			<div className="flex items-baseline justify-between py-3">
				<span className="text-[13px]" style={{ color: "var(--faint)" }}>
					{label}
				</span>
				<span className="num text-[14px]" style={{ color: "var(--cream)" }}>
					{value}
				</span>
			</div>
		</div>
	);
}

export function ReserveScreen({ confirmed = false }: { confirmed?: boolean }) {
	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: APP_W, height: APP_H, background: "var(--ink)", color: "var(--cream)" }}
		>
			<BrasaType />
			<Hearth />
			<Grain />
			<BrasaBar page="hours" />
			<div className="relative flex min-h-0 flex-1">
				<div className="relative w-[544px] shrink-0">
					<div className="absolute inset-0" style={{ filter: "saturate(0.68) brightness(0.82)" }}>
						<Photo
							src={bokehPhoto}
							className="h-full w-full"
							position="50% 46%"
							scrim="linear-gradient(180deg, rgba(13,9,8,0.52) 0%, rgba(13,9,8,0.34) 38%, rgba(13,9,8,0.95) 100%)"
							tint="radial-gradient(68% 54% at 42% 32%, rgba(234,185,108,0.14), rgba(13,9,8,0) 64%)"
						/>
					</div>
					<div className="absolute right-12 bottom-12 left-12">
						<span
							className="disp block text-[34px] leading-[1.16]"
							style={{ fontWeight: 300, letterSpacing: "-0.02em" }}
						>
							Two sittings
							<br />
							a night.
						</span>
						<span className="mt-4 block text-[14px] leading-[23px]" style={{ color: "var(--dim)" }}>
							17:30 and 20:30, Tuesday to Saturday. The room holds twenty-four, so a table booked is a
							table kept.
						</span>
					</div>
				</div>

				<div className="flex min-w-0 flex-1 flex-col px-[76px] py-[54px]">
					{confirmed ? (
						<>
							<Flame className="h-[26px] w-[20px]" style={{ color: "var(--gold)" }} />
							<h1
								className="disp mt-6"
								style={{ fontSize: 52, lineHeight: 1.06, fontWeight: 300, letterSpacing: "-0.028em" }}
							>
								Your table
								<br />
								is held.
							</h1>
							<p className="mt-6 max-w-[440px] text-[15px] leading-[26px]" style={{ color: "var(--dim)" }}>
								Saturday 13 September at 20:30, for two. Come in from Hökens gata, the door with the
								lamp over it.
							</p>
							<div className="mt-9 max-w-[520px]">
								<SummaryRow label="Name" value="Vera Lindqvist" />
								<SummaryRow label="Date" value="Saturday 13 September" />
								<SummaryRow label="Sitting" value="20:30" />
								<SummaryRow label="Guests" value="2" />
								<SummaryRow label="Reference" value="BRS 4180" />
								<Rule />
							</div>
							<div className="mt-9 flex items-center gap-8">
								<SolidButton className="text-[14px]">Add to calendar</SolidButton>
								<QuietLink>Change the booking</QuietLink>
							</div>
							<span className="mt-auto text-[12.5px]" style={{ color: "var(--faint)" }}>
								We hold the table fifteen minutes past the sitting.
							</span>
						</>
					) : (
						<>
							<h1
								className="disp"
								style={{ fontSize: 52, lineHeight: 1.06, fontWeight: 300, letterSpacing: "-0.028em" }}
							>
								Book a table
							</h1>
							<p className="mt-4 max-w-[420px] text-[15px] leading-[26px]" style={{ color: "var(--dim)" }}>
								Up to six guests online. Larger tables are arranged in the room.
							</p>

							<div className="mt-9">
								<FieldLabel>Date</FieldLabel>
								<div className="mt-3 flex gap-2.5">
									{DAYS.map((d) => (
										<DayPill
											key={d.date}
											day={d.day}
											date={d.date}
											on={d.date === "13"}
											closed={d.closed === true}
										/>
									))}
								</div>
							</div>

							<div className="mt-7 flex gap-12">
								<div>
									<FieldLabel>Sitting</FieldLabel>
									<div className="mt-3 flex gap-2.5">
										{SITTINGS.map((s) => (
											<ChoicePill key={s} label={s} on={s === "20:30"} width={104} />
										))}
									</div>
								</div>
								<div>
									<FieldLabel>Guests</FieldLabel>
									<div className="mt-3 flex gap-2.5">
										{PARTY.map((p) => (
											<ChoicePill key={p} label={p} on={p === "2"} width={46} />
										))}
									</div>
								</div>
							</div>

							<div className="mt-7 max-w-[520px]">
								<FieldLabel>Name</FieldLabel>
								<div
									className="mt-3 flex h-[46px] items-center border-b text-[15px]"
									style={{ borderColor: "var(--line-2)", color: "var(--cream)" }}
								>
									Vera Lindqvist
								</div>
							</div>

							<div className="mt-9 flex items-center gap-7">
								<SolidButton className="text-[14px]" height={52}>
									Confirm the table
								</SolidButton>
								<span className="text-[12.5px]" style={{ color: "var(--faint)" }}>
									We hold the table fifteen minutes past the sitting.
								</span>
							</div>

							<div className="mt-auto grid grid-cols-3 gap-10 pt-10">
								{[
									{ head: "Six courses", note: "795 kr, written each morning and cooked over wood." },
									{ head: "One room", note: "Twenty-four seats, two sittings, no second dining room." },
									{ head: "Thirty days", note: "How far ahead the book opens. Larger tables by the door." },
								].map((f) => (
									<div key={f.head}>
										<Rule />
										<span
											className="disp mt-3 block text-[17px] leading-none"
											style={{ fontWeight: 400 }}
										>
											{f.head}
										</span>
										<span
											className="mt-2 block text-[12.5px] leading-[19px]"
											style={{ color: "var(--faint)" }}
										>
											{f.note}
										</span>
									</div>
								))}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

/* ---- reserve-card: the booking card, and the live frame on this page ---- */

const CARD_DAYS: readonly { day: string; date: string }[] = [
	{ day: "Thu", date: "11" },
	{ day: "Fri", date: "12" },
	{ day: "Sat", date: "13" },
	{ day: "Tue", date: "16" },
	{ day: "Wed", date: "17" },
];

const MONTH: Record<string, string> = {
	"11": "Thursday 11 September",
	"12": "Friday 12 September",
	"13": "Saturday 13 September",
	"16": "Tuesday 16 September",
	"17": "Wednesday 17 September",
};

/**
 * The frame in the first section is not a picture of a booking card, it is the
 * card. The dates pick, the guest count picks, the name field takes text, and
 * confirming shows the table Brasa is holding, which is the whole of what "the
 * frames run" means and cannot be said with a still.
 */
export function ReserveCardScreen() {
	const [date, setDate] = useState("13");
	const [sitting, setSitting] = useState<string>("20:30");
	const [guests, setGuests] = useState("2");
	const [name, setName] = useState("Vera Lindqvist");
	const [held, setHeld] = useState(false);

	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: CARD_W, height: CARD_H, background: "var(--ink)", color: "var(--cream)" }}
		>
			<BrasaType />
			<Hearth
				style={{
					background:
						"radial-gradient(70% 60% at 84% 6%, rgba(224,100,43,0.18), rgba(224,100,43,0) 68%), radial-gradient(60% 50% at 6% 100%, rgba(234,185,108,0.08), rgba(234,185,108,0) 70%)",
				}}
			/>
			<Grain opacity={0.11} />

			<div className="relative flex min-h-0 flex-1 flex-col px-[22px] py-[20px]">
				<div className="flex shrink-0 items-center justify-between">
					<span className="flex items-center gap-2.5">
						<Flame className="h-[15px] w-[12px]" style={{ color: "var(--gold)" }} />
						<span className="disp text-[17px] leading-none tracking-[0.015em]" style={{ fontWeight: 500 }}>
							Brasa
						</span>
					</span>
					<span className="text-[11.5px] leading-none" style={{ color: "var(--faint)" }}>
						{held ? "Confirmed" : "Up to six guests"}
					</span>
				</div>

				{held ? (
					<div className="mt-4 flex min-h-0 flex-1 flex-col">
						<span
							className="disp shrink-0 text-[26px] leading-[1.1]"
							style={{ fontWeight: 300, letterSpacing: "-0.024em" }}
						>
							Your table is held.
						</span>
						<span className="mt-2 shrink-0 text-[12.5px] leading-[20px]" style={{ color: "var(--dim)" }}>
							{MONTH[date]} at {sitting}. The door with the lamp on Hökens gata.
						</span>
						<div className="mt-3.5">
							<SummaryRow label="Name" value={name.trim() === "" ? "No name given" : name} />
							<SummaryRow label="Sitting" value={sitting} />
							<SummaryRow label="Guests" value={guests} />
							<SummaryRow label="Reference" value="BRS 4180" />
							<Rule />
						</div>
						<button
							type="button"
							onClick={() => setHeld(false)}
							className="mt-auto cursor-pointer self-start border-b pb-1 text-[12.5px] leading-none transition-colors duration-200"
							style={{ color: "var(--dim)", borderColor: "var(--line)" }}
						>
							Book another table
						</button>
					</div>
				) : (
					<div className="mt-3.5 flex min-h-0 flex-1 flex-col">
						<div className="flex shrink-0 gap-2">
							{CARD_DAYS.map((d) => (
								<button
									key={d.date}
									type="button"
									onClick={() => setDate(d.date)}
									className="cursor-pointer border-none bg-transparent p-0"
								>
									<DayPill day={d.day} date={d.date} on={d.date === date} width={76} height={62} />
								</button>
							))}
						</div>

						<div className="mt-3 flex shrink-0 gap-2">
							{SITTINGS.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => setSitting(s)}
									className="flex-1 cursor-pointer border-none bg-transparent p-0"
								>
									<ChoicePill label={s} on={s === sitting} height={40} width={202} />
								</button>
							))}
						</div>

						<div className="mt-3 flex shrink-0 items-center gap-2.5">
							<span className="w-[46px] shrink-0 text-[12px] leading-none" style={{ color: "var(--faint)" }}>
								Guests
							</span>
							{PARTY.map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => setGuests(p)}
									className="cursor-pointer border-none bg-transparent p-0"
								>
									<ChoicePill label={p} on={p === guests} width={38} height={36} />
								</button>
							))}
						</div>

						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							spellCheck={false}
							aria-label="Name"
							placeholder="Your name"
							className="mt-4 h-[42px] w-full shrink-0 border-b bg-transparent text-[14px] outline-none transition-colors duration-200 focus:border-[var(--gold)]"
							style={{ borderColor: "var(--line-2)", color: "var(--cream)" }}
						/>

						<span className="mt-auto mb-3 block text-[11.5px] leading-[17px]" style={{ color: "var(--faint)" }}>
							{MONTH[date]} at {sitting}, for {guests}. We hold the table fifteen minutes.
						</span>
						<SolidButton className="text-[13.5px]" height={44} full onClick={() => setHeld(true)}>
							Confirm the table
						</SolidButton>
					</div>
				)}
			</div>
		</div>
	);
}

/* ---- book: the same reservation on a phone ---- */

export function PhoneBookScreen() {
	return (
		<div
			className="brs relative flex flex-col overflow-hidden"
			style={{ width: PHONE_W, height: PHONE_H, background: "var(--ink)", color: "var(--cream)" }}
		>
			<BrasaType />
			<div className="relative h-[286px] shrink-0">
				<Photo
					src={candlePhoto}
					className="h-full w-full"
					position="50% 48%"
					scrim="linear-gradient(180deg, rgba(13,9,8,0.42) 0%, rgba(13,9,8,0.18) 46%, var(--ink) 100%)"
					tint="radial-gradient(46% 40% at 50% 46%, rgba(234,150,60,0.30), rgba(13,9,8,0) 66%)"
				/>
				<div className="absolute top-[26px] right-6 left-6 flex items-center justify-between">
					<span className="flex items-center gap-2.5">
						<Flame className="h-[16px] w-[13px]" style={{ color: "var(--gold)" }} />
						<span className="disp text-[19px] leading-none tracking-[0.015em]" style={{ fontWeight: 500 }}>
							Brasa
						</span>
					</span>
					<span className="text-[12px] leading-none" style={{ color: "var(--dim)" }}>
						Menu
					</span>
				</div>
				<div className="absolute right-6 bottom-7 left-6">
					<span
						className="disp block text-[34px] leading-[1.1]"
						style={{ fontWeight: 300, letterSpacing: "-0.026em" }}
					>
						Book a table
					</span>
					<span className="mt-2.5 block text-[13.5px] leading-[21px]" style={{ color: "var(--dim)" }}>
						Two sittings a night, at 17:30 and at 20:30.
					</span>
				</div>
			</div>

			<div className="relative flex min-h-0 flex-1 flex-col px-6 pt-7 pb-9">
				<Grain opacity={0.1} />
				<FieldLabel>Date</FieldLabel>
				<div className="relative mt-3 flex gap-2.5">
					{CARD_DAYS.slice(0, 4).map((d) => (
						<DayPill key={d.date} day={d.day} date={d.date} on={d.date === "13"} width={78} height={72} />
					))}
				</div>

				<div className="relative mt-6">
					<FieldLabel>Sitting</FieldLabel>
					<div className="mt-3 flex gap-2.5">
						{SITTINGS.map((s) => (
							<ChoicePill key={s} label={s} on={s === "20:30"} width={165} height={48} />
						))}
					</div>
				</div>

				<div className="relative mt-6">
					<FieldLabel>Guests</FieldLabel>
					<div className="mt-3 flex gap-2.5">
						{PARTY.map((p) => (
							<ChoicePill key={p} label={p} on={p === "2"} width={48} height={48} />
						))}
					</div>
				</div>

				<div className="relative mt-6">
					<FieldLabel>Name</FieldLabel>
					<div
						className="mt-3 flex h-[48px] items-center border-b text-[15px]"
						style={{ borderColor: "var(--line-2)", color: "var(--cream)" }}
					>
						Vera Lindqvist
					</div>
				</div>

				<SolidButton className="relative mt-auto text-[14.5px]" height={54} full>
					Confirm the table
				</SolidButton>
				<span className="relative mt-4 text-center text-[12px]" style={{ color: "var(--faint)" }}>
					We hold the table fifteen minutes past the sitting.
				</span>
			</div>
		</div>
	);
}

/* ---------- spool's own chrome ---------- */

const BAR_H = 44;
const RAIL_W = 248;
const STRIP_W = 44;
/** the shipped window this page is a screenshot of */
const STAGE_W = 1440;
const STAGE_H = 620;
const FIELD_W = STAGE_W - RAIL_W - STRIP_W;
const FIELD_H = STAGE_H - BAR_H;

/** shellRadius at 1:1, from canvas.tsx */
const SHELL_RADIUS = 12;
/** overlays.tsx: min(12, shellRadius * k) + 2, which is 14 at every usable zoom */
const RING_RADIUS = 14;
/** frame-label.tsx: the label's own pb-2.5 */
const LABEL_GAP = 10;
const LABEL_H = 16;

/** frame-label.tsx, whole: the name, the unseen mark, and play on the selection. */
export function FrameLabel({
	name,
	width,
	selected = false,
	unseen,
}: {
	name: string;
	width: number;
	selected?: boolean;
	unseen?: "new" | "changed";
}) {
	return (
		<div className="flex min-w-0 items-center gap-1.5 pb-2.5" style={{ width }}>
			{unseen === undefined ? null : <UnseenMark mark={unseen} className="-ml-0.5" />}
			<span
				className={cn(
					"min-w-0 truncate text-sm leading-4",
					MONO,
					selected ? "text-thread" : unseen === undefined ? "text-muted" : "text-text",
				)}
			>
				{name}
			</span>
			{selected ? (
				<span
					className={cn(
						"ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 text-2xs text-muted leading-3",
						MONO,
					)}
				>
					<PlayTri className="h-2 w-2" />
					play
				</span>
			) : null}
		</div>
	);
}

/** overlays.tsx: the ring, its four handles, and the size chip under it. */
function SelectionRing({ w, h, size = true }: { w: number; h: number; size?: boolean }) {
	const handle = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<div className="pointer-events-none absolute inset-0">
			<div
				className="-inset-[3px] absolute border-[1.5px] border-thread"
				style={{ borderRadius: RING_RADIUS }}
			/>
			<span className={cn(handle, "-left-[7px] -top-[7px]")} />
			<span className={cn(handle, "-right-[7px] -top-[7px]")} />
			<span className={cn(handle, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(handle, "-right-[7px] -bottom-[7px]")} />
			{size ? (
				<span
					className={cn(
						"-translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] text-2xs text-on-thread leading-3",
						MONO,
					)}
					style={{ top: "calc(100% + 14px)" }}
				>
					{w} × {h}
				</span>
			) : null}
		</div>
	);
}

/**
 * One frame standing on the field: its label above, the document rounded at
 * shellRadius with no border of its own, and the ring when it is the selection.
 * `k` is the camera's zoom: the document scales, the label and the ring do not,
 * which is what the canvas does.
 */
export function FieldFrame({
	name,
	x,
	y,
	dw,
	dh,
	k = 1,
	selected = false,
	size = true,
	unseen,
	children,
}: {
	name: string;
	x: number;
	y: number;
	/** the document's own size, which is what the size chip reports */
	dw: number;
	dh: number;
	k?: number;
	selected?: boolean;
	size?: boolean;
	unseen?: "new" | "changed";
	children: ReactNode;
}) {
	const w = dw * k;
	const h = dh * k;
	return (
		<div className="absolute" style={{ left: x, top: y - LABEL_H - LABEL_GAP }}>
			<FrameLabel
				name={name}
				width={w}
				selected={selected}
				{...(unseen === undefined ? {} : { unseen })}
			/>
			<div className="relative" style={{ width: w, height: h }}>
				<div
					className="overflow-hidden"
					style={{
						width: dw,
						height: dh,
						transform: `scale(${k})`,
						transformOrigin: "top left",
						borderRadius: SHELL_RADIUS / k,
					}}
				>
					{children}
				</div>
				{selected ? <SelectionRing w={dw} h={dh} size={size} /> : null}
			</div>
		</div>
	);
}

/**
 * flow-arrows.tsx's cubic, its constants included: tangents leave perpendicular
 * to the side they touch and bow with distance, never under 40.
 */
export function ThreadArrow({
	x1,
	y1,
	x2,
	y2,
	w,
	h,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	w: number;
	h: number;
}) {
	const end = x2 - 10;
	const bow = Math.max(40, Math.hypot(end - x1, y2 - y1) * 0.4);
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			fill="none"
		>
			<path
				d={`M ${x1} ${y1} C ${x1 + bow} ${y1}, ${end - bow} ${y2}, ${end} ${y2}`}
				stroke="var(--color-thread)"
				strokeWidth={1.5}
			/>
			<path d={`M ${x2} ${y2} L ${end} ${y2 - 4.5} L ${end} ${y2 + 4.5} Z`} fill="var(--color-thread)" />
		</svg>
	);
}

/** app.tsx: the header, the tab strip in it, and the zoom read-out. */
function AppBar({ width }: { width: number }) {
	return (
		<div
			className="absolute top-0 left-0 flex items-center justify-between border-border border-b bg-bg px-4"
			style={{ width, height: BAR_H }}
		>
			<div className="flex h-full items-center gap-5">
				<span className="flex items-center gap-2">
					<SpoolMark className="h-[18px] w-3.5 text-thread" />
					<span className="font-semibold text-md text-text leading-sm tracking-tight">spool</span>
				</span>
				<nav className="relative flex items-center gap-unit">
					{["brasa", "spool"].map((tab, i) => (
						<span
							key={tab}
							className={cn(
								"flex h-[26px] items-center rounded-md",
								i === 0 && "border border-border-raised bg-raised",
							)}
						>
							<span
								className={cn(
									"flex h-full items-center pr-1 pl-3 text-base leading-none",
									i === 0 ? "font-medium text-text" : "text-muted",
								)}
							>
								{tab}
							</span>
						</span>
					))}
					<span className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted">
						<PlusIcon className="h-2.5 w-2.5" />
					</span>
				</nav>
			</div>
			<div className="flex h-full items-center gap-4">
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
					<EdgeIcon />
				</span>
				<span className={cn("min-w-9 text-right text-muted text-xs leading-xs", MONO)}>24%</span>
			</div>
		</div>
	);
}

/* sidebar.tsx + rail-rows.ts */
const PAGE_ROW = 32;
const FRAME_ROW = 28;
const INDENT = 10;
const contentX = (depth: number) => depth * INDENT + 24;
const guideX = (depth: number) => (depth - 1) * INDENT + 18;

interface RailPage {
	name: string;
	frames: readonly { name: string; unseen?: "new" | "changed" }[];
	open?: boolean;
	active?: boolean;
	total: number;
}

const RAIL_PAGES: readonly RailPage[] = [
	{
		name: "brasa",
		open: true,
		active: true,
		total: 10,
		frames: [
			{ name: "book" },
			{ name: "home" },
			{ name: "home--candlelit", unseen: "new" },
			{ name: "home--classic" },
			{ name: "home--editorial" },
			{ name: "home--playful" },
			{ name: "menu" },
			{ name: "reserve" },
			{ name: "reserve--confirmed" },
			{ name: "reserve-card" },
		],
	},
	{ name: "emails", frames: [], total: 4 },
	{ name: "print", frames: [], total: 2 },
];

function PagesRail({ height, selected }: { height: number; selected: string }) {
	return (
		<div
			className="absolute left-0 flex flex-col border-border border-r bg-bg"
			style={{ top: BAR_H, width: RAIL_W, height }}
		>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<span className="font-semibold text-base leading-base">Pages</span>
					<span className={cn("text-muted text-xs leading-xs", MONO)}>{RAIL_PAGES.length}</span>
				</div>
				<div className="flex items-center">
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PlusIcon className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<FoldIcon className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{RAIL_PAGES.map((page) => (
					<div key={page.name}>
						<div
							className={cn(
								"relative flex items-center pr-1.5",
								page.active === true && "bg-surface",
							)}
							style={{ height: PAGE_ROW }}
						>
							{page.active === true ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<span className="flex h-full w-6 shrink-0 items-center justify-center">
								<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
							</span>
							<span className="flex h-full min-w-0 flex-1 items-center gap-2 pr-3">
								<FolderIcon
									className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
								/>
								<span
									className={cn(
										"min-w-0 flex-1 truncate text-sm leading-sm",
										MONO,
										page.active === true ? "text-text" : "text-muted",
									)}
								>
									{page.name}
								</span>
							</span>
							<span className={cn("shrink-0 text-2xs text-muted/60 leading-3", MONO)}>{page.total}</span>
						</div>
						{page.open === true
							? page.frames.map((frame, i) => {
									const last = i === page.frames.length - 1;
									const isSelected = frame.name === selected;
									return (
										<div
											key={frame.name}
											className={cn("relative flex items-center", isSelected && "bg-surface")}
											style={{ height: FRAME_ROW }}
										>
											<span
												className="absolute w-px bg-border-raised"
												style={{ left: guideX(1), top: 0, height: last ? FRAME_ROW - 6 : FRAME_ROW }}
											/>
											<span
												className="absolute h-px w-2.5 bg-border-raised"
												style={{ left: guideX(1), top: FRAME_ROW / 2 }}
											/>
											<span
												className="flex h-full w-full min-w-0 items-center gap-2 pr-3"
												style={{ paddingLeft: contentX(1) }}
											>
												<FrameIcon
													className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-thread" : "text-muted")}
												/>
												<span
													className={cn(
														"min-w-0 flex-1 truncate text-xs leading-xs",
														MONO,
														isSelected || frame.unseen !== undefined ? "text-text" : "text-muted",
													)}
												>
													{frame.name}
												</span>
												{frame.unseen === undefined ? null : <UnseenMark mark={frame.unseen} />}
											</span>
										</div>
									);
								})
							: null}
					</div>
				))}
			</div>
			<div
				className={cn(
					"flex h-9 shrink-0 items-center justify-between border-border border-t px-3.5 text-2xs text-muted leading-3",
					MONO,
				)}
			>
				<span>folder switches page</span>
			</div>
		</div>
	);
}

/** dock.tsx: the column's index, 44 wide, properties over agent. */
function DockStrip({ left, top, height }: { left: number; top: number; height: number }) {
	return (
		<div
			className="absolute flex flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
			style={{ left, top, width: STRIP_W, height }}
		>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<PropertiesIcon />
			</span>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<AgentIcon />
			</span>
		</div>
	);
}

/** canvas-tools.tsx: three tools, select held. */
function CanvasTools() {
	const tools = [
		{ id: "select", Icon: SelectIcon },
		{ id: "edit", Icon: EditIcon },
		{ id: "hand", Icon: HandIcon },
	];
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1">
				{tools.map((meta) => (
					<span
						key={meta.id}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
							meta.id === "select" ? "bg-raised text-text" : "text-muted",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}

/* ---------- the hero: the window, cropped like a screenshot ---------- */

/**
 * The camera sits at 24%, which is where the walk stands in one field: home,
 * reserve and the state after it across the top, the menu and the phone under
 * them. The confirmation is the third seat in the walk, so it is the one that
 * runs off the right edge, and how much of it a visitor sees depends on how wide
 * the plate is. A canvas that ends at the plate edge is a diagram; one that runs
 * off it is a screenshot.
 */
const HERO_K = 0.24;
const HERO_W = APP_W * HERO_K;
const HERO_H = APP_H * HERO_K;
const HERO_GAP = 42;

const HOME = { x: 36, y: 58 };
const RESERVE = { x: 36 + HERO_W + HERO_GAP, y: 58 };
const CONFIRMED = { x: 36 + (HERO_W + HERO_GAP) * 2, y: 58 };
const MENU = { x: 140, y: 58 + HERO_H + 62 };
/** clear of the tool bar the canvas floats at the bottom middle of the field */
const BOOK = { x: 700, y: 58 + HERO_H + 62 };

function CanvasField() {
	const mid = HERO_H / 2;
	return (
		<div
			className="absolute overflow-hidden bg-canvas"
			style={{ left: RAIL_W, top: BAR_H, width: FIELD_W, height: FIELD_H }}
		>
			<ThreadArrow
				x1={HOME.x + HERO_W}
				y1={HOME.y + mid}
				x2={RESERVE.x}
				y2={RESERVE.y + mid}
				w={FIELD_W}
				h={FIELD_H}
			/>
			<ThreadArrow
				x1={RESERVE.x + HERO_W}
				y1={RESERVE.y + mid}
				x2={CONFIRMED.x}
				y2={CONFIRMED.y + mid}
				w={FIELD_W}
				h={FIELD_H}
			/>
			<FieldFrame name="home" x={HOME.x} y={HOME.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<HomeScreen />
			</FieldFrame>
			<FieldFrame name="reserve" x={RESERVE.x} y={RESERVE.y} dw={APP_W} dh={APP_H} k={HERO_K} selected>
				<ReserveScreen />
			</FieldFrame>
			<FieldFrame name="reserve--confirmed" x={CONFIRMED.x} y={CONFIRMED.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<ReserveScreen confirmed />
			</FieldFrame>
			<FieldFrame name="menu" x={MENU.x} y={MENU.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<MenuScreen />
			</FieldFrame>
			<FieldFrame name="book" x={BOOK.x} y={BOOK.y} dw={PHONE_W} dh={PHONE_H} k={HERO_K}>
				<PhoneBookScreen />
			</FieldFrame>
			<CanvasTools />
		</div>
	);
}

export function CanvasPlate({ w, h, scale = 1 }: { w: number; h: number; scale?: number }) {
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
			>
				<CanvasField />
				<AppBar width={STAGE_W} />
				<PagesRail height={FIELD_H} selected="reserve" />
				<DockStrip left={STAGE_W - STRIP_W} top={BAR_H} height={FIELD_H} />
			</div>
		</div>
	);
}

/* ---------- section one: the running frame ---------- */

/** label + document + the 14px gap and the size chip under it */
const SELECTED_H = LABEL_H + LABEL_GAP + CARD_H + 30;

export function LivePlate({ w, h }: { w: number; h: number }) {
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }}>
			<FieldFrame
				name="reserve-card"
				x={(w - CARD_W) / 2}
				y={(h - SELECTED_H) / 2 + LABEL_H + LABEL_GAP}
				dw={CARD_W}
				dh={CARD_H}
				selected
			>
				<ReserveCardScreen />
			</FieldFrame>
		</div>
	);
}

/* ---------- section two: four takes at once ---------- */

const TAKES: readonly { name: string; Screen: () => ReactNode; kept?: boolean }[] = [
	{ name: "home--candlelit", Screen: HomeCandlelit, kept: true },
	{ name: "home--editorial", Screen: HomeEditorial },
	{ name: "home--playful", Screen: HomePlayful },
	{ name: "home--classic", Screen: HomeClassic },
];

export function TakesPlate({ w, h, k = 0.172 }: { w: number; h: number; k?: number }) {
	const cellW = APP_W * k;
	const cellH = APP_H * k + LABEL_H + LABEL_GAP;
	const gapX = 40;
	const gapY = 40;
	const x0 = (w - (cellW * 2 + gapX)) / 2;
	const y0 = (h - (cellH * 2 + gapY)) / 2 + LABEL_H + LABEL_GAP;
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			{TAKES.map((take, i) => (
				<FieldFrame
					key={take.name}
					name={take.name}
					x={x0 + (i % 2) * (cellW + gapX)}
					y={y0 + Math.floor(i / 2) * (cellH + gapY)}
					dw={APP_W}
					dh={APP_H}
					k={k}
					selected={take.kept === true}
					size={false}
				>
					<take.Screen />
				</FieldFrame>
			))}
		</div>
	);
}

/* ---------- section three: the folder ---------- */

interface TreeRow {
	depth: number;
	name: string;
	dir?: boolean;
	lit?: boolean;
}

const TREE: readonly TreeRow[] = [
	{ depth: 0, name: "brasa/", dir: true },
	{ depth: 1, name: "src/", dir: true },
	{ depth: 1, name: "design/", dir: true, lit: true },
	{ depth: 2, name: "frames/", dir: true },
	{ depth: 3, name: "brasa/", dir: true },
	{ depth: 4, name: "book/", dir: true },
	{ depth: 4, name: "home/", dir: true },
	{ depth: 4, name: "menu/", dir: true },
	{ depth: 4, name: "reserve/", dir: true },
	{ depth: 5, name: "frame.tsx", lit: true },
	{ depth: 5, name: "frame.json" },
	{ depth: 4, name: "reserve--confirmed/", dir: true },
	{ depth: 3, name: "emails/", dir: true },
	{ depth: 2, name: "shared/", dir: true },
	{ depth: 3, name: "tokens.css" },
	{ depth: 1, name: "package.json" },
];

/** brasa/reserve/frame.tsx, as it would really read: one component, one flow call out. */
const SOURCE: readonly { indent: number; text: string; dim?: boolean }[] = [
	{ indent: 0, text: 'import { ui } from "spool";', dim: true },
	{ indent: 0, text: "" },
	{ indent: 0, text: "export default function Reserve() {" },
	{ indent: 1, text: 'const [sitting, pick] = useState("20:30");' },
	{ indent: 1, text: "const [guests, set] = useState(2);" },
	{ indent: 1, text: "return (" },
	{ indent: 2, text: '<Page nav="reserve">' },
	{ indent: 3, text: "<Sittings picked={sitting}" },
	{ indent: 4, text: "onPick={pick} />" },
	{ indent: 3, text: "<Guests count={guests} onSet={set} />" },
	{ indent: 3, text: "<Confirm onDone={() =>" },
	{ indent: 4, text: 'ui.go("reserve--confirmed")} />' },
	{ indent: 2, text: "</Page>" },
	{ indent: 1, text: ");" },
	{ indent: 0, text: "}" },
];

export function RepoPlate({ w, h }: { w: number; h: number }) {
	return (
		<div className="relative flex overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<div className="w-[196px] shrink-0 border-border border-r py-4 pl-4">
				{TREE.map((r) => (
					<div
						key={r.depth + r.name}
						className={cn(
							"flex h-[22px] items-center gap-1.5 text-[10px] leading-none",
							MONO,
							r.lit === true ? "text-thread" : r.dir === true ? "text-muted" : "text-text/70",
						)}
						style={{ paddingLeft: r.depth * 10 }}
					>
						{r.dir === true ? (
							<FolderIcon className="h-[11px] w-[11px] shrink-0" />
						) : (
							<FrameIcon className="h-[11px] w-[11px] shrink-0" />
						)}
						<span className="truncate">{r.name}</span>
					</div>
				))}
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				<div
					className={cn(
						"flex h-[34px] shrink-0 items-center border-border border-b px-5 text-[10px] text-muted leading-none",
						MONO,
					)}
				>
					design/frames/brasa/reserve/frame.tsx
				</div>
				<div className="flex-1 px-5 py-4">
					{SOURCE.map((l, i) => (
						<div
							key={`l${i}`}
							className={cn(
								"h-[19px] whitespace-pre text-[10.5px] leading-[19px]",
								MONO,
								l.dim === true ? "text-muted/70" : "text-text/75",
							)}
						>
							{"  ".repeat(l.indent)}
							{l.text}
						</div>
					))}
				</div>
				<div
					className={cn(
						"flex h-[34px] shrink-0 items-center border-border border-t px-5 text-[10px] text-muted leading-none",
						MONO,
					)}
				>
					tracked by git · nothing leaves this machine
				</div>
			</div>
		</div>
	);
}

/* ---------- section four: what arrived, and what you do with it ---------- */

/**
 * A crop of the field beside the column's index: the frame the agent wrote while
 * the canvas was elsewhere, wearing the unseen mark and the ring you put on it,
 * with the thread you drew arriving from a frame off the left edge. Every mark
 * here is one the canvas draws.
 */
export function DirectPlate({ w, h, k = 0.33 }: { w: number; h: number; k?: number }) {
	const fw = APP_W * k;
	const fh = APP_H * k;
	const x = 18;
	// pulled up so the size chip clears the tool bar the canvas keeps at the bottom
	const y = (h - fh) / 2 - 16;
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<ThreadArrow x1={-46} y1={y + fh / 2} x2={x} y2={y + fh / 2} w={w} h={h} />
			<FieldFrame
				name="home--candlelit"
				x={x}
				y={y}
				dw={APP_W}
				dh={APP_H}
				k={k}
				selected
				unseen="new"
			>
				<HomeCandlelit />
			</FieldFrame>
			<DockStrip left={w - STRIP_W} top={0} height={h} />
			<CanvasTools />
		</div>
	);
}
