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

/**
 * site-frames — the "frames" section of the spool.page canvas-as-navigation
 * site. A page frame inside the landing-site page; reached from the hub, back to
 * the hub. The claim of this section is the hardest one to say in words, so the
 * body proves it instead: on the left the honest frame.tsx source, on the right
 * the exact thing it renders, live and inspectable. Source and render are the
 * same object — the author keeps re-typing the button label and the running
 * frame follows every keystroke; you click the frame and its state is real.
 *
 * The selection ring measures in layout px through the offsetParent chain, never
 * getBoundingClientRect (#53): the ring is positioned in the mini-frame panel's
 * layout space and the player/canvas scale the document visually, so a visual box
 * read back as layout coordinates would strand the chrome. Boot pose is composed
 * instantly — nothing animates in; the caret blink and the label loop are the
 * only life, and the label loop waits ~6.5s so a fresh-boot shot is at rest.
 * prefers-reduced-motion leaves the finished page with hover rings and no loops.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Inspect = { id: string; rect: Rect };

const RING_EASE = [0.22, 1, 0.36, 1] as const;

// The honest source, verbatim — exactly the component the mini frame renders.
// Everything sits complete; the one live line is the button label (line 13),
// the one thing the author keeps tweaking. Lines stay short so the mono pane
// never wraps (a wrap would desync the line-number gutter).
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

// Two-shade syntax coloring: words in ink, keywords and every symbol in muted.
// No rainbow — the caret is the only red. Same stance as landing--selfsource.
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
 * hairlines above and to the left. The rect is the target's live layout box,
 * measured through the offsetParent chain, so the box hugs the real element.
 * (The twohands pattern; getBoundingClientRect is never used.)
 */
function SelectChrome({ rect, anim }: { rect: Rect; anim: boolean }) {
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
			initial={anim ? { opacity: 0, scale: 0.985 } : { opacity: 0 }}
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
					<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg px-1 font-mono text-2xs leading-none text-thread">
						{w}
					</span>
				</div>
			</div>
			{/* height, on a hairline left of the box */}
			<div className="absolute top-0 bottom-0 -left-4">
				<div className="relative h-full w-px bg-thread/55">
					<span className="absolute top-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-thread/55" />
					<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg px-1 font-mono text-2xs leading-none text-thread">
						{h}
					</span>
				</div>
			</div>
		</motion.div>
	);
}

/** The back chip: a bordered mono pill that walks to the hub. */
function BackChip() {
	return (
		<button
			type="button"
			data-go="site-hub"
			className="group inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface/50 px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-thread/40 hover:text-text"
		>
			<span className="text-muted transition-colors group-hover:text-thread">
				←
			</span>
			canvas
		</button>
	);
}

/** The three quiet beats, hung on a short thread tick. */
function Beats() {
	return (
		<div className="flex gap-4">
			<span className="w-px shrink-0 self-stretch bg-thread/60" />
			<div className="space-y-1.5 font-mono text-xs text-muted">
				<p>arbitrary js</p>
				<p>real motion</p>
				<p>real state</p>
			</div>
		</div>
	);
}

