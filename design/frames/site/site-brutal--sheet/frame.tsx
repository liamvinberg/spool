import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-brutal--sheet. The landing as a datasheet: one pose, no scroll, every
 * claim in a cell.
 *
 * The argument: a page that fits on one screen has to be honest, because there
 * is nowhere to bury anything. So the whole thing is a 12-column hairline grid
 * filled edge to edge — the statement, the install, the six requirements, the
 * figure, the counts, the license — laid out the way a component datasheet lays
 * out a part. Hierarchy comes from cell size and one red cell, not from
 * centering something and making it big.
 *
 * Hairlines are the grid's own gaps: the sheet sits on bg-border and every cell
 * paints bg-bg over it, so no cell owns a border and no line is ever doubled.
 */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function Cell({
	span,
	className,
	children,
}: {
	span: string;
	className?: string;
	children: React.ReactNode;
}) {
	return <div className={cn("relative bg-bg", span, className)}>{children}</div>;
}

/**
 * A datasheet field: the machine's name for it, then the value. The note keeps a
 * fixed 19px whatever it says, so every value in the strip sits on one baseline.
 */
function Field({ name, value, note }: { name: string; value: string; note: string }) {
	return (
		<div className="flex h-full flex-col p-[16px] transition-colors duration-200 hover:bg-canvas">
			<div className="text-[11px] leading-[16px] text-muted">{name}</div>
			<div className="mt-auto text-[19px] leading-[24px] tracking-[-0.02em] text-text">{value}</div>
			<div className="h-[19px] pt-[3px] text-[11px] leading-[16px] text-muted">{note}</div>
		</div>
	);
}

function InstallLine() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);
	return (
		<button
			type="button"
			onClick={() => {
				void copyText("npm i -g spool.page").then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1400);
				});
			}}
			className="group flex w-full cursor-pointer items-center gap-[10px] border border-border-raised bg-canvas px-[14px] py-[12px] text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-none"
		>
			<span className="select-none text-[14px] leading-[20px] text-thread">$</span>
			<span className="flex-1 text-[14px] leading-[20px] text-text">npm i -g spool.page</span>
			<span
				className={cn(
					"text-[11px] leading-[20px] transition-colors duration-150",
					copied ? "text-thread" : "text-muted opacity-0 group-hover:opacity-100",
				)}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

function Figure() {
	const [hot, setHot] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHot(true)}
			onMouseLeave={() => setHot(false)}
			className="relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden bg-canvas transition-colors duration-200 hover:bg-surface focus-visible:outline-none"
			style={{
				backgroundImage:
					"repeating-linear-gradient(135deg, transparent 0 15px, color-mix(in srgb, var(--color-text) 3%, transparent) 15px 16px)",
			}}
		>
			<span
				className={cn(
					"flex h-[56px] w-[56px] items-center justify-center border transition-colors duration-200",
					hot ? "border-thread bg-thread" : "border-border-raised bg-bg",
				)}
			>
				<svg viewBox="0 0 12 14" className="h-[16px] w-[14px]" aria-hidden="true">
					<path d="M1 1.2 11 7 1 12.8Z" fill={hot ? "var(--color-on-thread)" : "var(--color-thread)"} />
				</svg>
			</span>
			<span className="absolute top-[16px] left-[16px] text-[11px] leading-[16px] text-muted">
				fig. 1 · get-started.mp4
			</span>
			<span className="absolute bottom-[16px] left-[16px] text-[11px] leading-[16px] text-muted">
				empty folder to first frame
			</span>
			<span className="absolute right-[16px] bottom-[16px] text-[11px] leading-[16px] text-muted">0:41</span>
		</button>
	);
}

