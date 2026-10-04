import { AnimatePresence, animate, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Face, Faces } from "shared/ui/explore/cloud/home/parts";
import { haptic } from "shared/ui/explore/cloud/phone-link/tonal";
import { ChevronIcon, FolderIcon, FrameIcon, SearchIcon } from "shared/ui/spool/icons";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Field, useCamera } from "./camera";
import { bounds, type Cam, clamp, fit, GLIDE, type Page, PAGES, SPRING, type Spec } from "./fixture";
import { PhoneShell, ScreenContext, useDevice, usePhone, useScreenSize } from "./phone";
import { Cursors } from "./rail";

/**
 * reach (DEV-161): the team canvas on a phone, kept a canvas and put under the
 * thumb, drawn against real projects (spool's own design/, chamfer,
 * securesend, cat-tracker) read from their frames and covers.
 *
 * What real projects taught it: most frames are desktop-sized, a page is a
 * grid (takes down, states across) of up to 76 frames, and pages nest five
 * deep and number over a hundred. So:
 *
 *   inside a page   the camera rests on one frame or the whole page; a swipe
 *                   in any direction lands on the nearest frame that way
 *   between pages   the bar opens the navigator: recent changes, the page
 *                   tree a level at a time, and a find field
 *   where you are   the bar's map is this page's real layout; drag on it to
 *                   scrub across the page frame by frame
 *   play            the frame alone on the screen; a desktop frame plays
 *                   whole and asks you to turn the phone; a pull from the
 *                   right edge steps back into the canvas
 *
 * Prototype only. On the canvas it falls back to the tidemark fixture; on the
 * phone it reads the project the switcher picked.
 */

export type ReachState = "base" | "rail" | "play";
type Mode = "frame" | "page";
type Dir = "l" | "r" | "u" | "d";

interface Recent {
	page: string;
	name: string;
	who: string;
	at: number;
}

interface Project {
	id: string;
	name: string;
	pages: Page[];
	recent: Recent[];
}

const BAR = 56;
const GAP = 10;
const BASE = "/spool-notes/phone-canvas/projects";
const PEOPLE = ["jonas", "mira", "sam"];

const TIDEMARK: Project = {
	id: "tidemark",
	name: "tidemark app",
	pages: PAGES,
	recent: [
		{ page: "app", name: "cart", who: "jonas", at: Date.now() - 60_000 },
		{ page: "app", name: "menu", who: "mira", at: Date.now() - 7_200_000 },
		{ page: "site", name: "landing", who: "sam", at: Date.now() - 26_000_000 },
	],
};

interface Raw {
	id: string;
	name: string;
	frames: { path: string; page: string; name: string; x: number; y: number; w: number; h: number; at: number; thumb?: string }[];
	edges: { from: string; to: string; might: boolean }[];
}

const parent = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const leaf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function shape(raw: Raw): Project {
	const pages = new Map<string, Page>();
	for (const f of raw.frames) {
		const page = pages.get(f.page) ?? { name: f.page, frames: [], threads: [] };
		pages.set(f.page, page);
		const content = f.thumb === undefined ? { site: 0 } : { thumb: `${BASE}/${raw.id}/t/${f.thumb}`, play: `${BASE}/${raw.id}/p/${f.thumb}` };
		page.frames.push({ name: f.name, x: f.x, y: f.y, w: f.w, h: f.h, content });
	}
	for (const e of raw.edges) {
		const page = pages.get(parent(e.from));
		if (page === undefined || parent(e.to) !== page.name) continue;
		page.threads.push({ from: leaf(e.from), to: leaf(e.to), might: e.might });
	}
	const recent = [...raw.frames]
		.sort((a, b) => b.at - a.at)
		.slice(0, 3)
		.map((f, i) => ({ page: f.page, name: f.name, who: PEOPLE[i]!, at: f.at }));
	return { id: raw.id, name: raw.name, pages: [...pages.values()].sort((a, b) => a.name.localeCompare(b.name)), recent };
}

function useProject(): Project | null {
	const [project, setProject] = useState<Project | null>(null);
	useEffect(() => {
		let id = "spool";
		try {
			id = window.localStorage.getItem("dev161-project") ?? "spool";
		} catch {}
		// the real projects are served next to the phone build only; on the canvas there is the fixture
		if (id === "tidemark" || !window.location.hostname.endsWith(".ts.net")) {
			setProject(TIDEMARK);
			return;
		}
		fetch(`${BASE}/${id}/project.json`)
			.then((r) => (r.ok ? (r.json() as Promise<Raw>) : Promise.reject(new Error(String(r.status)))))
			.then((raw) => setProject(shape(raw)))
			.catch(() => setProject(TIDEMARK));
	}, []);
	return project;
}

