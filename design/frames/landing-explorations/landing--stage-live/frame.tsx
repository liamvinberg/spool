import {
	AnimatePresence,
	motion,
	type MotionValue,
	useReducedMotion,
	useScroll,
	useSpring,
	useTransform,
} from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen } from "../../../shared/ui/coffee-screens";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--stage-live — the answer to "is combining the stage, the live editing
 * and the fourth-wall reveal too many tricks?" It is not three tricks; it is one
 * scene. The stage is the scene, everything live happens inside it, and the
 * reveal is the page's quiet closing beat, driven by scroll rather than a button.
 *
 * Three layers, one world, one chrome vocabulary (thread rings, mono name tabs,
 * dashed thread arrows, hand-rolled cursors, dim wireframe ghosts):
 *
 *  1. The hero, verbatim in quality from landing--stage: statement, canonical
 *     subline, the install with its copy interaction, fine print.
 *  2. The stage: a real coffee app walked menu -> cart -> receipt. The three
 *     screens are the flow (sequential thread arrows, name tabs); the "walk" is
 *     the live selection ring travelling frame to frame on a seamless loop with
 *     a player pill. The screens are live: the cortado price is state, and the
 *     cart total is computed from it.
 *  3. The presence, INSIDE the stage only. On a long sparse timeline an
 *     "agent" cursor selects the menu frame (a measured thread ring hugs it,
 *     true px on hairlines) and retypes the cortado price; the change persists
 *     into the cart's math. Later a "you" cursor drags the receipt frame, snap
 *     guides flicker on the grid, and it springs home. Chrome fades fully
 *     between events. The landing around the stage is never edited.
 *
 * Then the closing beat: as the visitor scrolls past the stance quartet, the
 * whole page eases into a scroll-driven zoom-out — one wrapper, scale+translate
 * from scroll progress, fully reversible — and becomes a red-ringed frame named
 * "landing" on a dot-grid canvas, ringed by dim ghosts of the real exploration
 * set. One quiet caption. Scrolling back returns seamlessly into the page.
 *
 * Technique notes that keep it honest:
 *  - Presence chrome is measured in layout px via the offsetParent chain, never
 *    getBoundingClientRect — the wrapper is transform-scaled during the zoom and
 *    a visual box read as layout coords would strand the chrome (#53).
 *  - The zoom binds useScroll to our own scroll container; progress maps through
 *    function-form transforms (manual clamp; the options-object clamp silently
 *    fails) to scale/translate on one wrapper, smoothed by an overdamped spring.
 *  - Continuous motion is transform/opacity only. Boot pose (the ~300ms shot):
 *    scroll at top, stage on the menu leg, no presence chrome yet.
 */

/* ---------- surfaces + math ---------- */

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

const S_MIN = 0.32; // the page's scale at full zoom-out
const ZOOM_DIST = 840; // scroll px devoted to the closing zoom, beyond reading
const LEG_MS = 3400; // one walk leg: menu -> cart -> receipt

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// easeInOutCubic — firm, symmetric, no overshoot; paired with an overdamped
// spring it gives the zoom a soft arrival.
const easeInOut = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- *
 * Frames run in a null-origin sandboxed srcdoc, so the async Clipboard API can
 * reject outright — try it, then fall back to the hidden-textarea execCommand
 * path. Silent on both branches. */
async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">$</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</button>
	);
}

/* ---------- the live coffee screens: menu + cart carry a mutable price ---------- *
 * Faithful to shared/ui/coffee-screens.tsx ("design" scale) so the stage keeps
 * its diegetic light identity, but price-aware: the agent edits `priceStr` on
 * the menu and the cart total (= cortado + flat white) follows on the next leg.
 * The receipt has no price, so it stays the shared component verbatim. */

const FLAT_WHITE = 48;
const FILTER = 32;

