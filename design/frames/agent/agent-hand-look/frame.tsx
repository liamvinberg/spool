import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { ARRIVE_NAMES, ARRIVE_NEEDS, ARRIVE_NOTE, type ArriveName, Arrival, type Landing } from "./arrive";
import { type BlockId, LANDS, layout, REFLOWS } from "./page";
import {
	GUTTER,
	type Hand,
	HOLD_NAMES,
	HOLD_NOTE,
	type HoldName,
	LANE_NAMES,
	LANE_NEEDS,
	LANE_NOTE,
	type LaneName,
	type Mark,
	type Posture,
	Side,
} from "./side";

/**
 * agent-hand-look — `agent-hand--loud-flat` taken apart, so the parts can be chosen
 * separately and put back together.
 *
 * Every `agent-hand--*` frame draws one whole answer, which is right for arguing and
 * wrong for choosing: comparing two of them means playing one, remembering it, and
 * playing the other, and every one of them moves four things at once. This sheet runs
 * twenty cells off one clock, and each row varies exactly one channel while the other
 * two are held at `--loud-flat`'s own compile.
 *
 *   the lane      what a landed write leaves on the wall
 *   the hold      what the thread does while a call is open
 *   the arrival   what the change does inside the rectangle
 *
 * So a favourite in one row and a favourite in another compose without being redrawn.
 * The node and the `shot` corners are in every cell unchanged, because nothing in the
 * family disputes them.
 *
 * **The clock is the capture's, transcribed.** `claude-edits.json` runs twelve calls over
 * 37.7 seconds and lands thirteen design writes in `frames/home/frame.tsx`, in runs of
 * six, four and three. The starts and ends below are that recording's own, written as
 * numbers so a sheet with twenty live cells does not fetch and project a fixture twenty
 * times. The fourteenth write is the `frame.json` the turn opens with and it deliberately
 * lands no revision: geometry moves the rectangle and leaves the design alone.
 *
 * **Everything is computed from the clock rather than animated by cues, so the sheet
 * scrubs.** Drag the slider and every fade, every mark's age and the thread's tension are
 * functions of `ms`, which is what lets a moment be held still and compared. The four
 * arrivals that decorate a block are the exception: they mount keyed on the write, which
 * is what an entrance is.
 *
 * It loops on purpose. Every frame above bans idle animation because a canvas with a
 * spinner on one frame is a canvas with an alarm on it. A sheet is not a canvas.
 */

/** every call the turn makes, at the capture's own replay clock in ms */
const CALLS: readonly { readonly verb: string; readonly from: number; readonly to: number }[] = [
	{ verb: "write", from: 117, to: 427 },
	{ verb: "shot", from: 1168, to: 1855 },
	{ verb: "look", from: 3012, to: 3293 },
	{ verb: "edit", from: 7153, to: 12759 },
	{ verb: "logs", from: 15172, to: 16410 },
	{ verb: "look", from: 17342, to: 17646 },
	{ verb: "edit", from: 20868, to: 24896 },
	{ verb: "shot", from: 25891, to: 26643 },
	{ verb: "look", from: 27638, to: 27824 },
	{ verb: "edit", from: 30341, to: 33731 },
	{ verb: "shot", from: 35825, to: 36494 },
	{ verb: "look", from: 37482, to: 37700 },
];

/** when each of the thirteen design writes lands, in runs of six, four and three */
const WRITE_AT: readonly number[] = [
	7430, 8760, 9330, 9920, 10720, 11990, 21180, 22440, 23220, 24200, 30620, 31650, 32840,
];

const TOTAL = 37700;
/** a beat of stillness at the end so the loop reads as an ending rather than a stutter */
const REST = 900;
/** how long a mark lives on the wall, which is `side.tsx`'s own number */
const LIFE = 6;

/** three postures absorb five verbs, which is the one thing every frame in this family agrees on */
const POSTURE: Record<string, Posture> = {
	write: "part",
	edit: "part",
	look: "whole",
	logs: "whole",
	read: "whole",
	shot: "shot",
};

