import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Unseen } from "../../daemon/seen";
import { carriedPage, pageChain, pageName, pageParent, pageUnder, pageWithin, ROOT_PAGE } from "../../page-path";
import { accelPressed } from "../../runtime/platform-keys";
import {
	type CanvasOrder,
	createPage,
	duplicateFrames,
	duplicatePage,
	type FrameCopy,
	fetchOrder,
	moveFrames,
	movePages,
	type ProjectedFrame,
	putOrder,
	renameFrame,
	renamePage,
} from "../api";
import { cn } from "../cn";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import { DotsIcon } from "../icons";
import type { HistoryEntry, Moved, OrderList, Way } from "./history";
import {
	flatPages,
	insertAt,
	mergeOrder,
	mergePageTree,
	pageMovedInOrder,
	placeAfter,
	renameInOrder,
	reorder,
	withFrameOrder,
	withLists,
	without,
	withPageOrder,
} from "./order";
import { framesOnPage, pageLabel, pageOf } from "./pages";
import { PagePicker } from "./rail-move";
import {
	type BornRow,
	contentX,
	DEPTH_BAND,
	type FrameRow,
	frameLanding,
	framesBetween,
	guideX,
	INDENT,
	type Landing,
	LIST_PAD,
	landingGuideX,
	listHeight,
	type PageRow,
	pageLanding,
	type RailFrame,
	type RailRow,
	railRows,
	rowAt,
	rowKey,
	sameLanding,
} from "./rail-rows";
import { COLLAPSED_BELOW, MAX_WIDTH, STRIP_WIDTH, settledWidth, useRailWidth } from "./rail-width";
import { type MenuTarget, RailMenu, type RailMenuState } from "./sidebar-menu";
import { UnseenMark } from "./unseen-mark";

/**
 * The pages rail as a file explorer (#229, #231, #232).
 *
 * A page is a folder under `design/frames/` and a frame is a folder with one
 * entry file, so this rail was always a view of the disk — it just could not do
 * anything to it. Now it carries the explorer verbs: drag to reorder, to move a
 * frame between pages and to move a page into or out of another, rename in
 * place, duplicate, copy and paste, delete onto the same staged-trash toast the
 * canvas uses, a menu per row kind, and keyboard travel through the whole list.
 *
 * Pages hold pages, so a row's depth is a fact about its own path and a drop is
 * two questions rather than one: the pointer's y says which gap, and its
 * sideways travel says which of the depths that gap could mean.
 *
 * The root page is the frames directory itself rather than a folder inside it,
 * so it has no row of its own: the list is the root. Its frames are loose rows
 * at the top level beside the page rows, and they reorder, move and take drops
 * like any others — a flat project's rail is just its frames.
 *
 * Two things it still does not do, and both are laws rather than gaps. It never
 * writes frame source: rename and move are folder operations, and a `data-go`
 * literal naming a renamed frame re-derives as missing, which is where an agent
 * fixes it. And it never writes geometry for a row it moved: order is the rail's
 * list and the canvas is a plane, so reordering rows moves nothing out there and
 * arranging frames out there changes no row. The one geometry write anywhere
 * near this surface is the cascade a fresh copy needs so it does not land exactly
 * on top of its original, and that belongs to the canvas — which is why it is
 * asked for here rather than done here.
 *
 * Rows are absolutely placed at an offset the list already knows, so they slide
 * to a new home on the house curve without anything measuring the DOM, and the
 * insertion line lands on an exact pixel. There is no animation library in this
 * bundle and this rail does not add one.
 */

const PANEL_WIDTH = 248;
/** how far a press travels before it is a drag rather than a click */
const SLOP = 5;
/** the band at each end of the list that pulls the scroll along */
const EDGE = 36;
const EDGE_SPEED = 14;
/**
 * How long a drag has to rest on a shut page before it springs open.
 *
 * A drag crosses folders on its way to somewhere else, so opening every one it
 * touches unfolds the tree under the hand that is trying to cross it — the list
 * grows, the rows move, and the gap being aimed at is somewhere else by the time
 * the pointer gets there. Resting is the difference between passing over a folder
 * and looking into one, and the arc on the chevron says the rest is being counted.
 * Mirrored by `--spring-ms` on that arc.
 */
const SPRING_MS = 450;
/** how long a typed jump keeps collecting letters */
const TYPED_MS = 700;
/** the house curve, which every rail transition already wears */
const CURVE = "cubic-bezier(0.23,1,0.32,1)";

export interface SelectModifiers {
	shift: boolean;
	toggle: boolean;
}

/**
 * A ⇧ range, asked of the rail once the canvas says where the anchor is.
 *
 * The two halves of a range live in different places: the anchor is the
 * canvas's, because that is what a click and a copy and an arrival all move,
 * and the order is the rail's, because the rail is the only thing that knows
 * what somebody arranged. So the rail hands over the question rather than the
 * answer, and the canvas asks it with the anchor it is holding.
 */
export type FrameSpan = (anchor: string) => readonly string[];

const modifiersOf = (event: React.MouseEvent): SelectModifiers => ({
	shift: event.shiftKey,
	toggle: accelPressed(event),
});

interface RenameState {
	readonly key: string;
	readonly draft: string;
	/** the page a row that never existed will belong to; cancelling drops the row rather than reverting */
	readonly born: string | null;
	/** the daemon's refusal, said on the row that asked for it */
	readonly error: string | null;
	readonly busy: boolean;
}

/** The open rename, as the one thing a row has to be handed to draw it. */
interface RenameHandle {
	readonly state: RenameState;
	readonly onDraft: (draft: string) => void;
	readonly onCommit: () => void;
	readonly onCancel: () => void;
}

interface DragLive {
	pointerId: number;
	kind: "page" | "frame";
	names: readonly string[];
	/** the depth the lifted row had, which is what no sideways travel means */
	depth: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	grabY: number;
	active: boolean;
	/** the shut page the drag is resting on, and when it arrived there */
	springPage: string | null;
	springAt: number;
	/** the shut pages this drag opened, which are the ones it closes behind itself */
	opened: Set<string>;
}

interface DragKit {
	readonly kind: "page" | "frame";
	readonly names: readonly string[];
	readonly label: string;
}

/**
 * The entries this rail runs, and the whole of them.
 *
 * A geometry entry is the canvas's own sidecar write and a mint's inverse is
 * the canvas's trash toast, so neither is this rail's to run. Saying that in
 * the type rather than in a `default` branch is what keeps the runner from
 * reporting success for work it never did.
 *
 * A gather is in because half of it is: the frames are the rail's to move, and
 * the page they were gathered into is the toast's to take away.
 */
export type RailEntry = Extract<HistoryEntry, { kind: "rename" | "move" | "move-page" | "reorder" | "gather" }>;

/**
 * The rail's half of the canvas's one undo stack (#230).
 *
 * The stack itself is the canvas's, because that is where ⌘Z lands and where
 * the trash toast that outranks it lives. What the canvas cannot do is run an
 * explorer entry back: the stored order is this rail's state and the verbs are
 * its calls. So the seam is two halves of one sentence — the rail says what it
 * did through `onRecord`, and hands back the one function that can do it again
 * or undo it. Every inverse is the forward verb with its arguments swapped,
 * through the same client call, and it answers false only when the daemon
 * refused, which is the disk having moved underneath the projection.
 */
export type RunEntry = (entry: RailEntry, way: Way) => Promise<boolean>;

/** The pages navigator: a file explorer over the projection and the stored order. */
/** a project whose record says nothing: every row draws exactly as it did */
const NOTHING_UNSEEN: ReadonlyMap<string, Unseen> = new Map();

