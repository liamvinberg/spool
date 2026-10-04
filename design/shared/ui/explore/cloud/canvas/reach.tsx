import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { haptic } from "shared/ui/explore/cloud/phone-link/tonal";
import { ChevronIcon, FolderIcon, FrameIcon } from "shared/ui/spool/icons";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Field, useCamera } from "./camera";
import { bounds, type Cam, clamp, fit, GLIDE, HERE, type Page, PAGES, SPRING } from "./fixture";
import { PhoneShell, ScreenContext, useDevice, usePhone, useScreenSize } from "./phone";
import { Cursors } from "./rail";

/**
 * reach (DEV-161): the team canvas on a phone, kept a canvas and put under the
 * thumb. The field is the shipped one (threads, mono names, who's where), but
 * the camera has two rests instead of free flight: a frame filling the screen,
 * or the whole page. Frames run sideways in thread order and pages stack
 * vertically, the way the rail lists them, so a swipe is all the navigation
 * there is. Everything spool owns sits in one bar at the bottom: where you are,
 * a map of the project, who's here. The bar opens into the rail.
 *
 * Play grows the frame to the whole screen and leaves the frame every gesture
 * but one: a pull from the right edge steps it back into the canvas.
 *
 * Prototype only. Drag with the mouse to stand in for a thumb.
 */

export type ReachState = "base" | "rail" | "play";
type Mode = "frame" | "page";

const BAR = 54;
const GAP = 10;
const SLIDE = 120;