const ago = (at: number) => {
	const m = Math.max(1, Math.round((Date.now() - at) / 60_000));
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.round(h / 24);
	return d === 1 ? "yesterday" : `${d} days ago`;
};

const shortPath = (path: string) => {
	const parts = path.split("/");
	return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
};

/** the nearest frame the way the finger sent you: ahead of you, and the less sideways the better */
function neighbor(frames: Spec[], i: number, dir: Dir): number {
	const from = frames[i];
	if (from === undefined) return -1;
	const cx = from.x + from.w / 2;
	const cy = from.y + from.h / 2;
	let best = -1;
	let score = Number.POSITIVE_INFINITY;
	frames.forEach((f, j) => {
		if (j === i) return;
		const dx = f.x + f.w / 2 - cx;
		const dy = f.y + f.h / 2 - cy;
		const along = dir === "r" ? dx : dir === "l" ? -dx : dir === "d" ? dy : -dy;
		const across = dir === "r" || dir === "l" ? Math.abs(dy) : Math.abs(dx);
		if (along < Math.min(from.w, from.h) * 0.25) return;
		const s = along + across * 2.2;
		if (s < score) {
			score = s;
			best = j;
		}
	});
	return best;
}

/**
 * The page reflowed for a phone, the way a website reflows: rows (takes) keep
 * their order and frames keep their order in a row, but a row wraps to the
 * phone's width, two desktop frames or three phone frames to a line, and the
 * desktop's long empty distances close up. Sizes stay authored.
 */
function pack(page: Page): Page {
	if (page.frames.length === 0) return page;
	const sorted = [...page.frames].sort((a, b) => a.y - b.y || a.x - b.x);
	const rows: Spec[][] = [];
	for (const f of sorted) {
		const row = rows[rows.length - 1];
		if (row !== undefined && f.y < Math.min(...row.map((g) => g.y + g.h * 0.5))) row.push(f);
		else rows.push([f]);
	}
	const at = new Map<string, { x: number; y: number }>();
	let y = 0;
	for (const row of rows) {
		row.sort((a, b) => a.x - b.x);
		const wide = row.filter((f) => f.w > 500).length * 2 >= row.length;
		const per = wide ? 2 : 3;
		const colW = Math.max(...row.map((f) => f.w));
		const gapX = colW * 0.08;
		for (let i = 0; i < row.length; i += per) {
			const line = row.slice(i, i + per);
			const lineH = Math.max(...line.map((f) => f.h));
			line.forEach((f, j) => at.set(f.name, { x: j * (colW + gapX), y }));
			y += lineH + Math.max(lineH * 0.16, 140);
		}
		y += Math.max(...row.map((f) => f.h)) * 0.22;
	}
	return { ...page, frames: page.frames.map((f) => ({ ...f, ...(at.get(f.name) ?? { x: f.x, y: f.y }) })) };
}

/** how far the reflowed page scrolls: its top under the top edge, its end above the bar */
function scrollRange(page: Page, z: number, vh: number, bottom: number): [number, number] {
	const b = bounds(page.frames);
	const hi = 48 - b.y * z;
	const lo = vh - bottom - (b.y + b.h) * z;
	return [Math.min(lo, hi), hi];
}

function Mark({ name, size }: { name: string; size: number }) {
	return (
		<span className="grid shrink-0 place-items-center rounded-md border border-border-raised bg-raised font-medium text-text" style={{ width: size, height: size, fontSize: size * 0.42 }}>
			{name.slice(0, 1).toUpperCase()}
		</span>
	);
}

/* ---------- the take ---------- */

