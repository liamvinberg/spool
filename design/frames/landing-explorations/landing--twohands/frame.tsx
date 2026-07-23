import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--twohands — a landing exploration for spool.page. Concept: "twohands".
 * The finished page is quietly being worked on while you read it — a live design
 * session performed on the landing itself. Two labelled cursors take turns: an
 * "agent" hand selects the statement and retypes a word live under design-tool
 * chrome (selection ring, measured px on hairlines); a "you" hand nudges the
 * spool mark, snap guides flicker, and it springs home. The page rests on the
 * canonical line. It proves it was made in spool by still being in spool.
 *
 * Voice + copy stay canonical (frames/landing). The theater runs on one
 * deterministic timeline: a 3s opening rest so a fresh visitor meets it, then
 * quiet 8-9s gaps between events; prefers-reduced-motion suppresses it and
 * shows the finished page. All continuous motion is transform/opacity. Chrome
 * targets are measured in layout px (offsetParent chain), never gBCR: the
 * player/canvas scale the document visually, and visual boxes repositioned as
 * layout coordinates strand the chrome off-target.
 */

type Rect = { x: number; y: number; w: number; h: number };

type TState = {
	aX: number;
	aY: number;
	yX: number;
	yY: number;
	sel: boolean;
	caret: boolean;
	word: string;
	mkX: number;
	mkY: number;
	grab: boolean;
	guides: boolean;
};

const FRAME_H = 1300;
const PARK = { aX: -220, aY: 150, yX: 1580, yY: 170 };
const REST: TState = {
	...PARK,
	sel: false,
	caret: false,
	word: "feel",
	mkX: 0,
	mkY: 0,
	grab: false,
	guides: false,
};

const CURSOR_T = { type: "spring", stiffness: 74, damping: 16, mass: 1.1 } as const;

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{
		k: "your disk",
		v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts.",
	},
	{
		k: "real depth",
		v: "frames are real tsx. arbitrary js, real motion, real state.",
	},
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

/** Successive substrings deleting the last char down to "". */
const keysDel = (from: string) =>
	Array.from({ length: from.length }, (_, i) => from.slice(0, from.length - 1 - i));
/** Successive substrings typing up from "" to the word. */
const keysType = (to: string) =>
	Array.from({ length: to.length }, (_, i) => to.slice(0, i + 1));

/** The thread node that sits on the spine at the left of a section. */
function Node() {
	return (
		<span className="absolute -left-[124px] top-[9px] block h-[9px] w-[9px]">
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

/**
 * Paste-ready copy. Frames run in null-origin sandboxed srcdoc, so the async
 * Clipboard API can reject outright — try it, then fall back to the classic
 * hidden-textarea execCommand path. Silent on both branches.
 */
async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="4.25"
				y="4.25"
				width="6"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * One install line. The whole line is the button; the "$" prompt is the
 * affordance — hover swaps it for the copy glyph, the command is never covered.
 * Copying strips the prompt so the clipboard is paste-ready; the tick holds a
 * beat. A gentle magnetic lean on hover gives the CTA a little pull.
 */
function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<motion.button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
			whileHover={{ x: 4 }}
			whileTap={{ x: 2, scale: 0.995 }}
			transition={{ type: "spring", stiffness: 320, damping: 22 }}
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">
							$
						</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</motion.button>
	);
}

