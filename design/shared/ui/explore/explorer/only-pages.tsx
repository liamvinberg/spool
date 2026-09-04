import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { tileLayout } from "shared/ui/explore/explorer/page-objects";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { FolderIcon } from "shared/ui/spool/icons";
import { type RealPage, REAL_PAGES, TIDY_PAGES } from "shared/ui/spool/real-pages";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A page that holds only pages.
 *
 * #265 put a page on the field as an object a hand can place. On a page with
 * frames that object has neighbours to be placed against. On a page with none,
 * the objects are the whole field, and today the arrival camera does not know
 * they exist: `zoomFit` reads frames only, so you land at the origin at 100%
 * and the row of pages sits somewhere off to the right. The rail reads full,
 * the field reads empty, and finding the objects is a pan.
 *
 * Six takes, one per frame, over spool's own twelve pages. `today` is the
 * shipped picture. `fit` teaches the camera about objects and changes nothing
 * else. `marks` keeps everything where it is and names what is out of view on
 * the viewport's edge. `shelf` takes the coordinate away while the page has no
 * frames. `lens` shows the subtree instead of the objects. `plate` leaves world
 * space empty and pins an index to the glass.
 */

export type OnlyPagesTake = "today" | "fit" | "marks" | "shelf" | "lens" | "plate";