function Reach({ state, project }: { state: ReachState; project: Project }) {
	const screen = useScreenSize();
	const field = useRef<HTMLDivElement | null>(null);
	const cam = useCamera();
	const start = useMemo(() => {
		const r = project.recent[0];
		const pi = r === undefined ? 0 : Math.max(0, project.pages.findIndex((p) => p.name === r.page));
		const fi = r === undefined ? 0 : Math.max(0, project.pages[pi]!.frames.findIndex((f) => f.name === r.name));
		return state === "play" && project.id === "tidemark" ? { pi: 0, fi: 1 } : { pi, fi };
	}, [project, state]);
	const [pageIdx, setPageIdx] = useState(start.pi);
	const [idx, setIdx] = useState(start.fi);
	const [mode, setMode] = useState<Mode>("frame");
	const [nav, setNav] = useState(state === "rail");
	const [hint, setHint] = useState(false);
	const [toast, setToast] = useState(false);
	const pages = useMemo(() => project.pages.map(pack), [project]);
	const page = pages[pageIdx] ?? pages[0]!;
	// turned sideways, the bar steps away and the frame gets the whole screen
	const land = screen.device && screen.w > screen.h;
	const live = useRef({ pageIdx, idx, mode });
	live.current = { pageIdx, idx, mode };
	const swap = useRef<{ idx: number; mode: Mode }>({ idx: 0, mode: "frame" });
	const here = project.recent.slice(0, 2).map((r) => ({ id: r.who, page: r.page, name: r.name }));

	const restFor = useCallback(
		(pg: Page, i: number, m: Mode): Cam => {
			const el = field.current;
			const vw = el?.clientWidth ?? screen.w;
			const vh = el?.clientHeight ?? screen.h;
			const land = screen.device && screen.w > screen.h;
			const bottom = land ? 12 + screen.chin : BAR + GAP + screen.chin + 30;
			const f = pg.frames[i] ?? pg.frames[0]!;
			if (m === "page") {
				// the page: as wide as the phone, scrolled so the frame you came from is in view
				const b = bounds(pg.frames);
				const z = Math.min((vw - 32) / b.w, 0.6);
				const x = (vw - b.w * z) / 2 - b.x * z;
				const [lo, hi] = scrollRange(pg, z, vh, bottom);
				return { z, x, y: clamp(vh * 0.42 - (f.y + f.h / 2) * z, lo, hi) };
			}
			const padX = f.w > 500 ? (land ? 40 : 14) : 34;
			const top = land ? 28 : 40;
			// a long page (a docs page, a whole landing) fits the width and scrolls, starting at its top
			const zw = Math.min((vw - padX * 2) / f.w, 1);
			if (f.h > f.w && f.h * zw > (vh - top - bottom) * 1.2) return { z: zw, x: (vw - f.w * zw) / 2 - f.x * zw, y: top - f.y * zw };
			return fit(f, vw, vh, { x: padX, top, bottom }, 1);
		},
		[screen],
	);
	/** for a long frame at rest, how far it scrolls; null when it fits */
	const frameRange = (): [number, number] | null => {
		const f = page.frames[idx];
		const el = field.current;
		if (f === undefined) return null;
		const vh = el?.clientHeight ?? screen.h;
		const rest = restFor(page, idx, "frame");
		const bottom = land ? 12 + screen.chin : BAR + GAP + screen.chin + 30;
		if ((f.y + f.h) * rest.z + rest.y <= vh - bottom + 1) return null;
		const hi = rest.y;
		const lo = vh - bottom - (f.y + f.h) * rest.z;
		return [Math.min(lo, hi), hi];
	};
	const pageRange = () => {
		const el = field.current;
		return scrollRange(page, cam.z.get(), el?.clientHeight ?? screen.h, land ? 12 + screen.chin : BAR + GAP + screen.chin + 30);
	};

	const p = usePhone(state === "play" ? "play" : "base", { exit: "edge" });

	useLayoutEffect(() => {
		const { pageIdx: pi, idx: i, mode: m } = live.current;
		cam.set(restFor(pages[pi]!, i, m));
	}, [cam, restFor, pages]);

	useEffect(() => {
		if (state !== "base") return;
		const a = window.setTimeout(() => setHint(true), 600);
		const b = window.setTimeout(() => setHint(false), 5200);
		return () => {
			window.clearTimeout(a);
			window.clearTimeout(b);
		};
	}, [state]);

	useEffect(() => {
		if (!p.changed) return;
		setToast(true);
		const t = window.setTimeout(() => setToast(false), 6500);
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
		const i = opts.idx ?? 0;
		const m = opts.mode ?? "frame";
		if (n === pageIdx) {
			focus(i, m);
			return;
		}
		haptic();
		swap.current = { idx: i, mode: m };
		setPageIdx(n);
		setIdx(i);
		setMode(m);
	};

	// the new page arrives from slightly further out, so a jump reads as one
	const onSwap = () => {
		const s = swap.current;
		const rest = restFor(pages[live.current.pageIdx]!, s.idx, s.mode);
		const el = field.current;
		const cx = (el?.clientWidth ?? screen.w) / 2;
		const cy = (el?.clientHeight ?? screen.h) / 2;
		const z = rest.z * 0.9;
		cam.set({ z, x: cx - ((cx - rest.x) / rest.z) * z, y: cy - ((cy - rest.y) / rest.z) * z });
		cam.fly(rest);
	};

	const openFrame = (pageName: string, frameName: string) => {
		const n = project.pages.findIndex((x) => x.name === pageName);
		if (n < 0) return;
		const i = Math.max(0, project.pages[n]!.frames.findIndex((f) => f.name === frameName));
		toPage(n, { idx: i, mode: "frame" });
	};

	const play = (i: number) => {
		const f = page.frames[i];
		if (f === undefined) return;
		haptic();
		p.open(page, f.name, field.current?.querySelector(`[data-frame="${CSS.escape(f.name)}"]`));
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
		return page.frames.findIndex((f) => w.x >= f.x - 10 / z && w.x <= f.x + f.w + 10 / z && w.y >= f.y - 26 / z && w.y <= f.y + f.h + 10 / z);
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
	const dirOf = (dx: number, dy: number, axis: "x" | "y"): Dir => (axis === "x" ? (dx < 0 ? "r" : "l") : dy < 0 ? "d" : "u");

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
			const z = clamp((s.cam0.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, s.dist0), 0.01, 2);
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
		if (s.axis === null) return;
		if (mode === "page") {
			// the page scrolls like a page, rubber past its ends
			if (s.axis === "x") cam.x.set(s.cam0.x + dx * 0.2);
			else {
				const [lo, hi] = pageRange();
				const want = s.cam0.y + dy;
				cam.y.set(want > hi ? hi + (want - hi) * 0.3 : want < lo ? lo + (want - lo) * 0.3 : want);
			}
			return;
		}
		const long = s.axis === "y" ? frameRange() : null;
		if (long !== null) {
			const [lo, hi] = long;
			const want = s.cam0.y + dy;
			cam.y.set(want > hi ? hi + (want - hi) * 0.4 : want < lo ? lo + (want - lo) * 0.4 : want);
			return;
		}
		const free = neighbor(page.frames, idx, dirOf(dx, dy, s.axis)) >= 0;
		if (s.axis === "x") cam.x.set(s.cam0.x + dx * (free ? 1 : 0.25));
		else cam.y.set(s.cam0.y + dy * (free ? 1 : 0.25));
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
		if (mode === "page" && s.axis === "y") {
			const [lo, hi] = pageRange();
			const recent = Math.abs(dy) / dt;
			animate(cam.y, cam.y.get(), {
				type: "inertia",
				velocity: recent > 0.05 ? (dy / dt) * 1000 : 0,
				min: lo,
				max: hi,
				power: 0.8,
				timeConstant: 320,
				bounceStiffness: 420,
				bounceDamping: 42,
			});
			return;
		}
		if (mode === "page") {
			cam.fly({ ...cam.get(), x: s.cam0.x });
			return;
		}
		const long = s.axis === "y" ? frameRange() : null;
		if (long !== null) {
			// pulled well past either end, the long frame hands over to the next one that way
			const [lo, hi] = long;
			const y = cam.y.get();
			const over = y > hi + 70 ? "u" : y < lo - 70 ? "d" : null;
			const n = over === null ? -1 : neighbor(page.frames, idx, over);
			if (n >= 0) {
				focus(n);
				return;
			}
			animate(cam.y, y, { type: "inertia", velocity: (dy / dt) * 1000, min: lo, max: hi, power: 0.8, timeConstant: 320, bounceStiffness: 420, bounceDamping: 42 });
			return;
		}
		const d = s.axis === "x" ? dx : dy;
		const v = d / dt;
		if (mode === "frame" && (Math.abs(d) > 56 || Math.abs(v) > 0.45)) {
			const n = neighbor(page.frames, idx, dirOf(dx, dy, s.axis));
			if (n >= 0) {
				focus(n);
				return;
			}
		}
		cam.fly(restFor(page, idx, mode));
	};

	const cancel = (event: React.PointerEvent<HTMLDivElement>) => {
		pts.current.delete(event.pointerId);
		if (pts.current.size === 0) {
			g.current = null;
			cam.fly(restFor(page, idx, mode));
		}
	};

	/* ---------- scrubbing the map ---------- */

	const [scrub, setScrub] = useState<{ x: number; y: number } | null>(null);

	const current = page.frames[idx] ?? page.frames[0]!;
	const fresh = project.recent.some((r) => r.page === page.name && r.name === current.name);
	const latest = project.recent[0];

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
				cursors={project.id === "tidemark" && page.name === "app" && p.play === null ? <Cursors cam={cam} small /> : null}
			/>
			<div className="absolute inset-0 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} />

			<AnimatePresence initial={false}>
				{nav || scrub !== null ? (
					<motion.div
						key="scrim"
						className="absolute inset-0 z-20 bg-black/45"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={GLIDE}
						onClick={() => setNav(false)}
					/>
				) : null}
			</AnimatePresence>

			<motion.div
				className={cn("absolute inset-x-2.5 z-30 mx-auto flex max-w-[480px] flex-col items-stretch gap-2", land && "pointer-events-none")}
				style={{ bottom: GAP + screen.chin }}
				animate={{ y: land ? 140 : 0, opacity: land ? 0 : 1 }}
				transition={GLIDE}
			>
				<AnimatePresence>
					{scrub !== null ? <BigMap key="big" page={page} idx={idx} at={scrub} /> : null}
					{hint && !nav && scrub === null ? (
						<motion.div
							key="hint"
							className="pointer-events-none self-center rounded-sm border border-border-raised bg-surface px-2.5 py-1.5 text-muted type-detail"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 4 }}
							transition={SPRING}
						>
							swipe moves · tap plays · drag the map
						</motion.div>
					) : null}
					{toast && latest !== undefined && !nav && scrub === null && p.play === null ? (
						<motion.button
							key="toast"
							type="button"
							className="flex h-10 max-w-full cursor-pointer items-center gap-2 self-center rounded-md border border-border-raised bg-surface pr-1.5 pl-2 text-text active:scale-[0.97] type-detail"
							initial={{ opacity: 0, y: 10, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 6 }}
							transition={SPRING}
							onClick={() => {
								setToast(false);
								openFrame(latest.page, latest.name);
							}}
						>
							<Face id={latest.who} size={18} />
							<span className="min-w-0 truncate">
								{latest.who} saved {latest.name}
							</span>
							<span className="shrink-0 rounded-xs bg-thread/15 px-1.5 py-0.5 text-thread">show</span>
						</motion.button>
					) : null}
				</AnimatePresence>

				<motion.div className="overflow-hidden rounded-lg border border-border-raised bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
					<AnimatePresence initial={false}>
						{nav ? (
							<motion.div key="nav" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={GLIDE} className="overflow-hidden">
								<Navigator
									project={project}
									page={page}
									here={here}
									onPage={(n) => {
										setNav(false);
										window.setTimeout(() => toPage(n, { idx: 0, mode: "page" }), 140);
									}}
									onFrame={(pg, name) => {
										setNav(false);
										window.setTimeout(() => openFrame(pg, name), 140);
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
								setNav((r) => !r);
							}}
							className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 pr-2 pl-2.5 text-left"
						>
							<Mark name={project.name} size={30} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-muted type-detail">
									{project.name} · {shortPath(page.name)}
								</span>
								<span className="flex min-w-0 items-center gap-1.5 type-value">
									<AnimatePresence mode="popLayout" initial={false}>
										<motion.span
											key={`${page.name}/${mode === "page" ? "" : current.name}`}
											className="truncate text-text"
											initial={{ opacity: 0, y: 6 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -6 }}
											transition={SPRING}
										>
											{mode === "page" ? `${page.frames.length} frames` : current.name}
										</motion.span>
									</AnimatePresence>
									{fresh && mode === "frame" ? <UnseenMark mark="changed" /> : null}
								</span>
							</span>
							<span className={cn("ml-auto flex shrink-0 text-muted transition-transform duration-200", nav ? "" : "rotate-180")}>
								<ChevronIcon open className="h-2.5 w-2.5" />
							</span>
						</button>
						<span className="h-7 w-px bg-border-raised" />
						<MiniMap
							page={page}
							idx={idx}
							mode={mode}
							onToggle={() => focus(idx, mode === "frame" ? "page" : "frame")}
							onScrub={(at, i) => {
								setScrub(at);
								if (i !== live.current.idx) {
									haptic();
									setIdx(i);
									setMode("frame");
									cam.fly(restFor(page, i, "frame"));
								}
							}}
							onScrubEnd={() => setScrub(null)}
						/>
						<span className="pr-2.5 pl-0.5">
							<Faces ids={[...new Set(here.map((h) => h.id))]} size={24} />
						</span>
					</div>
				</motion.div>
			</motion.div>
		</PhoneShell>
	);
}

