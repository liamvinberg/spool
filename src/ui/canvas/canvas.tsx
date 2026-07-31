import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Cover } from "../../cover";
import { fulfillClipboardCopy, rejectClipboardCopy } from "../../runtime/clipboard-host";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { accelKeyName, accelPressed } from "../../runtime/platform-keys";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import { snapPxToCells } from "../../term/cells";
import type { Camera, FlowEdge, FrameCollision, Geometry, ProjectedFrame, SelectionEntry, SelectionPut } from "../api";
import {
	beaconTrash,
	fetchCanvasState,
	fetchCover,
	fetchFlows,
	fetchProjection,
	openInEditor,
	postTrash,
	postWalk,
	putCanvasState,
	putCover,
	putGeometry,
	putSelection,
	resolveFlows,
	subscribeSse,
} from "../api";
import { cn } from "../cn";
import { attachHotkeyLayer, type HotkeyHandler, runHotkey } from "../hotkey-dispatch";
import type { HotkeyId, HotkeyIdFor } from "../hotkeys";
import { RibbonMark } from "../icons";
import { useAgentModel } from "./agent-model";
import { useAgentInstall } from "./agent-preflight";
import { AgentRail } from "./agent-rail";
import { useAgentThreads } from "./agent-stream";
import { arrange } from "./arrange";
import {
	type Box,
	boundsOf,
	centerOn,
	clamp,
	fitCamera,
	intersects,
	K_STEP,
	stageCamera,
	toWorld,
	zoomAt,
} from "./camera";
import { type CanvasTool, CanvasTools } from "./canvas-tools";
import type { CoverRaster } from "./capture-broker";
import { CollisionNotice } from "./collision-notice";
import { ContextMenu, contextMenuSize } from "./context-menu";
import { ExportDialog, type ExportFormat } from "./export-dialog";
import { type ExportNotice, ExportToast } from "./export-toast";
import { FindPalette } from "./find-palette";
import { anchorKeyOf, FlowArrows, type SiteBoxesByFrame } from "./flow-arrows";
import {
	buildFramePdf,
	type CapturedFrame,
	downloadBytes,
	framesInCanvasOrder,
	pngBytesFromImageBlob,
} from "./frame-export";
import { FrameLabel } from "./frame-label";
import { FrameShell } from "./frame-shell";
import { emptyHistory, entryOf, record, takeRedo, takeUndo } from "./history";
import { emptyJumps, type JumpEntry, recordJump, takeBack, takeForward } from "./jumps";
import { useFrameLifecycle } from "./lifecycle";
import {
	type ElementPreview,
	editorTarget,
	type FrameHover,
	type Guides,
	HANDLE_CURSORS,
	type Handle,
	isHandle,
	NO_GUIDES,
	type PickedSelection,
	SelectionOverlay,
} from "./overlays";
import {
	camerasFromState,
	frameSourcePath,
	pageOf,
	ROOT_PAGE,
	resolveActivePage,
	stateCameraSlots,
	switchPage,
} from "./pages";
import { flightProgress, OUT, PLAY_IN, PLAY_OUT, PLAY_OUT_LANDS } from "./play-flight";
import { PlayLayer, type PlayPhase } from "./play-layer";
import {
	clipboardCopyAllowed,
	type PickedHit,
	parseFrameMessage,
	pickKey,
	pickMessage,
	type SessionRecord,
	type SiteAnchor,
	sessionReply,
	sitesMessage,
	walkRejectionReason,
} from "./protocol";
import { CanvasSidebar, type SelectModifiers } from "./sidebar";
import { snapEdge, snapMovedBox } from "./snap";
import { nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";
import { TrashToast } from "./trash-toast";
import { WalkLayer, walksOf } from "./walk-layer";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with three explicit tools. Interact enters a frame on one
 * clean click; Select picks live DOM and arranges frames; Hand pans. Command
 * and Space borrow Select and Hand while held. Selection keeps Figma's scope
 * grammar: double-click descends, Command-click jumps deepest, Shift toggles,
 * hover previews, and Esc ascends. Every frame represented by element picks
 * stays mounted for the selection. Geometry sidecars are the only canvas
 * writes; frame source remains agent-owned.
 */

export interface CanvasChrome {
	zoomPct: number;
	/** The threads toggle (#34): shown pressed while the map draws. */
	arrowsOn: boolean;
	toggleArrows: () => void;
	/**
	 * Whether this page has a layer to hide: an arrow between two frames on it,
	 * or a walk that leaves it. The toggle is not drawn otherwise — a switch
	 * over nothing is chrome pretending to be a control (#34/#39). One toggle
	 * governs the whole layer (#151), so it counts the whole layer.
	 */
	hasThreads: boolean;
	/**
	 * A flight is on, so the top bar dissolves with the rest of the furniture
	 * (#210). The canvas takes the whole window underneath it for the length of
	 * one, and a bar left sitting over the zoom is the seam the flight exists to
	 * avoid — but covering it without a fade is just as abrupt, so it fades.
	 */
	playing: boolean;
}

interface Point {
	x: number;
	y: number;
}

interface CanvasContextMenu {
	x: number;
	y: number;
	frame: string;
	selection: "frames" | "element";
}

type Gesture =
	| { kind: "idle" }
	| { kind: "pan"; lastX: number; lastY: number }
	// pointer down on a frame, before the drag threshold: a clean release is a
	// click, movement promotes to a move
	| { kind: "pending"; names: string[]; origins: Map<string, Point>; start: Point }
	| { kind: "move"; names: string[]; origins: Map<string, Point>; start: Point }
	| { kind: "marquee"; start: Point; base: readonly string[] }
	| { kind: "resize"; frame: string; handle: Handle; anchor: Point; origin: Box };

const SETTLE_PERSIST_MS = 600;
const LIFECYCLE_CAMERA_SETTLE_MS = 100;
const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 8;
const MIN_FRAME_SIZE = 40;
const NUDGE_FLUSH_MS = 400;
const SELECTION_PUT_MS = 150;
const PICK_REPLY_MS = 400;
const TRASH_UNDO_MS = 5000;
const HOVER_PICK_MS = 80;

function spatialDirection(key: string): SpatialDirection | undefined {
	switch (key) {
		case "ArrowLeft":
			return "left";
		case "ArrowRight":
			return "right";
		case "ArrowUp":
			return "up";
		case "ArrowDown":
			return "down";
		default:
			return undefined;
	}
}

function wheelPixels(delta: number, mode: number, pageSize: number): number {
	return delta * (mode === 1 ? 16 : mode === 2 ? pageSize : 1);
}

/**
 * Pinch sensitivity: zoom per pixel of wheel travel. Exponential, so a given
 * finger movement changes zoom by the same *ratio* at every zoom level — the
 * property that makes deep zoom feel the same as shallow zoom. Excalidraw's
 * linear step needs a log10 term bolted on to fake this; we get it for free.
 *
 * The clamp is a teleport guard, not a speed limit. A trackpad sends many small
 * deltas per second and never reaches it; one mouse notch (deltaY 100) does, and
 * capping that notch at 2× is exactly what you want.
 */
const WHEEL_ZOOM_RATE = 0.011;

function wheelZoomFactor(delta: number, mode: number, pageSize: number): number {
	return clamp(Math.exp(-wheelPixels(delta, mode, pageSize) * WHEEL_ZOOM_RATE), 0.5, 2);
}

/** Opaque sandbox origins identify no frame; its current iframe window does. */
export function ownsFrameMessage(
	iframes: ReadonlyMap<string, Pick<HTMLIFrameElement, "contentWindow">>,
	frame: string,
	source: MessageEventSource | null,
): boolean {
	return source !== null && iframes.get(frame)?.contentWindow === source;
}

export function ProjectCanvas({
	project,
	onChrome,
}: {
	project: string;
	onChrome: (chrome: CanvasChrome | null) => void;
}) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [frames, setFrames] = useState<ProjectedFrame[]>([]);
	const [edges, setEdges] = useState<FlowEdge[]>([]);
	// the arrows toggle (#34): per-project, default on — the map is spool's identity
	const [arrowsOn, setArrowsOn] = useState(true);
	// frame-local boxes of navigation-site elements, as each frame's shim answers
	const [siteBoxes, setSiteBoxes] = useState<SiteBoxesByFrame>({});
	const [loaded, setLoaded] = useState(false);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [tool, setTool] = useState<CanvasTool>("select");
	const [selected, setSelected] = useState<string[]>([]);
	const [picked, setPicked] = useState<PickedSelection[]>([]);
	const [entered, setEntered] = useState<string | null>(null);
	/**
	 * Inline play (#210). `frame` is where the session stands right now, which a
	 * walk moves — leaving flies out of that one, not the one it opened on.
	 * `from` is the camera the press left behind, so coming back is a return,
	 * and `size` is the box it was framed in — the viewport gives that box up
	 * for the length of the flight, so the return has to remember it.
	 */
	const [play, setPlay] = useState<{
		start: string;
		frame: string;
		phase: PlayPhase;
		from: Camera;
		size: { w: number; h: number };
		page: string;
	} | null>(null);
	const playRef = useRef(play);
	playRef.current = play;
	/**
	 * The canvas takes the whole window for the length of a flight, so the zoom
	 * crosses where the top bar and the rails were rather than sliding under
	 * them. The camera is shifted by exactly where the viewport used to start,
	 * in the same commit, so the world does not move when the box grows (#210).
	 */
	const [spanning, setSpanning] = useState<Point | null>(null);
	const spanningRef = useRef(spanning);
	spanningRef.current = spanning;
	/** The app's furniture dissolves before the flight and comes back after it. */
	const [chromeGone, setChromeGone] = useState(false);
	/** Frames go back to their pictures while the player has the machine. */
	const [pictured, setPictured] = useState(false);
	const [hovered, setHovered] = useState<FrameHover | null>(null);
	// the hover preview (#37): the element a click would target, outlined live
	const [preview, setPreview] = useState<ElementPreview | null>(null);
	const [externalLink, setExternalLink] = useState<{ frame: string; href: string } | null>(null);
	const [accelDown, setAccelDown] = useState(false);
	const [spaceDown, setSpaceDown] = useState(false);
	const [panning, setPanning] = useState(false);
	const [resizeCursor, setResizeCursor] = useState<string | null>(null);
	const [guides, setGuides] = useState<Guides>(NO_GUIDES);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [menu, setMenu] = useState<CanvasContextMenu | null>(null);
	const [exportDialog, setExportDialog] = useState<readonly string[] | null>(null);
	const [exportReturnMenu, setExportReturnMenu] = useState<CanvasContextMenu | null>(null);
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | undefined>(undefined);
	const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);
	const exportDialogRef = useRef(exportDialog);
	exportDialogRef.current = exportDialog;
	// the frame finder (/): a palette over the viewport, and the page its pick lights
	const [finding, setFinding] = useState(false);
	const [findLit, setFindLit] = useState<string | null>(null);
	const findingRef = useRef(finding);
	findingRef.current = finding;
	const [pendingTrash, setPendingTrash] = useState<string[] | null>(null);
	const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set<string>());
	const [docNonces, setDocNonces] = useState<Record<string, number>>({});
	// frames whose current boot is a walk arrival (#28): quiet cover, no veil
	const [walkArrivals, setWalkArrivals] = useState<ReadonlySet<string>>(new Set<string>());
	// pages (#39): the named pages on disk, the one the canvas shows, and the
	// names discovery refuses to resolve
	const [pages, setPages] = useState<string[]>([]);
	const [activePage, setActivePage] = useState<string>(ROOT_PAGE);
	const [collisions, setCollisions] = useState<FrameCollision[]>([]);

	// the active page is the canvas: only its frames mount — and frames staged
	// for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useMemo(
		() => frames.filter((f) => pageOf(f) === activePage && !hidden.has(f.name)),
		[frames, activePage, hidden],
	);
	const navigatorFrames = useMemo(() => frames.filter((frame) => !hidden.has(frame.name)), [frames, hidden]);
	// the agent rail's one turn (#192). It owns the stream and nothing else here has
	// to know about it: a frame the turn writes lands as an ordinary `change` event,
	// so the canvas repaints while the transcript is still arriving.
	const deck = useAgentThreads(project);
	const turn = deck.turn;
	// whether there is an agent on this machine at all (#201). A `which` rather than a
	// spawn, asked when the rail opens, because a missing binary is a fact about this
	// machine that is true before anybody types
	const install = useAgentInstall(project);
	// which machine is answering, asked of that machine rather than shipped (#118, #199).
	// Keyed on the open thread, because that is what the answer is about: the rows are the
	// binary's and the same for every thread, and which of them is answering is not.
	const model = useAgentModel(project, deck.open);
	/**
	 * The running turn, for the one hotkey handler that can stop it (#165).
	 *
	 * A ref because the handlers are installed once and read state when a key lands,
	 * the way every other rung of the ladder does.
	 */
	const turnRef = useRef(turn);
	turnRef.current = turn;
	/**
	 * What a row in the rail can do about the frame it names (#143, #194).
	 *
	 * `have` is what the project has, so a name outside it is not a place to go. `gone`
	 * is what it had and lost, which the rail cannot work out for itself and must not
	 * guess: a frame the turn is one beat from writing and a frame that was trashed are
	 * both simply absent, and they read as opposites. Only this side watched the folder,
	 * so only this side can tell them apart.
	 */
	const seenFrames = useRef<Set<string>>(new Set());
	const reach = useMemo(() => {
		const here = new Set(navigatorFrames.map((frame) => frame.name));
		for (const name of here) seenFrames.current.add(name);
		return { have: here, gone: new Set([...seenFrames.current].filter((name) => !here.has(name))) };
	}, [navigatorFrames]);
	/** the frame a row in the rail is pointing at, answered out here rather than in the log */
	const [pointed, setPointed] = useState<string | null>(null);
	/**
	 * What the hands are pointing at, as the daemon enriched it (#116).
	 *
	 * The composer's chips are the promise of what a prompt will carry, so they are
	 * this list rather than a second reading of `selected` and `picked` out here: only
	 * the daemon knows the paths, the sizes, the line ranges and the excerpts, and a
	 * strip drawn off anything else could promise what the block does not hold.
	 */
	const [pointing, setPointing] = useState<{ entries: readonly SelectionEntry[]; inside: boolean }>({
		entries: [],
		inside: false,
	});
	/** the chip or box the pointer is over, which lights the other one (#116) */
	const [lit, setLit] = useState<string | null>(null);
	const exportFrames = useMemo(
		() => (exportDialog === null ? [] : framesInCanvasOrder(visibleFrames, exportDialog)),
		[visibleFrames, exportDialog],
	);
	useEffect(() => {
		if (exportDialog === null || exportFrames.length > 0) return;
		setExportDialog(null);
		setExportReturnMenu(null);
		setExportError(undefined);
	}, [exportDialog, exportFrames.length]);
	const gesture = useRef<Gesture>({ kind: "idle" });
	const animation = useRef(0);
	const cameraRef = useRef<Camera | null>(null);
	cameraRef.current = camera;
	const settledCameraRef = useRef<Camera | null>(null);
	const framesRef = useRef(visibleFrames);
	framesRef.current = visibleFrames;
	// the whole projection, for cross-page reads: walks, exits, editor paths
	const allFramesRef = useRef(frames);
	allFramesRef.current = frames;
	const activePageRef = useRef(activePage);
	activePageRef.current = activePage;
	const pagesRef = useRef(pages);
	pagesRef.current = pages;
	// every page's last known camera this session, keyed by page (#39)
	const cameras = useRef<Record<string, Camera>>({});
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const accelDownRef = useRef(accelDown);
	accelDownRef.current = accelDown;
	/** The last screen point a relayed middle-button drag reported (#8). */
	const framePan = useRef<Point | null>(null);
	// ⌘ no longer borrows Select — Select is the base, and ⌘ is its element
	// modifier. Space is the only transient left.
	const transientTool: CanvasTool | null = spaceDown ? "hand" : null;
	const effectiveTool = transientTool ?? tool;
	const toolRef = useRef(effectiveTool);
	toolRef.current = effectiveTool;
	const hideFrameHover = useCallback(() => {
		setHovered((current) =>
			current === null || !current.visible ? current : { frame: current.frame, visible: false },
		);
	}, []);
	useEffect(() => {
		if (effectiveTool === "select") return;
		setPreview(null);
		hideFrameHover();
	}, [effectiveTool, hideFrameHover]);
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const pickedRef = useRef(picked);
	pickedRef.current = picked;
	// the walk session mirror: what the last go/back carried, owed to the next boot
	const walkSession = useRef<SessionRecord | null>(null);
	const walkTarget = useRef<string | null>(null);
	const departedFrameDocuments = useRef(new Set<string>());
	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const pickWaiters = useRef(new Map<number, (chain: PickedHit[]) => void>());
	const pickSeq = useRef(0);
	// picks apply only while their generation is current: a superseding intent
	// (a fresh press, a drag, Esc) bumps it and voids them — while a click and
	// the double-click it begins share one generation and apply in send order
	const pickGen = useRef(0);
	// the ancestry behind the current element selection — Esc ascends it
	const pickedChain = useRef<{ frame: string; chain: PickedHit[] } | null>(null);
	// hover picks ride pointer-move (#37): throttled, one in flight at a time
	const hoverLast = useRef(0);
	const hoverBusy = useRef(false);
	// the range anchor: shift over the page tree's frame rows
	const frameAnchor = useRef<string | null>(null);
	const nudgeDirty = useRef(new Set<string>());
	// where each frame stood when its nudge run began — one undo entry per flush
	const nudgeOrigins = useRef(new Map<string, Geometry>());
	const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const trashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingTrashRef = useRef<string[] | null>(null);
	// the geometry undo/redo stacks: per window, in memory, hands' writes only
	const geometryHistory = useRef(emptyHistory());
	// the jump list (jumps.ts): the spots teleports left, the hands' travel only
	const jumpList = useRef(emptyJumps());

	/**
	 * Whether a frame has a still worth standing in for it — the only thing the
	 * lifecycle asks about a picture. The headless fallback and self-capture both
	 * write the same one-image shape, so any stored cover is enough.
	 */
	const hasCover = useCallback(
		(name: string) => framesRef.current.some((f) => f.name === name && f.cover !== undefined),
		[],
	);

	/**
	 * A cover was written by us or another browser. The image is the frame's
	 * own state, so it is patched in place rather than held beside the projection:
	 * the hash is the address, so a new one is a new URL and the swap needs no
	 * nonce of its own.
	 */
	const noteCover = useCallback((frame: string, cover: Cover) => {
		setFrames((current) =>
			current.map((entry) =>
				entry.name === frame && entry.cover?.hash !== cover.hash ? { ...entry, cover } : entry,
			),
		);
	}, []);

	// a settled self-capture persists into design/.spool as one immutable image
	const onShot = useCallback(
		(frame: string, image: CoverRaster) => {
			void (async () => {
				try {
					const cover = await putCover(project, frame, await (await fetch(image.url)).blob());
					if (cover !== undefined) noteCover(frame, cover);
				} catch {
					// a lost capture is re-taken on the next settle
				}
			})();
		},
		[project, noteCover],
	);

	const selectedFrame = selected[selected.length - 1];
	// Select owns every frame represented by its element picks. Without picks,
	// the selected frame and entered-frame modifier keep their existing intent.
	const selectionTargets = useMemo(() => {
		if (picked.length > 0) return new Set(picked.map((pick) => pick.frame));
		if (effectiveTool !== "select") return new Set<string>();
		const fallback = selectedFrame ?? (accelDown ? entered : null);
		return fallback === null ? new Set<string>() : new Set([fallback]);
	}, [effectiveTool, picked, selectedFrame, accelDown, entered]);
	// the walks this page can take that no arrow can reach: the ones that land
	// on another page (#151). Derived at rest — the layer is never gated on a
	// selection, because the gap it fills is the frames you did not pick.
	const walks = useMemo(() => walksOf(edges, visibleFrames, frames), [edges, visibleFrames, frames]);
	// a layer to hide on this page: an arrow with both ends here, or a docked
	// walk. One toggle governs both, so it counts both — a page whose only walks
	// leave it used to get no switch at all (#34/#39/#151).
	const hasThreads = useMemo(() => {
		if (walks.length > 0) return true;
		const here = new Set(visibleFrames.map((entry) => entry.name));
		return edges.some((edge) => edge.from !== edge.to && here.has(edge.from) && here.has(edge.to));
	}, [edges, visibleFrames, walks]);

	const lifecycle = useFrameLifecycle({
		framesRef,
		entered,
		selectionTargets,
		hasCover: hasCover,
		onShot,
		cameraRef: settledCameraRef,
		viewportRef,
		pictured,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;
	const sweepLifecycle = lifecycle.sweep;
	const noteCameraMoving = lifecycle.noteCameraMoving;

	const reloadFrameDocument = useCallback((frame: string) => {
		setDocNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
		setWalkArrivals((current) => withoutFrame(current, frame));
		setPicked((current) => current.filter((pick) => pick.frame !== frame));
		if (pickedChain.current?.frame === frame) pickedChain.current = null;
		setPreview((current) => (current?.frame === frame ? null : current));
		lifecycleRef.current.markStale(frame);
	}, []);

	const onIframe = useCallback((name: string, el: HTMLIFrameElement | null) => {
		if (el === null) iframes.current.delete(name);
		else {
			if (iframes.current.get(name) !== el) departedFrameDocuments.current.delete(name);
			iframes.current.set(name, el);
		}
		lifecycleRef.current.onIframe(name, el);
	}, []);

	const capturePng = useCallback(
		async (frame: ProjectedFrame): Promise<CapturedFrame> => {
			if (frame.kind === "html") {
				const sheet = await lifecycleRef.current.captureExport(frame.name);
				if (sheet === undefined) throw new Error(`Couldn’t capture ${frame.name}. Try again.`);
				const png = await pngBytesFromImageBlob(await (await fetch(sheet.url)).blob(), frame.w, frame.h);
				return { name: frame.name, width: frame.w, height: frame.h, png };
			}

			// A terminal has no HTML document to mount, so its stored cover is
			// the export source.
			const stored = frame.cover === undefined ? undefined : await fetchCover(project, frame.name, frame.cover);
			if (stored === undefined) throw new Error(`Couldn’t capture ${frame.name}. Try again.`);
			const png = await pngBytesFromImageBlob(stored, frame.w, frame.h);
			return { name: frame.name, width: frame.w, height: frame.h, png };
		},
		[project],
	);

	const runExport = useCallback(
		async (names: readonly string[], format: ExportFormat) => {
			const ordered = framesInCanvasOrder(framesRef.current, names);
			const first = ordered[0];
			if (first === undefined) return;
			setExporting(true);
			setExportError(undefined);
			if (ordered.length === 1) setExportNotice({ kind: "progress", message: `Exporting ${first.name}…` });
			try {
				const captured: CapturedFrame[] = [];
				for (const frame of ordered) captured.push(await capturePng(frame));

				if (format === "png") {
					for (const frame of captured) downloadBytes(frame.png, "image/png", `${frame.name}.png`);
				} else {
					downloadBytes(await buildFramePdf(captured), "application/pdf", `${project}.pdf`);
				}

				setExportDialog(null);
				setExportReturnMenu(null);
				setExportNotice({
					kind: "success",
					message:
						format === "pdf"
							? `Exported ${project}.pdf`
							: captured.length === 1
								? `Exported ${first.name}.png`
								: `Exported ${captured.length} PNG images`,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "Export failed. Try again.";
				if (ordered.length === 1) setExportNotice({ kind: "error", message });
				else setExportError(message);
			} finally {
				setExporting(false);
			}
		},
		[capturePng, project],
	);

	/**
	 * The export door (#7), whether the menu or the bare key opened it: one
	 * frame downloads as PNG, several open the format choice. `returnMenu` is
	 * the menu to reopen if the choice is cancelled — the key has none.
	 */
	const openExport = useCallback(
		(names: readonly string[], returnMenu: CanvasContextMenu | null) => {
			if (names.length === 0) return;
			setExportError(undefined);
			if (names.length === 1) {
				setExportReturnMenu(null);
				void runExport(names, "png");
				return;
			}
			setExportReturnMenu(returnMenu);
			setExportDialog(framesInCanvasOrder(framesRef.current, names).map((frame) => frame.name));
		},
		[runExport],
	);

	const cancelExportDialog = useCallback(() => {
		setExportDialog(null);
		setExportError(undefined);
		setMenu(exportReturnMenu);
		setExportReturnMenu(null);
	}, [exportReturnMenu]);

	useEffect(() => {
		if (exportNotice === null || exportNotice.kind === "progress") return;
		const timeout = setTimeout(() => setExportNotice(null), 3500);
		return () => clearTimeout(timeout);
	}, [exportNotice]);

	const refetchFrames = useCallback(async () => {
		const projection = await fetchProjection(project);
		if (projection === undefined) return;
		setFrames(projection.frames);
		setPages(projection.pages);
		setCollisions(projection.collisions);
		setLoaded(true);
	}, [project]);

	const refetchFlows = useCallback(async () => {
		const flows = await fetchFlows(project);
		if (flows === undefined) return;
		setEdges(flows.edges);
	}, [project]);

	// boot: stored cameras + arrows + active page, the
	// projection, the link graph — the canvas reopens on the page it left (#39)
	useEffect(() => {
		let alive = true;
		void (async () => {
			const state = await fetchCanvasState(project);
			if (alive && state !== undefined) {
				setArrowsOn(state.arrows ?? true);
				cameras.current = camerasFromState(state);
				const page = state.activePage ?? ROOT_PAGE;
				setActivePage(page);
				const camera = cameras.current[page];
				if (camera !== undefined) setCamera(camera);
			}
			// arrows arrive when they arrive (#109): the canvas opens on frames and
			// cameras, and nothing on screen waits for the link graph
			if (alive) {
				void refetchFlows();
				await refetchFrames();
			}
			// dark targets get one render pass per canvas open (#34): frames whose
			// read is already fresh cost nothing, so this is a no-op on reopen
			if (alive && (await resolveFlows(project))?.read !== 0) {
				if (alive) await refetchFlows();
			}
		})();
		return () => {
			alive = false;
		};
	}, [project, refetchFrames, refetchFlows]);

	// --- site boxes (#34): arrows grow out of the element that causes them ------

	const edgesRef = useRef(edges);
	edgesRef.current = edges;
	const siteBoxSeq = useRef(0);
	const siteBoxExpected = useRef(new Map<string, number>());

	/**
	 * Ask one frame's shim where its navigation-site elements sit. Only the
	 * newest request per frame applies; a frame standing as its picture has no
	 * document to ask and its arrows keep the frame-edge fallback until the next
	 * time something borrows it.
	 */
	const requestSiteBoxes = useCallback((frame: string) => {
		const target = iframes.current.get(frame)?.contentWindow;
		if (target == null) return;
		const anchors: SiteAnchor[] = [];
		const seen = new Set<string>();
		for (const edge of edgesRef.current) {
			if (edge.from !== frame) continue;
			for (const site of edge.sites) {
				if (site.anchor === undefined) continue;
				const key = anchorKeyOf(site.path, site.anchor);
				if (seen.has(key)) continue;
				seen.add(key);
				// only data-go sites carry the DOM-fallback target: a ui.go site
				// whose stamp misses must fall to the frame edge, never claim an
				// unrelated carrier that happens to share the destination
				anchors.push({
					path: site.path,
					line: site.anchor.line,
					col: site.anchor.col,
					...(site.via === "data-go" ? { target: edge.to } : {}),
				});
			}
		}
		if (anchors.length === 0) return;
		const id = ++siteBoxSeq.current;
		siteBoxExpected.current.set(frame, id);
		target.postMessage(sitesMessage(anchors, id), "*");
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies(edges): the graph moving is the trigger — the request reads it through the ref
	useEffect(() => {
		for (const name of iframes.current.keys()) requestSiteBoxes(name);
	}, [edges, requestSiteBoxes]);

	// a staged Trash resolves when the projection stops listing the folder
	useEffect(() => {
		setHidden((current) => {
			const alive = [...current].filter((name) => frames.some((f) => f.name === name));
			return alive.length === current.size ? current : new Set(alive);
		});
	}, [frames]);

	// a walk marker must not outlive its walk: a frame dropped back to its
	// picture before its boot ever reported loaded is borrowed again later, and
	// that boot is honest — only the current walk target keeps its marker (#28)
	useEffect(() => {
		setWalkArrivals((current) => {
			const alive = [...current].filter(
				(name) => name === walkTarget.current || (lifecycle.states[name] ?? "picture") !== "picture",
			);
			return alive.length === current.size ? current : new Set(alive);
		});
	}, [lifecycle.states]);

	// no stored camera: fit the field once both viewport and frames exist
	useLayoutEffect(() => {
		if (camera !== null || !loaded) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		setCamera(
			framesRef.current.length === 0
				? { x: 0, y: 0, k: 1 }
				: fitCamera(boundsOf(framesRef.current), viewport.clientWidth, viewport.clientHeight),
		);
	}, [camera, loaded]);

	// --- camera ---------------------------------------------------------------

	const stopAnimation = useCallback(() => cancelAnimationFrame(animation.current), []);

	const animateCamera = useCallback(
		(to: Camera, ms = 220, ease: (p: number) => number = OUT) => {
			const from = cameraRef.current;
			if (from === null) return;
			stopAnimation();
			const t0 = performance.now();
			const step = (t: number) => {
				const p = clamp((t - t0) / ms, 0, 1);
				const e = ease(p);
				setCamera({
					x: from.x + (to.x - from.x) * e,
					y: from.y + (to.y - from.y) * e,
					k: from.k + (to.k - from.k) * e,
				});
				if (p < 1) animation.current = requestAnimationFrame(step);
			};
			animation.current = requestAnimationFrame(step);
		},
		[stopAnimation],
	);

	/**
	 * Where the canvas viewport starts in the window. Inline play's stage covers
	 * the window, so its landing is worked out there and moved by this (#210).
	 */
	const viewportOrigin = useCallback((): Point => {
		const el = viewportRef.current;
		if (el === null) return { x: 0, y: 0 };
		const rect = el.getBoundingClientRect();
		return { x: rect.left, y: rect.top };
	}, []);

	const viewportCenter = useCallback((): Point => {
		const el = viewportRef.current;
		return el === null ? { x: 0, y: 0 } : { x: el.clientWidth / 2, y: el.clientHeight / 2 };
	}, []);

	const zoomAtPoint = useCallback(
		(cx: number, cy: number, factor: number, animate = false) => {
			const cam = cameraRef.current;
			if (cam === null) return;
			const next = zoomAt(cam, cx, cy, factor);
			if (animate) animateCamera(next, 140);
			else setCamera(next);
		},
		[animateCamera],
	);

	const zoomFit = useCallback(() => {
		const viewport = viewportRef.current;
		if (viewport === null || framesRef.current.length === 0) return;
		animateCamera(fitCamera(boundsOf(framesRef.current), viewport.clientWidth, viewport.clientHeight));
	}, [animateCamera]);

	const resetZoom = useCallback(() => {
		const cam = cameraRef.current;
		if (cam === null) return;
		const c = viewportCenter();
		const w = toWorld(c, cam);
		animateCamera({ k: 1, x: c.x - w.x, y: c.y - w.y });
	}, [animateCamera, viewportCenter]);

	/**
	 * The jump list's one rule (jumps.ts): a move that takes you somewhere — a
	 * finder pick, a walk, a connection row, a page switch, a sidebar flight —
	 * records the spot it left through recordDeparture; a move that reframes
	 * where you already are — pan, zoom, fit, enter — never does.
	 */
	const jumpSpot = useCallback((): JumpEntry | undefined => {
		const cam = cameraRef.current;
		return cam === null ? undefined : { page: activePageRef.current, camera: { x: cam.x, y: cam.y, k: cam.k } };
	}, []);

	const recordDeparture = useCallback(() => {
		const from = jumpSpot();
		if (from !== undefined) jumpList.current = recordJump(jumpList.current, from);
	}, [jumpSpot]);

	/** Enter one frame as a fresh preview root: no carried session, no witnessed edge. */
	const enterFrame = useCallback(
		(target: string) => {
			const frame = framesRef.current.find((candidate) => candidate.name === target);
			if (frame === undefined) return;
			departedFrameDocuments.current.delete(target);
			walkTarget.current = null;
			walkSession.current = null;
			setEntered(target);
			setSelected([]);
			setPicked([]);
			setPreview(null);
			// the entered frame owns the keyboard from the first moment; a frame
			// booting right now gets it at its loaded report instead
			iframes.current.get(target)?.focus();
			// Going inside always brings the frame to you. A zoom threshold here
			// only ever surprises: the same double-click lands you in a neighbour
			// at one zoom and leaves the camera behind at another, and no rule
			// you cannot see is worth that. The sidebar's flight already works
			// this way.
			const viewport = viewportRef.current;
			if (viewport === null) return;
			animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
		},
		[animateCamera],
	);

	const exitEntered = useCallback((retainFrame = false) => {
		const frame = enteredRef.current;
		setEntered(null);
		setAccelDown(false);
		setExternalLink(null);
		walkTarget.current = null;
		walkSession.current = null;
		if (retainFrame && frame !== null) {
			setSelected([frame]);
			setPicked([]);
		}
		// Focus can otherwise remain trapped in the now-inert iframe, where the
		// following arrow would never reach the canvas navigation layer.
		viewportRef.current?.focus({ preventScroll: true });
	}, []);

	const toggleArrows = useCallback(() => setArrowsOn((on) => !on), []);

	/**
	 * Play (#210): the camera flies into the frame and the player takes the
	 * viewport, rather than a tab opening somewhere else. `/play/` is still
	 * served, as the door for agents and phones; no human door leads there.
	 *
	 * The furniture goes first — the top bar, the rails, the tools, the labels —
	 * and the canvas takes the window in the same breath, so the zoom crosses
	 * where they were instead of sliding under them. Shifting the camera by
	 * where the viewport used to start keeps the world still while its box
	 * grows: the only thing that moves is the furniture fading off it.
	 *
	 * Then the camera flies, on the staged curve, and lands exactly where the
	 * player's own stage will place the frame. The layer boots its session from
	 * the moment of the press, so the flight is what the boot happens behind.
	 */
	const playFrame = useCallback(
		(name: string) => {
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			const frame = framesRef.current.find((candidate) => candidate.name === name);
			if (viewport === null || cam === null || frame === undefined || playRef.current !== null) return;
			exitEntered();
			setMenu(null);
			setPreview(null);
			setChromeGone(true);
			const origin = viewportOrigin();
			setSpanning(origin);
			setCamera({ ...cam, x: cam.x + origin.x, y: cam.y + origin.y });
			setPlay({
				start: name,
				frame: name,
				phase: "flying",
				from: cam,
				size: { w: viewport.clientWidth, h: viewport.clientHeight },
				page: activePageRef.current,
			});
			const to = stageCamera(frame, window.innerWidth, window.innerHeight);
			window.setTimeout(() => {
				if (playRef.current?.start === name) animateCamera(to, PLAY_IN.fly, flightProgress);
			}, PLAY_IN.start);
		},
		[animateCamera, exitEntered, viewportOrigin],
	);

	/**
	 * Out again, reversing the same sequence — and out of the frame the session
	 * is standing in, which a walk may have moved. The camera agrees with the
	 * walk: it lands on that frame's own place, keeping the zoom the press left.
	 *
	 * The whole return happens in window space, and the viewport only takes its
	 * own box back once the camera has stopped — giving it back mid-flight would
	 * put the rails over a canvas still moving under them.
	 */
	const leavePlay = useCallback(() => {
		const session = playRef.current;
		const origin = spanningRef.current;
		if (session === null || session.phase === "leaving" || origin === null) return;
		setPlay({ ...session, phase: "leaving" });
		setPictured(false);
		const landed = framesRef.current.find((candidate) => candidate.name === session.frame);
		// A walk that ended somewhere else lands the camera there. The jump is
		// made while the stage still covers everything, so only the flight shows.
		if (landed !== undefined && session.frame !== session.start) {
			setCamera(stageCamera(landed, window.innerWidth, window.innerHeight));
			setSelected([session.frame]);
		} else {
			setSelected([session.start]);
		}
		// The rest is where the press left the camera, read in the viewport's own
		// box — so it is worked out there and flown to shifted, then handed back
		// unshifted at the landing, all in one commit so nothing jumps.
		const rest =
			landed !== undefined && session.frame !== session.start
				? centerOn(session.from, landed, session.size.w, session.size.h)
				: session.from;
		window.setTimeout(
			() => animateCamera({ ...rest, x: rest.x + origin.x, y: rest.y + origin.y }, PLAY_OUT.fly),
			PLAY_OUT.flyAt,
		);
		window.setTimeout(() => setPlay(null), PLAY_OUT.stageAt + PLAY_OUT.stage);
		window.setTimeout(() => {
			stopAnimation();
			setSpanning(null);
			setCamera(rest);
			viewportRef.current?.focus({ preventScroll: true });
		}, PLAY_OUT_LANDS);
		window.setTimeout(() => setChromeGone(false), PLAY_OUT.chromeAt);
	}, [animateCamera, stopAnimation]);

	// --- selection sync (#23): what Liam points at, served to agents ------------

	/**
	 * Entering is the strongest thing you can say about what you mean, and it clears
	 * the selection ring — so it must still be served. Without the same fallback,
	 * agents and the player both lose you the moment you step inside a frame; and
	 * because the composer draws whatever is served, this is also the state where the
	 * strip holds a chip nobody chose (#139).
	 */
	const insideOnly = picked.length === 0 && selected.length === 0 && entered !== null;

	useEffect(() => {
		const timer = setTimeout(() => {
			const put: SelectionPut =
				picked.length > 0
					? {
							elements: picked.map(({ frame, selector, outerHtml, source, generated }) => ({
								frame,
								selector,
								outerHtml,
								source,
								generated,
							})),
						}
					: { frames: selected.length > 0 ? selected : entered === null ? [] : [entered] };
			// the enriched list is what the composer draws (#116): the strip is the
			// promise of what a prompt will carry, so it is the daemon's own answer
			// rather than a second guess at it out here. `inside` travels with it for
			// the same reason — read live it would say "no ✕" a beat before the chip it
			// is about had arrived
			void putSelection(project, put).then((entries) => {
				if (entries !== undefined) setPointing({ entries, inside: insideOnly });
			});
		}, SELECTION_PUT_MS);
		return () => clearTimeout(timer);
	}, [project, picked, selected, entered, insideOnly]);

	/**
	 * Where a chip in the composer reaches back to (#116).
	 *
	 * Removal belongs on the canvas because that is where the thing being removed is:
	 * two picks of one list row are one string in the rail and two boxes out there, so
	 * a ✕ that only tidied the strip would leave the two disagreeing about what is
	 * picked. `null` is the collapsed strip's own ✕, which drops the lot rather than a
	 * member, since the count stands for the whole list.
	 *
	 * It leaves an entered frame alone, and cannot be reached from one: inside a frame
	 * the strip is a single chip with no ✕ at all (#139), because out there the only
	 * way to stop pointing at the frame you are in is to leave it.
	 */
	const dropPointed = useCallback((id: string | null) => {
		setLit(null);
		if (id === null) {
			setPicked([]);
			setSelected([]);
			return;
		}
		setPicked((current) => current.filter((pick) => pickKey(pick.frame, pick.selector) !== id));
		setSelected((current) => current.filter((name) => name !== id));
	}, []);

	// --- geometry writes (#23): sidecars only, never source ---------------------

	const commitGeometry = useCallback(
		(names: readonly string[], before?: Record<string, Geometry>) => {
			const patch: Record<string, Geometry> = {};
			for (const frame of framesRef.current) {
				if (!names.includes(frame.name)) continue;
				patch[frame.name] = {
					x: Math.round(frame.x),
					y: Math.round(frame.y),
					w: Math.round(frame.w),
					h: Math.round(frame.h),
				};
			}
			if (Object.keys(patch).length === 0) return;
			if (before !== undefined) {
				const entry = entryOf(before, patch);
				if (entry !== undefined) geometryHistory.current = record(geometryHistory.current, entry);
			}
			setFrames((current) => {
				return current.map((frame) => {
					const rounded = patch[frame.name];
					return rounded === undefined ? frame : { ...frame, ...rounded };
				});
			});
			void putGeometry(project, patch).then((ok) => {
				// a write that never landed must not leave the canvas lying — snap
				// back to the sidecars' truth
				if (!ok) void refetchFrames();
			});
		},
		[project, refetchFrames],
	);

	const flushNudge = useCallback(() => {
		clearTimeout(nudgeTimer.current);
		nudgeTimer.current = undefined;
		if (nudgeDirty.current.size === 0) return;
		const names = [...nudgeDirty.current];
		nudgeDirty.current.clear();
		const before = Object.fromEntries(nudgeOrigins.current);
		nudgeOrigins.current.clear();
		commitGeometry(names, before);
	}, [commitGeometry]);

	const nudge = useCallback(
		(dx: number, dy: number) => {
			const names = selectedRef.current;
			if (names.length === 0) return;
			for (const frame of framesRef.current) {
				if (!names.includes(frame.name) || nudgeOrigins.current.has(frame.name)) continue;
				nudgeOrigins.current.set(frame.name, { x: frame.x, y: frame.y, w: frame.w, h: frame.h });
			}
			setFrames((current) =>
				current.map((frame) =>
					names.includes(frame.name) ? { ...frame, x: frame.x + dx, y: frame.y + dy } : frame,
				),
			);
			for (const name of names) nudgeDirty.current.add(name);
			clearTimeout(nudgeTimer.current);
			nudgeTimer.current = setTimeout(flushNudge, NUDGE_FLUSH_MS);
		},
		[flushNudge],
	);

	// --- undo/redo: inverse patches over the same sidecar writes ----------------

	const applyRects = useCallback(
		(rects: Record<string, Geometry>) => {
			setFrames((current) =>
				current.map((frame) => {
					const rect = rects[frame.name];
					return rect === undefined ? frame : { ...frame, ...rect };
				}),
			);
			void putGeometry(project, rects).then((ok) => {
				if (!ok) void refetchFrames();
			});
		},
		[project, refetchFrames],
	);

	const undoGeometry = useCallback(() => {
		flushNudge(); // a pending nudge becomes the entry this ⌘Z pops
		const alive = new Set(allFramesRef.current.map((frame) => frame.name));
		const taken = takeUndo(geometryHistory.current, alive);
		if (taken === undefined) return;
		geometryHistory.current = taken.history;
		applyRects(taken.rects);
	}, [applyRects, flushNudge]);

	const redoGeometry = useCallback(() => {
		// a pending nudge is a fresh edit: flushing voids redo, exactly as typed
		flushNudge();
		const alive = new Set(allFramesRef.current.map((frame) => frame.name));
		const taken = takeRedo(geometryHistory.current, alive);
		if (taken === undefined) return;
		geometryHistory.current = taken.history;
		applyRects(taken.rects);
	}, [applyRects, flushNudge]);

	// --- tidy: the layered drawing of the graph, laid over the field ------------

	/**
	 * Tidy the field: two or more selected frames tidy among themselves,
	 * otherwise the whole page does. It writes rects like any other gesture, so
	 * it takes exactly one undo slot and ⌘Z puts every frame back.
	 */
	const arrangeFrames = useCallback(() => {
		flushNudge(); // a pending nudge is its own entry, never part of this one
		const selection = selectedRef.current;
		const scope =
			selection.length > 1 ? framesRef.current.filter((frame) => selection.includes(frame.name)) : framesRef.current;
		if (scope.length < 2) return;
		const before = Object.fromEntries(
			scope.map((frame) => [frame.name, { x: frame.x, y: frame.y, w: frame.w, h: frame.h }]),
		);
		const rects = arrange(scope, edgesRef.current);
		const entry = entryOf(before, rects);
		if (entry === undefined) return; // already tidy: nothing to undo
		geometryHistory.current = record(geometryHistory.current, entry);
		applyRects(rects);
	}, [applyRects, flushNudge]);

	// --- trash (#23): instant canvas removal, disk move deferred on the toast ---

	const commitTrash = useCallback(() => {
		const names = pendingTrashRef.current;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		if (names === null || names.length === 0) return;
		void postTrash(project, names).then((ok) => {
			if (ok) return;
			// the move never happened: resurface the frames instead of losing them
			setHidden((current) => new Set([...current].filter((name) => !names.includes(name))));
			void refetchFrames();
		});
	}, [project, refetchFrames]);

	const stageTrash = useCallback(
		(names: string[]) => {
			if (names.length === 0) return;
			commitTrash(); // an earlier toast still open commits now — one undo slot (#7)
			setHidden((current) => new Set([...current, ...names]));
			setSelected((current) => current.filter((name) => !names.includes(name)));
			setPicked((current) => {
				const kept = current.filter((pick) => !names.includes(pick.frame));
				return kept.length === current.length ? current : kept;
			});
			if (enteredRef.current !== null && names.includes(enteredRef.current)) exitEntered();
			pendingTrashRef.current = names;
			setPendingTrash(names);
			trashTimer.current = setTimeout(commitTrash, TRASH_UNDO_MS);
		},
		[commitTrash, exitEntered],
	);

	const undoTrash = useCallback(() => {
		const names = pendingTrashRef.current;
		if (names === null) return;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		setHidden((current) => new Set([...current].filter((name) => !names.includes(name))));
	}, []);

	// leaving the page (or the tab) mid-toast: the staged move still happens
	useEffect(() => {
		const flush = () => {
			const names = pendingTrashRef.current;
			if (names === null) return;
			pendingTrashRef.current = null;
			beaconTrash(project, names);
		};
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [project]);

	// --- element pick (#23): the shim answers, the pointer never enters ---------

	const cancelPicks = useCallback(() => {
		pickGen.current++;
	}, []);

	const clearCanvasSelection = useCallback(() => {
		cancelPicks();
		pickedChain.current = null;
		setSelected([]);
		setPicked([]);
		setPreview(null);
	}, [cancelPicks]);

	/**
	 * Ask the frame for the element ancestry at a frame-local point. The apply
	 * callback runs only while this pick's generation is current — a silent or
	 * booting document never applies; onSilence answers for it when a caller
	 * cannot afford dead air.
	 */
	const beginPick = useCallback(
		(frame: string, local: Point, apply: (chain: PickedHit[]) => void, onSilence?: () => void) => {
			const target = iframes.current.get(frame)?.contentWindow;
			if (target == null) {
				onSilence?.();
				return;
			}
			const id = ++pickSeq.current;
			const gen = pickGen.current;
			pickWaiters.current.set(id, (chain) => {
				if (pickGen.current === gen) apply(chain);
			});
			target.postMessage(pickMessage(local.x, local.y, id), "*");
			setTimeout(() => {
				if (pickWaiters.current.delete(id) && pickGen.current === gen) onSilence?.();
			}, PICK_REPLY_MS);
		},
		[],
	);

	const applyPick = useCallback((frame: string, chain: PickedHit[], hit: PickedHit | undefined) => {
		if (hit === undefined) return; // frame background: the frame stays the selection
		pickedChain.current = { frame, chain };
		setSelected([]);
		setPicked([{ frame, ...hit }]);
	}, []);

	/** The anchor of the element scope: the most recent pick, whose chain is held. */
	const pickAnchor = useCallback((): PickedSelection | undefined => {
		return pickedRef.current[pickedRef.current.length - 1];
	}, []);

	/**
	 * Figma's scope memory as a walk: the element at the anchor's depth under a
	 * fresh chain — a sibling inside the shared ancestry, the divergence point
	 * outside it, the top-level element when no scope holds.
	 */
	const atDepthIn = useCallback(
		(frame: string, chain: PickedHit[]): PickedHit | undefined => {
			if (chain.length === 0) return undefined;
			const anchor = pickAnchor();
			const held = pickedChain.current;
			const prior = anchor !== undefined && anchor.frame === frame && held?.frame === frame ? held.chain : null;
			const depth = prior === null ? -1 : prior.findIndex((h) => h.selector === anchor?.selector);
			if (prior === null || depth < 0) return chain[0];
			// walk the shared ancestry: a full match lands at the scope's
			// depth (a sibling), a partial one at the divergence point
			let shared = 0;
			while (shared < depth && shared < chain.length && prior[shared]?.selector === chain[shared]?.selector) {
				shared++;
			}
			return chain[Math.min(shared, chain.length - 1)];
		},
		[pickAnchor],
	);

	/** Figma's deep select (⌘-click, and the right-click point): the deepest element. */
	const deepSelectAt = useCallback(
		(frame: string, local: Point) => {
			beginPick(frame, local, (chain) => applyPick(frame, chain, chain[chain.length - 1]));
		},
		[beginPick, applyPick],
	);

	/**
	 * The scoped click: while an element is selected, a click selects the
	 * element at the same depth under the cursor; empty space (and a frame that
	 * never answers) pops the selection back to the frame.
	 */
	const scopedSelectAt = useCallback(
		(frame: string, local: Point) => {
			const pop = () => {
				pickedChain.current = null;
				setPicked([]);
				setSelected([frame]);
			};
			beginPick(
				frame,
				local,
				(chain) => {
					const target = atDepthIn(frame, chain);
					if (target === undefined) {
						pop();
						return;
					}
					applyPick(frame, chain, target);
				},
				pop,
			);
		},
		[beginPick, applyPick, atDepthIn],
	);

	/**
	 * Shift-click's toggle (#37): the at-depth target in or out of the picked
	 * set — with ⌘, the deepest. A toggle in moves the anchor; membership is
	 * (frame, selector) identity.
	 */
	const togglePickAt = useCallback(
		(frame: string, local: Point, deepest: boolean) => {
			beginPick(frame, local, (chain) => {
				const target = deepest ? chain[chain.length - 1] : atDepthIn(frame, chain);
				if (target === undefined) return; // frame background: nothing to toggle
				const current = pickedRef.current;
				const held = current.filter((pick) => !(pick.frame === frame && pick.selector === target.selector));
				if (held.length < current.length) {
					setPicked(held);
				} else {
					pickedChain.current = { frame, chain };
					setPicked([...current, { frame, ...target }]);
				}
				setSelected([]);
			});
		},
		[beginPick, atDepthIn],
	);

	/** The tree grammar on frame rows: shift ranges, ⌘ toggles, click replaces. */
	const selectFrameRow = (name: string, modifiers: SelectModifiers) => {
		const frame = navigatorFrames.find((candidate) => candidate.name === name);
		if (frame === undefined) return;
		const targetPage = pageOf(frame);
		const changedPage = targetPage !== activePageRef.current;
		if (changedPage) {
			recordDeparture();
			switchToPage(targetPage);
		}
		setTool("select");
		setPicked([]);
		pickedChain.current = null;
		if (modifiers.shift && frameAnchor.current !== null) {
			const names = navigatorFrames
				.filter((candidate) => pageOf(candidate) === targetPage)
				.map((candidate) => candidate.name);
			const a = names.indexOf(frameAnchor.current);
			const b = names.indexOf(name);
			if (a !== -1 && b !== -1) {
				const range = names.slice(Math.min(a, b), Math.max(a, b) + 1);
				setSelected(modifiers.toggle && !changedPage ? [...new Set([...selectedRef.current, ...range])] : range);
				return;
			}
		}
		frameAnchor.current = name;
		if (modifiers.toggle) {
			setSelected((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));
		} else {
			setSelected([name]);
		}
	};

	const flyToFrame = (name: string) => {
		const frame = framesRef.current.find((candidate) => candidate.name === name);
		const viewport = viewportRef.current;
		if (frame === undefined || viewport === null) return;
		recordDeparture();
		animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
	};

	// --- pages (#39): one canvas per page, cameras bookkept per page ------------

	/** The camera that lands an arrival centered on its target, zoom kept. */
	const arrivalAt = useCallback((frame: ProjectedFrame): Camera | undefined => {
		const viewport = viewportRef.current;
		const cam = cameraRef.current;
		return viewport !== null && cam !== null
			? centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight)
			: undefined;
	}, []);

	/**
	 * Switching saves the leaving page's camera, swaps the field, and restores
	 * the arriving page's — fits when it has none, or lands where a caller
	 * says. Selection, element scope, and entered time are page-local and
	 * reset; a pending trash commits (one undo slot, as ever). The current tool
	 * rides through untouched.
	 */
	const switchToPage = useCallback(
		(target: string, arriveAt?: Camera) => {
			if (activePageRef.current === target) return;
			flushNudge();
			commitTrash();
			clearCanvasSelection();
			exitEntered();
			setMenu(null);
			setExternalLink(null);
			stopAnimation();
			const next = switchPage(cameras.current, activePageRef.current, cameraRef.current, target, arriveAt);
			cameras.current = next.cameras;
			setActivePage(target);
			setCamera(next.camera);
		},
		[flushNudge, commitTrash, clearCanvasSelection, exitEntered, stopAnimation],
	);

	/** Page-folder clicks return selection to the page, even when it is already active. */
	const activatePageFromTree = useCallback(
		(target: string) => {
			if (activePageRef.current !== target) {
				recordDeparture();
				switchToPage(target);
				return;
			}
			clearCanvasSelection();
		},
		[clearCanvasSelection, recordDeparture, switchToPage],
	);

	// a page deleted on disk cannot stay active: snap back to the root page
	useEffect(() => {
		if (!loaded) return;
		if (resolveActivePage(activePage, pages) !== activePage) switchToPage(ROOT_PAGE);
	}, [loaded, activePage, pages, switchToPage]);

	/**
	 * An entered walk: fresh boot for the target (#5), session carried, camera
	 * pans — and when the target lives on another page, the page follows the
	 * walk (#39): cross-page links are legal, journeys hand off to each other.
	 */
	const walkTo = useCallback(
		(target: string, session: SessionRecord | null) => {
			recordDeparture();
			const across = allFramesRef.current.find((f) => f.name === target);
			if (across !== undefined && pageOf(across) !== activePageRef.current) {
				switchToPage(pageOf(across), arrivalAt(across));
			}
			walkSession.current = session;
			walkTarget.current = target;
			// arrival is instant — entered (and its chip) must name the frame whose
			// time runs the moment the walk lands
			setEntered(target);
			setSelected([]);
			setPicked([]);
			const frame = framesRef.current.find((f) => f.name === target);
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (frame !== undefined && viewport !== null && cam !== null) {
				animateCamera(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
			}
			// The reboot must not read as a reload (#28), and nothing stands between
			// the click and it (#110): the arrival's cover is the target's *stored*
			// still, which coverPlan already reaches for. A capture taken here would
			// cost the walk a mounted target's whole settle window, and hold up the
			// state you are leaving — #5 reboots the target, so the stored still, a
			// picture of a freshly booted frame, is the one that tells the truth.
			setWalkArrivals((current) => (current.has(target) ? current : new Set(current).add(target)));
			// screen scripts run fresh on every arrival — reboot even a warm target
			setDocNonces((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
		},
		[recordDeparture, animateCamera, switchToPage, arrivalAt],
	);

	/** Land a jump: another page arrives through switchToPage; the same page flies, leaving any entered frame. */
	const arriveAtJump = useCallback(
		(entry: JumpEntry) => {
			if (entry.page !== activePageRef.current) {
				switchToPage(entry.page, entry.camera);
				return;
			}
			if (enteredRef.current !== null) exitEntered();
			setMenu(null);
			animateCamera(entry.camera);
		},
		[switchToPage, exitEntered, animateCamera],
	);

	const jumpBack = useCallback(() => {
		const from = jumpSpot();
		if (from === undefined) return;
		const taken = takeBack(jumpList.current, from, new Set([ROOT_PAGE, ...pagesRef.current]));
		if (taken === undefined) return;
		jumpList.current = taken.jumps;
		arriveAtJump(taken.entry);
	}, [jumpSpot, arriveAtJump]);

	const jumpForward = useCallback(() => {
		const from = jumpSpot();
		if (from === undefined) return;
		const taken = takeForward(jumpList.current, from, new Set([ROOT_PAGE, ...pagesRef.current]));
		if (taken === undefined) return;
		jumpList.current = taken.jumps;
		arriveAtJump(taken.entry);
	}, [jumpSpot, arriveAtJump]);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		return subscribeSse(`/api/p/${encodeURIComponent(project)}/events`, {
			change: (data) => {
				const event = data as { kind: string; frame?: string; frames?: string[]; cover?: Cover };
				if (event.kind === "frame" && event.frame !== undefined) {
					const frame = event.frame;
					reloadFrameDocument(frame);
					void refetchFrames();
					// an edit moves the graph: edges re-derive, verified marks may drop —
					// walks themselves stay canvas-silent (#34): they cannot move the map
					void refetchFlows();
				} else if (event.kind === "resolved") {
					// a render pass filled dark targets: unlike a walk, this really
					// does add edges, so the graph must be re-read
					void refetchFlows();
				} else if (event.kind === "shared") {
					// a shared file the link graph has read names its own readers (#109);
					// anything it could not name can stale every document
					const staled = event.frames;
					if (staled === undefined) {
						setDocNonces((current) => {
							const next: Record<string, number> = { ...current };
							for (const frame of framesRef.current) next[frame.name] = (next[frame.name] ?? 0) + 1;
							return next;
						});
						setWalkArrivals((current) => (current.size === 0 ? current : new Set<string>()));
						setPicked([]);
						pickedChain.current = null;
					} else {
						for (const frame of staled) reloadFrameDocument(frame);
					}
					void refetchFrames();
					// a shared source file moves the graph as surely as a frame's own
					void refetchFlows();
				} else if (event.kind === "geometry") {
					// another browser's hands (or our own echo); ours are the truth
					// while a gesture or an un-flushed nudge is in flight
					if (
						(gesture.current.kind === "idle" || gesture.current.kind === "pan") &&
						nudgeDirty.current.size === 0
					) {
						void refetchFrames();
					}
				} else if (event.kind === "thumb" && event.frame !== undefined) {
					// the image rides the event; only a cover the daemon could not
					// read back costs a projection read
					if (event.cover !== undefined) noteCover(event.frame, event.cover);
					else void refetchFrames();
				}
			},
		});
	}, [project, refetchFrames, refetchFlows, noteCover, reloadFrameDocument]);

	// the frame protocol: loaded/error/shot route into the lifecycle, session?
	// answers with the carried walk session, go/back move the entered state
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = parseFrameMessage(event.data);
			if (message === undefined) return;
			if (!ownsFrameMessage(iframes.current, message.frame, event.source)) return;
			switch (message.spool) {
				case "copy": {
					const source = event.source as WindowProxy;
					const blocked = departedFrameDocuments.current.has(message.frame);
					const sourceKind = allFramesRef.current.find((candidate) => candidate.name === message.frame)?.kind;
					if (!clipboardCopyAllowed(sourceKind, enteredRef.current === message.frame, blocked)) {
						rejectClipboardCopy(
							message,
							(result) => source.postMessage(result, "*"),
							new DOMException(
								blocked
									? "Clipboard writes resume when this frame is entered again"
									: "Clipboard writes require an entered frame",
								"AbortError",
							),
						);
						return;
					}
					fulfillClipboardCopy(message, (result) => source.postMessage(result, "*"));
					return;
				}
				case "loaded":
					lifecycleRef.current.noteLoaded(message.frame);
					// a completed boot retires its walk cover — later reboots are honest
					setWalkArrivals((current) => withoutFrame(current, message.frame));
					// the keyboard follows the walk: an entered frame owns it (#28)
					if (enteredRef.current === message.frame) iframes.current.get(message.frame)?.focus();
					// a fresh document renders fresh elements: re-anchor its arrows (#34)
					requestSiteBoxes(message.frame);
					return;
				case "capture-source":
					lifecycleRef.current.noteCaptureSource(message, event.source);
					return;
				case "shot":
					// Pre-ID capture replies cannot complete an ID-bound request.
					return;
				case "error":
					console.warn(`spool: frame "${message.frame}" reported:`, message.error);
					// a walk boot that broke falls back to the honest cover: the quiet
					// still must not dress a dead document as a settled one (#28)
					setWalkArrivals((current) => withoutFrame(current, message.frame));
					return;
				case "session?": {
					const record = walkTarget.current === message.frame ? walkSession.current : null;
					(event.source as WindowProxy | null)?.postMessage(sessionReply(record), "*");
					return;
				}
				case "external":
					if (enteredRef.current === message.frame) {
						setExternalLink({ frame: message.frame, href: message.href });
					}
					return;
				case "picked": {
					const waiter = pickWaiters.current.get(message.id);
					pickWaiters.current.delete(message.id);
					waiter?.(message.chain);
					return;
				}
				case "site-boxes": {
					// only the newest request per frame applies — a slow reply from a
					// superseded document must not re-anchor arrows to dead geometry
					if (siteBoxExpected.current.get(message.frame) !== message.id) return;
					siteBoxExpected.current.delete(message.frame);
					setSiteBoxes((current) => ({ ...current, [message.frame]: message.boxes }));
					return;
				}
				case "key":
					// an entered frame owns the keyboard; the shim forwards what the
					// canvas must never lose — from any frame: a walked-away source
					// legitimately still holds focus, and its chord means the same
					// thing (#28). The jump chords join Esc there (#166): mid-walk,
					// inside a frame, is exactly where ctrl+o is owed. Each chord
					// runs its register entry, so the relay can never drift from
					// what the same key does out here.
					if (message.key === "Escape") runHotkey("canvas.leave");
					else if (message.key === "ctrl+o") runHotkey("canvas.jump-back");
					else if (message.key === "ctrl+i") runHotkey("canvas.jump-forward");
					return;
				case "modifier":
					// the frame names the key that moved; which one is accel is the
					// canvas's rule, so the other platform's modifier is ignored here
					if (enteredRef.current === message.frame && message.modifier === accelKeyName()) {
						setAccelDown(message.held);
					}
					return;
				case "pan": {
					// the middle-button drag the shim kept for us: pan without leaving
					if (enteredRef.current !== message.frame) return;
					if (message.phase === "end") {
						framePan.current = null;
						setPanning(false);
						return;
					}
					if (message.phase === "start") {
						stopAnimation();
						setMenu(null);
						framePan.current = { x: message.x, y: message.y };
						setPanning(true);
						return;
					}
					const last = framePan.current;
					if (last === null) return;
					const dx = message.x - last.x;
					const dy = message.y - last.y;
					framePan.current = { x: message.x, y: message.y };
					setCamera((c) => (c === null ? c : { ...c, x: c.x + dx, y: c.y + dy }));
					return;
				}
				case "zoom": {
					// Entered frames own pointer + keyboard input, and those events do
					// not cross an iframe boundary. The frame shim claims browser-zoom
					// gestures and hands them back here as canvas camera intents.
					if (enteredRef.current !== message.frame) return;
					stopAnimation();
					setMenu(null);
					if (message.kind === "wheel") {
						const iframe = iframes.current.get(message.frame);
						const viewport = viewportRef.current;
						if (iframe === undefined || viewport === null) return;
						const frameRect = iframe.getBoundingClientRect();
						const viewportRect = viewport.getBoundingClientRect();
						const cameraScale = cameraRef.current?.k ?? 1;
						const scaleX = iframe.clientWidth > 0 ? frameRect.width / iframe.clientWidth : cameraScale;
						const scaleY = iframe.clientHeight > 0 ? frameRect.height / iframe.clientHeight : cameraScale;
						zoomAtPoint(
							frameRect.left - viewportRect.left + message.x * scaleX,
							frameRect.top - viewportRect.top + message.y * scaleY,
							wheelZoomFactor(message.deltaY, message.deltaMode, viewport.clientHeight),
						);
						return;
					}
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, message.kind === "in" ? K_STEP : 1 / K_STEP, true);
					return;
				}
				case "go":
				case "back": {
					const source = event.source as WindowProxy;
					const active = enteredRef.current === message.frame;
					const sourceKind = allFramesRef.current.find((candidate) => candidate.name === message.frame)?.kind;
					const targetExists = allFramesRef.current.some((candidate) => candidate.name === message.target);
					const rejection = walkRejectionReason(
						message,
						sourceKind,
						active,
						targetExists,
						departedFrameDocuments.current.has(message.frame),
					);
					if (rejection !== undefined) {
						if (message.id !== undefined) {
							source.postMessage(walkRejected(message.frame, message.id, rejection), "*");
						}
						return;
					}
					// a forward walk in the entered state really happened — witness it (#25)
					if (message.spool === "go") postWalk(project, message.frame, message.target);
					if (message.id !== undefined) departedFrameDocuments.current.add(message.frame);
					walkTo(message.target, message.session ?? null);
					if (message.id !== undefined) {
						source.postMessage(walkAccepted(message.frame, message.id), "*");
					}
					return;
				}
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [project, walkTo, stopAnimation, zoomAtPoint, viewportCenter, requestSiteBoxes]);

	// wheel: pan; ctrl/cmd-wheel (and pinch): zoom at the cursor — bake-off feel
	useEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			stopAnimation();
			setMenu(null);
			const dx = wheelPixels(event.deltaX, event.deltaMode, el.clientHeight);
			const dy = wheelPixels(event.deltaY, event.deltaMode, el.clientHeight);
			if (event.ctrlKey || event.metaKey) {
				const rect = el.getBoundingClientRect();
				zoomAtPoint(
					event.clientX - rect.left,
					event.clientY - rect.top,
					wheelZoomFactor(event.deltaY, event.deltaMode, el.clientHeight),
				);
			} else {
				setCamera((c) =>
					c === null ? c : event.shiftKey && dx === 0 ? { ...c, x: c.x - dy } : { ...c, x: c.x - dx, y: c.y - dy },
				);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [stopAnimation, zoomAtPoint]);

	// Camera motion is a React value for drawing only. The lifecycle reads its ref
	// after this short quiet window, so frames mount where the camera stopped
	// rather than throughout the gesture. The same window is the whole of "the
	// camera is moving": live frames hold their animations across it (#171).
	useEffect(() => {
		if (camera === null) return;
		noteCameraMoving(true);
		const settle = setTimeout(() => {
			settledCameraRef.current = camera;
			noteCameraMoving(false);
			sweepLifecycle();
		}, LIFECYCLE_CAMERA_SETTLE_MS);
		return () => clearTimeout(settle);
	}, [camera, sweepLifecycle, noteCameraMoving]);

	// persist arrows + the page bookkeeping on settle: last-settle wins
	// the stored slot (#12); each page keeps its own camera, and the active
	// page rides along so reopening resumes it (#39)
	useEffect(() => {
		if (camera === null) return;
		const settle = setTimeout(() => {
			cameras.current = { ...cameras.current, [activePage]: { x: camera.x, y: camera.y, k: camera.k } };
			putCanvasState(project, {
				arrows: arrowsOn,
				...stateCameraSlots(cameras.current),
				...(activePage === ROOT_PAGE ? {} : { activePage }),
			});
		}, SETTLE_PERSIST_MS);
		return () => clearTimeout(settle);
	}, [camera, arrowsOn, project, activePage]);

	// --- gestures ---------------------------------------------------------------

	const localPoint = (event: { clientX: number; clientY: number }): Point => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	};

	const frameAtWorld = (p: Point): string | null => {
		const list = framesRef.current;
		for (let i = list.length - 1; i >= 0; i--) {
			const f = list[i];
			if (f !== undefined && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f.name;
		}
		return null;
	};

	const datasetHit = (target: EventTarget | null, attribute: string): string | null => {
		if (!(target instanceof Element)) return null;
		return target.closest<HTMLElement>(`[data-${attribute}]`)?.dataset[camelize(attribute)] ?? null;
	};

	/** A world point in a frame's own coordinates — what every pick verb takes. */
	const frameLocalAt = (name: string, world: Point): Point | null => {
		const frame = framesRef.current.find((f) => f.name === name);
		return frame === undefined ? null : { x: world.x - frame.x, y: world.y - frame.y };
	};

	/**
	 * The hover previews (#37), on throttled pointer-move: holding ⌘ outlines
	 * the would-be deepest target under the cursor; inside an element scope,
	 * plain hover outlines the at-depth target in the scope's own frame.
	 */
	const hoverPickAt = (frame: string | null, world: Point, deepest: boolean) => {
		const scopeFrame = pickedRef.current[pickedRef.current.length - 1]?.frame;
		if (frame === null || !(deepest || frame === scopeFrame)) {
			setPreview(null);
			return;
		}
		const now = performance.now();
		if (hoverBusy.current || now - hoverLast.current < HOVER_PICK_MS) return;
		const local = frameLocalAt(frame, world);
		if (local === null) return;
		hoverLast.current = now;
		hoverBusy.current = true;
		beginPick(
			frame,
			local,
			(chain) => {
				hoverBusy.current = false;
				if (gesture.current.kind !== "idle" || toolRef.current !== "select") return;
				// a deep hover is ⌘'s: let go while the frame was answering and
				// the answer is stale, so it must not redraw the preview
				if (deepest && !accelDownRef.current) return;
				const target = deepest ? chain[chain.length - 1] : atDepthIn(frame, chain);
				setPreview(
					target === undefined
						? null
						: { frame, selector: target.selector, rect: target.rect, radius: target.radius },
				);
			},
			() => {
				hoverBusy.current = false;
			},
		);
	};

	const cancelGesture = useCallback(() => {
		const active = gesture.current;
		gesture.current = { kind: "idle" };
		setGuides(NO_GUIDES);
		setMarquee(null);
		setResizeCursor(null);
		setPanning(false);
		if (active.kind === "move") {
			setFrames((current) =>
				current.map((frame) => {
					const origin = active.origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x, y: origin.y };
				}),
			);
		} else if (active.kind === "resize") {
			setFrames((current) =>
				current.map((frame) => (frame.name === active.frame ? { ...frame, ...active.origin } : frame)),
			);
		}
	}, []);

	const originsOf = (names: readonly string[]): Map<string, Point> => {
		const origins = new Map<string, Point>();
		for (const frame of framesRef.current) {
			if (names.includes(frame.name)) origins.set(frame.name, { x: frame.x, y: frame.y });
		}
		return origins;
	};

	// the rects a move began from — origins carry x/y, a move never changes size
	const moveBefore = (origins: ReadonlyMap<string, Point>): Record<string, Geometry> => {
		const before: Record<string, Geometry> = {};
		for (const frame of framesRef.current) {
			const origin = origins.get(frame.name);
			if (origin !== undefined) before[frame.name] = { x: origin.x, y: origin.y, w: frame.w, h: frame.h };
		}
		return before;
	};

	const onPointerDown = (event: React.PointerEvent) => {
		if (exportDialogRef.current !== null) return;
		const cam = cameraRef.current;
		if (cam === null || event.button === 2) return;
		stopAnimation();
		setMenu(null);
		setPreview(null); // the press supersedes the hover; its own answer redraws
		hideFrameHover();
		cancelPicks(); // a new press voids earlier picks; its own start a fresh generation
		flushNudge(); // a pending nudge settles before a new gesture captures origins
		const p = localPoint(event);
		const panningIntent = event.button === 1 || (event.button === 0 && toolRef.current === "hand");
		viewportRef.current?.setPointerCapture(event.pointerId);

		if (panningIntent) {
			event.preventDefault();
			gesture.current = { kind: "pan", lastX: p.x, lastY: p.y };
			setPanning(true);
			return;
		}

		// A live frame owns its own presses. The canvas only sees one when the
		// accel modifier has borrowed its pointer to reach an element, so that
		// modifier must not read as leaving.
		if (enteredRef.current !== null && !accelPressed(event)) {
			const hit = frameAtWorld(toWorld(p, cam));
			if (hit === enteredRef.current) return; // the pointer is the frame's now
			exitEntered();
		}

		if (event.button !== 0) return;

		// resize handles first: they overhang the frame and own the pointer
		const handleHit = datasetHit(event.target, "handle");
		const handle = handleHit !== null && isHandle(handleHit) ? handleHit : null;
		const single = selectedRef.current.length === 1 ? (selectedRef.current[0] ?? null) : null;
		if (handle !== null && single !== null) {
			const frame = framesRef.current.find((f) => f.name === single);
			if (frame !== undefined) {
				const anchor = {
					x: handle.includes("w") ? frame.x + frame.w : frame.x,
					y: handle.includes("n") ? frame.y + frame.h : frame.y,
				};
				gesture.current = {
					kind: "resize",
					frame: single,
					handle,
					anchor,
					origin: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
				};
				setResizeCursor(HANDLE_CURSORS[handle]);
				return;
			}
		}

		const world = toWorld(p, cam);
		const label = datasetHit(event.target, "frame-label");
		const hit = label ?? frameAtWorld(world);

		if (hit === null) {
			if (toolRef.current === "hand") {
				setSelected([]);
				setPicked([]);
				return;
			}
			// empty canvas: a clean click clears, a drag draws the marquee
			const base = event.shiftKey ? selectedRef.current : [];
			if (!event.shiftKey) {
				setSelected([]);
				setPicked([]);
			}
			gesture.current = { kind: "marquee", start: p, base };
			return;
		}

		// inside an element scope, shift toggles membership (#37): the at-depth
		// target under the cursor, or with accel the deepest — the two hover previews
		if (toolRef.current === "select" && event.shiftKey && pickedRef.current.length > 0 && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) togglePickAt(hit, local, accelPressed(event));
			return;
		}

		if (event.shiftKey) {
			// shift-click: add/remove, never a drag
			setPicked([]);
			setSelected((current) => (current.includes(hit) ? current.filter((name) => name !== hit) : [...current, hit]));
			return;
		}

		// accel-click in Select deep-selects the element under the cursor (Figma).
		// The modifier is exclusive, never a union: on the Mac ctrl-click is the
		// context menu's, so accepting either would fire both.
		if (toolRef.current === "select" && accelPressed(event) && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) deepSelectAt(hit, local);
			return;
		}

		// A bare click takes the frame and nothing inside it: elements are ⌘'s.
		// The one exception is an element scope already open on this frame —
		// there, plain clicks keep moving the selection at that depth (#37).
		// Either can promote to a frame move once the pointer crosses the
		// drag threshold.
		const anchor = pickedRef.current[pickedRef.current.length - 1];
		if (toolRef.current === "select" && label === null) {
			const scoped = anchor !== undefined && anchor.frame === hit;
			if (scoped) {
				const local = frameLocalAt(hit, world);
				if (local !== null) scopedSelectAt(hit, local);
			}
			const names = selectedRef.current.includes(hit) ? [...selectedRef.current] : [hit];
			if (!scoped) {
				setSelected(names);
				setPicked([]);
			}
			gesture.current = { kind: "pending", names, origins: originsOf(names), start: p };
			return;
		}

		const wasSelected = selectedRef.current.includes(hit);
		const names = wasSelected ? [...selectedRef.current] : [hit];
		if (!wasSelected) {
			setSelected([hit]);
			setPicked([]);
		}
		gesture.current = { kind: "pending", names, origins: originsOf(names), start: p };
	};

	const onPointerMove = (event: React.PointerEvent) => {
		const active = gesture.current;
		const cam = cameraRef.current;
		if (cam === null) return;
		const p = localPoint(event);

		if (active.kind === "idle") {
			// idle motion previews the frame and, under ⌘ or a scope, its element
			if (toolRef.current !== "select" || menuOpenRef.current || event.pointerType === "touch") {
				hideFrameHover();
				return;
			}
			const world = toWorld(p, cam);
			const label = datasetHit(event.target, "frame-label");
			const frame = label ?? frameAtWorld(world);
			setHovered((current) =>
				frame === null
					? current === null || !current.visible
						? current
						: { frame: current.frame, visible: false }
					: current?.frame === frame && current.visible
						? current
						: { frame, visible: true },
			);
			hoverPickAt(label === null ? frame : null, world, accelPressed(event));
			return;
		}

		if (active.kind === "pan") {
			const dx = p.x - active.lastX;
			const dy = p.y - active.lastY;
			gesture.current = { ...active, lastX: p.x, lastY: p.y };
			setCamera((c) => (c === null ? c : { ...c, x: c.x + dx, y: c.y + dy }));
			return;
		}

		if (active.kind === "pending") {
			if (Math.hypot(p.x - active.start.x, p.y - active.start.y) < DRAG_THRESHOLD_PX) return;
			// a drag is an arrange (#7): it moves frames, so element scope ends
			cancelPicks();
			setSelected(active.names);
			setPicked([]);
			gesture.current = { kind: "move", names: active.names, origins: active.origins, start: active.start };
			onPointerMove(event);
			return;
		}

		if (active.kind === "move") {
			const rawX = (p.x - active.start.x) / cam.k;
			const rawY = (p.y - active.start.y) / cam.k;
			const movingBoxes: Box[] = [];
			for (const frame of framesRef.current) {
				const origin = active.origins.get(frame.name);
				if (origin !== undefined)
					movingBoxes.push({ x: origin.x + rawX, y: origin.y + rawY, w: frame.w, h: frame.h });
			}
			if (movingBoxes.length === 0) return;
			const statics = framesRef.current.filter((f) => !active.origins.has(f.name));
			const snap = snapMovedBox(boundsOf(movingBoxes), statics, SNAP_THRESHOLD_PX / cam.k);
			const dx = rawX + snap.dx;
			const dy = rawY + snap.dy;
			setGuides({ v: snap.v, h: snap.h });
			setFrames((current) =>
				current.map((frame) => {
					const origin = active.origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x + dx, y: origin.y + dy };
				}),
			);
			return;
		}

		if (active.kind === "marquee") {
			const rect = normalizedRect(active.start, p);
			setMarquee(rect);
			const world = {
				x: (rect.x - cam.x) / cam.k,
				y: (rect.y - cam.y) / cam.k,
				w: rect.w / cam.k,
				h: rect.h / cam.k,
			};
			const swept = framesRef.current.filter((f) => intersects(world, f)).map((f) => f.name);
			const next = [...new Set([...active.base, ...swept])];
			setSelected((current) => (sameNames(current, next) ? current : next));
			return;
		}

		if (active.kind === "resize") {
			const world = toWorld(p, cam);
			const { handle, anchor, origin } = active;
			// the dragged edges snap like moves do; a min-size clamp beats the snap
			// and drops its guides — a line must never point at an edge that isn't there
			const statics = framesRef.current.filter((f) => f.name !== active.frame);
			const threshold = SNAP_THRESHOLD_PX / cam.k;
			let { x, y, w, h } = origin;
			let vGuides: number[] = [];
			let hGuides: number[] = [];
			if (handle.includes("w") || handle.includes("e")) {
				const snap = snapEdge(world.x, statics, "x", threshold);
				let edge = snap.value;
				vGuides = snap.guides;
				if (handle.includes("w")) {
					const limit = anchor.x - MIN_FRAME_SIZE;
					if (edge > limit) {
						edge = limit;
						vGuides = [];
					}
					x = edge;
					w = anchor.x - edge;
				} else {
					const limit = anchor.x + MIN_FRAME_SIZE;
					if (edge < limit) {
						edge = limit;
						vGuides = [];
					}
					x = anchor.x;
					w = edge - anchor.x;
				}
			}
			if (handle.includes("n") || handle.includes("s")) {
				const snap = snapEdge(world.y, statics, "y", threshold);
				let edge = snap.value;
				hGuides = snap.guides;
				if (handle.includes("n")) {
					const limit = anchor.y - MIN_FRAME_SIZE;
					if (edge > limit) {
						edge = limit;
						hGuides = [];
					}
					y = edge;
					h = anchor.y - edge;
				} else {
					const limit = anchor.y + MIN_FRAME_SIZE;
					if (edge < limit) {
						edge = limit;
						hGuides = [];
					}
					y = anchor.y;
					h = edge - anchor.y;
				}
			}
			// a terminal resizes in its own units (#42): whole cells, and a cell
			// snap that moved an edge drops that axis's guides like the clamp does
			if (framesRef.current.find((f) => f.name === active.frame)?.kind === "term") {
				const snapped = snapPxToCells(w, h);
				if (snapped.w !== w) vGuides = [];
				if (snapped.h !== h) hGuides = [];
				if (handle.includes("w")) x = anchor.x - snapped.w;
				if (handle.includes("n")) y = anchor.y - snapped.h;
				w = snapped.w;
				h = snapped.h;
			}
			setGuides({ v: vGuides, h: hGuides });
			const box = { x, y, w, h };
			setFrames((current) => current.map((frame) => (frame.name === active.frame ? { ...frame, ...box } : frame)));
		}
	};

	const onPointerUp = () => {
		const active = gesture.current;
		gesture.current = { kind: "idle" };
		setPanning(false);
		setGuides(NO_GUIDES);
		setMarquee(null);
		setResizeCursor(null);
		if (active.kind === "move") commitGeometry(active.names, moveBefore(active.origins));
		if (active.kind === "resize") commitGeometry([active.frame], { [active.frame]: active.origin });
	};

	/**
	 * Double-click is how you go inside a frame — the gesture every nested
	 * object in software already answers to. Structural descent does not need
	 * it: ⌘-click lands on the deepest element in one go and Escape climbs
	 * back down, which is the same round trip in fewer gestures.
	 */
	const onDoubleClick = (event: React.MouseEvent) => {
		if (exportDialogRef.current !== null) return;
		if (toolRef.current !== "select") return;
		const cam = cameraRef.current;
		if (cam === null) return;
		const hit = datasetHit(event.target, "frame-label") ?? frameAtWorld(toWorld(localPoint(event), cam));
		if (hit === null || hit === enteredRef.current) return;
		cancelGesture();
		enterFrame(hit);
	};

	const onContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		if (exportDialogRef.current !== null) return;
		const cam = cameraRef.current;
		if (cam === null) return;
		const p = localPoint(event);
		const world = toWorld(p, cam);
		const hit = datasetHit(event.target, "frame-label") ?? frameAtWorld(world);
		hideFrameHover();
		setPreview(null);
		if (hit === null) {
			setMenu(null);
			return;
		}
		if (enteredRef.current !== null) exitEntered();
		const elementSelection = pickedRef.current.some((pick) => pick.frame === hit);
		if (!elementSelection && !selectedRef.current.includes(hit)) {
			setSelected([hit]);
			setPicked([]);
		}
		// A context click acts on the existing frame selection. Element picking
		// belongs to Select's click, double-click and ⌘-click gestures.
		cancelPicks();
		const menuSize = contextMenuSize(!elementSelection);
		const viewport = viewportRef.current;
		const x = viewport === null ? p.x : Math.min(p.x, viewport.clientWidth - menuSize.w - 8);
		const y = viewport === null ? p.y : Math.min(p.y, viewport.clientHeight - menuSize.h - 8);
		setMenu({ x, y, frame: hit, selection: elementSelection ? "element" : "frames" });
	};

	const openEditorFor = useCallback(
		(target: { path: string; line?: number }) => {
			openInEditor(project, target.path, target.line);
		},
		[project],
	);

	/** The page a named frame sits on — the root page when it is unknown. */
	const framePageOf = (name: string): string => {
		const frame = allFramesRef.current.find((f) => f.name === name);
		return frame === undefined ? ROOT_PAGE : pageOf(frame);
	};

	/**
	 * Where a row in the agent rail pointing at a frame gets answered (#194).
	 *
	 * A row can only ring a frame that is on screen, and a thread is not bound to a page,
	 * so for most rows the frame is somewhere else. Then the answer is the page it is on,
	 * lit in the Pages rail — pointing is answered wherever the answer can be drawn, and
	 * the two cases are exclusive by construction.
	 */
	const pointedFrame = pointed !== null && visibleFrames.some((frame) => frame.name === pointed) ? pointed : null;
	const pointedPage = pointed === null || pointedFrame !== null ? null : framePageOf(pointed);

	/**
	 * The cursor out on the canvas, over something the strip is already holding a chip
	 * for (#116).
	 *
	 * Only over a thing that is pointed at — an ordinary hover across the canvas lights
	 * nothing in the composer, because a chip that lit for a frame nobody picked would
	 * be claiming it was in the prompt.
	 */
	const litOut =
		effectiveTool !== "select"
			? null
			: preview !== null && picked.some((pick) => pick.frame === preview.frame && pick.selector === preview.selector)
				? pickKey(preview.frame, preview.selector)
				: hovered !== null && (selected.includes(hovered.frame) || entered === hovered.frame)
					? hovered.frame
					: null;

	/** Land on a frame by name: switch page if needed, select it, centre the camera. */
	const landOnFrame = useCallback(
		(name: string) => {
			const frame = allFramesRef.current.find((candidate) => candidate.name === name);
			if (frame === undefined) return;
			recordDeparture();
			if (pageOf(frame) !== activePageRef.current) switchToPage(pageOf(frame), arrivalAt(frame));
			setPicked([]);
			pickedChain.current = null;
			setSelected([frame.name]);
			frameAnchor.current = frame.name;
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (viewport !== null && cam !== null) {
				animateCamera(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
			}
		},
		[recordDeparture, switchToPage, arrivalAt, animateCamera],
	);

	// --- keys -------------------------------------------------------------------

	const menuOpenRef = useRef(false);
	menuOpenRef.current = menu !== null;
	const exportingRef = useRef(exporting);
	exportingRef.current = exporting;

	useEffect(() => {
		const pickTarget = () => [...new Set(pickedRef.current.map((pick) => pick.frame))];
		/**
		 * The frames a menu verb acts on from the keyboard: the selection, or
		 * the frames behind an element pick. Inside an entered frame there are
		 * none — the keys belong to the prototype then, never to the canvas.
		 */
		const verbTarget = () => {
			if (enteredRef.current !== null) return [];
			return selectedRef.current.length > 0 ? [...selectedRef.current] : pickTarget();
		};
		const gestureStill = () => gesture.current.kind === "idle" || gesture.current.kind === "pan";
		const zoomStep = (event: KeyboardEvent | undefined, factor: number) => {
			// the accel chords must eat the browser's own page zoom
			if (event !== undefined && (event.metaKey || event.ctrlKey)) event.preventDefault();
			const c = viewportCenter();
			zoomAtPoint(c.x, c.y, factor, true);
		};
		const nudgeArrow = (event: KeyboardEvent | undefined, step: number) => {
			if (event === undefined) return;
			if (enteredRef.current !== null || selectedRef.current.length === 0) return;
			event.preventDefault();
			const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
			const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
			nudge(dx, dy);
		};
		// every canvas entry in the register answers here, or the map fails to
		// compile — the handlers gate on state, the register never does
		const handlers = {
			"canvas.accel-hold": () => setAccelDown(true),
			"canvas.space-hold": (event) => {
				if (event === undefined) return;
				if (!event.repeat) setSpaceDown(true);
				event.preventDefault();
			},
			// the jump list rides the literal control key on every platform —
			// vim's own chords, the keyboard-first story's first landing (#166)
			// — and ⌃O must eat the browser's open-file dialog
			"canvas.jump-back": (event) => {
				event?.preventDefault();
				jumpBack();
			},
			"canvas.jump-forward": (event) => {
				event?.preventDefault();
				jumpForward();
			},
			// ⌘Z answers the trash toast first (#7), then walks the geometry stack
			"canvas.undo": (event) => {
				event?.preventDefault();
				if (pendingTrashRef.current !== null) undoTrash();
				else if (gestureStill()) undoGeometry();
			},
			"canvas.redo": (event) => {
				event?.preventDefault();
				if (gestureStill()) redoGeometry();
			},
			"canvas.zoom-in": (event) => zoomStep(event, K_STEP),
			"canvas.zoom-out": (event) => zoomStep(event, 1 / K_STEP),
			"canvas.zoom-reset": () => resetZoom(),
			// "/" is the filter's door here as on Home, ⌘K beside it — the chord
			// every other palette taught, same door
			"canvas.find": (event) => {
				if (enteredRef.current !== null) return;
				event?.preventDefault();
				setFinding(true);
			},
			// leaving an entered frame: ⌘esc landing canvas-side (#42), or the
			// esc the shim relays out of the frame that owned it
			"canvas.leave": (event) => {
				// the universal step-out (#210): the same chord leaves inline play and
				// leaves an entered frame, and play is the outer of the two
				if (playRef.current !== null) {
					event?.preventDefault();
					leavePlay();
					return;
				}
				if (enteredRef.current === null) return;
				event?.preventDefault();
				exitEntered(true);
			},
			"canvas.fit-all": () => zoomFit(),
			"canvas.fit-selection": () => {
				const names = selectedRef.current.length > 0 ? selectedRef.current : pickTarget();
				const boxes = framesRef.current.filter((f) => names.includes(f.name));
				const viewport = viewportRef.current;
				if (boxes.length > 0 && viewport !== null) {
					animateCamera(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
				}
			},
			// ⇧A tidies the field; one ⌘Z puts every frame back where it was
			"canvas.tidy": (event) => {
				event?.preventDefault();
				if (gestureStill()) arrangeFrames();
			},
			// the threads toggle (#34): persisted per project
			"canvas.threads": () => toggleArrows(),
			"canvas.tool-select": () => setTool("select"),
			"canvas.tool-hand": () => setTool("hand"),
			// the menu's verbs (#7) on bare keys, each acting on the selection;
			// Play wants one frame to open on, whether P or ⇧⏎ asked
			"canvas.play": (event) => {
				const targets = verbTarget();
				const [only] = targets;
				if (targets.length !== 1 || only === undefined) return;
				if (event !== undefined && event.key === "Enter") event.preventDefault();
				playFrame(only);
			},
			"canvas.reload": () => {
				for (const name of verbTarget()) reloadFrameDocument(name);
			},
			"canvas.export": () => openExport(verbTarget(), null),
			"canvas.trash": (event) => {
				const targets = verbTarget();
				if (targets.length === 0) return;
				event?.preventDefault(); // ⌫ must never walk the browser back
				stageTrash(targets);
			},
			// The tool used to split these: Interact stepped between frames,
			// Select nudged. With one pointer tool left, bare arrows nudge the
			// selection (Select's own business) and ⌥ steps to the neighbouring
			// frame — which ⏎ then goes inside (#28).
			"canvas.nudge": (event) => nudgeArrow(event, 1),
			"canvas.nudge-far": (event) => nudgeArrow(event, 10),
			"canvas.step": (event) => {
				if (event === undefined) return;
				if (enteredRef.current !== null || selectedRef.current.length === 0) return;
				event.preventDefault();
				if (selectedRef.current.length !== 1) return;
				const current = framesRef.current.find((frame) => frame.name === selectedRef.current[0]);
				if (current === undefined) return;
				const direction = spatialDirection(event.key);
				if (direction === undefined) return;
				const target = nextSpatialFrame(current, framesRef.current, direction);
				if (target === undefined) return;
				setSelected([target.name]);
				setPicked([]);
				const viewport = viewportRef.current;
				const cam = cameraRef.current;
				if (viewport !== null && cam !== null) {
					animateCamera(centerOn(cam, target, viewport.clientWidth, viewport.clientHeight));
				}
			},
			// ⏎ goes inside; ⇧⏎ is Play's chord, the heavier verb on the modifier
			"canvas.enter": (event) => {
				if (enteredRef.current !== null || selectedRef.current.length !== 1) return;
				const [target] = selectedRef.current;
				if (target === undefined) return;
				event?.preventDefault();
				enterFrame(target);
			},
			"canvas.escape": () => {
				cancelPicks();
				setPreview(null);
				if (!gestureStill()) cancelGesture();
				else if (menuOpenRef.current) setMenu(null);
				else if (enteredRef.current !== null) exitEntered(true);
				else if (pickedRef.current.length > 1) {
					// a multi-selection has no one ancestry: drop to its frames
					const frames = [...new Set(pickedRef.current.map((pick) => pick.frame))];
					pickedChain.current = null;
					setPicked([]);
					setSelected(frames);
				} else if (pickedRef.current[0] !== undefined) {
					// ascend the ancestry (Figma): element → parent → … → frame → clear
					const picked = pickedRef.current[0];
					const held = pickedChain.current;
					const depth =
						held !== null && held.frame === picked.frame
							? held.chain.findIndex((h) => h.selector === picked.selector)
							: -1;
					const parent = depth > 0 ? held?.chain[depth - 1] : undefined;
					if (parent !== undefined) setPicked([{ frame: picked.frame, ...parent }]);
					else {
						setPicked([]);
						setSelected([picked.frame]);
					}
				} else if (selectedRef.current.length > 0) {
					setSelected([]);
				} else if (turnRef.current.phase === "playing") {
					/*
					 * The bottom rung, and the only one this ticket adds (#165).
					 *
					 * Escape in the composer stops a running turn because focus in a text field
					 * is where this ladder never looks. Click onto the canvas to watch a frame
					 * repaint and the key belongs to the ladder again — so it is spent here only
					 * once every rung above it has passed, which is exactly when the press was
					 * going nowhere anyway. Nothing above it moves, and the footer's own press is
					 * the exit that works with a frame still selected.
					 */
					turnRef.current.stop();
				}
			},
		} satisfies Record<HotkeyIdFor<"canvas">, HotkeyHandler>;
		const detachDialog = attachHotkeyLayer({
			scope: "dialog",
			active: () => exportDialogRef.current !== null,
			handlers: {
				"dialog.close": (event) => {
					if (exportingRef.current) return;
					event?.preventDefault();
					cancelExportDialog();
				},
			} satisfies Record<HotkeyIdFor<"dialog">, HotkeyHandler>,
		});
		// the finder owns the keys while it is up, exactly as the export dialog does
		const detachFinder = attachHotkeyLayer({
			scope: "finder",
			active: () => findingRef.current,
			handlers: {
				"finder.close": (event) => {
					event?.preventDefault();
					setFinding(false);
				},
			} satisfies Record<HotkeyIdFor<"finder">, HotkeyHandler>,
		});
		const detachCanvas = attachHotkeyLayer({
			scope: "canvas",
			// A player filling the screen is a live frame, and spool takes no plain
			// key from one (#210). So every canvas binding stands down while play is
			// up; `canvas.leave` is the way out and answers throughout. This gate is
			// belt to the iframe's braces: focus is normally inside the sandbox and
			// these keys never reach this window at all, but the press that started
			// play left focus out here.
			handlers: Object.fromEntries(
				Object.entries(handlers).map(([id, run]) => [
					id,
					id === "canvas.leave"
						? run
						: (event?: KeyboardEvent) => {
								if (playRef.current === null) run?.(event);
							},
				]),
			) as Partial<Record<HotkeyId, HotkeyHandler>>,
		});
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceDown(false);
			// releasing accel outside an element scope ends the deep-hover preview
			if (event.key === accelKeyName()) {
				setAccelDown(false);
				setPreview(null);
			}
		};
		const clearModifiers = () => {
			setAccelDown(false);
			setSpaceDown(false);
			setPreview(null);
		};
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", clearModifiers);
		return () => {
			detachDialog();
			detachFinder();
			detachCanvas();
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", clearModifiers);
		};
	}, [
		viewportCenter,
		zoomAtPoint,
		zoomFit,
		resetZoom,
		animateCamera,
		exitEntered,
		enterFrame,
		nudge,
		undoTrash,
		undoGeometry,
		redoGeometry,
		arrangeFrames,
		reloadFrameDocument,
		openExport,
		stageTrash,
		cancelGesture,
		cancelPicks,
		toggleArrows,
		cancelExportDialog,
		playFrame,
		leavePlay,
		jumpBack,
		jumpForward,
	]);

	// --- chrome (top bar) -------------------------------------------------------

	const zoomPct = camera === null ? 100 : Math.round(camera.k * 100);
	useEffect(() => {
		onChrome({
			zoomPct,
			arrowsOn,
			toggleArrows,
			hasThreads,
			playing: chromeGone,
		});
		return () => onChrome(null);
	}, [zoomPct, onChrome, arrowsOn, toggleArrows, hasThreads, chromeGone]);

	// --- render -------------------------------------------------------------------

	// no frames and no pages anywhere: the project is untouched — the page
	// surface only exists once something does (#39)
	const projectEmpty = loaded && frames.length === 0 && pages.length === 0;
	const k = camera?.k ?? 1;
	const shellRadius = Math.min(12 / k, 24);
	const cursor = resizeCursor ?? (panning ? "grabbing" : effectiveTool === "hand" ? "grab" : "default");

	/**
	 * Every piece of app furniture fades on the same clock for a flight (#210):
	 * the sidebar, the agent rail, the tools, the frame labels, and the top bar
	 * over in `app.tsx`. It goes untouchable as it goes, because the play layer
	 * only starts taking presses once its stage is up.
	 */
	const furniture = {
		opacity: chromeGone ? 0 : 1,
		transitionDuration: `${chromeGone ? PLAY_IN.chrome : PLAY_OUT.chrome}ms`,
		pointerEvents: chromeGone ? ("none" as const) : undefined,
	};

	if (projectEmpty) {
		// agent-first, buttonless (#13): the canvas never pretends hands author frames
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas pb-20">
				<RibbonMark className="h-7 w-[22px] opacity-40" />
				<p className="font-medium text-base text-text leading-base">No frames yet.</p>
				<p className="font-mono text-muted text-sm leading-sm">
					An agent births a frame by writing frames/&lt;name&gt;/frame.tsx
				</p>
				<p className="font-mono text-muted text-xs leading-xs">spool skill · spool url</p>
			</div>
		);
	}

	return (
		<div className="relative flex h-full w-full">
			<div className="relative z-20 flex shrink-0 transition-opacity ease-out" style={furniture}>
				<CanvasSidebar
					pages={pages}
					activePage={activePage}
					frames={navigatorFrames}
					selected={selected}
					onSwitchPage={activatePageFromTree}
					onSelectFrame={selectFrameRow}
					onDoubleClickFrame={flyToFrame}
					// the finder's pick, or the page holding the frame a row in the agent rail is
					// pointing at (#194)
					litPage={finding ? findLit : pointedPage}
				/>
			</div>
			<div
				ref={viewportRef}
				role="application"
				aria-label={`${project} canvas`}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is one keyboard composite; focus returns here from its iframe
				tabIndex={0}
				// clip, never hidden: hidden still leaves a scroll container, and the
				// frame layer gives it thousands of pixels to scroll. Anything a frame
				// document focuses — an authored autoFocus, a tab into an iframe — has
				// the browser reveal it by scrolling this box, which carries the canvas
				// chrome away and offsets every pointer coordinate from the camera's.
				// The camera owns where the canvas sits; nothing else may move it.
				//
				// For the length of a flight this leaves the row and takes the whole
				// window, under the furniture rather than over it, so the zoom carries
				// on across where the rails were as they fade (#210).
				className={cn(
					"touch-none select-none overflow-clip bg-canvas outline-none",
					spanning === null ? "relative h-full min-w-0 flex-1" : "fixed inset-0 z-0",
				)}
				style={{ cursor }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={cancelGesture}
				onPointerLeave={() => {
					setPreview(null);
					hideFrameHover();
				}}
				onDoubleClick={onDoubleClick}
				onContextMenu={onContextMenu}
			>
				{camera !== null && (
					<div
						data-canvas-camera=""
						className="absolute top-0 left-0"
						style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${k})`, transformOrigin: "0 0" }}
					>
						{/* the threads live under the frames: the map, never a hit target */}
						{arrowsOn && <FlowArrows frames={visibleFrames} edges={edges} siteBoxes={siteBoxes} k={k} />}
						{visibleFrames.map((frame) => {
							const state = lifecycle.states[frame.name] ?? "picture";
							const isEntered = entered === frame.name;
							return (
								<div
									key={frame.name}
									className="absolute"
									style={{
										transform: `translate(${frame.x}px, ${frame.y}px)`,
										width: frame.w,
										height: frame.h,
									}}
								>
									<div
										className="relative h-full w-full overflow-hidden"
										style={{ borderRadius: shellRadius }}
									>
										<FrameShell
											project={project}
											name={frame.name}
											state={state}
											ready={lifecycle.ready.has(frame.name)}
											entered={isEntered}
											interactive={isEntered && !accelDown}
											terminal={frame.kind === "term"}
											docNonce={docNonces[frame.name] ?? 0}
											cover={frame.cover}
											terminalCover={frame.terminalCover}
											walkArrival={walkArrivals.has(frame.name)}
											onIframe={onIframe}
										/>
										{externalLink?.frame === frame.name && (
											<ExternalLinkDialog
												href={externalLink.href}
												onStay={() => setExternalLink(null)}
												onOpen={() => setExternalLink(null)}
											/>
										)}
									</div>
								</div>
							);
						})}
						{/* Labels share one layer above every frame. A transformed frame is
						    its own stacking context, so keeping its label inside would let a
						    later neighboring frame paint over the label regardless of the
						    label's own z-index.
						
						    The whole layer dissolves before an inline play flight and comes
						    back after it (#210): a label is counter-scaled to stay 12px, so it
						    cannot ride a zoom that grows its frame to fill the viewport. */}
						<div
							className="transition-opacity ease-out"
							style={{
								opacity: chromeGone ? 0 : 1,
								transitionDuration: `${chromeGone ? PLAY_IN.chrome : PLAY_OUT.chrome}ms`,
							}}
						>
							{visibleFrames.map((frame) => {
								const state = lifecycle.states[frame.name] ?? "picture";
								const isEntered = entered === frame.name;
								const isSelected = selected.includes(frame.name);
								const isHovered =
									effectiveTool === "select" && hovered?.visible === true && hovered.frame === frame.name;
								const paused = frame.kind === "term" && state === "held";
								return (
									<div
										key={`${frame.name}:label`}
										className="pointer-events-none absolute h-0"
										style={{
											transform: `translate(${frame.x}px, ${frame.y}px)`,
											width: frame.w,
										}}
									>
										{/* Mono, muted; thread when selected; ▸ only marks a terminal
										    SIGSTOP. Entered swaps it for the state chip (#28). */}
										<FrameLabel
											name={frame.name}
											frameWidth={frame.w}
											k={k}
											entered={isEntered}
											paused={paused}
											selected={isSelected}
											hovered={isHovered}
											terminal={frame.kind === "term"}
											onPlay={() => playFrame(frame.name)}
										/>
									</div>
								);
							})}
						</div>
						{/* the tags ride over the frames, because pressing one travels —
						    the leaders under them are the map and take no pointer */}
						{arrowsOn && <WalkLayer walks={walks} frames={visibleFrames} k={k} onOpen={landOnFrame} />}
					</div>
				)}

				{camera !== null && (
					// The ring dissolves with the labels before a flight, for its own
					// reason: it is counter-scaled too, so 1.5px of stroke would stay
					// 1.5px while the frame it rings grew to fill the viewport (#210).
					<div
						className="transition-opacity ease-out"
						style={{
							opacity: chromeGone ? 0 : 1,
							transitionDuration: `${chromeGone ? PLAY_IN.chrome : PLAY_OUT.chrome}ms`,
						}}
					>
						<SelectionOverlay
							camera={camera}
							frames={visibleFrames}
							selected={selected}
							entered={entered}
							// a row in the rail pointing at a frame gets the ring the pointer itself
							// would draw, which is the weaker of the two out here: pointing at a frame is
							// a weaker claim than having gone to it, and the accent stays with the
							// selection either way
							hovered={
								pointedFrame !== null
									? { frame: pointedFrame, visible: true }
									: effectiveTool === "select"
										? hovered
										: null
							}
							editable={effectiveTool === "select"}
							picked={picked}
							/*
							 * A chip and the box it names are one object, so the cursor on one marks the
							 * other (#116). Only an element's box takes a mark: a chip can only name a
							 * frame that is selected or entered, and out here that frame is already
							 * ringed at full strength, so there is nothing left to say about it — where
							 * five element outlines look alike and the strip is the only thing that can
							 * say which one a row means.
							 */
							lit={lit}
							preview={effectiveTool === "select" ? preview : null}
							guides={guides}
							marquee={marquee}
							shellRadius={shellRadius}
						/>
					</div>
				)}

				{menu !== null && (
					<ContextMenu
						at={menu}
						tidyLabel={selected.length > 1 ? `Tidy ${selected.length} frames` : "Tidy page"}
						onTidy={() => {
							setMenu(null);
							arrangeFrames();
						}}
						exportAction={
							menu.selection === "element"
								? null
								: {
										selectionCount: selected.includes(menu.frame) ? selected.length : 1,
										onSelect: () => {
											const names = selectedRef.current.includes(menu.frame)
												? [...selectedRef.current]
												: [menu.frame];
											const returnMenu = menu;
											setMenu(null);
											openExport(names, returnMenu);
										},
									}
						}
						onPlay={() => {
							const frame = menu.frame;
							setMenu(null);
							playFrame(frame);
						}}
						onOpenEditor={() => {
							const pick = pickedRef.current.find((candidate) => candidate.frame === menu.frame);
							openEditorFor(
								pick !== undefined
									? editorTarget(pick, framePageOf(pick.frame))
									: { path: frameSourcePath(menu.frame, framePageOf(menu.frame)) },
							);
							setMenu(null);
						}}
						onReload={() => {
							const frame = menu.frame;
							reloadFrameDocument(frame);
							setMenu(null);
						}}
						onTrash={() => {
							const names = selectedRef.current.includes(menu.frame) ? [...selectedRef.current] : [menu.frame];
							setMenu(null);
							stageTrash(names);
						}}
					/>
				)}

				{exportNotice !== null ? <ExportToast notice={exportNotice} /> : null}

				{collisions.length > 0 && <CollisionNotice collisions={collisions} />}

				{pendingTrash !== null && <TrashToast frames={pendingTrash} onUndo={undoTrash} />}
				<div className="transition-opacity ease-out" style={furniture}>
					<CanvasTools tool={effectiveTool} onTool={setTool} />
				</div>
				{finding ? (
					<FindPalette
						frames={navigatorFrames}
						onPick={setFindLit}
						onClose={() => setFinding(false)}
						onLand={(name) => {
							setFinding(false);
							landOnFrame(name);
						}}
					/>
				) : null}
			</div>
			<div className="relative z-20 flex shrink-0 transition-opacity ease-out" style={furniture}>
				<AgentRail
					entries={turn.entries}
					plan={turn.plan}
					phase={turn.phase}
					elapsed={turn.elapsed}
					jump={{
						have: reach.have,
						gone: reach.gone,
						onPoint: setPointed,
						onJump: (name) => {
							// pointing was the question and landing is the answer, so the weaker mark
							// goes as the stronger one arrives
							setPointed(null);
							landOnFrame(name);
						},
					}}
					pointing={{ ...pointing, lit: lit ?? litOut, onLight: setLit, onDrop: dropPointed }}
					threads={{
						list: deck.threads,
						open: deck.open,
						finished: deck.finished,
						onOpen: deck.onOpen,
						onClose: deck.onClose,
						onNew: deck.onNew,
					}}
					install={install}
					login={deck.login}
					queued={turn.queued}
					handback={turn.handback}
					model={model}
					limit={turn.limit}
					onSend={turn.send}
					onQueue={turn.queue}
					onUnqueue={turn.unqueue}
					onStop={turn.stop}
					onAnswer={turn.answer}
				/>
			</div>
			{play !== null && (
				<PlayLayer
					project={project}
					start={play.start}
					phase={play.phase}
					frames={frames}
					onFrame={(frame) =>
						setPlay((current) => (current === null || current.frame === frame ? current : { ...current, frame }))
					}
					onWalked={(from, to) => postWalk(project, from, to)}
					onSettled={() => {
						setPlay((current) =>
							current === null || current.phase !== "flying" ? current : { ...current, phase: "live" },
						);
						// the canvas goes to sleep once the stage has covered it, never
						// while the frame the flight landed on is still being looked at
						window.setTimeout(() => {
							if (playRef.current?.phase === "live") setPictured(true);
						}, PLAY_IN.stage);
					}}
					onExit={leavePlay}
				/>
			)}
			{exportDialog !== null && exportFrames.length > 0 ? (
				<ExportDialog
					exporting={exporting}
					frames={exportFrames.map((frame) => ({
						name: frame.name,
						...(frame.cover === undefined
							? {}
							: { thumbnail: { project, frame: frame.name, cover: frame.cover } }),
					}))}
					{...(exportError === undefined ? {} : { error: exportError })}
					onCancel={cancelExportDialog}
					onExport={(format) => void runExport(exportDialog, format)}
				/>
			) : null}
		</div>
	);
}

function normalizedRect(a: Point, b: Point): Box {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	};
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** The frame names without one of them — same set back when it is absent. */
function withoutFrame(names: ReadonlySet<string>, frame: string): ReadonlySet<string> {
	if (!names.has(frame)) return names;
	const next = new Set(names);
	next.delete(frame);
	return next;
}

/** "frame-label" → "frameLabel": dataset keys camel-case their attribute. */
function camelize(attribute: string): string {
	return attribute.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
