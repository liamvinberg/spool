import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool-canvas-chrome";
import { FolderIcon } from "shared/ui/spool-icons";
import { type RealPage, REAL_PAGES, TIDY_PAGES, fitCover } from "shared/ui/spool-real-pages";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * A page drawn as an object on the canvas, over spool's own design folder.
 *
 * The skeleton takes asked whether a page belongs on the field. This one asks
 * what that costs once the field is the real one: a camera, world coordinates,
 * a hit target, and twelve real pages whose shapes are nothing like each other.
 * A page's cover is its own canvas, so `booting` arrives as a 23:1 ribbon and
 * `variants` as a block, and no card shape survives contact with both.
 *
 * Three answers, one per frame. `placed` gives a page a coordinate a hand can
 * move and shows its canvas at its own shape, which is where the shape problem
 * is visible. `tile` keeps the coordinate and bands the shape. `flow` drops the
 * coordinate: the field lays them out and the rail's order is the arrangement.
 *
 * Nothing here resizes. A frame's size is authored and a page's is derived, so
 * a handle on a page corner would be a scale control on a picture and mean
 * nothing about the project — the selection is a ring and no more.
 */

export type PageMode = "placed" | "flow" | "tile";

interface Placed {
	readonly page: RealPage;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** the box a page's cover is fitted into when a hand places it */
const PLACED_W = 900;
const PLACED_H = 620;
const PLACED_GUTTER = 140;
const PLACED_ROW = 3400;

/** the cell a flowed page sits in, centred, four to a row */
const CELL_W = 460;
const CELL_H = 300;
const CELL_GUTTER = 64;
const PER_ROW = 4;

/**
 * Shelf packing, which is what a hand's arrangement looks like before a hand
 * touches it. Every page is fitted into the same box and keeps its own shape,
 * so a row's height is the tallest thing in it.
 */
export function placedLayout(pages: readonly RealPage[]): readonly Placed[] {
	const out: Placed[] = [];
	let x = 0;
	let y = 0;
	let rowH = 0;
	for (const page of pages) {
		const { w, h } = fitCover(page, PLACED_W, PLACED_H);
		if (x > 0 && x + w > PLACED_ROW) {
			x = 0;
			y += rowH + PLACED_GUTTER;
			rowH = 0;
		}
		out.push({ page, x, y, w, h });
		x += w + PLACED_GUTTER;
		rowH = Math.max(rowH, h);
	}
	return out;
}

/**
 * The same packing with the two things true aspect gets wrong put right.
 *
 * A page's canvas aspect is an accident of how somebody arranged it, and at
 * 23:1 `booting` is a hairline nobody can read. So the box is clamped to a band
 * and the cover sits inside it whole rather than cropped — a long page reads as
 * a ribbon in a wide tile, which is the fact, at a size that survives.
 *
 * And the box grows with what the page holds, on a square root so 45 frames
 * reads as more work than 1 without swamping the field. Under true aspect
 * `directing`, one frame, drew larger than `agent`, twenty-seven.
 */
const BAND_LOW = 0.62;
const BAND_HIGH = 2.4;
const TILE_AREA = 150_000;
const TILE_MID = 8;
const TILE_ROW = 2600;

export function tileLayout(pages: readonly RealPage[]): readonly Placed[] {
	const out: Placed[] = [];
	let x = 0;
	let y = 0;
	let rowH = 0;
	for (const page of pages) {
		const aspect = Math.min(BAND_HIGH, Math.max(BAND_LOW, page.cw / page.ch));
		const area = TILE_AREA * Math.sqrt(page.count / TILE_MID);
		const w = Math.round(Math.sqrt(area * aspect));
		const h = Math.round(w / aspect);
		if (x > 0 && x + w > TILE_ROW) {
			x = 0;
			y += rowH + PLACED_GUTTER;
			rowH = 0;
		}
		out.push({ page, x, y, w, h });
		x += w + PLACED_GUTTER;
		rowH = Math.max(rowH, h);
	}
	return out;
}

/** A grid the field owns: one cell per page, the cover centred in its cell. */
export function flowLayout(pages: readonly RealPage[]): readonly Placed[] {
	return pages.map((page, index) => {
		const { w, h } = fitCover(page, CELL_W, CELL_H);
		const col = index % PER_ROW;
		const row = Math.floor(index / PER_ROW);
		const cellX = col * (CELL_W + CELL_GUTTER);
		const cellY = row * (CELL_H + CELL_GUTTER + 26);
		// top of the cell rather than the middle: the labels ride above the covers,
		// and a row of labels at four different heights reads as four rows
		return { page, x: cellX + (CELL_W - w) / 2, y: cellY, w, h };
	});
}

interface Camera {
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

function boundsOf(items: readonly Placed[]): { x: number; y: number; w: number; h: number } {
	const minX = Math.min(...items.map((i) => i.x));
	const minY = Math.min(...items.map((i) => i.y));
	const maxX = Math.max(...items.map((i) => i.x + i.w));
	const maxY = Math.max(...items.map((i) => i.y + i.h));
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** the camera that shows everything with room to breathe, the way an arrival does */
function fitCamera(items: readonly Placed[], view: { w: number; h: number }): Camera {
	const box = boundsOf(items);
	const pad = 80;
	const k = Math.min((view.w - pad * 2) / box.w, (view.h - pad * 2) / (box.h + 40), 1);
	return { x: box.x - (view.w / k - box.w) / 2, y: box.y - 34 - (view.h / k - box.h) / 2, k };
}

export function PageObjectsScreen({ mode, argues }: { mode: PageMode; argues: string }) {
	return (
		<SpoolShell activeTab="spool" tabs={["spool", "kaffe"]} zoom="fit">
			<CanvasChrome
				pages={REAL_PAGES.map((page) => ({ name: page.page, frames: page.names }))}
				railWidth={0}
				tool="select"
			>
				<Field mode={mode} argues={argues} />
			</CanvasChrome>
		</SpoolShell>
	);
}

function Field({ mode, argues }: { mode: PageMode; argues: string }) {
	const host = useRef<HTMLDivElement>(null);
	// the two banded takes read the folded covers; `placed` shows a page
	// canvas exactly as it stands
	const [items, setItems] = useState<readonly Placed[]>(() =>
		mode === "flow" ? flowLayout(TIDY_PAGES) : mode === "tile" ? tileLayout(TIDY_PAGES) : placedLayout(REAL_PAGES),
	);
	const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 0.25 });
	const [picked, setPicked] = useState<string | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const fitted = useRef(false);