/* ---------- the map in the bar, and the big one a drag opens ---------- */

const MAP = { w: 40, h: 40 };
const bigH = () => (typeof window === "undefined" ? 360 : Math.min(window.innerHeight * 0.56, 480));

function layout(frames: Spec[], w: number, h: number) {
	const b = bounds(frames);
	const s = Math.min(w / b.w, h / b.h);
	const ox = (w - b.w * s) / 2;
	const oy = (h - b.h * s) / 2;
	return { s, box: { left: ox, top: oy, width: b.w * s, height: b.h * s }, place: (f: Spec) => ({ left: ox + (f.x - b.x) * s, top: oy + (f.y - b.y) * s, width: Math.max(2, f.w * s), height: Math.max(2, f.h * s) }), toWorld: (px: number, py: number) => ({ x: b.x + (px - ox) / s, y: b.y + (py - oy) / s }) };
}

/**
 * This page's real layout, small. Tap shows the whole page and back. Drag and
 * it opens big above the bar and the thumb moves a cursor over it like a
 * trackpad, the camera landing on each frame it crosses.
 */
function MiniMap({
	page,
	idx,
	mode,
	onToggle,
	onScrub,
	onScrubEnd,
}: {
	page: Page;
	idx: number;
	mode: Mode;
	onToggle: () => void;
	onScrub: (at: { x: number; y: number }, i: number) => void;
	onScrubEnd: () => void;
}) {
	const small = layout(page.frames, MAP.w, MAP.h);
	const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);
	const big = (w: number) => layout(page.frames, w, bigH());
	const width = () => (typeof window === "undefined" ? 380 : window.innerWidth - 20 - 24);

	const pick = (pt: { x: number; y: number }, w: number) => {
		const l = big(w);
		const world = l.toWorld(pt.x, pt.y);
		let best = 0;
		let d = Number.POSITIVE_INFINITY;
		page.frames.forEach((f, i) => {
			const inside = world.x >= f.x && world.x <= f.x + f.w && world.y >= f.y && world.y <= f.y + f.h;
			const dd = inside ? -1 : Math.hypot(Math.max(f.x - world.x, 0, world.x - f.x - f.w), Math.max(f.y - world.y, 0, world.y - f.y - f.h));
			if (dd < d) {
				d = dd;
				best = i;
			}
		});
		return best;
	};

	return (
		<button
			type="button"
			aria-label={mode === "frame" ? "Show the whole page" : "Back to the frame"}
			className="relative mx-2 shrink-0 cursor-pointer touch-none rounded-sm active:bg-raised"
			style={{ width: MAP.w + 8, height: MAP.h + 8 }}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				const w = width();
				const f = page.frames[idx] ?? page.frames[0]!;
				const r = big(w).place(f);
				drag.current = { x: event.clientX, y: event.clientY, from: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, moved: false };
			}}
			onPointerMove={(event) => {
				const d = drag.current;
				if (d === null) return;
				const dx = event.clientX - d.x;
				const dy = event.clientY - d.y;
				if (!d.moved && Math.hypot(dx, dy) < 6) return;
				d.moved = true;
				const w = width();
				const box = big(w).box;
				const at = { x: clamp(d.from.x + dx * 1.3, box.left, box.left + box.width), y: clamp(d.from.y + dy * 1.3, box.top, box.top + box.height) };
				onScrub(at, pick(at, w));
			}}
			onPointerUp={() => {
				const d = drag.current;
				drag.current = null;
				if (d?.moved) onScrubEnd();
				else onToggle();
			}}
			onPointerCancel={() => {
				drag.current = null;
				onScrubEnd();
			}}
		>
			<span className="absolute" style={{ left: 4, top: 4, width: MAP.w, height: MAP.h }}>
				{page.frames.map((f, i) => {
					const on = mode === "frame" && i === idx;
					return (
						<span
							key={f.name}
							className={cn("absolute rounded-[1px]", on ? "z-10 bg-thread" : mode === "page" ? "bg-muted/70" : "bg-muted/35")}
							style={small.place(f)}
						/>
					);
				})}
			</span>
		</button>
	);
}

