import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--suspension — the statement as a Calder mobile. Each word hangs
 * from the beam on its own red thread at its own length, swaying out of phase
 * on slow transform-only loops, the spool ribbon as the counterweight. The
 * sculpture is the hero; below it the page goes quiet: subline, install,
 * stance, footer, all canonical copy. Hovering a word gives it a push on a
 * spring (interaction, not ambient). Reduced motion hangs the mobile still.
 * Boot pose is the composed rest state for `spool shot`'s ~300ms capture.
 */

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- */

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
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
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
		</button>
	);
}

/* ---------- the mobile ---------- */

interface HangDef {
	word: string;
	x: number; // anchor x on the beam
	len: number; // thread length, px
	size: number; // font size, px
	sway: number; // peak rotation, deg
	period: number; // sway period, s
	delay: number; // phase offset, s
}

const HANGS: HangDef[] = [
	{ word: "feel", x: 200, len: 96, size: 92, sway: 1.9, period: 6.4, delay: 0 },
	{ word: "an", x: 500, len: 190, size: 68, sway: 1.3, period: 7.6, delay: -2.1 },
	{ word: "app", x: 660, len: 118, size: 92, sway: 2.2, period: 5.8, delay: -1.2 },
	{ word: "before", x: 330, len: 330, size: 92, sway: 1.5, period: 8.4, delay: -3.4 },
	{ word: "it", x: 780, len: 396, size: 68, sway: 1.1, period: 6.9, delay: -0.7 },
	{ word: "exists", x: 930, len: 322, size: 92, sway: 1.8, period: 7.2, delay: -4.6 },
];

function HangingWord({ def, still }: { def: HangDef; still: boolean }) {
	return (
		<div
			className="absolute"
			style={{ left: def.x, top: 0 }}
		>
			{/* anchor on the beam */}
			<span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border border-thread/60 bg-bg" />
			{/* the swing: rotates around the anchor */}
			<motion.div
				className="absolute left-0 top-0 flex w-0 flex-col items-center"
				style={{ transformOrigin: "0 0" }}
				animate={still ? { rotate: 0 } : { rotate: [0, def.sway, 0, -def.sway, 0] }}
				transition={
					still
						? { duration: 0.6 }
						: {
								duration: def.period,
								delay: def.delay,
								repeat: Number.POSITIVE_INFINITY,
								ease: "easeInOut",
							}
				}
			>
				{/* thread */}
				<span
					className="block w-px bg-thread/55"
					style={{ height: def.len }}
				/>
				{/* the word, nudgable on a spring */}
				<motion.span
					className="block cursor-default font-semibold leading-none tracking-[-0.02em] text-text"
					style={{ fontSize: def.size, marginTop: 18 }}
					whileHover={{ rotate: 3.5, x: 8 }}
					transition={{ type: "spring", stiffness: 180, damping: 12 }}
				>
					{def.word}
				</motion.span>
			</motion.div>
		</div>
	);
}

function Counterweight({ still }: { still: boolean }) {
	return (
		<div className="absolute" style={{ left: 1180, top: 0 }}>
			<span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border border-thread/60 bg-bg" />
			<motion.div
				className="absolute left-0 top-0 flex w-0 flex-col items-center"
				style={{ transformOrigin: "0 0" }}
				animate={still ? { rotate: 0 } : { rotate: [0, -1.4, 0, 1.4, 0] }}
				transition={
					still
						? { duration: 0.6 }
						: {
								duration: 9.2,
								repeat: Number.POSITIVE_INFINITY,
								ease: "easeInOut",
							}
				}
			>
				<span className="block h-[210px] w-px bg-thread/55" />
				<SpoolMark className="mt-2 h-[104px] w-[104px] text-thread" title="spool ribbon" />
			</motion.div>
		</div>
	);
}

/* ---------- page ---------- */

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

export default function LandingSuspension() {
	const still = useReducedMotion() ?? false;

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* header */}
			<header className="flex items-center justify-between px-20 py-9">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
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

			{/* the mobile: the statement, hung from the beam */}
			<section aria-label="feel an app before it exists" className="relative h-[640px]">
				<div className="absolute inset-x-0 top-0 h-px bg-border" />
				{HANGS.map((d) => (
					<HangingWord key={d.word} def={d} still={still} />
				))}
				<Counterweight still={still} />
			</section>

			{/* the quiet body */}
			<section className="grid grid-cols-[1fr_380px] gap-20 border-t border-border px-20 pt-12">
				<p className="max-w-[520px] text-[19px] leading-[28px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames on an
					infinite canvas and links them into walkable flows. you feel the
					real thing, interactions and motion and inputs, before it exists.
				</p>
				<div>
					<div className="flex gap-5">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div className="w-full font-mono text-[15px] leading-[30px]">
							<CommandLine command="npm i -g spool.page" />
							<CommandLine command="spool init" />
							<CommandLine command="spool serve" />
						</div>
					</div>
					<div className="mt-5 whitespace-nowrap font-mono text-xs text-muted">
						requires node 22+ · best in chrome · macos-first today
					</div>
				</div>
			</section>

			{/* stance */}
			<section className="px-20 pt-14">
				<div className="grid grid-cols-4 gap-10 border-t border-border pt-9">
					{stance.map((s, i) => (
						<div key={s.k}>
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-[11px] text-thread">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span className="text-[15px] font-semibold tracking-tight">{s.k}</span>
							</div>
							<p className="mt-2 text-[13px] leading-[20px] text-muted">{s.v}</p>
						</div>
					))}
				</div>
			</section>

			{/* footer */}
			<footer className="mt-16 flex items-center justify-between border-t border-border px-20 py-8">
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
	);
}
