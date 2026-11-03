import { dirname, join } from "node:path";
import { SpoolError } from "../errors";
import { mutateMachineState } from "../machine-state";
import type { createAgentTurns } from "./agent-live";
import type { Namings } from "./agent-naming";
import type { createChangeHub } from "./events";
import type { createSelectionStore } from "./selection";
import type { AppEvent, watchMachineState } from "./session";

/**
 * Renaming a project, the one way it happens: a hand in the app, or the agent naming an untitled project from
 * its first ask. The folder moves and its conversations, live turns and selection follow it; the pages hear it
 * as `project-renamed`. Refused, as a SpoolError, while the project is mid-change, being named, or any turn in it runs.
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
}): (root: string, name: string) => { root: string; name: string } {
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
	return (root, name) => {
		const target = join(dirname(root), name.trim());
		if (projectRenames.has(root) || projectRenames.has(target))
			throw new SpoolError("Project change is in progress.");
		if (trashingProjects.has(root)) throw new SpoolError("This project is moving to the trash.");
		if (namings.has(root)) throw new SpoolError("The agent is naming this project. Try again in a moment.");
		if ([...liveTurns.of(root)].some((turn) => turn.running))
			throw new SpoolError("Let the agent finish or stop its turn before renaming this project.");
		projectRenames.add(root);
		projectRenames.add(target);
		try {
			const result = mutateMachineState(spoolDir, { kind: "rename-project", root, name });
			if (result.root !== root) {
				hub.forget(root);
				liveTurns.relocate(root, result.root);
				selections.relocate(root, result.root);
			}
			machineStateWatch.acknowledgeRegistry(result.registry);
			machineStateWatch.acknowledgeSession(result.session);
			emitAppEvent({ kind: "project-renamed", from: root, root: result.root, name: result.name });
			return { root: result.root, name: result.name };
		} finally {
			projectRenames.delete(root);
			projectRenames.delete(target);
		}
	};
}