function BigMap({ page, idx, at }: { page: Page; idx: number; at: { x: number; y: number } }) {
	const w = typeof window === "undefined" ? 380 : window.innerWidth - 20 - 24;
	const l = layout(page.frames, w, bigH());
	const current = page.frames[idx];
	return (
		<motion.div
			className="pointer-events-none rounded-lg border border-border-raised bg-surface p-3"
			initial={{ opacity: 0, y: 12, scale: 0.97 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 8 }}
			transition={SPRING}
		>
			<div className="relative" style={{ width: w, height: bigH() }}>
				{page.frames.map((f, i) => {
					const thumb = "thumb" in f.content ? f.content.thumb : null;
					return (
						<span key={f.name} className={cn("absolute overflow-hidden rounded-[2px] bg-raised", i === idx ? "z-10 ring-2 ring-thread" : "opacity-60")} style={l.place(f)}>
							{thumb === null ? null : <img src={thumb} alt="" className="h-full w-full object-cover object-top" />}
						</span>
					);
				})}
				<span className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text bg-thread" style={{ left: at.x, top: at.y }} />
			</div>
			<div className="mt-2 truncate text-text type-value">{current?.name}</div>
		</motion.div>
	);
}

/* ---------- the navigator the bar opens ---------- */

interface Node {
	path: string;
	own: number;
	total: number;
	kids: string[];
}

