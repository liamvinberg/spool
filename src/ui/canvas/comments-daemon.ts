import { useCallback, useEffect, useRef, useState } from "react";
import { type CommentMentionable, type CommentsRead, coverUrl, fetchCommentPeople, fetchComments } from "../api";
import type { CommentStills } from "./comment-history";

/**
 * A Mac's comments on a team project, read through its daemon (spool#169, spool#170), which keeps what the team last
 * said so a canvas shows them offline too. The browser canvas hears them on its own socket instead (spool#173).
 */

/** The event the canvas passes the daemon's `comments` change on as. */
export const COMMENTS_CHANGE = "spool-comments-change";

const NOTHING_READ: CommentsRead = { online: false, unpaid: false, comments: [], reads: {}, url: null };

/**
 * A team project's comments as this Mac knows them: read when the canvas opens, whenever the daemon says they
 * changed, and when the window comes back to the front.
 */
export function useComments(project: string, team: boolean): CommentsRead & { refresh: () => void } {
	const [read, setRead] = useState<CommentsRead>(NOTHING_READ);
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

/** The members a comment on a team project can mention, asked once the canvas knows it is a team's. */
export function useCommentPeople(project: string, team: boolean): readonly CommentMentionable[] {
	const [people, setPeople] = useState<readonly CommentMentionable[]>([]);
	useEffect(() => {
		if (!team) return;
		let live = true;
		void fetchCommentPeople(project).then((found) => {
			if (live) setPeople(found);
		});
		return () => {
			live = false;
		};
	}, [project, team]);
	return people;
}

/** Compare's pictures on a Mac: the still a comment kept, as the daemon keeps it from the team, and this Mac's cover. */
export function daemonStills(project: string): CommentStills {
	return {
		kept: (comment) => `/api/p/${encodeURIComponent(project)}/comments/${encodeURIComponent(comment.id)}/still`,
		now: (frame, drawn) => (drawn?.cover === undefined ? undefined : coverUrl(project, frame, drawn.cover.hash)),
	};
}
