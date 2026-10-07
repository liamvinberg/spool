import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { type CoffeeScreenName, CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * People and their agents on one team canvas, in motion (DEV-113, round two).
 *
 * Every take plays the same eighteen seconds, so the only thing that differs between
 * two frames is how presence is drawn. You are Liam on kaffe's team project.
 *
 *   0.0   Jonas's Codex is reading `receipt`, Jonas himself is on `menu`
 *   1.0   Ana's Claude takes `cart` in, then writes three blocks and takes a picture
 *   6.4   Codex moves from `receipt` to `checkout`
 *   7.5   you press Ana's face and follow her; the camera glides to `cart`
 *   9.2   Jonas goes to look at what his agent is doing on `checkout`
 *  10.6   you double-click `cart` and enter it while Claude is still on it
 *  12.4   two more writes land with you inside
 *  15.5   esc, and the camera goes back out
 *
 * Everything on screen is a function of one clock, so the scrubber under the window
 * can stop any moment and the takes stay comparable frame for frame.
 *
 * Prototype only. The cast, the colours and the block each write lands in are staged.
 */

export type Take = "hand" | "radar" | "ghost" | "scan" | "leash" | "orbit";

/* ---------- time ---------- */

const TOTAL = 18;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
	const v = clamp01(x);
	return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const out = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

interface Key {
	/** arrives here at this second */
	readonly at: number;
	/** having moved for this long */
	readonly d: number;
	readonly x: number;
	readonly y: number;
}

/** where a keyed thing is at t: holding at a key, or easing toward the next one */
function along(keys: readonly Key[], t: number): { x: number; y: number } {
	let i = 0;
	while (i + 1 < keys.length && (keys[i + 1]?.at ?? Number.POSITIVE_INFINITY) <= t) i += 1;
	const cur = keys[i];
	if (cur === undefined) return { x: 0, y: 0 };
	const next = keys[i + 1];
	if (next === undefined) return { x: cur.x, y: cur.y };
	const start = next.at - next.d;
	if (t <= start) return { x: cur.x, y: cur.y };
	const p = ease((t - start) / next.d);
	return { x: lerp(cur.x, next.x, p), y: lerp(cur.y, next.y, p) };
}

function useClock(start: number, paused: boolean) {
	const [t, setT] = useState(start);
	const [playing, setPlaying] = useState(!paused);
	const [slow, setSlow] = useState(false);
	const now = useRef(start);
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (stamp: number) => {
			const dt = Math.min(0.1, (stamp - last) / 1000);
			last = stamp;
			now.current = (now.current + dt * (slow ? 0.35 : 1)) % TOTAL;
			setT(now.current);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, slow]);
	const seek = (at: number) => {
		now.current = at;
		setT(at);
	};
	return { t, playing, setPlaying, slow, setSlow, seek };
}

/* ---------- the world ---------- */

type Name = "menu" | "cart" | "receipt" | "checkout";
const NAMES: readonly Name[] = ["menu", "cart", "receipt", "checkout"];
const SCREEN: Record<Exclude<Name, "cart">, CoffeeScreenName> = { menu: "menu", receipt: "receipt", checkout: "cart" };

const FW = 190;
const FH = 411;
const GAP = 64;
const WORLD_W = NAMES.length * FW + (NAMES.length - 1) * GAP;

interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

const fx = (name: Name) => NAMES.indexOf(name) * (FW + GAP);
const frameBox = (name: Name): Box => ({ x: fx(name), y: 0, w: FW, h: FH });

type BlockId = "head" | "row0" | "row1" | "row2" | "total" | "cta";

/** cart's blocks in its own coordinates; the cart below is laid out from these, so a plate is exact */
const BLOCK: Record<BlockId, Box> = {
	head: { x: 16, y: 18, w: 158, h: 22 },
	row0: { x: 16, y: 54, w: 158, h: 30 },
	row1: { x: 16, y: 92, w: 158, h: 30 },
	row2: { x: 16, y: 130, w: 158, h: 30 },
	total: { x: 16, y: 328, w: 158, h: 20 },
	cta: { x: 16, y: 359, w: 158, h: 34 },
};

function blockBox(id: BlockId): Box {
	const b = BLOCK[id];
	return { x: fx("cart") + b.x, y: b.y, w: b.w, h: b.h };
}

/* ---------- the cast ---------- */

interface Person {
	readonly id: string;
	readonly name: string;
	readonly color: string;
}

const ANA: Person = { id: "ana", name: "Ana", color: "#7f9cff" };
const JONAS: Person = { id: "jonas", name: "Jonas", color: "#e6b450" };
const YOU: Person = { id: "you", name: "Liam", color: "#f0efed" };

type Hold = "whole" | "part" | "shot";

interface Seg {
	readonly from: number;
	readonly to: number;
	readonly frame: Name;
	readonly hold: Hold;
}

interface AgentScript {
	readonly owner: Person;
	readonly engine: string;
	readonly segs: readonly Seg[];
	/** a move between frames, if the agent makes one */
	readonly travel: { readonly from: number; readonly to: number; readonly a: Name; readonly b: Name } | null;
}

const CLAUDE: AgentScript = {
	owner: ANA,
	engine: "Claude",
	segs: [
		{ from: 1.0, to: 3.2, frame: "cart", hold: "whole" },
		{ from: 3.2, to: 6.6, frame: "cart", hold: "part" },
		{ from: 6.6, to: 7.6, frame: "cart", hold: "shot" },
		{ from: 7.6, to: 11.6, frame: "cart", hold: "whole" },
		{ from: 11.6, to: 14.4, frame: "cart", hold: "part" },
		{ from: 14.4, to: 15.2, frame: "cart", hold: "shot" },
	],
	travel: null,
};

const CODEX: AgentScript = {
	owner: JONAS,
	engine: "Codex",
	segs: [
		{ from: 0, to: 6.4, frame: "receipt", hold: "whole" },
		{ from: 7.2, to: 10.8, frame: "checkout", hold: "whole" },
		{ from: 10.8, to: 11.6, frame: "checkout", hold: "shot" },
	],
	travel: { from: 6.4, to: 7.2, a: "receipt", b: "checkout" },
};

