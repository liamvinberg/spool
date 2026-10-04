import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { type CoffeeScreenName, CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * Live cursors and who's looking, people only (DEV-113, re-scoped 2026-10-04).
 *
 * Every take plays the same twelve seconds. Ana wanders from cart to checkout. Jonas
 * selects menu and drags it, and everyone sees it move as he moves it. Mira reads
 * receipt and goes still at 7s. The faces at the top right are who's here.
 *
 * Takes go down: how a cursor and the faces look. States go across: the base scene,
 * `--follow` (you pressed Ana's face), and `--crowd` (seven people, one on another
 * page, one idle, the list of who's here open).
 *
 * Prototype only; the cast and colours are staged.
 */

export type Take = "chip" | "fade" | "mono" | "dot" | "avatar";
export type View = "base" | "follow" | "crowd";

/* ---------- time ---------- */

const TOTAL = 12;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
	const v = clamp01(x);
	return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const out = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

interface Key {
	readonly at: number;
	readonly d: number;
	readonly x: number;
	readonly y: number;
}

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

/** seconds since this path last moved, which is what "idle" and a fading name read */
function stillFor(keys: readonly Key[], t: number): number {
	let last = 0;
	for (const k of keys) {
		if (k.at - k.d > t) break;
		last = Math.min(t, k.at);
	}
	return Math.max(0, t - last);
}

function useClock() {
	const [t, setT] = useState(0);
	const [playing, setPlaying] = useState(true);
	const now = useRef(0);
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (stamp: number) => {
			now.current = (now.current + Math.min(0.1, (stamp - last) / 1000)) % TOTAL;
			last = stamp;
			setT(now.current);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing]);
	return {
		t,
		playing,
		setPlaying,
		seek: (at: number) => {
			now.current = at;
			setT(at);
		},
	};
}

/* ---------- the world ---------- */

type Name = "menu" | "cart" | "receipt" | "checkout";
const NAMES: readonly Name[] = ["menu", "cart", "receipt", "checkout"];
const SCREEN: Record<Name, CoffeeScreenName> = { menu: "menu", cart: "cart", receipt: "receipt", checkout: "cart" };
const FW = 190;
const FH = 411;
const GAP = 64;
const WORLD_W = NAMES.length * FW + (NAMES.length - 1) * GAP;
const fx = (name: Name) => NAMES.indexOf(name) * (FW + GAP);

/* ---------- the people ---------- */

interface Person {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	/** where they are when not on this page */
	readonly page?: string;
	readonly path: readonly Key[];
}

const ANA: Person = {
	id: "ana",
	name: "Ana",
	color: "#7f9cff",
	path: [
		{ at: 0, d: 0, x: fx("cart") + 120, y: 120 },
		{ at: 1.6, d: 1.2, x: fx("cart") + 70, y: 230 },
		{ at: 3.4, d: 1.2, x: fx("cart") + 150, y: 330 },
		{ at: 5.6, d: 1.6, x: fx("checkout") + 60, y: 160 },
		{ at: 7.6, d: 1.3, x: fx("checkout") + 140, y: 300 },
		{ at: 9.6, d: 1.4, x: fx("checkout") + 40, y: 90 },
		{ at: 11.9, d: 1.9, x: fx("cart") + 120, y: 120 },
	],
};

/** Jonas presses menu at 2.0, drags it from 2.4 to 4.6, lets go, then wanders off */
const JONAS: Person = {
	id: "jonas",
	name: "Jonas",
	color: "#e6b450",
	path: [
		{ at: 0, d: 0, x: fx("menu") + 150, y: 380 },
		{ at: 1.9, d: 1.0, x: fx("menu") + 96, y: 30 },
		{ at: 4.6, d: 2.2, x: fx("menu") + 96 - 30, y: 30 + 48 },
		{ at: 7.4, d: 1.6, x: fx("receipt") - 20, y: 420 },
		{ at: 9.8, d: 1.4, x: fx("menu") + 120, y: 300 },
		{ at: 11.9, d: 1.6, x: fx("menu") + 150, y: 380 },
	],
};

const DRAG = { press: 2.0, from: 2.4, to: 4.6, dx: -30, dy: 48 };

const MIRA: Person = {
	id: "mira",
	name: "Mira",
	color: "#6fcf97",
	path: [
		{ at: 0, d: 0, x: fx("receipt") + 60, y: 140 },
		{ at: 2.2, d: 1.6, x: fx("receipt") + 130, y: 200 },
		{ at: 4.6, d: 1.8, x: fx("receipt") + 90, y: 260 },
		{ at: 6.8, d: 1.2, x: fx("receipt") + 120, y: 230 },
	],
};

const YOU: Person = { id: "you", name: "Liam", color: "#f0efed", path: [] };

/** the crowd adds three more: one moving, one idle for minutes, one on another page */
const SAM: Person = {
	id: "sam",
	name: "Sam",
	color: "#c58cff",
	path: [
		{ at: 0, d: 0, x: fx("checkout") + 150, y: 380 },
		{ at: 3, d: 2, x: fx("checkout") + 170, y: 250 },
		{ at: 8, d: 2.4, x: fx("receipt") + 170, y: 360 },
		{ at: 11.9, d: 2.4, x: fx("checkout") + 150, y: 380 },
	],
};
const NOOR: Person = { id: "noor", name: "Noor", color: "#ff8f6b", path: [{ at: -300, d: 0, x: fx("cart") - 34, y: 360 }] };
const LEA: Person = { id: "lea", name: "Lea", color: "#5ec8d8", page: "site", path: [] };
const KAI: Person = { id: "kai", name: "Kai", color: "#e57ba8", page: "site", path: [] };

const IDLE_AFTER = 30;

/* ---------- camera ---------- */

const VIEW_W = 1440 - 248 - 44;
const VIEW_H = 900 - 44;

interface Camera {
	readonly k: number;
	readonly tx: number;
	readonly ty: number;
}

function cameraFor(view: View, t: number): Camera {
	if (view !== "follow") {
		const k = 1;
		return { k, tx: (VIEW_W - WORLD_W * k) / 2, ty: (VIEW_H - FH * k) / 2 + 10 };
	}
	// following copies Ana's camera; she pans as she goes, so the view eases behind her
	const k = 1.45;
	const lead = along(ANA.path, Math.max(0, t - 0.5));
	const cx = Math.max(FW / 2, Math.min(WORLD_W - FW / 2, lead.x));
	return { k, tx: VIEW_W / 2 - cx * k, ty: VIEW_H / 2 - (FH / 2) * k + 14 };
}

/* ---------- the frame ---------- */

export function LiveCursors({ take, view }: { take: Take; view: View }) {
	const clock = useClock();
	const t = clock.t;
	const cam = cameraFor(view, t);
	const people = view === "crowd" ? [ANA, JONAS, MIRA, SAM, NOOR] : [ANA, JONAS, MIRA];
	const roster = view === "crowd" ? [ANA, JONAS, MIRA, SAM, NOOR, LEA, KAI] : [ANA, JONAS, MIRA];
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative h-[900px] shrink-0">
				<SpoolShell
					activeTab="kaffe"
					tabs={["kaffe"]}
					zoom={`${Math.round(cam.k * 41)}%`}
					headerAccessory={<Faces take={take} roster={roster} t={t} following={view === "follow" ? ANA : null} open={view === "crowd"} />}
				>
					<CanvasChrome pages={[{ name: "app", frames: NAMES, active: true, open: true }, { name: "site", frames: ["landing", "pricing"] }]} rail={null}>
						<div className="absolute inset-0 overflow-hidden">
							<div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})` }}>
								{NAMES.map((name) => (
									<Frame key={name} name={name} t={t} k={cam.k} />
								))}
								{people.map((p) => (
									<Cursor key={p.id} take={take} who={p} t={t} k={cam.k} />
								))}
							</div>
							{view === "follow" ? <Following who={ANA} t={t} /> : null}
						</div>
					</CanvasChrome>
				</SpoolShell>
				{view === "crowd" ? <Roster take={take} roster={roster} t={t} /> : null}
			</div>
			<Scrubber clock={clock} />
		</div>
	);
}

/** menu moves while Jonas drags it, and carries his selection while he holds it */
function Frame({ name, t, k }: { name: Name; t: number; k: number }) {
	const dragged = name === "menu";
	const p = dragged ? ease((t - DRAG.from) / (DRAG.to - DRAG.from)) : 0;
	const x = fx(name) + p * DRAG.dx;
	const y = p * DRAG.dy;
	const held = dragged && t >= DRAG.press && t < DRAG.to + 1.2;
	return (
		<div className="absolute" style={{ left: x, top: y, width: FW, height: FH }}>
			<div className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap" style={{ width: FW * k, transform: `scale(${1 / k})` }}>
				<div className="flex w-full items-center gap-1.5 pb-2.5">
					<span className="type-value" style={{ color: held ? JONAS.color : "var(--color-muted)" }}>
						{name}
					</span>
				</div>
			</div>
			<div className="h-full w-full rounded-lg" style={held ? { outline: `${1.5 / k}px solid ${JONAS.color}`, outlineOffset: 3 / k } : undefined}>
				<CoffeeScreen screen={SCREEN[name]} actionLabel={name === "checkout" ? "Pay" : undefined} />
			</div>
		</div>
	);
}

/* ---------- cursors, per take ---------- */

function Pin({ x, y, k, children }: { x: number; y: number; k: number; children: ReactNode }) {
	return (
		<div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${x}px, ${y}px) scale(${1 / k})` }}>
			{children}
		</div>
	);
}

