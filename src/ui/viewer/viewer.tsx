import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import { pageChain, pageName, pageUnder, ROOT_PAGE } from "../../page-path";
import type { Camera } from "../api";
import {
	type Box,
	boundsOf,
	entryCamera,
	fitCamera,
	intersects,
	K_STEP,
	type NearScreen,
	toScreen,
	visibleWorldRect,
	wheelPixels,
	wheelZoomFactor,
	zoomAt,
} from "../canvas/camera";
import { type CameraStore, createCameraStore, useCameraFollow } from "../canvas/camera-store";
import { FrameLabel, LabelField } from "../canvas/frame-label";
import { ShellClip } from "../canvas/frame-shell";
import { flatPages, mergeOrder, mergePageTree } from "../canvas/order";
import { contentX, guideX, railRows } from "../canvas/rail-rows";
import { cn } from "../cn";
import { ChevronIcon, FolderIcon, FrameIcon } from "../icons";
import { TeamMark } from "../teams";
import { address, locate, readProject, type ViewerConfig, type ViewerProject } from "./source";
import { ViewerPlayer } from "./viewer-player";

/**
 * The read-only canvas (DEV-114): the shipped canvas with every authoring
 * control taken off, for anyone looking at a team project in a browser. The
 * pages rail stays, the camera is this browser's own, frames are live, and a
 * click grows a frame into the player. There is no tool, dock, agent or
 * selection, and nothing here sends anything anywhere but reads: it is fed one
 * project by `readProject`, and every frame's document comes from the frames'
 * own origin.
 */
export function Viewer({ config }: { config: ViewerConfig }) {
	// undefined while it is being read, null when there is no project to read
	const [project, setProject] = useState<ViewerProject | null | undefined>(undefined);
	useEffect(() => {
		let live = true;
		readProject(config).then(
			(read) => live && setProject(read ?? null),
			() => live && setProject(null),
		);
		return () => {
			live = false;
		};
	}, [config]);
	if (project === undefined) return <Quiet>opening</Quiet>;
	if (project === null) return <Quiet>This project isn’t here</Quiet>;
	return <ViewerCanvas config={config} project={project} />;
}

function Quiet({ children }: { children: ReactNode }) {
	return <div className="flex h-dvh items-center justify-center bg-canvas text-muted type-detail">{children}</div>;
}

/** How far past the viewport frames keep their documents, as a fraction of it on every side. */
const NEAR_MARGIN = 0.25;
/** How many documents one page keeps live at once; the rest wait as their names. */
const LIVE_LIMIT = 24;
/** Where a page with nothing on it stands. */
const EMPTY_CAMERA: Camera = { x: 0, y: 0, k: 1 };

