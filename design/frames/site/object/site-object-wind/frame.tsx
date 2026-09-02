import { type PanInfo, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-object--wind. The page as the machine the product is named after: a spool
 * on the left, wound with thread, and the story strung along the thread it pays
 * out.
 *
 * The argument: a landing does not have to be a document. This one is an object
 * with one moving part. Push the spool and it turns, the coil narrows by exactly
 * what it gave up, and the beads on the thread travel past the window at the same
 * rate. The thread runs behind the panel, so the beats that have gone by are
 * still on it rather than deleted.
 *
 * The spool and the thread are the same control: pushing either one winds. A
 * bead you can see is a target you can press. Release with speed and it carries
 * to the next bead and settles, which is the only place a spring lives here.
 *
 * The thing that never moves is the install line. It sits in the panel at rest,
 * because the page's job is to be typed into a terminal.
 *
 * Motion is transform and opacity. The coil narrows by two masks scaling from
 * their outer edges, the wraps travel by one translation, and the strip is one
 * more. Nothing re-lays out while the hand is down.
 */

/* ---------- the machine's dimensions ---------- */

const WIRE_Y = 470;
const PANEL_W = 600;

/** the spool: two flanges, a barrel, and the thread wound between them. */
const SPOOL = { x: 64, y: 400, w: 380, h: 140 };
const GUIDE_X = 452;

/** the strip: one pitch of thread per bead. */
const BEAD_W = 460;
const BEAD_H = 400;
const PITCH = 520;
const BEAD_REST_X = PANEL_W + (1440 - PANEL_W - BEAD_W) / 2;

const WRAP_PITCH = 5;

type BeadId = "mac" | "empty" | "folder" | "projects" | "dogfood" | "video" | "mit";

const BEADS: readonly { id: BeadId; n: string }[] = [
	{ id: "mac", n: "01" },
	{ id: "empty", n: "02" },
	{ id: "folder", n: "03" },
	{ id: "projects", n: "04" },
	{ id: "dogfood", n: "05" },
	{ id: "video", n: "06" },
	{ id: "mit", n: "07" },
];

const MAX_WIND = (BEADS.length - 1) * PITCH;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* ---------- primitives ---------- */

function Heading({ children }: { children: ReactNode }) {
	return <h2 className="font-semibold text-[22px] text-text leading-[1.16] tracking-[-0.02em]">{children}</h2>;
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("text-[14px] text-muted leading-[22px]", className)}>{children}</p>;
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
			className="group/cmd block cursor-pointer text-left font-mono text-[14px] leading-[28px] focus-visible:outline-none"
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
	backgroundSize: "11px 11px",
};

/* ---------- what each bead carries ---------- */

function EmptyWindow() {
	return (
		<div className="flex h-[172px] w-full overflow-hidden rounded-md border border-border bg-canvas">
			<div className="w-[96px] shrink-0 border-border border-r p-2.5">
				<div className="mb-2.5 flex items-center gap-1.5">
					<SpoolMark className="h-3 w-[11px] text-thread" />
					<span className="font-mono text-[9px] text-muted leading-none">your-app</span>
				</div>
				<div className="space-y-1.5">
					<span className="block h-[3px] w-[48px] rounded-full bg-border-raised" />
					<span className="block h-[3px] w-[34px] rounded-full bg-border-raised" />
				</div>
			</div>
			<div className="relative flex-1">
				<div className="flex h-[26px] items-center gap-2 border-border border-b px-2.5">
					<span className="rounded-[3px] border border-border-raised px-1.5 py-[2px] font-mono text-[8px] text-muted leading-none">
						your-app
					</span>
					<span className="font-mono text-[11px] text-thread leading-none">+</span>
				</div>
				<div className="absolute inset-x-0 top-[26px] bottom-0" style={miniGrid}>
					<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-[11px] text-muted leading-none">
						no frames yet
					</span>
				</div>
			</div>
		</div>
	);
}

