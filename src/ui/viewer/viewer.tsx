import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import type { Unseen } from "../../daemon/seen";
import { isFramePath, pageChain, pageName, pageUnder, ROOT_PAGE } from "../../page-path";
import { saidAgo, saidList, sharedPageName } from "../../share-view";
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
import { createPresenceRoom } from "../canvas/presence";
import { FollowMark, PresenceFaces } from "../canvas/presence-faces";
import { PresenceLayer } from "../canvas/presence-layer";
import { contentX, guideX, railRows } from "../canvas/rail-rows";
import { UnseenMark } from "../canvas/unseen-mark";
import { useFollow, usePresenceSender } from "../canvas/use-presence";
import { cn } from "../cn";
import { handoverAddress, knock } from "../handover";
import { ChevronIcon, FolderIcon, FrameIcon } from "../icons";
import { SharedControl, useShares } from "../shares";
import { TeamMark } from "../teams";
import { Navigator, type NavigatorToast } from "./navigator";
import { onPhone } from "./phone";
import { SharedLink } from "./shared-link";
import {
	address,
	edits,
	listen,
	locate,
	readProject,
	type ViewerConfig,
	type ViewerLive,
	type ViewerProject,
	type ViewerShared,
	viewerShares,
} from "./source";
import { ViewerPlayer } from "./viewer-player";
import { useViewerPresence, type ViewerPresence } from "./viewer-presence";

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
	const [phone] = useState(onPhone);
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
	// a phone gets no spatial canvas: a shared link plays, and a team canvas is a navigator
	if (phone && project.shared !== undefined) return <SharedLink config={config} project={project} />;
	return <LiveCanvas config={config} first={project} phone={phone} />;
}

/** How long a burst of saves is let land before the canvas reads the project again. */
const REREAD_MS = 150;
/** How long the toast that names a teammate's save stays. */
const TOAST_MS = 3500;
/**
 * How often a quiet canvas reads the project again anyway: each read hands it a fresh grant to its frames, so
 * a tab left open long after the last save still opens the frames it comes to.
 */
const RENEW_MS = 60 * 60 * 1000;

/**
 * The read-only canvas kept live: a teammate's save shows up in place. The frames it touched are made again
 * where they stand, those whose own files it changed wear the changed mark until they are played, and a short
 * toast says who saved what. The canvas reads the project again for anything else the save moved.
 */
function LiveCanvas({ config, first, phone }: { config: ViewerConfig; first: ViewerProject; phone: boolean }) {
	const [project, setProject] = useState(first);
	/** How many times each frame's document has been made again since this tab opened. */
	const [revisions, setRevisions] = useState<ReadonlyMap<string, number>>(new Map());
	const [marks, setMarks] = useState<ReadonlyMap<string, Unseen>>(new Map());
	const [toast, setToast] = useState<(NavigatorToast & { id: number }) | null>(null);
	const known = useRef(new Set(first.canvas.frames.map((frame) => frame.name)));
	known.current = new Set(project.canvas.frames.map((frame) => frame.name));
	const presence = useViewerPresence(first.presence);

	useEffect(() => {
		let head: number | undefined;
		let reread: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const read = () => {
			clearTimeout(reread);
			reread = setTimeout(() => {
				readProject(config).then(
					(next) => !stopped && next !== undefined && setProject(next),
					() => {},
				);
			}, REREAD_MS);
		};
		const remake = (frames: Iterable<string>) =>
			setRevisions((current) => {
				const next = new Map(current);
				for (const frame of frames) next.set(frame, (next.get(frame) ?? 0) + 1);
				return next;
			});
		const renew = setInterval(read, RENEW_MS);
		const heard = (message: ViewerLive) => {
			if (message.type === "head") {
				// back after being away: whatever was saved meanwhile, every frame is made again from the newest
				if (head !== undefined && message.head !== head) {
					read();
					remake(known.current);
				}
				head = message.head;
				return;
			}
			head = message.head;
			read();
			remake(message.touched);
			if (message.changed.length === 0) return;
			setMarks((current) => {
				const next = new Map(current);
				for (const frame of message.changed)
					next.set(frame, known.current.has(frame) && next.get(frame) !== "new" ? "changed" : "new");
				return next;
			});
			setToast({
				id: Date.now(),
				message: `${message.by} saved ${saidFrames(message.changed)}`,
				frame: message.changed[0] ?? null,
			});
		};
		const stop = first.live === undefined ? () => {} : listen(first.live, heard);
		return () => {
			stopped = true;
			clearTimeout(reread);
			clearInterval(renew);
			stop();
		};
	}, [config, first.live]);

	useEffect(() => {
		if (toast === null) return;
		const timer = setTimeout(() => setToast(null), TOAST_MS);
		return () => clearTimeout(timer);
	}, [toast]);

	const seen = useCallback(
		(frame: string) =>
			setMarks((current) => {
				if (!current.has(frame)) return current;
				const next = new Map(current);
				next.delete(frame);
				return next;
			}),
		[],
	);

	if (phone)
		return (
			<Navigator config={config} project={project} marks={marks} onSeen={seen} toast={toast} presence={presence} />
		);
	return (
		<ViewerCanvas
			config={config}
			project={project}
			presence={presence}
			revisions={revisions}
			marks={marks}
			onSeen={seen}
			onNotice={(message) => setToast({ id: Date.now(), message, frame: null })}
			toast={toast?.message ?? null}
		/>
	);
}