export function CanvasSidebar({
	project,
	pages,
	activePage,
	frames,
	selected,
	onSwitchPage,
	onSelectFrame,
	onExtendSelection,
	onDoubleClickFrame,
	onTrashFrames,
	onTrashPage,
	onRevealFrame,
	onOpenEditor,
	onCopiesLanded,
	onRefresh,
	onRecord,
	run,
	litPage = null,
	unseen = NOTHING_UNSEEN,
}: {
	project: string;
	/** Every named page's path, sorted; the root page is implied and has no row. */
	pages: readonly string[];
	activePage: string;
	/** Every projected frame; the canvas itself mounts only the active page. */
	frames: readonly ProjectedFrame[];
	selected: readonly string[];
	onSwitchPage: (page: string) => void;
	/** `span` answers what a ⇧ range covers; only a click that could be one carries it. */
	onSelectFrame: (name: string, modifiers: SelectModifiers, span?: FrameSpan) => void;
	/** ⇧ travel: the rows the cursor has swept from the anchor, as the selection they name. */
	onExtendSelection: (span: FrameSpan) => void;
	onDoubleClickFrame: (name: string) => void;
	onTrashFrames: (names: string[]) => void;
	/** A page and everything inside it, as one entry on the trash toast. */
	onTrashPage: (page: string, frames: string[]) => void;
	onRevealFrame: (name: string) => void;
	onOpenEditor: (name: string) => void;
	/** Fresh copies exist: the canvas cascades them off their originals and selects them. */
	onCopiesLanded: (copies: readonly FrameCopy[]) => void;
	/** A folder operation landed; the projection is behind until it is read again. */
	onRefresh: () => void;
	/** A verb the canvas's one undo stack should hold; the rail records, the canvas keeps. */
	onRecord?: (entry: HistoryEntry) => void;
	/** The slot the rail puts its runner in, so the canvas can walk an entry back. */
	run?: React.RefObject<RunEntry | null>;
	/** The page holding the finder's pick — its row lights while the palette is up. */
	litPage?: string | null;
	/**
	 * What nobody has looked at (seen.ts). A frame row wears its own mark; a page
	 * row wears one only while it is shut, and says only that something inside it
	 * is unseen — the count of how much is one chevron away, and two numbers side
	 * by side read as one wrong number.
	 */
	unseen?: ReadonlyMap<string, Unseen> | undefined;
}) {
	const [width, setWidth] = useRailWidth("pages", PANEL_WIDTH);
	const [resizing, setResizing] = useState(false);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [order, setOrder] = useState<CanvasOrder>({});
	const [cursor, setCursor] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<RenameState | null>(null);
	/** the page a new one is being named inside, when one is */
	const [born, setBorn] = useState<string | null>(null);
	/** the frames a new page is being made to hold, when it is being made for some */
	const [gathering, setGathering] = useState<readonly string[]>([]);
	const [clipboard, setClipboard] = useState<readonly string[]>([]);
	const [menu, setMenu] = useState<RailMenuState | null>(null);
	/** the move that is looking for a page to land in, and where its picker stands */
	const [moving, setMoving] = useState<{
		readonly x: number;
		readonly y: number;
		readonly kind: "page" | "frame";
		readonly names: readonly string[];
	} | null>(null);
	const [kit, setKit] = useState<DragKit | null>(null);
	const [landing, setLanding] = useState<Landing | null>(null);
	/** the shut page a drag is resting on, which is the one drawing the dwell arc */
	const [springing, setSpringing] = useState<string | null>(null);

	const asideRef = useRef<HTMLElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const live = useRef<DragLive | null>(null);
	const ticking = useRef<number | null>(null);
	const landingRef = useRef<Landing | null>(null);
	/** a press that became a drag must not also read as a click on the row it left */
	const justDragged = useRef(false);
	const grip = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const typed = useRef({ buffer: "", at: 0 });

	const collapsed = width <= COLLAPSED_BELOW;

	/**
	 * The unseen inside each page, for the rows that are shut over it. A page is
	 * marked by anything unseen anywhere below it, and `new` outranks `changed`:
	 * the louder of the two is what a shut folder has to answer with.
	 */
	const unseenIn = useMemo(() => {
		const rolled = new Map<string, Unseen>();
		if (unseen.size === 0) return rolled;
		for (const frame of frames) {
			const mark = unseen.get(frame.name);
			if (mark === undefined) continue;
			for (const page of pageChain(pageOf(frame))) {
				if (rolled.get(page) !== "new") rolled.set(page, mark === "new" ? "new" : (rolled.get(page) ?? mark));
			}
		}
		return rolled;
	}, [frames, unseen]);

	/* ── the list: the projection, arranged by the stored order ──────── */

	/** Each page's own pages, arranged; the root page's are the top level. */
	const pageTree = useMemo(() => mergePageTree(order.pages, pages), [order.pages, pages]);
	/** Every named page, in rail order. The root page is not one of them: it has no row. */
	const orderedPages = useMemo(() => flatPages(pageTree), [pageTree]);

	const framesByPage = useMemo(() => {
		const byPage = new Map<string, readonly RailFrame[]>();
		for (const page of [ROOT_PAGE, ...orderedPages]) {
			const here = framesOnPage(frames, page);
			const kinds = new Map(here.map((frame) => [frame.name, frame.kind]));
			byPage.set(
				page,
				mergeOrder(
					order.frames?.[page],
					here.map((frame) => frame.name),
				).map((name) => ({ name, kind: kinds.get(name) ?? "html" }) satisfies RailFrame),
			);
		}
		return byPage;
	}, [orderedPages, frames, order.frames]);

	const rows = useMemo(
		() => railRows(pageTree, framesByPage, expanded, born),
		[pageTree, framesByPage, expanded, born],
	);
	const total = listHeight(rows);

	const namesOn = useCallback(
		(page: string) => (framesByPage.get(page) ?? []).map((frame) => frame.name),
		[framesByPage],
	);

	/** What a page's own pages are called, in rail order — one list of the order. */
	const pagesIn = useCallback((parent: string) => (pageTree.get(parent) ?? []).map(pageName), [pageTree]);

	/** A page and every page inside it, which is what its folder holds. */
	const pagesUnder = useCallback(
		(page: string) => [page, ...orderedPages.filter((each) => pageWithin(page, each))],
		[orderedPages],
	);

	/** Every frame the folder holds, the ones on its own pages included. */
	const framesUnder = useCallback(
		(page: string) => pagesUnder(page).flatMap((each) => namesOn(each)),
		[pagesUnder, namesOn],
	);

	/**
	 * The pages a move could land in, which is every page but the ones it would be
	 * a refusal or a no-op in.
	 *
	 * A page can never go inside itself or inside one of its own — the folder would
	 * have to be its own parent — and the daemon refuses a landing where the folder
	 * already is, so offering the page something is in already would be offering it
	 * a 409. The root page is a destination like any other: it is the frames
	 * directory itself, and a move out to the top level lands there.
	 */
	const destinations = useCallback(
		(kind: "page" | "frame", names: readonly string[]): readonly string[] => {
			const all = [ROOT_PAGE, ...orderedPages];
			if (kind === "page") {
				return all.filter((page) =>
					names.every((each) => page !== each && !pageWithin(each, page) && pageParent(each) !== page),
				);
			}
			const held = new Set(names.map((name) => pageHoldingIn(framesByPage, name)));
			return all.filter((page) => !(held.size === 1 && held.has(page)));
		},
		[orderedPages, framesByPage],
	);

	const cursorRow = useMemo(() => rows.find((row) => rowKey(row) === cursor) ?? null, [rows, cursor]);
	/** what a verb acts on: the canvas selection, or the one row the cursor is on */
	const chosenFrames = useMemo(
		() => (selected.length > 0 ? selected : cursorRow?.kind === "frame" ? [cursorRow.name] : []),
		[selected, cursorRow],
	);

	/**
	 * What a handler that outlives its render needs to read.
	 *
	 * The drag loop runs on rAF and the hotkey layer answers window events, so
	 * both would otherwise close over the list as it was when they were built.
	 */
	const now = useRef({
		rows,
		order,
		orderedPages,
		framesByPage,
		cursor,
		cursorRow,
		chosenFrames,
		clipboard,
		activePage,
		menu,
	});
	useEffect(() => {
		now.current = {
			rows,
			order,
			orderedPages,
			framesByPage,
			cursor,
			cursorRow,
			chosenFrames,
			clipboard,
			activePage,
			menu,
		};
	});

	/* ── the stored order ────────────────────────────────────────────── */

	useEffect(() => {
		let reading = true;
		void fetchOrder(project).then((stored) => {
			if (reading) setOrder(stored);
		});
		return () => {
			reading = false;
		};
	}, [project]);

	/** A drop is an explicit gesture, so it lands on disk at once, unlike the camera. */
	const storeOrder = useCallback(
		(next: CanvasOrder) => {
			setOrder(next);
			putOrder(project, next);
		},
		[project],
	);

	/* ── expanding ───────────────────────────────────────────────────── */

	/**
	 * A page, and with `deep` the pages inside it too.
	 *
	 * Deep is what ⌥ on a chevron means: the folder and everything it holds, which
	 * is the reach a control on one row is allowed to have. Every page in the
	 * project is the header's verb, and it says so in a word.
	 */
	const setOpen = useCallback((page: string, open: boolean, deep = false) => {
		const pages = deep ? [page, ...now.current.orderedPages.filter((each) => pageWithin(page, each))] : [page];
		setExpanded((was) => {
			const next = new Set(was);
			for (const each of pages) {
				if (open) next.add(each);
				else next.delete(each);
			}
			return next;
		});
	}, []);

	const collapseAll = useCallback(() => setExpanded(new Set()), []);

	/**
	 * A frame picked from somewhere that is not this rail gets a row to stand on.
	 *
	 * The finder, a row in the agent rail, an exit tag somebody walked: all of
	 * them land on a frame, and a selection you cannot see is a selection the
	 * rail is lying about. Only ever opens — activating a page still does not,
	 * because switching page is not picking anything.
	 */
	const shown = useRef<readonly string[]>([]);
	useEffect(() => {
		if (selected === shown.current) return;
		shown.current = selected;
		// every page above it too: a row inside a shut page is a row nobody can see,
		// and a frame on the root page has no page above it to open
		const holding = new Set(
			frames.filter((frame) => selected.includes(frame.name)).flatMap((frame) => pageChain(pageOf(frame))),
		);
		if (holding.size === 0) return;
		setExpanded((was) => ([...holding].every((page) => was.has(page)) ? was : new Set([...was, ...holding])));
	}, [selected, frames]);

	/* ── travelling ──────────────────────────────────────────────────── */

	const scrollRowIntoView = useCallback((key: string) => {
		const list = listRef.current;
		const row = now.current.rows.find((each) => rowKey(each) === key);
		if (list === null || row === undefined) return;
		const top = row.top + LIST_PAD;
		if (top < list.scrollTop) list.scrollTop = top - 4;
		else if (top + row.height > list.scrollTop + list.clientHeight) {
			list.scrollTop = top + row.height - list.clientHeight + 4;
		}
	}, []);

	/**
	 * Going into a page, which is switching the canvas to it and nothing else.
	 *
	 * The chevron is the only thing that folds a page, in both directions. Picking
	 * a folder used to unfold it too, which made the tree reshape itself under
	 * every press: a click meant to switch page dropped the rest of the list down
	 * the screen, and there was no way to stand on a folder without opening it.
	 * Every explorer worth copying keeps these two apart — the disclosure control
	 * discloses, and the name selects.
	 */
	const enterPage = useCallback((page: string) => onSwitchPage(page), [onSwitchPage]);

	/**
	 * Land the cursor on a row.
	 *
	 * A frame row selects on the canvas the way a click on it does, page switch
	 * included — that is what makes arrowing through the rail a way of looking at
	 * frames rather than of moving a highlight. A page row is the same sentence
	 * about a folder: travel already commits for frames, so a folder the cursor
	 * arrives at is one it has gone into.
	 */
	const landOn = useCallback(
		(row: RailRow | undefined) => {
			if (row === undefined) return;
			const key = rowKey(row);
			setCursor(key);
			scrollRowIntoView(key);
			if (row.kind === "frame") onSelectFrame(row.name, { shift: false, toggle: false });
			else if (row.kind === "page") enterPage(row.page);
		},
		[onSelectFrame, enterPage, scrollRowIntoView],
	);

	/** The row a step from the cursor reaches; from nowhere, the near end of the list. */
	const stepped = useCallback((delta: number): RailRow | undefined => {
		const all = now.current.rows;
		const at = all.findIndex((row) => rowKey(row) === now.current.cursor);
		const next = at === -1 ? (delta > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, at + delta));
		return all[next];
	}, []);

	const step = useCallback((delta: number) => landOn(stepped(delta)), [landOn, stepped]);

	/**
	 * ⇧ travel: the cursor moves and the selection stretches to it.
	 *
	 * Registered rather than left to fall through, because a navigation key that
	 * nobody claims reaches the canvas and nudges the selection ten pixels — an
	 * arrow silently editing the layout. It takes the cursor without pressing the
	 * row, so travelling into a page adds nothing and switches nothing: a page row
	 * is a place the cursor can be and not a thing a selection can hold.
	 */
	const sweep = useCallback(
		(delta: number) => {
			const row = stepped(delta);
			if (row === undefined) return;
			const key = rowKey(row);
			setCursor(key);
			scrollRowIntoView(key);
			onExtendSelection((anchor) => framesBetween(now.current.rows, anchor, key));
		},
		[stepped, scrollRowIntoView, onExtendSelection],
	);

	/* ── renaming ────────────────────────────────────────────────────── */

	const beginRename = useCallback((row: RailRow | null) => {
		// a page still being named is already in the only state this puts a row into
		if (row === null || row.kind === "born") return;
		// a page is named by its own folder, so what is typed over is that name and
		// the path around it stays where it is
		setRenaming({
			key: rowKey(row),
			draft: row.kind === "page" ? pageLabel(row.page) : row.name,
			born: null,
			error: null,
			busy: false,
		});
	}, []);

	const cancelRename = useCallback(() => {
		setBorn(null);
		setGathering([]);
		setRenaming(null);
	}, []);

	/**
	 * A page being named, in the page it will belong to — the root page by default.
	 *
	 * `carry` is the frames it is being made to hold, which is Finder's New Folder
	 * with Selection: the page is named first, because a page named `untitled` that
	 * has to be renamed afterwards is two gestures where this is one.
	 */
	const newPage = useCallback((parent: string = ROOT_PAGE, carry: readonly string[] = []) => {
		setBorn(parent);
		setGathering(carry);
		setMenu(null);
		setExpanded((was) => new Set([...was, ...pageChain(parent)]));
		setRenaming({ key: "born", draft: "", born: parent, error: null, busy: false });
	}, []);

	/** Which page holds a frame, read off the list the rail is drawing. */
	const pageHolding = useCallback((name: string) => pageHoldingIn(now.current.framesByPage, name), []);

	/**
	 * Frames gathered onto a page, wherever the gesture came from.
	 *
	 * A frame that changes page changes folder, and the folder is the whole move:
	 * geometry, stills, its URL and every flow into it ride along. On this side
	 * that is two lists rewritten at once, so a verb that moves frames with no
	 * pointer anywhere near it does exactly what the drag does — the same lists,
	 * the same wire, the same rail put back when the daemon refuses.
	 *
	 * `minted` says the page was made by the same gesture, which is one entry
	 * rather than two: the press that takes the frames back has to take the page
	 * with them.
	 */
	const moveFramesInto = useCallback(
		(names: readonly string[], page: string, index: number, minted = false) => {
			const held = now.current.order;
			// where each frame stands right now, read before the move lands: the
			// inverse has to put every one of them back on its own page
			const moved: Moved[] = [];
			for (const name of names) {
				const from = pageHolding(name);
				if (from !== undefined && from !== page) moved.push({ name, from });
			}
			let next = held;
			const lists: OrderList[] = [];
			for (const source of new Set(moved.map((each) => each.from))) {
				const before = namesOn(source);
				const after = without(before, names);
				next = withFrameOrder(next, source, after);
				lists.push({ of: "frames", page: source, before, after });
			}
			const landing = namesOn(page);
			const arrived = insertAt(without(landing, names), names, index);
			next = withFrameOrder(next, page, arrived);
			lists.push({ of: "frames", page, before: landing, after: arrived });
			storeOrder(next);
			setOpen(page, true);
			void moveFrames(project, [...names], page).then((done) => {
				const carried = done.kind !== "refused" && moved.length > 0;
				// the page exists whatever happened to the frames, so a move that never
				// happened leaves it with the staged delete a fresh page has always had
				if (minted) {
					onRecord?.(
						carried
							? { kind: "gather", page, frames: moved, lists }
							: { kind: "mint", staged: { frames: [], page } },
					);
				} else if (carried) onRecord?.({ kind: "move", frames: moved, to: page, lists });
				// the move never happened: put the rail back rather than let it claim it did
				if (done.kind === "refused") storeOrder(held);
				onRefresh();
			});
		},
		[project, namesOn, pageHolding, storeOrder, setOpen, onRecord, onRefresh],
	);

	/**
	 * A page that moved's own bookkeeping on this side.
	 *
	 * The daemon carried the page's state and stored order across with the folder
	 * (#228, #231); this is that same move applied to what is on screen, so
	 * neither side has to read the other back. It is a function rather than four
	 * lines inline because undoing a rename is this exact move with the paths the
	 * other way round (#230), and because a page carries its whole subtree: what
	 * is open, where the cursor is and which page the canvas is on all name pages
	 * that just changed path.
	 */
	const pageCarried = useCallback(
		(from: string, to: string) => {
			setExpanded((was) => new Set([...was].map((page) => carriedPage(page, from, to) ?? page)));
			setCursor(`page:${to}`);
			const active = carriedPage(now.current.activePage, from, to);
			if (active !== undefined) onSwitchPage(active);
		},
		[onSwitchPage],
	);

	const pageMoved = useCallback(
		(from: string, to: string) => {
			storeOrder(pageMovedInOrder(now.current.order, from, to));
			pageCarried(from, to);
		},
		[storeOrder, pageCarried],
	);

	/**
	 * The daemon leaves frame names in the order alone, because from where it
	 * sits a stale name is not damage. Here it is: without this the frame would
	 * leave the place somebody put it the moment it was renamed.
	 */
	const frameRenamed = useCallback(
		(page: string, from: string, to: string) => {
			storeOrder(withFrameOrder(now.current.order, page, renameInOrder(namesOn(page), from, to)));
			setCursor(`frame:${to}`);
		},
		[storeOrder, namesOn],
	);

	/**
	 * Whether the project already answers to a name (#228's law, asked here).
	 *
	 * A frame's name has to miss every frame and every page's own name, at whatever
	 * depth that page sits; a page's path has to miss every page, and its own name
	 * every frame. Two pages under different parents may share a name, which is why
	 * one of these asks about a path and the other about a name.
	 */
	const claimedBy = useCallback(
		(of: "frame" | "page", name: string): boolean =>
			of === "page"
				? pages.includes(name) || frames.some((frame) => frame.name === pageName(name))
				: frames.some((frame) => frame.name === name) || pages.some((page) => pageName(page) === name),
		[frames, pages],
	);

	/**
	 * Commit what was typed.
	 *
	 * A name the project already holds is refused where it was typed: the rail is
	 * drawing every frame and every page, so a collision it can see does not need a
	 * round trip to be told about. Everything that gets past that is the daemon's
	 * to answer — it is reading the disk and this is reading a projection — and its
	 * refusal keeps the input up and says why rather than quietly minting a
	 * different name. Renaming a row to what it is already called never travels at
	 * all, which is what commit-on-blur does most of the time.
	 *
	 * Nothing here is painted before the answer arrives. A name is identity in
	 * spool, so a rename taken back a moment later is worse than the wait.
	 */
	const commitRename = useCallback(async () => {
		const at = renaming;
		if (at === null || at.busy) return;
		const wanted = at.draft.trim();
		if (at.born !== null) {
			if (wanted === "") {
				cancelRename();
				return;
			}
			const parent = at.born;
			const path = pageUnder(parent, wanted);
			if (claimedBy("page", path)) {
				setRenaming({ ...at, error: refusalLine(409) });
				return;
			}
			setRenaming({ ...at, busy: true, error: null });
			const done = await createPage(project, path);
			if (done.kind === "refused") {
				setRenaming({ ...at, busy: false, error: refusalLine(done.status) });
				return;
			}
			// a new page waits at the end of the pages it will belong to while it is
			// named, and that is where it stays: naming it says nothing about where
			// in that list it belongs
			const held = pagesIn(parent);
			storeOrder(withPageOrder(now.current.order, parent, insertAt(held, [wanted], held.length)));
			setBorn(null);
			setGathering([]);
			setRenaming(null);
			setExpanded((was) => new Set([...was, path]));
			setCursor(`page:${path}`);
			onSwitchPage(path);
			// the frames it was made for follow it in, and the two halves are one entry
			// because one press has to take both of them back. A page made for nothing
			// was nowhere a moment ago, so its only inverse is the staged delete (#230)
			if (gathering.length > 0) moveFramesInto(gathering, path, 0, true);
			else onRecord?.({ kind: "mint", staged: { frames: [], page: path } });
			onRefresh();
			return;
		}
		const row = now.current.rows.find((each) => rowKey(each) === at.key);
		if (row === undefined || row.kind === "born") {
			setRenaming(null);
			return;
		}
		const from = row.kind === "page" ? row.page : row.name;
		// a page keeps the page holding it, so what was typed is its last segment
		const to = row.kind === "page" ? pageUnder(pageParent(row.page), wanted) : wanted;
		if (wanted === "" || to === from) {
			setRenaming(null);
			return;
		}
		if (claimedBy(row.kind === "page" ? "page" : "frame", to)) {
			setRenaming({ ...at, error: refusalLine(409) });
			return;
		}
		setRenaming({ ...at, busy: true, error: null });
		const done = row.kind === "page" ? await renamePage(project, from, to) : await renameFrame(project, from, to);
		if (done.kind === "refused") {
			setRenaming({ ...at, busy: false, error: refusalLine(done.status) });
			return;
		}
		setRenaming(null);
		if (row.kind === "page") pageMoved(from, to);
		else frameRenamed(row.page, from, to);
		onRecord?.({ kind: "rename", of: row.kind === "page" ? "page" : "frame", from, to });
		onRefresh();
	}, [
		renaming,
		gathering,
		project,
		claimedBy,
		storeOrder,
		cancelRename,
		moveFramesInto,
		pageMoved,
		frameRenamed,
		pagesIn,
		onSwitchPage,
		onRecord,
		onRefresh,
	]);

	/* ── the verbs ───────────────────────────────────────────────────── */

	/**
	 * Fresh copies, placed and then shown.
	 *
	 * Order first, because a copy with no place in it would slide off to its
	 * alphabetical spot the moment the projection arrives. Then the canvas, which
	 * cascades them off their originals and takes the selection: a duplicate
	 * copies the geometry sidecar verbatim (#228), so a same-page copy would
	 * otherwise land exactly on top of what it was made from.
	 */
	/**
	 * A verb carrying no typed name came back refused.
	 *
	 * It is pathological by construction: the daemon mints copy names itself and
	 * cannot collide with one, so what is left is the disk having moved
	 * underneath the projection this rail is drawing — a frame trashed in Finder,
	 * a folder an agent renamed a moment ago. There is nothing to say to a person
	 * about a name they never typed, so the answer is to read the disk again and
	 * let reality reassert itself.
	 */
	const refuted = useCallback(() => onRefresh(), [onRefresh]);

	const landCopies = useCallback(
		(copies: readonly FrameCopy[], beside: boolean) => {
			let next = now.current.order;
			const byPage = new Map<string, string[]>();
			for (const copy of copies) {
				const page = copy.page ?? ROOT_PAGE;
				const list = byPage.get(page) ?? [...(next.frames?.[page] ?? namesOn(page))];
				byPage.set(page, beside ? placeAfter(list, copy.from, [copy.to]) : insertAt(list, [copy.to], list.length));
			}
			for (const [page, list] of byPage) next = withFrameOrder(next, page, list);
			storeOrder(next);
			onCopiesLanded(copies);
			onRecord?.({ kind: "mint", staged: { frames: copies.map((copy) => copy.to), page: null } });
			onRefresh();
		},
		[namesOn, storeOrder, onCopiesLanded, onRecord, onRefresh],
	);

	/**
	 * Move the row to the Trash, and say nothing about the order.
	 *
	 * A staged page still exists on disk, so its order entries are not stale and
	 * there is nothing to clean; and once the toast drains, #228's trash route
	 * drops them itself. Writing them out here would only mean that undoing the
	 * toast brought the page back to its alphabetical spot with its frames'
	 * arrangement gone — the one thing an undo must not do.
	 */
	const trash = useCallback(() => {
		const row = now.current.cursorRow;
		if (row?.kind === "page") {
			// the folder is what moves, so every frame inside it goes — the ones on
			// its own pages included
			onTrashPage(row.page, framesUnder(row.page));
			setCursor(null);
			return;
		}
		const names = now.current.chosenFrames;
		if (names.length > 0) onTrashFrames([...names]);
	}, [onTrashPage, onTrashFrames, framesUnder]);

	const duplicate = useCallback(async () => {
		const row = now.current.cursorRow;
		if (row?.kind === "page") {
			const done = await duplicatePage(project, row.page);
			if (done.kind === "refused") {
				refuted();
				return;
			}
			const parent = pageParent(row.page);
			storeOrder(
				withPageOrder(
					now.current.order,
					parent,
					placeAfter(pagesIn(parent), pageName(row.page), [pageName(done.page)]),
				),
			);
			setExpanded((was) => new Set([...was, done.page]));
			setCursor(`page:${done.page}`);
			// the folder is what was made, so the folder and its children are what
			// the inverse stages — one entry on the toast, exactly as trashing it is
			onRecord?.({ kind: "mint", staged: { frames: done.copies.map((copy) => copy.to), page: done.page } });
			onRefresh();
			return;
		}
		const names = now.current.chosenFrames;
		if (names.length === 0) return;
		const done = await duplicateFrames(project, [...names]);
		if (done.kind === "refused") {
			refuted();
			return;
		}
		landCopies(done.copies, true);
	}, [project, storeOrder, pagesIn, onRecord, onRefresh, landCopies, refuted]);

	const copy = useCallback(() => {
		const names = now.current.chosenFrames;
		if (names.length > 0) setClipboard([...names]);
	}, []);

	const paste = useCallback(
		async (page?: string) => {
			const held = now.current.clipboard;
			const target = page ?? now.current.activePage;
			if (held.length === 0) return;
			const done = await duplicateFrames(project, [...held], target);
			if (done.kind === "refused") {
				refuted();
				return;
			}
			setExpanded((was) => new Set([...was, ...pageChain(target)]));
			landCopies(done.copies, false);
		},
		[project, landCopies, refuted],
	);

	/* ── the one undo stack (#230) ───────────────────────────────────── */

	const runEntry = useCallback<RunEntry>(
		async (entry, way) => {
			switch (entry.kind) {
				case "rename": {
					const from = way === "undo" ? entry.to : entry.from;
					const to = way === "undo" ? entry.from : entry.to;
					const page = entry.of === "frame" ? pageHolding(from) : undefined;
					const done =
						entry.of === "page" ? await renamePage(project, from, to) : await renameFrame(project, from, to);
					// somebody claimed the name back while this entry sat on the stack:
					// the entry is stale a round trip late, and there is nothing to say
					// to a person about a name they are not typing
					if (done.kind === "refused") {
						refuted();
						return false;
					}
					if (entry.of === "page") pageMoved(from, to);
					else if (page !== undefined) frameRenamed(page, from, to);
					onRefresh();
					return true;
				}
				// one body, because a gather is a move whose destination the same gesture
				// made: the page half of it is the toast's, and the frames are these lines
				case "gather":
				case "move": {
					const held = now.current.order;
					const to = entry.kind === "gather" ? entry.page : entry.to;
					storeOrder(withLists(held, entry.lists, way));
					// undo scatters the frames back to the pages they each came from;
					// redo gathers them onto the one page the drop landed on
					const groups = new Map<string, string[]>();
					for (const moved of entry.frames) {
						const page = way === "undo" ? moved.from : to;
						groups.set(page, [...(groups.get(page) ?? []), moved.name]);
					}
					// one call per page, so a refusal partway leaves the groups before it
					// moved and drops the entry whole: chosen rather than wrapped, because
					// a refusal already means the disk moved and the re-read is the repair
					for (const [page, names] of groups) {
						const done = await moveFrames(project, names, page);
						if (done.kind === "refused") {
							storeOrder(held);
							onRefresh();
							return false;
						}
						setOpen(page, true);
					}
					onRefresh();
					return true;
				}
				case "move-page": {
					const held = now.current.order;
					// a page is named by the path it had before the move, so undo reaches
					// for it where the move left it and redo where it started
					const groups = new Map<string, string[]>();
					for (const moved of entry.pages) {
						const from = way === "undo" ? pageUnder(entry.to, pageName(moved.name)) : moved.name;
						const parent = way === "undo" ? moved.from : entry.to;
						groups.set(parent, [...(groups.get(parent) ?? []), from]);
					}
					let next = withLists(held, entry.lists, way);
					for (const [parent, moving] of groups) {
						const done = await movePages(project, moving, parent);
						if (done.kind === "refused") {
							storeOrder(held);
							onRefresh();
							return false;
						}
						for (const page of moving) {
							const landed = pageUnder(parent, pageName(page));
							next = pageMovedInOrder(next, page, landed);
							pageCarried(page, landed);
						}
						setOpen(parent, true);
					}
					storeOrder(next);
					onRefresh();
					return true;
				}
				case "reorder":
					storeOrder(withLists(now.current.order, entry.lists, way));
					return true;
			}
		},
		[project, pageHolding, pageMoved, pageCarried, frameRenamed, storeOrder, setOpen, refuted, onRefresh],
	);
	if (run !== undefined) run.current = runEntry;

	/* ── dragging ────────────────────────────────────────────────────── */

	const tick = useCallback(() => {
		const current = live.current;
		const list = listRef.current;
		if (current !== null && list !== null && current.active) {
			// the lifted row hangs just left of the pointer: the insertion line's
			// notch has to stay readable underneath it
			const overlay = overlayRef.current;
			if (overlay !== null) {
				overlay.style.transform = `translate3d(${current.x - 14}px, ${current.y - current.grabY}px, 0)`;
			}
			const box = list.getBoundingClientRect();
			const above = current.y - box.top;
			const below = box.bottom - current.y;
			if (above < EDGE) list.scrollTop -= Math.min(EDGE_SPEED, (EDGE - above) / 2.2);
			else if (below < EDGE) list.scrollTop += Math.min(EDGE_SPEED, (EDGE - below) / 2.2);

			const all = now.current.rows;
			const contentY = current.y - box.top + list.scrollTop - LIST_PAD;
			// the pointer's sideways travel picks the depth: no travel keeps the one
			// the row already had, right nests, left steps back out
			const wanted = current.depth + Math.round((current.x - current.startX) / DEPTH_BAND);
			const found =
				current.kind === "page" ? pageLanding(all, contentY, wanted) : frameLanding(all, contentY, wanted);
			const next = allowed(current, found) ? found : null;
			if (!sameLanding(next, landingRef.current)) {
				landingRef.current = next;
				setLanding(next);
			}

			// spring-loaded folders: rest on a shut page and it opens itself, and shuts
			// again behind the drag unless the drop landed inside. Crossing one at speed
			// leaves it exactly as it was — passing over a folder is not looking into it
			const at = rowAt(all, contentY);
			const over = at === -1 ? undefined : all[at];
			const candidate =
				over?.kind === "page" && !over.open && allowed(current, { kind: "into", page: over.page })
					? over.page
					: null;
			if (candidate !== current.springPage) {
				current.springPage = candidate;
				current.springAt = performance.now();
				setSpringing(candidate);
			} else if (candidate !== null && performance.now() - current.springAt > SPRING_MS) {
				current.springPage = null;
				current.opened.add(candidate);
				setSpringing(null);
				setOpen(candidate, true);
			}
		}
		ticking.current = requestAnimationFrame(tick);
	}, [setOpen]);

	/**
	 * Pages moved into a page, which is the frame move one level up.
	 *
	 * A page that changes the page holding it changes folder, and the folder is the
	 * whole move: every frame inside it and every page under it ride along, and
	 * their cameras and lists with them. The paths of everything inside change with
	 * it, which is what `pageCarried` says on this side.
	 */
	const movePagesInto = useCallback(
		(moving: readonly string[], parent: string, index: number) => {
			const held = now.current.order;
			const leaves = moving.map(pageName);
			let next = held;
			const lists: OrderList[] = [];
			for (const source of new Set(moving.map(pageParent))) {
				if (source === parent) continue;
				const before = pagesIn(source);
				const after = without(before, leaves);
				next = withPageOrder(next, source, after);
				lists.push({ of: "pages", page: source, before, after });
			}
			const into = pagesIn(parent);
			const arrived = insertAt(without(into, leaves), leaves, index);
			next = withPageOrder(next, parent, arrived);
			lists.push({ of: "pages", page: parent, before: into, after: arrived });
			storeOrder(next);
			setOpen(parent, true);
			const moved: Moved[] = moving.flatMap((page) =>
				pageParent(page) === parent ? [] : [{ name: page, from: pageParent(page) }],
			);
			void movePages(project, [...moving], parent).then((done) => {
				// the move never happened: put the rail back rather than let it claim it did
				if (done.kind === "refused") storeOrder(held);
				else if (moved.length > 0) {
					for (const each of moved) pageCarried(each.name, pageUnder(parent, pageName(each.name)));
					onRecord?.({ kind: "move-page", pages: moved, to: parent, lists });
				}
				onRefresh();
			});
		},
		[project, pagesIn, pageCarried, storeOrder, setOpen, onRecord, onRefresh],
	);

	const applyDrop = useCallback(
		(current: DragLive, target: Landing) => {
			const held = now.current.order;
			if (current.kind === "page") {
				if (!allowed(current, target)) return;
				const parent = target.page;
				const moving = [...current.names];
				const index = target.kind === "pages" ? target.index : pagesIn(parent).length;
				const sources = new Set(moving.map(pageParent));
				if (sources.size === 1 && sources.has(parent)) {
					const leaves = moving.map(pageName);
					const before = pagesIn(parent);
					const after = reorder(before, leaves, index);
					storeOrder(withPageOrder(held, parent, after));
					onRecord?.({ kind: "reorder", lists: [{ of: "pages", page: parent, before, after }] });
					return;
				}
				movePagesInto(moving, parent, index);
				return;
			}
			if (target.kind === "pages") return;
			const page = target.page;
			const names = [...current.names];
			const sources = new Set(names.map((name) => pageHolding(name)));
			const index = target.kind === "frames" ? target.index : (now.current.framesByPage.get(page)?.length ?? 0);
			if (sources.size === 1 && sources.has(page)) {
				const before = namesOn(page);
				const after = reorder(before, names, index);
				storeOrder(withFrameOrder(held, page, after));
				onRecord?.({ kind: "reorder", lists: [{ of: "frames", page, before, after }] });
				return;
			}
			moveFramesInto(names, page, index);
		},
		[namesOn, pagesIn, pageHolding, storeOrder, onRecord, moveFramesInto, movePagesInto],
	);

	/**
	 * A move that was typed rather than dragged, landing at the end of the list it
	 * arrives in — the same place a drop onto the page row itself lands.
	 */
	const moveToPicked = useCallback(
		(page: string) => {
			const at = moving;
			setMoving(null);
			if (at === null) return;
			if (at.kind === "page") movePagesInto(at.names, page, pagesIn(page).length);
			else moveFramesInto(at.names, page, namesOn(page).length);
		},
		[moving, movePagesInto, moveFramesInto, pagesIn, namesOn],
	);

	const stopDrag = useCallback(
		(drop: boolean) => {
			const current = live.current;
			const target = landingRef.current;
			if (ticking.current !== null) cancelAnimationFrame(ticking.current);
			ticking.current = null;
			live.current = null;
			landingRef.current = null;
			if (current?.active === true) justDragged.current = true;
			setKit(null);
			setLanding(null);
			setSpringing(null);
			const landed = drop && current?.active === true && target !== null ? target : null;
			if (landed !== null && current !== null) applyDrop(current, landed);
			// the pages this drag opened close behind it, all but the one the drop
			// landed in and the ones it is inside: a row nobody can see is not where
			// somebody just put it. A page that was open before the drag was never
			// this drag's to shut.
			const kept = new Set(landed === null ? [] : pageChain(landed.page));
			for (const page of current?.opened ?? []) {
				if (!kept.has(page)) setOpen(page, false);
			}
		},
		[applyDrop, setOpen],
	);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			current.x = event.clientX;
			current.y = event.clientY;
			if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > SLOP) {
				current.active = true;
				setKit({ kind: current.kind, names: current.names, label: labelOf(current) });
			}
			if (current.active) event.preventDefault();
		};
		const onUp = (event: PointerEvent) => {
			if (live.current?.pointerId === event.pointerId) stopDrag(true);
		};
		const onCancel = () => stopDrag(false);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
			if (ticking.current !== null) cancelAnimationFrame(ticking.current);
		};
	}, [stopDrag]);

	function pressRow(event: React.PointerEvent<HTMLElement>, row: RailRow) {
		// the empty list behind the rows drops the cursor on a press; a row owns its own
		event.stopPropagation();
		justDragged.current = false;
		if (event.button !== 0 || renaming?.key === rowKey(row)) return;
		setMenu(null);
		// clicking a button does not focus it everywhere, and the rail's scope is
		// up only while the rail holds focus
		listRef.current?.focus({ preventScroll: true });
		setCursor(rowKey(row));
		// a page still being named has no folder, so there is nothing to pick up
		if (row.kind === "born") return;
		live.current = {
			pointerId: event.pointerId,
			kind: row.kind,
			depth: row.depth,
			names:
				row.kind === "page"
					? [row.page]
					: selected.includes(row.name) && selected.length > 1
						? [...selected]
						: [row.name],
			startX: event.clientX,
			startY: event.clientY,
			x: event.clientX,
			y: event.clientY,
			grabY: event.clientY - event.currentTarget.getBoundingClientRect().top,
			active: false,
			springPage: null,
			springAt: 0,
			opened: new Set(),
		};
		if (ticking.current === null) ticking.current = requestAnimationFrame(tick);
	}

	/* ── the menu ────────────────────────────────────────────────────── */

	const openMenu = useCallback(
		(event: React.MouseEvent, target: MenuTarget) => {
			event.preventDefault();
			event.stopPropagation();
			listRef.current?.focus({ preventScroll: true });
			if (target.kind === "frame" && !selected.includes(target.name)) {
				onSelectFrame(target.name, { shift: false, toggle: false });
			}
			if (target.kind !== "empty")
				setCursor(target.kind === "page" ? `page:${target.page}` : `frame:${target.name}`);
			setMenu({ x: event.clientX, y: event.clientY, target });
		},
		[selected, onSelectFrame],
	);

	useEffect(() => {
		if (menu === null) return;
		const close = () => setMenu(null);
		window.addEventListener("pointerdown", close);
		return () => window.removeEventListener("pointerdown", close);
	}, [menu]);

	/* ── keys ────────────────────────────────────────────────────────── */

	useEffect(() => {
		// the rail's own scope, above the canvas and not exclusive: what it does
		// not claim carries straight on to the canvas (#229)
		const detachMenu = attachHotkeyLayer({
			scope: "sidebar",
			active: () => now.current.menu !== null,
			handlers: {
				"sidebar.close-menu": (event) => {
					event?.preventDefault();
					setMenu(null);
				},
			},
		});
		const detach = attachHotkeyLayer({
			scope: "sidebar",
			active: () => asideRef.current?.contains(document.activeElement) === true,
			handlers: {
				"sidebar.walk": (event) => {
					event?.preventDefault();
					step(event?.key === "ArrowUp" ? -1 : 1);
				},
				"sidebar.extend": (event) => {
					event?.preventDefault();
					sweep(event?.key === "ArrowUp" ? -1 : 1);
				},
				"sidebar.expand": (event) => {
					event?.preventDefault();
					const row = now.current.cursorRow;
					if (row?.kind !== "page") return;
					if (row.open) step(1);
					else setOpen(row.page, true);
				},
				"sidebar.collapse": (event) => {
					event?.preventDefault();
					const row = now.current.cursorRow;
					if (row === null || row.kind === "born") return;
					if (row.kind === "page") {
						if (row.open) setOpen(row.page, false);
						return;
					}
					landOn(now.current.rows.find((each) => each.kind === "page" && each.page === row.page));
				},
				"sidebar.rename": (event) => {
					event?.preventDefault();
					beginRename(now.current.cursorRow);
				},
				"sidebar.trash": (event) => {
					event?.preventDefault();
					trash();
				},
				"sidebar.duplicate": (event) => {
					event?.preventDefault();
					void duplicate();
				},
				"sidebar.copy": (event) => {
					event?.preventDefault();
					copy();
				},
				"sidebar.paste": (event) => {
					event?.preventDefault();
					void paste();
				},
			} satisfies Omit<Record<HotkeyIdFor<"sidebar">, HotkeyHandler>, "sidebar.close-menu">,
		});
		return () => {
			detachMenu();
			detach();
		};
	}, [step, sweep, setOpen, landOn, beginRename, trash, duplicate, copy, paste]);

	/**
	 * Type a name and the cursor walks to it.
	 *
	 * Answered on the rail rather than in the register, and stopped short of the
	 * window listener exactly as the resize grip stops its arrows: these are the
	 * characters a spool name is made of, and while the rail holds focus they
	 * belong to this list rather than to the canvas's one-letter verbs. Every
	 * chord and every other key is left alone and reaches the canvas untouched.
	 */
	function typeAhead(event: React.KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey || !/^[a-z0-9-]$/i.test(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const at = Date.now();
		typed.current.buffer = (at - typed.current.at > TYPED_MS ? "" : typed.current.buffer) + event.key.toLowerCase();
		typed.current.at = at;
		const query = typed.current.buffer;
		const all = now.current.rows;
		const here = all.findIndex((row) => rowKey(row) === now.current.cursor);
		const from = query.length === 1 ? here + 1 : Math.max(here, 0);
		for (let walked = 0; walked < all.length; walked += 1) {
			const row = all[(from + walked + all.length) % all.length];
			if (row === undefined) continue;
			if (row.kind === "born") continue;
			const name = row.kind === "page" ? pageLabel(row.page) : row.name;
			if (name.toLowerCase().startsWith(query)) {
				landOn(row);
				return;
			}
		}
	}

	/* ── drawing ─────────────────────────────────────────────────────── */

	function finishResize(target: HTMLElement, pointerId: number) {
		const current = grip.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		grip.current = null;
		setResizing(false);
		setWidth(settledWidth(current.latestWidth));
	}

	const menuRow = menu === null ? null : (rows.find((row) => rowKey(row) === targetKey(menu.target)) ?? null);
	/** what the open menu's row would move, and where it could go */
	const menuMove =
		menu === null || menu.target.kind === "empty"
			? null
			: { kind: menu.target.kind, names: menu.target.kind === "page" ? [menu.target.page] : chosenFrames };
	const menuTargets = menuMove === null ? [] : destinations(menuMove.kind, menuMove.names);

	return (
		<aside
			ref={asideRef}
			className={cn(
				"relative z-20 h-full shrink-0 overflow-hidden border-border border-r bg-bg",
				!resizing &&
					"transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
			)}
			style={{ width }}
		>
			{collapsed ? (
				/* an edge with the one control that opens it, and nothing else. A strip of
				   folder icons was a second navigator that disagreed with the first: it
				   listed every page at every depth, so a project whose tree was folded
				   read as more folders shut than open. The rail is the navigator, and
				   the way to navigate is to open it */
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand pages"
						onClick={() => setWidth(PANEL_WIDTH)}
						className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
					>
						<PanelCaret dir="right" className="h-3.5 w-2.5" />
					</button>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
						<div className="flex items-baseline gap-2">
							<h1 className="font-semibold text-base leading-base">Pages</h1>
							{/* a count of nothing is a number saying nothing: zero reads as absence */}
							{orderedPages.length === 0 ? null : (
								<span className="font-mono text-muted text-xs leading-xs">{orderedPages.length}</span>
							)}
						</div>
						<div className="flex items-center">
							<button
								type="button"
								aria-label="New page"
								onClick={() => newPage()}
								className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 transition-[color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface hover:text-text active:scale-90 motion-reduce:transition-none"
							>
								<PlusIcon className="h-2.5 w-2.5" />
							</button>
							{/* a fully open tree has no empty space left to right-click, which is
							    where this verb used to be the only place it was. Dimmed rather
							    than taken away when everything is already shut: a header that
							    reflows as you fold the tree is a header you cannot aim at */}
							<button
								type="button"
								aria-label="Collapse all"
								disabled={expanded.size === 0}
								onClick={collapseAll}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-sm transition-[color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
									expanded.size === 0
										? "text-muted/25"
										: "text-muted/60 hover:bg-surface hover:text-text active:scale-90",
								)}
							>
								<FoldIcon className="h-2.5 w-2.5" />
							</button>
							<button
								type="button"
								aria-label="Collapse pages"
								onClick={() => setWidth(STRIP_WIDTH)}
								className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 hover:text-text"
							>
								<PanelCaret dir="left" className="h-3.5 w-2.5" />
							</button>
						</div>
					</div>

					<div
						ref={listRef}
						role="tree"
						tabIndex={0}
						aria-label="Pages tree"
						className="pages-scrollbar min-h-0 flex-1 overflow-y-auto py-2 outline-none"
						onPointerDown={() => {
							setMenu(null);
							setCursor(null);
						}}
						onContextMenu={(event) => openMenu(event, { kind: "empty" })}
						onScroll={() => {
							// both of these stand at a point the scroll just moved out from under
							setMenu(null);
							setMoving(null);
						}}
						onKeyDown={typeAhead}
					>
						<div className="relative" style={{ height: total, minHeight: "100%" }}>
							{rows.map((row) => {
								const rename: RenameHandle | null =
									renaming === null || renaming.key !== rowKey(row)
										? null
										: {
												state: renaming,
												onDraft: (draft) => setRenaming((was) => (was === null ? null : { ...was, draft })),
												onCommit: () => void commitRename(),
												onCancel: cancelRename,
											};
								if (row.kind === "born") {
									return rename === null ? null : <NewPageRow key="born" row={row} rename={rename} />;
								}
								return (
									<TreeRow
										key={rowKey(row)}
										row={row}
										activePage={activePage}
										litPage={litPage}
										selected={row.kind === "frame" && selected.includes(row.name)}
										mark={
											row.kind === "frame"
												? unseen.get(row.name)
												: row.open
													? undefined
													: unseenIn.get(row.page)
										}
										cursored={cursor === rowKey(row)}
										lifted={kit !== null && kit.kind === row.kind && kit.names.includes(rowName(row))}
										into={landing?.kind === "into" && row.kind === "page" && landing.page === row.page}
										springing={row.kind === "page" && springing === row.page}
										rename={rename}
										onPress={pressRow}
										onActivate={() => {
											if (justDragged.current || row.kind !== "page") return;
											enterPage(row.page);
										}}
										onSelect={(event) => {
											if (justDragged.current || row.kind !== "frame") return;
											onSelectFrame(row.name, modifiersOf(event), (anchor) =>
												framesBetween(now.current.rows, anchor, rowKey(row)),
											);
										}}
										onOpen={(deep) => {
											if (row.kind !== "page") return;
											setOpen(row.page, !row.open, deep);
										}}
										onRename={() => beginRename(row)}
										onFly={() => {
											if (row.kind === "frame") onDoubleClickFrame(row.name);
										}}
										onMenu={openMenu}
									/>
								);
							})}

							{landing === null || landing.kind === "into" ? null : (
								<div
									aria-hidden="true"
									className="pointer-events-none absolute z-20 h-[2px]"
									style={{ left: landingGuideX(landing), top: landing.y - 1, right: 10 }}
								>
									<span className="block h-full w-full rounded-full bg-thread" />
									<span className="-left-px -top-[1.5px] absolute h-[5px] w-[5px] rounded-full bg-thread" />
								</div>
							)}
						</div>
					</div>

					<div className="flex h-9 shrink-0 items-center justify-between border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						<span>folder switches page</span>
						{clipboard.length > 0 ? <span className="text-muted/50">{clipboard.length} copied</span> : null}
					</div>
				</div>
			)}

			{kit === null
				? null
				: createPortal(
						<div ref={overlayRef} className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform">
							<div className="flex h-8 w-fit max-w-[190px] items-center gap-2 rounded-sm border border-border-raised bg-raised px-2.5">
								{kit.kind === "page" ? (
									<FolderIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
								) : (
									<FrameIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
								)}
								<span className="min-w-0 truncate font-mono text-sm text-text leading-sm">{kit.label}</span>
								{kit.names.length > 1 ? (
									<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-thread px-1 font-mono text-2xs text-on-thread leading-3">
										{kit.names.length}
									</span>
								) : null}
							</div>
						</div>,
						document.body,
					)}

			{menu === null
				? null
				: createPortal(
						<RailMenu
							menu={menu}
							pasteable={clipboard.length > 0}
							selection={selected.length}
							movable={menuMove !== null && menuMove.names.length > 0 && menuTargets.length > 0}
							onClose={() => setMenu(null)}
							actions={{
								newPage: () => newPage(menu.target.kind === "page" ? menu.target.page : ROOT_PAGE),
								newPageWith: () => {
									// inside the page holding them: the frames are meant to stay where
									// they are and gain a folder, not travel to the top level
									const names = chosenFrames;
									if (names.length > 0) newPage(pageHolding(names[0] ?? "") ?? activePage, names);
								},
								rename: () => beginRename(menuRow),
								duplicate: () => void duplicate(),
								moveTo: () => {
									// where the menu stood: the picker answers the question that menu
									// item asked, so it opens in its place rather than beside it
									if (menuMove !== null) setMoving({ x: menu.x, y: menu.y, ...menuMove });
								},
								copy,
								paste: () => void paste(menu.target.kind === "page" ? menu.target.page : undefined),
								reveal: () => {
									if (menu.target.kind === "frame") onRevealFrame(menu.target.name);
								},
								openEditor: () => {
									if (menu.target.kind === "frame") onOpenEditor(menu.target.name);
								},
								trash,
								collapseAll,
							}}
						/>,
						document.body,
					)}

			{moving === null
				? null
				: createPortal(
						<PagePicker
							at={moving}
							pages={destinations(moving.kind, moving.names)}
							onPick={moveToPicked}
							onClose={() => setMoving(null)}
						/>,
						document.body,
					)}

			<button
				type="button"
				aria-label="Resize pages"
				onKeyDown={(event) => {
					// a focused grip answers its arrows itself; stop them short of
					// the hotkey dispatch, or the same press would nudge the selection
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.stopPropagation();
					if (event.key === "ArrowLeft") setWidth(STRIP_WIDTH);
					if (event.key === "ArrowRight") setWidth(PANEL_WIDTH);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					grip.current = {
						pointerId: event.pointerId,
						startWidth: width,
						startX: event.clientX,
						latestWidth: width,
					};
					setResizing(true);
				}}
				onPointerMove={(event) => {
					const current = grip.current;
					if (current === null || current.pointerId !== event.pointerId) return;
					const next = Math.min(
						MAX_WIDTH,
						Math.max(STRIP_WIDTH, current.startWidth + event.clientX - current.startX),
					);
					current.latestWidth = next;
					setWidth(next);
				}}
				onPointerUp={(event) => finishResize(event.currentTarget, event.pointerId)}
				onPointerCancel={(event) => finishResize(event.currentTarget, event.pointerId)}
				className="group -right-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
			>
				<span className="absolute top-0 bottom-0 left-[5px] w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
		</aside>
	);
}

