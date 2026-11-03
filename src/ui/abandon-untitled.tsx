import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { isUntitled } from "../untitled";
import { fetchProjection, trashAbandoned } from "./api";
import { TextAction, Toast } from "./primitives/feedback";
import type { TabProject } from "./tab-strip";

const UNDO_MS = 5000;

interface Abandoned {
	project: TabProject;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * New makes a project without asking, so one closed untitled and empty goes to the Trash by itself (spool#51).
 * Closing its tab hides it from Home and stands a toast with Undo, which opens it again; once the toast drains
 * the daemon trashes it, if it still is untitled with no frames. A team copy stays, being the team's.
 */
export function useAbandonUntitled({
	hide,
	show,
	onUndo,
	onGone,
}: {
	/** Home leaves the project out while its toast stands */
	hide: (root: string) => void;
	/** it stays after all: undone, used, or the trash refused */
	show: (root: string) => void;
	onUndo: (project: TabProject) => void;
	onGone: (root: string) => void;
}): { closed: (project: TabProject) => void; toast: ReactNode } {
	const [standing, setStanding] = useState<Abandoned | null>(null);
	const latest = useRef({ hide, show, onUndo, onGone });
	latest.current = { hide, show, onUndo, onGone };
	const standingRef = useRef<Abandoned | null>(null);
	const stand = useCallback((next: Abandoned | null) => {
		standingRef.current = next;
		setStanding(next);
	}, []);

	const trash = useCallback(
		(project: TabProject) => {
			if (standingRef.current?.project.root === project.root) stand(null);
			void trashAbandoned(project.root).then((gone) => {
				if (gone) latest.current.onGone(project.root);
				latest.current.show(project.root);
			});
		},
		[stand],
	);

	const closed = useCallback(
		(project: TabProject) => {
			if (!isUntitled(project.name) || project.teamAddress !== undefined) return;
			latest.current.hide(project.root);
			void fetchProjection(project.name).then((projection) => {
				if (projection === undefined || projection.frames.length > 0) {
					latest.current.show(project.root);
					return;
				}
				// one toast at a time: the one standing goes now
				const was = standingRef.current;
				if (was !== null) {
					clearTimeout(was.timer);
					trash(was.project);
				}
				stand({ project, timer: setTimeout(() => trash(project), UNDO_MS) });
			});
		},
		[stand, trash],
	);

	const undo = useCallback(() => {
		const was = standingRef.current;
		if (was === null) return;
		clearTimeout(was.timer);
		stand(null);
		latest.current.show(was.project.root);
		latest.current.onUndo(was.project);
	}, [stand]);

	// a page that goes while a toast stands leaves its project where it is
	useEffect(() => () => clearTimeout(standingRef.current?.timer), []);

	return {
		closed,
		toast: standing !== null && (
			<div key={standing.project.root} className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20">
				<Toast
					message={`Moved ${standing.project.name} to Trash`}
					action={<TextAction onClick={undo}>Undo</TextAction>}
					drain={UNDO_MS}
				/>
			</div>
		),
	};
}
