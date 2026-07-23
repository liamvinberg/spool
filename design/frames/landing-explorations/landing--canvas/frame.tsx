import { motion } from "motion/react";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { cn } from "../../../shared/lib/utils";

/**
 * landing--canvas
 * Direction: spool showing its own metaphor. The page is an infinite canvas —
 * a dot-grid with frames placed on it, linked into a flow by a declared (solid)
 * and a walked (dashed) thread arrow. The pitch lives in the selected frame,
 * ringed in thread. Frames glow, chrome recedes.
 */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{
		k: "your disk",
		v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts.",
	},
	{ k: "real depth", v: "frames are real tsx. arbitrary js, real motion, real state." },
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
	backgroundSize: "32px 32px",
	backgroundPosition: "-1px -1px",
};

function Bar({ w }: { w: string }) {
	return <div className="h-2 rounded-full bg-raised" style={{ width: w }} />;
}

function FlowFrame({
	label,
	style,
	phase,
	children,
}: {
	label: string;
	style: React.CSSProperties;
	phase: number;
	children: React.ReactNode;
}) {
	return (
		<motion.div
			className="absolute overflow-hidden rounded-md border border-border bg-canvas"
			style={style}
			animate={{ y: [0, -8, 0] }}
			transition={{
				duration: 6,
				repeat: Infinity,
				ease: "easeInOut",
				delay: phase,
			}}
		>
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				<span className="h-1.5 w-1.5 rounded-full bg-muted" />
				<span className="font-mono text-2xs text-muted">{label}</span>
			</div>
			<div className="space-y-2.5 p-4">{children}</div>
		</motion.div>
	);
}

