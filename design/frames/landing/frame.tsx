import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing — the canonical spool.page landing, graduated 2026-07-23 from the
 * exploration set (direction: röda tråden; layout: landing--thread-heroinstall;
 * copy interaction: install-copy--prompt). The install is the hero's second
 * beat, a thread tick pointing down it. Copy-to-clipboard rides the "$" prompt:
 * hover swaps it for a thread-red copy glyph, the command stays readable,
 * copied swaps in the tick. Ships via spool build (#35); design ticket #31.
 */

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
 * hidden-textarea execCommand path. Silent on both branches: no console output.
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
 * affordance — hover (or keyboard focus) swaps it for the copy glyph, the
 * command itself is never covered. Copying strips the prompt so the clipboard
 * is paste-ready; the copied tick holds for a beat. The prompt cell has a
 * fixed 2ch footprint so the swaps never reflow the line.
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

export default function Landing() {
	return (
		<div className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* thread spine */}
			<div
				className="absolute inset-y-0 left-[200px] w-px"
				style={{
					background:
						"linear-gradient(to bottom, transparent 0%, rgba(245,57,26,0.55) 4%, rgba(245,57,26,0.55) 96%, transparent 100%)",
				}}
			>
				<motion.span
					className="absolute left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-thread to-transparent"
					animate={{ top: ["-10%", "110%"] }}
					transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
				/>
			</div>

			<div className="relative pl-[320px] pr-[120px]">
				{/* header */}
				<header className="flex items-center justify-between py-11">
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

				{/* hero — statement, then the install as the second beat */}
				<section className="relative grid grid-cols-[1fr_auto] items-center gap-16 pb-40 pt-20">
					<div className="max-w-[620px]">
						<Node />
						<h1 className="text-[76px] font-semibold leading-[0.98] tracking-[-0.02em]">
							feel an app
							<br />
							before it exists
						</h1>
						<p className="mt-8 max-w-[480px] text-[19px] leading-[28px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on an
							infinite canvas and links them into walkable flows. you feel the
							real thing, interactions and motion and inputs, before it exists.
						</p>

						{/* install — the second beat, the thread pointing at the action */}
						<div className="mt-11">
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
					<motion.div
						className="relative w-[300px] shrink-0"
						animate={{ y: [0, -14, 0] }}
						transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
					>
						<SpoolMark className="w-full text-thread" title="spool ribbon" />
					</motion.div>
				</section>

				{/* stance */}
				<section className="relative border-t border-border pb-4 pt-16">
					<Node />
					<div className="grid grid-cols-2 gap-x-16 gap-y-12">
						{stance.map((s, i) => (
							<div key={s.k} className="flex gap-5">
								<span className="mt-1 font-mono text-xs text-thread">
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
				<footer className="mt-28 flex items-center justify-between border-t border-border py-10">
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
		</div>
	);
}