function LiveMenu({ priceStr, caret }: { priceStr: string; caret: boolean }) {
	const rows = [
		{ name: "Cortado", price: `${priceStr} kr`, live: true },
		{ name: "Flat white", price: `${FLAT_WHITE} kr` },
		{ name: "Filterkaffe", price: `${FILTER} kr` },
	];
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] p-3.5 font-[Instrument_Sans] text-[#17171A]">
			<div className="flex flex-col gap-3.5">
				<div className="flex flex-col gap-0.5">
					<h1 className="text-[15px] font-semibold leading-[18px] tracking-tight">kaffe</h1>
					<p className="text-xs leading-[14px] text-[#86868B]">Torsgatan 11</p>
				</div>
				<div className="flex flex-col gap-2">
					{rows.map((r) => (
						<div key={r.name} className="flex items-center gap-2.5 rounded-md bg-[#EFEFF1] px-2.5 py-2">
							<span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#D9D9DE]" />
							<span className="min-w-0 flex-1 text-sm font-medium leading-[15px]">{r.name}</span>
							<span className="shrink-0 text-xs leading-[14px] text-[#86868B]">
								{r.live ? (
									<span className="inline-flex items-center">
										{r.price}
										{caret ? <PriceCaret /> : null}
									</span>
								) : (
									r.price
								)}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="min-h-3 flex-1" />
			<div className="flex h-[38px] shrink-0 items-center justify-center rounded-md bg-[#17171A] text-sm font-medium leading-none text-[#FEFEFE]">
				Till kassan
			</div>
		</div>
	);
}

function LiveCart({ price }: { price: number }) {
	const items = [
		{ name: "Cortado", price: `${price} kr` },
		{ name: "Flat white", price: `${FLAT_WHITE} kr` },
	];
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] p-3.5 font-[Instrument_Sans] text-[#17171A]">
			<div className="flex flex-col gap-3.5">
				<h1 className="text-[15px] font-semibold leading-[18px] tracking-tight">Din varukorg</h1>
				<div className="flex flex-col gap-2">
					{items.map((it) => (
						<div key={it.name} className="flex items-center justify-between rounded-md bg-[#EFEFF1] px-3 py-[9px]">
							<span className="text-sm font-medium leading-[15px]">1 × {it.name}</span>
							<span className="text-xs leading-[14px] text-[#86868B]">{it.price}</span>
						</div>
					))}
				</div>
			</div>
			<div className="min-h-3 flex-1" />
			<div className="flex flex-col gap-3">
				<div className="flex items-baseline justify-between">
					<span className="text-sm font-medium leading-[15px]">Totalt</span>
					<motion.span
						key={price}
						initial={{ opacity: 0.4 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3 }}
						className="text-base font-semibold leading-4"
					>
						{price + FLAT_WHITE} kr
					</motion.span>
				</div>
				<div className="flex h-[38px] shrink-0 items-center justify-center rounded-md bg-[#17171A] text-sm font-semibold leading-none text-[#FEFEFE]">
					Betala
				</div>
			</div>
		</div>
	);
}

/** The blinking text caret shown after the price while the agent retypes it. */
function PriceCaret() {
	return (
		<motion.span
			aria-hidden
			className="ml-[1px] inline-block w-[2px] rounded-[1px] bg-[#17171A] align-middle"
			style={{ height: "0.82em" }}
			animate={{ opacity: [1, 1, 0, 0] }}
			transition={{ duration: 1.02, times: [0, 0.5, 0.5, 1], repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
		/>
	);
}

/* ---------- shared canvas chrome: name tabs, cursors, rings, handles ---------- */

function NameTab({ name, active }: { name: string; active?: boolean }) {
	return (
		<div
			className={cn(
				"absolute -top-[22px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none",
				active ? "text-thread" : "text-muted",
			)}
		>
			<span className="text-[8px] opacity-70">{active ? "▶" : "▸"}</span>
			<span>{name}</span>
		</div>
	);
}

/** A presence cursor: hand-rolled pointer plus a mono nametag flag. */
function Cursor({ tone, label }: { tone: "agent" | "you"; label: string }) {
	const fill = tone === "agent" ? "var(--color-thread)" : "var(--color-text)";
	return (
		<div className="relative">
			<svg width="21" height="23" viewBox="0 0 22 24" fill="none">
				<path
					d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z"
					fill={fill}
					stroke="var(--color-bg)"
					strokeWidth="1.4"
					strokeLinejoin="round"
				/>
			</svg>
			<span
				className={cn(
					"absolute left-[13px] top-[16px] whitespace-nowrap rounded-[3px] px-1.5 py-[3px] font-mono text-2xs leading-none",
					tone === "agent" ? "bg-thread text-on-thread" : "bg-text text-bg",
				)}
			>
				{label}
			</span>
		</div>
	);
}

/** The four corner handles of a selection box. */
function Handles({ size = 7 }: { size?: number }) {
	const spots: [string, string][] = [
		["left-0 top-0", "-translate-x-1/2 -translate-y-1/2"],
		["right-0 top-0", "translate-x-1/2 -translate-y-1/2"],
		["left-0 bottom-0", "-translate-x-1/2 translate-y-1/2"],
		["right-0 bottom-0", "translate-x-1/2 translate-y-1/2"],
	];
	return (
		<>
			{spots.map(([pos, tr]) => (
				<span
					key={pos}
					className={cn("absolute rounded-[1px] border border-thread bg-bg", pos, tr)}
					style={{ width: size, height: size }}
				/>
			))}
		</>
	);
}

type Rect = { x: number; y: number; w: number; h: number };

/** Deconstructed design-tool chrome around the selected frame: ring, handles,
 *  and measured px riding on hairlines. Fed the live rect of the menu frame. */
function AgentChrome({ rect }: { rect: Rect }) {
	const pad = 8;
	const w = Math.round(rect.w);
	const h = Math.round(rect.h);
	return (
		<motion.div
			className="absolute"
			style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }}
			initial={{ opacity: 0, scale: 0.985 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.99 }}
			transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
		>
			<div className="absolute inset-0 rounded-[6px] border border-thread/80" />
			<Handles />
			{/* width measure, riding a hairline above the box */}
			<div className="absolute -top-4 left-0 right-0">
				<div className="relative h-px bg-thread/55">
					<span className="absolute left-0 top-1/2 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute right-0 top-1/2 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
						{w}
					</span>
				</div>
			</div>
			{/* height measure, riding a hairline left of the box */}
			<div className="absolute -left-4 bottom-0 top-0">
				<div className="relative h-full w-px bg-thread/55">
					<span className="absolute left-1/2 top-0 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
						{h}
					</span>
				</div>
			</div>
		</motion.div>
	);
}

/** Snap guides that flicker on as the receipt frame aligns: a crosshair on the
 *  grid, crossing at the frame's home centre. */
function SnapGuides({ rect }: { rect: Rect }) {
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	const ext = 120;
	return (
		<motion.div
			className="absolute inset-0"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.16, ease: "easeOut" }}
		>
			<div className="absolute w-px bg-thread/45" style={{ left: cx, top: rect.y - ext, height: rect.h + ext * 2 }} />
			<div className="absolute h-px bg-thread/45" style={{ top: cy, left: rect.x - ext, width: rect.w + ext * 2 }} />
			<div
				className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 border border-thread/70"
				style={{ left: cx, top: cy }}
			/>
		</motion.div>
	);
}

