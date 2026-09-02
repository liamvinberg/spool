import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-letter--hand. The landing as a signed letter.
 *
 * The argument: spool is one person's tool, published. So the page is written
 * the way that person would write it, in one measure, dated at the top and
 * signed at the bottom, and the things you can act on are enclosed beside it
 * rather than shouted above it.
 *
 * Two columns. The letter runs at a 640px measure with the thread hanging in
 * its left margin, one node at the opening line. The right column is the
 * enclosures: the video, the install line, the Mac app, and the four facts a
 * reader checks before they type anything. It is sticky, so whatever paragraph
 * you are on, the command is still in reach.
 *
 * The signature is a drawn stroke rather than a typeface standing in for one.
 * It writes itself the first time it comes into view, at the speed a hand
 * would, and holds. Under prefers-reduced-motion it is simply there.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- copy to clipboard, the house behavior ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
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

/** the install line: the prompt holds still, only the trailing glyph changes. */
function CommandLine({ command, prompt = "~ $" }: { command: string; prompt?: string }) {
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
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left font-mono focus-visible:outline-none"
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
			<span className="text-text">{command}</span>
		</button>
	);
}

/* ---------- small marks ---------- */

function Node({ className }: { className?: string }) {
	return (
		<span className={cn("absolute block h-[9px] w-[9px]", className)}>
			<span className="-inset-[5px] absolute rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

function Mono({ children }: { children: string }) {
	return <span className="rounded-xs bg-raised/70 px-1 py-px font-mono text-[14px] text-text">{children}</span>;
}

function DownArrow({ className }: { className?: string }) {
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

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.6 1.5 8.4 5 2.6 8.5Z" />
		</svg>
	);
}

/* ---------- the letter's typographic parts ---------- */

function P({ children }: { children: React.ReactNode }) {
	return <p className="mt-6 text-[17px] text-text/82 leading-[30px]">{children}</p>;
}

/** an inset: the thread on the left edge, the thing itself indented off it. */
function Inset({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={cn("mt-7 flex gap-5", className)}>
			<span className="w-px shrink-0 self-stretch bg-thread/70" />
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

/* ---------- the enclosures ---------- */

/** the video poster: the canvas it opens on, drawn small, with the seal on it. */
function VideoSlot() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="group/vid cursor-pointer">
			<div
				className="relative h-[203px] w-full overflow-hidden rounded-md border border-border bg-canvas"
				style={{
					backgroundImage:
						"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
					backgroundSize: "14px 14px",
				}}
			>
				{[
					{ x: 30, y: 32, w: 100, h: 64 },
					{ x: 172, y: 32, w: 100, h: 64 },
					{ x: 101, y: 118, w: 100, h: 64 },
				].map((r) => (
					<div
						key={`${r.x}-${r.y}`}
						className="absolute overflow-hidden rounded-[3px] border border-border-raised/80 bg-surface"
						style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
					>
						<div className="space-y-[5px] p-2">
							<div className="h-[6px] w-[64%] rounded-[1px] bg-raised" />
							<div className="h-[3px] w-[86%] rounded-full bg-border-raised" />
							<div className="h-[3px] w-[58%] rounded-full bg-border-raised" />
							<div className="mt-[8px] h-[9px] w-[44%] rounded-[2px] bg-thread/70" />
						</div>
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0 overflow-visible"
					width="100%"
					height="203"
					viewBox="0 0 360 203"
					fill="none"
					aria-hidden="true"
				>
					<path d="M130 64 C 151 64, 151 64, 172 64" stroke="var(--color-thread)" strokeWidth="1.4" />
					<path d="M222 96 C 222 118, 205 118, 201 118" stroke="var(--color-thread)" strokeWidth="1.4" />
				</svg>
				<div className="absolute inset-0 flex items-center justify-center">
					<motion.span
						className="flex h-12 w-12 items-center justify-center rounded-full border border-thread/70 bg-bg/80 text-thread backdrop-blur-[2px]"
						animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
						transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					>
						<PlayTri className="ml-[2px] h-3.5 w-3.5" />
					</motion.span>
				</div>
			</div>
			<div className="mt-3 flex items-baseline justify-between font-mono text-muted text-xs">
				<span className="transition-colors duration-150 group-hover/vid:text-text">
					Empty folder to a walkable flow
				</span>
				<span>2:48</span>
			</div>
		</div>
	);
}

const FACTS: readonly { k: string; v: string }[] = [
	{ k: "version", v: "0.6.0" },
	{ k: "license", v: "MIT" },
	{ k: "runtime", v: "Node 22+" },
	{ k: "canvas", v: "Chrome" },
];

function Enclosures() {
	return (
		<aside className="sticky top-14 w-[360px] shrink-0">
			<VideoSlot />

			<div className="mt-9 border-border border-t pt-7">
				<div className="text-[15px] text-text/82 leading-6">One line, from npm.</div>
				<div className="mt-3 text-[15px] leading-[26px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
				</div>
			</div>

			<a
				href="https://spool.page"
				className="group/dmg mt-7 flex items-center gap-3 rounded-md border border-border bg-canvas px-4 py-3.5 transition-colors duration-150 hover:border-border-raised"
			>
				<SpoolMark className="h-5 w-4 shrink-0 text-thread" />
				<div className="min-w-0 flex-1">
					<div className="font-mono text-[13px] text-text leading-none">Spool.dmg</div>
					<div className="mt-1.5 font-mono text-2xs text-muted leading-none">
						The Mac app · 4.1 MB · Apple silicon
					</div>
				</div>
				<span className="text-muted transition-colors duration-150 group-hover/dmg:text-thread">
					<DownArrow className="h-3.5 w-3.5" />
				</span>
			</a>

			<dl className="mt-9 border-border border-t">
				{FACTS.map((f) => (
					<div key={f.k} className="flex items-baseline justify-between border-border border-b py-2.5">
						<dt className="font-mono text-muted text-xs">{f.k}</dt>
						<dd className="font-mono text-text text-xs">{f.v}</dd>
					</div>
				))}
			</dl>

			<p className="mt-5 font-mono text-[11px] text-muted leading-[18px]">
				Source at github.com/liamvinberg/spool. Issues open.
			</p>
		</aside>
	);
}

/* ---------- the signature ---------- */

const SIG_MAIN =
	"M6 58 C 10 34, 18 12, 30 12 C 40 12, 38 30, 30 44 C 24 55, 18 60, 30 62 C 42 64, 54 54, 62 42 C 66 36, 70 28, 72 32 C 74 38, 68 52, 74 56 C 80 60, 90 50, 96 42 C 100 36, 104 28, 107 32 C 110 38, 104 52, 110 56 C 116 60, 126 50, 132 42 C 138 34, 146 28, 152 34 C 158 40, 150 54, 160 58 C 172 63, 196 52, 232 26";
const SIG_BAR = "M118 24 C 130 20, 146 20, 158 25";

function Signature() {
	const reduce = useReducedMotion() === true;
	return (
		<svg
			viewBox="0 0 240 72"
			fill="none"
			role="img"
			aria-label="Liam"
			className="h-[62px] w-[206px] text-text/85"
		>
			<motion.path
				d={SIG_MAIN}
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={reduce ? false : { pathLength: 0 }}
				whileInView={{ pathLength: 1 }}
				viewport={{ once: true, amount: 0.7 }}
				transition={{ duration: 1.1, ease: "easeInOut" }}
			/>
			<motion.path
				d={SIG_BAR}
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				initial={reduce ? false : { pathLength: 0, opacity: 0 }}
				whileInView={{ pathLength: 1, opacity: 1 }}
				viewport={{ once: true, amount: 0.7 }}
				transition={{ duration: 0.32, ease: EASE, delay: reduce ? 0 : 1.05 }}
			/>
		</svg>
	);
}

/* ---------- the page ---------- */

export default function SiteLetterHand() {
	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="mx-auto w-[1240px]">
				<header className="flex items-center justify-between border-border border-b py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-4 text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<nav className="flex items-center gap-7 font-mono text-muted text-xs">
						<span className="text-text">spool.page</span>
						<span className="transition-colors duration-150 hover:text-text">github</span>
						<span className="transition-colors duration-150 hover:text-text">docs</span>
					</nav>
				</header>

				<div className="flex items-start justify-between gap-[124px] pt-[92px] pb-[120px]">
					<article className="relative w-[640px] shrink-0">
						{/* the thread, hanging in the letter's margin */}
						<span
							className="absolute top-[54px] bottom-[210px] left-[-58px] w-px"
							style={{
								background:
									"linear-gradient(to bottom, color-mix(in srgb, var(--color-thread) 55%, transparent), color-mix(in srgb, var(--color-thread) 8%, transparent))",
							}}
						/>
						<Node className="-left-[62px] top-[68px]" />

						<div className="font-mono text-muted text-xs">Stockholm · 1 September 2026</div>

						<h1 className="mt-7 font-semibold text-[46px] leading-[1.06] tracking-[-0.022em]">
							I wanted to hold an app
							<br />
							before I wrote it.
						</h1>

						<P>
							spool is the canvas I built to do that. Your agent writes TSX frames into a{" "}
							<Mono>design/</Mono> folder in your repo, spool renders them, and you click through the
							flow the way a user would. The frames are files on your disk. Nothing goes to a server.
						</P>

						<P>
							I made it for myself. I am one person doing product and front end at a small company, and
							I kept losing the same afternoon: draw a screen somewhere it cannot run, build it, find
							out the screen was wrong. Now the screen runs first and I get the afternoon back.
						</P>

						<P>
							It has been my daily tool since March. What follows is what I would tell you about it
							across a table.
						</P>

						<P>
							Getting it takes one line, and it is on the right so it stays in reach while you read.
							You need Node 22 and Chrome for the canvas. macOS and Linux both work; on Windows, run it
							under WSL. If you would rather have a dock icon than a terminal, the Mac app is the same
							local daemon in a window.
						</P>

						<P>
							The first time you open the canvas it is empty. That is the honest state: spool has no
							idea yet which of your folders is a project. There is a <Mono>+</Mono> in the corner.
							Press it, pick a folder with code in it, and that folder is a project. Pick a second one
							and you have two. I have six open, and one of them is spool.
						</P>

						<P>
							Which is the only proof I trust. spool's own <Mono>design/</Mono> holds 142 frames across
							twelve pages: the canvas, the player, the agent rail, the picker, and 45 separate
							arguments about how a variation should look. Every screen that shipped was drawn there
							first, and the versions that lost are still in the history.
						</P>

						<P>It is MIT, and I mean that in the strong sense.</P>

						<Inset>
							<p className="text-[17px] text-text leading-[30px]">
								Fork it, rework it, rename it, ship it. It is a tool for designing things; make it
								your own if you want to.
							</p>
						</Inset>

						<P>
							If the pages rail annoys you, it lives in <Mono>src/ui/canvas/sidebar.tsx</Mono> and it is
							one file. Change it. I would rather read your fork than your feature request, though the
							issues are open too and I answer them.
						</P>

						<P>Thanks for reading this far.</P>

						<div className="mt-9">
							<Signature />
							<div className="mt-4 flex items-baseline gap-3 border-border border-t pt-4 font-mono text-xs">
								<span className="text-text">Liam Vinberg</span>
								<span className="text-muted">Stockholm</span>
								<span className="ml-auto text-muted">github.com/liamvinberg</span>
							</div>
						</div>
					</article>

					<Enclosures />
				</div>
			</div>
		</div>
	);
}
