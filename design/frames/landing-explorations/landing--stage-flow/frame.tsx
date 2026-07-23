import { motion, type Variants } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { CheckIcon } from "../../../shared/ui/spool-icons";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--stage-flow — v2 of landing--stage. Same page shape (type-led hero,
 * install panel, thread tick, lit canvas stage, stance quartet, footer); the
 * fix is the stage. Instead of four unrelated screens of a made-up app, the
 * stage now shows spool's own demo app — the kaffe coffee shop — as ONE
 * coherent, walkable flow: menu -> cart -> receipt, left to right, thread
 * arrows in sequence, each frame a real light-themed product frame on the dark
 * canvas (CoffeeScreen, used directly, exactly as it renders on a real spool
 * canvas). One frame position is the live walker: a larger, lit, ringed frame
 * that morphs through the whole flow on a seamless slow loop — the two ordered
 * items travel from menu into the cart, the total travels into the receipt — a
 * player pill beneath tracking screen name and all three steps.
 *
 * The visitor can take over: clicking any map frame (or a pill dot) walks the
 * live frame there with the same morph and pauses the loop for ~10s. Hovering a
 * map frame lifts its name tab and shows a thread selection ring; the cursor
 * makes clickability obvious with no instructional copy.
 *
 * Motion is transform/opacity only. The morph is explicit variant springs keyed
 * on the screen (never layout measurement / getBoundingClientRect), so chrome
 * never strands when the player scales the frame document (#53). Boot pose is
 * the menu screen, composed instantly for `spool shot`'s ~300ms capture.
 */

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- */

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

/* ---------- shared surfaces ---------- */

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}

/* ---------- the live walker: kaffe menu -> cart -> receipt, on a loop ---------- */

type ScreenKey = CoffeeScreenName; // "menu" | "cart" | "receipt"
const ORDER: readonly ScreenKey[] = ["menu", "cart", "receipt"];
const keyOf = (index: number): ScreenKey => (index === 0 ? "menu" : index === 1 ? "cart" : "receipt");
const LEG_MS = 2800;
const PAUSE_MS = 10000;

const SPRING = { type: "spring", stiffness: 140, damping: 22, mass: 0.9 } as const;
const FADE = { duration: 0.5, ease: [0.22, 1, 0.36, 1] } as const;
const ROW_TRANSITION = { default: SPRING, opacity: FADE } as const;

/* Kaffe palette, verbatim from shared/ui/coffee-screens.tsx */
const INK = "#17171A";
const PAPER = "#FEFEFE";
const HAIR = "#E4E4E7";
const SOFT = "#86868B";
const CHIP = "#EFEFF1";
const DOT = "#D9D9DE";

// menu-only elements (title, address, the un-ordered third product)
const menuOnlyV: Variants = {
	menu: { opacity: 1, y: 0 },
	cart: { opacity: 0, y: -6 },
	receipt: { opacity: 0, y: -6 },
};
// cart-only title
const cartTitleV: Variants = {
	menu: { opacity: 0, y: 6 },
	cart: { opacity: 1, y: 0 },
	receipt: { opacity: 0, y: -6 },
};
// the two ordered rows: live in menu AND cart, travel up between them, fade on receipt
const rowV = (dy: number): Variants => ({
	menu: { opacity: 1, y: 0 },
	cart: { opacity: 1, y: dy },
	receipt: { opacity: 0, y: dy - 12 },
});
// inside a travelling row: swatch (menu) crossfades to the "1x" quantity (cart)
const swatchV: Variants = { menu: { opacity: 1 }, cart: { opacity: 0 }, receipt: { opacity: 0 } };
const qtyV: Variants = { menu: { opacity: 0 }, cart: { opacity: 1 }, receipt: { opacity: 0 } };
// the dark CTA persists menu->cart, its label crossfades; gone on receipt
const ctaV: Variants = {
	menu: { opacity: 1, y: 0 },
	cart: { opacity: 1, y: 0 },
	receipt: { opacity: 0, y: 6 },
};
const tillLabelV: Variants = { menu: { opacity: 1 }, cart: { opacity: 0 }, receipt: { opacity: 0 } };
const betalaLabelV: Variants = { menu: { opacity: 0 }, cart: { opacity: 1 }, receipt: { opacity: 0 } };
// cart total label
const totalLabelV: Variants = { menu: { opacity: 0 }, cart: { opacity: 1 }, receipt: { opacity: 0 } };
// the total value: appears in the cart, then travels up into the receipt
const totalValueV: Variants = {
	menu: { opacity: 0, x: 0, y: 6, scale: 1 },
	cart: { opacity: 1, x: 0, y: 0, scale: 1 },
	receipt: { opacity: 1, x: -99, y: -104, scale: 0.9 },
};
// receipt-only elements
const checkV: Variants = {
	menu: { opacity: 0, scale: 0.6 },
	cart: { opacity: 0, scale: 0.6 },
	receipt: { opacity: 1, scale: 1 },
};
const receiptTextV = (dy: number): Variants => ({
	menu: { opacity: 0, y: dy },
	cart: { opacity: 0, y: dy },
	receipt: { opacity: 1, y: 0 },
});

