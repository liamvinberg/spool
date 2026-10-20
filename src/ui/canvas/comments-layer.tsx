import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import type { Comment, CommentPerson } from "../../team-sync-protocol";
import { type CommentsRead, fetchComments, postComment, postReply } from "../api";
import { cn } from "../cn";
import { CloseIcon } from "../icons";
import { Button, IconButton } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { TextareaBare } from "../primitives/inputs";
import { Popover } from "../primitives/overlays";
import type { Box, Point } from "./camera";
import type { CameraStore } from "./camera-store";
import { type CanvasStore, useCanvasField } from "./canvas-store";
import { PRESENCE_INK } from "./presence-faces";

/**
 * Comments on a team canvas (ADR 0011, spool#169): a pin for each comment on this page, where it was put, and the
 * card a pin opens, with the comment, its replies in order and a field to reply in; and the composer the Comment tool
 * opens at a pin it places. Pins stand in screen pixels over the field, one size at every zoom, as presence does.
 *
 * What the canvas reads comes from the daemon, which keeps what the team last said so it shows offline too; writing
 * goes through it to the team while the project is connected, and is refused, words kept, while it isn't.
 */

/** A pin's size on screen, at every zoom: round, with its bottom-left corner at the spot. */
export const PIN = 22;
/** A card's width beside its pin. */
const CARD_W = 312;
/** How far a card keeps from the canvas's edges. */
const EDGE = 12;

/** A comment the Comment tool placed and its person is writing: where it stands, and what was under the pin. */
export interface CommentDraft {
	page: string;
	/** The frame it stands on, its point in the frame's own pixels; null for the page's field, at a world point. */
	frame: string | null;
	at: Point;
	element: { selector: string; tag: string; outerHtml: string; source: string | null; generated: boolean } | null;
}

/** The event the canvas passes the daemon's `comments` change on as. */
export const COMMENTS_CHANGE = "spool-comments-change";

/**
 * A team project's comments as this Mac knows them: read when the canvas opens, whenever the daemon says they
 * changed, and when the window comes back to the front.
 */