export default function LandingCanvas() {
	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased">
			{/* chrome bar — recedes */}
			<header className="flex items-center justify-between border-b border-border px-8 py-3.5">
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div className="flex items-center rounded-md border border-border bg-surface p-0.5 font-mono text-2xs">
						<span className="rounded-[4px] bg-raised px-2.5 py-1 text-text">Live</span>
						<span className="px-2.5 py-1 text-muted">Design</span>
					</div>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>100%</span>
					<a
						href="https://github.com/liamvinberg/spool"
						className="text-text transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			{/* canvas scene */}
			<section className="relative h-[860px] overflow-hidden" style={dotGrid}>
				{/* selected hero frame */}
				<div className="absolute left-[72px] top-[168px] w-[620px] rounded-md border border-border-raised bg-surface outline outline-[1.5px] outline-offset-[3px] outline-thread">
					<div className="flex items-center justify-between border-b border-border px-5 py-2.5">
						<span className="font-mono text-2xs text-muted">landing</span>
						<span className="rounded-xs bg-thread px-1.5 py-0.5 font-mono text-2xs text-on-thread">
							1440 × 1680
						</span>
					</div>
					<div className="px-9 pb-10 pt-8">
						<h1 className="text-[62px] font-semibold leading-[0.98] tracking-[-0.02em]">
							feel an app
							<br />
							before it exists
						</h1>
						<p className="mt-6 max-w-[470px] text-[17px] leading-[26px] text-muted">
							a live prototyping canvas. your agent authors live tsx frames on
							an infinite canvas and links them into walkable flows. you feel
							the real thing before it exists.
						</p>
					</div>
				</div>

				{/* context chip — frame names are folder names */}
				<div className="absolute left-[72px] top-[600px] inline-flex items-center gap-2 rounded-xs border border-border bg-raised px-2.5 py-1.5 font-mono text-2xs text-muted">
					<span className="text-text">design/frames/checkout/frame.tsx</span>
					<span>: 42</span>
					<span className="text-thread">open in editor</span>
				</div>

				{/* the flow — three screens, linked */}
				<div className="absolute left-[840px] top-[92px] inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-2xs text-muted">
					<span className="text-thread">▸</span> walk the flow
				</div>

				<FlowFrame
					label="product"
					phase={0}
					style={{ left: 840, top: 132, width: 340, height: 168 }}
				>
					<Bar w="64%" />
					<Bar w="86%" />
					<div className="flex gap-2 pt-1">
						<div className="h-8 w-16 rounded-sm bg-raised" />
						<div className="h-8 flex-1 rounded-sm border border-border" />
					</div>
				</FlowFrame>

				<FlowFrame
					label="checkout"
					phase={1.4}
					style={{ left: 840, top: 380, width: 340, height: 168 }}
				>
					<Bar w="72%" />
					<div className="flex gap-2">
						<div className="h-8 flex-1 rounded-sm border border-border" />
						<div className="h-8 flex-1 rounded-sm border border-border" />
					</div>
					<div className="h-8 w-full rounded-sm bg-raised" />
				</FlowFrame>

				<FlowFrame
					label="cart--empty"
					phase={2.6}
					style={{ left: 840, top: 628, width: 340, height: 140 }}
				>
					<div className="flex h-full flex-col items-center justify-center gap-2 pb-4 pt-1">
						<div className="h-6 w-6 rounded-full border border-border" />
						<Bar w="40%" />
					</div>
				</FlowFrame>

				{/* arrows: declared solid, walked dashed */}
				<svg
					className="pointer-events-none absolute inset-0"
					width="1440"
					height="860"
					viewBox="0 0 1440 860"
					fill="none"
				>
					<defs>
						<marker
							id="cv-arrow"
							markerWidth="9"
							markerHeight="9"
							refX="5"
							refY="4.5"
							orient="auto"
						>
							<path
								d="M1.5,1.5 L6.5,4.5 L1.5,7.5"
								className="stroke-thread"
								strokeWidth="1.5"
								fill="none"
							/>
						</marker>
					</defs>
					<line
						x1="1010"
						y1="304"
						x2="1010"
						y2="374"
						className="stroke-thread"
						strokeWidth="1.5"
						markerEnd="url(#cv-arrow)"
					/>
					<motion.line
						x1="1010"
						y1="552"
						x2="1010"
						y2="622"
						className="stroke-thread"
						strokeWidth="1.5"
						strokeDasharray="5 5"
						markerEnd="url(#cv-arrow)"
						animate={{ strokeDashoffset: [0, -20] }}
						transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
					/>
				</svg>
			</section>

			{/* stance — clean rows on the grid */}
			<section
				className="border-t border-border px-8 py-20"
				style={dotGrid}
			>
				<div className="mx-auto grid max-w-[1120px] grid-cols-4 gap-x-10">
					{stance.map((s, i) => (
						<div key={s.k} className="border-t border-border-raised pt-4">
							<div className="mb-4 font-mono text-xs text-thread">
								{String(i + 1).padStart(2, "0")}
							</div>
							<div className="text-lg font-semibold tracking-tight">{s.k}</div>
							<p className="mt-2 text-md leading-[22px] text-muted">{s.v}</p>
						</div>
					))}
				</div>
			</section>

			{/* install as a frame + footer */}
			<section
				className="border-t border-border px-8 py-20"
				style={dotGrid}
			>
				<div className="mx-auto flex max-w-[1120px] items-end justify-between gap-16">
					<div className="w-[440px] overflow-hidden rounded-md border border-border-raised bg-surface">
						<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
							<span className="h-1.5 w-1.5 rounded-full bg-thread" />
							<span className="font-mono text-2xs text-muted">install</span>
						</div>
						<div className="space-y-1 p-6 font-mono text-[15px] leading-[28px]">
							<div>
								<span className="select-none text-muted">$ </span>npm i -g
								spool.page
							</div>
							<div>
								<span className="select-none text-muted">$ </span>spool init
							</div>
							<div>
								<span className="select-none text-muted">$ </span>spool open
							</div>
						</div>
					</div>
					<div className="max-w-[360px] pb-2">
						<p className="text-md leading-[22px] text-muted">
							run <span className="font-mono text-text">spool init</span> inside
							your repo. the canvas opens at{" "}
							<span className="font-mono text-text">localhost:7766</span>.
						</p>
						<div className="mt-5 font-mono text-xs text-muted">
							requires node 22+ · best in chrome · macos-first today
						</div>
					</div>
				</div>
			</section>

			<footer className="flex items-center justify-between border-t border-border px-8 py-8">
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
