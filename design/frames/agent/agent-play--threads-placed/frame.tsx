import { useState } from "react";
import { type Life, LIVE_ASK, type Thread, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ElsewhereDock } from "./dock";
import { PageCanvas } from "./page-canvas";

/**
 * agent-play--threads-placed — no switcher, because a conversation has a place.
 *
 * The rail here is agent-play's rail exactly: tabs, log, composer, nothing added.
 * A thread was started from a page and it belongs to that page, so you reach it
 * the way you reach anything else in spool, by walking there. Click `takes` in the
 * dock and the canvas is the takes canvas, the pages rail moves its spine, and the
 * rail is holding that conversation. Walk back and the live turn is still running
 * where you left it.
 *
 * The bet. Spool is a spatial tool and this adds no navigation to it. There is no
 * list to maintain, no tab to lose, no width to run out of, and the answer to
 * "which frames is this thread talking about" is that they are the ones in front
 * of you. It also scales past every other answer here: forty threads is forty
 * pages, and a pages rail already knows how to hold forty pages.
 *
 * What surfaces instead, in two places and both of them outside the agent rail.
 * The pages rail carries a mark per page, turning while a conversation there is
 * working and a solid dot once one has finished unread, sitting where that row's
 * frame count already sits. The canvas carries the dock, built out of the tool bar
 * and mirrored to the other side of the same line: one row per page that is doing
 * something, its mark, and the line its thread is on. Hover a row and its page
 * lights in the rail, the same pairing a selection chip makes with its outline.
 *
 * The risk, and it is real. An unread thread is a five pixel dot on a page row you
 * are not looking at, on the far side of the window from the rail you are reading.
 * Nothing brings it to you, and the moment you do walk over it goes quiet, so the
 * only record that anything finished is the frame it changed.
 *
 * The break, and it is on screen. `site` has two threads on it, one unread and one
 * an hour old. A page reaches one rail, so walking to `site` gets you the newer
 * one and the older one is not reachable from anywhere in this design. That is the
 * exact case the other two frames pay their room and their extra click for.
 */

interface Page {
	readonly name: string;
	readonly frames: readonly string[];
}

const PAGES: readonly Page[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const working = (thread: Thread): boolean => thread.life === "running" || thread.life === "streaming";

export default function AgentThreadsPlacedFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed), turn);
	const [here, setHere] = useState("app");
	const [lit, setLit] = useState<string | null>(null);
	const threads: readonly Thread[] = deck.threads;

	/**
	 * Walking to a page opens the newest conversation on it, and opening it is what
	 * reads it. A page with a second, older thread on it leaves that one where it
	 * was, because there is nothing in this design that could reach it.
	 */
	const go = (page: string) => {
		setHere(page);
		setLit(null);
		const first = threads.find((thread) => thread.page === page);
		if (first !== undefined) deck.setOpen(first.id);
	};

	const pages: readonly PageRow[] = PAGES.map((page) => {
		const mine = threads.filter((thread) => thread.page === page.name);
		// the page you are standing on says its state in the rail already
		const loudest: Life | undefined =
			page.name === here
				? undefined
				: mine.some(working)
					? "running"
					: mine.some((thread) => thread.life === "unread")
						? "unread"
						: undefined;
		return {
			name: page.name,
			frames: page.frames,
			active: page.name === here,
			open: page.name === here,
			...(loudest === undefined ? {} : { mark: loudest }),
			...(lit === page.name ? { lit: true } : {}),
		};
	});

	const away = threads.filter(
		(thread) => thread.page !== here && (working(thread) || thread.life === "unread"),
	);
	const frames = PAGES.find((page) => page.name === here)?.frames ?? [];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={deck.open.entries}
						phase={deck.phase}
						run={deck.run}
						onSend={ready ? deck.send : () => {}}
						onReplay={deck.replay}
					/>
				}
			>
				{here === "app" ? <PlayField /> : <PageCanvas frames={frames} />}
				<ElsewhereDock threads={away} lit={lit} onLight={setLit} onGo={go} />
			</CanvasChrome>
		</SpoolShell>
	);
}
