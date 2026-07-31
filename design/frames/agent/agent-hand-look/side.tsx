import type { Box } from "./page";

/**
 * `agent-hand--loud-flat`'s assembly on the wall, taken apart into channels that can be
 * chosen one at a time and put back together.
 *
 * That frame's compile is five objects: a **node** welded to the wall, a **thread**
 * whose length is the kind of hold and whose tension is whether a call is open, a
 * **lane** of one mark per landed write at the height of the block it changed,
 * **corners** for the `shot` posture, and the verb on the frame's name row. Judging it
 * meant judging all five at once, which is why every argument about it turned into an
 * argument about the stand-off.
 *
 * Here the node and the corners are constant in every cell, because nothing in the
 * family disputes them, and the two that carry the reading are separate inputs:
 *
 *   the lane   what a landed write leaves on the wall
 *   the hold   what the thread does while a call is open
 *
 * So a favourite lane and a favourite hold are picked in two different rows and the
 * merge is `<Side lane="bead" hold="pay" />`. Every number below is `flat.tsx`'s own.
 */

export type LaneName = "none" | "mark" | "tick" | "bead" | "braid" | "wind";
export type HoldName = "none" | "taut" | "pay" | "coil" | "spin" | "wisp";

export const LANE_NAMES: readonly LaneName[] = ["none", "mark", "tick", "bead", "braid", "wind"];
export const HOLD_NAMES: readonly HoldName[] = ["none", "taut", "pay", "coil", "spin", "wisp"];

export const LANE_NOTE: Record<LaneName, string> = {
	none: "the wall says nothing",
	mark: "--loud-flat's own: the block's height",
	tick: "a fixed notch, height means nothing",
	bead: "paid down the thread to where it landed",
	braid: "the thread itself kinks there",
	wind: "a coil that gains a turn per write",
};

export const HOLD_NOTE: Record<HoldName, string> = {
	none: "the node alone",
	taut: "--loud-flat's own: taut open, slack shut",
	pay: "length is how much of the run has landed",
	coil: "a coil the hold pays out of",
	spin: "the coil turns only in a call",
	wisp: "the rail's own mark, outdoors",
};

/** what each lane needs from the runtime, said out loud on the sheet */
export const LANE_NEEDS: Record<LaneName, string> = {
	none: "nothing",
	mark: "the block's box",
	tick: "the block's y",
	bead: "the block's y",
	braid: "the block's y",
	wind: "nothing",
};

export type Posture = "whole" | "part" | "shot";

export interface Hand {
	readonly verb: string;
	readonly open: boolean;
	readonly posture: Posture;
	/** writes landed so far in the run that is open, 0 when the open call is not a run */
	readonly count: number;
	/** seconds since the last write landed anywhere */
	readonly since: number;
	/** seconds since the call opened, or since the last one closed */
	readonly sinceEdge: number;
}

/** one landed write, still on the wall */
export interface Mark {
	readonly key: string;
	/** the block's box at the revision the write made, so a mark is level with its own page */
	readonly box: Box;
	readonly age: number;
	readonly nth: number;
}

/* ---------- the field's geometry, at the size this sheet draws a frame ---------- */

const FH = 329;
const FW = 152;
const MID = FH / 2;
/** the gutter the family measured between two frames on a real canvas */
export const GUTTER = 44;
/** every frame is authored 240 wide and drawn at 39%, which is where 152 comes from */
const NAT_W = 240;
const S = FW / NAT_W;

/** the frame's left wall, inside a cell that is gutter-then-frame */
const WALL = GUTTER;
/**
 * How far outside the wall the presence's centre line sits. `--presence` stands at 6,
 * `--accrue` at 12, the compile at 15, `--loud-flat` at 12 — the widest claim is a slack
 * thread at centre ± 5 against the lane's 5 nearest the frame, plus two pixels of air.
 */
const OUT = 12;
const LINE = WALL - OUT;

const NODE = 9;
const THREAD = 2;
const PART = 76;

const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;

/** how far a slack thread lies off the straight, and how long one lie of it runs */
const SLACK = 4;
const WAVE = 46;
/** one write, drawn as a pluck on a line that is already taut */
const PLUCK = 1.6;
/** tension arrives on the instant and slack comes back slowly, which is what a thread does */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK_OP = 0.78;

/**
 * How long a write stays on the wall. `--accrue` measured the window at 1.3s wide: a
 * mark must outlive the run that made it (longest 4.84s) and two runs must stay apart
 * (shortest gap 6.14s). Six sits near the top of that.
 */
const LIFE = 6;
const IN = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/** how far past the arc each `shot` corner arm runs, and the frame's own radius */
const ARM = 11;
const RADIUS = 12;

