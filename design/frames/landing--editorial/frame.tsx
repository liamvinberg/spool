import { motion } from "motion/react";
import { SpoolMark } from "../../shared/ui/spool-mark";

/**
 * landing--editorial
 * Direction: Swiss manifesto. Type is the hero — one enormous Familjen statement,
 * an asymmetric grid, hairline rules dividing the page like a broadsheet. Stance
 * and install are numbered index columns. Motion is restraint itself: the ribbon
 * spools slowly, nothing else moves.
 */

const stance = [
	{
		k: "your agent",
		v: "works through files and a cli, not a captive chat.",
	},
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

const steps = [
	{ cmd: "npm i -g spool.page", note: "" },
	{ cmd: "spool init", note: "inside your repo" },
	{ cmd: "spool open", note: "canvas at localhost:7766" },
];

export default function LandingEditorial() {
	return (
		<div className="min-h-full w-full bg-bg px-20 font-sans text-text antialiased">
			{/* masthead */}
			<header className="flex items-center justify-between border-b border-border py-6">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<span className="font-mono text-xs text-muted">
					the live prototyping canvas
				</span>
				<a
					href="https://github.com/liamvinberg/spool"
					className="font-mono text-xs text-muted transition-colors hover:text-thread"
				>
					github.com/liamvinberg/spool
				</a>
			</header>

			{/* hero — type is the hero */}
			<section className="grid grid-cols-[1fr_auto] items-center gap-10 pb-16 pt-20">
				<h1 className="text-[116px] font-semibold leading-[0.9] tracking-[-0.035em]">
					feel an app
					<br />
					before it
					<br />
					exists
				</h1>
				<motion.div
					className="w-[300px] shrink-0 self-start pt-4"
					animate={{ rotate: [-5, 5, -5] }}
					transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
				>
					<SpoolMark className="w-full text-thread" title="spool ribbon" />
				</motion.div>
			</section>

			{/* pitch band */}
			<section className="grid grid-cols-[1fr_1fr] gap-10 border-t border-border py-10">
				<p className="max-w-[560px] text-[22px] leading-[32px] tracking-tight">
					a live prototyping canvas. your agent authors live tsx frames on an
					infinite canvas and links them into walkable flows.
				</p>
				<p className="max-w-[520px] self-end justify-self-end text-right text-[17px] leading-[26px] text-muted">
					you feel the real thing, its interactions and motion and inputs,
					before it exists.
				</p>
			</section>

			{/* stance — index columns */}
			<section className="grid grid-cols-4 border-t border-border pt-10">
				{stance.map((s, i) => (
					<div
						key={s.k}
						className="border-l border-border pl-6 pr-6 first:border-l-0 first:pl-0"
					>
						<div className="mb-6 font-mono text-xs text-thread">
							{String(i + 1).padStart(2, "0")}
						</div>
						<div className="text-[21px] font-semibold tracking-tight">
							{s.k}
						</div>
						<p className="mt-3 max-w-[240px] text-md leading-[22px] text-muted">
							{s.v}
						</p>
					</div>
				))}
			</section>

			{/* install — numbered steps, no card */}
			<section className="mt-24 border-t border-border pt-8">
				<div className="flex items-baseline justify-between">
					<span className="font-mono text-xs text-muted">install</span>
					<span className="font-mono text-xs text-muted">
						requires node 22+ · best in chrome · macos-first today
					</span>
				</div>
				<div className="mt-10 space-y-4">
					{steps.map((s, i) => (
						<div key={s.cmd} className="flex items-baseline gap-8">
							<span className="w-6 font-mono text-md text-thread">
								{String(i + 1).padStart(2, "0")}
							</span>
							<span className="font-mono text-[24px] leading-[34px]">
								{s.cmd}
							</span>
							{s.note ? (
								<span className="font-mono text-sm text-muted">
									{s.note}
								</span>
							) : null}
						</div>
					))}
				</div>
			</section>

			{/* footer masthead */}
			<footer className="mt-24 flex items-center justify-between border-t border-border py-8">
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