/* ── one row ─────────────────────────────────────────────────────────── */

/** Where every row sits: the offset the list already knows, on the house curve. */
function RowShell({ row, lifted = false, children }: { row: RailRow; lifted?: boolean; children: React.ReactNode }) {
	return (
		<div
			role="presentation"
			className="absolute inset-x-0 animate-find-in"
			style={{
				height: row.height,
				transform: `translateY(${row.top}px)`,
				transition: `transform 280ms ${CURVE}, opacity 140ms ease-out`,
				opacity: lifted ? 0.3 : 1,
			}}
		>
			{children}
		</div>
	);
}

/**
 * The page that is being named and does not exist yet.
 *
 * A folder icon and a field, and nothing else: no chevron because there is
 * nothing to open, no count because there is nothing in it, no menu and no
 * drag because there is no folder to act on. Committing makes it a page and
 * Esc takes it away, so it is never a row you can leave behind.
 */
function NewPageRow({ row, rename }: { row: BornRow; rename: RenameHandle }) {
	return (
		<RowShell row={row}>
			<div
				role="treeitem"
				tabIndex={-1}
				aria-selected
				aria-level={row.depth + 1}
				className="relative flex h-full items-center bg-surface pr-1.5"
				style={{ paddingLeft: row.depth * INDENT }}
			>
				<span className="flex h-full w-6 shrink-0" />
				<div className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1">
					<FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
					<RenameField
						state={rename.state}
						size="page"
						onDraft={rename.onDraft}
						onCommit={rename.onCommit}
						onCancel={rename.onCancel}
					/>
				</div>
			</div>
		</RowShell>
	);
}

