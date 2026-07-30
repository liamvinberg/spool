import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { type Cells, type RichChunk, type RichSpan, richChunks, richDrawn } from "../lib/rich-markdown";
import { cn } from "../lib/utils";

/**
 * The agent's words with the gaps filled, and one decision about a table per frame.
 *
 * It mirrors `spool-say.tsx` block for block rather than replacing it: same 13px prose on
 * a 20px line, same fence box, same quote rule, same `data-marker` on the one glyph the
 * renderer owns rather than the agent. What is new is everything `agent-markdown.ts` draws
 * as literal syntax today, and a `table` prop naming which of five answers to the table a
 * frame is drawing. **The prop exists so five frames can each pass one fixed value.** It is
 * not a switcher: no frame here offers a choice, and whichever value wins stops being a
 * prop.
 *
 * #163's word rule is kept exactly: an arriving word is a plain inline span, a settled word
 * is no element at all, and whitespace is never wrapped. Nothing added below wraps anything
 * per word, so a settled message still leaves raw text's own DOM behind.
 */

/* ---------- the arriving edge (#149, #163) ---------- */

/**
 * A run of text whose trailing `live` characters are still arriving.
 *
 * A copy of what ships in `agent-said.tsx` rather than an import, because `spool-say.tsx`
 * does not export it and this file may not edit that one. The rule it carries is the one
 * that matters and it is unchanged: the unit is a word, the wrapper is a plain span with a
 * CSS class on it, and a word that has settled is a bare string.
 */
function Run({ text, from, total, live }: { text: string; from: number; total: number; live: number }) {
	if (live <= 0) return <>{text}</>;
	const start = total - live;
	let at = from;
	return (
		<>
			{text.split(/(\s+)/).map((piece) => {
				const pos = at;
				at += piece.length;
				if (piece === "") return null;
				if (piece.trim() === "") return piece;
				if (pos + piece.length <= start) return piece;
				return (
					<span key={pos} className="rich-word">
						{piece}
					</span>
				);
			})}
		</>
	);
}

export function RichCaret() {
	return (
		<span
			className="ml-[3px] inline-block h-[12px] w-[2px] translate-y-[1px] rounded-[1px] bg-text/70 align-baseline"
			aria-hidden="true"
		/>
	);
}

/* ---------- the five answers to a table ---------- */

export type TableTake = "scroll" | "stack" | "pairs" | "widen" | "open";

/** the plain text of a cell, for a key, a legend or a count */
function flat(cell: readonly RichSpan[]): string {
	return cell
		.map((span) => span.text)
		.join("")
		.trim();
}

/* ---------- spans ---------- */

function CheckGlyph() {
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
			<path d="M2 5.2 4.1 7.3 8 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
		</svg>
	);
}

function PictureGlyph() {
	return (
		<svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" fill="none" aria-hidden="true">
			<rect x="1.2" y="2.2" width="9.6" height="7.6" rx="1" stroke="currentColor" strokeWidth="1" />
			<path d="M1.6 8.4 4.4 5.8l2 1.8 1.8-1.6 2.2 2.2" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
		</svg>
	);
}

/* ---------- the renderer ---------- */

