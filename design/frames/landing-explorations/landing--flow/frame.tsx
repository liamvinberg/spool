import { motion } from "motion/react";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--flow
 * Direction: the walk. The thread unspools from the ribbon and weaves a horizontal
 * filmstrip of screens — product morphs to cart, crossfades to checkout — with the
 * player pill beneath. Where canvas is the authoring view, flow is the playing view:
 * screen to screen, with morphing transitions.
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

function Bar({ w, tone = "raised" }: { w: string; tone?: "raised" | "border" }) {
	return (
		<div
			className={tone === "raised" ? "h-2 rounded-full bg-raised" : "h-2 rounded-full border border-border"}
			style={{ width: w }}
		/>
	);
}

function Screen({
	label,
	active,
	children,
}: {
	label: string;
	active?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className={
				active
					? "w-[268px] shrink-0 overflow-hidden rounded-lg border border-border-raised bg-surface outline outline-[1.5px] outline-offset-[3px] outline-thread"
					: "w-[268px] shrink-0 overflow-hidden rounded-lg border border-border bg-canvas"
			}
		>
			<div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
				<span className="font-mono text-2xs text-muted">{label}</span>
				<span className="h-1.5 w-1.5 rounded-full bg-muted" />
			</div>
			<div className="h-[300px] p-4">{children}</div>
		</div>
	);
}

/** connector: the thread carrying the walk between screens */
function Connector({
	kind,
	label,
}: {
	kind: "morph" | "crossfade";
	label: string;
}) {
	const dashed = kind === "crossfade";
	return (
		<div className="flex w-[76px] shrink-0 flex-col items-center gap-2">
			<span className="font-mono text-2xs text-muted">{label}</span>
			<svg width="76" height="12" viewBox="0 0 76 12" fill="none">
				<defs>
					<marker
						id={`fl-${kind}`}
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
				{dashed ? (
					<motion.line
						x1="0"
						y1="6"
						x2="66"
						y2="6"
						className="stroke-thread"
						strokeWidth="1.5"
						strokeDasharray="5 5"
						markerEnd={`url(#fl-${kind})`}
						animate={{ strokeDashoffset: [0, -20] }}
						transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
					/>
				) : (
					<line
						x1="0"
						y1="6"
						x2="66"
						y2="6"
						className="stroke-thread"
						strokeWidth="1.5"
						markerEnd={`url(#fl-${kind})`}
					/>
				)}
			</svg>
		</div>
	);
}

function Ctrl({ children, active }: { children: React.ReactNode; active?: boolean }) {
	return (
		<span className={active ? "text-thread" : "text-muted"}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				{children}
			</svg>
		</span>
	);
}

