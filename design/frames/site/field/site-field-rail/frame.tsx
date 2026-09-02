import { AnimatePresence, type MotionValue, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	ArrowUpRight,
	CommandLine,
	DesignDoc,
	dotGrid,
	EASE,
	FolderGlyph,
	FrameGlyph,
	InstallDoc,
	LicenseDoc,
	MacDoc,
	OpenDoc,
	PlusGlyph,
	ProjectsDoc,
	StartDoc,
	WatchDoc,
} from "./parts";

/**
 * site-field--rail. The landing has no scroll story at all. It opens as a spool
 * project, already open, and the rail is the site's table of contents: every row
 * in it is a section, and the section is a frame standing on the field.
 *
 * The incumbent (site-hub--composed) argues the canvas by revealing it, which
 * makes the canvas the punchline of a scroll. A punchline lands once. This take
 * argues the opposite way round: hand the whole thing over on the first pixel
 * and let the visitor drive. Press a row and the camera fits that frame. Press
 * the field and it fits all eight, which is the only view where you see the
 * shape of the site. f toggles the two, j and k walk the rail, Escape pulls
 * back.
 *
 * Everything is read at 100%. A fit leaves a margin of dot grid on all four
 * sides on purpose, so the document you are reading never fills the field and
 * you are never allowed to forget it is one object among eight. Name tabs
 * counter-scale off the camera the way frame-label.tsx does, so the wide view
 * stays a readable index rather than a mosaic.
 *
 * The one live thing the copy cannot say for itself is what "+" does, so "+"
 * does it: the picker opens on a mock of one real home, choosing a folder opens
 * that project in a tab, and the project is empty, because a project you opened
 * a second ago is. Closing the tab puts you back.
 */

/* ---------- the fixed stage ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const RAIL_W = 248;
const BAR_H = 44;
const FIELD_W = VIEW_W - RAIL_W;
const FIELD_H = VIEW_H - BAR_H;

const WORLD_W = 5200;
const WORLD_H = 3600;

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
	Doc: () => React.ReactNode;
}

const FRAMES: readonly FieldFrame[] = [
	{ id: "start", sub: "what spool is", x: 200, y: 200, w: 1040, h: 640, Doc: StartDoc },
	{ id: "install", sub: "three commands", x: 1400, y: 240, w: 900, h: 560, Doc: InstallDoc },
	{ id: "mac", sub: "the disk image", x: 2460, y: 220, w: 1000, h: 600, Doc: MacDoc },
	{ id: "open", sub: "+ from any folder", x: 240, y: 1000, w: 900, h: 600, Doc: OpenDoc },
	{ id: "projects", sub: "a tab for each repo", x: 1300, y: 1060, w: 1040, h: 440, Doc: ProjectsDoc },
	{ id: "watch", sub: "two minutes", x: 2500, y: 1000, w: 960, h: 560, Doc: WatchDoc },
	{ id: "design", sub: "spool's own canvas", x: 300, y: 1760, w: 1100, h: 640, Doc: DesignDoc },
	{ id: "license", sub: "MIT", x: 1560, y: 1780, w: 860, h: 400, Doc: LicenseDoc },
];

const BOUNDS: Rect = { x: 200, y: 200, w: 3260, h: 2200 };

/** the site's own shape, drawn rather than derived. */
const EDGES: readonly [number, number][] = [
	[0, 1],
	[1, 2],
	[0, 3],
	[3, 4],
	[4, 5],
	[0, 6],
	[6, 7],
];

/* ---------- the camera ---------- */

interface Cam {
	x: number;
	y: number;
	k: number;
}

function fit(box: Rect, pad: number): Cam {
	const raw = Math.min((FIELD_W - pad) / box.w, (FIELD_H - pad) / box.h);
	const k = raw < 0.2 ? 0.2 : raw > 1 ? 1 : raw;
	return {
		k,
		x: RAIL_W + (FIELD_W - box.w * k) / 2 - box.x * k,
		y: BAR_H + (FIELD_H - box.h * k) / 2 - box.y * k,
	};
}

const FRAME_CAM = FRAMES.map((f) => fit(f, 130));
const ALL_CAM = fit(BOUNDS, 120);
const HOME = FRAME_CAM[0] ?? ALL_CAM;

/* ---------- threads ---------- */

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
	const bow = Math.min(180, Math.max(50, Math.hypot(to.x - from.x, to.y - from.y) * 0.26));
	const c1 = horizontal
		? { x: from.x + (to.x > from.x ? bow : -bow), y: from.y }
		: { x: from.x, y: from.y + (to.y > from.y ? bow : -bow) };
	const c2 = horizontal
		? { x: to.x + (to.x > from.x ? -bow : bow), y: to.y }
		: { x: to.x, y: to.y + (to.y > from.y ? -bow : bow) };
	return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

