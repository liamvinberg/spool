import { AnimatePresence, type MotionValue, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import {
	ArrowUpRight,
	CommandLine,
	DesignDoc,
	dotGrid,
	EASE,
	FirstRunDoc,
	FolderGlyph,
	LandingDoc,
	LicenseDoc,
	MacDoc,
	OpenDoc,
	PlusGlyph,
	ProjectsDoc,
	WalkthroughDoc,
} from "./parts";

/**
 * site-field--camera. The landing does not turn into a canvas: it is one from
 * the first pixel, and scrolling drives the camera rather than the page.
 *
 * The incumbent (site-hub--composed) spends its whole opening act proving the
 * canvas exists, by shrinking a page into a frame. That proof costs the first
 * 2000px of scroll and it can only be paid once. This take spends nothing on it.
 * You arrive with the bar, the rail and the dot grid already there, one frame
 * filling the field at 100%, and the copy is distributed across eight documents
 * standing on the field.
 *
 * Scroll is the camera. It travels sideways and down between stops rather than
 * zooming out, and every stop but the last parks at 100%, so the frames are read
 * at their true size and never as thumbnails. The last stretch is the only pull
 * back, and it exists to answer the question the travel raises: what is the
 * shape of the thing I have been moving around inside. The answer is the field.
 *
 * Narration lives in the rail. A frame carries the artifact, its rail row
 * carries the sentence, and the row only says its sentence while the camera is
 * parked on it, so exactly one paragraph is on screen at a time and it is always
 * the one you are looking at.
 *
 * Nothing drawn here is dead. Rail rows fly the camera. Frames select, and the
 * ring is screen-space so its stroke never thickens with the zoom. The install
 * line copies, in the hero and in the rail footer both. "+" opens a second
 * project and it is empty, because a project you just opened is. The
 * walkthrough plays.
 */

/* ---------- the fixed stage ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const RAIL_W = 248;
const BAR_H = 44;
const FIELD_W = VIEW_W - RAIL_W;
const FIELD_H = VIEW_H - BAR_H;

const WORLD_W = 5000;
const WORLD_H = 3500;

const TRACK_H = 4340;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---------- what stands on the field ---------- */

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface FieldFrame extends Rect {
	id: string;
	sub: string;
	say: string;
	Doc: () => React.ReactNode;
}

const FRAMES: readonly FieldFrame[] = [
	{
		id: "landing",
		sub: "the page you are on",
		say: "spool is a prototyping canvas for real code. This page is a canvas as well, and your scroll is its camera.",
		x: 300,
		y: 340,
		w: 980,
		h: 600,
		Doc: LandingDoc,
	},
	{
		id: "mac",
		sub: "one window, one daemon",
		say: "The Mac app is the same daemon in a window. Download Spool.dmg, drag it to Applications, and it puts an icon in your dock.",
		x: 1420,
		y: 340,
		w: 440,
		h: 300,
		Doc: MacDoc,
	},
	{
		id: "first-run",
		sub: "a project you just opened",
		say: "A new project starts empty and says so. Frames appear here as your agent writes them into design/frames.",
		x: 1420,
		y: 740,
		w: 660,
		h: 430,
		Doc: FirstRunDoc,
	},
	{
		id: "open",
		sub: "+ points at a folder",
		say: "Press + and point spool at any folder on your machine. It walks up to the repo root and opens the design folder inside it.",
		x: 2220,
		y: 340,
		w: 540,
		h: 380,
		Doc: OpenDoc,
	},
	{
		id: "projects",
		sub: "a tab for each project",
		say: "Every project you open gets a tab. One daemon on port 7766 serves all of them, and your files stay in their own repos.",
		x: 2220,
		y: 820,
		w: 900,
		h: 150,
		Doc: ProjectsDoc,
	},
	{
		id: "walkthrough",
		sub: "start to walkable flow",
		say: "Two minutes, from an empty terminal to a flow you can click through. Press play.",
		x: 2220,
		y: 1060,
		w: 760,
		h: 428,
		Doc: WalkthroughDoc,
	},
	{
		id: "design",
		sub: "spool's own canvas",
		say: "I design spool in spool. The design folder in this repo holds 160 frames across 13 pages, and everything you have scrolled past was drawn as one of them.",
		x: 980,
		y: 1620,
		w: 880,
		h: 560,
		Doc: DesignDoc,
	},
	{
		id: "license",
		sub: "MIT",
		say: "MIT. Fork it, rework it, rename it, ship it.",
		x: 2060,
		y: 1720,
		w: 600,
		h: 240,
		Doc: LicenseDoc,
	},
];

const BOUNDS: Rect = { x: 300, y: 340, w: 2820, h: 1840 };

/* ---------- the camera ---------- */

interface Cam {
	cx: number;
	cy: number;
	k: number;
}

function fit(box: Rect, pad: number): Cam {
	const raw = Math.min((FIELD_W - pad) / box.w, (FIELD_H - pad) / box.h);
	return {
		cx: box.x + box.w / 2,
		cy: box.y + box.h / 2,
		k: raw < 0.2 ? 0.2 : raw > 1 ? 1 : raw,
	};
}

/** eight parked shots at 100%, then the one pull back that shows the field. */
const STOPS: readonly Cam[] = [...FRAMES.map((f) => fit(f, 150)), fit(BOUNDS, 130)];
const SEGMENTS = STOPS.length - 1;

/** each segment holds at both ends, so a stop is a stop rather than a waypoint. */
function camAt(t: number): { x: number; y: number; k: number } {
	const u = clamp01(t) * SEGMENTS;
	const i = Math.min(Math.floor(u), SEGMENTS - 1);
	const a = STOPS[i];
	const b = STOPS[i + 1];
	if (a === undefined || b === undefined) return { x: 0, y: 0, k: 1 };
	const s = smooth(clamp01((u - i - 0.14) / 0.72));
	// scale travels in log space, which is what keeps a zoom feeling even
	const k = Math.exp(lerp(Math.log(a.k), Math.log(b.k), s));
	const cx = lerp(a.cx, b.cx, s);
	const cy = lerp(a.cy, b.cy, s);
	return { k, x: RAIL_W + FIELD_W / 2 - cx * k, y: BAR_H + FIELD_H / 2 - cy * k };
}

const stopOf = (t: number) => Math.min(Math.round(clamp01(t) * SEGMENTS), FRAMES.length - 1);

/* ---------- threads between the stops, drawn once and lit in travel order ---------- */

function edgePath(a: Rect, b: Rect) {
	const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
	const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
	const horizontal = Math.abs(bc.x - ac.x) > Math.abs(bc.y - ac.y);
	const from = horizontal
		? { x: bc.x > ac.x ? a.x + a.w : a.x, y: ac.y }
		: { x: ac.x, y: bc.y > ac.y ? a.y + a.h : a.y };
	const to = horizontal
		? { x: bc.x > ac.x ? b.x : b.x + b.w, y: bc.y }
		: { x: bc.x, y: bc.y > ac.y ? b.y : b.y + b.h };
	const bow = Math.min(190, Math.max(60, Math.hypot(to.x - from.x, to.y - from.y) * 0.24));
	const c1 = horizontal ? { x: from.x + (to.x > from.x ? bow : -bow), y: from.y } : { x: from.x, y: from.y + (to.y > from.y ? bow : -bow) };
	const c2 = horizontal ? { x: to.x + (to.x > from.x ? -bow : bow), y: to.y } : { x: to.x, y: to.y + (to.y > from.y ? -bow : bow) };
	return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

const THREADS = FRAMES.slice(0, -1).map((f, i) => {
	const next = FRAMES[i + 1];
	return { key: f.id, d: next === undefined ? "" : edgePath(f, next) };
});

function Threads({ lit }: { lit: number }) {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={WORLD_W}
			height={WORLD_H}
			fill="none"
		>
			{THREADS.map((t, i) => (
				<path
					key={t.key}
					d={t.d}
					stroke="var(--color-thread)"
					strokeWidth={1.6}
					strokeLinecap="round"
					className="transition-opacity duration-500"
					style={{ opacity: i === lit ? 0.6 : 0.13 }}
				/>
			))}
		</svg>
	);
}

/* ---------- the screen-space selection ring ---------- */

const RING_CORNER = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";

function SelectionRing({ rect, sp }: { rect: Rect; sp: MotionValue<number> }) {
	const x = useTransform(sp, (v: number) => {
		const c = camAt(v);
		return c.x + rect.x * c.k;
	});
	const y = useTransform(sp, (v: number) => {
		const c = camAt(v);
		return c.y + rect.y * c.k;
	});
	const w = useTransform(sp, (v: number) => rect.w * camAt(v).k);
	const h = useTransform(sp, (v: number) => rect.h * camAt(v).k);
	return (
		<motion.div className="pointer-events-none absolute top-0 left-0 z-30" style={{ x, y, width: w, height: h }}>
			<div className="-inset-[3px] absolute rounded-[9px] border-[1.5px] border-thread" />
			<span className={cn(RING_CORNER, "-left-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -bottom-[7px]")} />
			<motion.div
				className="-bottom-[9px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none"
				style={{ opacity: useTransform(sp, (v: number) => (camAt(v).k > 0.55 ? 1 : 0)) }}
			>
				{rect.w} × {rect.h}
			</motion.div>
		</motion.div>
	);
}

/* ---------- a frame on the field ---------- */

function FieldTile({
	spec,
	sp,
	selected,
	onGo,
}: {
	spec: FieldFrame;
	sp: MotionValue<number>;
	selected: boolean;
	onGo: () => void;
}) {
	const tab = useTransform(sp, (v: number) => clamp01((camAt(v).k - 0.44) / 0.26));
	return (
		<div className="absolute" style={{ left: spec.x, top: spec.y, width: spec.w, height: spec.h }}>
			<motion.div
				className="-top-[26px] pointer-events-none absolute left-0 flex items-baseline gap-2 whitespace-nowrap font-mono text-xs leading-none"
				style={{ opacity: tab }}
			>
				<span className={selected ? "text-thread" : "text-muted"}>{spec.id}</span>
				<span className="text-muted/50 text-2xs">{spec.sub}</span>
			</motion.div>
			<button
				type="button"
				aria-label={`Fly to ${spec.id}`}
				onClick={onGo}
				className="group absolute inset-0 cursor-pointer text-left focus-visible:outline-none"
			>
				<div className="absolute inset-0 overflow-hidden rounded-[6px] border border-border-raised bg-bg">
					<spec.Doc />
				</div>
				{selected ? null : (
					<span className="-inset-px pointer-events-none absolute rounded-[7px] border border-thread/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
				)}
			</button>
		</div>
	);
}

/* ---------- chrome ---------- */

type ProjectId = "spool.page" | "your-app";

function TopBar({
	projects,
	active,
	onPick,
	onAdd,
	onClose,
}: {
	projects: readonly ProjectId[];
	active: ProjectId;
	onPick: (id: ProjectId) => void;
	onAdd: () => void;
	onClose: () => void;
}) {
	return (
		<header
			className="absolute top-0 left-0 z-50 flex items-center gap-5 border-border border-b bg-bg px-4"
			style={{ width: VIEW_W, height: BAR_H }}
		>
			<span className="flex select-none items-center gap-2">
				<SpoolMark className="h-[18px] w-3.5 text-thread" title="spool" />
				<span className="font-semibold text-md leading-sm tracking-tight">spool</span>
			</span>
			<nav aria-label="Projects" className="flex items-center gap-1">
				<AnimatePresence initial={false}>
					{projects.map((name) => {
						const on = name === active;
						return (
							<motion.div
								key={name}
								layout
								initial={{ opacity: 0, scale: 0.94 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
								transition={{ duration: 0.22, ease: EASE }}
								className={cn(
									"group flex h-[26px] items-center rounded-md",
									on && "border border-border-raised bg-raised",
								)}
							>
								<button
									type="button"
									aria-pressed={on}
									onClick={() => onPick(name)}
									className={cn(
										"h-full cursor-pointer text-base leading-[24px] transition-colors duration-150 focus-visible:outline-none",
										name === "your-app" ? "pr-1 pl-3" : "px-3",
										on ? "font-medium text-text" : "text-muted hover:text-text",
									)}
								>
									{name}
								</button>
								{name === "your-app" ? (
									<button
										type="button"
										aria-label="Close your-app"
										onClick={onClose}
										className="flex h-full w-5 cursor-pointer items-center justify-center pr-1 font-mono text-muted text-xs opacity-0 transition-opacity duration-150 hover:text-text group-hover:opacity-100"
									>
										×
									</button>
								) : null}
							</motion.div>
						);
					})}
				</AnimatePresence>
				<motion.button
					type="button"
					layout
					aria-label="Open a project"
					onClick={onAdd}
					className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text focus-visible:outline-none"
					transition={{ duration: 0.22, ease: EASE }}
				>
					<PlusGlyph className="h-2.5 w-2.5" />
				</motion.button>
			</nav>
			<span className="ml-auto font-mono text-[11px] text-muted/70">localhost:7766</span>
		</header>
	);
}

function Rail({
	project,
	stop,
	onGo,
}: {
	project: ProjectId;
	stop: number;
	onGo: (index: number) => void;
}) {
	return (
		<aside
			aria-label="Pages"
			className="absolute left-0 z-40 flex flex-col border-border border-r bg-bg"
			style={{ top: BAR_H, width: RAIL_W, height: FIELD_H }}
		>
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pl-3.5">
				<h2 className="font-semibold text-base leading-base">Pages</h2>
				<span className="font-mono text-muted text-xs leading-xs">{project === "spool.page" ? 1 : 0}</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{project !== "spool.page" ? (
					<div className="px-3.5 py-1 font-mono text-muted/60 text-sm leading-sm">no pages yet</div>
				) : (
					<>
						<div className="relative flex h-8 items-center gap-2 bg-surface px-3.5">
							<span className="absolute left-0 h-[22px] w-[2px] rounded-full bg-thread" />
							<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-thread" />
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-text">spool.page</span>
							<span className="font-mono text-2xs text-muted/60">{FRAMES.length}</span>
						</div>
						<div className="relative pt-1">
							<span className="absolute top-1 bottom-2 left-[18px] w-px bg-border-raised" />
							{FRAMES.map((f, i) => {
								const here = i === stop;
								return (
									<button
										type="button"
										key={f.id}
										aria-pressed={here}
										onClick={() => onGo(i)}
										className={cn(
											"relative block w-full cursor-pointer py-[6px] pr-3.5 pl-[34px] text-left transition-colors duration-150 focus-visible:outline-none",
											here ? "bg-surface/70" : "hover:bg-surface/40",
										)}
									>
										<span className="absolute top-[13px] left-[18px] h-px w-2.5 bg-border-raised" />
										<span
											className={cn(
												"block truncate font-mono text-sm leading-sm transition-colors duration-150",
												here ? "text-thread" : "text-muted",
											)}
										>
											{f.id}
										</span>
										<AnimatePresence initial={false}>
											{here ? (
												<motion.span
													key="say"
													className="block overflow-hidden text-[12px] text-muted leading-[19px]"
													initial={{ height: 0, opacity: 0 }}
													animate={{ height: "auto", opacity: 1, marginTop: 5 }}
													exit={{ height: 0, opacity: 0, marginTop: 0 }}
													transition={{ duration: 0.28, ease: EASE }}
												>
													{f.say}
												</motion.span>
											) : null}
										</AnimatePresence>
									</button>
								);
							})}
						</div>
					</>
				)}
			</div>

			<div className="shrink-0 border-border border-t px-4 pt-4 pb-5">
				<div className="flex gap-3">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="min-w-0 flex-1">
						<CommandLine
							prompt="~ $"
							command="npm i -g spool.page"
							className="font-mono text-text text-xs leading-[20px]"
						/>
					</div>
				</div>
				<div className="mt-2 pl-[13px] font-mono text-[10px] text-muted/70 leading-[15px]">
					Node 22+ · macOS and Linux
				</div>
				<div className="mt-4 flex items-center gap-4 font-mono text-[11px] text-muted">
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						Docs
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						GitHub
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
				</div>
			</div>
		</aside>
	);
}

/* ---------- orchestrator ---------- */

export default function SiteFieldCamera() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const progress = useMotionValue(0);
	const sp = useSpring(progress, { stiffness: 110, damping: 34, mass: 0.9 });

	const [stop, setStop] = useState(0);
	const [wide, setWide] = useState(false);
	const [pct, setPct] = useState(100);
	const [projects, setProjects] = useState<readonly ProjectId[]>(["spool.page"]);
	const [project, setProject] = useState<ProjectId>("spool.page");

	useEffect(() => {
		const el = scrollRef.current;
		if (el === null) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			progress.set(max > 0 ? clamp01(el.scrollTop / max) : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		measure();
		return () => el.removeEventListener("scroll", measure);
	}, [progress]);

	useEffect(() => {
		const read = (v: number) => {
			setStop(stopOf(v));
			setWide(v * SEGMENTS > FRAMES.length - 0.4);
			const next = Math.round(camAt(v).k * 100);
			setPct((prev) => (prev === next ? prev : next));
		};
		read(sp.get());
		return sp.on("change", read);
	}, [sp]);

	const x = useTransform(sp, (v: number) => camAt(v).x);
	const y = useTransform(sp, (v: number) => camAt(v).y);
	const k = useTransform(sp, (v: number) => camAt(v).k);

	function goTo(index: number) {
		const el = scrollRef.current;
		if (el === null) return;
		const max = el.scrollHeight - el.clientHeight;
		el.scrollTo({ top: max * (index / SEGMENTS), behavior: "smooth" });
	}

	const selectedRect = FRAMES[stop] ?? null;
	const onCanvas = project === "spool.page";

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div className="relative w-full" style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas">
					{/* the field, and the camera over it */}
					<motion.div
						className="absolute top-0 left-0 origin-top-left"
						style={{ width: WORLD_W, height: WORLD_H, x, y, scale: k, ...dotGrid }}
					>
						<Threads lit={Math.min(stop, THREADS.length - 1)} />
						{FRAMES.map((f, i) => (
							<FieldTile
								key={f.id}
								spec={f}
								sp={sp}
								selected={stop === i}
								onGo={() => goTo(i)}
							/>
						))}
					</motion.div>

					{selectedRect === null || !onCanvas ? null : <SelectionRing rect={selectedRect} sp={sp} />}

					{/* the second project, which is empty because you just opened it */}
					<AnimatePresence>
						{onCanvas ? null : (
							<motion.div
								key="empty"
								className="absolute z-30 flex flex-col items-center justify-center gap-4 bg-bg"
								style={{ left: RAIL_W, top: BAR_H, width: FIELD_W, height: FIELD_H }}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.24, ease: EASE }}
							>
								<SpoolMark className="h-7 w-[22px] text-thread opacity-35" />
								<p className="font-mono text-muted text-sm">no frames yet</p>
								<p className="w-[420px] text-center text-[13px] text-muted/70 leading-[21px]">
									This is what a project looks like the moment you open it. Ask your agent for a
									screen and the first frame lands here.
								</p>
							</motion.div>
						)}
					</AnimatePresence>

					<TopBar
						projects={projects}
						active={project}
						onPick={setProject}
						onAdd={() => {
							setProjects(["spool.page", "your-app"]);
							setProject("your-app");
						}}
						onClose={() => {
							setProjects(["spool.page"]);
							setProject("spool.page");
						}}
					/>
					<Rail project={project} stop={stop} onGo={goTo} />

					{/* the closing line, which only makes sense once the field is on screen */}
					<motion.p
						className="pointer-events-none absolute z-40 w-[300px] font-mono text-[11px] text-muted leading-[18px]"
						style={{ left: RAIL_W + 28, bottom: 30 }}
						initial={false}
						animate={{ opacity: wide && onCanvas ? 1 : 0, y: wide ? 0 : 8 }}
						transition={{ duration: 0.45, ease: EASE }}
					>
						Eight frames, one camera, one canvas. Yours opens the same way, with your own frames on it.
					</motion.p>

					<div className="pointer-events-none absolute right-5 bottom-5 z-40 font-mono text-muted/70 text-xs tabular-nums">
						{pct}%
					</div>
				</div>
			</div>
		</div>
	);
}
