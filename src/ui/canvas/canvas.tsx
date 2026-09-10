import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Cover } from "../../cover";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { StampShift } from "../../daemon/hand-write";
import type { Unseen } from "../../daemon/seen";
import { pageWithin, ROOT_PAGE } from "../../page-path";
import { fulfillClipboardCopy, rejectClipboardCopy } from "../../runtime/clipboard-host";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { accelKeyName, accelPressed } from "../../runtime/platform-keys";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import type {
	Camera,
	FlowEdge,
	FrameCollision,
	FrameCopy,
	Geometry,
	HeldPatch,
	Place,
	ProjectedFrame,
	RungRead,
	SelectionEntry,
	SelectionPut,
	TextWritten,
} from "../api";
import {
	beaconTrash,
	fetchCanvasState,
	fetchEnginePreference,
	fetchFlows,
	fetchProjection,
	fileAsAsset,
	postCaptureFailure,
	postSeen,
	postTrash,
	postWalk,
	putCanvasState,
	putCover,
	putGeometry,
	putPlaces,
	putSelection,
	putSetting,
	readRungs,
	resolveFlows,
	revertPatch,
	subscribeSse,
	swapAsset,
	writeClass,
	writeElement,
	writeText,
} from "../api";
import { attachHotkeyLayer, type HotkeyHandler, runHotkey } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import { ProjectEmpty } from "../project-empty";
import { type ArmedWrite, rangeKeyOf, useAgentHand } from "./agent-hand";
import { AgentHandLayer } from "./agent-hand-layer";
import { useAgentModel } from "./agent-model";
import { useAgentPermissions } from "./agent-permissions";
import { useAgentInstall } from "./agent-preflight";
import { AgentRail, type AgentRequest, type FrameJump } from "./agent-rail";
import { useAgentThreads } from "./agent-stream";
import { arrange } from "./arrange";
import { BootCurtain } from "./boot-screen";
import {
	type Box,
	boundsOf,
	centerOn,
	clamp,
	entryCamera,
	fitCamera,
	intersects,
	K_STEP,
	toWorld,
	zoomAt,
} from "./camera";
import { type CanvasTool, CanvasTools } from "./canvas-tools";
import type { CoverRaster } from "./capture-broker";
import { CollisionNotice, NoticeStrip } from "./collision-notice";
import { ContextMenu, contextMenuSize } from "./context-menu";
import { Dock } from "./dock";
import { type ElementSnap, poolOf, type SnapRequest, type SnapTarget, snapResize, truthful } from "./element-snap";
import { ExportDialog, type ExportFormat } from "./export-dialog";
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
import {
	alterAsk,
	askText,
	GONE,
	type HandEdit,
	OPENING_MS,
	type Refusal,
	restamped,
	type ShownRefusal,
	secondClick,
	stampOf,
	wordsOf,
} from "./hand-edit";
import {
	type GapAxis,
	type GapBand,
	type GapDrag,
	type GapReading,
	type GapTargets,
	gapAxisOf,
	gapBands,
	gapDragSign,
	gapField,
	gapMoved,
	gapPaint,
	gapSample,
	gapSteppable,
	gapStyle,
	gapWritable,
	ownedGap,
} from "./hand-gap";
import {
	authoredSpelling,
	draggedAngle,
	draggedRect,
	type Edge,
	edgeSigns,
	NO_RING,
	placementShift,
	quantizerFor,
	RESIZE_PROPERTIES,
	type ResizeMeasurement,
	type ResizeModifiers,
	type ResizeProperty,
	type Ring,
	resizedBox,
	resizeFields,
	resizeStyle,
	ringOf,
	type Size,
	type SizeWrite,
	snapTrial,
	turnValue,
} from "./hand-resize";
import {
	amend,
	drop,
	emptyHistory,
	entryOf,
	type History,
	type HistoryEntry,
	type Liveness,
	placeEntryOf,
	placesOf,
	record,
	rectsOf,
	type Staging,
	takeRedo,
	takeUndo,
	type Way,
} from "./history";
import { emptyJumps, type JumpEntry, recordJump, takeBack, takeForward } from "./jumps";
import { atRung, type LadderScope, oneDown, oneUp } from "./ladder";
import { useFrameLifecycle } from "./lifecycle";
import { decompose, measuredTarget } from "./measure-spacing";
import {
	type ElementGuides,
	type ElementHandles,
	type ElementPreview,
	type FrameHover,
	HANDLE_CURSORS,
	type Handle,
	type HoverRungs,
	isHandle,
	NO_MARKS,
	type PickedSelection,
	ROTATE_CURSOR,
	SelectionOverlay,
	sourcePathOf,
} from "./overlays";
import { PageObjectLabel, PageObjectView } from "./page-object";
import { pageIsBare, pageObjectAt, pageObjectsOn } from "./page-objects";
import {
	camerasFromState,
	frameFolderRel,
	frameSourcePath,
	pageOf,
	resolveActivePage,
	stateCameraSlots,
	switchPage,
} from "./pages";
import { type Held, PropertiesRail, rungOf, useRungs, useTheme } from "./properties-rail";
import { BASE, scopedClass } from "./properties-scope";
import { classEditsOf, type PropertyControls, type PropertyValue } from "./property-controls";
import {
	alterMessage,
	classMessage,
	clipboardCopyAllowed,
	dropTargetMessage,
	type EditedNode,
	type ElementSizing,
	type ElementSnapping,
	editMessage,
	endEditMessage,
	gapsMessage,
	type KinStep,
	kinMessage,
	measureMessage,
	type PickedHit,
	parseFrameMessage,
	pickKey,
	pickMessage,
	restampMessage,
	restoreMessage,
	type SessionRecord,
	type SiteAnchor,
	type SnapTrial,
	type SpacingReading,
	sessionReply,
	sharedStateMessage,
	sitesMessage,
	sizingMessage,
	snappingMessage,
	styleMessage,
	walkRejectionReason,
} from "./protocol";
import { CanvasSidebar, type FrameSpan, type RunEntry, type SelectModifiers } from "./sidebar";
import { type SnapMarks, snapEdge, snapMovedBox } from "./snap";
import { nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";
import { type Notice, Toast } from "./toast";
import { TrashToast } from "./trash-toast";
import { ATTENTION_MS, advanceDwell, looked, TICK_MS } from "./unseen";
import { WalkLayer, walksOf } from "./walk-layer";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with two tools. Select picks live DOM and arranges frames;
 * Hand pans, and Space borrows it while held. Selection keeps Figma's scope
 * grammar minus its descent: a click takes the frame, Command-click jumps
 * deepest, Shift toggles, hover previews, and Esc ascends — double-click goes
 * inside the frame, and the ladder is walked from the keyboard. Every frame
 * represented by element picks stays mounted for the selection. Geometry
 * sidecars are the only canvas writes; frame source remains agent-owned.
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
	// a page object's own press and drag (#265). One page rather than a set: a
	// page is picked on its own, and nothing moves with it but itself
	| { kind: "page-pending"; page: string; origin: Point; start: Point }
	| { kind: "page-move"; page: string; origin: Point; start: Point }
	| { kind: "marquee"; start: Point; base: readonly string[] }
	| { kind: "resize"; frame: string; handle: Handle; anchor: Point; origin: Box }
	// the element ring's own two drags (#259), which write classes rather than
	// geometry: the file is left alone until the pointer comes up, so one
	// gesture is one patch and one press of undo
	| {
			kind: "element-size";
			pick: PickedSelection;
			edge: Edge;
			from: Point;
			/** ⇧ and ⌥ as the grab found them; what they may mean waits on the measurement */
			asked: ResizeModifiers;
			/** null until the document answers: an unmeasured grab draws and writes nothing */
			measured: ResizeMeasurement | null;
	  }
	| { kind: "element-turn"; pick: PickedSelection; centre: Point; from: number; base: number; live: number }
	// the gap between a held container's children (#306): the same one read,
	// preview and save the ring's other drags use, over the space itself
	| ({ kind: "element-gap"; pick: PickedSelection } & GapDrag);

/** Every drag the ring owns, which share every way of being interrupted. */
function isRingGesture(
	active: Gesture,
): active is Extract<Gesture, { kind: "element-size" | "element-turn" | "element-gap" }> {
	return active.kind === "element-size" || active.kind === "element-turn" || active.kind === "element-gap";
}

/** Two lists of guide coordinates saying the same thing. */
const same = (a: readonly number[], b: readonly number[]): boolean =>
	a.length === b.length && a.every((value, at) => value === b[at]);

/** One size a resize drag worked out, and the guides that belong to it. */
interface ResizePaint {
	frame: string;
	box: Box;
	marks: SnapMarks;
}

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
/** how far each fresh copy steps off the frame it was made from (#229) */
const COPY_CASCADE_PX = 24;
/** how long a hand edit's outgoing document may stand before the still returns */
const HOLD_PAINT_MS = 3000;

/** A write that said what the file already said: no characters moved, so it is no step. */
function wroteNothing(undo: HeldPatch): boolean {
	return undo.start === undo.end && undo.text === "";
}

/**
 * One entry on the trash toast (#23, #229).
 *
 * A page carries the frames inside it so the canvas can empty at once, but it
 * is still one entry with one undo: the folder is what moves, so the folder is
 * what comes back. It is history's `Staging` rather than a twin of it, because
 * undoing a mint hands one straight to this toast (#230) — one shape, named
 * here for what it is out on the canvas.
 */
type StagedTrash = Staging;

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
	root,
	onChrome,
	onSettings,
	onRename,
	onFolder,
	focusName,
	onNameFocused,
}: {
	project: string;
	root?: string;
	focusName?: boolean | undefined;
	onNameFocused?: (() => void) | undefined;
	onRename?: ((name: string) => Promise<string | null>) | undefined;
	onFolder?: (() => void) | undefined;
	onChrome: (chrome: CanvasChrome | null) => void;
	/** the dock's cog (#282): the sheet is the shell's, so the door only asks */
	onSettings?: (() => void) | undefined;
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
	const [hovered, setHovered] = useState<FrameHover | null>(null);
	// the hover preview (#37, #254): the rung a click would take
	const [preview, setPreview] = useState<HoverRungs | null>(null);
	const [externalLink, setExternalLink] = useState<{ frame: string; href: string } | null>(null);
	const [accelDown, setAccelDown] = useState(false);
	const [spaceDown, setSpaceDown] = useState(false);
	const [panning, setPanning] = useState(false);
	const [resizeCursor, setResizeCursor] = useState<string | null>(null);
	const [resizingFrame, setResizingFrame] = useState<string | null>(null);
	const [marks, setMarks] = useState<SnapMarks>(NO_MARKS);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [menu, setMenu] = useState<CanvasContextMenu | null>(null);
	const [exportDialog, setExportDialog] = useState<readonly string[] | null>(null);
	const [exportReturnMenu, setExportReturnMenu] = useState<CanvasContextMenu | null>(null);
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | undefined>(undefined);
	const [notice, setNotice] = useState<Notice | null>(null);
	const exportDialogRef = useRef(exportDialog);
	exportDialogRef.current = exportDialog;
	// the frame finder (/): a palette over the viewport, and the page its pick lights
	const [finding, setFinding] = useState(false);
	const [findLit, setFindLit] = useState<string | null>(null);
	const findingRef = useRef(finding);
	findingRef.current = finding;
	const [pendingTrash, setPendingTrash] = useState<StagedTrash | null>(null);
	const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set<string>());
	// a page staged for the Trash leaves the rail with everything inside it, and
	// comes back whole if the toast is undone (#229)
	const [hiddenPages, setHiddenPages] = useState<ReadonlySet<string>>(new Set<string>());
	/**
	 * Where the agent rail stands, and so which rail the right column is showing
	 * (#256).
	 *
	 * It starts as the strip: properties are what the column shows by default,
	 * and the agent is reached by pressing its edge. A width somebody dragged
	 * outlives the reload, as every rail's does.
	 */
	const [docNonces, setDocNonces] = useState<Record<string, number>>({});
	const docNoncesRef = useRef(docNonces);
	docNoncesRef.current = docNonces;
	// the document each frame keeps on screen while its replacement boots
	// (#253's no blink): only a reload the canvas caused ever gets one
	const [heldPaint, setHeldPaint] = useState<Record<string, number>>({});
	// frames whose current boot is a walk arrival (#28): quiet cover, no veil
	const [walkArrivals, setWalkArrivals] = useState<ReadonlySet<string>>(new Set<string>());
	// the reason the last hand gesture was refused, drawn on the element it was about
	const [refused, setRefused] = useState<ShownRefusal | null>(null);
	// the in-place text edit that is open (#314), which is what hands the frame its pointer
	const [editing, setEditing] = useState<HandEdit | null>(null);
	// how many times the hand has saved each frame without reloading it (#314):
	// a save rewrites the very file the rung was read out of, so it is a fresh
	// read too, and the read has to carry the fingerprint the next write needs
	const [saves, setSaves] = useState<Record<string, number>>({});
	const [agentRequest, setAgentRequest] = useState<AgentRequest>();
	/**
	 * The element drag in flight (#259), as the ring draws it.
	 *
	 * The gesture itself lives in the ref every other drag does; this is the
	 * half that has to re-render — the box the ring follows the pointer with,
	 * the readout that rides beside it, and the tokens the rail's own fields
	 * tick in. Nothing here is written until the pointer comes up.
	 */
	const [elementDrag, setElementDrag] = useState<{
		frame: string;
		selector: string;
		rect: { x: number; y: number; w: number; h: number };
		says: string;
		turning: boolean;
		/** the target the pointer is holding, so the ring keeps drawing it */
		edge: Edge | null;
		box: Size;
	} | null>(null);
	/**
	 * The alignments a snapped resize is a true statement about (#311), in the
	 * frame document's own coordinates. Drawn only after the layout the
	 * correction made has been measured and still says so.
	 */
	const [elementGuides, setElementGuides] = useState<ElementGuides | null>(null);
	/**
	 * What the held container's own document says about its gaps (#306), and
	 * what a drag over one of them is doing.
	 *
	 * The reading is the frame's answer, kept beside the selector it is about
	 * so a stale one is never drawn over a new selection. The drag holds the
	 * band it grabbed, which stays where the pointer put it while the layout
	 * moves underneath.
	 */
	const [gapRead, setGapRead] = useState<{ frame: string; selector: string; reading: GapReading | null } | null>(null);
	const [gapDrag, setGapDrag] = useState<{ selector: string; index: number; band: GapBand; says: string } | null>(
		null,
	);
	// pages (#39): the named pages on disk, the one the canvas shows, and the
	// names discovery refuses to resolve
	const [pages, setPages] = useState<string[]>([]);
	const [activePage, setActivePage] = useState<string>(ROOT_PAGE);
	const [collisions, setCollisions] = useState<FrameCollision[]>([]);
	/**
	 * Where each page stands on the field holding it (#265).
	 *
	 * The whole project's, not this page's: an object is drawn on its parent's
	 * field, so switching page changes which of these are on screen and none of
	 * what they say. The projection arrives with one for every page.
	 */
	const [places, setPlaces] = useState<Readonly<Record<string, Place>>>({});
	/**
	 * The page object the hand is holding, if any.
	 *
	 * A page is selected on its own: picking one clears the frame selection and
	 * the selection never holds both. One page rather than a list — multi-select
	 * across pages and frames is not in this.
	 */
	const [selectedPage, setSelectedPage] = useState<string | null>(null);
	const [hoveredPage, setHoveredPage] = useState<string | null>(null);

	// the active page is the canvas: only its frames mount — and frames staged
	// for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useMemo(
		() => frames.filter((f) => pageOf(f) === activePage && !hidden.has(f.name)),
		[frames, activePage, hidden],
	);
	const navigatorFrames = useMemo(() => frames.filter((frame) => !hidden.has(frame.name)), [frames, hidden]);
	const navigatorPages = useMemo(() => pages.filter((page) => !hiddenPages.has(page)), [pages, hiddenPages]);
	/**
	 * The pages standing on the field, composed from the projection (#265).
	 *
	 * Nothing is fetched and nothing is baked: every frame under a page is
	 * already in hand with its geometry and its cover, so the picture is a read
	 * of what this side holds and a frame edited two pages down redraws the
	 * object above it as soon as the projection lands.
	 */
	const pageObjects = useMemo(
		() => pageObjectsOn(activePage, navigatorPages, navigatorFrames, places),
		[activePage, navigatorPages, navigatorFrames, places],
	);
	const pageObjectsRef = useRef(pageObjects);
	pageObjectsRef.current = pageObjects;
	/**
	 * Everything standing on this field, as boxes: the frames and the pages
	 * (#265). What a fit has to take in, because a page of pages is nothing but
	 * objects and a camera that only knew frames landed on an empty view.
	 */
	const fieldBoxes = useCallback(
		(): Box[] => [
			...framesRef.current.map(({ x, y, w, h }) => ({ x, y, w, h })),
			...pageObjectsRef.current.map(({ x, y, w, h }) => ({ x, y, w, h })),
		],
		[],
	);
	const placesRef = useRef(places);
	placesRef.current = places;
	const selectedPageRef = useRef(selectedPage);
	selectedPageRef.current = selectedPage;
	// the agent rail's one turn (#192). It owns the stream and nothing else here has
	// to know about it: a frame the turn writes lands as an ordinary `change` event,
	// so the canvas repaints while the transcript is still arriving.
	const [preferredEngine, setPreferredEngine] = useState<AgentEngineId>("spool");
	const enginePreferenceVersion = useRef(0);
	useEffect(() => {
		let live = true;
		const version = ++enginePreferenceVersion.current;
		void fetchEnginePreference(project).then((engine) => {
			if (live && version === enginePreferenceVersion.current) setPreferredEngine(engine);
		});
		return () => {
			live = false;
		};
	}, [project]);
	const rememberEngine = (engine: AgentEngineId) => {
		enginePreferenceVersion.current += 1;
		setPreferredEngine(engine);
		void putSetting("agent.engine", engine, project);
	};
	const deck = useAgentThreads(project, preferredEngine, root);
	const turn = deck.turn;
	const permissions = useAgentPermissions(project, deck.open, deck.engine, turn.phase);
	// whether there is an agent on this machine at all (#201). A `which` rather than a
	// spawn, asked when the rail opens, because a missing binary is a fact about this
	// machine that is true before anybody types
	const install = useAgentInstall(project, deck.engine, deck.open);
	// which machine is answering, asked of that machine rather than shipped (#118, #199).
	// Keyed on the open thread, because that is what the answer is about: the rows are the
	// binary's and the same for every thread, and which of them is answering is not.
	const offeredModel = useAgentModel(project, deck.open, deck.engine);
	const model = {
		...offeredModel,
		started: turn.entries.length > 0,
		onEngine: (engine: AgentEngineId) => {
			deck.chooseEngine(engine);
			rememberEngine(engine);
		},
	};
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
	// ⌥ is a hover modifier and nothing else: it draws the measurement and
	// changes no selection, so it never needs a render of its own — the reading
	// it asks for is what redraws (#261)
	const optionDownRef = useRef(false);
	/** The last screen point a relayed middle-button drag reported (#8). */
	const framePan = useRef<Point | null>(null);
	// ⌘ no longer borrows Select — Select is the base, and ⌘ is its element
	// modifier. Space is the only transient left.
	const transientTool: CanvasTool | null = spaceDown ? "hand" : null;
	const effectiveTool = transientTool ?? tool;
	const toolRef = useRef(effectiveTool);
	toolRef.current = effectiveTool;
	// Select and Edit both point, and everything a pointer draws — rings,
	// previews, element handles — belongs to the pair of them. Only the Hand
	// draws nothing, because the only thing it takes is the canvas itself.
	const pointerTool = effectiveTool !== "hand";
	const hideFrameHover = useCallback(() => {
		setHovered((current) =>
			current === null || !current.visible ? current : { frame: current.frame, visible: false },
		);
		setHoveredPage(null);
	}, []);
	useEffect(() => {
		if (pointerTool) return;
		setPreview(null);
		hideFrameHover();
	}, [pointerTool, hideFrameHover]);
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const pickedRef = useRef(picked);
	pickedRef.current = picked;
	// the walk session mirror: what the last go/back carried, owed to the next boot
	const walkSession = useRef<SessionRecord | null>(null);
	const walkTarget = useRef<string | null>(null);
	/**
	 * One session per page: the last state a frame on that page wrote,
	 * handed to every sibling as it is written and to any frame booting onto the
	 * page after. It lives as long as this canvas tab; nothing is written to disk.
	 */
	const pageSessions = useRef(new Map<string, SessionRecord>());
	const departedFrameDocuments = useRef(new Set<string>());
	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const pickWaiters = useRef(new Map<number, (chain: PickedHit[]) => void>());
	/** the frame's answer to putting one edit's words back (#314) */
	const restoreWaiters = useRef(new Map<number, (ok: boolean) => void>());
	/** the frame's answer to a delete, a hide, a show or an attribute (#317) */
	const alterWaiters = useRef(new Map<number, (answer: { ok: boolean; owner: string | null }) => void>());
	// the open edit as the handlers read it, a paint earlier than the render
	const editingRef = useRef<HandEdit | null>(null);
	const endEditRef = useRef<(commit: boolean) => void>(() => {});
	/** the structural gesture as its own refusal reaches for it: a delete that offers the call */
	const alterElementRef = useRef<
		(
			pick: PickedSelection,
			act: "delete" | "hide" | "show" | "attribute",
			at: { source: string; fingerprint: string },
			attribute?: { name: string; value: string },
		) => void
	>(() => {});
	// a press on the element already held, acted on at pointer-up (#255)
	const pressOnHeld = useRef<{ pick: PickedSelection; local: Point } | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	/**
	 * The frames the hand has saved and is still in (#314): the stamp it last
	 * wrote through, the fingerprint the file has now, and whether that file is
	 * the frame's own or a shared definition's (#318). A change the watcher
	 * reports on one of these is asked about before it reloads anything, and
	 * the frame reloads behind its hold the moment the hand leaves it.
	 */
	const saved = useRef(new Map<string, { source: string; fingerprint: string; own: boolean }>());
	/** the measurement overlay's own replies (#261), on the same id sequence */
	const measureWaiters = useRef(new Map<number, (reading: SpacingReading | null) => void>());
	const sizingWaiters = useRef(new Map<number, (sizing: ElementSizing | null) => void>());
	const snapWaiters = useRef(new Map<number, (snapping: ElementSnapping | null) => void>());
	/** which sample owns the outstanding snap: an older answer is not applied */
	const snapSample = useRef(0);
	/** the gap gesture's own replies (#306), on the same id sequence */
	const gapWaiters = useRef(new Map<number, (gaps: GapReading | null) => void>());
	const pickSeq = useRef(0);
	// picks apply only while their generation is current: a superseding intent
	// (a fresh press, a drag, Esc) bumps it and voids them — while a click and
	// the double-click it begins share one generation and apply in send order
	const pickGen = useRef(0);
	// the ancestry behind the current element selection — Esc ascends it
	const pickedChain = useRef<{ frame: string; chain: PickedHit[] } | null>(null);
	/**
	 * The same ancestry, drawn rather than read.
	 *
	 * Every gesture reads the chain synchronously, inside handlers that outlive
	 * the render they were made in, so the ref stays the authority. The rail's
	 * crumbs are the one reader that has to re-render when it moves (#256), and
	 * a mirror is cheaper than teaching a dozen handlers to await a state write.
	 */
	const [chainDrawn, setChainDrawn] = useState<{ frame: string; chain: PickedHit[] } | null>(null);
	const holdChain = useCallback((next: { frame: string; chain: PickedHit[] } | null) => {
		pickedChain.current = next;
		setChainDrawn(next);
	}, []);
	// hover picks ride pointer-move (#37): throttled, one in flight at a time
	const hoverLast = useRef(0);
	const hoverBusy = useRef(false);
	// where the ring was last drawn, so pressing or releasing ⌘ redraws it
	// under a pointer that has not moved (#254)
	const hoverPoint = useRef<{ frame: string; world: Point } | null>(null);
	// the redraw, reached from the key layer that outlives every render
	const refreshRings = useRef<() => void>(() => {});
	// frames whose next reload the canvas caused, so the outgoing document is
	// held rather than blinking through its own still (#253's no blink)
	const holdNext = useRef(new Set<string>());
	// frames whose file changed from outside while the hand held an element in
	// them (#319): the reload they owe is paid when the hand leaves the frame,
	// not under the gesture — the same flush the hand's own saves wait on
	const writtenUnderHand = useRef(new Set<string>());
	const holdTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	// the range anchor: shift over the page tree's frame rows
	const frameAnchor = useRef<string | null>(null);
	const nudgeDirty = useRef(new Set<string>());
	// where each frame stood when its nudge run began — one undo entry per flush
	const nudgeOrigins = useRef(new Map<string, Geometry>());
	const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const trashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingTrashRef = useRef<StagedTrash | null>(null);
	// staging a page has to leave it, and the switch is declared further down
	const leavePage = useRef<(target: string) => void>(() => {});
	// the one undo/redo stack: per window, in memory, hands' writes only — the
	// canvas's geometry and the rail's file operations on the same ⌘Z (#230)
	const history = useRef(emptyHistory());
	const updateHistory = useCallback((next: History) => {
		history.current = next;
	}, []);
	// the rail's runner, put here by the rail itself: it owns the stored order
	// and the explorer calls, so an explorer entry has to be run from there
	const runEntry = useRef<RunEntry | null>(null);
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

	// A self-capture failed with a reason worth keeping (#173): posted and
	// forgotten, since `spool logs` is the only reader and nothing on screen is
	// waiting on it.
	const onCaptureFailure = useCallback(
		(frame: string, error: string) => {
			postCaptureFailure(project, frame, error);
		},
		[project],
	);

	// A pointing tool owns every frame represented by its element picks. Without
	// picks, the selected frame and entered-frame modifier keep their intent.
	const selectionTargets = useMemo(() => {
		if (picked.length > 0) return new Set(picked.map((pick) => pick.frame));
		if (!pointerTool) return new Set<string>();
		if (selected.length > 0) return new Set(selected);
		return accelDown && entered !== null ? new Set([entered]) : new Set<string>();
	}, [pointerTool, picked, selected, accelDown, entered]);
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

	// A hidden hover lingers to fade its ring, and a ring fading out is nobody
	// pointing at anything (#172).
	const hoveredFrame = hovered?.visible === true ? hovered.frame : null;

	const lifecycle = useFrameLifecycle({
		framesRef,
		allFramesRef,
		entered,
		selectionTargets,
		resizing: resizingFrame,
		selected,
		hovered: hoveredFrame,
		// the hand holding an element holds the whole field still (#319)
		picking: picked.length > 0,
		hasCover: hasCover,
		onShot,
		onCaptureFailure,
		cameraRef: settledCameraRef,
		viewportRef,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;
	const sweepLifecycle = lifecycle.sweep;
	const noteCameraMoving = lifecycle.noteCameraMoving;
	const contentRequest = useRef(0);
	const contentSize = useRef<{ frame: string; width: number; height: number } | null>(null);
	const resizingWidth = frames.find((frame) => frame.name === resizingFrame)?.w;
	useEffect(() => {
		contentRequest.current += 1;
		if (resizingFrame === null || resizingWidth === undefined) {
			contentSize.current = null;
			return;
		}
		if (contentSize.current?.width !== Math.round(resizingWidth)) contentSize.current = null;
		if (!lifecycle.ready.has(resizingFrame)) return;
		iframes.current
			.get(resizingFrame)
			?.contentWindow?.postMessage({ spool: "content-size", id: contentRequest.current }, "*");
	}, [resizingFrame, resizingWidth, lifecycle.ready]);

	/** The held document lets go: the one behind it has arrived, or given up. */
	const releaseHold = useCallback((frame: string) => {
		clearTimeout(holdTimers.current.get(frame));
		holdTimers.current.delete(frame);
		setHeldPaint((current) => {
			if (current[frame] === undefined) return current;
			const next = { ...current };
			delete next[frame];
			return next;
		});
	}, []);

	/**
	 * What the held rung's own file leaves live (#259), as the press reads it.
	 *
	 * Filled from the ring's read further down and mirrored here, because the
	 * handlers are written before it and a grab has to answer off the file
	 * rather than off a render.
	 */
	const ringRef = useRef<Ring>(NO_RING);
	/** the selection's read as the handlers see it, a paint earlier than the render */
	const railRungsRef = useRef<(RungRead | undefined)[] | null>(null);

	/** The bands a gap gesture may grab, off the render the pointer can see (#306). */
	const gapRef = useRef<GapTargets>({ axis: null, sign: 1, authored: null, bands: [] });

	const reloadFrameDocument = useCallback(
		(frame: string) => {
			// a reload the canvas caused holds its outgoing document on screen
			// until the new one reports arrived (#253's no blink); the timer is the
			// bound, because a document that never arrives must not leave a dead
			// one standing in front of it
			const was = docNoncesRef.current[frame] ?? 0;
			// the mirror moves now rather than at the next render, so a second
			// reload in the same tick holds the document it actually replaced
			docNoncesRef.current = { ...docNoncesRef.current, [frame]: was + 1 };
			if (holdNext.current.delete(frame)) {
				setHeldPaint((current) => ({ ...current, [frame]: was }));
				clearTimeout(holdTimers.current.get(frame));
				holdTimers.current.set(
					frame,
					setTimeout(() => releaseHold(frame), HOLD_PAINT_MS),
				);
			}
			setDocNonces((current) => ({ ...current, [frame]: was + 1 }));
			// the document an edit was open in is going: the shim's half of it goes
			// with it, so the canvas must not keep holding this frame's pointer
			if (editingRef.current?.frame === frame) {
				editingRef.current = null;
				setEditing(null);
			}
			saved.current.delete(frame);
			setWalkArrivals((current) => withoutFrame(current, frame));
			// a reload drops every pick in the frame: the new document is asked afresh
			setPicked((current) => current.filter((pick) => pick.frame !== frame));
			if (pickedChain.current?.frame === frame) holdChain(null);
			setPreview((current) => (current?.click?.frame === frame || current?.under?.frame === frame ? null : current));
			lifecycleRef.current.markStale(frame);
		},
		[holdChain, releaseHold],
	);

	/**
	 * A frame's document changed on disk, when the hand may be holding it (#319).
	 *
	 * The frame you have an element picked in does not reload under you. A reload
	 * is a remount: the pick, the ring and the rail all address the DOM that is
	 * on screen, and swapping it mid-gesture takes the element out from under the
	 * hand that just wrote it. The reload is still owed — the frame is showing a
	 * document the file no longer says — so it is remembered and paid when the
	 * hand leaves the frame, behind its own last paint rather than through its
	 * still, alongside the reloads the hand's own saves owe (#314).
	 *
	 * This is the seam every change lands on: whatever wrote the file, the change
	 * arrives here, and one made while the element is held simply waits.
	 */
	const reloadOrHold = useCallback(
		(frame: string) => {
			if (pickedRef.current.some((pick) => pick.frame === frame)) {
				writtenUnderHand.current.add(frame);
				return;
			}
			reloadFrameDocument(frame);
		},
		[reloadFrameDocument],
	);

	/**
	 * A change reported on the file a frame the hand saved is still showing
	 * (#314, #318). The frame already shows what the hand wrote, so the file
	 * is asked whether it is still that, and only a change from outside
	 * reloads — and that one waits for the hand like any other (#319).
	 */
	const changedUnderHand = useCallback(
		(frame: string, own: { source: string; fingerprint: string }) => {
			void readRungs(project, frame, [own.source]).then((rungs) => {
				if (saved.current.get(frame) !== own || rungs?.[0]?.fingerprint === own.fingerprint) return;
				reloadOrHold(frame);
			});
		},
		[project, reloadOrHold],
	);

	/**
	 * A frame that changed size is a frame whose picture is wrong.
	 *
	 * A cover is the document photographed at one width and drawn `object-cover`
	 * into the frame's box, so a resize invalidates it twice over: the layout it
	 * recorded is not the layout the frame now has, and the raster it recorded is
	 * the wrong shape for the box it now fills. Nothing else notices. A geometry
	 * write never touches the document, and a frame that drops out of live
	 * because you zoomed away keeps its picture on purpose (`lifecycle.ts`), so
	 * the wrong one would stand until the next source edit.
	 *
	 * Every hand that writes a size lands here — a drag, an undo, and the agent's
	 * own frame.json arriving over the stream — which is what makes stating a size
	 * before the frame entry advice rather than a race. A size written after the
	 * frame appeared costs its first paint and nothing else.
	 *
	 * A drag in flight is skipped, and deliberately records nothing while it is:
	 * the size worth photographing is the one you let go of, and marking every
	 * frame of the gesture would start the staleness clock at the grab, leaving
	 * the eventual capture overdue (#215) and shooting the reboot mid-arrival.
	 */
	const footprints = useRef(new Map<string, string>());
	useEffect(() => {
		if (resizingFrame !== null || gesture.current.kind === "resize") return;
		const seen = new Map<string, string>();
		for (const frame of frames) {
			const footprint = `${Math.round(frame.w)}×${Math.round(frame.h)}`;
			seen.set(frame.name, footprint);
			const before = footprints.current.get(frame.name);
			if (before !== undefined && before !== footprint) lifecycleRef.current.markStale(frame.name);
		}
		footprints.current = seen;
	}, [frames, resizingFrame]);

	const onIframe = useCallback((name: string, el: HTMLIFrameElement | null) => {
		if (el === null) iframes.current.delete(name);
		else {
			if (iframes.current.get(name) !== el) departedFrameDocuments.current.delete(name);
			iframes.current.set(name, el);
		}
		lifecycleRef.current.onIframe(name, el);
	}, []);

	const capturePng = useCallback(async (frame: ProjectedFrame): Promise<CapturedFrame> => {
		const sheet = await lifecycleRef.current.captureExport(frame.name);
		if (sheet === undefined) throw new Error(`Couldn’t capture ${frame.name}. Try again.`);
		const png = await pngBytesFromImageBlob(await (await fetch(sheet.url)).blob(), frame.w, frame.h);
		return { name: frame.name, width: frame.w, height: frame.h, png };
	}, []);

	const runExport = useCallback(
		async (names: readonly string[], format: ExportFormat) => {
			const ordered = framesInCanvasOrder(framesRef.current, names);
			const first = ordered[0];
			if (first === undefined) return;
			setExporting(true);
			setExportError(undefined);
			if (ordered.length === 1) setNotice({ kind: "progress", message: `Exporting ${first.name}…` });
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
				setNotice({
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
				if (ordered.length === 1) setNotice({ kind: "error", message });
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
		if (notice === null || notice.kind === "progress") return;
		const timeout = setTimeout(() => setNotice(null), 3500);
		return () => clearTimeout(timeout);
	}, [notice]);

	const refetchFrames = useCallback(async () => {
		const projection = await fetchProjection(project);
		if (projection === undefined) return;
		setFrames(projection.frames);
		setPages(projection.pages);
		// lenient on the way in, like every other read of a durable: a projection
		// with nothing to say about places leaves the field with no pages on it
		// rather than with nothing on it
		setPlaces(projection.places ?? {});
		setCollisions(projection.collisions);
		setLoaded(true);
	}, [project]);

	/**
	 * What nobody has looked at (seen.ts), as the projection says minus what this
	 * canvas has just cleared.
	 *
	 * The overlay exists because the record is the daemon's: marking a frame read
	 * is a round trip, and a mark that outlives the click by a third of a second
	 * reads as a click that missed. Names leave the overlay when the read they
	 * belong to has landed and the projection has been read back, so a frame that
	 * changed again in that window comes back marked rather than staying quiet.
	 */
	const [read, setRead] = useState<ReadonlySet<string>>(new Set());
	const unseen = useMemo(() => {
		const marks = new Map<string, Unseen>();
		for (const frame of frames) {
			if (frame.unseen !== undefined && !read.has(frame.name)) marks.set(frame.name, frame.unseen);
		}
		return marks;
	}, [frames, read]);
	const unseenRef = useRef(unseen);
	unseenRef.current = unseen;
	/** the last thing a person did here: the dwell clock stops when it goes stale */
	const attention = useRef(Date.now());
	const dwell = useRef(new Map<string, number>());
	const reading = useRef(new Set<string>());
	const readFlush = useRef<number | null>(null);

	const markRead = useCallback(
		(names: readonly string[]) => {
			const fresh = names.filter((name) => unseenRef.current.has(name));
			if (fresh.length === 0) return;
			for (const name of fresh) reading.current.add(name);
			setRead((current) => new Set([...current, ...fresh]));
			if (readFlush.current !== null) return;
			// one write per burst: panning across a row clears six marks and posts once
			readFlush.current = window.setTimeout(() => {
				readFlush.current = null;
				const batch = [...reading.current];
				reading.current.clear();
				void (async () => {
					await postSeen(project, batch);
					await refetchFrames();
					setRead((current) => {
						const next = new Set(current);
						for (const name of batch) next.delete(name);
						return next;
					});
				})();
			}, 260);
		},
		[project, refetchFrames],
	);

	/**
	 * The dwell clock. A frame that has held enough of the viewport for long enough
	 * has been read, and the mark goes out behind you as you pan across a row.
	 *
	 * It runs only while there is something to clear, and only while somebody is
	 * here: an unfocused window and a canvas nobody has touched in half a minute
	 * both stop it, or the field would clear itself overnight — including the
	 * frames an agent writes into it while nobody is looking.
	 */
	useEffect(() => {
		if (unseen.size === 0) return;
		const timer = window.setInterval(() => {
			if (!document.hasFocus() || Date.now() - attention.current > ATTENTION_MS) {
				dwell.current.clear();
				return;
			}
			const camera = cameraRef.current;
			const viewport = viewportRef.current;
			if (camera === null || viewport === null) return;
			const vw = viewport.clientWidth;
			const vh = viewport.clientHeight;
			const looking = framesRef.current
				.filter((frame) => unseenRef.current.has(frame.name) && looked(frame, camera, vw, vh))
				.map((frame) => frame.name);
			const crossed = advanceDwell(dwell.current, looking);
			if (crossed.length > 0) markRead(crossed);
		}, TICK_MS);
		return () => window.clearInterval(timer);
	}, [unseen.size, markRead]);

	useEffect(() => {
		const touch = () => {
			attention.current = Date.now();
		};
		window.addEventListener("pointermove", touch, { passive: true });
		window.addEventListener("pointerdown", touch, { passive: true });
		window.addEventListener("wheel", touch, { passive: true });
		window.addEventListener("keydown", touch);
		return () => {
			window.removeEventListener("pointermove", touch);
			window.removeEventListener("pointerdown", touch);
			window.removeEventListener("wheel", touch);
			window.removeEventListener("keydown", touch);
		};
	}, []);

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
			if (!alive) return;
			void refetchFlows();
			await refetchFrames();
			// dark targets get one render pass per canvas open (#34): frames whose
			// read is already fresh cost nothing, so this is a no-op on reopen. The
			// boot does not wait on it — a first read renders every frame that
			// declares one, in a browser this may have to start, and the arrows it
			// finds redraw whenever they land.
			if (!alive) return;
			void (async () => {
				const resolved = await resolveFlows(project);
				if (alive && resolved?.read !== 0) await refetchFlows();
			})();
		})();
		return () => {
			alive = false;
		};
	}, [project, refetchFrames, refetchFlows]);

	// --- site boxes (#34, #214): where an arrow grows from, and where a write landed ---

	const edgesRef = useRef(edges);
	edgesRef.current = edges;
	const siteBoxSeq = useRef(0);
	const siteBoxExpected = useRef(new Map<string, number>());
	/** every located write still waiting for a document to turn its lines into a box */
	const armedWrites = useRef(new Map<string, ArmedWrite>());

	/**
	 * Ask one frame's shim where the elements the canvas is asking about sit. Only
	 * the newest request per frame applies; a frame standing as its picture has no
	 * document to ask and its arrows keep the frame-edge fallback until the next
	 * time something borrows it.
	 *
	 * Two questions ride the one message: the navigation sites, which move with the
	 * graph, and the line ranges of writes the agent has just landed (#214). They
	 * are asked together because they are one question of one document — where does
	 * this bit of source sit on screen — and because a frame that has just booted
	 * should be measured once rather than twice.
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
		for (const write of armedWrites.current.values()) {
			const key = rangeKeyOf(write.path, write.from, write.to);
			if (seen.has(key)) continue;
			seen.add(key);
			anchors.push({ path: write.path, line: write.from, col: 0, through: write.to });
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

	// the agent's hand (#214): where it is, and what it has just changed. The arms are a
	// ref here because `requestSiteBoxes` reads them from inside a message handler
	const { hand, marks: handMarks, strike } = useAgentHand(project, turn, armedWrites);

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

	// no stored camera: fit the field once both viewport and field exist
	useLayoutEffect(() => {
		if (camera !== null || !loaded) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		const boxes = fieldBoxes();
		setCamera(
			boxes.length === 0
				? { x: 0, y: 0, k: 1 }
				: fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight),
		);
	}, [camera, loaded, fieldBoxes]);

	/**
	 * A shelf is fitted on every arrival, stored camera or not. A page with no
	 * frames of its own has nothing on it a hand arranged: the daemon lays its
	 * pages, and lays them again as pages come and go, so a camera kept from
	 * last time was aimed at a field that may no longer be there. Once, per
	 * arrival; what the hand does with the camera after that is its own.
	 */
	const arrivedOn = useRef<string | null>(null);
	useLayoutEffect(() => {
		if (!loaded || arrivedOn.current === activePage) return;
		arrivedOn.current = activePage;
		if (framesRef.current.length > 0 || pageObjectsRef.current.length === 0) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		setCamera(fitCamera(boundsOf(fieldBoxes()), viewport.clientWidth, viewport.clientHeight));
	}, [loaded, activePage, fieldBoxes]);

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
		const boxes = fieldBoxes();
		if (viewport === null || boxes.length === 0) return;
		animateCamera(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
	}, [animateCamera, fieldBoxes]);

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
	 *
	 * A spot is the whole standing: the page, the camera, the frame you are
	 * inside, and what you had chosen — so a jump can hand all of it back.
	 */
	const jumpSpot = useCallback((): JumpEntry | undefined => {
		const cam = cameraRef.current;
		if (cam === null) return undefined;
		return {
			page: activePageRef.current,
			camera: { x: cam.x, y: cam.y, k: cam.k },
			entered: enteredRef.current,
			selected: [...selectedRef.current],
			picked: [...pickedRef.current],
		};
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
			// Center a frame that still fits on screen, but preserve a close-up.
			// Entering never zooms out; the sidebar's explicit flight still fits.
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (viewport === null || cam === null) return;
			const next = entryCamera(cam, frame, viewport.clientWidth, viewport.clientHeight);
			// standing still is not a flight: a 220ms animation to where you
			// already are would fight a wheel that arrives inside it
			if (next.x !== cam.x || next.y !== cam.y || next.k !== cam.k) animateCamera(next);
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
	 * Play (#227): a browser tab on `/play/`, the door that already exists for
	 * agents and phones. The canvas holds no play state at all — zooming on it
	 * is navigation and nothing modal, and the tab is closed the way every tab
	 * is closed.
	 */
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
				if (entry !== undefined) updateHistory(record(history.current, entry));
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
		[project, refetchFrames, updateHistory],
	);

	/**
	 * A page's place, written to the durable the whole project shares (#265).
	 *
	 * The whole map goes over the wire because that is what the key holds and
	 * this side has all of it: the projection completes a place for every page,
	 * so writing what is in hand can never be how one gets dropped. A write that
	 * never landed reads the projection back rather than leaving the field lying
	 * about where a page stands, exactly as a geometry write does.
	 */
	const applyPlaces = useCallback(
		(moved: Readonly<Record<string, Place>>) => {
			const next = { ...placesRef.current, ...moved };
			placesRef.current = next;
			setPlaces(next);
			void putPlaces(project, next).then((ok) => {
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

	/**
	 * The frame's geometry, typed into the rail (#256).
	 *
	 * `frame.json` and never source: the frame and its root element are the same
	 * rectangle and different things to adjust, and this is the half the canvas
	 * has always owned. It writes the same sidecar a drag does and records the
	 * same entry, so one field is one ⌘Z on the one stack.
	 */
	const setFrameGeometry = useCallback(
		(name: string, patch: Partial<Geometry>) => {
			const was = framesRef.current.find((frame) => frame.name === name);
			if (was === undefined) return;
			const before = { x: Math.round(was.x), y: Math.round(was.y), w: Math.round(was.w), h: Math.round(was.h) };
			const after = { ...before, ...patch };
			const entry = entryOf({ [name]: before }, { [name]: after });
			if (entry === undefined) return;
			updateHistory(record(history.current, entry));
			applyRects({ [name]: after });
		},
		[applyRects, updateHistory],
	);

	/**
	 * The rail's scrub, mid-gesture (#256): the screen alone.
	 *
	 * A scrub used to write per tick, and every write came back around — the
	 * daemon's own echo refetched the projection under the drag and stomped
	 * newer state, which read as jitter. So a tick lands like a corner drag's
	 * move: local frames only, and the file waits for the pointer to lift.
	 */
	const previewFrameGeometry = useCallback((name: string, patch: Partial<Geometry>) => {
		setFrames((current) => current.map((frame) => (frame.name === name ? { ...frame, ...patch } : frame)));
	}, []);

	/** The scrub let go: one sidecar write and one undo slot for the whole drag. */
	const commitFrameGeometry = useCallback(
		(name: string, before: Geometry) => commitGeometry([name], { [name]: before }),
		[commitGeometry],
	);

	/**
	 * Fresh copies from the rail (#229), given somewhere to be.
	 *
	 * A duplicate copies the geometry sidecar verbatim (#228), so a copy that
	 * stayed on its original's page would land exactly on top of it. The rail
	 * made the copies and the canvas owns the plane, so the offset is written
	 * here: each copy steps a little further off the frame it was made from, and
	 * they end up selected, the way duplicating out on the canvas would leave
	 * them. It takes no undo slot — there is nothing to put back, because the
	 * copies were not anywhere a moment ago.
	 */
	const cascadeCopies = useCallback(
		(copies: readonly FrameCopy[]) => {
			const rects: Record<string, Geometry> = {};
			copies.forEach((copy, index) => {
				const from = allFramesRef.current.find((frame) => frame.name === copy.from);
				if (from === undefined) return;
				const step = COPY_CASCADE_PX * (index + 1);
				rects[copy.to] = {
					x: Math.round(from.x + step),
					y: Math.round(from.y + step),
					w: Math.round(from.w),
					h: Math.round(from.h),
				};
			});
			if (Object.keys(rects).length > 0) void putGeometry(project, rects);
			const landed = copies.map((copy) => copy.to);
			if (landed.length === 0) return;
			setPicked([]);
			holdChain(null);
			setSelected(landed);
			frameAnchor.current = landed[0] ?? null;
		},
		[holdChain, project],
	);

	/** What a history entry is checked against: the disk as the canvas has it now. */
	const liveness = useCallback(
		(): Liveness => ({
			frames: new Map(allFramesRef.current.map((frame) => [frame.name, pageOf(frame)])),
			pages: new Set(pagesRef.current),
			pending: pendingTrashRef.current,
		}),
		[],
	);

	const recordEntry = useCallback(
		(entry: HistoryEntry) => {
			updateHistory(record(history.current, entry));
		},
		[updateHistory],
	);

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
		updateHistory(record(history.current, entry));
		applyRects(rects);
	}, [applyRects, flushNudge, updateHistory]);

	// --- trash (#23): instant canvas removal, disk move deferred on the toast ---

	const commitTrash = useCallback(() => {
		const staged = pendingTrashRef.current;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		if (staged === null || (staged.frames.length === 0 && staged.page === null)) return;
		const pages = staged.page === null ? [] : [staged.page];
		void postTrash(project, [...staged.frames], pages).then((ok) => {
			if (ok) return;
			// the move never happened: resurface what was staged instead of losing it
			setHidden((current) => new Set([...current].filter((name) => !staged.frames.includes(name))));
			setHiddenPages((current) => new Set([...current].filter((page) => page !== staged.page)));
			void refetchFrames();
		});
	}, [project, refetchFrames]);

	/**
	 * Stage one entry on the trash toast.
	 *
	 * A page is one entry rather than one per frame inside it: the folder is what
	 * moves, so it is also what is undone. Everything else is unchanged — the
	 * canvas empties instantly and the disk move waits out the toast.
	 */
	const stageEntry = useCallback(
		(staged: StagedTrash) => {
			if (staged.frames.length === 0 && staged.page === null) return;
			commitTrash(); // an earlier toast still open commits now — one undo slot (#7)
			const page = staged.page;
			// leave the page before staging it, never after: switching commits a
			// pending trash to keep one undo slot, and doing it the other way round
			// would commit the very entry that caused the switch — no toast, no undo
			// a page inside the one being staged goes with the folder, so being on one
			// of those is being on a page that is about to be gone
			if (page !== null && (activePageRef.current === page || pageWithin(page, activePageRef.current))) {
				leavePage.current(ROOT_PAGE);
			}
			setHidden((current) => new Set([...current, ...staged.frames]));
			if (page !== null) setHiddenPages((current) => new Set([...current, page]));
			setSelected((current) => current.filter((name) => !staged.frames.includes(name)));
			setPicked((current) => {
				const kept = current.filter((pick) => !staged.frames.includes(pick.frame));
				return kept.length === current.length ? current : kept;
			});
			if (enteredRef.current !== null && staged.frames.includes(enteredRef.current)) exitEntered();
			pendingTrashRef.current = staged;
			setPendingTrash(staged);
			trashTimer.current = setTimeout(commitTrash, TRASH_UNDO_MS);
		},
		[commitTrash, exitEntered],
	);

	const stageTrash = useCallback((names: string[]) => stageEntry({ frames: names, page: null }), [stageEntry]);

	const undoTrash = useCallback(() => {
		const staged = pendingTrashRef.current;
		if (staged === null) return;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		setHidden((current) => new Set([...current].filter((name) => !staged.frames.includes(name))));
		setHiddenPages((current) => new Set([...current].filter((page) => page !== staged.page)));
	}, []);

	/**
	 * The hand's door to the agent: the composer takes focus, on the thread that
	 * is open. From a refusal of typed words it opens holding the change the
	 * hand tried (#314), and sends nothing until the person does.
	 */
	const askAgent = useCallback(
		(from?: ShownRefusal) => {
			const pick =
				from === undefined
					? undefined
					: pickedRef.current.find((held) => held.frame === from.frame && held.selector === from.selector);
			setAgentRequest({
				id: crypto.randomUUID(),
				thread: deck.open,
				...(from?.attempted === undefined
					? {}
					: {
							prepared: {
								intent: `text ${from.frame} ${from.selector}`,
								text: askText(from, pick),
								selection: [],
							},
						}),
			});
		},
		[deck.open],
	);

	// --- where a text write lands (#314) -----------------------------------------

	/**
	 * The fingerprint the canvas holds for the file a stamp names (#314).
	 *
	 * Every write is measured against the file the surface read it out of, and
	 * a write that reaches a call site one owner up reaches a second file — so
	 * that one is looked up the same way: the hand's own last save on this
	 * frame first, because it is newer than any read, then the rungs of the
	 * selection's own read. Nothing when neither knows the file, which leaves
	 * the daemon's fresh read of it the first anybody has seen.
	 */
	const fingerprintFor = useCallback((frame: string, stamp: string): string | undefined => {
		const path = `design/${stamp.replace(/:\d+:\d+$/, "")}`;
		const own = saved.current.get(frame);
		if (own !== undefined && `design/${own.source.replace(/:\d+:\d+$/, "")}` === path) return own.fingerprint;
		for (const rung of railRungsRef.current ?? []) {
			if (rung?.path === path && rung.fingerprint !== undefined) return rung.fingerprint;
		}
		return undefined;
	}, []);

	/** Whether a write landed outside the frame's own folder: in a shared definition's file (#318). */
	const sharedWrite = useCallback((frame: string, path: string): boolean => {
		const held = allFramesRef.current.find((entry) => entry.name === frame);
		return held === undefined || !path.startsWith(`design/${frameFolderRel(frame, pageOf(held))}`);
	}, []);

	/**
	 * The other frames rendering a shared file the hand is about to write
	 * (#318), read off the rung before the gesture. Each is showing a document
	 * the file is about to stop saying, and the watcher's echo will reload it;
	 * its last paint is held from here, before the write leaves, so that
	 * reload lands behind the document on screen rather than through a still
	 * of the old design — the echo can reach the canvas before the answer
	 * does, so nothing about this may wait on the answer. A write that lands
	 * somewhere else after all, or not at all, lets them go.
	 */
	const holdReaders = useCallback((frame: string, readers: readonly string[]) => {
		for (const other of readers) if (other !== frame && iframes.current.has(other)) holdNext.current.add(other);
	}, []);
	const releaseReaders = useCallback((frame: string, readers: readonly string[]) => {
		for (const other of readers) if (other !== frame) holdNext.current.delete(other);
	}, []);

	/** Whether the hand is still in a frame: selected, an element of it held, or entered. */
	const frameHeld = useCallback(
		(frame: string) =>
			selectedRef.current.includes(frame) ||
			pickedRef.current.some((pick) => pick.frame === frame) ||
			enteredRef.current === frame,
		[],
	);

	/**
	 * What a write that has landed leaves behind, whichever direction it ran.
	 *
	 * The frame already shows the words, so it is not reloaded (rule 4): the
	 * file is a fresh read for the rung, the stamps a save shifted along its
	 * line are moved in the document and in the held picks, and the frame is
	 * remembered as saved so the watcher's echo of this write reloads nothing
	 * and leaving the frame does. A frame the hand had already left, or a
	 * write only a reload can place, reloads behind its hold now.
	 *
	 */
	const landed = useCallback(
		(
			frame: string,
			readAt: string,
			written: { path: string; fingerprint: string; shifts: StampShift[] | null },
		): boolean => {
			setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
			if (written.shifts === null || !frameHeld(frame)) {
				saved.current.delete(frame);
				holdNext.current.add(frame);
				reloadFrameDocument(frame);
				return false;
			}
			saved.current.set(frame, {
				source: readAt,
				fingerprint: written.fingerprint,
				own: !sharedWrite(frame, written.path),
			});
			const shifts = written.shifts;
			if (!shifts.some((shift) => shift.delta !== 0)) return true;
			const file = written.path.replace(/^design\//, "");
			iframes.current.get(frame)?.contentWindow?.postMessage(restampMessage(file, shifts), "*");
			const move = (source: string | null) => (source === null ? null : restamped(source, file, shifts));
			setPicked((current) =>
				current.map((pick) => (pick.frame === frame ? { ...pick, source: move(pick.source) } : pick)),
			);
			const chain = pickedChain.current;
			if (chain?.frame === frame) {
				holdChain({ frame, chain: chain.chain.map((hit) => ({ ...hit, source: move(hit.source) })) });
			}
			return true;
		},
		[frameHeld, holdChain, reloadFrameDocument, sharedWrite],
	);

	/**
	 * What every hand write does with its answer (#314–#318).
	 *
	 * The four gestures differ in what they send and in what they do with a
	 * write that landed; everything between was the same thirty lines written
	 * out four times. The readers held before the write go free the moment it
	 * turns out not to have reached them; a refusal is shown where the gesture
	 * was, and one about a file that moved underneath re-reads the rung; a
	 * write that said what the file already said is no step at all; and a write
	 * that landed is one history entry and, once per project, the line about
	 * nothing catching hand edits.
	 */
	const settled = useCallback(
		(
			written: TextWritten | undefined,
			about: {
				frame: string;
				/** the frames rendering a shared file, held before the write left */
				readers: readonly string[];
				/** the ask the frame holds the DOM half of this write under */
				edit: number;
				/** the stamp the entry re-reads its rung at, given the file the write landed in */
				readAt: (path: string) => string;
				refuse: (refusal: Refusal) => void;
				/** the sentence for a write that never reached the daemon at all */
				failed: string;
				/** what this gesture's entry carries beyond the patch */
				entry?: Pick<Extract<HistoryEntry, { kind: "hand" }>, "classes">;
				/** the write said what the file already said */
				nothing?: () => void;
				/** the write landed, and whether the frame kept the document it is showing */
				onLanded?: (kept: boolean) => void;
			},
		) => {
			const { frame, readers } = about;
			if (written === undefined) {
				releaseReaders(frame, readers);
				about.refuse({ code: "failed", says: about.failed });
				return;
			}
			if (!written.ok) {
				releaseReaders(frame, readers);
				about.refuse(written.refusal);
				// a file that moved underneath is a fresh read of the rung
				if (written.refusal.code === "stale-file") {
					setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
				}
				return;
			}
			const shared = sharedWrite(frame, written.path);
			if (!shared || wroteNothing(written.undo)) releaseReaders(frame, readers);
			if (wroteNothing(written.undo)) {
				about.nothing?.();
				return;
			}
			const readAt = about.readAt(written.path);
			const kept = landed(frame, readAt, written);
			recordEntry({
				kind: "hand",
				frame,
				edit: about.edit,
				patch: written.undo,
				readAt,
				...(about.entry ?? {}),
				...(shared ? { frames: readers } : {}),
			});
			about.onLanded?.(kept);
			if (written.uncaught === true) {
				setNotice({ kind: "success", message: "No history here: nothing is catching hand edits" });
			}
		},
		[landed, recordEntry, releaseReaders, sharedWrite],
	);

	/**
	 * The DOM half of a class change (#315): the frame swaps the tokens that
	 * changed on the element, takes the sheet the file now compiles to, and
	 * lifts the inline preview. It says whether the element was still there.
	 */
	const swapClass = useCallback(
		(
			frame: string,
			selector: string,
			change: { was: string; now: string; css?: string },
			then: (ok: boolean) => void,
		) => {
			const target = iframes.current.get(frame)?.contentWindow;
			if (target == null) {
				then(false);
				return;
			}
			const ask = ++pickSeq.current;
			restoreWaiters.current.set(ask, then);
			target.postMessage(classMessage(selector, change.was, change.now, change.css, ask), "*");
			setTimeout(() => {
				if (restoreWaiters.current.delete(ask)) then(false);
			}, PICK_REPLY_MS);
		},
		[],
	);

	/** The DOM half of undo and redo: the frame puts one edit's words back itself, and says whether it could. */
	const restoreWords = useCallback(
		(frame: string, edit: number, way: "before" | "after", then: (ok: boolean) => void) => {
			const target = iframes.current.get(frame)?.contentWindow;
			if (target == null) {
				then(false);
				return;
			}
			const ask = ++pickSeq.current;
			restoreWaiters.current.set(ask, then);
			target.postMessage(restoreMessage(edit, way, ask), "*");
			setTimeout(() => {
				if (restoreWaiters.current.delete(ask)) then(false);
			}, PICK_REPLY_MS);
		},
		[],
	);

	/**
	 * One hand entry, run either way (#314, #315). The patch goes back over the
	 * wire, the daemon re-checks the fingerprint, and what comes back is the
	 * inverse this entry carries from here on. A refusal means the file moved
	 * since — the step is dropped, and said so. The DOM half is the frame's own:
	 * it puts the words back on its nodes, or swaps the class literal the entry
	 * carries between the two it holds; one that no longer holds them reloads
	 * behind its hold.
	 */
	const walkHand = useCallback(
		(entry: Extract<HistoryEntry, { kind: "hand" }>, way: Way, taking: History) => {
			const classes = entry.classes;
			const readers = entry.frames ?? [];
			holdReaders(entry.frame, readers);
			// a class change is swapped on the element rather than reloaded, so the
			// answer has to carry the sheet the frame now compiles to
			void revertPatch(project, entry.patch, classes === undefined ? undefined : entry.frame).then((reverted) => {
				// a press that landed after this one owns the stacks now
				if (history.current !== taking) return;
				if (reverted === undefined || !reverted.ok) {
					releaseReaders(entry.frame, readers);
					updateHistory(drop(history.current, way));
					setNotice({
						kind: "error",
						message:
							reverted === undefined
								? "The step could not be put back"
								: "The file changed since; this step is dropped",
					});
					return;
				}
				updateHistory(
					amend(history.current, way, {
						...entry,
						patch: reverted.undo,
						...(classes === undefined ? {} : { classes: { ...classes, from: classes.to, to: classes.from } }),
					}),
				);
				const kept = landed(entry.frame, entry.readAt, reverted);
				const held = (ok: boolean) => {
					if (ok || !saved.current.has(entry.frame)) return;
					saved.current.delete(entry.frame);
					holdNext.current.add(entry.frame);
					reloadFrameDocument(entry.frame);
				};
				if (classes === undefined) {
					restoreWords(entry.frame, entry.edit, way === "undo" ? "before" : "after", held);
					return;
				}
				if (!kept) return;
				const change = {
					was: classes.from,
					now: classes.to,
					...(reverted.css === undefined ? {} : { css: reverted.css }),
				};
				swapClass(entry.frame, classes.selector, change, held);
			});
		},
		[holdReaders, landed, project, releaseReaders, reloadFrameDocument, restoreWords, swapClass, updateHistory],
	);

	/**
	 * One step of the one stack (#230).
	 *
	 * The pure module already skipped whatever the projection no longer holds, so
	 * what arrives here is real. Where it goes is who owns it: geometry is the
	 * sidecar write it always was, a mint's inverse is the staged trash right
	 * here, and everything else is the rail's to run, because the rail owns the
	 * stored order and the explorer calls. A refusal is staleness discovered one
	 * round trip late — the entry comes back off the stack it was just pushed
	 * onto and the projection is read again, rather than the press chasing the
	 * next entry, because what a refusal says is that the disk moved underneath
	 * all of them.
	 */
	const walk = useCallback(
		(way: Way) => {
			flushNudge(); // a pending nudge is its own entry: undo pops it, redo is voided by it
			const held = history.current;
			const alive = liveness();
			const taken = way === "undo" ? takeUndo(held, alive) : takeRedo(held, alive);
			if (taken === undefined) return;
			updateHistory(taken.history);
			const entry = taken.entry;
			if (entry.kind === "geometry") {
				applyRects(rectsOf(entry.rects, way));
				return;
			}
			if (entry.kind === "place") {
				applyPlaces(placesOf(entry.places, way));
				return;
			}
			if (entry.kind === "mint") {
				if (way === "undo") stageEntry(entry.staged);
				else undoTrash();
				return;
			}
			if (entry.kind === "hand") {
				walkHand(entry, way, taken.history);
				return;
			}
			// a gather is a page the rail made and the frames it gathered into it, and
			// the order the two halves go in is the whole reason it is one entry: going
			// back, the frames leave before the page is staged, or they would ride into
			// the Trash inside it; going forward, the page is put back before they
			// arrive, because there would be nowhere to put them otherwise
			if (entry.kind === "gather" && way === "redo") undoTrash();
			const taking = taken.history;
			void runEntry.current?.(entry, way).then((ran) => {
				if (ran) {
					if (entry.kind === "gather" && way === "undo") stageEntry({ frames: [], page: entry.page });
					return;
				}
				// a press that landed after this one owns the stacks now
				if (history.current !== taking) return;
				updateHistory(drop(history.current, way));
				void refetchFrames();
			});
		},
		[applyPlaces, applyRects, flushNudge, liveness, refetchFrames, stageEntry, undoTrash, updateHistory, walkHand],
	);

	// leaving the page (or the tab) mid-toast: the staged move still happens
	useEffect(() => {
		const flush = () => {
			const staged = pendingTrashRef.current;
			if (staged === null) return;
			pendingTrashRef.current = null;
			beaconTrash(project, [...staged.frames], staged.page === null ? [] : [staged.page]);
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
		// the hover's own ask is one of the ones just voided, and its reply is
		// what would have cleared this. Left standing it latches the rings — and
		// the measurement (#261) — off for the rest of the session.
		hoverBusy.current = false;
	}, []);

	const clearCanvasSelection = useCallback(() => {
		cancelPicks();
		holdChain(null);
		setSelected([]);
		setPicked([]);
		setSelectedPage(null);
		setPreview(null);
	}, [cancelPicks, holdChain]);

	/**
	 * Ask a frame one question and route the one answer.
	 *
	 * Every verb the canvas asks a frame shares this: an id off one sequence, a
	 * generation captured at the ask, and a deadline for a document that never
	 * speaks. What differs is only which waiter map the reply lands in, because
	 * the answers are different shapes and one map for both would mean a cast.
	 *
	 * The apply callback runs only while this ask's generation is current — a
	 * superseded ask never applies; onSilence answers for a document that stays
	 * quiet, when a caller cannot afford dead air.
	 */
	const askFrame = useCallback(
		<T,>(
			frame: string,
			waiters: Map<number, (value: T) => void>,
			request: (id: number) => unknown,
			apply: (value: T) => void,
			onSilence?: () => void,
		) => {
			const target = iframes.current.get(frame)?.contentWindow;
			if (target == null) {
				onSilence?.();
				return;
			}
			const id = ++pickSeq.current;
			const gen = pickGen.current;
			waiters.set(id, (value) => {
				if (pickGen.current === gen) apply(value);
			});
			target.postMessage(request(id), "*");
			setTimeout(() => {
				if (waiters.delete(id) && pickGen.current === gen) onSilence?.();
			}, PICK_REPLY_MS);
		},
		[],
	);

	/** The element ancestry: the answer every pointer and keyboard verb wants. */
	const askChain = useCallback(
		(
			frame: string,
			request: (id: number) => unknown,
			apply: (chain: PickedHit[]) => void,
			onSilence?: () => void,
		) => {
			askFrame(frame, pickWaiters.current, request, apply, onSilence);
		},
		[askFrame],
	);

	/** The ancestry at a frame-local point: what every pointer verb asks for. */
	const beginPick = useCallback(
		(frame: string, local: Point, apply: (chain: PickedHit[]) => void, onSilence?: () => void) => {
			askChain(frame, (id) => pickMessage(local.x, local.y, id), apply, onSilence);
		},
		[askChain],
	);

	/**
	 * The measurement overlay's ask (#261): the held element, and where the
	 * pointer is. The frame resolves the second element and reads the raw
	 * facts; a point that names nothing to measure answers with no reading, and
	 * so does a document that says nothing at all.
	 */
	const askMeasure = useCallback(
		(frame: string, selector: string, local: Point, apply: (reading: SpacingReading | null) => void) => {
			askFrame(
				frame,
				measureWaiters.current,
				(id) => measureMessage(selector, local.x, local.y, id),
				apply,
				() => apply(null),
			);
		},
		[askFrame],
	);

	/**
	 * A resize gesture's own ask (#305): the box, the engine's limits on it and
	 * the placement it already has, from the one place that knows them.
	 */
	const askSizing = useCallback(
		(frame: string, selector: string, apply: (sizing: ElementSizing | null) => void) => {
			askFrame(
				frame,
				sizingWaiters.current,
				(id) => sizingMessage(selector, id),
				apply,
				() => apply(null),
			);
		},
		[askFrame],
	);

	/**
	 * A snapping sample's ask (#311): what this element may align with, and how
	 * far its dragged edge moves per pixel of written size.
	 *
	 * A trial states the size the sample is about, worn and taken off inside the
	 * document's own task; a trial-less ask reads what the layout made of the
	 * size the sample actually wrote.
	 */
	const askSnapping = useCallback(
		(frame: string, selector: string, trial: SnapTrial | null): Promise<ElementSnapping | null> =>
			new Promise((resolve) => {
				askFrame(
					frame,
					snapWaiters.current,
					(id) => snappingMessage(selector, trial, id),
					resolve,
					() => resolve(null),
				);
			}),
		[askFrame],
	);

	/**
	 * A gap gesture's own ask (#306): the container's layout words and every
	 * child's box, from the one place that knows where the flow put them.
	 */
	const askGaps = useCallback(
		(frame: string, selector: string, apply: (gaps: GapReading | null) => void) => {
			askFrame(
				frame,
				gapWaiters.current,
				(id) => gapsMessage(selector, id),
				apply,
				() => apply(null),
			);
		},
		[askFrame],
	);

	const applyPick = useCallback(
		(frame: string, chain: PickedHit[], hit: PickedHit | undefined) => {
			if (hit === undefined) return; // frame background: the frame stays the selection
			holdChain({ frame, chain });
			setSelected([]);
			setPicked([{ frame, ...hit }]);
		},
		[holdChain],
	);

	/** The anchor of the element scope: the most recent pick, whose chain is held. */
	const pickAnchor = useCallback((): PickedSelection | undefined => {
		return pickedRef.current[pickedRef.current.length - 1];
	}, []);

	/**
	 * The one rung the keyboard can walk from. A ladder has one rung at a time,
	 * so a multi-selection has nowhere to step and answers nothing.
	 */
	const onlyHeldRung = useCallback((): PickedSelection | undefined => {
		return pickedRef.current.length === 1 ? pickedRef.current[0] : undefined;
	}, []);

	/**
	 * The rung this frame holds, as the ladder wants it: the ancestry the last
	 * pick was found in and which element of it is held. Null when the scope is
	 * another frame's, which is a frame with no rung open.
	 */
	const scopeIn = useCallback(
		(frame: string): LadderScope | null => {
			const anchor = pickAnchor();
			const held = pickedChain.current;
			if (anchor === undefined || anchor.frame !== frame || held === null || held.frame !== frame) return null;
			return { chain: held.chain, selector: anchor.selector };
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
				holdChain(null);
				setPicked([]);
				setSelected([frame]);
			};
			beginPick(
				frame,
				local,
				(chain) => {
					const target = atRung(chain, scopeIn(frame));
					if (target === undefined) {
						pop();
						return;
					}
					applyPick(frame, chain, target);
				},
				pop,
			);
		},
		[beginPick, applyPick, holdChain, scopeIn],
	);

	/**
	 * The descent (#254): one rung down the ancestry under the pointer, which
	 * is what a double-click means in Edit.
	 *
	 * The scope is read here and the second click's own pick is voided, so the
	 * descent starts from whichever rung has settled rather than racing that
	 * reply. A click at the scope is idempotent while the pointer has not moved
	 * — which inside a double-click it has not — so the two answers agree, and
	 * a scope that has not landed yet only means the descent starts a rung
	 * higher rather than somewhere wrong.
	 */
	const descendAt = useCallback(
		(frame: string, local: Point) => {
			const scope = scopeIn(frame);
			cancelPicks();
			beginPick(frame, local, (chain) => {
				const target = oneDown(chain, scope);
				// no rung under this one: the two clicks meant the words, and the
				// second of them has already opened the edit; leaving it alone is
				// what lets one gesture descend a branch and edit a leaf (#254,
				// #255). Frame background answers nothing either way
				if (target === undefined) return;
				endEditRef.current(false);
				applyPick(frame, chain, target);
			});
		},
		[beginPick, applyPick, cancelPicks, scopeIn],
	);

	/**
	 * The keyboard's own rung (#254): kinship instead of position. An empty
	 * selector is the boot root, so a `child` step off the frame itself lands
	 * on its root element. A rung that does not exist answers with no chain and
	 * the selection stays where it was.
	 */
	const walkKin = useCallback(
		(frame: string, selector: string, step: KinStep) => {
			cancelPicks();
			askChain(
				frame,
				(id) => kinMessage(selector, step, id),
				(chain) => {
					const target = chain[chain.length - 1];
					if (target === undefined) return;
					applyPick(frame, chain, target);
				},
			);
		},
		[askChain, applyPick, cancelPicks],
	);

	/**
	 * ⌘⏎, and the rung a descent from the frame itself lands on: the first
	 * child of what is held, or the frame's root element when the frame is.
	 * Figma's descent key takes every child at once; a selection that is a
	 * handle wants one, and Tab walks the row from there.
	 */
	const descendKey = useCallback(() => {
		const held = onlyHeldRung();
		const frame = held?.frame ?? (selectedRef.current.length === 1 ? selectedRef.current[0] : undefined);
		if (enteredRef.current !== null || frame === undefined) return;
		walkKin(frame, held?.selector ?? "", "child");
	}, [onlyHeldRung, walkKin]);

	/** Tab and ⇧Tab: the next or previous sibling of the held element. */
	const walkSibling = useCallback(
		(step: "next" | "previous"): boolean => {
			const held = onlyHeldRung();
			if (enteredRef.current !== null || held === undefined) return false;
			walkKin(held.frame, held.selector, step);
			return true;
		},
		[walkKin, onlyHeldRung],
	);

	/**
	 * One rung up, which ⇧⏎ takes on its own and Esc reaches once it has left
	 * whatever it was inside: element → parent → … → frame → nothing. False
	 * when there was no rung to climb, which is what lets Esc carry on down its
	 * own list of meanings.
	 */
	const climbRung = useCallback((): boolean => {
		const held = pickedRef.current;
		if (held.length > 1) {
			// a multi-selection has no one ancestry: drop to its frames
			const frames = [...new Set(held.map((pick) => pick.frame))];
			holdChain(null);
			setPicked([]);
			setSelected(frames);
			return true;
		}
		const only = held[0];
		if (only !== undefined) {
			// ascend the ancestry (Figma): element → parent → … → frame → clear
			const parent = oneUp(scopeIn(only.frame));
			if (parent !== undefined) setPicked([{ frame: only.frame, ...parent }]);
			else {
				holdChain(null);
				setPicked([]);
				setSelected([only.frame]);
			}
			return true;
		}
		if (selectedRef.current.length > 0) {
			setSelected([]);
			return true;
		}
		return false;
	}, [holdChain, scopeIn]);

	/**
	 * A crumb press (#256): the rung it names, straight away.
	 *
	 * The ancestry is the one already held, so this is a move along it rather
	 * than a fresh pick — no round trip, and the frame at its root is the same
	 * clear-to-the-frame that climbing off the root element does.
	 */
	const takeRung = useCallback(
		(frame: string, hit: PickedHit | null) => {
			if (hit === null) {
				holdChain(null);
				setPicked([]);
				setSelected([frame]);
				return;
			}
			setSelected([]);
			setPicked([{ frame, ...hit }]);
		},
		[holdChain],
	);

	// --- the hand's refusals -----------------------------------------------------

	/** Why the gesture just tried does not apply, on the element it was about. */
	const showRefusal = useCallback((frame: string, selector: string, refusal: Refusal) => {
		setRefused({ frame, selector, refusal });
	}, []);

	// --- the text gesture (#255, #314) --------------------------------------------

	/**
	 * The edit, in both places that read it: the state drives the render — the
	 * frame owns its pointer while an edit is open — and the ref is what the
	 * pointer and key handlers read, a paint earlier than the render would.
	 */
	const setEdit = useCallback((next: HandEdit | null) => {
		editingRef.current = next;
		setEditing(next);
	}, []);

	/**
	 * End an open edit from out here, which is what a press anywhere on the
	 * field means. The frame answers with `edited` either way, and that answer
	 * is what writes — this only says which way it ended. One the frame never
	 * answers for is let go anyway, or it would hold that frame's pointer for
	 * the rest of the session.
	 */
	const endEdit = useCallback(
		(commit: boolean) => {
			const held = editingRef.current;
			if (held === null) return;
			iframes.current.get(held.frame)?.contentWindow?.postMessage(endEditMessage(commit), "*");
			clearTimeout(closeTimer.current);
			closeTimer.current = setTimeout(() => {
				if (editingRef.current?.id === held.id) setEdit(null);
			}, PICK_REPLY_MS);
		},
		[setEdit],
	);
	endEditRef.current = endEdit;

	/**
	 * The text gesture (#255): a second click on an element's own words puts
	 * the caret there at once (#314). Nothing is asked first — the frame makes
	 * the element editable the moment the message lands, and whether the file
	 * will take the words is the daemon's answer when the edit ends. The
	 * fingerprint the write will carry is the one the ring's read holds for
	 * this very rung, when that read has landed.
	 */
	const beginTextEdit = useCallback(
		(pick: PickedSelection, local: Point) => {
			const stamp = stampOf(pick);
			if (typeof stamp !== "string") {
				showRefusal(pick.frame, pick.selector, stamp);
				return;
			}
			const target = iframes.current.get(pick.frame);
			if (target?.contentWindow == null) return;
			const id = ++pickSeq.current;
			const read = ringRef.current.read;
			setEdit({
				frame: pick.frame,
				selector: pick.selector,
				source: stamp,
				id,
				fingerprint: read?.source === stamp ? read.fingerprint : undefined,
				phase: "opening",
				start: "",
			});
			setRefused(null);
			target.contentWindow.postMessage(editMessage(pick.selector, local.x, local.y, id), "*");
			// typing has to land in the frame, which only happens once the
			// document it is drawn in holds the focus
			target.focus();
			clearTimeout(openTimer.current);
			openTimer.current = setTimeout(() => {
				const held = editingRef.current;
				if (held?.id === id && held.phase === "opening") setEdit({ ...held, phase: "open" });
			}, OPENING_MS);
		},
		[setEdit, showRefusal],
	);

	/**
	 * The edit has ended (#314). The frame already shows the words, so the
	 * ring is re-read off the element they are drawn in, and a commit that
	 * changed them is one write in the background. A refusal puts the words
	 * back on the element and sits under it with the reason and the door to
	 * the agent; a file that moved underneath is a fresh read of the rung too.
	 */
	const finishEdit = useCallback(
		(held: HandEdit, commit: boolean, nodes: readonly EditedNode[], owner: string | null) => {
			setEdit(null);
			viewportRef.current?.focus();
			// the box the words are drawn in moved with them, so the ring is
			// re-read off the element itself — while it is still the one held: a
			// descent that ended this edit has already moved the selection on
			const stillHeld = pickedRef.current.some(
				(pick) => pick.frame === held.frame && pick.selector === held.selector,
			);
			if (stillHeld) walkKin(held.frame, held.selector, "self");
			const attempted = wordsOf(nodes);
			if (!commit || attempted === held.start) return;
			const read = ringRef.current.read;
			const fingerprint = held.fingerprint ?? (read?.source === held.source ? read.fingerprint : undefined);
			const refuse = (refusal: Refusal) => {
				restoreWords(held.frame, held.id, "before", () => {});
				// on the element while it is still held, and as a notice once the
				// selection has moved on and there is nothing to draw it under
				if (pickedRef.current.some((pick) => pick.frame === held.frame && pick.selector === held.selector)) {
					setRefused({ frame: held.frame, selector: held.selector, refusal, attempted });
				} else setNotice({ kind: "error", message: refusal.says });
			};
			if (fingerprint === undefined) {
				refuse({ code: "unread", says: "the file was never read; select the element again" });
				return;
			}
			// the element's file may be a shared definition's; whether the words
			// land there or at a call site in this frame's own file is the daemon's
			// to say, so its readers are held now and let go if they did not
			const readers = read?.source === held.source ? (read.shared?.frames ?? []) : [];
			holdReaders(held.frame, readers);
			// the call site is a second file, and a second promise: the canvas sends
			// what it read that file at, and the daemon refuses if it has moved
			const ownerFingerprint = owner === null ? undefined : fingerprintFor(held.frame, owner);
			void writeText(project, held.frame, {
				source: held.source,
				nodes,
				fingerprint,
				...(owner === null ? {} : { owner }),
				...(ownerFingerprint === undefined ? {} : { ownerFingerprint }),
			}).then((written) => {
				settled(written, {
					frame: held.frame,
					readers,
					edit: held.id,
					// the stamp in the file that was written: the element's own, or
					// the call site's when the words were supplied there
					readAt: (path) =>
						(path === `design/${held.source.replace(/:\d+:\d+$/, "")}` ? held.source : owner) ?? held.source,
					refuse,
					failed: "the words did not reach the file",
				});
			});
		},
		[fingerprintFor, holdReaders, project, restoreWords, setEdit, settled, walkKin],
	);

	// --- the class gesture (#315) ------------------------------------------------

	/** the property gesture in flight: what the rail last previewed, which is what a scrub commits */
	const propertyGesture = useRef<{ property: string; last: PropertyValue | null } | null>(null);

	/** The inline preview on an element in its frame, put on or lifted; no daemon in it (rule 1). */
	const previewStyle = useCallback(
		(frame: string, selector: string, declarations: Readonly<Record<string, string | null>> | null) => {
			iframes.current.get(frame)?.contentWindow?.postMessage(styleMessage(selector, declarations), "*");
		},
		[],
	);

	/**
	 * One class change, written (#315). The frame already shows it as inline
	 * style; this is the write behind it, measured against the file the rung
	 * was read from — the hand's own last save when it has one, the ring's
	 * read otherwise. What comes back swaps the literal on the element and
	 * the sheet under it and lifts the preview, with no reload. A refusal
	 * lifts the preview too and sits under the element with the reason, the
	 * file it points at, and the door to the agent.
	 */
	const commitClass = useCallback(
		(pick: PickedSelection, values: readonly PropertyValue[]) => {
			const stamp = stampOf(pick);
			const lift = () => previewStyle(pick.frame, pick.selector, null);
			const edits = values.flatMap(classEditsOf);
			const attempted = edits.map((edit) => `${edit.remove ? "-" : "+"}${edit.scope}${edit.token}`).join(" ");
			const refuse = (refusal: Refusal) => {
				lift();
				const file =
					refusal.line === undefined || typeof stamp !== "string"
						? undefined
						: { path: `design/${stamp.replace(/:\d+:\d+$/, "")}`, line: refusal.line };
				if (pickedRef.current.some((held) => held.frame === pick.frame && held.selector === pick.selector)) {
					setRefused({
						frame: pick.frame,
						selector: pick.selector,
						refusal,
						attempted,
						asked: `Change the classes of the ${pick.tag}: ${attempted}`,
						...(file === undefined ? {} : { file }),
					});
				} else setNotice({ kind: "error", message: refusal.says });
			};
			if (typeof stamp !== "string") {
				refuse(stamp);
				return;
			}
			if (edits.length === 0) {
				lift();
				return;
			}
			const file = stamp.replace(/:\d+:\d+$/, "");
			const own = saved.current.get(pick.frame);
			const read = ringRef.current.read;
			const fingerprint =
				own !== undefined && own.source.replace(/:\d+:\d+$/, "") === file
					? own.fingerprint
					: read?.source === stamp
						? read.fingerprint
						: undefined;
			if (fingerprint === undefined) {
				refuse({ code: "unread", says: "the file was never read; select the element again" });
				return;
			}
			// a shared definition's readers are held before the write leaves (#318)
			const readers = read?.source === stamp ? (read.shared?.frames ?? []) : [];
			holdReaders(pick.frame, readers);
			void writeClass(project, pick.frame, { source: stamp, edits, fingerprint }).then((written) => {
				const ok = written?.ok === true ? written : undefined;
				settled(written, {
					frame: pick.frame,
					readers,
					edit: ++pickSeq.current,
					readAt: () => stamp,
					refuse,
					failed: "the class did not reach the file",
					...(ok === undefined
						? {}
						: {
								classes: {
									selector: pick.selector,
									from: ok.className.now,
									to: ok.className.was,
								},
							}),
					nothing: lift,
					onLanded: (kept) => {
						if (!kept || ok === undefined) return;
						const change = { ...ok.className, ...(ok.css === undefined ? {} : { css: ok.css }) };
						swapClass(pick.frame, pick.selector, change, (landedOn) => {
							if (landedOn || !saved.current.has(pick.frame)) return;
							saved.current.delete(pick.frame);
							holdNext.current.add(pick.frame);
							reloadFrameDocument(pick.frame);
						});
					},
				});
			});
		},
		[holdReaders, previewStyle, project, reloadFrameDocument, settled, swapClass],
	);

	/**
	 * The rail's write lane for the one rung held (#315). Preview is the DOM:
	 * a typed or stepped value goes on the element as inline style and nothing
	 * leaves the canvas; Enter, blur or the end of a scrub is the one write.
	 * Nothing when no single element with a stamp is held, and the rows draw
	 * without a gesture.
	 */
	const propertyControls = useMemo<PropertyControls | null>(() => {
		const pick = picked.length === 1 ? picked[0] : undefined;
		if (pick === undefined || typeof stampOf(pick) !== "string") return null;
		const { frame, selector } = pick;
		return {
			begin: (property) => {
				propertyGesture.current = { property, last: null };
			},
			preview: (property, value, sample) => {
				const gesture = propertyGesture.current ?? { property, last: null };
				gesture.last = value;
				propertyGesture.current = gesture;
				const css = sample ?? (value.kind === "custom" ? value.value : value.kind === "remove" ? "" : undefined);
				if (css !== undefined) previewStyle(frame, selector, { [property]: css });
			},
			apply: (_property, value) => {
				propertyGesture.current = null;
				commitClass(pick, [value]);
			},
			applyFields: (changes) => {
				propertyGesture.current = null;
				commitClass(
					pick,
					changes.map((change) => change.value),
				);
			},
			finish: (commit) => {
				const held = propertyGesture.current;
				propertyGesture.current = null;
				if (commit && held?.last != null) commitClass(pick, [held.last]);
				else previewStyle(frame, selector, null);
			},
		};
	}, [commitClass, picked, previewStyle]);
	// --- delete, hide, show, attributes and pictures (#317) ----------------------

	/**
	 * What the hand holds once an element is gone: the rung above it, or the
	 * frame when it had none. Never nothing — a frame the hand is still in is
	 * what keeps its own save from reloading it out from under the gesture.
	 */
	const holdParent = useCallback(
		(pick: PickedSelection) => {
			const chain = pickedChain.current;
			const rung = chain?.frame === pick.frame ? chain.chain.findIndex((hit) => hit.selector === pick.selector) : -1;
			const parent = chain !== null && rung > 0 ? chain.chain[rung - 1] : undefined;
			if (chain !== null && parent !== undefined) {
				holdChain({ frame: pick.frame, chain: chain.chain.slice(0, rung) });
				setPicked([{ frame: pick.frame, ...parent }]);
				return;
			}
			holdChain(null);
			setPicked([]);
			setSelected([pick.frame]);
		},
		[holdChain],
	);

	/**
	 * One structural gesture, in the frame and then in the file.
	 *
	 * The frame changes first and answers with whether it could and with the
	 * call one owner up — the only place that knows it. Then one write in the
	 * background, addressed by the stamp and measured against the file the rung
	 * was read out of. A refusal puts the document back exactly as it was and
	 * sits under the element with the reason and the door to the agent.
	 *
	 * A delete of something that is all of a component is refused rather than
	 * quietly turned into a delete of the call: no body can lose its whole
	 * return, and taking the call out of this frame is a different thing to
	 * mean. The notice names the file the component is written in and offers
	 * that delete as one press, which sends the same gesture again on the
	 * call's own stamp and against the call's own file.
	 */
	const alterElement = useCallback(
		(
			pick: PickedSelection,
			act: "delete" | "hide" | "show" | "attribute",
			at: { source: string; fingerprint: string },
			attribute?: { name: string; value: string },
		) => {
			const target = iframes.current.get(pick.frame)?.contentWindow;
			if (target == null) return;
			const id = ++pickSeq.current;
			setRefused(null);
			const asked = alterAsk(act, pick.tag, attribute);
			const refuse = (refusal: Refusal, instead?: ShownRefusal["instead"]) => {
				restoreWords(pick.frame, id, "before", () => {});
				const file =
					refusal.line === undefined
						? undefined
						: { path: `design/${at.source.replace(/:\d+:\d+$/, "")}`, line: refusal.line };
				setRefused({
					frame: pick.frame,
					selector: pick.selector,
					refusal,
					attempted: asked,
					asked,
					...(file === undefined ? {} : { file }),
					...(instead === undefined ? {} : { instead }),
				});
			};
			/**
			 * The delete a whole-return refusal offers: the call that renders it,
			 * on the call's own stamp and against the call's own file. Nothing
			 * where the frame named no call or the canvas has never read the file
			 * that call is in, because then there is nothing to measure it against.
			 */
			const insteadDeleteCall = (refusal: Refusal, call: string | null) => {
				if (act !== "delete" || refusal.code !== "whole-return" || call === null) return undefined;
				const fingerprint = fingerprintFor(pick.frame, call);
				if (fingerprint === undefined) return undefined;
				return {
					says: "Delete the call",
					act: () => alterElementRef.current(pick, "delete", { source: call, fingerprint }),
				};
			};
			alterWaiters.current.set(id, ({ ok, owner }) => {
				if (!ok) {
					showRefusal(pick.frame, pick.selector, GONE);
					return;
				}
				// the element's file may be a shared definition's; whether the change
				// lands there or at a call site in this frame's own file is the daemon's
				// to say, so its readers are held now and let go if they did not (#318)
				const read = ringRef.current.read;
				const readers = read?.source === at.source ? (read.shared?.frames ?? []) : [];
				holdReaders(pick.frame, readers);
				void writeElement(project, pick.frame, {
					act,
					source: at.source,
					fingerprint: at.fingerprint,
					...(attribute ?? {}),
				}).then((written) => {
					settled(written, {
						frame: pick.frame,
						readers,
						edit: id,
						readAt: () => at.source,
						refuse: (refusal) => refuse(refusal, insteadDeleteCall(refusal, owner)),
						failed: "the change did not reach the file",
						// the element is gone: the rung above it is what the hand holds
						// now, and it holds it only once the write has actually landed,
						// so a refusal still has the element it was about to sit under
						onLanded: () => {
							if (act === "delete") holdParent(pick);
						},
					});
				});
			});
			target.postMessage(alterMessage(id, pick.selector, act, attribute?.name, attribute?.value), "*");
			setTimeout(() => {
				if (alterWaiters.current.delete(id)) showRefusal(pick.frame, pick.selector, GONE);
			}, PICK_REPLY_MS);
		},
		[fingerprintFor, holdParent, holdReaders, project, restoreWords, settled, showRefusal],
	);
	alterElementRef.current = alterElement;

	/**
	 * ⌫ on a held element (#317): it goes, here and in the file.
	 *
	 * The fingerprint is the one the ring's read holds for this very rung, which
	 * is the file the document on screen was rendered from. Without it there is
	 * nothing to measure the write against, and the honest answer is to say so
	 * rather than to write against whatever the file says now.
	 */
	const deleteElement = useCallback(
		(pick: PickedSelection) => {
			const stamp = stampOf(pick);
			if (typeof stamp !== "string") {
				showRefusal(pick.frame, pick.selector, stamp);
				return;
			}
			const read = ringRef.current.read;
			const fingerprint = read?.source === stamp ? read.fingerprint : undefined;
			if (fingerprint === undefined) {
				showRefusal(pick.frame, pick.selector, {
					code: "unread",
					says: "the file was never read; select the element again",
				});
				return;
			}
			alterElement(pick, "delete", { source: stamp, fingerprint });
		},
		[alterElement, showRefusal],
	);

	/** The rail's own structural writes (#317): hide, show, and one attribute. */
	const railAlter = useCallback(
		(
			frame: string,
			selector: string,
			at: { source: string; fingerprint: string },
			act: "hide" | "show" | "attribute",
			attribute?: { name: string; value: string },
		) => {
			const pick = pickedRef.current.find((held) => held.frame === frame && held.selector === selector);
			if (pick === undefined) return;
			alterElement(pick, act, at, attribute);
		},
		[alterElement],
	);

	/**
	 * The asset swap (#260), which is the rail's write with a file in front of it.
	 *
	 * The picture and the splice land in one call, carrying the fingerprint the
	 * surface read the element out of. The undo it records is the source half:
	 * the picture stays in the folder, because a file spool put in somebody's
	 * repo is theirs to keep or delete, and an undo that took it away again
	 * would be spool deleting a file nobody asked it to.
	 */
	const swapPicture = useCallback(
		(
			frame: string,
			selector: string,
			at: { source: string; fingerprint: string },
			put: { file: File } | { asset: string },
		) => {
			setRefused(null);
			// a shared definition's readers are held before the write leaves (#318)
			const read = ringRef.current.read;
			const readers = read?.source === at.source ? (read.shared?.frames ?? []) : [];
			holdReaders(frame, readers);
			const bytes = "file" in put ? fileAsAsset(put.file).then((file) => ({ file })) : Promise.resolve(put);
			void bytes
				.then((body) => swapAsset(project, frame, at.source, at.fingerprint, body))
				.then((written) => {
					settled(written, {
						frame,
						readers,
						edit: ++pickSeq.current,
						readAt: () => at.source,
						refuse: (refusal) =>
							refusal.code === "failed"
								? setNotice({ kind: "error", message: "The picture did not reach the file" })
								: setRefused({ frame, selector, refusal, attempted: "a picture" }),
						failed: "the picture did not reach the file",
					});
				});
		},
		[holdReaders, project, settled],
	);

	/**
	 * The drop half of the asset swap (#260): the frame is armed, never open.
	 *
	 * A file dragged onto an image lands inside that frame's own document, so
	 * the shim is the only thing that can catch it — and it catches nothing
	 * until the canvas names one element, because the parity law says a frame
	 * with a drop zone of its own must behave exactly as its bare document
	 * does. One selected image is the whole of the arming, and it is taken back
	 * the moment the selection moves.
	 */
	const armedDrop = useRef<string | null>(null);
	useEffect(() => {
		const only = picked.length === 1 ? picked[0] : undefined;
		const target = only !== undefined && only.tag === "img" && !only.generated ? only : undefined;
		const was = armedDrop.current;
		if (was !== null && was !== target?.frame) {
			iframes.current.get(was)?.contentWindow?.postMessage(dropTargetMessage(null), "*");
		}
		armedDrop.current = target?.frame ?? null;
		if (target === undefined) return;
		iframes.current.get(target.frame)?.contentWindow?.postMessage(dropTargetMessage(target.selector), "*");
	}, [picked]);

	// A refusal is about the element it was refused on, so it goes when the
	// selection moves rather than sitting over whatever comes next. The keys
	// rather than the array: a click at the scope re-picks the same element and
	// hands back a fresh list, and that is the selection standing still.
	const pickedKeys = picked.map((pick) => pickKey(pick.frame, pick.selector)).join("\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies(pickedKeys): the selection moving is the whole trigger
	useEffect(() => {
		setRefused(null);
	}, [pickedKeys]);

	// Letting go pays every reload the hold deferred, behind the frame's own
	// outgoing paint: the frames the hand saved (#314, rule 4) and the frames
	// something outside wrote while the hand held an element in them (#319).
	// Both owe the same thing — the file the frame is not yet showing — and both
	// are paid the moment the hand leaves the frame, so what a deselect shows is
	// the saved document with no white frame in between.
	const heldFrames = [
		...new Set([...selected, ...picked.map((pick) => pick.frame), ...(entered === null ? [] : [entered])]),
	].sort();
	// the names as one string is the dep, and the names themselves are what the
	// effect reads: a list rebuilt on every render is not a change of selection
	const heldKey = JSON.stringify(heldFrames);
	const heldFramesRef = useRef(heldFrames);
	heldFramesRef.current = heldFrames;
	// biome-ignore lint/correctness/useExhaustiveDependencies(heldKey): the frames the hand is in changing is the whole trigger
	useEffect(() => {
		const holding = new Set(heldFramesRef.current);
		for (const frame of new Set([...saved.current.keys(), ...writtenUnderHand.current])) {
			if (holding.has(frame)) continue;
			saved.current.delete(frame);
			writtenUnderHand.current.delete(frame);
			holdNext.current.add(frame);
			reloadFrameDocument(frame);
		}
	}, [heldKey, reloadFrameDocument]);

	// nothing holds a document, or an edit, past the window it was drawn in
	useEffect(() => {
		const timers = holdTimers.current;
		return () => {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			clearTimeout(openTimer.current);
			clearTimeout(closeTimer.current);
		};
	}, []);

	/**
	 * Shift-click's toggle (#37): the at-depth target in or out of the picked
	 * set — with ⌘, the deepest. A toggle in moves the anchor; membership is
	 * (frame, selector) identity.
	 */
	const togglePickAt = useCallback(
		(frame: string, local: Point, deepest: boolean) => {
			beginPick(frame, local, (chain) => {
				const target = deepest ? chain[chain.length - 1] : atRung(chain, scopeIn(frame));
				if (target === undefined) return; // frame background: nothing to toggle
				const current = pickedRef.current;
				const held = current.filter((pick) => !(pick.frame === frame && pick.selector === target.selector));
				if (held.length < current.length) {
					setPicked(held);
				} else {
					holdChain({ frame, chain });
					setPicked([...current, { frame, ...target }]);
				}
				setSelected([]);
			});
		},
		[beginPick, holdChain, scopeIn],
	);

	/** The tree grammar on frame rows: shift ranges, ⌘ toggles, click replaces. */
	const selectFrameRow = (name: string, modifiers: SelectModifiers, span?: FrameSpan) => {
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
		holdChain(null);
		// the range is the rail's to work out: the projection this reads is sorted by
		// name and the rows are in whatever order somebody arranged them into
		const range = modifiers.shift && frameAnchor.current !== null ? (span?.(frameAnchor.current) ?? []) : [];
		if (range.length > 0) {
			setSelected(modifiers.toggle && !changedPage ? [...new Set([...selectedRef.current, ...range])] : [...range]);
			return;
		}
		frameAnchor.current = name;
		if (modifiers.toggle) {
			setSelected((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));
		} else {
			setSelected([name]);
		}
	};

	/**
	 * ⇧ travel in the rail, as a selection out here.
	 *
	 * The same range a ⇧ click asks for, so it comes from the same place; what it
	 * does not do is press the row it reached, which is why it is its own call.
	 * With no anchor there is nothing to stretch from, and a page this canvas is
	 * not on holds frames it could not show a selection of.
	 */
	const extendFrameRange = (span: FrameSpan) => {
		const anchor = frameAnchor.current;
		const held = anchor === null ? undefined : navigatorFrames.find((candidate) => candidate.name === anchor);
		if (anchor === null || held === undefined || pageOf(held) !== activePageRef.current) return;
		const range = span(anchor);
		if (range.length === 0) return;
		setTool("select");
		setPicked([]);
		holdChain(null);
		setSelected([...range]);
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
	leavePage.current = switchToPage;
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

	// a page deleted on disk cannot stay active, and neither can one staged for
	// the Trash: either way the canvas has nowhere to be, so it snaps back to
	// the root page and the toast is what puts a staged one back
	useEffect(() => {
		if (!loaded) return;
		if (hiddenPages.has(activePage) || resolveActivePage(activePage, pages) !== activePage) switchToPage(ROOT_PAGE);
	}, [loaded, activePage, pages, hiddenPages, switchToPage]);

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
			// a walk carries the app's knowledge with it: the page it lands on now knows it too
			if (session !== null && across !== undefined) {
				pageSessions.current.set(pageOf(across), { ...session, stack: [] });
			}
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

	/**
	 * Land a jump: another page arrives through switchToPage; the same page
	 * flies, leaving whatever it was standing in. Then the recorded standing is
	 * put back — inside the frame you were inside, holding what you had chosen —
	 * because a jump returns you to a spot, not to a view of one. Entering here
	 * keeps the recorded camera rather than fitting the frame the way going
	 * inside normally does: the landing must be where you left, to the pixel.
	 * A frame that has since gone takes nobody inside; the camera still lands.
	 */
	const arriveAtJump = useCallback(
		(entry: JumpEntry) => {
			if (entry.page !== activePageRef.current) {
				switchToPage(entry.page, entry.camera);
			} else {
				if (enteredRef.current !== null) exitEntered();
				clearCanvasSelection();
				setMenu(null);
				animateCamera(entry.camera);
			}
			const onPage = new Set(
				allFramesRef.current.filter((frame) => pageOf(frame) === entry.page).map((frame) => frame.name),
			);
			setSelected(entry.selected.filter((name) => onPage.has(name)));
			setPicked(entry.picked.filter((pick) => onPage.has(pick.frame)));
			if (entry.entered === null || !onPage.has(entry.entered)) return;
			const target = entry.entered;
			departedFrameDocuments.current.delete(target);
			walkTarget.current = null;
			walkSession.current = null;
			setEntered(target);
			// a frame still mounted takes the keyboard now; one the page switch
			// remounts takes it at its loaded report, the way a walk's target does
			iframes.current.get(target)?.focus();
		},
		[switchToPage, exitEntered, clearCanvasSelection, animateCamera],
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

	/**
	 * The stream dropped and came back. Nothing was delivered while it was gone
	 * and the daemon keeps no replay, so an agent's whole twenty minutes of work
	 * is simply missing from this canvas — and the canvas cannot tell, because a
	 * project nobody touched looks the same.
	 *
	 * So a return reads everything again rather than trusting what is on screen,
	 * down to reloading every document. Frames are content-addressed and
	 * revalidated, so a frame nothing happened to costs one conditional request,
	 * and a reconnect is rare enough to pay for the frames something did happen
	 * to. Every picture goes with them: a frame on another page owes a fresh
	 * still whether or not anyone has looked at it yet.
	 */
	const resync = useCallback(() => {
		void refetchFrames();
		void refetchFlows();
		for (const frame of allFramesRef.current) reloadFrameDocument(frame.name);
	}, [refetchFrames, refetchFlows, reloadFrameDocument]);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		return subscribeSse(
			`/api/p/${encodeURIComponent(project)}/events`,
			{
				change: (data) => {
					const event = data as { kind: string; frame?: string; frames?: string[]; cover?: Cover };
					if (event.kind === "frame" && event.frame !== undefined) {
						const frame = event.frame;
						const own = saved.current.get(frame);
						// the hand's own save echoes as a change to the frame's own file;
						// one to a frame whose last save went to a shared file is from outside
						if (own === undefined || !own.own) reloadOrHold(frame);
						else changedUnderHand(frame, own);
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
						const staled = event.frames ?? framesRef.current.map((frame) => frame.name);
						for (const frame of staled) {
							const own = saved.current.get(frame);
							// the frame the hand wrote the shared file from already shows it
							// (#318); every other reader reloads, behind the paint the save held
							if (own !== undefined && !own.own) changedUnderHand(frame, own);
							else reloadOrHold(frame);
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
			},
			{ onReconnect: resync },
		);
	}, [changedUnderHand, noteCover, project, refetchFlows, refetchFrames, reloadOrHold, resync]);

	/**
	 * The tab is being looked at again. A hidden one is throttled down to almost
	 * nothing — the sweep, the errands and the frames' own animations all — so
	 * coming back is a moment the canvas has to act on rather than a moment it
	 * can wait out at a quarter of a second per sweep. The stream checks itself
	 * (`subscribeSse`); this is the frames.
	 */
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState !== "visible") return;
			lifecycleRef.current.wake();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, []);

	// the frame protocol: loaded/error/shot route into the lifecycle, session?
	// answers with the carried walk session, go/back move the entered state
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = parseFrameMessage(event.data);
			if (message === undefined) return;
			if (!ownsFrameMessage(iframes.current, message.frame, event.source)) return;
			switch (message.spool) {
				case "content-size": {
					const active = gesture.current;
					if (active.kind !== "resize" || active.frame !== message.frame || message.id !== contentRequest.current)
						return;
					const frame = framesRef.current.find((entry) => entry.name === message.frame);
					if (frame === undefined || message.width !== Math.round(frame.w)) return;
					if (message.height !== null)
						contentSize.current = { frame: message.frame, width: message.width, height: message.height };
					return;
				}
				case "copy": {
					const source = event.source as WindowProxy;
					const blocked = departedFrameDocuments.current.has(message.frame);
					const known = allFramesRef.current.some((candidate) => candidate.name === message.frame);
					if (!clipboardCopyAllowed(known, enteredRef.current === message.frame, blocked)) {
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
				case "loaded": {
					lifecycleRef.current.noteLoaded(message.frame);
					// a completed boot retires its walk cover — later reboots are honest
					setWalkArrivals((current) => withoutFrame(current, message.frame));
					// the keyboard follows the walk: an entered frame owns it (#28)
					if (enteredRef.current === message.frame) iframes.current.get(message.frame)?.focus();
					// a fresh document renders fresh elements: re-anchor its arrows (#34)
					requestSiteBoxes(message.frame);
					return;
				}
				case "arrived":
					// the frame finished arriving (#177): a promoted frame's cover has
					// been waiting for this rather than for loaded
					lifecycleRef.current.noteArrived(message.frame);
					// and so has the document held in front of a reload the hand
					// caused (#253's no blink): let go at loaded, the still would
					// stand in until here, which is the flash the hold exists to
					// prevent — so it lets go onto a settled document (#318)
					releaseHold(message.frame);
					// Fonts and entry motion can change the bottom after loaded.
					if (gesture.current.kind === "resize" && gesture.current.frame === message.frame) {
						contentRequest.current += 1;
						iframes.current
							.get(message.frame)
							?.contentWindow?.postMessage({ spool: "content-size", id: contentRequest.current }, "*");
					}
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
					const own = allFramesRef.current.find((candidate) => candidate.name === message.frame);
					const record =
						walkTarget.current === message.frame
							? walkSession.current
							: own === undefined
								? null
								: (pageSessions.current.get(pageOf(own)) ?? null);
					(event.source as WindowProxy | null)?.postMessage(sessionReply(record), "*");
					return;
				}
				case "state": {
					const own = allFramesRef.current.find((candidate) => candidate.name === message.frame);
					if (own === undefined) return;
					const page = pageOf(own);
					pageSessions.current.set(page, { scenario: message.scenario, state: message.state, stack: [] });
					for (const [name, iframe] of iframes.current) {
						if (name === message.frame) continue;
						const sibling = allFramesRef.current.find((candidate) => candidate.name === name);
						if (sibling === undefined || pageOf(sibling) !== page) continue;
						iframe.contentWindow?.postMessage(sharedStateMessage(message.state), "*");
					}
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
				// the in-place edit (#255): the frame says it has opened, and later
				// says how it ended. A reply carrying another ask is a dead edit —
				// its element has moved on, and writing what it says would land on
				// whatever took its place.
				case "edit-open": {
					const held = editingRef.current;
					if (held === null || held.id !== message.id) return;
					if (!message.ok) {
						setEdit(null);
						showRefusal(held.frame, held.selector, GONE);
						return;
					}
					setEdit({ ...held, start: message.text });
					return;
				}
				case "edited": {
					const held = editingRef.current;
					if (held === null || held.id !== message.id) return;
					finishEdit(held, message.commit, message.nodes, message.owner);
					return;
				}
				case "restored":
				case "classed": {
					const waiter = restoreWaiters.current.get(message.id);
					restoreWaiters.current.delete(message.id);
					waiter?.(message.ok);
					return;
				}
				case "altered": {
					const waiter = alterWaiters.current.get(message.id);
					alterWaiters.current.delete(message.id);
					waiter?.({ ok: message.ok, owner: message.owner });
					return;
				}
				// a picture dropped on the one image the canvas armed (#260). The
				// swap is measured against the file the surface read, like every
				// other write, so the stamp's own rung is asked for first — a drop
				// is the one gesture that arrives with no read behind it
				case "dropped": {
					const pick = pickedRef.current.find(
						(candidate) => candidate.frame === message.frame && candidate.selector === message.selector,
					);
					const stamp = pick === undefined ? undefined : stampOf(pick);
					if (pick === undefined || typeof stamp !== "string") return;
					const file = message.file;
					void readRungs(project, message.frame, [stamp]).then((rungs) => {
						const fingerprint = rungs?.[0]?.fingerprint;
						if (fingerprint === undefined) return;
						swapPicture(message.frame, pick.selector, { source: stamp, fingerprint }, { file });
					});
					return;
				}
				case "snapped": {
					const waiter = snapWaiters.current.get(message.id);
					snapWaiters.current.delete(message.id);
					waiter?.(message.snapping);
					break;
				}
				case "gapped": {
					const waiter = gapWaiters.current.get(message.id);
					gapWaiters.current.delete(message.id);
					waiter?.(message.gaps);
					return;
				}
				case "sized": {
					const waiter = sizingWaiters.current.get(message.id);
					sizingWaiters.current.delete(message.id);
					waiter?.(message.sizing);
					return;
				}
				case "measured": {
					const waiter = measureWaiters.current.get(message.id);
					measureWaiters.current.delete(message.id);
					waiter?.(message.reading);
					return;
				}
				case "site-boxes": {
					// only the newest request per frame applies — a slow reply from a
					// superseded document must not re-anchor arrows to dead geometry
					if (siteBoxExpected.current.get(message.frame) !== message.id) return;
					siteBoxExpected.current.delete(message.frame);
					setSiteBoxes((current) => ({ ...current, [message.frame]: message.boxes }));
					// a write this document can show is a write this frame gets a mark for,
					// and one it renders nothing of answers null and gets none (#214)
					for (const write of armedWrites.current.values()) {
						const box = message.boxes[rangeKeyOf(write.path, write.from, write.to)];
						if (box != null) strike(message.frame, write.key, box);
					}
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
				case "scroll": {
					// a wheel the entered frame had nowhere to scroll: it chains out
					// to the canvas as the same pan the viewport's own wheel makes
					if (enteredRef.current !== message.frame) return;
					const viewport = viewportRef.current;
					if (viewport === null) return;
					stopAnimation();
					setMenu(null);
					const dx = wheelPixels(message.deltaX, message.deltaMode, viewport.clientHeight);
					const dy = wheelPixels(message.deltaY, message.deltaMode, viewport.clientHeight);
					setCamera((c) =>
						c === null
							? c
							: message.shiftKey && dx === 0
								? { ...c, x: c.x - dy }
								: { ...c, x: c.x - dx, y: c.y - dy },
					);
					return;
				}
				case "go":
				case "back": {
					const source = event.source as WindowProxy;
					const active = enteredRef.current === message.frame;
					const known = allFramesRef.current.some((candidate) => candidate.name === message.frame);
					const targetExists = allFramesRef.current.some((candidate) => candidate.name === message.target);
					const rejection = walkRejectionReason(
						message,
						known,
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
	}, [
		project,
		walkTo,
		stopAnimation,
		zoomAtPoint,
		viewportCenter,
		requestSiteBoxes,
		strike,
		releaseHold,
		finishEdit,
		setEdit,
		showRefusal,
		swapPicture,
	]);

	// wheel: pan; ctrl/cmd-wheel (and pinch): zoom at the cursor — bake-off feel
	useEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			// Leave the finder's native list scrolling alone before cancelling the wheel.
			if (findingRef.current) return;
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

	/**
	 * The canvas is open: it has somewhere to look from and something to look at.
	 * The camera it opens on is not a gesture — it is where the canvas already
	 * is — and the frames it opens on were not there yet when it landed. Left to
	 * the settle and the sweep, the first documents wait out a window nobody
	 * moved anything in, and then up to a sweep on top of it. This is the
	 * opening: the rest is what it rests at, and the mounting starts now.
	 */
	useEffect(() => {
		if (camera === null || !loaded || settledCameraRef.current !== null) return;
		settledCameraRef.current = camera;
		sweepLifecycle();
	}, [camera, loaded, sweepLifecycle]);

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

	/** A picked element's box in the viewport's own pixels, which is where a drag happens. */
	const elementScreenBox = (pick: PickedSelection): Box | null => {
		const cam = cameraRef.current;
		const frame = framesRef.current.find((f) => f.name === pick.frame);
		if (cam === null || frame === undefined) return null;
		return {
			x: (frame.x + pick.rect.x) * cam.k + cam.x,
			y: (frame.y + pick.rect.y) * cam.k + cam.y,
			w: pick.rect.w * cam.k,
			h: pick.rect.h * cam.k,
		};
	};

	/**
	 * What the ring draws while an element drag is live (#259), and what the
	 * element itself wears for it (#316).
	 *
	 * Preview is the DOM: every sample puts the values the release will write
	 * on the element as inline style, and nothing leaves the canvas for it.
	 * The write at the end lifts the preview by putting the class on in its
	 * place, and a cancelled drag lifts it with nothing written.
	 */
	const showElementDrag = (active: Gesture): void => {
		if (active.kind === "element-size") {
			const { pick, edge, measured } = active;
			if (measured === null) return;
			previewStyle(pick.frame, pick.selector, resizeStyle(measured));
			// whole pixels once: the readout, the ring and the rail's fields are all
			// about the same box, and a rounding each is three chances to disagree
			const whole = { w: Math.round(measured.live.w), h: Math.round(measured.live.h) };
			setElementDrag({
				frame: pick.frame,
				selector: pick.selector,
				rect: draggedRect(pick.rect, whole),
				says: `${whole.w} × ${whole.h}`,
				turning: false,
				edge,
				box: whole,
			});
			return;
		}
		if (active.kind === "element-turn") {
			const { pick, live } = active;
			previewStyle(pick.frame, pick.selector, { rotate: `${live}deg` });
			setElementDrag({
				frame: pick.frame,
				selector: pick.selector,
				rect: pick.rect,
				says: `${live}°`,
				turning: true,
				edge: null,
				box: { w: pick.rect.w, h: pick.rect.h },
			});
		}
	};

	/** A world point in a frame's own coordinates — what every pick verb takes. */
	const frameLocalAt = (name: string, world: Point): Point | null => {
		const frame = framesRef.current.find((f) => f.name === name);
		return frame === undefined ? null : { x: world.x - frame.x, y: world.y - frame.y };
	};

	/**
	 * The hover rings (#37, #254), on throttled pointer-move. With elements as
	 * the working object the ring is on whenever the pointer is over a readable
	 * frame, not only under ⌘ or an open scope. Edit draws two — the rung a
	 * click takes, and dashed under it the rung its double-click descends to.
	 * Select draws that second one never, because it has no gesture that takes
	 * it, and the first only where a scope is already open.
	 *
	 * A field of live documents each drawing rings is a busier surface than the
	 * one that ships, so only the frame under the pointer ever draws.
	 */
	const hoverPickAt = (frame: string | null, world: Point, deepest: boolean, measuring = false) => {
		if (frame === null) {
			hoverPoint.current = null;
			setPreview(null);
			return;
		}
		const local = frameLocalAt(frame, world);
		if (local === null) return;
		hoverPoint.current = { frame, world };
		const now = performance.now();
		if (hoverBusy.current || now - hoverLast.current < HOVER_PICK_MS) return;
		hoverLast.current = now;
		hoverBusy.current = true;
		// ⌥ over a sibling measures instead of previewing a rung (#261). One
		// rung is held or there is no distance to draw: a measure is from
		// somewhere to somewhere, and a multi-selection has no somewhere.
		const held = measuring ? onlyHeldRung() : undefined;
		if (held !== undefined && held.frame === frame) {
			askMeasure(frame, held.selector, local, (reading) => {
				hoverBusy.current = false;
				if (gesture.current.kind !== "idle" || toolRef.current === "hand" || !optionDownRef.current) return;
				if (reading === null) {
					setPreview(null);
					return;
				}
				const other = measuredTarget(reading, held.selector);
				setPreview({
					click: { frame, selector: other.selector, rect: other.rect, radius: other.radius },
					spacing: { frame, ...decompose(reading) },
				});
			});
			return;
		}
		beginPick(
			frame,
			local,
			(chain) => {
				hoverBusy.current = false;
				if (gesture.current.kind !== "idle" || toolRef.current === "hand") return;
				// a deep hover is ⌘'s: let go while the frame was answering and
				// the answer is stale, so it must not redraw the rings
				if (deepest !== accelDownRef.current) return;
				const scope = scopeIn(frame);
				const editing = toolRef.current === "edit";
				// In Select with no rung open a click takes the frame, whose own ring
				// already says so. Edit always points at an element, so it always
				// draws one — and the rung under it dashed, because that is where
				// its double-click descends to.
				const target = deepest
					? chain[chain.length - 1]
					: editing || scope !== null
						? atRung(chain, scope)
						: undefined;
				const under = deepest || !editing ? undefined : oneDown(chain, scope);
				const ring = (hit: PickedHit | undefined): ElementPreview | null =>
					hit === undefined ? null : { frame, selector: hit.selector, rect: hit.rect, radius: hit.radius };
				const click = ring(target);
				const beneath = under?.selector === target?.selector ? null : ring(under);
				setPreview(click === null && beneath === null ? null : { click, under: beneath });
			},
			() => {
				hoverBusy.current = false;
			},
		);
	};

	/** Redraw the rings where the pointer already rests — ⌘ changes what they mean. */
	refreshRings.current = () => {
		const at = hoverPoint.current;
		if (at === null || toolRef.current === "hand" || gesture.current.kind !== "idle") {
			setPreview(null);
			return;
		}
		hoverLast.current = 0;
		hoverPickAt(at.frame, at.world, accelDownRef.current, optionDownRef.current);
	};

	/**
	 * A resize hands its size to the display, not to the pointer (#264).
	 *
	 * A frame's box is the viewport of the live document inside it, so every
	 * size that reaches React relayouts that whole document. A trackpad reports
	 * well above display rate, and the layouts queue up between two painted
	 * frames until the edge visibly trails the finger. Only the last size in a
	 * frame is ever seen, so only the last one is applied: the drag's own maths
	 * still run on every event, and the guides ride in the same write as the box
	 * rather than a frame behind it, because a line must never mark an edge the
	 * frame has already left.
	 *
	 * A move is left alone on purpose. It writes x and y, nothing inside the
	 * document relayouts, and a frame of waiting would buy nothing.
	 */
	const resizeFrame = useRef(0);
	const resizeNext = useRef<ResizePaint | null>(null);

	const applyResize = (paint: ResizePaint) => {
		setMarks(paint.marks);
		setFrames((current) => current.map((frame) => (frame.name === paint.frame ? { ...frame, ...paint.box } : frame)));
	};

	const paintResize = (paint: ResizePaint) => {
		resizeNext.current = paint;
		if (resizeFrame.current !== 0) return;
		resizeFrame.current = requestAnimationFrame(() => {
			resizeFrame.current = 0;
			const pending = resizeNext.current;
			resizeNext.current = null;
			if (pending !== null) applyResize(pending);
		});
	};

	/** Forget a size nobody will see — a drag that escaped must not paint after it. */
	const dropResize = useCallback(() => {
		cancelAnimationFrame(resizeFrame.current);
		resizeFrame.current = 0;
		resizeNext.current = null;
	}, []);

	/**
	 * Put the size the pointer let go of on the screen before anything reads it.
	 *
	 * The commit writes what the frames say, and a size still waiting on its
	 * animation frame says nothing yet — a release can land in the same batch of
	 * input as the move before it. Rendering it here is what makes the drag end
	 * where the pointer ended rather than a frame short of it.
	 */
	const settleResize = () => {
		const pending = resizeNext.current;
		dropResize();
		if (pending !== null) flushSync(() => applyResize(pending));
	};

	const cancelGesture = useCallback(() => {
		const active = gesture.current;
		// an interrupted ring drag wrote nothing and shows nothing: the inline
		// preview comes off and the element is as the file still has it (#316)
		if (isRingGesture(active)) previewStyle(active.pick.frame, active.pick.selector, null);
		gesture.current = { kind: "idle" };
		dropResize();
		setMarks(NO_MARKS);
		setMarquee(null);
		setResizeCursor(null);
		setResizingFrame(null);
		setElementDrag(null);
		setElementGuides(null);
		setGapDrag(null);
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
	}, [dropResize, previewStyle]);

	/**
	 * The two interruptions a ring drag never sees coming.
	 *
	 * A window that loses focus never sees the release, and a canvas that
	 * scrolls or zooms moves the box out from under the pointer: both end the
	 * gesture where it stands. The wheel is watched on the way down so the pan
	 * it also means still happens.
	 */
	useEffect(() => {
		const el = viewportRef.current;
		const interrupted = () => {
			if (isRingGesture(gesture.current)) cancelGesture();
		};
		window.addEventListener("blur", interrupted);
		el?.addEventListener("wheel", interrupted, { capture: true });
		return () => {
			window.removeEventListener("blur", interrupted);
			el?.removeEventListener("wheel", interrupted, { capture: true });
		};
	}, [cancelGesture]);

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
		if (findingRef.current || exportDialogRef.current !== null) return;
		const cam = cameraRef.current;
		if (cam === null || event.button === 2) return;
		stopAnimation();
		setMenu(null);
		setPreview(null); // the press supersedes the hover; its own answer redraws
		hideFrameHover();
		cancelPicks(); // a new press voids earlier picks; its own start a fresh generation
		flushNudge(); // a pending nudge settles before a new gesture captures origins
		const p = localPoint(event);
		pressOnHeld.current = null;
		// a press out on the field is the click-away that commits an open edit
		// (#255). While the frame's pointer is still out here, a press over it
		// is the second half of the very double-click that opened the edit and
		// belongs to nobody on the field.
		const openEdit = editingRef.current;
		if (openEdit !== null) {
			const over = frameAtWorld(toWorld(p, cam)) === openEdit.frame;
			if (over && openEdit.phase === "opening") return;
			endEdit(true);
			if (over) return;
		}
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

		// the element ring's handles first of all: they overhang the element and
		// sit over whatever the frame would otherwise have taken the press for
		const held = pickedRef.current.length === 1 ? pickedRef.current[0] : undefined;
		if (held !== undefined) {
			const turn = datasetHit(event.target, "element-rotate");
			const grab = datasetHit(event.target, "element-handle");
			if (turn !== null) {
				const box = elementScreenBox(held);
				if (box !== null) {
					gesture.current = {
						kind: "element-turn",
						pick: held,
						centre: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
						from: Math.atan2(p.y - (box.y + box.h / 2), p.x - (box.x + box.w / 2)),
						base: ringRef.current.rotation,
						live: ringRef.current.rotation,
					};
					setResizeCursor(ROTATE_CURSOR);
					showElementDrag(gesture.current);
					return;
				}
			}
			// the band over a gap, which sits inside the element rather than on its
			// edge: a press on it is that gap's, not the frame's underneath (#306)
			// ⌥ is the measurement's own modifier (#261), and a band must not take
			// the press that was asking how far apart two things are
			const grabbedGap = event.altKey ? null : datasetHit(event.target, "element-gap");
			const gapAxis = gapRef.current.axis;
			if (grabbedGap !== null && gapAxis !== null) {
				const index = Number(grabbedGap);
				const band = gapRef.current.bands[index];
				if (band !== undefined && beginElementGap(held, gapAxis, index, band, gapRef.current.sign, p)) {
					event.preventDefault();
					return;
				}
			}
			if (grab !== null && isHandle(grab)) {
				// a handle only moves the axes the file leaves live, so a corner on
				// an element a breakpoint pins the height of drags width alone
				const grabbed = edgeSigns(grab);
				const live = ringRef.current.live;
				if ((grabbed.sx !== 0 && live.w) || (grabbed.sy !== 0 && live.h)) {
					beginElementResize(held, grab, p, {
						center: event.altKey,
						proportional: event.shiftKey,
					});
					setResizeCursor(HANDLE_CURSORS[grab]);
					return;
				}
			}
		}

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
				setResizingFrame(single);
				return;
			}
		}

		const world = toWorld(p, cam);
		const label = datasetHit(event.target, "frame-label");
		const hit = label ?? frameAtWorld(world);

		if (hit === null) {
			// a page standing on this field (#265). Frames own their own pixels, so
			// this is asked where none of them answered; a page is picked on its
			// own, and taking one puts the frame selection down
			const page = datasetHit(event.target, "page-object") ?? pageObjectAt(pageObjectsRef.current, world)?.page;
			if (page !== undefined && page !== null && toolRef.current !== "hand") {
				setSelected([]);
				setPicked([]);
				setSelectedPage(page);
				// a page on a field with no frames of its own stands on a shelf the
				// daemon lays, so there is nothing for a drag to arrange it against
				const at = placesRef.current[page];
				if (at !== undefined && framesRef.current.length > 0) {
					gesture.current = { kind: "page-pending", page, origin: at, start: p };
				}
				return;
			}
			setSelectedPage(null);
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

		// the selection never holds a page and a frame at once
		setSelectedPage(null);
		// the other way a mark clears: pressing a frame is going to it
		markRead([hit]);

		// inside an element scope, shift toggles membership (#37): the at-depth
		// target under the cursor, or with accel the deepest
		if (toolRef.current !== "hand" && event.shiftKey && pickedRef.current.length > 0 && label === null) {
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

		// accel-click deep-selects the element under the cursor (Figma): in Select
		// it is the borrow of Edit, in Edit the leap past every rung between. The
		// modifier is exclusive, never a union: on the Mac ctrl-click is the
		// context menu's, so accepting either would fire both.
		if (toolRef.current !== "hand" && accelPressed(event) && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) deepSelectAt(hit, local);
			return;
		}

		// In Select a bare click takes the frame and nothing inside it: elements
		// are ⌘'s. The one exception is an element scope already open on this
		// frame — there, plain clicks keep moving the selection at that depth
		// (#37). In Edit every click is that click, landing on the frame's root
		// element until a descent opens a deeper scope. Either can promote to a
		// frame move once the pointer crosses the drag threshold.
		const anchor = pickedRef.current[pickedRef.current.length - 1];
		if (toolRef.current !== "hand" && label === null) {
			const scoped = toolRef.current === "edit" || (anchor !== undefined && anchor.frame === hit);
			if (scoped) {
				const local = frameLocalAt(hit, world);
				// a press on the element that was already held is the second click
				// the text gesture is (#255) — noted here and acted on at pointer-up,
				// because until then it may yet turn out to be a drag of the frame
				if (local !== null) {
					const again = secondClick(pickedRef.current, hit, local);
					pressOnHeld.current = again === undefined ? null : { pick: again, local };
					scopedSelectAt(hit, local);
				}
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
			if (menuOpenRef.current || event.pointerType === "touch") {
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
			// a page lights the way a frame does, and only where no frame answered
			const overPage = frame === null ? (pageObjectAt(pageObjectsRef.current, world)?.page ?? null) : null;
			setHoveredPage((current) => (current === overPage ? current : overPage));
			// The rings and the element preview belong to the pointing tools, and
			// every reader of `hovered` out here gates on that. The frame under the
			// pointer is nobody's tool: it is what keeps a live frame awake (#172),
			// and a pointer resting on a frame is resting on it in the Hand too.
			if (toolRef.current === "hand") return;
			// ⌥ is read off the move rather than off the key event, exactly as ⌘
			// is: the ref is what a reply is checked against, and the modifier
			// the pointer reports is the one that was down when the ask went out
			optionDownRef.current = event.altKey;
			hoverPickAt(label === null ? frame : null, world, accelPressed(event), event.altKey);
			return;
		}

		if (active.kind === "pan") {
			const dx = p.x - active.lastX;
			const dy = p.y - active.lastY;
			gesture.current = { ...active, lastX: p.x, lastY: p.y };
			setCamera((c) => (c === null ? c : { ...c, x: c.x + dx, y: c.y + dy }));
			return;
		}

		// the element ring's drags: nothing is written until the pointer is up,
		// so what moves here is the ring, the readout and the rail's fields
		if (active.kind === "element-size") {
			const held = active.measured;
			if (held === null) return;
			const dragged = resizedBox(
				held.start,
				active.edge,
				(p.x - active.from.x) / cam.k,
				(p.y - active.from.y) / cam.k,
				held.modifiers,
				held.limits,
			);
			const raw = { w: dragged.w, h: dragged.h };
			const measured: ResizeMeasurement = {
				...held,
				raw,
				live: raw,
				shift: { x: dragged.shiftX, y: dragged.shiftY },
			};
			// the pointer intent, not the corrected size, is what a sample repeats:
			// a snap that compared itself would stick to the stop it just made
			if (raw.w === held.raw.w && raw.h === held.raw.h) return;
			const next: Gesture = { ...active, measured };
			gesture.current = next;
			showElementDrag(next);
			void alignElementResize(next, accelPressed(event), cam.k);
			return;
		}

		if (active.kind === "element-gap") {
			sampleElementGap(active, p, event.shiftKey);
			return;
		}

		if (active.kind === "element-turn") {
			const now = Math.atan2(p.y - active.centre.y, p.x - active.centre.x);
			const live = draggedAngle(active.base, active.from, now, event.shiftKey);
			if (live === active.live) return;
			const next: Gesture = { ...active, live };
			gesture.current = next;
			showElementDrag(next);
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
			// the modifier is read off the move itself rather than off the key event:
			// the gesture keeps no modifier state, and mid-drag the wait is a frame
			const snap = snapMovedBox(boundsOf(movingBoxes), statics, SNAP_THRESHOLD_PX / cam.k, {
				suppressed: accelPressed(event),
			});
			const dx = rawX + snap.dx;
			const dy = rawY + snap.dy;
			setMarks({ v: snap.v, h: snap.h, spans: snap.spans });
			setFrames((current) =>
				current.map((frame) => {
					const origin = active.origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x + dx, y: origin.y + dy };
				}),
			);
			return;
		}

		if (active.kind === "page-pending") {
			if (Math.hypot(p.x - active.start.x, p.y - active.start.y) < DRAG_THRESHOLD_PX) return;
			gesture.current = { ...active, kind: "page-move" };
			onPointerMove(event);
			return;
		}

		// a page moves alone and snaps to nothing: it is not a frame, and the
		// guides are the frames' own arrangement
		if (active.kind === "page-move") {
			const at = {
				x: Math.round(active.origin.x + (p.x - active.start.x) / cam.k),
				y: Math.round(active.origin.y + (p.y - active.start.y) / cam.k),
			};
			setPlaces((current) =>
				current[active.page]?.x === at.x && current[active.page]?.y === at.y
					? current
					: { ...current, [active.page]: at },
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
				const content = contentSize.current;
				const stops =
					content?.frame === active.frame && content.width === Math.round(w)
						? [handle.includes("n") ? anchor.y - content.height : anchor.y + content.height]
						: [];
				const snap = snapEdge(world.y, statics, "y", threshold, stops);
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
			paintResize({
				frame: active.frame,
				box: { x, y, w, h },
				// spacing is a fact about where a frame sits, not about how big it is
				marks: { v: vGuides, h: hGuides, spans: [] },
			});
		}
	};

	/**
	 * Where a size drag begins (#305): the facts only the document has.
	 *
	 * ⇧ and ⌥ are read here and nowhere else. The gesture is about exactly the
	 * fields it may write, and a modifier picked up half way through would
	 * change that set, so the drag that opened without them keeps its own
	 * promise and the readout says which one it made.
	 */
	const beginElementResize = (pick: PickedSelection, edge: Edge, from: Point, asked: ResizeModifiers) => {
		const { sx, sy } = edgeSigns(edge);
		gesture.current = { kind: "element-size", pick, edge, from, asked, measured: null };
		askSizing(pick.frame, pick.selector, (sizing) => {
			const active = gesture.current;
			if (active.kind !== "element-size" || active.pick.selector !== pick.selector) return;
			const live = ringRef.current.live;
			const center = asked.center && (sizing?.free ?? false);
			const properties: ResizeProperty[] =
				sizing === null
					? []
					: [
							...(sx !== 0 || asked.proportional ? (live.w ? (["width"] as const) : []) : []),
							...(sy !== 0 || asked.proportional ? (live.h ? (["height"] as const) : []) : []),
							// an already free element's own placement, and only where it has one
							...(sizing.free && sizing.offset.left !== null && (center || sx === -1)
								? (["left"] as const)
								: []),
							...(sizing.free && sizing.offset.top !== null && (center || sy === -1) ? (["top"] as const) : []),
						];
			// a document that says nothing about the box, or a box with nothing this
			// grab may write, is not a drag anybody should be left holding
			if (sizing === null || properties.length === 0) {
				cancelGesture();
				return;
			}
			// what the file already says each of them is written in; a form no
			// drag can move refuses by name rather than being rewritten in pixels
			const writes: Partial<Record<ResizeProperty, SizeWrite>> = {};
			for (const property of properties) {
				const spelling = authoredSpelling(
					ringRef.current.className,
					RESIZE_PROPERTIES[property].family,
					sizing.units,
				);
				if (spelling.kind === "refused") {
					cancelGesture();
					showRefusal(pick.frame, pick.selector, { code: "authored-unit", says: spelling.says });
					return;
				}
				writes[property] = spelling.kind === "pixels" ? { unit: "px", per: 1 } : spelling;
			}
			const measured: ResizeMeasurement = {
				modifiers: { center, proportional: asked.proportional },
				properties,
				writes: writes as Record<ResizeProperty, SizeWrite>,
				start: sizing.box,
				extra: sizing.extra,
				raw: sizing.box,
				offset: { left: sizing.offset.left ?? 0, top: sizing.offset.top ?? 0 },
				limits: sizing.limits,
				live: sizing.box,
				shift: { x: 0, y: 0 },
			};
			gesture.current = { ...active, measured };
			showElementDrag(gesture.current);
		});
	};

	/**
	 * The size one sample settles on, and the alignments it may claim (#311).
	 *
	 * Every sample begins from the raw pointer intent, asks the document what
	 * that size would align with, tries one correction and then asks what the
	 * layout actually made of it. A stop CSS rounded away, refused, or moved
	 * while answering leaves the pointer's own size and draws nothing: a guide
	 * is a statement about the box that is there, never about the one that was
	 * asked for. There is no second attempt: this chases nothing.
	 */
	const alignElementResize = async (
		active: Extract<Gesture, { kind: "element-size" }>,
		bypass: boolean,
		zoom: number,
	): Promise<void> => {
		const held = active.measured;
		if (held === null) return;
		const sample = ++snapSample.current;
		const { pick, edge } = active;
		const { sx, sy } = edgeSigns(edge);
		/** the gesture this sample belongs to, or nothing where it was superseded */
		const current = (): Extract<Gesture, { kind: "element-size" }> | null => {
			const now = gesture.current;
			return snapSample.current === sample &&
				now.kind === "element-size" &&
				now.pick.selector === pick.selector &&
				now.measured !== null
				? now
				: null;
		};
		/** Undefined leaves what is drawn alone; null takes it down. */
		const showGuides = (guides: { v: number[]; h: number[] } | null | undefined) => {
			if (guides === undefined) return;
			setElementGuides((current) =>
				guides === null
					? null
					: current !== null &&
							current.frame === pick.frame &&
							same(current.v, guides.v) &&
							same(current.h, guides.h)
						? current
						: { frame: pick.frame, ...guides },
			);
		};
		const settle = async (size: Size, guides: { v: number[]; h: number[] } | null | undefined): Promise<boolean> => {
			const now = current();
			if (now === null || now.measured === null) return false;
			showGuides(guides);
			// the size already on the layout is not written again: the pointer's own
			// sample put it there, and only a correction is news
			if (now.measured.live.w === size.w && now.measured.live.h === size.h) return true;
			const measured: ResizeMeasurement = {
				...now.measured,
				live: size,
				shift: placementShift(held.start, edge, held.modifiers, size),
			};
			const next: Gesture = { ...now, measured };
			gesture.current = next;
			showElementDrag(next);
			return true;
		};
		if (bypass || (sx === 0 && sy === 0)) {
			await settle(held.raw, null);
			return;
		}
		const before = await askSnapping(pick.frame, pick.selector, snapTrial(held, edge, sx, sy));
		if (current() === null) return;
		const pool: SnapTarget[] = before === null ? [] : poolOf(before);

		const request: SnapRequest = {
			sx,
			sy,
			zoom,
			// ⇧ holds the proportions the border box started at
			ratio: held.modifiers.proportional && held.start.h > 0 ? held.start.w / held.start.h : null,
			sensitivity: before?.sensitivity ?? { w: 0, h: 0 },
			limits: held.limits,
			quantize: quantizerFor(held),
		};
		const snap: ElementSnap | null = before === null ? null : snapResize(before.box, held.raw, pool, request);
		if (before === null || snap === null || (snap.v.length === 0 && snap.h.length === 0)) {
			await settle(held.raw, null);
			return;
		}
		// the correction goes on with the guides the last sample earned still up:
		// they come down when this sample's own answer replaces them, so a held
		// snap reads as one steady line rather than one that blinks per sample
		if (!(await settle(snap.size, undefined))) return;
		const after = await askSnapping(pick.frame, pick.selector, null);
		if (current() === null) return;
		if (after !== null && truthful(snap, after.box, poolOf(after), request, pool))
			showGuides({ v: snap.v, h: snap.h });
		else await settle(held.raw, null);
	};

	/**
	 * Where a gap drag begins (#306).
	 *
	 * The same shape the size drag has: about exactly the one property this
	 * drag may move. A value no step can move without renaming it never opens
	 * one: the rail keeps it, where it is read for what it is.
	 */
	const beginElementGap = (
		pick: PickedSelection,
		axis: GapAxis,
		index: number,
		band: GapBand,
		sign: 1 | -1,
		from: Point,
	): boolean => {
		const authored = gapRef.current.authored;
		if (authored === null || !gapSteppable(authored)) return false;
		gesture.current = {
			kind: "element-gap",
			pick,
			axis,
			index,
			band,
			sign,
			from,
			authored,
			measured: axis === "column-gap" ? band.w : band.h,
			units: 0,
			live: null,
		};
		return true;
	};

	/** One sample of a live gap drag, drawn as the band the pointer is making. */
	const sampleElementGap = (active: Extract<Gesture, { kind: "element-gap" }>, p: Point, coarse: boolean): void => {
		const sampled = gapSample(active, p, coarse, cameraRef.current?.k ?? 1, ringRef.current.step, DRAG_THRESHOLD_PX);
		if (sampled === null) return;
		const next: Gesture = { ...active, units: sampled.units, live: sampled.live };
		gesture.current = next;
		showGapDrag(next);
	};

	/**
	 * What the band draws while a gap drag is live: the space the pointer is
	 * making, and the same space on the element itself (#316), on the one axis
	 * the band was grabbed on.
	 */
	const showGapDrag = (active: Extract<Gesture, { kind: "element-gap" }>): void => {
		const style = gapStyle(active, ringRef.current.step);
		if (style !== null) previewStyle(active.pick.frame, active.pick.selector, style);
		setGapDrag({ selector: active.pick.selector, index: active.index, ...gapPaint(active, ringRef.current.step) });
	};

	/**
	 * Where a page drag left it: one gesture, one entry on the one stack (#265).
	 *
	 * The field has been drawing the page at its new place all through the drag,
	 * so this is only what makes it durable and undoable — the same shape a
	 * frame move's commit has, against the durable a page's place lives in.
	 */
	const commitPlace = (page: string, origin: Place) => {
		const at = placesRef.current[page];
		if (at === undefined) return;
		const entry = placeEntryOf({ [page]: origin }, { [page]: at });
		if (entry === undefined) return;
		updateHistory(record(history.current, entry));
		applyPlaces({ [page]: at });
	};

	/**
	 * Where a ring drag left it: one class write and one step on the one stack
	 * (#316).
	 *
	 * The element already wears what the release means, so this is only what
	 * makes it durable — the same lane a rail field commits through, on the
	 * values the last sample showed. The write's own answer puts the class on
	 * and lifts the preview, so the frame is never reloaded for its own drag.
	 * A drag that moved nothing writes nothing and simply lifts.
	 */
	const commitRingGesture = (active: Extract<Gesture, { kind: "element-size" | "element-turn" | "element-gap" }>) => {
		const lift = () => previewStyle(active.pick.frame, active.pick.selector, null);
		if (active.kind === "element-size") {
			const held = active.measured;
			if (held === null || (held.live.w === held.start.w && held.live.h === held.start.h)) {
				lift();
				return;
			}
			const fields = resizeFields(
				held.properties,
				held.live,
				held.shift,
				held.offset,
				ringRef.current.step,
				held.writes,
			);
			commitClass(
				active.pick,
				fields.map((field) => field.value),
			);
			return;
		}
		if (active.kind === "element-turn") {
			if (active.live === active.base) {
				lift();
				return;
			}
			commitClass(active.pick, [turnValue(active.live, active.base)]);
			return;
		}
		const live = active.live;
		if (live === null || !gapMoved(active)) {
			lift();
			return;
		}
		const at = { scoped: scopedClass(ringRef.current.className, BASE), theme: ringRef.current.theme };
		commitClass(active.pick, [gapField(active.axis, live, at)]);
	};

	const onPointerUp = () => {
		const active = gesture.current;
		// settled while the drag still counts as in flight, so the footprint the
		// release leaves is taken once, off the size that was let go of
		if (active.kind === "resize") settleResize();
		gesture.current = { kind: "idle" };
		setPanning(false);
		setMarks(NO_MARKS);
		setMarquee(null);
		setResizeCursor(null);
		setResizingFrame(null);
		setElementDrag(null);
		setElementGuides(null);
		setGapDrag(null);
		if (active.kind === "move") commitGeometry(active.names, moveBefore(active.origins));
		if (active.kind === "page-move") commitPlace(active.page, active.origin);
		if (active.kind === "resize") commitGeometry([active.frame], { [active.frame]: active.origin });
		if (isRingGesture(active)) commitRingGesture(active);
		// the press never became a drag, so the second click meant the words (#255)
		const again = pressOnHeld.current;
		pressOnHeld.current = null;
		if (active.kind === "pending" && again !== null) beginTextEdit(again.pick, again.local);
	};

	/**
	 * Double-click, which each pointing tool spends on its own subject: Select
	 * goes inside the frame, Edit steps one rung down the ladder.
	 *
	 * Keeping them apart is what lets both be the plain gesture. Running a
	 * frame is the constant act on this canvas and takes no modifier for it;
	 * descending is constant too, but only once you have said you are editing,
	 * which is what picking up the tool says. The frame's label has no rung
	 * under it either way, so a double-click there always goes inside.
	 */
	const onDoubleClick = (event: React.MouseEvent) => {
		if (exportDialogRef.current !== null) return;
		if (toolRef.current === "hand") return;
		// a second click on a band is the band's own: it opens the same value the
		// first one did rather than stepping down the ladder underneath it (#306)
		if (datasetHit(event.target, "element-gap") !== null) return;
		const cam = cameraRef.current;
		if (cam === null) return;
		const label = datasetHit(event.target, "frame-label");
		const world = toWorld(localPoint(event), cam);
		const hit = label ?? frameAtWorld(world);
		if (hit === null) {
			// double-click goes inside a page the same way it goes inside a frame
			// (#265). The camera does not fly: a page is its own coordinate space,
			// and pretending otherwise would be a lie about what just happened
			const page = pageObjectAt(pageObjectsRef.current, world);
			if (page !== null) {
				cancelGesture();
				setSelectedPage(null);
				activatePageFromTree(page.page);
			}
			return;
		}
		if (hit === enteredRef.current) return;
		cancelGesture();
		if (label !== null || toolRef.current === "select") {
			enterFrame(hit);
			return;
		}
		const local = frameLocalAt(hit, world);
		if (local !== null) descendAt(hit, local);
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

	/**
	 * The frame's source file, handed out rather than opened (#23).
	 *
	 * Spool has no business choosing somebody's editor, and the path is what
	 * every next step actually wants — an agent told which file to change, a
	 * terminal, an editor's own open-by-path. It is the design-relative path
	 * because that is the name the repo and the frame stamps already use.
	 */
	const copySourcePath = useCallback((path: string) => {
		void navigator.clipboard
			?.writeText(path)
			.then(() => setNotice({ kind: "success", message: `Copied ${path}` }))
			.catch(() => setNotice({ kind: "error", message: "Could not copy the path" }));
	}, []);

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
	const litOut = !pointerTool
		? null
		: preview?.click != null &&
				picked.some((pick) => pick.frame === preview.click?.frame && pick.selector === preview.click?.selector)
			? pickKey(preview.click.frame, preview.click.selector)
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
			holdChain(null);
			setSelected([frame.name]);
			frameAnchor.current = frame.name;
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (viewport !== null && cam !== null) {
				animateCamera(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
			}
		},
		[recordDeparture, switchToPage, arrivalAt, animateCamera, holdChain],
	);

	/**
	 * What a row in the rail may do about the frame it names, as one object that holds
	 * still (#143, #194).
	 *
	 * Built here rather than in the element because the rail draws a row per tool call and
	 * a nine-minute turn is nineteen of them: a fresh object per render is a fresh prop for
	 * every one of those rows, which is every row re-rendering on every step of the pace and
	 * on every pointermove the camera takes. It changes when the frames do, which is the
	 * only thing in it that is ever about to be different.
	 */
	const jump = useMemo<FrameJump>(
		() => ({
			have: reach.have,
			gone: reach.gone,
			onPoint: setPointed,
			onJump: (name) => {
				// pointing was the question and landing is the answer, so the weaker mark
				// goes as the stronger one arrives
				setPointed(null);
				landOnFrame(name);
			},
		}),
		[reach, landOnFrame],
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
			// Held keys repeat, and only the first press changes what a ring means.
			// The ref is mirrored from state at render, which is a paint away; the
			// redraw below reads it now, so this press writes both.
			"canvas.accel-hold": () => {
				if (accelDownRef.current) return;
				setAccelDown(true);
				accelDownRef.current = true;
				refreshRings.current();
			},
			// ⌥ down redraws where the pointer already rests, which is what turns
			// a resting hover into a measurement without moving the mouse (#261)
			"canvas.measure": () => {
				if (optionDownRef.current) return;
				optionDownRef.current = true;
				refreshRings.current();
			},
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
			// ⌘Z answers the trash toast first (#7), then walks the one stack (#230)
			"canvas.undo": (event) => {
				event?.preventDefault();
				if (pendingTrashRef.current !== null) undoTrash();
				else if (gestureStill()) walk("undo");
			},
			"canvas.redo": (event) => {
				event?.preventDefault();
				if (gestureStill()) walk("redo");
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
			"canvas.tool-edit": () => setTool("edit"),
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
			// ⌫ is the frame's own trash, and an element's own delete when one is
			// held (#317): the frame behind it is never what the press meant. One
			// element at a time, and never while its words are open — that press
			// belongs to the text being typed.
			"canvas.trash": (event) => {
				if (enteredRef.current !== null) return;
				if (pickedRef.current.length > 0) {
					event?.preventDefault();
					const only = pickedRef.current.length === 1 ? pickedRef.current[0] : undefined;
					if (only !== undefined && editingRef.current === null) deleteElement(only);
					return;
				}
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
			// ⏎ goes inside, from the frame or from a rung within it; the ladder's
			// own descent is ⌘⏎, and the climb ⇧⏎ (#254)
			"canvas.enter": (event) => {
				const targets = verbTarget();
				const [only] = targets;
				if (targets.length !== 1 || only === undefined) return;
				event?.preventDefault();
				enterFrame(only);
			},
			"canvas.descend": (event) => {
				if (enteredRef.current !== null) return;
				event?.preventDefault();
				setPreview(null);
				descendKey();
			},
			"canvas.ascend": (event) => {
				if (enteredRef.current !== null) return;
				event?.preventDefault();
				cancelPicks();
				setPreview(null);
				climbRung();
			},
			// Tab is the browser's focus key until a rung is held: claiming it
			// only where the ladder can answer leaves the chrome reachable
			"canvas.sibling": (event) => {
				if (walkSibling(event?.shiftKey === true ? "previous" : "next")) event?.preventDefault();
			},
			"canvas.escape": () => {
				cancelPicks();
				setPreview(null);
				if (editingRef.current !== null) {
					endEditRef.current(false);
					return;
				}
				if (!gestureStill()) cancelGesture();
				else if (menuOpenRef.current) setMenu(null);
				else if (enteredRef.current !== null) exitEntered(true);
				// Esc leaves first, then climbs the same rungs ⇧⏎ climbs
				else climbRung();
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
		const detachCanvas = attachHotkeyLayer({ scope: "canvas", handlers });
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceDown(false);
			// releasing accel turns the deep ring back into the ladder's two, under
			// a pointer that has not moved since (#254)
			if (event.key === accelKeyName()) {
				setAccelDown(false);
				accelDownRef.current = false;
				refreshRings.current();
			}
			// letting ⌥ go puts the rungs back where the measurement was. The
			// overlay goes at once rather than when the fresh ancestry lands: a
			// distance is only true while the modifier that asked for it is held.
			if (event.key === "Alt") {
				optionDownRef.current = false;
				setPreview(null);
				refreshRings.current();
			}
		};
		const clearModifiers = () => {
			setAccelDown(false);
			setSpaceDown(false);
			optionDownRef.current = false;
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
		deleteElement,
		exitEntered,
		enterFrame,
		nudge,
		undoTrash,
		walk,
		arrangeFrames,
		reloadFrameDocument,
		stageTrash,
		cancelGesture,
		cancelPicks,
		toggleArrows,
		cancelExportDialog,
		playFrame,
		jumpBack,
		jumpForward,
		descendKey,
		climbRung,
		walkSibling,
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
	}, [arrowsOn, hasThreads, onChrome, toggleArrows, zoomPct]);

	// --- render -------------------------------------------------------------------

	// no frames and no pages anywhere: the project is untouched — the canvas
	// surface says so and the tools stay away until the first frame lands (#39).
	// The pages tree stands regardless, over its root page, and so does the agent
	// rail where this machine has switched it on.
	const projectEmpty = loaded && frames.length === 0 && pages.length === 0;
	/**
	 * A page holding neither frames nor pages (#265).
	 *
	 * The project-wide notice stays exactly as it is; this is the same fact
	 * scoped to one page, and it exists because a page of pages and a page nobody
	 * has written into used to wear the same picture, which was nothing at all.
	 * Page objects answered the first of those, and this answers the second.
	 */
	const pageEmpty =
		loaded && !projectEmpty && activePage !== ROOT_PAGE && pageIsBare(activePage, navigatorPages, navigatorFrames);
	/**
	 * Which rail the right column is standing in (#256).
	 *
	 * One at a time, and the agent's own width is the whole of the answer: the
	 * two strips are each other's switch, so there is one number rather than a
	 * second piece of state that could disagree with it. With the experiment
	 * off the strip is never drawn and the column is simply the properties rail.
	 */
	/** what the rail is looking at: one rung, one frame, or how many of either */
	const railHeld = ((): Held | null => {
		// a page is held on its own, and the selection never holds both (#265)
		const page = pageObjects.find((object) => object.page === selectedPage);
		if (page !== undefined) return { kind: "page", page: page.page, name: page.name, count: page.count };
		if (picked.length > 1) return { kind: "elements", count: picked.length };
		const rung = picked[0];
		if (rung !== undefined) {
			const chain = chainDrawn?.frame === rung.frame ? chainDrawn.chain : [rung];
			return { kind: "element", frame: rung.frame, chain, selector: rung.selector };
		}
		if (selected.length > 1) return { kind: "frames", count: selected.length };
		const name = selected[0];
		const only = name === undefined ? undefined : frames.find((frame) => frame.name === name);
		return only === undefined
			? null
			: { kind: "frame", name: only.name, geometry: { x: only.x, y: only.y, w: only.w, h: only.h } };
	})();
	const railFrame = railHeld?.kind === "element" ? railHeld.frame : railHeld?.kind === "frame" ? railHeld.name : null;
	/**
	 * The element ring's own read (#259): which of its handles the file leaves
	 * live, the step a whole class is measured in, and the turn it already
	 * wears. An element with no stamp of its own has no handle at all — the
	 * lane has nothing to write against, so there is nothing to grab.
	 */
	const ringPick = picked.length === 1 ? picked[0] : undefined;
	/**
	 * The selection's one read, and the two clocks behind it.
	 *
	 * `reloads` is the held frame's document coming back: tokens.css is one of
	 * its inputs, so it is the one thing that could have changed the theme.
	 * `revision` adds the hand's own saves, because a save rewrites the very
	 * literal this read is about without reloading the document — without it
	 * the ring and the rows go on answering out of the file as it was (#306).
	 */
	const railReloads = railFrame === null ? 0 : (docNonces[railFrame] ?? 0);
	const railRevision = railFrame === null ? 0 : railReloads + (saves[railFrame] ?? 0);
	const railRungs = useRungs(project, railHeld, railRevision);
	const railTheme = useTheme(project, railReloads);
	const ring = ringOf(
		railHeld?.kind === "element" && ringPick !== undefined && !ringPick.generated
			? railRungs?.[rungOf(railHeld)]
			: undefined,
		railTheme,
	);
	ringRef.current = ring;
	railRungsRef.current = railRungs;
	/** the drag in flight on the rung the ring is drawn on, and nothing else */
	const ringDrag = elementDrag !== null && elementDrag.selector === ringPick?.selector ? elementDrag : null;
	/**
	 * The gaps the held container identifies, in this camera (#306).
	 *
	 * The reading is the frame's own, kept only while it is about this
	 * selection; the bands are the decisions read over it. A drag holds the one
	 * it grabbed, so a band the pointer is on stays where the pointer put it.
	 */
	const gapReading =
		ringPick !== undefined && gapRead?.frame === ringPick.frame && gapRead.selector === ringPick.selector
			? gapRead.reading
			: null;
	const gapAxis = gapReading === null || !gapWritable(ring.read) ? null : gapAxisOf(gapReading);
	// a measured gap is not proof of who wrote it: only the declaration this
	// class cell owns may be dragged (#306)
	const gapOwned =
		gapReading === null || gapAxis === null ? null : ownedGap(gapReading, gapAxis, ring.className, ring.step);
	const heldGap = gapDrag !== null && gapDrag.selector === ringPick?.selector ? gapDrag : null;
	// a size or turn drag moves the boxes the bands were measured between, so the
	// bands stand down until the reading that comes after it lands
	const gapTargets =
		gapReading === null || gapAxis === null || gapOwned === null || ringDrag !== null
			? []
			: gapBands(gapReading, camera?.k ?? 1).map((band, index) =>
					heldGap !== null && heldGap.index === index ? heldGap.band : band,
				);
	const elementHandles: ElementHandles | null =
		ringPick === undefined || !pointerTool || entered !== null
			? null
			: {
					frame: ringPick.frame,
					selector: ringPick.selector,
					rect: ringDrag?.rect ?? ringPick.rect,
					live: ring.live,
					active: ringDrag?.edge ?? null,
					says: ringDrag?.says ?? null,
					turning: ringDrag?.turning ?? false,
					gaps: {
						bands: gapTargets,
						axis: gapTargets.length === 0 ? null : gapAxis,
						held: heldGap?.index ?? null,
						says: heldGap?.says ?? null,
					},
				};
	gapRef.current = {
		axis: gapTargets.length === 0 ? null : gapAxis,
		sign: gapReading === null ? 1 : gapDragSign(gapReading),
		authored: gapOwned,
		bands: gapTargets,
	};
	const gapFrame = ringPick?.frame;
	const gapSelector = ringPick?.selector;
	const gapNonce = gapFrame === undefined ? 0 : (docNonces[gapFrame] ?? 0);
	const gapSettled = gapDrag === null;
	// the container's own gaps, asked of the document that laid them out: on a
	// fresh selection, on a reloaded document, after a save, and once a drag has
	// let go of the band it was holding
	// biome-ignore lint/correctness/useExhaustiveDependencies: the nonce and a settled drag are triggers rather than values read in here
	useEffect(() => {
		if (gapFrame === undefined || gapSelector === undefined) {
			setGapRead(null);
			return;
		}
		let live = true;
		askGaps(gapFrame, gapSelector, (reading) => {
			if (live) setGapRead({ frame: gapFrame, selector: gapSelector, reading });
		});
		return () => {
			live = false;
		};
	}, [askGaps, gapFrame, gapSelector, gapNonce, gapSettled]);
	const k = camera?.k ?? 1;
	const shellRadius = Math.min(12 / k, 24);
	const cursor = resizeCursor ?? (panning ? "grabbing" : effectiveTool === "hand" ? "grab" : "default");

	return (
		<div className="relative flex h-full w-full">
			<div className="relative z-20 flex shrink-0">
				<CanvasSidebar
					project={project}
					pages={navigatorPages}
					activePage={activePage}
					frames={navigatorFrames}
					selected={selected}
					onSwitchPage={activatePageFromTree}
					onSelectFrame={selectFrameRow}
					onExtendSelection={extendFrameRange}
					onDoubleClickFrame={flyToFrame}
					onTrashFrames={stageTrash}
					onTrashPage={(page, names) => stageEntry({ frames: names, page })}
					onRevealFrame={landOnFrame}
					onCopyPath={(name) => copySourcePath(frameSourcePath(name, framePageOf(name)))}
					onCopiesLanded={cascadeCopies}
					onRefresh={() => void refetchFrames()}
					onRecord={recordEntry}
					run={runEntry}
					// the finder's pick, or the page holding the frame a row in the agent rail is
					// pointing at (#194)
					litPage={finding ? findLit : pointedPage}
					unseen={unseen}
					// the same path the dwell clock takes, so a marked-by-hand frame clears
					// against the same overlay and lands in the same batched write
					onMarkSeen={markRead}
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
				className="relative h-full min-w-0 flex-1 touch-none select-none overflow-clip bg-canvas outline-none"
				style={{ cursor }}
				onPointerDown={onPointerDown}
				// the second half of the double-click that opened an edit must not
				// take the focus out of the frame, or the frame reads it as the blur
				// that saves. Here rather than on the pointer press, because a
				// cancelled pointerdown takes the double-click with it (#314)
				onMouseDown={(event) => {
					const openEdit = editingRef.current;
					const cam = cameraRef.current;
					if (openEdit === null || openEdit.phase !== "opening" || cam === null) return;
					if (frameAtWorld(toWorld(localPoint(event), cam)) === openEdit.frame) event.preventDefault();
				}}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={cancelGesture}
				onLostPointerCapture={() => {
					const active = gesture.current;
					if (isRingGesture(active)) cancelGesture();
				}}
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
						{/* the pages standing on this field (#265). Under the frames,
						    because a frame is a live document and a page is a picture of
						    some: the press that reaches a page is the press no frame
						    answered. */}
						{pageObjects.map((object) => (
							<PageObjectView
								key={object.page}
								project={project}
								object={object}
								k={k}
								selected={selectedPage === object.page}
								hovered={pointerTool && hoveredPage === object.page}
							/>
						))}
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
											settled={lifecycle.settled.has(frame.name)}
											entered={isEntered}
											active={selectionTargets.has(frame.name)}
											// ⌘ borrows an entered frame's pointer to reach an element under it
											// an open in-place edit gives the frame its pointer back, so
											// the words can be typed into the element itself (#255) —
											// once it is open: for one double-click interval the canvas
											// still hears the second half of the click that opened it.
											// ⌘ borrows an entered frame's pointer to reach an element
											// under it; an open edit is already inside one
											interactive={
												editing?.frame === frame.name && editing.phase === "open"
													? true
													: isEntered && !accelDown
											}
											docNonce={docNonces[frame.name] ?? 0}
											holdNonce={heldPaint[frame.name] ?? null}
											cover={frame.cover}
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
						    label's own z-index. */}
						{visibleFrames.map((frame) => {
							const isEntered = entered === frame.name;
							const isSelected = selected.includes(frame.name);
							const isHovered = pointerTool && hovered?.visible === true && hovered.frame === frame.name;
							return (
								<div
									key={`${frame.name}:label`}
									className="pointer-events-none absolute h-0"
									style={{
										transform: `translate(${frame.x}px, ${frame.y}px)`,
										width: frame.w,
									}}
								>
									{/* Mono, muted; thread when selected. Entered swaps it for the
										    state chip (#28). */}
									<FrameLabel
										name={frame.name}
										frameWidth={frame.w}
										k={k}
										entered={isEntered}
										selected={isSelected}
										hovered={isHovered}
										unseen={unseen.get(frame.name)}
										onPlay={() => playFrame(frame.name)}
									/>
								</div>
							);
						})}
						{pageObjects.map((object) => (
							<PageObjectLabel
								key={`${object.page}:label`}
								object={object}
								k={k}
								selected={selectedPage === object.page}
								hovered={pointerTool && hoveredPage === object.page}
							/>
						))}
						{/* the tags ride over the frames, because pressing one travels —
						    the leaders under them are the map and take no pointer */}
						{arrowsOn && <WalkLayer walks={walks} frames={visibleFrames} k={k} onOpen={landOnFrame} />}
					</div>
				)}

				{camera !== null && (
					<>
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
							preview={pointerTool ? preview : null}
							refused={refused}
							onAsk={() => askAgent(refused ?? undefined)}
							onOpenFile={(path, line) => copySourcePath(`${path}:${line}`)}
							handles={elementHandles}
							marks={marks}
							elementGuides={elementGuides}
							marquee={marquee}
							shellRadius={shellRadius}
						/>
						{/* the agent's hand (#214), in the same screen space as the furniture
						    beside it: presence on any visible frame at any zoom, and a located
						    mark wherever a document was live enough to be measured */}
						<AgentHandLayer
							camera={camera}
							frames={visibleFrames}
							hand={hand}
							marks={handMarks}
							shellRadius={shellRadius}
						/>
					</>
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
						onCopyPath={() => {
							const pick = pickedRef.current.find((candidate) => candidate.frame === menu.frame);
							copySourcePath(
								pick !== undefined
									? sourcePathOf(pick, framePageOf(pick.frame))
									: frameSourcePath(menu.frame, framePageOf(menu.frame)),
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

				{notice !== null ? <Toast notice={notice} /> : null}

				{collisions.length > 0 && (
					<NoticeStrip>
						<CollisionNotice collisions={collisions} />
					</NoticeStrip>
				)}

				{pendingTrash !== null && (
					<TrashToast frames={pendingTrash.frames} page={pendingTrash.page} onUndo={undoTrash} />
				)}
				{/* The agent rail stays available beside an empty canvas. The path also
				    lets somebody use an agent in their own terminal. */}
				{/* the wait before the projection lands (#244): the field used to render
				    nothing at all until the daemon answered, so a slow reply and a project
				    with no frames in it were the same picture. */}
				<BootCurtain ready={loaded} />
				{projectEmpty && (
					<div data-canvas-empty="" className="pointer-events-none absolute inset-0">
						<ProjectEmpty
							project={project}
							root={root}
							onRename={onRename}
							onFolder={onFolder}
							focusName={focusName}
							onNameFocused={onNameFocused}
						/>
					</div>
				)}
				{/* one page nobody has written into (#265), which is a different fact
				    from an untouched project and now says so. A page of pages draws its
				    pages and never lands here. */}
				{pageEmpty && (
					<div
						data-page-empty={activePage}
						className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 pb-20"
					>
						<p className="text-muted type-value">no frames yet</p>
						<p className="text-muted type-detail">an agent writes frames/{activePage}/&lt;name&gt;/frame.tsx</p>
					</div>
				)}
				{/* nothing to arrange, nothing to walk: the tools arrive with the first frame */}
				{!projectEmpty && <CanvasTools tool={effectiveTool} onTool={setTool} />}
				{finding ? (
					<FindPalette
						frames={navigatorFrames}
						unseen={unseen}
						onPick={setFindLit}
						onClose={() => setFinding(false)}
						onLand={(name) => {
							setFinding(false);
							landOnFrame(name);
						}}
					/>
				) : null}
			</div>
			{/* the right column, and the index of what can stand in it (`dock.tsx`).
			    Properties by default, the agent one glyph below, one of them in the
			    panel at a time. */}
			<Dock
				request={agentRequest?.id}
				agentWorking={turn.phase === "playing"}
				onSettings={onSettings}
				properties={(width, shut) => (
					<PropertiesRail
						project={project}
						held={railHeld}
						rungs={railRungs}
						theme={railTheme}
						revision={railRevision}
						reloads={railReloads}
						width={width}
						onCollapse={shut}
						preview={elementDrag === null ? null : { box: elementDrag.box }}
						acts={{
							onAsk: askAgent,
							onRung: takeRung,
							onGeometry: setFrameGeometry,
							onGeometryPreview: previewFrameGeometry,
							onGeometryCommit: commitFrameGeometry,
							property: propertyControls,
							onOpenFile: (path, line) => copySourcePath(`${path}:${line}`),
							onElement: railAlter,
							onSwap: swapPicture,
						}}
					/>
				)}
				agent={(width, shut, active) => (
					<AgentRail
						active={active}
						request={agentRequest}
						permissions={permissions}
						width={width}
						onCollapse={shut}
						entries={turn.entries}
						plan={turn.plan}
						phase={turn.phase}
						elapsed={turn.elapsed}
						jump={jump}
						pointing={{ ...pointing, lit: lit ?? litOut, onLight: setLit, onDrop: dropPointed }}
						threads={{
							list: deck.threads,
							open: deck.open,
							finished: deck.finished,
							onOpen: deck.onOpen,
							onClose: deck.onClose,
							onNew: (engine) => {
								// Typing immediately after + belongs to the new chat, even while settings save.
								deck.onNew(engine);
								if (engine !== undefined) rememberEngine(engine);
							},
						}}
						install={install}
						login={deck.login}
						queued={turn.queued}
						handback={turn.handback}
						draft={turn.draft}
						attached={turn.attached}
						onAttach={turn.onAttach}
						onDraft={turn.onDraft}
						running={turn.running}
						model={model}
						limit={turn.limit}
						onSend={turn.send}
						onQueue={turn.queue}
						onUnqueue={turn.unqueue}
						onStop={turn.stop}
						onAnswer={turn.answer}
					/>
				)}
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
