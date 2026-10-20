import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import type { Cover } from "../../cover";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { pageParent, pageWithin, ROOT_PAGE } from "../../page-path";
import { fulfillClipboardCopy, rejectClipboardCopy } from "../../runtime/clipboard-host";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { accelKeyName, accelPressed } from "../../runtime/platform-keys";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import { SETTINGS } from "../../settings/registry";
import type { Comment, Presence, PresenceState } from "../../team-sync-protocol";
import { AgentHandoff } from "../agent-handoff";
import type {
	Camera,
	FrameCopy,
	Geometry,
	Place,
	ProjectedFrame,
	SelectionEntry,
	SelectionPut,
	ShownSetAside,
} from "../api";
import {
	beaconTrash,
	coverUrl,
	daemonComments,
	daemonShares,
	fetchCanvasState,
	fetchCloudAccount,
	fetchFlows,
	fetchProjection,
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
	saveCanvasState,
	setProjectThumbnail,
	subscribeSse,
} from "../api";
import { desktopBridge } from "../desktop-bridge";
import { experimentOn } from "../experiments";
import { isLetGo } from "../gone-projects";
import { attachHotkeyLayer, type HotkeyHandler, runHotkey } from "../hotkey-dispatch";
import type { HotkeyId, HotkeyIdFor } from "../hotkeys";
import { AgentIcon, CommentIcon, FolderIcon, PropertiesIcon } from "../icons";
import { ProjectEmpty } from "../project-empty";
import { useSetting, useWriteSetting } from "../settings";
import { openShare, type ShareContext } from "../share-control";
import { useShares } from "../shares";
import { useStableCallback } from "../stable-callback";
import { beforeUpdate } from "../update-lifecycle";
import { type AskEntry, waitingAsk } from "./agent-ask-view";
import { CanvasAsk } from "./agent-canvas-ask";
import type { AgentCompanion } from "./agent-companion";
import { AgentDeckHost, createDeckStore, type DeckStore, useDeck, useWholeDeck } from "./agent-deck";
import { type AgentDefaultsDeck, useAgentDefaults } from "./agent-defaults";
import { type AgentModelDeck, useAgentModel } from "./agent-model";
import { FADE_OUT_MS, useHeld, useLeaving } from "./agent-motion";
import { frameHolding } from "./agent-nouns";
import { useAgentPermissions } from "./agent-permissions";
import { useAgentInstall } from "./agent-preflight";
import { AgentRail, type AgentRequest, type FrameJump } from "./agent-rail";
import type { AgentDeck } from "./agent-stream";
import type { AgentTile } from "./agent-transcript";
import { arrange } from "./arrange";
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
	moveCamera,
	type NearScreen,
	revealCamera,
	toWorld,
	visibleWorldRect,
	wheelPixels,
	wheelZoomFactor,
	zoomAt,
	zoomFloor,
} from "./camera";
import { type CameraStore, createCameraStore, useCameraFollow } from "./camera-store";
import {
	type CanvasContextMenu,
	createCanvasStore,
	navigatorFramesOf,
	navigatorPagesOf,
	pageObjectsOf,
	shareContextOf,
	toolOf,
	unseenOf,
	useCanvasField,
	useCanvasSetter,
	useCanvasState,
	visibleFramesOf,
	visiblePlaceholdersOf,
} from "./canvas-store";
import { type CanvasTool, CanvasTools } from "./canvas-tools";
import { audienceOf } from "./comment-audience";
import { COMMENT_CURSOR } from "./comment-cursor";
import { COMMENTS_CHANGE, daemonStills, useCommentPeople, useComments } from "./comments-daemon";
import {
	type CommentDraft,
	type CommentsContext,
	CommentsLayer,
	commentChip,
	commentWorld,
	MAC_OFFLINE,
} from "./comments-layer";
import { counts as commentCounts, pageCount } from "./comments-model";
import { CommentsPane } from "./comments-pane";
import { ContextMenu, contextMenuSize } from "./context-menu";
import { placeCopies } from "./copy-placement";
import { type Drop, dropAt } from "./element-move";
import { deepest, parentOf } from "./element-selection";
import { ExportDialog, type ExportFormat } from "./export-dialog";
import { FindPalette } from "./find-palette";
import { anchorKeyOf, createSiteBoxStore, FlowArrows } from "./flow-arrows";
import { useFrameAgents } from "./frame-agents";
import {
	buildFramePdf,
	type CapturedFrame,
	downloadBytes,
	framesInCanvasOrder,
	pngBytesFromImageBlob,
	pngFileName,
} from "./frame-export";
import { FrameLabel, LabelField, type OverviewRole } from "./frame-label";
import { createFrameReads } from "./frame-reads";
import { FrameShell, FrameSlot, ShellClip } from "./frame-shell";
import { askText, GONE, type ShownRefusal, secondClick } from "./hand-edit";
import {
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
import { FrameLife, type LifecycleStore, useDocumentsBooting, useFrameLifecycle, useFrameReady } from "./lifecycle";
import { overviewNeighbours, stepDirection } from "./live-moves";
import { watchMotionStrain } from "./motion-strain";
import { NoticeStack } from "./notice-stack";
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
import { OverviewCatcher, OverviewLayer } from "./overview-layer";
import { PageObjectLabel, PageObjectView } from "./page-object";
import { pageIsBare, pageObjectAt } from "./page-objects";
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
import { PlaceholderFrame } from "./placeholder-frame";
import { createPresenceRoom } from "./presence";
import { FollowMark, PresenceFaces } from "./presence-faces";
import { PresenceLayer } from "./presence-layer";
import { type Held, PropertiesRail, rungOf, stampsOf, useRungs } from "./properties-rail";
import {
	clipboardCopyAllowed,
	type Family,
	familyMessage,
	type KinStep,
	kinMessage,
	type PickedHit,
	parseFrameMessage,
	pickKey,
	pickMessage,
	type SessionRecord,
	type SiteAnchor,
	sessionReply,
	sharedStateMessage,
	sitesMessage,
	walkRejectionReason,
} from "./protocol";
import { useElementTree } from "./rail-elements";
import { setAsideAsk, useSetAside } from "./set-aside";
import { CanvasSidebar, type FrameSpan, type FrameVerbs, type RunEntry, type SelectModifiers } from "./sidebar";
import { type SnapMarks, snapEdge, snapMovedBox } from "./snap";
import { type SpatialTrail, stepSpatially } from "./spatial-navigation";
import { SYNC_CHANGED, useSyncState } from "./sync-state";
import { TeammatePlaceholder, teammateOf } from "./teammate-agents";
import { type Notice, NoticeToast } from "./toast";
import { TrashToast } from "./trash-toast";
import { ATTENTION_MS, advanceDwell, looked, TICK_MS } from "./unseen";
import { HOLD_PAINT_MS, PICK_REPLY_MS, useHandEdit } from "./use-hand-edit";
import { useLiveMoves } from "./use-live-moves";
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
	/** hands the project to an agent of one's own, for the bar's help; absent where there is no project folder */
	useAgent?: (() => void) | undefined;
	/** what the bar's Share reads as it opens: the page in front, the project's pages and frames, and its walks */
	share: () => ShareContext;
}