export function useComments(project: string, team: boolean): CommentsRead & { refresh: () => void } {
	const [read, setRead] = useState<CommentsRead>({ online: false, comments: [] });
	const asked = useRef(0);
	const refresh = useCallback(() => {
		if (!team) return;
		const mine = ++asked.current;
		void fetchComments(project).then((next) => {
			if (mine === asked.current) setRead(next);
		});
	}, [project, team]);
	useEffect(() => {
		refresh();
		window.addEventListener(COMMENTS_CHANGE, refresh);
		window.addEventListener("focus", refresh);
		return () => {
			asked.current++;
			window.removeEventListener(COMMENTS_CHANGE, refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);
	return { ...read, refresh };
}

/** Where a comment stands on its page's field, in world units; undefined when its frame isn't on this page. */
export function commentWorld(
	comment: { frame: string | null; at: Point },
	frames: readonly (Box & { name: string })[],
): Point | undefined {
	if (comment.frame === null) return comment.at;
	const frame = frames.find((one) => one.name === comment.frame);
	return frame === undefined ? undefined : { x: frame.x + comment.at.x, y: frame.y + comment.at.y };
}

/** Where a comment was put, as its card says: the frame's name, or the field. */
export function placeSays(comment: { frame: string | null }): string {
	return comment.frame === null ? "on the field" : comment.frame;
}

export function CommentsLayer({
	project,
	store,
	camera,
	frames,
	page,
	comments,
	online,
	refresh,
}: {
	project: string;
	store: CanvasStore;
	camera: CameraStore;
	/** The frames on this page, in world units. */
	frames: readonly (Box & { name: string })[];
	page: string;
	comments: readonly Comment[];
	online: boolean;
	refresh: () => void;
}) {
	const [draft, setDraft] = useCanvasField(store, "commentDraft");
	const [open, setOpen] = useCanvasField(store, "commentOpen");
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

	const cam = camera.get();
	const toScreen = (at: Point) => (cam === null ? at : { x: at.x * cam.k + cam.x, y: at.y * cam.k + cam.y });
	const here = comments.flatMap((comment) => {
		if (comment.page !== page || comment.standing === "deleted-page") return [];
		const world = commentWorld(comment, frames);
		return world === undefined ? [] : [{ comment, at: toScreen(world) }];
	});
	const opened = open === null ? undefined : here.find((one) => one.comment.id === open);
	const drafted = draft === null || draft.page !== page ? undefined : commentWorld(draft, frames);
	const draftAt = drafted === undefined ? undefined : toScreen(drafted);

	return (
		<div ref={field} className="pointer-events-none absolute inset-0 overflow-hidden" data-comments-layer="">
			{here.map(({ comment, at }) => (
				<Pin
					key={comment.id}
					id={comment.id}
					by={comment.author}
					agent={comment.agent}
					at={at}
					open={comment.id === open}
					onOpen={() => {
						setDraft(null);
						setOpen(comment.id === open ? null : comment.id);
					}}
				/>
			))}
			{draftAt === undefined ? null : <GhostPin at={draftAt} />}
			{opened === undefined || cam === null ? null : (
				<CardAt at={opened.at} canvas={size}>
					<CommentCard
						key={opened.comment.id}
						project={project}
						comment={opened.comment}
						online={online}
						onClose={() => setOpen(null)}
						onSent={refresh}
					/>
				</CardAt>
			)}
			{draft === null || draftAt === undefined ? null : (
				<CardAt at={draftAt} canvas={size}>
					<Composer
						project={project}
						draft={draft}
						online={online}
						onClose={() => setDraft(null)}
						onSent={(id) => {
							setDraft(null);
							setOpen(id);
							refresh();
						}}
					/>
				</CardAt>
			)}
		</div>
	);
}

/**
 * A pin: its author's initial in their presence colour, its bottom-left corner on the spot. An agent's is
 * square-cornered. Under any tool, a click on it opens its card.
 */
function Pin({
	id,
	by,
	agent,
	at,
	open,
	onOpen,
}: {
	id: string;
	by: CommentPerson;
	agent: boolean;
	at: Point;
	open: boolean;
	onOpen: () => void;
}) {
	const round = PIN / 2;
	return (
		<button
			type="button"
			aria-label={`Comment by ${by.name}`}
			aria-expanded={open}
			data-comment-pin={id}
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				onOpen();
			}}
			className={cn(
				"pointer-events-auto absolute flex cursor-pointer items-center justify-center font-semibold text-[10px] uppercase leading-none transition-transform duration-fast ease-out",
				open ? "z-20 scale-110" : "z-10 hover:scale-105",
			)}
			style={{
				left: at.x,
				top: at.y - PIN,
				width: PIN,
				height: PIN,
				borderRadius: agent ? 5 : `${round}px ${round}px ${round}px 2px`,
				transformOrigin: "0 100%",
				background: by.color,
				color: PRESENCE_INK,
				boxShadow: open
					? "0 0 0 1.5px var(--color-surface-window), 0 0 0 3.5px var(--color-accent)"
					: "0 0 0 1.5px var(--color-surface-window)",
			}}
		>
			{by.name.charAt(0)}
		</button>
	);
}

/** The pin being placed, nobody's yet. */
function GhostPin({ at }: { at: Point }) {
	const round = PIN / 2;
	return (
		<span
			aria-hidden="true"
			data-comment-ghost=""
			className="absolute z-20 flex items-center justify-center bg-surface-inverse text-[13px] text-on-inverse leading-none"
			style={{
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
 * in the top half, standing up from one in the bottom half, so it never leaves the canvas.
 */
function CardAt({ at, canvas, children }: { at: Point; canvas: { w: number; h: number }; children: ReactNode }) {
	const right = at.x + PIN + 10 + CARD_W < canvas.w - EDGE;
	const left = right ? at.x + PIN + 10 : Math.max(EDGE, at.x - CARD_W - 10);
	const low = at.y > canvas.h * 0.55;
	const bottom = Math.max(16, canvas.h - at.y - 24);
	const top = Math.max(16, at.y - PIN - 8);
	return (
		<div
			className="pointer-events-auto absolute z-30 flex flex-col"
			style={{
				left,
				width: CARD_W,
				...(low ? { bottom, maxHeight: canvas.h - bottom - 16 } : { top, maxHeight: canvas.h - top - 16 }),
			}}
		>
			{children}
		</div>
	);
}

/** A card's presses, wheel and menu are its own: none of them reaches the field under it. */
const OWN_POINTER = {
	onPointerDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onDoubleClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onWheel: (event: { stopPropagation(): void }) => event.stopPropagation(),
	onContextMenu: (event: { stopPropagation(): void }) => event.stopPropagation(),
};

/** Who reads it: the team. A share's audience comes with sharing comments (spool#174). */
function TeamLabel() {
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-secondary type-detail" data-comment-audience="team">
			<TeamGlyph />
			team
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

/** Said when a comment can't go: the project isn't connected to the team, so nothing is sent or kept to send later. */
const OFFLINE = "Offline: comments go to spool.page, so this waits until the project is connected again.";

/** The words field both the composer and a reply use: Enter sends, Shift+Enter is a new line, Esc closes. */
function Words({
	value,
	onValue,
	placeholder,
	rows,
	onSend,
	onEscape,
	label,
}: {
	value: string;
	onValue: (value: string) => void;
	placeholder: string;
	rows: number;
	onSend: () => void;
	onEscape: () => void;
	label: string;
}) {
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			onSend();
		} else if (event.key === "Escape") {
			event.preventDefault();
			onEscape();
		}
	};
	return (
		<TextareaBare
			value={value}
			onValueChange={onValue}
			rows={rows}
			autoFocus
			aria-label={label}
			placeholder={placeholder}
			onKeyDown={onKeyDown}
		/>
	);
}

/** Writing a comment at a pin just placed: what was under it, who reads it, the words. Enter sends. */
function Composer({
	project,
	draft,
	online,
	onClose,
	onSent,
}: {
	project: string;
	draft: CommentDraft;
	online: boolean;
	onClose: () => void;
	onSent: (id: string) => void;
}) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [refusal, setRefusal] = useState<string | null>(null);
	const offline = !online || refusal === "offline";
	const send = () => {
		if (text.trim() === "" || sending || offline) return;
		setSending(true);
		const { selector, outerHtml, source, generated } = draft.element ?? {};
		void postComment(project, {
			page: draft.page,
			frame: draft.frame,
			at: draft.at,
			element:
				selector === undefined || outerHtml === undefined || source === undefined || generated === undefined
					? null
					: { selector, outerHtml, source, generated },
			body: text,
		}).then((sent) => {
			setSending(false);
			if ("id" in sent) onSent(sent.id);
			else setRefusal(sent.error === "offline" ? "offline" : sent.message);
		});
	};
	return (
		<Popover pad="none" className="w-full" data-comment-composer="" {...OWN_POINTER}>
			<div className="flex min-h-10 shrink-0 items-center gap-1.5 border-line-default border-b pr-1.5 pl-3">
				<span className="shrink-0 text-tertiary type-detail">
					{draft.frame === null ? "on the field" : `on ${draft.frame}`}
				</span>
				{draft.element === null ? null : <ElementChip label={draft.element.tag} />}
				<span className="min-w-0 flex-1" />
				<IconButton size="sm" icon={<CloseIcon />} label="Cancel" onClick={onClose} />
			</div>
			<div className="flex flex-col gap-2.5 px-3 pt-2.5 pb-2.5">
				<Words
					value={text}
					onValue={(next) => {
						setText(next);
						if (refusal !== null && refusal !== "offline") setRefusal(null);
					}}
					rows={2}
					label="Comment"
					placeholder="Comment"
					onSend={send}
					onEscape={onClose}
				/>
				{offline ? (
					<span className="text-secondary type-label" data-comment-offline="">
						{OFFLINE}
					</span>
				) : refusal === null ? null : (
					<span className="text-danger type-label">{refusal}</span>
				)}
				<div className="flex items-center gap-2">
					<TeamLabel />
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

/** An open comment: who reads it and where it is, the first message and its replies in order, and a reply field. */
function CommentCard({
	project,
	comment,
	online,
	onClose,
	onSent,
}: {
	project: string;
	comment: Comment;
	online: boolean;
	onClose: () => void;
	onSent: () => void;
}) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [refusal, setRefusal] = useState<string | null>(null);
	const offline = !online || refusal === "offline";
	const send = () => {
		if (text.trim() === "" || sending || offline) return;
		setSending(true);
		void postReply(project, comment.id, text).then((sent) => {
			setSending(false);
			if ("id" in sent) {
				setText("");
				onSent();
			} else setRefusal(sent.error === "offline" ? "offline" : sent.message);
		});
	};
	return (
		<Popover pad="none" className="flex min-h-0 w-full flex-col" data-comment-card={comment.id} {...OWN_POINTER}>
			<div className="flex h-10 shrink-0 items-center gap-2 border-line-default border-b pr-1.5 pl-3">
				<TeamLabel />
				<span className="min-w-0 flex-1 truncate text-tertiary type-detail">{placeSays(comment)}</span>
				<IconButton size="sm" icon={<CloseIcon />} label="Close" onClick={onClose} />
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3 py-3">
				<Message
					by={comment.author}
					agent={comment.agent}
					when={comment.created}
					body={comment.body}
					chip={comment.element === null ? undefined : <ElementChip label={comment.element.name} />}
				/>
				{comment.replies.map((reply) => (
					<Message key={reply.id} by={reply.author} agent={reply.agent} when={reply.created} body={reply.body} />
				))}
			</div>
			<div className="flex shrink-0 flex-col gap-1.5 border-line-default border-t px-3 py-2.5">
				<div className="flex items-end gap-2 rounded-sm border border-line-strong bg-surface-window px-2.5 py-1.5 focus-within:border-line-focus">
					<div className="min-w-0 flex-1">
						<Words
							value={text}
							onValue={(next) => {
								setText(next);
								if (refusal !== null && refusal !== "offline") setRefusal(null);
							}}
							rows={1}
							label="Reply"
							placeholder="Reply"
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
				{offline ? (
					<span className="text-secondary type-label" data-comment-offline="">
						{OFFLINE}
					</span>
				) : refusal === null ? null : (
					<span className="text-danger type-label">{refusal}</span>
				)}
			</div>
		</Popover>
	);
}

/** One message: the face, the name and when, the words; under the first, what was under the pin. */
function Message({
	by,
	agent,
	when,
	body,
	chip,
}: {
	by: CommentPerson;
	agent: boolean;
	when: number;
	body: string;
	chip?: ReactNode;
}) {
	return (
		<div className="flex gap-2.5" data-comment-message="">
			<span
				aria-hidden="true"
				className={cn(
					"mt-px inline-flex size-5 shrink-0 items-center justify-center font-semibold text-[10px] uppercase leading-none",
					agent ? "rounded-[5px]" : "rounded-full",
				)}
				style={{ background: by.color, color: PRESENCE_INK }}
			>
				{by.name.charAt(0)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex h-5 items-center gap-2">
					<span className="truncate text-primary type-control">{by.name}</span>
					{agent ? <span className="shrink-0 text-tertiary type-detail">agent</span> : null}
					<span className="shrink-0 text-tertiary type-detail">{ago(when)}</span>
				</div>
				<p className="whitespace-pre-wrap break-words text-primary type-body" data-comment-body="">
					{body}
				</p>
				{chip === undefined ? null : <span className="flex pt-1">{chip}</span>}
			</div>
		</div>
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
