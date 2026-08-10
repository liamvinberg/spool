import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type PointerEvent as RPointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../../../shared/lib/utils";
import { backArrowClass, backChipClass, SiteSection } from "../../../shared/ui/site-section";

/**
 * site-frames--depth: the "frames" section of spool.page. The claim the hub tile
 * makes is "real tsx, real depth", and prose cannot carry it, so the stage runs
 * it instead: one file printed honestly on the left, the exact component it
 * exports running on the right.
 *
 * Depth is shown, never listed. The running frame holds state a visitor moves
 * (the field pills), motion that exists only because a number changed (every bar
 * springs to a new length, and which bar is longest changes with it), and
 * arithmetic no design tool can hold (`per kg` is not a column in that array; it
 * is cups over kg, divided and normalised against the max on every render).
 *
 * The bond runs both ways, which is the part the old frame only half did.
 * Pointing at a source region rings every element that region produced, all of
 * them at once when the region is a map. Pointing at an element lights the lines
 * that made it. Same state, two entrances.
 *
 * The ring measures in layout px through the offsetParent chain, never
 * getBoundingClientRect (#53): the canvas and the player scale the document, so a
 * visual box read back as layout coordinates strands the chrome. Bars are
 * transforms, so their layout box never moves under the ring; the value column
 * reflows as digits change and the re-measure effect catches it.
 *
 * Boot pose composes instantly: the bars mount at their scale, nothing fades in,
 * and the first auto beat is 3.8s away so a fresh shot lands at rest. A click on
 * a pill takes the loop over for 9s. Reduced motion parks the loop and keeps
 * every ring working. The rendered frame wears Instrument Sans because it is
 * somebody's product; spool's own chrome stays on Familjen Grotesk and Fragment
 * Mono. Chrome, gutters and foot lines come from the shared section shell.
 */

/* ---------- the file, printed verbatim ---------- */

const SOURCE: readonly string[] = [
	`import { motion } from "motion/react"`,
	`import { useState } from "react"`,
	``,
	`const beans = [`,
	`  { name: "yirgacheffe", kg: 2.4, cups: 210 },`,
	`  { name: "huila", kg: 3.1, cups: 128 },`,
	`  { name: "sidamo", kg: 1.6, cups: 174 },`,
	`]`,
	``,
	`export default function Beans() {`,
	`  const [by, setBy] = useState("cups")`,
	`  const of = (b) => (by === "per kg" ? b.cups / b.kg : b[by])`,
	`  const max = Math.max(...beans.map(of))`,
	`  return (`,
	`    <div className="w-[460px] rounded-lg border p-6">`,
	`      {["kg", "cups", "per kg"].map((f) => (`,
	`        <button key={f} onClick={() => setBy(f)}>{f}</button>`,
	`      ))}`,
	`      {beans.map((b) => (`,
	`        <div key={b.name} className="mt-6 flex items-center gap-4">`,
	`          <span className="w-[120px] text-muted">{b.name}</span>`,
	`          <span className="h-1.5 w-[200px] rounded-[2px] bg-raised">`,
	`            <motion.span`,
	`              className="block h-full origin-left rounded-[2px] bg-text"`,
	`              animate={{ scaleX: of(b) / max }}`,
	`            />`,
	`          </span>`,
	`          <span className="ml-auto tabular-nums">{+of(b).toFixed(1)}</span>`,
	`        </div>`,
	`      ))}`,
	`    </div>`,
	`  )`,
	`}`,
];

/**
 * The bond table, and the only place the two sides are wired together: a run of
 * source lines, and the inspect keys the run produced. One key can name several
 * elements (a map makes three rows out of one line), which is why the ring takes
 * a list.
 */
type Bond = {
	id: string;
	from: number;
	to: number;
	keys: readonly string[];
};