const THREADS = EDGES.map(([a, b]) => {
	const from = FRAMES[a];
	const to = FRAMES[b];
	return { key: `${a}-${b}`, a, b, d: from === undefined || to === undefined ? "" : edgePath(from, to) };
});

function Threads({ focus }: { focus: number | null }) {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={WORLD_W}
			height={WORLD_H}
			fill="none"
		>
			{THREADS.map((t) => {
				const lit = focus !== null && (t.a === focus || t.b === focus);
				const opacity = focus === null ? 0.3 : lit ? 0.55 : 0.11;
				return (
					<path
						key={t.key}
						d={t.d}
						stroke="var(--color-thread)"
						strokeWidth={1.6}
						strokeLinecap="round"
						className="transition-opacity duration-400"
						style={{ opacity }}
					/>
				);
			})}
		</svg>
	);
}

/* ---------- the ring, in screen space so its stroke never thickens ---------- */

const RING_CORNER = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";

function Ring({ rect, cam }: { rect: Rect; cam: { x: MotionValue<number>; y: MotionValue<number>; k: MotionValue<number> } }) {
	const x = useTransform([cam.x, cam.k], ([cx, k]: number[]) => (cx ?? 0) + rect.x * (k ?? 1));
	const y = useTransform([cam.y, cam.k], ([cy, k]: number[]) => (cy ?? 0) + rect.y * (k ?? 1));
	const w = useTransform(cam.k, (k: number) => rect.w * k);
	const h = useTransform(cam.k, (k: number) => rect.h * k);
	const chip = useTransform(cam.k, (k: number) => (k > 0.6 ? 1 : 0));
	return (
		<motion.div className="pointer-events-none absolute top-0 left-0 z-30" style={{ x, y, width: w, height: h }}>
			<div className="-inset-[3px] absolute rounded-[9px] border-[1.5px] border-thread" />
			<span className={cn(RING_CORNER, "-left-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -bottom-[7px]")} />
			<motion.span
				className="-bottom-[9px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none"
				style={{ opacity: chip }}
			>
				{rect.w} × {rect.h}
			</motion.span>
		</motion.div>
	);
}

/* ---------- a frame on the field ---------- */

function FieldTile({
	spec,
	camK,
	focused,
	onPick,
}: {
	spec: FieldFrame;
	camK: MotionValue<number>;
	focused: boolean;
	onPick: () => void;
}) {
	// labels hold their size against the camera, the way the canvas draws them
	const scale = useTransform(camK, (k: number) => (k > 0.999 ? 1 : 1 / k));
	return (
		<div className="absolute" style={{ left: spec.x, top: spec.y, width: spec.w, height: spec.h }}>
			<motion.div
				className="pointer-events-none absolute bottom-full left-0 flex items-baseline gap-2 whitespace-nowrap pb-2 font-mono text-xs leading-none"
				style={{ scale, transformOrigin: "0% 100%" }}
			>
				<span className={focused ? "text-thread" : "text-muted"}>{spec.id}</span>
				<span className="text-muted/50 text-2xs">{spec.sub}</span>
			</motion.div>
			<button
				type="button"
				aria-label={`Fit ${spec.id}`}
				onClick={(e) => {
					e.stopPropagation();
					onPick();
				}}
				className="group absolute inset-0 cursor-pointer text-left focus-visible:outline-none"
			>
				<div className="absolute inset-0 overflow-hidden rounded-[6px] border border-border-raised bg-bg">
					<spec.Doc />
				</div>
				{focused ? null : (
					<span className="-inset-px pointer-events-none absolute rounded-[7px] border border-thread/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
				)}
			</button>
		</div>
	);
}

/* ---------- the picker "+" opens ---------- */

const HOME_DISK: readonly { name: string; kind: string }[] = [
	{ name: "ferry-booking", kind: "no design/ yet" },
	{ name: "kaffe", kind: "no design/ yet" },
	{ name: "notes-cli", kind: "no design/ yet" },
	{ name: "tvarso", kind: "design/" },
];