	// the arrival camera, once the field has a size to fit against
	useLayoutEffect(() => {
		const el = host.current;
		if (el === null || fitted.current) return;
		fitted.current = true;
		setCam(fitCamera(items, { w: el.clientWidth, h: el.clientHeight }));
	}, [items]);

	// the shipped convention (`canvas.tsx`): wheel pans, ⌘/ctrl + wheel zooms
	useEffect(() => {
		const el = host.current;
		if (el === null) return;
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
	}, []);

	const camRef = useRef(cam);
	camRef.current = cam;
	const panFrom = useRef<{ x: number; y: number; cam: Camera } | null>(null);
	const dragFrom = useRef<{ x: number; y: number; at: Placed } | null>(null);

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
			if (mode === "flow") return;
			setDragging(at.page.page);
			dragFrom.current = { x: event.clientX, y: event.clientY, at };
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[mode],
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

	const held = items.find((item) => item.page.page === picked) ?? null;

	return (
		<div
			ref={host}
			className={cn("absolute inset-0 overflow-hidden", dragging === null ? "cursor-default" : "cursor-grabbing")}
			onPointerDown={onFieldDown}
			onPointerMove={onMove}
			onPointerUp={onUp}
			onPointerCancel={onUp}
		>
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ transform: `scale(${cam.k}) translate(${-cam.x}px, ${-cam.y}px)` }}
			>
				{items.map((item) => (
					<PageObject
						key={item.page.page}
						at={item}
						k={cam.k}
						mode={mode}
						lit={picked === item.page.page}
						onDown={onPageDown}
					/>
				))}
			</div>

			<div className="pointer-events-none absolute top-5 left-6 flex items-baseline gap-2 font-mono text-2xs text-muted/55 leading-3">
				<span className="text-muted">spool</span>
				<span>0 frames</span>
				<span className="text-muted/40">· 12 pages</span>
			</div>

			<div className="pointer-events-none absolute right-6 bottom-6 flex max-w-[38ch] flex-col items-end gap-1.5 text-right">
				<p className="text-base text-muted leading-base">{argues}</p>
				<p className="font-mono text-2xs text-muted/40 leading-3">
					{held === null ? "⌘ + scroll zooms · drag the field to pan" : `${held.page.page} · ${held.page.count} frames`}
				</p>
			</div>
		</div>
	);
}

function PageObject({
	at,
	k,
	mode,
	lit,
	onDown,
}: {
	at: Placed;
	k: number;
	mode: PageMode;
	lit: boolean;
	onDown: (event: React.PointerEvent, at: Placed) => void;
}) {
	// the label rides at a constant size the way a frame's does: it belongs to the
	// canvas rather than to the thing it names, so a zoom never shrinks it away
	const label = 13 / k;
	return (
		<div
			className="absolute"
			style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
			onPointerDown={(event) => onDown(event, at)}
		>
			<div
				// the name spills past a narrow page rather than truncating: a frame's
				// label can be cut because the picture under it still says which frame
				// it is, and a page's cover says no such thing
				className="absolute right-0 bottom-full left-0 flex items-center gap-[0.5em] whitespace-nowrap pb-[0.35em] font-mono leading-none"
				style={{ fontSize: label }}
			>
				<FolderIcon className="h-[1em] w-[1em] shrink-0" />
				<span className={cn("shrink-0", lit ? "text-thread" : "text-muted")}>{at.page.page}</span>
				<span className="ml-auto shrink-0 pl-[1em] text-muted/45">{at.page.count}</span>
			</div>

			<img
				src={at.page.cover}
				alt={`${at.page.page}: ${at.page.count} frames`}
				draggable={false}
				className={cn(
					"block h-full w-full rounded-[2px] border bg-canvas",
					// a tile is a band the cover sits inside whole; a placed page is its
					// canvas at its own shape, so there is nothing to fit it to
					mode === "tile" ? "object-cover" : "object-cover",
					lit ? "border-thread" : "border-border-raised",
					mode !== "flow" && "cursor-grab",
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
