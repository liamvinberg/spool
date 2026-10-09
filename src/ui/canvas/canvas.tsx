import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { SETTINGS } from "../../settings/registry";
import type { Presence, PresenceState } from "../../team-sync-protocol";
import { AgentHandoff } from "../agent-handoff";
import type {
	Camera,
	FlowEdge,
	FrameCopy,
	Geometry,
	HeldPatch,
	MovePlace,
	Place,
	ProjectedFrame,
	RungRead,
	SelectionEntry,
	SelectionPut,
	ShownSetAside,
	TextWritten,
} from "../api";
import {
	beaconTrash,
	coverUrl,
	daemonShares,
	fetchCanvasState,
	fetchFlows,
	fetchProjection,
	type MoveAsk,
	postSeen,
	postTrash,
	postWalk,
	putCanvasState,
	putCanvasView,
	putGeometry,
	putPlaces,
	putPresence,
	putSelection,
	readRungs,
	resolveFlows,
	revertPatch,
	saveCanvasState,
	setProjectThumbnail,
	subscribeSse,
	writeElement,
	writeText,
} from "../api";
import { desktopBridge } from "../desktop-bridge";
import { experimentOn } from "../experiments";
import { attachHotkeyLayer, type HotkeyHandler, runHotkey } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import { AgentIcon, FolderIcon, PropertiesIcon } from "../icons";
import { ProjectEmpty } from "../project-empty";
import { useSetting, useWriteSetting } from "../settings";
import { SHARES_CHANGED, useShares } from "../shares";
import { beforeUpdate } from "../update-lifecycle";
import { type AskEntry, waitingAsk } from "./agent-ask-view";
import { CanvasAsk } from "./agent-canvas-ask";
import { AgentCompanionLayer } from "./agent-companion-layer";
import { useAgentDefaults } from "./agent-defaults";
import { type ArmedWrite, rangeKeyOf, useLocatedMarks } from "./agent-hand";
import { useAgentModel } from "./agent-model";
import { FADE_OUT_MS, useHeld, useLeaving } from "./agent-motion";
import { frameHolding } from "./agent-nouns";
import { useAgentPermissions } from "./agent-permissions";
import { useAgentInstall } from "./agent-preflight";
import { AgentRail, type AgentRequest, type FrameJump } from "./agent-rail";
import { useAgentThreads } from "./agent-stream";
import { arrange } from "./arrange";
import { BarEnd } from "./bar-end";
import { BootCurtain } from "./boot-screen";
import { frameScheme, framesOnScreen } from "./booth-view";
import {
	type Box,
	boundsOf,
	centerOn,
	entryCamera,
	fitCamera,
	intersects,
	K_STEP,
	type NearScreen,
	toWorld,
	visibleWorldRect,
	wheelPixels,
	wheelZoomFactor,
	zoomAt,
} from "./camera";
import { type CameraStore, createCameraStore, useCameraFollow } from "./camera-store";
import { type CanvasTool, CanvasTools } from "./canvas-tools";
import { ContextMenu, contextMenuSize } from "./context-menu";
import { type Drop, dropAt, moveAsk } from "./element-move";
import { deepest, openingOf, parentOf, wordsAsk } from "./element-selection";
import { ExportDialog, type ExportFormat } from "./export-dialog";
import { FindPalette } from "./find-palette";
import { anchorKeyOf, FlowArrows, type SiteBoxesByFrame } from "./flow-arrows";
import {
	buildFramePdf,
	type CapturedFrame,
	downloadBytes,
	framesInCanvasOrder,
	pngBytesFromImageBlob,
	pngFileName,
} from "./frame-export";
import { FrameLabel, LabelField } from "./frame-label";
import { createFrameReads } from "./frame-reads";
import { FrameShell, FrameSlot, ShellClip } from "./frame-shell";
import {
	askText,
	deleteAsk,
	GONE,
	type HandEdit,
	OPENING_MS,
	REFUSAL_MS,
	type Refusal,
	refusedIn,
	restamped,
	type ShownRefusal,
	secondClick,
	stampOf,
	stampPath,
	wordsOf,
} from "./hand-edit";
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
import { useFrameLifecycle } from "./lifecycle";
import { watchMotionStrain } from "./motion-strain";
import {
	type ElementPreview,
	type FrameHover,
	HANDLE_CURSORS,
	type Handle,
	isHandle,
	NO_MARKS,
	type PickedSelection,
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
import { type PaneDef, PaneWindow, usePaneCommands } from "./pane-window";
import { PictureCanvas, PictureClaims } from "./picture-canvas";
import type { PictureFrame } from "./picture-layer";
import { createPresenceRoom, type PresenceRoom } from "./presence";
import { FollowMark } from "./presence-faces";
import { PresenceLayer } from "./presence-layer";
import { type Held, PropertiesRail, rungOf, useRungs } from "./properties-rail";
import {
	alterMessage,
	clipboardCopyAllowed,
	type EditedNode,
	editMessage,
	endEditMessage,
	type Family,
	familyMessage,
	type KinStep,
	kinMessage,
	moveMessage,
	type PickedHit,
	parseFrameMessage,
	pickKey,
	pickMessage,
	restampMessage,
	restoreMessage,
	type SessionRecord,
	type SiteAnchor,
	sessionReply,
	sharedStateMessage,
	sitesMessage,
	walkRejectionReason,
} from "./protocol";
import { useElementTree } from "./rail-elements";
import { setAsideAsk, useSetAside } from "./set-aside";
import { ShareSheet } from "./share-sheet";
import { useCanvasSharing, useSharingAvailable } from "./sharing";
import { CanvasSidebar, type FrameSpan, type RunEntry, type SelectModifiers } from "./sidebar";
import { type SnapMarks, snapEdge, snapMovedBox } from "./snap";
import { nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";
import { SYNC_CHANGED, useSyncState } from "./sync-state";
import { type Notice, Toast } from "./toast";
import { TrashToast } from "./trash-toast";
import { ATTENTION_MS, advanceDwell, looked, TICK_MS } from "./unseen";
import { useFollow, usePresenceSender } from "./use-presence";
import { WalkLayer, walksOf } from "./walk-layer";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with three tools. Select takes frames and arranges them: a
 * click takes one, a double-click goes inside it, and Command borrows Edit for
 * as long as it is held. Edit takes the elements inside them (#339): a click
 * lands on the deepest element under the pointer, and the keys step from
 * there. Hand pans, and Space borrows it while held. Every frame represented
 * by element picks stays mounted for the selection.
 */

export interface CanvasChrome {
	/**
	 * The camera itself, handed up rather than a zoom number: a number would
	 * re-render the whole window on every zoom tick, and whoever wants it can
	 * subscribe instead.
	 */
	camera: CameraStore;
	/** Who else is on a team project's canvas, for the faces at the top right; absent on a project of one's own. */
	presence?: CanvasPresence | undefined;
}

/** A team canvas's people, as the window's top right shows them and follows one. */
export interface CanvasPresence {
	room: PresenceRoom;
	page: string;
	following: string | null;
	follow: (accountId: string | null) => void;
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
	// a press in Edit (#340): a clean release is a click, and a drag moves the
	// element grabbed among its siblings, or the frame where nothing was grabbed
	| {
			kind: "element-pending";
			frame: string;
			local: Point;
			names: string[];
			origins: Map<string, Point>;
			start: Point;
	  }
	| {
			kind: "element-drag";
			frame: string;
			names: string[];
			origins: Map<string, Point>;
			start: Point;
			/** the element grabbed and its row of siblings, once the frame has said */
			grab?: { subject: PickedSelection; row: readonly PickedHit[]; at: number };
			/** where letting go would put it */
			drop?: Drop;
	  }
	// a page object's own press and drag (#265). One page rather than a set: a
	// page is picked on its own, and nothing moves with it but itself
	| { kind: "page-pending"; page: string; origin: Point; start: Point }
	| { kind: "page-move"; page: string; origin: Point; start: Point }
	| { kind: "marquee"; start: Point; base: readonly string[] }
	| { kind: "resize"; frame: string; handle: Handle; anchor: Point; origin: Box };

/** One size a resize drag worked out, and the guides that belong to it. */
interface ResizePaint {
	frame: string;
	box: Box;
	marks: SnapMarks;
}

const SETTLE_PERSIST_MS = 600;
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
/**
 * how long something waits on a reloaded document that never says loaded nor
 * broke, as one that throws while its modules evaluate never does (#340)
 */
const LOAD_WAIT_MS = 10_000;
/**
 * How far past the viewport a follower keeps drawing while the camera moves,
 * as a fraction of the viewport on every side: a pan reaches it a few frames
 * before it reaches the screen (#81).
 */
const NEAR_MARGIN = 0.25;

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
	/** the cog at the right rail's foot (#282): the sheet is the shell's, so the door only asks */
	onSettings?: (() => void) | undefined;
}) {
	/**
	 * The camera (#81): one value outside React, drawn once per animation frame
	 * by whatever follows it. A wheel tick moves it and renders nothing.
	 */
	const [camera] = useState(createCameraStore);
	const sharingAvailable = useSharingAvailable();
	const sharing = useCanvasSharing(project, sharingAvailable, camera);
	// pages shared with outsiders through spool.page (DEV-193), started from a page's right-click
	const pageShares = useMemo(() => daemonShares(project), [project]);
	const { shares: projectShares } = useShares(pageShares);
	const [sharingPage, setSharingPage] = useState<string | null>(null);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	// on the document rather than the viewport, which a booting canvas has not drawn yet
	useEffect(() => watchMotionStrain(camera, document.documentElement), [camera]);
	const [frames, setFrames] = useState<ProjectedFrame[]>([]);
	// every read of the frame list, and the covers heard between them (frame-reads.ts)
	const [frameReads] = useState(createFrameReads);
	const [edges, setEdges] = useState<FlowEdge[]>([]);
	// the threads (#34): the arrows and the docked walks, one machine setting
	// rather than a top-bar switch, default on because the map is spool's identity
	const arrowsOn = useSetting("canvas.threads") ?? SETTINGS["canvas.threads"].fallback;
	const writeSetting = useWriteSetting();
	// frame-local boxes of navigation-site elements, as each frame's shim answers
	const [siteBoxes, setSiteBoxes] = useState<SiteBoxesByFrame>({});
	const [loaded, setLoaded] = useState(false);
	/**
	 * The camera as React knows it: there from the moment it is, and moved only
	 * once it has come to rest. What is decided at rest reads this — which
	 * documents mount, where the camera is remembered — and nothing that is
	 * drawn does, because a render is far too late for a camera in motion.
	 */
	const [restCamera, setRestCamera] = useState<Camera | null>(null);
	/**
	 * Put the camera somewhere without flying there. The field only stands while
	 * there is a camera to draw it from, so arriving at one or losing it is a
	 * render, in the same commit as whatever caused it; moving one never is.
	 */
	const placeCamera = useCallback(
		(next: Camera | null) => {
			const was = camera.get();
			camera.set(next);
			if ((was === null) !== (next === null)) setRestCamera(next);
		},
		[camera],
	);
	const [tool, setTool] = useState<CanvasTool>("select");
	const [selected, setSelected] = useState<string[]>([]);
	const [picked, setPicked] = useState<PickedSelection[]>([]);
	const [entered, setEntered] = useState<string | null>(null);
	const [hovered, setHovered] = useState<FrameHover | null>(null);
	// the hover preview (#37, #339): the element a click would take
	const [preview, setPreview] = useState<ElementPreview | null>(null);
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
	// where an element being dragged would land (#340), as the line drawn there
	const [dropLine, setDropLine] = useState<{ frame: string; box: Box } | null>(null);
	// the in-place text edit that is open (#314), which is what hands the frame its pointer
	const [editing, setEditing] = useState<HandEdit | null>(null);
	// how many times the hand has saved each frame without reloading it (#314):
	// a save rewrites the very file the element was read out of, so it is a fresh
	// read too, and the read has to carry the fingerprint the next write needs
	const [saves, setSaves] = useState<Record<string, number>>({});
	const [agentRequest, setAgentRequest] = useState<AgentRequest>();
	const [agentHandoff, setAgentHandoff] = useState(false);
	// pages (#39): the named pages on disk, the one the canvas shows, and the
	// names discovery refuses to resolve
	const [pages, setPages] = useState<string[]>([]);
	const [activePage, setActivePage] = useState<string>(ROOT_PAGE);
	/**
	 * Who else is on a team project's canvas (DEV-196), as the event stream tells it, and whose view this
	 * canvas is following. A project of one's own has nobody and says nothing.
	 */
	const [presenceRoom] = useState(() => createPresenceRoom());
	const [team, setTeam] = useState(false);
	const [following, setFollowing] = useState<string | null>(null);
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
	/**
	 * The page as the picture layer draws it (#81): every frame in drawing
	 * order, each with its still's address. Which of them a DOM shell draws
	 * instead is the shells' own business (`FrameSlot`), told to the layer
	 * through these claims.
	 */
	const pictureFrames = useMemo(
		() =>
			visibleFrames.map(
				({ name, x, y, w, h, cover }): PictureFrame => ({
					name,
					x,
					y,
					w,
					h,
					still: cover === undefined ? undefined : coverUrl(project, name, cover.hash),
				}),
			),
		[visibleFrames, project],
	);
	const [pictureClaims] = useState(() => new PictureClaims());
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
	// the machine's agent choice (#361): nothing agent-shaped is drawn until it has loaded
	const agentDefaults = useAgentDefaults(project);
	const preferredEngine = agentDefaults.engine ?? undefined;
	const deck = useAgentThreads(project, preferredEngine, root);
	const turn = deck.turn;
	const permissions = useAgentPermissions(project, deck.open, turn.phase, agentDefaults.mode);
	/**
	 * A set-aside mark's Hand to agent: one press is a turn on the open thread, or the next one
	 * if a turn is running, with both sides of the file. The rail opens on it. Where the rail has
	 * nowhere to put words yet, the composer holds them for the person to send.
	 */
	const { running: turnRunning, queue: queueTurn, send: sendTurn } = turn;
	const handSetAside = useCallback(
		(mark: ShownSetAside) => {
			const text = setAsideAsk(mark);
			const took = turnRunning() ? queueTurn(text) : sendTurn(text);
			setAgentRequest({
				id: crypto.randomUUID(),
				thread: deck.open,
				...(took ? {} : { prepared: { intent: `set-aside ${mark.path}`, text, selection: [] } }),
			});
		},
		[deck.open, turnRunning, queueTurn, sendTurn],
	);
	const setAside = useSetAside(project, handSetAside);
	const syncState = useSyncState(project);
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
		// saved before the menu moves: the blank chat then follows the confirmed choice
		onEngine: (engine: AgentEngineId) =>
			agentDefaults.choose(engine).then((confirmed) => {
				if (confirmed) deck.follow();
				return confirmed;
			}),
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
	// where the camera rests, as the lifecycle's sweep reads it between renders
	const restCameraRef = useRef(restCamera);
	restCameraRef.current = restCamera;
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
	/**
	 * Whether the Edit tool is on (#339): picked, or borrowed by holding ⌘ in
	 * Select. Space borrowing the Hand does not put it down. While it is on,
	 * every live frame holds its animation and nothing reaches any of them.
	 */
	const editOn = tool === "edit" || (tool === "select" && accelDown);
	// Select and Edit both point, and everything a pointer draws — rings and
	// previews — belongs to the pair of them. Only the Hand
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
	/** the frame's answer to a delete (#317), and to a move with where the element went (#340) */
	const alterWaiters = useRef(
		new Map<number, (answer: { ok: boolean; owner: string | null; chain?: PickedHit[] }) => void>(),
	);
	/**
	 * The frames the canvas has reloaded whose new document has not said
	 * loaded yet (#340), and what waits on it: a ring put back on an element
	 * asks the document it is in, and a document still booting answers nobody.
	 */
	const reloading = useRef(new Set<string>());
	const loadWaiters = useRef(new Map<string, (() => void)[]>());
	/**
	 * The reorder in flight (#340). One move at a time, because the next one
	 * is addressed by stamps only the reloaded document has; presses made
	 * meanwhile wait their turn, each still its own write and its own step.
	 */
	const moveRun = useRef<{ busy: boolean; queue: (() => void)[]; timer?: ReturnType<typeof setTimeout> }>({
		busy: false,
		queue: [],
	});
	/**
	 * Each file as the hand's last write or step left it (#340). A move
	 * lands on a new stamp, and the selection's read of it is a round trip
	 * behind; until it catches up this is what the next move is measured
	 * against. Something else writing the file since makes it stale, which
	 * is the refusal it should be.
	 */
	const handPrints = useRef(new Map<string, string>());
	/** the frame's answer to a whole generation: children or siblings (#339) */
	const generationWaiters = useRef(new Map<number, (answer: { chain: PickedHit[]; hits: PickedHit[] }) => void>());
	// the open edit as the handlers read it, a paint earlier than the render
	const editingRef = useRef<HandEdit | null>(null);
	const endEditRef = useRef<(commit: boolean) => void>(() => {});
	/** the delete as its own refusal reaches for it: a delete that offers the call */
	const alterElementRef = useRef<
		(picks: readonly PickedSelection[], at: { sources: readonly string[]; fingerprint: string }) => void
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
	 * the render they were made in, so the ref stays the authority. The
	 * selection's read of the file is the one reader that has to re-render when
	 * it moves (#256), and a mirror is cheaper than teaching a dozen handlers to
	 * await a state write.
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
	 * A cover was written by the daemon's photo booth. The image is the frame's
	 * own state, so it is patched in place rather than held beside the projection:
	 * the hash is the address, so a new one is a new URL and the swap needs no
	 * nonce of its own.
	 */
	const noteCover = useCallback(
		(frame: string, cover: Cover) => {
			frameReads.note(frame, cover);
			setFrames((current) => {
				// The booth photographs a frame that did not change to the same bytes, so
				// the same address. A picture the canvas already shows is not worth a
				// render of the whole canvas.
				if (!current.some((entry) => entry.name === frame && entry.cover?.hash !== cover.hash)) return current;
				return current.map((entry) =>
					entry.name === frame && entry.cover?.hash !== cover.hash ? { ...entry, cover } : entry,
				);
			});
		},
		[frameReads],
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

	// A hidden hover lingers to fade its ring, and a ring fading out is nobody
	// pointing at anything (#172).
	const hoveredFrame = hovered?.visible === true ? hovered.frame : null;

	const lifecycle = useFrameLifecycle({
		framesRef,
		entered,
		selectionTargets,
		selected,
		hovered: hoveredFrame,
		// the Edit tool holds the whole field still while it is on (#319, #339)
		editing: editOn,
		cameraRef: restCameraRef,
		viewportRef,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;
	// a document is booting from its mount to its loaded report; the picture
	// layer holds the rest of the page's stills back until none is (#81)
	const documentsBooting = useMemo(
		() =>
			visibleFrames.some(
				(frame) => (lifecycle.states[frame.name] ?? "picture") !== "picture" && !lifecycle.ready.has(frame.name),
			),
		[visibleFrames, lifecycle.states, lifecycle.ready],
	);
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
	 * The held element's own read, as the handlers see it.
	 *
	 * Filled from the selection's read further down and mirrored here, because
	 * the handlers are written before it and a write has to be measured against
	 * the file the element was read out of rather than against a render.
	 */
	const heldReadRef = useRef<RungRead | undefined>(undefined);
	/** the selection's read as the handlers see it, a paint earlier than the render */
	const railRungsRef = useRef<(RungRead | undefined)[] | null>(null);

	const reloadFrameDocument = useCallback(
		(frame: string) => {
			// a reload the canvas caused holds its outgoing document on screen
			// until the new one reports arrived (#253's no blink); the timer is the
			// bound, because a document that never arrives must not leave a dead
			// one standing in front of it
			const was = docNoncesRef.current[frame] ?? 0;
			reloading.current.add(frame);
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
			setPreview((current) => (current?.frame === frame ? null : current));
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
			void readRungs(project, frame, [own.source]).then((reads) => {
				if (saved.current.get(frame) !== own || reads?.[0]?.fingerprint === own.fingerprint) return;
				reloadOrHold(frame);
			});
		},
		[project, reloadOrHold],
	);

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
				for (const frame of ordered) {
					const image = await capturePng(frame);
					if (format === "png") downloadBytes(image.png, "image/png", pngFileName(image.name));
					else captured.push(image);
				}

				if (format === "pdf") {
					downloadBytes(await buildFramePdf(captured), "application/pdf", `${project}.pdf`);
				}

				setExportDialog(null);
				setExportReturnMenu(null);
				setNotice({
					kind: "success",
					message:
						format === "pdf"
							? `Exported ${project}.pdf`
							: ordered.length === 1
								? `Exported ${pngFileName(first.name)}`
								: `Exported ${ordered.length} PNG images`,
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
		const ticket = frameReads.ask();
		const projection = await fetchProjection(project);
		if (projection === undefined) return;
		const projected = frameReads.settle(ticket, projection.frames);
		// a read asked later has landed already, and it knows more than this one
		if (projected === undefined) return;
		setFrames(projected);
		setPages(projection.pages);
		// lenient on the way in, like every other read of a durable: a projection
		// with nothing to say about places leaves the field with no pages on it
		// rather than with nothing on it
		setPlaces(projection.places ?? {});
		setLoaded(true);
	}, [frameReads, project]);

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
			const cam = camera.get();
			const viewport = viewportRef.current;
			if (cam === null || viewport === null) return;
			const vw = viewport.clientWidth;
			const vh = viewport.clientHeight;
			const looking = framesRef.current
				.filter((frame) => unseenRef.current.has(frame.name) && looked(frame, cam, vw, vh))
				.map((frame) => frame.name);
			const crossed = advanceDwell(dwell.current, looking);
			if (crossed.length > 0) markRead(crossed);
		}, TICK_MS);
		return () => window.clearInterval(timer);
	}, [unseen.size, markRead, camera]);

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

	// boot: stored cameras + active page, the
	// projection, the link graph — the canvas reopens on the page it left (#39)
	useEffect(() => {
		let alive = true;
		void (async () => {
			const state = await fetchCanvasState(project);
			if (alive && state !== undefined) {
				cameras.current = camerasFromState(state);
				const page = state.activePage ?? ROOT_PAGE;
				setActivePage(page);
				const stored = cameras.current[page];
				if (stored !== undefined) placeCamera(stored);
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
	}, [project, refetchFrames, refetchFlows, placeCamera]);

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

	// the blocks the agent's writes changed, as documents measure them (#214, #366): the
	// located marks its companions ring. The arms are a ref here because `requestSiteBoxes`
	// reads them from inside a message handler
	const { marks: locatedMarks, strike } = useLocatedMarks(project, turn, armedWrites);
	// where each working agent is on the canvas (#366). A call on a file in a frame's own
	// subfolder names that subfolder (#336): the agent is at the frame holding it
	const companions = useMemo(
		() =>
			turn.companions.map((one) =>
				one.frame === null ? one : { ...one, frame: frameHolding(one.frame, reach.have) },
			),
		[turn.companions, reach],
	);
	/** the agent's rail is on screen; shut, an ask stands on the canvas under its frame */
	const [railShown, setRailShown] = useState(true);
	const askFooted = !railShown && turn.phase === "asking";
	/**
	 * The ask that stands on the canvas, and what it hangs from: the frame its agent is at,
	 * or the spot reserved for a designer's frame before it has one. None where it is about
	 * neither.
	 */
	const footedAsk = useMemo(() => {
		if (!askFooted) return null;
		const entry = turn.entries.find(
			(one): one is AskEntry => one.kind === "ask" && waitingAsk(one) && one.request !== null,
		);
		if (entry === undefined) return null;
		const by = companions.find(
			(one) => one.key === (entry.delegation ?? "") && (one.frame !== null || one.spot !== null),
		);
		if (by === undefined) return null;
		return { entry, frame: by.frame, spot: by.spot };
	}, [askFooted, turn.entries, companions]);
	// answered, or the rail opened, the card fades where it stood rather than vanishing
	const footedShown = useLeaving(footedAsk !== null, FADE_OUT_MS);
	const footedLast = useHeld(footedAsk);
	const standingAsk = footedShown === null ? null : (footedAsk ?? footedLast);

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
		if (restCamera !== null || !loaded) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		const boxes = fieldBoxes();
		placeCamera(
			boxes.length === 0
				? { x: 0, y: 0, k: 1 }
				: fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight),
		);
	}, [restCamera, loaded, fieldBoxes, placeCamera]);

	/**
	 * The camera a page switch lands on, held until the switch has rendered.
	 *
	 * The page is React's and the camera is not, so set together they would be
	 * drawn apart: the camera at the next animation frame and the page whenever
	 * its render runs, which a switch caused by a frame's message leaves for a
	 * later task. Placed from here, the camera moves in the commit that swaps the
	 * field, and the frame that draws it draws both. A landing that goes on to a
	 * frame flies there from here too, so its first frame is already on the page
	 * it arrived on. Declared before the shelf's fit, which has to have the last
	 * word on a shelf.
	 */
	const arrival = useRef<{ page: string; camera: Camera | null; then?: Camera } | null>(null);
	useLayoutEffect(() => {
		const landing = arrival.current;
		if (landing === null || landing.page !== activePage) return;
		arrival.current = null;
		placeCamera(landing.camera);
		if (landing.then !== undefined) camera.fly(landing.then);
	}, [activePage, placeCamera, camera]);

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
		placeCamera(fitCamera(boundsOf(fieldBoxes()), viewport.clientWidth, viewport.clientHeight));
	}, [loaded, activePage, fieldBoxes, placeCamera]);

	// --- camera ---------------------------------------------------------------

	/**
	 * What the camera can see (`NearScreen`), asked by the followers there is
	 * one of per frame while it moves. The viewport's size is kept as the
	 * observer last measured it rather than read when asked: it is asked in the
	 * middle of a frame's writes, where reading layout would force it.
	 */
	const viewSize = useRef({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const measure = () => {
			viewSize.current = { width: el.clientWidth, height: el.clientHeight };
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	const seen = useRef<{ camera: Camera; rect: Box } | null>(null);
	const near = useCallback<NearScreen>((at, box) => {
		// one rectangle per drawn camera, however many followers ask about it
		if (seen.current?.camera !== at) {
			const { width, height } = viewSize.current;
			seen.current = { camera: at, rect: visibleWorldRect(at, width, height, NEAR_MARGIN) };
		}
		return intersects(box, seen.current.rect);
	}, []);

	const viewportCenter = useCallback((): Point => {
		const el = viewportRef.current;
		return el === null ? { x: 0, y: 0 } : { x: el.clientWidth / 2, y: el.clientHeight / 2 };
	}, []);

	const zoomAtPoint = useCallback(
		(cx: number, cy: number, factor: number, animate = false) => {
			const cam = camera.get();
			if (cam === null) return;
			const next = zoomAt(cam, cx, cy, factor);
			if (animate) camera.fly(next, 140);
			else camera.set(next);
		},
		[camera],
	);

	/** Move the field by a screen distance at the same zoom: every pan is this. */
	const panBy = useCallback(
		(dx: number, dy: number) => {
			const cam = camera.get();
			if (cam !== null) camera.set({ ...cam, x: cam.x + dx, y: cam.y + dy });
		},
		[camera],
	);

	const zoomFit = useCallback(() => {
		const viewport = viewportRef.current;
		const boxes = fieldBoxes();
		if (viewport === null || boxes.length === 0) return;
		camera.fly(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
	}, [fieldBoxes, camera]);

	const resetZoom = useCallback(() => {
		const cam = camera.get();
		if (cam === null) return;
		const c = viewportCenter();
		const w = toWorld(c, cam);
		camera.fly({ k: 1, x: c.x - w.x, y: c.y - w.y });
	}, [viewportCenter, camera]);

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
		const cam = camera.get();
		if (cam === null) return undefined;
		return {
			page: activePageRef.current,
			camera: { x: cam.x, y: cam.y, k: cam.k },
			entered: enteredRef.current,
			selected: [...selectedRef.current],
			picked: [...pickedRef.current],
		};
	}, [camera]);

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
			const cam = camera.get();
			if (viewport === null || cam === null) return;
			const next = entryCamera(cam, frame, viewport.clientWidth, viewport.clientHeight);
			// standing still is not a flight: a 220ms animation to where you
			// already are would fight a wheel that arrives inside it
			if (next.x !== cam.x || next.y !== cam.y || next.k !== cam.k) camera.fly(next);
		},
		[camera],
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

	/**
	 * Picking a tool (#321). The Edit tool is never inside a frame: taking it
	 * while one is live steps back out of it, holding that frame as the
	 * selection, so ⏎ goes on from there into its elements (#339).
	 */
	const chooseTool = useCallback(
		(next: CanvasTool) => {
			if (next === "edit" && enteredRef.current !== null) exitEntered(true);
			setTool(next);
		},
		[exitEntered],
	);

	const toggleArrows = useCallback(() => void writeSetting("canvas.threads", !arrowsOn), [writeSetting, arrowsOn]);

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
	 * Frames the rail renamed, moved, or carried with a page (#336): a frame is
	 * named by its path, so the selection follows it to its new name rather than
	 * holding one nothing answers to.
	 */
	const followRenamedFrames = useCallback((carry: (name: string) => string) => {
		setSelected((current) => {
			const next = current.map(carry);
			return sameNames(current, next) ? current : next;
		});
	}, []);

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
	 * is open. From a refusal it opens holding the change the hand tried (#314,
	 * #339), whatever the gesture was, and sends nothing until the person does.
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
				...(from === undefined
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
	 * frame first, because it is newer than any read, then the elements of the
	 * selection's own read. Nothing when neither knows the file, which leaves
	 * the daemon's fresh read of it the first anybody has seen.
	 */
	const fingerprintFor = useCallback((frame: string, stamp: string): string | undefined => {
		const path = stampPath(stamp);
		const own = saved.current.get(frame);
		if (own !== undefined && stampPath(own.source) === path) return own.fingerprint;
		for (const read of railRungsRef.current ?? []) {
			if (read?.path === path && read.fingerprint !== undefined) return read.fingerprint;
		}
		return undefined;
	}, []);

	/** Whether a write landed outside the frame's own folder: in a shared definition's file (#318). */
	const sharedWrite = useCallback((frame: string, path: string): boolean => {
		const held = allFramesRef.current.some((entry) => entry.name === frame);
		return !held || !path.startsWith(`design/${frameFolderRel(frame)}`);
	}, []);

	/**
	 * The other frames rendering a shared file the hand is about to write
	 * (#318), read off the element before the gesture. Each is showing a document
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
	 * file is a fresh read for the element, the stamps a save shifted along its
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
		): void => {
			setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
			handPrints.current.set(written.path, written.fingerprint);
			if (written.shifts === null || !frameHeld(frame)) {
				saved.current.delete(frame);
				holdNext.current.add(frame);
				reloadFrameDocument(frame);
				return;
			}
			saved.current.set(frame, {
				source: readAt,
				fingerprint: written.fingerprint,
				own: !sharedWrite(frame, written.path),
			});
			const shifts = written.shifts;
			if (!shifts.some((shift) => shift.delta !== 0)) return;
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
		},
		[frameHeld, holdChain, reloadFrameDocument, sharedWrite],
	);

	/**
	 * What every hand write does with its answer (#314–#318).
	 *
	 * The gestures differ in what they send and in what they do with a
	 * write that landed; everything between was the same thirty lines written
	 * out for each. The readers held before the write go free the moment it
	 * turns out not to have reached them; a refusal is shown where the gesture
	 * was, and one about a file that moved underneath re-reads the element; a
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
				/** the element the write was about, which is what walking its entry points at again (#322) */
				selector: string;
				/** the stamp the entry re-reads its element at, given the file the write landed in */
				readAt: (path: string) => string;
				refuse: (refusal: Refusal) => void;
				/** the sentence for a write that never reached the daemon at all */
				failed: string;
				/** what this gesture's entry carries beyond the patch */
				entry?: Pick<Extract<HistoryEntry, { kind: "hand" }>, "picks" | "movedTo">;
				/** the write landed */
				onLanded?: () => void;
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
				// a file that moved underneath is a fresh read of the element
				if (written.refusal.code === "stale-file") {
					setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
				}
				return;
			}
			const shared = sharedWrite(frame, written.path);
			if (!shared || wroteNothing(written.undo)) releaseReaders(frame, readers);
			if (wroteNothing(written.undo)) return;
			const readAt = about.readAt(written.path);
			landed(frame, readAt, written);
			recordEntry({
				kind: "hand",
				frame,
				selector: about.selector,
				edit: about.edit,
				patch: written.undo,
				readAt,
				...(about.entry ?? {}),
				...(shared ? { frames: readers } : {}),
			});
			about.onLanded?.();
			if (written.uncaught === true) {
				setNotice({ kind: "success", message: "No history here: nothing is catching hand edits" });
			}
		},
		[landed, recordEntry, releaseReaders, sharedWrite],
	);

	/**
	 * Run once the frame's document is there to ask (#340): now, or when a
	 * reload the canvas caused has loaded. A frame with no document mounted
	 * has nothing to wait for, and one that broke says so instead of loaded.
	 *
	 * The bound is for a document that says neither, not for a slow one: on a
	 * loaded machine a document boots for longer than its held paint stands,
	 * and one asked before it has loaded answers that the element is gone,
	 * which drops the selection to the frame and turns the next arrow into a
	 * nudge of the whole frame.
	 */
	const whenLoaded = useCallback((frame: string, then: () => void) => {
		if (!reloading.current.has(frame) || !iframes.current.has(frame)) {
			then();
			return;
		}
		let ran = false;
		const once = () => {
			if (ran) return;
			ran = true;
			then();
		};
		loadWaiters.current.set(frame, [...(loadWaiters.current.get(frame) ?? []), once]);
		setTimeout(once, LOAD_WAIT_MS);
	}, []);

	/** The DOM half of undo and redo: the frame puts one edit's words back itself, and says whether it could. */
	const restoreWords = useCallback(
		(frame: string, edit: number, way: "before" | "after", then: (ok: boolean) => void) => {
			const target = iframes.current.get(frame)?.contentWindow;
			// a document still booting holds no edit of the one before it (#340)
			if (target == null || reloading.current.has(frame)) {
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
	 * The keyboard's own walk along the ancestry, put here by its own definition
	 * further down: undo runs before it in the file and needs it (#322).
	 */
	const walkKinRef = useRef<(frame: string, selector: string, step: KinStep, gone?: () => void) => void>(() => {});
	/** the same walk for a whole multi-pick, which is what a step about several puts back (#323) */
	const repickRef = useRef<(frame: string, selectors: readonly string[], gone: () => void) => void>(() => {});

	/**
	 * One hand entry, run either way (#314, #317). The patch goes back over the
	 * wire, the daemon re-checks the fingerprint, and what comes back is the
	 * inverse this entry carries from here on. A refusal means the file moved
	 * since — the step is dropped, and said so. The DOM half is the frame's own:
	 * it puts the words or the elements back on its nodes; one that no longer
	 * holds them reloads behind its hold.
	 */
	const walkHand = useCallback(
		(entry: Extract<HistoryEntry, { kind: "hand" }>, way: Way, taking: History) => {
			/**
			 * The step is in the document: the ring goes back on the element it
			 * was about (#322), its box read again because a word put back moves
			 * the box it is drawn in. A step that took the element
			 * away has nothing to point at, and the frame is what is left held.
			 */
			const lost = () => {
				holdChain(null);
				setPicked([]);
				setSelected([entry.frame]);
			};
			const rering = () =>
				whenLoaded(entry.frame, () => {
					const held = entry.picks;
					if (held !== undefined && held.length > 1) {
						repickRef.current(entry.frame, held, lost);
						return;
					}
					// a move's element stands where the step left it: back where it
					// was for an undo, where it went for a redo (#340)
					const selector = way === "redo" && entry.movedTo !== undefined ? entry.movedTo : entry.selector;
					walkKinRef.current(entry.frame, selector, "self", lost);
				});
			const readers = entry.frames ?? [];
			holdReaders(entry.frame, readers);
			void revertPatch(project, entry.patch).then((reverted) => {
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
				updateHistory(amend(history.current, way, { ...entry, patch: reverted.undo }));
				landed(entry.frame, entry.readAt, reverted);
				const held = (ok: boolean) => {
					if (!ok && saved.current.has(entry.frame)) {
						saved.current.delete(entry.frame);
						holdNext.current.add(entry.frame);
						reloadFrameDocument(entry.frame);
						// the document is being replaced: its own arrival is what the
						// ring waits on, not this answer
						return;
					}
					rering();
				};
				restoreWords(entry.frame, entry.edit, way === "undo" ? "before" : "after", held);
			});
		},
		[
			holdChain,
			holdReaders,
			landed,
			project,
			releaseReaders,
			reloadFrameDocument,
			restoreWords,
			updateHistory,
			whenLoaded,
		],
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
		// what would have cleared this. Left standing it latches the rings off
		// for the rest of the session.
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
			const live = () => pickGen.current === gen;
			waiters.set(id, (value) => {
				if (live()) apply(value);
			});
			target.postMessage(request(id), "*");
			setTimeout(() => {
				if (waiters.delete(id) && live()) onSilence?.();
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

	/**
	 * The ancestry at a frame-local point: what every pointer verb asks for.
	 *
	 * A verb that ends in a selection asks for what only a selection needs
	 * along with it (#323, #324): which row of a list each element is, and which
	 * sides its content spills past. A hover asks for a chain many times a
	 * second and needs none of it, so it does not.
	 */
	const beginPick = useCallback(
		(frame: string, local: Point, apply: (chain: PickedHit[]) => void, onSilence?: () => void, selects = true) => {
			askChain(frame, (id) => pickMessage(local.x, local.y, id, selects), apply, onSilence);
		},
		[askChain],
	);

	const applyPick = useCallback(
		(frame: string, chain: PickedHit[], hit: PickedHit | undefined) => {
			if (hit === undefined) return; // frame background: the frame stays the selection
			const held = [{ frame, ...hit }];
			holdChain({ frame, chain });
			setSelected([]);
			setPicked(held);
			// The next step reads where the selection stands off this ref, and it
			// is often decided before React has committed the last one — a key
			// pressed on the heels of a click (#323). The chain beside it is
			// already written here and now for the same reason.
			pickedRef.current = held;
		},
		[holdChain],
	);

	/**
	 * The frame held on its own, which is what a step off the top of the
	 * elements lands on, and what a click on the frame's background takes.
	 */
	const holdFrame = useCallback(
		(frame: string) => {
			holdChain(null);
			setPicked([]);
			setSelected([frame]);
		},
		[holdChain],
	);

	/**
	 * A click in Edit (#339), and ⌘-click from Select: the deepest element
	 * under the pointer, in one go. The frame's background, and a frame that
	 * never answers, is the frame itself.
	 */
	const selectDeepestAt = useCallback(
		(frame: string, local: Point) => {
			beginPick(
				frame,
				local,
				(chain) => {
					const target = deepest(chain);
					if (target === undefined) holdFrame(frame);
					else applyPick(frame, chain, target);
				},
				() => holdFrame(frame),
			);
		},
		[beginPick, applyPick, holdFrame],
	);

	/**
	 * A whole generation at once (#339): the children of a group, which Enter
	 * and a double-click take, or every sibling of what is held, which ⌘A
	 * takes. An empty selector is the frame, whose children are its top-level
	 * elements. The frame says who they are; a generation of nobody leaves
	 * the selection where it was.
	 */
	const selectGeneration = useCallback(
		(frame: string, selector: string, of: Family) => {
			cancelPicks();
			askFrame(
				frame,
				generationWaiters.current,
				(id) => familyMessage(selector, of, id),
				({ chain, hits }) => {
					const anchor = hits[hits.length - 1];
					if (anchor === undefined) return;
					const held = hits.map((hit) => ({ frame, ...hit }));
					holdChain({ frame, chain: [...chain, anchor] });
					setSelected([]);
					setPicked(held);
					pickedRef.current = held;
				},
			);
		},
		[askFrame, cancelPicks, holdChain],
	);

	/**
	 * The keyboard's own step (#254): kinship instead of position. An empty
	 * selector is the boot root, so a `child` step off the frame itself lands
	 * on its root element. An element that does not exist answers with no
	 * chain, and the selection stays where it was unless the caller says what
	 * to do then — which undo does, because a step that took the element away
	 * has nothing left to point at (#322).
	 */
	const walkKin = useCallback(
		(frame: string, selector: string, step: KinStep, gone?: () => void) => {
			cancelPicks();
			askChain(
				frame,
				(id) => kinMessage(selector, step, id, true),
				(chain) => {
					const target = chain[chain.length - 1];
					if (target === undefined) {
						gone?.();
						return;
					}
					applyPick(frame, chain, target);
				},
			);
		},
		[askChain, applyPick, cancelPicks],
	);
	walkKinRef.current = walkKin;

	/**
	 * Every element one step was about, held again (#323).
	 *
	 * A multi-pick delete is one write and one press of undo, so walking it
	 * back has to put the whole selection back rather than one member of it.
	 * Each selector is asked for on its own, because only the frame knows where
	 * the nodes went back to; the last answer's ancestry is the chain the
	 * selection climbs from and the rail reads, which is the anchor a
	 * multi-pick has anyway. A selection nothing answered for is a frame with
	 * nothing in it held.
	 */
	const repick = useCallback(
		(frame: string, selectors: readonly string[], gone: () => void) => {
			cancelPicks();
			const found: { hit: PickedHit; chain: PickedHit[] }[] = [];
			let left = selectors.length;
			const done = () => {
				const last = found[found.length - 1];
				if (last === undefined) {
					gone();
					return;
				}
				holdChain({ frame, chain: last.chain });
				setSelected([]);
				setPicked(found.map((one) => ({ frame, ...one.hit })));
			};
			for (const selector of selectors) {
				const took = (chain: PickedHit[]) => {
					const target = chain[chain.length - 1];
					if (target !== undefined) found.push({ hit: target, chain });
					left -= 1;
					if (left === 0) done();
				};
				askChain(
					frame,
					(id) => kinMessage(selector, "self", id, true),
					took,
					() => took([]),
				);
			}
		},
		[askChain, cancelPicks, holdChain],
	);
	repickRef.current = repick;

	/** Tab and ⇧Tab: round the siblings of the one element held. */
	const walkSibling = useCallback(
		(step: "next" | "previous"): boolean => {
			const held = pickedRef.current.length === 1 ? pickedRef.current[0] : undefined;
			if (enteredRef.current !== null || held === undefined) return false;
			walkKin(held.frame, held.selector, step);
			return true;
		},
		[walkKin],
	);

	/**
	 * Esc and ⇧⏎ (#339): the parent of what is held, element → parent → … →
	 * frame → nothing. Several held elements climb together to the parent
	 * they share, and to their frames where they share none. False when there
	 * was nothing to climb, which is what lets Esc carry on down its own list
	 * of meanings.
	 */
	const selectParent = useCallback((): boolean => {
		const held = pickedRef.current;
		if (held.length > 0) {
			const up = parentOf({ picks: held, chain: pickedChain.current });
			if (up === undefined) {
				holdChain(null);
				setPicked([]);
				setSelected([...new Set(held.map((pick) => pick.frame))]);
			} else if (up.hit === null) holdFrame(up.frame);
			else {
				holdChain({ frame: up.frame, chain: [...up.chain] });
				setSelected([]);
				setPicked([{ frame: up.frame, ...up.hit }]);
			}
			return true;
		}
		if (selectedRef.current.length > 0) {
			setSelected([]);
			return true;
		}
		return false;
	}, [holdChain, holdFrame]);

	/**
	 * The element tree in the pages rail (#342): a third reader of this one
	 * selection, beside the outline and the name label. A row click is the
	 * selection a canvas click makes, and the keyboard stays the canvas's, so
	 * every Edit key works whichever of them made it. Hovering a row outlines
	 * its element the way hovering the canvas does.
	 */
	const treeHover = useRef<string | null>(null);
	const elementTree = useElementTree({
		editOn: editOn && experimentOn("element-tree"),
		frame: picked.at(-1)?.frame ?? (selected.length === 1 ? (selected[0] ?? null) : null),
		held: picked,
		frameHeld: picked.length === 0 && selected.length === 1,
		post: (frame, message) => {
			const target = iframes.current.get(frame)?.contentWindow;
			target?.postMessage(message, "*");
			return target != null;
		},
		onSelect: (frame, selector) => {
			walkKin(frame, selector, "self");
			viewportRef.current?.focus({ preventScroll: true });
		},
		onHover: (frame, selector) => {
			treeHover.current = selector;
			if (selector === null) {
				setPreview(null);
				return;
			}
			askChain(
				frame,
				(id) => kinMessage(selector, "self", id),
				(chain) => {
					const target = chain.at(-1);
					if (treeHover.current !== selector) return;
					setPreview(
						target === undefined
							? null
							: {
									frame,
									selector: target.selector,
									rect: target.rect,
									...(target.rects === undefined ? {} : { rects: target.rects }),
									radius: target.radius,
								},
					);
				},
			);
		},
	});
	const elementTreeRef = useRef(elementTree);
	elementTreeRef.current = elementTree;

	/** ⌘A (#339): every sibling of the element held, and the element with them. */
	const selectSiblings = useCallback((): boolean => {
		const anchor = pickedRef.current[pickedRef.current.length - 1];
		if (enteredRef.current !== null || anchor === undefined) return false;
		selectGeneration(anchor.frame, anchor.selector, "siblings");
		return true;
	}, [selectGeneration]);

	// --- the hand's refusals -----------------------------------------------------

	/**
	 * The refusal note (#339): why the gesture just tried does not apply, said
	 * under the element it was about, with "Ask the agent" carrying what was
	 * tried. Every refusal a hand meets comes through here — ⌫, Enter on words,
	 * and a move once there is one — and never goes to the notice strip. It
	 * goes by itself after `REFUSAL_MS`, or when the selection moves.
	 */
	const showRefusal = useCallback((shown: ShownRefusal) => {
		setRefused(shown);
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
	 * The text gesture (#255): the caret in an element's own words, at once
	 * (#314) — where the pointer was, or after the words when the keyboard
	 * opened them (`null`). Nothing is asked first, with one exception: where
	 * the selection's read of the file has already said a hand cannot write
	 * these words (#339), that is said on the element instead of opening them.
	 * Otherwise the frame makes the element editable the moment the message
	 * lands, and whether the file will take the words is the daemon's answer
	 * when the edit ends. The fingerprint the write will carry is the one the
	 * selection's read holds for this very element, when that read has landed.
	 */
	const beginTextEdit = useCallback(
		(pick: PickedSelection, local: Point | null) => {
			const open = editingRef.current;
			if (open?.frame === pick.frame && open.selector === pick.selector) return;
			const refuse = (refusal: Refusal) =>
				showRefusal({ frame: pick.frame, selector: pick.selector, refusal, asked: wordsAsk(pick) });
			const stamp = stampOf(pick);
			if (typeof stamp !== "string") {
				refuse(stamp);
				return;
			}
			const read = heldReadRef.current;
			const opening = openingOf(pick, read);
			if (opening.kind === "refused") {
				refuse(opening.refusal);
				return;
			}
			const target = iframes.current.get(pick.frame);
			if (target?.contentWindow == null) return;
			const id = ++pickSeq.current;
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
			target.contentWindow.postMessage(editMessage(pick.selector, local?.x ?? null, local?.y ?? null, id), "*");
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
	 * Enter and a double-click on one element (#339): its words where it has
	 * words of its own, and its children where it is a group.
	 */
	const openElement = useCallback(
		(pick: PickedSelection, local: Point | null) => {
			if (pick.words === true) beginTextEdit(pick, local);
			else selectGeneration(pick.frame, pick.selector, "children");
		},
		[beginTextEdit, selectGeneration],
	);

	/**
	 * Enter, from the keyboard (#339): the words or the children of the one
	 * element held, or the top-level elements of the one frame held — which
	 * is how a person with no pointer gets from a frame into it. It says
	 * whether it had anything to act on, which is what lets ⏎ go on meaning
	 * everything else it means when it did not.
	 */
	const openHeld = useCallback((): boolean => {
		if (enteredRef.current !== null || editingRef.current !== null) return false;
		const picks = pickedRef.current;
		const only = picks.length === 1 ? picks[0] : undefined;
		if (only !== undefined) {
			openElement(only, null);
			return true;
		}
		if (picks.length > 1) return false;
		const frame = selectedRef.current.length === 1 ? selectedRef.current[0] : undefined;
		if (frame === undefined) return false;
		selectGeneration(frame, "", "children");
		return true;
	}, [openElement, selectGeneration]);

	/** A double-click in Edit (#339): the deepest element under it, opened. */
	const openAt = useCallback(
		(frame: string, local: Point) => {
			beginPick(frame, local, (chain) => {
				const target = deepest(chain);
				if (target === undefined) return;
				const open = editingRef.current;
				if (open?.frame === frame && open.selector === target.selector) return;
				applyPick(frame, chain, target);
				openElement({ frame, ...target }, local);
			});
		},
		[applyPick, beginPick, openElement],
	);

	/**
	 * F2 (#323): the words of the one element held, and nothing else. The
	 * rename key the sidebar already uses, on the element rather than on a row.
	 */
	const openWords = useCallback((): boolean => {
		if (enteredRef.current !== null || editingRef.current !== null) return false;
		const only = pickedRef.current.length === 1 ? pickedRef.current[0] : undefined;
		if (only === undefined || only.words !== true) return false;
		beginTextEdit(only, null);
		return true;
	}, [beginTextEdit]);

	/**
	 * The edit has ended (#314). The frame already shows the words, so the
	 * ring is re-read off the element they are drawn in, and a commit that
	 * changed them is one write in the background. A refusal puts the words
	 * back on the element and sits under it with the reason and the door to
	 * the agent; a file that moved underneath is a fresh read of the element too.
	 */
	const finishEdit = useCallback(
		(held: HandEdit, commit: boolean, nodes: readonly EditedNode[], owner: string | null) => {
			setEdit(null);
			viewportRef.current?.focus();
			// the box the words are drawn in moved with them, so the ring is
			// re-read off the element itself — while it is still the one held: a
			// click that ended this edit has already moved the selection on
			const stillHeld = pickedRef.current.find(
				(pick) => pick.frame === held.frame && pick.selector === held.selector,
			);
			if (stillHeld !== undefined) walkKin(held.frame, held.selector, "self");
			const attempted = wordsOf(nodes);
			if (!commit || attempted === held.start) return;
			const read = heldReadRef.current;
			const fingerprint = held.fingerprint ?? (read?.source === held.source ? read.fingerprint : undefined);
			const refuse = (refusal: Refusal) => {
				restoreWords(held.frame, held.id, "before", () => {});
				// on the element, and only there: once the selection has moved on
				// there is nothing to draw it under, and the words simply go back
				showRefusal({
					frame: held.frame,
					selector: held.selector,
					refusal,
					asked: `Change the words of the ${stillHeld?.tag ?? "element"}`,
					attempted,
				});
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
					selector: held.selector,
					readers,
					edit: held.id,
					// the stamp in the file that was written: the element's own, or
					// the call site's when the words were supplied there
					readAt: (path) => (path === stampPath(held.source) ? held.source : owner) ?? held.source,
					refuse,
					failed: "the words did not reach the file",
				});
			});
		},
		[fingerprintFor, holdReaders, project, restoreWords, setEdit, settled, showRefusal, walkKin],
	);

	// --- delete (#317) ------------------------------------------------------------

	/**
	 * What the hand holds once an element is gone: its parent, or the frame
	 * when it had none. Never nothing — a frame the hand is still in is
	 * what keeps its own save from reloading it out from under the gesture.
	 */
	const holdParent = useCallback(
		(pick: PickedSelection) => {
			const up = parentOf({ picks: [pick], chain: pickedChain.current });
			if (up !== undefined && up.hit !== null) {
				holdChain({ frame: up.frame, chain: [...up.chain] });
				setPicked([{ frame: up.frame, ...up.hit }]);
				return;
			}
			holdChain(null);
			setPicked([]);
			setSelected([pick.frame]);
		},
		[holdChain],
	);

	/**
	 * One delete, in the frame and then in the file.
	 *
	 * The frame changes first and answers with whether it could and with the
	 * call one owner up — the only place that knows it. Then one write in the
	 * background, addressed by the stamp and measured against the file the
	 * element was read out of. A refusal puts the document back exactly as it was and
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
			picks: readonly PickedSelection[],
			at: {
				sources: readonly string[];
				fingerprint: string;
				item?: { source: string; index: number; fingerprint: string };
			},
		) => {
			const pick = picks[0];
			const source = at.sources[0];
			if (pick === undefined || source === undefined) return;
			// One row of a list goes as the row (#324): the file loses the array
			// entry, and the document loses that entry's own element rather than
			// the one under the pointer, which is an element inside it.
			const gone =
				at.item !== undefined && pick.item !== undefined ? { ...pick, selector: pick.item.selector } : pick;
			const target = iframes.current.get(pick.frame)?.contentWindow;
			if (target == null) return;
			const id = ++pickSeq.current;
			setRefused(null);
			const asked = deleteAsk(picks.map((held) => held.tag));
			const refuse = (refusal: Refusal, instead?: ShownRefusal["instead"]) => {
				restoreWords(pick.frame, id, "before", () => {});
				showRefusal({
					frame: pick.frame,
					selector: pick.selector,
					refusal,
					asked,
					...refusedIn(refusal, source),
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
				if (picks.length !== 1 || refusal.code !== "whole-return" || call === null) {
					return undefined;
				}
				const fingerprint = fingerprintFor(pick.frame, call);
				if (fingerprint === undefined) return undefined;
				return {
					says: "Delete the call",
					act: () => alterElementRef.current(picks, { sources: [call], fingerprint }),
				};
			};
			alterWaiters.current.set(id, ({ ok, owner }) => {
				if (!ok) {
					showRefusal({ frame: pick.frame, selector: pick.selector, refusal: GONE, asked });
					return;
				}
				// the element's file may be a shared definition's; whether the change
				// lands there or at a call site in this frame's own file is the daemon's
				// to say, so its readers are held now and let go if they did not (#318)
				const read = heldReadRef.current;
				const readers = read?.source === source ? (read.shared?.frames ?? []) : [];
				holdReaders(pick.frame, readers);
				void writeElement(project, pick.frame, {
					act: "delete",
					sources: [...at.sources],
					fingerprint: at.fingerprint,
					...(at.item === undefined ? {} : { item: at.item }),
				}).then((written) => {
					settled(written, {
						frame: pick.frame,
						selector: pick.selector,
						readers,
						edit: id,
						readAt: () => source,
						refuse: (refusal) => refuse(refusal, insteadDeleteCall(refusal, owner)),
						failed: "the change did not reach the file",
						// the elements are gone: the parent of the first is what the
						// hand holds now, and it holds it only once the write has
						// actually landed, so a refusal still has them to sit under
						...(picks.length === 1 ? {} : { entry: { picks: picks.map((held) => held.selector) } }),
						onLanded: () => holdParent(gone),
					});
				});
			});
			target.postMessage(
				alterMessage(id, at.item === undefined ? picks.map((held) => held.selector) : [gone.selector], "delete"),
				"*",
			);
			setTimeout(() => {
				if (alterWaiters.current.delete(id)) {
					showRefusal({ frame: pick.frame, selector: pick.selector, refusal: GONE, asked });
				}
			}, PICK_REPLY_MS);
		},
		[fingerprintFor, holdParent, holdReaders, project, restoreWords, settled, showRefusal],
	);
	alterElementRef.current = alterElement;

	/**
	 * ⌫ on a held element (#317): it goes, here and in the file.
	 *
	 * The fingerprint is the one the selection's read holds for this very element, which
	 * is the file the document on screen was rendered from. Without it there is
	 * nothing to measure the write against, and the honest answer is to say so
	 * rather than to write against whatever the file says now.
	 */
	const deleteElement = useCallback(
		(picks: readonly PickedSelection[]) => {
			const first = picks[0];
			if (first === undefined) return;
			const asked = deleteAsk(picks.map((held) => held.tag));
			const sources: string[] = [];
			for (const pick of picks) {
				const stamp = stampOf(pick);
				if (typeof stamp !== "string") {
					showRefusal({ frame: pick.frame, selector: pick.selector, refusal: stamp, asked });
					return;
				}
				sources.push(stamp);
			}
			// One write is one file and one fingerprint, which is what makes a
			// multi-pick delete one press of undo (#323). A selection spread over
			// two files would be two writes and two steps, so it says so instead
			// of quietly becoming them.
			const files = new Set(sources.map(stampPath));
			if (files.size > 1 || new Set(picks.map((pick) => pick.frame)).size > 1) {
				showRefusal({
					frame: first.frame,
					selector: first.selector,
					refusal: { code: "spread", says: "these are written in different files; delete them one at a time" },
					asked,
				});
				return;
			}
			const read = heldReadRef.current;
			const fingerprint =
				read !== undefined && sources.includes(read.source)
					? read.fingerprint
					: fingerprintFor(first.frame, sources[0] ?? "");
			if (fingerprint === undefined) {
				showRefusal({
					frame: first.frame,
					selector: first.selector,
					refusal: { code: "unread", says: "the file was never read; select the element again" },
					asked,
				});
				return;
			}
			// One row of a list is the row, never the template (#324). The document
			// says which entry of which array the pick stands in; the write takes
			// that entry out of the array literal, wherever it is written, and the
			// file keeps the one JSX literal every row is drawn from. Without an
			// entry to name the lane refuses rather than quietly editing a
			// template that renders more than once.
			const row = picks.length === 1 ? first.item : undefined;
			const rowPrint = row === undefined ? undefined : fingerprintFor(first.frame, row.map);
			const item =
				row === undefined || rowPrint === undefined
					? undefined
					: { source: row.map, index: row.index, fingerprint: rowPrint };
			alterElement(picks, { sources, fingerprint, ...(item === undefined ? {} : { item }) });
		},
		[alterElement, fingerprintFor, showRefusal],
	);

	// --- move (#340) --------------------------------------------------------------

	/** The next move waiting its turn, once the one before it has settled. */
	const nextMove = useCallback(() => {
		const run = moveRun.current;
		clearTimeout(run.timer);
		run.busy = false;
		run.queue.shift()?.();
	}, []);
	/** A move has begun: later ones wait, and a document that never answers holds none of them for long. */
	const claimMove = useCallback(() => {
		const run = moveRun.current;
		run.busy = true;
		clearTimeout(run.timer);
		run.timer = setTimeout(nextMove, HOLD_PAINT_MS);
	}, [nextMove]);

	/**
	 * One move, in the file and then in the document (#340).
	 *
	 * The file goes first, because only the planner knows whether the sibling
	 * on screen is one the file writes beside it; a refusal leaves the page
	 * untouched and sits under the element. Once the file has taken it the
	 * frame moves the very node, so the document held in front of the reload
	 * already shows the new order, and the ring follows the element there. The
	 * reload behind it is what puts the stamps right, and the ring is read off
	 * the new document once it has loaded.
	 *
	 * A row of a list moves as its entry in the array. An element that is the
	 * whole of what a component returns carries the call that renders it, and
	 * the lane moves the call.
	 */
	const moveBeside = useCallback(
		(subject: PickedSelection, beside: PickedHit, place: MovePlace) => {
			const frame = subject.frame;
			claimMove();
			const asked = moveAsk(subject.tag, place, beside.tag);
			const refuse = (refusal: Refusal) => {
				nextMove();
				// the file moved under the last move's answer, so it says nothing now
				if (refusal.code === "stale-file") handPrints.current.clear();
				const stamped = stampOf(subject);
				showRefusal({
					frame,
					selector: subject.selector,
					refusal,
					asked,
					...refusedIn(refusal, typeof stamped === "string" ? stamped : undefined),
				});
			};
			const stamp = stampOf(subject);
			if (typeof stamp !== "string") {
				refuse(stamp);
				return;
			}
			/** the file a stamp is in, as it was when the selection read it or the last move left it */
			const printOf = (stamped: string): string | undefined => {
				const read = heldReadRef.current;
				if (read?.source === stamped) return read.fingerprint;
				return handPrints.current.get(stampPath(stamped)) ?? fingerprintFor(frame, stamped);
			};
			const fingerprint = printOf(stamp);
			if (fingerprint === undefined) {
				refuse({ code: "unread", says: "the file was never read; select the element again" });
				return;
			}
			let ask: MoveAsk;
			const row =
				subject.item !== undefined && subject.item.selector === subject.selector ? subject.item : undefined;
			if (row !== undefined) {
				if (beside.item === undefined || beside.item.map !== row.map) {
					refuse({ code: "not-siblings", says: "the one next to it is not a row of this list; ask the agent" });
					return;
				}
				const rowPrint = printOf(row.map);
				if (rowPrint === undefined) {
					refuse({ code: "unread", says: "the file was never read; select the element again" });
					return;
				}
				ask = {
					act: "move",
					sources: [stamp],
					fingerprint,
					place,
					item: { source: row.map, index: row.index, target: beside.item.index, fingerprint: rowPrint },
				};
			} else {
				const target = stampOf({ frame, ...beside });
				if (typeof target !== "string") {
					refuse(target);
					return;
				}
				const ownerPrint = subject.owner === undefined ? undefined : printOf(subject.owner);
				ask = {
					act: "move",
					sources: [stamp],
					fingerprint,
					place,
					target: { source: target, ...(beside.owner === undefined ? {} : { owner: beside.owner }) },
					...(subject.owner === undefined || ownerPrint === undefined
						? {}
						: { owner: { source: subject.owner, fingerprint: ownerPrint } }),
				};
			}
			setRefused(null);
			const read = heldReadRef.current;
			const readers = read?.source === stamp ? (read.shared?.frames ?? []) : [];
			holdReaders(frame, readers);
			const id = ++pickSeq.current;
			void writeElement(project, frame, ask).then((written) => {
				const settle = (movedTo: string | undefined, chain: PickedHit[] | undefined) =>
					settled(written, {
						frame,
						selector: subject.selector,
						readers,
						edit: id,
						readAt: () => stamp,
						refuse,
						failed: "the move did not reach the file",
						...(movedTo === undefined ? {} : { entry: { movedTo } }),
						onLanded: () => {
							const moved = chain?.[chain.length - 1];
							if (chain === undefined || moved === undefined) {
								holdFrame(frame);
								whenLoaded(frame, nextMove);
								return;
							}
							// the ring stays on the element where it went, and is read
							// again off the reloaded document, stamps and all
							holdChain({ frame, chain });
							setSelected([]);
							setPicked([{ frame, ...moved }]);
							whenLoaded(frame, () => {
								walkKin(frame, moved.selector, "self", () => holdFrame(frame));
								nextMove();
							});
						},
					});
				if (written?.ok !== true) {
					settle(undefined, undefined);
					return;
				}
				// the element already stood there as the file has it: no step
				if (wroteNothing(written.undo)) {
					releaseReaders(frame, readers);
					nextMove();
					return;
				}
				const target = iframes.current.get(frame)?.contentWindow;
				if (target == null) {
					settle(undefined, undefined);
					return;
				}
				alterWaiters.current.set(id, ({ ok, chain }) => {
					const moved = ok ? chain?.[chain.length - 1] : undefined;
					settle(moved?.selector, ok ? chain : undefined);
				});
				target.postMessage(moveMessage(id, subject.selector, beside.selector, place), "*");
				setTimeout(() => {
					if (alterWaiters.current.delete(id)) settle(undefined, undefined);
				}, PICK_REPLY_MS);
			});
		},
		[
			claimMove,
			fingerprintFor,
			holdChain,
			holdFrame,
			holdReaders,
			nextMove,
			project,
			releaseReaders,
			settled,
			showRefusal,
			walkKin,
			whenLoaded,
		],
	);

	/**
	 * The arrow keys on a held element (#340): one step among its siblings,
	 * earlier for ↑ and ←, later for ↓ and →. The frame names the siblings as
	 * they stand now; the end of the row is as far as a step goes. Each press
	 * is one write and one step of undo, and a press made while a move is
	 * still settling waits its turn.
	 */
	const moveStep = useCallback(
		(step: -1 | 1): boolean => {
			if (enteredRef.current !== null || editingRef.current !== null) return false;
			const picks = pickedRef.current;
			const first = picks[0];
			if (first === undefined) return false;
			const run = moveRun.current;
			if (run.busy) {
				if (run.queue.length < 8) run.queue.push(() => moveStepRef.current(step));
				return true;
			}
			// the last move's turn can run out before its reload has loaded, and
			// a document still booting names no siblings: the press waits for it,
			// once, and one that never loads takes it nowhere
			if (reloading.current.has(first.frame)) {
				whenLoaded(first.frame, () => {
					if (!reloading.current.has(first.frame)) moveStepRef.current(step);
				});
				return true;
			}
			if (picks.length > 1) {
				showRefusal({
					frame: first.frame,
					selector: first.selector,
					refusal: { code: "several", says: "move one element at a time" },
					asked: `Move ${picks.length} elements`,
				});
				return true;
			}
			claimMove();
			askFrame(
				first.frame,
				generationWaiters.current,
				(id) => familyMessage(first.selector, "siblings", id),
				({ hits }) => {
					const at = hits.findIndex((hit) => hit.selector === first.selector);
					const own = hits[at];
					const beside = hits[at + step];
					// the end of the row: there is nowhere further to go
					if (own === undefined || beside === undefined) {
						nextMove();
						return;
					}
					moveBeside({ frame: first.frame, ...own }, beside, step > 0 ? "after" : "before");
				},
				nextMove,
			);
			return true;
		},
		[askFrame, claimMove, moveBeside, nextMove, showRefusal, whenLoaded],
	);
	const moveStepRef = useRef(moveStep);
	moveStepRef.current = moveStep;

	/**
	 * A drag in Edit has crossed the threshold (#340): the element grabbed is
	 * the deepest one under the press, or the row of a list it is inside,
	 * because a drag that starts in a row moves the row. It is held, and the
	 * frame names its siblings and where each is drawn, which is what the drop
	 * is worked out against. A press on the frame's background grabbed no
	 * element, and the drag moves the frame as it always has.
	 */
	const beginGrab = useCallback(
		(frame: string, local: Point) => {
			beginPick(
				frame,
				local,
				(chain) => {
					const active = gesture.current;
					if (active.kind !== "element-drag") return;
					const target = deepest(chain);
					if (target === undefined) {
						cancelPicks();
						setSelected(active.names);
						setPicked([]);
						gesture.current = { kind: "move", names: active.names, origins: active.origins, start: active.start };
						return;
					}
					const rowAt =
						target.item === undefined ? -1 : chain.findIndex((hit) => hit.selector === target.item?.selector);
					const held = rowAt === -1 ? chain : chain.slice(0, rowAt + 1);
					const subject = held[held.length - 1] ?? target;
					applyPick(frame, held, subject);
					askFrame(
						frame,
						generationWaiters.current,
						(id) => familyMessage(subject.selector, "siblings", id),
						({ hits }) => {
							const now = gesture.current;
							if (now.kind !== "element-drag") return;
							const at = hits.findIndex((hit) => hit.selector === subject.selector);
							if (at === -1) return;
							gesture.current = {
								...now,
								grab: { subject: { frame, ...(hits[at] ?? subject) }, row: hits, at },
							};
						},
					);
				},
				() => {
					if (gesture.current.kind === "element-drag") gesture.current = { kind: "idle" };
				},
			);
		},
		[applyPick, askFrame, beginPick, cancelPicks],
	);

	// A refusal is about the element it was refused on, so it goes when the
	// selection moves rather than sitting over whatever comes next. The keys
	// rather than the array: a click on the element already held re-picks it
	// and hands back a fresh list, and that is the selection standing still.
	const pickedKeys = picked.map((pick) => pickKey(pick.frame, pick.selector)).join("\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies(pickedKeys): the selection moving is the whole trigger
	useEffect(() => {
		setRefused(null);
	}, [pickedKeys]);
	// and it goes by itself after a moment (#339): a note, not a state
	useEffect(() => {
		if (refused === null) return;
		const timer = setTimeout(() => setRefused(null), REFUSAL_MS);
		return () => clearTimeout(timer);
	}, [refused]);

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
	 * ⇧-click's toggle (#37, #339): the deepest element under the pointer in
	 * or out of the selection. A toggle in moves the anchor; membership is
	 * (frame, selector) identity.
	 */
	const togglePickAt = useCallback(
		(frame: string, local: Point) => {
			beginPick(frame, local, (chain) => {
				const target = deepest(chain);
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
		[beginPick, holdChain],
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
		camera.fly(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
	};

	// --- pages (#39): one canvas per page, cameras bookkept per page ------------

	/** The camera that lands an arrival centered on its target, zoom kept. */
	const arrivalAt = useCallback(
		(frame: ProjectedFrame): Camera | undefined => {
			const viewport = viewportRef.current;
			const cam = camera.get();
			return viewport !== null && cam !== null
				? centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight)
				: undefined;
		},
		[camera],
	);

	/**
	 * Switching saves the leaving page's camera, swaps the field, and restores
	 * the arriving page's — fits when it has none, or lands where a caller
	 * says, and flies on from there to `then` when the caller is going
	 * somewhere on the page. Selection, element scope, and entered time are
	 * page-local and reset; a pending trash commits (one undo slot, as ever). The
	 * current tool rides through untouched.
	 */
	const switchToPage = useCallback(
		(target: string, arriveAt?: Camera, then?: Camera) => {
			if (activePageRef.current === target) return;
			flushNudge();
			commitTrash();
			clearCanvasSelection();
			exitEntered();
			setMenu(null);
			setExternalLink(null);
			camera.stop();
			const next = switchPage(cameras.current, activePageRef.current, camera.get(), target, arriveAt);
			cameras.current = next.cameras;
			setActivePage(target);
			// placed by the commit that swaps the field, so both are drawn by one frame
			arrival.current = { page: target, camera: next.camera, ...(then === undefined ? {} : { then }) };
		},
		[flushNudge, commitTrash, clearCanvasSelection, exitEntered, camera],
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
			const cam = camera.get();
			if (frame !== undefined && viewport !== null && cam !== null) {
				camera.fly(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
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
		[recordDeparture, switchToPage, arrivalAt, camera],
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
				camera.fly(entry.camera);
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
		[switchToPage, exitEntered, clearCanvasSelection, camera],
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
	 * to. The pictures need nothing of their own: the daemon's photo booth kept
	 * making them while the stream was gone, and the projection read carries
	 * every one it made.
	 */
	const resync = useCallback(() => {
		window.dispatchEvent(new CustomEvent("spool-player-publication-change"));
		void refetchFrames();
		void refetchFlows();
		for (const frame of allFramesRef.current) reloadFrameDocument(frame.name);
	}, [refetchFrames, refetchFlows, reloadFrameDocument]);

	/**
	 * What this canvas shows, told to the daemon's photo booth: the page, the
	 * frames inside the viewport, which it photographs first, and the colour
	 * scheme they render in, which it photographs in. At rest and only when it
	 * changed, never per tick. It rides under the name the event stream
	 * handed this canvas in its hello, so it stops counting the moment the
	 * stream does, and a stream that comes back hands out a new name and is
	 * told again.
	 */
	const viewStream = useRef<string | null>(null);
	const toldView = useRef("");
	const tellView = useCallback(() => {
		const view = viewStream.current;
		const viewport = viewportRef.current;
		if (view === null || restCameraRef.current === null || viewport === null) return;
		const frames = framesOnScreen(framesRef.current, restCameraRef.current, {
			width: viewport.clientWidth,
			height: viewport.clientHeight,
		});
		const scheme = frameScheme();
		const told = JSON.stringify([view, activePageRef.current, frames, scheme]);
		if (told === toldView.current) return;
		toldView.current = told;
		putCanvasView(project, { view, page: activePageRef.current, frames, scheme });
	}, [project]);
	// the machine going over to dark at sunset is a scheme every cover that
	// follows one was not taken in
	useEffect(() => {
		if (typeof matchMedia !== "function") return;
		const media = matchMedia("(prefers-color-scheme: dark)");
		media.addEventListener("change", tellView);
		return () => media.removeEventListener("change", tellView);
	}, [tellView]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a page switch and frames arriving are triggers too — the report reads both through refs
	useEffect(() => {
		if (restCamera !== null && loaded) tellView();
	}, [restCamera, loaded, activePage, visibleFrames, tellView]);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		let opened = false;
		return subscribeSse(
			`/api/p/${encodeURIComponent(project)}/events`,
			{
				hello: (data) => {
					const view = (data as { view?: unknown }).view;
					viewStream.current = typeof view === "string" ? view : null;
					// a stream that comes back says again who is here
					setTeam((data as { team?: unknown }).team === true);
					presenceRoom.reset();
					tellView();
					// the stream tells every change from here on; one made before it
					// opened, after the canvas's first read was answered, is in a read
					// asked now (a stream that comes back resyncs the same way)
					if (!opened) void refetchFrames();
					opened = true;
				},
				presence: (data) => presenceRoom.hear(data as Presence),
				change: (data) => {
					const event = data as {
						kind: string;
						frame?: string;
						frames?: string[];
						cover?: Cover;
						message?: string;
					};
					if (["frame", "shared", "geometry"].includes(event.kind))
						window.dispatchEvent(new CustomEvent("spool-player-publication-change"));
					if (event.kind === "set-aside") window.dispatchEvent(new CustomEvent("spool-set-aside-change"));
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
					} else if (event.kind === "sync") {
						// team sync says what didn't travel, why it paused, or that the project ended here: said where
						// it lasts, and read again from the daemon
						window.dispatchEvent(new CustomEvent(SYNC_CHANGED));
					}
				},
			},
			{ onReconnect: resync },
		);
	}, [
		changedUnderHand,
		noteCover,
		project,
		refetchFlows,
		refetchFrames,
		reloadOrHold,
		resync,
		tellView,
		presenceRoom,
	]);

	/**
	 * The tab is being looked at again. A hidden one is throttled down to almost
	 * nothing — the sweep and the frames' own animations both — so
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
			// a document that may have changed under the element tree reads it again (#342)
			if (["loaded", "arrived", "edited", "altered", "restored"].includes(message.spool)) {
				elementTreeRef.current.stale(message.frame);
			}
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
					// what waited on this document being there can ask it now (#340)
					reloading.current.delete(message.frame);
					const waiting = loadWaiters.current.get(message.frame) ?? [];
					loadWaiters.current.delete(message.frame);
					for (const then of waiting) then();
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
					// a document that broke will never say loaded: what waited on it asks what there is
					if (reloading.current.delete(message.frame)) {
						const waiting = loadWaiters.current.get(message.frame) ?? [];
						loadWaiters.current.delete(message.frame);
						for (const then of waiting) then();
					}
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
				case "generation": {
					const waiter = generationWaiters.current.get(message.id);
					generationWaiters.current.delete(message.id);
					waiter?.({ chain: message.chain, hits: message.hits });
					return;
				}
				case "element-tree":
					elementTreeRef.current.receive(message);
					return;
				// the in-place edit (#255): the frame says it has opened, and later
				// says how it ended. A reply carrying another ask is a dead edit —
				// its element has moved on, and writing what it says would land on
				// whatever took its place.
				case "edit-open": {
					const held = editingRef.current;
					if (held === null || held.id !== message.id) return;
					if (!message.ok) {
						setEdit(null);
						const tag = pickedRef.current.find(
							(pick) => pick.frame === held.frame && pick.selector === held.selector,
						)?.tag;
						showRefusal({
							frame: held.frame,
							selector: held.selector,
							refusal: GONE,
							asked: `Change the words of the ${tag ?? "element"}`,
						});
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
				case "restored": {
					const waiter = restoreWaiters.current.get(message.id);
					restoreWaiters.current.delete(message.id);
					waiter?.(message.ok);
					return;
				}
				case "altered": {
					const waiter = alterWaiters.current.get(message.id);
					alterWaiters.current.delete(message.id);
					waiter?.({
						ok: message.ok,
						owner: message.owner,
						...(message.chain === undefined ? {} : { chain: message.chain }),
					});
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
						camera.stop();
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
					panBy(dx, dy);
					return;
				}
				case "zoom": {
					// Entered frames own pointer + keyboard input, and those events do
					// not cross an iframe boundary. The frame shim claims browser-zoom
					// gestures and hands them back here as canvas camera intents.
					if (enteredRef.current !== message.frame) return;
					camera.stop();
					setMenu(null);
					if (message.kind === "wheel") {
						const iframe = iframes.current.get(message.frame);
						const viewport = viewportRef.current;
						if (iframe === undefined || viewport === null) return;
						// The pointer is where the frame said it was inside its own box, and
						// that box is where it was last drawn: measured, the two agree even
						// while the camera is a few ticks ahead of the frame (#81), and the
						// zoom pins the screen point the pointer is actually on.
						const frameRect = iframe.getBoundingClientRect();
						const viewportRect = viewport.getBoundingClientRect();
						const cameraScale = camera.get()?.k ?? 1;
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
					camera.stop();
					setMenu(null);
					const dx = wheelPixels(message.deltaX, message.deltaMode, viewport.clientHeight);
					const dy = wheelPixels(message.deltaY, message.deltaMode, viewport.clientHeight);
					if (message.shiftKey && dx === 0) panBy(-dy, 0);
					else panBy(-dx, -dy);
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
		zoomAtPoint,
		panBy,
		viewportCenter,
		requestSiteBoxes,
		strike,
		releaseHold,
		finishEdit,
		setEdit,
		showRefusal,
		camera,
	]);

	// wheel: pan; ctrl/cmd-wheel (and pinch): zoom at the cursor — bake-off feel
	useEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			// Leave the finder's native list scrolling alone before cancelling the wheel.
			if (findingRef.current) return;
			event.preventDefault();
			camera.stop();
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
			} else if (event.shiftKey && dx === 0) {
				panBy(-dy, 0);
			} else {
				panBy(-dx, -dy);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [zoomAtPoint, panBy, camera]);

	// Camera motion is drawn and never rendered. Every drawn frame is the camera
	// moving, which is the whole of what live frames hold their animations
	// across (#171); the store's rest ends it, and is the one moment React hears
	// the camera, so frames mount where it came to rest rather than throughout
	// the gesture.
	useEffect(
		() =>
			camera.subscribe((at, moving) => {
				if (at === null) return;
				noteCameraMoving(moving);
				if (!moving) setRestCamera(at);
			}),
		[camera, noteCameraMoving],
	);

	/**
	 * The lifecycle mounts against where the camera rests, and sweeps at once
	 * whenever that or the field changes. The camera the canvas opens on is not
	 * a gesture — it is where the canvas already is — so it counts from the
	 * moment it is there, and the first documents mount the moment the frames
	 * land rather than a quiet window and a sweep later.
	 */
	useEffect(() => {
		if (restCamera !== null && loaded) sweepLifecycle();
	}, [restCamera, loaded, sweepLifecycle]);

	const readyForUpdate = loaded && restCamera !== null;
	useEffect(() => {
		if (readyForUpdate) desktopBridge()?.ready?.();
	}, [readyForUpdate]);

	useEffect(
		() =>
			beforeUpdate(async () => {
				flushNudge();
				commitTrash();
				// where the camera is this instant, not where it last rested: an update
				// asked for mid-gesture reopens on the view the hand was holding
				const cam = camera.get();
				if (cam === null) throw new Error("The canvas is still opening.");
				cameras.current = { ...cameras.current, [activePage]: { x: cam.x, y: cam.y, k: cam.k } };
				await saveCanvasState(project, {
					...stateCameraSlots(cameras.current),
					...(activePage === ROOT_PAGE ? {} : { activePage }),
				});
			}),
		[camera, project, activePage, flushNudge, commitTrash],
	);

	// persist the page bookkeeping once the camera has rested: last
	// settle wins the stored slot (#12); each page keeps its own camera, and the
	// active page rides along so reopening resumes it (#39). The camera is read
	// when the write goes out rather than taken from the rest that armed it: a
	// page switch re-arms this before the new page's camera has rested, and the
	// camera standing then is the arriving page's, never the one it left.
	useEffect(() => {
		if (restCamera === null) return;
		const settle = setTimeout(() => {
			const cam = camera.get();
			if (cam === null) return;
			cameras.current = { ...cameras.current, [activePage]: { x: cam.x, y: cam.y, k: cam.k } };
			putCanvasState(project, {
				...stateCameraSlots(cameras.current),
				...(activePage === ROOT_PAGE ? {} : { activePage }),
			});
		}, SETTLE_PERSIST_MS);
		return () => clearTimeout(settle);
	}, [restCamera, project, activePage, camera]);

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
	 * The hover outline (#37, #339), on throttled pointer-move: the element a
	 * click would take, which is the deepest one under the pointer. Only where
	 * a click takes elements at all — in Edit, and in Select while ⌘ borrows
	 * it. Select's own hover is the frame's, which draws its own ring, so it
	 * asks the frame nothing.
	 *
	 * A field of live documents each drawing outlines is a busier surface than
	 * the one that ships, so only the frame under the pointer ever draws.
	 */
	const hoverPickAt = (frame: string | null, world: Point, accel: boolean) => {
		const reaching = () => toolRef.current === "edit" || (toolRef.current === "select" && accelDownRef.current);
		if (frame === null || !(toolRef.current === "edit" || accel)) {
			hoverPoint.current = frame === null ? null : { frame, world };
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
		beginPick(
			frame,
			local,
			(chain) => {
				hoverBusy.current = false;
				if (gesture.current.kind !== "idle") return;
				// ⌘ let go while the frame was answering: the answer is stale, and
				// Select's own hover is the frame's ring
				if (!reaching()) {
					setPreview(null);
					return;
				}
				const target = deepest(chain);
				setPreview(
					target === undefined
						? null
						: {
								frame,
								selector: target.selector,
								rect: target.rect,
								...(target.rects === undefined ? {} : { rects: target.rects }),
								radius: target.radius,
							},
				);
			},
			() => {
				hoverBusy.current = false;
			},
			// a hover draws an outline and deletes nothing (#323)
			false,
		);
	};

	/** Redraw the outline where the pointer already rests — ⌘ changes what it means. */
	refreshRings.current = () => {
		const at = hoverPoint.current;
		if (at === null || toolRef.current === "hand" || gesture.current.kind !== "idle") {
			setPreview(null);
			return;
		}
		hoverLast.current = 0;
		hoverPickAt(at.frame, at.world, accelDownRef.current);
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
		gesture.current = { kind: "idle" };
		dropResize();
		setDropLine(null);
		setMarks(NO_MARKS);
		setMarquee(null);
		setResizeCursor(null);
		setResizingFrame(null);
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
	}, [dropResize]);

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
		const cam = camera.get();
		if (cam === null || event.button === 2) return;
		camera.stop();
		setMenu(null);
		setPreview(null); // the press supersedes the hover; its own answer redraws
		hideFrameHover();
		const p = localPoint(event);
		cancelPicks(); // a new press voids earlier picks; its own start a fresh generation
		flushNudge(); // a pending nudge settles before a new gesture captures origins
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

		// ⇧-click in Edit, or among elements already held, puts the deepest
		// element under the pointer in or out of the selection (#37, #339)
		if (
			toolRef.current !== "hand" &&
			event.shiftKey &&
			label === null &&
			(toolRef.current === "edit" || pickedRef.current.length > 0)
		) {
			const local = frameLocalAt(hit, world);
			if (local !== null) togglePickAt(hit, local);
			return;
		}

		if (event.shiftKey) {
			// shift-click: add/remove, never a drag
			setPicked([]);
			setSelected((current) => (current.includes(hit) ? current.filter((name) => name !== hit) : [...current, hit]));
			return;
		}

		// ⌘ in Select borrows Edit for as long as it is held (#339): the click
		// takes the deepest element under the pointer, and nothing more. The
		// modifier is exclusive, never a union: on the Mac ctrl-click is the
		// context menu's, so accepting either would fire both.
		if (toolRef.current === "select" && accelPressed(event) && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) selectDeepestAt(hit, local);
			return;
		}

		// In Edit every click is the deepest element under the pointer (#339),
		// and a drag moves that element among its siblings (#340).
		if (toolRef.current === "edit" && label === null) {
			const local = frameLocalAt(hit, world);
			// a press on the element that was already held is the second click
			// the text gesture is (#255) — noted here and acted on at pointer-up,
			// because until then it may yet turn out to be a drag of the frame
			if (local !== null) {
				const again = secondClick(pickedRef.current, hit, local);
				pressOnHeld.current = again === undefined ? null : { pick: again, local };
				selectDeepestAt(hit, local);
			}
			const names = selectedRef.current.includes(hit) ? [...selectedRef.current] : [hit];
			gesture.current =
				local === null
					? { kind: "pending", names, origins: originsOf(names), start: p }
					: { kind: "element-pending", frame: hit, local, names, origins: originsOf(names), start: p };
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
		const cam = camera.get();
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
			hoverPickAt(label === null ? frame : null, world, accelPressed(event));
			return;
		}

		if (active.kind === "pan") {
			const dx = p.x - active.lastX;
			const dy = p.y - active.lastY;
			gesture.current = { ...active, lastX: p.x, lastY: p.y };
			panBy(dx, dy);
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

		if (active.kind === "element-pending") {
			if (Math.hypot(p.x - active.start.x, p.y - active.start.y) < DRAG_THRESHOLD_PX) return;
			// a drag is not the second click on what was held
			pressOnHeld.current = null;
			gesture.current = {
				kind: "element-drag",
				frame: active.frame,
				names: active.names,
				origins: active.origins,
				start: active.start,
			};
			beginGrab(active.frame, active.local);
			return;
		}

		if (active.kind === "element-drag") {
			const grab = active.grab;
			const local = frameLocalAt(active.frame, toWorld(p, cam));
			if (grab === undefined || local === null) return;
			const drop = dropAt(
				grab.row.map((hit) => hit.rect),
				grab.at,
				local,
			);
			const { drop: _was, ...rest } = active;
			gesture.current = drop === undefined ? rest : { ...rest, drop };
			setDropLine(drop === undefined ? null : { frame: active.frame, box: drop.line });
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
		if (active.kind === "move") commitGeometry(active.names, moveBefore(active.origins));
		if (active.kind === "page-move") commitPlace(active.page, active.origin);
		if (active.kind === "resize") commitGeometry([active.frame], { [active.frame]: active.origin });
		if (active.kind === "element-drag") {
			setDropLine(null);
			const beside = active.drop === undefined ? undefined : active.grab?.row[active.drop.beside];
			if (active.grab !== undefined && active.drop !== undefined && beside !== undefined) {
				moveBeside(active.grab.subject, beside, active.drop.place);
			}
		}
		// the press never became a drag, so the second click meant the words (#255)
		const again = pressOnHeld.current;
		pressOnHeld.current = null;
		if ((active.kind === "pending" || active.kind === "element-pending") && again !== null) {
			beginTextEdit(again.pick, again.local);
		}
	};

	/**
	 * Double-click, which each pointing tool spends on its own subject: Select
	 * goes inside the frame, Edit opens the element under the pointer — its
	 * words, or its children where it is a group (#339). ⌘ borrows Edit for
	 * the double-click too.
	 *
	 * Keeping them apart is what lets both be the plain gesture. Running a
	 * frame is the constant act on this canvas and takes no modifier for it;
	 * opening an element is constant too, but only once you have said you are
	 * editing, which is what picking up the tool says. Edit has no door into a
	 * live frame at all (#321), the label included: a tool for changing a page
	 * must never hand the page the pointer by accident.
	 */
	const onDoubleClick = (event: React.MouseEvent) => {
		if (exportDialogRef.current !== null) return;
		if (toolRef.current === "hand") return;
		const cam = camera.get();
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
		if (toolRef.current === "select" && !accelPressed(event)) {
			enterFrame(hit);
			return;
		}
		if (label !== null) return; // the label is the frame's, and it has no words
		const local = frameLocalAt(hit, world);
		if (local !== null) openAt(hit, local);
	};

	const onContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		if (exportDialogRef.current !== null) return;
		const cam = camera.get();
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
		const menuSize = contextMenuSize(
			!elementSelection,
			!sharingAvailable ? 0 : (sharing.state(hit)?.shared ?? sharing.listed(hit)) ? 3 : 1,
		);
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
			const viewport = viewportRef.current;
			const cam = camera.get();
			const centred =
				viewport === null || cam === null
					? undefined
					: centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight);
			// Another page arrives where the camera stood and flies on to the frame
			// from there, as the landing always has; the flight starts in the commit
			// that brings the page, so none of it is drawn over the page being left.
			if (pageOf(frame) !== activePageRef.current) switchToPage(pageOf(frame), cam ?? undefined, centred);
			else if (centred !== undefined) camera.fly(centred);
			setPicked([]);
			holdChain(null);
			setSelected([frame.name]);
			frameAnchor.current = frame.name;
		},
		[recordDeparture, switchToPage, holdChain, camera],
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
	const stills = useMemo(
		() =>
			new Map(
				frames.flatMap(({ name, cover }) =>
					cover === undefined ? [] : [[name, coverUrl(project, name, cover.hash)] as const],
				),
			),
		[frames, project],
	);
	const putBack = turn.putBack;
	const jump = useMemo<FrameJump>(
		() => ({
			have: reach.have,
			gone: reach.gone,
			stills,
			onPutBack: putBack,
			onPoint: setPointed,
			onJump: (name) => {
				// pointing was the question and landing is the answer, so the weaker mark
				// goes as the stronger one arrives
				setPointed(null);
				landOnFrame(name);
			},
		}),
		[reach, landOnFrame, stills, putBack],
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
			// a held element moves one step among its siblings instead (#340)
			if (selectedRef.current.length === 0 && pickedRef.current.length > 0) {
				const earlier = event.key === "ArrowUp" || event.key === "ArrowLeft";
				if (moveStep(earlier ? -1 : 1)) event.preventDefault();
				return;
			}
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
					camera.fly(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
				}
			},
			// ⇧A tidies the field; one ⌘Z puts every frame back where it was
			"canvas.tidy": (event) => {
				event?.preventDefault();
				if (gestureStill()) arrangeFrames();
			},
			// the threads (#34): flips the machine setting, so every open canvas follows
			"canvas.threads": () => toggleArrows(),
			"canvas.tool-select": () => chooseTool("select"),
			"canvas.tool-edit": () => chooseTool("edit"),
			"canvas.tool-hand": () => chooseTool("hand"),
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
					// every element held goes, as one write and one press of undo
					// (#323); never while words are open, because that press
					// belongs to the text being typed
					if (editingRef.current === null) deleteElement(pickedRef.current);
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
				const cam = camera.get();
				if (viewport !== null && cam !== null) {
					camera.fly(centerOn(cam, target, viewport.clientWidth, viewport.clientHeight));
				}
			},
			// F2: the words of the one element held, and nothing else (#323)
			"canvas.words": () => openWords(),
			// ⏎ is Edit's before it is Select's (#339): with an element held, or
			// in Edit, it opens the words or selects the children; only a frame
			// held in Select goes inside
			"canvas.enter": (event) => {
				if (editingRef.current !== null) return;
				if (pickedRef.current.length > 0 || toolRef.current === "edit") {
					if (enteredRef.current !== null) return;
					if (openHeld()) event?.preventDefault();
					return;
				}
				const targets = verbTarget();
				const [only] = targets;
				if (targets.length !== 1 || only === undefined) return;
				event?.preventDefault();
				enterFrame(only);
			},
			// ⌘⏎ is ⏎ with Edit borrowed: into the words or the children, from a
			// frame held in Select as much as from an element
			"canvas.descend": (event) => {
				if (enteredRef.current !== null) return;
				event?.preventDefault();
				setPreview(null);
				openHeld();
			},
			"canvas.ascend": (event) => {
				if (enteredRef.current !== null) return;
				event?.preventDefault();
				cancelPicks();
				setPreview(null);
				selectParent();
			},
			// Tab is the browser's focus key until one element is held: claiming
			// it only where the selection can answer leaves the chrome reachable
			"canvas.sibling": (event) => {
				if (walkSibling(event?.shiftKey === true ? "previous" : "next")) event?.preventDefault();
			},
			// ⌘A takes every sibling of what is held (#339), and is the browser's
			// own select-all anywhere else
			"canvas.select-siblings": (event) => {
				if (editingRef.current !== null) return;
				if (selectSiblings()) event?.preventDefault();
			},
			"canvas.escape": () => {
				cancelPicks();
				setPreview(null);
				// Esc finishes the words and saves them, as Enter does (#339)
				if (editingRef.current !== null) {
					endEditRef.current(true);
					return;
				}
				if (!gestureStill()) cancelGesture();
				else if (menuOpenRef.current) setMenu(null);
				else if (enteredRef.current !== null) exitEntered(true);
				// Esc leaves first, then climbs to the parent the way ⇧⏎ does
				else selectParent();
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
			// releasing accel puts the borrowed Edit down, and the outline it drew
			// goes from under a pointer that has not moved since (#254, #339)
			if (event.key === accelKeyName()) {
				setAccelDown(false);
				accelDownRef.current = false;
				refreshRings.current();
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
		deleteElement,
		moveStep,
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
		chooseTool,
		toggleArrows,
		cancelExportDialog,
		playFrame,
		jumpBack,
		jumpForward,
		openHeld,
		selectParent,
		selectSiblings,
		walkSibling,
		openWords,
		camera,
	]);

	// --- chrome (top bar) -------------------------------------------------------

	useEffect(() => {
		onChrome({
			camera,
			presence: team ? { room: presenceRoom, page: activePage, following, follow: setFollowing } : undefined,
		});
		return () => onChrome(null);
	}, [onChrome, camera, team, presenceRoom, activePage, following]);

	// --- presence (DEV-196) ---------------------------------------------------------

	const sendPresence = useCallback((state: PresenceState) => putPresence(project, state), [project]);
	usePresenceSender({
		send: sendPresence,
		team,
		camera,
		viewportRef,
		page: activePage,
		inside: entered,
		dragging: () => (gesture.current.kind === "move" ? gesture.current.names : []),
	});
	const followPage = useCallback(
		(page: string) => {
			if (page !== ROOT_PAGE && !pages.includes(page)) return false;
			switchToPage(page);
			return true;
		},
		[pages, switchToPage],
	);
	useFollow({
		room: presenceRoom,
		following,
		stop: () => setFollowing(null),
		camera,
		viewportRef,
		page: activePage,
		goToPage: followPage,
	});
	const followed = following === null ? undefined : presenceRoom.get(following);

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
	/** what the rail is looking at: one element, one frame, or how many of either */
	const railHeld = ((): Held | null => {
		// a page is held on its own, and the selection never holds both (#265)
		const page = pageObjects.find((object) => object.page === selectedPage);
		if (page !== undefined) return { kind: "page", page: page.page, name: page.name, count: page.count };
		/** a frame's own box, which is what the rail shows for it and for what is in it */
		const geometryOf = (name: string): Geometry | null => {
			const found = frames.find((frame) => frame.name === name);
			return found === undefined ? null : { x: found.x, y: found.y, w: found.w, h: found.h };
		};
		if (picked.length > 1) {
			// one frame's picks read and write as one gesture (#323); spread over
			// two they are a count and nothing else
			const frame = picked[0]?.frame ?? "";
			const one = picked.every((pick) => pick.frame === frame);
			return {
				kind: "elements",
				count: picked.length,
				frame: one ? frame : null,
				geometry: one ? geometryOf(frame) : null,
				picks: one ? picked : [],
			};
		}
		const pick = picked[0];
		if (pick !== undefined) {
			const chain = chainDrawn?.frame === pick.frame ? chainDrawn.chain : [pick];
			const geometry = geometryOf(pick.frame);
			return geometry === null
				? null
				: { kind: "element", frame: pick.frame, geometry, chain, selector: pick.selector };
		}
		if (selected.length > 1) return { kind: "frames", count: selected.length };
		const name = selected[0];
		const geometry = name === undefined ? null : geometryOf(name);
		return name === undefined || geometry === null ? null : { kind: "frame", name, geometry };
	})();
	const railFrame =
		railHeld?.kind === "element"
			? railHeld.frame
			: railHeld?.kind === "elements"
				? railHeld.frame
				: railHeld?.kind === "frame"
					? railHeld.name
					: null;
	/** the one element held, whose own read every hand write is measured against */
	const heldPick = picked.length === 1 ? picked[0] : undefined;
	/**
	 * The box an open edit hands its frame (#321): the element the words are
	 * drawn in, and nothing else. The whole document was the frame's while an
	 * edit stood open, which is indistinguishable from being inside it — the
	 * prototype's own hover states lit up and the canvas heard no pointer at
	 * all. The rest of the frame stays the canvas's, so the click-away still
	 * commits and the rings go on being drawn around the caret.
	 */
	const editedBox =
		editing === null || editing.phase !== "open"
			? null
			: (picked.find((held) => held.frame === editing.frame && held.selector === editing.selector)?.rect ?? null);
	/**
	 * The selection's one read, and the clock behind it: the held frame's
	 * document coming back, and the hand's own saves, because a save rewrites
	 * the very file this read is about without reloading the document — without
	 * it the next write would be measured against the file as it was (#306).
	 */
	const railRevision = railFrame === null ? 0 : (docNonces[railFrame] ?? 0) + (saves[railFrame] ?? 0);
	const railRungs = useRungs(project, railHeld, railRevision);
	// an element with no stamp of its own has nothing a write could be measured
	// against, so it holds no read at all
	heldReadRef.current =
		railHeld?.kind === "element" && heldPick !== undefined && !heldPick.generated
			? railRungs?.[rungOf(railHeld)]
			: undefined;
	railRungsRef.current = railRungs;
	const cursor = resizeCursor ?? (panning ? "grabbing" : effectiveTool === "hand" ? "grab" : "default");

	/**
	 * The window's panes (#359), in the order a fresh layout puts them: where
	 * each one stands is the pane window's, and a pane is mounted for as long as
	 * the canvas is, so drafts and scroll outlive it being out of sight.
	 */
	const panes: readonly PaneDef[] = [
		{
			id: "pages",
			title: "Pages",
			icon: <FolderIcon className="h-4 w-4" />,
			hotkey: "panes.pages",
			focus: (body) => body.querySelector<HTMLElement>('[role="tree"]')?.focus({ preventScroll: true }),
			render: () => (
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
					onCopyPath={(name) => copySourcePath(frameSourcePath(name))}
					onCopiesLanded={cascadeCopies}
					onFramesRenamed={followRenamedFrames}
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
					under={elementTree.under}
					onSharePage={projectShares?.state === "ready" && projectShares.manage ? setSharingPage : undefined}
				/>
			),
		},
		{
			id: "properties",
			title: "Properties",
			icon: <PropertiesIcon />,
			hotkey: "panes.properties",
			render: () => (
				<PropertiesRail
					held={railHeld}
					acts={{
						onAsk: askAgent,
						onGeometry: setFrameGeometry,
						onGeometryPreview: previewFrameGeometry,
						onGeometryCommit: commitFrameGeometry,
					}}
				/>
			),
		},
		{
			id: "agent",
			title: "Agent",
			icon: <AgentIcon />,
			hotkey: "panes.agent",
			working: turn.phase === "playing",
			// a turn of any chat stopped on a question only a person can answer (#366)
			waiting: turn.phase === "asking" || deck.threads.some((thread) => thread.life === "waiting"),
			titled: true,
			// another chat is running, waiting on a person, or landed unread (#364)
			elsewhere: deck.threads.some((thread) => thread.id !== deck.open && thread.life !== "read"),
			focus: (body) => body.querySelector("textarea")?.focus({ preventScroll: true }),
			render: ({ width, visible }) => (
				<AgentRail
					active={visible}
					agentReady={deck.engine !== undefined || deck.legacy}
					legacy={deck.legacy}
					request={agentRequest}
					// an agent that never asks has no mode to pick, so the rail draws no mode menu (#363);
					// nor does one whose word on it has not come, so pi's never flashes in (#364)
					permissions={model.modes === true ? permissions : undefined}
					width={width}
					turn={turn}
					jump={jump}
					pointing={{ ...pointing, lit: lit ?? litOut, onLight: setLit, onDrop: dropPointed }}
					threads={{
						list: deck.threads,
						open: deck.open,
						finished: deck.finished,
						onOpen: deck.onOpen,
						onClose: deck.onClose,
						// a chat opened on one engine (a recovery) leaves the machine's choice alone
						onNew: deck.onNew,
					}}
					install={install}
					login={deck.login}
					model={model}
					preferred={agentDefaults.engine}
				/>
			),
		},
	];

	return (
		<div className="relative flex h-full w-full">
			<PaneWindow
				panes={panes}
				reveal={agentRequest === undefined ? undefined : { pane: "agent", key: agentRequest.id }}
				onShown={(panes) => setRailShown(panes.includes("agent"))}
				barEnd={
					<BarEnd
						onSettings={onSettings}
						onUseAgent={root === undefined ? undefined : () => setAgentHandoff(true)}
					/>
				}
			>
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
						const cam = camera.get();
						if (openEdit === null || openEdit.phase !== "opening" || cam === null) return;
						if (frameAtWorld(toWorld(localPoint(event), cam)) === openEdit.frame) event.preventDefault();
					}}
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
					{restCamera !== null && (
						<CameraField camera={camera} layer="under">
							{/* the threads live under the frames: the map, never a hit target */}
							{arrowsOn && (
								<FlowArrows frames={visibleFrames} edges={edges} siteBoxes={siteBoxes} camera={camera} />
							)}
							{/* the pages standing on this field (#265). Under the frames,
						    because a frame is a live document and a page is a picture of
						    some: the press that reaches a page is the press no frame
						    answered. */}
							{pageObjects.map((object) => (
								<PageObjectView
									key={object.page}
									project={project}
									object={object}
									camera={camera}
									selected={selectedPage === object.page}
									hovered={pointerTool && hoveredPage === object.page}
								/>
							))}
						</CameraField>
					)}
					{/* every frame standing as its picture, on the GPU (#81): over the
				    arrows and pages, under every shell, label and tag */}
					<PictureCanvas
						camera={camera}
						frames={pictureFrames}
						claims={pictureClaims}
						booting={documentsBooting}
					/>
					{restCamera !== null && (
						<CameraField camera={camera}>
							{visibleFrames.map((frame) => {
								const state = lifecycle.states[frame.name] ?? "picture";
								const isEntered = entered === frame.name;
								// a picture with a still is the picture layer's to draw; a shell
								// is for a document, or for a frame with nothing to draw but its
								// placeholder
								if (
									state === "picture" &&
									!isEntered &&
									frame.cover !== undefined &&
									externalLink?.frame !== frame.name
								) {
									return null;
								}
								return (
									<FrameSlot key={frame.name} name={frame.name} frame={frame} claims={pictureClaims}>
										<ShellClip camera={camera} near={near} frame={frame}>
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
												pointerOnly={editing?.frame === frame.name ? editedBox : null}
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
										</ShellClip>
									</FrameSlot>
								);
							})}
						</CameraField>
					)}
					{/* Labels share one layer above every frame. A transformed frame is
				    its own stacking context, so keeping its label inside would let a
				    later neighboring frame paint over the label regardless of the
				    label's own z-index. */}
					{restCamera !== null && (
						<LabelField camera={camera}>
							{visibleFrames.map((frame) => {
								const isEntered = entered === frame.name;
								const isSelected = selected.includes(frame.name);
								const isHovered = pointerTool && hovered?.visible === true && hovered.frame === frame.name;
								return (
									// Mono, muted; thread when selected. Entered swaps it for the
									// state chip (#28).
									<FrameLabel
										key={`${frame.name}:label`}
										name={frame.name}
										frame={frame}
										near={near}
										camera={camera}
										entered={isEntered}
										selected={isSelected}
										hovered={isHovered}
										unseen={unseen.get(frame.name)}
										sharing={(() => {
											const state = sharing.state(frame.name);
											return state?.chip === undefined
												? undefined
												: { chip: state.chip, expanded: state.open, open: () => sharing.show(frame.name) };
										})()}
										onPlay={() => playFrame(frame.name)}
										setAside={setAside.label(frame.name)}
									/>
								);
							})}
						</LabelField>
					)}
					{restCamera !== null && (
						<CameraField camera={camera} layer="over">
							{pageObjects.map((object) => (
								<PageObjectLabel
									key={`${object.page}:label`}
									object={object}
									camera={camera}
									selected={selectedPage === object.page}
									hovered={pointerTool && hoveredPage === object.page}
								/>
							))}
							{/* the tags ride over the frames, because pressing one travels —
						    the leaders under them are the map and take no pointer */}
							{arrowsOn && (
								<WalkLayer walks={walks} frames={visibleFrames} camera={camera} onOpen={landOnFrame} />
							)}
						</CameraField>
					)}

					{restCamera !== null && (
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
								editing={editing}
								refused={refused}
								onAsk={() => askAgent(refused ?? undefined)}
								onOpenFile={(path, line) => copySourcePath(`${path}:${line}`)}
								marks={marks}
								marquee={marquee}
								dropLine={dropLine}
							/>
							{/* the agent's companions (#366), in the same screen space as the furniture
						    beside them: presence on any visible frame at any zoom, and a ring on
						    a located mark wherever a document was live enough to be measured */}
							<AgentCompanionLayer
								camera={camera}
								frames={visibleFrames}
								companions={companions}
								marks={locatedMarks}
								footed={askFooted}
							/>
							{(() => {
								// under its frame, or under the spot held for it while the frame is not there yet
								const at =
									standingAsk === null
										? undefined
										: (visibleFrames.find((one) => one.name === standingAsk.frame) ??
											(standingAsk.frame === null || !reach.have.has(standingAsk.frame)
												? (standingAsk.spot ?? undefined)
												: undefined));
								return standingAsk === null || at === undefined ? null : (
									<CanvasAsk
										key={standingAsk.entry.key}
										camera={camera}
										frame={at}
										entry={standingAsk.entry}
										onAnswer={turn.answer}
										leaving={footedShown === "leaving"}
									/>
								);
							})()}
							{/* teammates on a team canvas (DEV-196), over everything on the field */}
							{team && (
								<PresenceLayer room={presenceRoom} camera={camera} frames={visibleFrames} page={activePage} />
							)}
						</>
					)}
					{followed !== undefined && <FollowMark mate={followed} />}

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
							share={
								sharingAvailable
									? {
											shared: sharing.state(menu.frame)?.shared ?? sharing.listed(menu.frame),
											onCopy: () => {
												sharing.copy(menu.frame);
												setMenu(null);
											},
											onManage: () => {
												sharing.show(menu.frame);
												setMenu(null);
											},
											onStop: () => {
												sharing.show(menu.frame, "stop");
												setMenu(null);
											},
										}
									: undefined
							}
							onPlay={() => {
								const frame = menu.frame;
								setMenu(null);
								playFrame(frame);
							}}
							onCopyPath={() => {
								const pick = pickedRef.current.find((candidate) => candidate.frame === menu.frame);
								copySourcePath(pick !== undefined ? sourcePathOf(pick) : frameSourcePath(menu.frame));
								setMenu(null);
							}}
							onReload={() => {
								const frame = menu.frame;
								reloadFrameDocument(frame);
								setMenu(null);
							}}
							onSetThumbnail={
								frames.find((frame) => frame.name === menu.frame)?.cover === undefined
									? undefined
									: () => {
											const frame = menu.frame;
											setMenu(null);
											void setProjectThumbnail(project, frame).then(
												() => setNotice({ kind: "success", message: "Set as the project's thumbnail" }),
												(error: unknown) =>
													setNotice({
														kind: "error",
														message:
															error instanceof Error && error.message
																? error.message
																: "Could not set the thumbnail. Try again.",
													}),
											);
										}
							}
							onTrash={() => {
								const names = selectedRef.current.includes(menu.frame)
									? [...selectedRef.current]
									: [menu.frame];
								setMenu(null);
								stageTrash(names);
							}}
						/>
					)}

					{notice !== null ? <Toast notice={notice} /> : null}

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
								onUseAgent={root === undefined ? undefined : () => setAgentHandoff(true)}
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
							<p className="text-muted type-detail">
								an agent writes frames/{activePage}/&lt;name&gt;/frame.tsx
							</p>
						</div>
					)}
					{/* nothing to arrange, nothing to walk: the tools arrive with the first frame */}
					{!projectEmpty && <CanvasTools tool={effectiveTool} onTool={chooseTool} />}
					{finding ? (
						<PanePalette
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
			</PaneWindow>
			{sharing.node}
			{sharingPage !== null && (
				<ShareSheet
					page={sharingPage}
					pages={navigatorPages}
					walks={edges}
					onCreate={async (request) => {
						const answer = await pageShares.create(request);
						if ("share" in answer) window.dispatchEvent(new CustomEvent(SHARES_CHANGED));
						return answer;
					}}
					onClose={() => setSharingPage(null)}
				/>
			)}
			{setAside.node}
			{syncState}
			{agentHandoff && root !== undefined && (
				<AgentHandoff project={project} root={root} onClose={() => setAgentHandoff(false)} />
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

/**
 * The field: everything that lives in world space, carried by one transform.
 *
 * The transform is the camera's to write (#81), once per drawn frame, and
 * never React's: a render of the field is a render of its frames, and the
 * camera moving is exactly when none of them has changed. No `will-change`
 * either — promoting a layer holding hundreds of clipped, transformed frames
 * costs Chrome more per frame in re-deciding layers than it saves in paint.
 *
 * There are three, around the picture layer's canvas and the labels' own
 * field (`LabelField`): arrows and pages `under` the canvas, the frames'
 * shells over it (the field, `data-canvas-camera`, the one a test reads the
 * camera from), and `over` the labels the page labels and walk tags. All of
 * them follow the same camera callback the canvas draws in, so they move as
 * one.
 */
function CameraField({
	camera,
	layer = "frames",
	children,
}: {
	camera: CameraStore;
	layer?: "under" | "frames" | "over";
	children: ReactNode;
}) {
	const field = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ x, y, k }) => {
			if (field.current !== null) field.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
		},
		[],
	);
	return (
		<div
			ref={field}
			{...(layer === "frames" ? { "data-canvas-camera": "" } : { [`data-canvas-${layer}`]: "" })}
			className="absolute top-0 left-0"
			style={{ transformOrigin: "0 0" }}
		>
			{children}
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

/** The ⌘K palette, carrying the pane window's commands from inside it. */
function PanePalette(props: Omit<Parameters<typeof FindPalette>[0], "commands">) {
	return <FindPalette {...props} commands={usePaneCommands()} />;
}