const FOLDERS = ["Documents", "code/kaffe", "code/tvarso", "code/spool"];

function FolderPicker() {
	return (
		<div className="w-full overflow-hidden rounded-md border border-border bg-canvas">
			<div className="border-border border-b px-3 py-2 font-mono text-[10px] text-muted leading-none">
				~/
			</div>
			{FOLDERS.map((f, i) => (
				<div
					key={f}
					className={cn(
						"flex items-center gap-2.5 px-3 py-[9px] font-mono text-[11px] leading-none",
						i === FOLDERS.length - 1 ? "bg-raised text-text" : "text-muted",
					)}
				>
					<svg viewBox="0 0 14 14" className="h-3 w-3 shrink-0" fill="none" aria-hidden="true">
						<path
							d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
							stroke={i === FOLDERS.length - 1 ? "var(--color-thread)" : "currentColor"}
							strokeWidth="1.15"
							strokeLinejoin="round"
						/>
					</svg>
					{f}
				</div>
			))}
		</div>
	);
}

const PROJECTS = [
	{ name: "~/spool", count: "142 frames" },
	{ name: "~/kaffe", count: "18 frames" },
	{ name: "~/tvarso", count: "31 frames" },
];

const DOGFOOD_TILES = [
	{ x: 12, y: 26, w: 48, h: 34 },
	{ x: 74, y: 14, w: 36, h: 26 },
	{ x: 74, y: 48, w: 36, h: 28 },
	{ x: 124, y: 28, w: 54, h: 38 },
	{ x: 192, y: 16, w: 30, h: 22 },
	{ x: 192, y: 46, w: 30, h: 30 },
	{ x: 236, y: 26, w: 44, h: 32 },
	{ x: 294, y: 14, w: 26, h: 20 },
	{ x: 294, y: 42, w: 38, h: 28 },
	{ x: 346, y: 24, w: 32, h: 36 },
];

function DogfoodField() {
	return (
		<div
			className="relative h-[104px] w-full overflow-hidden rounded-md border border-border bg-canvas"
			style={miniGrid}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0"
				width={396}
				height={104}
				viewBox="0 0 396 104"
				fill="none"
			>
				<path
					d="M60 42 C 70 42, 66 26, 74 26 M60 48 C 70 48, 66 62, 74 62 M110 26 C 120 26, 118 46, 124 46 M178 46 C 188 46, 188 26, 192 26 M178 52 C 188 52, 190 60, 192 60 M222 26 C 232 26, 230 42, 236 42 M280 42 C 290 42, 288 22, 294 22 M280 48 C 290 48, 288 56, 294 56 M332 56 C 342 56, 340 42, 346 42"
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
		</div>
	);
}

function VideoPlate() {
	return (
		<div className="relative h-[212px] w-full overflow-hidden rounded-md border border-border bg-canvas">
			<div className="absolute inset-0" style={miniGrid} />
			<button
				type="button"
				className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-full border border-thread/55 bg-bg/70 transition-transform duration-200 hover:scale-110 focus-visible:outline-none"
				aria-label="Play the getting started video"
			>
				<svg viewBox="0 0 12 12" fill="var(--color-thread)" aria-hidden="true" className="h-3.5 w-3.5">
					<path d="M3.6 1.9 9.6 6 3.6 10.1Z" />
				</svg>
			</button>
			<div className="absolute inset-x-4 bottom-3.5 flex items-center gap-2.5">
				<span className="h-[2px] flex-1 rounded-full bg-border-raised">
					<span className="block h-full w-[9%] rounded-full bg-thread" />
				</span>
				<span className="font-mono text-[9px] text-muted leading-none">2:14</span>
			</div>
		</div>
	);
}

