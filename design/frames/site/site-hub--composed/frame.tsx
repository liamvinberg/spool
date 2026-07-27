import {
	AnimatePresence,
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ui } from "spool";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-hub--composed. The spool.page landing, whole: the page and the canvas it
 * turns out to be sitting on, in one continuous scroll.
 *
 * The four explorations that fed this one each designed the revealed pose only,
 * because that is what they were asked for. The revealed pose is not the page.
 * The page starts at the landing filling the viewport, and the whole moment is
 * what happens as you scroll out of it. So the arc is site-hub's, inherited
 * wholesale: scroll 0 is the full landing with its statement, install line and
 * scroll hint; scrolling shrinks the entire page into its red-ringed frame on a
 * dot-grid canvas; crossing the reveal threshold writes ui.state.hubRevealed and
 * is fully reversible. Transform and opacity only, nothing measured at runtime,
 * one fixed 1440x900 coordinate space.
 *
 * What sits at the far end of that arc is the change. site-hub reveals four
 * decorated tiles; this reveals an application. The revealed pose is
 * site-hub--tutorial's, near enough whole:
 *
 *   - the rail, which is the only one of the four that is a real tree:
 *     spool.page open with five frames, drafts collapsed at 25.
 *   - the retracting annotations. Each is bound to exactly one gesture, hangs
 *     off the thing it names with a hairline leader and one bend, and draws
 *     itself back into its anchor the moment the gesture happens. Nothing is
 *     dismissable, because doing the thing is the dismissal. taughtRail,
 *     taughtOpen and taughtPullback persist, so a returning visitor is only
 *     taught what they never did and a visitor who did all three gets silence.
 *   - the wordless two-tier gesture: click selects and the ring springs onto
 *     what you picked, double-click walks in.
 *
 * Two grafts. From site-hub--annotated, the install line lives permanently in
 * the rail footer, with the node line and the docs and github chips under it:
 * install is this page's primary call to action and in every other take it goes
 * out of reach the instant you pull back. From site-hub--clone, the threads
 * between the frames, its geometry exactly, 1.5px bowing off the edge they
 * leave. The four arrows drawn are the four walks this frame declares, so the
 * map on screen and the map `spool flows` reads are the same map.
 *
 * Dropped on purpose: the floating select/hand tool bar, and every affordance
 * that would have to be drawn as a lie. A control you cannot use is what tips
 * this from application into costume.
 *
 * Going inside the landing is the one walk that is not a walk. You are already
 * on it, so a double-click scrolls the arc back to the top and hands you the
 * page at full size, which is what "inside" means here.
 */

/* ---------- fixed coordinate space + camera constants ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const TRACK_H = 2900; // scroll room; scroll distance = TRACK_H - VIEW_H = 2000px
const RAIL_W = 248; // spool's shipped pages rail

/** the landing's docked rect, in stage coordinates: clear of the rail. */
const LIVE = { x: 580, y: 306, w: 440, h: 275 };
const SCALE = LIVE.w / VIEW_W; // 0.3056, the docked min scale

const P1 = 0.55; // progress at which the zoom completes and the reveal begins
const REVEAL = 0.85; // past here the canvas is the navigation; mark it seen
const RETURN_AT = 0.88; // where a returning visitor boots: revealed, not pulled back
const MIN_ZOOM = 0.82; // where the last stretch of scroll parks the camera

/** the field the camera pulls back around: the stage minus the rail. */
const FIELD_CX = RAIL_W + (VIEW_W - RAIL_W) / 2;
const FIELD_CY = VIEW_H / 2;

const EASE = [0.22, 1, 0.36, 1] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep, no overshoot

const zAt = (v: number) => smooth(clamp01(v / P1));
const scaleAt = (v: number) => 1 + (SCALE - 1) * zAt(v);
const rampAt = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));
const pullAt = (v: number) => rampAt(v, REVEAL + 0.01, 1);

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};
const dotGridMini: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "9px 9px",
};
const liveSpine: CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 55%, transparent) 4%, color-mix(in srgb, var(--color-thread) 55%, transparent) 96%, transparent 100%)",
};

/* eased opacity + rise, in lockstep with scroll progress */
function useRamp(sp: MotionValue<number>, a: number, b: number, rise = 14) {
	const opacity = useTransform(sp, (v) => rampAt(v, a, b));
	const y = useTransform(sp, (v) => (1 - rampAt(v, a, b)) * rise);
	return { opacity, y };
}

/* ---------- canonical copy-to-clipboard, verbatim from the landing ---------- */

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
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("h-3 w-3 shrink-0", className)}>
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
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("h-3 w-3 shrink-0", className)}>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
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
 * The install line, and the only reflow-proof way to say it: the path part of
 * the prompt never changes, and only the trailing "$" crossfades with the copy
 * glyph and the tick inside a fixed 1ch slot. Rest, hover and copied share one
 * line box. It is the page's call to action, so it exists at both ends of the
 * arc: in the hero at scroll 0, and in the rail footer once the rail is there.
 */
function CommandLine({
	command,
	prompt = "$",
	className,
}: {
	command: string;
	prompt?: string;
	className?: string;
}) {
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

	const path = prompt.endsWith("$") ? prompt.slice(0, -1) : `${prompt} `;
	return (
		<button
			type="button"
			onClick={() => {
				void handleCopy();
			}}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className={cn(
				"group/cmd block w-full cursor-pointer text-left focus-visible:outline-none",
				className,
			)}
		>
			<span className="select-none text-muted">{path}</span>
			<span className="relative mr-[1ch] inline-block w-[1ch] select-none text-center align-baseline">
				<span
					className={cn(
						"text-muted transition-opacity duration-150",
						copied ? "opacity-0" : "group-hover/cmd:opacity-0 group-focus-visible/cmd:opacity-0",
					)}
				>
					$
				</span>
				<CopyGlyph
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread opacity-0 transition-opacity duration-150",
						!copied && "group-hover/cmd:opacity-100 group-focus-visible/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
			{command}
		</button>
	);
}

/* ---------- shared marks + primitives ---------- */

