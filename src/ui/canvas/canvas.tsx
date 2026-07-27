import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COVER_RUNGS, type Cover, coverSizes } from "../../cover";
import { fulfillClipboardCopy, rejectClipboardCopy } from "../../runtime/clipboard-host";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import { snapPxToCells } from "../../term/cells";
import type { Camera, FlowEdge, FlowUnreadable, FrameCollision, Geometry, ProjectedFrame } from "../api";
import {
	beaconTrash,
	fetchCanvasState,
	fetchCover,
	fetchFlows,
	fetchProjection,
	fetchStampLabels,
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
import { RibbonMark } from "../icons";
import { arrange } from "./arrange";
import { type Box, boundsOf, centerOn, clamp, fitCamera, intersects, K_STEP, toWorld, zoomAt } from "./camera";
import { type CanvasTool, CanvasTools } from "./canvas-tools";
import type { CoverRaster } from "./capture-broker";
import { CollisionNotice } from "./collision-notice";
import { type ConnectionRow, connectionGroups, outboundCount, unreadableRows } from "./connections";
import { ContextMenu, contextMenuSize } from "./context-menu";
import { buildTreeRows, revealKeys, rowSelectors, type TreeRow, visibleRows } from "./element-tree";
import { ExportDialog, type ExportFormat } from "./export-dialog";
import { type ExportNotice, ExportToast } from "./export-toast";
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
import { type InspectorMode, InspectorRail, type InspectorTarget } from "./inspector";
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
	pickKey,
	SelectionOverlay,
} from "./overlays";
import {
	camerasFromState,
	frameSourcePath,
	frameSourceRel,
	pageOf,
	ROOT_PAGE,
	resolveActivePage,
	stateCameraSlots,
	switchPage,
} from "./pages";
import {
	clipboardCopyAllowed,
	describeMessage,
	type PickedHit,
	parseFrameMessage,
	parseStampRef,
	pickMessage,
	type RawTreeNode,
	type SessionRecord,
	type SiteAnchor,
	sessionReply,
	sitesMessage,
	treeMessage,
	walkRejectionReason,
} from "./protocol";
import { CanvasSidebar, type SelectModifiers } from "./sidebar";
import { snapEdge, snapMovedBox } from "./snap";
import { nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";
import { TrashToast } from "./trash-toast";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with three explicit tools. Interact enters a frame on one
 * clean click; Select picks live DOM and arranges frames; Hand pans. Command
 * and Space borrow Select and Hand while held. Selection keeps Figma's scope
 * grammar: double-click descends, Command-click jumps deepest, Shift toggles,
 * hover previews, and Esc ascends. Selecting into one frame freezes only that
 * document in place. Geometry sidecars are the only canvas writes; frame
 * source remains agent-owned.
 */

export interface CanvasChrome {
	zoomPct: number;
	/** The threads toggle (#34): shown pressed while the map draws. */
	arrowsOn: boolean;
	toggleArrows: () => void;
	/**
	 * Whether this page has a thread to hide: an edge with both ends on it, or
	 * a portal leaving it. The toggle is not drawn otherwise — a switch over
	 * nothing is chrome pretending to be a control (#34/#39).
	 */
	hasThreads: boolean;
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
const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 8;
const MIN_FRAME_SIZE = 40;
const NUDGE_FLUSH_MS = 400;
const SELECTION_PUT_MS = 150;
const PICK_REPLY_MS = 400;
const TREE_REPLY_MS = 1200;
const STAMP_LABEL_BATCH = 256;
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
	// walks whose destination the parser cannot read: named in the rail, never dropped
	const [unreadable, setUnreadable] = useState<FlowUnreadable[]>([]);
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
	const [hovered, setHovered] = useState<FrameHover | null>(null);
	// the hover preview (#37): the element a click would target, outlined live
	const [preview, setPreview] = useState<ElementPreview | null>(null);
	const [externalLink, setExternalLink] = useState<{ frame: string; href: string } | null>(null);
	const [metaDown, setMetaDown] = useState(false);
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
	// the inspector rail (#58): collapsed by default and sticky both ways; its
	// own canvas-edge strip moves it, and elements is the resting tab
	const [railOpen, setRailOpen] = useState(false);
	const [railMode, setRailMode] = useState<InspectorMode>("elements");
	// the elements tab's raw walk of the inspected frame — null for a frame that
	// was asked and never answered — its row expansion, and the call-site labels
	const [trees, setTrees] = useState<Record<string, RawTreeNode[] | null>>({});
	const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(new Set<string>());
	const [callSiteLabels, setCallSiteLabels] = useState<Record<string, string | null>>({});

	// the active page is the canvas: only its frames mount — and frames staged
	// for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useMemo(
		() => frames.filter((f) => pageOf(f) === activePage && !hidden.has(f.name)),
		[frames, activePage, hidden],
	);
	const navigatorFrames = useMemo(() => frames.filter((frame) => !hidden.has(frame.name)), [frames, hidden]);
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
	const framesRef = useRef(visibleFrames);
	framesRef.current = visibleFrames;
	// the whole projection, for cross-page reads: walks, connections, editor paths
	const allFramesRef = useRef(frames);
	allFramesRef.current = frames;
	const activePageRef = useRef(activePage);
	activePageRef.current = activePage;
	// every page's last known camera this session, keyed by page (#39)
	const cameras = useRef<Record<string, Camera>>({});
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const metaDownRef = useRef(metaDown);
	metaDownRef.current = metaDown;
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
	// the walk and describe round-trips (#58), pickWaiters' pattern
	const treeWaiters = useRef(new Map<number, (roots: RawTreeNode[]) => void>());
	const describeWaiters = useRef(new Map<number, (chains: PickedHit[][]) => void>());
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
	// the range anchors: one per list, ranges never cross lists
	const frameAnchor = useRef<string | null>(null);
	const rowAnchor = useRef<{ frame: string; key: string } | null>(null);
	const nudgeDirty = useRef(new Set<string>());
	// where each frame stood when its nudge run began — one undo entry per flush
	const nudgeOrigins = useRef(new Map<string, Geometry>());
	const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const trashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingTrashRef = useRef<string[] | null>(null);
	// the geometry undo/redo stacks: per window, in memory, hands' writes only
	const geometryHistory = useRef(emptyHistory());

	/**
	 * Whether a frame has a still worth standing in for it — the only thing the
	 * lifecycle asks about a picture. A whole ladder, not merely a cover: the
	 * daemon's headless fallback writes one rung, because it has no image library
	 * and cannot resample (#111), and the canvas stands a frame's still in for it
	 * at every zoom now (#112). A frame carrying only the healed rung is soft
	 * everywhere above it, so it is still owed a picture of its own.
	 */
	const hasCover = useCallback(
		(name: string) =>
			framesRef.current.some(
				(f) => f.name === name && f.cover !== undefined && f.cover.widths.length >= COVER_RUNGS,
			),
		[],
	);

	/**
	 * A cover was written — ours or another browser's. The ladder is the frame's
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

	// a settled self-capture persists into design/.spool as the frame's whole ladder
	const onShot = useCallback(
		(frame: string, rungs: CoverRaster[]) => {
			void (async () => {
				try {
					const uploads = await Promise.all(
						rungs.map(async (rung) => ({ width: rung.width, bytes: await (await fetch(rung.url)).blob() })),
					);
					const cover = await putCover(project, frame, uploads);
					if (cover !== undefined) noteCover(frame, cover);
				} catch {
					// a lost capture is re-taken on the next settle
				}
			})();
		},
		[project, noteCover],
	);

	const pickedFrame = picked[picked.length - 1]?.frame;
	const selectedFrame = selected[selected.length - 1];
	// Select freezes what you point at so it cannot move under the cursor. The
	// entered frame is the exception: it runs, and only stops when ⌘ takes the
	// pointer back off it to reach an element.
	const frozenFrame =
		effectiveTool === "select" ? (pickedFrame ?? selectedFrame ?? (metaDown ? entered : null)) : null;
	// what the rail reads: the element scope's frame, else the frame selection,
	// else the frame being used — inside a prototype its elements are the ones
	// worth looking at, so entering must not empty the rail
	const inspectedFrame = pickedFrame ?? selectedFrame ?? entered ?? null;
	// a thread to hide on this page: a drawable, non-self edge with both ends
	// here. Cross-page connections live in the inspector instead (#34/#39/#58).
	const hasThreads = useMemo(() => {
		const here = new Set(visibleFrames.map((entry) => entry.name));
		return edges.some((edge) => edge.from !== edge.to && here.has(edge.from) && here.has(edge.to));
	}, [edges, visibleFrames]);

	const lifecycle = useFrameLifecycle({
		framesRef,
		entered,
		frozen: frozenFrame,
		inspected: railOpen ? inspectedFrame : null,
		hasCover: hasCover,
		onShot,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;

	const reloadFrameDocument = useCallback((frame: string) => {
		setDocNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
		setWalkArrivals((current) => withoutFrame(current, frame));
		// a fresh document renders fresh elements: the cached walk is a lie
		setTrees((current) => without(current, frame));
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
				// an export is the artifact, never the cover: 0 asks for the frame
				// at full device resolution, losslessly, as one rung
				const rungs = await lifecycleRef.current.capture(frame.name, 0);
				const sheet = rungs?.[0];
				if (sheet !== undefined) {
					const png = await pngBytesFromImageBlob(await (await fetch(sheet.url)).blob(), frame.w, frame.h);
					return { name: frame.name, width: frame.w, height: frame.h, png };
				}
			}

			// nothing live to photograph (a terminal, or a frame that would not
			// answer): fall back to the sharpest rung of its stored cover
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
		setUnreadable(flows.unreadable);
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
		(to: Camera, ms = 220) => {
			const from = cameraRef.current;
			if (from === null) return;
			stopAnimation();
			const t0 = performance.now();
			const step = (t: number) => {
				const p = clamp((t - t0) / ms, 0, 1);
				const e = 1 - (1 - p) ** 3;
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
		setMetaDown(false);
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

	/** The player's door (#13/#24): its own tab, always naming its frame. */
	const playFrame = useCallback(
		(name: string) => {
			window.open(
				`/play/${encodeURIComponent(project)}?frame=${encodeURIComponent(name)}`,
				"_blank",
				"noopener,noreferrer",
			);
		},
		[project],
	);

	// --- selection sync (#23): what Liam points at, served to agents ------------

	useEffect(() => {
		const timer = setTimeout(() => {
			if (picked.length > 0) {
				putSelection(project, {
					elements: picked.map(({ frame, selector, outerHtml, source, generated }) => ({
						frame,
						selector,
						outerHtml,
						source,
						generated,
					})),
				});
			} else {
				// Entering is the strongest thing you can say about what you mean,
				// and it clears the selection ring — so it must still be served. The
				// rail already reads it this way; without the same fallback, agents
				// and the player both lose you the moment you step inside a frame.
				putSelection(project, { frames: selected.length > 0 ? selected : entered === null ? [] : [entered] });
			}
		}, SELECTION_PUT_MS);
		return () => clearTimeout(timer);
	}, [project, picked, selected, entered]);

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
		if (changedPage) switchToPage(targetPage);
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
				switchToPage(target);
				return;
			}
			clearCanvasSelection();
		},
		[clearCanvasSelection, switchToPage],
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
			// the arrival is a new document: its walk is owed again
			setTrees((current) => without(current, target));
		},
		[animateCamera, switchToPage, arrivalAt],
	);

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
						setTrees((current) => (Object.keys(current).length === 0 ? current : {}));
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
					// the ladder rides the event; only a cover the daemon could not
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
				case "tree": {
					const waiter = treeWaiters.current.get(message.id);
					treeWaiters.current.delete(message.id);
					waiter?.(message.roots);
					return;
				}
				case "described": {
					const waiter = describeWaiters.current.get(message.id);
					describeWaiters.current.delete(message.id);
					waiter?.(message.chains);
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
					// an entered frame owns the keyboard; the shim forwards the exit
					// key — from any frame: a walked-away source legitimately still
					// holds focus, and its Esc means the same thing (#28)
					if (message.key === "Escape" && enteredRef.current !== null) exitEntered(true);
					return;
				case "modifier":
					if (enteredRef.current === message.frame) setMetaDown(message.held);
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
	}, [project, walkTo, exitEntered, stopAnimation, zoomAtPoint, viewportCenter, requestSiteBoxes]);

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
				if (deepest && !metaDownRef.current) return;
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

		// A live frame owns its own presses — the canvas only ever sees one when
		// ⌘ has frozen it to reach an element, so ⌘ must not read as leaving.
		if (enteredRef.current !== null && !event.metaKey) {
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
		// target under the cursor, or with ⌘ the deepest — the two hover previews
		if (toolRef.current === "select" && event.shiftKey && pickedRef.current.length > 0 && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) togglePickAt(hit, local, event.metaKey);
			return;
		}

		if (event.shiftKey) {
			// shift-click: add/remove, never a drag
			setPicked([]);
			setSelected((current) => (current.includes(hit) ? current.filter((name) => name !== hit) : [...current, hit]));
			return;
		}

		// ⌘-click in Select deep-selects the element under the cursor (Figma);
		// meta only — on the Mac, ctrl-click is the context menu's
		if (toolRef.current === "select" && event.metaKey && label === null) {
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
			hoverPickAt(label === null ? frame : null, world, event.metaKey);
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

	// --- the inspector rail (#58) -----------------------------------------------

	const treeBusy = useRef(new Set<string>());
	const labelsAsked = useRef(new Set<string>());

	/** Ask one frame's shim for its raw DOM walk; the newest answer stands. */
	const requestTree = useCallback((frame: string) => {
		const target = iframes.current.get(frame)?.contentWindow;
		if (target == null || treeBusy.current.has(frame)) return;
		treeBusy.current.add(frame);
		const id = ++pickSeq.current;
		treeWaiters.current.set(id, (roots) => {
			treeBusy.current.delete(frame);
			setTrees((current) => ({ ...current, [frame]: roots }));
		});
		target.postMessage(treeMessage(id), "*");
		setTimeout(() => {
			if (!treeWaiters.current.delete(id)) return;
			// a document that never answered says so, rather than waking forever;
			// its next reload or wake clears this and asks again
			treeBusy.current.delete(frame);
			setTrees((current) => ({ ...current, [frame]: null }));
		}, TREE_REPLY_MS);
	}, []);

	/** Frames with no DOM to walk: a terminal is a cell grid (#42). */
	const walkable = useCallback(
		(frame: string) => allFramesRef.current.find((candidate) => candidate.name === frame)?.kind !== "term",
		[],
	);

	// the elements tab reads one frame: the open rail's, once its boot reports
	useEffect(() => {
		if (!railOpen || railMode !== "elements" || inspectedFrame === null || !walkable(inspectedFrame)) return;
		if (trees[inspectedFrame] === undefined && lifecycle.ready.has(inspectedFrame)) requestTree(inspectedFrame);
	}, [railOpen, railMode, inspectedFrame, trees, lifecycle.ready, requestTree, walkable]);

	// looking is the refresh: a frame being used renders new DOM as it goes, so
	// showing the tab re-reads it. The rows on screen stay until the fresh
	// answer lands — a re-read never flashes the waking line.
	const readyRef = useRef(lifecycle.ready);
	readyRef.current = lifecycle.ready;
	useEffect(() => {
		if (!railOpen || railMode !== "elements" || inspectedFrame === null || !walkable(inspectedFrame)) return;
		if (readyRef.current.has(inspectedFrame)) requestTree(inspectedFrame);
	}, [railOpen, railMode, inspectedFrame, requestTree, walkable]);

	// an unmounted frame's cached walk is a lie — the next look re-asks
	useEffect(() => {
		setTrees((current) => {
			const dead = Object.keys(current).filter((name) => (lifecycle.states[name] ?? "picture") === "picture");
			if (dead.length === 0) return current;
			return Object.fromEntries(Object.entries(current).filter(([name]) => !dead.includes(name)));
		});
	}, [lifecycle.states]);

	const inspectedRows = useMemo(() => {
		if (inspectedFrame === null) return undefined;
		const roots = trees[inspectedFrame];
		if (roots === undefined || roots === null) return roots;
		const frame = frames.find((candidate) => candidate.name === inspectedFrame);
		return buildTreeRows(roots, frameSourceRel(inspectedFrame, frame === undefined ? ROOT_PAGE : pageOf(frame)));
	}, [trees, inspectedFrame, frames]);

	// call-site rows name themselves from source: fetch labels once each,
	// batched to the endpoint's cap — a failed batch un-asks so a later pass retries
	useEffect(() => {
		if (inspectedRows === undefined || inspectedRows === null) return;
		const missing = new Set<string>();
		collectCallSites(inspectedRows, missing);
		const wanted = [...missing].filter((stamp) => !labelsAsked.current.has(stamp));
		if (wanted.length === 0) return;
		for (const stamp of wanted) labelsAsked.current.add(stamp);
		for (const batch of chunked(wanted, STAMP_LABEL_BATCH)) {
			void fetchStampLabels(project, batch).then((labels) => {
				if (Object.keys(labels).length === 0) {
					for (const stamp of batch) labelsAsked.current.delete(stamp);
					return;
				}
				setCallSiteLabels((current) => ({ ...current, ...labels }));
			});
		}
	}, [inspectedRows, project]);

	/**
	 * Rows become canvas selection through a describe round-trip: the frame
	 * answers each selector's ancestry, the deepest hit is the selection and
	 * the last chain becomes the scope Esc ascends. Additive keeps prior picks.
	 */
	const selectSelectors = useCallback((frame: string, selectors: string[], additive: boolean) => {
		if (selectors.length === 0) return;
		const target = iframes.current.get(frame)?.contentWindow;
		if (target == null) return;
		const id = ++pickSeq.current;
		const gen = pickGen.current;
		describeWaiters.current.set(id, (chains) => {
			if (pickGen.current !== gen) return;
			const hits: PickedSelection[] = [];
			let lastChain: PickedHit[] | null = null;
			for (const chain of chains) {
				const hit = chain[chain.length - 1];
				if (hit === undefined) continue;
				hits.push({ frame, ...hit });
				lastChain = chain;
			}
			if (hits.length === 0) {
				// nothing answered to any of the row's selectors: the walk this row
				// came from is stale — drop it so the tab re-reads the live DOM
				setTrees((current) => without(current, frame));
				return;
			}
			if (lastChain !== null) pickedChain.current = { frame, chain: lastChain };
			setSelected([]);
			setPicked(additive ? mergePicks(pickedRef.current, hits) : hits);
		});
		target.postMessage(describeMessage(selectors, id), "*");
		setTimeout(() => describeWaiters.current.delete(id), PICK_REPLY_MS);
	}, []);

	const toggleTreeRow = (key: string) => {
		setExpandedRows((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	/**
	 * The tree grammar on element rows: shift ranges over the frame's visible
	 * rows, ⌘/Ctrl toggles, a plain click replaces. Selecting an element is
	 * Select's business (#54), so the row takes the tool with it — and the
	 * frame it selects into is the one that freezes.
	 */
	const selectTreeRow = (row: TreeRow, modifiers: SelectModifiers) => {
		const frame = inspectedFrame;
		if (frame === null) return;
		setTool("select");
		if (modifiers.shift && rowAnchor.current?.frame === frame) {
			const visible = visibleRows(inspectedRows ?? [], expandedRows);
			const a = visible.findIndex((candidate) => candidate.key === rowAnchor.current?.key);
			const b = visible.findIndex((candidate) => candidate.key === row.key);
			if (a !== -1 && b !== -1) {
				const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1);
				const selectors = [...new Set(range.flatMap((member) => rowSelectors(member)))];
				selectSelectors(frame, selectors, modifiers.toggle);
				return;
			}
		}
		rowAnchor.current = { frame, key: row.key };
		const selectors = rowSelectors(row);
		if (modifiers.toggle) {
			const held = new Set(pickedRef.current.filter((pick) => pick.frame === frame).map((pick) => pick.selector));
			if (selectors.every((selector) => held.has(selector))) {
				setPicked(pickedRef.current.filter((pick) => !(pick.frame === frame && selectors.includes(pick.selector))));
				return;
			}
			selectSelectors(frame, selectors, true);
			return;
		}
		selectSelectors(frame, selectors, false);
	};

	/** Double-click on an element row jumps the editor to the stamped line. */
	const openRowInEditor = (row: TreeRow) => {
		const frame = inspectedFrame;
		if (frame === null) return;
		if (row.kind === "boundary") {
			openEditorFor({ path: `design/${row.file}` });
			return;
		}
		const stamp = parseStampRef(row.source);
		openEditorFor(
			stamp === undefined
				? { path: frameSourcePath(frame, framePageOf(frame)) }
				: { path: `design/${stamp.rel}`, line: stamp.line },
		);
	};

	// a canvas pick has a row to reveal whenever the element earned one: its
	// ancestors expand and the row scrolls in, so selection sync lands on screen
	const reveal = useMemo(() => {
		const anchorPick = picked[picked.length - 1];
		if (anchorPick === undefined || inspectedRows === undefined || inspectedRows === null) return undefined;
		return revealKeys(inspectedRows, anchorPick.selector);
	}, [picked, inspectedRows]);

	useEffect(() => {
		if (reveal === undefined) return;
		setExpandedRows((current) =>
			reveal.ancestors.every((key) => current.has(key)) ? current : new Set([...current, ...reveal.ancestors]),
		);
	}, [reveal]);

	const pickedKeys = useMemo(() => new Set(picked.map((pick) => pickKey(pick.frame, pick.selector))), [picked]);

	const inspectorTarget = useMemo<InspectorTarget | null>(() => {
		if (inspectedFrame === null) return null;
		const frame = frames.find((candidate) => candidate.name === inspectedFrame);
		if (frame === undefined) return null;
		const page = pageOf(frame);
		return {
			frame: frame.name,
			page,
			width: Math.round(frame.w),
			height: Math.round(frame.h),
			kind: frame.kind,
			sourcePath: frameSourcePath(frame.name, page),
		};
	}, [inspectedFrame, frames]);

	const connections = useMemo(
		() => (inspectedFrame === null ? [] : connectionGroups(inspectedFrame, edges, frames)),
		[inspectedFrame, edges, frames],
	);

	const unreadableConnections = useMemo(
		() => (inspectedFrame === null ? [] : unreadableRows(inspectedFrame, unreadable)),
		[inspectedFrame, unreadable],
	);

	/** A connection row is a place on the canvas, never a walk: land there and select it. */
	const openConnection = useCallback(
		(row: ConnectionRow) => {
			if (row.missing) return;
			const frame = allFramesRef.current.find((candidate) => candidate.name === row.target);
			if (frame === undefined) return;
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
		[switchToPage, arrivalAt, animateCamera],
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
		const isTyping = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
		const onKeyDown = (event: KeyboardEvent) => {
			if (isTyping(event.target)) return;
			if (exportDialogRef.current !== null) {
				if (event.key === "Escape" && !exportingRef.current) {
					event.preventDefault();
					cancelExportDialog();
				}
				return;
			}
			const mod = event.metaKey || event.ctrlKey;
			if (event.key === "Meta") {
				setMetaDown(true);
				return;
			}
			if (event.code === "Space") {
				if (!event.repeat) setSpaceDown(true);
				event.preventDefault();
				return;
			}
			if (mod && (event.key === "z" || event.key === "Z")) {
				event.preventDefault();
				if (event.shiftKey) {
					if (gesture.current.kind === "idle" || gesture.current.kind === "pan") redoGeometry();
					return;
				}
				// ⌘Z answers the trash toast first (#7), then walks the geometry stack
				if (pendingTrashRef.current !== null) undoTrash();
				else if (gesture.current.kind === "idle" || gesture.current.kind === "pan") undoGeometry();
				return;
			}
			if (mod && (event.key === "=" || event.key === "+")) {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, K_STEP, true);
				return;
			}
			if (mod && event.key === "-") {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, 1 / K_STEP, true);
				return;
			}
			if (mod && event.key === "Escape") {
				// the terminal exit chord (#42) landing canvas-side: focus can sit
				// here instead of inside the entered frame, and the frame cannot
				// relay a chord it never saw
				if (enteredRef.current !== null) {
					event.preventDefault();
					exitEntered(true);
				}
				return;
			}
			if (mod) return;
			if (event.shiftKey && event.code === "Digit1") {
				zoomFit();
				return;
			}
			if (event.shiftKey && event.code === "Digit2") {
				const names = selectedRef.current.length > 0 ? selectedRef.current : pickTarget();
				const boxes = framesRef.current.filter((f) => names.includes(f.name));
				const viewport = viewportRef.current;
				if (boxes.length > 0 && viewport !== null) {
					animateCamera(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
				}
				return;
			}
			if (!event.repeat && event.shiftKey && (event.key === "a" || event.key === "A")) {
				// ⇧A tidies the field; one ⌘Z puts every frame back where it was
				event.preventDefault();
				if (gesture.current.kind === "idle" || gesture.current.kind === "pan") arrangeFrames();
				return;
			}
			if (!event.repeat && !event.shiftKey && (event.key === "t" || event.key === "T")) {
				// the threads toggle (#34): persisted per project
				toggleArrows();
				return;
			}
			switch (event.key) {
				case "v":
				case "V":
					setTool("select");
					break;
				case "h":
				case "H":
					setTool("hand");
					break;
				case "+":
				case "=": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, K_STEP, true);
					break;
				}
				case "-": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, 1 / K_STEP, true);
					break;
				}
				case "0":
					resetZoom();
					break;
				// the menu's verbs (#7) on bare keys, each acting on the selection
				case "p":
				case "P": {
					// Play from here wants one frame to open on, exactly as ⇧⏎ does
					const targets = verbTarget();
					const [only] = targets;
					if (targets.length !== 1 || only === undefined) break;
					playFrame(only);
					break;
				}
				case "r":
				case "R":
					for (const name of verbTarget()) reloadFrameDocument(name);
					break;
				case "e":
				case "E":
					openExport(verbTarget(), null);
					break;
				case "Backspace":
				case "Delete": {
					const targets = verbTarget();
					if (targets.length === 0) break;
					event.preventDefault(); // ⌫ must never walk the browser back
					stageTrash(targets);
					break;
				}
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown": {
					if (enteredRef.current !== null || selectedRef.current.length === 0) break;
					event.preventDefault();
					// The tool used to split these: Interact stepped between frames,
					// Select nudged. With one pointer tool left, bare arrows nudge
					// the selection (Select's own business) and ⌥ steps to the
					// neighbouring frame — which ⏎ then goes inside (#28).
					if (event.altKey) {
						if (selectedRef.current.length !== 1) break;
						const current = framesRef.current.find((frame) => frame.name === selectedRef.current[0]);
						if (current === undefined) break;
						const direction = spatialDirection(event.key);
						if (direction === undefined) break;
						const target = nextSpatialFrame(current, framesRef.current, direction);
						if (target === undefined) break;
						setSelected([target.name]);
						setPicked([]);
						const viewport = viewportRef.current;
						const cam = cameraRef.current;
						if (viewport !== null && cam !== null) {
							animateCamera(centerOn(cam, target, viewport.clientWidth, viewport.clientHeight));
						}
						break;
					}
					const step = event.shiftKey ? 10 : 1;
					const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
					const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
					nudge(dx, dy);
					break;
				}
				case "Enter": {
					// ⏎ goes inside, ⇧⏎ plays it: the heavier verb takes the modifier
					if (event.repeat || enteredRef.current !== null || selectedRef.current.length !== 1) break;
					const [target] = selectedRef.current;
					if (target === undefined) break;
					event.preventDefault();
					if (event.shiftKey) playFrame(target);
					else enterFrame(target);
					break;
				}
				case "Escape": {
					cancelPicks();
					setPreview(null);
					if (gesture.current.kind !== "idle" && gesture.current.kind !== "pan") cancelGesture();
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
					} else {
						setSelected([]);
					}
					break;
				}
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceDown(false);
			// releasing ⌘ outside an element scope ends the deep-hover preview
			if (event.key === "Meta") {
				setMetaDown(false);
				setPreview(null);
			}
		};
		const clearModifiers = () => {
			setMetaDown(false);
			setSpaceDown(false);
			setPreview(null);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", clearModifiers);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
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
	]);

	// --- chrome (top bar) -------------------------------------------------------

	const zoomPct = camera === null ? 100 : Math.round(camera.k * 100);
	useEffect(() => {
		onChrome({
			zoomPct,
			arrowsOn,
			toggleArrows,
			hasThreads,
		});
		return () => onChrome(null);
	}, [zoomPct, onChrome, arrowsOn, toggleArrows, hasThreads]);

	// --- render -------------------------------------------------------------------

	// no frames and no pages anywhere: the project is untouched — the page
	// surface only exists once something does (#39)
	const projectEmpty = loaded && frames.length === 0 && pages.length === 0;
	const k = camera?.k ?? 1;
	const shellRadius = Math.min(12 / k, 24);
	const cursor = resizeCursor ?? (panning ? "grabbing" : effectiveTool === "hand" ? "grab" : "default");

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
			<CanvasSidebar
				pages={pages}
				activePage={activePage}
				frames={navigatorFrames}
				selected={selected}
				onSwitchPage={activatePageFromTree}
				onSelectFrame={selectFrameRow}
				onDoubleClickFrame={flyToFrame}
			/>
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
				className="relative h-full min-w-0 flex-1 touch-none select-none overflow-clip bg-canvas outline-none"
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
						className="absolute top-0 left-0"
						style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${k})`, transformOrigin: "0 0" }}
					>
						{/* the threads live under the frames: the map, never a hit target */}
						{arrowsOn && <FlowArrows frames={visibleFrames} edges={edges} siteBoxes={siteBoxes} k={k} />}
						{visibleFrames.map((frame) => {
							const state = lifecycle.states[frame.name] ?? "picture";
							const isEntered = entered === frame.name;
							const isSelected = selected.includes(frame.name);
							const isHovered =
								effectiveTool === "select" && hovered?.visible === true && hovered.frame === frame.name;
							const paused = state !== "live";
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
									{/* the label: mono, muted; thread when selected; ▸ = paused (system
									    page). Entered swaps it for the state chip (#28): time is
									    running under the pointer, and esc is the way out. */}
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
											interactive={isEntered && !metaDown}
											terminal={frame.kind === "term"}
											docNonce={docNonces[frame.name] ?? 0}
											cover={frame.cover}
											coverSizes={
												frame.cover === undefined
													? undefined
													: coverSizes(frame.cover.widths, frame.w, k, devicePixelRatio)
											}
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
					</div>
				)}

				{camera !== null && (
					<SelectionOverlay
						camera={camera}
						frames={visibleFrames}
						selected={selected}
						entered={entered}
						hovered={effectiveTool === "select" ? hovered : null}
						editable={effectiveTool === "select"}
						picked={picked}
						preview={effectiveTool === "select" ? preview : null}
						guides={guides}
						marquee={marquee}
						shellRadius={shellRadius}
					/>
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
							// the player's second door (#13): a session opening on this frame
							window.open(
								`/play/${encodeURIComponent(project)}?frame=${encodeURIComponent(menu.frame)}`,
								"_blank",
							);
							setMenu(null);
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
				<CanvasTools tool={effectiveTool} onTool={setTool} />
			</div>
			<InspectorRail
				mode={railMode}
				onMode={setRailMode}
				onOpenChange={setRailOpen}
				outboundCount={inspectedFrame === null ? null : outboundCount(inspectedFrame, edges)}
				unreadableConnections={unreadableConnections}
				target={inspectorTarget}
				rows={inspectedRows}
				callSiteLabels={callSiteLabels}
				expandedRows={expandedRows}
				pickedKeys={pickedKeys}
				revealKey={reveal?.key}
				groups={connections}
				onSelectRow={selectTreeRow}
				onDoubleClickRow={openRowInEditor}
				onToggleRow={toggleTreeRow}
				onOpenConnection={openConnection}
				onReload={() => {
					if (inspectorTarget === null) return;
					const frame = inspectorTarget.frame;
					reloadFrameDocument(frame);
				}}
				onOpenEditor={() => {
					if (inspectorTarget === null) return;
					const pick = pickedRef.current.find((candidate) => candidate.frame === inspectorTarget.frame);
					openEditorFor(
						pick === undefined ? { path: inspectorTarget.sourcePath } : editorTarget(pick, inspectorTarget.page),
					);
				}}
			/>
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

/** Every call-site stamp in a row tree, folded into one set (#58). */
function collectCallSites(rows: readonly TreeRow[], into: Set<string>): void {
	for (const row of rows) {
		if (row.kind === "callsite") into.add(row.source);
		collectCallSites(row.children, into);
	}
}

/** Prior picks plus the new ones, (frame, selector) identity, order kept. */
function mergePicks(current: readonly PickedSelection[], additions: readonly PickedSelection[]): PickedSelection[] {
	const held = new Set(current.map((pick) => pickKey(pick.frame, pick.selector)));
	return [...current, ...additions.filter((pick) => !held.has(pickKey(pick.frame, pick.selector)))];
}

/** At most `size` per slice, order kept — the stamp-labels endpoint's cap. */
function chunked<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
	return out;
}

/** The record without one key — same object back when the key is absent. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
	if (!(key in record)) return record;
	return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
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