/** The frames a save changed, as its toast names them: one or two by name, more by how many. */
function saidFrames(frames: readonly string[]): string {
	const names = frames.map(pageName);
	if (names.length <= 2) return names.join(" and ");
	return `${names[0]} and ${names.length - 1} more`;
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

function ViewerCanvas({
	config,
	project,
	presence,
	revisions,
	marks,
	onSeen,
	onNotice,
	toast,
}: {
	config: ViewerConfig;
	project: ViewerProject;
	/** Who else is on the canvas, for a member; null for an outsider, who sees nobody. */
	presence: ViewerPresence | null;
	revisions: ReadonlyMap<string, number>;
	marks: ReadonlyMap<string, Unseen>;
	/** A frame was played: its mark has been seen. */
	onSeen: (frame: string) => void;
	onNotice: (message: string) => void;
	toast: string | null;
}) {
	const { canvas } = project;
	const known = useMemo(() => new Set(canvas.pages), [canvas.pages]);
	const [where, setWhere] = useState(() => locate(config, new URL(window.location.href)));
	const outsider = project.shared !== undefined;
	// an outsider opens on the first page shared with them: the root page's frames only when it is one of them
	const opening = outsider
		? (project.shared?.pages.find((each) => each === ROOT_PAGE || known.has(each)) ?? ROOT_PAGE)
		: ROOT_PAGE;
	const page = known.has(where.page) ? where.page : opening;
	const frames = useMemo(() => canvas.frames.filter((frame) => (frame.page ?? ROOT_PAGE) === page), [canvas, page]);
	/** The frame the player has open: a save that renames or removes it never closes the player under anyone. */
	const playing = useRef<string | null>(null);
	// an outsider following a link to a screen not shared with them is told so by the screen itself
	const played =
		where.frame !== null &&
		(where.frame === playing.current ||
			canvas.frames.some((frame) => frame.name === where.frame) ||
			(outsider && isFramePath(where.frame)))
			? where.frame
			: null;
	playing.current = played;

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
		onSeen(frame);
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

	// --- presence (DEV-197): seen and seeing as on the Mac; a frame played is the frame they're inside
	const [following, setFollowing] = useState<string | null>(null);
	const room = presence?.room;
	usePresenceSender({
		send: presence?.say ?? NOBODY,
		team: presence !== null,
		camera,
		viewportRef: viewport,
		page,
		inside: played,
		dragging: NOTHING_DRAGGED,
	});
	useFollow({
		room: room ?? EMPTY_ROOM,
		following,
		stop: () => setFollowing(null),
		camera,
		viewportRef: viewport,
		page,
		goToPage: (next) => {
			if (next !== ROOT_PAGE && !known.has(next)) return false;
			if (next !== page) go({ page: next, frame: null });
			return true;
		},
	});
	const followed = following === null ? undefined : room?.get(following);

	return (
		<div className="flex h-dvh select-none overflow-hidden bg-bg text-text">
			<PagesRail
				project={project}
				page={page}
				marks={marks}
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
									revision={revisions.get(frame.name) ?? 0}
									cover={project.covers?.[frame.name]}
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
									unseen={marks.get(frame.name)}
								/>
							))}
						</LabelField>
					</div>
					{frames.length === 0 && (
						<div className="absolute inset-0 flex items-center justify-center text-muted type-detail">
							nothing on this page yet
						</div>
					)}
					{room !== undefined && <PresenceLayer room={room} camera={camera} frames={frames} page={page} />}
				</div>
				{followed !== undefined && <FollowMark mate={followed} />}
				<div className="absolute top-3 right-3 flex items-center gap-3">
					{project.shared !== undefined && <SharedLine shared={project.shared} />}
					{project.shares !== undefined && <ProjectShared address={project.shares} manage={edits(project.role)} />}
					{edits(project.role) && <OpenInSpool project={project} onNotice={onNotice} />}
					{room !== undefined && (
						<PresenceFaces room={room} page={page} following={following} onFollow={setFollowing} />
					)}
				</div>
				{toast !== null && (
					<div
						role="status"
						className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 animate-[viewer-page-in_160ms_ease-out] rounded-sm border border-border-raised bg-raised px-3 py-2 text-text type-detail"
					>
						{toast}
					</div>
				)}
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
					documentOf={(name) => `${project.frames}${encodeURIComponent(name)}?play`}
					walksAnywhere={outsider}
					start={played}
					from={from.current}
					onWalked={(frame) => {
						onSeen(frame);
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

/** Presence's stand-ins where there is none: nothing is said, nobody is followed, and a viewer drags nothing. */
const NOBODY = () => {};
const EMPTY_ROOM = createPresenceRoom();
const NOTHING_DRAGGED = () => [];

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
 * click on it plays it, which is where it is used. Until its document has
 * drawn, its cover stands in, when a member's daemon has sent one.
 *
 * A teammate's save makes the document again in place: the new one loads
 * behind the one on screen and takes its place once it has, so the frame
 * never blinks to nothing between them.
 */
function FieldFrame({
	frame,
	camera,
	near,
	src,
	revision,
	cover,
	onPlay,
}: {
	frame: DesignFrame;
	camera: CameraStore;
	near: NearScreen;
	src: string | null;
	/** How many times the frame has been made again since the canvas opened. */
	revision: number;
	cover: string | undefined;
	/** From the keyboard: a pointer's click is the field's to tell from a drag. */
	onPlay: () => void;
}) {
	const documents = useDocuments(src, revision);
	return (
		<div
			className="absolute"
			data-viewer-frame={frame.name}
			style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
		>
			<ShellClip camera={camera} near={near} frame={frame}>
				<div className="absolute inset-0 bg-surface" />
				{cover !== undefined && (
					<img
						src={cover}
						alt=""
						draggable={false}
						data-viewer-cover=""
						className="absolute inset-0 h-full w-full object-cover object-top"
					/>
				)}
				{documents.list.map((document, index) => {
					const newest = index === documents.list.length - 1;
					return (
						<iframe
							key={document.revision}
							src={document.src}
							title={newest ? frame.name : `${frame.name}, before`}
							data-viewer-revision={document.revision}
							sandbox="allow-scripts"
							className="absolute inset-0 h-full w-full border-0 bg-white"
							style={{ opacity: document.drawn ? 1 : 0 }}
							tabIndex={-1}
							onLoad={() => documents.drawn(document.revision)}
						/>
					);
				})}
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

interface FieldDocument {
	revision: number;
	src: string;
	drawn: boolean;
}

/**
 * A frame's documents while it is live: the one drawn, and the one made again in its place until that one has
 * drawn. The address is the one the frame was first or last made from: a grant that renews leaves a document on
 * screen where it is.
 */
function useDocuments(src: string | null, revision: number) {
	const [list, setList] = useState<FieldDocument[]>([]);
	const address = useRef(src);
	if (src !== null) address.current = src;
	const live = src !== null;
	useEffect(() => {
		const at = address.current;
		if (!live || at === null) {
			setList([]);
			return;
		}
		setList((current) => {
			if (current.at(-1)?.revision === revision) return current;
			const drawn = current.filter((document) => document.drawn).slice(-1);
			return [...drawn, { revision, src: at, drawn: false }];
		});
	}, [live, revision]);
	const drawn = useCallback(
		(revision: number) =>
			setList((current) => {
				const at = current.findIndex((document) => document.revision === revision);
				if (at === -1) return current;
				// the newest drawn takes the place of every one before it
				return current.slice(at).map((document, index) => (index === 0 ? { ...document, drawn: true } : document));
			}),
		[],
	);
	return { list, drawn };
}

/**
 * Open in spool, for an editor or admin on a computer whose spool answers: the link itself always stays in the
 * browser, and the button is there only where it can hand over. It asks again whenever the tab comes back into
 * view, so spool opened after the page still offers it.
 */
function OpenInSpool({ project, onNotice }: { project: ViewerProject; onNotice: (message: string) => void }) {
	const [there, setThere] = useState(false);
	const [knocking, setKnocking] = useState(false);
	useEffect(() => {
		if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
		let live = true;
		const ask = () => void knock().then((answered) => live && setThere(answered));
		const visible = () => document.visibilityState === "visible" && ask();
		ask();
		window.addEventListener("focus", ask);
		document.addEventListener("visibilitychange", visible);
		return () => {
			live = false;
			window.removeEventListener("focus", ask);
			document.removeEventListener("visibilitychange", visible);
		};
	}, []);
	if (!there || project.team === null) return null;
	const team = project.team;
	return (
		<button
			type="button"
			disabled={knocking}
			className="flex h-8 cursor-pointer items-center rounded-sm border border-border-raised bg-bg px-3 text-text transition-colors hover:bg-surface active:scale-[0.97] type-control"
			onClick={async () => {
				setKnocking(true);
				const answered = await knock();
				setKnocking(false);
				if (answered) window.location.assign(handoverAddress({ team: team.address, project: project.project }));
				else {
					setThere(false);
					onNotice("spool isn’t open on this Mac");
				}
			}}
		>
			Open in spool
		</button>
	);
}

/**
 * The one line an outsider is shown (DEV-114): who shared these pages with them and when they last changed. Nobody
 * else is on it, and nothing says the rest of the project exists.
 */
function SharedLine({ shared }: { shared: ViewerShared }) {
	return (
		<span
			data-viewer-shared=""
			className="flex items-center gap-2 rounded-sm border border-border bg-bg/90 py-1.5 pr-3 pl-1.5 text-muted backdrop-blur type-detail"
		>
			<span className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-raised bg-surface text-[9px] text-text">
				{shared.by[0]?.toUpperCase()}
			</span>
			{shared.by} shared {saidList(shared.pages.map(sharedPageName))} with you
			{shared.updated !== null && ` · updated ${saidAgo(shared.updated)}`}
		</span>
	);
}

/** A member's Shared control: the project's shares, which its editors and admins change and viewers only read. */
function ProjectShared({ address, manage }: { address: string; manage: boolean }) {
	const source = useMemo(() => viewerShares(address, manage), [address, manage]);
	const { shares } = useShares(source);
	return <SharedControl source={source} shares={shares} />;
}

/** The pages rail, as it ships, with nothing on it that changes anything. */
function PagesRail({
	project,
	page,
	marks,
	onPage,
	onFrame,
	onPlay,
}: {
	project: ViewerProject;
	page: string;
	marks: ReadonlyMap<string, Unseen>;
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
				{project.team !== null && <TeamMark team={project.team} size={18} />}
				<span className="truncate type-control">{project.project}</span>
				{!edits(project.role) && project.shared === undefined && (
					<span className="ml-auto shrink-0 text-muted type-detail">view only</span>
				)}
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
								<span
									className={cn(
										"min-w-0 flex-1 truncate type-value",
										marks.has(row.name) ? "text-text" : "text-muted",
									)}
								>
									{pageName(row.name)}
								</span>
								{marks.has(row.name) && <UnseenMark mark={marks.get(row.name) ?? "changed"} />}
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
			{project.account !== null && (
				<div className="truncate border-border border-t px-3.5 py-3 text-muted type-detail">{project.account}</div>
			)}
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