export function RichSaid({
	text,
	live = 0,
	table = "scroll",
	onWiden,
	onOpen,
	caret,
}: {
	text: string;
	live?: number;
	table?: TableTake;
	/** `widen` only: take the rail out to the width the table asked for */
	onWiden?: ((wanted: number) => void) | undefined;
	/** `open` only: hold the table over the whole frame at its natural width */
	onOpen?: (() => void) | undefined;
	caret?: ReactNode;
}) {
	const chunks = richChunks(text);
	const total = richDrawn(chunks);
	let seen = 0;
	const run = (value: string): ReactNode => {
		const node = <Run text={value} from={seen} total={total} live={live} />;
		seen += value.length;
		return node;
	};

	const spans = (list: readonly RichSpan[]): ReactNode => (
		<>
			{list.map((span, at) => {
				const key = `${at}-${span.text.slice(0, 12)}`;
				let node: ReactNode = run(span.text);
				if (span.code === true) {
					node = (
						<code
							className={cn(
								"rounded-xs bg-surface px-[3px] py-px font-mono text-2xs",
								span.bold === true ? "text-text" : "text-text/85",
							)}
						>
							{node}
						</code>
					);
				}
				/*
				 * Emphasis and strike go *outside* a code span rather than instead of it: a struck
				 * path is a real thing an agent writes about a file it deleted, and the chip has to
				 * keep its own box while the line goes through it.
				 */
				{
					/*
					 * **Emphasis is a synthesized oblique, and that is a fact about the typeface
					 * rather than a preference.** Familjen Grotesk ships no italic, and
					 * `fonts.css` asks Google for weights only, so there is no slanted file to
					 * load. Every sheet on this page also sets `font-synthesis: none`, which
					 * turns `italic` into nothing at all — the run renders identical to the prose
					 * around it and the marker has no effect.
					 *
					 * So emphasis re-enables synthesis for itself alone. The alternative was a
					 * colour lift from `text/90` to `text`, and it loses on collision: bold is
					 * already colour plus weight, so a lift makes the two markers neighbours on
					 * the same axis and a reader cannot tell a strong claim from a said-aloud
					 * word. A slant is the one axis nothing else in the rail uses.
					 */
					if (span.em === true) node = <em className="italic [font-synthesis:style]">{node}</em>;
					if (span.strike === true) node = <s className="text-text/45 decoration-muted/50">{node}</s>;
						// a bold code span already carries its weight in the chip's own colour
						if (span.bold === true && span.code !== true)
							node = <strong className="font-medium text-text">{node}</strong>;
				}
				if (span.image === true) {
					/*
					 * **An image draws its own words and is never fetched.** The rail already has a
					 * picture vocabulary and it is #194's: a real 120px thumbnail of a frame spool
					 * rendered itself, which presses to life size. A remote `![](https://…)` is not
					 * that. It is a network request made on the agent's say-so, from a surface with
					 * no loading state and no failure state, into a 392px column. So the alt text
					 * stands where the picture would, wearing the glyph, and the destination is one
					 * press away.
					 */
					node = (
						<a
							key={key}
							href={span.href}
							target="_blank"
							rel="noreferrer"
							className="inline-flex max-w-full items-center gap-1.5 rounded-xs bg-surface px-1.5 py-px align-[1px] font-mono text-2xs text-text/70 leading-4 transition-colors duration-150 hover:text-text"
						>
							<PictureGlyph />
							<span className="truncate">{node}</span>
						</a>
					);
				} else if (span.href !== undefined) {
					/*
					 * A link is an underline and not the accent. The thread red is the selection's
					 * and nothing else in the rail borrows it, so a message full of issue links
					 * would otherwise read as a message full of selected things.
					 */
					node = (
						<a
							key={key}
							href={span.href}
							target="_blank"
							rel="noreferrer"
							className="text-text underline decoration-border-raised decoration-1 underline-offset-2 transition-colors duration-150 hover:decoration-text/60"
						>
							{node}
						</a>
					);
				}
				return <Fragment key={key}>{node}</Fragment>;
			})}
		</>
	);

	const cellRow = (row: Cells) => row.map((cell) => spans(cell));

	return (
		<div data-rich-box="" className="flex flex-col gap-2 text-base text-text/90 leading-base">
			{chunks.map((chunk: RichChunk, at) => {
				const key = `${at}-${chunk.kind}`;
				const end = at === chunks.length - 1 ? caret : null;

				if (chunk.kind === "rule")
					/* nothing to decide: a rule is a rule, at the width of the column it breaks */
					return <span key={key} className="my-0.5 h-px w-full shrink-0 bg-border" aria-hidden="true" />;

				if (chunk.kind === "heading")
					/*
					 * **A heading is a bold lead-in, and that is what the corpus already writes.**
					 * #148 found no heading in any of the thirty-five messages, and it also found
					 * that the long ones open each finding with `**a bold lead-in.**` doing exactly
					 * this job. A 392px column beside the thing the message is about has no room
					 * for a type scale, and a 20px heading in a chat reads as a document title
					 * rather than as a break. So `#` draws what the agent draws by hand, and the
					 * level only decides how much air is above it.
					 */
					return (
						<p key={key} className={cn("font-medium text-text", chunk.level <= 1 ? "pt-1.5" : "pt-0.5")}>
							{spans(chunk.spans)}
							{end}
						</p>
					);

				if (chunk.kind === "fence")
					return (
						<div key={key} className="flex flex-col gap-1">
							{/*
							 * The language, drawn as a label above the box rather than inside it.
							 * Inside, it collides with the first line, which is the one line a fence
							 * always has; above, it costs 12px and never moves. **Nothing is
							 * highlighted**: a highlighter is a dependency and a second palette in a
							 * column already holding one accent, and the label answers the question
							 * the syntax colour was going to answer.
							 */}
							{chunk.lang === "" ? null : (
								<span className="font-mono text-2xs text-muted/40 leading-3">{chunk.lang}</span>
							)}
							<pre className="pages-scrollbar overflow-x-auto rounded-sm border border-border bg-surface px-2.5 py-2 font-mono text-2xs text-text/80 leading-4">
								{run(chunk.text)}
								{end}
							</pre>
						</div>
					);

				if (chunk.kind === "quote")
					return (
						<p key={key} className="border-border-raised border-l-2 pl-2.5 text-text/70">
							{spans(chunk.spans)}
							{end}
						</p>
					);

				if (chunk.kind === "item")
					return (
						/*
						 * `min-h-5` is a streaming rule rather than a spacing one. A task's box is 10px
						 * and a bullet's glyph is a 20px line, so an item that has its marker and not
						 * yet its words would *shrink* by 5px at the moment `- [` became `- [ ]`. Every
						 * real item is a line tall anyway.
						 */
						<p key={key} className="flex min-h-5 gap-2" style={{ paddingLeft: `${2 + chunk.depth * 16}px` }}>
							{chunk.task === "none" ? (
								<span
									data-marker=""
									className={cn(
										"shrink-0 tabular-nums",
										// a deeper bullet is the same glyph, quieter: the indent already says
										// the level, and a second glyph would say it twice
										chunk.depth === 0 ? "text-muted/70" : "text-muted/40",
									)}
								>
									{chunk.depth === 0 || chunk.marker !== "•" ? chunk.marker : "◦"}
								</span>
							) : (
								/*
								 * A task's box is the transcript's own 10px square rather than a bullet,
								 * because a task list is the one list whose items have a state, and the
								 * rail has said `done` with a drawn stroke since #142.
								 */
								<span
									data-marker=""
									className={cn(
										"mt-[5px] flex h-[10px] w-[10px] shrink-0 items-center justify-center rounded-[2px] border",
										chunk.task === "done" ? "border-muted/45 text-muted" : "border-border-raised text-transparent",
									)}
								>
									{chunk.task === "done" ? <CheckGlyph /> : null}
								</span>
							)}
							<span className={cn("min-w-0", chunk.task === "done" ? "text-text/55" : "")}>
								{spans(chunk.spans)}
								{end}
							</span>
						</p>
					);

				if (chunk.kind === "table")
					return (
						<Table
							key={key}
							head={chunk.head}
							rows={chunk.rows}
							take={table}
							live={live}
							cells={cellRow}
							onWiden={onWiden}
							onOpen={onOpen}
						/>
					);

				return (
					<p key={key}>
						{spans(chunk.spans)}
						{end}
					</p>
				);
			})}
		</div>
	);
}