function handAt(ms: number): Hand | null {
	const first = CALLS[0];
	if (first === undefined || ms < first.from) return null;
	let open: (typeof CALLS)[number] | null = null;
	let last: (typeof CALLS)[number] | null = null;
	for (const call of CALLS) {
		if (call.from <= ms) last = call;
		if (call.from <= ms && ms <= call.to) open = call;
	}
	const on = open ?? last;
	if (on === null) return null;
	const count = open !== null && open.verb === "edit" ? WRITE_AT.filter((at) => at > open.from && at <= ms).length : 0;
	const lastWrite = WRITE_AT.filter((at) => at <= ms).at(-1) ?? Number.NEGATIVE_INFINITY;
	return {
		verb: on.verb,
		open: open !== null,
		posture: POSTURE[on.verb] ?? "whole",
		count,
		since: (ms - lastWrite) / 1000,
		sinceEdge: (ms - (open !== null ? open.from : on.to)) / 1000,
	};
}

function revAt(ms: number): number {
	return WRITE_AT.filter((at) => at <= ms).length;
}

/**
 * The writes still on the wall, one per block, each carrying the box the block had at
 * the revision its own write made. A block written twice carries one mark that restarts
 * rather than two stacked: the wall says *here, again, just now*, and how many times is
 * the rail's business.
 */
function marksAt(ms: number): readonly Mark[] {
	const latest = new Map<BlockId, { readonly nth: number; readonly at: number }>();
	for (const [i, at] of WRITE_AT.entries()) {
		if (at > ms) continue;
		const block = LANDS[i];
		if (block === undefined) continue;
		latest.set(block, { nth: i + 1, at });
	}
	const out: Mark[] = [];
	for (const [block, hit] of latest) {
		const age = (ms - hit.at) / 1000;
		if (age >= LIFE) continue;
		out.push({ key: `${block}:${hit.nth}`, box: layout(hit.nth)[block], age, nth: hit.nth });
	}
	return out;
}

function landingAt(ms: number): Landing | null {
	let n = 0;
	for (const [i, at] of WRITE_AT.entries()) if (at <= ms) n = i + 1;
	if (n === 0) return null;
	const at = WRITE_AT[n - 1] ?? 0;
	return { n, block: LANDS[n - 1] ?? "head", age: (ms - at) / 1000 };
}

const FW = 152;
const FH = 329;
/** every frame on this canvas is authored 240x520 and drawn at 39%, which is where 152x329 comes from */
const NAT_W = 240;
const NAT_H = 520;
const S = FW / NAT_W;

/** what the two channels not under test are held at: `--loud-flat`'s own compile */
const BASE_LANE: LaneName = "mark";
const BASE_HOLD: HoldName = "taut";
const BASE_ARRIVE: ArriveName = "ghost";