/** Bounding box that hugs the receipt frame while the "you" hand holds it. */
function GrabChrome({ dx, dy }: { dx: number; dy: number }) {
	return (
		<motion.div
			className="pointer-events-none absolute -inset-2 z-20"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.2 }}
		>
			<div className="absolute inset-0 rounded-[10px] border border-thread/80" />
			<Handles />
			<span className="absolute -top-5 left-0 whitespace-nowrap font-mono text-2xs leading-none text-thread">
				{dx} · {dy}
			</span>
		</motion.div>
	);
}

/* ---------- the walk arrows + player pill ---------- */

function StageArrows({ points, anim }: { points: { x: number; y: number }[]; anim: boolean }) {
	// a dashed thread between each screen, one arrowhead per leg, and a single
	// pulse travelling the whole path — the walk, drawn.
	const legs = points.slice(0, -1).map((p, i) => ({ a: p, b: points[i + 1] }));
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1180 620" fill="none" aria-hidden="true">
			<defs>
				<marker id="sl-ah" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
					<path d="M1 1 8 4 1 7Z" fill="var(--color-thread)" fillOpacity="0.8" />
				</marker>
			</defs>
			{legs.map((l, i) => {
				const midx = (l.a.x + l.b.x) / 2;
				const d = `M ${l.a.x} ${l.a.y} C ${midx} ${l.a.y}, ${midx} ${l.b.y}, ${l.b.x - 8} ${l.b.y}`;
				return (
					<path
						key={i}
						d={d}
						stroke="var(--color-thread)"
						strokeWidth="1.5"
						strokeOpacity="0.5"
						strokeDasharray="4 4"
						markerEnd="url(#sl-ah)"
					/>
				);
			})}
			{/* the travelling walk pulse — transform-only (x/y off a fixed anchor) */}
			{anim ? (
				<motion.circle
					cx={points[0].x}
					cy={points[0].y}
					r="3"
					fill="var(--color-thread)"
					style={{ filter: "drop-shadow(0 0 4px color-mix(in srgb, var(--color-thread) 70%, transparent))" }}
					animate={{
						x: points.map((p) => p.x - points[0].x),
						y: points.map((p) => p.y - points[0].y),
						opacity: [0, 1, 1, 0],
					}}
					transition={{ duration: 5.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
			) : null}
		</svg>
	);
}

function StepDot({ active }: { active?: boolean }) {
	return (
		<span className="relative flex h-2 w-2 items-center justify-center">
			{active ? <span className="absolute -inset-[3px] rounded-full border border-thread/40" /> : null}
			<span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-thread" : "bg-border-raised")} />
		</span>
	);
}

const LEG_NAMES = ["menu", "cart", "receipt"] as const;

function PlayerPill({ leg, anim }: { leg: number; anim: boolean }) {
	return (
		<div className="flex w-[344px] items-center gap-3 rounded-full border border-border-raised bg-bg/85 px-4 py-2.5 backdrop-blur-sm">
			<motion.span
				className="text-thread"
				animate={anim ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
				transition={anim ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : undefined}
			>
				<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="h-2.5 w-2.5">
					<path d="M2.5 1.6 8 5 2.5 8.4Z" />
				</svg>
			</motion.span>
			<div className="w-[68px] overflow-hidden">
				<motion.span
					key={leg}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="block truncate font-mono text-[11px] leading-none text-text"
				>
					{LEG_NAMES[leg]}
				</motion.span>
			</div>
			<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
				<motion.div
					key={leg}
					className="h-full w-full origin-left rounded-full bg-thread"
					initial={{ scaleX: 0 }}
					animate={{ scaleX: 1 }}
					transition={{ duration: LEG_MS / 1000, ease: "linear" }}
				/>
			</div>
			<div className="flex items-center gap-2 pl-0.5">
				<StepDot active={leg === 0} />
				<StepDot active={leg === 1} />
				<StepDot active={leg === 2} />
			</div>
		</div>
	);
}

/* ---------- the stage: three real screens, walked and quietly authored ---------- */

// frame boxes inside the 1180 x 620 stage panel — all one size so the walk ring
// only ever translates (transform-only), never resizes.
const FW = 248;
const FH = 372;
const SCREENS: { key: string; name: string; x: number; y: number }[] = [
	{ key: "menu", name: "menu", x: 92, y: 132 },
	{ key: "cart", name: "cart", x: 466, y: 178 },
	{ key: "receipt", name: "receipt", x: 840, y: 132 },
];
const ARROW_POINTS = [
	{ x: SCREENS[0].x + FW, y: SCREENS[0].y + FH / 2 },
	{ x: SCREENS[1].x, y: SCREENS[1].y + FH / 2 },
	{ x: SCREENS[1].x + FW, y: SCREENS[1].y + FH / 2 },
	{ x: SCREENS[2].x, y: SCREENS[2].y + FH / 2 },
];

type Presence = {
	aX: number;
	aY: number;
	yX: number;
	yY: number;
	agentSel: boolean;
	caret: boolean;
	recDX: number;
	recDY: number;
	grab: boolean;
	guides: boolean;
};

const A_PARK = { aX: -70, aY: 90 };
const Y_PARK = { yX: 1230, yY: 470 };
const REST: Presence = {
	...A_PARK,
	...Y_PARK,
	agentSel: false,
	caret: false,
	recDX: 0,
	recDY: 0,
	grab: false,
	guides: false,
};

const CURSOR_T = { type: "spring", stiffness: 72, damping: 16, mass: 1.1 } as const;
const RING_T = { type: "spring", stiffness: 120, damping: 22, mass: 0.9 } as const;

function Stage() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const stageRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const receiptRef = useRef<HTMLDivElement>(null);

	const [leg, setLeg] = useState(0);
	// `price` is the committed cortado price (drives the cart math); `editStr` is
	// the transient string the menu shows mid-retype, so the cart never reflects
	// the half-typed "4" — it changes only when the edit commits.
	const [price, setPrice] = useState(40);
	const [editStr, setEditStr] = useState<string | null>(null);
	const priceRef = useRef(40);
	const [menuRect, setMenuRect] = useState<Rect | null>(null);
	const [receiptRect, setReceiptRect] = useState<Rect | null>(null);
	const [st, setSt] = useState<Presence>(REST);

	// the walk: advance the leg on a seamless loop. Suppressed under reduced
	// motion (the stage rests, composed, on the menu leg, at the canonical price).
	useEffect(() => {
		if (reduce) {
			priceRef.current = 42;
			setPrice(42);
			setEditStr(null);
			return;
		}
		const id = window.setInterval(() => setLeg((l) => (l + 1) % 3), LEG_MS);
		return () => window.clearInterval(id);
	}, [reduce]);

	// the presence theater: one recursive timer walks a fixed list of steps and
	// loops. First event ~4s in (a fresh visitor meets the stage first), then
	// quiet ~9-10s gaps. Cursor + ring targets are measured in layout px via the
	// offsetParent chain, so they stay glued when the page is transform-scaled.
	useEffect(() => {
		if (reduce) return;
		const patch = (p: Partial<Presence>) => setSt((s) => ({ ...s, ...p }));
		const commit = (n: number) => {
			priceRef.current = n;
			setPrice(n);
			setEditStr(null);
		};
		const rel = (el: HTMLElement | null, root: HTMLElement | null): Rect | null => {
			if (!el || !root) return null;
			let x = 0;
			let y = 0;
			let n: HTMLElement | null = el;
			while (n && n !== root) {
				x += n.offsetLeft;
				y += n.offsetTop;
				n = n.offsetParent as HTMLElement | null;
			}
			return { x, y, w: el.offsetWidth, h: el.offsetHeight };
		};
		const measure = () => {
			const root = stageRef.current;
			const m = rel(menuRef.current, root);
			const r = rel(receiptRef.current, root);
			if (m) setMenuRect(m);
			if (r) setReceiptRect(r);
			return { m, r };
		};

		type Step = { hold: number; run: () => void };
		const seq: Step[] = [];
		const add = (hold: number, run: () => void = () => {}) => seq.push({ hold, run });

		// rest — this is where the boot shot lands (no presence chrome)
		add(9000, () => patch(REST));

		// the agent hand: select the menu frame, retype the cortado price, commit.
		add(1000, () => {
			const { m } = measure();
			if (m) patch({ aX: m.x - 24, aY: m.y - 8 });
		});
		add(560, () => {
			const { m } = measure();
			if (m) patch({ aX: m.x + m.w - 58, aY: m.y + 96 });
		});
		add(520, () => {
			patch({ agentSel: true, caret: true });
			setEditStr(String(priceRef.current));
		});
		add(360, () => setEditStr("4")); // delete the last digit
		add(420, () => commit(priceRef.current === 40 ? 42 : 40)); // type the new one, cart follows
		add(1000); // weigh it
		add(480, () => patch({ agentSel: false, caret: false }));
		add(1200, () => patch({ aX: A_PARK.aX, aY: A_PARK.aY }));

		// quiet
		add(9500);

		// the you hand: grab the receipt frame, nudge it, let it snap home.
		add(1400, () => {
			const { r } = measure();
			if (r) patch({ yX: r.x + r.w + 22, yY: r.y + 26 });
		});
		add(640, () => {
			const { r } = measure();
			if (r) patch({ yX: r.x + r.w * 0.5, yY: r.y + r.h * 0.5 });
		});
		add(420, () => patch({ grab: true }));
		add(700, () => {
			const { r } = measure();
			if (r) patch({ recDX: -30, recDY: 16, yX: r.x + r.w * 0.5 - 30, yY: r.y + r.h * 0.5 + 16, guides: true });
		});
		add(560);
		add(200, () => {
			const { r } = measure();
			if (r) patch({ recDX: 0, recDY: 0, yX: r.x + r.w * 0.5, yY: r.y + r.h * 0.5 });
		});
		add(360, () => patch({ guides: false }));
		add(320, () => patch({ grab: false }));
		add(1300, () => patch({ yX: Y_PARK.yX, yY: Y_PARK.yY }));

		let i = 0;
		let id = 0;
		let first = true;
		const tick = () => {
			seq[i].run();
			const hold = i === 0 && first ? 3400 : seq[i].hold;
			if (i === 0) first = false;
			i = (i + 1) % seq.length;
			id = window.setTimeout(tick, hold);
		};
		tick();
		return () => window.clearTimeout(id);
	}, [reduce]);

	// walk-ring translation from the menu home to the active screen (transform
	// only — all screens are one size).
	const ringDX = SCREENS[leg].x - SCREENS[0].x;
	const ringDY = SCREENS[leg].y - SCREENS[0].y;

	return (
		<div
			data-sl="stage"
			className="relative mx-auto h-[620px] w-[1180px] overflow-hidden rounded-2xl border border-border bg-canvas"
			style={dotGrid}
		>
			{/* lighting: a soft thread halo travelling with the active screen + vignette */}
			<motion.div
				className="pointer-events-none absolute h-[440px] w-[440px] rounded-full"
				style={{
					left: SCREENS[0].x + FW / 2 - 220,
					top: SCREENS[0].y + FH / 2 - 220,
					background: "radial-gradient(circle, color-mix(in srgb, var(--color-thread) 14%, transparent) 0%, transparent 66%)",
				}}
				animate={{ x: ringDX, y: ringDY }}
				transition={RING_T}
			/>
			<div
				className="pointer-events-none absolute inset-0"
				style={{ background: "radial-gradient(94% 84% at 50% 44%, rgba(255,255,255,0.02) 0%, transparent 40%, rgba(0,0,0,0.5) 100%)" }}
			/>

			<StageArrows points={ARROW_POINTS} anim={anim} />

			{/* the three screens — the coffee flow, walkable */}
			<div ref={stageRef} className="absolute inset-0">
				<div className="absolute" style={{ left: SCREENS[0].x, top: SCREENS[0].y, width: FW, height: FH }}>
					<NameTab name="menu" active={leg === 0} />
					<div ref={menuRef} className="h-full w-full">
						<LiveMenu priceStr={editStr ?? String(price)} caret={anim && st.caret} />
					</div>
				</div>
				<div className="absolute" style={{ left: SCREENS[1].x, top: SCREENS[1].y, width: FW, height: FH }}>
					<NameTab name="cart" active={leg === 1} />
					<LiveCart price={price} />
				</div>
				<motion.div
					className="absolute"
					style={{ left: SCREENS[2].x, top: SCREENS[2].y, width: FW, height: FH }}
					animate={{ x: st.recDX, y: st.recDY, scale: st.grab ? 0.99 : 1 }}
					transition={{ type: "spring", stiffness: 260, damping: 20 }}
				>
					<NameTab name="receipt" active={leg === 2} />
					<div ref={receiptRef} className="relative h-full w-full">
						<CoffeeScreen screen="receipt" scale="design" />
						<AnimatePresence>{st.grab && <GrabChrome dx={st.recDX} dy={st.recDY} />}</AnimatePresence>
					</div>
				</motion.div>

				{/* the walk ring: travels frame to frame, one size, transform only */}
				<motion.div
					className="pointer-events-none absolute"
					style={{ left: SCREENS[0].x, top: SCREENS[0].y, width: FW, height: FH }}
					animate={{ x: ringDX, y: ringDY }}
					transition={RING_T}
				>
					<div className="absolute -inset-[6px] rounded-[16px] border-[1.5px] border-thread/55" />
					{[
						{ l: -10, t: -10 },
						{ l: FW - 4, t: -10 },
						{ l: -10, t: FH - 4 },
						{ l: FW - 4, t: FH - 4 },
					].map((c) => (
						<span
							key={`${c.l}-${c.t}`}
							className="absolute h-2 w-2 rounded-[2px] border-[1.5px] border-thread bg-on-thread"
							style={{ left: c.l, top: c.t }}
						/>
					))}
				</motion.div>

				{/* presence overlay — decorative, never intercepts real hovers */}
				<div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
					<AnimatePresence>
						{anim && st.agentSel && menuRect && <AgentChrome key="agent" rect={menuRect} />}
					</AnimatePresence>
					<AnimatePresence>
						{anim && st.guides && receiptRect && <SnapGuides key="guides" rect={receiptRect} />}
					</AnimatePresence>
					{anim && (
						<>
							<motion.div className="absolute left-0 top-0" initial={false} animate={{ x: st.aX, y: st.aY }} transition={CURSOR_T}>
								<Cursor tone="agent" label="agent" />
							</motion.div>
							<motion.div className="absolute left-0 top-0" initial={false} animate={{ x: st.yX, y: st.yY }} transition={CURSOR_T}>
								<Cursor tone="you" label="you" />
							</motion.div>
						</>
					)}
				</div>
			</div>

			{/* the player pill, centred beneath the flow */}
			<div className="absolute left-1/2 top-[560px] -translate-x-1/2">
				<PlayerPill leg={leg} anim={anim} />
			</div>

			{/* quiet canvas chrome */}
			<div className="absolute bottom-4 left-5 flex items-center gap-1.5 font-mono text-[10px] text-muted/80">
				<SpoolMark className="h-3 w-3 text-muted/70" />
				<span>canvas</span>
			</div>
			<div className="absolute bottom-4 right-5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted/80">
				100%
			</div>
		</div>
	);
}

/* ---------- the landing content: header, hero, stage, stance, footer ---------- */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{ k: "your disk", v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts." },
	{ k: "real depth", v: "frames are real tsx. arbitrary js, real motion, real state." },
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

function Page() {
	return (
		<div className="flex w-full flex-col bg-bg pb-40 font-sans text-text antialiased [font-synthesis:none]">
			{/* header */}
			<header className="flex shrink-0 items-center justify-between px-20 py-9">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>spool.page</span>
					<a href="https://github.com/liamvinberg/spool" className="text-text transition-colors hover:text-thread">
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			{/* hero — type-led, centred, premium restraint */}
			<section className="flex shrink-0 flex-col items-center px-8 pt-28 text-center">
				<h1 className="text-[84px] font-semibold leading-[0.97] tracking-[-0.025em]">
					feel an app
					<br />
					before it exists
				</h1>
				<p className="mt-7 max-w-[560px] text-[18px] leading-[27px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames on an infinite canvas and links them into
					walkable flows. you feel the real thing, interactions and motion and inputs, before it exists.
				</p>

				<div className="mt-9 w-fit rounded-xl border border-border bg-surface/40 px-6 py-5 text-left">
					<div className="w-[300px] font-mono text-[15px] leading-[30px]">
						<CommandLine command="npm i -g spool.page" />
						<CommandLine command="spool init" />
						<CommandLine command="spool serve" />
					</div>
				</div>
				<div className="mt-5 font-mono text-xs text-muted">requires node 22+ · best in chrome · macos-first today</div>
			</section>

			{/* connective thread down into the stage */}
			<div className="relative flex shrink-0 justify-center py-20">
				<div
					className="h-14 w-px"
					style={{
						background:
							"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 60%, transparent) 30%, color-mix(in srgb, var(--color-thread) 60%, transparent))",
					}}
				/>
				<span className="absolute bottom-0 left-1/2 block h-[9px] w-[9px] -translate-x-1/2 translate-y-1/2">
					<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
					<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
				</span>
			</div>

			{/* the stage — the product, big and alive */}
			<section className="shrink-0 pb-44 pt-8">
				<Stage />
			</section>

			{/* stance — quiet, four across */}
			<section className="px-20 pt-24">
				<div className="grid grid-cols-4 gap-8 border-t border-border pt-9">
					{stance.map((s, i) => (
						<div key={s.k}>
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-[11px] text-thread">{String(i + 1).padStart(2, "0")}</span>
								<span className="text-[15px] font-semibold tracking-tight">{s.k}</span>
							</div>
							<p className="mt-2 text-[13px] leading-[20px] text-muted">{s.v}</p>
						</div>
					))}
				</div>
			</section>

			{/* footer */}
			<footer className="mt-44 flex shrink-0 items-center justify-between border-t border-border px-20 py-8">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-4 w-4 text-thread" />
					<span className="text-sm text-muted">spool.page</span>
				</div>
				<a
					href="https://github.com/liamvinberg/spool"
					className="font-mono text-xs text-muted transition-colors hover:text-thread"
				>
					github.com/liamvinberg/spool
				</a>
			</footer>
		</div>
	);
}

/* ---------- ghost wireframes: one faithful silhouette per real variant ---------- */

function Bar({ w, className }: { w: string; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}
const ghostSpine: CSSProperties = {
	background: "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 40%, transparent) 12%, color-mix(in srgb, var(--color-thread) 40%, transparent) 88%, transparent)",
};

// landing--stage: a walked frame with satellites + arrows on a dot grid.
function GStage() {
	return (
		<div className="relative h-full w-full overflow-hidden rounded-[3px]" style={dotGrid}>
			<div className="absolute left-[12%] top-[20%] h-[54%] w-[38%] rounded-[3px] border border-thread/50 bg-raised/40" />
			<div className="absolute right-[12%] top-[16%] h-[26%] w-[30%] rounded-[3px] border border-border bg-canvas" />
			<div className="absolute right-[14%] bottom-[20%] h-[24%] w-[26%] rounded-[3px] border border-border bg-canvas" />
			<svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<path d="M52 42 C 66 40, 66 30, 74 28" stroke="var(--color-thread)" strokeWidth="0.8" strokeOpacity="0.5" strokeDasharray="3 3" />
			</svg>
			<div className="absolute bottom-[10%] left-1/2 h-1.5 w-[46%] -translate-x-1/2 rounded-full border border-border-raised" />
		</div>
	);
}

// landing--twohands: a page being edited by two cursors, a selection ring on the head.
function GTwoHands() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-2 left-[22%] w-px" style={ghostSpine} />
			<div className="absolute left-[32%] top-[22%] space-y-2">
				<div className="relative h-3 w-[92px] rounded-sm bg-raised">
					<div className="absolute -inset-1 border border-thread/60" />
				</div>
				<div className="h-3 w-[68px] rounded-sm bg-raised" />
			</div>
			<svg className="absolute left-[30%] top-[20%]" width="12" height="13" viewBox="0 0 22 24" fill="none">
				<path d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z" fill="var(--color-thread)" />
			</svg>
			<svg className="absolute right-[16%] bottom-[26%]" width="12" height="13" viewBox="0 0 22 24" fill="none">
				<path d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z" fill="var(--color-text)" />
			</svg>
			<SpoolMark className="absolute bottom-3 right-3 h-6 w-6 text-thread/35" />
		</div>
	);
}

// landing--fourthwall: a frame sitting on a dashed canvas (the recursive wink).
function GFourthwall() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-[10%] rounded-[3px] border border-dashed border-border-raised" />
			<div className="absolute left-[26%] top-[28%] h-[44%] w-[48%] rounded-[3px] border border-thread/50 bg-raised/30" />
			<div className="absolute left-[30%] top-[36%] space-y-1.5">
				<div className="h-2 w-[54px] rounded-sm bg-raised" />
				<Bar w="40px" />
			</div>
			<span className="absolute left-[26%] top-[22%] font-mono text-[7px] leading-none text-thread/70">▶</span>
		</div>
	);
}

