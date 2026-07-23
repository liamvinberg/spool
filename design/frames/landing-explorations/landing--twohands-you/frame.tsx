import {
	AnimatePresence,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
} from "motion/react";
import {
	type PointerEvent as RPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--twohands-you — v2 of the "twohands" landing for spool.page. v1 played
 * a landing that was quietly being worked on: an "agent" hand retyped the
 * statement, a scripted "you" hand nudged the mark. v2 keeps the idea and turns
 * it on the reader. You are no longer the audience. You are the second hand.
 *
 * The native cursor is hidden and replaced by the twohands cursor wearing the
 * "you" tag; it tracks your real pointer through a stiff spring (present, not
 * floaty) and parks off gracefully when you leave. Inspection is yours: hover
 * the statement, the mark, a stance row, or the install and that element gets
 * v1's selection treatment — thread ring, corner handles, true px measured on
 * hairlines. Over a clickable the cursor swaps to a press glyph and the real
 * affordances still fire. The agent stays, sparser: it selects the statement
 * and weighs a word every ~25s, and it waits whenever your hand is on the line.
 *
 * Measurement is layout px via the offsetParent chain, never getBoundingClientRect
 * (#53): overlay chrome is positioned in the document's layout space, and the
 * player/canvas scale the document visually, so a visual box read back as layout
 * coordinates strands the chrome. The one place gBCR is right is unprojecting the
 * live pointer, which arrives in client space: there the wrapper's own visual/
 * layout width ratio recovers the scale. prefers-reduced-motion drops the custom
 * cursor and the theater entirely and leaves the finished page with hover rings.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Inspect = { id: string; rect: Rect };
type AgentState = {
	aX: number;
	aY: number;
	sel: boolean;
	caret: boolean;
	word: string;
};

const FRAME_H = 1300;
const PARK_AGENT = { aX: -220, aY: 150 };
const AGENT_REST: AgentState = {
	aX: PARK_AGENT.aX,
	aY: PARK_AGENT.aY,
	sel: false,
	caret: false,
	word: "feel",
};

const CURSOR_T = { type: "spring", stiffness: 74, damping: 16, mass: 1.1 } as const;
// The real-pointer follow: stiff and lightly damped so the tag sits a few ms
// behind the pointer — enough to feel alive, never enough to feel like it drifts.
const YOU_SPRING = { stiffness: 1500, damping: 90, mass: 0.55 } as const;

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
 * beat. A gentle magnetic lean on hover gives the CTA a little pull. No cursor
 * utility here: the frame owns the cursor and the press state is drawn by the
 * "you" glyph over the whole install column.
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
			className="group block w-full text-left focus-visible:outline-none"
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

/** The scripted agent cursor: hand-rolled pointer plus a mono nametag flag. */
function AgentCursor() {
	return (
		<div className="relative">
			<svg width="22" height="24" viewBox="0 0 22 24" fill="none">
				<path
					d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z"
					fill="var(--color-thread)"
					stroke="var(--color-bg)"
					strokeWidth="1.4"
					strokeLinejoin="round"
				/>
			</svg>
			<span className="absolute left-[14px] top-[17px] rounded-[3px] bg-thread px-1.5 py-[3px] font-mono text-2xs leading-none whitespace-nowrap text-on-thread">
				agent
			</span>
		</div>
	);
}

/**
 * Your cursor. Two glyphs share one hotspot at the origin so they cross-fade in
 * place: the twohands pointer (arrow, tip at origin) for reading, a rounded
 * pointing hand (fingertip at origin) over anything clickable. The light "you"
 * flag rides the same spot in both. Presence is a fade on `inside`; the press is
 * a small scale toward the hotspot on pointer-down.
 */
function YouCursor({ interactive }: { interactive: boolean }) {
	return (
		<div className="relative">
			{/* arrow — the resting pointer, tip at (2,2) pulled onto the origin */}
			<div className="absolute left-0 top-0 -translate-x-[2px] -translate-y-[2px]">
				<motion.svg
					width="22"
					height="24"
					viewBox="0 0 22 24"
					fill="none"
					animate={{ opacity: interactive ? 0 : 1 }}
					transition={{ duration: 0.13, ease: "easeOut" }}
				>
					<path
						d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z"
						fill="var(--color-text)"
						stroke="var(--color-bg)"
						strokeWidth="1.4"
						strokeLinejoin="round"
					/>
				</motion.svg>
			</div>
			{/* press — a pointing hand, fingertip at (8.8,1.5) pulled onto the origin.
			    Union of one solid fill: an inset index standing clear above a compact
			    fist, short folded knuckles, and a distinct angled thumb — the thumb is
			    what makes the silhouette read as a hand at cursor scale. */}
			<div className="absolute left-0 top-0 -translate-x-[8.8px] -translate-y-[1.5px]">
				<motion.svg
					width="22"
					height="26"
					viewBox="0 0 22 26"
					fill="none"
					initial={{ opacity: 0 }}
					animate={{ opacity: interactive ? 1 : 0 }}
					transition={{ duration: 0.13, ease: "easeOut" }}
				>
					<g fill="var(--color-text)">
						<rect
							x="3.4"
							y="10.2"
							width="3"
							height="6.6"
							rx="1.5"
							transform="rotate(-31 4.9 13.5)"
						/>
						<rect x="7.3" y="1.5" width="3" height="11.5" rx="1.5" />
						<rect x="10.2" y="6.7" width="2.7" height="5" rx="1.35" />
						<rect x="12.6" y="7.5" width="2.7" height="4.3" rx="1.35" />
						<rect x="6.3" y="9" width="10.6" height="11" rx="4.3" />
					</g>
				</motion.svg>
			</div>
			{/* the light "you" tag, fixed to the hotspot in both glyphs */}
			<span className="absolute left-[14px] top-[15px] rounded-[3px] bg-text px-1.5 py-[3px] font-mono text-2xs leading-none whitespace-nowrap text-bg">
				you
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

/**
 * Deconstructed design-tool chrome around a target: ring, corner handles, and
 * measured px riding hairlines above and to the left. The rect is the target's
 * live layout box (offsetParent chain), so the box tracks the real element. One
 * component serves both hands — your hover selection and the agent's own ring.
 */
function SelectChrome({ rect, anim }: { rect: Rect; anim: boolean }) {
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
			initial={anim ? { opacity: 0, scale: 0.985 } : { opacity: 0 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={anim ? { opacity: 0, scale: 0.99 } : { opacity: 0 }}
			transition={{ duration: anim ? 0.22 : 0.12, ease: [0.22, 1, 0.36, 1] }}
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

export default function LandingTwoHandsYou() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const wrapRef = useRef<HTMLDivElement>(null);
	const h1Ref = useRef<HTMLHeadingElement>(null);
	const markRef = useRef<HTMLDivElement>(null);

	// Your pointer, driven straight into motion values so tracking never triggers
	// a React render; the springs give the tag its few-ms presence.
	const px = useMotionValue(-200);
	const py = useMotionValue(-200);
	const sx = useSpring(px, YOU_SPRING);
	const sy = useSpring(py, YOU_SPRING);

	const [inside, setInside] = useState(false);
	const [pressed, setPressed] = useState(false);
	const [interactive, setInteractive] = useState(false);
	const [inspect, setInspect] = useState<Inspect | null>(null);
	const [agent, setAgent] = useState<AgentState>(AGENT_REST);
	const [agentRect, setAgentRect] = useState<Rect | null>(null);
	const [agentBusy, setAgentBusy] = useState(false);

	const insideRef = useRef(false);
	// The agent reads your hover from a ref so it never re-subscribes; it defers
	// whenever your hand is on the statement it wants.
	const hoverRef = useRef<string | null>(null);
	useEffect(() => {
		hoverRef.current = inspect?.id ?? null;
	}, [inspect]);

	// Layout px via the offsetParent chain, relative to the wrapper the overlay
	// shares. offsetTop/offsetLeft ignore transforms, so a floating or pressed
	// target still measures at its resting layout box — exactly where the ring
	// belongs. This is the #53 pattern; getBoundingClientRect is never used here.
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

	const frozen = inspect?.id === "mark";

	const inspectEnter = (id: string) => (e: RPointerEvent<HTMLElement>) => {
		const rect = measure(e.currentTarget);
		if (rect) setInspect({ id, rect });
	};
	const inspectLeave = (id: string) => () => {
		setInspect((cur) => (cur?.id === id ? null : cur));
	};
	// The mark floats; measure its inner box, not the padded catch area around it,
	// so the ring hugs the ribbon and it settles cleanly into the selection.
	const markEnter = () => {
		const rect = measure(markRef.current);
		if (rect) setInspect({ id: "mark", rect });
	};

	// Your pointer, in the wrapper's layout space. The pointer arrives in client
	// coordinates; the wrapper's own visual-over-layout width ratio recovers
	// whatever scale the player or canvas applied, and getBoundingClientRect is
	// the only read that can bridge client space to the document. Presence and
	// press are set here on boundary crossings only, never per move.
	useEffect(() => {
		if (reduce) return;
		const wrap = wrapRef.current;
		if (!wrap) return;

		const toLayout = (e: PointerEvent) => {
			const r = wrap.getBoundingClientRect();
			const sX = r.width && wrap.offsetWidth ? r.width / wrap.offsetWidth : 1;
			const sY = r.height && wrap.offsetHeight ? r.height / wrap.offsetHeight : 1;
			return { x: (e.clientX - r.left) / sX, y: (e.clientY - r.top) / sY };
		};

		const onMove = (e: PointerEvent) => {
			const p = toLayout(e);
			px.set(p.x);
			py.set(p.y);
			if (!insideRef.current) {
				sx.jump(p.x);
				sy.jump(p.y);
				insideRef.current = true;
				setInside(true);
			}
		};
		const onEnter = (e: PointerEvent) => {
			const p = toLayout(e);
			px.set(p.x);
			py.set(p.y);
			sx.jump(p.x);
			sy.jump(p.y);
			insideRef.current = true;
			setInside(true);
		};
		const onLeave = () => {
			insideRef.current = false;
			setInside(false);
			setPressed(false);
		};
		const onDown = () => setPressed(true);
		const onUp = () => setPressed(false);

		wrap.addEventListener("pointermove", onMove);
		wrap.addEventListener("pointerenter", onEnter);
		wrap.addEventListener("pointerleave", onLeave);
		wrap.addEventListener("pointerdown", onDown);
		window.addEventListener("pointerup", onUp);
		return () => {
			wrap.removeEventListener("pointermove", onMove);
			wrap.removeEventListener("pointerenter", onEnter);
			wrap.removeEventListener("pointerleave", onLeave);
			wrap.removeEventListener("pointerdown", onDown);
			window.removeEventListener("pointerup", onUp);
		};
	}, [reduce, px, py, sx, sy]);

	// The agent, sparser than v1: one retype cycle ~4s after mount, then once
	// every ~25s. It selects the statement, weighs "see", commits back to "feel",
	// and parks. Before each cycle it waits out any beat where your hand is on the
	// statement, so the two hands never fight for the same element. Suppressed
	// whole under reduced motion, leaving the finished page.
	useEffect(() => {
		if (reduce) return;
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
		const patch = (p: Partial<AgentState>) => {
			if (!cancelled) setAgent((s) => ({ ...s, ...p }));
		};
		const type = async (words: string[], each: number) => {
			for (const w of words) {
				if (cancelled) return;
				patch({ word: w });
				await sleep(each);
			}
		};

		const cycle = async () => {
			let r = measure(h1Ref.current);
			if (r) {
				setAgentRect(r);
				patch({ aX: r.x - 26, aY: r.y - 6 });
			}
			await sleep(1500);
			if (cancelled) return;
			r = measure(h1Ref.current);
			if (r) {
				setAgentRect(r);
				patch({ aX: r.x + 48, aY: r.y + 14 });
			}
			await sleep(720);
			if (cancelled) return;
			r = measure(h1Ref.current);
			if (r) setAgentRect(r);
			setAgentBusy(true);
			patch({ sel: true, caret: true });
			await sleep(600);
			if (cancelled) return;
			await type(keysDel("feel"), 95);
			await sleep(280);
			await type(keysType("see"), 115);
			await sleep(950); // weigh it
			await type(keysDel("see"), 95);
			await sleep(240);
			await type(keysType("feel"), 115);
			await sleep(820); // settle on the keeper
			if (cancelled) return;
			patch({ sel: false, caret: false });
			setAgentBusy(false);
			await sleep(300);
			if (cancelled) return;
			r = measure(h1Ref.current);
			if (r) patch({ aX: r.x - 74, aY: r.y - 48 });
			await sleep(1300);
			if (cancelled) return;
			patch({ aX: PARK_AGENT.aX, aY: PARK_AGENT.aY });
		};

		const loop = async () => {
			await sleep(4000);
			while (!cancelled) {
				while (!cancelled && hoverRef.current === "statement") await sleep(1000);
				if (cancelled) break;
				await cycle();
				if (cancelled) break;
				await sleep(25000);
			}
		};
		loop();
		return () => {
			cancelled = true;
			for (const t of timers) window.clearTimeout(t);
		};
	}, [reduce, measure]);

	// Your hover ring is suppressed on the statement only while the agent holds it,
	// so the two hands never double a ring on the same word.
	const showInspect = inspect && !(inspect.id === "statement" && agentBusy);

	return (
		<div
			ref={wrapRef}
			className="twh-you-root relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased"
		>
			{/* The frame owns the cursor: hide the native one across the whole subtree
			    (author rules beat the UA link/button cursors) and draw our own. Under
			    reduced motion this block is absent and the native cursor returns. */}
			{anim && (
				<style>{`.twh-you-root, .twh-you-root * { cursor: none; }`}</style>
			)}

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
							onPointerEnter={() => setInteractive(true)}
							onPointerLeave={() => setInteractive(false)}
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
						<h1
							ref={h1Ref}
							onPointerEnter={inspectEnter("statement")}
							onPointerLeave={inspectLeave("statement")}
							className="w-fit text-[76px] font-semibold leading-[0.98]"
							style={{ letterSpacing: "-1.5px" }}
						>
							<span>{agent.word}</span>
							{agent.caret && <Caret anim={anim} />}
							<span>{" an app"}</span>
							<br />
							before it exists
						</h1>
						<p className="mt-8 max-w-[480px] text-[19px] leading-[28px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on an
							infinite canvas and links them into walkable flows. you feel the
							real thing, interactions and motion and inputs, before it exists.
						</p>

						{/* install — the second beat, the thread pointing at the action */}
						<div className="mt-10">
							<div
								onPointerEnter={inspectEnter("install")}
								onPointerLeave={inspectLeave("install")}
								className="flex gap-5"
							>
								<span className="w-px shrink-0 self-stretch bg-thread/70" />
								<div
									onPointerEnter={() => setInteractive(true)}
									onPointerLeave={() => setInteractive(false)}
									className="w-[340px] font-mono text-[16px] leading-[32px]"
								>
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

					{/* the mark, held in a padded catch area so the idle float never slips
					    out from under your hover; it settles to rest while you inspect it */}
					<div
						onPointerEnter={markEnter}
						onPointerLeave={inspectLeave("mark")}
						className="relative w-[300px] shrink-0 py-4"
					>
						<motion.div
							ref={markRef}
							animate={anim && !frozen ? { y: [0, -14, 0] } : { y: 0 }}
							transition={
								anim && !frozen
									? { duration: 6, repeat: Infinity, ease: "easeInOut" }
									: { type: "spring", stiffness: 260, damping: 20 }
							}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
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
						<span className="text-muted">landing--twohands-you/</span>
						<span className="text-text">frame.tsx</span>
					</p>
				</section>

				{/* stance */}
				<section className="relative mt-16 border-t border-border pt-14">
					<Node />
					<div className="grid grid-cols-2 gap-x-16 gap-y-12">
						{stance.map((s, i) => (
							<div
								key={s.k}
								onPointerEnter={inspectEnter(`stance-${i}`)}
								onPointerLeave={inspectLeave(`stance-${i}`)}
								className="group flex gap-5"
							>
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
						onPointerEnter={() => setInteractive(true)}
						onPointerLeave={() => setInteractive(false)}
						className="font-mono text-xs text-muted transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</footer>
			</div>

			{/* the shared overlay — decorative, never intercepts your real hovers */}
			<div className="pointer-events-none absolute inset-0 z-40" aria-hidden>
				{/* your hover selection, one target at a time */}
				<AnimatePresence>
					{showInspect && inspect && (
						<SelectChrome key={`you-${inspect.id}`} rect={inspect.rect} anim={anim} />
					)}
				</AnimatePresence>
				{/* the agent's own ring while it holds the statement */}
				<AnimatePresence>
					{anim && agent.sel && agentRect && (
						<SelectChrome key="agent" rect={agentRect} anim={anim} />
					)}
				</AnimatePresence>

				{/* the agent hand */}
				{anim && (
					<motion.div
						className="absolute top-0 left-0"
						initial={false}
						animate={{ x: agent.aX, y: agent.aY }}
						transition={CURSOR_T}
					>
						<AgentCursor />
					</motion.div>
				)}

				{/* your hand — the real pointer, wearing the tag */}
				{anim && (
					<motion.div
						className="absolute top-0 left-0"
						style={{ x: sx, y: sy }}
						animate={{ opacity: inside ? 1 : 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						<motion.div
							animate={{ scale: pressed ? 0.86 : 1 }}
							transition={{ type: "spring", stiffness: 620, damping: 26 }}
						>
							<YouCursor interactive={interactive} />
						</motion.div>
					</motion.div>
				)}
			</div>
		</div>
	);
}
