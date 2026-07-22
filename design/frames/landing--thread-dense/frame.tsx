import { motion } from "motion/react";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--thread-dense
 * The single-screen test: hero, install, stance, footer and nothing else, tuned
 * to sit in about one screen-and-a-bit instead of a long scroll. Beam is the
 * unspool, compact — the thread spools out of the mark and reaches only as far as
 * the page does. Install is the hero's second beat. Its honest twin is
 * landing--thread-unspool: same beam, same placement, only the length changes.
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
		<span className="absolute -left-[104px] top-[9px] block h-[9px] w-[9px]">
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

export default function LandingThreadDense() {
	return (
		<div className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* the spool */}
			<motion.div
				className="absolute left-[128px] top-[96px] w-[104px]"
				animate={{ rotate: [-3, 3, -3] }}
				transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
			>
				<SpoolMark className="w-full text-thread" title="spool ribbon" />
			</motion.div>

			{/* the thread — spools out of the mark, reaches only as far as the page */}
			<div
				className="absolute left-[180px] top-[228px] bottom-0 w-px"
				style={{
					background:
						"linear-gradient(to bottom, rgba(245,57,26,0.6) 0%, rgba(245,57,26,0.55) 88%, transparent 100%)",
				}}
			>
				<span className="absolute left-1/2 top-0 block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-thread" />
				<motion.span
					className="absolute left-1/2 block h-16 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-thread to-transparent"
					animate={{ top: ["-4%", "104%"] }}
					transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
				/>
			</div>

			<div className="relative pl-[280px] pr-[100px]">
				{/* header */}
				<header className="flex items-center justify-between py-8">
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

				{/* hero + install, tight */}
				<section className="pb-16 pt-2">
					<div className="max-w-[600px]">
						<h1 className="text-[58px] font-semibold leading-[0.98] tracking-[-0.02em]">
							feel an app
							<br />
							before it exists
						</h1>
						<p className="mt-6 max-w-[470px] text-[17px] leading-[26px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on an
							infinite canvas and links them into walkable flows. you feel the
							real thing, interactions and motion and inputs, before it exists.
						</p>

						{/* install — the second beat */}
						<div className="mt-8 flex items-center gap-8">
							<div className="flex gap-4">
								<span className="w-px shrink-0 self-stretch bg-thread/70" />
								<div className="font-mono text-[15px] leading-[28px]">
									<div>
										<span className="select-none text-muted">$ </span>
										npm i -g spool.page
									</div>
									<div>
										<span className="select-none text-muted">$ </span>
										spool init
									</div>
									<div>
										<span className="select-none text-muted">$ </span>
										spool open
									</div>
								</div>
							</div>
							<div className="font-mono text-xs leading-[20px] text-muted">
								requires node 22+
								<br />
								best in chrome
								<br />
								macos-first today
							</div>
						</div>
					</div>
				</section>

				{/* stance — one compact row */}
				<section className="relative border-t border-border pt-10">
					<Node />
					<div className="grid grid-cols-4 gap-x-8">
						{stance.map((s, i) => (
							<div key={s.k}>
								<div className="mb-3 font-mono text-xs text-thread">
									{String(i + 1).padStart(2, "0")}
								</div>
								<div className="text-md font-semibold tracking-tight">{s.k}</div>
								<p className="mt-1.5 text-sm leading-[18px] text-muted">{s.v}</p>
							</div>
						))}
					</div>
				</section>

				{/* footer */}
				<footer className="mt-14 flex items-center justify-between border-t border-border py-7">
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