function ViewerCanvas({ config, project }: { config: ViewerConfig; project: ViewerProject }) {
	const { canvas } = project;
	const known = useMemo(() => new Set(canvas.pages), [canvas.pages]);
	const [where, setWhere] = useState(() => locate(config, new URL(window.location.href)));
	const page = known.has(where.page) ? where.page : ROOT_PAGE;
	const frames = useMemo(() => canvas.frames.filter((frame) => (frame.page ?? ROOT_PAGE) === page), [canvas, page]);
	const played =
		where.frame !== null && canvas.frames.some((frame) => frame.name === where.frame) ? where.frame : null;

	const [camera] = useState(createCameraStore);
	const viewport = useRef<HTMLDivElement | null>(null);
	const size = useSize(viewport);
	/** Each page's camera, while this tab is open: this browser's own, never the project's. */
	const cameras = useRef(new Map<string, Camera>());
	const [rest, setRest] = useState<Camera | null>(null);

	// a page arrives at the camera it was left at, or fitted
	useLayoutEffect(() => {
		if (size.w === 0) return;
		const left = cameras.current.get(page);
		camera.set(left ?? (frames.length === 0 ? EMPTY_CAMERA : fitCamera(boundsOf(frames), size.w, size.h)));
	}, [camera, page, frames, size.w, size.h]);
	useEffect(
		() =>
			camera.subscribe((at, moving) => {
				if (at === null) return;
				cameras.current.set(page, at);
				if (!moving) setRest(at);
			}),
		[camera, page],
	);

	const near: NearScreen = useCallback(
		(at, box) => intersects(box, visibleWorldRect(at, size.w, size.h, NEAR_MARGIN)),
		[size.w, size.h],
	);
	/** The documents standing: what the camera came to rest near, nearest the middle first. */
	const live = useMemo(() => {
		if (rest === null || size.w === 0) return new Set<string>();
		const middle = { x: (size.w / 2 - rest.x) / rest.k, y: (size.h / 2 - rest.y) / rest.k };
		const distance = (box: Box) => Math.hypot(box.x + box.w / 2 - middle.x, box.y + box.h / 2 - middle.y);
		return new Set(
			frames
				.filter((frame) => near(rest, frame))
				.sort((a, b) => distance(a) - distance(b))
				.slice(0, LIVE_LIMIT)
				.map((frame) => frame.name),
		);
	}, [frames, near, rest, size.w, size.h]);

	const go = useCallback(
		(next: { page: string; frame: string | null }, how: "push" | "replace" = "push") => {
			const url = address(config, next.page, next.frame);
			if (how === "push") window.history.pushState({ spool: "canvas" }, "", url);
			else window.history.replaceState({ spool: "canvas" }, "", url);
			setWhere(next);
		},
		[config],
	);
	useEffect(() => {
		const onPop = () => setWhere(locate(config, new URL(window.location.href)));
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [config]);

	// scroll pans; with ⌘ or ctrl held, or a pinch, it zooms around the pointer
	useEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const at = camera.get();
			if (at === null) return;
			const dx = wheelPixels(event.deltaX, event.deltaMode, el.clientHeight);
			const dy = wheelPixels(event.deltaY, event.deltaMode, el.clientHeight);
			if (event.ctrlKey || event.metaKey) {
				const box = el.getBoundingClientRect();
				const factor = wheelZoomFactor(event.deltaY, event.deltaMode, el.clientHeight);
				camera.set(zoomAt(at, event.clientX - box.left, event.clientY - box.top, factor));
			} else if (event.shiftKey && dx === 0) camera.set({ ...at, x: at.x - dy });
			else camera.set({ ...at, x: at.x - dx, y: at.y - dy });
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [camera]);

	// a drag on the field pans it, from wherever it starts
	const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
	const onPointerDown = (event: React.PointerEvent) => {
		if (event.button !== 0) return;
		camera.stop();
		drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
	};
	const onPointerMove = (event: React.PointerEvent) => {
		const held = drag.current;
		const at = camera.get();
		if (held === null || held.id !== event.pointerId || at === null) return;
		const dx = event.clientX - held.x;
		const dy = event.clientY - held.y;
		if (!held.moved && Math.hypot(dx, dy) < 3) return;
		if (!held.moved) event.currentTarget.setPointerCapture(event.pointerId);
		held.moved = true;
		held.x = event.clientX;
		held.y = event.clientY;
		camera.set({ ...at, x: at.x + dx, y: at.y + dy });
	};
	const onPointerUp = (event: React.PointerEvent) => {
		const held = drag.current;
		drag.current = null;
		if (held === null || held.moved || held.id !== event.pointerId) return;
		// a click, not a drag: on a frame it plays the frame
		const frame = (event.target as Element).closest<HTMLElement>("[data-viewer-frame]")?.dataset.viewerFrame;
		if (frame !== undefined) play(frame);
	};

	/** Where a played frame grows from: its own spot on the canvas, on screen. */
	const from = useRef<Box | null>(null);
	const play = (frame: string) => {
		const at = camera.get();
		const spot = frames.find((each) => each.name === frame);
		const box = viewport.current?.getBoundingClientRect();
		from.current =
			at === null || spot === undefined || box === undefined
				? null
				: (({ x, y, w, h }) => ({ x: x + box.left, y: y + box.top, w, h }))(toScreen(spot, at));
		go({ page: spot?.page ?? page, frame });
	};
	const closePlayer = () => go({ page, frame: null });

	const flyTo = (frame: DesignFrame) => {
		const at = camera.get();
		if (at !== null) camera.fly(entryCamera(at, frame, size.w, size.h));
	};
	const fit = () => {
		if (frames.length > 0) camera.fly(fitCamera(boundsOf(frames), size.w, size.h));
	};
	const zoomBy = (factor: number) => {
		const at = camera.get();
		if (at !== null) camera.fly(zoomAt(at, size.w / 2, size.h / 2, factor));
	};

	return (
		<div className="flex h-dvh select-none overflow-hidden bg-bg text-text">
			<PagesRail
				project={project}
				page={page}
				onPage={(next) => next !== page && go({ page: next, frame: null })}
				onFrame={(name) => {
					const frame = frames.find((each) => each.name === name);
					if (frame !== undefined) flyTo(frame);
				}}
				onPlay={play}
			/>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				<div
					ref={viewport}
					data-viewer-field=""
					className="absolute inset-0 cursor-default touch-none"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={() => {
						drag.current = null;
					}}
				>
					{/* a page swap lays the new page in rather than cutting to it */}
					<div key={page} className="absolute inset-0 animate-[viewer-page-in_160ms_ease-out]">
						<CameraField camera={camera}>
							{frames.map((frame) => (
								<FieldFrame
									key={frame.name}
									frame={frame}
									camera={camera}
									near={near}
									src={live.has(frame.name) ? `${project.frames}${encodeURIComponent(frame.name)}` : null}
									onPlay={() => play(frame.name)}
								/>
							))}
						</CameraField>
						<LabelField camera={camera}>
							{frames.map((frame) => (
								<FrameLabel
									key={frame.name}
									name={frame.name}
									frame={frame}
									camera={camera}
									near={near}
									entered={false}
									selected={false}
									hovered={false}
								/>
							))}
						</LabelField>
					</div>
					{frames.length === 0 && (
						<div className="absolute inset-0 flex items-center justify-center text-muted type-detail">
							nothing on this page yet
						</div>
					)}
				</div>
				<div className="absolute right-3 bottom-3 flex h-8 items-center gap-1 rounded-sm border border-border bg-bg px-1">
					<button
						type="button"
						aria-label="Zoom out"
						className="rounded-xs px-2 py-1 text-muted transition-colors hover:text-text type-value"
						onClick={() => zoomBy(1 / K_STEP)}
					>
						−
					</button>
					<ZoomReadout camera={camera} />
					<button
						type="button"
						aria-label="Zoom in"
						className="rounded-xs px-2 py-1 text-muted transition-colors hover:text-text type-value"
						onClick={() => zoomBy(K_STEP)}
					>
						+
					</button>
					<span className="h-3.5 w-px bg-border-raised" />
					<button
						type="button"
						className="rounded-xs px-2 py-1 text-muted transition-colors hover:text-text type-value"
						onClick={fit}
					>
						fit
					</button>
				</div>
			</div>
			{played !== null && (
				<ViewerPlayer
					project={project.project}
					frames={canvas.frames}
					documentOf={(name) => `${project.frames}${encodeURIComponent(name)}`}
					start={played}
					from={from.current}
					onWalked={(frame) => {
						const spot = canvas.frames.find((each) => each.name === frame);
						setWhere({ page: spot?.page ?? ROOT_PAGE, frame });
					}}
					onClosed={() => {
						from.current = null;
						closePlayer();
					}}
				/>
			)}
		</div>
	);
}

