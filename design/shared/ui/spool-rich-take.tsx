import { useCallback, useMemo, useState } from "react";
import { RAIL_DEFAULT, RAIL_MAX, RAIL_WIDTHS, TABLE_SAID } from "../lib/rich-copy";
import { closedRich } from "../lib/rich-markdown";
import { cn } from "../lib/utils";
import { Lightbox } from "./spool-lightbox";
import { RichCaret, RichSaid, type TableTake } from "./spool-rich-say";
import { arrivalCuts, RailColumn, RichHead, RichNote, RichSheet, StreamWalk, useArrive, WalkTable, type Walk } from "./spool-rich-sheet";

/**
 * One take on the table, drawn the same way five times so the takes are comparable.
 *
 * Every `agent-rich--table-*` frame is this sheet with one value fixed, which is the same
 * shape `say="read"` has on the rail: a prop exists so that separate frames can each pass
 * one thing, and the winner stops being a prop. **No frame here offers a choice.**
 *
 * Three bands, and the order is the argument. What it looks like at every width the rail
 * has; what it does while the table is still arriving, which is the constraint that decides
 * this; and the walk, which is the same instrument #148 tuned `say-markers.ts` with.
 */
export function RichTake({
	take,
	title,
	note,
	widths,
	verdict,
	arriving,
	tall = 240,
	arriveTall = 240,
}: {
	take: TableTake;
	title: string;
	note: string;
	/** one line per rail width, in the order of `RAIL_WIDTHS` */
	widths: readonly string[];
	/** what the walk means for this take, printed under it */
	verdict: string;
	/** what the take does while the table is still on the wire */
	arriving: string;
	/** how much room the first band's columns get: measured once, then written down */
	tall?: number;
	arriveTall?: number;
}) {
	const [walks, setWalks] = useState<readonly Walk[]>([]);
	const [heights, setHeights] = useState<Readonly<Record<number, number>>>({});
	const [widened, setWidened] = useState<number | null>(null);
	const [open, setOpen] = useState(false);
		/* the live column opens 1.25s in, so a still lands on a table mid-arrival rather than on
	   an empty box; `replay` puts the clock back to zero */
	const arrive = useArrive(TABLE_SAID, 1250);
	const cuts = useMemo(() => arrivalCuts(TABLE_SAID), []);

	const render = useCallback(
		(shown: string, live: number) => <RichSaid text={shown} live={live} table={take} />,
		[take],
	);
	const onDone = useCallback((next: readonly Walk[]) => setWalks(next), []);
	const onHeight = useCallback(
		(width: number) => (value: number) =>
			setHeights((was) => (was[width] === value ? was : { ...was, [width]: value })),
		[],
	);
	const onWiden = useCallback((wanted: number) => setWidened(Math.min(RAIL_MAX, wanted + 28)), []);
	const onOpen = useCallback(() => setOpen(true), []);

	return (
		<RichSheet>
			<StreamWalk text={TABLE_SAID} widths={RAIL_WIDTHS} render={render} onDone={onDone} />

			<RichHead
				title={title}
				note={`${note} · the rail is 420 by default and drags 200 to 480 (agent-rail.tsx:68)`}
			/>
			<div className="flex shrink-0 gap-5 px-5 py-3">
				{RAIL_WIDTHS.map((width, at) => {
					const real = take === "widen" && width === RAIL_DEFAULT && widened !== null ? widened : width;
					const height = heights[width];
					return (
						<RailColumn
							key={width}
							width={real}
							label={real === width ? `${width}` : `${width} → ${real}`}
							note={`${widths[at] ?? ""}${height === undefined ? "" : ` · ${height}px tall`}`}
							height={tall}
							tone={width === RAIL_DEFAULT ? "text-text" : "text-muted"}
							onHeight={onHeight(width)}
						>
							<RichSaid
								text={TABLE_SAID}
								table={take}
								onWiden={width === RAIL_DEFAULT ? onWiden : undefined}
								onOpen={onOpen}
							/>
						</RailColumn>
					);
				})}
			</div>

			<RichHead title="while it arrives" note={arriving} />
			<div className="flex shrink-0 gap-5 px-5 py-3">
				{cuts.map((cut) => (
					<RailColumn
						key={cut.note}
						width={RAIL_DEFAULT}
						label={`${cut.at}c`}
						note={cut.note}
						height={arriveTall}
						tone="text-muted"
					>
						<RichSaid
							text={closedRich(TABLE_SAID.slice(0, cut.at))}
							live={Math.min(150, cut.at)}
							table={take}
							caret={<RichCaret />}
						/>
					</RailColumn>
				))}
				<RailColumn
					width={RAIL_DEFAULT}
					label={arrive.done ? "settled" : "live"}
					note={
						arrive.done
							? "the wire finished, nothing is moving"
							: `${(arrive.elapsed / 1000).toFixed(1)}s · 81c deltas, 460ms apart`
					}
					height={arriveTall}
					tone={arrive.done ? "text-muted" : "text-text"}
				>
					<RichSaid
						text={arrive.shown}
						live={arrive.live}
						table={take}
						caret={arrive.done ? null : <RichCaret />}
					/>
				</RailColumn>
			</div>
			<div className="flex shrink-0 items-center gap-3 px-5 pb-2">
				<button
					type="button"
					onClick={arrive.replay}
					className="font-mono text-2xs text-muted/60 leading-4 transition-colors duration-150 hover:text-text/80"
				>
					replay
				</button>
				<span className="font-mono text-2xs text-muted/35 leading-4">
					the three stills are the frames a table is fragile in; the fourth is the same message on the wire
				</span>
			</div>

			<RichHead
				title="the walk"
				note={`every prefix of the message drawn through this take and measured, at all four widths`}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-1 py-2">
				<WalkTable
					walks={walks}
					note="a height drop is text you were reading moving up under your eye; a re-width is the same fault sideways"
				/>
				<RichNote>
					<span className={cn(walks.length === 0 ? "text-muted/40" : "text-text/80")}>{verdict}</span>
				</RichNote>
			</div>

			{take === "open" ? (
				<Lightbox open={open} onClose={() => setOpen(false)} caption="the table at its own width">
					<div className="max-w-full p-5">
						<RichSaid text={TABLE_SAID} table="scroll" />
					</div>
				</Lightbox>
			) : null}
		</RichSheet>
	);
}