function OrderedRow({ topBase, dy, name, price }: { topBase: number; dy: number; name: string; price: string }) {
	return (
		<motion.div
			variants={rowV(dy)}
			transition={ROW_TRANSITION}
			style={{ top: topBase }}
			className="absolute left-[20px] flex h-[46px] w-[224px] items-center gap-3 rounded-md px-3"
		>
			<div className="absolute inset-0 -z-10 rounded-md" style={{ backgroundColor: CHIP }} />
			<div className="relative h-[26px] w-[26px] shrink-0">
				<motion.span
					variants={swatchV}
					transition={FADE}
					className="absolute inset-0 rounded-full"
					style={{ backgroundColor: DOT }}
				/>
				<motion.span
					variants={qtyV}
					transition={FADE}
					className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold"
				>
					1×
				</motion.span>
			</div>
			<span className="min-w-0 flex-1 text-[14px] font-medium leading-none">{name}</span>
			<span className="shrink-0 text-[13px] leading-none" style={{ color: SOFT }}>
				{price}
			</span>
		</motion.div>
	);
}

function WalkViewport({ screenKey }: { screenKey: ScreenKey }) {
	return (
		<motion.div
			className="absolute inset-0 font-[Instrument_Sans]"
			style={{ color: INK, willChange: "transform" }}
			initial={false}
			animate={screenKey}
		>
			{/* menu header */}
			<motion.div
				variants={menuOnlyV}
				transition={FADE}
				className="absolute left-[20px] top-[22px] text-[20px] font-semibold leading-[24px] tracking-tight"
			>
				kaffe
			</motion.div>
			<motion.div
				variants={menuOnlyV}
				transition={FADE}
				className="absolute left-[20px] top-[50px] text-[12px] leading-none"
				style={{ color: SOFT }}
			>
				Torsgatan 11
			</motion.div>

			{/* cart header */}
			<motion.div
				variants={cartTitleV}
				transition={FADE}
				className="absolute left-[20px] top-[22px] text-[20px] font-semibold leading-[24px] tracking-tight"
			>
				Din varukorg
			</motion.div>

			{/* the two ordered items — travel menu -> cart */}
			<OrderedRow topBase={84} dy={-18} name="Cortado" price="42 kr" />
			<OrderedRow topBase={138} dy={-18} name="Flat white" price="48 kr" />

			{/* the un-ordered third product — menu only */}
			<motion.div
				variants={menuOnlyV}
				transition={FADE}
				className="absolute left-[20px] top-[192px] flex h-[46px] w-[224px] items-center gap-3 rounded-md px-3"
				style={{ backgroundColor: CHIP }}
			>
				<span className="h-[26px] w-[26px] shrink-0 rounded-full" style={{ backgroundColor: DOT }} />
				<span className="min-w-0 flex-1 text-[14px] font-medium leading-none">Filterkaffe</span>
				<span className="shrink-0 text-[13px] leading-none" style={{ color: SOFT }}>
					32 kr
				</span>
			</motion.div>

			{/* cart total — label stays, value travels into the receipt */}
			<motion.div
				variants={totalLabelV}
				transition={FADE}
				className="absolute left-[20px] top-[366px] text-[14px] font-medium leading-none"
				style={{ color: SOFT }}
			>
				Totalt
			</motion.div>
			<motion.div
				variants={totalValueV}
				transition={{ default: SPRING, opacity: FADE }}
				className="absolute left-[186px] top-[362px] text-[17px] font-semibold leading-none"
			>
				90 kr
			</motion.div>
			<motion.div
				variants={receiptTextV(6)}
				transition={FADE}
				className="absolute left-[139px] top-[260px] text-[11px] leading-none"
				style={{ color: SOFT }}
			>
				betalt
			</motion.div>

			{/* the dark CTA — persists menu -> cart, label crossfades */}
			<motion.div
				variants={ctaV}
				transition={FADE}
				className="absolute left-[20px] top-[414px] flex h-[46px] w-[224px] items-center justify-center rounded-md"
				style={{ backgroundColor: INK }}
			>
				<motion.span
					variants={tillLabelV}
					transition={FADE}
					className="absolute text-[14px] font-medium"
					style={{ color: PAPER }}
				>
					Till kassan
				</motion.span>
				<motion.span
					variants={betalaLabelV}
					transition={FADE}
					className="absolute text-[14px] font-semibold"
					style={{ color: PAPER }}
				>
					Betala
				</motion.span>
			</motion.div>

			{/* receipt */}
			<motion.div
				variants={checkV}
				transition={SPRING}
				className="absolute left-1/2 top-[138px] flex h-[52px] w-[52px] -translate-x-1/2 items-center justify-center rounded-full"
				style={{ backgroundColor: INK, color: PAPER }}
			>
				<CheckIcon className="h-6 w-6" />
			</motion.div>
			<motion.div
				variants={receiptTextV(8)}
				transition={FADE}
				className="absolute inset-x-0 top-[202px] text-center text-[20px] font-semibold tracking-tight"
			>
				Tack!
			</motion.div>
			<motion.div
				variants={receiptTextV(8)}
				transition={FADE}
				className="absolute inset-x-0 top-[233px] text-center text-[12px] leading-none"
				style={{ color: SOFT }}
			>
				Order #214
			</motion.div>
			<motion.div
				variants={receiptTextV(10)}
				transition={FADE}
				className="absolute inset-x-0 top-[281px] text-center text-[10px] leading-none"
				style={{ color: SOFT }}
			>
				Kvittot är skickat till din mejl
			</motion.div>
		</motion.div>
	);
}

