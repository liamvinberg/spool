import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { isUntitled } from "../untitled";
import { fetchAgentThreads, fetchProjection, trashAbandoned } from "./api";
import { TextAction, Toast } from "./primitives/feedback";
import type { TabProject } from "./tab-strip";

const UNDO_MS = 5000;

interface Abandoned {
	project: TabProject;
	/** What its toast calls it: a team copy by its team project's name. */
	name: string;
	timer: ReturnType<typeof setTimeout>;
}

/** A team copy as its card says it: its team project's name, and whether this Mac started it with New. */
interface AbandonedTeam {
	project: string;
	startedHere?: boolean | undefined;
}

/**
 * New makes a project without asking, so one closed untitled and empty goes to the Trash by itself (spool#51).
 * Closing its tab hides it from Home and stands a toast with Undo, which opens it again; once the toast drains
 * the daemon trashes it, if it still is closed, untitled and without frames. Opened again any other way meanwhile
 * (⌘⇧T, say), it is kept just as Undo keeps it. One with a turn running stays, as one being named does (the shell
 * never hands it here). A team copy goes from its team for good too (spool#411), judged by its team project's name, and
 * only one this Mac started with New: a teammate's would come back. One that has anything in it at the team, or that
 * spool.page won't let go, stays, said nowhere.
 */
export function useAbandonUntitled({
	hide,
	show,
	reopen,
	onGone,
}: {
	/** Home leaves the project out while its toast stands */
	hide: (root: string) => void;
	/** it stays after all: kept, used, or the trash refused */
	show: (root: string) => void;
	/** Undo: the tab opens again, which keeps the project */
	reopen: (project: TabProject) => void;
	onGone: (root: string) => void;
}): {
	closed: (project: TabProject, team?: AbandonedTeam) => void;
	keep: (root: string) => void;
	toast: ReactNode;
} {
	const [standing, setStanding] = useState<Abandoned | null>(null);
	const latest = useRef({ hide, show, reopen, onGone });
	latest.current = { hide, show, reopen, onGone };
	const standingRef = useRef<Abandoned | null>(null);
	/** closed and on the way to a toast, until it stands or the project is kept */
	const pending = useRef(new Set<string>());
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
		(project: TabProject, team?: AbandonedTeam) => {
			if (team !== undefined && team.startedHere !== true) return;
			const name = team?.project ?? project.name;
			if (!isUntitled(name)) return;
			pending.current.add(project.root);
			latest.current.hide(project.root);
			void Promise.all([fetchProjection(project.name), fetchAgentThreads(project.name)]).then(
				([projection, threads]) => {
					// opened again while this was asked: it is kept already
					if (!pending.current.delete(project.root)) return;
					const working = threads.some(
						(thread) => thread.live && (thread.life === "running" || thread.life === "waiting"),
					);
					if (projection === undefined || projection.frames.length > 0 || working) {
						latest.current.show(project.root);
						return;
					}
					// one toast at a time: the one standing goes now
					const was = standingRef.current;
					if (was !== null) {
						clearTimeout(was.timer);
						trash(was.project);
					}
					stand({ project, name, timer: setTimeout(() => trash(project), UNDO_MS) });
				},
			);
		},
		[stand, trash],
	);

	const keep = useCallback(
		(root: string) => {
			const was = standingRef.current;
			const held = pending.current.delete(root);
			if (was?.project.root === root) {
				clearTimeout(was.timer);
				stand(null);
			} else if (!held) return;
			latest.current.show(root);
		},
		[stand],
	);

	// a page that goes while a toast stands leaves its project where it is
	useEffect(() => () => clearTimeout(standingRef.current?.timer), []);

	return {
		closed,
		keep,
		toast: standing !== null && (
			<div key={standing.project.root} className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20">
				<Toast
					message={
						standing.project.teamAddress === undefined
							? `Moved ${standing.name} to Trash`
							: `Deleted ${standing.name}`
					}
					action={<TextAction onClick={() => latest.current.reopen(standing.project)}>Undo</TextAction>}
					drain={UNDO_MS}
				/>
			</div>
		),
	};
}