const AGENTS: readonly AgentScript[] = [CLAUDE, CODEX];

const WRITES: readonly { readonly at: number; readonly block: BlockId }[] = [
	{ at: 3.6, block: "row2" },
	{ at: 4.8, block: "total" },
	{ at: 6.0, block: "cta" },
	{ at: 12.4, block: "head" },
	{ at: 13.6, block: "row1" },
];

/** people's own pointers, in world coordinates */
const CURSORS: Record<"ana" | "jonas", readonly Key[]> = {
	ana: [
		{ at: 0, d: 0, x: fx("cart") + FW + 34, y: 210 },
		{ at: 2.6, d: 1.4, x: fx("cart") + FW + 18, y: 250 },
		{ at: 5.2, d: 1.2, x: fx("cart") + 150, y: 170 },
		{ at: 8.6, d: 1.6, x: fx("cart") + 120, y: 290 },
		{ at: 12.6, d: 1.4, x: fx("cart") + 150, y: 120 },
		{ at: 16.8, d: 1.6, x: fx("cart") + FW + 34, y: 210 },
	],
	jonas: [
		{ at: 0, d: 0, x: fx("menu") + 120, y: 150 },
		{ at: 4.4, d: 1.6, x: fx("menu") + 80, y: 262 },
		{ at: 8.6, d: 1.4, x: fx("menu") + 140, y: 200 },
		{ at: 10.2, d: 1.4, x: fx("checkout") + 110, y: 170 },
		{ at: 14.4, d: 1.4, x: fx("checkout") + 70, y: 300 },
		{ at: 17.9, d: 1.6, x: fx("menu") + 120, y: 150 },
	],
};

/* ---------- the scene at t ---------- */

interface Live {
	readonly script: AgentScript;
	readonly seg: Seg | null;
	/** seconds into the segment */
	readonly into: number;
	/** 0..1 of the segment still to run */
	readonly left: number;
	/** world point the agent is working at */
	readonly frame: Name | null;
	/** mid-move between frames, 0..1 */
	readonly moving: number | null;
}

function liveOf(script: AgentScript, t: number): Live {
	const seg = script.segs.find((s) => t >= s.from && t < s.to) ?? null;
	const trav = script.travel;
	if (seg === null && trav !== null && t >= trav.from && t < trav.to) {
		return { script, seg: null, into: 0, left: 0, frame: null, moving: (t - trav.from) / (trav.to - trav.from) };
	}
	return {
		script,
		seg,
		into: seg === null ? 0 : t - seg.from,
		left: seg === null ? 0 : seg.to - t,
		frame: seg?.frame ?? null,
		moving: null,
	};
}

/** the segment before this one, if the agent held the same frame straight through */
function prevOf(script: AgentScript, seg: Seg): Seg | null {
	return script.segs.find((s) => s.to === seg.from && s.frame === seg.frame) ?? null;
}
function nextOf(script: AgentScript, seg: Seg): Seg | null {
	return script.segs.find((s) => s.from === seg.to && s.frame === seg.frame) ?? null;
}

const revAt = (t: number) => WRITES.filter((w) => w.at <= t).length;

/** the write the agent is about to land or just landed, inside a part hold */
function blockNow(t: number): BlockId {
	const near = WRITES.find((w) => w.at >= t - 0.5) ?? WRITES[WRITES.length - 1];
	return near?.block ?? "row2";
}

/** a write's ink: opens 140ms, holds 320, leaves 400 (the shipped hand's envelope) */
function plateInk(since: number): number {
	if (since < 0 || since > 0.86) return 0;
	if (since < 0.14) return out(since / 0.14);
	if (since < 0.46) return 1;
	return 1 - ease((since - 0.46) / 0.4);
}

/* ---------- the camera ---------- */

const VIEW_W = 1440 - 248 - 44;
const VIEW_H = 900 - 44;

const CAMERA: readonly { at: number; d: number; cx: number; cy: number; k: number }[] = [
	{ at: 0, d: 0, cx: WORLD_W / 2, cy: FH / 2 - 6, k: 1 },
	{ at: 8.8, d: 1.2, cx: fx("cart") + FW / 2, cy: FH / 2 - 10, k: 1.62 },
	{ at: 11.3, d: 0.7, cx: fx("cart") + FW / 2, cy: FH / 2 - 14, k: 1.74 },
	{ at: 16.9, d: 1.3, cx: WORLD_W / 2, cy: FH / 2 - 6, k: 1 },
];

interface Camera {
	readonly k: number;
	readonly tx: number;
	readonly ty: number;
}

function cameraAt(t: number): Camera {
	let i = 0;
	while (i + 1 < CAMERA.length && (CAMERA[i + 1]?.at ?? 99) <= t) i += 1;
	const cur = CAMERA[i];
	const next = CAMERA[i + 1];
	let cx = cur?.cx ?? 0;
	let cy = cur?.cy ?? 0;
	let k = cur?.k ?? 1;
	if (cur !== undefined && next !== undefined && t > next.at - next.d) {
		const p = ease((t - (next.at - next.d)) / next.d);
		cx = lerp(cur.cx, next.cx, p);
		cy = lerp(cur.cy, next.cy, p);
		// zoom in log space so the glide feels even
		k = Math.exp(lerp(Math.log(cur.k), Math.log(next.k), p));
	}
	return { k, tx: VIEW_W / 2 - cx * k, ty: VIEW_H / 2 - cy * k + 10 };
}

const FOLLOW = { from: 7.5, to: 10.6 };
const ENTER = { from: 10.8, to: 15.5 };

/* ---------- the frame ---------- */

const MOMENTS: readonly { at: number; label: string }[] = [
	{ at: 0, label: "Codex reads receipt" },
	{ at: 1, label: "Claude takes cart in" },
	{ at: 3.2, label: "Claude writes" },
	{ at: 6.4, label: "Codex moves" },
	{ at: 7.5, label: "you follow Ana" },
	{ at: 10.6, label: "you enter cart" },
	{ at: 12.2, label: "writes land on you" },
	{ at: 15.5, label: "esc" },
];