/* ---------- geometry (all offsetParent-chain px, never measured) ---------- */

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
const WALKER: Rect = { x: 132, y: 64, w: 264, h: 480 };
const MINI_TOP = 132;
const MINI_W = 168;
const MINI_H = 344;
const MINI_X: Record<ScreenKey, number> = { menu: 470, cart: 730, receipt: 990 };
const FLOW_Y = MINI_TOP + MINI_H / 2; // 304

/* ---------- the three map frames: the flow, real CoffeeScreens ---------- */

function MapFrame({
	screenKey,
	index,
	active,
	onSelect,
}: {
	screenKey: ScreenKey;
	index: number;
	active: boolean;
	onSelect: (index: number) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(index)}
			aria-label={`walk to ${screenKey}`}
			className="group absolute cursor-pointer text-left focus-visible:outline-none"
			style={{ left: MINI_X[screenKey], top: MINI_TOP, width: MINI_W, height: MINI_H }}
		>
			{/* mono name tab — lifts and warms on hover, thread when the walk is here */}
			<span
				className={cn(
					"absolute -top-[26px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none transition-all duration-200 group-hover:-translate-y-[3px]",
					active ? "text-thread" : "text-muted group-hover:text-text",
				)}
			>
				<span className="text-[8px] opacity-70">{active ? "▶" : "▸"}</span>
				{screenKey}
			</span>

			{/* the real product frame, light on the dark canvas */}
			<div className="relative h-full w-full">
				<CoffeeScreen screen={screenKey} scale="canvas" />
			</div>

			{/* the walk is currently here: a soft thread tint (never the walker's bright ring) */}
			<div
				className={cn(
					"pointer-events-none absolute -inset-[3px] rounded-[13px] border border-thread/35 transition-opacity duration-300 group-hover:opacity-0",
					active ? "opacity-100" : "opacity-0",
				)}
			/>

			{/* hover: a crisper thread selection ring + corner ticks */}
			<div className="pointer-events-none absolute -inset-[5px] rounded-[15px] border-[1.5px] border-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
			{[
				"-left-[9px] -top-[9px]",
				"-right-[9px] -top-[9px]",
				"-bottom-[9px] -left-[9px]",
				"-bottom-[9px] -right-[9px]",
			].map((pos) => (
				<span
					key={pos}
					className={cn(
						"pointer-events-none absolute h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-thread bg-on-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100",
						pos,
					)}
				/>
			))}
		</button>
	);
}

/* ---------- flow arrows: the red thread, in sequence ---------- */