// landing--selfsource: a code rail typing on the left, the page assembling right.
function GSelfsource() {
	return (
		<div className="flex h-full w-full gap-2">
			<div className="flex w-[46%] flex-col justify-center gap-1 rounded-[3px] border border-border bg-canvas p-2">
				{["70%", "52%", "60%", "40%"].map((w, i) => (
					<div key={i} className="flex items-center gap-1">
						<span className="text-[6px] leading-none text-muted/60">{i + 1}</span>
						<Bar w={w} className="bg-raised" />
					</div>
				))}
				<div className="flex items-center gap-1">
					<span className="text-[6px] leading-none text-muted/60">5</span>
					<Bar w="30%" className="bg-raised" />
					<span className="block h-2 w-[2px] bg-thread" />
				</div>
			</div>
			<div className="flex flex-1 flex-col justify-center gap-1.5">
				<div className="h-2.5 w-[80%] rounded-sm bg-raised" />
				<div className="h-2.5 w-[60%] rounded-sm bg-raised" />
				<div className="mt-1 space-y-1">
					<Bar w="70%" />
					<Bar w="48%" />
				</div>
			</div>
		</div>
	);
}

// landing--kinetic: colossal type with a thread woven through it.
function GKinetic() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute left-[8%] top-[26%] space-y-2.5">
				<div className="h-4 w-[120px] rounded-sm bg-raised" />
				<div className="h-4 w-[92px] rounded-sm bg-raised" />
			</div>
			<svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<path d="M14 8 C 40 30, 8 44, 40 46 C 78 48, 60 74, 92 78" stroke="var(--color-thread)" strokeWidth="1" strokeOpacity="0.55" fill="none" />
			</svg>
		</div>
	);
}