const INK = "var(--color-text)";

/* ---------- shared curves ---------- */

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** the mark's envelope: in fast, hold at full, then linear out, because a run's order must stay legible */
function fade(age: number): number {
	if (age < 0) return 0;
	if (age < IN) return PEAK * (age / IN);
	if (age < HELD) return PEAK;
	if (age >= LIFE) return 0;
	return PEAK * (1 - (age - HELD) / (LIFE - HELD));
}

/** width carries the age a second time, so a stale mark reads as residue rather than as faint ink */
function markWidth(age: number): number {
	const t = clamp01((age - HELD) / (LIFE - HELD));
	return MARK_W + (MARK_THIN - MARK_W) * t;
}

/**
 * One thread wound round itself, as a path. Rings read as a target and a dashed ring
 * reads as a selection; a spiral is the only one of the three that says *there is more
 * of this than you can see*, which is what a coil on a wall is for.
 */
function coil(cx: number, cy: number, from: number, to: number, turns: number): string {
	const steps = Math.max(8, Math.round(turns * 24));
	const points: string[] = [];
	for (let i = 0; i <= steps; i += 1) {
		const f = i / steps;
		const angle = f * turns * Math.PI * 2;
		const r = from + (to - from) * f;
		points.push(`${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

/**
 * The wall run, sampled: one line through the node, `length` tall, displaced sideways by
 * a sine with a node at the node — so the thread passes through its own core at every
 * amplitude and only the lie of it changes.
 */
function wall(length: number, amp: number): string {
	if (length < 1) return "";
	const half = length / 2;
	const steps = Math.max(2, Math.round(length / 4));
	const points: string[] = [];
	for (let step = 0; step <= steps; step += 1) {
		const y = -half + (length * step) / steps;
		const x = LINE - amp * Math.sin((2 * Math.PI * y) / WAVE);
		points.push(`${x.toFixed(2)} ${(MID + y).toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

function holdLength(hand: Hand): number {
	if (hand.posture === "shot") return 0;
	return hand.posture === "whole" ? FH : PART;
}

/**
 * The thread's amplitude, computed from the clock rather than animated, so the sheet
 * scrubs. Taut arrives over 90ms, slack returns over 320ms, and a write plucks a line
 * that is already taut instead of changing its length.
 */
function amplitude(hand: Hand): number {
	const k = clamp01(hand.sinceEdge / (hand.open ? TAUT_MS : SLACK_MS));
	const base = hand.open ? SLACK * (1 - k) : SLACK * k;
	const pluck = hand.open && hand.since < 0.24 ? PLUCK * (1 - hand.since / 0.24) : 0;
	return base + pluck;
}

/* ---------- the layer ---------- */

export function Side({
	lane,
	hold,
	hand,
	marks,
}: {
	lane: LaneName;
	hold: HoldName;
	hand: Hand | null;
	marks: readonly Mark[];
}) {
	if (hand === null) return null;
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
			fill="none"
			aria-hidden="true"
		>
			<Hold name={hold} hand={hand} />
			<Lane name={lane} hand={hand} marks={marks} />
			<Corners on={hand.posture === "shot"} />
			<Node />
		</svg>
	);
}

/**
 * The participant, and the one thing here that never changes, because being at this
 * frame is not a state that has degrees. Drawn last so nothing crosses it, and filled
 * with the canvas so the thread reads as running behind rather than through.
 */
function Node() {
	return (
		<rect
			x={LINE - NODE / 2}
			y={MID - NODE / 2}
			width={NODE}
			height={NODE}
			rx={2}
			fill="var(--color-canvas)"
			stroke="var(--color-muted)"
			strokeWidth={1}
		/>
	);
}

function Hold({ name, hand }: { name: HoldName; hand: Hand }) {
	if (name === "none") return null;
	const length = holdLength(hand);
	if (name === "wisp") return <Wisp hand={hand} />;
	if (name === "pay") {
		// length is how much of the run has landed, so an empty run is an empty wall and
		// the thread is a count with no digit on it
		const grown = hand.open && hand.posture === "part" ? clamp01(hand.count / 6) : 1;
		return <Run d={wall(length * grown, amplitude(hand))} />;
	}
	if (name === "coil" || name === "spin") {
		const turn = name === "spin" && hand.open ? hand.sinceEdge * 240 : 0;
		return (
			<>
				<Run d={wall(length, amplitude(hand))} />
				<g transform={`rotate(${turn.toFixed(1)} ${LINE} ${MID})`}>
					<path
						d={coil(LINE, MID, 2.5, 8.5, 2.25)}
						stroke={INK}
						strokeOpacity={hand.open ? INK_OP : 0.4}
						strokeWidth={1.4}
						strokeLinecap="round"
					/>
				</g>
			</>
		);
	}
	return <Run d={wall(length, amplitude(hand))} />;
}

function Run({ d }: { d: string }) {
	if (d === "") return null;
	return <path d={d} stroke={INK} strokeOpacity={INK_OP} strokeWidth={THREAD} strokeLinecap="round" />;
}

/**
 * `spool-wisp-marks.tsx`'s reel, standing on a wall instead of sitting in a 16px column.
 * Three runs of thread at the constants that file already argued, scaled to a gutter.
 */
function Wisp({ hand }: { hand: Hand }) {
	const runs = [22, 15, 19];
	const tops = [-14, 0, 14];
	const on = hand.open;
	return (
		<>
			{runs.map((run, i) => (
				<rect
					key={run}
					x={LINE - (on ? run : run * 0.55)}
					y={MID + (tops[i] ?? 0)}
					width={on ? run : run * 0.55}
					height={1.5}
					rx={0.75}
					fill={INK}
					fillOpacity={on ? INK_OP : 0.4}
				/>
			))}
		</>
	);
}

function Lane({ name, hand, marks }: { name: LaneName; hand: Hand; marks: readonly Mark[] }) {
	if (name === "none") return null;
	if (name === "wind") {
		// the only lane that needs nothing located: it counts rather than points, so it is
		// the one that still works below the 400px the canvas needs to mount a document
		const live = marks.filter((mark) => mark.age < LIFE).length;
		if (live === 0) return null;
		const turns = 0.75 + live * 0.55;
		return (
			<path
				d={coil(LINE, MID, 2.5, Math.min(11, 2.5 + turns * 2.1), turns)}
				stroke={INK}
				strokeOpacity={hand.open ? INK_OP : 0.55}
				strokeWidth={1.4}
				strokeLinecap="round"
			/>
		);
	}
	return (
		<>
			{marks.map((mark) => {
				const opacity = fade(mark.age);
				if (opacity <= 0) return null;
				const mid = (mark.box.y + mark.box.h / 2) * S;
				if (name === "mark") {
					const width = markWidth(mark.age);
					return (
						<rect
							key={mark.key}
							x={WALL - MARK_IN - width}
							y={mark.box.y * S}
							width={width}
							height={Math.max(4, mark.box.h * S)}
							rx={1}
							fill={INK}
							fillOpacity={opacity}
						/>
					);
				}
				if (name === "tick") {
					return (
						<rect
							key={mark.key}
							x={WALL - MARK_IN - 8}
							y={mid - 0.75}
							width={8}
							height={1.5}
							rx={0.75}
							fill={INK}
							fillOpacity={opacity}
						/>
					);
				}
				if (name === "bead") {
					// paid out of the node and down the thread to the height it landed at, which is
					// the one lane where the thread and the write are the same object in motion
					const k = clamp01(mark.age / 0.22);
					const eased = 1 - (1 - k) * (1 - k);
					const y = MID + (mid - MID) * eased;
					return (
						<rect
							key={mark.key}
							x={LINE - 2.5}
							y={y - 2.5}
							width={5}
							height={5}
							rx={1}
							fill={INK}
							fillOpacity={opacity}
						/>
					);
				}
				return (
					<path
						key={mark.key}
						d={`M ${LINE} ${mid - 7} Q ${LINE - 5.5} ${mid} ${LINE} ${mid + 7}`}
						stroke={INK}
						strokeOpacity={opacity}
						strokeWidth={1.6}
						strokeLinecap="round"
					/>
				);
			})}
		</>
	);
}

/**
 * The `shot` posture: four corners, each from one arm around the arc to the other.
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — so it is corners, and a
 * corner is not a ring at any weight because it is not closed.
 */
function Corners({ on }: { on: boolean }) {
	if (!on) return null;
	const r = RADIUS + OUT;
	const x0 = WALL - OUT;
	const x1 = WALL + FW + OUT;
	const y0 = -OUT;
	const y1 = FH + OUT;
	const arcs = [
		`M ${x0} ${y0 + r + ARM} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} H ${x0 + r + ARM}`,
		`M ${x1 - r - ARM} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y0 + r + ARM}`,
		`M ${x1} ${y1 - r - ARM} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x1 - r - ARM}`,
		`M ${x0 + r + ARM} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y1 - r - ARM}`,
	];
	return (
		<>
			{arcs.map((d) => (
				<path key={d} d={d} stroke={INK} strokeOpacity={0.75} strokeWidth={1.5} strokeLinecap="round" />
			))}
		</>
	);
}
