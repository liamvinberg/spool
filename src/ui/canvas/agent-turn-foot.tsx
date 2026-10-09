import { type ReactNode, useState } from "react";
import { cn } from "../cn";
import type { AgentTile, AgentTurnFoot } from "./agent-transcript";

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
}: {
	foot: AgentTurnFoot;
	/** the turn's clock, for a foot still running */
	elapsed: number;
	reach: TileReach;
	/** the turn's rows and waits, drawn behind the status line */
	steps: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const over = foot.ms !== null;
	return (
		<div data-agent-turn={over ? "over" : "running"} className="flex flex-col gap-3 pt-1">
			{foot.tiles.length === 0 ? null : <TileGrid tiles={foot.tiles} settled={over} reach={reach} />}
			<StatusLine foot={foot} elapsed={elapsed} open={open} onToggle={() => setOpen((was) => !was)} />
			<div data-agent-steps={open ? "open" : "shut"} hidden={!open} className="flex flex-col">
				{steps}
			</div>
		</div>
	);
}

function StatusLine({
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
			data-agent-status={over ? (foot.ending ?? "done") : "running"}
			onClick={onToggle}
			className={cn(
				"-mx-1.5 flex h-[26px] items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150",
				"hover:bg-control",
				open && "bg-control",
			)}
		>
			<StatusMark over={over} ending={foot.ending} />
			<span className="min-w-0 flex-1 truncate text-muted type-control">
				{over ? (
					words
				) : (
					<>
						<span className="agent-shimmer animate-agent-shimmer">{words}</span>
						{foot.thinking && foot.status !== null ? <span className="pl-2 opacity-70">thinking</span> : null}
					</>
				)}
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
function StatusMark({ over, ending }: { over: boolean; ending: AgentTurnFoot["ending"] }) {
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
function TileGrid({ tiles, settled, reach }: { tiles: readonly AgentTile[]; settled: boolean; reach: TileReach }) {
	return (
		<div data-agent-tiles="" className={cn("grid gap-x-3 gap-y-4", settled ? "grid-cols-3" : "grid-cols-2")}>
			{tiles.map((tile) => (
				<Tile key={tile.key} tile={tile} reach={reach} />
			))}
		</div>
	);
}

function Tile({ tile, reach }: { tile: AgentTile; reach: TileReach }) {
	const [putting, setPutting] = useState(false);
	const goes = tile.state !== "deleted" && reach.have.has(tile.frame);
	const live = tile.state !== "done" && tile.state !== "deleted";
	const caption = captionOf(tile);
	const body = (
		<>
			<Picture tile={tile} still={reach.stills?.get(tile.frame)} />
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
					{live ? <span className="agent-shimmer animate-agent-shimmer">{caption}</span> : caption}
				</span>
			</span>
		</>
	);
	return (
		<div
			data-agent-tile={tile.frame}
			data-agent-tile-state={tile.state}
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
	const drawn = tile.state !== "reading" && tile.state !== "drawing";
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
					{tile.state === "drawing" ? <Writing lines={tile.lines} /> : null}
				</span>
			)}
			{tile.state === "deleted" ? (
				<span className="absolute inset-0 rounded-[3px] border border-muted border-dashed" />
			) : null}
			{tile.state === "editing" ? <Hand /> : null}
		</span>
	);
}

/** how long each line of source reads, and how far in it sits: code's own shape */
const RUN = [0.42, 0.7, 0.56, 0.82, 0.36, 0.64, 0.5, 0.76, 0.3, 0.6, 0.86, 0.46, 0.68, 0.4, 0.74, 0.52] as const;
const INDENT = [0, 1, 2, 2, 3, 3, 2, 3, 4, 4, 3, 2, 3, 3, 2, 1] as const;
/** rows the outline holds; a frame's usual 320 lines fill it */
const ROWS = 18;

/** the lines streamed so far, as rows of source filling the outline from the top */
function Writing({ lines }: { lines: number }) {
	const filled = Math.max(1, Math.min(ROWS, Math.round((lines / 320) * ROWS)));
	return (
		<span className="absolute inset-[6%]">
			{Array.from({ length: filled }, (_, row) => {
				const indent = INDENT[row % INDENT.length] ?? 0;
				const run = RUN[row % RUN.length] ?? 0.5;
				const last = row === filled - 1;
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
						}}
					/>
				);
			})}
		</span>
	);
}

/** the agent hand, as the canvas draws it beside the frame it is changing */
function Hand() {
	return (
		<span className="pointer-events-none absolute inset-0">
			<span className="-translate-y-1/2 absolute top-1/2 left-[-7px] h-[22px] w-[1.5px] rounded-full bg-text opacity-80" />
			<span className="-translate-y-1/2 absolute top-1/2 left-[-9.5px] h-[5px] w-[5px] rounded-[2px] border border-muted bg-canvas" />
		</span>
	);
}