export default function AgentHandLookFrame() {
	const [ms, setMs] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [slow, setSlow] = useState(false);
	const raf = useRef(0);
	const at = useRef(0);

	useEffect(() => {
		if (!playing) return;
		let prev = 0;
		const step = (now: number) => {
			if (prev !== 0) {
				at.current += (now - prev) * (slow ? 0.4 : 1);
				if (at.current > TOTAL + REST) at.current = 0;
				setMs(Math.min(at.current, TOTAL));
			}
			prev = now;
			raf.current = requestAnimationFrame(step);
		};
		raf.current = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf.current);
	}, [playing, slow]);

	const hand = handAt(ms);
	const rev = revAt(ms);
	const marks = marksAt(ms);
	const landing = landingAt(ms);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-canvas px-12 pt-9 pb-9 text-text">
			<header className="flex shrink-0 items-end justify-between">
				<div>
					<h1 className="font-medium text-lg leading-6">The agent's hand on a frame, in three parts</h1>
					<p className="mt-1 max-w-[680px] text-base text-muted leading-base">
						One clock. Each row varies one channel and holds the other two at the compile, so a favourite in one row
						and a favourite in another can be put together without redrawing either.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Readout ms={ms} rev={rev} hand={hand} />
					<button
						type="button"
						onClick={() => setSlow((v) => !v)}
						className={cn(
							"cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-xs leading-xs",
							slow ? "border-border-raised bg-raised text-text" : "border-border text-muted",
						)}
					>
						0.4×
					</button>
					<button
						type="button"
						onClick={() => setPlaying((v) => !v)}
						className="cursor-pointer rounded-md border border-border-raised bg-raised px-2.5 py-1.5 font-mono text-text text-xs leading-xs"
					>
						{playing ? "pause" : "play"}
					</button>
				</div>
			</header>

			<input
				type="range"
				min={0}
				max={TOTAL}
				value={ms}
				aria-label="time"
				onChange={(event) => {
					const next = Number(event.target.value);
					at.current = next;
					setMs(next);
					setPlaying(false);
				}}
				className="mt-4 w-full shrink-0 accent-thread"
			/>

			<Section title="the lane" note="what a landed write leaves on the wall">
				{LANE_NAMES.map((name) => (
					<Cell
						key={name}
						label={name}
						note={LANE_NOTE[name]}
						needs={LANE_NEEDS[name]}
						lane={name}
						hold={BASE_HOLD}
						arrive={BASE_ARRIVE}
						hand={hand}
						marks={marks}
						rev={rev}
						landing={landing}
					/>
				))}
			</Section>

			<Section title="the hold" note="what the thread does while a call is open">
				{HOLD_NAMES.map((name) => (
					<Cell
						key={name}
						label={name}
						note={HOLD_NOTE[name]}
						needs=""
						lane={BASE_LANE}
						hold={name}
						arrive={BASE_ARRIVE}
						hand={hand}
						marks={marks}
						rev={rev}
						landing={landing}
					/>
				))}
			</Section>

			<Section title="the arrival" note="what the change does inside the rectangle">
				{ARRIVE_NAMES.map((name) => (
					<Cell
						key={name}
						label={name}
						note={ARRIVE_NOTE[name]}
						needs={ARRIVE_NEEDS[name]}
						lane={BASE_LANE}
						hold={BASE_HOLD}
						arrive={name}
						hand={hand}
						marks={marks}
						rev={rev}
						landing={landing}
					/>
				))}
			</Section>
		</div>
	);
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
	return (
		<section className="mt-6 flex shrink-0 flex-col">
			<div className="flex items-baseline gap-2.5">
				<h2 className="font-medium text-base leading-base">{title}</h2>
				<span className="font-mono text-muted text-xs leading-xs">{note}</span>
			</div>
			<div className="mt-2.5 flex gap-x-5">{children}</div>
		</section>
	);
}

function Cell({
	label,
	note,
	needs,
	lane,
	hold,
	arrive,
	hand,
	marks,
	rev,
	landing,
}: {
	label: string;
	note: string;
	needs: string;
	lane: LaneName;
	hold: HoldName;
	arrive: ArriveName;
	hand: Hand | null;
	marks: readonly Mark[];
	rev: number;
	landing: Landing | null;
}) {
	return (
		<figure className="flex flex-col" style={{ width: GUTTER + FW }}>
			{/* fixed, so a two-line note in one cell does not push its frame below its neighbour's */}
			<figcaption className="h-[56px] pl-11">
				<span className="block font-mono text-text text-xs leading-xs">{label}</span>
				<span className="mt-0.5 block font-mono text-[10px] text-muted leading-3">{note}</span>
				{needs === "" ? null : (
					<span className="mt-0.5 block font-mono text-[10px] text-muted leading-3 opacity-60">needs {needs}</span>
				)}
			</figcaption>
			<div className="relative mt-2" style={{ width: GUTTER + FW, height: FH }}>
				<div className="absolute top-0 overflow-hidden rounded-lg" style={{ left: GUTTER, width: FW, height: FH }}>
					<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
						<Arrival name={arrive} rev={rev} landing={landing} />
					</div>
				</div>
				<Side lane={lane} hold={hold} hand={hand} marks={marks} />
			</div>
		</figure>
	);
}

/** the wire's own state, so a cell that looks wrong can be checked against what the turn was doing */
function Readout({ ms, rev, hand }: { ms: number; rev: number; hand: Hand | null }) {
	const write = rev === 0 ? "no writes" : `write ${rev}/13`;
	const reflow = REFLOWS.has(rev) ? " · reflow" : "";
	return (
		<span className="font-mono text-muted text-xs leading-xs">
			{(ms / 1000).toFixed(1)}s · {hand === null ? "idle" : hand.open ? hand.verb : `${hand.verb} done`} · {write}
			{reflow}
		</span>
	);
}
