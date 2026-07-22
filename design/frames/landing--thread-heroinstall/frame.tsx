import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--thread-heroinstall
 * Axis A — install INSIDE the hero. Axis B — the same refined left spine as
 * landing--thread-refined, deliberately unchanged so this reads as its honest
 * twin: the only thing that moves is the install. The command becomes the hero's
 * second beat, a thread tick pointing down it because for a dev tool the install
 * line is the real cta. No dedicated install section follows — the page is
 * shorter by exactly that section, which is the comparison to feel.
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

/**
 * One install line. The whole line is the button: hovering (or keyboard focus)
 * lays a scrim over the entire command with "copy" centered on it, so the target
 * is the command itself, not a chip to hunt for. The overlay is absolute and
 * fades opacity-only — nothing reflows. Copying strips the "$ " prompt so the
 * clipboard is paste-ready; the copied state holds the scrim for a beat.
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
			className="group relative block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="select-none text-muted">$ </span>
			{command}
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute -inset-x-3 inset-y-[3px] inline-flex items-center justify-center gap-1.5 rounded-xs border border-border-raised bg-bg/85 font-mono text-xs leading-none text-text transition-opacity duration-150 ease-out",
					copied
						? "opacity-100"
						: "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
				)}
			>
				{copied ? (
					<>
						<svg
							viewBox="0 0 12 12"
							fill="none"
							aria-hidden="true"
							className="h-3 w-3 shrink-0 text-thread"
						>
							<path
								d="M2.5 6.5 5 8.75 9.5 3.5"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						<span>copied</span>
					</>
				) : (
					<span>copy</span>
				)}
			</span>
		</button>
	);
}

export default function LandingThreadHeroInstall() {
	return (
		<div className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* thread spine — identical to the refined twin */}
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
									<CommandLine command="spool open" />
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