interface Placed {
	readonly page: RealPage;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

interface Camera {
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** the daemon's gutter: the first thing on a field lands here */
const GUTTER = 80;
/** the space a label rides above its object, in world units at fit zoom */
const LABEL_ROOM = 40;

function boundsOf(items: readonly Box[]): Box {
	const minX = Math.min(...items.map((i) => i.x));
	const minY = Math.min(...items.map((i) => i.y));
	const maxX = Math.max(...items.map((i) => i.x + i.w));
	const maxY = Math.max(...items.map((i) => i.y + i.h));
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** the camera that shows everything with room to breathe, the way an arrival does */
function fitCamera(box: Box, view: { w: number; h: number }): Camera {
	const pad = 96;
	const k = Math.min((view.w - pad * 2) / box.w, (view.h - pad * 2) / (box.h + LABEL_ROOM), 1);
	return { x: box.x - (view.w / k - box.w) / 2, y: box.y - LABEL_ROOM / 2 - (view.h / k - box.h) / 2, k };
}

/** the camera that lands centred on one thing, zoom kept */
function centerOn(cam: Camera, box: Box, view: { w: number; h: number }): Camera {
	return { ...cam, x: box.x + box.w / 2 - view.w / cam.k / 2, y: box.y + box.h / 2 - view.h / cam.k / 2 };
}

/**
 * The daemon's own row: `besideField` puts each new page beside the last on the
 * field's top line, so a page nobody arranged is one long row from the gutter.
 */
function daemonRow(pages: readonly RealPage[]): readonly Placed[] {
	let x = GUTTER;
	return tileLayout(pages).map((item) => {
		const placed = { ...item, x, y: GUTTER };
		x += item.w + 140;
		return placed;
	});
}

/** A shelf: the same tiles, wrapped to a width the field chose, in rail order. */
function shelfRow(pages: readonly RealPage[]): readonly Placed[] {
	return tileLayout(pages).map((item) => ({ ...item, x: item.x + GUTTER, y: item.y + GUTTER }));
}

/**
 * The lens: each page's canvas at a readable width, under its name, three
 * sections to a row. The gap leaves room for a label that does not scale.
 */
const LENS_W = 1600;
const LENS_H = 1000;
const LENS_GAP = 260;
const LENS_ACROSS = 3;
function lensRows(pages: readonly RealPage[]): readonly Placed[] {
	const out: Placed[] = [];
	let y = GUTTER;
	let rowH = 0;
	pages.forEach((page, index) => {
		const col = index % LENS_ACROSS;
		if (col === 0 && index > 0) {
			y += rowH + LENS_GAP;
			rowH = 0;
		}
		const scale = Math.min(LENS_W / page.cw, LENS_H / page.ch);
		const w = Math.round(page.cw * scale);
		const h = Math.round(page.ch * scale);
		out.push({ page, x: GUTTER + col * (LENS_W + LENS_GAP), y, w, h });
		rowH = Math.max(rowH, h);
	});
	return out;
}

export function OnlyPagesScreen({ take, argues }: { take: OnlyPagesTake; argues: string }) {
	return (
		<SpoolShell activeTab="spool" tabs={["spool", "kaffe"]} zoom={take === "today" || take === "marks" ? "70%" : "fit"}>
			<CanvasChrome
				pages={REAL_PAGES.map((page) => ({ name: page.page, frames: page.names }))}
				railWidth={0}
				tool="select"
			>
				<Field take={take} argues={argues} />
			</CanvasChrome>
		</SpoolShell>
	);
}

function Field({ take, argues }: { take: OnlyPagesTake; argues: string }) {
	const host = useRef<HTMLDivElement>(null);
	const [items, setItems] = useState<readonly Placed[]>(() =>
		take === "shelf" ? shelfRow(TIDY_PAGES) : take === "lens" ? lensRows(TIDY_PAGES) : daemonRow(TIDY_PAGES),
	);
	// the shipped arrival: the camera this page kept from last session, which
	// was a pan that ended somewhere left of the row. Nothing on the field
	// moves the camera on arrival, so the field is blank and the rail is full
	const [cam, setCam] = useState<Camera>({ x: -3200, y: -200, k: 0.7 });
	const [picked, setPicked] = useState<string | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const [entering, setEntering] = useState<string | null>(null);
	const [view, setView] = useState({ w: 1148, h: 856 });
	const fitted = useRef(false);
	const placeable = take === "today" || take === "fit" || take === "marks";

	useLayoutEffect(() => {
		const el = host.current;
		if (el === null) return;
		const size = { w: el.clientWidth, h: el.clientHeight };
		setView(size);
		if (fitted.current) return;
		fitted.current = true;
		// `today` and `marks` land where the shipped fit puts you; the rest fit
		// what is actually on the field
		if (take === "today" || take === "marks" || take === "plate") return;
		setCam(fitCamera(boundsOf(items), size));
	}, [items, take]);

	// the shipped convention (`canvas.tsx`): wheel pans, ⌘/ctrl + wheel zooms
	useEffect(() => {
		const el = host.current;
		if (el === null || take === "plate") return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				const rect = el.getBoundingClientRect();
				const px = event.clientX - rect.left;
				const py = event.clientY - rect.top;
				setCam((was) => {
					const k = Math.min(2, Math.max(0.04, was.k * (1 - event.deltaY / 400)));
					return { k, x: was.x + px / was.k - px / k, y: was.y + py / was.k - py / k };
				});
				return;
			}
			setCam((was) => ({ ...was, x: was.x + event.deltaX / was.k, y: was.y + event.deltaY / was.k }));
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [take]);

	const camRef = useRef(cam);
	camRef.current = cam;
	const panFrom = useRef<{ x: number; y: number; cam: Camera } | null>(null);
	const dragFrom = useRef<{ x: number; y: number; at: Placed } | null>(null);
	const animation = useRef(0);

	const animateTo = useCallback((to: Camera, ms = 260) => {
		const from = camRef.current;
		cancelAnimationFrame(animation.current);
		const t0 = performance.now();
		const step = (t: number) => {
			const p = Math.min(1, (t - t0) / ms);
			const e = 1 - (1 - p) ** 3;
			setCam({
				x: from.x + (to.x - from.x) * e,
				y: from.y + (to.y - from.y) * e,
				k: from.k + (to.k - from.k) * e,
			});
			if (p < 1) animation.current = requestAnimationFrame(step);
		};
		animation.current = requestAnimationFrame(step);
	}, []);

	const onFieldDown = useCallback(
		(event: React.PointerEvent) => {
			setPicked(null);
			panFrom.current = { x: event.clientX, y: event.clientY, cam };
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[cam],
	);

	const onPageDown = useCallback(
		(event: React.PointerEvent, at: Placed) => {
			event.stopPropagation();
			setPicked(at.page.page);
			if (!placeable) return;
			setDragging(at.page.page);
			dragFrom.current = { x: event.clientX, y: event.clientY, at };
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[placeable],
	);

	const onMove = useCallback((event: React.PointerEvent) => {
		const drag = dragFrom.current;
		if (drag !== null) {
			const dx = (event.clientX - drag.x) / camRef.current.k;
			const dy = (event.clientY - drag.y) / camRef.current.k;
			setItems((was) =>
				was.map((item) =>
					item.page.page === drag.at.page.page ? { ...item, x: drag.at.x + dx, y: drag.at.y + dy } : item,
				),
			);
			return;
		}
		const pan = panFrom.current;
		if (pan === null) return;
		setCam({
			...pan.cam,
			x: pan.cam.x - (event.clientX - pan.x) / pan.cam.k,
			y: pan.cam.y - (event.clientY - pan.y) / pan.cam.k,
		});
	}, []);

	const onUp = useCallback(() => {
		panFrom.current = null;
		dragFrom.current = null;
		setDragging(null);
	}, []);

	// entering is a page switch in the shipped canvas; here it is the word
	const enter = useCallback((page: string) => {
		setEntering(page);
		window.setTimeout(() => setEntering(null), 1200);
	}, []);

	const held = items.find((item) => item.page.page === picked) ?? null;

	// what the glass shows of the world, in world units
	const window_: Box = { x: cam.x, y: cam.y, w: view.w / cam.k, h: view.h / cam.k };
	const offGlass = items.filter(
		(item) =>
			item.x + item.w < window_.x ||
			item.x > window_.x + window_.w ||
			item.y + item.h < window_.y ||
			item.y > window_.y + window_.h,
	);

	return (
		<div
			ref={host}
			className={cn("absolute inset-0 overflow-hidden", dragging === null ? "cursor-default" : "cursor-grabbing")}
			onPointerDown={onFieldDown}
			onPointerMove={onMove}
			onPointerUp={onUp}
			onPointerCancel={onUp}
		>
			{take !== "plate" ? (
				<div
					className="absolute top-0 left-0 origin-top-left"
					style={{ transform: `scale(${cam.k}) translate(${-cam.x}px, ${-cam.y}px)` }}
				>
					{take === "lens"
						? items.map((item) => (
								<LensSection
									key={item.page.page}
									at={item}
									k={cam.k}
									lit={picked === item.page.page}
									onDown={onPageDown}
									onEnter={enter}
								/>
							))
						: items.map((item) => (
								<PageObject
									key={item.page.page}
									at={item}
									k={cam.k}
									placeable={placeable}
									lit={picked === item.page.page}
									onDown={onPageDown}
									onEnter={enter}
								/>
							))}
				</div>
			) : null}

			{take === "marks" ? (
				<EdgeMarks
					off={offGlass}
					window={window_}
					view={view}
					onGo={(item) => animateTo(centerOn(camRef.current, item, view))}
				/>
			) : null}

			{take === "plate" ? <Plate pages={TIDY_PAGES} picked={picked} onPick={setPicked} onEnter={enter} /> : null}

			<div className="pointer-events-none absolute top-5 left-6 flex items-baseline gap-2 font-mono text-2xs text-muted/55 leading-3">
				<span className="text-muted">explore</span>
				<span>0 frames</span>
				<span className="text-muted/40">· {items.length} pages</span>
			</div>

			<div className="pointer-events-none absolute right-6 bottom-6 flex max-w-[38ch] flex-col items-end gap-1.5 text-right">
				<p className="text-base text-muted leading-base">{argues}</p>
				<p className="font-mono text-2xs text-muted/40 leading-3">
					{entering !== null
						? `entering ${entering}`
						: held !== null
							? `${held.page.page} · ${held.page.count} frames`
							: take === "plate"
								? "double-click enters"
								: "⌘ + scroll zooms · drag the field to pan"}
				</p>
			</div>
		</div>
	);
}

/* ── the object, as shipped ─────────────────────────────────────────── */

function PageObject({
	at,
	k,
	placeable,
	lit,
	onDown,
	onEnter,
}: {
	at: Placed;
	k: number;
	placeable: boolean;
	lit: boolean;
	onDown: (event: React.PointerEvent, at: Placed) => void;
	onEnter: (page: string) => void;
}) {
	// the label rides at a constant size the way a frame's does
	const label = 13 / k;
	return (
		<div
			className="absolute"
			style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
			onPointerDown={(event) => onDown(event, at)}
			onDoubleClick={() => onEnter(at.page.page)}
		>
			<div
				className="absolute right-0 bottom-full left-0 flex items-center gap-[0.5em] whitespace-nowrap pb-[0.35em] font-mono leading-none"
				style={{ fontSize: label }}
			>
				<FolderIcon className={cn("h-[1em] w-[1em] shrink-0", lit ? "text-thread" : "text-muted")} />
				<span className={cn("min-w-0 truncate", lit ? "text-thread" : "text-muted")}>{at.page.page}</span>
				<span className="ml-auto shrink-0 pl-[1em] text-muted/45">{at.page.count}</span>
			</div>

			<img
				src={at.page.cover}
				alt={`${at.page.page}: ${at.page.count} frames`}
				draggable={false}
				className={cn(
					"block h-full w-full rounded-[2px] border bg-canvas object-cover",
					lit ? "border-thread" : "border-border-raised",
					placeable ? "cursor-grab" : "cursor-default",
				)}
			/>

			{lit ? (
				<span
					className="pointer-events-none absolute rounded-[3px] border-thread"
					style={{ inset: -3 / k, borderWidth: 1.5 / k }}
				/>
			) : null}
		</div>
	);
}

/* ── marks: what is out of view, named on the edge ───────────────────── */

/**
 * Every object wholly outside the glass gets a chip on the edge nearest it,
 * at the height (or width) it sits at, so the chip's place says where the
 * thing is as much as its name does. Pressing one flies there at this zoom.
 *
 * A stack past six says how many more. Twelve chips down one edge is the
 * honest picture of a row you landed at the wrong end of, and that honesty is
 * also the take's cost: the edge becomes a second rail.
 */
const MARK_CAP = 6;

function EdgeMarks({
	off,
	window,
	view,
	onGo,
}: {
	off: readonly Placed[];
	window: Box;
	view: { w: number; h: number };
	onGo: (item: Placed) => void;
}) {
	const k = view.w / window.w;
	type Side = "left" | "right" | "top" | "bottom";
	const sideOf = (item: Placed): Side => {
		const cx = item.x + item.w / 2 - (window.x + window.w / 2);
		const cy = item.y + item.h / 2 - (window.y + window.h / 2);
		// measured in glass halves, so a wide glass does not read everything as beside it
		const nx = cx / (window.w / 2);
		const ny = cy / (window.h / 2);
		return Math.abs(nx) >= Math.abs(ny) ? (nx < 0 ? "left" : "right") : ny < 0 ? "top" : "bottom";
	};
	const sides: Record<Side, Placed[]> = { left: [], right: [], top: [], bottom: [] };
	for (const item of off) sides[sideOf(item)].push(item);

	return (
		<>
			{(Object.keys(sides) as Side[]).map((side) => {
				const stack = sides[side];
				if (stack.length === 0) return null;
				const shown = stack.slice(0, MARK_CAP);
				const more = stack.length - shown.length;
				const vertical = side === "left" || side === "right";
				return (
					<div
						key={side}
						className={cn(
							"pointer-events-none absolute flex gap-1.5",
							vertical ? "flex-col" : "flex-row",
							side === "left" && "top-14 left-4",
							side === "right" && "top-14 right-4 items-end",
							side === "top" && "top-14 left-6",
							side === "bottom" && "bottom-16 left-6",
						)}
					>
						{shown.map((item) => (
							<button
								key={item.page.page}
								type="button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onGo(item)}
								className={cn(
									"pointer-events-auto flex h-6 items-center gap-1.5 rounded-sm border border-border bg-bg px-2 font-mono text-2xs text-muted leading-3 transition-colors hover:border-border-raised hover:text-text",
								)}
							>
								{side === "left" ? <Arrow dir="left" /> : null}
								{side === "top" ? <Arrow dir="up" /> : null}
								<FolderIcon className="h-3 w-3 shrink-0" />
								<span>{item.page.page}</span>
								<span className="text-muted/45">{item.page.count}</span>
								{side === "right" ? <Arrow dir="right" /> : null}
								{side === "bottom" ? <Arrow dir="down" /> : null}
							</button>
						))}
						{more > 0 ? (
							<span className="px-2 font-mono text-2xs text-muted/45 leading-3">
								{more} more {vertical ? (side === "left" ? "←" : "→") : side === "top" ? "↑" : "↓"}
							</span>
						) : null}
						{/* the zoom readout the chips are true at */}
						<span className="sr-only">{Math.round(k * 100)}%</span>
					</div>
				);
			})}
		</>
	);
}

function Arrow({ dir }: { dir: "left" | "right" | "up" | "down" }) {
	const rotate = { left: 180, right: 0, up: -90, down: 90 }[dir];
	return (
		<svg viewBox="0 0 10 10" className="h-2 w-2 shrink-0" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true">
			<path d="M2 5h6M5.5 2.5 8 5l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

/* ── lens: the subtree, under each page's name ───────────────────────── */

/**
 * Standing on a page of pages you see what is below: each page's canvas at a
 * readable width, under its name and a hairline, dimmed until the hand is over
 * it. Nothing here is placeable, because nothing here is on this page.
 */
function LensSection({
	at,
	k,
	lit,
	onDown,
	onEnter,
}: {
	at: Placed;
	k: number;
	lit: boolean;
	onDown: (event: React.PointerEvent, at: Placed) => void;
	onEnter: (page: string) => void;
}) {
	const label = 13 / k;
	return (
		<div
			className="group absolute"
			style={{ left: at.x, top: at.y, width: Math.max(at.w, LENS_W), height: at.h }}
			onPointerDown={(event) => onDown(event, at)}
			onDoubleClick={() => onEnter(at.page.page)}
		>
			<div
				className="absolute right-0 bottom-full left-0 flex items-center gap-[0.6em] whitespace-nowrap pb-[0.6em] font-mono leading-none"
				style={{ fontSize: label }}
			>
				<FolderIcon className={cn("h-[1em] w-[1em] shrink-0", lit ? "text-thread" : "text-muted")} />
				<span className={cn("shrink-0", lit ? "text-thread" : "text-muted group-hover:text-text")}>{at.page.page}</span>
				<span className="shrink-0 text-muted/45">{at.page.count}</span>
				<span className="h-px min-w-0 flex-1 bg-border" style={{ height: 1 / k }} />
			</div>
			<img
				src={at.page.cover}
				alt={`${at.page.page}: ${at.page.count} frames`}
				draggable={false}
				className={cn(
					"block rounded-[2px] border bg-canvas object-cover opacity-70 transition-opacity group-hover:opacity-100",
					lit ? "border-thread opacity-100" : "border-border",
				)}
				style={{ width: at.w, height: at.h }}
			/>
		</div>
	);
}

/* ── plate: an index on the glass ────────────────────────────────────── */

/**
 * World space stays empty. What the page holds is listed on the glass, where
 * a camera cannot lose it, in the rail's order and register: folder, name,
 * count, and the page's canvas as a strip so the list is not the rail again.
 */
function Plate({
	pages,
	picked,
	onPick,
	onEnter,
}: {
	pages: readonly RealPage[];
	picked: string | null;
	onPick: (page: string) => void;
	onEnter: (page: string) => void;
}) {
	return (
		<div className="absolute inset-0 flex items-center justify-center pb-10">
			<div
				className="flex w-[560px] flex-col rounded-md border border-border bg-bg"
				onPointerDown={(event) => event.stopPropagation()}
			>
				{pages.map((page, index) => {
					const lit = picked === page.page;
					return (
						<button
							key={page.page}
							type="button"
							onClick={() => onPick(page.page)}
							onDoubleClick={() => onEnter(page.page)}
							className={cn(
								"group flex h-12 items-center gap-3 px-3 text-left transition-colors hover:bg-surface",
								index > 0 && "border-border border-t",
							)}
						>
							<FolderIcon className={cn("h-3 w-3 shrink-0", lit ? "text-thread" : "text-muted")} />
							<span
								className={cn(
									"w-[14ch] shrink-0 truncate font-mono text-sm leading-4",
									lit ? "text-thread" : "text-muted group-hover:text-text",
								)}
							>
								{page.page}
							</span>
							<span className="w-[3ch] shrink-0 font-mono text-2xs text-muted/45 leading-3">{page.count}</span>
							<div className="h-7 min-w-0 flex-1 overflow-hidden rounded-[2px] border border-border bg-canvas">
								<img
									src={page.cover}
									alt=""
									draggable={false}
									className="h-full w-full object-cover object-left-top opacity-70 transition-opacity group-hover:opacity-100"
								/>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