/** The blinking text caret shown while the agent retypes the word. */
function Caret({ anim }: { anim: boolean }) {
	return (
		<motion.span
			aria-hidden
			className="ml-[1px] inline-block w-[3px] rounded-[1px] bg-thread align-middle"
			style={{ height: "0.78em" }}
			animate={anim ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
			transition={
				anim
					? {
							duration: 1.02,
							times: [0, 0.5, 0.5, 1],
							repeat: Infinity,
							ease: "linear",
						}
					: undefined
			}
		/>
	);
}

/** A presence cursor: hand-rolled pointer plus a mono nametag flag. */
function Cursor({ tone, label }: { tone: "agent" | "you"; label: string }) {
	const fill = tone === "agent" ? "var(--color-thread)" : "var(--color-text)";
	return (
		<div className="relative">
			<svg width="22" height="24" viewBox="0 0 22 24" fill="none">
				<path
					d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z"
					fill={fill}
					stroke="var(--color-bg)"
					strokeWidth="1.4"
					strokeLinejoin="round"
				/>
			</svg>
			<span
				className={cn(
					"absolute left-[14px] top-[17px] rounded-[3px] px-1.5 py-[3px] font-mono text-2xs leading-none whitespace-nowrap",
					tone === "agent" ? "bg-thread text-on-thread" : "bg-text text-bg",
				)}
			>
				{label}
			</span>
		</div>
	);
}

/** The four corner handles of a bounding box. */
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

/** Deconstructed design-tool chrome around the statement: ring, handles, and
 *  measured px on hairlines. Measurements read the live rect of the element. */
function AgentChrome({ rect }: { rect: Rect }) {
	const pad = 9;
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
			initial={{ opacity: 0, scale: 0.985 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.99 }}
			transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
		>
			<div className="absolute inset-0 border border-thread/80" />
			<Handles />
			{/* width measure, riding a hairline above the box */}
			<div className="absolute -top-4 right-0 left-0">
				<div className="relative h-px bg-thread/55">
					<span className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-thread/55" />
					<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg px-1 font-mono text-2xs leading-none text-thread">
						{w}
					</span>
				</div>
			</div>
			{/* height measure, riding a hairline left of the box */}
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

/** Snap guides that flicker on as the mark aligns: a focused crosshair reaching
 *  just past the mark, crossing at its home. */
function SnapGuides({ rect }: { rect: Rect }) {
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	const ext = 150;
	return (
		<motion.div
			className="absolute inset-0"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.16, ease: "easeOut" }}
		>
			<div
				className="absolute w-px bg-thread/50"
				style={{ left: cx, top: rect.y - ext, height: rect.h + ext * 2 }}
			/>
			<div
				className="absolute h-px bg-thread/50"
				style={{ top: cy, left: rect.x - ext, width: rect.w + ext * 2 }}
			/>
			<div
				className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 border border-thread/70"
				style={{ left: cx, top: cy }}
			/>
		</motion.div>
	);
}

/** Bounding box that hugs the mark while the "you" hand holds it. */
function MarkChrome({ dx, dy }: { dx: number; dy: number }) {
	return (
		<motion.div
			className="pointer-events-none absolute -inset-3 z-20"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.2 }}
		>
			<div className="absolute inset-0 border border-thread/80" />
			<Handles />
			<span className="absolute -top-5 left-0 font-mono text-2xs leading-none whitespace-nowrap text-thread">
				{dx} · {dy}
			</span>
		</motion.div>
	);
}