/** The frames' world, moved by the camera alone: a pan or a zoom renders nothing. */
function CameraField({ camera, children }: { camera: CameraStore; children: ReactNode }) {
	const field = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ x, y, k }) => {
			if (field.current !== null) field.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
		},
		[],
	);
	return (
		<div ref={field} data-canvas-camera="" className="absolute top-0 left-0" style={{ transformOrigin: "0 0" }}>
			{children}
		</div>
	);
}

/**
 * One frame on the field: its document, live, at its authored size, with a
 * pane over it that takes the pointer. The frame is for looking at here; a
 * click on it plays it, which is where it is used.
 */
function FieldFrame({
	frame,
	camera,
	near,
	src,
	onPlay,
}: {
	frame: DesignFrame;
	camera: CameraStore;
	near: NearScreen;
	src: string | null;
	/** From the keyboard: a pointer's click is the field's to tell from a drag. */
	onPlay: () => void;
}) {
	return (
		<div
			className="absolute"
			data-viewer-frame={frame.name}
			style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
		>
			<ShellClip camera={camera} near={near} frame={frame}>
				<div className="absolute inset-0 bg-surface" />
				{src !== null && (
					<iframe
						src={src}
						title={frame.name}
						sandbox="allow-scripts"
						className="absolute inset-0 h-full w-full border-0 bg-white"
						tabIndex={-1}
					/>
				)}
				<button
					type="button"
					aria-label={`Play ${pageName(frame.name)}`}
					className="absolute inset-0 cursor-pointer bg-transparent"
					onPointerDown={(event) => event.preventDefault()}
					onClick={(event) => event.detail === 0 && onPlay()}
				/>
			</ShellClip>
		</div>
	);
}