// landing--livewire: one thread woven down the page through nodes.
function GLivewire() {
	return (
		<div className="relative h-full w-full">
			<svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<path
					d="M74 6 C 40 16, 26 26, 26 34 C 26 46, 74 50, 74 60 C 74 72, 26 74, 26 86"
					stroke="var(--color-thread)"
					strokeWidth="1"
					strokeOpacity="0.5"
					fill="none"
				/>
			</svg>
			{[[26, 34], [74, 60], [26, 86]].map(([x, y]) => (
				<span
					key={`${x}-${y}`}
					className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-thread/60"
					style={{ left: `${x}%`, top: `${y}%` }}
				/>
			))}
			<div className="absolute left-[34%] top-[28%] space-y-1">
				<Bar w="52px" />
				<Bar w="34px" />
			</div>
		</div>
	);
}

// landing--quiet: a broadsheet — a big statement, hairline rules, a margin ribbon.
function GQuiet() {
	return (
		<div className="relative flex h-full w-full flex-col">
			<div className="space-y-1.5">
				<div className="h-3 w-[88%] rounded-sm bg-raised" />
				<div className="h-3 w-[66%] rounded-sm bg-raised" />
			</div>
			<div className="my-2 h-px w-full bg-border" />
			<div className="grid flex-1 grid-cols-[1fr_auto] gap-2">
				<div className="space-y-1 border-t border-border pt-1.5">
					<Bar w="70%" />
					<Bar w="52%" />
					<Bar w="60%" />
				</div>
				<SpoolMark className="h-7 w-7 self-center text-thread/40" />
			</div>
		</div>
	);
}

