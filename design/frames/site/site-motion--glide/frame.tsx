import { type MotionValue, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-motion--glide. spool.page argued through one motion character: the site
 * is not a stack of sections, it is one canvas, and the scroll is a camera
 * travelling across it.
 *
 * The incumbent (site-hub--composed) also moves a camera, but it moves outward:
 * the page shrinks until the canvas appears around it. This one never changes
 * scale. It tracks sideways, at a constant 1:1, past eight moments strung along
 * a single red thread that runs the whole width of the scene. Four layers move
 * at four rates — the dot field at 0.3, distant frames at 0.62, the moments and
 * the thread at 1, foreground marks at 1.16 — so the depth is real rather than
 * implied, and a gentle vertical drift keeps it a camera rather than a slide.
 *
 * The thread is the page's index and it draws itself as you travel: its
 * pathLength is the scroll, so the flow between moments is being laid down in
 * front of you, and each node lights as its moment comes to the middle of the
 * lens. Moments away from the centre sit back — smaller, dimmer — because
 * distance is what a camera has instead of a fold.
 *
 * Transform and opacity only, one fixed 1440x900 stage. Under
 * prefers-reduced-motion the parallax collapses to a single plane, the drift and
 * the depth falloff go, and the page is a plain sideways pan.
 */

/* ---------- the scene ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;

interface Moment {
	id: string;
	cx: number;
	/** where the thread crosses this moment */
	ty: number;
	title: string;
	body: ReactNode;
	extra?: ReactNode;
	cluster: () => ReactNode;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

const dots = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 10%, transparent) 1px, transparent 1px)",
	backgroundSize: "26px 26px",
};

/* ---------- glyphs ---------- */

function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function FolderGlyph({ className }: { className?: string }) {
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

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
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

function RightGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M1.5 6h9M7 2.5 10.5 6 7 9.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ---------- the install line ---------- */

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

/* ---------- the objects a cluster is built from ---------- */

function Card({
	x,
	y,
	w,
	h,
	name,
	lit,
	children,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	name?: string;
	lit?: boolean;
	children?: ReactNode;
}) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w }}>
			{name === undefined ? null : (
				<div className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs leading-none">
					<span className={lit === true ? "text-thread" : "text-muted/70"}>{lit === true ? "▶" : "▸"}</span>
					<span className={lit === true ? "text-thread" : "text-muted"}>{name}</span>
				</div>
			)}
			<div
				className={cn(
					"overflow-hidden rounded-[6px] border bg-surface",
					lit === true ? "border-thread" : "border-border",
				)}
				style={{ height: h }}
			>
				{children ?? <Skeleton />}
			</div>
		</div>
	);
}

function Bar({ w, tone = "line" }: { w: string | number; tone?: "line" | "block" | "accent" }) {
	if (tone === "block") return <div className="h-2.5 rounded-[2px] bg-raised" style={{ width: w }} />;
	if (tone === "accent") return <div className="h-4 rounded-[3px] bg-thread/75" style={{ width: w }} />;
	return <div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />;
}

function Skeleton() {
	return (
		<div className="space-y-2.5 p-3">
			<Bar w="58%" tone="block" />
			<Bar w="86%" />
			<Bar w="64%" />
			<Bar w="74%" />
			<div className="pt-2">
				<Bar w="44%" tone="accent" />
			</div>
		</div>
	);
}

/* ---------- the eight clusters ---------- */

/**
 * The opening region of the canvas: five frames at the sizes they were authored
 * at, one of them selected. No arrows here — the red linework on this page all
 * belongs to the one thread running along the lane below.
 */