function FlowArrows() {
	const legs = [
		{ from: MINI_X.menu + MINI_W, to: MINI_X.cart, delay: 0 },
		{ from: MINI_X.cart + MINI_W, to: MINI_X.receipt, delay: 0.9 },
	];
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1280 660"
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<marker
					id="flow-ah"
					viewBox="0 0 8 8"
					refX="6"
					refY="4"
					markerWidth="7"
					markerHeight="7"
					markerUnits="userSpaceOnUse"
					orient="auto"
				>
					<path d="M1 1 8 4 1 7Z" fill="var(--color-thread)" fillOpacity="0.85" />
				</marker>
			</defs>
			{legs.map((leg) => (
				<g key={leg.from}>
					<line
						x1={leg.from + 7}
						y1={FLOW_Y}
						x2={leg.to - 8}
						y2={FLOW_Y}
						stroke="var(--color-thread)"
						strokeWidth="1.6"
						strokeOpacity="0.6"
						markerEnd="url(#flow-ah)"
					/>
					<motion.circle
						cx={leg.from + 7}
						cy={FLOW_Y}
						r="2.4"
						fill="var(--color-thread)"
						animate={{ x: [0, leg.to - leg.from - 15], opacity: [0, 1, 1, 0] }}
						transition={{
							duration: 1.7,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
							repeatDelay: 1.1,
							delay: leg.delay,
						}}
					/>
				</g>
			))}
		</svg>
	);
}

/* ---------- the player pill beneath the walker ---------- */

function StepDot({ active, onSelect, name }: { active: boolean; onSelect: () => void; name: string }) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={`walk to ${name}`}
			className="group flex h-4 w-4 cursor-pointer items-center justify-center focus-visible:outline-none"
		>
			<span className="relative flex h-2 w-2 items-center justify-center">
				{active ? <span className="absolute -inset-[3px] rounded-full border border-thread/40" /> : null}
				<span
					className={cn(
						"h-1.5 w-1.5 rounded-full transition-colors",
						active ? "bg-thread" : "bg-border-raised group-hover:bg-muted",
					)}
				/>
			</span>
		</button>
	);
}

function PlayerPill({ screen, onSelect }: { screen: number; onSelect: (index: number) => void }) {
	return (
		<div className="flex w-[300px] items-center gap-3 rounded-full border border-border-raised bg-bg/85 px-4 py-2.5 backdrop-blur-sm">
			<motion.span
				className="text-thread"
				animate={{ opacity: [0.55, 1, 0.55] }}
				transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<PlayTri className="h-2.5 w-2.5" />
			</motion.span>
			<div className="w-[58px] overflow-hidden">
				<motion.span
					key={screen}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="block truncate font-mono text-[11px] leading-none text-text"
				>
					{keyOf(screen)}
				</motion.span>
			</div>
			<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
				<motion.div
					key={screen}
					className="h-full w-full origin-left rounded-full bg-thread"
					initial={{ scaleX: 0 }}
					animate={{ scaleX: 1 }}
					transition={{ duration: LEG_MS / 1000, ease: "linear" }}
				/>
			</div>
			<div className="flex items-center gap-2 pl-0.5">
				{ORDER.map((name, i) => (
					<StepDot key={name} name={name} active={screen === i} onSelect={() => onSelect(i)} />
				))}
			</div>
		</div>
	);
}

/* ---------- the stage ---------- */