function Reach({ state }: { state: ReachState }) {
	const screen = useScreenSize();
	const field = useRef<HTMLDivElement | null>(null);
	const cam = useCamera();
	const [pageIdx, setPageIdx] = useState(0);
	const [idx, setIdx] = useState(state === "play" ? 1 : 0);
	const [mode, setMode] = useState<Mode>("frame");
	const [rail, setRail] = useState(state === "rail");
	const [hint, setHint] = useState(false);
	const [toast, setToast] = useState(false);
	const page = PAGES[pageIdx] ?? PAGES[0]!;
	const live = useRef({ pageIdx, idx, mode });
	live.current = { pageIdx, idx, mode };
	const swap = useRef<{ dir: number; idx: number; mode: Mode }>({ dir: 1, idx: 0, mode: "frame" });

	const restFor = useCallback(
		(pg: Page, i: number, m: Mode): Cam => {
			const el = field.current;
			const vw = el?.clientWidth ?? screen.w;
			const vh = el?.clientHeight ?? screen.h;
			const bottom = BAR + GAP + screen.chin + 34;
			if (m === "page") return fit(bounds(pg.frames), vw, vh, { x: 20, top: 56, bottom }, 1);
			const f = pg.frames[i] ?? pg.frames[0]!;
			return fit(f, vw, vh, { x: 34, top: 40, bottom }, 1);
		},
		[screen],
	);

	const p = usePhone(state === "play" ? "play" : "base", {
		exit: "edge",
		// walking inside play moves the canvas underneath, so leaving lands on the frame you walked to
		onWalk: (name) => {
			const i = page.frames.findIndex((f) => f.name === name);
			if (i < 0) return;
			setIdx(i);
			setMode("frame");
			cam.set(restFor(page, i, "frame"));
		},
	});

	useLayoutEffect(() => {
		const { pageIdx: pi, idx: i, mode: m } = live.current;
		cam.set(restFor(PAGES[pi]!, i, m));
	}, [cam, restFor]);

	useEffect(() => {
		if (state !== "base") return;
		const a = window.setTimeout(() => setHint(true), 600);
		const b = window.setTimeout(() => setHint(false), 4600);
		return () => {
			window.clearTimeout(a);
			window.clearTimeout(b);
		};
	}, [state]);

	useEffect(() => {
		if (!p.changed) return;
		setToast(true);
		const t = window.setTimeout(() => setToast(false), 6000);
		return () => window.clearTimeout(t);
	}, [p.changed]);

	/* ---------- moving ---------- */

	const focus = (i: number, m: Mode = "frame") => {
		if (i !== idx || m !== mode) haptic();
		setIdx(i);
		setMode(m);
		cam.fly(restFor(page, i, m));
	};

	const toPage = (n: number, opts: { idx?: number; mode?: Mode } = {}) => {
		if (n === pageIdx) {
			focus(opts.idx ?? idx, opts.mode ?? mode);
			return;
		}
		if (n < 0 || n >= PAGES.length) {
			cam.fly(restFor(page, idx, mode));
			return;
		}
		haptic();
		const dir = n > pageIdx ? 1 : -1;
		const c = cam.get();
		cam.fly({ ...c, y: c.y - dir * SLIDE });
		swap.current = { dir, idx: opts.idx ?? 0, mode: opts.mode ?? mode };
		setPageIdx(n);
		setIdx(opts.idx ?? 0);
		setMode(opts.mode ?? mode);
	};

	const onSwap = () => {
		const s = swap.current;
		const rest = restFor(PAGES[live.current.pageIdx]!, s.idx, s.mode);
		cam.set({ ...rest, y: rest.y + s.dir * SLIDE });
		cam.fly(rest);
	};

	const play = (i: number) => {
		const f = page.frames[i];
		if (f === undefined) return;
		haptic();
		p.open(page, f.name, field.current?.querySelector(`[data-frame="${f.name}"]`));
	};

	/* ---------- the thumb: swipe, pinch, tap ---------- */

	const pts = useRef(new Map<number, { x: number; y: number }>());
	const g = useRef<{
		x0: number;
		y0: number;
		t0: number;
		cam0: Cam;
		axis: "x" | "y" | "pinch" | null;
		dist0: number;
		mid0: { x: number; y: number };
	} | null>(null);

	const local = (event: React.PointerEvent) => {
		const box = field.current?.getBoundingClientRect();
		return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
	};
	const toWorld = (sx: number, sy: number) => {
		const c = cam.get();
		return { x: (sx - c.x) / c.z, y: (sy - c.y) / c.z };
	};
	const frameAt = (sx: number, sy: number) => {
		const w = toWorld(sx, sy);
		const z = cam.z.get();
		return page.frames.findIndex((f) => w.x >= f.x - 12 / z && w.x <= f.x + f.w + 12 / z && w.y >= f.y - 28 / z && w.y <= f.y + f.h + 12 / z);
	};
	const nearest = () => {
		const el = field.current;
		const w = toWorld((el?.clientWidth ?? screen.w) / 2, (el?.clientHeight ?? screen.h) / 2);
		let best = 0;
		let d = Number.POSITIVE_INFINITY;
		page.frames.forEach((f, i) => {
			const dd = Math.hypot(f.x + f.w / 2 - w.x, f.y + f.h / 2 - w.y);
			if (dd < d) {
				d = dd;
				best = i;
			}
		});
		return best;
	};

	const down = (event: React.PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		const at = local(event);
		pts.current.set(event.pointerId, at);
		cam.stop();
		setHint(false);
		if (pts.current.size === 1) {
			g.current = { x0: at.x, y0: at.y, t0: event.timeStamp, cam0: cam.get(), axis: null, dist0: 0, mid0: at };
		} else if (pts.current.size === 2 && g.current !== null) {
			const [a, b] = [...pts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
			g.current = { ...g.current, axis: "pinch", cam0: cam.get(), dist0: Math.hypot(a.x - b.x, a.y - b.y), mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
		}
	};

	const move = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!pts.current.has(event.pointerId) || g.current === null) return;
		const at = local(event);
		pts.current.set(event.pointerId, at);
		const s = g.current;
		if (s.axis === "pinch") {
			if (pts.current.size < 2) return;
			const [a, b] = [...pts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const z = clamp((s.cam0.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, s.dist0), 0.05, 2);
			const wx = (s.mid0.x - s.cam0.x) / s.cam0.z;
			const wy = (s.mid0.y - s.cam0.y) / s.cam0.z;
			cam.x.set(mid.x - wx * z);
			cam.y.set(mid.y - wy * z);
			cam.z.set(z);
			return;
		}
		const dx = at.x - s.x0;
		const dy = at.y - s.y0;
		if (s.axis === null && Math.hypot(dx, dy) > 8) s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
		if (s.axis === "x") {
			const free = mode === "frame" && ((dx < 0 && idx < page.frames.length - 1) || (dx > 0 && idx > 0));
			cam.x.set(s.cam0.x + dx * (free ? 1 : 0.3));
		} else if (s.axis === "y") {
			const free = (dy < 0 && pageIdx < PAGES.length - 1) || (dy > 0 && pageIdx > 0);
			cam.y.set(s.cam0.y + dy * (free ? 0.45 : 0.2));
		}
	};

	const up = (event: React.PointerEvent<HTMLDivElement>) => {
		const at = pts.current.get(event.pointerId) ?? local(event);
		pts.current.delete(event.pointerId);
		const s = g.current;
		if (s === null) return;
		if (s.axis === "pinch") {
			if (pts.current.size > 0) return;
			g.current = null;
			// a pinch settles on a rest: out past a frame shows the page, in lands on the frame nearest the middle
			const frameZ = restFor(page, idx, "frame").z;
			if (cam.z.get() < frameZ * 0.8) focus(idx, "page");
			else focus(nearest(), "frame");
			return;
		}
		g.current = null;
		const dx = at.x - s.x0;
		const dy = at.y - s.y0;
		const dt = Math.max(1, event.timeStamp - s.t0);
		if (s.axis === null) {
			const hit = frameAt(at.x, at.y);
			if (hit < 0) return;
			if (mode === "frame" && hit === idx) play(hit);
			else focus(hit, "frame");
			return;
		}
		if (s.axis === "x") {
			const v = dx / dt;
			if (mode === "frame" && (dx < -60 || v < -0.45) && idx < page.frames.length - 1) focus(idx + 1);
			else if (mode === "frame" && (dx > 60 || v > 0.45) && idx > 0) focus(idx - 1);
			else cam.fly(restFor(page, idx, mode));
			return;
		}
		const v = dy / dt;
		if (dy < -60 || v < -0.45) toPage(pageIdx + 1);
		else if (dy > 60 || v > 0.45) toPage(pageIdx - 1);
		else cam.fly(restFor(page, idx, mode));
	};

	const cancel = (event: React.PointerEvent<HTMLDivElement>) => {
		pts.current.delete(event.pointerId);
		if (pts.current.size === 0) {
			g.current = null;
			cam.fly(restFor(page, idx, mode));
		}
	};

	const current = page.frames[idx] ?? page.frames[0]!;
	const lit = p.changed && current.name === "cart";

	return (
		<PhoneShell rootRef={p.root} over={p.over}>
			<Field
				fieldRef={field}
				cam={cam}
				page={page}
				member
				changed={p.changed}
				away={p.play?.name}
				onSwap={onSwap}
				small
				cursors={page.name === "app" && p.play === null ? <Cursors cam={cam} small /> : null}
			/>
			<div className="absolute inset-0 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} />

			<AnimatePresence initial={false}>
				{rail ? (
					<motion.div
						key="scrim"
						className="absolute inset-0 z-20 bg-black/40"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={GLIDE}
						onClick={() => setRail(false)}
					/>
				) : null}
			</AnimatePresence>

			<div className="absolute inset-x-2.5 z-30 flex flex-col items-stretch gap-2" style={{ bottom: GAP + screen.chin }}>
				<AnimatePresence>
					{hint && !rail ? (
						<motion.div
							key="hint"
							className="pointer-events-none self-center rounded-sm border border-border-raised bg-raised/90 px-2.5 py-1.5 text-muted backdrop-blur-xl type-detail"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 4 }}
							transition={SPRING}
						>
							← → frames · ↑ ↓ pages · tap plays
						</motion.div>
					) : null}
					{toast && !rail && p.play === null ? (
						<motion.button
							key="toast"
							type="button"
							className="flex h-10 cursor-pointer items-center gap-2 self-center rounded-md border border-border-raised bg-raised/95 pr-1.5 pl-2 text-text backdrop-blur-xl active:scale-[0.97] type-detail"
							initial={{ opacity: 0, y: 10, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 6 }}
							transition={SPRING}
							onClick={() => {
								setToast(false);
								toPage(0, { idx: 1, mode: "frame" });
							}}
						>
							<Face id="jonas" size={18} />
							<span>jonas saved cart</span>
							<span className="rounded-xs bg-thread/15 px-1.5 py-0.5 text-thread">show</span>
						</motion.button>
					) : null}
				</AnimatePresence>

				<motion.div
					className="overflow-hidden rounded-lg border border-border-raised bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
					animate={{ scale: 1 }}
					whileTap={rail ? undefined : { scale: 0.985 }}
					transition={SPRING}
				>
					<AnimatePresence initial={false}>
						{rail ? (
							<motion.div key="rail" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={GLIDE} className="overflow-hidden">
								<PhoneRail
									pageIdx={pageIdx}
									idx={idx}
									changed={p.changed}
									onPage={(n) => toPage(n, { idx: 0, mode: "frame" })}
									onFrame={(n, i) => {
										setRail(false);
										window.setTimeout(() => toPage(n, { idx: i, mode: "frame" }), 120);
									}}
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
					<div className="flex items-center" style={{ height: BAR }}>
						<button
							type="button"
							onClick={() => {
								haptic();
								setRail((r) => !r);
							}}
							className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 pr-2 pl-2.5 text-left"
						>
							<TeamMark size={28} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-muted type-detail">tidemark app</span>
								<span className="flex min-w-0 items-center gap-1.5 type-value">
									<AnimatePresence mode="popLayout" initial={false}>
										<motion.span
											key={`${page.name}/${mode === "page" ? "" : current.name}`}
											className="truncate"
											initial={{ opacity: 0, y: 6 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -6 }}
											transition={SPRING}
										>
											<span className={mode === "page" ? "text-text" : "text-muted"}>{page.name}</span>
											{mode === "page" ? null : (
												<>
													<span className="text-muted"> / </span>
													<span className="text-text">{current.name}</span>
												</>
											)}
										</motion.span>
									</AnimatePresence>
									{lit && mode === "frame" ? <UnseenMark mark="changed" /> : null}
								</span>
							</span>
							<span className={cn("ml-auto flex shrink-0 text-muted transition-transform duration-200", rail ? "" : "rotate-180")}>
								<ChevronIcon open className="h-2.5 w-2.5" />
							</span>
						</button>
						<span className="h-6 w-px bg-border-raised" />
						<MapButton pageIdx={pageIdx} idx={idx} mode={mode} onToggle={() => focus(idx, mode === "frame" ? "page" : "frame")} />
						<span className="pr-2.5 pl-1">
							<Faces ids={HERE.map((h) => h.id)} size={24} />
						</span>
					</div>
				</motion.div>
			</div>
		</PhoneShell>
	);
}

/** The project as dots: a row per page, a dot per frame. Where you are is the red one. Tap shows the whole page, again goes back. */
function MapButton({ pageIdx, idx, mode, onToggle }: { pageIdx: number; idx: number; mode: Mode; onToggle: () => void }) {
	return (
		<motion.button
			type="button"
			aria-label={mode === "frame" ? "Show the whole page" : "Back to the frame"}
			onClick={onToggle}
			whileTap={{ scale: 0.92 }}
			transition={SPRING}
			className="flex h-full cursor-pointer flex-col items-start justify-center gap-[4px] px-3"
		>
			{PAGES.map((pg, n) => (
				<span key={pg.name} className="flex items-center gap-[3px]">
					{pg.frames.map((f, i) => {
						const here = n === pageIdx && (mode === "page" || i === idx);
						const site = "site" in f.content;
						return (
							<motion.span
								key={f.name}
								className="block h-[5px] rounded-[1.5px]"
								initial={false}
								animate={{
									width: (site ? 9 : 5) + (here && mode === "frame" ? 5 : 0),
									backgroundColor: here ? "var(--color-thread)" : n === pageIdx ? "var(--color-muted)" : "var(--color-border-raised)",
								}}
								transition={SPRING}
							/>
						);
					})}
				</span>
			))}
		</motion.button>
	);
}

/** the desktop rail, grown out of the bar: pages, the open page's frames, who's on which, at touch height */
function PhoneRail({
	pageIdx,
	idx,
	changed,
	onPage,
	onFrame,
}: {
	pageIdx: number;
	idx: number;
	changed: boolean;
	onPage: (n: number) => void;
	onFrame: (page: number, i: number) => void;
}) {
	return (
		<div className="max-h-[52vh] overflow-y-auto overscroll-contain border-border-raised border-b py-1.5 [scrollbar-width:none]">
			{PAGES.map((pg, n) => {
				const open = n === pageIdx;
				return (
					<div key={pg.name}>
						<button type="button" onClick={() => onPage(n)} className="relative flex h-11 w-full cursor-pointer items-center pr-3.5 text-left active:bg-surface">
							{open ? <span className="absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
							<span className="flex h-11 w-8 shrink-0 items-center justify-center text-muted">
								<ChevronIcon open={open} className="h-2.5 w-2.5" />
							</span>
							<FolderIcon className={cn("mr-2.5 h-4 w-4 shrink-0", open ? "text-thread" : "text-muted")} />
							<span className={cn("min-w-0 flex-1 truncate type-value", open ? "text-text" : "text-muted")}>{pg.name}</span>
							<span className="text-muted type-detail">{pg.frames.length}</span>
						</button>
						<AnimatePresence initial={false}>
							{open ? (
								<motion.div className="relative overflow-hidden" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={SPRING}>
									<span className="absolute top-0 bottom-5 left-[23px] w-px bg-border-raised" />
									{pg.frames.map((f, i) => {
										const lit = changed && f.name === "cart";
										const here = HERE.filter((h) => h.frame === f.name && pg.name === "app").map((h) => h.id);
										const on = i === idx;
										return (
											<button
												key={f.name}
												type="button"
												onClick={() => onFrame(n, i)}
												className={cn("relative flex h-11 w-full cursor-pointer items-center gap-2.5 pr-3.5 pl-[44px] text-left active:bg-surface", on && "bg-surface/70")}
											>
												<span className="absolute top-1/2 left-[23px] h-px w-3 bg-border-raised" />
												<FrameIcon className="h-4 w-4 shrink-0 text-muted" />
												<span className={cn("min-w-0 flex-1 truncate type-value", on || lit ? "text-text" : "text-muted")}>{f.name}</span>
												{lit ? <UnseenMark mark="changed" /> : null}
												{here.length > 0 ? <Faces ids={here} size={18} /> : null}
											</button>
										);
									})}
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				);
			})}
		</div>
	);
}

function OnDevice({ state }: { state: ReachState }) {
	const screen = useDevice();
	return (
		<ScreenContext.Provider value={screen}>
			<Reach state={state} />
		</ScreenContext.Provider>
	);
}

export function PhoneReach({ state, device = false }: { state: ReachState; device?: boolean }) {
	if (device) return <OnDevice state={state} />;
	return <Reach state={state} />;
}