function TreeRow({
	row,
	activePage,
	litPage,
	selected,
	mark,
	cursored,
	lifted,
	into,
	springing,
	rename,
	onPress,
	onActivate,
	onSelect,
	onOpen,
	onRename,
	onFly,
	onMenu,
}: {
	row: PageRow | FrameRow;
	activePage: string;
	litPage: string | null;
	selected: boolean;
	/** nobody has looked at this frame, or at something inside this shut page */
	mark: Unseen | undefined;
	cursored: boolean;
	lifted: boolean;
	into: boolean;
	/** a drag is resting here: the chevron counts the rest out */
	springing: boolean;
	rename: RenameHandle | null;
	onPress: (event: React.PointerEvent<HTMLElement>, row: RailRow) => void;
	onActivate: () => void;
	onSelect: (event: React.MouseEvent) => void;
	onOpen: (deep: boolean) => void;
	onRename: () => void;
	onFly: () => void;
	onMenu: (event: React.MouseEvent, target: MenuTarget) => void;
}) {
	const label = row.kind === "page" ? pageLabel(row.page) : row.name;
	const target: MenuTarget =
		row.kind === "page" ? { kind: "page", page: row.page } : { kind: "frame", name: row.name };
	const active = row.kind === "page" && row.page === activePage;
	const lit = row.kind === "page" && row.page === litPage;

	return (
		<RowShell row={row} lifted={lifted}>
			{/* the row itself, which takes the whole width of drags and right-clicks;
			    the controls inside it are what a keyboard reaches, exactly as before */}
			<div
				role="treeitem"
				// the tree itself carries the tab stop and its keys walk the rows, which
				// is the roving-tabindex a tree is supposed to have
				tabIndex={-1}
				aria-selected={selected || cursored}
				aria-level={row.depth + 1}
				// something outside this rail is pointing at this page: the finder's pick, or
				// a row in the agent rail naming a frame that is not on screen (#194)
				data-page-lit={lit ? "" : undefined}
				className={cn(
					"group/row relative flex h-full items-center pr-1.5",
					(selected || active || cursored || lit) && "bg-surface",
					!selected && !active && !cursored && !into && "hover:bg-surface/60",
					into && "-outline-offset-1 outline-1 outline-thread/70",
				)}
				// a page's own rows step in one INDENT per level; a frame's spine and
				// content are placed outright, so only a page row needs the padding
				style={{ paddingLeft: row.kind === "page" ? row.depth * INDENT : 0 }}
				onPointerDown={(event) => onPress(event, row)}
				onContextMenu={(event) => onMenu(event, target)}
			>
				{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}

				{row.kind === "page" ? (
					<>
						<button
							type="button"
							aria-label={`${row.open ? "Collapse" : "Expand"} ${label}`}
							aria-expanded={row.open}
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => onOpen(event.altKey)}
							className="relative flex h-full w-6 shrink-0 items-center justify-center"
						>
							<ChevronIcon open={row.open} className="h-2.5 w-2.5" />
							{springing ? <SpringArc /> : null}
						</button>
						{rename === null ? (
							<>
								<button
									type="button"
									aria-label={`${label} page`}
									aria-current={active ? "page" : undefined}
									onClick={onActivate}
									onDoubleClick={onRename}
									className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
								>
									<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
											active || cursored ? "text-text" : "text-muted",
										)}
									>
										{label}
									</span>
								</button>
								{mark === undefined ? null : <UnseenMark mark={mark} className="mr-0.5" />}
								<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{row.count}</span>
							</>
						) : (
							<div className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1">
								<FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
								<RenameField
									state={rename.state}
									size="page"
									onDraft={rename.onDraft}
									onCommit={rename.onCommit}
									onCancel={rename.onCancel}
								/>
							</div>
						)}
					</>
				) : (
					<>
						{/* the spine hangs off the row of the page holding the frame, and the
						    root page has no row: its frames stand at the margin with nothing
						    drawn around them */}
						{row.page === ROOT_PAGE ? null : (
							<>
								<span
									className="absolute w-px bg-border-raised"
									style={{ left: guideX(row.depth), top: 0, height: row.last ? row.height - 6 : row.height }}
								/>
								<span
									className="absolute h-px w-2.5 bg-border-raised"
									style={{ left: guideX(row.depth), top: row.height / 2 }}
								/>
							</>
						)}
						{rename === null ? (
							<button
								type="button"
								aria-label={`${row.name} frame`}
								aria-pressed={selected}
								onClick={onSelect}
								onDoubleClick={onFly}
								className="flex h-full w-full min-w-0 items-center gap-2 pr-3 text-left"
								style={{ paddingLeft: contentX(row.depth) }}
							>
								{row.terminal ? (
									<TermIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />
								) : (
									<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />
								)}
								<span
									className={cn(
										// the name runs to the row's edge; the menu that fades in over
										// its tail takes the last stretch of it with it
										"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
										"group-hover/row:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]",
										selected || cursored || mark !== undefined ? "text-text" : "text-muted",
									)}
								>
									{row.name}
								</span>
								{mark === undefined ? null : (
									<UnseenMark mark={mark} className="transition-opacity group-hover/row:opacity-0" />
								)}
							</button>
						) : (
							<div
								className="flex h-full w-full min-w-0 items-center gap-2 pr-3"
								style={{ paddingLeft: contentX(row.depth) }}
							>
								{row.terminal ? (
									<TermIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
								) : (
									<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
								)}
								<RenameField
									state={rename.state}
									size="frame"
									onDraft={rename.onDraft}
									onCommit={rename.onCommit}
									onCancel={rename.onCancel}
								/>
							</div>
						)}
						{rename === null ? (
							<RowMenuButton label={row.name} onMenu={(event) => onMenu(event, target)} />
						) : null}
					</>
				)}
			</div>
		</RowShell>
	);
}

