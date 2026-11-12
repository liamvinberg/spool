// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { openSession, type StageSession, type TalkSlide } from "../../deck/stage-session";
import type { HostMessage, SlideReadiness, StageMessage } from "../../deck/stage-wire";
import { mountStage, type StageHost, type StageHostEvents } from "./stage-host";

/**
 * The stage's host (spool#265) taking new builds of a talk, with its stage documents stood in for: each connects over
 * its private port as a real one does, and says what the case has it say. What a browser alone shows (pictures,
 * dissolves) is the stage's browser suite's; this is which document the room sees, and what the host is told.
 */

const TALK: TalkSlide[] = [
	{ frame: "talk/title", beats: 1, live: false },
	{ frame: "talk/words", beats: 1, live: false },
];

interface FakeDocument {
	readonly frame: HTMLIFrameElement;
	/** what the host said to it */
	readonly heard: HostMessage[];
	say(message: StageMessage): Promise<void>;
}

const hosts: StageHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.destroy();
	document.body.replaceChildren();
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A following room's stage, and its documents as they open, one per build. */
async function room(on: StageHostEvents = {}) {
	const container = document.createElement("div");
	document.body.append(container);
	let builds = 0;
	const host = mountStage(container, {
		address: async () => ({ address: `about:blank#build-${++builds}`, size: { w: 1280, h: 720 } }),
		mode: "follow",
		room: true,
		on,
	});
	hosts.push(host);
	const frames = () => [...container.querySelectorAll("iframe")];
	/** the newest build's document, connected */
	const opened = async (): Promise<FakeDocument> => {
		await vi.waitFor(() => expect(frames()).toHaveLength(builds));
		const frame = frames().at(-1) as HTMLIFrameElement;
		const channel = new MessageChannel();
		const heard: HostMessage[] = [];
		channel.port1.onmessage = (event) => heard.push(event.data as HostMessage);
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool: "stage-connect" },
				source: frame.contentWindow,
				ports: [channel.port2],
			}),
		);
		await settled();
		const document_: FakeDocument = {
			frame,
			heard,
			async say(message) {
				channel.port1.postMessage(message);
				await settled();
			},
		};
		await document_.say({ spool: "stage-talk", slides: TALK });
		return document_;
	};
	return { host, container, opened };
}

const shown = (slide: number, held: boolean, take = 0): StageMessage => ({
	spool: "stage-shown",
	shown: { at: { slide, beat: 0 }, frame: TALK[slide]?.frame ?? "", take, ready: true, held, frames: 1, waited: 0 },
});

/** What the room sees of a document: on the screen, kept over it, or gone. */
const seen = (doc: FakeDocument) =>
	!doc.frame.isConnected
		? "gone"
		: doc.frame.style.opacity !== "1"
			? "readying"
			: doc.frame.style.zIndex === "1"
				? "kept"
				: "on";

const at = (slide: number, revision: number, more: Partial<StageSession> = {}): StageSession => ({
	...openSession(TALK, { slide, beat: 0 }, {}),
	revision,
	...more,
});

it("keeps the last picture the room saw through every build that cannot show its slide, and blacks the room over it", async () => {
	const { host, container, opened } = await room();
	host.apply(at(1, 1));
	const first = await opened();
	await first.say(shown(1, false));
	expect(seen(first)).toBe("on");

	// a save that breaks the slide on screen: the new build takes the talk, the room keeps the old picture
	host.reload();
	const broken = await opened();
	await broken.say(shown(1, true));
	expect([seen(first), seen(broken)]).toEqual(["kept", "on"]);
	// and a second such save keeps the same picture, never the blank build between
	host.reload();
	const again = await opened();
	await again.say(shown(1, true));
	expect([seen(first), seen(broken), seen(again)]).toEqual(["kept", "gone", "on"]);

	// black is drawn over the kept picture, and lets it be seen again once it is let go
	const black = container.querySelector<HTMLElement>("[data-spool-stage-black]");
	host.apply(at(1, 2, { black: true }));
	expect(black?.style.display).toBe("block");
	expect(Number(black?.style.zIndex)).toBeGreaterThan(Number(first.frame.style.zIndex));
	host.apply(at(1, 3));
	expect(black?.style.display).toBe("none");

	// the talk moves to a slide the playing build shows: the kept picture goes
	host.apply(at(0, 4));
	await again.say(shown(0, false));
	expect([seen(first), seen(again)]).toEqual(["gone", "on"]);
});

it("takes a new build that readied while a slide wrote ui.state once it shows the newest, and names its slides as it said them", async () => {
	let slides: readonly SlideReadiness[] = [];
	const { host, opened } = await room({ slides: (now) => (slides = now) });
	host.apply(at(1, 1));
	const first = await opened();
	const ready: SlideReadiness[] = TALK.map(({ frame }) => ({ frame, status: "ready" }));
	await first.say({ spool: "stage-slides", slides: ready });
	await first.say(shown(1, false));

	host.reload();
	const next = await opened();
	const report: SlideReadiness[] = [
		{ ...(ready[0] as SlideReadiness), webgl: 5 },
		{ frame: "talk/words", status: "broken", why: "boom", when: "compile" },
	];
	await next.say({ spool: "stage-slides", slides: report });
	expect(slides).toEqual(ready);

	// what a slide wrote while the build readied moved nothing: the new build is handed it, and says when it shows it
	host.apply(at(1, 2, { state: { count: 1 } }));
	await next.say(shown(1, false));
	expect(next.heard.at(-1)).toMatchObject({ spool: "stage-apply", session: { revision: 2, state: { count: 1 } } });
	expect([seen(first), seen(next)]).toEqual(["on", "readying"]);
	await next.say({ spool: "stage-applied", revision: 2 });
	expect([seen(first), seen(next)]).toEqual(["gone", "on"]);
	expect(slides).toEqual(report);
});