interface GhostSpec {
	name: string;
	C: () => React.ReactNode;
	x: number;
	y: number;
	w: number;
	h: number;
}

function Ghost({ spec }: { spec: GhostSpec }) {
	return (
		<div className="absolute" style={{ left: spec.x, top: spec.y }}>
			<div className="mb-1.5 flex items-center gap-1 font-mono text-[10px] leading-none text-muted">
				<span className="text-[8px] opacity-60">▸</span>
				<span>{spec.name}</span>
			</div>
			<div
				className="relative overflow-hidden rounded-[5px] border border-border bg-surface"
				style={{ width: spec.w, height: spec.h }}
			>
				<div className="absolute inset-0 p-2.5">
					<spec.C />
				</div>
			</div>
		</div>
	);
}

/* ---------- the closing beat: canvas + ghosts + the live frame's chrome ---------- */

function LiveFrameChrome({ rect, pageH }: { rect: Rect; pageH: number }) {
	const corners = [
		{ l: rect.x - 4, t: rect.y - 4 },
		{ l: rect.x + rect.w - 4, t: rect.y - 4 },
		{ l: rect.x - 4, t: rect.y + rect.h - 4 },
		{ l: rect.x + rect.w - 4, t: rect.y + rect.h - 4 },
	];
	return (
		<>
			<div
				className="absolute flex items-center gap-1.5 font-mono text-xs leading-none text-thread"
				style={{ left: rect.x, top: rect.y - 22 }}
			>
				<span className="text-[9px] opacity-70">▶</span>
				<span>landing</span>
			</div>
			<div
				className="absolute rounded-[12px] border-[1.5px] border-thread"
				style={{ left: rect.x - 3, top: rect.y - 3, width: rect.w + 6, height: rect.h + 6 }}
			/>
			{corners.map((c) => (
				<span
					key={`${c.l}-${c.t}`}
					className="absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread"
					style={{ left: c.l, top: c.t }}
				/>
			))}
			<div
				className="absolute rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs leading-none text-on-thread"
				style={{ left: rect.x + rect.w / 2 - 34, top: rect.y + rect.h - 3 }}
			>
				1440 × {Math.round(pageH)}
			</div>
		</>
	);
}