export default function SiteBrutalSheet() {
	return (
		<div className="h-full bg-border p-px font-mono text-text">
			<div className="grid h-full grid-cols-12 grid-rows-[56px_300px_148px_268px_122px] gap-px">
				{/* ---- row A: the masthead band ---- */}
				<Cell span="col-span-3">
					<div className="flex h-full items-center gap-[11px] px-[16px]">
						<SpoolMark className="h-[22px] w-[17px] shrink-0 text-thread" title="spool" />
						<span className="text-[20px] leading-[24px] tracking-[-0.03em]">spool</span>
					</div>
				</Cell>
				<Cell span="col-span-6">
					<div className="flex h-full items-center px-[16px] text-[13px] leading-[20px] text-muted">
						a canvas where the frames are alive
					</div>
				</Cell>
				<Cell span="col-span-3">
					<div className="flex h-full items-center justify-end gap-[14px] px-[16px] text-[11px] leading-[16px] text-muted">
						<span className="text-text">0.12.0</span>
						<span>mit</span>
						<span>2026-09-01</span>
					</div>
				</Cell>

				{/* ---- row B: the statement, and the one thing to do ---- */}
				<Cell span="col-span-7">
					<div className="flex h-full flex-col justify-between p-[28px]">
						<div>
							<h1 className="max-w-[600px] text-[42px] leading-[50px] tracking-[-0.035em] text-text">
								See the screen behave
								<br />
								before you build it.
							</h1>
							<p className="max-w-[540px] pt-[22px] text-[14px] leading-[24px] text-muted">
								A frame is a TSX file in <span className="text-thread">design/</span> that
								default-exports one component. Your agent writes the file, spool renders it live
								on an infinite canvas, and you arrange the frames, link them into flows, and walk
								the flow like an app. Code is the document. The canvas is a projection of it.
							</p>
						</div>
						<p className="text-[13px] leading-[20px] text-text">
							I made this for myself, then published it.
						</p>
					</div>
				</Cell>
				<Cell span="col-span-5">
					<div className="flex h-full flex-col p-[24px]">
						<div className="text-[11px] leading-[16px] text-muted">install</div>
						<div className="pt-[14px]">
							<InstallLine />
						</div>
						<div className="pt-[10px] text-[11px] leading-[18px] text-muted">
							npm blocking install scripts?{" "}
							<span className="text-text">add --allow-scripts=esbuild</span>
						</div>
						<div className="mt-[20px] h-px w-full bg-border" />
						<div className="flex items-center justify-between py-[14px]">
							<div>
								<div className="text-[13px] leading-[19px] text-text">Mac app</div>
								<div className="pt-[2px] text-[11px] leading-[16px] text-muted">
									Spool.dmg · a window on the same daemon
								</div>
							</div>
							<span className="cursor-pointer border border-border-raised px-[12px] py-[6px] text-[11px] leading-[16px] text-text transition-colors duration-150 hover:border-thread hover:text-thread">
								download
							</span>
						</div>
						<div className="h-px w-full bg-border" />
						<div className="mt-auto space-y-[5px] pt-[16px] text-[13px] leading-[20px]">
							<div>
								<span className="text-muted">~/kaffe $ </span>
								<span className="text-text">spool</span>
							</div>
							<div className="text-muted">canvas at http://localhost:7766</div>
						</div>
					</div>
				</Cell>

				{/* ---- row C: the requirements strip ---- */}
				<Cell span="col-span-2">
					<Field name="runtime" value="Node 22+" note="one global install" />
				</Cell>
				<Cell span="col-span-2">
					<Field name="browser" value="Chrome" note="WebKit blurs the frames" />
				</Cell>
				<Cell span="col-span-2">
					<Field name="platform" value="macOS · Linux" note="Windows via WSL" />
				</Cell>
				<Cell span="col-span-2">
					<Field name="network" value="local only" note="it runs on your machine" />
				</Cell>
				<Cell span="col-span-2">
					<Field name="history" value="git" note="design/ lives in your repo" />
				</Cell>
				<Cell span="col-span-2">
					<Field name="price" value="free" note="npm i and it is yours" />
				</Cell>

				{/* ---- row D: the figure, the count, the first run ---- */}
				<Cell span="col-span-5">
					<Figure />
				</Cell>
				<Cell span="col-span-4">
					<div className="flex h-full flex-col justify-between p-[24px]">
						<div className="text-[11px] leading-[16px] text-muted">spool&apos;s own design/ folder</div>
						<div className="flex items-end gap-[40px]">
							{[
								["162", "frames"],
								["13", "pages"],
								["1", "repo"],
							].map(([n, l]) => (
								<div key={l}>
									<div className="text-[44px] leading-[44px] tracking-[-0.035em] text-text">{n}</div>
									<div className="pt-[5px] text-[11px] leading-[16px] text-muted">{l}</div>
								</div>
							))}
						</div>
						<p className="text-[13px] leading-[21px] text-muted">
							Spool is designed in spool. Every screen of the product, every take that lost, and
							this sheet are frames on that canvas.
						</p>
					</div>
				</Cell>
				<Cell span="col-span-3">
					<div className="flex h-full flex-col justify-between p-[24px]">
						<div className="text-[11px] leading-[16px] text-muted">first run</div>
						<div className="flex items-center gap-[12px] border border-border bg-canvas px-[14px] py-[12px]">
							<span className="flex h-[20px] w-[20px] items-center justify-center border border-border-raised text-[12px] leading-[18px] text-thread">
								+
							</span>
							<span className="text-[12px] leading-[18px] text-muted">no frames yet</span>
						</div>
						<p className="text-[13px] leading-[21px] text-muted">
							The canvas opens empty and says so. Press <span className="text-thread">+</span>,
							point it at any folder on disk, and that folder is a project. Point it at six and
							they all stay open.
						</p>
					</div>
				</Cell>

				{/* ---- row E: license, status, where to go ---- */}
				<Cell span="col-span-4" className="bg-thread">
					<div className="flex h-full items-center gap-[18px] px-[24px] text-on-thread">
						<span className="text-[30px] leading-[32px] tracking-[-0.03em]">MIT</span>
						<div className="text-[13px] leading-[20px]">
							Fork it, rework it, rename it, ship it.
							<div className="opacity-70">Make it your own if you want to.</div>
						</div>
					</div>
				</Cell>
				<Cell span="col-span-5">
					<div className="flex h-full flex-col justify-center gap-[5px] px-[24px]">
						<div className="text-[13px] leading-[20px] text-text">
							Pre-1.0: published, dogfooded daily, and still moving.
						</div>
						<div className="text-[12px] leading-[18px] text-muted">
							The canvas is settled. Everything under it changes most weeks.
						</div>
					</div>
				</Cell>
				<Cell span="col-span-3">
					<div className="flex h-full items-center justify-end gap-[8px] px-[16px]">
						{["github", "docs", "spool skill"].map((t) => (
							<span
								key={t}
								className="cursor-pointer border border-border px-[11px] py-[6px] text-[11px] leading-[16px] text-muted transition-colors duration-150 hover:border-border-raised hover:text-text"
							>
								{t}
							</span>
						))}
					</div>
				</Cell>
			</div>
		</div>
	);
}