const BONDS: readonly Bond[] = [
	{ id: "data", from: 4, to: 8, keys: ["name", "value"] },
	{ id: "state", from: 11, to: 11, keys: ["pill"] },
	{ id: "math", from: 12, to: 13, keys: ["bar", "value"] },
	{ id: "card", from: 15, to: 15, keys: ["card"] },
	{ id: "pills", from: 16, to: 18, keys: ["pill"] },
	{ id: "rows", from: 19, to: 20, keys: ["row"] },
	{ id: "name", from: 21, to: 21, keys: ["name"] },
	{ id: "bar", from: 22, to: 27, keys: ["bar"] },
	{ id: "value", from: 28, to: 28, keys: ["value"] },
];

const BOND_OF_LINE = new Map<number, Bond>();
for (const bond of BONDS) {
	for (let n = bond.from; n <= bond.to; n++) BOND_OF_LINE.set(n, bond);
}

/** The reverse walk: an element names the run that renders it, not the data run. */
const BOND_OF_KEY: Record<string, string> = {
	card: "card",
	pill: "pills",
	row: "rows",
	name: "name",
	bar: "bar",
	value: "value",
};

const BOND_BY_ID = new Map(BONDS.map((bond) => [bond.id, bond]));

/* ---------- the data the printed file declares ---------- */

type Bean = { name: string; kg: number; cups: number };

const BEANS: readonly Bean[] = [
	{ name: "yirgacheffe", kg: 2.4, cups: 210 },
	{ name: "huila", kg: 3.1, cups: 128 },
	{ name: "sidamo", kg: 1.6, cups: 174 },
];

const FIELDS = ["kg", "cups", "per kg"] as const;
type Field = (typeof FIELDS)[number];

/** per kg is arithmetic, not a column. This is the line a design tool cannot hold. */
const valueOf = (bean: Bean, by: Field): number =>
	by === "per kg" ? bean.cups / bean.kg : bean[by];

const fmt = (n: number): string => String(Number(n.toFixed(1)));

/* ---------- two shades, the house stance: ink for names, muted for the rest ---------- */

const WORD = /[A-Za-z0-9_$.-]/;
const KEYWORD = new Set([
	"import",
	"from",
	"export",
	"default",
	"function",
	"return",
	"const",
]);

function colorize(line: string): ReactNode[] {
	const runs = line.match(/[A-Za-z0-9_$.-]+|[^A-Za-z0-9_$.-]+/g);
	if (!runs) return [];
	return runs.map((run, i) => {
		const isWord = WORD.test(run[0] ?? "");
		const ink = !isWord || KEYWORD.has(run) ? "text-muted" : "text-text";
		return (
			<span key={i} className={ink}>
				{run}
			</span>
		);
	});
}

/* ---------- stage geometry: fixed px, never measured ---------- */

const PANE_X = 36;
const PANE_Y = 30;
const PANE_W = 596;
const PANE_H = 560;
const HEAD_H = 40;
const CODE_PAD = 12;
const LINE_H = 15;

// The canvas the export sits on, mirroring the source pane's box exactly: same
// width, same top, same height. Without it the card floated in open stage and
// the composition read left-heavy — the source carried everything and the right
// half looked unfinished rather than spacious. A frame on a canvas is what spool
// is, so the empty room around it is the point once the region is drawn.
const PLATE_X = 696;
const PLATE_W = PANE_W;

// centred in the plate, and already centred vertically: 208 above, 208 below.
const CARD_X = PLATE_X + (PLATE_W - 460) / 2;
const CARD_Y = 208;
const TITLE_Y = 188;

const BEAT_MS = 3800;
const PAUSE_MS = 9000;
const RING_EASE = [0.22, 1, 0.36, 1] as const;

type Rect = { x: number; y: number; w: number; h: number };

/* ---------- the design-tool selection chrome ---------- */