/**
 * The row's menu, reachable without a right click (#229).
 *
 * It stands over the tail of the name rather than in the row's flow, so a row
 * that is not under the pointer gives its whole width to the name — the same
 * trade home makes on a project card, and the reason the entry file name is no
 * longer written here. The pointer press is stopped short of the row beneath:
 * that one starts a drag and picks the row, and this click is neither.
 */
function RowMenuButton({ label, onMenu }: { label: string; onMenu: (event: React.MouseEvent) => void }) {
	return (
		<button
			type="button"
			aria-label={`${label} menu`}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={onMenu}
			className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded-sm text-muted opacity-0 transition-opacity hover:text-text focus-visible:opacity-100 group-hover/row:opacity-100"
		>
			<DotsIcon />
		</button>
	);
}

/**
 * The name, replaced in place by an input wearing the same mono metrics.
 *
 * Enter commits, Esc reverts, blur commits. A refusal keeps the input up rather
 * than closing the row: a name the project already holds has to be retyped, and
 * closing would leave nothing to retype into.
 */
function RenameField({
	state,
	size,
	onDraft,
	onCommit,
	onCancel,
}: {
	state: RenameState;
	size: "page" | "frame";
	onDraft: (draft: string) => void;
	onCommit: () => void;
	onCancel: () => void;
}) {
	const cancelled = useRef(false);
	const primed = useRef(false);
	const field = useRef<HTMLInputElement | null>(null);
	/**
	 * A refusal arrives after the blur that asked for it, so the name that was
	 * turned down is sitting in a field nobody is in. Take the caret back: the
	 * whole point of staying open is that the name has to be retyped, and Esc has
	 * to have somewhere to land.
	 */
	useEffect(() => {
		if (state.error === null) return;
		field.current?.focus();
		field.current?.select();
	}, [state.error]);
	return (
		<span className="relative flex min-w-0 flex-1 items-center">
			<input
				ref={(element) => {
					field.current = element;
					// once, on arrival: focus and pre-select. Re-running it on every
					// render would re-select the text under each keystroke
					if (element === null || primed.current) return;
					primed.current = true;
					element.focus();
					element.select();
				}}
				aria-label={state.born === null ? "Rename" : "New page name"}
				aria-invalid={state.error !== null}
				value={state.draft}
				spellCheck={false}
				autoComplete="off"
				onChange={(event) => onDraft(event.target.value)}
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") {
						cancelled.current = true;
						event.currentTarget.blur();
					}
				}}
				onBlur={() => {
					if (!cancelled.current) {
						onCommit();
						return;
					}
					cancelled.current = false;
					onCancel();
				}}
				className={cn(
					"-my-px min-w-0 flex-1 rounded-xs bg-bg px-1 font-mono text-text caret-thread outline-1 outline-thread/70",
					size === "page" ? "text-sm leading-sm" : "text-xs leading-xs",
				)}
			/>
			{state.error === null ? null : (
				<span
					role="alert"
					className="pointer-events-none absolute right-1.5 font-mono text-2xs text-thread leading-3"
				>
					{state.error}
				</span>
			)}
		</span>
	);
}

