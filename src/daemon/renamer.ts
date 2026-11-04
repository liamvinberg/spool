import { dirname, join } from "node:path";
import { SpoolError } from "../errors";
import { mutateMachineState } from "../machine-state";
import { teamProjectName } from "../team-project-name";
import type { createAgentTurns } from "./agent-live";
import type { Namings } from "./agent-naming";
import type { createChangeHub } from "./events";
import type { createSelectionStore } from "./selection";
import type { AppEvent, watchMachineState } from "./session";
import { forgetStartedHere } from "./started-here";
import { followedLink } from "./team-sync";

/** A project after its rename: where its folder is now, and what it is called. */
export type Renamed = { root: string; name: string };

/**
 * Renaming a project, the one way it happens: a hand in the app, or the agent naming an untitled project from
 * its first ask. The folder moves and its conversations, live turns and selection follow it; the pages hear it
 * as `project-renamed`. A team copy is renamed in its team first (spool#411). Refused, as a SpoolError, while the
 * project is mid-change, being named, or any turn in it runs.
 */
export function createRenamer(deps: {
	spoolDir: string;
	/** Projects mid-rename or mid-trash, which every other project change waits out. */
	projectRenames: Set<string>;
	trashingProjects: ReadonlySet<string>;
	/** The agent is naming these: it renames them itself once it answers. */
	namings: Pick<Namings, "has">;
	liveTurns: Pick<ReturnType<typeof createAgentTurns>, "of" | "relocate">;
	hub: Pick<ReturnType<typeof createChangeHub>, "forget">;
	selections: Pick<ReturnType<typeof createSelectionStore>, "relocate">;
	machineStateWatch: Pick<ReturnType<typeof watchMachineState>, "acknowledgeRegistry" | "acknowledgeSession">;
	emitAppEvent: (event: AppEvent) => void;
	/**
	 * A team copy's rename (spool#411): spool.page renames the project and this Mac's copies follow, the folder moving
	 * by `folder`, this same rename. Without it, a team copy's folder is renamed as any project's is.
	 */
	team?: (root: string, name: string, folder: (name: string) => { root: string; name: string }) => Promise<Renamed>;
}): ((root: string, name: string) => Promise<Renamed>) & {
	/**
	 * A team copy's folder takes the name its project was given on another Mac, as it follows the rename: only the
	 * folder, as nothing else is asked. Undefined when the project is busy, or the folder can't take the name: it
	 * keeps the one it has.
	 */
	follow: (root: string, name: string) => Renamed | undefined;
} {
	const {
		spoolDir,
		projectRenames,
		trashingProjects,
		namings,
		liveTurns,
		hub,
		selections,
		machineStateWatch,
		emitAppEvent,
	} = deps;
	/** The folder moves, and its conversations, live turns and selection follow it. */
	const folder = (root: string, name: string): Renamed => {
		const result = mutateMachineState(spoolDir, { kind: "rename-project", root, name });
		if (result.root !== root) {
			// named, it is no longer New's untitled one, and its old folder may later hold a teammate's
			forgetStartedHere(spoolDir, root);
			hub.forget(root);
			liveTurns.relocate(root, result.root);
			selections.relocate(root, result.root);
		}
		machineStateWatch.acknowledgeRegistry(result.registry);
		machineStateWatch.acknowledgeSession(result.session);
		emitAppEvent({ kind: "project-renamed", from: root, root: result.root, name: result.name });
		return { root: result.root, name: result.name };
	};
	const busy = (root: string, target: string) =>
		projectRenames.has(root) ||
		projectRenames.has(target) ||
		trashingProjects.has(root) ||
		namings.has(root) ||
		[...liveTurns.of(root)].some((turn) => turn.running);
	const follow = (root: string, name: string): Renamed | undefined => {
		const target = join(dirname(root), name);
		if (busy(root, target)) return undefined;
		projectRenames.add(root);
		projectRenames.add(target);
		try {
			return folder(root, name);
		} catch {
			return undefined;
		} finally {
			projectRenames.delete(root);
			projectRenames.delete(target);
		}
	};
	const rename = async (root: string, name: string): Promise<Renamed> => {
		// a team copy's name is cleaned as spool.page cleans it, so the guard holds the folder it would move to
		const team = deps.team !== undefined && followedLink(root) !== undefined ? deps.team : undefined;
		const named = team === undefined ? name.trim() : (teamProjectName(name) ?? name.trim());
		const target = join(dirname(root), named);
		if (projectRenames.has(root) || projectRenames.has(target))
			throw new SpoolError("Project change is in progress.");
		if (trashingProjects.has(root)) throw new SpoolError("This project is moving to the trash.");
		if (namings.has(root)) throw new SpoolError("The agent is naming this project. Try again in a moment.");
		if ([...liveTurns.of(root)].some((turn) => turn.running))
			throw new SpoolError("Let the agent finish or stop its turn before renaming this project.");
		projectRenames.add(root);
		projectRenames.add(target);
		try {
			if (team !== undefined) return await team(root, named, (to) => folder(root, to));
			return folder(root, name);
		} finally {
			projectRenames.delete(root);
			projectRenames.delete(target);
		}
	};
	return Object.assign(rename, { follow });
}