export function PresenceScene({ take, start = 0, paused = false }: { take: Take; start?: number; paused?: boolean }) {
	const clock = useClock(start, paused);
	const t = clock.t;
	const cam = cameraAt(t);
	const following = t >= FOLLOW.from && t < FOLLOW.to;
	const entered = t >= ENTER.from && t < ENTER.to;
	const lives = AGENTS.map((a) => liveOf(a, t));
	const stage: Stage = { t, cam, lives, following, entered };
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative h-[900px] shrink-0">
				<SpoolShell activeTab="kaffe" tabs={["kaffe"]} headerAccessory={<Stack t={t} take={take} />}>
					<CanvasChrome pages={[{ name: "app", frames: NAMES, active: true, open: true }]} rail={null}>
						<div className="absolute inset-0 overflow-hidden">
							<div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})` }}>
								{NAMES.map((name) => (
									<Frame key={name} name={name} stage={stage} />
								))}
								<World take={take} stage={stage} />
							</div>
							<Screen take={take} stage={stage} />
						</div>
					</CanvasChrome>
				</SpoolShell>
				<You t={t} />
			</div>
			<Scrubber clock={clock} />
		</div>
	);
}

interface Stage {
	readonly t: number;
	readonly cam: Camera;
	readonly lives: readonly Live[];
	readonly following: boolean;
	readonly entered: boolean;
}

function Frame({ name, stage }: { name: Name; stage: Stage }) {
	const f = frameBox(name);
	const k = stage.cam.k;
	const live = stage.entered && name === "cart";
	return (
		<div className="absolute" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
			<div className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap" style={{ width: f.w * k, transform: `scale(${1 / k})` }}>
				<div className="relative flex h-[30px] w-full min-w-0 items-center gap-1.5 pb-2.5">
					{live ? (
						<span className="rounded-xs bg-thread px-2 py-[3px] text-on-thread type-detail">live · esc exits</span>
					) : (
						<span className="min-w-0 truncate text-muted type-value">{name}</span>
					)}
				</div>
			</div>
			<div className={cn("h-full w-full rounded-lg", live && "outline-2 outline-offset-4 outline-thread")}>
				{name === "cart" ? <Cart rev={revAt(stage.t)} /> : <CoffeeScreen screen={SCREEN[name]} actionLabel={name === "checkout" ? "Pay" : undefined} />}
			</div>
		</div>
	);
}

/** kaffe's cart, laid out from `BLOCK` so every write has an exact box */
function Cart({ rev }: { rev: number }) {
	const rows = [
		{ id: "row0" as const, name: "1 × Cortado", price: "$4.20" },
		{ id: "row1" as const, name: rev >= 5 ? "1 × Oat flat white" : "1 × Flat white", price: rev >= 5 ? "$5.10" : "$4.80" },
		...(rev >= 1 ? [{ id: "row2" as const, name: "1 × Filter coffee", price: "$3.20" }] : []),
	];
	const total = rev >= 5 ? "$12.50" : rev >= 2 ? "$12.20" : "$9.00";
	const at = (id: BlockId) => ({ left: BLOCK[id].x, top: BLOCK[id].y, width: BLOCK[id].w, height: BLOCK[id].h });
	return (
		<div className="relative h-full w-full overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<div className="absolute flex items-center text-[16px] font-semibold leading-5 tracking-tight" style={at("head")}>
				{rev >= 4 ? "Your order" : "Your cart"}
			</div>
			{rows.map((row) => (
				<div key={row.id} className="absolute flex items-center justify-between rounded-md bg-[#EFEFF1] px-1.5 text-2xs" style={at(row.id)}>
					<span className="font-medium">{row.name}</span>
					<span className="text-[9px] text-[#86868B]">{row.price}</span>
				</div>
			))}
			<div className="absolute flex items-baseline justify-between px-0.5" style={at("total")}>
				<span className="text-[9px] text-[#86868B]">Total</span>
				<span className="text-[12px] font-semibold">{total}</span>
			</div>
			<div className="absolute flex items-center justify-center rounded-md bg-[#17171A] text-[11px] font-medium text-[#ffffff]" style={at("cta")}>
				{rev >= 3 ? `Pay ${total}` : "Pay"}
			</div>
		</div>
	);
}

/* ---------- shared pieces ---------- */

/** a point in world coordinates holding something drawn at screen size */
function Pin({ x, y, k, children, style }: { x: number; y: number; k: number; children: ReactNode; style?: React.CSSProperties }) {
	return (
		<div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${x}px, ${y}px) scale(${1 / k})`, ...style }}>
			{children}
		</div>
	);
}

