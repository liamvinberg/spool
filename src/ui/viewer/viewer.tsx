import { type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import type { Unseen } from "../../daemon/seen";
import {
	isFramePath,
	pageChain,
	pageHolds,
	pageName,
	pageParent,
	pageUnder,
	pageWithin,
	ROOT_PAGE,
} from "../../page-path";
import { saidAgo, saidList, sharedItems, sharedPageName } from "../../share-view";
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
	zoomFloor,
} from "../canvas/camera";
import { type CameraStore, createCameraStore, useCameraFollow } from "../canvas/camera-store";
import { CanvasPath, PATH_KEYS, type PathPlace, type PathSeg, type PathWay } from "../canvas/canvas-path";
import { COMMENT_CURSOR } from "../canvas/comment-cursor";
import { CommentsLayer, clickAway, commentWorld } from "../canvas/comments-layer";
import { FrameLabel, LabelField } from "../canvas/frame-label";
import { flatPages, mergeOrder, mergePageTree } from "../canvas/order";
import { type ElementPreview, PreviewIn } from "../canvas/overlays";
import { chainOf, type ListWorld, listsPages, pageListRows } from "../canvas/page-list";
import { PageListView } from "../canvas/page-list-view";
import { PictureClaims } from "../canvas/picture-canvas";
import type { PictureFrame } from "../canvas/picture-layer";
import { createPresenceRoom } from "../canvas/presence";
import { FollowMark, PresenceFaces } from "../canvas/presence-faces";
import { PresenceLayer } from "../canvas/presence-layer";
import { railRows } from "../canvas/rail-rows";
import { useFollow, usePointerHidden, usePresenceSender } from "../canvas/use-presence";
import { handoverAddress, knock } from "../handover";
import { FolderIcon, FrameIcon, ShareIcon } from "../icons";
import { Divider } from "../primitives/display";
import { Progress, TextAction, Toast } from "../primitives/feedback";
import { Bar, Panel, ScrollArea, StatusLine, TreeRow } from "../primitives/structure";
import { SharedControl, useShares } from "../shares";
import { TeamMark } from "../teams";
import { type LinkSignedIn, signOutHere, type ViewerLinkSignIn } from "./link-sign-in";
import { NavigateContext } from "./navigate";
import { Navigator, type NavigatorToast } from "./navigator";
import { markSeen, type OutsiderUnseen, openShare, seenKey } from "./outsider-seen";
import { onPhone } from "./phone";
import { SharedLink } from "./shared-link";
import { type CanvasTop, canvasTop, frameSaid, topTitle } from "./shared-top";
import {
	address,
	edits,
	linkedComment,
	listen,
	locate,
	readProject,
	type ViewerConfig,
	type ViewerLive,
	type ViewerProject,
	type ViewerShared,
	viewerShares,
} from "./source";
import {
	askPick,
	CommentsButton,
	CommentsPanel,
	placeComment,
	useCommentKeys,
	useOutsiderComments,
	useViewerComments,
	ViewerCommentsList,
	ViewerTools,
} from "./viewer-comments";
import { FieldDocuments } from "./viewer-documents";
import { FieldFrame, FieldPictures } from "./viewer-field";
import { chooseLive, NEAR_MARGIN } from "./viewer-live";
import { ViewerPlayer } from "./viewer-player";
import { useViewerPresence, type ViewerPresence } from "./viewer-presence";
import { CommentsTip, markTipSeen, SignInDialog, tipSeen } from "./viewer-sign-in";

/**
 * The read-only canvas (DEV-114): the shipped canvas with every authoring
 * control taken off, for anyone looking at a team project in a browser. The
 * pages rail stays, the camera is this browser's own, frames are live, and a
 * click grows a frame into the player. There is no pane, agent or selection,
 * and nothing about the project changes from here: it is fed one project by
 * `readProject`, and every frame's document comes from the frames' own origin.
 *
 * A member comments here as on the Mac (spool#173): a Pointer and a Comment
 * tool, the Mac's pins and cards, and the Comments list in a panel. Comments
 * are the one thing the canvas writes, besides an editor's shares.
 */
export function Viewer({
	config,
	swapped = false,
	onMissing,
}: {
	config: ViewerConfig;
	/**
	 * Opened in place from another of the app's places, with no page load of its own: its first read counts as the
	 * share's open, and it names the tab once read.
	 */
	swapped?: boolean;
	/** The project can't be read here (gone, refused, sent elsewhere): the caller loads its page whole instead. */
	onMissing?: (() => void) | undefined;
}) {
	// undefined while it is being read, null when there is no project to read
	const [project, setProject] = useState<ViewerProject | null | undefined>(undefined);
	/** An outsider's open of their share, recorded as it is read, on a phone as on a desktop (spool#184). */
	const [opened, setOpened] = useState<SeenOpen | null>(null);
	const [phone] = useState(onPhone);
	const missing = useRef(onMissing);
	missing.current = onMissing;
	useEffect(() => {
		let live = true;
		readProject(config, { open: swapped }).then(
			(read) => {
				if (!live) return;
				if (read === undefined && missing.current) return missing.current();
				if (read?.shared !== undefined) {
					const key = seenKey(config, read);
					setOpened({ key, unseen: openShare(key, read) });
				}
				setProject(read ?? null);
			},
			() => {
				if (!live) return;
				if (missing.current) return missing.current();
				setProject(null);
			},
		);
		return () => {
			live = false;
		};
	}, [config, swapped]);
	useEffect(() => {
		if (!swapped || !project) return;
		document.title = [project.project, project.shared === undefined ? project.team?.name : undefined, "spool"]
			.filter(Boolean)
			.join(" · ");
	}, [swapped, project]);
	// only while the project's data is on its way: a hairline along the top edge, and the canvas's own ground
	if (project === undefined)
		return (
			<div className="h-dvh bg-surface-canvas">
				<Progress label="Opening" className="fixed top-0 bottom-auto z-50" />
			</div>
		);
	if (project === null) return <Quiet>This project isn’t here</Quiet>;
	// a phone gets no spatial canvas: a shared link plays, and a team canvas is a navigator
	if (phone && project.shared !== undefined) return <SharedLink config={config} project={project} />;
	return <LiveCanvas config={config} first={project} phone={phone} opened={opened} />;
}

/** Where an outsider's share is kept as seen in this browser, and what it hadn't seen at this open. */
interface SeenOpen {
	key: string;
	unseen: OutsiderUnseen;
}

