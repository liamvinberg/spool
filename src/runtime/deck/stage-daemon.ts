import type { Size } from "../../deck/deck-file";
import { talkReloads } from "../../deck/talk-reload";
import type { StageHost } from "./stage-host";

/**
 * A stage hosted in a page of spool's own that is no canvas (spool#265): the plain play address of a deck page and the
 * room's window. Such a page asks the daemon itself for the stage's address, and listens to the project's changes
 * itself, taking a saved change to the talk without leaving its slide and beat.
 */

export interface StageDaemonConfig {
	project: string;
	page: string;
	controlToken: string;
}

export interface StageDaemon {
	/**
	 * a fresh address of the stage's document, and the talk's size, for `mountStage`; `room`: on the room's host, where
	 * the browser plays it in a process of its own (spool#320)
	 */
	address(room?: boolean): Promise<{ address: string; size: Size }>;
	/** a saved change to the talk taken by `host`, for as long as the page is open */
	follow(host: StageHost): void;
}

/** The header spool's own windows prove themselves with, as the player shell sends it. */
const CONTROL_HEADER_NAME = "x-spool-control";

export function stageDaemon(config: StageDaemonConfig): StageDaemon {
	const headers = { [CONTROL_HEADER_NAME]: config.controlToken };
	const api = `/api/p/${encodeURIComponent(config.project)}`;
	/** the talk the newest document was opened on, as the daemon said it */
	let playing = "";
	/** Whether the talk the daemon would play now is another than the one playing. */
	const talkChanged = async () => {
		const response = await fetch(`${api}/deck-stage?page=${encodeURIComponent(config.page)}`, { headers });
		return response.ok && JSON.stringify(await response.json()) !== playing;
	};
	return {
		async address(room = false) {
			const response = await fetch(`${api}/deck-stage`, {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ page: config.page, ...(room ? { room } : {}) }),
			});
			if (!response.ok) throw new Error((await response.text()) || "the talk could not be played");
			const answer = (await response.json()) as { address: string; size: Size; talk: unknown };
			playing = JSON.stringify(answer.talk);
			return answer;
		},
		follow(host) {
			const reloader = talkReloads({
				page: config.page,
				frames: () => host.talk().map((slide) => slide.frame),
				reload: () => host.reload(),
				changed: talkChanged,
			});
			void listen(api, headers, reloader.heard);
		},
	};
}

/** The project's changes, each handed to `heard`, for as long as the page is open. */
async function listen(api: string, headers: Record<string, string>, heard: (change: unknown) => void): Promise<void> {
	for (;;) {
		try {
			const response = await fetch(`${api}/events`, { headers: { ...headers, accept: "text/event-stream" } });
			if (!response.ok || response.body === null) throw new Error("no events");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				buffer += decoder.decode(next.value, { stream: true });
				const blocks = buffer.split("\n\n");
				buffer = blocks.pop() ?? "";
				for (const block of blocks) {
					const raw = block.match(/^data: (.*)$/m)?.[1];
					if (raw === undefined) continue;
					try {
						heard(JSON.parse(raw));
					} catch {
						// not a change this page reads
					}
				}
			}
		} catch {
			// the daemon went away or restarted: listen again in a moment
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}