function Arrow({ color, hollow = false, size = 1 }: { color: string; hollow?: boolean; size?: number }) {
	return (
		<svg width={14 * size} height={18 * size} viewBox="0 0 14 18" aria-hidden="true" className="block">
			<path
				d="M1 1v14l3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5H12Z"
				fill={hollow ? "#0e0e0e" : color}
				stroke={hollow ? color : "#0e0e0e"}
				strokeWidth={hollow ? 1.6 : 1}
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Cursor({ who, x, y, k, t, small = false }: { who: Person; x: number; y: number; k: number; t: number; small?: boolean }) {
	// a hand on a mouse is never still: a few pixels of drift on top of where it is going
	const jx = Math.sin(t * 1.3 + who.name.length) * 2.5;
	const jy = Math.cos(t * 1.1 + who.name.length) * 2;
	return (
		<Pin x={x} y={y} k={k}>
			<div className="flex items-start" style={{ transform: `translate(${jx}px, ${jy}px)` }}>
				{small ? <span className="mt-0.5 h-2 w-2 rounded-full" style={{ background: who.color }} /> : <Arrow color={who.color} />}
				<span className="ml-0.5 mt-3 rounded-xs px-1.5 py-px text-[11px] font-medium leading-4 text-[#0e0e0e]" style={{ background: who.color }}>
					{who.name}
				</span>
			</div>
		</Pin>
	);
}

function Face({ who, size = 18, ring = 0, spin = 0, dim = false }: { who: Person; size?: number; ring?: number; spin?: number; dim?: boolean }) {
	const r = size / 2 + 4;
	const c = 2 * Math.PI * r;
	return (
		<span className="relative flex shrink-0 items-center justify-center" style={{ width: size + 10, height: size + 10, opacity: dim ? 0.4 : 1 }}>
			{ring > 0 ? (
				<svg viewBox={`0 0 ${size + 10} ${size + 10}`} className="absolute inset-0" style={{ transform: `rotate(${spin}deg)` }} aria-hidden="true">
					<circle cx={(size + 10) / 2} cy={(size + 10) / 2} r={r} fill="none" stroke={who.color} strokeOpacity={0.25 * ring} strokeWidth="1.5" />
					<circle
						cx={(size + 10) / 2}
						cy={(size + 10) / 2}
						r={r}
						fill="none"
						stroke={who.color}
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeDasharray={`${c * 0.28 * ring} ${c}`}
					/>
				</svg>
			) : null}
			<span
				className="flex items-center justify-center rounded-full font-semibold text-[#0e0e0e]"
				style={{ width: size, height: size, background: who.color, fontSize: size * 0.55 }}
			>
				{who.name[0]}
			</span>
		</span>
	);
}

/** is this agent working right now, eased on and off so rings and marks draw rather than pop */
function activity(live: Live): number {
	if (live.moving !== null) return 1;
	if (live.seg === null) return 0;
	const prev = prevOf(live.script, live.seg);
	const next = nextOf(live.script, live.seg);
	const on = prev === null ? out(live.into / 0.35) : 1;
	const off = next === null ? out(live.left / 0.35) : 1;
	return Math.min(on, off);
}

/** who is in the window, at the right of the bar; a running agent turns a ring round its owner */
function Stack({ t, take }: { t: number; take: Take }) {
	const ring = (who: Person) => {
		const live = AGENTS.filter((a) => a.owner === who).map((a) => liveOf(a, t));
		return Math.max(0, ...live.map(activity));
	};
	const press = t >= 7.35 && t < 7.65 ? 1 - Math.abs(t - 7.5) / 0.15 : 0;
	return (
		<span className="flex items-center -space-x-1.5">
			<Face who={YOU} size={20} />
			{[ANA, JONAS].map((p) => (
				<span key={p.id} style={{ transform: p === ANA ? `scale(${1 - press * 0.12})` : undefined }}>
					<Face who={p} size={20} ring={take === "orbit" ? 0 : ring(p)} spin={t * 310} />
				</span>
			))}
		</span>
	);
}

/** your own pointer, in the window's coordinates: it presses Ana's face, then double-clicks cart */
function You({ t }: { t: number }) {
	const at = along(
		[
			{ at: 0, d: 0, x: 720, y: 770 },
			{ at: 7.4, d: 1.0, x: 1394, y: 24 },
			{ at: 9.6, d: 1.4, x: 900, y: 640 },
			{ at: 10.5, d: 0.7, x: 830, y: 470 },
			{ at: 17.4, d: 1.4, x: 720, y: 770 },
		],
		t,
	);
	const clicks = [7.5, 10.55, 10.75];
	const ripple = clicks.map((c) => t - c).find((d) => d >= 0 && d < 0.45);
	const esc = t >= 15.3 && t < 16.4 ? Math.min(out((t - 15.3) / 0.2), out((16.4 - t) / 0.3)) : 0;
	return (
		<>
			<div className="pointer-events-none absolute left-0 top-0 z-30" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
				{ripple === undefined ? null : (
					<span
						className="absolute rounded-full border border-white"
						style={{ left: -12, top: -12, width: 24, height: 24, transform: `scale(${0.4 + ripple * 1.6})`, opacity: 1 - ripple / 0.45 }}
					/>
				)}
				<Arrow color="#ffffff" size={1.05} />
			</div>
			{esc > 0 ? (
				<div className="pointer-events-none absolute bottom-24 left-[822px] z-30 -translate-x-1/2" style={{ opacity: esc, transform: `translate(-50%, ${(1 - esc) * 6}px)` }}>
					<span className="rounded-sm border border-border-raised bg-raised px-2.5 py-1 text-text type-detail">esc</span>
				</div>
			) : null}
		</>
	);
}

/* ---------- what sits in the world, per take ---------- */

function World({ take, stage }: { take: Take; stage: Stage }) {
	const { t, cam } = stage;
	const k = cam.k;
	const ana = along(CURSORS.ana, t);
	const jonas = along(CURSORS.jonas, t);
	const people = (small = false) => (
		<>
			<Cursor who={ANA} x={ana.x} y={ana.y} k={k} t={t} small={small} />
			<Cursor who={JONAS} x={jonas.x} y={jonas.y} k={k} t={t} small={small} />
		</>
	);
	if (take === "hand" || take === "radar") {
		return (
			<>
				{stage.lives.map((live) => (
					<Hand key={live.script.engine} live={live} t={t} k={k} />
				))}
				{people()}
			</>
		);
	}
	if (take === "ghost") {
		return (
			<>
				{stage.lives.map((live) => (
					<Ghost key={live.script.engine} live={live} t={t} k={k} />
				))}
				{people()}
			</>
		);
	}
	if (take === "scan") {
		return (
			<>
				{stage.lives.map((live) => (
					<Scan key={live.script.engine} live={live} t={t} k={k} />
				))}
				{people()}
			</>
		);
	}
	if (take === "leash") {
		return (
			<>
				<Leash live={liveOf(CLAUDE, t)} from={ana} t={t} k={k} />
				<Leash live={liveOf(CODEX, t)} from={jonas} t={t} k={k} />
				{people()}
			</>
		);
	}
	return <Orbit stage={stage} ana={ana} jonas={jonas} />;
}

function Screen({ take, stage }: { take: Take; stage: Stage }) {
	return (
		<>
			{take === "radar" ? <Edges stage={stage} /> : null}
			<Following on={stage.following} t={stage.t} />
		</>
	);
}

function Following({ on, t }: { on: boolean; t: number }) {
	const p = on ? Math.min(out((t - FOLLOW.from) / 0.3), out((FOLLOW.to - t) / 0.2)) : 0;
	if (p <= 0) return null;
	return (
		<>
			<div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${2 * p}px ${ANA.color}` }} />
			<div
				className="absolute left-1/2 top-3 flex items-center gap-2 rounded-xs px-2 py-[3px] text-[#0e0e0e]"
				style={{ background: ANA.color, opacity: p, transform: `translate(-50%, ${(1 - p) * -8}px)` }}
			>
				<span className="text-[12px] font-medium leading-4">Following Ana</span>
				<span className="type-detail opacity-60">esc</span>
			</div>
		</>
	);
}

/* --- hand: the shipped agent hand, in its owner's colour --- */

const PART = 76;

function holdLen(seg: Seg): number {
	return seg.hold === "part" ? PART : FH;
}

function Hand({ live, t, k }: { live: Live; t: number; k: number }) {
	const who = live.script.owner;
	if (live.seg === null) return null;
	const seg = live.seg;
	const f = frameBox(seg.frame);
	const wall = f.x - 12;
	const prev = prevOf(live.script, seg);
	const next = nextOf(live.script, seg);
	// the thread winds off the node and back onto it, and changes length rather than jumping
	const to = holdLen(seg);
	const from = prev === null ? 0 : holdLen(prev);
	let len = lerp(from, to, ease(live.into / 0.4));
	if (next === null) len *= out(live.left / 0.35);
	const mid = f.y + f.h / 2;
	const partCenter = (() => {
		const b = blockBox(blockNow(t));
		return b.y + b.h / 2;
	})();
	const center = seg.hold === "part" ? lerp(mid, partCenter, ease(live.into / 0.4)) : prev?.hold === "part" ? lerp(partCenter, mid, ease(live.into / 0.4)) : mid;
	// tension: an open call pulls the thread taut, and between writes it slackens a little
	const sway = seg.hold === "part" ? Math.sin(t * 9) * 0.6 : 0;
	const nodeOn = prev === null ? out(live.into / 0.25) : 1;
	const nodeOff = next === null ? out(live.left / 0.3) : 1;
	const node = Math.min(nodeOn, nodeOff);
	return (
		<>
			{seg.frame === "cart" ? <Plates t={t} color={who.color} /> : null}
			<div
				className="pointer-events-none absolute rounded-full"
				style={{ left: wall - 1 / k + sway / k, top: center - len / 2, width: 2 / k, height: len, background: who.color }}
			/>
			{seg.hold === "shot" ? <Corners box={f} p={Math.min(out(live.into / 0.3), out(live.left / 0.25))} color={who.color} k={k} /> : null}
			<Pin x={wall} y={mid} k={k}>
				<span
					className="flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-semibold text-[#0e0e0e]"
					style={{ background: who.color, transform: `translate(-50%, -50%) scale(${node})` }}
				>
					{who.name[0]}
				</span>
			</Pin>
		</>
	);
}

function Plates({ t, color, style = "tint" }: { t: number; color: string; style?: "tint" | "develop" }) {
	return (
		<>
			{WRITES.map((w) => {
				const ink = plateInk(t - w.at);
				if (ink <= 0) return null;
				const b = blockBox(w.block);
				const open = out((t - w.at) / 0.14);
				if (style === "develop") {
					const p = clamp01((t - w.at) / 0.86);
					return (
						<div
							key={w.at}
							className="pointer-events-none absolute rounded-[5px]"
							style={{
								left: b.x - 3,
								top: b.y - 3,
								width: b.w + 6,
								height: b.h + 6,
								backdropFilter: `blur(${(1 - out(p)) * 3.5}px)`,
								background: `color-mix(in srgb, ${color} ${Math.round((1 - p) * 30)}%, transparent)`,
							}}
						/>
					);
				}
				return (
					<div
						key={w.at}
						className="pointer-events-none absolute rounded-[5px]"
						style={{
							left: b.x - 2,
							top: b.y - 2,
							width: b.w + 4,
							height: b.h + 4,
							background: color,
							opacity: 0.24 * ink,
							transform: `scale(${0.9 + 0.1 * open}, ${0.6 + 0.4 * open})`,
						}}
					/>
				);
			})}
		</>
	);
}

/** the picture posture: four corners stroked on from their own arms, never closing */
function Corners({ box, p, color, k }: { box: Box; p: number; color: string; k: number }) {
	if (p <= 0) return null;
	const arm = 18 * p;
	const pad = 7;
	const w = 1.6 / k;
	const corners = [
		{ x: box.x - pad, y: box.y - pad, sx: 1, sy: 1 },
		{ x: box.x + box.w + pad, y: box.y - pad, sx: -1, sy: 1 },
		{ x: box.x - pad, y: box.y + box.h + pad, sx: 1, sy: -1 },
		{ x: box.x + box.w + pad, y: box.y + box.h + pad, sx: -1, sy: -1 },
	];
	return (
		<svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
			{corners.map((c) => (
				<path
					key={`${c.x}-${c.y}`}
					d={`M${c.x + c.sx * arm} ${c.y} H${c.x} V${c.y + c.sy * arm}`}
					fill="none"
					stroke={color}
					strokeWidth={w}
					strokeLinecap="round"
				/>
			))}
		</svg>
	);
}

/* --- radar: the hand, plus everyone off screen pinned to the edge they are past --- */

function Edges({ stage }: { stage: Stage }) {
	const { t, cam } = stage;
	const inset = 22;
	const toScreen = (x: number, y: number) => ({ x: cam.tx + x * cam.k, y: cam.ty + y * cam.k });
	const marks: { key: string; who: Person; agent: boolean; x: number; y: number }[] = [];
	const ana = along(CURSORS.ana, t);
	const jonas = along(CURSORS.jonas, t);
	marks.push({ key: "ana", who: ANA, agent: false, ...toScreen(ana.x, ana.y) });
	marks.push({ key: "jonas", who: JONAS, agent: false, ...toScreen(jonas.x, jonas.y) });
	for (const live of stage.lives) {
		const where = agentPoint(live, t);
		if (where === null) continue;
		marks.push({ key: live.script.engine, who: live.script.owner, agent: true, ...toScreen(where.x, where.y) });
	}
	const cx = VIEW_W / 2;
	const cy = VIEW_H / 2;
	const placed: { x: number; y: number }[] = [];
	return (
		<>
			{marks.map((m) => {
				const off = m.x < 0 || m.x > VIEW_W || m.y < 0 || m.y > VIEW_H;
				if (!off) return null;
				const dx = m.x - cx;
				const dy = m.y - cy;
				const s = Math.min((cx - inset) / Math.abs(dx || 1e-6), (cy - inset) / Math.abs(dy || 1e-6));
				const px = cx + dx * s;
				let py = cy + dy * s;
				// two marks on one spot stack along the edge rather than covering each other
				while (placed.some((q) => Math.hypot(q.x - px, q.y - py) < 26)) py += 28;
				placed.push({ x: px, y: py });
				const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
				return (
					<div key={m.key} className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${px}px, ${py}px)` }}>
						<span className="absolute left-0 top-0 h-0 w-0" style={{ transform: `rotate(${angle}deg)` }}>
							<span className="absolute left-[15px] top-[-4px] h-0 w-0 border-y-4 border-l-[6px] border-y-transparent" style={{ borderLeftColor: m.who.color }} />
						</span>
						<span className="absolute -translate-x-1/2 -translate-y-1/2">
							<Face who={m.who} size={18} ring={m.agent ? 1 : 0} spin={t * 310} />
						</span>
					</div>
				);
			})}
		</>
	);
}

