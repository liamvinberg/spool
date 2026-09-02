import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-object--thread. One length of thread, paid out from a spool at the top of
 * the page and running through every beat below it.
 *
 * The argument: spool's story is sequential, so the page should be a line rather
 * than a grid. There is exactly one thread here and it is real geometry: it comes
 * off a wound bobbin, passes through an eyelet at each beat, and stops where you
 * have stopped reading. Scroll and the bobbin turns, the coil shrinks by the
 * length it gave up, and the thread draws further down the page. The eyelet you
 * are level with is the lit one.
 *
 * The thread is also the control. Grab it anywhere and pull: the page comes with
 * your hand at exactly the rate a rope would, and lets go with the weight you
 * gave it. Pressing an eyelet travels to that beat. The scrollbar is hidden
 * because the thread is the scrollbar.
 *
 * Motion is transform, opacity and pathLength. Nothing is measured at runtime;
 * the spine is one analytic curve, so any y on the page knows its own x.
 */

/* ---------- the page's fixed geometry ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const CONTENT_H = 3340;
const SCROLLABLE = CONTENT_H - VIEW_H;

/** the bobbin, and the eyelet the thread leaves it through */
const HUB = { x: 250, y: 320, r: 116 };
const GUIDE = { x: 372, y: 320 };

const SPINE_END = 3200;
const SPINE_X = 372;
const SPINE_AMP = 86;
const SPINE_WAVES = 4.6;

/** every y on the spine knows its own x, so eyelets never need measuring. */
function spineX(y: number): number {
	const t = (y - GUIDE.y) / (SPINE_END - GUIDE.y);
	return SPINE_X + Math.sin(t * Math.PI * SPINE_WAVES) * SPINE_AMP;
}

function spinePath(): string {
	const steps = 220;
	let d = "";
	for (let i = 0; i <= steps; i += 1) {
		const y = GUIDE.y + ((SPINE_END - GUIDE.y) * i) / steps;
		const x = spineX(y);
		d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	return d;
}

const SPINE = spinePath();

/** the wound coil, drawn as what it is: an Archimedean spiral. */
function spiralPath(r0: number, r1: number, turns: number): string {
	const steps = Math.round(turns * 72);
	let d = "";
	for (let i = 0; i <= steps; i += 1) {
		const t = i / steps;
		const th = t * turns * Math.PI * 2;
		const r = r0 + (r1 - r0) * t;
		const x = 120 + r * Math.cos(th);
		const y = 120 + r * Math.sin(th);
		d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	return d;
}

const SPIRAL = spiralPath(32, 104, 9);

/* ---------- the beats ---------- */

type BeatId = "mac" | "empty" | "folders" | "dogfood" | "video" | "mit";

interface Beat {
	id: BeatId;
	y: number;
	n: string;
}

const BEATS: readonly Beat[] = [
	{ id: "mac", y: 780, n: "01" },
	{ id: "empty", y: 1120, n: "02" },
	{ id: "folders", y: 1600, n: "03" },
	{ id: "dogfood", y: 2040, n: "04" },
	{ id: "video", y: 2440, n: "05" },
	{ id: "mit", y: 2940, n: "06" },
];

const BLOCK_X = 560;
const BLOCK_W = 680;

/** where the branch reaches the three project rows */
const SPUR_YS = [1715, 1757, 1799];

/* ---------- primitives ---------- */

function Heading({ children }: { children: ReactNode }) {
	return (
		<h2 className="font-semibold text-[27px] text-text leading-[1.14] tracking-[-0.02em]">{children}</h2>
	);
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("max-w-[560px] text-[15px] text-muted leading-[25px]", className)}>{children}</p>;
}

function Tick() {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-3 w-3">
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

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
		} catch {
			return;
		}
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1400);
	}

	return (
		<button
			type="button"
			onClick={() => {
				void copy();
			}}
			aria-label={`Copy ${command}`}
			className="group/cmd block cursor-pointer text-left font-mono text-[15px] leading-[30px] focus-visible:outline-none"
		>
			<span className="select-none text-muted">{prompt}</span>
			<span className="relative mr-[1ch] inline-block w-[1ch] select-none text-center align-baseline">
				<span
					className={cn(
						"text-muted transition-opacity duration-150",
						copied ? "opacity-0" : "group-hover/cmd:opacity-0",
					)}
				>
					$
				</span>
				<span
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				>
					<Tick />
				</span>
			</span>
			<span className="text-text">{command}</span>
		</button>
	);
}

const miniGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "12px 12px",
};

/* ---------- the devices under the beats ---------- */

function EmptyWindow() {
	return (
		<div className="flex h-[196px] w-[600px] overflow-hidden rounded-lg border border-border bg-canvas">
			<div className="w-[132px] shrink-0 border-border border-r p-3">
				<div className="mb-3 flex items-center gap-2">
					<SpoolMark className="h-3.5 w-3 text-thread" />
					<span className="font-mono text-[10px] text-muted leading-none">your-app</span>
				</div>
				<div className="space-y-2">
					<span className="block h-[3px] w-[62px] rounded-full bg-border-raised" />
					<span className="block h-[3px] w-[44px] rounded-full bg-border-raised" />
				</div>
			</div>
			<div className="relative flex-1">
				<div className="flex h-[30px] items-center gap-2 border-border border-b px-3">
					<span className="rounded-[3px] border border-border-raised px-1.5 py-[3px] font-mono text-[9px] text-muted leading-none">
						your-app
					</span>
					<span className="font-mono text-[12px] text-thread leading-none">+</span>
				</div>
				<div className="absolute inset-x-0 top-[30px] bottom-0" style={miniGrid}>
					<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-[12px] text-muted leading-none">
						no frames yet
					</span>
				</div>
			</div>
		</div>
	);
}

const PROJECTS = [
	{ name: "~/spool", count: "142 frames" },
	{ name: "~/kaffe", count: "18 frames" },
	{ name: "~/tvarso", count: "31 frames" },
];

const DOGFOOD_TILES = [
	{ x: 16, y: 30, w: 62, h: 42 },
	{ x: 96, y: 16, w: 46, h: 32 },
	{ x: 96, y: 58, w: 46, h: 36 },
	{ x: 160, y: 34, w: 70, h: 48 },
	{ x: 248, y: 18, w: 38, h: 26 },
	{ x: 248, y: 56, w: 38, h: 38 },
	{ x: 304, y: 30, w: 56, h: 40 },
	{ x: 378, y: 14, w: 34, h: 24 },
	{ x: 378, y: 50, w: 48, h: 34 },
	{ x: 444, y: 26, w: 40, h: 46 },
	{ x: 502, y: 40, w: 52, h: 34 },
];

function DogfoodField() {
	return (
		<div
			className="relative h-[132px] w-[600px] overflow-hidden rounded-lg border border-border bg-canvas"
			style={miniGrid}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0"
				width={600}
				height={132}
				viewBox="0 0 600 132"
				fill="none"
			>
				<path
					d="M78 52 C 90 52, 84 32, 96 32 M78 58 C 90 58, 86 76, 96 76 M142 32 C 154 32, 152 58, 160 58 M230 58 C 242 58, 242 31, 248 31 M230 64 C 242 64, 244 75, 248 75 M286 31 C 298 31, 296 50, 304 50 M360 50 C 372 50, 370 26, 378 26 M360 56 C 372 56, 370 67, 378 67 M426 67 C 438 67, 436 49, 444 49 M484 49 C 496 49, 494 57, 502 57"
					stroke="var(--color-thread)"
					strokeOpacity="0.5"
					strokeWidth="1.1"
					strokeLinecap="round"
				/>
			</svg>
			{DOGFOOD_TILES.map((t) => (
				<span
					key={`${t.x}-${t.y}`}
					className="absolute rounded-[3px] border border-border-raised bg-surface"
					style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
				/>
			))}
			<span className="absolute top-3 right-4 font-mono text-[10px] text-muted/70 leading-none">
				design/frames
			</span>
		</div>
	);
}

function VideoPlate() {
	return (
		<div className="relative h-[300px] w-[600px] overflow-hidden rounded-lg border border-border bg-canvas">
			<div className="absolute inset-0" style={miniGrid} />
			<button
				type="button"
				className="-translate-x-1/2 -translate-y-1/2 group/play absolute top-1/2 left-1/2 flex h-[62px] w-[62px] cursor-pointer items-center justify-center rounded-full border border-thread/55 bg-bg/70 transition-transform duration-200 hover:scale-108 focus-visible:outline-none"
				aria-label="Play the getting started video"
			>
				<svg viewBox="0 0 12 12" fill="var(--color-thread)" aria-hidden="true" className="h-4 w-4">
					<path d="M3.6 1.9 9.6 6 3.6 10.1Z" />
				</svg>
			</button>
			<div className="absolute inset-x-5 bottom-4 flex items-center gap-3">
				<span className="h-[2px] flex-1 rounded-full bg-border-raised">
					<span className="block h-full w-[9%] rounded-full bg-thread" />
				</span>
				<span className="font-mono text-[10px] text-muted leading-none">2:14</span>
			</div>
		</div>
	);
}

