import { bootRoom } from "./deck/room-host";
import { stageDaemon } from "./deck/stage-daemon";
import { mountStage, type StageHost } from "./deck/stage-host";

/**
 * The plain play address of a deck page (spool#265), on spool's own origin: the talk on black, filling the window,
 * owning its session. Keys pressed here reach the stage as they would inside it, and a saved change to the talk is
 * taken without leaving its slide and beat. Frame code never runs in this document.
 *
 * With `room`, the same address is the room's window of a talk presented from spool's own window, which follows it
 * (`deck/room-host.ts`).
 */

export interface StageHostConfig {
	project: string;
	page: string;
	frame?: string;
	controlToken: string;
	/** the talk this window is the room of */
	room?: string;
}

export function bootStageHost(config: StageHostConfig): StageHost {
	const root = document.getElementById("root");
	if (root === null) throw new Error("spool: the stage host has no #root");
	if (config.room !== undefined) return bootRoom(root, { ...config, room: config.room });
	const daemon = stageDaemon(config);
	const host = mountStage(root, {
		address: daemon.address,
		mode: "own",
		room: true,
		...(config.frame === undefined ? {} : { frame: config.frame }),
		on: {
			command: (command) => {
				// the talk ends where it began: this window's history
				if (command.kind === "escape" && document.fullscreenElement === null) history.back();
			},
			refused: (why) => console.error(`spool: ${why}`),
		},
	});
	addEventListener("keydown", (event) => {
		if (host.key(event)) event.preventDefault();
	});
	daemon.follow(host);
	return host;
}