/** where an agent is, as one world point: the block it writes, or the head of the frame it reads */
function agentPoint(live: Live, t: number): { x: number; y: number } | null {
	const trav = live.script.travel;
	if (live.moving !== null && trav !== null) {
		const a = frameBox(trav.a);
		const b = frameBox(trav.b);
		const p = ease(live.moving);
		return { x: lerp(a.x + FW / 2, b.x + FW / 2, p), y: 40 - Math.sin(p * Math.PI) * 60 };
	}
	if (live.seg === null) return null;
	const f = frameBox(live.seg.frame);
	if (live.seg.hold === "part") {
		const b = blockBox(blockNow(t));
		return { x: b.x + b.w * 0.35, y: b.y + b.h / 2 };
	}
	return { x: f.x + FW / 2, y: 40 };
}

/* --- ghost: the agent gets a pointer of its own, hollow, and you watch it select and replace --- */

const GHOST_KEYS: Record<string, readonly Key[]> = {
	Claude: [
		{ at: 0, d: 0, x: fx("cart") + 150, y: 26 },
		{ at: 1.0, d: 0, x: fx("cart") + 150, y: 26 },
		{ at: 2.9, d: 1.8, x: fx("cart") + 150, y: 360 },
		{ at: 3.25, d: 0.5, x: fx("cart") + 18, y: 140 },
		{ at: 4.45, d: 0.6, x: fx("cart") + 18, y: 336 },
		{ at: 5.65, d: 0.6, x: fx("cart") + 18, y: 372 },
		{ at: 6.8, d: 0.7, x: fx("cart") - 4, y: -4 },
		{ at: 8.3, d: 0.8, x: fx("cart") + 150, y: 26 },
		{ at: 11.4, d: 3.0, x: fx("cart") + 150, y: 360 },
		{ at: 12.05, d: 0.6, x: fx("cart") + 18, y: 26 },
		{ at: 13.25, d: 0.6, x: fx("cart") + 18, y: 103 },
		{ at: 14.6, d: 0.7, x: fx("cart") - 4, y: -4 },
	],
	Codex: [
		{ at: 0, d: 0, x: fx("receipt") + 140, y: 40 },
		{ at: 3.0, d: 3.0, x: fx("receipt") + 140, y: 370 },
		{ at: 6.2, d: 3.0, x: fx("receipt") + 140, y: 60 },
		{ at: 7.2, d: 0.9, x: fx("checkout") + 140, y: 40 },
		{ at: 10.6, d: 3.4, x: fx("checkout") + 140, y: 370 },
		{ at: 11.0, d: 0.4, x: fx("checkout") - 4, y: -4 },
	],
};