function Arrow({ fill, stroke = "#0e0e0e" }: { fill: string; stroke?: string }) {
	return (
		<svg width="15" height="19" viewBox="0 0 14 18" aria-hidden="true" className="block shrink-0">
			<path d="M1 1v14l3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5H12Z" fill={fill} stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
		</svg>
	);
}

function Cursor({ take, who, t, k }: { take: Take; who: Person; t: number; k: number }) {
	const at = along(who.path, t);
	const still = stillFor(who.path, t);
	const idle = who.path[0] !== undefined && who.path[0].at < -IDLE_AFTER;
	// a hand on a mouse is never quite still, until it has been left
	const drift = idle || still > 2 ? 0 : 1;
	const jx = Math.sin(t * 1.4 + who.name.length) * 1.6 * drift;
	const jy = Math.cos(t * 1.2 + who.name.length) * 1.3 * drift;
	const pressed = who === JONAS && t >= DRAG.press && t < DRAG.to;
	const body = (() => {
		if (take === "chip") {
			return (
				<div className="flex items-start" style={{ opacity: idle ? 0.35 : 1 }}>
					<Arrow fill={who.color} />
					<span className="ml-0.5 mt-3.5 rounded-[5px] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#0e0e0e]" style={{ background: who.color }}>
						{who.name}
					</span>
				</div>
			);
		}
		if (take === "fade") {
			// the name shows while the hand moves and leaves 1.2s after it stops
			const label = idle ? 0 : 1 - out((still - 1.2) / 0.4);
			return (
				<div className="flex items-start" style={{ opacity: idle ? 0.35 : 1 }}>
					<Arrow fill={who.color} />
					<span
						className="ml-0.5 mt-3.5 origin-top-left rounded-[5px] px-1.5 py-[2px] text-[11px] font-medium leading-4 text-[#0e0e0e]"
						style={{ background: who.color, opacity: label, transform: `scale(${0.85 + 0.15 * label})` }}
					>
						{who.name}
					</span>
				</div>
			);
		}
		if (take === "mono") {
			return (
				<div className="flex items-start" style={{ opacity: idle ? 0.35 : 1 }}>
					<Arrow fill="#f0efed" />
					<span className="ml-1 mt-3.5 flex items-center gap-1.5 rounded-xs bg-raised px-1.5 py-[2px] text-text type-detail">
						<span className="h-1.5 w-1.5 rounded-full" style={{ background: who.color }} />
						{who.name.toLowerCase()}
					</span>
				</div>
			);
		}
		if (take === "dot") {
			return (
				<div className="flex items-center gap-1.5" style={{ opacity: idle ? 0.35 : 1 }}>
					<span
						className="block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
						style={{ background: who.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${who.color} 25%, transparent)`, transform: `translate(-50%, -50%) scale(${pressed ? 0.75 : 1})` }}
					/>
					<span className="-translate-y-1/2 text-[11px] font-medium leading-4" style={{ color: who.color }}>
						{who.name}
					</span>
				</div>
			);
		}
		// avatar: the person's face rides the pointer
		return (
			<div className="flex items-start" style={{ opacity: idle ? 0.35 : 1 }}>
				<Arrow fill={who.color} />
				<span className="-ml-0.5 mt-3">
					<Face who={who} size={22} ring />
				</span>
			</div>
		);
	})();
	return (
		<Pin x={at.x} y={at.y} k={k}>
			<div style={{ transform: `translate(${jx}px, ${jy}px)` }}>{body}</div>
		</Pin>
	);
}

/* ---------- faces at the top right ---------- */

function Face({ who, size = 22, ring = false, dim = false }: { who: Person; size?: number; ring?: boolean; dim?: boolean }) {
	return (
		<span
			className="flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0e0e0e]"
			style={{
				width: size,
				height: size,
				fontSize: size * 0.46,
				background: dim ? "var(--color-raised)" : who.color,
				color: dim ? "var(--color-muted)" : "#0e0e0e",
				boxShadow: ring ? "0 0 0 2px var(--color-bg)" : undefined,
			}}
		>
			{who.name[0]}
		</span>
	);
}

function presenceOf(who: Person): "here" | "idle" | "away" {
	if (who.page !== undefined) return "away";
	if (who.path[0] !== undefined && who.path[0].at < -IDLE_AFTER) return "idle";
	return "here";
}

const FIT = 4;

function Faces({ take, roster, t, following, open }: { take: Take; roster: readonly Person[]; t: number; following: Person | null; open: boolean }) {
	const shown = roster.slice(0, FIT);
	const more = roster.length - shown.length;
	const press = following !== null && t < 0.4 ? 1 - Math.abs(t - 0.2) / 0.2 : 0;
	if (take === "mono") {
		return (
			<span className={cn("flex h-7 items-center gap-2 rounded-sm px-2 type-detail", open ? "bg-surface text-text" : "text-muted")}>
				<span className="flex items-center -space-x-0.5">
					{roster.map((p) => (
						<span key={p.id} className="h-2 w-2 rounded-full ring-2 ring-bg" style={{ background: presenceOf(p) === "here" ? p.color : "var(--color-border-raised)" }} />
					))}
				</span>
				{following !== null ? `following ${following.name.toLowerCase()}` : `${roster.length + 1} here`}
			</span>
		);
	}
	const size = take === "avatar" ? 26 : take === "dot" ? 20 : 24;
	return (
		<span className={cn("flex items-center rounded-full p-0.5", open && "bg-surface")}>
			<span className={cn("flex items-center", take === "dot" ? "gap-1" : "-space-x-1.5")}>
				{shown.map((p) => {
					const state = presenceOf(p);
					const lit = following === p;
					return (
						<span
							key={p.id}
							className="relative rounded-full"
							style={{
								transform: lit ? `scale(${1 - press * 0.1})` : undefined,
								boxShadow: lit ? `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${p.color}` : undefined,
								zIndex: lit ? 2 : undefined,
							}}
						>
							<Face who={p} size={size} ring={take !== "dot"} dim={state === "away"} />
							{state === "idle" ? <span className="absolute inset-0 rounded-full bg-bg/55" /> : null}
						</span>
					);
				})}
				{more > 0 ? (
					<span className="relative flex items-center justify-center rounded-full bg-raised text-muted type-detail" style={{ width: size, height: size, boxShadow: "0 0 0 2px var(--color-bg)" }}>
						+{more}
					</span>
				) : null}
			</span>
		</span>
	);
}

/** the list of who's here, open under the faces; a row follows that person */
function Roster({ take, roster, t }: { take: Take; roster: readonly Person[]; t: number }) {
	const appear = out(t / 0.25);
	const rows = [{ who: YOU, where: "app", you: true }, ...roster.map((p) => ({ who: p, where: p.page ?? "app", you: false }))];
	return (
		<div
			className="absolute right-4 top-[52px] z-30 w-[260px] rounded-md border border-border-raised bg-surface py-1.5"
			style={{ opacity: appear, transform: `translateY(${(1 - appear) * -4}px)` }}
		>
			{rows.map(({ who, where, you }) => {
				const state = you ? "here" : presenceOf(who);
				return (
					<div key={who.id} className={cn("flex h-9 items-center gap-2.5 px-3", who === ANA && "bg-raised")}>
						{take === "mono" ? (
							<span className="h-2 w-2 rounded-full" style={{ background: state === "here" ? who.color : "var(--color-border-raised)" }} />
						) : (
							<Face who={who} size={22} dim={state === "away"} />
						)}
						<span className={cn("text-[13px]", state === "here" ? "text-text" : "text-muted")}>
							{you ? `${who.name} (you)` : who.name}
						</span>
						<span className="ml-auto text-muted type-detail">{state === "idle" ? "idle 6m" : where}</span>
					</div>
				);
			})}
		</div>
	);
}

/** following: the view takes the person's colour, and one line says how to stop */
function Following({ who, t }: { who: Person; t: number }) {
	const p = out((t - 0.2) / 0.3);
	return (
		<>
			<div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${2 * p}px ${who.color}` }} />
			<div
				className="absolute left-1/2 top-3 flex items-center gap-2 rounded-[5px] px-2 py-[3px] text-[#0e0e0e]"
				style={{ background: who.color, opacity: p, transform: `translate(-50%, ${(1 - p) * -6}px)` }}
			>
				<span className="text-[12px] font-medium leading-4">Following {who.name}</span>
				<span className="type-detail opacity-60">esc</span>
			</div>
		</>
	);
}

/* ---------- the scrubber, outside the window ---------- */

function Scrubber({ clock }: { clock: ReturnType<typeof useClock> }) {
	const marks = [
		{ at: 0, label: "start" },
		{ at: 2.0, label: "jonas grabs menu" },
		{ at: 4.6, label: "lets go" },
		{ at: 5.6, label: "ana moves on" },
		{ at: 7.0, label: "mira goes still" },
	];
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-5 border-t border-border bg-bg px-5">
			<button type="button" className="w-12 text-left text-text type-detail" onClick={() => clock.setPlaying(!clock.playing)}>
				{clock.playing ? "pause" : "play"}
			</button>
			<div className="relative h-full flex-1">
				<div className="absolute inset-x-0 top-[22px] h-px bg-border-raised" />
				<div className="absolute left-0 top-[21px] h-[3px] rounded-full bg-text" style={{ width: `${(clock.t / TOTAL) * 100}%` }} />
				{marks.map((m) => (
					<button
						key={m.at}
						type="button"
						className="absolute top-[30px] whitespace-nowrap type-detail"
						style={{ left: `${(m.at / TOTAL) * 100}%`, color: clock.t >= m.at ? "var(--color-text)" : "var(--color-muted)" }}
						onClick={() => clock.seek(m.at)}
					>
						{m.label}
					</button>
				))}
			</div>
			<span className="w-12 text-right text-muted type-detail">{clock.t.toFixed(1)}s</span>
		</div>
	);
}
