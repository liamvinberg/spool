import { useState } from "react";
import type { Cover } from "../../cover";
import { type Comment, within } from "../../team-sync-protocol";
import { coverUrl } from "../api";
import { cn } from "../cn";
import { TextAction } from "../primitives/feedback";
import type { Box, Point } from "./camera";

/**
 * A comment over its frame's life (spool#160): the frame it stands on edited since it was made, Compare between the
 * still it kept and the frame now, and the frame it stood on deleted. Where it stands is the team's to say; this
 * draws what the team and this Mac say of it.
 */

/** A frame on the canvas as a comment reads it: where it is and how big, and the cover this Mac has of it. */
export type CommentFrame = Box & { name: string; cover?: Cover | undefined };

/**
 * A pin's point on its frame, held inside the frame however it was resized since: the comment keeps its pixel offset
 * from the frame's top-left, and a frame made smaller keeps the pin on its edge.
 */
export function pinOnFrame(at: Point, frame: Pick<Box, "w" | "h">): Point {
	return { x: within(at.x, frame.w), y: within(at.y, frame.h) };
}

/** Said in place of the composer and the reply field while the team has gone local: comments read, never written. */
export const UNPAID = "This team has gone local: comments are read-only until it pays again.";

/** The pin of a comment whose frame was deleted: where it stood, with the frame's name beside it. */
export function droppedFrame(comment: Comment): string | undefined {
	return comment.standing === "deleted-frame" ? comment.dropped?.frame : undefined;
}

/** A frame's own name, the last part of its path: what a pin's mark says beside it. */
export function frameLeaf(frame: string): string {
	return frame.slice(frame.lastIndexOf("/") + 1);
}

/** The line a card opens with when its frame was deleted: the comment stays where its pin stood. */
export function DroppedLine({ comment }: { comment: Comment }) {
	const frame = droppedFrame(comment);
	if (frame === undefined) return null;
	const when = comment.dropped === undefined ? "" : ` ${daySays(comment.dropped.at)}`;
	return (
		<div
			className="flex shrink-0 items-start gap-2 border-line-default border-b bg-surface-panel px-3 py-2"
			data-comment-dropped={frame}
		>
			<span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-danger-strong" />
			<span className="min-w-0 flex-1 text-secondary type-label">
				{frame} was deleted{when}. The comment stays on the field, where its pin stood.
			</span>
		</div>
	);
}

/** A card's note that its frame changed after it was made, opening the still it kept beside the frame now. */
export function EditedSince({
	project,
	comment,
	frame,
}: {
	project: string;
	comment: Comment;
	/** The frame as the canvas has it now, for the "now" still; none when it isn't on this page. */
	frame: CommentFrame | undefined;
}) {
	const [comparing, setComparing] = useState(false);
	if (comment.frame === null) return null;
	const rev = comment.revision?.slice(0, 7) ?? "";
	return (
		<div
			className="flex flex-col gap-2 rounded-sm border border-line-default px-2.5 py-2"
			data-comment-edited={comment.id}
		>
			<div className="flex items-center gap-2">
				<span className="size-1.5 shrink-0 rounded-full bg-secondary" />
				<span className="min-w-0 flex-1 truncate text-secondary type-label">{comment.frame} edited since</span>
				<TextAction className="-my-1 -mr-1.5" aria-expanded={comparing} onClick={() => setComparing(!comparing)}>
					{comparing ? "Hide" : "Compare"}
				</TextAction>
			</div>
			{comparing ? (
				<div className="flex gap-2">
					<Still
						src={
							comment.still
								? `/api/p/${encodeURIComponent(project)}/comments/${encodeURIComponent(comment.id)}/still`
								: undefined
						}
						at={comment.at}
						frame={frame}
						label={rev === "" ? "then" : `then · ${rev}`}
						then
					/>
					<Still
						src={frame?.cover === undefined ? undefined : coverUrl(project, comment.frame, frame.cover.hash)}
						at={comment.at}
						frame={frame}
						label="now"
					/>
				</div>
			) : null}
		</div>
	);
}

/** A still's box on the card. */
const STILL_W = 133;
const STILL_H = 104;

/** One still cut around the pin, at half the frame's size, with the pin's point ringed. */
function Still({
	src,
	at,
	frame,
	label,
	then = false,
}: {
	src: string | undefined;
	at: Point;
	frame: CommentFrame | undefined;
	label: string;
	then?: boolean;
}) {
	const [failed, setFailed] = useState(false);
	const k = 0.5;
	const w = frame?.w ?? STILL_W / k;
	const h = frame?.h ?? STILL_H / k;
	const pin = frame === undefined ? at : pinOnFrame(at, frame);
	const left = Math.min(0, Math.max(STILL_W - w * k, STILL_W / 2 - pin.x * k));
	const top = Math.min(0, Math.max(STILL_H - h * k, STILL_H / 2 - pin.y * k));
	const shown = src !== undefined && !failed;
	return (
		<div className="flex min-w-0 flex-col gap-1" data-comment-still={then ? "then" : "now"}>
			<div
				className="relative overflow-hidden rounded-xs border border-line-default bg-surface-canvas"
				style={{ width: STILL_W, height: STILL_H }}
			>
				{shown ? (
					<img
						src={src}
						alt=""
						draggable={false}
						onError={() => setFailed(true)}
						className="absolute max-w-none origin-top-left select-none"
						style={{ left, top, width: w * k, height: h * k }}
					/>
				) : (
					<span className="absolute inset-0 flex items-center justify-center text-tertiary type-detail">
						{then ? "No still" : "Not drawn yet"}
					</span>
				)}
				{shown ? (
					<span
						className="absolute size-3 rounded-full border-2 border-accent"
						style={{ left: left + pin.x * k - 6, top: top + pin.y * k - 6 }}
					/>
				) : null}
			</div>
			<span className={cn("type-detail", then ? "text-secondary" : "text-primary")}>{label}</span>
		</div>
	);
}

/** When something happened, as a card says a day: today, yesterday, or the date. */
function daySays(at: number, now = Date.now()): string {
	const day = (time: number) => new Date(time).toDateString();
	if (day(at) === day(now)) return "today";
	if (day(at) === day(now - 86_400_000)) return "yesterday";
	return `on ${new Date(at).toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}