interface Point {
	x: number;
	y: number;
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

/** Relayed keys that count only from the frame that is entered. */
const ENTERED_ONLY_RELAYS: ReadonlySet<HotkeyId> = new Set([
	"canvas.zoom-in",
	"canvas.zoom-out",
	"app.next-tab",
	"app.previous-tab",
]);

/** Relayed keys that are chords under the platform's own accel, never the other modifier. */
const ACCEL_RELAYS: ReadonlySet<HotkeyId> = new Set([
	"app.next-tab",
	"app.previous-tab",
	"canvas.step-through",
	"canvas.thread-next",
	"canvas.thread-back",
]);

/**
 * Relayed moves between frames (DEV-295): from the frame that is live, or the
 * one a move just left, which keeps the keyboard until the one it landed on
 * has booted. Never from a frame merely running beside it.
 */
const LIVE_MOVE_RELAYS: ReadonlySet<HotkeyId> = new Set([
	"canvas.step",
	"canvas.step-through",
	"canvas.overview",
	"canvas.thread-next",
	"canvas.thread-back",
]);
const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 8;
const MIN_FRAME_SIZE = 40;
const NUDGE_FLUSH_MS = 400;
const SELECTION_PUT_MS = 150;
const TRASH_UNDO_MS = 5000;
const HOVER_PICK_MS = 80;
/** How long C is held before letting go of it hands back the tool it took over from, rather than keeping Comment. */
const COMMENT_HOLD_MS = 300;
/** How long a gesture made ahead of the selection's read waits for it before it refuses (DEV-299). */
const READ_WAIT_MS = 5000;
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

/** Opaque sandbox origins identify no frame; its current iframe window does. */
export function ownsFrameMessage(
	iframes: ReadonlyMap<string, Pick<HTMLIFrameElement, "contentWindow">>,
	frame: string,
	source: MessageEventSource | null,
): boolean {
	return source !== null && iframes.get(frame)?.contentWindow === source;
}

interface ProjectCanvasProps {
	project: string;
	root?: string;
	focusName?: boolean | undefined;
	onNameFocused?: (() => void) | undefined;
	onRename?: ((name: string) => Promise<string | null>) | undefined;
	onFolder?: (() => void) | undefined;
	onChrome: (chrome: CanvasChrome | null) => void;
}

/**
 * The canvas, with the project's agent threads running beside it rather than inside it
 * (task 169): a turn's ticks redraw the threads' host and the parts of the canvas that
 * read what moved, and the canvas element itself is made here, once, so they stop there.
 */
export function ProjectCanvas(props: ProjectCanvasProps) {
	// the machine's agent choice (#361): nothing agent-shaped is drawn until it has loaded
	const agentDefaults = useAgentDefaults(props.project);
	const [deck] = useState(createDeckStore);
	return (
		<AgentDeckHost
			store={deck}
			project={props.project}
			preferred={agentDefaults.engine ?? undefined}
			root={props.root}
		>
			<CanvasField {...props} deck={deck} agentDefaults={agentDefaults} />
		</AgentDeckHost>
	);
}

function CanvasField({
	project,
	root,
	onChrome,
	onRename,
	onFolder,
	focusName,
	onNameFocused,
	deck,
	agentDefaults,
}: ProjectCanvasProps & { deck: DeckStore; agentDefaults: AgentDefaultsDeck }) {
	/**
	 * The camera (#81): one value outside React, drawn once per animation frame
	 * by whatever follows it. A wheel tick moves it and renders nothing.
	 */
	const [camera] = useState(createCameraStore);
	/** What the canvas holds and every handler reads (DEV-304): one value outside React, read where it is drawn. */
	const [store] = useState(createCanvasStore);
	// pages shared with outsiders through spool.page (DEV-193), started from a page's right-click
	const pageShares = useMemo(() => daemonShares(project), [project]);
	const { shares: projectShares } = useShares(pageShares);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	// on the document rather than the viewport, which a booting canvas has not drawn yet
	useEffect(() => watchMotionStrain(camera, document.documentElement), [camera]);
	const [frames, setFrames] = useCanvasField(store, "frames");
	// the frames on their way: designers' placeholders, drawn dashed where their frames will land (#369)
	const [placeholders, setPlaceholders] = useCanvasField(store, "placeholders");
	// every read of the frame list, and the covers heard between them (frame-reads.ts)
	const [frameReads] = useState(createFrameReads);
	const [edges, setEdges] = useCanvasField(store, "edges");
	// the threads (#34): the arrows and the docked walks, one machine setting
	// rather than a top-bar switch, default on because the map is spool's identity
	const arrowsOn = useSetting("canvas.threads") ?? SETTINGS["canvas.threads"].fallback;
	const writeSetting = useWriteSetting();
	// frame-local boxes of navigation-site elements, as each frame's shim answers
	const [siteBoxes] = useState(createSiteBoxStore);
	const [loaded, setLoaded] = useState(false);
	/**
	 * Where the camera rests: there from the moment it is, and moved only once
	 * it has come to rest. What is decided at rest reads this — which documents
	 * mount, where the camera is remembered — and nothing that is drawn does,
	 * because a render is far too late for a camera in motion. Nor is a rest a
	 * render: what it decides it does in the store's own callback (`rested`),
	 * where a render of the canvas at every stop was most of a 61 ms task
	 * (DEV-303).
	 */
	const restCameraRef = useRef<Camera | null>(null);
	/** Whether there is a camera: the fields stand only while there is one to draw them from. */
	const [framed, setFramed] = useState(false);
	/**
	 * Put the camera somewhere without flying there. The field only stands while
	 * there is a camera to draw it from, so arriving at one or losing it is a
	 * render, in the same commit as whatever caused it; moving one never is.
	 */
	const placeCamera = useCallback(
		(next: Camera | null) => {
			const was = camera.get();
			camera.set(next);
			if ((was === null) !== (next === null)) {
				restCameraRef.current = next;
				setFramed(next !== null);
			}
		},
		[camera],
	);
	const [tool, setTool] = useCanvasField(store, "tool");
	const [selected, setSelected] = useCanvasField(store, "selected");
	const [picked, setPicked] = useCanvasField(store, "picked");
	const [entered, setEntered] = useCanvasField(store, "entered");
	const [hovered, setHovered] = useState<FrameHover | null>(null);
	// the hover preview (#37, #339): the element a click would take
	const [preview, setPreview] = useState<ElementPreview | null>(null);
	const [externalLink, setExternalLink] = useState<{ frame: string; href: string } | null>(null);
	const [accelDown, setAccelDown] = useCanvasField(store, "accelDown");
	const [spaceDown, setSpaceDown] = useCanvasField(store, "spaceDown");
	const [panning, setPanning] = useState(false);
	const [resizeCursor, setResizeCursor] = useState<string | null>(null);
	const [resizingFrame, setResizingFrame] = useState<string | null>(null);
	const [marks, setMarks] = useState<SnapMarks>(NO_MARKS);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [menu, setMenu] = useCanvasField(store, "menu");
	const [exportDialog, setExportDialog] = useCanvasField(store, "exportDialog");
	const [exportReturnMenu, setExportReturnMenu] = useState<CanvasContextMenu | null>(null);
	const [exporting, setExporting] = useCanvasField(store, "exporting");
	const [exportError, setExportError] = useState<string | undefined>(undefined);
	const [notice, setNotice] = useState<Notice | null>(null);
	// the frame finder (/): a palette over the viewport, and the page its pick lights
	const [finding, setFinding] = useCanvasField(store, "finding");
	const [findLit, setFindLit] = useState<string | null>(null);
	const [pendingTrash, setPendingTrash] = useCanvasField(store, "pendingTrash");
	const setHidden = useCanvasSetter(store, "hidden");
	// a page staged for the Trash leaves the rail with everything inside it, and
	// comes back whole if the toast is undone (#229)
	const [hiddenPages, setHiddenPages] = useCanvasField(store, "hiddenPages");
	/**
	 * Where the agent rail stands, and so which rail the right column is showing
	 * (#256).
	 *
	 * It starts as the strip: properties are what the column shows by default,
	 * and the agent is reached by pressing its edge. A width somebody dragged
	 * outlives the reload, as every rail's does.
	 */
	const [docNonces, setDocNonces] = useCanvasField(store, "docNonces");
	// the document each frame keeps on screen while its replacement boots
	// (#253's no blink): only a reload the canvas caused ever gets one
	const [heldPaint, setHeldPaint] = useState<Record<string, number>>({});
	// frames whose current boot is a walk arrival (#28): quiet cover, no veil
	const [walkArrivals, setWalkArrivals] = useCanvasField(store, "walkArrivals");
	// where an element being dragged would land (#340), as the line drawn there
	const [dropLine, setDropLine] = useState<{ frame: string; box: Box } | null>(null);
	// the in-place text edit that is open (#314), which is what hands the frame its pointer
	const [editing, setEditing] = useCanvasField(store, "editing");
	// how many times the hand has saved each frame without reloading it (#314):
	// a save rewrites the very file the element was read out of, so it is a fresh
	// read too, and the read has to carry the fingerprint the next write needs
	const [saves, setSaves] = useState<Record<string, number>>({});
	const [agentRequest, setAgentRequest] = useState<AgentRequest>();
	const [agentHandoff, setAgentHandoff] = useState(false);
	// pages (#39): the named pages on disk, the one the canvas shows, and the
	// names discovery refuses to resolve
	const [pages, setPages] = useCanvasField(store, "pages");
	const [activePage, setActivePage] = useCanvasField(store, "activePage");
	/**
	 * Who else is on a team project's canvas (DEV-196), as the event stream tells it, and whose view this
	 * canvas is following. A project of one's own has nobody and says nothing.
	 */
	const [presenceRoom] = useState(() => createPresenceRoom());
	const [team, setTeam] = useState(false);
	/** Read by the keys, which are attached once: whether this canvas has the Comment tool. */
	const teamRef = useRef(team);
	teamRef.current = team;
	/** C pressed: the tool it took over from and when, so letting go of a held C hands that tool back (spool#169). */
	const commentHold = useRef<{ before: CanvasTool; at: number; placed?: true } | null>(null);
	const comments = useComments(project, team);
	const commentPeople = useCommentPeople(project, team);
	const [following, setFollowing] = useState<string | null>(null);
	/** the account this Mac is signed in as, which tells this canvas's own placeholders from teammates' (#378) */
	const [you, setYou] = useState<string | null>(null);
	useEffect(() => {
		if (!team) return;
		let live = true;
		void fetchCloudAccount().then((account) => {
			if (live && account.state === "signed-in") setYou(account.accountId ?? null);
		});
		return () => {
			live = false;
		};
	}, [team]);
	/** who reads the comments here: this Mac's person, and when they last read each (spool#170) */
	const commentReader = useMemo(
		// the team says which of its people this Mac writes as; the signed-in account stands in until it has
		() => ({ me: commentPeople.find((person) => person.you)?.accountId ?? you, reads: comments.reads }),
		[commentPeople, you, comments.reads],
	);
	const [commentFilters] = useCanvasField(store, "commentFilters");
	const [commentOpen] = useCanvasField(store, "commentOpen");
	const [pinsHidden] = useCanvasField(store, "pinsHidden");
	const commentsClient = useMemo(() => daemonComments(project), [project]);
	const commentStills = useMemo(() => daemonStills(project), [project]);
	// the shares a new comment may be for besides the team (spool#174)
	const commentShares = useMemo(
		() => (projectShares?.state === "ready" ? projectShares.shares.map(audienceOf) : []),
		[projectShares],
	);
	const commentsContext: CommentsContext = {
		client: commentsClient,
		reader: commentReader,
		people: commentPeople,
		online: comments.online,
		unpaid: comments.unpaid,
		offline: MAC_OFFLINE,
		stills: commentStills,
		url: comments.url,
		refresh: comments.refresh,
		notice: setNotice,
		shares: commentShares,
	};
	/**
	 * Where each page stands on the field holding it (#265).
	 *
	 * The whole project's, not this page's: an object is drawn on its parent's
	 * field, so switching page changes which of these are on screen and none of
	 * what they say. The projection arrives with one for every page.
	 */
	const setPlaces = useCanvasSetter(store, "places");
	/**
	 * The page object the hand is holding, if any.
	 *
	 * A page is selected on its own: picking one clears the frame selection and
	 * the selection never holds both. One page rather than a list — multi-select
	 * across pages and frames is not in this.
	 */
	const [selectedPage, setSelectedPage] = useCanvasField(store, "selectedPage");
	const [hoveredPage, setHoveredPage] = useState<string | null>(null);

	// the active page is the canvas: only its frames mount — and frames staged
	// for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useCanvasState(store, visibleFramesOf);
	const visiblePlaceholders = useCanvasState(store, visiblePlaceholdersOf);
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
	const navigatorFrames = useCanvasState(store, navigatorFramesOf);
	const navigatorPages = useCanvasState(store, navigatorPagesOf);
	/** the pages standing on the field (#265) */
	const pageObjects = useCanvasState(store, pageObjectsOf);
	/**
	 * Everything standing on this field, as boxes: the frames and the pages
	 * (#265). What a fit has to take in, because a page of pages is nothing but
	 * objects and a camera that only knew frames landed on an empty view.
	 */
	const fieldBoxes = useCallback((): Box[] => {
		const state = store.get();
		return [
			...visibleFramesOf(state).map(({ x, y, w, h }) => ({ x, y, w, h })),
			...pageObjectsOf(state).map(({ x, y, w, h }) => ({ x, y, w, h })),
			...visiblePlaceholdersOf(state).map(({ x, y, w, h }) => ({ x, y, w, h })),
		];
	}, [store]);
	// the agent rail's turns (#192). They run beside the canvas (task 169), and a frame a
	// turn writes lands as an ordinary `change` event, so the canvas repaints while the
	// transcript is still arriving. What is read here is the little the canvas draws itself
	const deckOpen = useDeck(deck, (one) => one.open);
	const deckEngine = useDeck(deck, (one) => one.engine);
	const turnPhase = useDeck(deck, (one) => one.turn.phase);
	const threadWaiting = useDeck(deck, (one) => one.threads.some((thread) => thread.life === "waiting"));
	const threadElsewhere = useDeck(deck, (one) =>
		one.threads.some((thread) => thread.id !== one.open && thread.life !== "read"),
	);
	const permissions = useAgentPermissions(project, deckOpen, turnPhase, agentDefaults.mode);
	const syncState = useSyncState(project);
	// whether there is an agent on this machine at all (#201). A `which` rather than a
	// spawn, asked when the rail opens, because a missing binary is a fact about this
	// machine that is true before anybody types
	const install = useAgentInstall(project, deckEngine, deckOpen);
	/**
	 * Clashes' Ask agent to fix: one press opens a new thread and sends it every clashed file, with
	 * where both sides are. The rail opens on it. Where the rail has nowhere to put words yet, the
	 * composer holds them for the person to send. With no agent on this machine, the prompt is copied.
	 */
	const fixing = useRef<{ text: string; from: string } | null>(null);
	const onNewThread = useCallback(() => deck.get().onNew(), [deck]);
	const noAgent = install.none;
	const fixClashes = useMemo(
		() => ({
			label: noAgent ? "Copy prompt" : "Ask agent to fix",
			run: (marks: readonly ShownSetAside[]) => {
				const text = setAsideAsk(marks);
				if (noAgent) {
					void navigator.clipboard
						?.writeText(text)
						.then(() => setNotice({ kind: "success", message: "Prompt copied: paste it into your agent" }));
					return;
				}
				fixing.current = { text, from: deck.get().open };
				onNewThread();
			},
		}),
		[noAgent, onNewThread, deck],
	);
	useEffect(() => {
		const asked = fixing.current;
		// the new thread is open: the words go to it
		if (asked === null || asked.from === deckOpen) return;
		fixing.current = null;
		const turn = deck.get().turn;
		const took = turn.running() ? turn.queue(asked.text) : turn.send(asked.text);
		setAgentRequest({
			id: crypto.randomUUID(),
			thread: deckOpen,
			...(took ? {} : { prepared: { intent: "set-aside", text: asked.text, selection: [] } }),
		});
	}, [deckOpen, deck]);
	const setAside = useSetAside(project, fixClashes);
	// which machine is answering, asked of that machine rather than shipped (#118, #199).
	// Keyed on the open thread, because that is what the answer is about: the rows are the
	// binary's and the same for every thread, and which of them is answering is not.
	const offeredModel = useAgentModel(project, deckOpen, deckEngine);
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
		const gone = new Set([...seenFrames.current].filter((name) => !here.has(name)));
		// a designer's placeholder is a place to go too, from the moment it starts (#369)
		for (const one of placeholders) here.add(one.name);
		return { have: here, gone };
	}, [navigatorFrames, placeholders]);
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
	// a press on another frame while one was live, which its release enters
	const clickSwitch = useRef<{ from: string; to: string } | null>(null);
	// the frames on the page shown, as the lifecycle reads them: a ref onto the store
	const [framesRef] = useState(() => ({
		get current() {
			return visibleFramesOf(store.get());
		},
	}));
	// every page's last known camera this session, keyed by page (#39)
	const cameras = useRef<Record<string, Camera>>({});
	/** The last screen point a relayed middle-button drag reported (#8). */
	const framePan = useRef<Point | null>(null);
	// ⌘ no longer borrows Select — Select is the base, and ⌘ is its element
	// modifier. Space is the only transient left.
	const effectiveTool = toolOf({ tool, spaceDown });
	/**
	 * Whether the Edit tool is on (#339): picked, or borrowed by holding ⌘ in
	 * Select. Space borrowing the Hand does not put it down. While it is on,
	 * every live frame holds its animation and nothing reaches any of them.
	 */
	const editOn = tool === "edit" || (tool === "select" && accelDown);
	/** The Comment tool holds the field still as Edit does (spool#169): frames are inert under the pin. */
	const frozen = editOn || tool === "comment";
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
	// the way back along ⌥-arrow steps, dropped once the selection moves any other way
	const spatialTrail = useRef<SpatialTrail | null>(null);
	useEffect(() => {
		const trail = spatialTrail.current;
		if (trail !== null && (selected.length !== 1 || selected[0] !== trail.at)) spatialTrail.current = null;
	}, [selected]);
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
	/**
	 * The frames the canvas has reloaded whose new document has not said
	 * loaded yet (#340), and what waits on it: a ring put back on an element
	 * asks the document it is in, and a document still booting answers nobody.
	 */
	const reloading = useRef(new Set<string>());
	const loadWaiters = useRef(new Map<string, (() => void)[]>());
	/** the frame's answer to a whole generation: children or siblings (#339) */
	const generationWaiters = useRef(new Map<number, (answer: { chain: PickedHit[]; hits: PickedHit[] }) => void>());
	// a press on the element already held, acted on at pointer-up (#255)
	const pressOnHeld = useRef<{ pick: PickedSelection; local: Point } | null>(null);
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
		// the Edit tool holds the whole field still while it is on (#319, #339), and so does Comment
		editing: frozen,
		cameraRef: restCameraRef,
		viewportRef,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;
	// which frames hold a document and which have reported in, read without a render of the canvas
	const frameLife = lifecycle.store;
	const sweepLifecycle = lifecycle.sweep;
	const noteCameraMoving = lifecycle.noteCameraMoving;
	const contentRequest = useRef(0);
	const contentSize = useRef<{ frame: string; width: number; height: number } | null>(null);
	const resizingWidth = frames.find((frame) => frame.name === resizingFrame)?.w;
	const resizingReady = useFrameReady(frameLife, resizingFrame);
	useEffect(() => {
		contentRequest.current += 1;
		if (resizingFrame === null || resizingWidth === undefined) {
			contentSize.current = null;
			return;
		}
		if (contentSize.current?.width !== Math.round(resizingWidth)) contentSize.current = null;
		if (!resizingReady) return;
		iframes.current
			.get(resizingFrame)
			?.contentWindow?.postMessage({ spool: "content-size", id: contentRequest.current }, "*");
	}, [resizingFrame, resizingWidth, resizingReady]);

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

	const reloadFrameDocument = useCallback(
		(frame: string) => {
			// a reload the canvas caused holds its outgoing document on screen
			// until the new one reports arrived (#253's no blink); the timer is the
			// bound, because a document that never arrives must not leave a dead
			// one standing in front of it
			const was = store.get().docNonces[frame] ?? 0;
			reloading.current.add(frame);
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
			if (store.get().editing?.frame === frame) setEditing(null);
			saved.current.delete(frame);
			setWalkArrivals((current) => withoutFrame(current, frame));
			// a reload drops every pick in the frame: the new document is asked afresh
			setPicked((current) => current.filter((pick) => pick.frame !== frame));
			if (pickedChain.current?.frame === frame) holdChain(null);
			setPreview((current) => (current?.frame === frame ? null : current));
		},
		[holdChain, releaseHold, store],
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
			if (store.get().picked.some((pick) => pick.frame === frame)) {
				writtenUnderHand.current.add(frame);
				return;
			}
			reloadFrameDocument(frame);
		},
		[reloadFrameDocument, store],
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
			const ordered = framesInCanvasOrder(visibleFramesOf(store.get()), names);
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
		[capturePng, project, store],
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
			setExportDialog(framesInCanvasOrder(visibleFramesOf(store.get()), names).map((frame) => frame.name));
		},
		[runExport, store],
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
		setPlaceholders(projection.placeholders ?? []);
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
	const setRead = useCanvasSetter(store, "read");
	const unseen = useCanvasState(store, unseenOf);
	/** the last thing a person did here: the dwell clock stops when it goes stale */
	const attention = useRef(Date.now());
	const dwell = useRef(new Map<string, number>());
	const reading = useRef(new Set<string>());
	const readFlush = useRef<number | null>(null);

	const markRead = useCallback(
		(names: readonly string[]) => {
			const fresh = names.filter((name) => unseenOf(store.get()).has(name));
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
		[project, refetchFrames, store],
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
			const looking = visibleFramesOf(store.get())
				.filter((frame) => unseenOf(store.get()).has(frame.name) && looked(frame, cam, vw, vh))
				.map((frame) => frame.name);
			const crossed = advanceDwell(dwell.current, looking);
			if (crossed.length > 0) markRead(crossed);
		}, TICK_MS);
		return () => window.clearInterval(timer);
	}, [unseen.size, markRead, camera, store]);

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

	const siteBoxSeq = useRef(0);
	const siteBoxExpected = useRef(new Map<string, number>());

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
	const requestSiteBoxes = useCallback(
		(frame: string) => {
			const target = iframes.current.get(frame)?.contentWindow;
			if (target == null) return;
			const anchors: SiteAnchor[] = [];
			const seen = new Set<string>();
			for (const edge of store.get().edges) {
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
		},
		[store],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies(edges): the graph moving is the trigger — the request reads it through the ref
	useEffect(() => {
		for (const name of iframes.current.keys()) requestSiteBoxes(name);
	}, [edges, requestSiteBoxes]);

	// where each working agent is on the canvas (#366). A call on a file in a frame's own
	// subfolder names that subfolder (#336): the agent is at the frame holding it
	const ownCompanions = useDeck(deck, (one) => one.turn.companions, sameCompanions);
	const companions = useMemo(
		() =>
			ownCompanions.map((one) =>
				one.frame === null ? one : { ...one, frame: frameHolding(one.frame, reach.have) },
			),
		[ownCompanions, reach],
	);
	/** the agents at each frame and placeholder, this canvas's and teammates', said on its name row */
	const agentsAt = useFrameAgents(presenceRoom, companions, team);
	/** the agent's rail is on screen; shut, an ask stands on the canvas under its frame */
	const [railShown, setRailShown] = useState(true);
	/** whether the Comments tab is on screen, so its dot says news only while it isn't */
	const [commentsShown, setCommentsShown] = useState(false);
	const askFooted = !railShown && turnPhase === "asking";
	const answerAsk = useCallback(
		(request: string, reply: AgentReply) => deck.get().turn.answer(request, reply),
		[deck],
	);
	const askStanding = useDeck(deck, (one) => (askFooted ? standingAskOf(one.turn.entries) : null));
	/**
	 * The ask that stands on the canvas, and what it hangs from: the frame its agent is at,
	 * or the spot reserved for a designer's frame before it has one. None where it is about
	 * neither.
	 */
	const footedAsk = useMemo(() => {
		const entry = askStanding;
		if (entry === null) return null;
		const by = companions.find(
			(one) => one.key === (entry.delegation ?? "") && (one.frame !== null || one.spot !== null),
		);
		if (by === undefined) return null;
		return { entry, frame: by.frame, spot: by.spot };
	}, [askStanding, companions]);
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
	useEffect(
		() =>
			frameLife.subscribe(() => {
				const alive = (name: string) =>
					name === walkTarget.current || (frameLife.states[name] ?? "picture") !== "picture";
				// asked of the last render's first, so a report is no render of the canvas
				if ([...store.get().walkArrivals].every(alive)) return;
				setWalkArrivals((current) => {
					const kept = [...current].filter(alive);
					return kept.length === current.size ? current : new Set(kept);
				});
			}),
		[frameLife, store],
	);

	// no stored camera: fit the field once both viewport and field exist
	useLayoutEffect(() => {
		if (framed || !loaded) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		const boxes = fieldBoxes();
		placeCamera(
			boxes.length === 0
				? { x: 0, y: 0, k: 1 }
				: fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight),
		);
	}, [framed, loaded, fieldBoxes, placeCamera]);

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
		if (visibleFramesOf(store.get()).length > 0 || pageObjectsOf(store.get()).length === 0) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		placeCamera(fitCamera(boundsOf(fieldBoxes()), viewport.clientWidth, viewport.clientHeight));
	}, [loaded, activePage, fieldBoxes, placeCamera, store]);

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
			const viewport = viewportRef.current;
			const boxes = fieldBoxes();
			// out no further than the whole page fitting the view (DEV-289)
			const floor =
				viewport === null || boxes.length === 0
					? undefined
					: zoomFloor(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight);
			const next = zoomAt(cam, cx, cy, factor, floor);
			if (animate) camera.fly(next, 140);
			else camera.set(next);
		},
		[camera, fieldBoxes],
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
			page: store.get().activePage,
			camera: { x: cam.x, y: cam.y, k: cam.k },
			entered: store.get().entered,
			selected: [...store.get().selected],
			picked: [...store.get().picked],
		};
	}, [camera, store]);

	const recordDeparture = useCallback(() => {
		const from = jumpSpot();
		if (from !== undefined) jumpList.current = recordJump(jumpList.current, from);
	}, [jumpSpot]);

	/**
	 * Enter one frame as a fresh preview root: no carried session, no witnessed edge.
	 * A move from another live frame (DEV-295) says so with the camera it moves
	 * from, and lands on moveCamera rather than entryCamera.
	 */
	const enterFrame = useCallback(
		(target: string, move?: { from: Camera | null }) => {
			const frame = visibleFramesOf(store.get()).find((candidate) => candidate.name === target);
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
			const next =
				move === undefined
					? entryCamera(cam, frame, viewport.clientWidth, viewport.clientHeight)
					: moveCamera(move.from ?? cam, frame, viewport.clientWidth, viewport.clientHeight);
			// standing still is not a flight: a 220ms animation to where you
			// already are would fight a wheel that arrives inside it
			if (next.x !== cam.x || next.y !== cam.y || next.k !== cam.k) camera.fly(next);
		},
		[camera, store],
	);

	const exitEntered = useCallback(
		(retainFrame = false) => {
			const frame = store.get().entered;
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
		},
		[store],
	);

	/**
	 * Picking a tool (#321). The Edit tool is never inside a frame: taking it
	 * while one is live steps back out of it, holding that frame as the
	 * selection, so ⏎ goes on from there into its elements (#339).
	 */
	const chooseTool = useCallback(
		(next: CanvasTool) => {
			if ((next === "edit" || next === "comment") && store.get().entered !== null) exitEntered(true);
			setTool(next);
		},
		[exitEntered, store],
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
			for (const frame of visibleFramesOf(store.get())) {
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
		[project, refetchFrames, updateHistory, store],
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
			const next = { ...store.get().places, ...moved };
			setPlaces(next);
			void putPlaces(project, next).then((ok) => {
				if (!ok) void refetchFrames();
			});
		},
		[project, refetchFrames, store],
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
			const names = store.get().selected;
			if (names.length === 0) return;
			for (const frame of visibleFramesOf(store.get())) {
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
		[flushNudge, store],
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
			const was = visibleFramesOf(store.get()).find((frame) => frame.name === name);
			if (was === undefined) return;
			const before = { x: Math.round(was.x), y: Math.round(was.y), w: Math.round(was.w), h: Math.round(was.h) };
			const after = { ...before, ...patch };
			const entry = entryOf({ [name]: before }, { [name]: after });
			if (entry === undefined) return;
			updateHistory(record(history.current, entry));
			applyRects({ [name]: after });
		},
		[applyRects, updateHistory, store],
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
	 * The rail made the copies and the canvas owns the plane, so where they
	 * stand is written here (copy-placement.ts), and they end up selected. It
	 * takes no undo slot of its own — the rail's mint entry is the one undo, and
	 * there is nothing to put back, because the copies were not anywhere a
	 * moment ago.
	 */
	const cascadeCopies = useCallback(
		(copies: readonly FrameCopy[], beside: boolean) => {
			const cam = camera.get();
			const viewport = viewportRef.current;
			const view =
				cam === null || viewport === null
					? null
					: visibleWorldRect(cam, viewport.clientWidth, viewport.clientHeight, 0);
			const rects = placeCopies(copies, store.get().frames, { beside, viewPage: store.get().activePage, view });
			if (Object.keys(rects).length > 0) void putGeometry(project, rects);
			const landed = copies.map((copy) => copy.to);
			if (landed.length === 0) return;
			setPicked([]);
			holdChain(null);
			setSelected(landed);
			frameAnchor.current = landed[0] ?? null;
		},
		[holdChain, project, camera, store],
	);

	/** The rail's copy, paste and duplicate, which the canvas's ⌘C, ⌘V and ⌘D run. */
	const frameVerbs = useRef<FrameVerbs | null>(null);

	/** What a history entry is checked against: the disk as the canvas has it now. */
	const liveness = useCallback(
		(): Liveness => ({
			frames: new Map(store.get().frames.map((frame) => [frame.name, pageOf(frame)])),
			pages: new Set(store.get().pages),
			pending: store.get().pendingTrash,
		}),
		[store],
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
		const selection = store.get().selected;
		const scope =
			selection.length > 1
				? visibleFramesOf(store.get()).filter((frame) => selection.includes(frame.name))
				: visibleFramesOf(store.get());
		if (scope.length < 2) return;
		const before = Object.fromEntries(
			scope.map((frame) => [frame.name, { x: frame.x, y: frame.y, w: frame.w, h: frame.h }]),
		);
		const rects = arrange(scope, store.get().edges);
		const entry = entryOf(before, rects);
		if (entry === undefined) return; // already tidy: nothing to undo
		updateHistory(record(history.current, entry));
		applyRects(rects);
	}, [applyRects, flushNudge, updateHistory, store]);

	// --- trash (#23): instant canvas removal, disk move deferred on the toast ---

	const commitTrash = useCallback(() => {
		const staged = store.get().pendingTrash;
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
	}, [project, refetchFrames, store]);

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
			if (page !== null && (store.get().activePage === page || pageWithin(page, store.get().activePage))) {
				leavePage.current(ROOT_PAGE);
			}
			setHidden((current) => new Set([...current, ...staged.frames]));
			if (page !== null) setHiddenPages((current) => new Set([...current, page]));
			setSelected((current) => current.filter((name) => !staged.frames.includes(name)));
			setPicked((current) => {
				const kept = current.filter((pick) => !staged.frames.includes(pick.frame));
				return kept.length === current.length ? current : kept;
			});
			const entered = store.get().entered;
			if (entered !== null && staged.frames.includes(entered)) exitEntered();
			setPendingTrash(staged);
			trashTimer.current = setTimeout(commitTrash, TRASH_UNDO_MS);
		},
		[commitTrash, exitEntered, store],
	);

	const stageTrash = useCallback((names: string[]) => stageEntry({ frames: names, page: null }), [stageEntry]);

	const undoTrash = useCallback(() => {
		const staged = store.get().pendingTrash;
		if (staged === null) return;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		setHidden((current) => new Set([...current].filter((name) => !staged.frames.includes(name))));
		setHiddenPages((current) => new Set([...current].filter((page) => page !== staged.page)));
	}, [store]);

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
					: store.get().picked.find((held) => held.frame === from.frame && held.selector === from.selector);
			setAgentRequest({
				id: crypto.randomUUID(),
				thread: deck.get().open,
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
		[deck, store],
	);

	/**
	 * "Send to agent" on a comment's card (spool#172): through the same door as Ask the agent, the composer takes
	 * focus on the open thread holding the comment as a chip. Nothing runs until the person sends.
	 */
	const sendCommentToAgent = useCallback(
		(comment: Comment) =>
			setAgentRequest({
				id: crypto.randomUUID(),
				thread: deck.get().open,
				comment: { id: comment.id, label: commentChip(comment) },
			}),
		[deck],
	);

	/** Whether a write landed outside the frame's own folder: in a shared definition's file (#318). */
	const sharedWrite = useCallback(
		(frame: string, path: string): boolean => {
			const held = store.get().frames.some((entry) => entry.name === frame);
			return !held || !path.startsWith(`design/${frameFolderRel(frame)}`);
		},
		[store],
	);

	/** Whether the hand is still in a frame: selected, an element of it held, or entered. */
	const frameHeld = useCallback(
		(frame: string) =>
			store.get().selected.includes(frame) ||
			store.get().picked.some((pick) => pick.frame === frame) ||
			store.get().entered === frame,
		[store],
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

	// leaving the page (or the tab) mid-toast: the staged move still happens
	useEffect(() => {
		const flush = () => {
			const staged = store.get().pendingTrash;
			if (staged === null) return;
			setPendingTrash(null);
			beaconTrash(project, [...staged.frames], staged.page === null ? [] : [staged.page]);
		};
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [project, store]);

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

	/** Tab and ⇧Tab: round the siblings of the one element held. */
	const walkSibling = useCallback(
		(step: "next" | "previous"): boolean => {
			const held = store.get().picked.length === 1 ? store.get().picked[0] : undefined;
			if (store.get().entered !== null || held === undefined) return false;
			walkKin(held.frame, held.selector, step);
			return true;
		},
		[walkKin, store],
	);

	/**
	 * Esc and ⇧⏎ (#339): the parent of what is held, element → parent → … →
	 * frame → nothing. Several held elements climb together to the parent
	 * they share, and to their frames where they share none. False when there
	 * was nothing to climb, which is what lets Esc carry on down its own list
	 * of meanings.
	 */
	const selectParent = useCallback((): boolean => {
		const held = store.get().picked;
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
		if (store.get().selected.length > 0) {
			setSelected([]);
			return true;
		}
		return false;
	}, [holdChain, holdFrame, store]);

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
		const anchor = store.get().picked[store.get().picked.length - 1];
		if (store.get().entered !== null || anchor === undefined) return false;
		selectGeneration(anchor.frame, anchor.selector, "siblings");
		return true;
	}, [selectGeneration, store]);

	// --- the hand's edit lane: words, delete, move and undo (#314–#340) ---------

	const {
		noteRead,
		readSettled,
		showRefusal,
		endEdit,
		beginTextEdit,
		openHeld,
		openAt,
		openWords,
		finishEdit,
		deleteElement,
		moveBeside,
		moveStep,
		walkHand,
		restored,
		altered,
		refused,
	} = useHandEdit({
		project,
		store,
		picked,
		iframes,
		pickSeq,
		reloading,
		holdNext,
		saved,
		pickedChain,
		generationWaiters,
		viewportRef,
		history,
		setEditing,
		setPicked,
		setSelected,
		setSaves,
		setNotice,
		updateHistory,
		recordEntry,
		reloadFrameDocument,
		frameHeld,
		sharedWrite,
		holdChain,
		holdFrame,
		whenLoaded,
		walkKin,
		repick,
		selectGeneration,
		beginPick,
		applyPick,
		askFrame,
	});

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
	useEffect(() => {
		const holding = new Set<string>(JSON.parse(heldKey));
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
				const current = store.get().picked;
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
		[beginPick, holdChain, store],
	);

	/** The tree grammar on frame rows: shift ranges, ⌘ toggles, click replaces. */
	const selectFrameRow = (name: string, modifiers: SelectModifiers, span?: FrameSpan) => {
		const frame = navigatorFrames.find((candidate) => candidate.name === name);
		if (frame === undefined) return;
		const targetPage = pageOf(frame);
		const changedPage = targetPage !== store.get().activePage;
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
			setSelected(modifiers.toggle && !changedPage ? [...new Set([...store.get().selected, ...range])] : [...range]);
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
		if (anchor === null || held === undefined || pageOf(held) !== store.get().activePage) return;
		const range = span(anchor);
		if (range.length === 0) return;
		setTool("select");
		setPicked([]);
		holdChain(null);
		setSelected([...range]);
	};

	const flyToFrame = (name: string) => {
		const frame = visibleFramesOf(store.get()).find((candidate) => candidate.name === name);
		const viewport = viewportRef.current;
		if (frame === undefined || viewport === null) return;
		recordDeparture();
		camera.fly(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
	};

	/**
	 * A row in the Comments tab (spool#170): its card opens, and the camera flies to its pin, zoom kept, landing on
	 * its page first when it is another's. A comment whose page is gone has no pin: its card opens where it can.
	 */
	const flyToComment = (comment: Comment) => {
		store.set({ commentOpen: comment.id, commentDraft: null });
		const viewport = viewportRef.current;
		const cam = camera.get();
		if (comment.standing === "deleted-page" || viewport === null || cam === null) return;
		const frames = store.get().frames.filter((frame) => pageOf(frame) === comment.page);
		const world = commentWorld(comment, frames);
		if (world === undefined) return;
		const aim = {
			k: cam.k,
			x: viewport.clientWidth / 2 - world.x * cam.k,
			y: viewport.clientHeight / 2 - world.y * cam.k,
		};
		recordDeparture();
		if (comment.page !== store.get().activePage) switchToPage(comment.page, aim);
		else camera.fly(aim);
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
			if (store.get().activePage === target) return;
			flushNudge();
			commitTrash();
			clearCanvasSelection();
			exitEntered();
			setMenu(null);
			setExternalLink(null);
			camera.stop();
			const next = switchPage(cameras.current, store.get().activePage, camera.get(), target, arriveAt);
			cameras.current = next.cameras;
			setActivePage(target);
			// placed by the commit that swaps the field, so both are drawn by one frame
			arrival.current = { page: target, camera: next.camera, ...(then === undefined ? {} : { then }) };
		},
		[flushNudge, commitTrash, clearCanvasSelection, exitEntered, camera, store],
	);
	leavePage.current = switchToPage;
	/** Page-folder clicks return selection to the page, even when it is already active. */
	const activatePageFromTree = useCallback(
		(target: string) => {
			if (store.get().activePage !== target) {
				recordDeparture();
				switchToPage(target);
				return;
			}
			clearCanvasSelection();
		},
		[clearCanvasSelection, recordDeparture, switchToPage, store],
	);
	/** ⏎, ⌘↓ and the double-click: inside a page object, as into a frame (#265) */
	const goInsidePage = useCallback(
		(page: string) => {
			setSelectedPage(null);
			activatePageFromTree(page);
		},
		[activatePageFromTree],
	);
	/**
	 * Esc's last layer and ⌘↑: up to the page holding this one, landing with
	 * the page object just left selected, the way Finder lands on the folder.
	 * False on the root page, where there is nowhere up to go.
	 */
	const goUpPage = useCallback((): boolean => {
		const here = store.get().activePage;
		if (here === ROOT_PAGE) return false;
		recordDeparture();
		switchToPage(pageParent(here));
		setSelectedPage(here);
		return true;
	}, [recordDeparture, switchToPage, store]);

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
		(target: string, session: SessionRecord | null, aim: typeof centerOn = centerOn) => {
			recordDeparture();
			const across = store.get().frames.find((f) => f.name === target);
			// a frame on another page is the arrival's to place, not this flight's
			const leaving = across !== undefined && pageOf(across) !== store.get().activePage;
			if (leaving) switchToPage(pageOf(across), arrivalAt(across));
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
			const frame = leaving ? undefined : visibleFramesOf(store.get()).find((f) => f.name === target);
			const viewport = viewportRef.current;
			const cam = camera.get();
			if (frame !== undefined && viewport !== null && cam !== null) {
				camera.fly(aim(cam, frame, viewport.clientWidth, viewport.clientHeight));
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
		[recordDeparture, switchToPage, arrivalAt, camera, store],
	);

	// moving between frames while live (DEV-295): the ⌥ overview, steps that
	// land entered, the walk along the threads, and the live chip's landing
	const live = useLiveMoves({
		camera,
		viewportRef,
		store,
		enterFrame: (name, from) => enterFrame(name, { from }),
		walkTo: (name) => walkTo(name, null, moveCamera),
		select: (name, trail) => {
			setSelectedPage(null);
			setSelected([name]);
			setPicked([]);
			spatialTrail.current = trail;
		},
		focusFrame: (name) => iframes.current.get(name)?.focus(),
		landOn: (name) => landOnFrameRef.current(name),
		selectionIdle: () =>
			gesture.current.kind === "idle" &&
			store.get().editing === null &&
			toolOf(store.get()) === "select" &&
			store.get().selectedPage === null &&
			store.get().picked.length === 0,
	});
	const liveRef = useRef(live);
	liveRef.current = live;
	// the finder's landing, defined further down, for a thread that leaves the page
	const landOnFrameRef = useRef<(name: string) => void>(() => {});

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
			if (entry.page !== store.get().activePage) {
				switchToPage(entry.page, entry.camera);
			} else {
				if (store.get().entered !== null) exitEntered();
				clearCanvasSelection();
				setMenu(null);
				camera.fly(entry.camera);
			}
			const onPage = new Set(
				store
					.get()
					.frames.filter((frame) => pageOf(frame) === entry.page)
					.map((frame) => frame.name),
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
		[switchToPage, exitEntered, clearCanvasSelection, camera, store],
	);

	const jumpBack = useCallback(() => {
		const from = jumpSpot();
		if (from === undefined) return;
		const taken = takeBack(jumpList.current, from, new Set([ROOT_PAGE, ...store.get().pages]));
		if (taken === undefined) return;
		jumpList.current = taken.jumps;
		arriveAtJump(taken.entry);
	}, [jumpSpot, arriveAtJump, store]);

	const jumpForward = useCallback(() => {
		const from = jumpSpot();
		if (from === undefined) return;
		const taken = takeForward(jumpList.current, from, new Set([ROOT_PAGE, ...store.get().pages]));
		if (taken === undefined) return;
		jumpList.current = taken.jumps;
		arriveAtJump(taken.entry);
	}, [jumpSpot, arriveAtJump, store]);

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
		void refetchFrames();
		void refetchFlows();
		// a wait that ended while the stream was down would otherwise stay said until the window is focused again
		window.dispatchEvent(new CustomEvent(SYNC_CHANGED));
		for (const frame of store.get().frames) reloadFrameDocument(frame.name);
	}, [refetchFrames, refetchFlows, reloadFrameDocument, store]);

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
		const frames = framesOnScreen(visibleFramesOf(store.get()), restCameraRef.current, {
			width: viewport.clientWidth,
			height: viewport.clientHeight,
		});
		const scheme = frameScheme();
		const told = JSON.stringify([view, store.get().activePage, frames, scheme]);
		if (told === toldView.current) return;
		toldView.current = told;
		putCanvasView(project, { view, page: store.get().activePage, frames, scheme });
	}, [project, store]);
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
		if (framed && loaded) tellView();
	}, [framed, loaded, activePage, visibleFrames, tellView]);

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
					// and where this person is, said again: the daemon may be new, or have said they left meanwhile
					insideFrameRef.current.again();
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
					if (event.kind === "set-aside") window.dispatchEvent(new CustomEvent("spool-set-aside-change"));
					if (event.kind === "comments") window.dispatchEvent(new CustomEvent(COMMENTS_CHANGE));
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
						const staled = event.frames ?? visibleFramesOf(store.get()).map((frame) => frame.name);
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
		store,
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
					const frame = visibleFramesOf(store.get()).find((entry) => entry.name === message.frame);
					if (frame === undefined || message.width !== Math.round(frame.w)) return;
					if (message.height !== null)
						contentSize.current = { frame: message.frame, width: message.width, height: message.height };
					return;
				}
				case "copy": {
					const source = event.source as WindowProxy;
					const blocked = departedFrameDocuments.current.has(message.frame);
					const known = store.get().frames.some((candidate) => candidate.name === message.frame);
					if (!clipboardCopyAllowed(known, store.get().entered === message.frame, blocked)) {
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
					liveRef.current.loaded(message.frame);
					// what waited on this document being there can ask it now (#340)
					reloading.current.delete(message.frame);
					const waiting = loadWaiters.current.get(message.frame) ?? [];
					loadWaiters.current.delete(message.frame);
					for (const then of waiting) then();
					// a completed boot retires its walk cover — later reboots are honest
					setWalkArrivals((current) => withoutFrame(current, message.frame));
					// the keyboard follows the walk: an entered frame owns it (#28)
					if (store.get().entered === message.frame) iframes.current.get(message.frame)?.focus();
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
					const own = store.get().frames.find((candidate) => candidate.name === message.frame);
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
					const own = store.get().frames.find((candidate) => candidate.name === message.frame);
					if (own === undefined) return;
					const page = pageOf(own);
					pageSessions.current.set(page, { scenario: message.scenario, state: message.state, stack: [] });
					for (const [name, iframe] of iframes.current) {
						if (name === message.frame) continue;
						const sibling = store.get().frames.find((candidate) => candidate.name === name);
						if (sibling === undefined || pageOf(sibling) !== page) continue;
						iframe.contentWindow?.postMessage(sharedStateMessage(message.state), "*");
					}
					return;
				}
				case "external":
					if (store.get().entered === message.frame) {
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
					const held = store.get().editing;
					if (held === null || held.id !== message.id) return;
					if (!message.ok) {
						setEditing(null);
						const tag = store
							.get()
							.picked.find((pick) => pick.frame === held.frame && pick.selector === held.selector)?.tag;
						showRefusal({
							frame: held.frame,
							selector: held.selector,
							refusal: GONE,
							asked: `Change the words of the ${tag ?? "element"}`,
						});
						return;
					}
					setEditing({ ...held, start: message.text });
					return;
				}
				case "edited": {
					const held = store.get().editing;
					if (held === null || held.id !== message.id) return;
					finishEdit(held, message.commit, message.nodes, message.owner);
					return;
				}
				case "restored":
					restored(message.id, message.ok);
					return;
				case "altered": {
					altered(message.id, {
						ok: message.ok,
						owner: message.owner,
						...(message.chain === undefined ? {} : { chain: message.chain }),
						...(message.held === undefined ? {} : { held: message.held }),
					});
					return;
				}
				case "site-boxes": {
					// only the newest request per frame applies — a slow reply from a
					// superseded document must not re-anchor arrows to dead geometry
					if (siteBoxExpected.current.get(message.frame) !== message.id) return;
					siteBoxExpected.current.delete(message.frame);
					siteBoxes.set(message.frame, message.boxes);
					return;
				}
				case "key":
					// an entered frame owns the keyboard; the shim forwards what the
					// register relays out of it — from any frame: a walked-away source
					// legitimately still holds focus, and its chord means the same
					// thing (#28). The zoom chords only ever moved the camera for the
					// frame that is entered. Each runs its register entry, so the relay
					// can never drift from what the same key does out here.
					// The tab keys too: a frame left running beside the entered one,
					// a teammate's on a timer say, must not switch the window's tab.
					if (ENTERED_ONLY_RELAYS.has(message.id) && store.get().entered !== message.frame) return;
					if (LIVE_MOVE_RELAYS.has(message.id) && !liveRef.current.fromLive(message.frame)) return;
					// the shim matched ⌘⇧] under either modifier; which one is accel is
					// the canvas's rule, so ctrl+⇧] on a Mac is not the next tab
					if (
						ACCEL_RELAYS.has(message.id) &&
						!accelPressed({ metaKey: message.metaKey === true, ctrlKey: message.ctrlKey === true })
					)
						return;
					// a key the frame let go of travels with what it was, so the
					// entry reads it as it would its own press out here
					runHotkey(
						message.id,
						message.key === undefined
							? undefined
							: new KeyboardEvent("keydown", {
									key: message.key,
									code: message.code ?? "",
									altKey: true,
									metaKey: message.metaKey === true,
									ctrlKey: message.ctrlKey === true,
								}),
					);
					return;
				case "hold":
					// the ⌥ the frame relayed as held came up, or something broke it
					if (!liveRef.current.fromLive(message.frame)) return;
					if (message.phase === "up") liveRef.current.release();
					else liveRef.current.cancel();
					return;
				case "modifier":
					// the frame names the key that moved; which one is accel is the
					// canvas's rule, so the other platform's modifier is ignored here
					if (message.modifier !== accelKeyName()) return;
					// a ⌘ let go anywhere ends a fork's ] again, a fresh one too; but not
					// a frame losing the focus to the next one, its ⌘ still down
					if (message.blur !== true) liveRef.current.accel(message.held, message.held && !store.get().accelDown);
					if (store.get().entered === message.frame) setAccelDown(message.held);
					return;
				case "pan": {
					// the middle-button drag the shim kept for us: pan without leaving
					if (store.get().entered !== message.frame) return;
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
					// wheel gestures and hands them back here as canvas camera intents;
					// its zoom chords arrive as relayed keys (case "key").
					if (store.get().entered !== message.frame) return;
					camera.stop();
					setMenu(null);
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
				case "scroll": {
					// a wheel the entered frame had nowhere to scroll: it chains out
					// to the canvas as the same pan the viewport's own wheel makes
					if (store.get().entered !== message.frame) return;
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
				case "presence": {
					// the pointer, a press and the scroll inside the entered frame, which never cross into here:
					// told in the frame's own pixels, said to the team in world ones
					if (store.get().entered !== message.frame) return;
					const frame = visibleFramesOf(store.get()).find((entry) => entry.name === message.frame);
					const iframe = iframes.current.get(message.frame);
					if (frame === undefined || iframe === undefined) return;
					const scale = iframe.clientWidth > 0 ? frame.w / iframe.clientWidth : 1;
					insideFrameRef.current.pointer(
						message.x === null || message.y === null
							? null
							: { x: Math.round(frame.x + message.x * scale), y: Math.round(frame.y + message.y * scale) },
						message.pressed,
					);
					insideFrameRef.current.scrolled({
						x: Math.round(message.scrolled.x),
						y: Math.round(message.scrolled.y),
					});
					return;
				}
				case "go":
				case "back": {
					const source = event.source as WindowProxy;
					const active = store.get().entered === message.frame;
					const known = store.get().frames.some((candidate) => candidate.name === message.frame);
					const targetExists = store.get().frames.some((candidate) => candidate.name === message.target);
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
					if (message.spool === "go") liveRef.current.noteWalk(message.frame, message.target);
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
		requestSiteBoxes,
		siteBoxes,
		releaseHold,
		finishEdit,
		showRefusal,
		restored,
		altered,
		camera,
		store,
	]);

	// wheel: pan; ctrl/cmd-wheel (and pinch): zoom at the cursor — bake-off feel
	useEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			// Leave the finder's native list scrolling alone before cancelling the wheel.
			if (store.get().finding) return;
			event.preventDefault();
			camera.stop();
			setMenu(null);
			const dx = wheelPixels(event.deltaX, event.deltaMode, el.clientHeight);
			const dy = wheelPixels(event.deltaY, event.deltaMode, el.clientHeight);
			// with the ⌥ overview up every wheel zooms its camera, for ⌘ would end
			// it: out further to reach any frame, and letting go still lands from
			// the camera it opened on (DEV-295)
			if (event.ctrlKey || event.metaKey || liveRef.current.isShown()) {
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
	}, [zoomAtPoint, panBy, camera, store]);

	// Camera motion is drawn and never rendered. Every drawn frame is the camera
	// moving, which is the whole of what live frames hold their animations
	// across (#171); the store's rest ends it, and is the one moment the canvas
	// acts on the camera, so frames mount where it came to rest rather than
	// throughout the gesture. It acts without a render: what a rest decides is
	// in `rested`, set below once everything it calls is.
	const rested = useRef(() => {});
	useEffect(
		() =>
			camera.subscribe((at, moving) => {
				if (at === null) return;
				noteCameraMoving(moving);
				if (moving) return;
				// the ⌥ overview's stops are glances on the way to a frame, not
				// rests (DEV-295): the documents stay as they stood where it
				// opened, and none mount for the frames it passes over
				if (!liveRef.current.isShown()) restCameraRef.current = at;
				rested.current();
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
		if (framed && loaded) sweepLifecycle();
	}, [framed, loaded, sweepLifecycle]);

	const readyForUpdate = loaded && framed;
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
	// A tab closed or left before the settle still keeps where it was:
	// the write that was waiting goes out as the canvas goes.
	const unsettled = useRef<(() => void) | null>(null);
	const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const armPersist = useCallback(() => {
		const persist = () => {
			unsettled.current = null;
			const cam = camera.get();
			if (cam === null) return;
			cameras.current = { ...cameras.current, [activePage]: { x: cam.x, y: cam.y, k: cam.k } };
			putCanvasState(project, {
				...stateCameraSlots(cameras.current),
				...(activePage === ROOT_PAGE ? {} : { activePage }),
			});
		};
		unsettled.current = persist;
		clearTimeout(settle.current);
		settle.current = setTimeout(persist, SETTLE_PERSIST_MS);
	}, [project, activePage, camera]);
	useEffect(() => {
		if (!framed) return;
		armPersist();
		return () => clearTimeout(settle.current);
	}, [framed, armPersist]);
	rested.current = () => {
		if (loaded) {
			sweepLifecycle();
			tellView();
		}
		armPersist();
	};
	// unless the canvas closed because its project was forgotten or trashed:
	// nobody reads that camera again, and a forgotten folder is not written to
	const rootRef = useRef(root);
	rootRef.current = root;
	useEffect(
		() => () => {
			if (!isLetGo(rootRef.current)) unsettled.current?.();
		},
		[],
	);

	// --- gestures ---------------------------------------------------------------

	const localPoint = (event: { clientX: number; clientY: number }): Point => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	};

	const frameAtWorld = (p: Point): string | null => {
		const list = visibleFramesOf(store.get());
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
		const frame = visibleFramesOf(store.get()).find((f) => f.name === name);
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
		const reaching = () =>
			toolOf(store.get()) === "edit" ||
			toolOf(store.get()) === "comment" ||
			(toolOf(store.get()) === "select" && store.get().accelDown);
		if (frame === null || !(toolOf(store.get()) === "edit" || toolOf(store.get()) === "comment" || accel)) {
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
		if (at === null || toolOf(store.get()) === "hand" || gesture.current.kind !== "idle") {
			setPreview(null);
			return;
		}
		hoverLast.current = 0;
		hoverPickAt(at.frame, at.world, store.get().accelDown);
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
		for (const frame of visibleFramesOf(store.get())) {
			if (names.includes(frame.name)) origins.set(frame.name, { x: frame.x, y: frame.y });
		}
		return origins;
	};

	// the rects a move began from — origins carry x/y, a move never changes size
	const moveBefore = (origins: ReadonlyMap<string, Point>): Record<string, Geometry> => {
		const before: Record<string, Geometry> = {};
		for (const frame of visibleFramesOf(store.get())) {
			const origin = origins.get(frame.name);
			if (origin !== undefined) before[frame.name] = { x: origin.x, y: origin.y, w: frame.w, h: frame.h };
		}
		return before;
	};

	const onPointerDown = (event: React.PointerEvent) => {
		if (store.get().finding || store.get().exportDialog !== null) return;
		// a press ends a ⌥ hold that has not opened: ⌥ drag and ⌥ click are
		// gestures of their own (DEV-295)
		clickSwitch.current = null;
		if (live.isShown()) {
			// the overview's catcher takes the presses over the field; one that
			// reaches it anyway only closes it, and never selects, drags or leaves
			// the frame that was live
			event.preventDefault();
			event.stopPropagation();
			live.cancel();
			return;
		}
		if (live.isOpen()) live.cancel();
		const cam = camera.get();
		if (cam === null || event.button === 2) return;
		camera.stop();
		setMenu(null);
		// a press anywhere on the field puts an open comment card or composer down (spool#169)
		if (event.button === 0 && (store.get().commentOpen !== null || store.get().commentDraft !== null))
			store.set({ commentOpen: null, commentDraft: null });
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
		const openEdit = store.get().editing;
		if (openEdit !== null) {
			const over = frameAtWorld(toWorld(p, cam)) === openEdit.frame;
			if (over && openEdit.phase === "opening") return;
			endEdit(true);
			if (over) return;
		}
		const panningIntent = event.button === 1 || (event.button === 0 && toolOf(store.get()) === "hand");
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
		const from = store.get().entered;
		if (from !== null && !accelPressed(event)) {
			const hit = datasetHit(event.target, "frame-label") ?? frameAtWorld(toWorld(p, cam));
			if (hit === from) return; // the pointer is the frame's now
			// one click on another frame enters that one instead (DEV-295); a drag
			// is still a move of it, so the switch waits for the release
			if (hit !== null && event.button === 0 && !event.shiftKey && toolOf(store.get()) === "select") {
				clickSwitch.current = { from, to: hit };
			}
			exitEntered();
		}

		if (event.button !== 0) return;

		// the Comment tool places a pin where it is pressed, and nothing else (spool#169)
		if (toolOf(store.get()) === "comment") {
			placeComment(toWorld(p, cam), datasetHit(event.target, "page-object"));
			return;
		}

		// resize handles first: they overhang the frame and own the pointer
		const handleHit = datasetHit(event.target, "handle");
		const handle = handleHit !== null && isHandle(handleHit) ? handleHit : null;
		const single = store.get().selected.length === 1 ? (store.get().selected[0] ?? null) : null;
		if (handle !== null && single !== null) {
			const frame = visibleFramesOf(store.get()).find((f) => f.name === single);
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
			const page = datasetHit(event.target, "page-object") ?? pageObjectAt(pageObjectsOf(store.get()), world)?.page;
			if (page !== undefined && page !== null && toolOf(store.get()) !== "hand") {
				setSelected([]);
				setPicked([]);
				setSelectedPage(page);
				// a page on a field with no frames of its own stands on a shelf the
				// daemon lays, so there is nothing for a drag to arrange it against
				const at = store.get().places[page];
				if (at !== undefined && visibleFramesOf(store.get()).length > 0) {
					gesture.current = { kind: "page-pending", page, origin: at, start: p };
				}
				return;
			}
			setSelectedPage(null);
			if (toolOf(store.get()) === "hand") {
				setSelected([]);
				setPicked([]);
				return;
			}
			// empty canvas: a clean click clears, a drag draws the marquee
			const base = event.shiftKey ? store.get().selected : [];
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
			toolOf(store.get()) !== "hand" &&
			event.shiftKey &&
			label === null &&
			(toolOf(store.get()) === "edit" || store.get().picked.length > 0)
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
		if (toolOf(store.get()) === "select" && accelPressed(event) && label === null) {
			const local = frameLocalAt(hit, world);
			if (local !== null) selectDeepestAt(hit, local);
			return;
		}

		// In Edit every click is the deepest element under the pointer (#339),
		// and a drag moves that element among its siblings (#340).
		if (toolOf(store.get()) === "edit" && label === null) {
			const local = frameLocalAt(hit, world);
			// a press on the element that was already held is the second click
			// the text gesture is (#255) — noted here and acted on at pointer-up,
			// because until then it may yet turn out to be a drag of the frame
			if (local !== null) {
				const again = secondClick(store.get().picked, hit, local);
				pressOnHeld.current = again === undefined ? null : { pick: again, local };
				selectDeepestAt(hit, local);
			}
			const names = store.get().selected.includes(hit) ? [...store.get().selected] : [hit];
			gesture.current =
				local === null
					? { kind: "pending", names, origins: originsOf(names), start: p }
					: { kind: "element-pending", frame: hit, local, names, origins: originsOf(names), start: p };
			return;
		}

		const wasSelected = store.get().selected.includes(hit);
		const names = wasSelected ? [...store.get().selected] : [hit];
		if (!wasSelected) {
			setSelected([hit]);
			setPicked([]);
		}
		gesture.current = { kind: "pending", names, origins: originsOf(names), start: p };
	};

	/**
	 * A press under the Comment tool (spool#169): a pin at that point, in the frame's own pixels where a frame is,
	 * or at the world point on the page's empty field, and the composer open at it. A page standing on the field is
	 * still gone inside. Placing hands back the pointer; what was under the pin is asked of the frame meanwhile.
	 */
	/** A pin placed while C is held: letting go hands back the tool C took over from, however short the hold. */
	const placedUnderHold = () => {
		const held = commentHold.current;
		if (held !== null) commentHold.current = { ...held, placed: true };
	};
	const placeComment = (world: Point, pressedPage: string | null) => {
		const page = store.get().activePage;
		const frame = frameAtWorld(world);
		if (frame === null) {
			const object = pressedPage ?? pageObjectAt(pageObjectsOf(store.get()), world)?.page ?? null;
			if (object !== null) {
				goInsidePage(object);
				return;
			}
			store.set({ commentDraft: { page, frame: null, at: world, element: null }, commentOpen: null });
			setTool("select");
			placedUnderHold();
			return;
		}
		const local = frameLocalAt(frame, world);
		if (local === null) return;
		const draft: CommentDraft = { page, frame, at: local, element: null };
		store.set({ commentDraft: draft, commentOpen: null, selected: [], picked: [] });
		setTool("select");
		placedUnderHold();
		beginPick(
			frame,
			local,
			(chain) => {
				const target = deepest(chain);
				if (target === undefined || store.get().commentDraft !== draft) return;
				const { selector, tag, outerHtml, source, generated } = target;
				store.set({ commentDraft: { ...draft, element: { selector, tag, outerHtml, source, generated } } });
			},
			undefined,
			false,
		);
	};

	const onPointerMove = (event: React.PointerEvent) => {
		const active = gesture.current;
		const cam = camera.get();
		if (cam === null) return;
		const p = localPoint(event);

		if (active.kind === "idle") {
			// idle motion previews the frame and, under ⌘ or a scope, its element
			if (store.get().menu !== null || event.pointerType === "touch") {
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
			const overPage = frame === null ? (pageObjectAt(pageObjectsOf(store.get()), world)?.page ?? null) : null;
			setHoveredPage((current) => (current === overPage ? current : overPage));
			// The rings and the element preview belong to the pointing tools, and
			// every reader of `hovered` out here gates on that. The frame under the
			// pointer is nobody's tool: it is what keeps a live frame awake (#172),
			// and a pointer resting on a frame is resting on it in the Hand too.
			if (toolOf(store.get()) === "hand") return;
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
			for (const frame of visibleFramesOf(store.get())) {
				const origin = active.origins.get(frame.name);
				if (origin !== undefined)
					movingBoxes.push({ x: origin.x + rawX, y: origin.y + rawY, w: frame.w, h: frame.h });
			}
			if (movingBoxes.length === 0) return;
			const statics = visibleFramesOf(store.get()).filter((f) => !active.origins.has(f.name));
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
			const swept = visibleFramesOf(store.get())
				.filter((f) => intersects(world, f))
				.map((f) => f.name);
			const next = [...new Set([...active.base, ...swept])];
			setSelected((current) => (sameNames(current, next) ? current : next));
			return;
		}

		if (active.kind === "resize") {
			const world = toWorld(p, cam);
			const { handle, anchor, origin } = active;
			// the dragged edges snap like moves do; a min-size clamp beats the snap
			// and drops its guides — a line must never point at an edge that isn't there
			const statics = visibleFramesOf(store.get()).filter((f) => f.name !== active.frame);
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
		const at = store.get().places[page];
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
		// a click on another frame while one was live goes inside it (DEV-295)
		const switching = clickSwitch.current;
		clickSwitch.current = null;
		if (
			active.kind === "pending" &&
			switching !== null &&
			active.names.length === 1 &&
			active.names[0] === switching.to
		) {
			live.landLive(switching.to, null, { leaving: switching.from });
			return;
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
		if (store.get().exportDialog !== null) return;
		if (toolOf(store.get()) === "hand") return;
		const cam = camera.get();
		if (cam === null) return;
		const label = datasetHit(event.target, "frame-label");
		const world = toWorld(localPoint(event), cam);
		const hit = label ?? frameAtWorld(world);
		if (hit === null) {
			// double-click goes inside a page the same way it goes inside a frame
			// (#265). The camera does not fly: a page is its own coordinate space,
			// and pretending otherwise would be a lie about what just happened
			const page = pageObjectAt(pageObjectsOf(store.get()), world);
			if (page !== null) {
				cancelGesture();
				goInsidePage(page.page);
			}
			return;
		}
		if (hit === store.get().entered) return;
		cancelGesture();
		if (toolOf(store.get()) === "select" && !accelPressed(event)) {
			enterFrame(hit);
			return;
		}
		if (label !== null) return; // the label is the frame's, and it has no words
		const local = frameLocalAt(hit, world);
		if (local !== null) openAt(hit, local);
	};

	const onContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		if (store.get().exportDialog !== null) return;
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
		if (store.get().entered !== null) exitEntered();
		const elementSelection = store.get().picked.some((pick) => pick.frame === hit);
		if (!elementSelection && !store.get().selected.includes(hit)) {
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
		const frame = store.get().frames.find((f) => f.name === name);
		if (frame !== undefined) return pageOf(frame);
		return store.get().placeholders.find((one) => one.name === name)?.page ?? ROOT_PAGE;
	};

	/**
	 * Where a row in the agent rail pointing at a frame gets answered (#194).
	 *
	 * A row can only ring a frame that is on screen, and a thread is not bound to a page,
	 * so for most rows the frame is somewhere else. Then the answer is the page it is on,
	 * lit in the Pages rail — pointing is answered wherever the answer can be drawn, and
	 * the two cases are exclusive by construction.
	 */
	const pointedFrame =
		pointed !== null &&
		(visibleFrames.some((frame) => frame.name === pointed) || visiblePlaceholders.some((one) => one.name === pointed))
			? pointed
			: null;
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
			const frame = store.get().frames.find((candidate) => candidate.name === name);
			if (frame === undefined) {
				// a placeholder is landed on as a frame is, and nothing is selected: there is nothing in it yet
				const held = store.get().placeholders.find((candidate) => candidate.name === name);
				const viewport = viewportRef.current;
				const cam = camera.get();
				if (held === undefined) return;
				recordDeparture();
				const centred =
					viewport === null || cam === null
						? undefined
						: centerOn(cam, held, viewport.clientWidth, viewport.clientHeight);
				const page = held.page ?? ROOT_PAGE;
				if (page !== store.get().activePage) switchToPage(page, cam ?? undefined, centred);
				else if (centred !== undefined) camera.fly(centred);
				return;
			}
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
			if (pageOf(frame) !== store.get().activePage) switchToPage(pageOf(frame), cam ?? undefined, centred);
			else if (centred !== undefined) camera.fly(centred);
			setPicked([]);
			holdChain(null);
			setSelected([frame.name]);
			frameAnchor.current = frame.name;
		},
		[recordDeparture, switchToPage, holdChain, camera, store],
	);
	landOnFrameRef.current = landOnFrame;

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
	const putBack = useCallback((tile: AgentTile) => deck.get().turn.putBack(tile), [deck]);
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

	useEffect(() => {
		const pickTarget = () => [...new Set(store.get().picked.map((pick) => pick.frame))];
		/**
		 * The frames a menu verb acts on from the keyboard: the selection, or
		 * the frames behind an element pick. Inside an entered frame there are
		 * none — the keys belong to the prototype then, never to the canvas.
		 */
		const verbTarget = () => {
			if (store.get().entered !== null) return [];
			return store.get().selected.length > 0 ? [...store.get().selected] : pickTarget();
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
			if (store.get().selected.length === 0 && store.get().picked.length > 0) {
				const earlier = event.key === "ArrowUp" || event.key === "ArrowLeft";
				if (moveStep(earlier ? -1 : 1)) event.preventDefault();
				return;
			}
			if (store.get().entered !== null || store.get().selected.length === 0) return;
			event.preventDefault();
			const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
			const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
			nudge(dx, dy);
		};
		const stepSelection = (event: KeyboardEvent) => {
			if (store.get().entered !== null || store.get().selected.length === 0) return;
			event.preventDefault();
			if (store.get().selected.length !== 1) return;
			const current = visibleFramesOf(store.get()).find((frame) => frame.name === store.get().selected[0]);
			if (current === undefined) return;
			const direction = stepDirection(event);
			if (direction === undefined) return;
			const step = stepSpatially(current, visibleFramesOf(store.get()), direction, spatialTrail.current);
			if (step === undefined) return;
			const { target } = step;
			spatialTrail.current = step.trail;
			setSelected([target.name]);
			setPicked([]);
			const viewport = viewportRef.current;
			const cam = camera.get();
			if (viewport !== null && cam !== null) {
				const next = revealCamera(cam, target, viewport.clientWidth, viewport.clientHeight);
				if (next !== cam) camera.fly(next);
			}
		};
		// every canvas entry in the register answers here, or the map fails to
		// compile — the handlers gate on state, the register never does
		const handlers = {
			// Held keys repeat, and only the first press changes what a ring means.
			// The redraw below reads the store, which this press has already set.
			"canvas.accel-hold": () => {
				liveRef.current.accel(true, !store.get().accelDown);
				if (store.get().accelDown) return;
				setAccelDown(true);
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
				if (store.get().pendingTrash !== null) undoTrash();
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
				if (store.get().entered !== null) return;
				event?.preventDefault();
				setFinding(true);
			},
			// leaving an entered frame: ⌘esc landing canvas-side (#42), or the
			// esc the shim relays out of the frame that owned it
			"canvas.leave": (event) => {
				if (store.get().entered === null) return;
				event?.preventDefault();
				exitEntered(true);
			},
			// ⌘↓ / ⌘↑, Finder's own keys for into and out of a folder
			"canvas.page-in": (event) => {
				if (store.get().entered !== null || store.get().editing !== null) return;
				const page = store.get().selectedPage;
				if (page === null) return;
				event?.preventDefault();
				goInsidePage(page);
			},
			"canvas.page-up": (event) => {
				if (store.get().entered !== null || store.get().editing !== null) return;
				if (goUpPage()) event?.preventDefault();
			},
			"canvas.fit-all": () => zoomFit(),
			"canvas.fit-selection": () => {
				const names = store.get().selected.length > 0 ? store.get().selected : pickTarget();
				const boxes = visibleFramesOf(store.get()).filter((f) => names.includes(f.name));
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
			// C takes the Comment tool on a team canvas; held, it is borrowed until let go (spool#169)
			"canvas.tool-comment": (event) => {
				if (!teamRef.current || event?.repeat === true) return;
				commentHold.current = { before: store.get().tool, at: Date.now() };
				chooseTool("comment");
			},
			// ⇧C puts every pin away, and brings them back (spool#170)
			"canvas.toggle-pins": () => {
				if (!teamRef.current) return;
				store.set({ pinsHidden: !store.get().pinsHidden });
			},
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
			// whole frames, through the Pages rail's own verbs: never while a frame
			// is entered or its words are open, and an element held changes
			// nothing, the frame behind it is what goes
			"canvas.copy": (event) => {
				if (store.get().editing !== null) return;
				// text highlighted in the chrome (a path row, a label) is what ⌘C means
				if (window.getSelection()?.isCollapsed === false) return;
				const targets = verbTarget();
				if (targets.length === 0) return;
				event?.preventDefault();
				frameVerbs.current?.copy(targets);
			},
			"canvas.paste": (event) => {
				if (store.get().entered !== null || store.get().editing !== null || !gestureStill()) return;
				event?.preventDefault();
				void frameVerbs.current?.paste();
			},
			"canvas.duplicate": (event) => {
				if (store.get().editing !== null) return;
				const targets = verbTarget();
				if (targets.length === 0) return;
				// ⌘D is the browser's bookmark key
				event?.preventDefault();
				if (gestureStill()) void frameVerbs.current?.duplicate(targets);
			},
			// ⌫ is the frame's own trash, and an element's own delete when one is
			// held (#317): the frame behind it is never what the press meant. One
			// element at a time, and never while its words are open — that press
			// belongs to the text being typed.
			"canvas.trash": (event) => {
				if (store.get().entered !== null) return;
				if (store.get().picked.length > 0) {
					event?.preventDefault();
					// every element held goes, as one write and one press of undo
					// (#323); never while words are open, because that press
					// belongs to the text being typed
					if (store.get().editing === null) deleteElement(store.get().picked);
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
			// inside a frame, or with the ⌥ overview up, the step is the live
			// moves' (use-live-moves.ts); out here it moves the selection
			"canvas.step": (event) => {
				if (event === undefined || liveRef.current.step(event, false)) return;
				stepSelection(event);
			},
			"canvas.step-through": (event) => {
				if (event === undefined || liveRef.current.step(event, true)) return;
				stepSelection(event);
			},
			"canvas.overview": () => liveRef.current.holdDown(),
			"canvas.thread-next": (event) => liveRef.current.walkOn(event),
			"canvas.thread-back": (event) => liveRef.current.walkBack(event),
			// F2: the words of the one element held, and nothing else (#323)
			"canvas.words": () => openWords(),
			// ⏎ is Edit's before it is Select's (#339): with an element held, or
			// in Edit, it opens the words or selects the children; only a frame
			// held in Select goes inside
			"canvas.enter": (event) => {
				if (store.get().editing !== null) return;
				// a page object held goes inside, as its double-click does
				const page = store.get().selectedPage;
				if (store.get().entered === null && page !== null) {
					event?.preventDefault();
					goInsidePage(page);
					return;
				}
				if (store.get().picked.length > 0 || toolOf(store.get()) === "edit") {
					if (store.get().entered !== null) return;
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
				if (store.get().entered !== null) return;
				event?.preventDefault();
				setPreview(null);
				openHeld();
			},
			"canvas.ascend": (event) => {
				if (store.get().entered !== null) return;
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
				if (store.get().editing !== null) return;
				if (selectSiblings()) event?.preventDefault();
			},
			"canvas.escape": () => {
				cancelPicks();
				setPreview(null);
				// Esc puts an open comment down first, then leaves the Comment tool (spool#169)
				if (store.get().commentOpen !== null || store.get().commentDraft !== null) {
					store.set({ commentOpen: null, commentDraft: null });
					return;
				}
				if (store.get().tool === "comment") {
					setTool("select");
					return;
				}
				// Esc finishes the words and saves them, as Enter does (#339)
				if (store.get().editing !== null) {
					endEdit(true);
					return;
				}
				if (!gestureStill()) cancelGesture();
				else if (store.get().menu !== null) setMenu(null);
				else if (store.get().entered !== null) exitEntered(true);
				// Esc leaves first, then climbs to the parent the way ⇧⏎ does, then
				// puts a page object down, and last goes up a page
				else if (selectParent()) return;
				else if (store.get().selectedPage !== null) setSelectedPage(null);
				else goUpPage();
			},
		} satisfies Record<HotkeyIdFor<"canvas">, HotkeyHandler>;
		const detachDialog = attachHotkeyLayer({
			scope: "dialog",
			active: () => store.get().exportDialog !== null,
			handlers: {
				"dialog.close": (event) => {
					if (store.get().exporting) return;
					event?.preventDefault();
					cancelExportDialog();
				},
			} satisfies Record<HotkeyIdFor<"dialog">, HotkeyHandler>,
		});
		// the finder owns the keys while it is up, exactly as the export dialog does
		const detachFinder = attachHotkeyLayer({
			scope: "finder",
			active: () => store.get().finding,
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
			// a C held past a tap, or one a pin was placed under, borrowed the Comment tool: letting go hands back the
			// one it took over from
			if (event.code === "KeyC") letGoOfC();
			// releasing accel puts the borrowed Edit down, and the outline it drew
			// goes from under a pointer that has not moved since (#254, #339)
			if (event.key === accelKeyName()) {
				liveRef.current.accel(false, false);
				setAccelDown(false);
				refreshRings.current();
			}
			// letting go of ⌥ lands the overview, or disarms a hold that never opened
			if (event.key === "Alt") liveRef.current.release();
		};
		// any other key under a held ⌥ ends the overview unopened (⌥2 is @ on a
		// Swedish board); the step keys are what move it
		const letGoOfC = () => {
			const held = commentHold.current;
			if (held === null) return;
			commentHold.current = null;
			if (held.placed === true || Date.now() - held.at >= COMMENT_HOLD_MS) setTool(held.before);
		};
		const onKeyDownFirst = (event: KeyboardEvent) => {
			if (event.key === "Alt" || !liveRef.current.isOpen()) return;
			if (event.altKey && stepDirection(event) !== undefined) return;
			liveRef.current.cancel();
		};
		const clearModifiers = () => {
			// a window left with C held never hears it let go
			letGoOfC();
			liveRef.current.accel(false, false);
			liveRef.current.cancel();
			setAccelDown(false);
			setSpaceDown(false);
			setPreview(null);
		};
		window.addEventListener("keydown", onKeyDownFirst, true);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", clearModifiers);
		return () => {
			detachDialog();
			detachFinder();
			detachCanvas();
			window.removeEventListener("keydown", onKeyDownFirst, true);
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
		endEdit,
		goInsidePage,
		goUpPage,
		camera,
		store,
	]);

	// --- chrome (top bar) -------------------------------------------------------

	useEffect(() => {
		onChrome({
			camera,
			useAgent: root === undefined ? undefined : () => setAgentHandoff(true),
			share: () => shareContextOf(store.get()),
		});
		return () => onChrome(null);
	}, [onChrome, camera, root, store]);

	// --- presence (DEV-196) ---------------------------------------------------------

	const sendPresence = useCallback((state: PresenceState) => putPresence(project, state), [project]);
	const insideFrame = usePresenceSender({
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
	// read from the frame protocol's handler, which is bound before the sender is
	const insideFrameRef = useRef(insideFrame);
	insideFrameRef.current = insideFrame;

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
		loaded &&
		!projectEmpty &&
		activePage !== ROOT_PAGE &&
		pageIsBare(activePage, navigatorPages, navigatorFrames, placeholders);
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
	const railReading = railRungs === null && stampsOf(railHeld) !== null;
	noteRead(
		railHeld?.kind === "element" && heldPick !== undefined && !heldPick.generated
			? railRungs?.[rungOf(railHeld)]
			: undefined,
		railRungs,
		railReading,
	);
	// the gestures that waited on the read go once it is in, or once it has been
	// gone so long that the honest answer is the refusal (DEV-299)
	useEffect(() => {
		if (!railReading) {
			readSettled();
			return;
		}
		const timer = setTimeout(readSettled, READ_WAIT_MS);
		return () => clearTimeout(timer);
	}, [railReading, readSettled]);
	const cursor =
		resizeCursor ??
		(panning
			? "grabbing"
			: effectiveTool === "hand"
				? "grab"
				: effectiveTool === "comment"
					? COMMENT_CURSOR
					: "default");

	/**
	 * The window's panes (#359), in the order a fresh layout puts them: where
	 * each one stands is the pane window's, and a pane is mounted for as long as
	 * the canvas is, so drafts and scroll outlive it being out of sight.
	 */
	// the pages tree is memoised: every handler it holds keeps one identity (task 169)
	const onSelectFrameRow = useStableCallback(selectFrameRow);
	const onExtendFrameRange = useStableCallback(extendFrameRange);
	const onFlyToFrame = useStableCallback(flyToFrame);
	const onTrashPage = useStableCallback((page: string, names: string[]) => stageEntry({ frames: names, page }));
	const onCopyFramePath = useStableCallback((name: string) => copySourcePath(frameSourcePath(name)));
	const onRefreshFrames = useStableCallback(() => void refetchFrames());
	const commentsPane: PaneDef = {
		id: "comments",
		title: "Comments",
		icon: <CommentIcon />,
		hotkey: "panes.comments",
		// news while the tab is out of sight: something unread among the open comments (spool#170)
		elsewhere: !commentsShown && commentCounts(comments.comments, commentReader).unread > 0,
		elsewhereSays: "unread comments",
		render: () => (
			<CommentsPane
				comments={comments.comments}
				reader={commentReader}
				people={commentPeople}
				page={activePage}
				project={project}
				filters={commentFilters}
				open={commentOpen}
				pinsHidden={pinsHidden}
				onFilters={(next) => store.set({ commentFilters: next })}
				onPick={flyToComment}
				onNew={() => chooseTool("comment")}
				onTogglePins={() => store.set({ pinsHidden: !store.get().pinsHidden })}
			/>
		),
	};
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
					waiting={placeholders}
					selected={selected}
					onSwitchPage={activatePageFromTree}
					onSelectFrame={onSelectFrameRow}
					onExtendSelection={onExtendFrameRange}
					onDoubleClickFrame={onFlyToFrame}
					onTrashFrames={stageTrash}
					onTrashPage={onTrashPage}
					onRevealFrame={landOnFrame}
					onCopyPath={onCopyFramePath}
					onCopiesLanded={cascadeCopies}
					verbs={frameVerbs}
					onFramesRenamed={followRenamedFrames}
					onRefresh={onRefreshFrames}
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
					onSharePage={projectShares?.state === "ready" && projectShares.manage ? openShare : undefined}
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
			working: turnPhase === "playing",
			// a turn of any chat stopped on a question only a person can answer (#366)
			waiting: turnPhase === "asking" || threadWaiting,
			// another chat is running, waiting on a person, or landed unread (#364)
			elsewhere: threadElsewhere,
			focus: (body) => body.querySelector("textarea")?.focus({ preventScroll: true }),
			render: ({ width, visible }) => (
				<DeckRail
					deck={deck}
					active={visible}
					request={agentRequest}
					// an agent that never asks has no mode to pick, so the rail draws no mode menu (#363);
					// nor does one whose word on it has not come, so pi's never flashes in (#364)
					permissions={offeredModel.modes === true ? permissions : undefined}
					width={width}
					jump={jump}
					pointing={{ ...pointing, lit: lit ?? litOut, onLight: setLit, onDrop: dropPointed }}
					install={install}
					offeredModel={offeredModel}
					agentDefaults={agentDefaults}
				/>
			),
		},
		// a team project's inbox, beside Properties and Agent (spool#170)
		...(team ? [commentsPane] : []),
	];

	// what each frame is to the ⌥ overview while it is up (DEV-295)
	const overviewRoles = (() => {
		const up = live.overview;
		if (up === null) return null;
		const target = visibleFrames.find((frame) => frame.name === up.target);
		if (target === undefined) return null;
		const near = new Set(Object.values(overviewNeighbours(target, visibleFrames)).map((frame) => frame.name));
		return (name: string): OverviewRole => (name === up.target ? "target" : near.has(name) ? "near" : "dim");
	})();
	const overviewHint =
		live.overview === null
			? undefined
			: live.overview.mode === "select"
				? "let go of ⌥ to select"
				: live.overview.target === live.overview.origin
					? "let go of ⌥ to stay"
					: "let go of ⌥ to enter";

	return (
		<div className="relative flex h-full w-full">
			<PaneWindow
				panes={panes}
				reveal={agentRequest === undefined ? undefined : { pane: "agent", key: agentRequest.id }}
				onShown={(panes) => {
					setRailShown(panes.includes("agent"));
					setCommentsShown(panes.includes("comments"));
				}}
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
					className="relative h-full min-w-0 flex-1 touch-none select-none overflow-clip bg-surface-canvas outline-none"
					style={{ cursor }}
					onPointerDown={onPointerDown}
					// the second half of the double-click that opened an edit must not
					// take the focus out of the frame, or the frame reads it as the blur
					// that saves. Here rather than on the pointer press, because a
					// cancelled pointerdown takes the double-click with it (#314)
					onMouseDown={(event) => {
						const openEdit = store.get().editing;
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
					{framed && (
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
							{/* designers' placeholder frames (#369), dashed where their frames will land,
						    with what each designer is doing inside its own */}
							{visiblePlaceholders.map((one) => {
								// a teammate's designer's, drawn in their colour (#378)
								const by = team ? teammateOf(one, you) : undefined;
								return by === undefined ? (
									<PlaceholderFrame
										key={one.name}
										placeholder={one}
										camera={camera}
										agents={agentsAt.get(one.name)}
										pointed={pointed === one.name}
									/>
								) : (
									<TeammatePlaceholder
										key={one.name}
										room={presenceRoom}
										placeholder={one}
										by={by}
										camera={camera}
										pointed={pointed === one.name}
										agents={agentsAt.get(one.name)}
									/>
								);
							})}
						</CameraField>
					)}
					{/* every frame standing as its picture, on the GPU (#81): over the
				    arrows and pages, under every shell, label and tag */}
					<Pictures
						camera={camera}
						frames={pictureFrames}
						claims={pictureClaims}
						lifecycle={frameLife}
						documents={visibleFrames}
					/>
					{framed && (
						<CameraField camera={camera}>
							{visibleFrames.map((frame) => (
								// each shell renders as its own frame's lifecycle changes, never
								// with the canvas around it (DEV-303)
								<FrameLife key={frame.name} store={frameLife} name={frame.name}>
									{({ state, ready, settled }) => {
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
											<FrameSlot name={frame.name} frame={frame} claims={pictureClaims}>
												<ShellClip camera={camera} near={near} frame={frame}>
													<FrameShell
														project={project}
														name={frame.name}
														state={state}
														ready={ready}
														settled={settled}
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
									}}
								</FrameLife>
							))}
						</CameraField>
					)}
					{/* Labels share one layer above every frame. A transformed frame is
				    its own stacking context, so keeping its label inside would let a
				    later neighboring frame paint over the label regardless of the
				    label's own z-index. */}
					{framed && (
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
										onPlay={playFrame}
										live={
											isEntered && live.chip?.frame === frame.name
												? { ...live.chip, faded: live.overview !== null }
												: isEntered && live.overview !== null
													? { at: 0, came: null, note: null, faded: true }
													: null
										}
										clickEnters={
											entered !== null && !isEntered && isHovered && effectiveTool === "select" && !accelDown
										}
										overview={overviewRoles?.(frame.name) ?? null}
										overviewHint={overviewHint}
										agents={agentsAt.get(frame.name)}
									/>
								);
							})}
						</LabelField>
					)}
					{framed && (
						<CameraField camera={camera} layer="over">
							{pageObjects.map((object) => (
								<PageObjectLabel
									key={`${object.page}:label`}
									object={object}
									camera={camera}
									selected={selectedPage === object.page}
									hovered={pointerTool && hoveredPage === object.page}
									comments={
										team && !pinsHidden ? pageCount(comments.comments, object.page, commentReader) : undefined
									}
								/>
							))}
							{/* the tags ride over the frames, because pressing one travels —
						    the leaders under them are the map and take no pointer */}
							{arrowsOn && (
								<WalkLayer walks={walks} frames={visibleFrames} camera={camera} onOpen={landOnFrame} />
							)}
						</CameraField>
					)}

					{framed && (
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
								landing={live.chip?.ring === true ? { frame: live.chip.frame, at: live.chip.at } : null}
								overview={live.overview !== null}
							/>
							{live.overview !== null && (
								<OverviewLayer
									camera={camera}
									frames={visibleFrames}
									overview={live.overview}
									view={() => {
										const viewport = viewportRef.current;
										return viewport === null ? null : { w: viewport.clientWidth, h: viewport.clientHeight };
									}}
								/>
							)}
							{(() => {
								// under its frame, or under its placeholder while the frame is not there yet,
								// and only on the page showing it (#376)
								const at =
									standingAsk === null
										? undefined
										: (visibleFrames.find((one) => one.name === standingAsk.frame) ??
											(standingAsk.frame === null
												? visiblePlaceholders.find((one) => one.name === standingAsk.spot?.name)
												: undefined));
								return standingAsk === null || at === undefined ? null : (
									<CanvasAsk
										key={standingAsk.entry.key}
										camera={camera}
										frame={at}
										entry={standingAsk.entry}
										onAnswer={answerAsk}
										leaving={footedShown === "leaving"}
									/>
								);
							})()}
							{/* teammates on a team canvas (DEV-196), over everything on the field */}
							{team && (
								<PresenceLayer room={presenceRoom} camera={camera} frames={visibleFrames} page={activePage} />
							)}
							{/* comments on a team canvas (spool#169): pins over the field, and the card a pin opens */}
							{team && (
								<CommentsLayer
									context={commentsContext}
									store={store}
									camera={camera}
									frames={visibleFrames}
									page={activePage}
									comments={comments.comments}
									// only with an agent on this Mac to send it to
									onSendToAgent={noAgent ? undefined : sendCommentToAgent}
								/>
							)}
							{/* the pointer is the overview's while it is up (DEV-295): over every
						    frame, so no press or hover reaches a prototype */}
							{live.overview !== null && (
								<OverviewCatcher
									frameAt={(clientX, clientY) => {
										const cam = camera.get();
										return cam === null ? null : frameAtWorld(toWorld(localPoint({ clientX, clientY }), cam));
									}}
									slop={DRAG_THRESHOLD_PX}
									onPoint={live.point}
									onPick={live.pick}
								/>
							)}
						</>
					)}
					{followed !== undefined && <FollowMark mate={followed} />}
					{/* who else is here, at the canvas's top right rather than in the window's bar, so the tabs never move for it */}
					{team && (
						<div className="absolute top-3 right-3 z-30">
							<PresenceFaces
								room={presenceRoom}
								page={activePage}
								following={following}
								onFollow={setFollowing}
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
												const names = store.get().selected.includes(menu.frame)
													? [...store.get().selected]
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
								const pick = store.get().picked.find((candidate) => candidate.frame === menu.frame);
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
								const names = store.get().selected.includes(menu.frame)
									? [...store.get().selected]
									: [menu.frame];
								setMenu(null);
								stageTrash(names);
							}}
						/>
					)}

					<NoticeStack>
						{syncState}
						{setAside}
						{pendingTrash !== null && (
							<TrashToast
								// a new entry is a new undo window, so its drain starts again
								key={`${pendingTrash.page}\n${pendingTrash.frames.join("\n")}`}
								frames={pendingTrash.frames}
								page={pendingTrash.page}
								undoMs={TRASH_UNDO_MS}
								onUndo={undoTrash}
							/>
						)}
						{notice !== null ? <NoticeToast notice={notice} /> : null}
					</NoticeStack>
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
							<p className="text-secondary type-value">no frames yet</p>
							<p className="text-secondary type-detail">
								an agent writes frames/{activePage}/&lt;name&gt;/frame.tsx
							</p>
						</div>
					)}
					{/* nothing to arrange, nothing to walk: the tools arrive with the first frame */}
					{!projectEmpty && <CanvasTools tool={effectiveTool} onTool={chooseTool} team={team} />}
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

/**
 * The picture layer, told which documents are booting by the lifecycle rather
 * than by a render of the canvas: a mount and a loaded report change it, and
 * neither is the canvas's to render (DEV-303).
 */
function Pictures({
	lifecycle,
	documents,
	...layer
}: Omit<Parameters<typeof PictureCanvas>[0], "booting"> & {
	lifecycle: LifecycleStore;
	/** The frames whose documents count: the page's. */
	documents: readonly ProjectedFrame[];
}) {
	return <PictureCanvas {...layer} booting={useDocumentsBooting(lifecycle, documents)} />;
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

/**
 * The agent's rail, drawn off the whole deck (task 169): the one part of the canvas that
 * redraws with every tick of a turn, because the turn is what it draws.
 */
function DeckRail({
	deck,
	offeredModel,
	agentDefaults,
	...rail
}: Omit<
	ComponentProps<typeof AgentRail>,
	"agentReady" | "legacy" | "turn" | "threads" | "login" | "model" | "preferred"
> & {
	deck: DeckStore;
	offeredModel: AgentModelDeck;
	agentDefaults: AgentDefaultsDeck;
}) {
	const whole = useWholeDeck();
	return (
		<AgentRail
			{...rail}
			agentReady={whole.engine !== undefined || whole.legacy}
			legacy={whole.legacy}
			turn={whole.turn}
			threads={{
				list: whole.threads,
				open: whole.open,
				finished: whole.finished,
				onOpen: whole.onOpen,
				onClose: whole.onClose,
				// a chat opened on one engine (a recovery) leaves the machine's choice alone
				onNew: whole.onNew,
			}}
			login={whole.login}
			model={{
				...offeredModel,
				started: whole.turn.entries.length > 0,
				// saved before the menu moves: the blank chat then follows the confirmed choice
				onEngine: (engine: AgentEngineId) =>
					agentDefaults.choose(engine).then((confirmed) => {
						if (confirmed) deck.get().follow();
						return confirmed;
					}),
			}}
			preferred={agentDefaults.engine}
		/>
	);
}

/** the ask a turn is parked on, if it has a request to answer: the one that can stand on the canvas */
function standingAskOf(entries: AgentDeck["turn"]["entries"]): AskEntry | null {
	return entries.find((one): one is AskEntry => one.kind === "ask" && waitingAsk(one) && one.request !== null) ?? null;
}

/** whether two lists of this canvas's agents put them in the same places, saying the same */
function sameCompanions(a: readonly AgentCompanion[], b: readonly AgentCompanion[]): boolean {
	return (
		a.length === b.length &&
		a.every((one, at) => {
			const other = b[at];
			return (
				other !== undefined &&
				one.key === other.key &&
				one.name === other.name &&
				one.frame === other.frame &&
				one.act === other.act &&
				(one.spot === other.spot || (one.spot !== null && other.spot !== null && one.spot.name === other.spot.name))
			);
		})
	);
}