/* ---------- the bobbin ---------- */

function Bobbin({ turn, coil }: { turn: ReturnType<typeof useTransform>; coil: ReturnType<typeof useTransform> }) {
	return (
		<div
			className="absolute"
			style={{ left: HUB.x - 120, top: HUB.y - 120, width: 240, height: 240 }}
			aria-hidden="true"
		>
			<span
				className="absolute inset-0 rounded-full border border-border-raised"
				style={{ background: "radial-gradient(circle at 38% 32%, #1C1C1C, #0E0E0E 78%)" }}
			/>
			<motion.svg
				className="absolute inset-0"
				width={240}
				height={240}
				viewBox="0 0 240 240"
				fill="none"
				style={{ rotate: turn, scale: coil }}
			>
				<path d={SPIRAL} stroke="var(--color-thread)" strokeOpacity="0.85" strokeWidth="1.5" />
			</motion.svg>
			<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-[54px] w-[54px] rounded-full border border-border-raised bg-surface" />
			<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-thread" />
			<span className="absolute inset-0 rounded-full border border-border-raised/70" />
		</div>
	);
}

/* ---------- the page ---------- */

export default function SiteObjectThread() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const raf = useRef<number | null>(null);
	const grab = useRef<{ y: number; v: number; t: number } | null>(null);
	const [active, setActive] = useState(-1);
	const [hover, setHover] = useState<BeatId | null>(null);

	const { scrollYProgress } = useScroll({ container: scrollRef });

	/** how much thread is paid out: everything above the fold, plus what you scrolled past. */
	const drawn = useTransform(scrollYProgress, (v: number) => (v * SCROLLABLE + VIEW_H) / CONTENT_H);
	const turn = useTransform(scrollYProgress, [0, 1], [0, -1040]);
	const coil = useTransform(scrollYProgress, [0, 1], [1, 0.64]);

	useMotionValueEvent(scrollYProgress, "change", (v: number) => {
		const line = v * SCROLLABLE + 430;
		let i = -1;
		BEATS.forEach((b, idx) => {
			if (b.y <= line) i = idx;
		});
		setActive(i);
	});

	const stop = useCallback(() => {
		if (raf.current !== null) {
			cancelAnimationFrame(raf.current);
			raf.current = null;
		}
	}, []);

	useEffect(() => stop, [stop]);

	const travel = useCallback((y: number) => {
		stop();
		scrollRef.current?.scrollTo({ top: Math.max(0, Math.min(y - 300, SCROLLABLE)), behavior: "smooth" });
	}, [stop]);

	function onGrab(e: React.PointerEvent<SVGPathElement>) {
		stop();
		e.currentTarget.setPointerCapture(e.pointerId);
		grab.current = { y: e.clientY, v: 0, t: performance.now() };
	}

	function onPull(e: React.PointerEvent<SVGPathElement>) {
		const g = grab.current;
		const el = scrollRef.current;
		if (g === null || el === null) return;
		const dy = e.clientY - g.y;
		el.scrollTop -= dy;
		const now = performance.now();
		g.v = (dy / Math.max(1, now - g.t)) * 16;
		g.y = e.clientY;
		g.t = now;
	}

	function onRelease() {
		const g = grab.current;
		grab.current = null;
		if (g === null || Math.abs(g.v) < 1.2) return;
		let v = g.v;
		const step = () => {
			const el = scrollRef.current;
			if (el === null) return;
			v *= 0.945;
			el.scrollTop -= v;
			raf.current = Math.abs(v) > 0.4 ? requestAnimationFrame(step) : null;
		};
		raf.current = requestAnimationFrame(step);
	}

	const beatBody = (id: BeatId): ReactNode => {
		if (id === "mac")
			return (
				<>
					<Heading>Or run the Mac app</Heading>
					<Body className="mt-3">
						The same daemon in a window, with a dock icon and a menu bar. Download the DMG, drag it
						across, and it starts itself at login.
					</Body>
					<div className="mt-5 inline-flex items-center gap-2.5 rounded-md border border-border-raised bg-surface px-3.5 py-2.5 font-mono text-[13px] text-text leading-none">
						<SpoolMark className="h-4 w-3.5 text-thread" />
						Spool.dmg
					</div>
				</>
			);
		if (id === "empty")
			return (
				<>
					<Heading>The first run is empty</Heading>
					<Body className="mt-3">
						spool opens on a project with nothing in it and says so in the middle of the field. Your
						agent fills it: a frame is born when a folder under design/frames gets a frame.tsx, and it
						is on the canvas by the time you look up.
					</Body>
					<div className="mt-6">
						<EmptyWindow />
					</div>
				</>
			);
		if (id === "folders")
			return (
				<>
					<Heading>Press + and point it at a folder</Heading>
					<Body className="mt-3">
						Any folder on your machine becomes a project. Keep as many open as you like; each one has
						its own canvas and its own design/ folder, tracked in its own git history.
					</Body>
					<div className="mt-6 w-[420px] space-y-2">
						{PROJECTS.map((p, i) => (
							<div
								key={p.name}
								className={cn(
									"flex items-center justify-between rounded-md border px-3.5 py-2.5 font-mono text-[12px] leading-none",
									i === 0
										? "border-thread/45 bg-surface text-text"
										: "border-border bg-canvas text-muted",
								)}
							>
								<span className="flex items-center gap-2.5">
									{i === 0 ? <span className="h-[6px] w-[6px] rounded-full bg-thread" /> : null}
									{p.name}
								</span>
								<span className="text-muted/70">{p.count}</span>
							</div>
						))}
					</div>
				</>
			);
		if (id === "dogfood")
			return (
				<>
					<div className="flex items-start gap-10">
						<div>
							<Heading>spool is designed in spool</Heading>
							<Body className="mt-3 max-w-[440px]">
								This page was drawn on the canvas in spool's own repo, next to the app it describes.
								Every take that lost is still in the git history.
							</Body>
						</div>
						<div className="pt-1">
							<div className="font-semibold text-[46px] text-thread leading-none tracking-tight">142</div>
							<div className="mt-2 font-mono text-[11px] text-muted leading-none">frames · 12 pages</div>
						</div>
					</div>
					<div className="mt-6">
						<DogfoodField />
					</div>
				</>
			);
		if (id === "video")
			return (
				<>
					<Heading>Two minutes, start to finish</Heading>
					<Body className="mt-3">
						Install it, open a folder, ask for a screen, watch it land on the canvas.
					</Body>
					<div className="mt-6">
						<VideoPlate />
					</div>
				</>
			);
		return (
			<>
				<Heading>MIT</Heading>
				<p className="mt-3 text-[19px] text-text leading-[28px]">
					Fork it, rework it, rename it, ship it.
				</p>
				<Body className="mt-3">
					It is a tool for designing things. Make it your own if you want to.
				</Body>
				<div className="mt-5 font-mono text-[12px] text-muted leading-none">
					github.com/liamvinberg/spool
				</div>
			</>
		);
	};

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<style>{".thread-scroll::-webkit-scrollbar{width:0;height:0}"}</style>

			<div
				ref={scrollRef}
				className="thread-scroll h-full w-full overflow-y-auto overflow-x-hidden"
				style={{ scrollbarWidth: "none" }}
			>
				<div className="relative" style={{ width: VIEW_W, height: CONTENT_H }}>
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute top-0 left-0"
						width={VIEW_W}
						height={CONTENT_H}
						viewBox={`0 0 ${VIEW_W} ${CONTENT_H}`}
						fill="none"
					>
						<motion.path
							d={SPINE}
							stroke="var(--color-thread)"
							strokeWidth={1.6}
							strokeLinecap="round"
							style={{ pathLength: drawn }}
						/>
						{/* the branch: one thread reaching three projects */}
						<path
							d={SPUR_YS.map(
								(sy) =>
									`M ${spineX(sy).toFixed(1)} ${sy} C ${(spineX(sy) + 62).toFixed(1)} ${sy}, 500 ${sy}, 556 ${sy}`,
							).join(" ")}
							stroke="var(--color-thread)"
							strokeOpacity="0.5"
							strokeWidth="1.2"
							strokeLinecap="round"
						/>
						<path
							d={SPINE}
							stroke="transparent"
							strokeWidth={34}
							style={{ pointerEvents: "stroke", cursor: "grab" }}
							onPointerDown={onGrab}
							onPointerMove={onPull}
							onPointerUp={onRelease}
							onPointerCancel={onRelease}
						/>
					</svg>

					<Bobbin turn={turn} coil={coil} />

					{/* the guide the thread leaves the bobbin through */}
					<span
						className="absolute block h-[15px] w-[15px] rounded-full border border-thread/60 bg-bg"
						style={{ left: GUIDE.x - 7.5, top: GUIDE.y - 7.5 }}
					/>
					<span
						className="absolute block h-[5px] w-[5px] rounded-full bg-thread"
						style={{ left: GUIDE.x - 2.5, top: GUIDE.y - 2.5 }}
					/>

					{/* the hero */}
					<div className="absolute" style={{ left: BLOCK_X, top: 158, width: BLOCK_W }}>
						<h1 className="font-semibold text-[62px] leading-[0.98] tracking-[-0.03em]">
							Follow the thread.
						</h1>
						<p className="mt-6 max-w-[600px] text-[17px] text-muted leading-[27px]">
							spool is a prototyping canvas that lives in your repo. Your agent writes TSX frames into
							design/, you link them into flows, and you click through the whole thing long before any
							of it is built.
						</p>
						<div className="mt-8 flex gap-5">
							<span className="w-px shrink-0 self-stretch bg-thread/70" />
							<div>
								<CommandLine prompt="~ " command="npm i -g spool.page" />
								<CommandLine prompt="~/your-app " command="spool init" />
							</div>
						</div>
						<div className="mt-5 pl-[21px] font-mono text-[12px] text-muted leading-none">
							node 22+ · chrome for the canvas · macos and linux
						</div>
						<div className="mt-10 flex items-center gap-3 font-mono text-[12px] text-muted/70 leading-none">
							<span className="h-px w-8 bg-thread/70" />
							pull the thread, or scroll
						</div>
					</div>

					{/* the beats, each hung on its own eyelet */}
					{BEATS.map((b) => (
						<div
							key={b.id}
							className="absolute"
							style={{ left: BLOCK_X, top: b.y - 18, width: BLOCK_W }}
							onMouseEnter={() => setHover(b.id)}
							onMouseLeave={() => setHover(null)}
						>
							{beatBody(b.id)}
						</div>
					))}

					{/* the eyelets: the thread's index, and the way back to any beat */}
					{BEATS.map((b, i) => {
						const x = spineX(b.y);
						const lit = active === i || hover === b.id;
						return (
							<button
								key={b.id}
								type="button"
								onClick={() => travel(b.y)}
								onMouseEnter={() => setHover(b.id)}
								onMouseLeave={() => setHover(null)}
								aria-label={`Go to ${b.id}`}
								className="absolute flex cursor-pointer items-center gap-3 focus-visible:outline-none"
								style={{ left: x - 13, top: b.y - 13, height: 26 }}
							>
								<span className="relative block h-[26px] w-[26px]">
									<span
										className={cn(
											"absolute inset-0 rounded-full border transition-all duration-200",
											lit ? "scale-100 border-thread/70" : "scale-75 border-thread/25",
										)}
									/>
									<span
										className={cn(
											"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 block rounded-full border-[3px] border-bg bg-thread transition-all duration-200",
											lit ? "h-[11px] w-[11px]" : "h-[9px] w-[9px]",
										)}
									/>
								</span>
								<span
									className={cn(
										"font-mono text-[11px] leading-none transition-colors duration-200",
										lit ? "text-thread" : "text-muted/60",
									)}
								>
									{b.n}
								</span>
							</button>
						);
					})}

					{/* where the thread stops */}
					<div className="absolute" style={{ left: spineX(SPINE_END) - 4, top: SPINE_END - 4 }}>
						<span className="block h-2 w-2 rounded-full bg-thread" />
					</div>
					<div
						className="absolute font-mono text-[11px] text-muted/70 leading-none"
						style={{ left: spineX(SPINE_END) + 22, top: SPINE_END - 5 }}
					>
						end of thread
					</div>
				</div>
			</div>

			{/* fixed chrome, over the scroll */}
			<div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[104px] bg-gradient-to-b from-bg via-bg/90 to-transparent" />
			<header className="absolute inset-x-0 top-0 z-40 flex h-[76px] items-center justify-between px-11">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-4 text-thread" title="spool" />
					<span className="font-semibold text-[15px] tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-7 font-mono text-[11px] text-muted leading-none">
					<span>spool.page</span>
					<span className="text-text">github.com/liamvinberg/spool</span>
				</div>
			</header>

			<div className="absolute right-11 bottom-8 z-40 font-mono text-[11px] text-muted leading-none">
				{active < 0 ? "00" : BEATS[active]?.n} / 06
			</div>
		</div>
	);
}
