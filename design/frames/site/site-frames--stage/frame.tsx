import {
	AnimatePresence,
	motion,
	useAnimationControls,
	useReducedMotion,
} from "motion/react";
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
import { backArrowClass, backChipClass, dotGrid, SiteSection, STAGE_H, STAGE_W } from "../../../shared/ui/site-section";

/**
 * site-frames--stage: the "frames" section of spool.page, rehoused in the shared
 * section shell so it reads as site-states' sibling. The claim is the hardest one
 * to say in words, so the body proves it: on the left the honest frame.tsx, on
 * the right the exact thing it renders, live and inspectable. Source and render
 * are one object — the author keeps re-typing the button label and the running
 * frame follows every keystroke; click the button and the count is really state.
 *
 * What changed from site-frames is composition only. The demo now sits inside
 * one bordered stage on the dot grid, at the house 56px gutter, under the big
 * heading and above two quiet mono lines — all of which the shell owns, so the
 * chrome is not re-typed here and the single viewTransitionName rides the stage.
 * The panel and the canvas pane were re-proportioned to fit 1328x620 (the source
 * grew from 12/20 to 13/22 so the code fills its plate; the canvas pane lost its
 * private 22px grain and wears the stage's own 30px grid, origin-aligned, so the
 * two read as one material).
 *
 * The peer rhythm, borrowed from site-states' play head: a slow loop walks the
 * selection ring through the three elements it can select, card to count to
 * button, and every time it lands on the button the author retypes the label. One
 * pulse, not two. Hovering the pane takes the ring over and holds the loop ~9s
 * past the pointer leaving. Beat 0 is the boot pose and never animates, so a
 * fresh shot lands at rest with the ring already reading 260 x 160.
 *
 * The ring measures in layout px through the offsetParent chain, never
 * getBoundingClientRect: it is positioned in the pane's layout space and the
 * player scales the document, so a visual box read back as layout coords would
 * strand the chrome. Every other number here is fixed px. Reduced motion parks
 * the loops and leaves hover selection working.
 */

type Rect = { x: number; y: number; w: number; h: number };

const RING_EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- the honest source, verbatim ---------- */

// Exactly the component the pane renders. Everything sits complete; the one live
// line is the button label (line 13), the one thing the author keeps tweaking.
// Lines stay short so the mono pane never wraps (a wrap desyncs the gutter).
const HEAD_LINES = [
	`import { useState } from "react"`,
	``,
	`export default function Espresso() {`,
	`  const [cups, setCups] = useState(2)`,
	`  return (`,
	`    <div className="rounded-lg border border-border p-5">`,
	`      <p className="text-sm text-muted">espresso</p>`,
	`      <p className="mt-2 text-[52px] font-semibold">{cups}</p>`,
	`      <button`,
	`        onClick={() => setCups(cups + 1)}`,
	`        className="rounded-md border px-3 py-1 text-xs text-thread"`,
	`      >`,
];
const LABEL_INDENT = "        "; // eight spaces, inside <button>
const TAIL_LINES = [`      </button>`, `    </div>`, `  )`, `}`];
const LABEL_LINE = HEAD_LINES.length + 1; // 1-based gutter number for the label

const REST_LABEL = "one more";
const ALT_LABEL = "another";

// Two-shade coloring: identifiers in ink, keywords and every symbol in muted. No
// rainbow — the caret is the only red on this plate.
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

/** One source line: gutter number plus its colorized content. */
function CodeRow({ n, children }: { n: number; children: ReactNode }) {
	return (
		<div className="flex">
			<span className="w-9 shrink-0 pr-3 text-right text-muted/45 tabular-nums select-none">
				{n}
			</span>
			<span className="whitespace-pre">{children}</span>
		</div>
	);
}

/** The thread caret. Blinks while idle, holds solid while the author types. */
function Caret({ blink }: { blink: boolean }) {
	return (
		<motion.span
			aria-hidden
			className="ml-px inline-block w-[2px] bg-thread align-[-0.16em]"
			style={{ height: "1.05em" }}
			animate={blink ? { opacity: [1, 1, 0.15, 0.15, 1] } : { opacity: 1 }}
			transition={
				blink
					? {
							duration: 1.25,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
							times: [0, 0.45, 0.5, 0.9, 1],
						}
					: { duration: 0.18 }
			}
		/>
	);
}

