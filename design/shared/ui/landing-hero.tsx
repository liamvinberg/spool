import { motion, type MotionValue } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { SpoolMark } from "./spool-mark";

/**
 * The spool.page landing, condensed to exactly one 1440x900 viewport.
 *
 * It is the resting state of every hub variant: the page a visitor meets
 * before anything moves, and the content of the frame the page shrinks into.
 * Voice and copy are frames/landing's; the only thing this adds is the scroll
 * affordance, whose opacity the hub owns because only the hub knows how far
 * the visitor has scrolled.
 */

const liveSpine: CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 55%, transparent) 4%, color-mix(in srgb, var(--color-thread) 55%, transparent) 96%, transparent 100%)",
};

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
			ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none";
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
 * One install line. The whole line is the button and the "$" prompt is the
 * affordance: hover swaps it for a copy glyph in a fixed 1ch slot, so the line
 * box is identical across rest, hover and copied and the command never moves.
 * The prompt names the working directory, so "in your repo" is said the
 * terminal way rather than in a sentence.
 */
export function CommandLine({ command, prompt = "$" }: { command: string; prompt?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		if (!(await copyText(command))) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	const path = prompt.endsWith("$") ? prompt.slice(0, -1) : `${prompt} `;
	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left focus-visible:outline-none"
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

/** A stitch point on the thread spine: the dot, and a halo that makes it deliberate. */
export function ThreadNode({ className }: { className?: string }) {
	return (
		<span className={cn("absolute block h-[9px] w-[9px]", className)}>
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
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

export function LandingHero({ hint }: { hint: MotionValue<number> }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="absolute inset-y-0 left-[200px] w-px" style={liveSpine}>
				<motion.span
					className="-translate-x-1/2 absolute left-1/2 block h-24 w-[7px] rounded-full"
					style={{
						top: 0,
						background: "linear-gradient(to bottom, transparent, var(--color-thread), transparent)",
					}}
					animate={{ y: [-140, 980] }}
					transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
				/>
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
							<ThreadNode className="-left-[124px] top-[9px]" />
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
							animate={{ y: [0, -14, 0] }}
							transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</section>

					<div className="relative mt-14">
						<ThreadNode className="-translate-y-1/2 -left-[124px] top-1/2" />
						<motion.div
							style={{ opacity: hint }}
							className="inline-flex items-center gap-2.5 font-mono text-muted text-sm"
						>
							<motion.span
								className="text-thread"
								animate={{ y: [0, 4, 0] }}
								transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
							>
								<DownGlyph className="h-3.5 w-3.5" />
							</motion.span>
							<span>scroll</span>
						</motion.div>
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
