import type { Size } from "../../deck/deck-file";
import { stageChange } from "../../deck/stage-wire";
import type { StageHost } from "../../runtime/deck/stage-host";
import { controlFetch } from "../api";
import { onStageChange } from "./deck-api";

/** How long the folder has to be quiet before a saved change is taken: an editor's save is often several writes. */
const QUIET_MS = 250;

/**
 * Where spool's window gets a deck page's talk for the stages it hosts (spool#265): the presenter view's two, and the
 * canvas's, played in place over a slide.
 */
export interface TalkSource {
	/** a fresh address of the talk's stage document, and the talk's size: what `mountStage` asks for */
	address(): Promise<{ address: string; size: Size }>;
	/**
	 * Takes each saved change to the talk into `hosts`, staying on the slide and beat, once the folder is quiet: a new
	 * build for a change to a slide's code, and for a change to the deck only when the talk it reads is another.
	 * Returns the stop.
	 */
	follow(hosts: () => readonly StageHost[]): () => void;
}

export function talkSource(project: string, page: string): TalkSource {
	const api = `/api/p/${encodeURIComponent(project)}`;
	/** the talk the newest document was opened on, as the daemon said it */
	let playing = "";
	return {
		async address() {
			const response = await controlFetch(`${api}/deck-stage`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ page }),
			});
			if (!response.ok) throw new Error((await response.text()) || "the talk could not be played");
			const answer = (await response.json()) as { address: string; size: Size; talk: unknown };
			playing = JSON.stringify(answer.talk);
			return answer;
		},
		follow(hosts) {
			let build: ReturnType<typeof setTimeout> | undefined;
			const reload = () => {
				for (const host of hosts()) host.reload();
			};
			const stop = onStageChange((change) => {
				const frames = (hosts()[0]?.talk() ?? []).map((slide) => slide.frame);
				const kind = stageChange(change, frames, page);
				if (kind === undefined) return;
				clearTimeout(build);
				build = setTimeout(() => {
					if (kind === "build") return reload();
					void controlFetch(`${api}/deck-stage?page=${encodeURIComponent(page)}`)
						.then(async (response) => response.ok && JSON.stringify(await response.json()) !== playing)
						.then((changed) => changed && reload());
				}, QUIET_MS);
			});
			return () => {
				stop();
				clearTimeout(build);
			};
		},
	};
}
