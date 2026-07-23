import { motion } from "motion/react";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { cn } from "../../../shared/lib/utils";

/**
 * landing--thread-center
 * Axis A — dedicated install section. Axis B — alternative geometry: the thread
 * runs down the centre of the page and the stance hangs off it as an alternating
 * timeline, each point a stitch on the spine. The statement is centred above the
 * thread's origin; the pulse travels the middle. A symmetric read of the same
 * röda tråden.
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

/** a stitch point centred on the spine */
function CenterNode({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"absolute left-1/2 block h-[9px] w-[9px] -translate-x-1/2 rounded-full border-[3px] border-bg bg-thread",
				className,
			)}
		>
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
		</span>
	);
}

export default function LandingThreadCenter() {
	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased">
			{/* header */}
			<header className="flex items-center justify-between border-b border-border px-16 py-6">
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

			{/* hero — centred, above where the thread begins */}
			<section className="px-16 pb-4 pt-24 text-center">
				<motion.div
					className="mx-auto mb-10 w-[104px]"
					animate={{ y: [0, -10, 0] }}
					transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
				>
					<SpoolMark className="w-full text-thread" title="spool ribbon" />
				</motion.div>
				<h1 className="text-[76px] font-semibold leading-[0.98] tracking-[-0.02em]">
					feel an app
					<br />
					before it exists
				</h1>
				<p className="mx-auto mt-8 max-w-[520px] text-[19px] leading-[28px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames on an
					infinite canvas and links them into walkable flows. you feel the real
					thing, interactions and motion and inputs, before it exists.
				</p>
			</section>

			{/* spine region: the centre thread runs the timeline and the install */}
			<div className="relative pt-16">
				{/* centre thread */}
				<div
					className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
					style={{
						background:
							"linear-gradient(to bottom, rgba(245,57,26,0.6) 0%, rgba(245,57,26,0.55) 94%, transparent 100%)",
					}}
				>
					<span className="absolute left-1/2 top-0 block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-thread" />
					<motion.span
						className="absolute left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-thread to-transparent"
						animate={{ top: ["-3%", "104%"] }}
						transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
					/>
				</div>

				{/* timeline */}
				<section className="px-16">
					{stance.map((s, i) => {
						const left = i % 2 === 0;
						return (
							<div
								key={s.k}
								className="relative grid grid-cols-2 items-center py-9"
							>
								{left ? (
									<>
										<div className="pr-20 text-right">
											<div className="font-mono text-xs text-thread">
												{String(i + 1).padStart(2, "0")}
											</div>
											<div className="mt-3 text-lg font-semibold tracking-tight">
												{s.k}
											</div>
											<p className="ml-auto mt-2 max-w-[320px] text-md leading-[22px] text-muted">
												{s.v}
											</p>
										</div>
										<div />
									</>
								) : (
									<>
										<div />
										<div className="pl-20 text-left">
											<div className="font-mono text-xs text-thread">
												{String(i + 1).padStart(2, "0")}
											</div>
											<div className="mt-3 text-lg font-semibold tracking-tight">
												{s.k}
											</div>
											<p className="mt-2 max-w-[320px] text-md leading-[22px] text-muted">
												{s.v}
											</p>
										</div>
									</>
								)}
								<span
									className={cn(
										"absolute top-1/2 h-px w-16 -translate-y-1/2 bg-thread/30",
										left ? "right-1/2" : "left-1/2",
									)}
								/>
								<CenterNode className="top-1/2 -translate-y-1/2" />
							</div>
						);
					})}
				</section>

				{/* install — centred on the thread */}
				<section className="relative px-16 pb-24 pt-16 text-center">
					<CenterNode className="top-0 -translate-y-1/2" />
					<div className="mb-6 font-mono text-xs text-muted">install</div>
					<div className="mx-auto inline-block rounded-md border border-border bg-surface p-7 text-left font-mono text-[15px] leading-[30px]">
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
					<p className="mx-auto mt-7 max-w-[420px] text-md leading-[22px] text-muted">
						run <span className="font-mono text-text">spool init</span> inside your
						repo. the canvas opens at{" "}
						<span className="font-mono text-text">localhost:7766</span>.
					</p>
					<div className="mt-4 font-mono text-xs text-muted">
						requires node 22+ · best in chrome · macos-first today
					</div>
				</section>
			</div>

			{/* footer */}
			<footer className="flex items-center justify-between border-t border-border px-16 py-8">
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
