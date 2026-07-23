import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { snapPxToCells } from "../../term/cells";
import type { Camera, CanvasMode, FlowEdge, FrameCollision, Geometry, ProjectedFrame } from "../api";
import {
	beaconTrash,
	fetchCanvasState,
	fetchFlows,
	fetchProjection,
	fetchStampLabels,
	openInEditor,
	postTrash,
	postWalk,
	putCanvasState,
	putGeometry,
	putSelection,
	putThumb,
	restartTerminalFrame,
	subscribeSse,
	thumbUrl,
} from "../api";
import { RibbonMark } from "../icons";
import { type Box, boundsOf, centerOn, clamp, fitCamera, intersects, toWorld, zoomAt } from "./camera";
import { CollisionNotice } from "./collision-notice";
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
import { FrameShell, type WalkBoot } from "./frame-shell";
import { useFrameLifecycle } from "./lifecycle";
import {
	type ElementPreview,
	editorTarget,
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
	portalEdges,
	ROOT_PAGE,
	resolveActivePage,
	stateCameraSlots,
	switchPage,
} from "./pages";
import { PortalChips } from "./portal-chips";
import {
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
} from "./protocol";
import { CanvasSidebar, type SelectModifiers } from "./sidebar";
import { snapEdge, snapMovedBox } from "./snap";
import { nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";
import { TrashToast } from "./trash-toast";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with Figma-feel pan/zoom — Space or middle-drag pans, the
 * pointer always selects, no tool switcher. Selection is Figma's: single
 * click selects the frame (or, inside an element scope, the sibling at that
 * depth), double click goes deeper — into running time in live (the entered
 * state then follows data-go walks, #5), one element level per click in
 * design, where ⌘-click jumps to the deepest element, shift-click toggles
 * elements in and out of a multi-selection, hover previews the would-be
 * target (#37), and Esc ascends back out — a multi-selection drops straight
 * to its frames. Hands obey the one law: move, resize and nudge write
 * geometry sidecars only; delete rides the OS Trash behind a toast-undo; the
 * canvas never writes frame source.
 */

export interface CanvasChrome {
	mode: CanvasMode;
	zoomPct: number;
	setMode: (mode: CanvasMode) => void;
	/** The threads toggle (#34): shown pressed while the map draws. */
	arrowsOn: boolean;
	toggleArrows: () => void;
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
const WALK_STILL_MS = 450;
const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 8;
const MIN_FRAME_SIZE = 40;
const NUDGE_FLUSH_MS = 400;
const SELECTION_PUT_MS = 150;
const PICK_REPLY_MS = 400;
const TRASH_UNDO_MS = 5000;
const HOVER_PICK_MS = 80;
const TREE_REPLY_MS = 1000;
const STAMP_LABEL_BATCH = 256;

const NO_WAKES: ReadonlySet<string> = new Set();

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

function wheelZoomFactor(delta: number, mode: number, pageSize: number): number {
	return clamp(Math.exp(-wheelPixels(delta, mode, pageSize) * 0.0075), 0.5, 2);
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
	const [mode, setMode] = useState<CanvasMode>("live");
	const [selected, setSelected] = useState<string[]>([]);
	const [picked, setPicked] = useState<PickedSelection[]>([]);
	const [entered, setEntered] = useState<string | null>(null);
	// the hover preview (#37): the element a click would target, outlined live
	const [preview, setPreview] = useState<ElementPreview | null>(null);
	const [externalLink, setExternalLink] = useState<{ frame: string; href: string } | null>(null);
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
	const [walkBoots, setWalkBoots] = useState<Record<string, WalkBoot>>({});
	const [thumbNonces, setThumbNonces] = useState<Record<string, number>>({});
	const [freshThumbs, setFreshThumbs] = useState<ReadonlySet<string>>(new Set<string>());
	// pages (#39): the named pages on disk, the one the canvas shows, and the
	// names discovery refuses to resolve
	const [pages, setPages] = useState<string[]>([]);
	const [activePage, setActivePage] = useState<string>(ROOT_PAGE);
	const [collisions, setCollisions] = useState<FrameCollision[]>([]);
	// the sidebar tree (#37): per-frame raw walks, row expansion, call-site labels
	const [trees, setTrees] = useState<Record<string, RawTreeNode[]>>({});
	const [expandedFrames, setExpandedFrames] = useState<ReadonlySet<string>>(new Set<string>());
	const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(new Set<string>());
	const [callSiteLabels, setCallSiteLabels] = useState<Record<string, string | null>>({});

	// the active page is the canvas: only its frames mount — and frames staged
	// for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useMemo(
		() => frames.filter((f) => pageOf(f) === activePage && !hidden.has(f.name)),
		[frames, activePage, hidden],
	);
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
	// links that leave the page surface as portals at the frame edge (#39)
	const portals = useMemo(() => portalEdges(edges, frames, activePage), [edges, frames, activePage]);

	const gesture = useRef<Gesture>({ kind: "idle" });
	const animation = useRef(0);
	const cameraRef = useRef<Camera | null>(null);
	cameraRef.current = camera;
	const framesRef = useRef(visibleFrames);
	framesRef.current = visibleFrames;
	// the whole projection, for cross-page reads: portals, walks, editor paths
	const allFramesRef = useRef(frames);
	allFramesRef.current = frames;
	const activePageRef = useRef(activePage);
	activePageRef.current = activePage;
	// every page's last known camera this session, keyed by page (#39)
	const cameras = useRef<Record<string, Camera>>({});
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const spaceRef = useRef(spaceDown);
	spaceRef.current = spaceDown;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const pickedRef = useRef(picked);
	pickedRef.current = picked;
	// the walk session mirror: what the last go/back carried, owed to the next boot
	const walkSession = useRef<SessionRecord | null>(null);
	const walkTarget = useRef<string | null>(null);
	const walkGen = useRef(0);
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
	// tree and describe round-trips (#37), pickWaiters' pattern
	const treeWaiters = useRef(new Map<number, (roots: RawTreeNode[]) => void>());
	const describeWaiters = useRef(new Map<number, (chains: PickedHit[][]) => void>());
	// the panel's range anchors (#37): one per list, ranges never cross lists
	const frameAnchor = useRef<string | null>(null);
	const rowAnchor = useRef<{ frame: string; key: string } | null>(null);
	const nudgeDirty = useRef(new Set<string>());
	const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const trashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingTrashRef = useRef<string[] | null>(null);

	const hasThumb = useCallback(
		(name: string) => freshThumbs.has(name) || (framesRef.current.find((f) => f.name === name)?.hasThumb ?? false),
		[freshThumbs],
	);
	const hasThumbRef = useRef(hasThumb);
	hasThumbRef.current = hasThumb;

	const noteThumb = useCallback((frame: string) => {
		setFreshThumbs((current) => (current.has(frame) ? current : new Set(current).add(frame)));
		setThumbNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
	}, []);

	// a settled self-capture persists into design/.spool and refreshes covers
	const onShot = useCallback(
		(frame: string, dataUrl: string) => {
			void (async () => {
				try {
					const png = await (await fetch(dataUrl)).blob();
					if (await putThumb(project, frame, png)) noteThumb(frame);
				} catch {
					// a lost capture is re-taken on the next settle
				}
			})();
		},
		[project, noteThumb],
	);

	// expand is attention (#37): an expanded tree row wakes its frame through
	// the queue and keeps it real while the row stays open
	const wakeRequested = useMemo<ReadonlySet<string>>(() => {
		if (mode !== "design") return NO_WAKES;
		const names = [...expandedFrames].filter((name) => visibleFrames.some((f) => f.name === name));
		return names.length === 0 ? NO_WAKES : new Set(names);
	}, [mode, expandedFrames, visibleFrames]);

	const lifecycle = useFrameLifecycle({
		framesRef,
		cameraRef,
		viewportRef,
		mode,
		entered,
		// first click pre-boots (#8) — a hint that only means one thing at a time
		selected: selected.length === 1 ? (selected[0] ?? null) : null,
		wakeRequested,
		hasThumb: (name) => hasThumbRef.current(name),
		onShot,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;

	const reloadFrameDocument = useCallback((frame: string) => {
		setDocNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
		setWalkBoots((current) => without(current, frame));
		setPicked((current) => current.filter((pick) => pick.frame !== frame));
		if (pickedChain.current?.frame === frame) pickedChain.current = null;
		setTrees((current) => without(current, frame));
		setPreview((current) => (current?.frame === frame ? null : current));
		lifecycleRef.current.markStale(frame);
	}, []);

	const onIframe = useCallback((name: string, el: HTMLIFrameElement | null) => {
		if (el === null) iframes.current.delete(name);
		else iframes.current.set(name, el);
		lifecycleRef.current.onIframe(name, el);
	}, []);

	const capturePng = useCallback(
		async (frame: ProjectedFrame): Promise<CapturedFrame> => {
			if (frame.kind === "html") {
				const dataUrl = await lifecycleRef.current.capture(frame.name);
				if (dataUrl !== undefined) {
					const png = await pngBytesFromImageBlob(await (await fetch(dataUrl)).blob(), frame.w, frame.h);
					return { name: frame.name, width: frame.w, height: frame.h, png };
				}
			}

			const cover = await fetch(thumbUrl(project, frame.name, Date.now()), { cache: "no-store" });
			if (!cover.ok) throw new Error(`Couldn’t capture ${frame.name}. Try again.`);
			const png = await pngBytesFromImageBlob(await cover.blob(), frame.w, frame.h);
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
		if (flows !== undefined) setEdges(flows.edges);
	}, [project]);

	// boot: stored state (mode + cameras + arrows + active page), the
	// projection, the link graph — the canvas reopens on the page it left (#39)
	useEffect(() => {
		let alive = true;
		void (async () => {
			const state = await fetchCanvasState(project);
			if (alive && state !== undefined) {
				setMode(state.mode);
				setArrowsOn(state.arrows ?? true);
				cameras.current = camerasFromState(state);
				const page = state.activePage ?? ROOT_PAGE;
				setActivePage(page);
				const camera = cameras.current[page];
				if (camera !== undefined) setCamera(camera);
			}
			if (alive) await Promise.all([refetchFrames(), refetchFlows()]);
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
	 * newest request per frame applies; a hibernated frame has no document to
	 * ask and its arrows keep the frame-edge fallback.
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

	// a walk marker must not outlive its walk: a frame that hibernated before
	// its boot ever reported loaded re-mounts ambiently, and that boot is
	// honest — only the current walk target keeps its marker (#28)
	useEffect(() => {
		setWalkBoots((current) => {
			const dead = Object.keys(current).filter(
				(name) => name !== walkTarget.current && (lifecycle.states[name] ?? "hibernated") === "hibernated",
			);
			if (dead.length === 0) return current;
			return Object.fromEntries(Object.entries(current).filter(([name]) => !dead.includes(name)));
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
			walkTarget.current = null;
			walkSession.current = null;
			setEntered(target);
			setSelected([]);
			setPicked([]);
			setPreview(null);
			// the entered frame owns the keyboard from the first moment; a frame
			// booting right now gets it at its loaded report instead
			iframes.current.get(target)?.focus();
			// entering is a focusing gesture: fit once. Walks and shell navigation
			// preserve zoom so the field keeps its spatial continuity.
			const viewport = viewportRef.current;
			if (viewport !== null) animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
		},
		[animateCamera],
	);

	const exitEntered = useCallback((retainFrame = false) => {
		const frame = enteredRef.current;
		setEntered(null);
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

	/** The one mode door: design freezes time everywhere, so entering it exits play. */
	const switchMode = useCallback(
		(next: CanvasMode) => {
			if (next === "design") exitEntered();
			// the element surface is design's; its selection does not outlive it
			if (next === "live") setPicked([]);
			setPreview(null);
			setMode(next);
		},
		[exitEntered],
	);

	const toggleArrows = useCallback(() => setArrowsOn((on) => !on), []);

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
				putSelection(project, { frames: selected });
			}
		}, SELECTION_PUT_MS);
		return () => clearTimeout(timer);
	}, [project, picked, selected]);

	// --- geometry writes (#23): sidecars only, never source ---------------------

	const commitGeometry = useCallback(
		(names: readonly string[]) => {
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
		commitGeometry(names);
	}, [commitGeometry]);

	const nudge = useCallback(
		(dx: number, dy: number) => {
			const names = selectedRef.current;
			if (names.length === 0) return;
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

	/** Figma's descend: each double-click selects one level deeper under the cursor. */
	const descendAt = useCallback(
		(frame: string, local: Point) => {
			beginPick(frame, local, (chain) => {
				const anchor = pickAnchor();
				const depth =
					anchor !== undefined && anchor.frame === frame
						? chain.findIndex((h) => h.selector === anchor.selector)
						: -1;
				applyPick(frame, chain, chain[Math.min(depth + 1, chain.length - 1)]);
			});
		},
		[beginPick, applyPick, pickAnchor],
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

	// --- element tree (#37): the sidebar's rows, extracted from live DOM --------

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
			if (treeWaiters.current.delete(id)) treeBusy.current.delete(frame);
		}, TREE_REPLY_MS);
	}, []);

	useEffect(() => {
		if (mode !== "design") return;
		for (const name of expandedFrames) {
			if (trees[name] === undefined && lifecycle.ready.has(name)) requestTree(name);
		}
	}, [mode, expandedFrames, trees, lifecycle.ready, requestTree]);

	// a hibernated frame's cached walk is a lie — the next expand re-asks
	useEffect(() => {
		setTrees((current) => {
			const dead = Object.keys(current).filter((name) => (lifecycle.states[name] ?? "hibernated") === "hibernated");
			if (dead.length === 0) return current;
			return Object.fromEntries(Object.entries(current).filter(([name]) => !dead.includes(name)));
		});
	}, [lifecycle.states]);

	const rowsByFrame = useMemo(() => {
		const out: Record<string, TreeRow[]> = {};
		for (const [name, roots] of Object.entries(trees)) {
			out[name] = buildTreeRows(roots, frameSourceRel(name, activePage));
		}
		return out;
	}, [trees, activePage]);

	// call-site rows name themselves from source (#37): fetch labels once each,
	// batched to the endpoint's cap — a failed batch un-asks so a later pass retries
	useEffect(() => {
		const missing = new Set<string>();
		for (const rows of Object.values(rowsByFrame)) collectCallSites(rows, missing);
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
	}, [rowsByFrame, project]);

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
			if (hits.length === 0) return;
			if (lastChain !== null) pickedChain.current = { frame, chain: lastChain };
			setSelected([]);
			setPicked(additive ? mergePicks(pickedRef.current, hits) : hits);
		});
		target.postMessage(describeMessage(selectors, id), "*");
		setTimeout(() => describeWaiters.current.delete(id), PICK_REPLY_MS);
	}, []);

	const toggleFrameRow = (name: string) => {
		setExpandedFrames((current) => {
			const next = new Set(current);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};

	const toggleTreeRow = (key: string) => {
		setExpandedRows((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	/** The panel grammar on frame rows: shift ranges, ⌘ toggles, click replaces. */
	const selectFrameRow = (name: string, modifiers: SelectModifiers) => {
		setPicked([]);
		pickedChain.current = null;
		if (modifiers.shift && frameAnchor.current !== null) {
			const names = visibleFrames.map((f) => f.name);
			const a = names.indexOf(frameAnchor.current);
			const b = names.indexOf(name);
			if (a !== -1 && b !== -1) {
				const range = names.slice(Math.min(a, b), Math.max(a, b) + 1);
				setSelected(modifiers.toggle ? [...new Set([...selectedRef.current, ...range])] : range);
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

	/** The same grammar on tree rows; ranges run over one frame's visible rows.
	 * Every row selects on click — expansion is the chevron's alone. */
	const selectTreeRow = (frame: string, row: TreeRow, modifiers: SelectModifiers) => {
		if (modifiers.shift && rowAnchor.current?.frame === frame) {
			const visible = visibleRows(rowsByFrame[frame] ?? [], expandedRows);
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
				setPicked(
					pickedRef.current.filter(
						(pick) => !(pick.frame === frame && held.has(pick.selector) && selectors.includes(pick.selector)),
					),
				);
				return;
			}
			selectSelectors(frame, selectors, true);
			return;
		}
		selectSelectors(frame, selectors, false);
	};

	/** Double-click on a frame row flies the camera to the frame (#37). */
	const flyToFrame = (name: string) => {
		const frame = framesRef.current.find((f) => f.name === name);
		const viewport = viewportRef.current;
		if (frame === undefined || viewport === null) return;
		animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
	};

	/** Double-click on a tree row jumps the editor to the stamped line. */
	const openRowInEditor = (frame: string, row: TreeRow) => {
		if (row.kind === "boundary") {
			openEditorFor({ path: `design/${row.file}` });
			return;
		}
		const stamp = parseStampRef(row.source);
		openEditorFor(
			stamp === undefined
				? { path: frameSourcePath(frame, activePageRef.current) }
				: { path: `design/${stamp.rel}`, line: stamp.line },
		);
	};

	// canvas picks always have a row to reveal (#37): expand the frame row and
	// every ancestor — boundary rows included — so sync lands on screen
	const revealTarget = useMemo(() => {
		const anchorPick = picked[picked.length - 1];
		if (mode !== "design" || anchorPick === undefined) return undefined;
		const rows = rowsByFrame[anchorPick.frame];
		if (rows === undefined) return undefined;
		return revealKeys(rows, anchorPick.selector)?.key;
	}, [mode, picked, rowsByFrame]);

	useEffect(() => {
		const anchorPick = picked[picked.length - 1];
		if (mode !== "design" || anchorPick === undefined) return;
		setExpandedFrames((current) =>
			current.has(anchorPick.frame) ? current : new Set(current).add(anchorPick.frame),
		);
		const rows = rowsByFrame[anchorPick.frame];
		if (rows === undefined) return;
		const reveal = revealKeys(rows, anchorPick.selector);
		if (reveal === undefined) return;
		setExpandedRows((current) => {
			if (reveal.ancestors.every((key) => current.has(key))) return current;
			return new Set([...current, ...reveal.ancestors]);
		});
	}, [mode, picked, rowsByFrame]);

	// a quiet pending state (#37): expanded, but the DOM has not answered yet
	const pendingWakes = useMemo<ReadonlySet<string>>(() => {
		if (mode !== "design") return NO_WAKES;
		const pending = [...expandedFrames].filter(
			(name) => visibleFrames.some((f) => f.name === name) && rowsByFrame[name] === undefined,
		);
		return pending.length === 0 ? NO_WAKES : new Set(pending);
	}, [mode, expandedFrames, visibleFrames, rowsByFrame]);

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
	 * reset; a pending trash commits (one undo slot, as ever). Live/design mode
	 * is global and rides through untouched.
	 */
	const switchToPage = useCallback(
		(target: string, arriveAt?: Camera) => {
			if (activePageRef.current === target) return;
			flushNudge();
			commitTrash();
			cancelPicks();
			exitEntered();
			setMenu(null);
			setSelected([]);
			setPicked([]);
			setPreview(null);
			setExternalLink(null);
			stopAnimation();
			const next = switchPage(cameras.current, activePageRef.current, cameraRef.current, target, arriveAt);
			cameras.current = next.cameras;
			setActivePage(target);
			setCamera(next.camera);
		},
		[flushNudge, commitTrash, cancelPicks, exitEntered, stopAnimation],
	);

	/** Follow a portal: land on the target's page with the target centered (#39). */
	const jumpToFrame = useCallback(
		(name: string) => {
			const frame = allFramesRef.current.find((f) => f.name === name);
			if (frame === undefined || pageOf(frame) === activePageRef.current) return;
			switchToPage(pageOf(frame), arrivalAt(frame));
			setSelected([name]);
		},
		[switchToPage, arrivalAt],
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
			const gen = ++walkGen.current;
			// arrival is instant — entered (and its chip) must name the frame whose
			// time runs the moment the walk lands, not after the capture below
			setEntered(target);
			setSelected([]);
			setPicked([]);
			const frame = framesRef.current.find((f) => f.name === target);
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (frame !== undefined && viewport !== null && cam !== null) {
				animateCamera(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
			}
			void (async () => {
				// the reboot must not read as a reload (#28): self-capture the target
				// just before rebooting and hold that still, uncovered, until the
				// fresh boot's loaded report. Bounded — a mute frame cannot stall the
				// walk, and its late reply still lands as the thumbnail via onShot.
				const still = await Promise.race([
					lifecycleRef.current.capture(target),
					new Promise<undefined>((resolve) => setTimeout(resolve, WALK_STILL_MS)),
				]);
				// only the newest walk reboots (pickGen's pattern): a superseding walk
				// or an exit mid-capture voids this one
				if (walkGen.current !== gen || walkTarget.current !== target) return;
				setWalkBoots((current) => ({ ...current, [target]: { still } }));
				// screen scripts run fresh on every arrival — reboot even a warm target
				setDocNonces((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
			})();
		},
		[animateCamera, switchToPage, arrivalAt],
	);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		return subscribeSse(`/api/p/${encodeURIComponent(project)}/events`, {
			change: (data) => {
				const event = data as { kind: string; frame?: string };
				if (event.kind === "frame" && event.frame !== undefined) {
					const frame = event.frame;
					reloadFrameDocument(frame);
					void refetchFrames();
					// an edit moves the graph: edges re-derive, verified marks may drop —
					// walks themselves stay canvas-silent (#34): they cannot move the map
					void refetchFlows();
				} else if (event.kind === "shared") {
					// anything in shared/ can stale every document
					setDocNonces((current) => {
						const next: Record<string, number> = { ...current };
						for (const frame of framesRef.current) next[frame.name] = (next[frame.name] ?? 0) + 1;
						return next;
					});
					setWalkBoots((current) => (Object.keys(current).length === 0 ? current : {}));
					setPicked([]);
					pickedChain.current = null;
					setTrees((current) => (Object.keys(current).length === 0 ? current : {}));
					void refetchFrames();
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
					noteThumb(event.frame);
				}
			},
		});
	}, [project, refetchFrames, refetchFlows, noteThumb, reloadFrameDocument]);

	// the frame protocol: loaded/error/shot route into the lifecycle, session?
	// answers with the carried walk session, go/back move the entered state
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = parseFrameMessage(event.data);
			if (message === undefined) return;
			switch (message.spool) {
				case "loaded":
					lifecycleRef.current.noteLoaded(message.frame);
					// a completed boot retires its walk cover — later reboots are honest
					setWalkBoots((current) => without(current, message.frame));
					// the keyboard follows the walk: an entered frame owns it (#28)
					if (enteredRef.current === message.frame) iframes.current.get(message.frame)?.focus();
					// a fresh document renders fresh elements: re-anchor its arrows (#34)
					requestSiteBoxes(message.frame);
					return;
				case "shot":
					lifecycleRef.current.noteShot(message.frame, message.url);
					return;
				case "error":
					console.warn(`spool: frame "${message.frame}" reported:`, message.error);
					// a walk boot that broke falls back to the honest cover: the quiet
					// still must not dress a dead document as a settled one (#28)
					setWalkBoots((current) => without(current, message.frame));
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
					zoomAtPoint(c.x, c.y, message.kind === "in" ? 1.25 : 0.8, true);
					return;
				}
				case "go":
				case "back": {
					if (enteredRef.current !== message.frame) return;
					// a forward walk in the entered state really happened — witness it (#25)
					if (message.spool === "go") postWalk(project, message.frame, message.target);
					walkTo(message.target, message.session ?? null);
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

	// persist mode + arrows + the page bookkeeping on settle: last-settle wins
	// the stored slot (#12); each page keeps its own camera, and the active
	// page rides along so reopening resumes it (#39)
	useEffect(() => {
		if (camera === null) return;
		const settle = setTimeout(() => {
			cameras.current = { ...cameras.current, [activePage]: { x: camera.x, y: camera.y, k: camera.k } };
			putCanvasState(project, {
				mode,
				arrows: arrowsOn,
				...stateCameraSlots(cameras.current),
				...(activePage === ROOT_PAGE ? {} : { activePage }),
			});
		}, SETTLE_PERSIST_MS);
		return () => clearTimeout(settle);
	}, [camera, mode, arrowsOn, project, activePage]);

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
				if (gesture.current.kind !== "idle") return;
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

	const onPointerDown = (event: React.PointerEvent) => {
		if (exportDialogRef.current !== null) return;
		const cam = cameraRef.current;
		if (cam === null || event.button === 2) return;
		stopAnimation();
		setMenu(null);
		setPreview(null); // the press supersedes the hover; its own answer redraws
		cancelPicks(); // a new press voids earlier picks; its own start a fresh generation
		// a portal chip owns its click (#39) — capturing here would swallow it
		if (datasetHit(event.target, "portal") !== null) return;
		viewportRef.current?.setPointerCapture(event.pointerId);
		const p = localPoint(event);

		if (enteredRef.current !== null) {
			const hit = frameAtWorld(toWorld(p, cam));
			if (hit === enteredRef.current) return; // the pointer is the frame's now
			exitEntered();
		}

		if (event.button === 1 || spaceRef.current) {
			gesture.current = { kind: "pan", lastX: p.x, lastY: p.y };
			setPanning(true);
			return;
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
		if (modeRef.current === "design" && event.shiftKey && pickedRef.current.length > 0 && label === null) {
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

		// ⌘-click in design deep-selects the element under the cursor (Figma);
		// meta only — on the Mac, ctrl-click is the context menu's
		if (modeRef.current === "design" && event.metaKey && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) deepSelectAt(hit, local);
			return;
		}

		// inside an element scope the click stays scoped (Figma): the sibling
		// under the cursor, answered by the frame within a paint or two — and
		// the double-click this press may begin then descends from that answer
		const anchor = pickedRef.current[pickedRef.current.length - 1];
		if (modeRef.current === "design" && anchor !== undefined && anchor.frame === hit && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) scopedSelectAt(hit, local);
			gesture.current = { kind: "pending", names: [hit], origins: originsOf([hit]), start: p };
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
			// idle motion is the hover surface (#37) — design only, never entered
			if (modeRef.current !== "design" || enteredRef.current !== null || menuOpenRef.current) return;
			const world = toWorld(p, cam);
			hoverPickAt(frameAtWorld(world), world, event.metaKey);
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
		if (active.kind === "move") commitGeometry(active.names);
		if (active.kind === "resize") commitGeometry([active.frame]);
	};

	const onDoubleClick = (event: React.MouseEvent) => {
		if (exportDialogRef.current !== null) return;
		const cam = cameraRef.current;
		if (cam === null) return;
		const world = toWorld(localPoint(event), cam);
		const hit = frameAtWorld(world);
		if (hit === null) return;
		if (modeRef.current === "design") {
			// time is frozen, so going deeper means structure: descend one level
			const local = frameLocalAt(hit, world);
			if (local !== null) descendAt(hit, local);
			return;
		}
		// entering is the play gesture — a hibernated frame boots fresh here
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
		// belongs to design's click, double-click and ⌘-click gestures.
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

	// --- keys -------------------------------------------------------------------

	const menuOpenRef = useRef(false);
	menuOpenRef.current = menu !== null;
	const exportingRef = useRef(exporting);
	exportingRef.current = exporting;

	useEffect(() => {
		const pickTarget = () => [...new Set(pickedRef.current.map((pick) => pick.frame))];
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
			if (event.code === "Space" && !event.repeat) {
				setSpaceDown(true);
				event.preventDefault();
				return;
			}
			if (mod && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
				// ⌘Z = the toast (#7): the one undo in v1 — ⌘⇧Z stays redo's, unbound
				if (pendingTrashRef.current !== null) {
					event.preventDefault();
					undoTrash();
				}
				return;
			}
			if (mod && (event.key === "=" || event.key === "+")) {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, 1.25, true);
				return;
			}
			if (mod && event.key === "-") {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, 0.8, true);
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
			if (!event.repeat && !event.shiftKey && (event.key === "t" || event.key === "T")) {
				// the threads toggle (#34): persisted per project with the mode
				toggleArrows();
				return;
			}
			switch (event.key) {
				case "d":
				case "D":
					// modes control time (#7); persisted per project, never auto-switched
					switchMode(modeRef.current === "live" ? "design" : "live");
					break;
				case "+":
				case "=": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, 1.25, true);
					break;
				}
				case "-": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, 0.8, true);
					break;
				}
				case "0":
					resetZoom();
					break;
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown": {
					if (enteredRef.current !== null || selectedRef.current.length === 0) break;
					event.preventDefault();
					if (modeRef.current === "live") {
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
				case "Enter":
					if (
						!event.repeat &&
						modeRef.current === "live" &&
						enteredRef.current === null &&
						selectedRef.current.length === 1
					) {
						const [target] = selectedRef.current;
						if (target === undefined) break;
						event.preventDefault();
						enterFrame(target);
					}
					break;
				case "Delete":
				case "Backspace":
					// frame delete only — element delete is deliberately out (#7)
					if (enteredRef.current === null && selectedRef.current.length > 0) {
						event.preventDefault();
						stageTrash([...selectedRef.current]);
					}
					break;
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
					} else setSelected([]);
					break;
				}
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceDown(false);
			// releasing ⌘ outside an element scope ends the deep-hover preview
			if (event.key === "Meta" && pickedRef.current.length === 0) setPreview(null);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [
		viewportCenter,
		zoomAtPoint,
		zoomFit,
		resetZoom,
		animateCamera,
		exitEntered,
		enterFrame,
		switchMode,
		nudge,
		stageTrash,
		undoTrash,
		cancelGesture,
		cancelPicks,
		toggleArrows,
		cancelExportDialog,
	]);

	// --- chrome (top bar) -------------------------------------------------------

	const zoomPct = camera === null ? 100 : Math.round(camera.k * 100);
	useEffect(() => {
		onChrome({ mode, zoomPct, setMode: switchMode, arrowsOn, toggleArrows });
		return () => onChrome(null);
	}, [mode, zoomPct, onChrome, switchMode, arrowsOn, toggleArrows]);

	// --- render -------------------------------------------------------------------

	// no frames and no pages anywhere: the project is untouched — the page
	// surface only exists once something does (#39)
	const projectEmpty = loaded && frames.length === 0 && pages.length === 0;
	const k = camera?.k ?? 1;
	const shellRadius = Math.min(12 / k, 24);
	const cursor = resizeCursor ?? (panning ? "grabbing" : spaceDown ? "grab" : "default");

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
				frames={visibleFrames}
				selected={selected}
				mode={mode}
				picked={picked}
				rowsByFrame={rowsByFrame}
				callSiteLabels={callSiteLabels}
				expandedFrames={expandedFrames}
				expandedRows={expandedRows}
				pendingWakes={pendingWakes}
				revealTarget={revealTarget}
				onSwitchPage={switchToPage}
				onSelectFrame={selectFrameRow}
				onDoubleClickFrame={flyToFrame}
				onToggleFrame={toggleFrameRow}
				onSelectRow={selectTreeRow}
				onDoubleClickRow={openRowInEditor}
				onToggleRow={toggleTreeRow}
			/>
			<div
				ref={viewportRef}
				role="application"
				aria-label={`${project} canvas`}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is one keyboard composite; focus returns here from its iframe
				tabIndex={0}
				className="relative h-full min-w-0 flex-1 touch-none select-none overflow-hidden bg-canvas outline-none"
				style={{ cursor }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={() => setPreview(null)}
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
							const state = lifecycle.states[frame.name] ?? "hibernated";
							const isEntered = entered === frame.name;
							const isSelected = selected.includes(frame.name);
							const paused = mode === "live" && state !== "live";
							const framePortals = portals.filter((portal) => portal.from === frame.name);
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
										terminal={frame.kind === "term"}
									/>
									{framePortals.length > 0 && (
										<PortalChips portals={framePortals} k={k} onJump={jumpToFrame} />
									)}
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
											docNonce={docNonces[frame.name] ?? 0}
											thumbNonce={thumbNonces[frame.name] ?? 0}
											hasThumb={hasThumb(frame.name)}
											walkBoot={walkBoots[frame.name]}
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
						picked={picked}
						preview={preview}
						guides={guides}
						marquee={marquee}
						shellRadius={shellRadius}
					/>
				)}

				{menu !== null && (
					<ContextMenu
						at={menu}
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
											setExportError(undefined);
											if (names.length === 1) {
												setExportReturnMenu(null);
												void runExport(names, "png");
												return;
											}
											setExportReturnMenu(returnMenu);
											setExportDialog(
												framesInCanvasOrder(framesRef.current, names).map((frame) => frame.name),
											);
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
							if (allFramesRef.current.find((candidate) => candidate.name === frame)?.kind === "term") {
								void restartTerminalFrame(project, frame);
							}
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
			</div>
			{exportDialog !== null && exportFrames.length > 0 ? (
				<ExportDialog
					exporting={exporting}
					frames={exportFrames.map((frame) => ({
						name: frame.name,
						...(hasThumb(frame.name)
							? { thumbnail: thumbUrl(project, frame.name, thumbNonces[frame.name] ?? 0) }
							: {}),
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

/** The record without one key — same object back when the key is absent. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
	if (!(key in record)) return record;
	return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** "frame-label" → "frameLabel": dataset keys camel-case their attribute. */
function camelize(attribute: string): string {
	return attribute.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

/** Every call-site stamp in a row tree, folded into one set (#37). */
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