function HeroCluster() {
	return (
		<>
			<Card x={0} y={22} w={196} h={128} name="home" />
			<Card x={0} y={210} w={168} h={112} name="pricing" />
			<Card x={232} y={0} w={252} h={168} name="cart" lit />
			<Card x={210} y={222} w={186} h={124} name="checkout" />
			<Card x={528} y={54} w={210} h={140} name="receipt" />
			<Card x={438} y={252} w={158} h={104} name="settings" />
			<div
				className="absolute rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none"
				style={{ left: 320, top: 176 }}
			>
				1440 × 900
			</div>
		</>
	);
}

const TERMINAL: readonly { p: string; t: string; out?: boolean }[] = [
	{ p: "~ $", t: "npm i -g spool.page" },
	{ p: "", t: "added 41 packages in 6s", out: true },
	{ p: "~/tvarso $", t: "spool init" },
	{ p: "", t: "design/ created · project registered", out: true },
	{ p: "~/tvarso $", t: "spool serve" },
	{ p: "", t: "http://localhost:7766", out: true },
];

function InstallCluster() {
	return (
		<div className="absolute" style={{ left: 0, top: 26, width: 560 }}>
			<div className="overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex items-center justify-between border-border border-b px-4 py-2.5 font-mono text-2xs text-muted">
					<span>~/tvarso</span>
					<span>zsh</span>
				</div>
				<div className="p-5">
					{TERMINAL.map((l) => (
						<div key={l.t} className="flex gap-2 font-mono text-[13px] leading-[25px]">
							<span className="shrink-0 text-muted">{l.p}</span>
							<span className={l.out === true ? "text-muted" : "text-text"}>{l.t}</span>
						</div>
					))}
					<div className="flex gap-2 font-mono text-[13px] leading-[25px]">
						<span className="text-muted">~/tvarso $</span>
						<span className="mt-[6px] block h-[14px] w-[7px] bg-thread" />
					</div>
				</div>
			</div>
		</div>
	);
}

