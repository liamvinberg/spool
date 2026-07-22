import { motion } from "motion/react";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--thread-unspool
 * Axis A — install INSIDE the hero. Axis B — the beam is born at the mark. The
 * ribbon sits at the top and the thread spools out of its base, becoming the page
 * spine that the rest of the page hangs from. The pulse starts each cycle at the
 * ribbon, so you read the thread leaving the spool. The statement and the install
 * live to the right of the thread it pays out.
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

export default function LandingThreadUnspool() {
	return (
		<div className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* the spool: the ribbon the thread pays out of */}
			<motion.div
				className="absolute left-[132px] top-[128px] w-[136px]"
				animate={{ rotate: [-3, 3, -3] }}
				transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
			>
				<SpoolMark className="w-full text-thread" title="spool ribbon" />
			</motion.div>

			{/* the thread — spools out of the ribbon base and runs the page as its spine */}
			<div
				className="absolute left-[200px] top-[300px] bottom-0 w-px"
				style={{
					background:
						"linear-gradient(to bottom, rgba(245,57,26,0.6) 0%, rgba(245,57,26,0.55) 92%, transparent 100%)",
				}}
			>
				{/* the point where the thread leaves the spool */}
				<span className="absolute left-1/2 top-0 block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-thread" />
				<motion.span
					className="absolute left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-thread to-transparent"
					animate={{ top: ["-3%", "104%"] }}
					transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
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

				{/* hero — statement top-aligned with the spool, install as the second beat */}
				<section className="relative pb-40 pt-2">
					<div className="max-w-[620px]">
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
								<div className="font-mono text-[16px] leading-[32px]">
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
							<div className="mt-6 pl-[25px] font-mono text-xs text-muted">
								requires node 22+ · best in chrome · macos-first today
							</div>
						</div>
					</div>
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
