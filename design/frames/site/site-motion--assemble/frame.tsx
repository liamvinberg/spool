import { type MotionValue, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-motion--assemble. spool.page argued through one motion character: the
 * screen is loose parts, and the scroll is the hand that arranges them.
 *
 * Thirty parts exist for the whole page — twelve plates, fourteen bars, four red
 * marks — and they are the only things on the stage that ever move. Each beat is
 * a pose for all thirty at once: the specimen sheet you land on, a terminal, an
 * empty project, the folder picker, three projects side by side, spool's own
 * design folder as twelve page covers, the walkthrough, and the licence, where
 * they spread back out as stock for whoever forks it. Nothing fades in and
 * nothing is drawn twice: the terminal window becomes the video screen because
 * it is the same plate.
 *
 * The whole arc is scrubbed. There is no timeline running anywhere on this page
 * and no threshold that fires; the wheel is holding every part directly, so
 * scrolling back takes the composition apart at exactly the rate you ask for.
 * Parts carry a small per-part stagger, so a pose lands as an assembly rather
 * than a block move, and whatever a beat does not need waits in a tray along the
 * bottom edge, which is the honest picture of what a design system looks like
 * mid-thought.
 *
 * Transform and opacity only, on a fixed 1440x900 stage. Under
 * prefers-reduced-motion the interpolation is dropped and each beat is a still
 * that swaps at its midpoint.
 */

/* ---------- the stage ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const BEAT_SCROLL = 560;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---------- the parts ---------- */

type Pool = "surface" | "raised" | "canvas" | "line" | "accent";

interface PartSpec {
	pool: Pool;
	w: number;
	h: number;
	r: number;
	cls: string;
}

/**
 * Paint order is array order, and it is load bearing: plates first so bars and
 * marks land on top of them, the darker plates after the lighter ones so a rail
 * or a field reads as a recess cut into a window.
 */
const PARTS: readonly PartSpec[] = [
	...Array.from({ length: 6 }, (): PartSpec => ({ pool: "surface", w: 100, h: 64, r: 5, cls: "bg-surface" })),
	...Array.from({ length: 3 }, (): PartSpec => ({ pool: "raised", w: 100, h: 64, r: 5, cls: "bg-raised" })),
	...Array.from({ length: 3 }, (): PartSpec => ({ pool: "canvas", w: 100, h: 64, r: 5, cls: "bg-canvas" })),
	...Array.from({ length: 14 }, (): PartSpec => ({ pool: "line", w: 200, h: 4, r: 999, cls: "bg-border-raised" })),
	...Array.from({ length: 4 }, (): PartSpec => ({ pool: "accent", w: 60, h: 14, r: 999, cls: "bg-thread" })),
];

const POOL_RANGE: Record<Pool, readonly [number, number]> = {
	surface: [0, 6],
	raised: [6, 9],
	canvas: [9, 12],
	line: [12, 26],
	accent: [26, 30],
};

const COUNT = PARTS.length;

interface Pose {
	x: number;
	y: number;
	sx: number;
	sy: number;
	o: number;
}

/* ---------- writing a beat ---------- */

class Sheet {
	readonly poses: (Pose | null)[] = Array.from({ length: COUNT }, () => null);
	private readonly cursor: Record<Pool, number> = { surface: 0, raised: 0, canvas: 0, line: 0, accent: 0 };

	private claim(pool: Pool): number {
		const range = POOL_RANGE[pool];
		const i = range[0] + this.cursor[pool];
		this.cursor[pool] += 1;
		return i < range[1] ? i : -1;
	}

	/** a plate, given as the rectangle it should occupy */
	plate(pool: "surface" | "raised" | "canvas", x: number, y: number, w: number, h: number, o = 1): void {
		const i = this.claim(pool);
		const spec = PARTS[i];
		if (i < 0 || spec === undefined) return;
		this.poses[i] = { x, y, sx: w / spec.w, sy: h / spec.h, o };
	}

	/** a bar: width is the only thing that varies */
	bar(x: number, y: number, w: number, o = 1): void {
		const i = this.claim("line");
		const spec = PARTS[i];
		if (i < 0 || spec === undefined) return;
		this.poses[i] = { x, y, sx: w / spec.w, sy: 1, o };
	}

	/** a red mark: a pill, so a square one is a circle */
	mark(x: number, y: number, w: number, h: number, o = 1): void {
		const i = this.claim("accent");
		const spec = PARTS[i];
		if (i < 0 || spec === undefined) return;
		this.poses[i] = { x, y, sx: w / spec.w, sy: h / spec.h, o };
	}

	/** everything this beat had no use for waits along the bottom edge */
	done(): readonly Pose[] {
		let ord = 0;
		return this.poses.map((pose, i) => {
			if (pose !== null) return pose;
			const spec = PARTS[i];
			const x = 176 + ord * 23;
			ord += 1;
			if (spec === undefined) return { x, y: 852, sx: 0.1, sy: 1, o: 0.2 };
			if (spec.pool === "line") return { x, y: 852, sx: 18 / spec.w, sy: 1, o: 0.22 };
			if (spec.pool === "accent") return { x, y: 848, sx: 14 / spec.w, sy: 5 / spec.h, o: 0.3 };
			return { x, y: 846, sx: 18 / spec.w, sy: 8 / spec.h, o: 0.3 };
		});
	}
}

/**
 * The specimen grid: every part at rest, grouped by kind and sized unevenly, so
 * it reads as a sheet of stock rather than a loading state.
 */
const SHEET_PLATE = [0.72, 0.5, 0.86, 0.6, 0.74, 0.54, 0.66, 0.9, 0.58, 0.8, 0.62, 0.7] as const;
const SHEET_BAR = [78, 52, 92, 64, 84, 44, 70, 88, 56, 76, 60, 90, 50, 72] as const;
const SHEET_MARK = [1, 0.55, 0.82, 0.42] as const;

function specimen(ox: number, px: number, rows: readonly number[]): readonly Pose[] {
	return PARTS.map((spec, i) => {
		const col = i % 6;
		const row = Math.floor(i / 6);
		const x = ox + col * px;
		const y = rows[row] ?? 0;
		if (spec.pool === "line") {
			const w = SHEET_BAR[i - POOL_RANGE.line[0]] ?? 70;
			return { x, y: y + 20, sx: w / spec.w, sy: 1, o: 0.9 };
		}
		if (spec.pool === "accent") {
			const k = SHEET_MARK[i - POOL_RANGE.accent[0]] ?? 0.7;
			return { x, y: y + 15, sx: k, sy: 1, o: 1 };
		}
		const k = SHEET_PLATE[i] ?? 0.66;
		return { x, y, sx: k, sy: k, o: 1 };
	});
}

/* ---------- the eight beats ---------- */

function beatInstall(): readonly Pose[] {
	const s = new Sheet();
	s.plate("surface", 740, 236, 548, 336);
	s.plate("raised", 740, 236, 548, 34);
	const rows = [262, 190, 226, 148];
	for (const [i, w] of rows.entries()) s.bar(792, 384 + i * 34, w);
	s.mark(762, 247, 46, 12);
	s.mark(792, 524, 8, 16);
	return s.done();
}

function beatEmpty(): readonly Pose[] {
	const s = new Sheet();
	s.plate("surface", 620, 196, 700, 452);
	s.plate("raised", 620, 196, 700, 32);
	s.plate("canvas", 770, 228, 550, 420);
	s.plate("canvas", 620, 228, 150, 420, 0.6);
	s.mark(636, 204, 52, 16);
	return s.done();
}

function beatPicker(): readonly Pose[] {
	const s = new Sheet();
	s.plate("surface", 812, 232, 436, 348);
	s.plate("raised", 812, 232, 436, 46);
	s.plate("canvas", 828, 296, 404, 40);
	for (let i = 0; i < 5; i += 1) s.bar(856, 314 + i * 46, 244);
	s.mark(836, 306, 6, 20);
	s.mark(838, 250, 12, 12);
	return s.done();
}

function beatProjects(): readonly Pose[] {
	const s = new Sheet();
	const xs = [176, 552, 928] as const;
	for (const x of xs) s.plate("surface", x, 428, 336, 252);
	for (const [i, x] of xs.entries()) s.plate("raised", x, 398, 92 + i * 8, 24);
	for (const x of xs) {
		s.bar(x + 30, 468, 224);
		s.bar(x + 30, 494, 152);
	}
	for (const [i, x] of xs.entries()) s.mark(x + 30, 618, 104, 18, i === 0 ? 1 : 0.4);
	return s.done();
}

const COVERS = [
	{ x: 176, y: 196, w: 150, h: 112, pool: "surface" },
	{ x: 352, y: 196, w: 212, h: 112, pool: "raised" },
	{ x: 590, y: 196, w: 122, h: 112, pool: "surface" },
	{ x: 738, y: 196, w: 182, h: 112, pool: "canvas" },
	{ x: 946, y: 196, w: 140, h: 112, pool: "surface" },
	{ x: 1112, y: 196, w: 152, h: 112, pool: "raised" },
	{ x: 176, y: 344, w: 192, h: 132, pool: "surface" },
	{ x: 394, y: 344, w: 140, h: 132, pool: "canvas" },
	{ x: 560, y: 344, w: 232, h: 132, pool: "surface" },
	{ x: 818, y: 344, w: 152, h: 132, pool: "raised" },
	{ x: 996, y: 344, w: 268, h: 132, pool: "canvas" },
	{ x: 620, y: 512, w: 200, h: 96, pool: "surface" },
] as const;

function beatPages(): readonly Pose[] {
	const s = new Sheet();
	for (const c of COVERS) s.plate(c.pool, c.x, c.y, c.w, c.h);
	for (const c of COVERS.slice(0, 12)) s.bar(c.x, c.y - 14, Math.min(72, c.w * 0.5));
	s.mark(946, 182, 62, 8);
	return s.done();
}

function beatVideo(): readonly Pose[] {
	const s = new Sheet();
	s.plate("surface", 620, 192, 664, 376);
	s.plate("canvas", 632, 204, 640, 352);
	s.bar(652, 530, 620);
	s.mark(922, 352, 56, 56);
	s.mark(652, 530, 96, 4);
	return s.done();
}

const BEATS: readonly { name: string; poses: readonly Pose[] }[] = [
	{ name: "parts", poses: specimen(760, 96, [230, 356, 486, 534, 582]) },
	{ name: "install", poses: beatInstall() },
	{ name: "empty", poses: beatEmpty() },
	{ name: "picker", poses: beatPicker() },
	{ name: "projects", poses: beatProjects() },
	{ name: "design", poses: beatPages() },
	{ name: "video", poses: beatVideo() },
	{ name: "licence", poses: specimen(176, 182, [452, 566, 690, 738, 786]) },
];

const LAST = BEATS.length - 1;
const TRACK_H = VIEW_H + LAST * BEAT_SCROLL;
const MAX_SCROLL = TRACK_H - VIEW_H;

/* ---------- interpolation ---------- */

const STAGGER = 0.3;
const PARK: Pose = { x: 700, y: 852, sx: 0.1, sy: 1, o: 0 };

function poseAt(i: number, v: number, reduce: boolean): Pose {
	const t = clamp01(v) * LAST;
	const b = Math.min(Math.floor(t), LAST - 1);
	const local = t - b;
	const from = BEATS[b]?.poses[i] ?? PARK;
	const to = BEATS[b + 1]?.poses[i] ?? PARK;
	if (reduce) return local < 0.5 ? from : to;
	const delay = (i % 7) * (STAGGER / 6);
	const u = smooth(clamp01((local - delay) / (1 - STAGGER)));
	return {
		x: mix(from.x, to.x, u),
		y: mix(from.y, to.y, u),
		sx: mix(from.sx, to.sx, u),
		sy: mix(from.sy, to.sy, u),
		o: mix(from.o, to.o, u),
	};
}

function Part({ index, sp, reduce }: { index: number; sp: MotionValue<number>; reduce: boolean }) {
	const spec = PARTS[index];
	const x = useTransform(sp, (v: number) => poseAt(index, v, reduce).x);
	const y = useTransform(sp, (v: number) => poseAt(index, v, reduce).y);
	const scaleX = useTransform(sp, (v: number) => poseAt(index, v, reduce).sx);
	const scaleY = useTransform(sp, (v: number) => poseAt(index, v, reduce).sy);
	const opacity = useTransform(sp, (v: number) => poseAt(index, v, reduce).o);
	if (spec === undefined) return null;
	return (
		<motion.div
			className={cn("absolute top-0 left-0", spec.cls)}
			style={{
				width: spec.w,
				height: spec.h,
				borderRadius: spec.r,
				transformOrigin: "0 0",
				x,
				y,
				scaleX,
				scaleY,
				opacity,
			}}
		/>
	);
}

/* ---------- the copy ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			className="group/cmd block cursor-pointer text-left font-mono text-[15px] leading-[28px] focus-visible:outline-none"
		>
			<span className="select-none text-muted">{prompt} </span>
			<span className="text-text">{command}</span>
			<span
				className={cn(
					"ml-3 text-2xs uppercase tracking-[0.08em] transition-opacity duration-150",
					copied ? "text-thread opacity-100" : "text-muted opacity-0 group-hover/cmd:opacity-100",
				)}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path
				d="M6 1.75v6.1M3.4 5.4 6 8l2.6-2.6M2.25 10.25h7.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.5v9M2.5 7 6 10.5 9.5 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

interface Block {
	id: string;
	at: number;
	x: number;
	y: number;
	w: number;
	body: ReactNode;
}

const H1 = "font-semibold text-[52px] leading-[1.0] tracking-[-0.025em]";
const H2 = "font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]";
const P = "mt-5 text-[16px] text-muted leading-[26px]";

const BLOCKS: readonly Block[] = [
	{
		id: "hero",
		at: 0,
		x: 176,
		y: 264,
		w: 560,
		body: (
			<>
				<h1 className={H1}>
					Every screen is
					<br />
					loose parts until
					<br />
					someone arranges them
				</h1>
				<p className={P}>
					spool is a prototyping canvas for real code. Your agent writes the parts as TSX frames in your repo.
					You put them where they belong and walk the flow between them.
				</p>
				<div className="mt-8 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div>
						<CommandLine prompt="~ $" command="npm i -g spool.page" />
						<CommandLine prompt="~/your-app $" command="spool init" />
					</div>
				</div>
			</>
		),
	},
	{
		id: "install",
		at: 1,
		x: 176,
		y: 296,
		w: 440,
		body: (
			<>
				<h2 className={H2}>It arrives as one command</h2>
				<p className={P}>
					npm publishes it as a global binary, so the install is the whole setup. Node 22+, and Chrome draws
					the canvas best. There is a Mac build if you would rather double-click something.
				</p>
				<div className="mt-8 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div>
						<CommandLine prompt="~ $" command="npm i -g spool.page" />
					</div>
				</div>
				<span className="mt-7 inline-flex items-center gap-2 rounded-[6px] border border-border-raised px-3 py-2 font-mono text-muted text-xs">
					<DownloadGlyph className="h-3 w-3 text-thread" />
					<span className="text-text">Spool.dmg</span>
					<span className="text-muted/60">macOS · Apple silicon</span>
				</span>
			</>
		),
	},
	{
		id: "empty",
		at: 2,
		x: 176,
		y: 320,
		w: 396,
		body: (
			<>
				<h2 className={H2}>Nothing is arranged yet</h2>
				<p className={P}>
					A new project opens with a rail, a field and{" "}
					<span className="font-mono text-[14px] text-text">no frames yet</span> in the middle of it. Every
					part it will hold is still waiting to be written.
				</p>
			</>
		),
	},
	{
		id: "picker",
		at: 3,
		x: 176,
		y: 320,
		w: 430,
		body: (
			<>
				<h2 className={H2}>Point it at a folder</h2>
				<p className={P}>
					Press <span className="font-mono text-[14px] text-text">+</span> and choose anywhere on your
					machine. spool opens the <span className="font-mono text-[14px] text-text">design/</span> it finds
					there, and writes one for a folder it has not met.
				</p>
			</>
		),
	},
	{
		id: "projects",
		at: 4,
		x: 176,
		y: 190,
		w: 620,
		body: (
			<>
				<h2 className={H2}>A few of them at a time</h2>
				<p className={P}>
					Each project keeps its own canvas in its own repo. The tabs are how you cross between them, and one
					daemon holds all of them at once.
				</p>
			</>
		),
	},
	{
		id: "design",
		at: 5,
		x: 176,
		y: 596,
		w: 430,
		body: (
			<>
				<h2 className={H2}>Assembled out of 142 of these</h2>
				<p className={P}>
					spool's own design folder holds twelve pages and 142 frames, and this page is one of them. I arrange
					them on the canvas the same way you will.
				</p>
				<p className="mt-5 font-mono text-muted text-xs">12 pages · 142 frames · one of them is this one</p>
			</>
		),
	},
	{
		id: "video",
		at: 6,
		x: 176,
		y: 316,
		w: 396,
		body: (
			<>
				<h2 className={H2}>Watch it come together</h2>
				<p className={P}>
					Two minutes from an empty folder to a frame you can click through. It is the loop you get on your
					own machine, at the speed it actually runs.
				</p>
				<p className="mt-5 font-mono text-muted text-xs">02:14</p>
			</>
		),
	},
	{
		id: "licence",
		at: 7,
		x: 176,
		y: 176,
		w: 820,
		body: (
			<>
				<h2 className="font-semibold text-[46px] leading-[1.04] tracking-[-0.025em]">
					MIT, so take the parts
				</h2>
				<p className="mt-7 font-mono text-[26px] text-thread leading-none">
					Fork it, rework it, rename it, ship it.
				</p>
				<p className="mt-8 max-w-[520px] text-[16px] text-muted leading-[26px]">
					It is a tool for designing things. Make it your own if you want to, and tell me what you changed.
				</p>
			</>
		),
	},
];

const OVERLAYS: readonly Block[] = [
	{
		id: "install-lines",
		at: 1,
		x: 792,
		y: 288,
		w: 480,
		body: (
			<div className="font-mono text-[13px] leading-[32px]">
				<div>
					<span className="text-muted">~ $ </span>
					<span className="text-text">npm i -g spool.page</span>
				</div>
				<div>
					<span className="text-muted">~/tvarso $ </span>
					<span className="text-text">spool init</span>
				</div>
			</div>
		),
	},
	{
		id: "empty-line",
		at: 2,
		x: 945,
		y: 428,
		w: 200,
		body: <div className="text-center font-mono text-[12px] text-muted/70 leading-none">no frames yet</div>,
	},
];

function CopyBlock({ block, sp, reduce }: { block: Block; sp: MotionValue<number>; reduce: boolean }) {
	const opacity = useTransform(sp, (v: number) => {
		const d = Math.abs(clamp01(v) * LAST - block.at);
		if (reduce) return d < 0.5 ? 1 : 0;
		return 1 - clamp01((d - 0.24) / 0.3);
	});
	const y = useTransform(sp, (v: number) => {
		if (reduce) return 0;
		const d = clamp01(v) * LAST - block.at;
		return Math.max(-26, Math.min(26, d * -30));
	});
	return (
		<motion.div className="absolute" style={{ left: block.x, top: block.y, width: block.w, opacity, y }}>
			{block.body}
		</motion.div>
	);
}

/* ---------- the play triangle, which no rectangle can be ---------- */

function PlayMark({ sp, reduce }: { sp: MotionValue<number>; reduce: boolean }) {
	const opacity = useTransform(sp, (v: number) => {
		const d = Math.abs(clamp01(v) * LAST - 6);
		if (reduce) return d < 0.5 ? 1 : 0;
		return 1 - clamp01((d - 0.1) / 0.24);
	});
	return (
		<motion.svg
			className="absolute"
			style={{ left: 922, top: 352, width: 56, height: 56, opacity }}
			viewBox="0 0 56 56"
			fill="none"
			aria-hidden="true"
		>
			<path d="M23 19.5 37.5 28 23 36.5Z" fill="var(--color-on-thread)" />
		</motion.svg>
	);
}

/* ---------- the frame ---------- */

export default function SiteMotionAssemble() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion() === true;

	const raw = useMotionValue(0);
	const sp = useSpring(raw, { stiffness: 150, damping: 32, mass: 0.9 });

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			raw.set(max > 0 ? el.scrollTop / max : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		measure();
		return () => el.removeEventListener("scroll", measure);
	}, [raw]);

	const [beat, setBeat] = useState(0);
	useEffect(() => {
		const apply = (v: number) => {
			const next = Math.round(clamp01(v) * LAST);
			setBeat((was) => (was === next ? was : next));
		};
		apply(sp.get());
		return sp.on("change", apply);
	}, [sp]);

	const trackScale = useTransform(sp, (v: number) => clamp01(v));
	const hintOpacity = useTransform(sp, (v: number) => 1 - clamp01(v * LAST * 3));
	const name = BEATS[beat]?.name ?? "";

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-bg" style={{ width: VIEW_W }}>
					{/* the thirty parts. everything else on this stage is text. */}
					{PARTS.map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a part's identity is its index
						<Part key={i} index={i} sp={sp} reduce={reduce} />
					))}
					<PlayMark sp={sp} reduce={reduce} />

					{[...BLOCKS, ...OVERLAYS].map((block) => (
						<CopyBlock key={block.id} block={block} sp={sp} reduce={reduce} />
					))}

					{/* chrome */}
					<div className="absolute flex items-center gap-2.5" style={{ left: 176, top: 38 }}>
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-tight">spool</span>
					</div>
					<div
						className="absolute flex items-center gap-6 font-mono text-muted text-xs"
						style={{ right: 176, top: 42 }}
					>
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>

					<div
						className="absolute flex items-baseline gap-3 font-mono text-2xs"
						style={{ right: 176, bottom: 44 }}
					>
						<span className="text-thread">{String(beat + 1).padStart(2, "0")}</span>
						<span className="text-muted/50">/ {String(BEATS.length).padStart(2, "0")}</span>
						<span className="w-[62px] text-right text-muted">{name}</span>
					</div>

					<motion.div
						className="absolute flex items-center gap-2.5 font-mono text-muted text-sm"
						style={{ left: 176, bottom: 40, opacity: hintOpacity }}
					>
						<motion.span
							className="text-thread"
							animate={reduce ? undefined : { y: [0, 4, 0] }}
							transition={{ duration: 1.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						>
							<DownGlyph className="h-3.5 w-3.5" />
						</motion.span>
						<span>Scroll and they find their places.</span>
					</motion.div>

					<div className="absolute right-0 bottom-0 left-0 h-px bg-border">
						<motion.div
							className="h-full origin-left bg-thread"
							style={{ scaleX: trackScale, width: "100%" }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