export default function SiteFrames() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	// The mini frame's real state: cups is the counter, label is the button text
	// the source keeps re-typing. Both the source line and the rendered button
	// read `label`, so an edit on the left is the same edit on the right.
	const [cups, setCups] = useState(2);
	const [label, setLabel] = useState(REST_LABEL);
	const [editing, setEditing] = useState(false);

	// The hover selection, one target at a time, measured in the panel's layout.
	const wrapRef = useRef<HTMLDivElement>(null);
	const [inspect, setInspect] = useState<Inspect | null>(null);

	const countControls = useAnimationControls();
	const firstCount = useRef(true);

	// Layout px through the offsetParent chain, relative to the panel the overlay
	// shares. offsetLeft/offsetTop ignore transforms, so the counter's press-pop
	// never moves the ring; only a digit- or label-width change does, and the
	// re-measure effect below catches those. getBoundingClientRect is never used.
	const measure = useCallback((el: HTMLElement | null): Rect | null => {
		const wrap = wrapRef.current;
		if (!wrap || !el) return null;
		let x = 0;
		let y = 0;
		let n: HTMLElement | null = el;
		while (n && n !== wrap) {
			x += n.offsetLeft;
			y += n.offsetTop;
			n = n.offsetParent as HTMLElement | null;
		}
		return { x, y, w: el.offsetWidth, h: el.offsetHeight };
	}, []);

	// Nearest data-inspect ancestor of the pointer target wins — pointerover
	// bubbles, so one handler resolves the whole nested set cleanly.
	const onOver = useCallback(
		(e: RPointerEvent<HTMLDivElement>) => {
			const wrap = wrapRef.current;
			const target = (e.target as HTMLElement).closest<HTMLElement>(
				"[data-inspect]",
			);
			if (!wrap || !target || !wrap.contains(target)) return;
			const id = target.getAttribute("data-inspect");
			if (!id) return;
			const rect = measure(target);
			if (!rect) return;
			setInspect((cur) => (cur && cur.id === id ? cur : { id, rect }));
		},
		[measure],
	);
	const onLeave = useCallback(() => setInspect(null), []);

	// Keep the ring on its target when the counter or the label changes width.
	useLayoutEffect(() => {
		if (!inspect) return;
		const wrap = wrapRef.current;
		if (!wrap) return;
		const el = wrap.querySelector<HTMLElement>(
			`[data-inspect="${inspect.id}"]`,
		);
		const rect = measure(el);
		if (!rect) return;
		setInspect((cur) => {
			if (!cur) return cur;
			const same =
				Math.round(cur.rect.x) === Math.round(rect.x) &&
				Math.round(cur.rect.y) === Math.round(rect.y) &&
				Math.round(cur.rect.w) === Math.round(rect.w) &&
				Math.round(cur.rect.h) === Math.round(rect.h);
			return same ? cur : { id: cur.id, rect };
		});
	}, [cups, label, inspect?.id, measure]);

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

	// The long quiet loop: the author re-types the button label, the running
	// frame follows. First edit ~6.5s in, so a fresh-boot shot lands at rest.
	useEffect(() => {
		if (!anim) return;
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
			if (!cancelled) setLabel(s);
		};
		const erase = async (from: string) => {
			for (let i = from.length; i >= 0; i--) {
				if (cancelled) return;
				set(from.slice(0, i));
				await sleep(58);
			}
		};
		const write = async (to: string) => {
			for (let i = 1; i <= to.length; i++) {
				if (cancelled) return;
				set(to.slice(0, i));
				await sleep(82);
			}
		};
		const swap = async (from: string, to: string) => {
			setEditing(true);
			await erase(from);
			await sleep(240);
			await write(to);
			setEditing(false);
		};
		const loop = async () => {
			await sleep(6500);
			while (!cancelled) {
				await swap(REST_LABEL, ALT_LABEL);
				await sleep(2400);
				await swap(ALT_LABEL, REST_LABEL);
				await sleep(15000);
			}
		};
		loop();
		return () => {
			cancelled = true;
			for (const t of timers) window.clearTimeout(t);
		};
	}, [anim]);

	const caretBlink = anim && !editing;

	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased">
			{/* top bar */}
			<div className="flex items-center px-24 pt-14">
				<BackChip />
			</div>

			{/* heading — the morph target shared with the hub tile */}
			<div className="px-24 pt-10" style={{ viewTransitionName: "site-frames-card" }}>
				<h1 className="text-[72px] leading-none font-semibold tracking-[-0.02em]">
					frames
				</h1>
				<p className="mt-4 text-lg text-muted">
					your agent writes a tsx file. it appears on the canvas, live.
				</p>
			</div>

			{/* the body is the demo */}
			<div className="flex flex-1 items-center px-24 pb-12">
				<div className="flex w-full items-start gap-16">
					{/* left — the honest source */}
					<div className="flex w-[580px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
						<div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
							<motion.span
								className="h-1.5 w-1.5 rounded-full bg-thread"
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
							<span className="font-mono text-xs">
								<span className="text-muted/50">design/frames/</span>
								<span className="text-muted">espresso/</span>
								<span className="text-text">frame.tsx</span>
							</span>
						</div>
						<div
							className="px-5 py-4 font-mono text-[12px] leading-[20px]"
							style={{ fontVariantLigatures: "none" }}
						>
							{HEAD_LINES.map((ln, i) => (
								<CodeRow key={i} n={i + 1}>
									{colorize(ln)}
								</CodeRow>
							))}
							<CodeRow n={LABEL_LINE}>
								{colorize(LABEL_INDENT + label)}
								<Caret blink={caretBlink} />
							</CodeRow>
							{TAIL_LINES.map((ln, i) => (
								<CodeRow key={i} n={LABEL_LINE + 1 + i}>
									{colorize(ln)}
								</CodeRow>
							))}
						</div>
					</div>

					{/* right — the exact thing it renders, on the canvas */}
					<div className="flex min-w-0 flex-1 flex-col gap-6">
						<div
							ref={wrapRef}
							onPointerOver={onOver}
							onPointerLeave={onLeave}
							className="relative h-[412px] overflow-hidden rounded-lg border border-border bg-canvas"
						>
							{/* the canvas grain */}
							<div
								className="pointer-events-none absolute inset-0"
								style={{
									backgroundImage:
										"radial-gradient(circle, rgba(240,239,237,0.065) 1px, transparent 1.4px)",
									backgroundSize: "22px 22px",
								}}
							/>

							{/* the rendered frame, titled the way the canvas titles a frame */}
							<div className="relative flex h-full items-center justify-center">
								<div>
									<div className="mb-2 flex items-center gap-1.5 pl-0.5 font-mono text-2xs text-muted/70">
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
							<div
								className="pointer-events-none absolute inset-0 z-20"
								aria-hidden
							>
								<AnimatePresence>
									{inspect && (
										<SelectChrome
											key={inspect.id}
											rect={inspect.rect}
											anim={anim}
										/>
									)}
								</AnimatePresence>
							</div>
						</div>

						<Beats />
					</div>
				</div>
			</div>
		</div>
	);
}

/** One source line: gutter number plus its colorized content. */
function CodeRow({ n, children }: { n: number; children: ReactNode }) {
	return (
		<div className="flex">
			<span className="w-8 shrink-0 select-none pr-3 text-right text-muted/45 tabular-nums">
				{n}
			</span>
			<span className="whitespace-pre">{children}</span>
		</div>
	);
}