/* ---------- orchestrator: the scroll-driven page-into-canvas zoom ---------- */

type Metrics = { vp: number; vpW: number; pageH: number };

export default function LandingStageLive() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const pageRef = useRef<HTMLDivElement>(null);
	const [metrics, setMetrics] = useState<Metrics>({ vp: 900, vpW: 1440, pageH: 2200 });
	const metricsRef = useRef<Metrics>(metrics);

	// Measure the scroll viewport and the page's natural height. These feed the
	// zoom math; scrollHeight/clientHeight are layout, unaffected by the page's
	// transform, so measuring them is safe (unlike gBCR on scaled chrome, #53).
	useLayoutEffect(() => {
		const measure = () => {
			const c = scrollRef.current;
			const p = pageRef.current;
			if (!c || !p) return;
			const m: Metrics = { vp: c.clientHeight, vpW: c.clientWidth, pageH: p.scrollHeight };
			if (m.vp === metricsRef.current.vp && m.vpW === metricsRef.current.vpW && m.pageH === metricsRef.current.pageH)
				return;
			metricsRef.current = m;
			setMetrics(m);
		};
		measure();
		const ro = new ResizeObserver(measure);
		if (scrollRef.current) ro.observe(scrollRef.current);
		if (pageRef.current) ro.observe(pageRef.current);
		// fonts settling can reflow the page height after first paint
		const t = window.setTimeout(measure, 400);
		return () => {
			ro.disconnect();
			window.clearTimeout(t);
		};
	}, []);

	const { scrollYProgress } = useScroll({ container: scrollRef });

	// reading -> zoom, both derived from scroll progress. Function-form transforms
	// with manual clamp (the useTransform options-object clamp silently fails in a
	// bound-container scroll like this). readY is crisp (native-feeling scroll);
	// the zoom fraction is eased then smoothed by one overdamped spring.
	const pRead = () => {
		const { vp, pageH } = metricsRef.current;
		const readingDist = Math.max(0, pageH - vp);
		const scrollable = readingDist + ZOOM_DIST;
		return { readingDist, pRead: scrollable > 0 ? readingDist / scrollable : 0 };
	};
	const readY = useTransform(scrollYProgress, (p) => {
		const { readingDist, pRead: pr } = pRead();
		if (pr <= 0) return 0;
		return -readingDist * clamp01(p / pr);
	});
	const zRaw = useTransform(scrollYProgress, (p) => {
		const { pRead: pr } = pRead();
		return clamp01((p - pr) / (1 - pr || 1));
	});
	const ez = useTransform(zRaw, (v) => easeInOut(v));
	const ezS = useSpring(ez, { stiffness: 80, damping: 26, mass: 0.5 });

	const wrapScale = useTransform(ezS, (v) => lerp(1, S_MIN, v));
	const wrapX = useTransform(ezS, (v) => {
		const { vpW } = metricsRef.current;
		const fx = (vpW - vpW * S_MIN) / 2;
		return lerp(0, fx, v);
	});
	const wrapY = useTransform([readY, ezS] as MotionValue<number>[], ([ry, v]: number[]) => {
		const { vp, pageH } = metricsRef.current;
		const fy = (vp - pageH * S_MIN) / 2;
		return ry * (1 - v) + fy * v;
	});

	// canvas + ghosts revealed as the page recedes; the live chrome snaps on last.
	const canvasOpacity = useTransform(ezS, [0.12, 0.55], [0, 1]);
	const captionOpacity = useTransform(ezS, [0.5, 0.92], [0, 1]);
	const chromeOpacity = useTransform(ezS, [0.68, 0.98], [0, 1]);

	// the final landing-frame rect + ghost/caption placement, in viewport space.
	const shrunkW = metrics.vpW * S_MIN;
	const shrunkH = metrics.pageH * S_MIN;
	const FX = (metrics.vpW - shrunkW) / 2;
	const FY = (metrics.vp - shrunkH) / 2;
	const liveRect: Rect = { x: FX, y: FY, w: shrunkW, h: shrunkH };
	// ghosts spread wide around the winner, anchored to the live frame rect (so
	// they track it at any viewport) and using the canvas the tall frame affords.
	const colL = FX - 58;
	const colR = FX + shrunkW + 58;
	const ghosts: GhostSpec[] = [
		{ name: "landing--twohands", C: GTwoHands, x: colL - 196, y: FY - shrunkH * 0.24, w: 196, h: 152 },
		{ name: "landing--fourthwall", C: GFourthwall, x: colR, y: FY - shrunkH * 0.22, w: 202, h: 150 },
		{ name: "landing--kinetic", C: GKinetic, x: colL - 356, y: FY + shrunkH * 0.08, w: 190, h: 148 },
		{ name: "landing--livewire", C: GLivewire, x: colR + 160, y: FY + shrunkH * 0.38, w: 180, h: 158 },
		{ name: "landing--stage", C: GStage, x: colL - 186, y: FY + shrunkH * 0.54, w: 190, h: 152 },
		{ name: "landing--selfsource", C: GSelfsource, x: colR, y: FY + shrunkH * 0.82, w: 204, h: 152 },
		{ name: "landing--quiet", C: GQuiet, x: colL - 336, y: FY + shrunkH * 1.01, w: 196, h: 148 },
	];

	// TRACK_H = full read distance + the zoom's scroll room. Depends on measured
	// page height; the sticky window stays exactly one viewport tall.
	const trackH = metrics.pageH + ZOOM_DIST;

	return (
		<div
			ref={scrollRef}
			data-sl="scroll"
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg [scrollbar-width:none]"
		>
			<div className="relative w-full" style={{ height: trackH }}>
				<div className="sticky top-0 overflow-hidden bg-bg" style={{ height: metrics.vp }}>
					{/* the canvas the page returns to: dot grid + dim ghosts, revealed as the
					    page recedes. Fading it in (rather than always-on-behind) means any
					    gap during reading blends into the page's own bg, never a stray grid. */}
					<motion.div
						className="absolute inset-0 bg-canvas"
						style={{ opacity: canvasOpacity, ...dotGrid }}
					>
						{ghosts.map((g) => (
							<Ghost key={g.name} spec={g} />
						))}
					</motion.div>
					<motion.div
						className="absolute text-center"
						style={{ left: FX, top: FY + shrunkH + 26, width: shrunkW, opacity: captionOpacity }}
					>
						<div className="font-mono text-xs leading-[18px] text-muted">this page is a frame on a canvas too.</div>
						<div className="mt-1.5 font-mono text-2xs text-muted/70">
							<span className="text-muted/50">$</span> npm i -g spool.page
						</div>
					</motion.div>

					{/* the page — one wrapper, transform-only zoom, fully reversible */}
					<motion.div
						ref={pageRef}
						className="absolute left-0 top-0 w-full [will-change:transform]"
						style={{ x: wrapX, y: wrapY, scale: wrapScale, transformOrigin: "0 0" }}
					>
						<Page />
					</motion.div>

					{/* the live frame's canvas chrome, snapping on as it settles */}
					<motion.div className="pointer-events-none absolute inset-0" style={{ opacity: chromeOpacity }}>
						<LiveFrameChrome rect={liveRect} pageH={metrics.pageH} />
					</motion.div>
				</div>
			</div>
		</div>
	);
}