export default function LandingFlow() {
	return (
		<div className="min-h-full w-full bg-bg px-16 font-sans text-text antialiased">
			{/* header */}
			<header className="flex items-center justify-between py-6">
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
			</header>

			{/* hero copy */}
			<section className="pt-16">
				<h1 className="text-[68px] font-semibold leading-[0.98] tracking-[-0.025em]">
					feel an app before it exists
				</h1>
				<p className="mt-6 max-w-[620px] text-[18px] leading-[27px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames and
					links them into walkable flows. walk screen to screen, with morphing
					transitions, and feel the real thing before it exists.
				</p>
			</section>

			{/* the walk — thread unspools through the screens */}
			<section className="pt-16">
				<div className="flex items-center justify-center gap-0">
					<div className="flex shrink-0 items-center gap-3.5">
						<SpoolMark className="h-9 w-9 text-thread" title="spool" />
						<svg width="34" height="12" viewBox="0 0 34 12" fill="none">
							<line
								x1="0"
								y1="6"
								x2="34"
								y2="6"
								className="stroke-thread"
								strokeWidth="1.5"
							/>
						</svg>
					</div>

					<Screen label="product" active>
						<div className="flex h-full flex-col gap-3">
							<div className="h-24 w-full rounded-md border border-thread/70" />
							<Bar w="70%" />
							<Bar w="45%" />
							<div className="my-1 h-px w-full bg-border" />
							<div className="flex gap-2">
								<div className="h-12 flex-1 rounded-md bg-raised" />
								<div className="h-12 flex-1 rounded-md bg-raised" />
							</div>
							<div className="mt-auto h-9 w-full rounded-md bg-raised" />
						</div>
					</Screen>

					<Connector kind="morph" label="morph" />

					<Screen label="cart">
						<div className="flex h-full flex-col gap-3">
							<div className="flex items-center gap-3">
								<div className="h-14 w-14 shrink-0 rounded-md border border-thread/70" />
								<div className="flex flex-1 flex-col gap-2">
									<Bar w="80%" />
									<Bar w="50%" />
								</div>
							</div>
							<div className="h-px w-full bg-border" />
							<Bar w="60%" />
							<div className="mt-auto h-9 w-full rounded-md bg-raised" />
						</div>
					</Screen>

					<Connector kind="crossfade" label="crossfade" />

					<Screen label="checkout">
						<div className="flex h-full flex-col gap-3">
							<Bar w="55%" tone="border" />
							<div className="h-9 w-full rounded-md border border-border" />
							<div className="h-9 w-full rounded-md border border-border" />
							<div className="flex gap-2">
								<div className="h-9 flex-1 rounded-md border border-border" />
								<div className="h-9 flex-1 rounded-md border border-border" />
							</div>
							<div className="mt-auto h-9 w-full rounded-md bg-raised" />
						</div>
					</Screen>

					<div className="flex w-[48px] shrink-0 items-center">
						<svg width="40" height="12" viewBox="0 0 40 12" fill="none">
							<defs>
								<marker
									id="fl-end"
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
								x1="0"
								y1="6"
								x2="30"
								y2="6"
								className="stroke-thread"
								strokeWidth="1.5"
								markerEnd="url(#fl-end)"
							/>
						</svg>
					</div>
				</div>

				{/* player pill */}
				<div className="mt-12 flex justify-center">
					<div className="flex items-center gap-5 rounded-full border border-border bg-surface px-5 py-2.5">
						<Ctrl>
							<path
								d="M10 4 L6 8 L10 12"
								className="stroke-current"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</Ctrl>
						<Ctrl active>
							<path d="M6 4 L12 8 L6 12 Z" className="fill-current" />
						</Ctrl>
						<Ctrl>
							<path
								d="M12.5 6.5 A4 4 0 1 0 12.8 9.2"
								className="stroke-current"
								strokeWidth="1.5"
								strokeLinecap="round"
								fill="none"
							/>
							<path
								d="M12.6 3.6 L12.9 6.6 L9.9 6.4"
								className="stroke-current"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								fill="none"
							/>
						</Ctrl>
						<Ctrl>
							<path
								d="M2.5 8 Q5 4 8 8 T13.5 8"
								className="stroke-current"
								strokeWidth="1.5"
								strokeLinecap="round"
								fill="none"
							/>
						</Ctrl>
						<span className="h-3.5 w-px bg-border" />
						<span className="font-mono text-2xs text-muted">
							playing · product → checkout
						</span>
					</div>
				</div>
			</section>

			{/* stance */}
			<section className="mt-24 grid grid-cols-4 gap-x-8 border-t border-border pt-10">
				{stance.map((s, i) => (
					<div key={s.k}>
						<div className="mb-5 font-mono text-xs text-thread">
							{String(i + 1).padStart(2, "0")}
						</div>
						<div className="text-lg font-semibold tracking-tight">{s.k}</div>
						<p className="mt-2 max-w-[250px] text-md leading-[22px] text-muted">
							{s.v}
						</p>
					</div>
				))}
			</section>

			{/* install */}
			<section className="mt-20 flex items-end justify-between gap-16 border-t border-border pt-10">
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
			</section>

			{/* footer */}
			<footer className="mt-20 flex items-center justify-between border-t border-border py-8">
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