function Node({ className }: { className?: string }) {
	return (
		<span className={cn("absolute block h-[9px] w-[9px]", className)}>
			<span className="-inset-[5px] absolute rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.5v9M2.5 7 6 10.5 9.5 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.5 8.5 8.5 3.5M4.6 3.5h3.9v3.9"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Bar({ w, className }: { w: string | number; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}

function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Caret({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn("origin-center transition-transform duration-[160ms]", open && "rotate-90", className)}
			style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ---------- the scroll affordance ---------- */

function ScrollHint({ opacity }: { opacity: MotionValue<number> }) {
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			style={{ opacity }}
			className="inline-flex items-center gap-2.5 font-mono text-muted text-sm"
		>
			<motion.span
				className="text-thread"
				animate={reduce ? undefined : { y: [0, 4, 0] }}
				transition={{ duration: 1.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<DownGlyph className="h-3.5 w-3.5" />
			</motion.span>
			<span>scroll</span>
		</motion.div>
	);
}

/* ---------- the landing itself: the rest state, and the docked frame's content ---------- */

function LandingContent({ hint }: { hint: MotionValue<number> }) {
	const reduce = useReducedMotion() === true;
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* thread spine + travelling pulse, transform only */}
			<div className="absolute inset-y-0 left-[200px] w-px" style={liveSpine}>
				{reduce ? null : (
					<motion.span
						className="-translate-x-1/2 absolute left-1/2 block h-24 w-[7px] rounded-full"
						style={{
							top: 0,
							background: "linear-gradient(to bottom, transparent, var(--color-thread), transparent)",
						}}
						animate={{ y: [-140, 980] }}
						transition={{ duration: 8.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					/>
				)}
			</div>

			<div className="relative flex h-full flex-col pr-[112px] pl-[320px]">
				<header className="flex shrink-0 items-center justify-between py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-muted text-xs">
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>
				</header>

				<main className="flex flex-1 flex-col justify-center">
					<section className="relative grid grid-cols-[1fr_auto] items-center gap-12">
						<div className="max-w-[560px]">
							<Node className="-left-[124px] top-[9px]" />
							<h1 className="font-semibold text-[66px] leading-[0.98] tracking-[-0.02em]">
								feel an app
								<br />
								before it exists
							</h1>
							<p className="mt-6 max-w-[452px] text-[17px] text-muted leading-[26px]">
								a live prototyping canvas. your agent authors real tsx frames, you arrange them and
								walk the flows. it feels real because it is.
							</p>

							<div className="mt-9">
								<div className="flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[430px] font-mono text-[15px] leading-[30px]">
										<CommandLine prompt="~ $" command="npm i -g spool.page" />
										<CommandLine prompt="~/your-app $" command="spool init" />
										<CommandLine prompt="~/your-app $" command="spool serve" />
									</div>
								</div>
								<div className="mt-5 pl-[25px] font-mono text-muted text-xs">
									requires node 22+ · best in chrome · macos-first today
								</div>
							</div>
						</div>

						<motion.div
							className="relative w-[236px] shrink-0"
							animate={reduce ? undefined : { y: [0, -14, 0] }}
							transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</section>

					{/* the scroll affordance, hung off the thread as its own node */}
					<div className="relative mt-14">
						<Node className="-left-[124px] -translate-y-1/2 top-1/2" />
						<ScrollHint opacity={hint} />
					</div>
				</main>

				<footer className="flex shrink-0 items-center justify-between border-border border-t py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-muted text-sm">spool.page</span>
					</div>
					<span className="font-mono text-muted text-xs">github.com/liamvinberg/spool</span>
				</footer>
			</div>
		</div>
	);
}

/* ---------- the four sections, as wireframes on the field ---------- */

function FlowArrowMini({ x, w, y, pulse }: { x: number; w: number; y: number; pulse: boolean }) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w, height: 1 }}>
			<div className="absolute inset-0 bg-thread/55" />
			<span className="-right-px -top-[3px] absolute block h-[7px] w-[7px] rotate-45 border-thread/75 border-t border-r" />
			{pulse ? (
				<motion.span
					className="-top-[2px] absolute left-0 block h-[5px] w-[5px] rounded-full bg-thread"
					style={{ boxShadow: "0 0 6px 1px color-mix(in srgb, var(--color-thread) 60%, transparent)" }}
					animate={{ x: [0, w - 3], opacity: [0, 1, 1, 0] }}
					transition={{
						duration: 2.2,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
						repeatDelay: 0.9,
					}}
				/>
			) : null}
		</div>
	);
}

/** flows: three screens, one thread through them, a player pill under the strip. */
function FlowsWire() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="relative h-full w-full" style={dotGridMini}>
			{[30, 123, 216].map((lx, i) => (
				<div
					key={lx}
					className="absolute overflow-hidden rounded-[3px] border border-border bg-canvas"
					style={{ left: lx, top: 14, width: 46, height: 68 }}
				>
					<div className="space-y-[4px] p-1.5">
						<div className="h-[7px] w-[70%] rounded-[1px] bg-raised" />
						<Bar w="82%" />
						<Bar w="56%" />
						{i === 2 ? (
							<span className="mx-auto mt-[7px] block h-2.5 w-2.5 rounded-full bg-thread/80" />
						) : (
							<div className="mt-[7px] h-2.5 w-full rounded-[1px] bg-thread/70" />
						)}
					</div>
				</div>
			))}
			<FlowArrowMini x={76} w={47} y={48} pulse={!reduce} />
			<FlowArrowMini x={169} w={47} y={48} pulse={false} />
			<div
				className="-translate-x-1/2 absolute left-1/2 flex items-center gap-2 rounded-full border border-border-raised bg-bg/80 px-2.5 py-1.5"
				style={{ top: 96, width: 140 }}
			>
				<motion.span
					className="text-thread"
					animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
					transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				>
					<PlayTri className="h-2 w-2" />
				</motion.span>
				<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
					<div className="h-full w-1/3 rounded-full bg-thread" />
				</div>
				<div className="flex items-center gap-1">
					{[0, 1, 2].map((s) => (
						<span
							key={s}
							className={cn("h-1 w-1 rounded-full", s === 0 ? "bg-thread" : "bg-border-raised")}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

/** frames: honest source on the left, the thing it renders on the right. */
function FramesWire() {
	const reduce = useReducedMotion() === true;
	const lines = ["66%", "42%", "78%", "54%", "70%", "38%", "62%", "48%"];
	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="relative flex h-full w-[45%] shrink-0 flex-col border-border border-r bg-canvas">
				<div className="flex items-center gap-1.5 border-border border-b px-2.5 py-2">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<div className="h-1.5 w-10 rounded-[1px] bg-raised" />
				</div>
				<div className="space-y-[7px] p-2.5">
					{lines.map((w, i) => (
						<div key={w + String(i)} className="flex items-center gap-1.5">
							<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
							<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
							{i === lines.length - 1 ? (
								<motion.span
									className="ml-0.5 block h-3 w-[2px] bg-thread"
									animate={reduce ? undefined : { opacity: [1, 0.15] }}
									transition={{
										duration: 0.72,
										repeat: Number.POSITIVE_INFINITY,
										repeatType: "reverse",
										ease: "easeInOut",
									}}
								/>
							) : null}
						</div>
					))}
				</div>
			</div>
			<div className="relative flex-1 p-3" style={dotGridMini}>
				<div className="space-y-2">
					<div className="h-3 w-[72%] rounded-[2px] bg-raised" />
					<div className="h-3 w-[50%] rounded-[2px] bg-raised" />
				</div>
				<div className="mt-3.5 flex gap-1.5">
					<span className="w-px shrink-0 self-stretch bg-thread/60" />
					<div className="space-y-1.5 py-0.5">
						<Bar w={62} />
						<Bar w={46} />
						<Bar w={54} />
					</div>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<span className="h-4 w-[52px] rounded-[3px] bg-thread/75" />
					<span className="h-4 w-[38px] rounded-[3px] border border-border-raised" />
				</div>
			</div>
		</div>
	);
}

/** states: one screen, three seeds. the picker cycles so the point makes itself. */
const SEEDS = ["full", "empty", "failing"] as const;

function StatesWire() {
	const reduce = useReducedMotion() === true;
	const [seed, setSeed] = useState(0);

	useEffect(() => {
		if (reduce) return;
		const id = window.setInterval(() => {
			setSeed((s) => (s + 1) % SEEDS.length);
		}, 2400);
		return () => window.clearInterval(id);
	}, [reduce]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-border border-b px-3 py-1.5 font-mono text-[9px] text-muted">
				<span>scenario</span>
				<span className="opacity-60">no backend</span>
			</div>
			<div className="relative flex-1">
				{SEEDS.map((label, i) => {
					const left = 14 + i * 84;
					const isLive = seed === i;
					return (
						<div key={label} className="absolute" style={{ left, top: 14 }}>
							<div
								className={cn(
									"overflow-hidden rounded-[3px] border bg-canvas transition-colors duration-300",
									isLive ? "border-thread/55" : "border-border",
								)}
								style={{ width: 68, height: 88 }}
							>
								<div className="border-border border-b px-1.5 py-1.5">
									<div className="h-[6px] w-[62%] rounded-[1px] bg-raised" />
								</div>
								<div className="space-y-[5px] p-1.5">
									{i === 0 ? (
										<>
											<Bar w="88%" />
											<Bar w="70%" />
											<Bar w="80%" />
											<span className="mt-[7px] block h-2.5 w-full rounded-[1px] bg-thread/70" />
										</>
									) : null}
									{i === 1 ? (
										<div className="flex h-[46px] flex-col items-center justify-center gap-1.5">
											<span className="block h-px w-5 rounded-full bg-border-raised" />
											<span className="block h-px w-3 rounded-full bg-border-raised/60" />
										</div>
									) : null}
									{i === 2 ? (
										<>
											<div className="border-thread/70 border-l-2 bg-thread/10 py-[5px] pl-1.5">
												<Bar w="70%" className="bg-thread/60" />
											</div>
											<Bar w="52%" />
											<Bar w="64%" />
										</>
									) : null}
								</div>
							</div>
							<div
								className={cn(
									"mt-2 text-center font-mono text-[9px] leading-none transition-colors duration-300",
									isLive ? "text-thread" : "text-muted/60",
								)}
							>
								{label}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** disk: the site's own folder, which is where this whole page lives. */
interface DiskRow {
	depth: number;
	kind: "dir" | "frame";
	name: string;
	open?: boolean;
	active?: boolean;
}

const DISK_ROWS: readonly DiskRow[] = [
	{ depth: 0, kind: "dir", name: "design", open: true },
	{ depth: 1, kind: "dir", name: "frames", open: true },
	{ depth: 2, kind: "frame", name: "landing", active: true },
	{ depth: 2, kind: "frame", name: "frames" },
	{ depth: 2, kind: "frame", name: "flows" },
	{ depth: 2, kind: "frame", name: "states" },
	{ depth: 2, kind: "frame", name: "disk" },
	{ depth: 1, kind: "dir", name: "shared" },
];

function DiskWire() {
	return (
		<div className="relative h-full w-full overflow-hidden py-2">
			<span className="absolute w-px bg-border-raised" style={{ left: 26, top: 56, height: 108 }} />
			{DISK_ROWS.map((r) => (
				<div
					key={r.depth + r.kind + r.name}
					className={cn(
						"relative flex h-[24px] items-center gap-1.5 pr-2",
						r.active === true && "bg-raised",
					)}
					style={{ paddingLeft: 10 + r.depth * 14 }}
				>
					<span
						className={cn(
							"w-2 shrink-0 text-center text-[7px] leading-none",
							r.active === true ? "text-thread" : "text-muted/70",
						)}
					>
						{r.kind === "dir" ? (r.open === true ? "▾" : "▸") : "▸"}
					</span>
					{r.kind === "frame" ? (
						<FrameGlyph
							className={cn("h-3 w-3 shrink-0", r.active === true ? "text-thread" : "text-muted")}
						/>
					) : (
						<FolderGlyph className="h-3 w-3 shrink-0 text-muted" />
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-[10px] leading-none",
							r.active === true ? "text-thread" : "text-muted",
						)}
					>
						{r.name}
						{r.kind === "dir" ? "/" : ""}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- what stands on the field ---------- */

type FrameId = "landing" | "flows" | "frames" | "states" | "disk";

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface SectionSpec extends Rect {
	id: Exclude<FrameId, "landing">;
	/** the one-line caption under the name tab */
	sub: string;
	/** where the "go inside" leader hangs when this is the first frame pointed at */
	anno: { ax: number; ay: number; ex: number; ey: number; sx: number };
	Wire: () => React.ReactNode;
	/** reveal ramp start; the four arrive in reading order */
	at: number;
}

/**
 * Stage coordinates, not field coordinates: the rail is chrome laid over the
 * same 1440x900 space, so every rect here is absolute and the landing's dock at
 * x 580 clears the 248 rail by a wide margin at every point of the zoom.
 */
const SECTIONS: readonly SectionSpec[] = [
	{
		id: "flows",
		sub: "walk screen to screen",
		x: 356,
		y: 132,
		w: 292,
		h: 130,
		anno: { ax: 648, ay: 210, ex: 688, ey: 250, sx: 868 },
		Wire: FlowsWire,
		at: 0.54,
	},
	{
		id: "disk",
		sub: "plain files in your repo",
		x: 1100,
		y: 136,
		w: 196,
		h: 212,
		anno: { ax: 1198, ay: 348, ex: 1238, ey: 388, sx: 1418 },
		Wire: DiskWire,
		at: 0.575,
	},
	{
		id: "frames",
		sub: "real tsx, real depth",
		x: 372,
		y: 656,
		w: 276,
		h: 154,
		anno: { ax: 510, ay: 810, ex: 550, ey: 850, sx: 730 },
		Wire: FramesWire,
		at: 0.61,
	},
	{
		id: "states",
		sub: "one screen, seeded three ways",
		x: 1068,
		y: 640,
		w: 264,
		h: 164,
		anno: { ax: 1200, ay: 804, ex: 1240, ey: 844, sx: 1420 },
		Wire: StatesWire,
		at: 0.645,
	},
];

/** every frame on this page is a 1440x900 document; the ring's chip says so. */
const PAGE_SIZE = "1440 × 900";

const rectOf = (id: FrameId): Rect => {
	if (id === "landing") return LIVE;
	const found = SECTIONS.find((s) => s.id === id);
	return found === undefined ? LIVE : { x: found.x, y: found.y, w: found.w, h: found.h };
};

/* ---------- the drafts, parked outside the resting field ---------- */

interface GhostSpec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** pull-back progress at which this one has fully arrived */
	at: number;
}

/**
 * The takes that lost. They sit outside the field at rest and only come into
 * view once the last stretch of scroll widens the camera, which is what makes
 * the rail's collapsed "drafts 25" a promise rather than a decoration.
 */
const GHOSTS: readonly GhostSpec[] = [
	{ name: "landing--quiet", x: 142, y: 250, w: 122, h: 78, at: 0.5 },
	{ name: "landing--terminal", x: 152, y: 570, w: 118, h: 74, at: 0.58 },
	{ name: "landing--editorial", x: 1344, y: 240, w: 124, h: 78, at: 0.54 },
	{ name: "landing--kinetic", x: 1352, y: 620, w: 116, h: 74, at: 0.62 },
	{ name: "landing--specimen", x: 700, y: 902, w: 152, h: 96, at: 0.66 },
];

/* ---------- the threads, clone's geometry exactly ---------- */

type Side = "n" | "e" | "s" | "w";

const OUTWARD: Record<Side, { x: number; y: number }> = {
	n: { x: 0, y: -1 },
	s: { x: 0, y: 1 },
	e: { x: 1, y: 0 },
	w: { x: -1, y: 0 },
};

interface EdgeSpec {
	from: FrameId;
	to: FrameId;
	exit: Side;
	exitAt: number;
	entry: Side;
	entryAt: number;
}

/**
 * Exactly the walks this frame declares, and no others: four doors out of the
 * landing. The back walks belong to the section frames and are drawn by them,
 * so nothing here claims an edge that `spool flows` cannot find in this folder.
 * Sides and lanes are fixed rather than routed, because the field is fixed too,
 * and they turn one way round the landing so no arrow crosses a name tab: the
 * top pair enter from underneath, the bottom pair from the side.
 */
const EDGES: readonly EdgeSpec[] = [
	{ from: "landing", to: "flows", exit: "w", exitAt: 0.2, entry: "s", entryAt: 0.45 },
	{ from: "landing", to: "disk", exit: "e", exitAt: 0.2, entry: "s", entryAt: 0.45 },
	{ from: "landing", to: "frames", exit: "s", exitAt: 0.1, entry: "e", entryAt: 0.25 },
	{ from: "landing", to: "states", exit: "s", exitAt: 0.9, entry: "w", entryAt: 0.25 },
];

const HEAD_LENGTH = 10;
const HEAD_HALF_WIDTH = 4.5;

function anchorPoint(box: Rect, side: Side, t: number) {
	if (side === "n") return { x: box.x + box.w * t, y: box.y };
	if (side === "s") return { x: box.x + box.w * t, y: box.y + box.h };
	if (side === "w") return { x: box.x, y: box.y + box.h * t };
	return { x: box.x + box.w, y: box.y + box.h * t };
}

/** flow-arrows.tsx's cubic: tangents leave perpendicular, bowing with distance. */
function drawEdge(spec: EdgeSpec) {
	const from = rectOf(spec.from);
	const to = rectOf(spec.to);
	const tail = anchorPoint(from, spec.exit, spec.exitAt);
	const tip = anchorPoint(to, spec.entry, spec.entryAt);
	const away = OUTWARD[spec.entry];
	const end = { x: tip.x + away.x * HEAD_LENGTH, y: tip.y + away.y * HEAD_LENGTH };
	const bow = Math.max(18, Math.hypot(end.x - tail.x, end.y - tail.y) * 0.34);
	const out = OUTWARD[spec.exit];
	const c1 = { x: tail.x + out.x * bow, y: tail.y + out.y * bow };
	const c2 = { x: end.x + away.x * bow, y: end.y + away.y * bow };
	const flank = { x: -away.y, y: away.x };
	return {
		key: `${spec.from}-${spec.to}`,
		path: `M ${tail.x} ${tail.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
		head: `M ${tip.x} ${tip.y} L ${end.x + flank.x * HEAD_HALF_WIDTH} ${end.y + flank.y * HEAD_HALF_WIDTH} L ${end.x - flank.x * HEAD_HALF_WIDTH} ${end.y - flank.y * HEAD_HALF_WIDTH} Z`,
	};
}

const ARROWS = EDGES.map(drawEdge);

/** The map draws itself as the canvas resolves, then holds. Never a hit target. */
function Threads({ sp }: { sp: MotionValue<number> }) {
	const reduce = useReducedMotion() === true;
	const length = useTransform(sp, (v) => (reduce ? rampAt(v, 0.66, 0.72) : rampAt(v, 0.64, 0.84)));
	const heads = useTransform(sp, (v) => rampAt(v, 0.78, 0.88));
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0"
			width={VIEW_W}
			height={VIEW_H}
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			fill="none"
			style={{ overflow: "visible" }}
		>
			{ARROWS.map((arrow) => (
				<g key={arrow.key}>
					<motion.path
						d={arrow.path}
						stroke="var(--color-thread)"
						strokeWidth={1.5}
						strokeLinecap="round"
						style={{ pathLength: length, opacity: length }}
					/>
					<motion.path d={arrow.head} fill="var(--color-thread)" style={{ opacity: heads }} />
				</g>
			))}
		</svg>
	);
}

/* ---------- the coaching layer ---------- */

/**
 * One annotation: a thread anchor on the thing, a hairline leader with a single
 * bend, a shelf, and a mono label sitting on the shelf. It draws from the anchor
 * outward and retracts the same way, label first. Nothing about it can be
 * clicked, and there is no way to close it other than doing what it says.
 */
function Annotation({
	ax,
	ay,
	ex,
	ey,
	sx,
	verb,
	rest,
}: {
	ax: number;
	ay: number;
	ex: number;
	ey: number;
	sx: number;
	verb?: string;
	rest: string;
}) {
	const reduce = useReducedMotion() === true;
	// half-pixel offsets keep a 1px stroke on one device pixel
	const d = `M ${ax + 0.5} ${ay + 0.5} L ${ex + 0.5} ${ey + 0.5} L ${sx + 0.5} ${ey + 0.5}`;
	return (
		<div className="pointer-events-none absolute top-0 left-0" style={{ width: VIEW_W, height: VIEW_H }}>
			<svg
				width={VIEW_W}
				height={VIEW_H}
				viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
				fill="none"
				aria-hidden="true"
				className="absolute top-0 left-0 overflow-visible"
			>
				<motion.path
					d={d}
					stroke="color-mix(in srgb, var(--color-text) 26%, transparent)"
					strokeWidth={1}
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={reduce ? { opacity: 0 } : { pathLength: 0 }}
					animate={reduce ? { opacity: 1 } : { pathLength: 1 }}
					exit={reduce ? { opacity: 0 } : { pathLength: 0 }}
					transition={reduce ? { duration: 0.2 } : { duration: 0.42, ease: EASE }}
				/>
				<motion.circle
					cx={ax + 0.5}
					cy={ay + 0.5}
					r={2.5}
					fill="var(--color-thread)"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.16, delay: 0.16 } }}
					transition={{ duration: 0.22 }}
				/>
			</svg>
			<motion.div
				className="absolute whitespace-nowrap font-mono text-xs leading-4"
				style={{ left: ex + 6, top: ey - 19 }}
				initial={{ opacity: 0, x: -6 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: -4, transition: { duration: 0.14 } }}
				transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : 0.28 }}
			>
				{verb === undefined ? null : <span className="text-text">{verb}</span>}
				<span className="text-muted">{rest}</span>
			</motion.div>
		</div>
	);
}

/**
 * The general note, drawing convention: no leader, set in the margin, rule
 * above. It arrives with the drafts and retires by itself once it has had long
 * enough to be read, because a reward is not an instruction.
 */
function MarginNote({ shown, text }: { shown: boolean; text: string }) {
	return (
		<AnimatePresence>
			{shown ? (
				<motion.div
					className="pointer-events-none absolute"
					style={{ left: RAIL_W + 20, top: 848 }}
					initial={{ opacity: 0, y: 5 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
					transition={{ duration: 0.45, ease: EASE }}
				>
					<span className="mb-2 block h-px w-7 bg-border-raised" />
					<span className="block whitespace-nowrap font-mono text-muted text-xs leading-4">{text}</span>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

/* ---------- the red ring: the page becoming a frame, then the selection ---------- */

const RING_CORNER = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";

function RingBody() {
	return (
		<>
			<div className="-inset-[3px] absolute rounded-[9px] border-[1.5px] border-thread" />
			<span className={cn(RING_CORNER, "-left-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -top-[7px]")} />
			<span className={cn(RING_CORNER, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(RING_CORNER, "-right-[7px] -bottom-[7px]")} />
			<div className="-bottom-[9px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none">
				{PAGE_SIZE}
			</div>
		</>
	);
}

/**
 * Phase one, while the page is still shrinking: the ring hugs the live rect,
 * read straight off the scroll. This is the moment the landing stops being a
 * page and becomes a frame, so it cannot lag by a single pixel.
 */
function ZoomRing({ sp }: { sp: MotionValue<number> }) {
	const x = useTransform(sp, (v) => LIVE.x * zAt(v));
	const y = useTransform(sp, (v) => LIVE.y * zAt(v));
	const w = useTransform(sp, (v) => VIEW_W * scaleAt(v));
	const h = useTransform(sp, (v) => VIEW_H * scaleAt(v));
	const opacity = useTransform(sp, (v) => clamp01((0.78 - scaleAt(v)) / (0.78 - 0.45)));
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			style={{ x, y, width: w, height: h, opacity }}
		>
			<RingBody />
		</motion.div>
	);
}

/**
 * Phase two, once the zoom has converged and the rect is static: the same ring,
 * now a selection, springing from whatever it was on to whatever you picked.
 * The handover is invisible because both phases sit on the identical rect.
 */
function SelectRing({ rect }: { rect: Rect }) {
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			initial={false}
			animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }}
			transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
		>
			<RingBody />
		</motion.div>
	);
}

/* ---------- name tabs ---------- */

function NameTab({ name, sub, lit }: { name: string; sub: string; lit: boolean }) {
	return (
		<div className="h-[26px] select-none pl-0.5">
			<div className="flex items-center gap-1.5 font-mono text-xs leading-none">
				<span
					className={cn(
						"text-[8px] transition-colors duration-200",
						lit ? "text-thread" : "text-muted/70",
					)}
				>
					{lit ? "▶" : "▸"}
				</span>
				<span className={cn("transition-colors duration-200", lit ? "text-thread" : "text-muted")}>
					{name}
				</span>
			</div>
			<div className="mt-1 pl-[15px] font-mono text-2xs text-muted/70 leading-none">{sub}</div>
		</div>
	);
}

/** the landing's tab rides the zoom, so it is already parked when the ring lands. */
function LandingTab({ sp, lit }: { sp: MotionValue<number>; lit: boolean }) {
	const x = useTransform(sp, (v) => LIVE.x * zAt(v));
	const y = useTransform(sp, (v) => LIVE.y * zAt(v) - 30);
	const opacity = useTransform(sp, (v) => clamp01((0.78 - scaleAt(v)) / (0.78 - 0.45)));
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-20"
			style={{ x, y, width: LIVE.w, opacity }}
		>
			<NameTab name="landing" sub="the page you are on" lit={lit} />
		</motion.div>
	);
}

/* ---------- the section frames on the field ---------- */

function SectionTile({
	spec,
	sp,
	selected,
	live,
	onSelect,
	onOpen,
	onFirstHover,
}: {
	spec: SectionSpec;
	sp: MotionValue<number>;
	selected: boolean;
	live: boolean;
	onSelect: (id: FrameId) => void;
	onOpen: () => void;
	onFirstHover: (id: FrameId) => void;
}) {
	const { opacity, y } = useRamp(sp, spec.at, spec.at + 0.14);
	return (
		<motion.div
			className="group absolute"
			style={{
				left: spec.x,
				top: spec.y - 30,
				width: spec.w,
				opacity,
				y,
				pointerEvents: live ? "auto" : "none",
			}}
		>
			<div className="mb-1">
				<NameTab name={spec.id} sub={spec.sub} lit={selected} />
			</div>

			<motion.div
				role="link"
				tabIndex={live ? 0 : -1}
				aria-label={`${spec.id}, double-click to go inside`}
				className="relative block cursor-pointer text-left focus-visible:outline-none"
				style={{ width: spec.w, height: spec.h }}
				whileHover={{ scale: 1.012 }}
				transition={{ type: "spring", stiffness: 300, damping: 24 }}
				onPointerEnter={() => onFirstHover(spec.id)}
				onFocus={() => onFirstHover(spec.id)}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(spec.id);
				}}
				onDoubleClick={(e) => {
					e.stopPropagation();
					onOpen();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onOpen();
					}
				}}
			>
				<div className="absolute inset-0 overflow-hidden rounded-[6px] border border-border-raised bg-surface">
					<spec.Wire />
				</div>
				{selected ? null : (
					<div className="-inset-px pointer-events-none absolute rounded-[7px] border border-thread/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
				)}
			</motion.div>
		</motion.div>
	);
}

function Ghost({ spec, sp }: { spec: GhostSpec; sp: MotionValue<number> }) {
	const opacity = useTransform(sp, (v) => {
		const p = pullAt(v);
		return clamp01((p - (spec.at - 0.36)) / 0.36);
	});
	return (
		<motion.div
			className="pointer-events-none absolute"
			style={{ left: spec.x, top: spec.y - 16, width: spec.w, opacity }}
		>
			<div className="mb-1 truncate font-mono text-[9px] text-muted/45 leading-none">▸ {spec.name}</div>
			<div
				className="overflow-hidden rounded-[5px] border border-border bg-surface/50 p-2"
				style={{ width: spec.w, height: spec.h }}
			>
				<div className="h-2 w-[62%] rounded-[1px] bg-raised/70" />
				<div className="mt-2 space-y-1.5">
					<Bar w="84%" className="bg-border-raised/70" />
					<Bar w="58%" className="bg-border-raised/70" />
				</div>
				<div className="mt-2.5 h-2 w-[38%] rounded-[1px] bg-thread/25" />
			</div>
		</motion.div>
	);
}

/* ---------- the left rail: the site's pages, spool's own shape ---------- */

const PAGE_FRAMES: readonly FrameId[] = ["landing", "frames", "flows", "states", "disk"];

function Rail({
	sp,
	selected,
	draftsLit,
	onSelect,
	onOpen,
	onDwell,
}: {
	sp: MotionValue<number>;
	selected: FrameId | null;
	draftsLit: boolean;
	onSelect: (id: FrameId) => void;
	onOpen: (id: FrameId) => void;
	onDwell: () => void;
}) {
	const x = useTransform(sp, (v) => -RAIL_W * (1 - rampAt(v, 0.32, 0.54)));
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	// a dwell, not a brush: a pointer crossing the rail on its way somewhere else
	// has not read it, and should not cost the visitor the annotation.
	function handleEnter() {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(onDwell, 450);
	}
	function handleLeave() {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
	}

	return (
		<motion.aside
			aria-label="Pages"
			className="absolute top-0 left-0 z-40 flex h-full flex-col border-border border-r bg-bg"
			style={{ width: RAIL_W, x }}
			onPointerEnter={handleEnter}
			onPointerLeave={handleLeave}
			// the rail is chrome, not field: a click in here is never a click on the
			// canvas, so it must not reach the background's deselect
			onClick={(e) => e.stopPropagation()}
		>
			<div className="flex h-11 shrink-0 items-center gap-2.5 border-border border-b pl-3.5">
				<SpoolMark className="h-4 w-4 text-thread" title="spool" />
				<span className="font-semibold text-base leading-base tracking-tight">spool</span>
			</div>

			<div className="flex h-11 shrink-0 items-baseline gap-2 border-border border-b pl-3.5">
				<h2 className="self-center font-semibold text-base leading-base">Pages</h2>
				<span className="self-center font-mono text-muted text-xs leading-xs">2</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden py-2">
				<div className="relative flex h-8 items-center bg-surface pr-2">
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
					<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
						<Caret open className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-8 min-w-0 flex-1 items-center gap-2">
						<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-thread" />
						<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-sm">
							spool.page
						</span>
					</span>
					<span className="font-mono text-2xs text-muted/60 leading-3">5</span>
				</div>

				<div className="relative pb-0.5">
					<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
					{PAGE_FRAMES.map((id) => {
						const active = id === selected;
						return (
							<button
								key={id}
								type="button"
								aria-pressed={active}
								className={cn(
									"relative flex h-7 w-full cursor-pointer items-center text-left transition-colors duration-150 focus-visible:outline-none",
									active ? "bg-surface" : "hover:bg-surface/50",
								)}
								onClick={() => onSelect(id)}
								onDoubleClick={() => onOpen(id)}
							>
								<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
								<span
									className={cn(
										"truncate pl-[34px] font-mono text-sm leading-sm transition-colors duration-150",
										active ? "text-thread" : "text-muted",
									)}
								>
									{id}
								</span>
							</button>
						);
					})}
				</div>

				{/* the second page, shut. its count is the only claim it makes, and the
				    last stretch of scroll is where that claim gets paid. */}
				<div className="relative mt-1 flex h-8 items-center pr-2">
					<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted/70">
						<Caret open={false} className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-8 min-w-0 flex-1 items-center gap-2">
						<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
						<span className="min-w-0 flex-1 truncate font-mono text-muted text-sm leading-sm">
							drafts
						</span>
					</span>
					<span
						className={cn(
							"font-mono text-2xs leading-3 transition-colors duration-500",
							draftsLit ? "text-thread" : "text-muted/60",
						)}
					>
						25
					</span>
				</div>
			</div>

			{/* the install line, permanently in reach. site-hub--shell found the hole:
			    the moment you pull back, every other take puts the call to action
			    inside a 31% page and out of the visitor's hands. */}
			<div className="shrink-0 border-border border-t px-4 pt-4 pb-5">
				<div className="flex gap-3">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="min-w-0 flex-1">
						<CommandLine
							prompt="~ $"
							command="npm i -g spool.page"
							className="font-mono text-text text-xs leading-[20px]"
						/>
					</div>
				</div>
				<div className="mt-2 pl-[13px] font-mono text-[10px] text-muted/70 leading-[15px]">
					node 22+ · macos-first today
				</div>
				<div className="mt-4 flex items-center gap-4 font-mono text-[11px] text-muted">
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						docs
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						github
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
				</div>
			</div>
		</motion.aside>
	);
}

/* ---------- the zoom readout: the camera's real scale, never a decal ---------- */

function ZoomReadout({ sp }: { sp: MotionValue<number> }) {
	const opacity = useTransform(sp, (v) => rampAt(v, 0.5, 0.66));
	const [pct, setPct] = useState(100);
	useEffect(() => {
		const next = (v: number) => {
			const k = scaleAt(v) * (1 - (1 - MIN_ZOOM) * pullAt(v));
			const rounded = Math.round(k * 100);
			setPct((prev) => (prev === rounded ? prev : rounded));
		};
		next(sp.get());
		return sp.on("change", next);
	}, [sp]);
	return (
		<motion.div
			className="pointer-events-none absolute right-5 bottom-5 z-40 font-mono text-muted/70 text-xs leading-4 tabular-nums"
			style={{ opacity }}
		>
			{pct}%
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

type Lesson = "rail" | "open" | "pullback";

export default function SiteHubComposed() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion() === true;

	// a visitor who has already revealed the canvas this session (came back from a
	// section via its canvas chip) boots straight at the canvas pose, not the hero.
	// hubRevealed is undefined until the first reveal; reading it is enough.
	const returning = useRef(ui.state.hubRevealed === true);

	// Own the scroll -> progress measurement. A plain scroll listener reliably
	// catches a programmatic scroll restore across the walk-back's view-transition
	// remount, where motion's useScroll re-measures on its own clock and strands.
	const progress = useMotionValue(returning.current ? RETURN_AT : 0);
	const sp = useSpring(progress, { stiffness: 100, damping: 40, mass: 1 });

	const [live, setLive] = useState(returning.current);
	const [selected, setSelected] = useState<FrameId | null>("landing");
	const [hovered, setHovered] = useState<FrameId | null>(null);
	// the frame the "go inside" leader hangs off: the first section pointed at, and
	// it stays put after that so the label never chases the cursor.
	const [openAnchor, setOpenAnchor] = useState<FrameId | null>(null);
	const [noteShown, setNoteShown] = useState(false);
	const noteFired = useRef(false);

	// a lesson performed is a lesson gone for good; the session carries it across
	// walks, so coming back from a section only ever shows what is still unlearned.
	const [done, setDone] = useState<Record<Lesson, boolean>>(() => ({
		rail: ui.state.taughtRail === true,
		open: ui.state.taughtOpen === true,
		pullback: ui.state.taughtPullback === true,
	}));

	const learn = useCallback((lesson: Lesson) => {
		setDone((prev) => (prev[lesson] ? prev : { ...prev, [lesson]: true }));
		if (lesson === "rail") ui.state.taughtRail = true;
		if (lesson === "open") ui.state.taughtOpen = true;
		if (lesson === "pullback") ui.state.taughtPullback = true;
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			progress.set(max > 0 ? clamp01(el.scrollTop / max) : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => {
			el.removeEventListener("scroll", measure);
			ro.disconnect();
		};
	}, [progress]);

	// park the return scroll at the revealed pose once the (view-transition) layout
	// settles; the listener above then reports it, the spring snaps, no boot zoom.
	useLayoutEffect(() => {
		if (!returning.current) return;
		let raf = 0;
		let tries = 0;
		const lock = () => {
			const el = scrollRef.current;
			const max = el ? el.scrollHeight - el.clientHeight : 0;
			if (el && max > 200) {
				el.scrollTop = max * RETURN_AT;
				progress.jump(RETURN_AT);
				sp.jump(RETURN_AT);
				return;
			}
			if (tries++ < 90) raf = requestAnimationFrame(lock);
		};
		lock();
		return () => cancelAnimationFrame(raf);
	}, [progress, sp]);

	// crossing the reveal threshold marks the canvas seen; the session carries it
	// to the section frames and back, so the return path knows to boot the canvas.
	// going the rest of the way is the third lesson, performed rather than read.
	useEffect(() => {
		const unsub = sp.on("change", (v) => {
			if (v > REVEAL && ui.state.hubRevealed !== true) ui.state.hubRevealed = true;
			if (v > REVEAL + 0.04) learn("pullback");
			if (v > REVEAL + 0.07 && !noteFired.current) {
				noteFired.current = true;
				setNoteShown(true);
				window.setTimeout(() => setNoteShown(false), 5200);
			}
		});
		return unsub;
	}, [sp, learn]);

	// the canvas takes the pointer only once it is the thing on screen. below the
	// handover the landing is the page again, at full size, and owns every click.
	useEffect(() => {
		const apply = (v: number) => {
			setLive((was) => (was ? v > 0.56 : v > 0.62));
		};
		apply(sp.get());
		return sp.on("change", apply);
	}, [sp]);

	useEffect(() => {
		if (live) return;
		setSelected("landing");
		setHovered(null);
		setOpenAnchor(null);
	}, [live]);

	const scrollHome = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
	}, [reduce]);

	// One literal, unconditional call each, so the parser reads four solid edges
	// instead of an unreadable destination. site-hub does the dynamic version off
	// an array and `spool flows` calls it unreadable, which is why its arrows have
	// never drawn. The four here are exactly the four threads on the field.
	const openFlows = useCallback(() => {
		learn("open");
		setSelected("flows");
		ui.go("site-flows");
	}, [learn]);

	const openFrames = useCallback(() => {
		learn("open");
		setSelected("frames");
		ui.go("site-frames");
	}, [learn]);

	const openStates = useCallback(() => {
		learn("open");
		setSelected("states");
		ui.go("site-states");
	}, [learn]);

	const openDisk = useCallback(() => {
		learn("open");
		setSelected("disk");
		ui.go("site-disk");
	}, [learn]);

	// going inside the landing is the one move that is not a walk: you are already
	// standing on it, so the arc runs backwards and hands it back at full size.
	const openLanding = useCallback(() => {
		learn("open");
		setSelected("landing");
		scrollHome();
	}, [learn, scrollHome]);

	const openers = useMemo<Record<FrameId, () => void>>(
		() => ({
			landing: openLanding,
			flows: openFlows,
			frames: openFrames,
			states: openStates,
			disk: openDisk,
		}),
		[openLanding, openFlows, openFrames, openStates, openDisk],
	);

	const handleFirstHover = useCallback((id: FrameId) => {
		setHovered(id);
		setOpenAnchor((prev) => (prev === null ? id : prev));
	}, []);

	// the docked landing: transform-only zoom into its rect.
	const frameScale = useTransform(sp, scaleAt);
	const frameX = useTransform(sp, (v) => LIVE.x * zAt(v));
	const frameY = useTransform(sp, (v) => LIVE.y * zAt(v));
	const frameRadius = useTransform(sp, (v) => 44 * zAt(v));

	// the last stretch of scroll widens the camera around the field, which is what
	// brings the drafts in from outside it.
	const sceneScale = useTransform(sp, (v) => 1 - (1 - MIN_ZOOM) * pullAt(v));
	const gridOpacity = useTransform(sp, (v) => clamp01(v / 0.16));

	// the scroll hint fades the instant the zoom begins.
	const hint = useTransform(sp, (v) => 1 - clamp01(v / 0.07));

	const anchorSpec = SECTIONS.find((s) => s.id === openAnchor);
	const selectedRect = selected === null ? null : rectOf(selected);
	const [draftsLit, setDraftsLit] = useState(false);
	useEffect(() => {
		const next = (v: number) => {
			const on = pullAt(v) > 0.35;
			setDraftsLit((prev) => (prev === on ? prev : on));
		};
		next(sp.get());
		return sp.on("change", next);
	}, [sp]);

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				{/* the pinned stage: the camera holds here while the track scrolls */}
				<div
					className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]"
					onClick={() => {
						if (live) setSelected(null);
					}}
					onKeyDown={(e) => {
						if (live && e.key === "Escape") setSelected(null);
					}}
					role="presentation"
				>
					{/* the scene: everything that belongs to the canvas moves with the camera */}
					<motion.div
						className="absolute inset-0"
						style={{ scale: sceneScale, transformOrigin: `${FIELD_CX}px ${FIELD_CY}px` }}
					>
						<motion.div className="absolute inset-[-600px]" style={{ ...dotGrid, opacity: gridOpacity }} />

						{GHOSTS.map((g) => (
							<Ghost key={g.name} spec={g} sp={sp} />
						))}

						<Threads sp={sp} />

						{SECTIONS.map((spec) => (
							<SectionTile
								key={spec.id}
								spec={spec}
								sp={sp}
								selected={selected === spec.id}
								live={live}
								onSelect={setSelected}
								onOpen={openers[spec.id]}
								onFirstHover={handleFirstHover}
							/>
						))}

						{/* the landing: one wrapper, transform-only zoom, the real page inside */}
						<motion.div
							className="absolute inset-0 z-10 origin-top-left overflow-hidden bg-bg [will-change:transform]"
							style={{ x: frameX, y: frameY, scale: frameScale, borderRadius: frameRadius }}
						>
							<div className="h-full w-full" style={{ pointerEvents: live ? "none" : "auto" }}>
								<LandingContent hint={hint} />
							</div>
						</motion.div>

						{/* on the canvas the docked page is a frame, so it takes the canvas
						    gestures: a click selects it, a double-click walks back into it */}
						{live ? (
							<div
								role="link"
								tabIndex={0}
								aria-label="landing, double-click to go inside"
								className="absolute z-20 cursor-pointer focus-visible:outline-none"
								style={{ left: LIVE.x, top: LIVE.y, width: LIVE.w, height: LIVE.h }}
								onPointerEnter={() => setHovered("landing")}
								onPointerLeave={() => setHovered((c) => (c === "landing" ? null : c))}
								onClick={(e) => {
									e.stopPropagation();
									setSelected("landing");
								}}
								onDoubleClick={(e) => {
									e.stopPropagation();
									openLanding();
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										openLanding();
									}
								}}
							>
								{hovered === "landing" && selected !== "landing" ? (
									<div className="-inset-px pointer-events-none absolute rounded-[7px] border border-thread/70" />
								) : null}
							</div>
						) : null}

						<LandingTab sp={sp} lit={selected === "landing"} />

						{live && selectedRect !== null ? <SelectRing rect={selectedRect} /> : null}
						{live ? null : <ZoomRing sp={sp} />}

						{/* annotations that point at things on the drawing live on the drawing.
						    the "go inside" one has no place to be until the visitor points at a
						    section, so it does not exist until then. */}
						<AnimatePresence>
							{live && !done.open && anchorSpec !== undefined ? (
								<Annotation
									key="open"
									ax={anchorSpec.anno.ax}
									ay={anchorSpec.anno.ay}
									ex={anchorSpec.anno.ex}
									ey={anchorSpec.anno.ey}
									sx={anchorSpec.anno.sx}
									verb="double-click"
									rest=" to go inside"
								/>
							) : null}
						</AnimatePresence>

						<AnimatePresence initial={false}>
							{live && !done.pullback ? (
								<Annotation
									key="pullback"
									ax={740}
									ay={640}
									ex={780}
									ey={676}
									sx={960}
									verb="scroll"
									rest=" to pull back further"
								/>
							) : null}
						</AnimatePresence>
					</motion.div>

					<Rail
						sp={sp}
						selected={selected}
						draftsLit={draftsLit}
						onSelect={setSelected}
						onOpen={(id) => openers[id]()}
						onDwell={() => learn("rail")}
					/>

					<ZoomReadout sp={sp} />

					{/* the rail annotation touches chrome, so it is drawn in chrome space and
					    never moves with the camera */}
					<div
						className="pointer-events-none absolute top-0 left-0 z-40"
						style={{ width: VIEW_W, height: VIEW_H }}
					>
						<AnimatePresence initial={false}>
							{live && !done.rail ? (
								<Annotation
									key="rail"
									ax={RAIL_W}
									ay={250}
									ex={318}
									ey={320}
									sx={514}
									rest="rail or canvas, same frames"
								/>
							) : null}
						</AnimatePresence>

						<MarginNote shown={noteShown} text="25 drafts, still on the canvas" />
					</div>
				</div>
			</div>
		</div>
	);
}
