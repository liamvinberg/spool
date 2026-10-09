import { type ReactNode, useEffect, useState } from "react";
import type { AgentReply } from "../../daemon/agent-control";
import { cn } from "../cn";
import {
	ApprovalBody,
	AskCard,
	type AskEntry,
	type AskState,
	Dismiss,
	Hairline,
	OptionList,
	optionFrames,
	Settled,
	useAsk,
	WaitingRow,
} from "./agent-ask-view";
import { MOTION, useLeaving } from "./agent-motion";
import { type AgentTile, type AgentTurnFoot, SOURCE_ROWS, type SourceLine } from "./agent-transcript";
import { useStillness } from "./stillness";

/**
 * A turn's foot (#365): the frames it touched as a grid of pictures, and under them its
 * one status line, which opens into every step the turn took.
 *
 * The status line never says a bare "thinking". It names what is true now in plain words —
 * how many designers are working, or the step the agent is on — with a clock that says the
 * turn is alive, and it stays live after the agent answers for as long as the designers it
 * started are still working. Settled, it is a receipt: `Done in 8m 48s`.
 */

/** a turn's length in words, the way a receipt says it */
export function spokenDuration(ms: number): string {
	const whole = Math.max(0, Math.round(ms / 1000));
	if (whole < 60) return `${whole}s`;
	const minutes = Math.floor(whole / 60);
	if (minutes < 60) return `${minutes}m ${String(whole % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** a running clock, minutes and seconds */
export function clockOf(ms: number): string {
	const whole = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** what the settled line says, by how the turn ended */
export function receiptOf(foot: AgentTurnFoot): string {
	const took = spokenDuration(foot.ms ?? 0);
	if (foot.ending === "stopped") return `Stopped after ${took}`;
	if (foot.ending === "failed") return `Failed after ${took}`;
	return `Done in ${took}`;
}

/** a tile's caption: its live step while something is happening to it, whose it is once not */
export function captionOf(tile: AgentTile): string {
	switch (tile.state) {
		case "reading":
			return "Reading";
		case "drawing":
			return `Drawing · ${tile.lines} ${tile.lines === 1 ? "line" : "lines"}`;
		case "fresh":
			return "Landed";
		case "editing":
			return tile.range === null ? "Changing it" : `Changed lines ${tile.range.from}–${tile.range.to}`;
		case "shooting":
			return "Taking its picture";
		case "deleted":
			return "Deleted";
		case "done": {
			const by = tile.by ?? "By the agent";
			return tile.took === null ? by : `${by} · ${spokenDuration(tile.took)}`;
		}
	}
}

export interface TileReach {
	/** the frames the project has now, which are places to go */
	readonly have: ReadonlySet<string>;
	/** each frame's still, where the canvas has one */
	readonly stills?: ReadonlyMap<string, string>;
	readonly onJump: (frame: string) => void;
	readonly onPoint: (frame: string | null) => void;
	/** Put back a frame the turn deleted; absent where nothing can */
	readonly onPutBack?: (tile: AgentTile) => Promise<boolean>;
}

export function TurnFoot({
	foot,
	elapsed,
	reach,
	steps,
	asks = [],
	onAnswer,
	permissions,
}: {
	foot: AgentTurnFoot;
	/** the turn's clock, for a foot still running */
	elapsed: number;
	reach: TileReach;
	/** the turn's rows and waits, drawn behind the status line */
	steps: ReactNode;
	/** the turn's asks nobody has answered yet, which open out of its line or its grid (#366) */
	asks?: readonly AskEntry[];
	onAnswer?: (request: string, reply: AgentReply) => void;
	permissions?: (() => void) | undefined;
}) {
	const [open, setOpen] = useState(false);
	const over = foot.ms !== null;
	const makers = new Set(foot.tiles.flatMap((tile) => (tile.delegation === undefined ? [] : [tile.delegation])));
	// a designer's ask hangs off its own tile; anything else is the turn's own
	const designer = asks.find(
		(ask) => ask.delegation !== undefined && ask.delegation !== "" && makers.has(ask.delegation),
	);
	// the turn's own ask opens out of its line when it is an approval (story 58) and turns
	// the grid into the choice when its options name the turn's frames; a question about
	// no frame is a quiet card at the end of the chat (story 67)
	const mine = asks.find((ask) => ask !== designer && onTheLine(ask, foot.tiles));
	// each anchor holds one ask; any more wait their turn as cards under the foot, so an
	// ask is never anywhere but on screen
	const hung = mine === undefined ? designer : undefined;
	const queued = asks.filter((ask) => ask !== mine && ask !== hung);
	const answer = onAnswer ?? (() => {});
	return (
		<div data-agent-turn={over ? "over" : "running"} className="flex flex-col gap-3 pt-1">
			{mine === undefined ? (
				<>
					{foot.tiles.length === 0 ? null : (
						<TileGrid
							tiles={foot.tiles}
							settled={over}
							reach={reach}
							waiting={hung?.delegation}
							under={
								hung === undefined
									? undefined
									: (notch) => (
											<DesignerAsk entry={hung} onAnswer={answer} permissions={permissions} notch={notch} />
										)
							}
						/>
					)}
					<TurnLine foot={foot} elapsed={elapsed} open={open} onToggle={() => setOpen((was) => !was)} />
				</>
			) : (
				<LineAsk
					key={mine.key}
					entry={mine}
					foot={foot}
					reach={reach}
					meta={Number.isFinite(elapsed) ? clockOf(elapsed) : undefined}
					onAnswer={answer}
					permissions={permissions}
				/>
			)}
			<div
				data-agent-steps={open && mine === undefined ? "open" : "shut"}
				hidden={!open || mine !== undefined}
				className="flex flex-col"
			>
				{steps}
			</div>
			{queued.map((entry) => (
				<DesignerAsk key={entry.key} entry={entry} onAnswer={answer} permissions={permissions} />
			))}
		</div>
	);
}

/** an approval, or a question whose options name the turn's frames: the asks the line opens into */
function onTheLine(entry: AskEntry, tiles: readonly AgentTile[]): boolean {
	if (!entry.question) return true;
	return entry.questions.some((question) => !question.multi && optionFrames(question, tiles) !== null);
}

/**
 * The turn's own ask, out of its line: an approval or a question about no frame opens the
 * line into it, and a question whose options name the turn's frames turns the grid into the
 * choice — every named picture numbered, with its option's description, and the rest
 * stepped back — so pressing a picture answers.
 */
function LineAsk({
	entry,
	foot,
	reach,
	meta,
	onAnswer,
	permissions,
}: {
	entry: AskEntry;
	foot: AgentTurnFoot;
	reach: TileReach;
	meta: string | undefined;
	onAnswer: (request: string, reply: AgentReply) => void;
	permissions?: (() => void) | undefined;
}) {
	const ask = useAsk(entry, onAnswer);
	const question = ask.question;
	const named = question === null || question.multi ? null : optionFrames(question, foot.tiles);
	const grid =
		foot.tiles.length === 0 ? null : named === null || question === null ? (
			<TileGrid tiles={foot.tiles} settled={foot.ms !== null} reach={reach} />
		) : (
			<PictureChoice tiles={foot.tiles} frames={named} ask={ask} reach={reach} settled={foot.ms !== null} />
		);
	return (
		<div
			data-agent-ask={entry.state}
			data-agent-ask-look={named === null ? "line" : "grid"}
			className="flex flex-col gap-3"
		>
			{grid}
			<div className="flex flex-col">
				{!entry.question ? (
					<>
						<WaitingRow words="Waiting on you" meta={meta} />
						<Hairline>
							<ApprovalBody entry={entry} ask={ask} permissions={permissions} />
						</Hairline>
					</>
				) : named !== null && question !== null ? (
					<>
						<Settled entry={entry} ask={ask} />
						<WaitingRow words={question.question} meta={meta} />
						<div className="flex items-center justify-between gap-2 pl-[22px]">
							<span className="text-muted type-detail">Press a picture, or type your own answer.</span>
							<Dismiss onPress={ask.dismiss} />
						</div>
					</>
				) : (
					<>
						<Settled entry={entry} ask={ask} />
						<WaitingRow
							words={question?.question ?? entry.asked ?? "Waiting on you"}
							meta={meta}
							arriving={entry.state === "arriving"}
						/>
						{ask.open && question !== null ? (
							<Hairline tight>
								<OptionList ask={ask} />
							</Hairline>
						) : null}
					</>
				)}
			</div>
		</div>
	);
}

/** an ask as its own card: a designer's under the grid, its notch pointing up at its tile, or one waiting its turn */
function DesignerAsk({
	entry,
	onAnswer,
	permissions,
	notch,
}: {
	entry: AskEntry;
	onAnswer: (request: string, reply: AgentReply) => void;
	permissions?: (() => void) | undefined;
	notch?: number;
}) {
	const ask = useAsk(entry, onAnswer);
	return <AskCard entry={entry} ask={ask} permissions={permissions} notch={notch} />;
}

/** the turn's grid as a question's options: pressing a picture answers it */
function PictureChoice({
	tiles,
	frames,
	ask,
	reach,
	settled,
}: {
	tiles: readonly AgentTile[];
	frames: readonly string[];
	ask: AskState;
	reach: TileReach;
	/** the turn is over: three across, as the grid it stands in for */
	settled: boolean;
}) {
	const question = ask.question;
	if (question === null) return null;
	return (
		<div
			role="menu"
			aria-label={question.question}
			data-agent-tiles=""
			className={cn("grid gap-x-3 gap-y-4", settled ? "grid-cols-3" : "grid-cols-2")}
		>
			{tiles.map((tile) => {
				const at = frames.indexOf(tile.frame);
				const option = question.options[at];
				if (option === undefined) {
					// a frame the question does not offer: there, quieter, not a target
					return (
						<div
							key={tile.key}
							data-agent-tile={tile.frame}
							data-agent-tile-aside=""
							className="flex min-w-0 flex-col gap-1.5 opacity-40"
						>
							<Picture tile={tile} still={reach.stills?.get(tile.frame)} />
							<span className="truncate text-muted type-detail">{tile.frame}</span>
						</div>
					);
				}
				return (
					<button
						key={tile.key}
						type="button"
						role="menuitemradio"
						aria-checked={false}
						data-agent-option={option.label}
						data-agent-tile={tile.frame}
						disabled={!ask.open}
						onClick={() => ask.pick(option.label)}
						onMouseEnter={() => reach.onPoint(tile.frame)}
						onMouseLeave={() => reach.onPoint(null)}
						className="group/pic flex min-w-0 flex-col items-start gap-1.5 rounded-xs text-left"
					>
						<span className="relative block w-full rounded-[3px] transition-shadow duration-150 group-hover/pic:shadow-[0_0_0_1.5px_var(--color-bg),0_0_0_2.5px_var(--color-border-raised)]">
							<Picture tile={tile} still={reach.stills?.get(tile.frame)} />
							<span className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-xs bg-bg/85 tabular-nums text-text type-detail">
								{at + 1}
							</span>
						</span>
						<span className="flex w-full min-w-0 flex-col">
							<span className="text-text type-control">{option.label}</span>
							{option.description === "" ? null : (
								<span className="text-pretty text-muted type-detail">{option.description}</span>
							)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function TurnLine({
	foot,
	elapsed,
	open,
	onToggle,
}: {
	foot: AgentTurnFoot;
	elapsed: number;
	open: boolean;
	onToggle: () => void;
}) {
	const over = foot.ms !== null;
	const words = over ? receiptOf(foot) : (foot.status ?? "Working");
	return (
		<button
			type="button"
			aria-expanded={open}
			data-agent-turn-line={over ? (foot.ending ?? "done") : "running"}
			onClick={onToggle}
			className={cn(
				"-mx-1.5 flex h-[26px] items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150",
				"hover:bg-control",
				open && "bg-control",
			)}
		>
			<TurnMark over={over} ending={foot.ending} />
			<span className="min-w-0 flex-1 truncate text-muted type-control">
				{over ? words : <span className="agent-shimmer animate-agent-shimmer">{words}</span>}
			</span>
			{over || !Number.isFinite(elapsed) ? null : (
				<span data-agent-clock="" className="shrink-0 tabular-nums text-muted type-detail">
					{clockOf(elapsed)}
				</span>
			)}
			<svg
				viewBox="0 0 12 12"
				aria-hidden="true"
				className={cn("h-3 w-3 shrink-0 text-muted transition-transform duration-150", open && "rotate-90")}
				fill="none"
			>
				<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			</svg>
		</button>
	);
}

/** a check once done, a square once stopped, a cross once failed, and a turning ring while live */
function TurnMark({ over, ending }: { over: boolean; ending: AgentTurnFoot["ending"] }) {
	return (
		<svg viewBox="0 0 14 14" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none">
			{!over ? (
				<g className="origin-center animate-agent-spin">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</g>
			) : ending === "stopped" ? (
				<rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
			) : ending === "failed" ? (
				<path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			) : (
				<path d="M3.5 7.4 5.9 9.8 10.5 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			)}
		</svg>
	);
}

/** two to a row while the turn runs, three once it settles and gives the chat back its height */
function TileGrid({
	tiles,
	settled,
	reach,
	waiting,
	under,
}: {
	tiles: readonly AgentTile[];
	settled: boolean;
	reach: TileReach;
	/** the designer whose tile waits on an answer: it rings, and its ask hangs under the grid */
	waiting?: string | undefined;
	/** the ask hanging under the grid, given where its notch points as a share of the width */
	under?: ((notch: number) => ReactNode) | undefined;
}) {
	const columns = settled ? 3 : 2;
	const at = waiting === undefined ? -1 : tiles.findIndex((tile) => tile.delegation === waiting);
	// while anything is still happening, what is finished steps back to leave the eye on it
	const working = !settled && tiles.some((tile) => tile.state !== "done" && tile.state !== "deleted");
	return (
		<div className="flex flex-col gap-3">
			<div data-agent-tiles="" className={cn("grid gap-x-3 gap-y-4", settled ? "grid-cols-3" : "grid-cols-2")}>
				{tiles.map((tile, index) => (
					<Tile
						key={tile.key}
						tile={tile}
						reach={reach}
						waiting={index === at}
						small={working && tile.state === "done" && index !== at}
					/>
				))}
			</div>
			{under === undefined || at === -1 ? null : (
				<div data-agent-ask-under={tiles[at]?.frame}>{under(((at % columns) + 0.5) / columns)}</div>
			)}
		</div>
	);
}

function Tile({
	tile,
	reach,
	waiting = false,
	small = false,
}: {
	tile: AgentTile;
	reach: TileReach;
	waiting?: boolean;
	/** finished while others still work: drawn smaller, so attention goes to what moves */
	small?: boolean;
}) {
	const [putting, setPutting] = useState(false);
	const goes = tile.state !== "deleted" && reach.have.has(tile.frame);
	const live = tile.state !== "done" && tile.state !== "deleted";
	const caption = captionOf(tile);
	const body = (
		<>
			<span
				data-agent-tile-small={small ? "" : undefined}
				className={cn(
					"block rounded-[3px] transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none",
					small ? "w-[72%]" : "w-full",
					waiting && "shadow-[0_0_0_1.5px_var(--color-bg),0_0_0_3px_var(--color-text)]",
				)}
			>
				<Picture tile={tile} still={reach.stills?.get(tile.frame)} />
			</span>
			<span className="flex w-full min-w-0 flex-col">
				<span
					className={cn(
						"truncate type-detail",
						tile.state === "deleted"
							? "text-muted line-through"
							: tile.state === "reading" || tile.state === "drawing"
								? "text-muted"
								: "text-text",
					)}
				>
					{tile.frame}
				</span>
				<span className="truncate text-muted type-detail">
					{waiting ? (
						<span className="text-text">Waiting on you</span>
					) : live ? (
						<span className="agent-shimmer animate-agent-shimmer">{caption}</span>
					) : (
						caption
					)}
				</span>
			</span>
		</>
	);
	return (
		<div
			data-agent-tile={tile.frame}
			data-agent-tile-state={tile.state}
			data-agent-tile-waiting={waiting ? "" : undefined}
			className="flex min-w-0 flex-col items-start gap-1.5"
		>
			{goes ? (
				<button
					type="button"
					title={`Show ${tile.frame} on the canvas`}
					onClick={() => reach.onJump(tile.frame)}
					onMouseEnter={() => reach.onPoint(tile.frame)}
					onMouseLeave={() => reach.onPoint(null)}
					className="flex w-full min-w-0 flex-col items-start gap-1.5 rounded-sm text-left"
				>
					{body}
				</button>
			) : (
				<div className="flex w-full min-w-0 flex-col items-start gap-1.5">{body}</div>
			)}
			{tile.state === "deleted" && tile.source !== undefined && reach.onPutBack !== undefined ? (
				<button
					type="button"
					data-agent-put-back={tile.frame}
					disabled={putting}
					onClick={() => {
						setPutting(true);
						void reach.onPutBack?.(tile).finally(() => setPutting(false));
					}}
					className="-ml-1.5 rounded-sm px-1.5 py-0.5 text-text type-control hover:bg-control disabled:opacity-50"
				>
					Put back
				</button>
			) : null}
		</div>
	);
}

/** the frame's still, or what stands for it before there is one */
function Picture({ tile, still }: { tile: AgentTile; still: string | undefined }) {
	const replaying = useReplay(tile.replay);
	const drawn = tile.state !== "reading" && tile.state !== "drawing" && !replaying;
	const shooting = useLeaving(tile.state === "shooting", MOTION.cornersIn);
	return (
		<span className="relative block aspect-[16/10] w-full shrink-0" aria-hidden="true">
			{drawn ? (
				<span
					className={cn(
						"absolute inset-0 overflow-hidden rounded-[3px] border border-border bg-surface",
						tile.state === "fresh" && "animate-agent-draw-in",
						tile.state === "deleted" && "opacity-35 grayscale",
					)}
				>
					{still === undefined ? null : (
						<img src={still} alt="" draggable={false} className="block size-full object-cover object-top" />
					)}
				</span>
			) : (
				<span className="absolute inset-0 rounded-[3px] border border-border-raised border-dashed">
					{replaying && tile.replay !== undefined ? (
						<Writing lines={tile.lines} shape={tile.replay} replay />
					) : tile.state === "drawing" ? (
						<Writing lines={tile.lines} />
					) : null}
				</span>
			)}
			{tile.state === "deleted" ? (
				<span className="absolute inset-0 rounded-[3px] border border-muted border-dashed" />
			) : null}
			{tile.state === "editing" ? <CompanionMark /> : null}
			{shooting === null ? null : <Corners leaving={shooting === "leaving"} />}
		</span>
	);
}

/**
 * Whether a designer's real source is replaying in the tile: for about a second from the
 * moment its file lands in the spot held for it, then the picture draws. Never where
 * stillness was asked for.
 */
function useReplay(shape: AgentTile["replay"]): boolean {
	const still = useStillness();
	const [replaying, setReplaying] = useState(shape !== undefined && !still);
	useEffect(() => {
		if (!replaying) return;
		const timer = setTimeout(() => setReplaying(false), MOTION.replay);
		return () => clearTimeout(timer);
	}, [replaying]);
	return replaying && !still;
}

/** four corners struck just outside the picture while its picture is taken, folding in after */
function Corners({ leaving }: { leaving: boolean }) {
	return (
		<span
			data-agent-tile-corners={leaving ? "leaving" : "open"}
			className="pointer-events-none absolute -inset-[3px]"
		>
			{(["nw", "ne", "se", "sw"] as const).map((corner) => {
				const top = corner === "nw" || corner === "ne";
				const left = corner === "nw" || corner === "sw";
				return (
					<span
						key={corner}
						className={cn(
							"absolute block size-2 border-text",
							top ? "top-0 border-t-[1.5px]" : "bottom-0 border-b-[1.5px]",
							left ? "left-0 border-l-[1.5px]" : "right-0 border-r-[1.5px]",
							leaving ? "animate-agent-corners-in" : "animate-agent-corners-out",
						)}
					/>
				);
			})}
		</span>
	);
}

/** how long each line of source reads, and how far in it sits: code's own shape */
const RUN = [0.42, 0.7, 0.56, 0.82, 0.36, 0.64, 0.5, 0.76, 0.3, 0.6, 0.86, 0.46, 0.68, 0.4, 0.74, 0.52] as const;
const INDENT = [0, 1, 2, 2, 3, 3, 2, 3, 4, 4, 3, 2, 3, 3, 2, 1] as const;
/** rows the outline holds; a frame's usual 320 lines fill it */
const ROWS = SOURCE_ROWS;

/**
 * The lines streamed so far, as rows of source filling the outline from the top. Given a
 * real source's shape it draws that; replaying, its rows run in one after another over
 * `MOTION.replay`.
 */
function Writing({ lines, shape, replay = false }: { lines: number; shape?: readonly SourceLine[]; replay?: boolean }) {
	const filled = shape !== undefined ? shape.length : Math.max(1, Math.min(ROWS, Math.round((lines / 320) * ROWS)));
	return (
		<span className="absolute inset-[6%]" data-agent-tile-replay={replay ? "" : undefined}>
			{Array.from({ length: filled }, (_, row) => {
				const [indent, run] = shape?.[row] ?? [INDENT[row % INDENT.length] ?? 0, RUN[row % RUN.length] ?? 0.5];
				const last = !replay && row === filled - 1;
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed rows
						key={row}
						className={cn(
							"absolute h-[2px] rounded-full",
							last ? "animate-agent-newest bg-text" : "bg-muted opacity-60",
						)}
						style={{
							top: `${(row / ROWS) * 100}%`,
							left: `${indent * 4.5}%`,
							width: `${run * (100 - indent * 4.5)}%`,
							...(replay
								? {
										animation: `agent-fade-in ${MOTION.lineIn}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
										animationDelay: `${Math.round((row / filled) * (MOTION.replay - MOTION.lineIn))}ms`,
									}
								: {}),
						}}
					/>
				);
			})}
		</span>
	);
}

/** the agent's companion, as the canvas draws it at the block it is changing (#366): ink, never a blend */
function CompanionMark() {
	return (
		<span data-agent-companion-mark="" className="pointer-events-none absolute inset-0">
			<span
				data-agent-mark-ring=""
				className="absolute inset-x-[4%] top-[38%] h-[22%] rounded-[2px] border-[1.5px] border-text opacity-60"
			/>
			<span
				className="absolute top-[38%] left-[4%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-text"
				style={{ borderRadius: 1.8, boxShadow: "0 0 0 1.5px var(--color-canvas)" }}
			/>
		</span>
	);
}
