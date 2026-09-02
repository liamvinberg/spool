import { motion, useMotionValue, useMotionValueEvent } from "motion/react";
import { type CSSProperties, type ReactNode, memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-object--desk. The landing as a desk, and every claim on it as an object
 * with weight.
 *
 * The argument: spool's unit is a frame you move with your hands, so the page
 * that sells it should be movable too. Eight objects lie on one 1440x900 desk,
 * each tilted a degree or two off square because nothing anyone put down by hand
 * is square. They drag with momentum, they carry the product's own red ring and
 * size chip while held, and the red thread between them is real thread: it has a
 * rest length, so it sags when two objects come together and pulls taut when they
 * go apart. Push the install card away from the statement and you can see the
 * slack leave the line.
 *
 * Weight without shadow: lift is a scale, a brighter edge and the thread going
 * tight. Nothing here uses a drop shadow.
 *
 * Motion is transform and opacity. The thread's path is geometry that follows a
 * position, recomputed per frame from the same motion values the drag writes, so
 * it tracks through the throw as well as the drag.
 */

/* ---------- the desk ---------- */

type ObjId = "statement" | "install" | "mac" | "empty" | "projects" | "dogfood" | "video" | "mit";

interface Pt {
	x: number;
	y: number;
}

interface Spec {
	id: ObjId;
	x: number;
	y: number;
	w: number;
	h: number;
	tilt: number;
}

const SPECS: readonly Spec[] = [
	{ id: "statement", x: 72, y: 118, w: 512, h: 248, tilt: -1.3 },
	{ id: "install", x: 636, y: 118, w: 352, h: 180, tilt: 1.2 },
	{ id: "mac", x: 1042, y: 140, w: 336, h: 180, tilt: -1.6 },
	{ id: "empty", x: 636, y: 352, w: 352, h: 246, tilt: 0.8 },
	{ id: "projects", x: 1046, y: 372, w: 336, h: 246, tilt: -1 },
	{ id: "dogfood", x: 72, y: 430, w: 512, h: 300, tilt: 0.7 },
	{ id: "video", x: 618, y: 662, w: 352, h: 190, tilt: -1.2 },
	{ id: "mit", x: 1034, y: 648, w: 336, h: 190, tilt: 1.4 },
];

const SPEC_OF = SPECS.reduce<Record<ObjId, Spec>>(
	(acc, s) => {
		acc[s.id] = s;
		return acc;
	},
	{} as Record<ObjId, Spec>,
);

const HOME: Record<ObjId, Pt> = SPECS.reduce<Record<ObjId, Pt>>(
	(acc, s) => {
		acc[s.id] = { x: s.x, y: s.y };
		return acc;
	},
	{} as Record<ObjId, Pt>,
);

/* ---------- thread: anchors, rest length, sag ---------- */

type Side = "n" | "e" | "s" | "w";

interface Link {
	from: ObjId;
	to: ObjId;
	a: Side;
	at: number;
	b: Side;
	bt: number;
}

const LINKS: readonly Link[] = [
	{ from: "statement", a: "e", at: 0.42, to: "install", b: "w", bt: 0.5 },
	{ from: "install", a: "s", at: 0.38, to: "empty", b: "n", bt: 0.44 },
	{ from: "empty", a: "e", at: 0.5, to: "projects", b: "w", bt: 0.5 },
	{ from: "statement", a: "s", at: 0.3, to: "dogfood", b: "n", bt: 0.32 },
	{ from: "dogfood", a: "e", at: 0.62, to: "video", b: "w", bt: 0.42 },
	{ from: "projects", a: "s", at: 0.5, to: "mit", b: "n", bt: 0.52 },
];

function anchor(id: ObjId, pos: Pt, side: Side, t: number): Pt {
	const s = SPEC_OF[id];
	if (side === "n") return { x: pos.x + s.w * t, y: pos.y };
	if (side === "s") return { x: pos.x + s.w * t, y: pos.y + s.h };
	if (side === "w") return { x: pos.x, y: pos.y + s.h * t };
	return { x: pos.x + s.w, y: pos.y + s.h * t };
}

/** how much thread each link was cut with: the rest layout, plus slack. */
const REST: readonly number[] = LINKS.map((l) => {
	const a = anchor(l.from, HOME[l.from], l.a, l.at);
	const b = anchor(l.to, HOME[l.to], l.b, l.bt);
	return Math.hypot(b.x - a.x, b.y - a.y) * 1.62;
});

/**
 * A cubic with both handles pulled straight down by whatever thread the distance
 * is not using. Taut is a straight line; slack hangs below the lower anchor, the
 * way a cut length actually does.
 */
function threadPath(a: Pt, b: Pt, rest: number): string {
	const dist = Math.hypot(b.x - a.x, b.y - a.y);
	const drop = Math.max(2, Math.min(rest - dist, 300)) * 1.15;
	return `M ${a.x} ${a.y} C ${a.x} ${a.y + drop}, ${b.x} ${b.y + drop}, ${b.x} ${b.y}`;
}

function Threads({ pos, held }: { pos: Record<ObjId, Pt>; held: ObjId | null }) {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-10"
			width={1440}
			height={900}
			viewBox="0 0 1440 900"
			fill="none"
		>
			{LINKS.map((l, i) => {
				const a = anchor(l.from, pos[l.from], l.a, l.at);
				const b = anchor(l.to, pos[l.to], l.b, l.bt);
				const lit = held === l.from || held === l.to;
				return (
					<g key={`${l.from}-${l.to}`} opacity={lit ? 1 : 0.62}>
						<path
							d={threadPath(a, b, REST[i] ?? 0)}
							stroke="var(--color-thread)"
							strokeWidth={lit ? 1.75 : 1.35}
							strokeLinecap="round"
						/>
						<circle cx={a.x} cy={a.y} r={3} fill="var(--color-thread)" />
						<circle cx={b.x} cy={b.y} r={3} fill="var(--color-thread)" />
					</g>
				);
			})}
		</svg>
	);
}