/** The four corner handles of a selection box. */
function Handles() {
	const spots: [string, string][] = [
		["left-0 top-0", "-translate-x-1/2 -translate-y-1/2"],
		["right-0 top-0", "translate-x-1/2 -translate-y-1/2"],
		["left-0 bottom-0", "-translate-x-1/2 translate-y-1/2"],
		["right-0 bottom-0", "translate-x-1/2 translate-y-1/2"],
	];
	return (
		<>
			{spots.map(([pos, tr]) => (
				<span
					key={pos}
					className={cn(
						"absolute h-[7px] w-[7px] rounded-[1px] border border-thread bg-bg",
						pos,
						tr,
					)}
				/>
			))}
		</>
	);
}

/**
 * Ring, handles, and true px riding hairlines above and to the left. `full` is
 * the primary target: when one source line made three elements they all get a
 * ring, but only one carries the measurements.
 */
function SelectChrome({
	rect,
	full,
	anim,
}: {
	rect: Rect;
	full: boolean;
	anim: boolean;
}) {
	const pad = 8;
	return (
		<motion.div
			className="absolute"
			style={{
				left: rect.x - pad,
				top: rect.y - pad,
				width: rect.w + pad * 2,
				height: rect.h + pad * 2,
			}}
			initial={anim ? { opacity: 0, scale: 0.985 } : { opacity: 0 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={anim ? { opacity: 0, scale: 0.99 } : { opacity: 0 }}
			transition={{ duration: anim ? 0.2 : 0.1, ease: RING_EASE }}
		>
			<div
				className={cn(
					"absolute inset-0 border",
					full ? "border-thread/80" : "border-thread/45",
				)}
			/>
			{full ? <Handles /> : null}
			{full ? (
				<>
					{/* width, on a hairline above the box */}
					<div className="absolute -top-4 right-0 left-0">
						<div className="relative h-px bg-thread/55">
							<span className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
							<span className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
							<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
								{Math.round(rect.w)}
							</span>
						</div>
					</div>
					{/* height, on a hairline left of the box */}
					<div className="absolute top-0 bottom-0 -left-4">
						<div className="relative h-full w-px bg-thread/55">
							<span className="absolute top-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
							<span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
							<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
								{Math.round(rect.h)}
							</span>
						</div>
					</div>
				</>
			) : null}
		</motion.div>
	);
}

/* ---------- the running frame: the whole point of the section ---------- */

function Beans({
	by,
	onPick,
	anim,
}: {
	by: Field;
	onPick: (field: Field) => void;
	anim: boolean;
}) {
	const max = Math.max(...BEANS.map((bean) => valueOf(bean, by)));
	return (
		<div
			data-inspect="card"
			className="w-[460px] rounded-lg border border-border bg-bg p-6 font-[Instrument_Sans]"
		>
			<div className="flex items-center gap-1">
				{FIELDS.map((field) => (
					<button
						key={field}
						data-inspect="pill"
						type="button"
						onClick={() => onPick(field)}
						className={cn(
							"cursor-pointer rounded-md border px-2.5 py-[5px] text-[12px] leading-none transition-colors",
							field === by
								? "border-border-raised bg-raised text-text"
								: "border-transparent text-muted hover:text-text",
						)}
					>
						{field}
					</button>
				))}
			</div>

			{BEANS.map((bean) => (
				<div
					key={bean.name}
					data-inspect="row"
					className="mt-6 flex items-center gap-4"
				>
					<span
						data-inspect="name"
						className="w-[120px] text-[14px] leading-5 text-muted"
					>
						{bean.name}
					</span>
					<span
						data-inspect="bar"
						className="block h-1.5 w-[200px] overflow-hidden rounded-[2px] bg-raised"
					>
						{/* real motion: the bar springs because a number changed, nothing else */}
						<motion.span
							className="block h-full origin-left rounded-[2px] bg-text/85"
							initial={false}
							animate={{ scaleX: valueOf(bean, by) / max }}
							transition={anim ? undefined : { duration: 0 }}
						/>
					</span>
					<span
						data-inspect="value"
						className="ml-auto text-[14px] leading-5 tabular-nums"
					>
						{fmt(valueOf(bean, by))}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- the stage: source, render, and the bond between them ---------- */

type Selection = { bond: string; rects: readonly Rect[] };

function Stage() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const [by, setBy] = useState<Field>("cups");
	const [pausedUntil, setPausedUntil] = useState(0);
	const [sel, setSel] = useState<Selection | null>(null);

	const wrapRef = useRef<HTMLDivElement>(null);
	const targetsRef = useRef<readonly HTMLElement[]>([]);
	const bondRef = useRef<string | null>(null);

	// Layout px through the offsetParent chain, relative to the wrapper the ring
	// shares. offsetLeft/offsetTop ignore transforms, so a bar's scaleX never drags
	// its ring. getBoundingClientRect is never used.
	const measure = useCallback((el: HTMLElement | null): Rect | null => {
		const wrap = wrapRef.current;
		if (!wrap || !el) return null;
		let x = 0;
		let y = 0;
		let node: HTMLElement | null = el;
		while (node && node !== wrap) {
			x += node.offsetLeft;
			y += node.offsetTop;
			node = node.offsetParent as HTMLElement | null;
		}
		return { x, y, w: el.offsetWidth, h: el.offsetHeight };
	}, []);

	const focus = useCallback(
		(bond: string, els: readonly HTMLElement[]) => {
			targetsRef.current = els;
			const rects = els
				.map((el) => measure(el))
				.filter((rect): rect is Rect => rect !== null);
			setSel(rects.length > 0 ? { bond, rects } : null);
		},
		[measure],
	);

	const clear = useCallback(() => {
		targetsRef.current = [];
		setSel(null);
	}, []);

	// source -> render: the run under the pointer rings everything it produced.
	const onSourceOver = useCallback(
		(e: RPointerEvent<HTMLDivElement>) => {
			const wrap = wrapRef.current;
			const row = (e.target as HTMLElement).closest<HTMLElement>("[data-line]");
			const bond = row ? BOND_OF_LINE.get(Number(row.dataset.line)) : undefined;
			if (!wrap || !bond) {
				clear();
				return;
			}
			const els = bond.keys.flatMap((key) =>
				Array.from(wrap.querySelectorAll<HTMLElement>(`[data-inspect="${key}"]`)),
			);
			focus(bond.id, els);
		},
		[clear, focus],
	);

	// render -> source: the element under the pointer lights the lines that made it.
	const onRenderOver = useCallback(
		(e: RPointerEvent<HTMLDivElement>) => {
			const el = (e.target as HTMLElement).closest<HTMLElement>("[data-inspect]");
			const key = el?.dataset.inspect;
			const bond = key ? BOND_OF_KEY[key] : undefined;
			if (!el || !bond) return;
			focus(bond, [el]);
		},
		[focus],
	);

	// Digits change width when the field changes; the rings follow their targets.
	useLayoutEffect(() => {
		if (targetsRef.current.length === 0) return;
		const rects = targetsRef.current
			.map((el) => measure(el))
			.filter((rect): rect is Rect => rect !== null);
		setSel((cur) => (cur ? { bond: cur.bond, rects } : cur));
	}, [measure]);

	// The slow loop: one field every 3.8s, a click holds it ~9s, then it resumes.
	useEffect(() => {
		if (!anim) return;
		const wait = Math.max(BEAT_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => {
			setBy((cur) => FIELDS[(FIELDS.indexOf(cur) + 1) % FIELDS.length] ?? cur);
		}, wait);
		return () => window.clearTimeout(id);
	}, [by, pausedUntil, anim]);

	function pick(field: Field) {
		setBy(field);
		setPausedUntil(Date.now() + PAUSE_MS);
	}

	const lit = sel ? BOND_BY_ID.get(sel.bond) : undefined;

	return (
		<div ref={wrapRef} className="absolute inset-0">
			{/* left: the file, honestly */}
			<div
				className="absolute flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
				style={{ left: PANE_X, top: PANE_Y, width: PANE_W, height: PANE_H }}
			>
				<div
					className="flex shrink-0 items-center gap-2.5 border-b border-border px-4"
					style={{ height: HEAD_H }}
				>
					<motion.span
						className="h-1.5 w-1.5 rounded-full bg-thread"
						animate={anim ? { opacity: [0.4, 1, 0.4] } : { opacity: 0.7 }}
						transition={
							anim
								? {
										duration: 2.6,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}
								: { duration: 0.3 }
						}
					/>
					<span className="font-mono text-xs leading-none">
						<span className="text-muted/50">design/frames/</span>
						<span className="text-muted">beans/</span>
						<span className="text-text">frame.tsx</span>
					</span>
				</div>

				<div
					className="relative font-mono text-[11px]"
					style={{ paddingTop: CODE_PAD, fontVariantLigatures: "none" }}
					onPointerOver={onSourceOver}
					onPointerLeave={clear}
				>
					{/* the lit run, marked the way the ring marks an element */}
					{lit ? (
						<span
							className="absolute left-0 w-[2px] bg-thread"
							style={{
								top: CODE_PAD + (lit.from - 1) * LINE_H,
								height: (lit.to - lit.from + 1) * LINE_H,
							}}
						/>
					) : null}

					{SOURCE.map((line, i) => {
						const n = i + 1;
						const on = lit ? n >= lit.from && n <= lit.to : false;
						return (
							<div
								key={n}
								data-line={n}
								className={cn(
									"flex px-4 transition-colors duration-150",
									on ? "bg-text/[0.05]" : "bg-transparent",
								)}
								style={{ height: LINE_H }}
							>
								<span
									className={cn(
										"w-7 shrink-0 pr-3 text-right leading-[15px] tabular-nums select-none",
										on ? "text-muted" : "text-muted/40",
									)}
								>
									{n}
								</span>
								<span className="leading-[15px] whitespace-pre">
									{colorize(line)}
								</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* right: the canvas region the export sits on */}
			<div
				className="absolute rounded-lg border border-border"
				style={{ left: PLATE_X, top: PANE_Y, width: PLATE_W, height: PANE_H }}
			/>

			{/* right: the export, running on the canvas */}
			<div
				className={cn(
					"absolute flex items-center gap-1.5 font-mono text-2xs leading-none text-muted/70 transition-opacity duration-150",
					sel?.bond === "card" ? "opacity-0" : "opacity-100",
				)}
				style={{ left: CARD_X + 2, top: TITLE_Y }}
			>
				<span className="h-1 w-1 rounded-full bg-thread/70" />
				beans
			</div>

			<div
				className="absolute"
				style={{ left: CARD_X, top: CARD_Y }}
				onPointerOver={onRenderOver}
				onPointerLeave={clear}
			>
				<Beans by={by} onPick={pick} anim={anim} />
			</div>

			{/* the rings: decorative, never in the way of a click */}
			<div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
				<AnimatePresence>
					{sel
						? sel.rects.map((rect, i) => (
								<SelectChrome
									key={`${sel.bond}:${i}`}
									rect={rect}
									full={i === 0}
									anim={anim}
								/>
							))
						: null}
				</AnimatePresence>
			</div>
		</div>
	);
}

export default function SiteFramesDepth() {
	return (
		<SiteSection
			title="Frames"
			lead="This is one TSX file and what it renders. Hover a row, a bar or a pill, and the lines that made it light up."
			foot={[
				"Switch the pill and the bars resize against the new largest value.",
				"State, motion and arithmetic, all running in the page you are reading.",
			]}
			morph="site-frames-card"
			back={
				<button type="button" data-go="site-hub" aria-label="Back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					Canvas
				</button>
			}
		>
			<Stage />
		</SiteSection>
	);
}