function tree(pages: Page[]) {
	const nodes = new Map<string, Node>();
	const get = (path: string) => {
		let n = nodes.get(path);
		if (n === undefined) {
			n = { path, own: 0, total: 0, kids: [] };
			nodes.set(path, n);
			if (path !== "") {
				const up = get(parent(path));
				up.kids.push(path);
			}
		}
		return n;
	};
	get("");
	for (const p of pages) {
		get(p.name).own = p.frames.length;
		let at: string | null = p.name;
		while (at !== null) {
			get(at).total += p.frames.length;
			at = at === "" ? null : parent(at);
		}
	}
	for (const n of nodes.values()) n.kids.sort();
	return nodes;
}

function Navigator({
	project,
	page,
	here,
	onPage,
	onFrame,
}: {
	project: Project;
	page: Page;
	here: { id: string; page: string; name: string }[];
	onPage: (n: number) => void;
	onFrame: (page: string, name: string) => void;
}) {
	const nodes = useMemo(() => tree(project.pages), [project]);
	const [level, setLevel] = useState(parent(page.name));
	const [q, setQ] = useState("");
	const node = nodes.get(level) ?? nodes.get("")!;
	const open = (path: string) => {
		const n = project.pages.findIndex((x) => x.name === path);
		if (n >= 0) onPage(n);
	};
	const inside = (path: string, of: string) => path === of || path.startsWith(`${of}/`);
	const crumbs = level === "" ? [] : level.split("/");

	const query = q.trim().toLowerCase();
	const pageHits = query === "" ? [] : project.pages.filter((x) => x.name.toLowerCase().includes(query)).slice(0, 8);
	const frameHits =
		query === ""
			? []
			: project.pages
					.flatMap((x) => x.frames.filter((f) => f.name.toLowerCase().includes(query)).map((f) => ({ page: x.name, f })))
					.slice(0, 24);

	return (
		<div className="flex max-h-[62vh] flex-col border-border-raised border-b">
			<div className="flex shrink-0 items-center gap-2 border-border-raised border-b px-3 py-2.5">
				<span className="flex h-10 flex-1 items-center gap-2 rounded-md bg-bg px-3">
					<SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder={`find in ${project.name}`}
						className="h-full min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted type-value"
						style={{ fontSize: 16 }}
					/>
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-width:none]">
				{query !== "" ? (
					<>
						{pageHits.map((x) => (
							<Row key={x.name} onClick={() => open(x.name)} icon={<FolderIcon className="h-4 w-4 text-muted" />}>
								<span className="min-w-0 flex-1 truncate type-value">
									<span className="text-muted">{parent(x.name) === "" ? "" : `${parent(x.name)}/`}</span>
									<span className="text-text">{leaf(x.name)}</span>
								</span>
								<span className="text-muted type-detail">{x.frames.length}</span>
							</Row>
						))}
						{frameHits.map(({ page: pg, f }) => (
							<Row key={`${pg}/${f.name}`} onClick={() => onFrame(pg, f.name)} icon={<Thumb spec={f} />}>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-text type-value">{f.name}</span>
									<span className="truncate text-muted type-detail">{pg}</span>
								</span>
							</Row>
						))}
						{pageHits.length + frameHits.length === 0 ? <div className="px-4 py-3 text-muted type-detail">nothing matches {q}</div> : null}
					</>
				) : (
					<>
						<Section>recent</Section>
						{project.recent.map((r) => {
							const pg = project.pages.find((x) => x.name === r.page);
							const f = pg?.frames.find((x) => x.name === r.name);
							return (
								<Row key={`${r.page}/${r.name}`} onClick={() => onFrame(r.page, r.name)} icon={f === undefined ? <FrameIcon className="h-4 w-4 text-muted" /> : <Thumb spec={f} />}>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="flex items-center gap-1.5 text-text type-value">
											<span className="truncate">{r.name}</span>
											<UnseenMark mark="changed" />
										</span>
										<span className="truncate text-muted type-detail">
											{r.who} · {ago(r.at)} · {shortPath(r.page)}
										</span>
									</span>
									<Face id={r.who} size={20} />
								</Row>
							);
						})}
						<Section>
							<span className="flex min-w-0 flex-wrap items-center gap-x-1">
								<button type="button" className="cursor-pointer text-muted active:text-text" onClick={() => setLevel("")}>
									{project.name}
								</button>
								{crumbs.map((c, i) => {
									const to = crumbs.slice(0, i + 1).join("/");
									return (
										<span key={to} className="flex items-center gap-x-1">
											<span className="text-border-raised">/</span>
											<button type="button" className={cn("cursor-pointer active:text-text", i === crumbs.length - 1 ? "text-text" : "text-muted")} onClick={() => setLevel(to)}>
												{c}
											</button>
										</span>
									);
								})}
							</span>
						</Section>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.div key={level} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={SPRING}>
								{node.own > 0 && level !== "" ? (
									<Row on={page.name === level} onClick={() => open(level)} icon={<FrameIcon className="h-4 w-4 text-muted" />}>
										<span className="min-w-0 flex-1 truncate text-text type-value">{leaf(level)}</span>
										<span className="text-muted type-detail">{node.own} frames here</span>
									</Row>
								) : null}
								{node.kids.map((k) => {
									const kid = nodes.get(k)!;
									const people = [...new Set(here.filter((h) => inside(h.page, k)).map((h) => h.id))];
									const mine = inside(page.name, k);
									return (
										<div key={k} className="flex items-stretch">
											<Row
												on={page.name === k}
												onClick={() => (kid.own > 0 ? open(k) : setLevel(k))}
												icon={<FolderIcon className={cn("h-4 w-4", mine ? "text-thread" : "text-muted")} />}
											>
												<span className={cn("min-w-0 flex-1 truncate type-value", mine ? "text-text" : "text-muted")}>{leaf(k)}</span>
												{people.length > 0 ? <Faces ids={people} size={18} /> : null}
												<span className="text-muted type-detail">{kid.total}</span>
											</Row>
											{kid.kids.length > 0 ? (
												<button
													type="button"
													aria-label={`Inside ${leaf(k)}`}
													onClick={() => setLevel(k)}
													className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-border border-l text-muted active:bg-raised"
												>
													<ChevronIcon className="h-2.5 w-2.5" />
												</button>
											) : (
												<span className="w-11 shrink-0" />
											)}
										</div>
									);
								})}
							</motion.div>
						</AnimatePresence>
					</>
				)}
			</div>
		</div>
	);
}