/* ── plumbing ────────────────────────────────────────────────────────── */

/** Which page holds a frame, according to a list the rail drew. */
function pageHoldingIn(byPage: ReadonlyMap<string, readonly RailFrame[]>, name: string): string | undefined {
	for (const [page, list] of byPage) {
		if (list.some((frame) => frame.name === name)) return page;
	}
	return undefined;
}

function rowName(row: RailRow): string {
	if (row.kind === "born") return "";
	return row.kind === "page" ? row.page : row.name;
}

function targetKey(target: MenuTarget): string {
	if (target.kind === "page") return `page:${target.page}`;
	return target.kind === "frame" ? `frame:${target.name}` : "";
}

function labelOf(current: DragLive): string {
	const first = current.names[0] ?? "";
	return current.kind === "page" ? pageLabel(first) : first;
}

/**
 * Whether a drag can land where the pointer says.
 *
 * A page can never go inside itself or inside one of its own pages: the folder
 * would have to be its own parent. The daemon refuses it too, so this is the
 * same law asked while the line is still being drawn — the drop is never
 * offered rather than taken back a round trip later.
 */
function allowed(current: DragLive, landing: Landing | null): boolean {
	if (landing === null) return false;
	if (current.kind !== "page") return true;
	return !current.names.some((page) => page === landing.page || pageWithin(page, landing.page));
}