function Ghost({ live, t, k }: { live: Live; t: number; k: number }) {
	const who = live.script.owner;
	const keys = GHOST_KEYS[live.script.engine] ?? [];
	const show = activity(live);
	if (show <= 0) return null;
	const at = along(keys, t);
	const typing = live.seg?.hold === "part";
	// a selection sweeps across the block in the 400ms before the write replaces it
	const sweep = live.script === CLAUDE ? WRITES.find((w) => t >= w.at - 0.42 && t < w.at) : undefined;
	const flash = live.seg?.hold === "shot" ? Math.max(0, 1 - Math.abs(live.into - 0.35) / 0.25) : 0;
	const f = live.seg === null ? null : frameBox(live.seg.frame);
	return (
		<>
			{live.script === CLAUDE ? <Plates t={t} color={who.color} /> : null}
			{sweep === undefined
				? null
				: (() => {
						const b = blockBox(sweep.block);
						const p = out((t - (sweep.at - 0.42)) / 0.42);
						return (
							<div
								className="pointer-events-none absolute rounded-[3px]"
								style={{ left: b.x - 1, top: b.y - 1, width: (b.w + 2) * p, height: b.h + 2, background: who.color, opacity: 0.32 }}
							/>
						);
					})()}
			{f !== null && flash > 0 ? (
				<div className="pointer-events-none absolute rounded-lg bg-white" style={{ left: f.x, top: f.y, width: f.w, height: f.h, opacity: flash * 0.55 }} />
			) : null}
			<Pin x={at.x} y={at.y} k={k}>
				<div className="flex items-start" style={{ transform: `scale(${out(show)})`, transformOrigin: "0 0" }}>
					<Arrow color={who.color} hollow />
					<span className="ml-0.5 mt-3 flex items-center gap-1 rounded-xs border bg-bg px-1.5 py-px text-[11px] leading-4 text-text" style={{ borderColor: who.color }}>
						{live.script.engine}
						{typing ? <span className="inline-block h-2.5 w-px bg-text" style={{ opacity: Math.sin(t * 14) > 0 ? 1 : 0 }} /> : null}
					</span>
				</div>
			</Pin>
		</>
	);
}