function Picker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
	return (
		<>
			<button
				type="button"
				aria-label="Close the picker"
				onClick={onClose}
				className="absolute inset-0 z-[60] cursor-default"
			/>
			<motion.div
				className="absolute z-[61] w-[292px] overflow-hidden rounded-md border border-border-raised bg-surface"
				style={{ left: 208, top: BAR_H + 8 }}
				initial={{ opacity: 0, y: -6 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
				transition={{ duration: 0.2, ease: EASE }}
			>
				<div className="flex h-9 items-center gap-2 border-border border-b px-3 font-mono text-xs text-muted">
					<FolderGlyph className="h-3.5 w-3.5" />
					~/code
				</div>
				{HOME_DISK.map((row) => (
					<button
						type="button"
						key={row.name}
						onClick={() => onPick(row.name)}
						className="flex h-9 w-full cursor-pointer items-center gap-2.5 px-3 text-left transition-colors duration-150 hover:bg-raised focus-visible:outline-none"
					>
						<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
						<span className="font-mono text-sm text-text">{row.name}/</span>
						<span className="ml-auto font-mono text-2xs text-muted/60">{row.kind}</span>
					</button>
				))}
			</motion.div>
		</>
	);
}

/* ---------- chrome ---------- */

function TopBar({
	projects,
	active,
	pickerOpen,
	onPick,
	onToggle,
	onClose,
}: {
	projects: readonly string[];
	active: string;
	pickerOpen: boolean;
	onPick: (id: string) => void;
	onToggle: () => void;
	onClose: (id: string) => void;
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
										name === "spool.page" ? "px-3" : "pr-1 pl-3",
										on ? "font-medium text-text" : "text-muted hover:text-text",
									)}
								>
									{name}
								</button>
								{name === "spool.page" ? null : (
									<button
										type="button"
										aria-label={`Close ${name}`}
										onClick={() => onClose(name)}
										className="flex h-full w-5 cursor-pointer items-center justify-center pr-1 font-mono text-muted text-xs opacity-0 transition-opacity duration-150 hover:text-text group-hover:opacity-100"
									>
										×
									</button>
								)}
							</motion.div>
						);
					})}
				</AnimatePresence>
				<motion.button
					type="button"
					layout
					aria-label="Open a project"
					aria-expanded={pickerOpen}
					onClick={onToggle}
					className={cn(
						"flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none",
						pickerOpen ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text",
					)}
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
	onCanvas,
	focus,
	onPick,
	onAll,
}: {
	onCanvas: boolean;
	focus: number | null;
	onPick: (i: number) => void;
	onAll: () => void;
}) {
	return (
		<aside
			aria-label="Pages"
			className="absolute left-0 z-40 flex flex-col border-border border-r bg-bg"
			style={{ top: BAR_H, width: RAIL_W, height: FIELD_H }}
		>
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pl-3.5">
				<h2 className="font-semibold text-base leading-base">Pages</h2>
				<span className="font-mono text-muted text-xs leading-xs">{onCanvas ? 1 : 0}</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{!onCanvas ? (
					<div className="px-3.5 py-1 font-mono text-muted/60 text-sm leading-sm">no pages yet</div>
				) : (
					<>
						<button
							type="button"
							onClick={onAll}
							aria-pressed={focus === null}
							className={cn(
								"relative flex h-8 w-full cursor-pointer items-center gap-2 px-3.5 text-left transition-colors duration-150 focus-visible:outline-none",
								focus === null ? "bg-surface" : "hover:bg-surface/50",
							)}
						>
							{focus === null ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<FolderGlyph
								className={cn("h-3.5 w-3.5 shrink-0", focus === null ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-sm",
									focus === null ? "text-text" : "text-muted",
								)}
							>
								spool.page
							</span>
							<span className="font-mono text-2xs text-muted/60">{FRAMES.length}</span>
						</button>
						<div className="relative pt-1">
							<span className="absolute top-1 bottom-2 left-[18px] w-px bg-border-raised" />
							{FRAMES.map((f, i) => {
								const here = i === focus;
								return (
									<button
										type="button"
										key={f.id}
										aria-pressed={here}
										onClick={() => onPick(i)}
										className={cn(
											"relative flex h-[38px] w-full cursor-pointer items-center gap-2 pr-3.5 pl-[30px] text-left transition-colors duration-150 focus-visible:outline-none",
											here ? "bg-surface" : "hover:bg-surface/50",
										)}
									>
										<span className="absolute top-1/2 left-[18px] h-px w-2 bg-border-raised" />
										<FrameGlyph
											className={cn("h-3.5 w-3.5 shrink-0", here ? "text-thread" : "text-muted/70")}
										/>
										<span className="min-w-0 flex-1">
											<span
												className={cn(
													"block truncate font-mono text-sm leading-[15px] transition-colors duration-150",
													here ? "text-thread" : "text-muted",
												)}
											>
												{f.id}
											</span>
											<span className="mt-[3px] block truncate text-[11px] text-muted/55 leading-[13px]">
												{f.sub}
											</span>
										</span>
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

export default function SiteFieldRail() {
	const camX = useMotionValue(HOME.x);
	const camY = useMotionValue(HOME.y);
	const camK = useMotionValue(HOME.k);

	const [focus, setFocus] = useState<number | null>(0);
	const [pct, setPct] = useState(Math.round(HOME.k * 100));
	const [projects, setProjects] = useState<readonly string[]>(["spool.page"]);
	const [project, setProject] = useState("spool.page");
	const [pickerOpen, setPickerOpen] = useState(false);

	const onCanvas = project === "spool.page";

	useEffect(() => {
		const read = (k: number) => {
			const next = Math.round(k * 100);
			setPct((prev) => (prev === next ? prev : next));
		};
		read(camK.get());
		return camK.on("change", read);
	}, [camK]);

	const fly = useCallback(
		(target: Cam) => {
			const spec = { duration: 0.62, ease: EASE } as const;
			animate(camX, target.x, spec);
			animate(camY, target.y, spec);
			animate(camK, target.k, spec);
		},
		[camX, camY, camK],
	);

	const go = useCallback(
		(i: number | null) => {
			setFocus(i);
			fly(i === null ? ALL_CAM : (FRAME_CAM[i] ?? ALL_CAM));
		},
		[fly],
	);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (!onCanvas) return;
			if (e.key === "f") {
				e.preventDefault();
				go(focus === null ? 0 : null);
				return;
			}
			if (e.key === "Escape") {
				setPickerOpen(false);
				go(null);
				return;
			}
			const step = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
			if (step === 0) return;
			e.preventDefault();
			const base = focus === null ? (step > 0 ? -1 : FRAMES.length) : focus;
			const next = (base + step + FRAMES.length) % FRAMES.length;
			go(next);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [focus, go, onCanvas]);

	const focusRect = focus === null ? null : (FRAMES[focus] ?? null);

	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			{/* the field */}
			{/* pressing the field itself is how you get the whole thing back */}
			<motion.div
				aria-hidden="true"
				className="absolute top-0 left-0 origin-top-left"
				onClick={() => go(null)}
				style={{ width: WORLD_W, height: WORLD_H, x: camX, y: camY, scale: camK, ...dotGrid }}
			>
				<Threads focus={focus} />
				{FRAMES.map((f, i) => (
					<FieldTile key={f.id} spec={f} camK={camK} focused={focus === i} onPick={() => go(i)} />
				))}
			</motion.div>

			{focusRect === null || !onCanvas ? null : (
				<Ring rect={focusRect} cam={{ x: camX, y: camY, k: camK }} />
			)}

			{/* the project "+" just opened, which has nothing in it yet */}
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
						<p className="w-[430px] text-center text-[13px] text-muted/70 leading-[21px]">
							{project} is open and its design folder is empty. Ask your agent for a screen and the first
							frame lands right here.
						</p>
						<div className="mt-2 flex gap-4">
							<span className="w-px shrink-0 self-stretch bg-thread/70" />
							<div className="w-[280px] font-mono text-[13px] leading-[24px]">
								<CommandLine prompt={`~/code/${project} $`} command="spool serve" />
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<TopBar
				projects={projects}
				active={project}
				pickerOpen={pickerOpen}
				onPick={setProject}
				onToggle={() => setPickerOpen((v) => !v)}
				onClose={(name) => {
					setProjects((p) => p.filter((n) => n !== name));
					setProject("spool.page");
				}}
			/>
			<Rail onCanvas={onCanvas} focus={focus} onPick={(i) => go(i)} onAll={() => go(null)} />

			<AnimatePresence>
				{pickerOpen ? (
					<Picker
						key="picker"
						onClose={() => setPickerOpen(false)}
						onPick={(name) => {
							setProjects((p) => (p.includes(name) ? p : [...p, name]));
							setProject(name);
							setPickerOpen(false);
						}}
					/>
				) : null}
			</AnimatePresence>

			{/* the two states the camera has, said in the corner it happens in */}
			<div className="pointer-events-none absolute bottom-5 left-[276px] z-40 flex items-center gap-3 font-mono text-[11px] text-muted/70">
				{onCanvas ? (
					focus === null ? (
						<span>8 frames on this page. Press one, or a row.</span>
					) : (
						<span>
							Press the field to fit all
							<span className="ml-2 rounded-xs border border-border-raised px-1.5 py-[1px] text-muted">
								f
							</span>
						</span>
					)
				) : null}
			</div>

			<div className="pointer-events-none absolute right-5 bottom-5 z-40 font-mono text-muted/70 text-xs tabular-nums">
				{onCanvas ? `${pct}%` : "100%"}
			</div>
		</div>
	);
}
