import { stageChange } from "../deck/stage-wire";
import { mountStage, type StageHost } from "./deck/stage-host";

/**
 * The plain play address of a deck page (spool#265), on spool's own origin: the talk on black, filling the window,
 * owning its session. Keys pressed here reach the stage as they would inside it, and a saved change to the talk is
 * taken without leaving its slide and beat. Frame code never runs in this document.
 */

export interface StageHostConfig {
	project: string;
	page: string;
	frame?: string;
	controlToken: string;
}

/** The header spool's own windows prove themselves with, as the player shell sends it. */
const CONTROL_HEADER_NAME = "x-spool-control";

/** How long the folder has to be quiet before a saved change is taken: an editor's save is often several writes. */
const QUIET_MS = 250;

export function bootStageHost(config: StageHostConfig): StageHost {
	const root = document.getElementById("root");
	if (root === null) throw new Error("spool: the stage host has no #root");
	const headers = { [CONTROL_HEADER_NAME]: config.controlToken };
	const api = `/api/p/${encodeURIComponent(config.project)}`;
	/** the talk the newest document was opened on, as the daemon said it */
	let playing = "";
	const host = mountStage(root, {
		async address() {
			const response = await fetch(`${api}/deck-stage`, {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ page: config.page }),
			});
			if (!response.ok) throw new Error((await response.text()) || "the talk could not be played");
			const answer = (await response.json()) as { address: string; size: { w: number; h: number }; talk: unknown };
			playing = JSON.stringify(answer.talk);
			return answer;
		},
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
	/** Whether the talk the daemon would play now is another than the one playing. */
	const talkChanged = async () => {
		const response = await fetch(`${api}/deck-stage?page=${encodeURIComponent(config.page)}`, { headers });
		return response.ok && JSON.stringify(await response.json()) !== playing;
	};
	let build: ReturnType<typeof setTimeout> | undefined;
	let check: ReturnType<typeof setTimeout> | undefined;
	void follow(api, headers, (change) => {
		const kind = stageChange(
			change,
			host.talk().map((slide) => slide.frame),
			config.page,
		);
		if (kind === "build") build = later(build, () => host.reload());
		else if (kind === "talk")
			check = later(check, () => void talkChanged().then((changed) => changed && host.reload()));
	});
	return host;
}

/** `run` once the folder has been quiet for a moment, however many changes came before it. */
function later(timer: ReturnType<typeof setTimeout> | undefined, run: () => void): ReturnType<typeof setTimeout> {
	clearTimeout(timer);
	return setTimeout(run, QUIET_MS);
}

/** The project's changes, each handed to `heard`, for as long as the page is open. */
async function follow(api: string, headers: Record<string, string>, heard: (change: unknown) => void): Promise<void> {
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