/* --- scan: agents are light; reading sweeps the frame, writing develops the block --- */

function Scan({ live, t, k }: { live: Live; t: number; k: number }) {
	const who = live.script.owner;
	const show = activity(live);
	const trav = live.script.travel;
	if (live.moving !== null && trav !== null) {
		// between frames the light slides across the gap along the top edge
		const a = frameBox(trav.a);
		const b = frameBox(trav.b);
		const x = lerp(a.x, b.x, ease(live.moving));
		return <div className="pointer-events-none absolute h-[2px] rounded-full" style={{ left: x, top: -6, width: FW, background: who.color, opacity: 0.8 }} />;
	}
	if (live.seg === null || show <= 0) return null;
	const f = frameBox(live.seg.frame);
	const reading = live.seg.hold === "whole";
	const sweepY = ((live.into / 1.9) % 1) * (f.h + 60) - 60;
	const flash = live.seg.hold === "shot" ? Math.max(0, 1 - Math.abs(live.into - 0.35) / 0.25) : 0;
	return (
		<>
			<div className="pointer-events-none absolute overflow-hidden rounded-lg" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
				{reading ? (
					<div
						className="absolute inset-x-0 h-[60px]"
						style={{ top: sweepY, opacity: show, background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${who.color} 22%, transparent) 85%, ${who.color} 100%)` }}
					/>
				) : null}
				{flash > 0 ? <div className="absolute inset-0 bg-white" style={{ opacity: flash * 0.6 }} /> : null}
			</div>
			{live.seg.frame === "cart" ? <Plates t={t} color={who.color} style="develop" /> : null}
			{/* the frame's edge glows in its owner's colour while someone's agent is on it */}
			<div
				className="pointer-events-none absolute rounded-[10px]"
				style={{ left: f.x - 3, top: f.y - 3, width: f.w + 6, height: f.h + 6, boxShadow: `0 0 0 ${1.5 / k}px color-mix(in srgb, ${who.color} ${Math.round(show * 70)}%, transparent)` }}
			/>
			<Pin x={f.x + f.w} y={f.y} k={k}>
				<span className="block -translate-x-1/2 -translate-y-1/2" style={{ transform: `translate(-50%, -50%) scale(${out(show)})` }}>
					<Face who={who} size={16} />
				</span>
			</Pin>
		</>
	);
}

/* --- leash: a line from each person to wherever their agent is working --- */

function Leash({ live, from, t, k }: { live: Live; from: { x: number; y: number }; t: number; k: number }) {
	const who = live.script.owner;
	const show = activity(live);
	const target = agentPoint(live, t);
	if (target === null || show <= 0) return null;
	// the free end reels out from the hand and back into it
	const end = { x: lerp(from.x, target.x, out(show)), y: lerp(from.y, target.y, out(show)) };
	const dist = Math.hypot(end.x - from.x, end.y - from.y);
	const sag = Math.min(90, dist * 0.22) + Math.sin(t * 2.2) * 4;
	const mx = (from.x + end.x) / 2;
	const my = (from.y + end.y) / 2 + sag;
	const writing = live.seg?.hold === "part";
	const landed = live.script === CLAUDE ? WRITES.map((w) => t - w.at).find((d) => d >= 0 && d < 0.6) : undefined;
	return (
		<>
			{live.script === CLAUDE ? <Plates t={t} color={who.color} /> : null}
			<svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
				<path
					d={`M${from.x} ${from.y} Q${mx} ${my} ${end.x} ${end.y}`}
					fill="none"
					stroke={who.color}
					strokeOpacity={0.75}
					strokeWidth={1.5 / k}
					strokeLinecap="round"
					strokeDasharray={writing ? `${5 / k} ${4 / k}` : undefined}
					strokeDashoffset={writing ? (-t * 40) / k : undefined}
				/>
			</svg>
			<Pin x={end.x} y={end.y} k={k}>
				<span className="absolute block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg" style={{ borderColor: who.color }} />
				{landed === undefined ? null : (
					<span
						className="absolute block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
						style={{ borderColor: who.color, transform: `translate(-50%, -50%) scale(${1 + landed * 5})`, opacity: 1 - landed / 0.6 }}
					/>
				)}
				<span className="absolute left-2 top-1.5 whitespace-nowrap text-[10px] leading-3" style={{ color: who.color }}>
					{live.script.engine}
				</span>
			</Pin>
		</>
	);
}

/* --- orbit: no pointers; faces ride the frame labels and an agent is a moon round its owner --- */

/** which frame label each person's face rides, keyed so a move glides along the row */
const FACE_KEYS: Record<"ana" | "jonas" | "you", readonly Key[]> = {
	ana: [{ at: 0, d: 0, x: fx("cart") + FW, y: 0 }],
	jonas: [
		{ at: 0, d: 0, x: fx("menu") + FW, y: 0 },
		{ at: 10.0, d: 0.9, x: fx("checkout") + FW, y: 0 },
		{ at: 17.8, d: 0.9, x: fx("menu") + FW, y: 0 },
	],
	you: [
		{ at: 0, d: 0, x: fx("cart") + FW + 60, y: 0 },
		{ at: 10.9, d: 0.4, x: fx("cart") + FW, y: 0 },
		{ at: 15.9, d: 0.4, x: fx("cart") + FW + 60, y: 0 },
	],
};

function Orbit({ stage, ana, jonas }: { stage: Stage; ana: { x: number; y: number }; jonas: { x: number; y: number } }) {
	const { t, cam } = stage;
	const k = cam.k;
	const LABEL_Y = -19 / k;
	const faceAt = (id: "ana" | "jonas" | "you", slot: number) => {
		const p = along(FACE_KEYS[id], t);
		return { x: p.x - (14 + slot * 24) / k, y: LABEL_Y };
	};
	const youOn = t >= 10.9 && t < 15.9;
	const youIn = youOn ? Math.min(out((t - 10.6) / 0.35), out((15.9 - t) / 0.3)) : 0;
	const anaFace = faceAt("ana", youIn > 0 ? 1 : 0);
	const jonasFace = faceAt("jonas", 0);
	const moons = [
		{ live: liveOf(CLAUDE, t), face: anaFace, together: true },
		{ live: liveOf(CODEX, t), face: jonasFace, together: t >= 10 && t < 17 },
	];
	return (
		<>
			{moons.map(({ live, face, together }) => (
				<Moon key={live.script.engine} live={live} face={face} together={together} t={t} k={k} />
			))}
			<Pin x={anaFace.x} y={anaFace.y} k={k}>
				<span className="block -translate-x-1/2 -translate-y-1/2">
					<Face who={ANA} size={18} />
				</span>
			</Pin>
			<Pin x={jonasFace.x} y={jonasFace.y} k={k}>
				<span className="block -translate-x-1/2 -translate-y-1/2">
					<Face who={JONAS} size={18} />
				</span>
			</Pin>
			{youIn > 0 ? (
				<Pin x={faceAt("you", 0).x} y={LABEL_Y} k={k}>
					<span className="block" style={{ transform: `translate(-50%, -50%) scale(${youIn})` }}>
						<Face who={YOU} size={18} />
					</span>
				</Pin>
			) : null}
			{/* sharing a frame is the one time pointers come back */}
			{youIn > 0 ? (
				<div style={{ opacity: youIn }}>
					<Cursor who={ANA} x={ana.x} y={ana.y} k={k} t={t} />
				</div>
			) : null}
			{youIn > 0 && jonas.x > fx("cart") && jonas.x < fx("cart") + FW ? <Cursor who={JONAS} x={jonas.x} y={jonas.y} k={k} t={t} /> : null}
		</>
	);
}

function Moon({ live, face, together, t, k }: { live: Live; face: { x: number; y: number }; together: boolean; t: number; k: number }) {
	const who = live.script.owner;
	const show = activity(live);
	if (show <= 0) return null;
	const R = 15 / k;
	const angle = t * 4.2;
	// where the agent is working, on that frame's label, or in flight between two
	const home = (() => {
		const trav = live.script.travel;
		if (live.moving !== null && trav !== null) {
			const p = ease(live.moving);
			return { x: lerp(fx(trav.a) + FW - 14 / k, fx(trav.b) + FW - 14 / k, p), y: face.y - Math.sin(p * Math.PI) * 50, apart: true };
		}
		const f = live.frame === null ? null : frameBox(live.frame);
		if (f === null || together) return { x: face.x, y: face.y, apart: false };
		return { x: f.x + FW - 14 / k, y: face.y, apart: true };
	})();
	const writes = live.script === CLAUDE ? WRITES.map((w) => t - w.at).find((d) => d >= 0 && d < 0.5) : undefined;
	const flare = writes === undefined ? 0 : 1 - writes / 0.5;
	const mx = home.x + Math.cos(angle) * R * out(show);
	const my = home.y + Math.sin(angle) * R * 0.55 * out(show);
	return (
		<>
			{home.apart ? (
				<svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
					<path
						d={`M${face.x} ${face.y} Q${(face.x + home.x) / 2} ${face.y - 46} ${home.x} ${home.y}`}
						fill="none"
						stroke={who.color}
						strokeOpacity={0.55 * show}
						strokeWidth={1.2 / k}
						strokeDasharray={`${1.5 / k} ${4 / k}`}
						strokeLinecap="round"
						strokeDashoffset={(-t * 18) / k}
					/>
				</svg>
			) : null}
			{home.apart ? (
				<Pin x={home.x} y={home.y} k={k}>
					<span className="block h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed" style={{ borderColor: who.color, opacity: 0.6 * show }} />
				</Pin>
			) : null}
			<Pin x={mx} y={my} k={k}>
				<span
					className="block -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{ width: 6 + flare * 6, height: 6 + flare * 6, background: who.color, boxShadow: flare > 0 ? `0 0 ${10 * flare}px ${who.color}` : undefined }}
				/>
			</Pin>
		</>
	);
}

/* ---------- the scrubber, outside the window ---------- */

function Scrubber({ clock }: { clock: ReturnType<typeof useClock> }) {
	const { t } = clock;
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-t border-border bg-bg px-5">
			<button type="button" className="w-14 text-left text-text type-detail" onClick={() => clock.setPlaying(!clock.playing)}>
				{clock.playing ? "pause" : "play"}
			</button>
			<button type="button" className={cn("w-12 text-left type-detail", clock.slow ? "text-text" : "text-muted")} onClick={() => clock.setSlow(!clock.slow)}>
				{clock.slow ? "0.35×" : "1×"}
			</button>
			<div className="relative h-full flex-1">
				<div className="absolute inset-x-0 top-[30px] h-px bg-border-raised" />
				<div className="absolute left-0 top-[29px] h-[3px] rounded-full bg-text" style={{ width: `${(t / TOTAL) * 100}%` }} />
				{MOMENTS.map((m, i) => {
					const passed = t >= m.at;
					return (
						<button
							key={m.at}
							type="button"
							className={cn("absolute flex -translate-x-[3px] items-start gap-2", i % 2 === 0 ? "top-[24px] flex-col" : "top-[4px] flex-col-reverse")}
							style={{ left: `${(m.at / TOTAL) * 100}%` }}
							onClick={() => clock.seek(m.at)}
						>
							<span className={cn("h-[7px] w-px", passed ? "bg-text" : "bg-border-raised")} />
							<span className={cn("whitespace-nowrap leading-3 type-detail", passed ? "text-text" : "text-muted")}>{m.label}</span>
						</button>
					);
				})}
			</div>
			<span className="w-12 text-right text-muted type-detail">{t.toFixed(1)}s</span>
		</div>
	);
}