/** The pages rail, as it ships, with nothing on it that changes anything. */
function PagesRail({
	project,
	page,
	onPage,
	onFrame,
	onPlay,
}: {
	project: ViewerProject;
	page: string;
	onPage: (page: string) => void;
	onFrame: (frame: string) => void;
	onPlay: (frame: string) => void;
}) {
	const { canvas } = project;
	const tree = useMemo(() => mergePageTree(canvas.order.pages, canvas.pages), [canvas]);
	const framesByPage = useMemo(() => {
		const byPage = new Map<string, { name: string }[]>();
		for (const each of [ROOT_PAGE, ...flatPages(tree)]) {
			const here = canvas.frames.filter((frame) => (frame.page ?? ROOT_PAGE) === each);
			byPage.set(
				each,
				mergeOrder(
					canvas.order.frames?.[each],
					here.map((frame) => pageName(frame.name)),
				).map((leaf) => ({ name: pageUnder(each, leaf) })),
			);
		}
		return byPage;
	}, [canvas, tree]);
	// the open page and every page holding it are drawn open
	const rows = useMemo(
		() => railRows(tree, framesByPage, new Set(page === ROOT_PAGE ? [] : pageChain(page))),
		[tree, framesByPage, page],
	);
	return (
		<aside className="flex w-[232px] shrink-0 flex-col border-border border-r bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pr-2 pl-3.5">
				<TeamMark team={project.team} size={18} />
				<span className="truncate type-control">{project.project}</span>
				<span className="ml-auto shrink-0 text-muted type-detail">view only</span>
			</div>
			<nav aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto py-2">
				{rows.map((row) =>
					row.kind === "page" ? (
						<button
							key={`page:${row.page}`}
							type="button"
							aria-current={row.page === page ? "page" : undefined}
							onClick={() => onPage(row.page)}
							className={cn(
								"relative flex h-8 w-full items-center pr-3 text-left transition-colors hover:bg-surface/60",
								row.page === page && "bg-surface",
							)}
							style={{ paddingLeft: contentX(row.depth) - 18 }}
						>
							<span
								className={cn(
									"flex h-8 w-4 shrink-0 items-center justify-center text-muted",
									row.open && "rotate-90",
								)}
							>
								<span className="h-2.5 w-2.5">
									<ChevronIcon />
								</span>
							</span>
							<FolderIcon
								className={cn(
									"mr-2 ml-0.5 h-3.5 w-3.5 shrink-0",
									row.page === page ? "text-thread" : "text-muted",
								)}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate type-value",
									row.page === page ? "text-text" : "text-muted",
								)}
							>
								{pageName(row.page)}
							</span>
							{!row.open && <span className="text-muted type-detail">{row.count}</span>}
						</button>
					) : row.kind === "frame" ? (
						<div
							key={`frame:${row.name}`}
							className="group relative flex h-7 w-full items-center pr-2 hover:bg-surface"
						>
							{row.page !== ROOT_PAGE && (
								<>
									<span
										className="absolute w-px bg-border-raised"
										style={{
											left: guideX(row.depth),
											top: 0,
											height: row.last ? row.height - 6 : row.height,
										}}
									/>
									<span
										className="absolute h-px w-2.5 bg-border-raised"
										style={{ left: guideX(row.depth), top: row.height / 2 }}
									/>
								</>
							)}
							<button
								type="button"
								aria-label={`${pageName(row.name)} frame`}
								onClick={() => (row.page === page ? onFrame(row.name) : onPage(row.page))}
								className="flex h-7 min-w-0 flex-1 items-center gap-2 text-left"
								style={{ paddingLeft: contentX(row.depth) }}
							>
								<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
								<span className="min-w-0 flex-1 truncate text-muted type-value">{pageName(row.name)}</span>
							</button>
							<button
								type="button"
								onClick={() => onPlay(row.name)}
								aria-label={`Play ${pageName(row.name)}`}
								className="ml-1 hidden h-5 items-center gap-1 rounded-xs px-1 text-muted hover:text-thread group-hover:flex type-detail"
							>
								<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
									<path d="M2 1.2 8.4 5 2 8.8Z" />
								</svg>
								play
							</button>
						</div>
					) : null,
				)}
			</nav>
			<div className="truncate border-border border-t px-3.5 py-3 text-muted type-detail">{project.account}</div>
		</aside>
	);
}

/** The zoom, as a percentage, written as the camera moves and never rendered. */
function ZoomReadout({ camera }: { camera: CameraStore }) {
	const readout = useRef<HTMLSpanElement | null>(null);
	useLayoutEffect(() => {
		const write = (k: number | undefined) => {
			const text = `${k === undefined ? 100 : Math.round(k * 100)}%`;
			if (readout.current !== null && readout.current.textContent !== text) readout.current.textContent = text;
		};
		write(camera.get()?.k);
		return camera.subscribe((now) => write(now?.k));
	}, [camera]);
	return <span ref={readout} data-viewer-zoom="" className="w-11 text-center text-muted tabular-nums type-value" />;
}

function useSize(ref: { current: HTMLElement | null }): { w: number; h: number } {
	const [size, setSize] = useState({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null) return;
		const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return size;
}
