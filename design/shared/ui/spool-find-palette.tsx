import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	charWeights,
	FRAMES,
	type FrameRow,
	findFrames,
	type Hit,
	runsIn,
	segmentsOf,
	splitVariant,
	type Weight,
} from "../lib/frame-find";
import { cn } from "../lib/utils";
import { FolderIcon } from "./spool-icons";

/**
 * The frame finder: press `/` on the canvas and a palette opens over it, filtering
 * every frame on every page. Arrows move the pick, Enter lands the camera on it,
 * Escape closes.
 *
 * `/` rather than a two-key chord, because Home already binds it (`src/ui/home.tsx:44`,
 * *"`/` is the filter's door, unless something is already taking type"*), and one
 * app should not teach the same idea twice.
 *
 * What Enter does is not invented either: it is `openConnection`
 * (`src/ui/canvas/canvas.tsx:2218`), unchanged. Switch the page if the frame is on
 * another one, clear the pick, select the frame, centre the camera on it and keep
 * the zoom. Landing on a frame is going to where it is, never deciding how close
 * you wanted to be.
 *
 * The palette floats over the viewport rather than living in the Pages rail,
 * because the rail is the thing it is answering: the rail is alphabetical and
 * collapsed, and a filter field inside it would still make you open the right page
 * to see the answer.
 *
 * Everything here is live. The matcher in `lib/frame-find.ts` is the real one, the
 * list is this project's real 88 frames read off disk, and typing re-ranks. Two
 * things are inert and only two: the camera cannot move because there is no canvas
 * behind a frame, and Escape cannot close because closing would leave the frame
 * blank. Enter still answers, with a flash on the row it would have taken.
 */

/** what varies between the three takes: how a column of near-identical names reads */
export type FindRows = "dim" | "tail" | "split";

const TONE: Record<Weight, string> = {
	runup: "text-muted/40",
	hit: "text-thread",
	plain: "text-text",
};

/** the same three zones, for a part of the name a treatment has pushed into the background */
const DEMOTED: Record<Weight, string> = {
	runup: "text-muted/30",
	hit: "text-thread",
	plain: "text-muted/55",
};

/** the dashes themselves: glue, never content, unless you actually typed one */
const SEAM: Record<Weight, string> = {
	runup: "text-muted/25",
	hit: "text-thread",
	plain: "text-muted/25",
};

/** a segment column saying exactly what the column above it said */
const QUIET: Record<Weight, string> = {
	runup: "text-muted/25",
	hit: "text-thread",
	plain: "text-muted/30",
};

const VISIBLE = 10;
const ROW = 30;

