import { motion } from "motion/react";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--thread-refined
 * Axis A — dedicated install section. Axis B — the original left spine, refined.
 * Held deliberately close to landing--thread so the drift is legible: the spine
 * now fades in and out at the page edges instead of hard-cutting, each node gains
 * a stitch halo so it reads as a deliberate point rather than a stray dot, and the
 * pulse is taller, softer and slower. Copy, layout and the dedicated install are
 * the parent's, so the refinement is the only variable in view.
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

/** a stitch point on the spine: the dot, plus a faint halo ring that makes it deliberate */
function Node() {
	return (
		<span className="absolute -left-[124px] top-[9px] block h-[9px] w-[9px]">
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

export default function LandingThreadRefined() {
	return (
		<div className="relative min-h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* thread spine — solid through the body, softened where it meets the page edges */}
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

				{/* hero */}
				<section className="relative grid grid-cols-[1fr_auto] items-center gap-16 pb-32 pt-20">
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
				<section className="relative border-t border-border pt-16">
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

				{/* install */}
				<section className="relative pb-28 pt-28">
					<Node />
					<div className="grid grid-cols-[auto_1fr] items-end gap-16">
						<div>
							<div className="mb-6 font-mono text-xs text-muted">install</div>
							<div className="rounded-md border border-border bg-surface p-7 font-mono text-[15px] leading-[30px]">
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
						<div className="pb-2">
							<p className="max-w-[300px] text-md leading-[22px] text-muted">
								run <span className="font-mono text-text">spool init</span> inside
								your repo. the canvas opens at{" "}
								<span className="font-mono text-text">localhost:7766</span>.
							</p>
							<div className="mt-6 font-mono text-xs text-muted">
								requires node 22+ · best in chrome · macos-first today
							</div>
						</div>
					</div>
				</section>

				{/* footer */}
				<footer className="flex items-center justify-between border-t border-border py-10">
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