function Stage() {
	const [screen, setScreen] = useState(0);
	const [pausedUntil, setPausedUntil] = useState(0);
	const screenKey = keyOf(screen);

	// Auto-advance on a slow loop. A manual take-over sets pausedUntil ~10s out;
	// the timer simply waits that long before the next leg, then resumes.
	useEffect(() => {
		const wait = Math.max(LEG_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => setScreen((s) => (s + 1) % ORDER.length), wait);
		return () => window.clearTimeout(id);
	}, [screen, pausedUntil]);

	function select(index: number) {
		setScreen(index);
		setPausedUntil(Date.now() + PAUSE_MS);
	}

	return (
		<div
			className="relative mx-auto h-[660px] w-[1280px] overflow-hidden rounded-2xl border border-border bg-canvas"
			style={dotGrid}
		>
			{/* lighting: thread halo behind the walker + an edge vignette */}
			<div
				className="pointer-events-none absolute h-[560px] w-[560px] rounded-full"
				style={{
					left: WALKER.x + WALKER.w / 2 - 280,
					top: WALKER.y + WALKER.h / 2 - 280,
					background:
						"radial-gradient(circle, color-mix(in srgb, var(--color-thread) 15%, transparent) 0%, transparent 64%)",
				}}
			/>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(94% 84% at 34% 44%, rgba(255,255,255,0.02) 0%, transparent 38%, rgba(0,0,0,0.5) 100%)",
				}}
			/>

			<FlowArrows />

			{/* the flow, three real product frames */}
			<MapFrame screenKey="menu" index={0} active={screen === 0} onSelect={select} />
			<MapFrame screenKey="cart" index={1} active={screen === 1} onSelect={select} />
			<MapFrame screenKey="receipt" index={2} active={screen === 2} onSelect={select} />

			{/* the live walker — lit, ringed, playing the flow */}
			<div className="absolute" style={{ left: WALKER.x, top: WALKER.y }}>
				<div className="absolute -top-[26px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none text-thread">
					<span className="text-[8px] opacity-70">▶</span>
					<span className="relative block h-3 w-[70px]">
						<motion.span
							key={screen}
							initial={{ opacity: 0, y: 3 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.42, ease: "easeOut" }}
							className="absolute inset-0"
						>
							{screenKey}
						</motion.span>
					</span>
				</div>
				<div className="pointer-events-none absolute -inset-[7px] rounded-[24px] border-[1.5px] border-thread/55" />
				{[
					{ l: -11, t: -11 },
					{ l: WALKER.w + 3, t: -11 },
					{ l: -11, t: WALKER.h + 3 },
					{ l: WALKER.w + 3, t: WALKER.h + 3 },
				].map((c) => (
					<span
						key={`${c.l}-${c.t}`}
						className="pointer-events-none absolute h-2 w-2 rounded-[2px] border-[1.5px] border-thread bg-on-thread"
						style={{ left: c.l, top: c.t }}
					/>
				))}
				<div
					className="relative overflow-hidden rounded-[18px] border"
					style={{ width: WALKER.w, height: WALKER.h, borderColor: HAIR, backgroundColor: PAPER }}
				>
					<WalkViewport screenKey={screenKey} />
				</div>
			</div>

			{/* the player pill, centered beneath the walker */}
			<div
				className="absolute"
				style={{ left: WALKER.x + WALKER.w / 2 - 150, top: WALKER.y + WALKER.h + 18 }}
			>
				<PlayerPill screen={screen} onSelect={select} />
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

/* ---------- stance + shell (kept from landing--stage) ---------- */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{ k: "your disk", v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts." },
	{ k: "real depth", v: "frames are real tsx. arbitrary js, real motion, real state." },
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

export default function LandingStageFlow() {
	return (
		<div className="relative flex min-h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* header */}
			<header className="flex shrink-0 items-center justify-between px-20 py-9">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>spool.page</span>
					<a
						href="https://github.com/liamvinberg/spool"
						className="text-text transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			{/* hero — type-led, centered, premium restraint */}
			<section className="flex shrink-0 flex-col items-center px-8 pt-10 text-center">
				<h1 className="text-[84px] font-semibold leading-[0.97] tracking-[-0.025em]">
					feel an app
					<br />
					before it exists
				</h1>
				<p className="mt-7 max-w-[560px] text-[18px] leading-[27px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames on an infinite canvas and links
					them into walkable flows. you feel the real thing, interactions and motion and inputs, before
					it exists.
				</p>

				<div className="mt-9 w-fit rounded-xl border border-border bg-surface/40 px-6 py-5 text-left">
					<div className="w-[300px] font-mono text-[15px] leading-[30px]">
						<CommandLine command="npm i -g spool.page" />
						<CommandLine command="spool init" />
						<CommandLine command="spool serve" />
					</div>
				</div>
				<div className="mt-5 font-mono text-xs text-muted">
					requires node 22+ · best in chrome · macos-first today
				</div>
			</section>

			{/* connective thread down into the canvas */}
			<div className="relative flex shrink-0 justify-center py-9">
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
			<section className="shrink-0">
				<Stage />
			</section>

			{/* stance — quiet, four across */}
			<section className="mt-auto px-20 pt-16">
				<div className="grid grid-cols-4 gap-8 border-t border-border pt-9">
					{stance.map((s, i) => (
						<div key={s.k}>
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-[11px] text-thread">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span className="text-[15px] font-semibold tracking-tight">{s.k}</span>
							</div>
							<p className="mt-2 text-[13px] leading-[20px] text-muted">{s.v}</p>
						</div>
					))}
				</div>
			</section>

			{/* footer */}
			<footer className="mt-14 flex shrink-0 items-center justify-between border-t border-border px-20 py-8">
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