export function FindPalette({
	rows,
	query: opening = "",
	onPick,
}: {
	rows: FindRows;
	/** what is already typed when the frame boots; empty is the just-summoned state */
	query?: string | undefined;
	/** the row under the pick, so the canvas can light the page holding it */
	onPick?: ((row: FrameRow | null) => void) | undefined;
}) {
	const [query, setQuery] = useState(opening);
	const [at, setAt] = useState(0);
	const [landed, setLanded] = useState<number | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const hits = useMemo(() => findFrames(query), [query]);
	const picked = hits[at];

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		onPick?.(picked?.row ?? null);
	}, [picked, onPick]);

	// the pick has to stay on screen, and 88 frames is eight screens of list
	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);

	useEffect(() => {
		if (landed === null) return;
		const timer = window.setTimeout(() => setLanded(null), 420);
		return () => window.clearTimeout(timer);
	}, [landed]);

	const grid = useMemo(() => (rows === "split" ? columnsFor(hits.slice(0, 40)) : null), [rows, hits]);
	const empty = query.trim().length === 0;

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.14, ease: "easeOut" }}
			className="absolute inset-0 z-30 flex justify-center bg-bg/48 px-8 pt-[104px] backdrop-blur-[2px]"
		>
			<motion.div
				initial={{ y: -8 }}
				animate={{ y: 0 }}
				transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
				// a caret that never leaves: clicking the panel is never clicking away from the field
				onMouseDown={(event) => {
					if (event.target !== inputRef.current) event.preventDefault();
					inputRef.current?.focus();
				}}
				className="flex h-fit w-[560px] flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
			>
				<label className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
					{/* the summon key, left as the prompt: the field says which key opened it */}
					<span className="shrink-0 font-mono text-md text-muted/60 leading-md">/</span>
					<input
						ref={inputRef}
						value={query}
						spellCheck={false}
						autoComplete="off"
						placeholder="type part of a name"
						onChange={(event) => {
							setQuery(event.target.value);
							setAt(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setAt((n) => Math.min(n + 1, hits.length - 1));
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setAt((n) => Math.max(n - 1, 0));
							} else if (event.key === "Enter") {
								event.preventDefault();
								if (picked !== undefined) setLanded(at);
							} else if (event.key === "Escape") {
								// the one dead key: there is no canvas behind a frame to go back to
								event.preventDefault();
							}
						}}
						className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/40"
						aria-label="Find a frame"
					/>
					{/* an order you did not ask for has to say what it is; an order you typed does not */}
					<span className="shrink-0 font-mono text-2xs text-muted/50 leading-3">
						{empty ? `${FRAMES.length} frames, newest first` : `${hits.length} of ${FRAMES.length}`}
					</span>
				</label>

				<div className="relative shrink-0">
					<div
						ref={listRef}
						className="overflow-y-auto py-1.5"
						// an overflowing list stops half a row short, so the cut is the thing
						// that says there is more, rather than a trough down the side of it
						style={{ height: Math.min(Math.max(hits.length, 1), VISIBLE) * ROW + 12 + (hits.length > VISIBLE ? 15 : 0) }}
					>
						{hits.length === 0 ? (
							<div className="flex h-[30px] items-center px-4 font-mono text-muted/60 text-sm leading-sm">
								nothing answers to that
							</div>
						) : (
							hits.map((hit, index) => (
								<Row
									key={hit.row.name}
									hit={hit}
									index={index}
									rows={rows}
									grid={grid}
									above={hits[index - 1]?.row.name}
									age={empty}
									picked={index === at}
									flashing={index === landed}
									onPoint={() => setAt(index)}
									onLand={() => setLanded(index)}
								/>
							))
						)}
					</div>
					{hits.length > VISIBLE ? (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface via-surface/85 to-transparent" />
					) : null}
				</div>

				<div className="flex h-9 shrink-0 items-center gap-5 border-border border-t px-4 font-mono text-2xs text-muted leading-3">
					<span>{"↑↓ moves"}</span>
					<span>{"↵ lands there"}</span>
					<span>esc closes</span>
				</div>
			</motion.div>
		</motion.div>
	);
}