export default function LandingTwoHands() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const wrapRef = useRef<HTMLDivElement>(null);
	const h1Ref = useRef<HTMLHeadingElement>(null);
	const markRef = useRef<HTMLDivElement>(null);
	const [h1Rect, setH1Rect] = useState<Rect | null>(null);
	const [markRect, setMarkRect] = useState<Rect | null>(null);
	const [st, setSt] = useState<TState>(REST);

	// The deterministic theater timeline. One recursive timer walks a fixed list
	// of steps and loops seamlessly back to rest; cleaned up on unmount. Cursor
	// targets are read from the measured rects at run time. Suppressed entirely
	// under reduced motion, leaving the finished page.
	useEffect(() => {
		if (reduce) return;
		const patch = (p: Partial<TState>) => setSt((s) => ({ ...s, ...p }));
		// Measured fresh on every read, in layout px via the offsetParent chain:
		// the overlay positions chrome with layout coordinates inside the same
		// document, so the two sides must share a space. getBoundingClientRect
		// reports visual boxes, which any transform between the document and the
		// screen (player letterboxing, canvas zoom) distorts against layout px.
		const R = (): { h1: Rect | null; mark: Rect | null } => {
			const wrap = wrapRef.current;
			if (!wrap) return { h1: null, mark: null };
			const rel = (el: HTMLElement | null): Rect | null => {
				if (!el) return null;
				let x = 0;
				let y = 0;
				let n: HTMLElement | null = el;
				while (n && n !== wrap) {
					x += n.offsetLeft;
					y += n.offsetTop;
					n = n.offsetParent as HTMLElement | null;
				}
				return { x, y, w: el.offsetWidth, h: el.offsetHeight };
			};
			const rects = { h1: rel(h1Ref.current), mark: rel(markRef.current) };
			setH1Rect(rects.h1);
			setMarkRect(rects.mark);
			return rects;
		};
		type Step = { hold: number; run: () => void };
		const seq: Step[] = [];
		const add = (hold: number, run: () => void = () => {}) =>
			seq.push({ hold, run });

		// rest — the finished page (this is where the static shot lands)
		add(9000, () => patch(REST));

		// the agent hand: select the statement, weigh a word, commit to the line
		add(1500, () => {
			const h = R().h1;
			if (h) patch({ aX: h.x - 26, aY: h.y - 6 });
		});
		add(720, () => {
			const h = R().h1;
			if (h) patch({ aX: h.x + 48, aY: h.y + 14 });
		});
		add(600, () => patch({ sel: true, caret: true }));
		for (const w of keysDel("feel")) add(95, () => patch({ word: w }));
		add(280);
		for (const w of keysType("see")) add(115, () => patch({ word: w }));
		add(950); // weigh it
		for (const w of keysDel("see")) add(95, () => patch({ word: w }));
		add(240);
		for (const w of keysType("feel")) add(115, () => patch({ word: w }));
		add(820); // settle on the keeper
		add(520, () => patch({ sel: false, caret: false }));
		add(300, () => {
			const h = R().h1;
			if (h) patch({ aX: h.x - 74, aY: h.y - 48 });
		});
		add(1300, () => patch({ aX: PARK.aX, aY: PARK.aY }));

		// quiet
		add(8500);

		// the you hand: grab the mark, nudge it, let it snap home
		add(1500, () => {
			const m = R().mark;
			if (m) patch({ yX: m.x + m.w + 26, yY: m.y + 22 });
		});
		add(650, () => {
			const m = R().mark;
			if (m) patch({ yX: m.x + m.w * 0.5, yY: m.y + m.h * 0.52 });
		});
		add(420, () => patch({ grab: true }));
		add(720, () => {
			const m = R().mark;
			if (m)
				patch({
					mkX: -34,
					mkY: 12,
					yX: m.x + m.w * 0.5 - 34,
					yY: m.y + m.h * 0.52 + 12,
				});
		});
		add(150, () => patch({ guides: true }));
		add(560);
		add(160, () => {
			const m = R().mark;
			if (m) patch({ mkX: 0, mkY: 0, yX: m.x + m.w * 0.5, yY: m.y + m.h * 0.52 });
		});
		add(560);
		add(360, () => patch({ guides: false }));
		add(320, () => patch({ grab: false }));
		add(1400, () => patch({ yX: PARK.yX, yY: PARK.yY }));

		let i = 0;
		let id = 0;
		let first = true;
		const tick = () => {
			seq[i].run();
			// the opening rest is short so a fresh visitor meets the theater at
			// ~3s; every later loop rests the full quiet beat
			const hold = i === 0 && first ? 3000 : seq[i].hold;
			if (i === 0) first = false;
			i = (i + 1) % seq.length;
			id = window.setTimeout(tick, hold);
		};
		tick();
		return () => window.clearTimeout(id);
	}, [reduce]);

	return (
		<div
			ref={wrapRef}
			className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased"
		>
			{/* thread spine */}
			<div
				className="absolute inset-y-0 left-[200px] w-px"
				style={{
					background:
						"linear-gradient(to bottom, transparent 0%, rgba(245,57,26,0.55) 4%, rgba(245,57,26,0.55) 96%, transparent 100%)",
				}}
			>
				{anim && (
					<motion.span
						className="absolute top-0 left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-thread to-transparent"
						animate={{ y: [-140, FRAME_H + 120] }}
						transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
					/>
				)}
			</div>

			<div className="relative pr-[120px] pl-[320px]">
				{/* header */}
				<header className="flex items-center justify-between py-11">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
						<span className="ml-1.5 flex items-center gap-1.5 font-mono text-2xs text-muted">
							<span className="relative flex h-1.5 w-1.5 items-center justify-center">
								{anim && (
									<motion.span
										className="absolute h-1.5 w-1.5 rounded-full bg-thread"
										animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
										transition={{
											duration: 2.2,
											repeat: Infinity,
											ease: "easeOut",
										}}
									/>
								)}
								<span className="h-1.5 w-1.5 rounded-full bg-thread" />
							</span>
							live
						</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-xs text-muted">
						<span>spool.page</span>
						<a
							href="https://github.com/liamvinberg/spool"
							className="text-text transition-colors hover:text-thread"
						>
							github.com/liamvinberg/spool
						</a>
					</div>
				</header>

				{/* hero — statement, then the install as the second beat */}
				<section className="relative grid grid-cols-[1fr_auto] items-center gap-16 pt-16 pb-12">
					<div className="max-w-[620px]">
						<Node />
						<motion.h1
							ref={h1Ref}
							className="w-fit text-[76px] font-semibold leading-[0.98]"
							style={{ letterSpacing: "-1.5px" }}
							whileHover={anim ? { letterSpacing: "-0.4px" } : undefined}
							transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
						>
							<span>{st.word}</span>
							{st.caret && <Caret anim={anim} />}
							<span>{" an app"}</span>
							<br />
							before it exists
						</motion.h1>
						<p className="mt-8 max-w-[480px] text-[19px] leading-[28px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on an
							infinite canvas and links them into walkable flows. you feel the
							real thing, interactions and motion and inputs, before it exists.
						</p>

						{/* install — the second beat, the thread pointing at the action */}
						<div className="mt-10">
							<div className="flex gap-5">
								<span className="w-px shrink-0 self-stretch bg-thread/70" />
								<div className="w-[340px] font-mono text-[16px] leading-[32px]">
									<CommandLine command="npm i -g spool.page" />
									<CommandLine command="spool init" />
									<CommandLine command="spool serve" />
								</div>
							</div>
							<div className="mt-6 pl-[25px] font-mono text-xs text-muted">
								requires node 22+ · best in chrome · macos-first today
							</div>
						</div>
					</div>

					<div ref={markRef} className="relative w-[300px] shrink-0">
						<motion.div
							animate={anim && !st.grab ? { y: [0, -14, 0] } : { y: 0 }}
							transition={
								anim && !st.grab
									? { duration: 6, repeat: Infinity, ease: "easeInOut" }
									: { duration: 0.4, ease: "easeOut" }
							}
						>
							<motion.div
								className="relative"
								animate={{ x: st.mkX, y: st.mkY, scale: st.grab ? 0.985 : 1 }}
								transition={{ type: "spring", stiffness: 260, damping: 18 }}
							>
								<motion.div
									whileHover={anim ? { scale: 1.03 } : undefined}
									transition={{ type: "spring", stiffness: 300, damping: 20 }}
								>
									<SpoolMark
										className="w-full text-thread"
										title="spool ribbon"
									/>
								</motion.div>
								<AnimatePresence>
									{st.grab && <MarkChrome dx={st.mkX} dy={st.mkY} />}
								</AnimatePresence>
							</motion.div>
						</motion.div>
					</div>
				</section>

				{/* the concept, owned in one line, with the source that proves it */}
				<section className="relative pt-12">
					<Node />
					<p className="text-[30px] leading-[1.25] font-medium tracking-tight">
						<span className="block">this page is still being prototyped.</span>
						<span className="block text-muted">that is the point.</span>
					</p>
					<p className="mt-5 font-mono text-xs">
						<span className="text-muted/60">design/frames/</span>
						<span className="text-muted">landing--twohands/</span>
						<span className="text-text">frame.tsx</span>
					</p>
				</section>

				{/* stance */}
				<section className="relative mt-16 border-t border-border pt-14">
					<Node />
					<div className="grid grid-cols-2 gap-x-16 gap-y-12">
						{stance.map((s, i) => (
							<div key={s.k} className="group flex cursor-default gap-5">
								<span className="mt-1 font-mono text-xs text-muted transition-colors duration-300 group-hover:text-thread">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div>
									<div className="text-lg font-semibold tracking-tight">
										{s.k}
									</div>
									<p className="mt-2 max-w-[320px] text-md leading-[22px] text-muted">
										{s.v}
									</p>
								</div>
							</div>
						))}
					</div>
				</section>

				{/* footer */}
				<footer className="mt-12 flex items-center justify-between border-t border-border py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-sm text-muted">spool.page</span>
					</div>
					<a
						href="https://github.com/liamvinberg/spool"
						className="font-mono text-xs text-muted transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</footer>
			</div>

			{/* theater overlays — decorative, never intercept real hovers */}
			<div className="pointer-events-none absolute inset-0 z-40" aria-hidden>
				<AnimatePresence>
					{st.sel && h1Rect && <AgentChrome key="agent-chrome" rect={h1Rect} />}
				</AnimatePresence>
				<AnimatePresence>
					{st.guides && markRect && <SnapGuides key="guides" rect={markRect} />}
				</AnimatePresence>
				<motion.div
					className="absolute top-0 left-0"
					initial={false}
					animate={{ x: st.aX, y: st.aY }}
					transition={CURSOR_T}
				>
					<Cursor tone="agent" label="agent" />
				</motion.div>
				<motion.div
					className="absolute top-0 left-0"
					initial={false}
					animate={{ x: st.yX, y: st.yY }}
					transition={CURSOR_T}
				>
					<Cursor tone="you" label="you" />
				</motion.div>
			</div>
		</div>
	);
}
