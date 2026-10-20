import {
	type ComponentProps,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import type { Comment, CommentPerson, CommentReply } from "../../team-sync-protocol";
import type { CommentChanged, CommentMentionable, CommentsClient } from "../api";
import { cn } from "../cn";
import { AgentIcon, CloseIcon, DotsIcon, ResolveIcon } from "../icons";
import { Button, IconButton } from "../primitives/actions";
import { Dot, Kbd } from "../primitives/display";
import { TextAction } from "../primitives/feedback";
import { SelectTrigger, TextareaBare } from "../primitives/inputs";
import { Menu, MenuItem, MenuSeparator, Popover } from "../primitives/overlays";
import { KindGlyph } from "../shares";
import type { Box, Point } from "./camera";
import type { CameraStore } from "./camera-store";
import { type CanvasStore, useCanvasField } from "./canvas-store";
import {
	type AudienceShare,
	audienceKind,
	audienceLabel,
	audiencesOn,
	composerNote,
	outsiderNote,
	replyNote,
	replyPlaceholder,
} from "./comment-audience";
import {
	type CommentFrame,
	type CommentStills,
	DroppedLine,
	droppedFrame,
	EditedSince,
	frameLeaf,
	KeptStill,
	pinOnFrame,
	UNPAID,
} from "./comment-history";
import {
	fanOut,
	gather,
	isUnread,
	mentionAsked,
	mentionedIn,
	mentionRuns,
	type Named,
	type Reader,
} from "./comments-model";
import { PRESENCE_INK } from "./presence-faces";

/**
 * Comments on a team canvas (ADR 0011, spool#169, spool#170): a pin for each comment on this page, where it was put,
 * gathered into a count where pins crowd; the card a pin opens, with the comment, its replies in order, a field to
 * reply in, Resolve and each message's ⋯; and the composer the Comment tool opens at a pin it places. Pins stand in
 * screen pixels over the field, one size at every zoom, as presence does.
 *
 * The same layer stands on a Mac's canvas and on the browser canvas at spool.page (spool#173): what it reads and how it
 * writes are the canvas's to hand it (`CommentsContext`), from the daemon on a Mac and from spool.page in a browser.
 * Writing goes to the team while the canvas is connected, and is refused, words kept, while it isn't.
 *
 * Cards grow out of their pin and shrink back into it; pins pop up from their tip, a page of them in a ripple.
 */

/** A pin's size on screen, at every zoom: round, with its bottom-left corner at the spot. */
export const PIN = 22;
/** Whom an outsider can mention: nobody (spool#174). */
const NOBODY: readonly CommentMentionable[] = [];
/** A card's width beside its pin. */
const CARD_W = 312;
/** How far a card keeps from the canvas's edges. */
const EDGE = 12;
/** How long a card takes to shrink back into its pin: `--animate-comment-card-out`'s. */
const CARD_OUT_MS = 120;
/** How far apart pins that arrive together pop up, and the most a ripple takes over all. */
const RIPPLE_MS = 40;
const RIPPLE_MAX_MS = 480;

/** A comment the Comment tool placed and its person is writing: where it stands, and what was under the pin. */
export interface CommentDraft {
	page: string;
	/** The frame it stands on, its point in the frame's own pixels; null for the page's field, at a world point. */
	frame: string | null;
	at: Point;
	element: { selector: string; tag: string; outerHtml: string; source: string | null; generated: boolean } | null;
}

/**
 * Where a comment stands on its page's field, in world units; undefined when its frame isn't on this page. On a frame
 * resized smaller since, it stays inside it (spool#160).
 */
export function commentWorld(
	comment: { frame: string | null; at: Point },
	frames: readonly (Box & { name: string })[],
): Point | undefined {
	if (comment.frame === null) return comment.at;
	const frame = frames.find((one) => one.name === comment.frame);
	if (frame === undefined) return undefined;
	const at = pinOnFrame(comment.at, frame);
	return { x: frame.x + at.x, y: frame.y + at.y };
}

/** Where a comment was put, as its card says: the frame's name, or the field. */
export function placeSays(comment: { frame: string | null }): string {
	return comment.frame === null ? "on the field" : comment.frame;
}

/** A comment's link, for a teammate: the project's canvas at the team, opened on it. */
export function commentLink(url: string | null, id: string): string | null {
	return url === null ? null : `${url}?comment=${encodeURIComponent(id)}`;
}

/**
 * What the layer needs of the canvas besides the comments: where it writes, who reads, whom they can mention, and how
 * to say so.
 */
export interface CommentsContext {
	client: CommentsClient;
	reader: Reader;
	people: readonly CommentMentionable[];
	online: boolean;
	/** The team has gone local: comments are read, never written, until it pays (spool#160). */
	unpaid?: boolean;
	/** what the card says while it can't write: a Mac's project isn't connected, or a browser is offline */
	offline: string;
	/** where Compare reads a comment's still and its frame's cover now */
	stills: CommentStills;
	url: string | null;
	refresh: () => void;
	/** a word to the person: a link copied, or why something didn't go */
	notice: (notice: { kind: "success" | "error"; message: string }) => void;
	/**
	 * The project's shares a member's new comment may be for besides the team (spool#174), the composer offering
	 * those of its page; none where the project has none, or where they can't be read.
	 */
	shares?: readonly AudienceShare[] | undefined;
	/** the team's name, as an outsider's composer says who reads it */
	team?: string | undefined;
	/**
	 * Someone outside the team, writing through their share (spool#174): their composer picks nothing and says who
	 * reads it, and no element's tag, no mention and no other share is ever theirs to see.
	 */
	outsider?: { kind: "people" | "link"; who: readonly string[] } | undefined;
	/**
	 * Whether this person deletes anyone's comment, as spool.page lets admins and editors: a viewer, like an outsider,
	 * deletes only their own. Unsaid on a Mac, whose copy is always an editor's or an admin's.
	 */
	edits?: boolean;
}

export function CommentsLayer({
	context,
	store,
	camera,
	frames,
	page,
	comments,
	onSendToAgent,
}: {
	context: CommentsContext;
	store: CanvasStore;
	camera: CameraStore;
	/** The frames on this page, in world units, with the cover this Mac has of each. */
	frames: readonly CommentFrame[];
	page: string;
	comments: readonly Comment[];
	/** Put a comment in the agent composer as a chip (spool#172); absent where there is no agent to send it to. */
	onSendToAgent?: ((comment: Comment) => void) | undefined;
}) {
	const [draft, setDraft] = useCanvasField(store, "commentDraft");
	const [open, setOpen] = useCanvasField(store, "commentOpen");
	const [hidden] = useCanvasField(store, "pinsHidden");
	const [filters] = useCanvasField(store, "commentFilters");
	/** the count fanned out, by its first pin's comment */
	const [fanned, setFanned] = useState<string | null>(null);
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	const field = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const element = field.current;
		if (element === null) return;
		const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	// pins stand in screen pixels, so a camera drawn is drawn here in the same frame
	useEffect(() => camera.subscribe(() => flushSync(redraw)), [camera]);
	// a fanned count folds as the camera moves on
	useEffect(() => camera.subscribe(() => setFanned(null)), [camera]);
	// and when the pins are put away
	useEffect(() => {
		if (hidden) setFanned(null);
	}, [hidden]);

	const cam = camera.get();
	const toScreen = (at: Point) => (cam === null ? at : { x: at.x * cam.k + cam.x, y: at.y * cam.k + cam.y });
	// resolved pins stand only while the inbox's Resolved switch is on; a deleted page's never do
	const here = comments.flatMap((comment) => {
		if (comment.page !== page || comment.standing === "deleted-page") return [];
		if (comment.resolved !== null && !filters.resolved && comment.id !== open) return [];
		const world = commentWorld(comment, frames);
		return world === undefined ? [] : [{ comment, ...toScreen(world) }];
	});
	const groups = gather(here);
	const arrivals = useArrivals(hidden ? [] : groups.map((group) => group[0]?.comment.id ?? ""));
	const openComment = useLinger(open === null ? null : (comments.find((comment) => comment.id === open) ?? null));
	const openPin = here.find((one) => one.comment.id === open);
	// a comment with no pin here, a deleted page's, opens beside the inbox, at the canvas's right
	const parked = { x: Math.max(EDGE, size.w - CARD_W - PIN - 2 * EDGE), y: 64 };
	const cardOf = (comment: Comment | null) => {
		if (comment === null) return undefined;
		const pinned = here.find((one) => one.comment.id === comment.id);
		if (pinned !== undefined) return pinned;
		return comment.standing === "deleted-page" || comment.page === page ? parked : undefined;
	};
	const cardAt = openPin ?? cardOf(openComment.shown);
	const drafting = useLinger(draft);
	const drafted =
		drafting.shown === null || drafting.shown.page !== page ? undefined : commentWorld(drafting.shown, frames);
	const draftAt = drafted === undefined ? undefined : toScreen(drafted);
	const toggle = (id: string) => {
		setDraft(null);
		setOpen(id === open ? null : id);
	};
	const pin = (comment: Comment, at: Point, arriving = false) => (
		<Pin
			key={comment.id}
			comment={comment}
			at={at}
			delay={arriving ? arrivals.delayOf(comment.id) : null}
			onLanded={() => arrivals.landed(comment.id)}
			open={comment.id === open}
			unread={isUnread(comment, context.reader)}
			onOpen={() => toggle(comment.id)}
		/>
	);

	return (
		<div ref={field} className="pointer-events-none absolute inset-0 overflow-hidden" data-comments-layer="">
			{hidden
				? null
				: groups.map((group) => {
						const [first] = group;
						if (first === undefined) return null;
						if (group.length === 1) return pin(first.comment, first, true);
						const centre = {
							x: Math.round(group.reduce((sum, one) => sum + one.x, 0) / group.length),
							y: Math.round(group.reduce((sum, one) => sum + one.y, 0) / group.length),
						};
						const isFanned = fanned === first.comment.id;
						return (
							<span key={first.comment.id} data-comment-count={group.length}>
								{isFanned ? (
									<Fan
										spots={group}
										places={fanOut(group.length, centre)}
										pin={(at, index) => {
											const one = group[index];
											return one === undefined ? null : pin(one.comment, at);
										}}
									/>
								) : null}
								<Cluster
									at={centre}
									delay={arrivals.delayOf(first.comment.id)}
									onLanded={() => arrivals.landed(first.comment.id)}
									people={group.map((one) => one.comment.author)}
									unread={group.some((one) => isUnread(one.comment, context.reader))}
									lit={isFanned}
									onClick={() => setFanned(isFanned ? null : first.comment.id)}
								/>
							</span>
						);
					})}
			{draftAt === undefined || drafting.leaving ? null : <GhostPin at={draftAt} />}
			{openComment.shown === null || cardAt === undefined || cam === null ? null : (
				<CardAt key={openComment.shown.id} at={cardAt} canvas={size} leaving={openComment.leaving}>
					<CommentCard
						context={context}
						comment={openComment.shown}
						frame={frames.find((one) => one.name === openComment.shown?.frame)}
						leaving={openComment.leaving}
						onClose={() => setOpen(null)}
						onSendToAgent={onSendToAgent}
					/>
				</CardAt>
			)}
			{drafting.shown === null || draftAt === undefined ? null : (
				<CardAt at={draftAt} canvas={size} leaving={drafting.leaving}>
					<Composer
						context={context}
						draft={drafting.shown}
						onClose={() => setDraft(null)}
						onSent={(id) => {
							setDraft(null);
							setOpen(id);
							context.refresh();
						}}
					/>
				</CardAt>
			)}
		</div>
	);
}

/** A press on a pin or a count is its own: it never reaches the field under it. */
const OWN_PRESS = {
	onPointerDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onDoubleClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
};

/** The ring a pin wears: open thicker, unread in the accent, otherwise only the gap to what is under it. */
function ringOf(open: boolean, unread: boolean): string {
	if (open) return "0 0 0 1.5px var(--color-surface-window), 0 0 0 3.5px var(--color-accent)";
	if (unread) return "0 0 0 1.5px var(--color-surface-window), 0 0 0 3px var(--color-accent)";
	return "0 0 0 1.5px var(--color-surface-window)";
}

/**
 * A pin: its author's initial in their presence colour, its bottom-left corner on the spot. An agent's is
 * square-cornered; a resolved one hollow with a check; one whose frame is gone dashed. Unread wears the accent as a
 * ring, open a thicker one. Under any tool, a click on it opens its card.
 */
function Pin({
	comment,
	at,
	open,
	unread,
	delay,
	onLanded,
	onOpen,
}: {
	comment: Comment;
	at: Point;
	open: boolean;
	unread: boolean;
	/** how long after the others arriving with it it pops up; null once it has */
	delay: number | null;
	/** it has popped up */
	onLanded: () => void;
	onOpen: () => void;
}) {
	const round = PIN / 2;
	const by = comment.author;
	const resolved = comment.resolved !== null;
	const orphan = comment.standing === "deleted-frame";
	const hollow = resolved || orphan;
	// someone outside the team wrote it, through a share: a ring in the ink, nobody's colour (spool#174)
	const outsider = comment.outsider === true && !hollow;
	const gone = droppedFrame(comment);
	return (
		<>
			{gone === undefined ? null : (
				<span
					className="pointer-events-none absolute z-10 whitespace-nowrap text-tertiary type-detail"
					style={{ left: at.x + PIN + 6, top: at.y - PIN + 3 }}
				>
					{frameLeaf(gone)} · <span className="text-danger-strong">deleted</span>
				</span>
			)}
			<button
				type="button"
				aria-label={`Comment by ${nameOf(by, comment.agent)}${resolved ? ", resolved" : ""}${unread ? ", unread" : ""}`}
				aria-expanded={open}
				data-comment-pin={comment.id}
				data-comment-dropped={gone}
				data-unread={unread ? "" : undefined}
				data-resolved={resolved ? "" : undefined}
				data-outsider={comment.outsider === true ? "" : undefined}
				{...OWN_PRESS}
				onClick={(event) => {
					event.stopPropagation();
					onOpen();
				}}
				onAnimationEnd={(event) => event.target === event.currentTarget && onLanded()}
				className={cn(
					"pointer-events-auto absolute flex cursor-pointer items-center justify-center font-semibold text-2xs uppercase leading-none transition-[scale,box-shadow] duration-fast ease-out focus-ring",
					delay === null ? null : "animate-comment-pin-in",
					open ? "z-20 scale-110" : "z-10 hover:scale-105",
					hollow ? "bg-surface-raised text-secondary" : null,
					outsider ? "bg-surface-raised text-primary" : null,
				)}
				style={{
					left: at.x,
					top: at.y - PIN,
					width: PIN,
					height: PIN,
					borderRadius: comment.agent ? 5 : `${round}px ${round}px ${round}px 2px`,
					// it pops up from its tip, and grows there when open
					transformOrigin: "0 100%",
					animationDelay: `${delay ?? 0}ms`,
					...(hollow || outsider ? {} : { background: by.color, color: PRESENCE_INK }),
					boxShadow: ringOf(open, unread),
					...(orphan ? { outline: "1.25px dashed var(--color-secondary)", outlineOffset: -1.25 } : {}),
					...(outsider ? { outline: "1.25px solid var(--color-secondary)", outlineOffset: -1.25 } : {}),
					opacity: resolved ? 0.75 : 1,
				}}
			>
				{resolved ? <CheckGlyph /> : by.name.charAt(0)}
			</button>
		</>
	);
}

function CheckGlyph() {
	return (
		<svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
			<path
				d="m2.5 6.25 2.25 2.25 4.75-5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Pins closer than 32 screen px as one: a count where they meet, with two faces, a dot when one is unread. */
function Cluster({
	at,
	people,
	unread,
	lit,
	delay,
	onLanded,
	onClick,
}: {
	at: Point;
	delay: number | null;
	onLanded: () => void;
	people: readonly CommentPerson[];
	unread: boolean;
	lit: boolean;
	onClick: () => void;
}) {
	const faces = people.filter(
		(one, index) => people.findIndex((other) => other.accountId === one.accountId) === index,
	);
	return (
		<button
			type="button"
			aria-label={`${people.length} comments here`}
			aria-expanded={lit}
			data-comment-cluster={people.length}
			{...OWN_PRESS}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			onAnimationEnd={(event) => event.target === event.currentTarget && onLanded()}
			className={cn(
				"pointer-events-auto absolute z-10 flex cursor-pointer items-center justify-center gap-1 rounded-full bg-surface-inverse pr-1.5 pl-[3px] text-on-inverse transition-[scale,box-shadow] duration-fast ease-out hover:scale-105 focus-ring",
				delay === null ? null : "animate-comment-pin-in",
			)}
			style={{
				animationDelay: `${delay ?? 0}ms`,
				left: at.x - PIN / 2,
				top: at.y - PIN / 2,
				height: PIN,
				minWidth: PIN,
				boxShadow: ringOf(lit, false),
			}}
		>
			<span className="flex">
				{faces.slice(0, 2).map((person, index) => (
					<span
						key={person.accountId}
						className="flex size-4 items-center justify-center rounded-full font-semibold text-[8px] uppercase leading-none"
						style={{
							background: person.color,
							color: PRESENCE_INK,
							marginLeft: index === 0 ? 0 : -5,
							boxShadow: "0 0 0 1.5px var(--color-surface-inverse)",
						}}
					>
						{person.name.charAt(0)}
					</span>
				))}
			</span>
			<span className="font-semibold text-xs tabular-nums leading-none">{people.length}</span>
			{unread ? (
				<span
					className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent"
					style={{ boxShadow: "0 0 0 1.5px var(--color-surface-window)" }}
				/>
			) : null}
		</button>
	);
}

/** A count clicked open: its pins on an arc above it, each tied by a hair to where it really stands. */
function Fan({
	spots,
	places,
	pin,
}: {
	spots: readonly Point[];
	places: readonly Point[];
	pin: (at: Point, index: number) => ReactNode;
}) {
	return (
		<>
			<svg className="pointer-events-none absolute inset-0 z-[9] size-full" aria-hidden="true">
				{places.map((place, index) => {
					const spot = spots[index];
					return spot === undefined ? null : (
						// biome-ignore lint/suspicious/noArrayIndexKey: one hair per pin, in the fan's order
						<g key={index}>
							<line
								x1={place.x}
								y1={place.y}
								x2={spot.x}
								y2={spot.y}
								stroke="var(--color-line-strong)"
								strokeWidth="1"
							/>
							<circle cx={spot.x} cy={spot.y} r="2.5" fill="var(--color-accent)" />
						</g>
					);
				})}
			</svg>
			{places.map((place, index) => pin(place, index))}
		</>
	);
}

/** The pin being placed, nobody's yet. */
function GhostPin({ at }: { at: Point }) {
	const round = PIN / 2;
	return (
		<span
			aria-hidden="true"
			data-comment-ghost=""
			className="absolute z-20 flex animate-comment-pin-in items-center justify-center bg-surface-inverse text-[13px] text-on-inverse leading-none"
			style={{
				transformOrigin: "0 100%",
				left: at.x,
				top: at.y - PIN,
				width: PIN,
				height: PIN,
				borderRadius: `${round}px ${round}px ${round}px 2px`,
				boxShadow: "0 0 0 1.5px var(--color-surface-window)",
			}}
		>
			+
		</span>
	);
}

/**
 * Where a card stands by its pin: to its right, or to its left near the canvas's right edge; hanging down from a pin
 * in the top half, standing up from one in the bottom half, so it never leaves the canvas. It grows out of the pin's
 * side of it, and when `leaving` shrinks back the same way, taking no presses on its way out.
 */
function CardAt({
	at,
	canvas,
	leaving = false,
	children,
}: {
	at: Point;
	canvas: { w: number; h: number };
	leaving?: boolean;
	children: ReactNode;
}) {
	const right = at.x + PIN + 10 + CARD_W < canvas.w - EDGE;
	const left = right ? at.x + PIN + 10 : Math.max(EDGE, at.x - CARD_W - 10);
	const low = at.y > canvas.h * 0.55;
	const bottom = Math.max(16, canvas.h - at.y - 24);
	const top = Math.max(16, at.y - PIN - 8);
	// the pin's middle, from the card's own corner: where it grows from
	const fromX = Math.round(at.x + PIN / 2 - left);
	const fromY = low ? "100%" : `${Math.round(at.y - PIN / 2 - top)}px`;
	const box = useRef<HTMLDivElement>(null);
	// a card put away lets go of the keys at once, so the next press is the canvas's and not its reply's
	useEffect(() => {
		const active = document.activeElement;
		if (leaving && active instanceof HTMLElement && box.current?.contains(active)) active.blur();
	}, [leaving]);
	return (
		<div
			ref={box}
			className={cn("absolute z-30 flex flex-col", leaving ? "pointer-events-none" : "pointer-events-auto")}
			data-leaving={leaving ? "" : undefined}
			inert={leaving}
			style={{
				left,
				width: CARD_W,
				...(low ? { bottom, maxHeight: canvas.h - bottom - 16 } : { top, maxHeight: canvas.h - top - 16 }),
			}}
		>
			<div
				className={cn("flex min-h-0 flex-col", leaving ? "animate-comment-card-out" : "animate-comment-card-in")}
				style={{ transformOrigin: `${fromX}px ${fromY}` }}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * What was shown, kept a moment after it goes so it can leave the way it came: `leaving` while it does. Another in
 * its place takes it at once.
 */
export function useLinger<T>(value: T | null, ms = CARD_OUT_MS): { shown: T | null; leaving: boolean } {
	const [last, setLast] = useState<T | null>(value);
	useEffect(() => {
		if (value !== null) {
			setLast(value);
			return;
		}
		const timer = setTimeout(() => setLast(null), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return { shown: value ?? last, leaving: value === null && last !== null };
}

/**
 * When each pin pops up, by its key: at once when it comes on its own, and in a ripple when several come together (a
 * page opened, pins shown again, the comments first heard). A pin keeps its delay while it stands, so a camera that
 * moves it never starts it again, and once it has popped up (`landed`) it never pops again, whatever draws it anew
 * (its frame deleted, its count fanned).
 */
function useArrivals(keys: readonly string[]): {
	delayOf: (key: string) => number | null;
	landed: (key: string) => void;
} {
	const known = useRef(new Map<string, { delay: number; landed: boolean }>());
	const now = new Set(keys);
	for (const key of [...known.current.keys()]) if (!now.has(key)) known.current.delete(key);
	const arriving = keys.filter((key) => !known.current.has(key));
	arriving.forEach((key, index) => {
		known.current.set(key, {
			delay: arriving.length === 1 ? 0 : Math.min(index * RIPPLE_MS, RIPPLE_MAX_MS),
			landed: false,
		});
	});
	return {
		delayOf: (key) => {
			const arrived = known.current.get(key);
			return arrived === undefined || arrived.landed ? null : arrived.delay;
		},
		landed: (key) => {
			const arrived = known.current.get(key);
			if (arrived !== undefined) arrived.landed = true;
		},
	};
}

/** A card's presses, wheel and menu are its own: none of them reaches the field under it. */
const OWN_POINTER = {
	onPointerDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onDoubleClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onWheel: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onContextMenu: (event: { stopPropagation(): void }) => event.stopPropagation(),
};

/** Who reads it: the team. */
export function TeamLabel() {
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-secondary type-detail" data-comment-audience="team">
			<TeamGlyph />
			team
		</span>
	);
}

/**
 * Who reads a comment (spool#174). Team is quiet; a share is a chip, because a member sees every audience and has to
 * know before typing that someone outside the team reads the reply. A share that ended says so.
 */
export function AudienceTag({
	share,
}: {
	share: { kind: "people" | "link"; who: readonly string[]; ended?: true } | undefined;
}) {
	if (share === undefined) return <TeamLabel />;
	return (
		<span className="inline-flex min-w-0 shrink items-center gap-1.5" data-comment-audience={share.kind}>
			<span className="inline-flex min-w-0 shrink items-center gap-1 rounded-xs border border-line-strong px-1 text-primary type-label">
				<KindGlyph kind={share.kind} className="size-3 shrink-0 text-secondary" />
				<span className="truncate">{audienceLabel(share)}</span>
			</span>
			{share.ended === true ? (
				<span className="shrink-0 text-tertiary type-detail" data-comment-share-ended="">
					share ended
				</span>
			) : null}
		</span>
	);
}

/** The composer's picker: Team, or one of the shares this page is in. A reply never picks: it takes its comment's. */
function AudiencePicker({
	shares,
	value,
	onPick,
}: {
	shares: readonly AudienceShare[];
	value: string | null;
	onPick: (share: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const anchor = useRef<HTMLSpanElement>(null);
	const picked = shares.find((share) => share.id === value);
	const item = (share: AudienceShare | undefined) => (
		<MenuItem
			key={share?.id ?? "team"}
			checked={(share?.id ?? null) === value}
			label={
				<span className="flex items-center gap-1.5">
					{share === undefined ? (
						<TeamGlyph />
					) : (
						<KindGlyph kind={share.kind} className="size-3 shrink-0 text-secondary" />
					)}
					{share === undefined ? "Team" : audienceLabel(share)}
				</span>
			}
			meta={share === undefined ? "members" : audienceKind(share)}
			onClick={() => {
				setOpen(false);
				onPick(share?.id ?? null);
			}}
		/>
	);
	return (
		<span ref={anchor} className="relative flex min-w-0">
			<SelectTrigger
				open={open}
				aria-label="Who reads it"
				data-comment-audience-picker=""
				onClick={() => setOpen(!open)}
				value={
					<>
						{picked === undefined ? <TeamGlyph /> : <KindGlyph kind={picked.kind} className="size-3 shrink-0" />}
						{picked === undefined ? "Team" : audienceLabel(picked)}
					</>
				}
			/>
			{open ? (
				<FloatingMenu anchor={anchor} align="start" width={272} onDismiss={() => setOpen(false)}>
					{item(undefined)}
					<MenuSeparator />
					{shares.map((share) => item(share))}
					<MenuSeparator />
					<span className="px-3 py-1.5 text-secondary type-label">
						Members read every comment. A share reads only its own.
					</span>
				</FloatingMenu>
			) : null}
		</span>
	);
}

/** Who reads it, said under the words: a share's people outside the team, or the outsider's own share and the team. */
function AudienceNote({ share, says }: { share: { kind: "people" | "link" }; says: string }) {
	return (
		<span className="flex items-start gap-1.5 text-secondary type-label" data-comment-audience-note="">
			<KindGlyph kind={share.kind} className="mt-[3px] size-3 shrink-0" />
			{says}
		</span>
	);
}

function TeamGlyph() {
	return (
		<svg viewBox="0 0 14 14" className="size-3" fill="none" aria-hidden="true">
			<circle cx="5.25" cy="4.5" r="2.1" stroke="currentColor" strokeWidth="1.15" />
			<path
				d="M1.75 12c.3-2.1 1.7-3.4 3.5-3.4s3.2 1.3 3.5 3.4"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinecap="round"
			/>
			<path
				d="M9.4 2.6a2 2 0 0 1 0 3.8M10.6 8.8c1 .5 1.5 1.6 1.65 3.2"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/** What was under the pin, as an agent reads it: its name in mono. */
function ElementChip({ label }: { label: string }) {
	return (
		<span
			className="inline-flex min-w-0 items-center gap-1 rounded-xs border border-line-default px-1 font-mono text-secondary type-detail"
			data-comment-element=""
		>
			<span className="h-2.5 w-0.5 shrink-0 rounded-full bg-accent" />
			<span className="truncate">{label}</span>
		</span>
	);
}

/** Said on a Mac when a comment can't go: the project isn't connected to the team, so nothing is sent or kept. */
export const MAC_OFFLINE = "Offline: comments go to spool.page, so this waits until the project is connected again.";

/** Words that name people: every @mention of someone the comment knows, or the team has, in the accent. */
export function Said({
	text,
	people,
	className,
}: {
	text: string;
	people: readonly Named[];
	className?: string | undefined;
}) {
	return (
		<p className={cn("whitespace-pre-wrap break-words text-primary type-body", className)} data-comment-body="">
			{mentionRuns(text, people).map((run, at) =>
				run.mention ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the runs of one message's words
					<span key={at} className="font-medium text-accent-strong" data-comment-mention="">
						{run.text}
					</span>
				) : (
					run.text
				),
			)}
		</p>
	);
}

/**
 * A menu over everything, its own layer on the page, so the card's scrolling list never clips it: under its anchor,
 * or over it when the window's foot is too near. A press anywhere else puts it away.
 */
function FloatingMenu({
	anchor,
	align,
	width,
	onDismiss,
	style,
	...rest
}: ComponentProps<"div"> & {
	anchor: RefObject<HTMLElement | null>;
	align: "start" | "end";
	width: number;
	onDismiss?: () => void;
}) {
	const menu = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState<DOMRect | null>(null);
	useLayoutEffect(() => setBox(anchor.current?.getBoundingClientRect() ?? null), [anchor]);
	useEffect(() => {
		if (onDismiss === undefined) return;
		const away = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (menu.current?.contains(target) || anchor.current?.contains(target)) return;
			onDismiss();
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [anchor, onDismiss]);
	if (box === null) return null;
	const left = Math.max(8, align === "end" ? box.right - width : box.left);
	const above = box.bottom + 200 > window.innerHeight;
	return createPortal(
		<Menu
			ref={menu}
			{...rest}
			className="fixed z-50"
			style={{
				...style,
				left,
				width,
				...(above ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }),
			}}
		/>,
		document.body,
	);
}

/**
 * The words field the composer, a reply and an edit use: a bare field with its ink drawn behind it, so an @mention
 * reads in the accent while it is typed, and a trailing `@` with letters opens the members to name. Enter sends
 * (or picks the lit member), Shift+Enter is a new line, Esc closes the menu first, then the card.
 */
function MentionField({
	value,
	onValue,
	people,
	placeholder,
	rows,
	onSend,
	onEscape,
	label,
}: {
	value: string;
	onValue: (value: string) => void;
	people: readonly CommentMentionable[];
	placeholder: string;
	rows: number;
	onSend: () => void;
	onEscape: () => void;
	label: string;
}) {
	const [dismissed, setDismissed] = useState(false);
	const [lit, setLit] = useState(0);
	const field = useRef<HTMLDivElement>(null);
	const asked = mentionAsked(value);
	const typed = asked?.typed.toLowerCase() ?? "";
	const matches =
		asked === null || dismissed
			? []
			: people
					.filter((person) =>
						person.name
							.toLowerCase()
							.split(/\s+/u)
							.some((word) => word.startsWith(typed)),
					)
					.slice(0, 8);
	const pick = (person: CommentMentionable) => {
		if (asked === null) return;
		onValue(`${value.slice(0, asked.at)}@${person.name} `);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (matches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
			event.preventDefault();
			setLit((was) => (was + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
			return;
		}
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			const chosen = matches[Math.min(lit, matches.length - 1)];
			if (chosen !== undefined) pick(chosen);
			else onSend();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (matches.length > 0) setDismissed(true);
			else onEscape();
		}
	};
	return (
		<div ref={field} className="relative">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-primary type-body"
			>
				{mentionRuns(value, people).map((run, at) =>
					run.mention ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: the runs of the field's words
						<span key={at} className="rounded-xs bg-accent-subtle text-accent-strong">
							{run.text}
						</span>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: the runs of the field's words
						<span key={at}>{run.text}</span>
					),
				)}
				{"\u200b"}
			</div>
			<TextareaBare
				value={value}
				onValueChange={(next) => {
					onValue(next);
					setLit(0);
					setDismissed(false);
				}}
				rows={rows}
				autoFocus
				aria-label={label}
				placeholder={placeholder}
				onKeyDown={onKeyDown}
				className="relative break-words text-transparent caret-primary"
			/>
			{matches.length === 0 ? null : (
				<FloatingMenu anchor={field} align="start" width={240} data-comment-mentions="">
					{matches.map((person, at) => (
						<MenuItem
							key={person.accountId}
							label={person.name}
							meta={person.you ? "you" : undefined}
							data-state={at === Math.min(lit, matches.length - 1) ? "hover" : undefined}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => pick(person)}
						/>
					))}
				</FloatingMenu>
			)}
		</div>
	);
}

/** A refusal said in the card: offline and a team gone local have their own words, and the rest are the team's. */
function RefusalLine({ refusal, context }: { refusal: string | null; context: CommentsContext }) {
	if (context.unpaid === true || refusal === "unpaid")
		return (
			<span className="text-secondary type-label" data-comment-offline="">
				{UNPAID}
			</span>
		);
	if (!context.online || refusal === "offline")
		return (
			<span className="text-secondary type-label" data-comment-offline="">
				{context.offline}
			</span>
		);
	return refusal === null ? null : (
		<span className="text-danger type-label" data-comment-refusal="">
			{asSentence(refusal)}
		</span>
	);
}

/**
 * A refusal as the card says it: a person's sentence, capitalised and stopped, from the words the team and the CLI
 * print lowercase. spool stays lowercase at a sentence's start.
 */
export function asSentence(words: string): string {
	const said = words.trim();
	const start = said.startsWith("spool") ? said : `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
	return /[.?!]$/u.test(start) ? start : `${start}.`;
}

/** Writing a comment at a pin just placed: what was under it, who reads it, the words. Enter sends. */
function Composer({
	context,
	draft,
	onClose,
	onSent,
}: {
	context: CommentsContext;
	draft: CommentDraft;
	onClose: () => void;
	onSent: (id: string) => void;
}) {
	const { client, online, unpaid = false, outsider } = context;
	// an outsider mentions nobody: the team's people are not theirs to see
	const people = outsider === undefined ? context.people : NOBODY;
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [refusal, setRefusal] = useState<string | null>(null);
	const [audience, setAudience] = useState<string | null>(null);
	const offline = !online || refusal === "offline" || unpaid;
	const shares = outsider === undefined ? audiencesOn(context.shares ?? [], draft.page) : [];
	const picked = shares.find((share) => share.id === audience);
	const send = () => {
		if (text.trim() === "" || sending || offline) return;
		setSending(true);
		const { selector, outerHtml, source, generated } = draft.element ?? {};
		void client
			.post({
				page: draft.page,
				frame: draft.frame,
				at: draft.at,
				element:
					selector === undefined || outerHtml === undefined || source === undefined || generated === undefined
						? null
						: { selector, outerHtml, source, generated },
				body: text,
				mentions: mentionedIn(text, people),
				...(picked === undefined ? {} : { audience: { share: picked.id } }),
			})
			.then((sent) => {
				setSending(false);
				if ("id" in sent) onSent(sent.id);
				else setRefusal(sent.error === "offline" ? "offline" : sent.message);
			});
	};
	return (
		<Popover pad="none" className="w-full overflow-visible" data-comment-composer="" {...OWN_POINTER}>
			<div className="flex min-h-10 shrink-0 items-center gap-1.5 border-line-default border-b pr-1.5 pl-3">
				<span className="shrink-0 text-tertiary type-detail">
					{draft.frame === null ? "on the field" : `on ${draft.frame}`}
				</span>
				{/* an outsider sees the outline alone: the element's tag is the team's, for its agents */}
				{draft.element === null || outsider !== undefined ? null : <ElementChip label={draft.element.tag} />}
				<span className="min-w-0 flex-1" />
				<IconButton size="sm" icon={<CloseIcon />} label="Cancel" onClick={onClose} />
			</div>
			<div className="flex flex-col gap-2.5 px-3 pt-2.5 pb-2.5">
				<MentionField
					value={text}
					onValue={(next) => {
						setText(next);
						if (refusal !== null && refusal !== "offline") setRefusal(null);
					}}
					people={people}
					rows={2}
					label="Comment"
					placeholder={outsider === undefined ? "Comment, @ to mention" : "Comment"}
					onSend={send}
					onEscape={onClose}
				/>
				{outsider !== undefined ? (
					<AudienceNote share={outsider} says={outsiderNote(context.team ?? "", outsider)} />
				) : picked === undefined ? null : (
					<AudienceNote share={picked} says={composerNote(picked)} />
				)}
				<RefusalLine refusal={refusal} context={context} />
				<div className="flex items-center gap-2">
					{outsider !== undefined ? null : shares.length === 0 ? (
						<TeamLabel />
					) : (
						<AudiencePicker shares={shares} value={audience} onPick={setAudience} />
					)}
					<span className="min-w-0 flex-1" />
					<Kbd>↵</Kbd>
					<Button
						size="sm"
						variant="primary"
						disabled={text.trim() === "" || offline}
						loading={sending}
						onClick={send}
					>
						Comment
					</Button>
				</div>
			</div>
		</Popover>
	);
}

/** Who a comment can name: the members, and whoever it already names, by the name each has now. */
function namesIn(comment: Comment, people: readonly Named[]): Named[] {
	const said = [comment, ...comment.replies].flatMap((message) => message.mentions ?? []);
	return [...people, ...said];
}

/**
 * An open comment: who reads it and where it is, Resolve and close; who resolved it, or that its page is gone; the
 * first message and its replies in order, each with its ⋯; and a reply field. Opened, it is read.
 */
export function CommentCard({
	context,
	comment,
	frame,
	leaving = false,
	onClose,
	onSendToAgent,
}: {
	context: CommentsContext;
	comment: Comment;
	/** Its frame as the canvas has it now, for Compare's "now"; none when it isn't on this page. */
	frame?: CommentFrame | undefined;
	/** put away, and shrinking back into its pin: it reads nothing more */
	leaving?: boolean;
	onClose: () => void;
	onSendToAgent?: ((comment: Comment) => void) | undefined;
}) {
	const { client, online, reader, refresh, unpaid = false, outsider } = context;
	const people = outsider === undefined ? context.people : NOBODY;
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [refusal, setRefusal] = useState<string | null>(null);
	const offline = !online || refusal === "offline" || unpaid;
	const resolved = comment.resolved;
	const unread = isUnread(comment, reader);
	// opening the card reads it, and anything said while it stands open is read as it arrives
	useEffect(() => {
		if (!unread || !online || leaving || unpaid) return;
		void client.change(comment.id, { type: "read" }).then(refresh);
	}, [client, comment.id, unread, online, leaving, unpaid, refresh]);
	/** a change sent: the canvas hears the result, or the card says why not */
	const change = (sent: Promise<CommentChanged>, then?: () => void) => {
		void sent.then((done) => {
			if ("error" in done) setRefusal(done.error === "offline" ? "offline" : done.message);
			else {
				setRefusal(null);
				then?.();
				refresh();
			}
		});
	};
	const toggleResolved = () => change(client.change(comment.id, { type: resolved === null ? "resolve" : "reopen" }));
	const send = () => {
		if (text.trim() === "" || sending || offline) return;
		setSending(true);
		void client.reply(comment.id, text, mentionedIn(text, people)).then((sent) => {
			setSending(false);
			if ("id" in sent) {
				setText("");
				refresh();
			} else setRefusal(sent.error === "offline" ? "offline" : sent.message);
		});
	};
	const named = namesIn(comment, people);
	const menu = {
		context,
		comment,
		onChange: change,
		onUnread: () => change(client.change(comment.id, { type: "unread" }), onClose),
	};
	return (
		<Popover pad="none" className="flex min-h-0 w-full flex-col" data-comment-card={comment.id} {...OWN_POINTER}>
			<div className="flex h-10 shrink-0 items-center gap-2 border-line-default border-b pr-1.5 pl-3">
				<AudienceTag share={comment.share ?? outsider} />
				<span className="min-w-0 flex-1 truncate text-tertiary type-detail">{placeSays(comment)}</span>
				{onSendToAgent === undefined ? null : (
					<IconButton
						size="sm"
						icon={<AgentIcon />}
						label="Send to agent"
						onClick={() => onSendToAgent(comment)}
					/>
				)}
				{unpaid ? null : (
					<IconButton
						size="sm"
						icon={
							<ResolveIcon
								done={resolved !== null}
								className={cn("size-4", resolved !== null && "text-accent")}
							/>
						}
						label={resolved === null ? "Resolve" : "Reopen"}
						disabled={offline}
						onClick={toggleResolved}
					/>
				)}
				<IconButton size="sm" icon={<CloseIcon />} label="Close" onClick={onClose} />
			</div>
			{resolved === null ? null : (
				<div
					className="flex h-9 shrink-0 items-center gap-2 border-line-default border-b bg-surface-panel px-3"
					data-comment-resolved=""
				>
					<ResolveIcon done className="size-3.5 text-accent" />
					<span className="min-w-0 flex-1 truncate text-secondary type-label">
						Resolved by {nameOf(resolved.by, resolved.agent === true)}, {resolvedAgo(resolved.at)}
					</span>
					{unpaid ? null : (
						<TextAction className="-mr-1.5" disabled={offline} onClick={toggleResolved}>
							Reopen
						</TextAction>
					)}
				</div>
			)}
			{comment.standing !== "deleted-page" ? null : (
				<div className="flex shrink-0 items-start gap-2 border-line-default border-b bg-surface-panel px-3 py-2">
					<span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-danger-strong" />
					<span className="min-w-0 flex-1 text-secondary type-label">
						Its page, {comment.page || "the root page"}, was deleted. The comment stays here, under Resolved.
					</span>
				</div>
			)}
			<DroppedLine comment={comment} />
			<div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3 py-3">
				<Message
					message={comment}
					names={named}
					unread={unreadMessage(comment, comment, reader)}
					acts={menu}
					chip={comment.element === null ? undefined : <ElementChip label={comment.element.name} />}
				/>
				{comment.replies
					// a draft is its person's alone: the agent's reply to a share waits for them to send it (spool#174)
					.filter((reply) => reply.draftFor === null || reply.draftFor === reader.me)
					.map((reply) => (
						<Message
							key={reply.id}
							message={reply}
							names={named}
							unread={reply.draftFor === null && unreadMessage(reply, comment, reader)}
							acts={{ ...menu, reply }}
							draft={reply.draftFor !== null}
						/>
					))}
				{comment.editedSince === true ? (
					<EditedSince comment={comment} frame={frame} stills={context.stills} />
				) : null}
				<KeptStill comment={comment} stills={context.stills} />
			</div>
			<div className="flex shrink-0 flex-col gap-1.5 border-line-default border-t px-3 py-2.5">
				{/* a team gone local reads its comments and writes none: no field to reply in; nor does a share that ended */}
				{comment.share?.ended === true ? (
					<span className="text-secondary type-label" data-comment-share-ended="">
						This share ended. Members still read its comments; nothing more goes to it.
					</span>
				) : unpaid ? null : (
					<div className="flex items-end gap-2 rounded-sm border border-line-strong bg-surface-window px-2.5 py-1.5 focus-within:border-line-focus">
						<div className="min-w-0 flex-1">
							<MentionField
								value={text}
								onValue={(next) => {
									setText(next);
									if (refusal !== null && refusal !== "offline") setRefusal(null);
								}}
								people={people}
								rows={1}
								label="Reply"
								placeholder={replyPlaceholder(comment)}
								onSend={send}
								onEscape={onClose}
							/>
						</div>
						<Button
							size="sm"
							variant="primary"
							disabled={text.trim() === "" || offline}
							loading={sending}
							onClick={send}
						>
							Reply
						</Button>
					</div>
				)}
				{comment.share === undefined || comment.share.ended === true ? null : (
					<AudienceNote share={comment.share} says={replyNote(comment.share)} />
				)}
				<RefusalLine refusal={refusal} context={context} />
			</div>
		</Popover>
	);
}

/** One message is unread when it came after the person last read its comment, and isn't theirs. */
function unreadMessage(message: Comment | CommentReply, comment: Comment, reader: Reader): boolean {
	const read = reader.reads[comment.id] ?? Number.NEGATIVE_INFINITY;
	return message.author.accountId !== reader.me && message.created > read;
}

/** What a message's ⋯ and its edit need: the card's comment and how a change is sent. */
interface MessageActs {
	context: CommentsContext;
	comment: Comment;
	/** the reply it is, or the first message when left out */
	reply?: CommentReply | undefined;
	onChange: (sent: Promise<CommentChanged>, then?: () => void) => void;
	onUnread: () => void;
}

/**
 * A message's ⋯: on your own, Edit, Copy link and Delete (the first message's delete takes its replies with it); on
 * anyone else's, Copy link, Mark unread and Delete, which every Mac's person may, a local copy being an editor's or
 * an admin's.
 */
function MessageMenu({ context, comment, reply, onChange, onUnread, onEdit }: MessageActs & { onEdit?: () => void }) {
	const [open, setOpen] = useState(false);
	const anchor = useRef<HTMLSpanElement>(null);
	const author = (reply ?? comment).author;
	const mine = author.accountId === context.reader.me;
	// a team gone local reads its comments: copying a link is all its menu does
	const writes = context.unpaid !== true;
	// an outsider or a viewer changes only their own; an editor or admin deletes anyone's
	const deletes = writes && (mine || (context.outsider === undefined && context.edits !== false));
	const replies = comment.replies.filter((one) => one.draftFor === null).length;
	const what = reply === undefined ? "comment" : "reply";
	const copy = () => {
		setOpen(false);
		const link = commentLink(context.url, comment.id);
		if (link === null) return;
		void navigator.clipboard
			?.writeText(link)
			.then(() => context.notice({ kind: "success", message: "Copied the comment's link" }))
			.catch(() => context.notice({ kind: "error", message: "Could not copy the link" }));
	};
	const remove = () => {
		setOpen(false);
		onChange(
			context.client.change(comment.id, {
				type: "delete",
				...(reply === undefined ? {} : { reply: reply.id }),
			}),
		);
	};
	const deleteSays =
		reply !== undefined
			? "Delete reply"
			: replies > 0
				? `Delete with ${replies} ${replies === 1 ? "reply" : "replies"}`
				: "Delete comment";
	return (
		<span ref={anchor} className="relative flex">
			<IconButton
				size="sm"
				icon={<DotsIcon />}
				label={what === "comment" ? "Comment options" : "Reply options"}
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			/>
			{open ? (
				<FloatingMenu anchor={anchor} align="end" width={232} onDismiss={() => setOpen(false)} data-comment-menu="">
					{mine && onEdit !== undefined && writes ? (
						<MenuItem
							label="Edit"
							disabled={!context.online}
							onClick={() => {
								setOpen(false);
								onEdit();
							}}
						/>
					) : null}
					<MenuItem label="Copy link" disabled={context.url === null} onClick={copy} />
					{mine || !writes ? null : (
						<MenuItem
							label="Mark as unread"
							disabled={!context.online}
							onClick={() => {
								setOpen(false);
								onUnread();
							}}
						/>
					)}
					{deletes ? (
						<>
							<MenuSeparator />
							<MenuItem label={deleteSays} destructive disabled={!context.online} onClick={remove} />
						</>
					) : null}
				</FloatingMenu>
			) : null}
		</span>
	);
}

/** One message: the face, the name and when, the words or the field editing them; under the first, the element. */
function Message({
	message,
	names,
	unread,
	acts,
	chip,
	draft = false,
}: {
	message: Comment | CommentReply;
	names: readonly Named[];
	unread: boolean;
	acts: MessageActs;
	chip?: ReactNode;
	/** an agent's reply on a share's comment, waiting for its person alone to send it or edit it first (spool#174) */
	draft?: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const by = message.author;
	const outsider = message.outsider === true;
	const { context, comment } = acts;
	const sendDraft = (body?: string) =>
		acts.onChange(
			context.client.change(comment.id, {
				type: "send",
				reply: message.id,
				...(body === undefined ? {} : { body, mentions: mentionedIn(body, context.people) }),
			}),
			() => setEditing(false),
		);
	return (
		<div
			className={cn("group/msg relative flex gap-2.5", draft && "opacity-80")}
			data-comment-message={message.id}
			data-comment-draft={draft ? "" : undefined}
		>
			<span
				aria-hidden="true"
				className={cn(
					"mt-px inline-flex size-5 shrink-0 items-center justify-center font-semibold text-2xs uppercase leading-none",
					message.agent ? "rounded-[5px]" : "rounded-full",
					outsider && "border border-line-strong bg-surface-raised text-primary",
				)}
				style={outsider ? undefined : { background: by.color, color: PRESENCE_INK }}
			>
				{message.agent ? <AgentGlyph /> : by.name.charAt(0)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex h-5 items-center gap-2">
					<span className="truncate text-primary type-control">{nameOf(by, message.agent)}</span>
					{outsider ? <span className="shrink-0 text-tertiary type-detail">via share</span> : null}
					{draft ? <span className="shrink-0 text-tertiary type-detail">draft · only you see it</span> : null}
					<span className="shrink-0 text-tertiary type-detail">{ago(message.created)}</span>
					{message.edited === null ? null : <span className="shrink-0 text-tertiary type-detail">edited</span>}
					{unread ? <Dot tone="accent" /> : null}
					<span className="ml-auto opacity-0 group-hover/msg:opacity-100 has-[[aria-expanded=true]]:opacity-100 group-focus-within/msg:opacity-100">
						<MessageMenu {...acts} onEdit={() => setEditing(true)} />
					</span>
				</div>
				{editing ? (
					<EditField
						acts={acts}
						text={message.body}
						onDone={() => setEditing(false)}
						onSave={draft ? sendDraft : undefined}
					/>
				) : (
					<Said text={message.body} people={names} />
				)}
				{chip === undefined ? null : <span className="flex pt-1">{chip}</span>}
				{draft && !editing ? (
					<span className="flex items-center gap-1.5 pt-1.5">
						<span className="min-w-0 flex-1 text-secondary type-label">
							Your agent wrote this for{" "}
							{comment.share === undefined ? "the share" : audienceLabel(comment.share)}.
						</span>
						<Button size="sm" variant="ghost" disabled={!context.online} onClick={() => setEditing(true)}>
							Edit
						</Button>
						<Button size="sm" variant="primary" disabled={!context.online} onClick={() => sendDraft()}>
							Send
						</Button>
					</span>
				) : null}
			</div>
		</div>
	);
}

/** A message's words being edited by its author: Enter or Save sends them, marked edited; Esc or Cancel leaves them. */
function EditField({
	acts,
	text,
	onDone,
	onSave,
}: {
	acts: MessageActs;
	text: string;
	onDone: () => void;
	/** what saving does instead of an edit: a draft is sent with these words (spool#174) */
	onSave?: ((body: string) => void) | undefined;
}) {
	const [value, setValue] = useState(text);
	const { context, comment, reply } = acts;
	const save = () => {
		if (value.trim() === "") return;
		if (onSave !== undefined) return onSave(value);
		if (value === text) return onDone();
		acts.onChange(
			context.client.change(comment.id, {
				type: "edit",
				body: value,
				mentions: mentionedIn(value, context.people),
				...(reply === undefined ? {} : { reply: reply.id }),
			}),
			onDone,
		);
	};
	return (
		<div className="flex flex-col gap-2 pt-1" data-comment-edit="">
			<MentionField
				value={value}
				onValue={setValue}
				people={context.people}
				rows={2}
				label="Edit"
				placeholder="Comment"
				onSend={save}
				onEscape={onDone}
			/>
			<div className="flex justify-end gap-1.5">
				<Button size="sm" variant="ghost" onClick={onDone}>
					Cancel
				</Button>
				<Button size="sm" variant="primary" disabled={value.trim() === ""} onClick={save}>
					{onSave === undefined ? "Save" : "Send"}
				</Button>
			</div>
		</div>
	);
}

/** When it was resolved, as the resolved line says it: just now, or how long ago. */
function resolvedAgo(at: number): string {
	const said = ago(at);
	return said === "now" ? "just now" : `${said} ago`;
}

/** A comment as the agent composer's chip names it: whose, and where. */
export function commentChip(comment: Comment): string {
	return `comment · ${nameOf(comment.author, comment.agent)} · ${comment.frame ?? "the field"}`;
}

/** Who wrote a message: the person, or their agent writing as them through `spool comments` (spool#172). */
export function nameOf(by: CommentPerson, agent: boolean): string {
	return agent ? `${by.name}'s agent` : by.name;
}

/** An agent's face: its owner's colour as a rounded square, holding the agent's mark, as presence draws one. */
export function AgentGlyph() {
	return (
		<svg viewBox="0 0 16 16" width={11} height={11} fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r="1.4" fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.4" fill="currentColor" />
			<path d="M6.4 5.4h7.2M6.4 10.6h4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	);
}

/** How long ago, as a card says it: now, then minutes, hours and days. */
export function ago(at: number, now = Date.now()): string {
	const minutes = Math.floor((now - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}
