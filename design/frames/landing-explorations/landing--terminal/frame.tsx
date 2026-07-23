import { motion } from "motion/react";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--terminal
 * Direction: repo-native, developer-first. Mono does the work; Familjen speaks
 * once. The workflow is the hero — a real terminal block — and the stance reads
 * as aligned comment rows. A single centered column, full-width hairline rules
 * anchoring it. The one live-red thing in the terminal is the caret: where you are.
 */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat" },
	{ k: "your disk", v: "local-first, plain files in your repo, git-friendly" },
	{ k: "real depth", v: "frames are real tsx: arbitrary js, motion, state" },
	{ k: "flows", v: "walk screen to screen, with morphing transitions" },
];

function Caret() {
	return (
		<motion.span
			className="ml-1 inline-block h-[19px] w-[9px] translate-y-[3px] bg-thread"
			animate={{ opacity: [1, 0.15] }}
			transition={{
				duration: 0.72,
				repeat: Infinity,
				repeatType: "reverse",
				ease: "easeInOut",
			}}
		/>
	);
}

export default function LandingTerminal() {
	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased">
			{/* header — full-width rule */}
			<header className="border-b border-border">
				<div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-5">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<a
						href="https://github.com/liamvinberg/spool"
						className="font-mono text-xs text-muted transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			<main className="mx-auto max-w-[860px] px-6">
				{/* hero */}
				<section className="pt-28">
					<div className="mb-7 font-mono text-xs text-muted">
						<span className="text-thread">$</span> a live prototyping canvas
					</div>
					<h1 className="text-[58px] font-semibold leading-[1.0] tracking-[-0.02em]">
						feel an app before it exists
					</h1>
					<p className="mt-7 max-w-[560px] text-[18px] leading-[27px] text-muted">
						your agent authors live tsx frames on an infinite canvas and links
						them into walkable flows. you feel the real thing, interactions and
						motion and inputs, before it exists.
					</p>
				</section>

				{/* terminal — the hero object */}
				<section className="pt-16">
					<div className="overflow-hidden rounded-md border border-border-raised bg-surface">
						<div className="flex items-center justify-between border-b border-border px-4 py-3">
							<div className="flex items-center gap-2.5">
								<span className="h-2 w-2 rounded-full bg-thread" />
								<span className="font-mono text-2xs text-muted">
									~/your-repo
								</span>
							</div>
							<span className="font-mono text-2xs text-muted">zsh</span>
						</div>
						<div className="p-7 font-mono text-[15px] leading-[32px]">
							<div>
								<span className="select-none text-muted">$ </span>npm i -g
								spool.page
							</div>
							<div className="h-8" />
							<div>
								<span className="select-none text-muted">$ </span>spool init
							</div>
							<div>
								<span className="select-none text-muted">$ </span>spool open
								<Caret />
							</div>
							<div className="mt-3 text-muted"># canvas at localhost:7766</div>
						</div>
					</div>
					<div className="mt-4 font-mono text-xs text-muted">
						requires node 22+ · best in chrome · macos-first today
					</div>
				</section>

				{/* stance — aligned comment rows */}
				<section className="pb-4 pt-24">
					<div className="mb-8 font-mono text-xs text-muted">## why spool</div>
					<div className="space-y-5 font-mono text-md">
						{stance.map((s) => (
							<div
								key={s.k}
								className="grid grid-cols-[16px_150px_1fr] items-baseline"
							>
								<span className="text-muted">#</span>
								<span className="text-text">{s.k}</span>
								<span className="text-muted">{s.v}</span>
							</div>
						))}
					</div>
				</section>
			</main>

			{/* footer — full-width rule */}
			<footer className="mt-24 border-t border-border">
				<div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-8">
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
				</div>
			</footer>
		</div>
	);
}