function Row({
	hit,
	index,
	rows,
	grid,
	above,
	age,
	picked,
	flashing,
	onPoint,
	onLand,
}: {
	hit: Hit;
	index: number;
	rows: FindRows;
	grid: Grid | null;
	/** the name printed directly above this one, which only the column take reads */
	above: string | undefined;
	age: boolean;
	picked: boolean;
	flashing: boolean;
	onPoint: () => void;
	onLand: () => void;
}) {
	const weights = charWeights(hit.row.name, hit.matched);
	return (
		<button
			type="button"
			data-at={index}
			// move, not enter: a list that scrolls under a still cursor must not re-pick
			onMouseMove={onPoint}
			onClick={onLand}
			className={cn(
				"relative flex w-full items-center gap-5 px-4 text-left transition-colors duration-100",
				picked && "bg-raised",
				flashing && "bg-thread/15",
			)}
			style={{ height: ROW }}
		>
			{picked ? <span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-thread" /> : null}
			{rows === "dim" ? (
				<Dim name={hit.row.name} weights={weights} />
			) : rows === "tail" ? (
				<Tail name={hit.row.name} weights={weights} />
			) : (
				<Split name={hit.row.name} weights={weights} grid={grid} above={above} />
			)}
			{/* what the row is, then where it is: two different questions, so two groups */}
			<span className="flex shrink-0 items-center gap-3">
				{age ? (
					<span className="w-[26px] text-right font-mono text-2xs text-muted/40 leading-3">{hit.row.age}</span>
				) : null}
				<span className="flex w-[74px] items-center gap-1.5">
					<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
					<span className="truncate font-mono text-2xs text-muted/55 leading-3">{hit.row.page}</span>
				</span>
			</span>
		</button>
	);
}

/** the name, whole and in place. Only brightness moves. */
function Dim({ name, weights }: { name: string; weights: readonly Weight[] }) {
	return (
		<span className="min-w-0 flex-1 truncate font-mono text-sm leading-sm">
			<Ink name={name} weights={weights} from={0} to={name.length} tone={TONE} />
		</span>
	);
}

/** the variant first, the base it belongs to demoted to its own column on the right */
function Tail({ name, weights }: { name: string; weights: readonly Weight[] }) {
	const { base, variant, at } = splitVariant(name);
	return (
		<>
			<span className="min-w-0 flex-1 truncate font-mono text-sm leading-sm">
				<Ink name={name} weights={weights} from={variant === null ? 0 : at} to={name.length} tone={TONE} />
			</span>
			<span className="w-[100px] shrink-0 truncate text-right font-mono text-sm leading-sm">
				{/* a frame that is nobody's variant has no base to demote, and says so by being blank */}
				{variant === null ? null : <Ink name={name} weights={weights} from={0} to={base.length} tone={DEMOTED} />}
			</span>
		</>
	);
}

/**
 * The name kerned into segment columns, counted from the tail so the differences
 * line up, and a column that repeats what the column above it said goes quiet. Two
 * mechanisms rather than one, because a grid alone still prints `agent play` ten
 * times at full strength and the grid is what makes the repetition provable.
 */
function Split({
	name,
	weights,
	grid,
	above,
}: {
	name: string;
	weights: readonly Weight[];
	grid: Grid | null;
	above: string | undefined;
}) {
	const segments = segmentsOf(name);
	const prior = above === undefined ? [] : segmentsOf(above);
	const depth = grid?.depth ?? segments.length;
	const offset = Math.max(depth - segments.length, 0);
	const priorOffset = Math.max(depth - prior.length, 0);
	return (
		<span className="flex min-w-0 flex-1 items-center gap-[1ch] overflow-hidden font-mono text-sm leading-sm">
			{segments.map((segment, index) => {
				const seam = segments[index + 1]?.gap ?? "";
				const width = grid?.widths[offset + index];
				const mirror = prior[offset + index - priorOffset];
				const repeats =
					mirror !== undefined &&
					mirror.text === segment.text &&
					(prior[offset + index - priorOffset + 1]?.gap ?? "") === seam;
				return (
					<span
						key={segment.at}
						className="shrink-0 whitespace-pre"
						style={
							width === undefined
								? undefined
								: { width: `${width}ch`, marginLeft: index === 0 ? offsetOf(grid, offset) : undefined }
						}
					>
						<Ink
							name={name}
							weights={weights}
							from={segment.at}
							to={segment.at + segment.text.length}
							tone={repeats ? QUIET : TONE}
						/>
						{seam === "" ? null : (
							<Ink
								name={name}
								weights={weights}
								from={segment.at + segment.text.length}
								to={segment.at + segment.text.length + seam.length}
								tone={SEAM}
							/>
						)}
					</span>
				);
			})}
		</span>
	);
}

function Ink({
	name,
	weights,
	from,
	to,
	tone,
}: {
	name: string;
	weights: readonly Weight[];
	from: number;
	to: number;
	tone: Record<Weight, string>;
}) {
	return (
		<>
			{runsIn(name, weights, from, to).map((run) => (
				<span key={`${from}-${run.weight}-${run.text}`} className={tone[run.weight]}>
					{run.text}
				</span>
			))}
		</>
	);
}

interface Grid {
	readonly depth: number;
	readonly widths: readonly number[];
}

/**
 * The column grid, measured across the results rather than assumed. Columns are
 * counted from the tail, so `site-mobile` lands its two segments in the last two
 * columns of a four-column set and its tail still lines up with everything else's.
 * A column is as wide as its widest segment plus the dashes that follow it, in `ch`,
 * which for a monospace face is exactly one character.
 */
function columnsFor(hits: readonly Hit[]): Grid {
	let depth = 0;
	const parsed = hits.map((hit) => segmentsOf(hit.row.name));
	for (const segments of parsed) depth = Math.max(depth, segments.length);
	const widths = new Array<number>(depth).fill(0);
	for (const segments of parsed) {
		const offset = depth - segments.length;
		segments.forEach((segment, index) => {
			const seam = segments[index + 1]?.gap ?? "";
			const column = offset + index;
			widths[column] = Math.max(widths[column] ?? 0, segment.text.length + seam.length);
		});
	}
	return { depth, widths };
}

/** a shallow name starts further in, which is what makes the tail column line up */
function offsetOf(grid: Grid | null, offset: number): string | undefined {
	if (grid === null || offset === 0) return undefined;
	let width = 0;
	for (let index = 0; index < offset; index++) width += (grid.widths[index] ?? 0) + 1;
	return `${width}ch`;
}