/** The daemon's refusal in the machine register, at the width a row has for it. */
function refusalLine(status: number): string {
	if (status === 409) return "name taken";
	if (status === 400) return "bad name";
	return "refused";
}

/**
 * The dwell, drawn around the chevron of the page a drag is resting on.
 *
 * A ring that fills over exactly the rest the folder is asking for, so the wait
 * is a thing being watched rather than a delay being suffered. `stroke-dasharray`
 * is the circumference of an r=8 circle, which is what the keyframe unwinds.
 */
function SpringArc() {
	return (
		<svg
			viewBox="0 0 20 20"
			className="pointer-events-none absolute h-5 w-5 text-thread"
			fill="none"
			aria-hidden="true"
		>
			<circle
				cx="10"
				cy="10"
				r="8"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				className="animate-spring-load origin-center -rotate-90"
				style={{ strokeDasharray: 50.3, strokeDashoffset: 0, "--spring-ms": `${SPRING_MS}ms` } as CSSProperties}
			/>
		</svg>
	);
}

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

/**
 * A terminal frame's row.
 *
 * The kind used to be written out as `term.tsx` at the row's right edge; with
 * that gone the icon is what says a frame is a terminal, which is where the
 * canvas says it too.
 */
function TermIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<rect x="1.75" y="2.75" width="10.5" height="8.5" rx="1.25" stroke="currentColor" strokeWidth="1.15" />
			<path
				d="M4.5 6 6 7.5 4.5 9M7.75 9.25h2"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlusIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path d="M5 .75v8.5M.75 5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/** Two chevrons closing on the line between them: the whole tree folding shut. */
function FoldIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 1.5 5 4.25 8.25 1.5M1.75 8.5 5 5.75 8.25 8.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={`${className ?? ""} origin-center text-muted transition-transform duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function PanelCaret({ dir, className }: { dir: "left" | "right"; className?: string }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