/* ---------- the selection chrome ---------- */

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
 * Design-tool chrome around a target: ring, corner handles, and true px riding
 * hairlines above and to the left. The rect is the target's live layout box, so
 * the box hugs the real element. `instant` is the boot pose: it composes with no
 * animation at all, which is what leaves a fresh shot at rest.
 */
function SelectChrome({
	rect,
	anim,
	instant,
}: {
	rect: Rect;
	anim: boolean;
	instant: boolean;
}) {
	const pad = 8;
	const w = Math.round(rect.w);
	const h = Math.round(rect.h);
	return (
		<motion.div
			className="absolute"
			style={{
				left: rect.x - pad,
				top: rect.y - pad,
				width: rect.w + pad * 2,
				height: rect.h + pad * 2,
			}}
			initial={instant ? false : anim ? { opacity: 0, scale: 0.985 } : { opacity: 0 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={anim ? { opacity: 0, scale: 0.99 } : { opacity: 0 }}
			transition={{ duration: anim ? 0.2 : 0.1, ease: RING_EASE }}
		>
			<div className="absolute inset-0 border border-thread/80" />
			<Handles />
			{/* width, on a hairline above the box */}
			<div className="absolute -top-4 right-0 left-0">
				<div className="relative h-px bg-thread/55">
					<span className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
						{w}
					</span>
				</div>
			</div>
			{/* height, on a hairline left of the box */}
			<div className="absolute top-0 bottom-0 -left-4">
				<div className="relative h-full w-px bg-thread/55">
					<span className="absolute top-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-1 font-mono text-2xs leading-none text-thread">
						{h}
					</span>
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- stage geometry: fixed px, never measured ---------- */

const PANEL_X = 56;
const PANEL_Y = 60;
const PANEL_W = 640;
const PANEL_H = 460;
// The pane's origin is a whole number of grid cells from the stage's, so its own
// 30px grid continues the stage's instead of fighting it.
const PANE_X = 750;
const PANE_Y = 60;
const PANE_W = STAGE_W - PANE_X - 56;
const PANE_H = PANEL_H;
const NOTE_Y = STAGE_H - 78; // the note row, 22px under both plates

const BEAT_MS = 4200;
const PAUSE_MS = 9000;

// The three elements the ring can land on, in the source's own reading order.
const STEPS = ["card", "count", "button"] as const;

function sameRect(a: Rect | null, b: Rect | null): boolean {
	if (!a || !b) return a === b;
	return (
		Math.round(a.x) === Math.round(b.x) &&
		Math.round(a.y) === Math.round(b.y) &&
		Math.round(a.w) === Math.round(b.w) &&
		Math.round(a.h) === Math.round(b.h)
	);
}

/* ---------- the demo ---------- */

function Demo() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	// The frame's real state: cups is the counter, label is the button text the
	// source keeps re-typing. Source line and rendered button both read `label`,
	// so an edit on the left is the same edit on the right.
	const [cups, setCups] = useState(2);
	const [label, setLabel] = useState(REST_LABEL);
	const [editing, setEditing] = useState(false);
	const labelRef = useRef(REST_LABEL);

	// The play head: the loop's step, its beat (0 is the boot pose), and the hover
	// that takes it over. Hover always wins the ring; the loop holds while it does.
	const [step, setStep] = useState(0);
	const [beat, setBeat] = useState(0);
	const [hover, setHover] = useState<string | null>(null);
	const [pausedUntil, setPausedUntil] = useState(0);
	const [booted, setBooted] = useState(false);
	const selId = hover ?? STEPS[step] ?? STEPS[0];

	const paneRef = useRef<HTMLDivElement>(null);
	const [rect, setRect] = useState<Rect | null>(null);

	const countControls = useAnimationControls();
	const firstCount = useRef(true);

	// Layout px through the offsetParent chain, relative to the pane the overlay
	// shares. offsetLeft/offsetTop ignore transforms, so the counter's press-pop
	// never moves the ring; only a real width change does, and the re-measure
	// below catches those. getBoundingClientRect is never used.
	const measure = useCallback((el: HTMLElement | null): Rect | null => {
		const pane = paneRef.current;
		if (!pane || !el) return null;
		let x = 0;
		let y = 0;
		let n: HTMLElement | null = el;
		while (n && n !== pane) {
			x += n.offsetLeft;
			y += n.offsetTop;
			n = n.offsetParent as HTMLElement | null;
		}
		return { x, y, w: el.offsetWidth, h: el.offsetHeight };
	}, []);

	// One measure path for both hands: whatever is selected, and whenever the
	// content under it changes width. Layout effect, so nothing paints stale.
	useLayoutEffect(() => {
		const pane = paneRef.current;
		if (!pane) return;
		const el = pane.querySelector<HTMLElement>(`[data-inspect="${selId}"]`);
		const next = measure(el);
		setRect((cur) => (sameRect(cur, next) ? cur : next));
	}, [selId, cups, label, measure]);

	useEffect(() => {
		setBooted(true);
	}, []);

	// Nearest data-inspect ancestor of the pointer target wins — pointerover
	// bubbles, so one handler resolves the whole nested set cleanly.
	const onOver = useCallback((e: RPointerEvent<HTMLDivElement>) => {
		const pane = paneRef.current;
		const target = (e.target as HTMLElement).closest<HTMLElement>("[data-inspect]");
		if (!pane || !target || !pane.contains(target)) return;
		const id = target.getAttribute("data-inspect");
		if (!id) return;
		setHover((cur) => (cur === id ? cur : id));
	}, []);

	// Letting go hands the ring back to the loop, which waits ~9s before moving.
	const onLeave = useCallback(() => {
		setHover(null);
		setPausedUntil(Date.now() + PAUSE_MS);
	}, []);

	// The slow loop: the ring walks card, count, button. A visitor holding the
	// pane stops it dead; letting go restarts the clock.
	useEffect(() => {
		if (!anim || hover !== null) return;
		const wait = Math.max(BEAT_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => {
			setStep((s) => (s + 1) % STEPS.length);
			setBeat((b) => b + 1);
		}, wait);
		return () => window.clearTimeout(id);
	}, [step, pausedUntil, anim, hover]);

	// The same pulse, one beat later: every time the head lands on the button, the
	// author retypes its label and the running frame follows every keystroke. Beat
	// 0 is the boot pose, so the first edit is two beats in.
	useEffect(() => {
		if (!anim || beat === 0 || STEPS[step] !== "button") return;
		let cancelled = false;
		const timers = new Set<number>();
		const sleep = (ms: number) =>
			new Promise<void>((res) => {
				const t = window.setTimeout(() => {
					timers.delete(t);
					res();
				}, ms);
				timers.add(t);
			});
		const set = (s: string) => {
			if (cancelled) return;
			labelRef.current = s;
			setLabel(s);
		};
		const run = async () => {
			const from = labelRef.current;
			const to = from === REST_LABEL ? ALT_LABEL : REST_LABEL;
			setEditing(true);
			for (let i = from.length; i >= 0; i--) {
				if (cancelled) return;
				set(from.slice(0, i));
				await sleep(58);
			}
			await sleep(240);
			for (let i = 1; i <= to.length; i++) {
				if (cancelled) return;
				set(to.slice(0, i));
				await sleep(82);
			}
			if (!cancelled) setEditing(false);
		};
		run();
		return () => {
			cancelled = true;
			for (const t of timers) window.clearTimeout(t);
			setEditing(false);
		};
	}, [anim, beat, step]);

	// Real motion: the count pops when it changes. Skipped on first render so the
	// boot pose is composed, and suppressed whole under reduced motion.
	useEffect(() => {
		if (firstCount.current) {
			firstCount.current = false;
			return;
		}
		if (!anim) return;
		countControls.start({ scale: [1, 1.16, 1] });
	}, [cups, anim, countControls]);

	return (
		<>
			{/* left — the honest source, the one live line and its caret */}
			<div
				className="absolute flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
				style={{ left: PANEL_X, top: PANEL_Y, width: PANEL_W, height: PANEL_H }}
			>
				<div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-border px-5">
					<motion.span
						className="h-1.5 w-1.5 shrink-0 rounded-full bg-thread"
						animate={anim ? { opacity: [0.4, 1, 0.4] } : { opacity: 0.7 }}
						transition={
							anim
								? {
										duration: 2.4,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}
								: { duration: 0.3 }
						}
					/>
					<span className="font-mono text-[12px] leading-none">
						<span className="text-muted/50">design/frames/</span>
						<span className="text-muted">espresso/</span>
						<span className="text-text">frame.tsx</span>
					</span>
				</div>
				<div
					className="flex min-h-0 flex-1 flex-col justify-center px-5 font-mono text-[13px] leading-[22px]"
					style={{ fontVariantLigatures: "none" }}
				>
					{HEAD_LINES.map((ln, i) => (
						<CodeRow key={`head-${i}`} n={i + 1}>
							{colorize(ln)}
						</CodeRow>
					))}
					<CodeRow n={LABEL_LINE}>
						{colorize(LABEL_INDENT + label)}
						<Caret blink={anim && !editing} />
					</CodeRow>
					{TAIL_LINES.map((ln, i) => (
						<CodeRow key={`tail-${i}`} n={LABEL_LINE + 1 + i}>
							{colorize(ln)}
						</CodeRow>
					))}
				</div>
			</div>

			{/* right — the exact thing it renders, on the canvas, selectable */}
			<div
				ref={paneRef}
				onPointerOver={onOver}
				onPointerLeave={onLeave}
				className="absolute overflow-hidden rounded-lg border border-border bg-canvas"
				style={{
					left: PANE_X,
					top: PANE_Y,
					width: PANE_W,
					height: PANE_H,
					...dotGrid,
				}}
			>
				<div className="relative flex h-full items-center justify-center">
					<div>
						{/* the canvas titles a frame above it; the gap clears the ring's
						    width hairline, which rides 24px over the selection */}
						<div className="mb-10 flex items-center gap-1.5 pl-0.5 font-mono text-2xs leading-none text-muted/70">
							<span className="h-1 w-1 rounded-full bg-thread/70" />
							frame.tsx
						</div>
						<div
							data-inspect="card"
							className="w-[260px] rounded-lg border border-border bg-bg p-5"
						>
							<p className="text-sm text-muted">espresso</p>
							<motion.p
								data-inspect="count"
								animate={countControls}
								transition={{ duration: 0.32, ease: "easeOut" }}
								style={{ transformOrigin: "left center" }}
								className="mt-2 text-[52px] leading-none font-semibold tabular-nums"
							>
								{cups}
							</motion.p>
							{/* bare `border` on purpose: the printed line says exactly this, and
							    tailwind's default border color is currentColor, so the outline
							    really is the thread the source asked for */}
							<button
								data-inspect="button"
								type="button"
								onClick={() => setCups((c) => c + 1)}
								className="mt-4 inline-flex w-[112px] cursor-pointer justify-center rounded-md border px-3 py-1 text-xs text-thread transition-colors hover:bg-thread/10"
							>
								{label}
							</button>
						</div>
					</div>
				</div>

				{/* the selection overlay — decorative, never intercepts a click */}
				<div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
					<AnimatePresence>
						{rect ? (
							<SelectChrome
								key={selId}
								rect={rect}
								anim={anim}
								instant={!booted}
							/>
						) : null}
					</AnimatePresence>
				</div>
			</div>

			{/* what each plate is, said once, quietly */}
			<span
				className="absolute font-mono text-2xs leading-none text-muted/80"
				style={{ left: PANEL_X, top: NOTE_Y }}
			>
				seventeen lines, nothing trimmed. this is the whole file.
			</span>
			<span
				className="absolute font-mono text-2xs leading-none text-muted/80"
				style={{ left: PANE_X, top: NOTE_Y }}
			>
				the same file, running. hover an element, click the button.
			</span>
		</>
	);
}

export default function SiteFramesStage() {
	return (
		<SiteSection
			title="frames"
			lead="your agent writes a tsx file. it appears on the canvas, live."
			foot={[
				"no story wrapper, no preview harness. the file is the frame.",
				"source and render are one object. edit one and both move.",
			]}
			morph="site-frames-card"
			back={
				<button type="button" data-go="site-hub" aria-label="back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					canvas
				</button>
			}
		>
			<Demo />
		</SiteSection>
	);
}