/* ---------- the ring the product already wears ---------- */

const CORNER = "absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";

function Ring({ w, h }: { w: number; h: number }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			<div className="-inset-[3px] absolute rounded-[11px] border-[1.5px] border-thread" />
			<span className={cn(CORNER, "-left-[6px] -top-[6px]")} />
			<span className={cn(CORNER, "-right-[6px] -top-[6px]")} />
			<span className={cn(CORNER, "-left-[6px] -bottom-[6px]")} />
			<span className={cn(CORNER, "-right-[6px] -bottom-[6px]")} />
			<span className="-bottom-[9px] -translate-x-1/2 absolute left-1/2 whitespace-nowrap rounded-xs bg-thread px-1.5 py-[3px] font-mono text-2xs text-on-thread leading-none">
				{w} × {h}
			</span>
		</div>
	);
}

/* ---------- one object on the desk ---------- */

interface ObjectProps {
	spec: Spec;
	held: boolean;
	dimmed: boolean;
	deskRef: React.RefObject<HTMLDivElement | null>;
	onMove: (id: ObjId, x: number, y: number) => void;
	onHold: (id: ObjId | null) => void;
	children: ReactNode;
}

const DeskObject = memo(function DeskObject({
	spec,
	held,
	dimmed,
	deskRef,
	onMove,
	onHold,
	children,
}: ObjectProps) {
	const x = useMotionValue(spec.x);
	const y = useMotionValue(spec.y);

	useMotionValueEvent(x, "change", (v: number) => onMove(spec.id, v, y.get()));
	useMotionValueEvent(y, "change", (v: number) => onMove(spec.id, x.get(), v));

	return (
		<motion.div
			className="absolute top-0 left-0 cursor-grab touch-none select-none active:cursor-grabbing"
			style={{ x, y, width: spec.w, height: spec.h, rotate: spec.tilt, zIndex: held ? 30 : 20 }}
			drag
			dragConstraints={deskRef}
			dragElastic={0.04}
			dragMomentum
			dragTransition={{ power: 0.16, timeConstant: 240, bounceStiffness: 320, bounceDamping: 36 }}
			whileHover={{ scale: 1.012 }}
			whileDrag={{ scale: 1.035 }}
			transition={{ type: "spring", stiffness: 420, damping: 34 }}
			onPointerDown={() => onHold(spec.id)}
		>
			<div
				className={cn(
					"relative h-full w-full overflow-hidden rounded-lg border bg-surface transition-colors duration-200",
					held ? "border-border-raised" : "border-border",
					dimmed && "opacity-70",
				)}
			>
				<span className="absolute inset-x-0 top-0 h-px bg-white/7" />
				<span className="absolute inset-x-0 bottom-0 h-px bg-black/45" />
				{children}
			</div>
			{held ? <Ring w={spec.w} h={spec.h} /> : null}
		</motion.div>
	);
});