function Section({ children }: { children: React.ReactNode }) {
	return <div className="px-4 pt-3 pb-1 text-muted type-detail">{children}</div>;
}

function Row({ children, icon, on = false, onClick }: { children: React.ReactNode; icon: React.ReactNode; on?: boolean; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className={cn("relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 pr-3 pl-4 text-left active:bg-raised", on && "bg-raised/60")}>
			{on ? <span className="absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="flex w-9 shrink-0 justify-center">{icon}</span>
			{children}
		</button>
	);
}

function Thumb({ spec }: { spec: Spec }) {
	const wide = spec.w > spec.h;
	const w = wide ? 36 : 18;
	const h = wide ? (36 * spec.h) / spec.w : 36;
	const thumb = "thumb" in spec.content ? spec.content.thumb : null;
	return (
		<span className="block overflow-hidden rounded-[3px] bg-raised" style={{ width: w, height: Math.min(h, 36) }}>
			{thumb === null ? null : <img src={thumb} alt="" className="h-full w-full object-cover object-top" />}
		</span>
	);
}

/* ---------- entry ---------- */

function Loaded({ state }: { state: ReachState }) {
	const project = useProject();
	if (project === null) return <PhoneShell rootRef={{ current: null }}>{null}</PhoneShell>;
	return <Reach state={state} project={project} />;
}

function OnDevice({ state }: { state: ReachState }) {
	const screen = useDevice();
	return (
		<ScreenContext.Provider value={screen}>
			<Loaded state={state} />
		</ScreenContext.Provider>
	);
}

export function PhoneReach({ state, device = false }: { state: ReachState; device?: boolean }) {
	if (device) return <OnDevice state={state} />;
	return <Loaded state={state} />;
}