function beadBody(id: BeadId): ReactNode {
	if (id === "mac")
		return (
			<>
				<Heading>Or run the Mac app</Heading>
				<Body className="mt-3">
					The same daemon in a window, with a dock icon and a menu bar. Download the DMG, drag it across,
					and it starts itself at login.
				</Body>
				<div className="mt-6 inline-flex items-center gap-2.5 rounded-md border border-border-raised bg-raised px-3.5 py-2.5 font-mono text-[13px] text-text leading-none">
					<SpoolMark className="h-4 w-3.5 text-thread" />
					Spool.dmg
				</div>
				<div className="mt-4 font-mono text-[11px] text-muted leading-none">
					github releases · apple silicon and intel
				</div>
			</>
		);
	if (id === "empty")
		return (
			<>
				<Heading>The first run is empty</Heading>
				<Body className="mt-3">
					spool opens on a project with nothing in it and says so in the middle of the field. Your agent
					fills it from there.
				</Body>
				<div className="mt-6">
					<EmptyWindow />
				</div>
			</>
		);
	if (id === "folder")
		return (
			<>
				<Heading>Press + and pick a folder</Heading>
				<Body className="mt-3">
					Any folder on your machine becomes a project. spool writes design/ into it and watches the files
					from there.
				</Body>
				<div className="mt-5">
					<FolderPicker />
				</div>
			</>
		);
	if (id === "projects")
		return (
			<>
				<Heading>Keep several open</Heading>
				<Body className="mt-3">
					Every project has its own canvas, its own design/ folder and its own git history. The tabs are
					how you move between them.
				</Body>
				<div className="mt-6 space-y-2">
					{PROJECTS.map((p, i) => (
						<div
							key={p.name}
							className={cn(
								"flex items-center justify-between rounded-md border px-3.5 py-2.5 font-mono text-[12px] leading-none",
								i === 0 ? "border-thread/45 bg-raised text-text" : "border-border bg-canvas text-muted",
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
				<div className="flex items-start justify-between gap-6">
					<Heading>spool is designed in spool</Heading>
					<div className="shrink-0 text-right">
						<div className="font-semibold text-[34px] text-thread leading-none tracking-tight">142</div>
						<div className="mt-1.5 font-mono text-[10px] text-muted leading-none">12 pages</div>
					</div>
				</div>
				<Body className="mt-3">
					This page was drawn on the canvas in spool's own repo, beside the app it describes. Every take
					that lost is still in the git history.
				</Body>
				<div className="mt-6">
					<DogfoodField />
				</div>
			</>
		);
	if (id === "video")
		return (
			<>
				<Heading>Two minutes, start to finish</Heading>
				<Body className="mt-3">Install it, open a folder, ask for a screen, watch it land.</Body>
				<div className="mt-5">
					<VideoPlate />
				</div>
			</>
		);
	return (
		<>
			<Heading>MIT</Heading>
			<p className="mt-4 text-[19px] text-text leading-[28px]">Fork it, rework it, rename it, ship it.</p>
			<Body className="mt-4">
				It is a tool for designing things. Make it your own if you want to. Third-party components keep
				their own licenses.
			</Body>
			<div className="mt-6 font-mono text-[12px] text-muted leading-none">github.com/liamvinberg/spool</div>
		</>
	);
}

/* ---------- the page ---------- */

export default function SiteObjectWind() {
	const wind = useMotionValue(0);
	const [index, setIndex] = useState(0);

	const stripX = useTransform(wind, (v: number) => BEAD_REST_X - v);
	const wraps = useTransform(wind, (v: number) => -(((v * 0.62) % WRAP_PITCH) + WRAP_PITCH));
	const eaten = useTransform(wind, [0, MAX_WIND], [0.02, 0.4]);
	const paid = useTransform(wind, [0, MAX_WIND], [0.16, 1]);

	useMotionValueEvent(wind, "change", (v: number) => {
		setIndex(clamp(Math.round(v / PITCH), 0, BEADS.length - 1));
	});

	function travel(i: number) {
		animate(wind, clamp(i, 0, BEADS.length - 1) * PITCH, {
			type: "spring",
			stiffness: 210,
			damping: 30,
			mass: 0.9,
		});
	}

	function onPan(_: PointerEvent, info: PanInfo) {
		wind.set(clamp(wind.get() - info.delta.x, -60, MAX_WIND + 60));
	}

	function onPanEnd(_: PointerEvent, info: PanInfo) {
		const projected = wind.get() - info.velocity.x * 0.11;
		travel(Math.round(projected / PITCH));
	}

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* the strip of beads, threaded on the wire and running under the panel */}
			<motion.div
				className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
				onPan={onPan}
				onPanEnd={onPanEnd}
			>
				<span
					className="absolute h-px bg-thread/55"
					style={{ left: PANEL_W, top: WIRE_Y, right: 0 }}
					aria-hidden="true"
				/>
				<motion.div className="absolute top-0 left-0 h-full w-0" style={{ x: stripX }}>
					{BEADS.map((b, i) => (
						<button
							type="button"
							key={b.id}
							onClick={() => travel(i)}
							aria-label={`Wind to ${b.id}`}
							className={cn(
								"absolute cursor-pointer overflow-hidden rounded-lg border bg-surface text-left transition-[opacity,border-color] duration-300 focus-visible:outline-none",
								i === index ? "border-border-raised opacity-100" : "border-border opacity-45",
							)}
							style={{ left: i * PITCH, top: WIRE_Y - BEAD_H / 2, width: BEAD_W, height: BEAD_H }}
						>
							<span className="absolute inset-x-0 top-0 h-px bg-white/7" />
							<span className="absolute inset-x-0 bottom-0 h-px bg-black/45" />
							{/* where the thread enters and leaves the bead */}
							<span
								className="absolute left-0 h-px w-3 bg-thread/70"
								style={{ top: BEAD_H / 2 }}
								aria-hidden="true"
							/>
							<span
								className="absolute right-0 h-px w-3 bg-thread/70"
								style={{ top: BEAD_H / 2 }}
								aria-hidden="true"
							/>
							<span className="absolute top-5 right-6 font-mono text-[11px] text-muted/70 leading-none">
								{b.n}
							</span>
							<div className="flex h-full flex-col justify-center px-8">{beadBody(b.id)}</div>
						</button>
					))}
				</motion.div>
			</motion.div>

			{/* the panel: the machine, and the one line that never moves */}
			<div
				className="absolute inset-y-0 left-0 z-20 border-border border-r bg-bg"
				style={{ width: PANEL_W }}
			/>

			<motion.div
				className="absolute inset-y-0 left-0 z-30 cursor-grab touch-none active:cursor-grabbing"
				style={{ width: PANEL_W }}
				onPan={onPan}
				onPanEnd={onPanEnd}
			>
				<h1 className="absolute font-semibold text-[128px] leading-[0.86] tracking-[-0.045em]" style={{ left: 64, top: 96 }}>
					spool
				</h1>
				<p className="absolute text-[20px] text-text leading-[28px]" style={{ left: 64, top: 252 }}>
					A canvas where the frames are alive.
				</p>
				<p className="absolute text-[15px] text-muted leading-[24px]" style={{ left: 64, top: 292, width: 436 }}>
					Your agent writes TSX frames into design/ in your repo. You arrange them on the canvas, link
					them into flows, and click through the whole thing before any of it is built.
				</p>

				{/* the spool: flanges, barrel, and the coil narrowing as it pays out */}
				<div className="absolute" style={{ left: SPOOL.x, top: SPOOL.y, width: SPOOL.w, height: SPOOL.h }}>
					<span className="absolute inset-x-0 top-0 h-[20px] overflow-hidden rounded-[5px] border border-border-raised bg-raised">
						<span className="absolute inset-x-0 top-0 h-px bg-white/8" />
					</span>
					<span className="absolute inset-x-0 bottom-0 h-[20px] overflow-hidden rounded-[5px] border border-border-raised bg-raised">
						<span className="absolute inset-x-0 top-0 h-px bg-white/8" />
					</span>
					<div className="absolute inset-x-[26px] top-[20px] bottom-[20px] overflow-hidden bg-canvas">
						<motion.div className="absolute inset-y-0 left-0 w-[1700px]" style={{ x: wraps }}>
							{Array.from({ length: 336 }, (_, i) => (
								<span
									key={i}
									className="absolute inset-y-0 w-px bg-thread/65"
									style={{ left: i * WRAP_PITCH }}
								/>
							))}
						</motion.div>
						{/* the coil is round: dark where it turns away, lit across the middle */}
						<span
							className="absolute inset-0"
							style={{
								background:
									"linear-gradient(to right, rgba(0,0,0,0.72), rgba(0,0,0,0) 24%, rgba(255,255,255,0.05) 48%, rgba(0,0,0,0) 76%, rgba(0,0,0,0.72))",
							}}
						/>
						<span
							className="absolute inset-0"
							style={{
								background:
									"linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.4))",
							}}
						/>
						<motion.span
							className="absolute inset-y-0 left-0 w-full bg-canvas"
							style={{ scaleX: eaten, originX: 0 }}
						/>
						<motion.span
							className="absolute inset-y-0 right-0 w-full bg-canvas"
							style={{ scaleX: eaten, originX: 1 }}
						/>
					</div>
					{/* the guide the thread leaves through */}
					<span
						className="absolute h-[13px] w-[13px] rounded-full border border-thread/60 bg-bg"
						style={{ left: GUIDE_X - SPOOL.x - 6.5, top: WIRE_Y - SPOOL.y - 6.5 }}
					/>
					<span
						className="absolute h-[5px] w-[5px] rounded-full bg-thread"
						style={{ left: GUIDE_X - SPOOL.x - 2.5, top: WIRE_Y - SPOOL.y - 2.5 }}
					/>
				</div>

				{/* the thread crossing the panel to the strip */}
				<span
					className="absolute h-px bg-thread/55"
					style={{ left: GUIDE_X + 6, top: WIRE_Y, width: PANEL_W - GUIDE_X - 6 }}
					aria-hidden="true"
				/>

				<div className="absolute" style={{ left: 64, top: 596 }}>
					<div className="flex gap-4">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div>
							<CommandLine prompt="~ " command="npm i -g spool.page" />
							<CommandLine prompt="~/your-app " command="spool init" />
						</div>
					</div>
					<div className="mt-4 pl-[17px] font-mono text-[11px] text-muted leading-none">
						node 22+ · chrome for the canvas
					</div>
				</div>

				{/* how much is unwound, and the invitation */}
				<div className="absolute flex items-center gap-4" style={{ left: 64, top: 748 }}>
					<span className="font-mono text-[12px] text-thread leading-none">{BEADS[index]?.n}</span>
					<span className="font-mono text-[12px] text-muted/60 leading-none">/ 07</span>
					<span className="relative block h-px w-[150px] bg-border-raised">
						<motion.span
							className="absolute inset-0 origin-left bg-thread"
							style={{ scaleX: paid }}
						/>
					</span>
					<span className="font-mono text-[12px] text-muted leading-none">push the spool</span>
				</div>

				<div
					className="absolute flex items-center gap-2.5 font-mono text-[11px] text-muted leading-none"
					style={{ left: 64, top: 828 }}
				>
					<SpoolMark className="h-3.5 w-3 text-thread" />
					github.com/liamvinberg/spool
				</div>
			</motion.div>

			<div className="absolute top-9 right-11 z-40 flex items-center gap-7 font-mono text-[11px] text-muted leading-none">
				<span>docs</span>
				<span className="text-text">github</span>
			</div>
		</div>
	);
}