/* ---------- the small drawings inside the objects ---------- */

function Bar({ w, className }: { w: number | string; className?: string }) {
	return <span className={cn("block h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function Heading({ children }: { children: ReactNode }) {
	return <h2 className="font-medium text-[15px] text-text leading-[20px] tracking-tight">{children}</h2>;
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("text-[13px] text-muted leading-[19px]", className)}>{children}</p>;
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

/** the install line: clicking it copies, and the trailing $ is the only thing that moves. */
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
			onPointerDownCapture={(e) => e.stopPropagation()}
			onClick={() => {
				void copy();
			}}
			aria-label={`Copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left font-mono text-[13px] leading-[24px] focus-visible:outline-none"
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
	backgroundSize: "10px 10px",
};

/** first run: the window is there, the field is not filled yet. */
function EmptyWindow() {
	return (
		<div className="flex h-[112px] w-full overflow-hidden rounded-md border border-border bg-canvas">
			<div className="w-[64px] shrink-0 border-border border-r px-2 py-2">
				<div className="mb-2 flex items-center gap-1">
					<span className="h-[7px] w-[7px] rounded-[2px] bg-thread" />
					<Bar w={24} />
				</div>
				<Bar w={34} className="mb-1.5" />
				<Bar w={26} />
			</div>
			<div className="relative flex-1" style={miniGrid}>
				<div className="absolute inset-x-0 top-0 flex h-[18px] items-center gap-1.5 border-border border-b px-2">
					<span className="rounded-[3px] border border-border-raised px-1 py-px font-mono text-[7px] text-muted leading-none">
						your-app
					</span>
					<span className="font-mono text-[9px] text-thread leading-none">+</span>
				</div>
				<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-[10px] text-muted leading-none">
					no frames yet
				</span>
			</div>
		</div>
	);
}

/** several projects: labelled tabs, stacked the way labels stack. */
const PROJECT_TABS = [
	{ name: "spool", count: "142" },
	{ name: "kaffe", count: "18" },
	{ name: "tvarso", count: "31" },
];

function ProjectTabs() {
	return (
		<div className="space-y-[7px]">
			{PROJECT_TABS.map((p, i) => (
				<div
					key={p.name}
					className={cn(
						"flex items-center justify-between rounded-sm border px-2.5 py-[7px] font-mono text-[11px] leading-none",
						i === 0 ? "border-thread/45 bg-raised text-text" : "border-border bg-canvas text-muted",
					)}
					style={{ marginLeft: i * 10 }}
				>
					<span className="flex items-center gap-2">
						{i === 0 ? <span className="h-[6px] w-[6px] rounded-full bg-thread" /> : null}
						{p.name}
					</span>
					<span className="text-muted/70">{p.count}</span>
				</div>
			))}
		</div>
	);
}

/** spool's own design folder, drawn small: frames with thread between them. */
const DOGFOOD_TILES = [
	{ x: 14, y: 22, w: 46, h: 32 },
	{ x: 76, y: 12, w: 34, h: 24 },
	{ x: 76, y: 46, w: 34, h: 26 },
	{ x: 126, y: 26, w: 52, h: 36 },
	{ x: 194, y: 14, w: 28, h: 20 },
	{ x: 194, y: 44, w: 28, h: 28 },
	{ x: 238, y: 24, w: 42, h: 30 },
	{ x: 296, y: 12, w: 26, h: 18 },
	{ x: 296, y: 40, w: 36, h: 26 },
	{ x: 348, y: 20, w: 30, h: 34 },
	{ x: 394, y: 32, w: 38, h: 26 },
];

function DogfoodField() {
	return (
		<div
			className="relative h-[112px] w-full overflow-hidden rounded-md border border-border bg-canvas"
			style={miniGrid}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0"
				width={448}
				height={112}
				viewBox="0 0 448 112"
				fill="none"
			>
				<path
					d="M60 40 C 72 40, 66 24, 76 24 M60 44 C 72 44, 68 60, 76 60 M110 24 C 120 24, 118 44, 126 44 M178 44 C 188 44, 188 24, 194 24 M178 48 C 188 48, 190 58, 194 58 M222 26 C 232 26, 230 40, 238 40 M280 38 C 290 38, 288 22, 296 22 M280 42 C 290 42, 288 54, 296 54 M332 52 C 342 52, 340 38, 348 38 M378 38 C 388 38, 386 46, 394 46"
					stroke="var(--color-thread)"
					strokeOpacity="0.5"
					strokeWidth="1"
					strokeLinecap="round"
				/>
			</svg>
			{DOGFOOD_TILES.map((t) => (
				<span
					key={`${t.x}-${t.y}`}
					className="absolute rounded-[2px] border border-border-raised bg-surface"
					style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
				/>
			))}
			<span className="absolute top-[10px] right-[12px] font-mono text-[9px] text-muted/70 leading-none">
				design/frames
			</span>
		</div>
	);
}

function VideoPlate() {
	return (
		<div className="relative h-[104px] w-full overflow-hidden rounded-md border border-border bg-canvas">
			<div className="absolute inset-0" style={miniGrid} />
			<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
				<span className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-thread/60 bg-bg/70">
					<svg viewBox="0 0 12 12" fill="var(--color-thread)" aria-hidden="true" className="h-3 w-3">
						<path d="M3.4 1.9 9.4 6 3.4 10.1Z" />
					</svg>
				</span>
			</div>
			<div className="absolute inset-x-3 bottom-2.5 flex items-center gap-2">
				<span className="h-[2px] flex-1 rounded-full bg-border-raised">
					<span className="block h-full w-[14%] rounded-full bg-thread" />
				</span>
				<span className="font-mono text-[9px] text-muted leading-none">2:14</span>
			</div>
		</div>
	);
}

/* ---------- the page ---------- */

const desk: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 6%, transparent) 1px, transparent 1px)",
	backgroundSize: "32px 32px",
	backgroundPosition: "-1px -1px",
};

const vignette: CSSProperties = {
	background: "radial-gradient(130% 100% at 50% 40%, transparent 58%, rgba(0,0,0,0.34) 100%)",
};

export default function SiteObjectDesk() {
	const deskRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<Record<ObjId, Pt>>(HOME);
	const [held, setHeld] = useState<ObjId | null>(null);

	const onMove = useCallback((id: ObjId, x: number, y: number) => {
		setPos((prev) => {
			const cur = prev[id];
			if (cur.x === x && cur.y === y) return prev;
			return { ...prev, [id]: { x, y } };
		});
	}, []);

	const onHold = useCallback((id: ObjId | null) => {
		setHeld(id);
	}, []);

	useEffect(() => {
		const up = () => setHeld(null);
		window.addEventListener("pointerup", up);
		return () => window.removeEventListener("pointerup", up);
	}, []);

	const body = (id: ObjId): ReactNode => {
		if (id === "statement")
			return (
				<div className="flex h-full flex-col justify-center px-8">
					<h1 className="font-semibold text-[42px] text-text leading-[1.02] tracking-[-0.028em]">
						Frames you
						<br />
						can pick up.
					</h1>
					<p className="mt-4 max-w-[420px] text-[14px] text-muted leading-[21px]">
						spool is a prototyping canvas that lives in your repo. Your agent writes TSX frames into
						design/, you put them where they belong, and you click through the flow the way a user
						would.
					</p>
				</div>
			);
		if (id === "install")
			return (
				<div className="flex h-full flex-col justify-center px-6">
					<Heading>Install it</Heading>
					<div className="mt-3 flex gap-3.5">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div>
							<CommandLine prompt="~ " command="npm i -g spool.page" />
							<CommandLine prompt="~/your-app " command="spool init" />
						</div>
					</div>
					<div className="mt-3 font-mono text-[11px] text-muted leading-none">
						node 22+ · chrome for the canvas
					</div>
				</div>
			);
		if (id === "mac")
			return (
				<div className="flex h-full flex-col justify-center px-6">
					<Heading>Or take the Mac app</Heading>
					<Body className="mt-2.5">
						The same daemon, in a window, with a dock icon. Download the DMG and open it.
					</Body>
					<div className="mt-3.5 inline-flex w-fit items-center gap-2 rounded-sm border border-border-raised bg-raised px-2.5 py-[7px] font-mono text-[11px] text-text leading-none">
						<SpoolMark className="h-3 w-[10px] text-thread" />
						Spool.dmg
					</div>
				</div>
			);
		if (id === "empty")
			return (
				<div className="flex h-full flex-col justify-between px-6 py-5">
					<div>
						<Heading>The first run is empty</Heading>
						<Body className="mt-2">
							Press + and point spool at any folder on your machine. It opens the project and watches
							design/ from there.
						</Body>
					</div>
					<EmptyWindow />
				</div>
			);
		if (id === "projects")
			return (
				<div className="flex h-full flex-col justify-between px-6 py-5">
					<div>
						<Heading>Several projects at once</Heading>
						<Body className="mt-2">Each one keeps its own canvas. The tabs are how you move.</Body>
					</div>
					<ProjectTabs />
				</div>
			);
		if (id === "dogfood")
			return (
				<div className="flex h-full flex-col justify-between px-8 py-6">
					<div className="flex items-start justify-between gap-6">
						<div>
							<Heading>spool is designed in spool</Heading>
							<Body className="mt-2 max-w-[300px]">
								This page was drawn on the canvas in spool's own repo, beside the app it sells.
							</Body>
						</div>
						<div className="pt-1 text-right">
							<div className="font-semibold text-[30px] text-thread leading-none tracking-tight">142</div>
							<div className="mt-1.5 font-mono text-[10px] text-muted leading-none">frames · 12 pages</div>
						</div>
					</div>
					<DogfoodField />
				</div>
			);
		if (id === "video")
			return (
				<div className="flex h-full flex-col justify-between px-6 py-5">
					<div className="flex items-baseline justify-between">
						<Heading>Watch the first two minutes</Heading>
						<span className="font-mono text-[10px] text-muted leading-none">getting-started</span>
					</div>
					<VideoPlate />
				</div>
			);
		return (
			<div className="flex h-full flex-col justify-center px-6">
				<Heading>MIT, and we mean it</Heading>
				<p className="mt-2.5 text-[14px] text-text leading-[21px]">
					Fork it, rework it, rename it, ship it.
				</p>
				<div className="mt-4 font-mono text-[11px] text-muted leading-none">
					github.com/liamvinberg/spool
				</div>
			</div>
		);
	};

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="absolute inset-0" style={desk} />
			<div className="pointer-events-none absolute inset-0" style={vignette} />

			<header className="absolute inset-x-0 top-0 z-40 flex h-[76px] items-center justify-between px-10">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-4 text-thread" title="spool" />
					<span className="font-semibold text-[15px] tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-7 font-mono text-[11px] text-muted leading-none">
					<span>spool.page</span>
					<span className="text-text">github.com/liamvinberg/spool</span>
				</div>
			</header>

			<div ref={deskRef} className="absolute inset-0">
				<Threads pos={pos} held={held} />
				{SPECS.map((spec) => (
					<DeskObject
						key={spec.id}
						spec={spec}
						held={held === spec.id}
						dimmed={held !== null && held !== spec.id}
						deskRef={deskRef}
						onMove={onMove}
						onHold={onHold}
					>
						{body(spec.id)}
					</DeskObject>
				))}
			</div>

			<div className="pointer-events-none absolute bottom-8 left-10 z-40 flex items-center gap-2.5">
				<span className="h-px w-6 bg-thread/70" />
				<span className="font-mono text-[11px] text-muted leading-none">drag anything</span>
			</div>
		</div>
	);
}
