import { join } from "node:path";
import { expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import type { Flows } from "./flows";

/**
 * The daemon's thread budget for the link graph (#109).
 *
 * `/flows` used to be one synchronous block: on a 145-frame project it held the
 * daemon's only thread for close to seven seconds, and every cover and frame
 * document queued behind it for exactly that long. The fix is a build that hands
 * the thread back between frames, and this is the guarantee that it stays one —
 * an architecture is not a promise, a measurement is.
 *
 * What it measures is the loop's own idle gap: a `setImmediate` that reschedules
 * itself cannot run while anything else is running, so the longest gap between
 * two of its turns is the longest the daemon was unavailable. That covers
 * everything the handler does — discovery, marks and scenarios along with the
 * derivation.
 *
 * The reads under measurement are a running daemon rebuilding every frame: the
 * project is read once, then every round edits every frame's source, so each
 * measured read re-walks and re-parses all of it. That is the expensive case,
 * and the one a yield has to split. Start-up is deliberately left out — a first
 * read of a just-written temp tree measures the OS pulling two hundred new
 * directories into its cache and V8 warming the parser, neither of which any
 * yield can divide.
 *
 * Two readings, because they fail differently. The turn count is exact: one turn
 * per frame is the yield itself, and no machine load can take a turn away. The
 * millisecond figure is wall clock, and the suite runs test files in parallel, so
 * a saturated machine stretches gaps that the handler did not cause — contention
 * can only inflate a gap, never shrink one, so the smallest reading across the
 * rounds is the closest measure of what the handler itself holds.
 *
 * Sized so the derivation dominates: without the yield each rebuild is one block
 * of about 85 ms, and with it the longest turn is a few — so the test really
 * does fail when the yield goes, rather than passing on headroom.
 */

const FRAMES = 200;
const ROUNDS = 5;
const BUDGET_MS = 10;

interface ThreadReading {
	/** The longest the loop went without a turn, in milliseconds. */
	longest: number;
	/** How many turns it got — one per frame is the yield, in a form no
	 * loaded machine can distort. */
	turns: number;
}

function watchThread(): () => ThreadReading {
	let longest = 0;
	let turns = 0;
	let last = performance.now();
	let watching = true;
	const tick = (): void => {
		const now = performance.now();
		longest = Math.max(longest, now - last);
		last = now;
		turns++;
		if (watching) setImmediate(tick);
	};
	setImmediate(tick);
	return () => {
		watching = false;
		// the gap since the watcher's last turn counts: a handler that yields
		// nothing at all never lets the watcher run twice, and would otherwise
		// measure as having held the thread for no time whatsoever
		return { longest: Math.max(longest, performance.now() - last), turns };
	};
}

/** One turn of the loop, so the watcher's clock starts at a real boundary. */
function loopTurn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/** One frame's row, walking `step` frames along — the file each round rewrites. */
const rowTsx = (at: number, step: number) =>
	`export function Row() {\n\treturn <li data-go="frame-${(at + step) % FRAMES}">row</li>;\n}\n`;

it("never holds the daemon's thread for a hundredth of a second", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	// one shared component in every frame's graph, so every frame's walk reaches
	// out of its own folder the way a real canvas does
	writeDesignFile(
		root,
		"shared/ui/chrome.tsx",
		`export function Chrome({ label }: { label: string }) {\n\treturn (\n\t\t<nav>\n\t\t\t<a data-go="frame-0">{label}</a>\n\t\t</nav>\n\t);\n}\n`,
	);
	for (let at = 0; at < FRAMES; at++) {
		writeFrame(
			root,
			`frame-${at}`,
			`import { Chrome } from "../../shared/ui/chrome";
import { Row } from "./parts/row";
export default function Frame() {
	return (
		<main>
			<Chrome label="home" />
			<Row />
			<a data-go="frame-${(at + 1) % FRAMES}">next</a>
		</main>
	);
}
`,
		);
		writeDesignFile(root, `frames/frame-${at}/parts/row.tsx`, rowTsx(at, 2));
	}
	const app = makeApp(spoolDir);
	expect((await app.request(`/api/p/${name}/flows`)).status).toBe(200);

	let held = Number.POSITIVE_INFINITY;
	let turns = Number.POSITIVE_INFINITY;
	let res = new Response();
	for (let round = 0; round < ROUNDS; round++) {
		// every frame's source moves, so the read that follows rebuilds all of them
		const step = 3 + round;
		for (let at = 0; at < FRAMES; at++) writeDesignFile(root, `frames/frame-${at}/parts/row.tsx`, rowTsx(at, step));
		const stop = watchThread();
		await loopTurn();
		res = await app.request(`/api/p/${name}/flows`);
		const reading = stop();
		held = Math.min(held, reading.longest);
		turns = Math.min(turns, reading.turns);
	}

	// the build really did the work — a handler answering a stale graph, or none,
	// holds nothing either and would pass this on its own
	const flows = (await res.json()) as Flows;
	expect(flows.frames).toHaveLength(FRAMES);
	// three links each, less the two frames whose own next or row already points
	// at the frame the shared nav goes to — one arrow holds every site claiming it
	expect(flows.edges).toHaveLength(FRAMES * 3 - 2);
	// the last round's rows walk seven along: the graph is the edit, not the cache
	expect(flows.edges.filter((edge) => edge.from === "frame-1").map((edge) => edge.to)).toEqual([
		"frame-0",
		"frame-2",
		"frame-8",
	]);
	// the thread came back once per frame, every round — the guarantee itself,
	// which no amount of machine load can inflate away
	expect(turns).toBeGreaterThanOrEqual(FRAMES);
	expect(held).toBeLessThan(BUDGET_MS);
});