function ShellCluster({ empty }: { empty: boolean }) {
	return (
		<div className="absolute" style={{ left: 0, top: 40, width: 620 }}>
			<div className="overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex h-[30px] items-center gap-2 border-border border-b px-3">
					<SpoolMark className="h-3.5 w-3 text-thread" />
					<span className="rounded-t-[3px] bg-surface px-2 py-[3px] font-mono text-[10px] text-text leading-none">
						tvarso
					</span>
					<span className="text-muted/70">
						<PlusGlyph className="h-2.5 w-2.5" />
					</span>
				</div>
				<div className="flex h-[300px]">
					<div className="w-[136px] shrink-0 border-border border-r py-2">
						<div className="px-3 pb-2 font-mono text-[10px] text-muted/60 leading-none">design/frames</div>
						{empty ? null : (
							<div className="flex h-[22px] items-center gap-1.5 bg-raised px-3 font-mono text-[10px] text-thread leading-none">
								<FrameGlyph className="h-3 w-3" />
								home
							</div>
						)}
					</div>
					<div className="relative flex-1 bg-canvas" style={dots}>
						{empty ? (
							<div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-muted/70">
								no frames yet
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

const FOLDERS = ["~/tvarso", "~/kaffe", "~/projects/spool", "~/work/atlas", "~/scratch/tuesday"] as const;

function PickerCluster() {
	return (
		<div className="absolute" style={{ left: 60, top: 56, width: 400 }}>
			<div className="overflow-hidden rounded-[8px] border border-border-raised bg-surface">
				<div className="flex items-center gap-2 border-border border-b px-4 py-3">
					<span className="text-thread">
						<PlusGlyph className="h-3 w-3" />
					</span>
					<span className="font-mono text-[12px] text-muted">open a folder</span>
				</div>
				<div className="py-2">
					{FOLDERS.map((f, i) => (
						<div
							key={f}
							className={cn(
								"flex items-center gap-2 px-4 py-[9px] font-mono text-[12px] leading-none",
								i === 0 ? "bg-raised text-thread" : "text-muted",
							)}
						>
							<FolderGlyph className={cn("h-3 w-3", i === 0 ? "text-thread" : "text-muted/70")} />
							<span>{f}</span>
							{i === 2 ? <span className="ml-auto text-[10px] text-muted/60">142 frames</span> : null}
						</div>
					))}
				</div>
				<div className="border-border border-t px-4 py-2.5 font-mono text-[10px] text-muted/60">
					↑↓ to move · ⏎ to open
				</div>
			</div>
		</div>
	);
}

const PROJECTS = [
	{ name: "tvarso", frames: 18 },
	{ name: "kaffe", frames: 9 },
	{ name: "spool", frames: 142 },
] as const;

function ProjectsCluster() {
	return (
		<>
			{PROJECTS.map((p, i) => (
				<div key={p.name} className="absolute" style={{ left: i * 216, top: 60 + i * 26, width: 196 }}>
					<div
						className={cn(
							"mb-2 inline-block rounded-t-[4px] px-2.5 py-[5px] font-mono text-[11px] leading-none",
							i === 0 ? "bg-surface text-text" : "text-muted/70",
						)}
					>
						{p.name}
					</div>
					<div className="overflow-hidden rounded-[6px] border border-border bg-canvas" style={dots}>
						<div className="space-y-2.5 p-3.5" style={{ height: 210 }}>
							<Bar w="62%" tone="block" />
							<Bar w="88%" />
							<Bar w="56%" />
							{i === 0 ? (
								<div className="pt-2">
									<Bar w="46%" tone="accent" />
								</div>
							) : null}
						</div>
					</div>
					<div className="mt-2 font-mono text-2xs text-muted leading-none">
						~/{p.name} · {p.frames} frames
					</div>
				</div>
			))}
		</>
	);
}

interface PageCover {
	x: number;
	y: number;
	w: number;
	h: number;
	n: string;
	lit?: boolean;
}

const PAGES: readonly PageCover[] = [
	{ x: 0, y: 24, w: 168, h: 110, n: "app" },
	{ x: 192, y: 12, w: 208, h: 122, n: "agent" },
	{ x: 424, y: 28, w: 138, h: 106, n: "site", lit: true },
	{ x: 586, y: 16, w: 154, h: 118, n: "manipulate" },
	{ x: 0, y: 176, w: 190, h: 126, n: "explorer" },
	{ x: 214, y: 182, w: 146, h: 120, n: "dock" },
	{ x: 384, y: 174, w: 216, h: 128, n: "booting" },
	{ x: 624, y: 180, w: 116, h: 122, n: "picker" },
	{ x: 96, y: 344, w: 172, h: 98, n: "variants" },
	{ x: 292, y: 348, w: 132, h: 94, n: "directing" },
];


function PagesCluster() {
	return (
		<>
			{PAGES.map((p) => (
				<div key={p.n} className="absolute" style={{ left: p.x, top: p.y, width: p.w }}>
					<div className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs leading-none">
						<span className={p.lit === true ? "text-thread" : "text-muted/70"}>
							{p.lit === true ? "▶" : "▸"}
						</span>
						<span className={p.lit === true ? "text-thread" : "text-muted"}>{p.n}</span>
					</div>
					<div
						className={cn(
							"overflow-hidden rounded-[5px] border bg-canvas",
							p.lit === true ? "border-thread" : "border-border",
						)}
						style={{ height: p.h, ...dots }}
					>
						<div className="grid grid-cols-3 gap-1.5 p-2">
							{Array.from({ length: 9 }, (_, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: the cells are a count
									key={i}
									className="block h-[14px] rounded-[2px] bg-surface"
								/>
							))}
						</div>
					</div>
				</div>
			))}
		</>
	);
}

function VideoCluster() {
	return (
		<div className="absolute" style={{ left: 20, top: 34, width: 600 }}>
			<div className="relative overflow-hidden rounded-[8px] border border-border bg-canvas" style={dots}>
				<div className="flex h-[338px] flex-col items-center justify-center gap-5">
					<span className="flex h-[64px] w-[64px] items-center justify-center rounded-full border-[1.5px] border-thread text-thread">
						<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="ml-[3px] h-4 w-4">
							<path d="M2.7 1.5 8.4 5 2.7 8.5Z" />
						</svg>
					</span>
					<span className="font-mono text-[11px] text-muted leading-none">
						empty folder → first frame · 02:14
					</span>
				</div>
				<div className="absolute inset-x-5 bottom-4 h-[3px] rounded-full bg-border-raised">
					<span className="block h-full w-[7%] rounded-full bg-thread" />
				</div>
			</div>
		</div>
	);
}

function ForkCluster() {
	return (
		<>
			<Card x={0} y={70} w={188} h={124} name="your-app" />
			<Card x={228} y={16} w={206} h={136} name="your-app--v2" lit />
			<Card x={272} y={216} w={172} h={116} name="your-app--wild" />
			<div className="absolute font-mono text-2xs text-muted/70 leading-4" style={{ left: 0, top: 240 }}>
				one repo
				<br />
				your names
			</div>
		</>
	);
}

/* ---------- the moments ---------- */

const H2 = "font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]";
const P = "mt-5 text-[16px] text-muted leading-[26px]";

const MOMENTS: readonly Moment[] = [
	{
		id: "canvas",
		cx: 720,
		ty: 706,
		title: "",
		body: null,
		cluster: HeroCluster,
	},
	{
		id: "install",
		cx: 1980,
		ty: 684,
		title: "It installs in one line",
		body: (
			<>
				npm ships it as a global command, so the install is the whole setup. Node 22+, and Chrome draws the
				canvas best.
			</>
		),
		extra: (
			<span className="mt-7 inline-flex items-center gap-2 rounded-[6px] border border-border-raised px-3 py-2 font-mono text-muted text-xs">
				<DownloadGlyph className="h-3 w-3 text-thread" />
				<span className="text-text">Spool.dmg</span>
				<span className="text-muted/60">macOS · Apple silicon</span>
			</span>
		),
		cluster: InstallCluster,
	},
	{
		id: "empty",
		cx: 3200,
		ty: 718,
		title: "You arrive on empty canvas",
		body: (
			<>
				A rail, a field, and <span className="font-mono text-[14px] text-text">no frames yet</span> in the
				middle. The first frame lands there the moment your agent writes the file.
			</>
		),
		cluster: () => <ShellCluster empty />,
	},
	{
		id: "picker",
		cx: 4460,
		ty: 690,
		title: "Any folder can be one",
		body: (
			<>
				Press <span className="font-mono text-[14px] text-text">+</span> and choose anywhere on your machine.
				spool opens the <span className="font-mono text-[14px] text-text">design/</span> it finds there, and
				writes one for a folder it has not met.
			</>
		),
		cluster: PickerCluster,
	},
	{
		id: "projects",
		cx: 5800,
		ty: 724,
		title: "Every project gets its own",
		body: (
			<>
				Each canvas lives in its repo, on your disk, tracked by your git. The tabs are how you cross, and one
				daemon holds all of them.
			</>
		),
		cluster: ProjectsCluster,
	},
	{
		id: "design",
		cx: 7280,
		ty: 676,
		title: "This canvas is spool's own",
		body: (
			<>
				Twelve pages, 142 frames, and the page you are reading is one of them. I move them around with the same
				hands you will.
			</>
		),
		extra: <p className="mt-5 font-mono text-muted text-xs">12 pages · 142 frames</p>,
		cluster: PagesCluster,
	},
	{
		id: "video",
		cx: 8620,
		ty: 700,
		title: "Two minutes across the loop",
		body: (
			<>
				An empty folder, one request to the agent, and a frame you can click through. Same speed you get on your
				own machine.
			</>
		),
		cluster: VideoCluster,
	},
	{
		id: "licence",
		cx: 9900,
		ty: 692,
		title: "MIT. Take the canvas with you.",
		body: (
			<>
				Fork it, rework it, rename it, ship it. It is a tool for designing things, so make it your own and tell
				me what you changed.
			</>
		),
		cluster: ForkCluster,
	},
];

/**
 * The camera dwells and then flies. A quarter of every segment is spent parked
 * on the moment either side of it, so wherever the scroll is let go the lens is
 * usually on something, and the travel between two moments is quick enough to
 * read as a move rather than a drift.
 */
function centerAt(v: number): number {
	const t = clamp01(v) * (MOMENTS.length - 1);
	const i = Math.min(Math.floor(t), MOMENTS.length - 2);
	const f = t - i;
	const a = MOMENTS[i]?.cx ?? 0;
	const b = MOMENTS[i + 1]?.cx ?? a;
	return a + (b - a) * smooth(clamp01((f - 0.25) / 0.5));
}

const FIRST = MOMENTS[0]?.cx ?? 0;
const LASTM = MOMENTS[MOMENTS.length - 1]?.cx ?? 0;
const TRACK_H = VIEW_H + 4900;
const SCENE_W = LASTM + 900;

/** the thread's lane: a straight run through each moment, bowing between them */
function threadPath(): string {
	let d = "";
	for (const [i, m] of MOMENTS.entries()) {
		const inX = m.cx - 340;
		const outX = m.cx + 340;
		if (i === 0) d += `M ${inX} ${m.ty} `;
		else {
			const prev = MOMENTS[i - 1];
			if (prev !== undefined) {
				const px = prev.cx + 340;
				const bow = (inX - px) * 0.45;
				d += `C ${px + bow} ${prev.ty}, ${inX - bow} ${m.ty}, ${inX} ${m.ty} `;
			}
		}
		d += `L ${outX} ${m.ty} `;
	}
	return d;
}

const THREAD_D = threadPath();

/* ---------- distant matter, for the middle plane ---------- */

const GHOSTS = [
	{ x: 1560, y: 190, w: 210, h: 128 },
	{ x: 1980, y: 486, w: 150, h: 96 },
	{ x: 2360, y: 500, w: 170, h: 104 },
	{ x: 2980, y: 150, w: 148, h: 96 },
	{ x: 3820, y: 460, w: 196, h: 120 },
	{ x: 4700, y: 170, w: 162, h: 102 },
	{ x: 5240, y: 486, w: 208, h: 124 },
	{ x: 6180, y: 176, w: 176, h: 110 },
	{ x: 6820, y: 470, w: 144, h: 94 },
	{ x: 7860, y: 162, w: 200, h: 122 },
	{ x: 8320, y: 486, w: 158, h: 100 },
	{ x: 9120, y: 176, w: 186, h: 116 },
	{ x: 9560, y: 468, w: 150, h: 98 },
] as const;

const SPECKS = [
	{ x: 1380, y: 96, w: 40 },
	{ x: 2540, y: 842, w: 88 },
	{ x: 3660, y: 88, w: 52 },
	{ x: 4980, y: 838, w: 72 },
	{ x: 6420, y: 92, w: 44 },
	{ x: 7540, y: 844, w: 96 },
	{ x: 8960, y: 90, w: 56 },
] as const;

/* ---------- one moment on the plate ---------- */

function MomentBlock({
	m,
	index,
	sp,
	reduce,
}: {
	m: Moment;
	index: number;
	sp: MotionValue<number>;
	reduce: boolean;
}) {
	const focus = useTransform(sp, (v: number) => {
		if (reduce) return 1;
		return smooth(clamp01(1 - Math.abs(m.cx - centerAt(v)) / 980));
	});
	const scale = useTransform(focus, (f: number) => 0.955 + f * 0.045);
	const opacity = useTransform(focus, (f: number) => 0.24 + f * 0.76);

	return (
		<motion.div
			className="absolute top-0"
			style={{ left: m.cx - 620, width: 1240, height: VIEW_H, opacity, scale }}
		>
			{index === 0 ? (
				<div className="absolute" style={{ left: 0, top: 214, width: 470 }}>
					<h1 className="font-semibold text-[54px] leading-[1.0] tracking-[-0.025em]">
						Look across it
						<br />
						before you
						<br />
						build it
					</h1>
					<p className={P}>
						spool is a prototyping canvas for real code. Your agent writes TSX frames into your repo, they
						stand side by side on one canvas, and the threads between them are flows you can walk.
					</p>
					<div className="mt-8 flex gap-5">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div>
							<CommandLine prompt="~ $" command="npm i -g spool.page" />
							<CommandLine prompt="~/your-app $" command="spool init" />
						</div>
					</div>
				</div>
			) : (
				<div className="absolute" style={{ left: 0, top: 250, width: 400 }}>
					<h2 className={H2}>{m.title}</h2>
					<p className={P}>{m.body}</p>
					{m.extra}
				</div>
			)}

			<div className="absolute" style={{ left: 460, top: 160, width: 780, height: 440 }}>
				{m.cluster()}
			</div>
		</motion.div>
	);
}

/** the node a moment hangs off, and its name */
function ThreadNode({ m, sp, reduce }: { m: Moment; sp: MotionValue<number>; reduce: boolean }) {
	const focus = useTransform(sp, (v: number) => {
		if (reduce) return 1;
		return smooth(clamp01(1 - Math.abs(m.cx - centerAt(v)) / 900));
	});
	const dot = useTransform(focus, (f: number) => 0.7 + f * 0.55);
	const label = useTransform(focus, (f: number) => 0.35 + f * 0.65);
	return (
		<div className="absolute" style={{ left: m.cx, top: m.ty }}>
			<motion.span
				className="-translate-x-1/2 -translate-y-1/2 absolute block h-[9px] w-[9px] rounded-full border-[3px] border-bg bg-thread"
				style={{ scale: dot }}
			/>
			<motion.span
				className="-translate-x-1/2 absolute block whitespace-nowrap font-mono text-2xs text-muted leading-none"
				style={{ top: 20, opacity: label }}
			>
				{m.id}
			</motion.span>
		</div>
	);
}

/* ---------- the frame ---------- */

export default function SiteMotionGlide() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion() === true;

	const raw = useMotionValue(0);
	const sp = useSpring(raw, { stiffness: 130, damping: 30, mass: 0.9 });

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

	const [at, setAt] = useState(0);
	useEffect(() => {
		const apply = (v: number) => {
			const center = centerAt(v);
			let best = 0;
			let dist = Number.POSITIVE_INFINITY;
			for (const [i, m] of MOMENTS.entries()) {
				const d = Math.abs(m.cx - center);
				if (d < dist) {
					dist = d;
					best = i;
				}
			}
			setAt((was) => (was === best ? was : best));
		};
		apply(sp.get());
		return sp.on("change", apply);
	}, [sp]);

	// four planes, four rates. the drift is what keeps it a camera.
	const depth = (k: number) => (reduce ? 1 : k);
	const far = useTransform(sp, (v: number) => -(centerAt(v) - FIRST) * depth(0.3));
	const mid = useTransform(sp, (v: number) => -(centerAt(v) - FIRST) * depth(0.62));
	const main = useTransform(sp, (v: number) => -(centerAt(v) - FIRST));
	const near = useTransform(sp, (v: number) => -(centerAt(v) - FIRST) * depth(1.16));
	const drift = useTransform(sp, (v: number) => (reduce ? 0 : Math.sin(v * Math.PI * 3) * 16));
	const driftMid = useTransform(drift, (d: number) => d * 0.6);
	const driftFar = useTransform(drift, (d: number) => d * 0.3);
	const laid = useTransform(sp, (v: number) => {
		const from = FIRST - 340;
		const to = LASTM + 340;
		return clamp01((centerAt(v) + 400 - from) / (to - from));
	});
	const progress = useTransform(sp, (v: number) => clamp01(v));
	const hint = useTransform(sp, (v: number) => 1 - clamp01(v * 14));
	const name = MOMENTS[at]?.id ?? "";

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-bg" style={{ width: VIEW_W }}>
					{/* plane one: the field itself */}
					<motion.div
						className="absolute top-[-200px] left-[-400px] h-[1400px]"
						style={{ width: 4600, x: far, y: driftFar, ...dots, opacity: 0.55 }}
					/>

					{/* plane two: canvas further off, which you never reach */}
					<motion.div
						className="absolute top-0 left-0 h-full"
						style={{ width: SCENE_W, x: mid, y: driftMid }}
					>
						{GHOSTS.map((g) => (
							<div
								key={`${g.x}-${g.y}`}
								className="absolute rounded-[5px] border border-border/70"
								style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
							/>
						))}
					</motion.div>

					{/* plane three: the thread and the moments */}
					<motion.div className="absolute top-0 left-0 h-full" style={{ width: SCENE_W, x: main, y: drift }}>
						<svg
							className="pointer-events-none absolute top-0 left-0 overflow-visible"
							width={SCENE_W}
							height={VIEW_H}
							fill="none"
							aria-hidden="true"
						>
							<path d={THREAD_D} stroke="var(--color-border-raised)" strokeWidth={1} opacity={0.5} />
							<motion.path
								d={THREAD_D}
								stroke="var(--color-thread)"
								strokeWidth={1.5}
								strokeLinecap="round"
								style={{ pathLength: laid }}
							/>
						</svg>

						{MOMENTS.map((m, i) => (
							<MomentBlock key={m.id} m={m} index={i} sp={sp} reduce={reduce} />
						))}
						{MOMENTS.map((m) => (
							<ThreadNode key={m.id} m={m} sp={sp} reduce={reduce} />
						))}
					</motion.div>

					{/* plane four: matter passing close to the lens */}
					<motion.div
						className="absolute top-0 left-0 h-full"
						style={{ width: SCENE_W, x: near, opacity: 0.5 }}
					>
						{SPECKS.map((s) => (
							<div
								key={`${s.x}-${s.y}`}
								className="absolute h-[3px] rounded-full bg-border-raised"
								style={{ left: s.x, top: s.y, width: s.w }}
							/>
						))}
					</motion.div>

					{/* chrome */}
					<div className="absolute flex items-center gap-2.5" style={{ left: 100, top: 38 }}>
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-tight">spool</span>
					</div>
					<div
						className="absolute flex items-center gap-6 font-mono text-muted text-xs"
						style={{ right: 100, top: 42 }}
					>
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>

					<div
						className="absolute flex items-baseline gap-3 font-mono text-2xs"
						style={{ right: 100, bottom: 44 }}
					>
						<span className="text-thread">{String(at + 1).padStart(2, "0")}</span>
						<span className="text-muted/50">/ {String(MOMENTS.length).padStart(2, "0")}</span>
						<span className="w-[64px] text-right text-muted">{name}</span>
					</div>

					<motion.div
						className="absolute flex items-center gap-2.5 font-mono text-muted text-sm"
						style={{ left: 100, bottom: 40, opacity: hint }}
					>
						<motion.span
							className="text-thread"
							animate={reduce ? undefined : { x: [0, 5, 0] }}
							transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						>
							<RightGlyph className="h-3.5 w-4" />
						</motion.span>
						<span>Scroll to travel across it.</span>
					</motion.div>

					<div className="absolute right-0 bottom-0 left-0 h-px bg-border">
						<motion.div
							className="h-full w-full origin-left bg-thread"
							style={{ scaleX: progress }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