/** How long a burst of saves is let land before the canvas reads the project again. */
const REREAD_MS = 150;
/** How long a burst of covers is let land before the canvas reads the project again for their addresses. */
const COVERED_MS = 500;
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
 * toast says who saved what. The canvas reads the project again for anything else the save moved, and again
 * when spool.page says new covers landed.
 *
 * A frame a save touched while it had a cover is stale: its picture is of the frame before the save. It stays
 * stale until a newer cover arrives, and meanwhile may stand as its document wherever it is on screen.
 */
function LiveCanvas({
	config,
	first,
	phone,
	opened: open,
}: {
	config: ViewerConfig;
	first: ViewerProject;
	phone: boolean;
	opened: SeenOpen | null;
}) {
	const [project, setProject] = useState(first);
	/** How many times each frame's document has been made again since this tab opened. */
	const [revisions, setRevisions] = useState<ReadonlyMap<string, number>>(new Map());
	/** How many times the canvas came back from being away to find saves it missed: every live document is made again. */
	const [epoch, setEpoch] = useState(0);
	/** Frames a save touched after their cover was taken, with that cover's address. */
	const [stale, setStale] = useState<ReadonlyMap<string, string>>(new Map());
	// an outsider's marks are what their share added since this browser last opened it (spool#184)
	const [shareKey] = useState(() => open?.key ?? null);
	const [opened] = useState(() => open?.unseen ?? null);
	const [marks, setMarks] = useState<ReadonlyMap<string, Unseen>>(
		() => new Map([...(opened?.frames ?? [])].map((frame) => [frame, "new"])),
	);
	const [pageMarks, setPageMarks] = useState<ReadonlySet<string>>(() => opened?.pages ?? new Set());
	const [toast, setToast] = useState<(NavigatorToast & { id: number }) | null>(null);
	const known = useRef(new Set(first.canvas.frames.map((frame) => frame.name)));
	known.current = new Set(project.canvas.frames.map((frame) => frame.name));
	const covers = useRef(first.covers);
	covers.current = project.covers;
	const presence = useViewerPresence(first.presence);

	// a cover newer than the one a save left stale ends it
	useEffect(
		() =>
			setStale((current) => {
				const next = new Map([...current].filter(([frame, cover]) => project.covers?.[frame] === cover));
				return next.size === current.size ? current : next;
			}),
		[project.covers],
	);

	useEffect(() => {
		let head: number | undefined;
		let reread: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const read = (wait = REREAD_MS) => {
			clearTimeout(reread);
			reread = setTimeout(() => {
				readProject(config).then(
					(next) => !stopped && next !== undefined && setProject(next),
					() => {},
				);
			}, wait);
		};
		const remake = (frames: Iterable<string>) =>
			setRevisions((current) => {
				const next = new Map(current);
				for (const frame of frames) next.set(frame, (next.get(frame) ?? 0) + 1);
				return next;
			});
		const renew = setInterval(read, RENEW_MS);
		const heard = (message: ViewerLive) => {
			if (message.type === "covered") return read(COVERED_MS);
			if (message.type === "head") {
				// back after being away: whatever was saved meanwhile, every document on screen is made again
				if (head !== undefined && message.head !== head) {
					read();
					setEpoch((was) => was + 1);
				}
				head = message.head;
				return;
			}
			head = message.head;
			read();
			remake(message.touched);
			setStale((current) => {
				const next = new Map(current);
				for (const frame of message.touched) {
					const cover = covers.current?.[frame];
					if (cover !== undefined && !next.has(frame)) next.set(frame, cover);
				}
				return next;
			});
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
		(frame: string) => {
			if (shareKey !== null) markSeen(shareKey, "frame", frame);
			setMarks((current) => {
				if (!current.has(frame)) return current;
				const next = new Map(current);
				next.delete(frame);
				return next;
			});
		},
		[shareKey],
	);
	const pageSeen = useCallback(
		(page: string) => {
			if (shareKey !== null) markSeen(shareKey, "page", page);
			setPageMarks((current) => {
				if (!current.has(page)) return current;
				const next = new Set(current);
				next.delete(page);
				return next;
			});
		},
		[shareKey],
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
			epoch={epoch}
			stale={stale}
			marks={marks}
			onSeen={seen}
			pageMarks={pageMarks}
			onPageSeen={pageSeen}
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
	return (
		<div className="flex h-dvh items-center justify-center bg-surface-canvas text-secondary type-detail">
			{children}
		</div>
	);
}

/** What the chrome takes off the top (the buttons by the faces) and the foot (the tools) of a fitted page. */
const FIT_TOP = 40;
const FIT_FOOT = 48;

/** A page fitted between the chrome at the top and the tools at the foot, so neither stands over a frame. */
function fitBetweenChrome(bounds: Box, w: number, h: number): Camera {
	const fitted = fitCamera(bounds, w, Math.max(h - FIT_TOP - FIT_FOOT, 1));
	return { ...fitted, y: fitted.y + FIT_TOP };
}
/** Where a page with nothing on it stands. */
const EMPTY_CAMERA: Camera = { x: 0, y: 0, k: 1 };

function ViewerCanvas({
	config,
	project,
	presence,
	revisions,
	epoch,
	stale,
	marks,
	onSeen,
	pageMarks,
	onPageSeen,
	onNotice,
	toast,
}: {
	config: ViewerConfig;
	project: ViewerProject;
	/** Who else is on the canvas, for a member; null for an outsider, who sees nobody. */
	presence: ViewerPresence | null;
	revisions: ReadonlyMap<string, number>;
	/** How many times every live document has been made again, for saves missed while away. */
	epoch: number;
	/** Frames a save touched after their cover was taken. */
	stale: ReadonlyMap<string, string>;
	marks: ReadonlyMap<string, Unseen>;
	/** A frame was played: its mark has been seen. */
	onSeen: (frame: string) => void;
	/** The pages an outsider's share added since this browser last opened it, and not opened since. */
	pageMarks: ReadonlySet<string>;
	/** A page was gone to: its mark has been seen. */
	onPageSeen: (page: string) => void;
	onNotice: (message: string) => void;
	toast: string | null;
}) {
	const { canvas } = project;
	const known = useMemo(() => new Set(canvas.pages), [canvas.pages]);
	const [where, setWhere] = useState(() => locate(config, new URL(window.location.href)));
	const outsider = project.shared !== undefined;
	const rooted = sharedRooted(project);
	const top = useMemo(() => canvasTop(canvas, canvas.order, rooted), [canvas, rooted]);
	// an outsider on a whole-project share opens on its first page: the root page's frames only when it has some;
	// one on a share of some of it, on what was shared (spool#230)
	const opening = rooted
		? top.top
		: outsider
			? (project.shared?.pages.find((each) => each === ROOT_PAGE || known.has(each)) ?? ROOT_PAGE)
			: ROOT_PAGE;
	// a link naming only a frame (spool.page/<team>/<project>?frame=shop/cart) opens on that frame's own page
	const linked =
		where.page === ROOT_PAGE && where.frame !== null
			? canvas.frames.find((frame) => frame.name === where.frame)?.page
			: undefined;
	const named = linked ?? where.page;
	// nothing above a share's top is on its canvas: going there goes to the top
	const page = known.has(named) && pageHolds(top.top, named) ? named : opening;
	const frames = useMemo(() => canvas.frames.filter((frame) => (frame.page ?? ROOT_PAGE) === page), [canvas, page]);
	/** a page holding only pages, the root too, draws them as a list rather than a field, as on the Mac (spool#224) */
	const listRows = useMemo(() => {
		const world: ListWorld = { pages: canvas.pages, frames: canvas.frames, waiting: [], order: canvas.order };
		if (!listsPages(page, world, top.tree)) return [];
		return pageListRows(page, world, top.tree).map((row) => {
			const place = top.places.get(row.page);
			return place === undefined ? row : { ...row, place };
		});
	}, [canvas, page, top]);
	const listing = listRows.length > 0;
	/** the row the pointer last lit, the first until it lights one */
	const [lit, setLit] = useState<string | null>(null);
	const litRow = listRows.some((row) => row.page === lit) ? lit : (listRows[0]?.page ?? null);
	useEffect(() => {
		if (pageMarks.has(page)) onPageSeen(page);
	}, [page, pageMarks, onPageSeen]);
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
		camera.set(left ?? (frames.length === 0 ? EMPTY_CAMERA : fitBetweenChrome(boundsOf(frames), size.w, size.h)));
	}, [camera, page, frames, size.w, size.h]);
	/** The live frames' documents (`viewer-documents.ts`), each made from the address and making it is on now. */
	const source = useRef({ frames: project.frames, revisions, epoch });
	source.current = { frames: project.frames, revisions, epoch };
	const [documents] = useState(
		() =>
			new FieldDocuments((name) => ({
				src: `${source.current.frames}${encodeURIComponent(name)}`,
				revision: `${source.current.epoch}.${source.current.revisions.get(name) ?? 0}`,
			})),
	);
	useEffect(() => {
		const stop = documents.listen();
		return () => {
			stop();
			documents.stop();
		};
	}, [documents]);
	// a frame made again boots its new document behind the one on screen
	useEffect(() => {
		if (revisions.size > 0 || epoch > 0) documents.refresh();
	}, [documents, revisions, epoch]);
	useEffect(
		() =>
			camera.subscribe((at, moving) => {
				documents.setMoving(at !== null && moving);
				if (at === null) return;
				cameras.current.set(page, at);
				if (!moving) setRest(at);
			}),
		[camera, page, documents],
	);

	const near: NearScreen = useCallback(
		(at, box) => intersects(box, visibleWorldRect(at, size.w, size.h, NEAR_MARGIN)),
		[size.w, size.h],
	);

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
		const onPop = () => {
			const at = new URL(window.location.href);
			// back to another of the app's places: that place opens instead of this canvas
			if (config.path !== "" && at.pathname !== config.path && !at.pathname.startsWith(`${config.path}/`)) return;
			setWhere(locate(config, at));
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [config]);

	// --- the way back (spool#238): the path at the canvas's top left, from where the project lives down to the page
	const place = useMemo(() => placeOf(project), [project]);
	const navigate = useContext(NavigateContext);
	/** whether a page is one this person can be on: every page for a member, the shared ones for anyone else */
	// nothing above a share's top is on its canvas (spool#230), so the path starts there, by the share's own name
	const reachable = useCallback(
		(each: string) =>
			each === top.top ||
			(pageHolds(top.top, each) &&
				(each === ROOT_PAGE ? !outsider || (project.shared?.pages.includes(ROOT_PAGE) ?? false) : known.has(each))),
		[top.top, outsider, project.shared, known],
	);
	/** where ⌘↑ goes: the nearest page holding this one that can be gone to, then the canvas's top, then its place */
	const above = useMemo((): string | "place" | null => {
		if (page === top.top || (outsider && page === opening)) return place === undefined ? null : "place";
		let up = pageParent(page);
		while (up !== top.top && up !== ROOT_PAGE && !reachable(up)) up = pageParent(up);
		return up;
	}, [page, top.top, outsider, opening, place, reachable]);
	// several items side by side under a way back to Shared with you: named by who shared them, not that again
	const rootedTitle =
		top.top === ROOT_PAGE && place !== undefined ? (project.team?.name ?? topTitle(top)) : topTitle(top);
	const pathSegs = useMemo((): PathSeg[] => {
		const chain = chainOf(page).filter((each) => pageHolds(top.top, each));
		return chain
			.filter((each, at) => each === top.top || at === chain.length - 1 || reachable(each))
			.map((each, at, all) => ({
				page: each,
				name: each === top.top ? (rooted ? rootedTitle : project.project) : pageName(each),
				kind: at === all.length - 1 ? "here" : "crumb",
				keys: each === above ? PATH_KEYS.up() : undefined,
				href: address(config, each, null),
			}));
	}, [page, top, rooted, rootedTitle, project.project, reachable, above, config]);
	const pathWay = useRef<{ from: string; way: PathWay }>({ from: page, way: "side" });
	if (pathWay.current.from !== page) {
		const from = pathWay.current.from;
		const way = pageWithin(page, from) ? "up" : pageWithin(from, page) ? "in" : "side";
		pathWay.current = { from: page, way };
	}
	const [keyMoves, setKeyMoves] = useState(0);
	const accelDown = useAccelDown();
	useEffect(() => {
		if (played !== null) return;
		const down = (event: KeyboardEvent) => {
			if (event.key !== "ArrowUp" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
			const target = event.target;
			if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT")) return;
			if (target instanceof HTMLElement && target.tagName === "TEXTAREA") return;
			if (above === null) return;
			event.preventDefault();
			if (above === "place" && place !== undefined) navigate(place.href);
			else if (above !== "place") {
				setKeyMoves((was) => was + 1);
				go({ page: above, frame: null });
			}
		};
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [played, above, place, go, navigate]);

	// --- comments (spool#173): a member's, written to spool.page and heard on the presence socket
	const commentsUrl = useMemo(() => new URL(address(config, ROOT_PAGE, null), window.location.href).href, [config]);
	// an outsider's (spool#174): once signed in, their share's alone, on a socket of their own
	const outsiderShare = project.outsider;
	const [signedInHere, setSignedInHere] = useState<LinkSignedIn | null>(null);
	// spool.page cut their comments off: blocked, or signed out (their session ended, or they signed out elsewhere)
	const [cutOff, setCutOff] = useState(false);
	const outsiderMe = cutOff ? null : (signedInHere ?? outsiderShare?.me ?? null);
	const outsiderHeard = useOutsiderComments(
		outsiderShare !== undefined && outsiderMe !== null ? outsiderShare.socket : undefined,
		(blocked) => {
			setCutOff(true);
			setSignedInHere(null);
			if (blocked) onNotice("The team has blocked you from commenting on this share.");
			else if (outsiderShare?.signIn !== undefined) setAsked("none");
		},
	);
	// signing out of a link's host: its comments go at once, and spool.page ends the session behind them
	const signOut = (link: ViewerLinkSignIn | undefined) => {
		if (link === undefined) return;
		setCutOff(true);
		setSignedInHere(null);
		void signOutHere(link);
	};
	const comments = useViewerComments(project, presence ?? outsiderHeard, commentsUrl, onNotice, outsiderMe);
	useCommentKeys(played === null ? comments : null);
	// signed out on a link share: the frames open, and everything that needs the comments asks them to sign in first
	const signIn = outsiderMe === null ? outsiderShare?.signIn : undefined;
	const [asked, setAsked] = useState<Reached | null>(null);
	const [reached, setReached] = useState<Reached | null>(null);
	const [tip, setTip] = useState(
		() => signIn !== undefined && outsiderShare !== undefined && !tipSeen(outsiderShare.share.id),
	);
	// said once: shown is seen, whether or not it is answered
	const tipShare = tip ? outsiderShare?.share.id : undefined;
	useEffect(() => {
		if (tipShare !== undefined) markTipSeen(tipShare);
	}, [tipShare]);
	const closeTip = useCallback(() => setTip(false), []);
	const askSignIn = useCallback(
		(intent: Reached) => {
			closeTip();
			setAsked(intent);
		},
		[closeTip],
	);
	// what they reached for carries on once they have signed in and the comments are there
	useEffect(() => {
		if (reached === null || comments === null) return;
		if (reached === "tool") comments.setTool("comment");
		if (reached === "list") comments.setPanel(true);
		setReached(null);
	}, [reached, comments]);
	useEffect(() => {
		if (signIn === undefined || played !== null) return;
		const down = (event: KeyboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT")) return;
			if (event.code !== "KeyC" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.repeat) return;
			askSignIn("tool");
		};
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [signIn, played, askSignIn]);
	const sharedBy = project.shared?.by ?? "The";
	/**
	 * The comment to go to: its page first, then its pin, flown to with the zoom kept, and its card opened. A Copy
	 * link (`?comment=<id>`) names one when the canvas opens, and is taken off the address once it is open; a row
	 * in the Comments list names one when pressed.
	 */
	const [aim, setAim] = useState<{ id: string; link: boolean } | null>(() => {
		const id = linkedComment(new URL(window.location.href));
		return id === null ? null : { id, link: true };
	});
	// a link to a comment (an email's, say) while signed out asks them in first, and goes to it once they are
	const linkedSignedOut = aim?.link === true && signIn !== undefined;
	useEffect(() => {
		if (linkedSignedOut) setAsked((was) => was ?? "none");
	}, [linkedSignedOut]);
	useEffect(() => {
		if (aim === null || comments === null) return;
		const comment = comments.comments.find((each) => each.id === aim.id);
		if (comment === undefined) {
			// not among them yet: wait until every comment has been heard, then it isn't there
			if (!comments.heard) return;
			if (aim.link) {
				window.history.replaceState(window.history.state, "", address(config, page, played));
				onNotice("That comment isn’t here anymore.");
			}
			setAim(null);
			return;
		}
		const goes = comment.standing !== "deleted-page" && (comment.page === ROOT_PAGE || known.has(comment.page));
		if (goes && comment.page !== page) {
			go({ page: comment.page, frame: null }, aim.link ? "replace" : "push");
			return;
		}
		if (size.w === 0) return;
		comments.store.set({ commentOpen: comment.id, commentDraft: null });
		const world = goes ? commentWorld(comment, frames) : undefined;
		const at = camera.get();
		if (world !== undefined && at !== null)
			camera.fly({ k: at.k, x: size.w / 2 - world.x * at.k, y: size.h / 2 - world.y * at.k });
		if (aim.link) window.history.replaceState(window.history.state, "", address(config, page, played));
		setAim(null);
	}, [aim, comments, config, page, played, known, frames, go, camera, size.w, size.h, onNotice]);
	const placing = comments?.tool === "comment";
	/**
	 * Whether the picture layer is drawing: not with no WebGL2, nor while a lost context is away, when every frame
	 * with a cover shows it as an image instead.
	 */
	const [drawing, setDrawing] = useState(true);
	const covers = project.covers;
	const pictureFrames = useMemo(
		() => frames.map(({ name, x, y, w, h }): PictureFrame => ({ name, x, y, w, h, still: covers?.[name] })),
		[frames, covers],
	);
	const [claims] = useState(() => new PictureClaims());
	/** Under the Comment tool, the frame under the pointer: its document is what a pin there reads. */
	const [focus, setFocus] = useState<string | null>(null);
	useEffect(() => {
		if (!placing) setFocus(null);
	}, [placing]);
	/**
	 * The documents standing (`viewer-live.ts`): what the camera came to rest near and draws large enough to read,
	 * a frame whose cover a save left behind, and the frame a pin is about to read, nearest the middle first.
	 */
	const staleFrames = useMemo(() => new Set(stale.keys()), [stale]);
	useEffect(() => {
		if (rest === null || size.w === 0) return;
		documents.setLive(
			chooseLive({
				frames,
				camera: rest,
				viewport: size,
				stale: staleFrames,
				focus,
				placing,
				was: documents.live,
				failed: documents.failed,
			}),
		);
	}, [documents, frames, rest, size, staleFrames, focus, placing]);
	/**
	 * What is under a point on screen: the world point, and the frame drawn on top there, where frames overlap, with
	 * the point in its own pixels and its live document, when it has one.
	 */
	const under = (clientX: number, clientY: number) => {
		const box = viewport.current?.getBoundingClientRect();
		const at = camera.get();
		if (box === undefined || at === null) return null;
		const world = { x: (clientX - box.left - at.x) / at.k, y: (clientY - box.top - at.y) / at.k };
		const frame = [...frames]
			.reverse()
			.find(
				(each) =>
					world.x >= each.x && world.x <= each.x + each.w && world.y >= each.y && world.y <= each.y + each.h,
			);
		if (frame === undefined) return { world, frame: null };
		const document =
			viewport.current?.querySelector<HTMLIFrameElement>(
				`[data-viewer-frame="${CSS.escape(frame.name)}"] iframe[title="${CSS.escape(frame.name)}"]`,
			) ?? null;
		return { world, frame: { name: frame.name, at: { x: world.x - frame.x, y: world.y - frame.y }, document } };
	};
	/** A press under the Comment tool: a pin on the frame under it, at the frame's own point, or on the field. */
	const placeAt = (event: React.PointerEvent) => {
		const found = under(event.clientX, event.clientY);
		if (comments === null || found === null) return;
		if (found.frame === null) return placeComment(comments, { page, frame: null, at: found.world }, null);
		placeComment(comments, { page, frame: found.frame.name, at: found.frame.at }, found.frame.document);
	};

	/**
	 * Under the Comment tool, the element a press would point at, outlined as the Mac outlines it (spool#173): asked
	 * of the frame's own document, which answers a pick from any canvas that holds it. One ask is out at a time, and
	 * the pointer's newest point is asked next, so the outline keeps up with the hand without queueing behind it.
	 */
	const [hover, setHover] = useState<ElementPreview | null>(null);
	const hoverAsk = useRef<{ busy: boolean; next: { x: number; y: number } | null }>({ busy: false, next: null });
	const placingNow = useRef(placing);
	placingNow.current = placing;
	const hoverAt = (clientX: number, clientY: number) => {
		const ask = hoverAsk.current;
		ask.next = { x: clientX, y: clientY };
		if (ask.busy) return;
		const point = ask.next;
		ask.next = null;
		const found = under(point.x, point.y)?.frame;
		// the frame under the pointer is the one a pin would read: its document is made, if it isn't yet
		const name = found?.name ?? null;
		setFocus((was) => (was === name ? was : name));
		if (found === undefined || found === null || found.document === null) return setHover(null);
		ask.busy = true;
		void askPick(found.document, found.at).then((hit) => {
			ask.busy = false;
			if (!placingNow.current) return setHover(null);
			setHover(
				hit === undefined
					? null
					: {
							frame: found.name,
							selector: hit.selector,
							rect: hit.rect,
							...(hit.rects === undefined ? {} : { rects: hit.rects }),
							radius: hit.radius,
						},
			);
			const later = ask.next;
			if (later !== null) hoverAt(later.x, later.y);
		});
	};
	const hoverOff = useCallback(() => {
		hoverAsk.current.next = null;
		setHover(null);
	}, []);
	useEffect(() => {
		if (!placing) hoverOff();
	}, [placing, hoverOff]);
	const hoverFrame = hover === null ? undefined : frames.find((frame) => frame.name === hover.frame);

	// out no further than the whole page fitting the view (DEV-289); a ref, so the wheel reads today's page
	const floor = useRef<number | undefined>(undefined);
	floor.current = frames.length === 0 ? undefined : zoomFloor(boundsOf(frames), size.w, size.h);

	// scroll pans; with ⌘ or ctrl held, or a pinch, it zooms around the pointer
	useEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			// a comment's card scrolls its own words
			if (event.target instanceof Element && event.target.closest("[data-comment-card], [data-comment-composer]"))
				return;
			event.preventDefault();
			const at = camera.get();
			if (at === null) return;
			const dx = wheelPixels(event.deltaX, event.deltaMode, el.clientHeight);
			const dy = wheelPixels(event.deltaY, event.deltaMode, el.clientHeight);
			if (event.ctrlKey || event.metaKey) {
				const box = el.getBoundingClientRect();
				const factor = wheelZoomFactor(event.deltaY, event.deltaMode, el.clientHeight);
				camera.set(zoomAt(at, event.clientX - box.left, event.clientY - box.top, factor, floor.current));
			} else if (event.shiftKey && dx === 0) camera.set({ ...at, x: at.x - dy });
			else camera.set({ ...at, x: at.x - dx, y: at.y - dy });
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [camera]);

	// a drag on the field pans it, from wherever it starts
	const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
	/** The frame under the pointer, or its name: its name lights and offers play, as on the Mac. */
	const [pointed, setPointed] = useState<string | null>(null);
	/**
	 * The frame a press or the pointer at this point is on: found by where it is in the world, since a frame
	 * standing as its picture has nothing on the page to be pressed. Only the field's own: a label, a pin or a card
	 * standing over a frame is not the frame.
	 */
	const frameAt = (target: EventTarget | null, clientX: number, clientY: number): string | null => {
		if (!(target instanceof Element)) return null;
		const field = target === viewport.current || target.hasAttribute("data-viewer-page");
		if (!field && target.closest("[data-viewer-frame]") === null) return null;
		return under(clientX, clientY)?.frame?.name ?? null;
	};
	const point = (event: { target: EventTarget | null; clientX: number; clientY: number } | null) => {
		const at = event?.target instanceof Element ? event.target : null;
		const name =
			event === null
				? null
				: (at?.closest<HTMLElement>("[data-frame-label]")?.dataset.frameLabel ??
					frameAt(event.target, event.clientX, event.clientY));
		setPointed((was) => (was === name ? was : name));
	};
	// Chrome starts its autoscroll from the middle button's mousedown, past the pointerdown that pans
	useEffect(() => {
		const field = viewport.current;
		if (field === null) return;
		const keep = (event: MouseEvent) => {
			if (event.button === 1) event.preventDefault();
		};
		field.addEventListener("mousedown", keep);
		return () => field.removeEventListener("mousedown", keep);
	}, []);
	const onPointerDown = (event: React.PointerEvent) => {
		if (event.button !== 0 && event.button !== 1) return;
		camera.stop();
		// a middle-button drag pans from the first pixel and never clicks, as on the Mac's canvas
		const middle = event.button === 1;
		if (middle) {
			// the browser's own middle press scrolls the page or opens a link; here it pans
			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			hoverOff();
			point(null);
		}
		drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: middle };
	};
	const onPointerMove = (event: React.PointerEvent) => {
		const held = drag.current;
		const at = camera.get();
		if (placing && (held === null || !held.moved)) hoverAt(event.clientX, event.clientY);
		if (held === null || !held.moved) point(placing ? null : event);
		if (held === null || held.id !== event.pointerId || at === null) return;
		const dx = event.clientX - held.x;
		const dy = event.clientY - held.y;
		if (!held.moved && Math.hypot(dx, dy) < 3) return;
		if (!held.moved) {
			event.currentTarget.setPointerCapture(event.pointerId);
			hoverOff();
			point(null);
		}
		held.moved = true;
		held.x = event.clientX;
		held.y = event.clientY;
		camera.set({ ...at, x: at.x + dx, y: at.y + dy });
	};
	const onPointerUp = (event: React.PointerEvent) => {
		const held = drag.current;
		drag.current = null;
		if (held === null || held.moved || held.id !== event.pointerId) return;
		if (comments !== null) {
			if (comments.tool === "comment") return placeAt(event);
			// a click away puts down an open card or the composer before it plays anything
			if (clickAway(comments.store)) return;
		}
		// a click, not a drag: on a frame it plays the frame
		const frame = frameAt(event.target, event.clientX, event.clientY);
		if (frame !== null) play(frame);
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
		if (frames.length > 0) camera.fly(fitBetweenChrome(boundsOf(frames), size.w, size.h));
	};
	const zoomBy = (factor: number) => {
		const at = camera.get();
		if (at !== null) camera.fly(zoomAt(at, size.w / 2, size.h / 2, factor, floor.current));
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
		hidden: usePointerHidden(room),
		following,
	});
	useFollow({
		room: room ?? EMPTY_ROOM,
		following,
		stop: () => setFollowing(null),
		camera,
		viewportRef: viewport,
		page,
		goToPage: (next) => {
			if (next === ROOT_PAGE ? top.top !== ROOT_PAGE : !known.has(next) || !pageHolds(top.top, next)) return false;
			if (next !== page) go({ page: next, frame: null });
			return true;
		},
	});
	const followed = following === null ? undefined : room?.get(following);

	return (
		// paint contained: the closed comments panel past the edge gives the page nothing to scroll to, so a frame
		// that takes the focus as it comes alive can't slide the whole canvas aside
		<div className="flex h-dvh select-none overflow-clip bg-surface-window text-primary contain-paint">
			<PagesRail
				project={project}
				top={rooted ? top : null}
				page={page}
				marks={marks}
				pageMarks={pageMarks}
				onPage={(next) => next !== page && go({ page: next, frame: null })}
				onFrame={(name) => {
					const frame = frames.find((each) => each.name === name);
					if (frame !== undefined) flyTo(frame);
				}}
				onPlay={play}
				foot={
					outsiderMe !== null ? (
						<>
							<span className="truncate" data-viewer-signed-in="">
								{outsiderMe.name}
							</span>
							{/* a link's host is signed in on alone, so it signs out here too */}
							{outsiderShare?.signIn === undefined ? null : (
								<TextAction className="-mr-1.5" onClick={() => signOut(outsiderShare.signIn)}>
									Sign out
								</TextAction>
							)}
						</>
					) : signIn !== undefined ? (
						<>
							<span className="truncate">not signed in</span>
							<TextAction className="-mr-1.5" onClick={() => askSignIn("none")}>
								Sign in
							</TextAction>
						</>
					) : undefined
				}
			/>
			<div className="relative min-w-0 flex-1 overflow-clip bg-surface-canvas">
				<div
					ref={viewport}
					data-viewer-field=""
					className="absolute inset-0 touch-none"
					style={{ cursor: placing ? COMMENT_CURSOR : pointed !== null ? "pointer" : "default" }}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerLeave={() => {
						hoverOff();
						point(null);
					}}
					onPointerUp={onPointerUp}
					onPointerCancel={() => {
						drag.current = null;
					}}
				>
					{/* every frame standing as its picture, on the GPU, under every shell and label */}
					<FieldPictures
						camera={camera}
						frames={pictureFrames}
						claims={claims}
						documents={documents}
						onDrawing={setDrawing}
					/>
					{/* a page swap lays the new page in rather than cutting to it */}
					<div key={page} data-viewer-page="" className="absolute inset-0 animate-[viewer-page-in_160ms_ease-out]">
						<CameraField camera={camera}>
							{frames.map((frame) => (
								<FieldFrame
									key={frame.name}
									frame={frame}
									camera={camera}
									near={near}
									pictured={drawing && covers?.[frame.name] !== undefined}
									cover={covers?.[frame.name]}
									documents={documents}
									claims={claims}
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
									hovered={pointed === frame.name}
									unseen={marks.get(frame.name)}
									onPlay={play}
								/>
							))}
						</LabelField>
					</div>
					{frames.length === 0 && !listing && (
						<div className="absolute inset-0 flex items-center justify-center text-secondary type-detail">
							nothing on this page yet
						</div>
					)}
					{hoverFrame !== undefined && hover !== null && (
						<div className="pointer-events-none absolute inset-0" data-comment-hover={hover.selector}>
							<PreviewIn camera={camera} frame={hoverFrame} preview={hover} />
						</div>
					)}
					{room !== undefined && (
						<PresenceLayer
							room={room}
							camera={camera}
							frames={frames}
							page={page}
							following={following}
							onFollow={(accountId) => setFollowing((was) => (was === accountId ? null : accountId))}
						/>
					)}
					{comments !== null && (
						<CommentsLayer
							context={comments.context}
							store={comments.store}
							camera={camera}
							frames={frames}
							page={page}
							comments={comments.comments}
						/>
					)}
				</div>
				{/* over the field, so its wheel scrolls the list rather than the camera */}
				{listing && (
					<PageListView
						stillOf={(row) => (row.still === undefined ? undefined : project.covers?.[row.still.frame])}
						rows={listRows}
						lit={litRow}
						onLight={setLit}
						onGo={(next) => go({ page: next, frame: null })}
					/>
				)}
				<CanvasPath
					segs={pathSegs}
					way={pathWay.current.way}
					accelDown={accelDown}
					moved={keyMoves}
					trail={NO_TRAIL}
					viewport={viewport}
					place={
						place === undefined ? undefined : { ...place, keys: above === "place" ? PATH_KEYS.up() : undefined }
					}
					onGo={(next) => next !== page && go({ page: next, frame: null })}
				/>
				{/* the top right holds the viewer's own controls, so the words hang from the top's middle */}
				{followed !== undefined && <FollowMark mate={followed} centre />}
				<div className="absolute top-3 right-3 flex items-center gap-3">
					{/* who else is here, at the top right as on the Mac's canvas (spool#312) */}
					{room === undefined ? null : (
						<PresenceFaces
							room={room}
							page={page}
							project={project.project}
							following={following}
							onFollow={setFollowing}
							align="end"
						/>
					)}
					{project.shared !== undefined && (
						<SharedLine shared={project.shared} project={project.project} team={project.team} />
					)}
					{comments !== null ? (
						<CommentsButton
							comments={comments}
							open={comments.panel}
							onClick={() => comments.setPanel(!comments.panel)}
						/>
					) : signIn !== undefined ? (
						<CommentsButton comments={null} open={false} onClick={() => askSignIn("list")} />
					) : null}
					{project.shares !== undefined && <ProjectShared address={project.shares} manage={edits(project.role)} />}
					{edits(project.role) && <OpenInSpool project={project} onNotice={onNotice} />}
				</div>
				{listing ? null : comments?.writes === true ? (
					<ViewerTools tool={comments.tool} onTool={comments.setTool} />
				) : signIn !== undefined ? (
					<ViewerTools
						tool="pointer"
						onTool={(tool) => tool === "comment" && askSignIn("tool")}
						signedOut
						tip={tip ? <CommentsTip by={sharedBy} onDone={closeTip} /> : undefined}
					/>
				) : null}
				{asked !== null && signIn !== undefined && (
					<SignInDialog
						signIn={signIn}
						by={sharedBy}
						onSignedIn={(me) => {
							setCutOff(false);
							setSignedInHere(me);
							setReached(asked);
							setAsked(null);
						}}
						onClose={() => setAsked(null)}
					/>
				)}
				{toast !== null && (
					<div
						className={`-translate-x-1/2 pointer-events-none absolute left-1/2 ${comments === null && signIn === undefined ? "bottom-4" : "bottom-20"}`}
					>
						<Toast message={toast} />
					</div>
				)}
				<div
					hidden={listing}
					className="absolute right-3 bottom-3 flex h-8 items-center gap-1 rounded-sm border border-line-default bg-surface-window px-1"
				>
					<button
						type="button"
						aria-label="Zoom out"
						className="rounded-xs px-2 py-1 text-secondary transition-colors hover:text-primary type-value"
						onClick={() => zoomBy(1 / K_STEP)}
					>
						−
					</button>
					<ZoomReadout camera={camera} />
					<button
						type="button"
						aria-label="Zoom in"
						className="rounded-xs px-2 py-1 text-secondary transition-colors hover:text-primary type-value"
						onClick={() => zoomBy(K_STEP)}
					>
						+
					</button>
					<Divider tone="strong" />
					<button
						type="button"
						className="rounded-xs px-2 py-1 text-secondary transition-colors hover:text-primary type-value"
						onClick={fit}
					>
						fit
					</button>
				</div>
			</div>
			{comments !== null && (
				<CommentsPanel open={comments.panel} onClose={() => comments.setPanel(false)}>
					<ViewerCommentsList
						comments={comments}
						page={page}
						project={project.project}
						onPick={(comment) => setAim({ id: comment.id, link: false })}
					/>
				</CommentsPanel>
			)}
			{played !== null && (
				<ViewerPlayer
					project={project.project}
					{...(rooted ? { said: (frame: string) => frameSaid(top, frame) } : {})}
					frames={canvas.frames}
					documentOf={(name) => `${project.frames}${encodeURIComponent(name)}?play`}
					walksAnywhere={outsider}
					start={played}
					from={from.current}
					coverOf={(frame) => project.covers?.[frame]}
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
			className="flex h-8 cursor-pointer items-center rounded-sm border border-line-strong bg-surface-window px-3 text-primary transition-colors hover:bg-surface-panel active:scale-[0.97] type-control"
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
 * The one line an outsider is shown (DEV-114, spool#238): whose it is, who shared it with them, and what they may do
 * with it, which is look and comment whoever they are. Nobody else is on it, and nothing says the rest of the project
 * exists. The whole sentence, what was shared and when it last changed, is its title.
 */
function SharedLine({ shared, project, team }: { shared: ViewerShared; project: string; team: ViewerProject["team"] }) {
	const what = shared.whole === true ? project : saidList(sharedItems(shared).map(sharedPageName));
	return (
		<span
			data-viewer-shared=""
			title={`${shared.by} shared ${what} with you${shared.updated === null ? "" : `, updated ${saidAgo(shared.updated)}`}`}
			className="flex items-center gap-2 text-tertiary type-detail"
		>
			{team === null ? null : <TeamMark team={team} size={14} />}
			<span>{[team?.name, `shared by ${shared.by}`, "look and comment"].filter(Boolean).join(" · ")}</span>
		</span>
	);
}

/** A member's Shared control: the project's shares, which its editors and admins change and viewers only read. */
function ProjectShared({ address, manage }: { address: string; manage: boolean }) {
	const source = useMemo(() => viewerShares(address, manage), [address, manage]);
	const { shares } = useShares(source);
	return <SharedControl source={source} shares={shares} />;
}

/** No ⌘[ and ⌘] in a browser, whose own Back and Forward walk the pages. */
const NO_TRAIL: readonly { keys: string; name: string }[] = [];

/**
 * Where the path goes back to (spool#238): a member's team Home, or for someone a team shared with by name the
 * shares made to them. A link share's holder came from nowhere spool.page knows, so has no way back.
 */
function placeOf(project: ViewerProject): PathPlace | undefined {
	if (project.shared === undefined)
		return project.team === null
			? undefined
			: {
					name: project.team.address,
					href: `/${project.team.address}`,
					title: `${project.team.name}'s projects`,
					mark: <TeamMark team={project.team} size={14} />,
				};
	if ((project.shared.kind ?? project.outsider?.share.kind) !== "people") return undefined;
	return {
		name: "shared",
		href: "/shared",
		title: "Shared with you",
		mark: (
			<span aria-hidden="true" className="grid size-3.5 place-items-center [&>svg]:size-full">
				<ShareIcon />
			</span>
		),
	};
}

/** Whether ⌘ (ctrl off a Mac) is held, which shows the path's keys under its names. */
function useAccelDown(): boolean {
	const [down, setDown] = useState(false);
	useEffect(() => {
		const key = (event: KeyboardEvent) => setDown(event.metaKey || event.ctrlKey);
		const away = () => setDown(false);
		window.addEventListener("keydown", key);
		window.addEventListener("keyup", key);
		window.addEventListener("blur", away);
		return () => {
			window.removeEventListener("keydown", key);
			window.removeEventListener("keyup", key);
			window.removeEventListener("blur", away);
		};
	}, []);
	return down;
}

/** A page and every page holding it: what going to it opens in the rail. */
function holdingPages(page: string): string[] {
	return page === ROOT_PAGE ? [] : pageChain(page);
}

/**
 * Whether an outsider's canvas starts at what was shared with them (spool#230): a share of some of the project, whose
 * pages above it aren't theirs to see. A whole-project share starts at the project's root page, as a member's does.
 */
function sharedRooted(project: ViewerProject): boolean {
	return project.shared !== undefined && project.shared.whole !== true;
}

/** The pages rail, as it ships, with nothing on it that changes anything. */
function PagesRail({
	project,
	top,
	page,
	marks,
	pageMarks,
	onPage,
	onFrame,
	onPlay,
	foot,
}: {
	project: ViewerProject;
	/** Where an outsider's canvas starts, when it starts at what was shared rather than the project's root page. */
	top: CanvasTop | null;
	page: string;
	marks: ReadonlyMap<string, Unseen>;
	pageMarks: ReadonlySet<string>;
	onPage: (page: string) => void;
	onFrame: (frame: string) => void;
	onPlay: (frame: string) => void;
	/** an outsider's foot (spool#174): their name once signed in, or Sign in on a link share */
	foot?: ReactNode;
}) {
	const { canvas } = project;
	const tree = useMemo(() => top?.tree ?? mergePageTree(canvas.order.pages, canvas.pages), [canvas, top]);
	const from = top?.top ?? ROOT_PAGE;
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
	// the chevron folds a page, as the app's rail does; going to a page opens it and every page holding it
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(holdingPages(page)));
	useEffect(() => {
		const holding = holdingPages(page);
		setExpanded((was) => (holding.every((each) => was.has(each)) ? was : new Set([...was, ...holding])));
	}, [page]);
	const fold = (folded: string, open: boolean, deep: boolean) =>
		setExpanded((was) => {
			const next = new Set(was);
			for (const each of deep ? [folded, ...canvas.pages.filter((one) => pageWithin(folded, one))] : [folded])
				if (open) next.add(each);
				else next.delete(each);
			return next;
		});
	const rows = useMemo(
		() => railRows(tree, framesByPage, expanded, null, null, new Map(), from),
		[tree, framesByPage, expanded, from],
	);
	return (
		<Panel side="start" width="rail">
			<Bar
				// the team and the project are the path's, over the canvas
				title="Pages"
				actions={
					!edits(project.role) && project.shared === undefined ? (
						<span className="pr-2 text-secondary type-detail">view only</span>
					) : undefined
				}
			/>
			<ScrollArea role="navigation" aria-label="Pages" className="flex-1 py-2">
				{rows.map((row) =>
					row.kind === "page" ? (
						<TreeRow
							key={`page:${row.page}`}
							depth={row.depth}
							branch={{
								open: row.open,
								label: pageName(row.page),
								onToggle: (deep) => fold(row.page, !row.open, deep),
							}}
							current={row.page === page}
							// the row takes the click; its button is there for the keyboard and a reader
							onClick={() => onPage(row.page)}
							decor={
								<button
									type="button"
									aria-label={pageName(row.page)}
									className="absolute inset-0 z-1 focus-ring-inset"
								/>
							}
							icon={FolderIcon}
							label={
								<>
									{pageName(row.page)}
									{top?.places.has(row.page) === true && (
										<span className="ml-2 text-tertiary">{top.places.get(row.page)}</span>
									)}
								</>
							}
							mono
							meta={row.open ? undefined : row.count}
							unseen={pageMarks.has(row.page)}
						/>
					) : row.kind === "frame" ? (
						<TreeRow
							key={`frame:${row.name}`}
							depth={row.depth}
							{...(row.page === from ? {} : { guide: row.last ? "last" : "mid" })}
							// a list of places to go rather than a tree to walk
							role="none"
							icon={FrameIcon}
							label={pageName(row.name)}
							mono
							unseen={marks.has(row.name) ? (marks.get(row.name) === "new" ? true : "moved") : undefined}
							// the row takes the click; its button is there for the keyboard and a reader
							onClick={() => (row.page === page ? onFrame(row.name) : onPage(row.page))}
							decor={
								<button
									type="button"
									aria-label={`${pageName(row.name)} frame`}
									className="absolute inset-0 z-1 focus-ring-inset"
								/>
							}
							reveal
							trailing={
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										onPlay(row.name);
									}}
									aria-label={`Play ${pageName(row.name)}`}
									title="Play"
									// a glyph alone: it stands where the name fades out, and a word would sit on the name
									className="grid size-5 place-items-center rounded-xs text-secondary hover:text-accent-strong"
								>
									<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
										<path d="M2 1.2 8.4 5 2 8.8Z" />
									</svg>
								</button>
							}
						/>
					) : null,
				)}
			</ScrollArea>
			{foot !== undefined ? (
				<StatusLine>{foot}</StatusLine>
			) : project.account !== null ? (
				<StatusLine>
					<span className="truncate">{project.account}</span>
				</StatusLine>
			) : null}
		</Panel>
	);
}

/** What a link share's holder reached for before signing in, which carries on once they have (spool#174). */
type Reached = "tool" | "list" | "none";

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
	return (
		<span ref={readout} data-viewer-zoom="" className="w-11 text-center text-secondary tabular-nums type-value" />
	);
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