/* ---------- the table, five ways ---------- */

function Table({
	head,
	rows,
	take,
	live,
	cells,
	onWiden,
	onOpen,
}: {
	head: Cells;
	rows: readonly Cells[];
	take: TableTake;
	live: number;
	cells: (row: Cells) => readonly ReactNode[];
	onWiden?: ((wanted: number) => void) | undefined;
	onOpen?: (() => void) | undefined;
}) {
	if (take === "stack") return <Stacked head={head} rows={rows} cells={cells} />;
	if (take === "pairs") return <Paired head={head} rows={rows} cells={cells} />;
	if (take === "widen") return <Widened head={head} rows={rows} live={live} cells={cells} onWiden={onWiden} />;
	if (take === "open") return <Opened head={head} rows={rows} cells={cells} onOpen={onOpen} />;
	return (
		<div
			data-rich-scroller=""
			className="pages-scrollbar overflow-x-auto rounded-sm border border-border bg-surface/50"
		>
			<Grid head={head} rows={rows} cells={cells} wrap={false} />
		</div>
	);
}

/** the grid itself, which three of the five takes draw and only differ in what holds it */
function Grid({
	head,
	rows,
	cells,
	wrap,
}: {
	head: Cells;
	rows: readonly Cells[];
	cells: (row: Cells) => readonly ReactNode[];
	wrap: boolean;
}) {
	const headed = cells(head);
	return (
		/*
		 * `wrap` is auto layout on purpose, which is the browser's own answer to *a table that
		 * fits*: every column gets what its content asks for, bounded by the box. `table-fixed`
		 * would divide the column equally three ways and is measurably steadier while
		 * streaming, but at the rail's floor an equal third is 57px and the row label breaks
		 * mid-word. What auto costs is on the walk.
		 */
		<table
			data-rich-table=""
			className={cn("border-collapse text-left align-top", wrap ? "w-full" : "w-max")}
		>
			<thead>
				<tr>
					{headed.map((cell, at) => (
						<th
							// biome-ignore lint/suspicious/noArrayIndexKey: a column has no identity but its position
							key={at}
							className={cn(
								"border-border border-b px-2.5 py-1.5 text-left align-bottom font-mono font-regular text-2xs text-muted/70 leading-4",
								wrap ? "break-words" : "whitespace-nowrap",
							)}
						>
							{cell}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, at) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a row is its position while it arrives
					<tr key={at} className={at > 0 ? "border-border/70 border-t" : ""}>
						{cells(row).map((cell, index) => (
							<td
								// biome-ignore lint/suspicious/noArrayIndexKey: a column has no identity but its position
								key={index}
								className={cn(
									"px-2.5 py-1.5 align-top",
									index === 0 ? "text-text" : "text-text/85",
									wrap ? "break-words" : "whitespace-nowrap",
								)}
							>
								{cell}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

/** the same grid measured at its natural width, off screen, so nothing is asserted */
function Wanted({
	head,
	rows,
	cells,
	onMeasure,
}: {
	head: Cells;
	rows: readonly Cells[];
	cells: (row: Cells) => readonly ReactNode[];
	onMeasure: (width: number) => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const node = box.current?.firstElementChild;
		if (node === undefined || node === null) return;
		onMeasure(Math.ceil(node.getBoundingClientRect().width));
	});
	/*
	 * The row is drawn twice and the invisible copy is asked how wide it wants to be, which
	 * is #184's own correction: summing children's `scrollWidth` breaks the moment a child
	 * is the thing that truncates, because the cut moves a level deeper and the child's box
	 * shrinks with it.
	 */
	return (
		<div ref={box} className="pointer-events-none absolute top-0 left-[-20000px] w-max" aria-hidden="true">
			<Grid head={head} rows={rows} cells={cells} wrap={false} />
		</div>
	);
}

/**
 * `stack` — the table transposed: one group per row, every cell keeping its column's name.
 */
function Stacked({ head, rows, cells }: { head: Cells; rows: readonly Cells[]; cells: (row: Cells) => readonly ReactNode[] }) {
	return (
		<div className="flex flex-col gap-2.5">
			{rows.map((row, at) => {
				const drawn = cells(row);
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: a row is its position while it arrives
					<div key={at} className="flex flex-col gap-1">
						<p className="text-text">{drawn[0]}</p>
						<div className="flex flex-col gap-0.5 border-border border-l pl-2.5">
							{drawn.slice(1).map((cell, index) => {
								const name = flat(head[index + 1] ?? []);
								// a cell with nothing in it draws nothing, so the last row of an arriving
								// table does not stand a bare key over an empty line waiting for its words
								if (flat(row[index + 1] ?? []) === "") return null;
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: a column has no identity but its position
									<p key={index}>
										{name === "" ? null : (
											<span data-marker="" className="mr-2 font-mono text-2xs text-muted/60">
												{name}
											</span>
										)}
										{cell}
									</p>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/**
 * `pairs` — a definition list: the term, then its definitions, and the column names stated
 * once at the top instead of on every cell.
 */
function Paired({ head, rows, cells }: { head: Cells; rows: readonly Cells[]; cells: (row: Cells) => readonly ReactNode[] }) {
	const legend = head
		.map((cell) => flat(cell))
		.filter((name) => name !== "")
		.join(" · ");
	return (
		<div className="flex flex-col gap-2">
			{legend === "" ? null : (
				<span data-marker="" className="font-mono text-2xs text-muted/45 leading-4">
					{legend}
				</span>
			)}
			{rows.map((row, at) => {
				const drawn = cells(row);
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: a row is its position while it arrives
					<div key={at} className="flex flex-col gap-0.5">
						<p className="text-text">{drawn[0]}</p>
						{drawn.slice(1).map((cell, index) =>
							flat(row[index + 1] ?? []) === "" ? null : (
								// biome-ignore lint/suspicious/noArrayIndexKey: a column has no identity but its position
								<p key={index} className="pl-2.5 text-text/85">
									{cell}
								</p>
							),
						)}
					</div>
				);
			})}
		</div>
	);
}

/**
 * `widen` — the table stays a table, wraps to fit, and says what it would rather have.
 */
function Widened({
	head,
	rows,
	live,
	cells,
	onWiden,
}: {
	head: Cells;
	rows: readonly Cells[];
	live: number;
	cells: (row: Cells) => readonly ReactNode[];
	onWiden?: ((wanted: number) => void) | undefined;
}) {
	const [wanted, setWanted] = useState(0);
	const settled = live <= 0;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="overflow-hidden rounded-sm border border-border bg-surface/50">
				<Grid head={head} rows={rows} cells={cells} wrap={true} />
			</div>
			{/*
			 * The offer waits for the message to finish, and that is the take's own streaming
			 * cost showing up in the design: the width a half-arrived table wants is a number
			 * that climbs on every row, so an affordance printed live would be a control whose
			 * label changes while you reach for it.
			 */}
			{settled ? <Wanted head={head} rows={rows} cells={cells} onMeasure={setWanted} /> : null}
			{settled && wanted > 0 && onWiden !== undefined ? (
				<button
					type="button"
					onClick={() => onWiden(wanted)}
					className="flex w-fit items-center gap-2 font-mono text-2xs text-muted/60 leading-4 transition-colors duration-150 hover:text-text/80"
				>
					<span>wants {wanted}px</span>
					<span className="text-muted/30">·</span>
					<span>widen</span>
				</button>
			) : null}
		</div>
	);
}

/**
 * `open` — the table is drawn where it stands and presses to full width over the canvas,
 * which is exactly what #194 already does with a screenshot.
 */
function Opened({
	head,
	rows,
	cells,
	onOpen,
}: {
	head: Cells;
	rows: readonly Cells[];
	cells: (row: Cells) => readonly ReactNode[];
	onOpen?: (() => void) | undefined;
}) {
	const body = (
		<div
			data-rich-scroller=""
			className="relative overflow-hidden rounded-sm border border-border bg-surface/50"
		>
			<Grid head={head} rows={rows} cells={cells} wrap={false} />
			{/* the cut edge is drawn rather than left to chance: a table clipped by a border and
			    nothing else reads as a table that ends there */}
			<span
				className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-bg via-bg/80 to-transparent"
				aria-hidden="true"
			/>
		</div>
	);
	if (onOpen === undefined) return body;
	return (
		<div className="flex flex-col gap-1">
			<button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left">
				{body}
			</button>
			<span className="font-mono text-2xs text-muted/55 leading-4">
				{rows.length} × {head.length} · press to open
			</span>
		</div>
	);
}
